// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/cache.h,
//  pxr/usd/usdSkel/root.cpp, pxr/usd/usdSkel/skeleton.cpp,
//  pxr/usd/usdSkel/skeletonQuery.h, pxr/usd/usdSkel/skinningQuery.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// FAITHFULNESS-DEBT(usdskel-query-fusion): this TypeScript query layer covers
// pxr/usd/usdSkel/skeletonQuery.h, pxr/usd/usdSkel/skinningQuery.h,
// pxr/usd/usdSkel/cache.h, and the extent registrations in root.cpp:142 and
// skeleton.cpp:216; split it along the upstream query and schema boundaries.
// Mirrors pxr/usd/usdSkel/{skeletonQuery,skinningQuery,cache}.h — the query
// layer tying schemas to the math: animation sampling onto the skeleton's
// joint order, skel-space concatenation, skinning transforms, and binding
// discovery under a SkelRoot.

import { _sdfPlainValue } from 'typescript-usd/sdf/_internal'
import { PrimDefaultPredicate, PrimRange as UsdPrimRange, TraverseInstanceProxies, type SchemaBase, type Attribute, type Rel as UsdRel, type Prim, type PrimPredicate as UsdPrimPredicate, type Stage } from 'typescript-usd/usd'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError, RaiseWarning as TfWarn } from 'typescript-usd/tf'
import {
  type Matrix4, IDENTITY_MATRIX, mul4, invertMatrix4, transformPoint,
} from 'typescript-usd/gf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  registerComputeExtentFunction, XformCache, Primvar,
  type ComputeExtentFunction,
  type Extent,
} from 'typescript-usd/usdGeom'
import { UsdSkelTopology } from './topology.ts'
import { UsdSkelAnimMapper } from './animMapper.ts'
import {
  isSkinnablePrim, isSkelAnimationPrim,
  makeTransform, concatJointTransforms, computeJointLocalTransforms,
  skinPointsLBS, skinPointsDQS, skinNormals, skinNormalsDQS,
  expandConstantInfluencesToVarying,
} from './utils.ts'
import { Root as SkelRoot } from './root.ts'
import { Skeleton } from './skeleton.ts'
import { Animation as SkelAnimation } from './animation.ts'
import { BindingAPI as SkelBindingAPI } from './bindingAPI.ts'
import { UsdSkelBlendShapeQuery } from './blendShapeQuery.ts'
import { Binding } from './binding.ts'

function inheritedTarget(prim: Prim, name: string): string | undefined {
  const stage = prim.getStage()
  let path = prim.path
  while (path !== '/') {
    const candidate = stage.getPrim(path)
    const target = candidate?.getAttr(name)?.getTargets()[0]
    if (target !== undefined) return target
    const slash = path.lastIndexOf('/')
    path = slash <= 0 ? '/' : path.slice(0, slash)
  }
  return undefined
}

// ---- UsdSkelAnimQuery ----

export class UsdSkelAnimQuery {
  constructor(readonly prim: Prim) {}
  getPrim(): Prim { return this.prim }
  getJointOrder(): string[] { return SkelAnimation.getJoints(this.prim) }
  getBlendShapeOrder(): string[] { return SkelAnimation.getBlendShapes(this.prim) }
  jointTransformsMightBeTimeVarying(): boolean {
    return ['translations', 'rotations', 'scales'].some(
      name => (this.prim.getAttr(name)?.getTimeSampleKeys().length ?? 0) > 0)
  }
  getJointTransformTimeSamples(): number[] {
    const times = new Set<number>()
    for (const name of ['translations', 'rotations', 'scales']) {
      for (const time of this.prim.getAttr(name)?.getTimeSampleKeys() ?? []) times.add(time)
    }
    return [...times].sort((a, b) => a - b)
  }
  // UsdSkelAnimQuery::ComputeJointLocalTransforms; empty when the
  // transforms cannot be computed (see _computeJointLocalTransforms).
  computeJointLocalTransforms(time?: number): Matrix4[] {
    return this._computeJointLocalTransforms(time) ?? []
  }
  // UsdSkel_SkelAnimationQueryImpl::_ComputeJointLocalTransforms
  // (animQueryImpl.cpp:104-150): undefined unless translations, rotations
  // and scales all have values that compose into one transform per joint.
  _computeJointLocalTransforms(time?: number): Matrix4[] | undefined {
    const xforms = new SkelAnimation(this.prim).getTransforms(time)
    if (xforms === undefined) return undefined
    const jointCount = this.getJointOrder().length
    if (xforms.length === jointCount) return xforms
    if (xforms.length > 0) {
      TfWarn(`${this.prim.path} -- size of transform component arrays ` +
        `[${xforms.length}] != joint order size [${jointCount}].`)
    }
    return undefined
  }
  computeBlendShapeWeights(time?: number): number[] {
    return SkelAnimation.getBlendShapeWeights(this.prim, time)
  }
}

// ---- UsdSkelSkeletonQuery ----

export class UsdSkelSkeletonQuery {
  readonly prim: Prim
  readonly topology: UsdSkelTopology
  readonly joints: string[]
  private readonly _restTransforms: Matrix4[]
  private readonly _inverseBindTransforms: Matrix4[]
  private readonly _animMapper: UsdSkelAnimMapper | undefined
  private readonly _animQuery: UsdSkelAnimQuery | undefined

  constructor(skelPrim: Prim, animPrim?: Prim) {
    this.prim = skelPrim
    this.joints = Skeleton.getJoints(skelPrim)
    this.topology = new UsdSkelTopology(this.joints)
    this._restTransforms = Skeleton.getRestTransforms(skelPrim)
    // Wrap, don't pass invertMatrix4 to map directly: map's index arg would
    // leak into invertMatrix4's eps parameter (GetInverse's singularity
    // tolerance), spuriously flagging joints at index >= |det| as singular.
    this._inverseBindTransforms = Skeleton.getBindTransforms(skelPrim).map(m => invertMatrix4(m))
    this._animQuery = animPrim ? new UsdSkelAnimQuery(animPrim) : undefined
    if (animPrim) {
      const animJoints = SkelAnimation.getJoints(animPrim)
      // Unauthored anim joints = same order as the skeleton
      this._animMapper = animJoints.length > 0
        ? new UsdSkelAnimMapper(animJoints, this.joints)
        : new UsdSkelAnimMapper(this.joints.length)
    }
  }

