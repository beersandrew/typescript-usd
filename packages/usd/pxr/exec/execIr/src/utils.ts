// Ported from OpenUSD 26.11.1: pxr/exec/execIr/utils.cpp,
//  pxr/exec/execIr/utils.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execIr/utils.h and utils.cpp.
//
// Utilities that are used to implement exec computations for invertible
// rigging controllers (utils.h:10-20). Invertible rigging controllers define
// forward computations that take input values and produce spaces (matrices
// that represent coordinate frames). They also define inverse computations
// that take desired output spaces and produce the input values necessary for
// the forward computation to produce the desired spaces.
//
// Gf mapping: GfMatrix4d, GfMatrix3d and GfVec3d are the typescript-usd/gf
// classes; `a * b` on matrices is a.GetMultiply(b), evaluated left to right
// as in C++. GfRotation is typescript-usd/gf's Rotation value ({axis,
// angle}); GfRotation(axis, angle) is MakeRotation, GfRotation `*` is
// ComposeRotations, and GfRotation::DecomposeRotation is DecomposeRotation
// (its hint pointers are DecomposeRotationOpts, a null hint standing for a
// null pointer). GfVec4d locals are number arrays of length 4.

import {
  composeRotations as GfComposeRotations,
  DecomposeRotation as GfDecomposeRotation,
  DegreesToRadians as GfDegreesToRadians,
  makeRotation as GfMakeRotation,
  Matrix3d as GfMatrix3d,
  Matrix4d as GfMatrix4d,
  RadiansToDegrees as GfRadiansToDegrees,
  Vec3d as GfVec3d,
  type Rotation as GfRotation,
} from 'typescript-usd/gf'
import { TF_CODING_ERROR, TF_WARN } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'

import { ExecIrTokens } from './tokens.ts'
import type { ExecIrResult } from './types.ts'

const GfMatrix4dType = VtValueTypes.GfMatrix4d
const doubleType = VtValueTypes.double
const tokenType = VtValueTypes.token

/**
 * Shared parameters for the Compute and Invert functions (utils.h:36-56).
 *
 * Clients configure one of these in order to describe how local
 * transformations should be applied.
 */
export interface ExecIr_UtilsParams {
  // startingSpace is the location of the joint with no local transforms
  // applied. It's where it would be if all the avars were 0.0
  // (or 1.0 for scales)
  startingSpace: GfMatrix4d

  // translationOrientation is the orientation in which translations
  // will be applied, expressed in world space. The scale of the space
  // designates the units of translation. It is expected to have no
  // translation component.
  translationOrientation: GfMatrix4d

  // rotationOrientation is the orientation of the local rotation axes,
  // expressed in world space.
  rotationOrientation: GfMatrix4d
}

////////////////////////////////////////////////////////////////////////////////
//
// Internal Pixar note: The following code was sourced from MfTransformablePrim
//

// Enumerates rotation axis constants (utils.cpp:30-35).
const enum _TransformRotationAxes {
  TransformRotationAxisX = 0,
  TransformRotationAxisY = 1,
  TransformRotationAxisZ = 2,
}

// Enumerates the rotation order of a transform attribute (utils.cpp:37-46).
const enum _TransformRotationOrder {
  TransformRotationOrderXYZ = 0x06,
  TransformRotationOrderXZY = 0x09,
  TransformRotationOrderYXZ = 0x12,
  TransformRotationOrderYZX = 0x18,
  TransformRotationOrderZXY = 0x21,
  TransformRotationOrderZYX = 0x24,
}

// Gets the rotation axis corresponding to the given ring number
// (utils.cpp:51-77).
//
// - ringNumber should be 0, 1, 2, or 3
// - 0 corresponds to twist/spin.
// - 1, 2, 3, correspond to those in the rotationOrder, as in XYZ means 1,2,3
//   are x, y, z.
function _GetWhichRotationAxis(
  rotationOrder: _TransformRotationOrder,
  ringNumber: number,
): _TransformRotationAxes {
  if (ringNumber < 0 || ringNumber > 3) {
    TF_CODING_ERROR('GetWhichRotationAxis got out of range ringNumber')
  }

  // 1, 2, 3, correspond to those in the rotationOrder,
  // as in XYZ means 1,2,3 are x, y, z.
  // But 0 corresponds to spin, which is always set to the
  // same as 3...
  if (ringNumber === 0) {
    ringNumber = 3
  }

  const shift = (3 - ringNumber) * 2
  return ((rotationOrder & (0x03 << shift)) >> shift) as _TransformRotationAxes
}