  get numJoints(): number { return this.topology.size }
  getAnimQuery(): UsdSkelAnimQuery | undefined { return this._animQuery }
  // UsdSkelSkeletonQuery::GetPrim / GetMapper (skeletonQuery.h): the mapper
  // from the animation's joint order onto the skeleton's (undefined without
  // an animation).
  getPrim(): Prim { return this.prim }
  getMapper(): UsdSkelAnimMapper | undefined { return this._animMapper }
  hasBindPose(): boolean { return this._inverseBindTransforms.length === this.numJoints }
  hasRestPose(): boolean { return this._restTransforms.length === this.numJoints }

  // Joint-local transforms at time: animation t/r/s (remapped onto the
  // skeleton's joint order) over the rest pose.
  computeJointLocalTransforms(time?: number, atRest = false): Matrix4[] {
    const rest = this.hasRestPose()
      ? this._restTransforms
      : new Array<Matrix4>(this.numJoints).fill([...IDENTITY_MATRIX] as Matrix4)

    // UsdSkelSkeletonQuery::ComputeJointLocalTransforms
    // (skeletonQuery.cpp:62-128): the animation's transforms remapped onto
    // the rest transforms (unanimated joints keep their rest pose); the rest
    // transforms when there is no mappable animation or its transforms
    // cannot be computed.
    if (atRest || !this._animQuery || !this._animMapper || this._animMapper.isNull()) {
      return [...rest]
    }
    const animLocals = this._animQuery._computeJointLocalTransforms(time)
    if (!animLocals) return [...rest]
    return this._animMapper.remap<Matrix4>(animLocals, rest, 1, [...IDENTITY_MATRIX] as Matrix4)
  }

  // Joint-to-skel-space transforms at time.
  computeJointSkelTransforms(time?: number, atRest = false): Matrix4[] {
    return concatJointTransforms(
      this.topology, this.computeJointLocalTransforms(time, atRest))
  }

  computeJointRestRelativeTransforms(time?: number): Matrix4[] {
    const local = this.computeJointLocalTransforms(time)
    return local.map((xform, i) => mul4(xform, invertMatrix4(this._restTransforms[i]!)))
  }

  // UsdSkelSkeletonQuery::ComputeJointWorldTransforms
  // (skeletonQuery.cpp:267-296): skel-space transforms concatenated with the
  // skeleton's local-to-world transform from `xfCache`, at the cache's time.
  // A Matrix4 in place of the cache is that local-to-world transform.
  computeJointWorldTransforms(xfCache: XformCache, atRest?: boolean): Matrix4[]
  computeJointWorldTransforms(rootWorldXform: Matrix4, time?: number): Matrix4[]
  computeJointWorldTransforms(xfCacheOrRoot: XformCache | Matrix4, timeOrAtRest?: number | boolean): Matrix4[] {
    if (xfCacheOrRoot instanceof XformCache) {
      const rootWorldXform = xfCacheOrRoot.getLocalToWorldTransform(this.prim)
      return this.computeJointSkelTransforms(xfCacheOrRoot.getTime(), timeOrAtRest === true)
        .map(xform => mul4(xform, rootWorldXform))
    }
    return this.computeJointSkelTransforms(timeOrAtRest as number | undefined)
      .map(xform => mul4(xform, xfCacheOrRoot))
  }

  // Skinning transforms: inv(worldBind) · skelXform per joint.
  computeSkinningTransforms(time?: number): Matrix4[] {
    if (!this.hasBindPose()) {
      throw new Error('Skeleton has no (or mismatched) bindTransforms')
    }
    const skel = this.computeJointSkelTransforms(time)
    return skel.map((x, i) => mul4(this._inverseBindTransforms[i]!, x))
  }
}

// ---- UsdSkelSkinningQuery ----

// The binding properties a skinning query reads (_SkinningQueryKey,
// cacheImpl.h), resolved by the cache's Populate.
export interface UsdSkelBindingProperties {
  jointIndicesAttr?: Attribute | undefined
  jointWeightsAttr?: Attribute | undefined
  skinningMethodAttr?: Attribute | undefined
  geomBindTransformAttr?: Attribute | undefined
  jointsAttr?: Attribute | undefined
  blendShapesAttr?: Attribute | undefined
  blendShapeTargetsRel?: UsdRel | undefined
}

function _numberArray(value: unknown): number[] {
  const plain = _sdfPlainValue(value)
  return Array.isArray(plain) || ArrayBuffer.isView(plain)
    ? Array.from(plain as ArrayLike<number>, Number) : []
}

// UsdSkelSkinningQuery::_InitializeJointInfluenceBindings
// (skinningQuery.cpp:78-130): the influences' element size and
// interpolation when both primvars exist and agree; UsdGeomPrimvar's
// fallbacks are elementSize 1 and interpolation 'constant'.
function _initializeJointInfluenceBindings(
  jointIndices: Attribute | undefined, jointWeights: Attribute | undefined,
): { numInfluencesPerComponent: number, interpolation: string } | undefined {
  // Have incomplete joint influences.
  if (!jointIndices?.isValid() || !jointWeights?.isValid()) return undefined
  const elementSize = (attr: Attribute): number => {
    const value = attr.getMetadata('elementSize')
    return typeof value === 'number' ? value : 1
  }
  const interpolation = (attr: Attribute): string => {
    const value = attr.getMetadata('interpolation')
    return typeof value === 'string' && value !== '' ? value : 'constant'
  }
  const warn = (message: string): undefined => {
    TfDiagnosticMgr.GetInstance().postWarning(message)
    return undefined
  }
  const indicesElementSize = elementSize(jointIndices)
  const weightsElementSize = elementSize(jointWeights)
  if (indicesElementSize !== weightsElementSize) {
    return warn(`jointIndices element size (${indicesElementSize}) != ` +
      `jointWeights element size (${weightsElementSize}).`)
  }
  if (indicesElementSize <= 0) {
    return warn(`Invalid element size [${indicesElementSize}]: element size must ` +
      `be greater than zero.`)
  }
  const indicesInterpolation = interpolation(jointIndices)
  const weightsInterpolation = interpolation(jointWeights)
  if (indicesInterpolation !== weightsInterpolation) {
    return warn(`jointIndices interpolation (${indicesInterpolation}) != ` +
      `jointWeights interpolation (${weightsInterpolation}).`)
  }
  if (indicesInterpolation !== 'constant' && indicesInterpolation !== 'vertex') {
    return warn(`Invalid interpolation (${indicesInterpolation}) for joint influences: ` +
      `interpolation must be either 'constant' or 'vertex'.`)
  }
  return { numInfluencesPerComponent: indicesElementSize, interpolation: indicesInterpolation }
}

export class UsdSkelSkinningQuery {
  readonly prim: Prim
  readonly numInfluencesPerPoint: number
  readonly geomBindTransform: Matrix4
  private readonly _jointIndices: number[]
  private readonly _jointWeights: number[]
  private readonly _jointMapper: UsdSkelAnimMapper | null
  readonly skinningMethod: 'classicLinear' | 'dualQuaternion'
  private readonly _interpolation: string
  private readonly _hasJointInfluences: boolean
  private readonly _jointIndicesAttr: Attribute | undefined
  private readonly _jointWeightsAttr: Attribute | undefined
  private readonly _skinningMethodAttr: Attribute | undefined
  private readonly _bindings: UsdSkelBindingProperties | undefined
  private readonly _jointOrder: string[] | undefined
  private readonly _blendShapeOrder: string[] | undefined
  private readonly _blendShapeMapper: UsdSkelAnimMapper | undefined

  // Without `bindings`, the binding properties are the prim's own. The
  // cache passes the properties UsdSkel_CacheImpl::ReadScope::Populate
  // resolved down namespace (cacheImpl.cpp:200-330).
  //
  // `animBlendShapeOrder` is the blend shape order of the skeleton's
  // animation, which the blend shape mapper maps from
  // (skinningQuery.cpp:41-76).
  constructor(prim: Prim, skeletonJoints: readonly string[], bindings?: UsdSkelBindingProperties,
    animBlendShapeOrder: readonly string[] = []) {
    this.prim = prim
    this._bindings = bindings
    // Only properties with an authored value count as binding properties
    // (cacheImpl.cpp:252-254).
    const own = (name: string): Attribute | undefined => {
      const attr = prim.getAttr(name)
      return attr?.isValid() && attr.hasAuthoredValue() ? attr : undefined
    }
    this._jointIndicesAttr = bindings ? bindings.jointIndicesAttr : own('primvars:skel:jointIndices')
    this._jointWeightsAttr = bindings ? bindings.jointWeightsAttr : own('primvars:skel:jointWeights')
    this._skinningMethodAttr = bindings ? bindings.skinningMethodAttr
      : own('primvars:skel:skinningMethod')
    this._jointIndices = _numberArray(this._jointIndicesAttr?.getValue())
    this._jointWeights = _numberArray(this._jointWeightsAttr?.getValue())
    const bindValue = bindings ? _numberArray(
      (_sdfPlainValue(bindings.geomBindTransformAttr?.getValue()) as unknown[] | undefined)?.flat?.())
      : undefined
    this.geomBindTransform = (bindings
      ? (bindValue?.length === 16 ? bindValue as Matrix4 : undefined)
      : SkelBindingAPI.getGeomBindTransform(prim)) ?? ([...IDENTITY_MATRIX] as Matrix4)
    const method = bindings ? bindings.skinningMethodAttr?.getValue()
      : SkelBindingAPI.getSkinningMethod(prim)
    this.skinningMethod = method === 'dualQuaternion' ? 'dualQuaternion' : 'classicLinear'
    const influences = _initializeJointInfluenceBindings(this._jointIndicesAttr, this._jointWeightsAttr)
    this._hasJointInfluences = influences !== undefined
    this.numInfluencesPerPoint = influences?.numInfluencesPerComponent ?? 1
    this._interpolation = influences?.interpolation ?? 'constant'

    // skel:joints on the binding site declares the joint order that
    // jointIndices refer to; the mapper carries skinning transforms from
    // skeleton order into that order.
    const jointsValue = _sdfPlainValue(bindings?.jointsAttr?.getValue())
    const jointOrder = bindings
      ? (Array.isArray(jointsValue) ? (jointsValue as unknown[]).map(String) : undefined)
      : SkelBindingAPI.getJointOrder(prim)
    this._jointMapper = jointOrder
      ? new UsdSkelAnimMapper(skeletonJoints, jointOrder)
      : null
    this._jointOrder = jointOrder

    // skinningQuery.cpp:66-71: skel:blendShapes declares the blend shape
    // order; the mapper carries the animation's weights into that order.
    if (bindings) {
      const blendShapesValue = _sdfPlainValue(bindings.blendShapesAttr?.getValue())
      if (Array.isArray(blendShapesValue)) {
        this._blendShapeOrder = (blendShapesValue as unknown[]).map(String)
        this._blendShapeMapper = new UsdSkelAnimMapper(animBlendShapeOrder, this._blendShapeOrder)
      }
    }
  }

  // UsdSkelSkinningQuery::GetPrim.
  getPrim(): Prim { return this.prim }

  // UsdSkelSkinningQuery::GetJointIndicesPrimvar / GetJointWeightsPrimvar
  // (skinningQuery.h:96-104): the primvars of the resolved binding
  // attributes, which may be authored on an ancestor (undefined when there
  // is none).
  getJointIndicesPrimvar(): Primvar | undefined { return _primvarOf(this._jointIndicesAttr) }
  getJointWeightsPrimvar(): Primvar | undefined { return _primvarOf(this._jointWeightsAttr) }