// utils.cpp:79-97
function _GetRotationAxis(
  rotationOrder: _TransformRotationOrder,
  ringNumber: number,
): GfVec3d {
  const whichAxis = _GetWhichRotationAxis(rotationOrder, ringNumber)
  switch (whichAxis) {
    case _TransformRotationAxes.TransformRotationAxisX:
      return GfVec3d.xAxis()
    case _TransformRotationAxes.TransformRotationAxisY:
      return GfVec3d.yAxis()
    case _TransformRotationAxes.TransformRotationAxisZ:
      return GfVec3d.zAxis()
    default:
      TF_CODING_ERROR('GetRotationAxis called with illegal argument')
      return GfVec3d.xAxis()
  }
}

// GfVec3d as the typescript-usd/gf Rotation axis tuple.
function _Axis(v: GfVec3d): [number, number, number] {
  return [v.get(0), v.get(1), v.get(2)]
}

// Given a `startValue` of the form twist123 (where 1,2,3 are X,Y,Z ordered in
// rotationOrder, a `rotationOrder`, a `holdIndex` specifying which element of
// startValue should remain unchanged, and `endingRotation`, returns a twist123
// rotation that produces endingRotation but also matches the values in
// startValue as closely as possible (utils.cpp:99-188).
//
// Used when rotating things so that scalar rx/ry/rz/rspin values change in the
// most continuous manner possible.
function _GetBestEndingTwist123(
  startValue: readonly number[],
  rotationOrder: _TransformRotationOrder,
  holdIndex: number,
  endingRotation: GfRotation,
): number[] {
  const twist123 = [startValue[0]!, startValue[1]!, startValue[2]!, startValue[3]!]

  if (holdIndex < 0 || holdIndex > 3) {
    TF_CODING_ERROR('Illegal holdIndex in ')
  }
  let totalRot = endingRotation

  // Always decompose as if right handed, it's only the
  // incoming rotation from the event that gets flipped if left-handed
  const handednessForDecomp = 1.0

  if (holdIndex === 0) {
    // Premultiply by inverse of twist, so that twist can remain
    // unchanged and the rest of the matrix factors out into
    // the remaining 3 angles...
    const twistRotInv = GfMakeRotation(
      _Axis(_GetRotationAxis(rotationOrder, 0)),
      -1.0 * twist123[0]!)
    totalRot = GfComposeRotations(twistRotInv, totalRot)
  } else if (holdIndex === 3) {
    // Postmultiply by inverse of the last rotation, so that it can remain
    // unchanged and the rest of the matrix factors out into
    // the remaining 3 angles...
    const swingRotInv = GfMakeRotation(
      _Axis(_GetRotationAxis(rotationOrder, 3)),
      -1.0 * twist123[3]!)
    totalRot = GfComposeRotations(totalRot, swingRotInv)
  } else {
    // Otherwise we're holding one of the middle two rotations which means
    // we have to zero out the held value if we want to be able decompose
    // all rotations into the remaining angles.
    //
    // XXX (upstream): It may be desirable to still hold the middle rotations
    // without zeroing them out and find the closest guess for rotations that
    // we can't hit but I'm holding off doing that extra work unless there
    // is a desire for that behavior.
    twist123[holdIndex] = 0.0
  }

  // For decompose to use the incoming angles as hints, they
  // must be expressed in radians.
  for (let i = 0; i < 4; i++) {
    twist123[i] = GfDegreesToRadians(twist123[i]!)
  }

  // Leave the held rotation angle out of the decomposition (a null pointer
  // for the held angle, utils.cpp:160-164).
  const hint = (i: number): number | null => (i === holdIndex ? null : twist123[i]!)

  // Decompose the angles
  // XXX (upstream): Need to check how rotation order will affect
  // HoldRotation_FB and HoldRotation_LR
  const decomposed = GfDecomposeRotation(
    new GfMatrix4d(1.0).setRotate(totalRot),
    _GetRotationAxis(rotationOrder, 0),
    _GetRotationAxis(rotationOrder, 1),
    _GetRotationAxis(rotationOrder, 2),
    handednessForDecomp,
    {
      thetaTwHint: hint(0),
      thetaFBHint: hint(1),
      thetaLRHint: hint(2),
      thetaSwHint: hint(3),
      useHint: true, // use passed in values as hints
      swShift: null,
    })
  // DecomposeRotation writes through the non-null pointers only.
  for (let i = 0; i < 4; i++) {
    if (i !== holdIndex) {
      twist123[i] = decomposed[i]!
    }
  }
  // Decompose writes radians, convert to degrees
  for (let i = 0; i < 4; i++) {
    twist123[i] = GfRadiansToDegrees(twist123[i]!)
  }

  return twist123
}