  // UsdSkelSkinningQuery::GetBlendShapesAttr / GetBlendShapeTargetsRel
  // (skinningQuery.h:116-124): the skinnable prim's own (not inherited)
  // binding properties.
  getBlendShapesAttr(): Attribute | undefined {
    return this._bindings ? this._bindings.blendShapesAttr
      : _authored(this.prim.getAttr('skel:blendShapes'))
  }
  getBlendShapeTargetsRel(): UsdRel | undefined {
    if (this._bindings) return this._bindings.blendShapeTargetsRel
    return this.prim.getAttr('skel:blendShapeTargets') ? this.prim.rel('skel:blendShapeTargets') : undefined
  }

  // UsdSkelSkinningQuery::GetJointOrder (skinningQuery.cpp:167-179): the
  // binding's skel:joints, when authored.
  getJointOrder(): string[] | undefined { return this._jointOrder ? [...this._jointOrder] : undefined }


  // UsdSkelSkinningQuery::HasJointInfluences (skinningQuery.cpp:142-146):
  // the bindings validated by _InitializeJointInfluenceBindings, without
  // reading the arrays.
  hasJointInfluences(): boolean { return this._hasJointInfluences }
  hasInfluences(): boolean { return this.hasJointInfluences() }
  isRigidlyDeformed(): boolean { return this._interpolation === 'constant' }
  getNumInfluencesPerComponent(): number { return this.numInfluencesPerPoint }
  getSkinningMethod(): 'classicLinear' | 'dualQuaternion' { return this.skinningMethod }

  // UsdSkelSkinningQuery::GetSkinningMethodAttr: the binding's
  // primvars:skel:skinningMethod attribute, when authored.
  getSkinningMethodAttr(): Attribute | undefined { return this._skinningMethodAttr }

  // UsdSkelSkinningQuery::GetGeomBindTransformAttr (skinningQuery.h): the
  // binding's primvars:skel:geomBindTransform attribute, when authored.
  getGeomBindTransformAttr(): Attribute | undefined {
    return this._bindings ? this._bindings.geomBindTransformAttr
      : _authored(this.prim.getAttr('primvars:skel:geomBindTransform'))
  }

  // UsdSkelSkinningQuery::GetGeomBindTransform(time)
  // (skinningQuery.cpp:554-564): identity when the optional attribute is
  // unauthored or has no value at `time`.
  getGeomBindTransform(time?: number): Matrix4 {
    const attr = this.getGeomBindTransformAttr()
    const value = _sdfPlainValue(time === undefined ? attr?.getValue() : attr?.getValueAtTime(time))
    const flat = _numberArray(Array.isArray(value) ? (value as unknown[]).flat() : value)
    return flat.length === 16 ? flat as Matrix4 : [...IDENTITY_MATRIX] as Matrix4
  }

  // UsdSkelSkinningQuery::GetJointMapper (skinningQuery.h): the mapper from
  // the skeleton's joint order into skel:joints, or null when the binding
  // declares no joint order.
  getJointMapper(): UsdSkelAnimMapper | null { return this._jointMapper }

  // UsdSkelSkinningQuery::ComputeJointInfluences (skinningQuery.cpp:231-279).
  computeJointInfluences(time?: number): [number[], number[]] | undefined {
    if (!this._hasJointInfluences) return undefined
    const read = (attr: Attribute | undefined): number[] =>
      _numberArray(time === undefined ? attr?.getValue() : attr?.getValueAtTime(time))
    const indices = read(this._jointIndicesAttr)
    const weights = read(this._jointWeightsAttr)
    if (indices.length !== weights.length) {
      TfDiagnosticMgr.GetInstance().postWarning(`Size of jointIndices [${indices.length}] != ` +
        `size of jointWeights [${weights.length}].`)
      return undefined
    }
    if (indices.length % this.numInfluencesPerPoint !== 0) {
      TfDiagnosticMgr.GetInstance().postWarning(`unexpected size of jointIndices and ` +
        `jointWeights arrays [${indices.length}]: size must be a multiple of the number of ` +
        `influences per component (${this.numInfluencesPerPoint}).`)
      return undefined
    }
    if (this.isRigidlyDeformed() && indices.length !== this.numInfluencesPerPoint) {
      TfDiagnosticMgr.GetInstance().postWarning(`Unexpected size of jointIndices and ` +
        `jointWeights arrays [${indices.length}]: joint influences are defined with ` +
        `'constant' interpolation, so the array size must be equal to the element size ` +
        `(${this.numInfluencesPerPoint}).`)
      return undefined
    }
    return [indices, weights]
  }

  // UsdSkelSkinningQuery::ComputeVaryingJointInfluences
  // (skinningQuery.cpp:282-308).
  computeVaryingJointInfluences(numPoints: number, time?: number): [number[], number[]] | undefined {
    const influences = this.computeJointInfluences(time)
    if (!influences) return undefined
    const [indices, weights] = influences
    if (this.isRigidlyDeformed()) {
      if (!expandConstantInfluencesToVarying(indices, numPoints) ||
          !expandConstantInfluencesToVarying(weights, numPoints)) return undefined
    } else if (indices.length !== numPoints * this.numInfluencesPerPoint) {
      TfDiagnosticMgr.GetInstance().postWarning(`Unexpected size of jointIndices and ` +
        `jointWeights arrays [${indices.length}]: varying influences should be sized to ` +
        `numPoints [${numPoints}] * numInfluencesPerComponent [${this.numInfluencesPerPoint}].`)
      return undefined
    }
    return [indices, weights]
  }

  // Per-point influence data, in the binding-site joint order (the GPU
  // skinning inputs; the 26.05 influences/numInfluencesPerComponent analog).
  getInfluences(): {
    jointIndices: readonly number[]
    jointWeights: readonly number[]
    numInfluencesPerPoint: number
  } {
    return {
      jointIndices: this._jointIndices,
      jointWeights: this._jointWeights,
      numInfluencesPerPoint: this.numInfluencesPerPoint,
    }
  }

  // Skeleton-order skinning transforms remapped into this binding site's
  // joint order (skel:joints), the order jointIndices refer to.
  remapSkinningXforms(skinningXforms: readonly Matrix4[]): readonly Matrix4[] {
    if (!this._jointMapper) return skinningXforms
    return this._jointMapper.remap<Matrix4>(
      skinningXforms as Matrix4[], null, 1, [...IDENTITY_MATRIX] as Matrix4)
  }

  // Skins flat-xyz points with skeleton-space skinning transforms.
  computeSkinnedPoints(
    skinningXforms: readonly Matrix4[],
    points: ArrayLike<number>,
  ): Float32Array {
    const fn = this.skinningMethod === 'dualQuaternion' ? skinPointsDQS : skinPointsLBS
    return fn(
      this.geomBindTransform,
      this.remapSkinningXforms(skinningXforms),
      this._jointIndices,
      this._jointWeights,
      this.numInfluencesPerPoint,
      points,
    )
  }

  computeSkinnedNormals(
    skinningXforms: readonly Matrix4[], normals: ArrayLike<number>,
    pointIndices?: ArrayLike<number>,
  ): Float32Array {
    const fn = this.skinningMethod === 'dualQuaternion'
      ? skinNormalsDQS : skinNormals
    return fn(
      this.geomBindTransform, this.remapSkinningXforms(skinningXforms),
      this._jointIndices, this._jointWeights, this.numInfluencesPerPoint,
      normals, pointIndices,
    )
  }

  // OpenUSD v26.08 pxr/usd/usdSkel/skinningQuery.cpp:493-527. Padding is
  // the largest axis distance between the rest-joint range and the gprim's
  // bind-pose aligned range, not half of an authored extent dimension.
  computeExtentsPadding(skelRestXforms: readonly Matrix4[]): number {
    if (skelRestXforms.length === 0) return 0
    const extentAttr = this.prim.getAttr('extent')
    const times = extentAttr?.getTimeSampleKeys() ?? []
    const extentValue = _sdfPlainValue(times.length > 0
      ? extentAttr?.getValueAtTime(times[0]!) : extentAttr?.getValue())
    if (!Array.isArray(extentValue) || extentValue.length !== 2 ||
        !Array.isArray(extentValue[0]) || !Array.isArray(extentValue[1])) return 0

    const jointExtent: Extent = [
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    ]
    for (const matrix of skelRestXforms) {
      _unionExtent(jointExtent, [matrix[12]!, matrix[13]!, matrix[14]!])
    }

    const min = extentValue[0] as number[]
    const max = extentValue[1] as number[]
    const corners: number[] = []
    for (const x of [Number(min[0]), Number(max[0])]) {
      for (const y of [Number(min[1]), Number(max[1])]) {
        for (const z of [Number(min[2]), Number(max[2])]) corners.push(x, y, z)
      }
    }
    const gprimExtent: Extent = [
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    ]
    _unionExtent(gprimExtent, corners, this.geomBindTransform)

    let padding = 0
    for (let axis = 0; axis < 3; axis++) {
      padding = Math.max(
        padding,
        jointExtent[0][axis]! - gprimExtent[0][axis]!,
        gprimExtent[1][axis]! - jointExtent[1][axis]!,
      )
    }
    return padding
  }

  // UsdSkelSkinningQuery::GetBlendShapeOrder (skinningQuery.cpp:182-193).
  getBlendShapeOrder(): string[] {
    if (this._bindings) return this._blendShapeOrder ? [...this._blendShapeOrder] : []
    return SkelBindingAPI.getBlendShapeOrder(this.prim)
  }
  // UsdSkelSkinningQuery::HasBlendShapes (skinningQuery.cpp:132-150): the
  // blend shapes attribute, the targets relationship and the mapper all
  // exist.
  hasBlendShapes(): boolean {
    if (this._bindings) {
      return this._bindings.blendShapesAttr !== undefined &&
        this._bindings.blendShapeTargetsRel !== undefined && this._blendShapeMapper !== undefined
    }
    return this.getBlendShapeOrder().length > 0 &&
      SkelBindingAPI.getBlendShapeTargets(this.prim).length > 0
  }
  // UsdSkelSkinningQuery::GetBlendShapeMapper (skinningQuery.h:132-134):
  // the mapper from the animation's blend shape order given at
  // construction; with `animationOrder`, a mapper from that order instead.
  getBlendShapeMapper(): UsdSkelAnimMapper | undefined
  getBlendShapeMapper(animationOrder: readonly string[]): UsdSkelAnimMapper
  getBlendShapeMapper(animationOrder?: readonly string[]): UsdSkelAnimMapper | undefined {
    if (animationOrder === undefined) return this._blendShapeMapper
    return new UsdSkelAnimMapper(animationOrder, this.getBlendShapeOrder())
  }
  getBlendShapeQuery(): UsdSkelBlendShapeQuery {
    return new UsdSkelBlendShapeQuery({ prim: this.prim, stage: this.prim.getStage() })
  }
}

// ---- UsdSkelCache ----

export class UsdSkelCache {
  private readonly _animQueries = new Map<string, UsdSkelAnimQuery>()
  private readonly _skelQueries = new Map<string, UsdSkelSkeletonQuery>()
  private readonly _skinQueries = new Map<string, UsdSkelSkinningQuery>()

  clear(): void {
    this._animQueries.clear(); this._skelQueries.clear(); this._skinQueries.clear()
  }