// Converts a rotation order token into the corresponding enum value
// (utils.cpp:190-210).
function _GetRotationOrderFromToken(rotationOrder: string): _TransformRotationOrder {
  if (rotationOrder === ExecIrTokens.XYZ) {
    return _TransformRotationOrder.TransformRotationOrderXYZ
  } else if (rotationOrder === ExecIrTokens.XZY) {
    return _TransformRotationOrder.TransformRotationOrderXZY
  } else if (rotationOrder === ExecIrTokens.YXZ) {
    return _TransformRotationOrder.TransformRotationOrderYXZ
  } else if (rotationOrder === ExecIrTokens.YZX) {
    return _TransformRotationOrder.TransformRotationOrderYZX
  } else if (rotationOrder === ExecIrTokens.ZXY) {
    return _TransformRotationOrder.TransformRotationOrderZXY
  } else if (rotationOrder === ExecIrTokens.ZYX) {
    return _TransformRotationOrder.TransformRotationOrderZYX
  }

  TF_WARN(`Illegal rotation order '${rotationOrder}'`)
  return _TransformRotationOrder.TransformRotationOrderXYZ
}


////////////////////////////////////////////////////////////////////////////////
//
// Internal Pixar note: The following code was sourced from AmUtils
//

// Computes a composed rotation from rotation angle scalars and a rotation
// order (utils.cpp:218-250).
function _ComputeComposedRotation(
  rSpin: number, rx: number, ry: number, rz: number,
  rotationOrder: _TransformRotationOrder,
): GfRotation {
  // Use the rotation order to create an array of the rx, ry, rz rotations
  // in the correct order. std::array<GfRotation, 3> value-initializes its
  // elements to the identity rotation.
  const rotations: GfRotation[] = [
    GfMakeRotation([1, 0, 0], 0), GfMakeRotation([1, 0, 0], 0), GfMakeRotation([1, 0, 0], 0),
  ]
  for (let orderedRotIdx = 0; orderedRotIdx < 3; ++orderedRotIdx) {
    const shift = (2 - orderedRotIdx) * 2
    switch ((rotationOrder & (0x03 << shift)) >> shift) {
      case _TransformRotationAxes.TransformRotationAxisX:
        rotations[orderedRotIdx] = GfMakeRotation(_Axis(GfVec3d.xAxis()), rx)
        break
      case _TransformRotationAxes.TransformRotationAxisY:
        rotations[orderedRotIdx] = GfMakeRotation(_Axis(GfVec3d.yAxis()), ry)
        break
      case _TransformRotationAxes.TransformRotationAxisZ:
        rotations[orderedRotIdx] = GfMakeRotation(_Axis(GfVec3d.zAxis()), rz)
        break
    }
  }

  // Spin rotation always comes first and uses the last rotation's axis.
  const spinRotation = GfMakeRotation(rotations[2]!.axis, rSpin)

  // Return the composed rotation.
  return GfComposeRotations(
    GfComposeRotations(
      GfComposeRotations(spinRotation, rotations[0]!),
      rotations[1]!),
    rotations[2]!)
}


////////////////////////////////////////////////////////////////////////////////
//
// Internal Pixar note: The following code was sourced from AmTransformable.
//

/**
 * Compute a local transform matrix given scalars for translation and
 * rotation (utils.h:58-69, utils.cpp:258-280).
 */