  // UsdSkelCache::GetAnimQuery (cache.cpp:37-53) through
  // UsdSkel_CacheImpl::ReadScope::FindOrCreateAnimQuery
  // (cacheImpl.cpp:55-80): queries of instance proxies are those of the
  // prims in the prototype.
  getAnimQuery(anim: SkelAnimation | Prim | undefined): UsdSkelAnimQuery | undefined {
    const prim = anim instanceof SkelAnimation ? _schemaPrim(anim) : anim
    if (!prim || !prim.isActive) return undefined
    if (prim.isInstanceProxy()) return this.getAnimQuery(prim.getPrimInPrototype())
    let query = this._animQueries.get(prim.path)
    if (query) return query
    if (isSkelAnimationPrim(prim)) {
      query = new UsdSkelAnimQuery(prim)
      this._animQueries.set(prim.path, query)
      return query
    }
    return undefined
  }

  // UsdSkelCache::GetSkelQuery (cache.cpp:56-61) through
  // UsdSkel_CacheImpl::ReadScope::FindOrCreateSkelQuery
  // (cacheImpl.cpp:112-135): the animation is the skeleton's inherited
  // skel:animationSource binding.
  getSkelQuery(skeleton: Skeleton | Prim | undefined): UsdSkelSkeletonQuery | undefined {
    const prim = skeleton instanceof Skeleton ? _schemaPrim(skeleton) : skeleton
    if (!prim || !Skeleton.is(prim) || !prim.isActive) return undefined
    let query = this._skelQueries.get(prim.path)
    if (!query) {
      const animQuery = this.getAnimQuery(new SkelBindingAPI(prim).getInheritedAnimationSource())
      query = new UsdSkelSkeletonQuery(prim, animQuery?.prim)
      this._skelQueries.set(prim.path, query)
    }
    return query
  }

  // UsdSkel_CacheImpl::ReadScope::Populate (cacheImpl.cpp:202-327): walk the
  // root's subtree, pruning at prims that are not Imageable, resolving the
  // binding properties authored on SkelBindingAPI prims down namespace, and
  // add a skinning query for each skinnable prim (whose children are
  // pruned: skinnable prims do not nest).
  populate(root: SkelRoot | Prim, predicate: UsdPrimPredicate = PrimDefaultPredicate): boolean {
    const prim = root instanceof SkelRoot ? _schemaPrim(root) : root
    if (!prim || !SkelRoot.is(prim)) {
      TfDiagnosticMgr.GetInstance().postError(new TfError("'root' is invalid.", TfDiagnosticType.CodingError))
      return false
    }
    interface Key extends UsdSkelBindingProperties { skel?: Prim | undefined }
    const visit = (p: Prim, parentKey: Key): void => {
      if (!p.isA('Imageable')) return
      const key: Key = { ...parentKey }
      // XXX: When looking for binding properties, only include properties
      // that have an authored value. Properties with no authored value are
      // treated as if they do not exist.
      const isSkinnable = isSkinnablePrim(p)
      if (p.hasAPI('SkelBindingAPI')) {
        const binding = new SkelBindingAPI(p)
        const { bound, skel } = binding._getSkeleton()
        if (bound) key.skel = _schemaPrim(skel)
        key.jointIndicesAttr = _authored(_attrInPrototype(p, 'primvars:skel:jointIndices')) ??
          key.jointIndicesAttr
        key.jointWeightsAttr = _authored(_attrInPrototype(p, 'primvars:skel:jointWeights')) ??
          key.jointWeightsAttr
        key.skinningMethodAttr = _authored(p.getAttr('primvars:skel:skinningMethod')) ??
          key.skinningMethodAttr
        key.geomBindTransformAttr = _authored(_attrInPrototype(p, 'primvars:skel:geomBindTransform')) ??
          key.geomBindTransformAttr
        key.jointsAttr = _authored(_attrInPrototype(p, 'skel:joints')) ?? key.jointsAttr
        // Unlike other binding properties above, skel:blendShapes and
        // skel:blendShapeTargets are *not* inherited, so we only check for
        // them on skinnable prims.
        if (isSkinnable) {
          key.blendShapesAttr = _authored(_attrInPrototype(p, 'skel:blendShapes')) ??
            key.blendShapesAttr
          const relPrim = p.isInstanceProxy() ? p.getPrimInPrototype()! : p
          if (_hasAuthoredTargets(relPrim, 'skel:blendShapeTargets')) {
            key.blendShapeTargetsRel = relPrim.rel('skel:blendShapeTargets')
          }
        }
      }
      if (isSkinnable) {
        // Append a skinning query using the resolved binding properties
        // (_FindOrCreateSkinningQuery, cacheImpl.cpp:148-164).
        if (!this._skinQueries.has(p.path)) {
          const skelQuery = key.skel ? this.getSkelQuery(key.skel) : undefined
          const animQuery = skelQuery?.getAnimQuery()
          this._skinQueries.set(p.path, new UsdSkelSkinningQuery(p, skelQuery?.joints ?? [], key,
            animQuery?.getBlendShapeOrder() ?? []))
        }
        // Don't allow skinnable prims to be nested.
        return
      }
      for (const child of p.getFilteredChildren(predicate)) visit(child, key)
    }
    visit(prim, {})
    return true
  }

  getSkinningQuery(prim: Prim): UsdSkelSkinningQuery | undefined {
    return this._skinQueries.get(prim.path)
  }

  // UsdSkelCache::ComputeSkelBindings (cache.cpp:72-170): the skinning
  // queries of the populated cache under `root`, grouped by their bound
  // (active) skeleton, in skeleton path order. A binding to a skeleton is
  // inherited down namespace; skinnable prims are not nested.
  computeSkelBindings(root: SkelRoot | Prim,
    predicate: UsdPrimPredicate = PrimDefaultPredicate): Binding[] {
    const rootPrim = root instanceof SkelRoot ? _schemaPrim(root) : root
    if (!rootPrim) {
      TfDiagnosticMgr.GetInstance().postError(
        new TfError("'skelRoot' is invalid.", TfDiagnosticType.CodingError))
      return []
    }
    const bindingMap = new Map<string, { skel: Skeleton, queries: UsdSkelSkinningQuery[] }>()
    this._visitBoundSkinnablePrims(rootPrim, predicate, (skel, query) => {
      const skelPrim = _schemaPrim(skel)
      if (!skelPrim || !Skeleton.is(skelPrim) || !skelPrim.isActive) return false
      let entry = bindingMap.get(skel.path)
      if (!entry) bindingMap.set(skel.path, entry = { skel, queries: [] })
      entry.queries.push(query)
      return true
    })
    return [...bindingMap.values()]
      .sort((a, b) => SdfPath.compare(SdfPath.fromString(a.skel.path), SdfPath.fromString(b.skel.path)))
      .map(({ skel, queries }) => new Binding(skel, queries))
  }

  // UsdSkelCache::ComputeSkelBinding (cache.cpp:173-262): the skinning
  // queries under `root` bound to `skel`.
  computeSkelBinding(root: SkelRoot | Prim, skel: Skeleton,
    predicate: UsdPrimPredicate = PrimDefaultPredicate): Binding | undefined {
    const rootPrim = root instanceof SkelRoot ? _schemaPrim(root) : root
    if (!rootPrim) {
      TfDiagnosticMgr.GetInstance().postError(
        new TfError("'skelRoot' is invalid.", TfDiagnosticType.CodingError))
      return undefined
    }
    if (!_schemaPrim(skel)) {
      TfDiagnosticMgr.GetInstance().postError(new TfError("'skel' is invalid.", TfDiagnosticType.CodingError))
      return undefined
    }
    const queries: UsdSkelSkinningQuery[] = []
    this._visitBoundSkinnablePrims(rootPrim, predicate, (boundSkel, query) => {
      if (!_schemaPrim(boundSkel) || boundSkel.path !== skel.path) return false
      queries.push(query)
      return true
    })
    return new Binding(skel, queries)
  }

  // The traversal shared by ComputeSkelBindings and ComputeSkelBinding
  // (cache.cpp:96-162, 196-258): prims that are not Imageable are pruned;
  // each prim's bound skeleton is its own skel:skeleton binding or else its
  // parent's. `accept` is called for the prims with a skinning query and
  // returns whether the prim was taken (pruning its children).
  private _visitBoundSkinnablePrims(root: Prim, predicate: UsdPrimPredicate,
    accept: (skel: Skeleton, query: UsdSkelSkinningQuery) => boolean): void {
    const visit = (p: Prim, parentSkel: Skeleton): void => {
      if (!p.isA('Imageable')) return
      let skel = parentSkel
      if (p.hasAPI('SkelBindingAPI')) {
        const binding = new SkelBindingAPI(p)._getSkeleton()
        if (binding.bound) skel = binding.skel
      }
      const query = this.getSkinningQuery(p)
      if (query && accept(skel, query)) {
        // Don't allow skinnable prims to be nested.
        return
      }
      for (const child of p.getFilteredChildren(predicate)) visit(child, skel)
    }
    visit(root, new Skeleton(undefined, root.getStage()))
  }
}

// The prim a schema object holds (`bool(schema)` for a schema constructed
// from a prim). Unlike SchemaBase.isValid(), this holds for instance
// proxies, which Stage.has() does not report.
function _schemaPrim(schema: SchemaBase): Prim | undefined {
  return schema.path !== '' ? schema.prim : undefined
}

// _GetAttrInPrototype (cacheImpl.cpp:175-185): an instance proxy's
// attribute is read from the prim in the prototype.
function _attrInPrototype(prim: Prim, name: string): Attribute | undefined {
  return (prim.isInstanceProxy() ? prim.getPrimInPrototype()! : prim).getAttr(name)
}

function _authored(attr: Attribute | undefined): Attribute | undefined {
  return attr?.isValid() && attr.hasAuthoredValue() ? attr : undefined
}

// UsdRelationship::HasAuthoredTargets: an authored targetPaths opinion,
// including an explicitly empty (or blocked) target list.
function _hasAuthoredTargets(prim: Prim, name: string): boolean {
  return prim.getStage().get(`${prim.path}.${name}`)?.hasAuthoredMetadata('targetPaths') ?? false
}

function _primvarOf(attr: Attribute | undefined): Primvar | undefined {
  if (!attr) return undefined
  const prim = attr.getStage().getPrim(attr.primPath)
  return prim ? new Primvar(prim, attr.name.slice('primvars:'.length)) : undefined
}

// ---- UsdSkelCache (binding discovery) ----

export interface SkelBinding {
  skeletonPath: string
  animationPath: string | undefined
  // Prim paths of skinnable prims (with jointIndices/jointWeights) bound to
  // this skeleton.
  skinnedPrimPaths: string[]
}

// Binding properties (skel:skeleton, skel:animationSource) inherit down
// namespace: a binding on an ancestor applies to all descendants unless a
// descendant re-binds.
export function computeSkelBindings(stage: Stage, skelRootPath: string): SkelBinding[] {
  const bySkeleton = new Map<string, { animationPath?: string | undefined; skinnedPrimPaths: string[] }>()

  const visit = (path: string, inheritedSkel?: string, inheritedAnim?: string) => {
    const prim = stage.getPrim(path)
    if (!prim) return

    const skel = SkelBindingAPI.getSkeletonTarget(prim) ?? inheritedSkel
    const anim = SkelBindingAPI.getAnimationSourceTarget(prim) ?? inheritedAnim

    if (skel && (SkelBindingAPI.getJointIndices(prim).length > 0 ||
        SkelBindingAPI.getBlendShapeTargets(prim).length > 0)) {
      const entry = bySkeleton.get(skel) ?? { skinnedPrimPaths: [] }
      entry.animationPath = entry.animationPath ?? anim
      entry.skinnedPrimPaths.push(path)
      bySkeleton.set(skel, entry)
    }

    for (const child of stage.getChildPrimPaths(path)) visit(child, skel, anim)
  }
  visit(skelRootPath)

  return [...bySkeleton.entries()].map(([skeletonPath, e]) => {
    // The animation source is commonly authored on the Skeleton prim itself
    // (not inherited down to the skinned prims) — resolve it there when the
    // skinned prims carried no binding.
    let animationPath = e.animationPath
    if (!animationPath) {
      const skelPrim = stage.getPrim(skeletonPath)
      if (skelPrim) animationPath = SkelBindingAPI.getAnimationSourceTarget(skelPrim)
    }
    return { skeletonPath, animationPath, skinnedPrimPaths: e.skinnedPrimPaths }
  })
}