export function ExecIr_ComputeLocalXf(
  tx: number,
  ty: number,
  tz: number,
  rSpin: number,
  rx: number,
  ry: number,
  rz: number,
  rotationOrder: string,
  _ctx: VdfContext,
): GfMatrix4d {
  const rotXf = new GfMatrix3d(
    _ComputeComposedRotation(
      rSpin, rx, ry, rz, _GetRotationOrderFromToken(rotationOrder)))

  // Combine rotations with translation.
  const resultXf = new GfMatrix4d(rotXf, new GfVec3d(tx, ty, tz))

  // TODO (upstream): Add support for left/right handedness.

  return resultXf
}

/**
 * Compute the default space by combining default translates, rotates, and
 * scales with local rest space and the default space of the parent
 * (utils.h:71-78, utils.cpp:282-307).
 */
export function ExecIr_ComputeDefaultSpace(
  defaultTransRotOffsetXf: GfMatrix4d,
  defaultScaleXf: GfMatrix4d,
  localRestXf: GfMatrix4d,
  parentDefaultSpace: GfMatrix4d,
): GfMatrix4d {
  // Compose the default translation and rotation with the rest space
  const localDefaultAndRestXf =
    defaultTransRotOffsetXf.getMultiply(localRestXf)

  // Compose with the scaled parent space and extract the translation
  // to determine the new origin
  const originPt =
    localDefaultAndRestXf.getMultiply(parentDefaultSpace)
      .extractTranslation()

  // Compose with the unscaled parent space and extract the rotation
  // to determine the new orientation
  const orientationXf =
    localDefaultAndRestXf.getMultiply(parentDefaultSpace.getOrthonormalized())
      .getOrthonormalized().setTranslateOnly(new GfVec3d(0.0))

  // Compose the final computed result
  return defaultScaleXf.getMultiply(orientationXf)
    .getMultiply(new GfMatrix4d().setTranslate(originPt))
}


////////////////////////////////////////////////////////////////////////////////
//
// Internal Pixar note: The following code was sourced from IvcrUtil.
//

// Extracts scalar scale values from the given matrix (utils.cpp:315-329).
//
// Note that this always returns 0 or positive values -- it does not capture
// flipping.
function _ExtractScale(xf: GfMatrix4d): GfVec3d {
  const result = new GfVec3d()
  result.setComponent(0, xf.getRow3(0).GetLength())
  result.setComponent(1, xf.getRow3(1).GetLength())
  result.setComponent(2, xf.getRow3(2).GetLength())

  return result
}

// static const std::vector<GfVec3d> axes (utils.cpp:348-349), unused
// upstream.

// Decomposes the given rotation matrix into scalars applied in the given
// rotation order (utils.cpp:331-378).
//
// Note: This function only handles right-handed transforms.
//
// Uses `hintAngles` to disambiguate between multiple possible solutions.
function _DecomposeRotationMatrix(
  xf: GfMatrix4d,
  rotationOrder: _TransformRotationOrder,
  hintAngles: readonly number[],
): number[] {
  const axisOrdering: number[] = [0, 0, 0, 0]
  for (let i = 0; i < 4; ++i) {
    axisOrdering[i] =
      _GetWhichRotationAxis(rotationOrder, i)
  }

  // TODO (upstream): Add support for specifying the "hold avar," the avar to
  // _not_ decompose into. For now, hardcode the hold avar to Rspin.
  const holdIndex = 0

  const twist123 = _GetBestEndingTwist123(
    [
      hintAngles[0]!,
      hintAngles[axisOrdering[1]! + 1]!,
      hintAngles[axisOrdering[2]! + 1]!,
      hintAngles[axisOrdering[3]! + 1]!,
    ],
    rotationOrder,
    holdIndex,
    xf.getOrthonormalized().extractRotation())

  // GfVec4d result: its components are uninitialized upstream and are all
  // written below.
  const result: number[] = [0, 0, 0, 0]
  result[0] = twist123[0]!
  result[axisOrdering[1]! + 1] = twist123[1]!
  result[axisOrdering[2]! + 1] = twist123[2]!
  result[axisOrdering[3]! + 1] = twist123[3]!
  return result
}

// Modifies matrixToConform so it matches the handedness of target
// (utils.cpp:380-396). The out-parameter is the return value.
//
// If necessary, flips the X axis.
function _ConformHandedness(
  target: GfMatrix4d,
  matrixToConform: GfMatrix4d,
): GfMatrix4d {
  const handednessMatches =
    matrixToConform.getHandedness() === target.getHandedness()

  if (!handednessMatches) {
    return new GfMatrix4d().setScale(new GfVec3d(-1.0, 1.0, 1.0))
      .getMultiply(matrixToConform)
  }
  return matrixToConform
}

// Computes a rotation matrix that can be post-multiplied by a given
// space to apply the local rotation around the given world pivot
// (utils.cpp:398-413).
function _ComputeRotationXf(
  localRotation: GfRotation,
  worldPivot: GfVec3d,
  rotationOrientation: GfMatrix4d,
): GfMatrix4d {
  return new GfMatrix4d().setTranslate(worldPivot.getNegated())
    .getMultiply(rotationOrientation.getInverse())
    .getMultiply(new GfMatrix4d().setRotate(localRotation))
    .getMultiply(rotationOrientation)
    .getMultiply(new GfMatrix4d().setTranslate(worldPivot))
}

// Applies the specified translation to the input space (utils.cpp:415-429).
//
// The local translation is applied relative to the given
// translationOrientation. The scale of the translationOrientation determines
// the units of the local translation.
function _ApplyTranslation(
  inputSpace: GfMatrix4d,
  localTranslation: GfVec3d,
  translationOrientation: GfMatrix4d,
): GfMatrix4d {
  return inputSpace.getMultiply(new GfMatrix4d().setTranslate(
    translationOrientation.Transform(localTranslation)))
}

// Applies the specified rotation to the input space (utils.cpp:431-447).
//
// The rotation happens about the given pivot, relative to the given world
// rotation orientation.
function _ApplyRotation(
  inputSpace: GfMatrix4d,
  localRotation: GfRotation,
  worldPivot: GfVec3d,
  rotationOrientation: GfMatrix4d,
): GfMatrix4d {
  return inputSpace.getMultiply(
    _ComputeRotationXf(
      localRotation, worldPivot, rotationOrientation))
}

// Inverts the translation relative to the starting space
// (utils.cpp:449-466).
function _InvertTranslation(
  startingSpace: GfMatrix4d,
  posedSpace: GfMatrix4d,
  translationOrientation: GfMatrix4d,
): GfVec3d {
  const localPivot = new GfVec3d(0.0, 0.0, 0.0)

  const worldTranslation =
    (posedSpace.Transform(localPivot) as GfVec3d).subtract(
      startingSpace.Transform(localPivot))

  return translationOrientation.getInverse()
    .Transform(worldTranslation) as GfVec3d
}

// Inverts and decomposes the rotation of the posed space relative to the
// starting space (utils.cpp:468-490).
//
// Decomposition uses the given rotation order, but the angles are always
// returned in the order: [rSpin, rx, ry, rz]
function _InvertRotation(
  startingSpace: GfMatrix4d,
  posedSpace: GfMatrix4d,
  rotationOrientation: GfMatrix4d,
  rotationOrder: _TransformRotationOrder,
  hintAngles: readonly number[],
): number[] {
  const localRotationXf =
    rotationOrientation
      .getMultiply(startingSpace.getInverse())
      .getMultiply(posedSpace)
      .getMultiply(rotationOrientation.getInverse())

  return _DecomposeRotationMatrix(
    localRotationXf, rotationOrder, hintAngles)
}

////////////////////////////////////////////////////////////////////////////////
//
// Internal Pixar note: The following code was sourced from IvcrFkSolver.
//