function _unionExtent(
  extent: Extent,
  values: ArrayLike<number>,
  transform?: Matrix4,
): void {
  for (let index = 0; index + 2 < values.length; index += 3) {
    const point = transform
      ? transformPoint(transform, values[index]!, values[index + 1]!, values[index + 2]!)
      : [values[index]!, values[index + 1]!, values[index + 2]!]
    for (let axis = 0; axis < 3; axis++) {
      extent[0][axis] = Math.min(extent[0][axis]!, point[axis]!)
      extent[1][axis] = Math.max(extent[1][axis]!, point[axis]!)
    }
  }
}

// The plugin extent method of UsdSkelRoot (root.cpp:140-247): the padded
// extent of the joint pivots of every skeleton bound under the root (or, with
// no bindings, of every skeleton below it), in the root's space.
const _computeRootExtent: ComputeExtentFunction = (root, time, transform) => {
  const skelCache = new UsdSkelCache()
  skelCache.populate(root, TraverseInstanceProxies())

  const xfCache = new XformCache(root.getStage(), time)
  // GfRange3d bbox (empty).
  const bbox: Extent = [
    [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
    [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE],
  ]

  const processSkeleton = (skeleton: Skeleton, binding: Binding = new Binding()): boolean => {
    const skelQuery = skelCache.getSkelQuery(skeleton)
    if (!skelQuery) {
      // TF_VERIFY(skelQuery)
      return false
    }

    // Compute skel-space joint transforms.
    // The extent for this skel is based on the pivots of all bones,
    // with some additional padding.
    const skelXforms = skelQuery.computeJointSkelTransforms(time)
    if (skelXforms.length === 0 && skelQuery.joints.length !== 0) {
      return true
    }

    // Pre-compute a constant padding metric across all prims
    // skinned by this skeleton.
    let padding = 0
    const skelRestXforms = skelQuery.computeJointSkelTransforms(time, /* atRest */ true)
    if (skelRestXforms.length !== 0 || skelQuery.joints.length === 0) {
      for (const skinningQuery of binding.getSkinningTargets()) {
        const skelPadding = skinningQuery.computeExtentsPadding(skelRestXforms)
        padding = Math.max(padding, skelPadding)
      }
    }

    // Compute the final, padded extents from the skel-space
    // transforms, in the space of the SkelRoot prim.
    const relative = xfCache.computeRelativeTransform(skeleton.path, root.path)
    let skelRootXform = relative.matrix
    if (!relative.resetXformStack && transform) {
      skelRootXform = mul4(skelRootXform, transform)
    }
    // UsdSkelComputeJointsExtent (utils.cpp:802-824): the GfRange3f of the
    // pivots (as GfVec3f) through rootXform->TransformAffine, padded.
    const f = Math.fround
    const skelExtent: Extent = [
      [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
      [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE],
    ]
    for (const xform of skelXforms) {
      const p = transformPoint(skelRootXform, f(xform[12]!), f(xform[13]!), f(xform[14]!))
      for (let axis = 0; axis < 3; axis++) {
        const v = f(p[axis]!)
        skelExtent[0][axis] = Math.min(skelExtent[0][axis]!, v)
        skelExtent[1][axis] = Math.max(skelExtent[1][axis]!, v)
      }
    }
    const pad = f(padding)
    for (let axis = 0; axis < 3; axis++) {
      skelExtent[0][axis] = f(skelExtent[0][axis]! - pad)
      skelExtent[1][axis] = f(skelExtent[1][axis]! + pad)
    }

    // bbox.UnionWith(p) for both corners of the skel extent.
    for (const corner of skelExtent) {
      for (let axis = 0; axis < 3; axis++) {
        bbox[0][axis] = Math.min(bbox[0][axis]!, corner[axis]!)
        bbox[1][axis] = Math.max(bbox[1][axis]!, corner[axis]!)
      }
    }
    return true
  }

  const bindings = skelCache.computeSkelBindings(root, TraverseInstanceProxies())
  if (bindings.length === 0) {
    // If we don't have any bindings, we visualize the skeletons themselves,
    // so simply traverse the subtree and process any descendant skeletons
    // to produce our extent.
    for (const prim of new UsdPrimRange([root], TraverseInstanceProxies())) {
      if (Skeleton.is(prim)) {
        if (!processSkeleton(new Skeleton(prim))) {
          return null
        }
      }
    }
  } else {
    // Normal case -- process all the bindings.
    for (const binding of bindings) {
      const skeleton = binding.getSkeleton()
      if (!skeleton || !processSkeleton(skeleton, binding)) {
        return null
      }
    }
  }

  // (*extent)[0] = GfVec3f(bbox.GetMin()), (*extent)[1] = GfVec3f(bbox.GetMax())
  return [
    bbox[0].map(v => Math.fround(v)) as [number, number, number],
    bbox[1].map(v => Math.fround(v)) as [number, number, number],
  ]
}

const _computeSkeletonExtent: ComputeExtentFunction = (skeleton, time, transform) => {
  const animationPath = SkelBindingAPI.getAnimationSourceTarget(skeleton)
  const animation = animationPath ? skeleton.getStage().getPrim(animationPath) : undefined
  const query = new UsdSkelSkeletonQuery(skeleton, animation)
  const extent: Extent = [
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  ]
  const pivots = query.computeJointSkelTransforms(time).flatMap(matrix =>
    [matrix[12]!, matrix[13]!, matrix[14]!])
  if (pivots.length === 0) return null
  _unionExtent(extent, pivots, transform)
  return extent
}

registerComputeExtentFunction('SkelRoot', _computeRootExtent)
registerComputeExtentFunction('Skeleton', _computeSkeletonExtent)