// Computes the starting space -- where the joint would be without
// the effect of any local translation, rotation, or scale avars
// (utils.cpp:497-537).
function _ComputeStandardStartingSpace(
  ctx: VdfContext,
  parentSpace: GfMatrix4d,
  parentDefaultSpace: GfMatrix4d,
): GfMatrix4d {
  // TODO (upstream): Add support for total size avars.
  const parentTotalSize = 1.0

  const defaultSpace =
    ctx.getInputValue<GfMatrix4d>(GfMatrix4dType, ExecIrTokens.inDefaultSpace)

  // Extract the default scales and work with a normalized matrix
  // for these calculations
  const defaultScaleXf = new GfMatrix4d().setScale(
    _ExtractScale(defaultSpace))

  // Create a space that is oriented the same as our space but
  // located at the pivot.
  const pivotDefaultSpace =
    defaultSpace.getOrthonormalized()

  // TODO (upstream): Add support for constraints.

  let pivotStartingSpace =
    pivotDefaultSpace.getMultiply(parentDefaultSpace.getInverse()).getMultiply(parentSpace)

  // Since we're inheriting nonuniform scales, we want to maintain our
  // parent's nonuniform scale information but factor out its uniform scale;
  // if we aren't, we want to fully reset to identity scaling.
  //
  // TODO (upstream): Add support for _not_ inheriting non-uniform scales.
  pivotStartingSpace =
    new GfMatrix4d().setScale(new GfVec3d(1 / parentTotalSize))
      .getMultiply(pivotStartingSpace)

  return defaultScaleXf.getMultiply(pivotStartingSpace)
}

/**
 * Computes the orientation and scale in which local translations are
 * applied (utils.h:80-90, utils.cpp:539-575).
 *
 * The axes of this matrix represent the world space direction that the local
 * transaltions should be applied in. The scale of this matrix changes the
 * effective units of translation. The result has no translation component.
 */
export function ExecIr_UtilsComputeStandardTranslationOrientation(
  ctx: VdfContext,
  _startingSpace: GfMatrix4d,
): GfMatrix4d {
  // TODO (upstream): Add support for constraints.

  // Normal translation orientation is the default space relative to the
  // parent's posed space. Use orthonormalized versions of all these
  // matrices since orientation doesn't depend on scale, and combining
  // non-orthonomralized matrices and then normalizing after the fact can
  // introduce unintended rotations.
  const defaultSpaceNormalized =
    ctx.getInputValue<GfMatrix4d>(GfMatrix4dType, ExecIrTokens.inDefaultSpace)
      .getOrthonormalized()

  // TODO (upstream): Add support for _not_ inheriting non-orthogonal
  // transforms.
  const parentSpaceNormalized =
    ctx.getInputValue<GfMatrix4d>(GfMatrix4dType, ExecIrTokens.parentInSpace)
      .getOrthonormalized()
  const parentDefaultSpaceNormalized =
    ctx.getInputValue<GfMatrix4d>(GfMatrix4dType,
      ExecIrTokens.parentInDefaultSpace)
      .getOrthonormalized()

  let translationOrientation =
    defaultSpaceNormalized
      .getMultiply(parentDefaultSpaceNormalized.getInverse())
      .getMultiply(parentSpaceNormalized)
      .setTranslateOnly(new GfVec3d(0.0))

  translationOrientation =
    _ConformHandedness(defaultSpaceNormalized, translationOrientation)

  // TODO (upstream): Add support for translation units.

  return translationOrientation
}

/**
 * Computes the orientation of the rotation (utils.h:92-101,
 * utils.cpp:577-587).
 *
 * The axes of this space represent the axes of local rotation (expressed in
 * world space). This is a rotation and scale matrix so it can also represent
 * handedness.
 */
export function ExecIr_UtilsComputeStandardRotationOrientation(
  _ctx: VdfContext,
  startingSpace: GfMatrix4d,
): GfMatrix4d {
  // TODO (upstream): Add support for _not_ inheriting non-orthogonal
  // transforms

  return new GfMatrix4d(startingSpace)
    .getOrthonormalized()
    .setTranslateOnly(new GfVec3d(0.0))
}

/**
 * Compute the local translation vector by evaluating the Tx,Ty,Tz inputs
 * (utils.h:103-107, utils.cpp:589-597).
 */
export function ExecIr_UtilsComputeLocalTranslation(ctx: VdfContext): GfVec3d {
  return new GfVec3d(
    ctx.getInputValue<number>(doubleType, ExecIrTokens.inTx),
    ctx.getInputValue<number>(doubleType, ExecIrTokens.inTy),
    ctx.getInputValue<number>(doubleType, ExecIrTokens.inTz))
}

/**
 * Compute the local rotation by evaluating the rotation scalars, as well as
 * the rotation order (utils.h:109-114, utils.cpp:599-614).
 */
export function ExecIr_UtilsComputeLocalRotation(ctx: VdfContext): GfRotation {
  const rotationOrder =
    _GetRotationOrderFromToken(
      ctx.getInputValue<string>(tokenType,
        ExecIrTokens.inRotationOrder))

  return _ComputeComposedRotation(
    ctx.getInputValue<number>(doubleType, ExecIrTokens.inRspin),
    ctx.getInputValue<number>(doubleType, ExecIrTokens.inRx),
    ctx.getInputValue<number>(doubleType, ExecIrTokens.inRy),
    ctx.getInputValue<number>(doubleType, ExecIrTokens.inRz),
    rotationOrder)
}

/**
 * Returns the forward-computed result space (utils.h:116-122,
 * utils.cpp:616-644).
 */
export function ExecIr_UtilsCompute(
  params: ExecIr_UtilsParams,
  localTranslation: GfVec3d,
  localRotation: GfRotation,
): GfMatrix4d {
  // Translation:
  const translatedSpace =
    _ApplyTranslation(
      params.startingSpace,
      localTranslation,
      params.translationOrientation)

  // Rotation:
  const worldRotatePivot =
    translatedSpace.Transform(/* localPivot */ new GfVec3d(0.0, 0.0, 0.0)) as GfVec3d

  const rotatedSpace =
    _ApplyRotation(
      translatedSpace,
      localRotation,
      worldRotatePivot,
      params.rotationOrientation)

  // TODO (upstream): Add support for scale avars.
  // TODO (upstream): Add support for _not_ inheriting non-orthogonal
  // transforms.

  return rotatedSpace
}

/**
 * Populates `resultMap` with inverted values (utils.h:124-131,
 * utils.cpp:646-685).
 */
export function ExecIr_UtilsInvert(
  ctx: VdfContext,
  posedSpace: GfMatrix4d,
  params: ExecIr_UtilsParams,
  resultMap: ExecIrResult,
): void {
  const localTranslation =
    _InvertTranslation(
      params.startingSpace,
      posedSpace,
      params.translationOrientation)

  resultMap.set(ExecIrTokens.inTx, VtValue.create(localTranslation.get(0), doubleType))
  resultMap.set(ExecIrTokens.inTy, VtValue.create(localTranslation.get(1), doubleType))
  resultMap.set(ExecIrTokens.inTz, VtValue.create(localTranslation.get(2), doubleType))

  // TODO (upstream): Inversion hints. For now, we choose a rotation
  // parameterization as close to (0, 0, 0, 0) as possible.
  const forwardAvarValues = [0.0, 0.0, 0.0, 0.0]

  const rotationOrder =
    _GetRotationOrderFromToken(
      ctx.getInputValue<string>(tokenType,
        ExecIrTokens.inRotationOrder))

  const angles = _InvertRotation(
    params.startingSpace,
    posedSpace,
    params.rotationOrientation,
    rotationOrder,
    forwardAvarValues)

  // TODO (upstream): Add support for scale and squetch avars.

  resultMap.set(ExecIrTokens.inRspin, VtValue.create(angles[0]!, doubleType))
  resultMap.set(ExecIrTokens.inRx, VtValue.create(angles[1]!, doubleType))
  resultMap.set(ExecIrTokens.inRy, VtValue.create(angles[2]!, doubleType))
  resultMap.set(ExecIrTokens.inRz, VtValue.create(angles[3]!, doubleType))
}

////////////////////////////////////////////////////////////////////////////////
//
// Internal Pixar note: The following code was sourced from IvcrFkController.
//

/**
 * Returns standard FK controller parameters (utils.h:133-136,
 * utils.cpp:692-706).
 */
export function ExecIr_ComputeFkParams(ctx: VdfContext): ExecIr_UtilsParams {
  const startingSpace = _ComputeStandardStartingSpace(
    ctx,
    ctx.getInputValue<GfMatrix4d>(GfMatrix4dType, ExecIrTokens.parentInSpace),
    ctx.getInputValue<GfMatrix4d>(GfMatrix4dType,
      ExecIrTokens.parentInDefaultSpace))

  return {
    startingSpace,
    translationOrientation:
      ExecIr_UtilsComputeStandardTranslationOrientation(ctx, startingSpace),
    rotationOrientation:
      ExecIr_UtilsComputeStandardRotationOrientation(ctx, startingSpace),
  }
}
