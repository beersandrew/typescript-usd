// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/extComputations.cpp,
//  pxr/usdImaging/usdSkelImaging/extComputations.h,
//  pxr/usdImaging/usdSkelImaging/utils.cpp
// Copyright 2018, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/extComputations.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - The usdSkel port's token-dispatched skinning functions
//   (pxr/usd/usdSkel/src/utils.ts UsdSkelSkinPoints, UsdSkelSkinNormals,
//   UsdSkelSkinFaceVaryingNormals, UsdSkelSkinTransform) take non-interleaved
//   joint indices and weights, flat xyz Float32Array points/normals and flat
//   row-major matrices. The interleaved GfVec2f influences upstream passes
//   (utils.cpp's _InterleavedInfluencesFn reads index = int(influence[0]),
//   weight = influence[1]) are split into those two arrays at this boundary;
//   the results are the same values.
// - Upstream passes the GfMatrix4f geomBindXform/skinningXforms to the
//   templated UsdSkel skinning functions; the usdSkel port takes flat matrix
//   arrays and a matrix type, and 'float' selects the GfMatrix4f
//   instantiation (float Transform/TransformAffine and products,
//   pxr/usd/usdSkel/src/utils.ts SkinningMatrixType).
// - HdExtComputationContext of the hd port (hd/src/extComputationUtils.ts) is
//   number-valued; the skinning computation accepts any context with the
//   upstream methods (UsdSkelImagingExtComputationContext below), whose input
//   values are VtValues or the values data sources return in this port (see
//   _Get below), and sets VtValue outputs as upstream does.
// - The TF_DEBUG(HD_EXT_COMPUTATION_UPDATED) kernel dump of
//   extComputations.cpp:532-533 is not emitted.

import {
  Matrix3d as GfMatrix3d, Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f,
  Vec2f as GfVec2f, Vec2i as GfVec2i, Vec3f as GfVec3f, Vec4f as GfVec4f,
  type Matrix4 as GfMatrix4Array,
} from 'typescript-usd/gf'
import {
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type ExtComputationCpuCallbackDataSource as HdExtComputationCpuCallbackDataSource,
  type StringDataSource as HdStringDataSource,
} from 'typescript-usd/hd'
import { Glslfx as HioGlslfx } from 'typescript-usd/hio'
import {
  TfDiagnosticMgr, TfDiagnosticType, TfEnvSetting, TfGetEnvSetting, Error as TfError, Token as TfToken,
} from 'typescript-usd/tf'
import {
  Tokens as UsdSkelTokens,
  UsdSkelSkinFaceVaryingNormals, UsdSkelSkinNormals, UsdSkelSkinPoints, UsdSkelSkinTransform,
} from 'typescript-usd/usdSkel'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdSkelImagingPackageSkinningShader } from './package.ts'
import {
  UsdSkelImagingExtAggregatorComputationInputNameTokens,
  UsdSkelImagingExtComputationInputNameTokens,
  UsdSkelImagingExtComputationLegacyInputNameTokens,
  UsdSkelImagingExtComputationOutputNameTokens,
  UsdSkelImagingExtComputationTypeTokens,
} from './tokens.ts'

function TF_WARN(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}

function TF_CODING_ERROR(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

/** extComputations.cpp:27-34 TF_DEFINE_PRIVATE_TOKENS(_tokens) */
const _tokens = {
  skinPointsLBSKernel: 'skinPointsLBSKernel',
  skinPointsDQSKernel: 'skinPointsDQSKernel',
  skinNormalsLBSKernel: 'skinNormalsLBSKernel',
  skinNormalsDQSKernel: 'skinNormalsDQSKernel',
} as const

/** extComputations.cpp:36-37 */
export const USDSKELIMAGING_FORCE_CPU_COMPUTE = new TfEnvSetting(
  'USDSKELIMAGING_FORCE_CPU_COMPUTE', false,
  'Use Hydra ExtCPU computations for skinning.')
/** extComputations.cpp:38-39 */
export const USDSKELIMAGING_ENABLE_NORMAL_COMPUTATIONS = new TfEnvSetting(
  'USDSKELIMAGING_ENABLE_NORMAL_COMPUTATIONS', false,
  'Enable skinning computations for authored normals.')

/** The HdExtComputationContext methods extComputations.cpp uses
 *  (hd/extComputationContext.h). */
export interface UsdSkelImagingExtComputationContext {
  getInputValue(name: string): unknown
  /** GetOptionalInputValuePtr: undefined for a missing input. */
  getOptionalInputValue(name: string): unknown
  setOutputValue(name: string, value: VtValue): void
  raiseComputationError(): void
}

///////////////////////////////////////////////////////////////////////////////
/// UsdSkelImagingInvokeExtComputation

/** The held value of an input (VtValue::UncheckedGet). */
function _Get(value: unknown): unknown {
  if (value instanceof VtValue) {
    return value.IsEmpty() ? undefined : value.UncheckedGet()
  }
  return value
}

/** VtValue::IsHolding<VtArray<T>>() for the Gf element class (or Vt scalar
 *  type name) of T. */
function _IsHoldingArray(value: unknown, elementTypeName: string,
  elementClass?: abstract new (...args: never[]) => unknown): boolean {
  if (value instanceof VtArray) {
    return value.getElementType().getTypeName() === elementTypeName
  }
  if (elementTypeName === 'float' && value instanceof Float32Array) return true
  if (elementTypeName === 'int' && value instanceof Int32Array) return true
  if (Array.isArray(value)) {
    return value.every(e => elementClass ? e instanceof elementClass : typeof e === 'number')
  }
  return false
}

function _Elements<T>(value: unknown): T[] {
  if (value instanceof VtArray) return (value as VtArray<T>).toArray()
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<T>)
  return value as T[]
}

function _ToVec3fArray(points: Float32Array): VtArray<GfVec3f> {
  const result: GfVec3f[] = new Array(points.length / 3)
  for (let i = 0; i < result.length; ++i) {
    result[i] = new GfVec3f(points[3 * i]!, points[3 * i + 1]!, points[3 * i + 2]!)
  }
  return new VtArray<GfVec3f>(result, VtValueTypes.GfVec3f)
}

function _ToFlat(vecs: readonly GfVec3f[]): Float32Array {
  const result = new Float32Array(vecs.length * 3)
  for (let i = 0; i < vecs.length; ++i) {
    const d = vecs[i]!.data
    result[3 * i] = d[0]!; result[3 * i + 1] = d[1]!; result[3 * i + 2] = d[2]!
  }
  return result
}

function _Matrix4Array(m: GfMatrix4f | GfMatrix4d): GfMatrix4Array {
  return [...m.GetArray()] as unknown as GfMatrix4Array
}

/** Splits interleaved (index, weight) influences (see the header). */
function _SplitInfluences(influences: readonly GfVec2f[]): { indices: Int32Array, weights: Float32Array } {
  const indices = new Int32Array(influences.length)
  const weights = new Float32Array(influences.length)
  for (let i = 0; i < influences.length; ++i) {
    const d = influences[i]!.data
    indices[i] = Math.trunc(d[0]!)
    weights[i] = d[1]!
  }
  return { indices, weights }
}

/** extComputations.cpp:44-56 */
function _TransformPoints(points: Float32Array, xform: GfMatrix4d): void {
  for (let i = 0; i < points.length / 3; ++i) {
    const p = xform.Transform(new GfVec3f(points[3 * i]!, points[3 * i + 1]!, points[3 * i + 2]!)).data
    points[3 * i] = p[0]!; points[3 * i + 1] = p[1]!; points[3 * i + 2] = p[2]!
  }
}

/** extComputations.cpp:58-66 */
function _TransformNormals(normals: Float32Array, xformInvTranspose: GfMatrix3d): void {
  const m = xformInvTranspose.GetArray()
  for (let i = 0; i < normals.length / 3; ++i) {
    const x = normals[3 * i]!, y = normals[3 * i + 1]!, z = normals[3 * i + 2]!
    // GfVec3f(normals[i] * xformInvTranspose): row vector times GfMatrix3d.
    normals[3 * i] = x * m[0]! + y * m[3]! + z * m[6]!
    normals[3 * i + 1] = x * m[1]! + y * m[4]! + z * m[7]!
    normals[3 * i + 2] = x * m[2]! + y * m[5]! + z * m[8]!
  }
}

/** extComputations.cpp:68-89 */
function _ApplyPackedBlendShapes(
  offsets: readonly GfVec4f[],
  ranges: readonly GfVec2i[],
  weights: ArrayLike<number>,
  points: Float32Array,
): void {
  const end = Math.min(ranges.length, points.length / 3)
  for (let i = 0; i < end; ++i) {
    const range = ranges[i]!.data

    let px = points[3 * i]!, py = points[3 * i + 1]!, pz = points[3 * i + 2]!
    for (let j = range[0]!; j < range[1]!; ++j) {
      const offset = offsets[j]!.data
      const shapeIndex = Math.trunc(offset[3]!)
      const weight = Math.fround(weights[shapeIndex]!)
      px = Math.fround(px + Math.fround(offset[0]! * weight))
      py = Math.fround(py + Math.fround(offset[1]! * weight))
      pz = Math.fround(pz + Math.fround(offset[2]! * weight))
    }
    points[3 * i] = px; points[3 * i + 1] = py; points[3 * i + 2] = pz
  }
}

/** UsdSkelSkinTransform result as the GfMatrix4f upstream computes, or
 *  undefined where it returns false. */
function _SkinTransform(
  skinningMethod: string, geomBindXform: GfMatrix4f,
  skinningXforms: readonly GfMatrix4f[], influences: readonly GfVec2f[],
): GfMatrix4f | undefined {
  const { indices, weights } = _SplitInfluences(influences)
  const xform = UsdSkelSkinTransform(
    skinningMethod, _Matrix4Array(geomBindXform), skinningXforms.map(_Matrix4Array),
    indices, weights, 'float')
  return xform ? new GfMatrix4f(...xform) : undefined
}

/** extComputations.cpp:91-231 */
function _InvokeSkinningComputationPoints(
  skinningMethod: string,
  ctx: UsdSkelImagingExtComputationContext,
): void {
  const A = UsdSkelImagingExtAggregatorComputationInputNameTokens
  const I = UsdSkelImagingExtComputationInputNameTokens
  const L = UsdSkelImagingExtComputationLegacyInputNameTokens
  const restPointsValue = _Get(ctx.getInputValue(A.restPoints))
  const geomBindXformValue = _Get(ctx.getInputValue(A.geomBindXform))
  const influencesValue = _Get(ctx.getInputValue(A.influences))
  const numInfluencesPerComponentValue = _Get(ctx.getInputValue(A.numInfluencesPerComponent))
  const hasConstantInfluencesValue = _Get(ctx.getInputValue(A.hasConstantInfluences))
  const primWorldToLocalValue = _Get(ctx.getInputValue(L.primWorldToLocal))
  const blendShapeOffsetsValue = _Get(ctx.getInputValue(A.blendShapeOffsets))
  const blendShapeOffsetRangesValue = _Get(ctx.getInputValue(A.blendShapeOffsetRanges))
  const blendShapeWeightsValue = _Get(ctx.getInputValue(I.blendShapeWeights))
  const skinningXformsValue = _Get(ctx.getInputValue(I.skinningXforms))
  const skelLocalToWorldValue = _Get(ctx.getInputValue(L.skelLocalToWorld))

  // Ensure inputs are holding the right value types.
  if (!_IsHoldingArray(restPointsValue, 'GfVec3f', GfVec3f) ||
      !(geomBindXformValue instanceof GfMatrix4f) ||
      !_IsHoldingArray(influencesValue, 'GfVec2f', GfVec2f) ||
      !(typeof numInfluencesPerComponentValue === 'number') ||
      !(typeof hasConstantInfluencesValue === 'boolean') ||
      !(primWorldToLocalValue instanceof GfMatrix4d) ||
      !_IsHoldingArray(blendShapeOffsetsValue, 'GfVec4f', GfVec4f) ||
      !_IsHoldingArray(blendShapeOffsetRangesValue, 'GfVec2i', GfVec2i) ||
      !_IsHoldingArray(blendShapeWeightsValue, 'float') ||
      !_IsHoldingArray(skinningXformsValue, 'GfMatrix4f', GfMatrix4f) ||
      !(skelLocalToWorldValue instanceof GfMatrix4d)) {
    ctx.raiseComputationError()
    return
  }
  const skinnedPoints = _ToFlat(_Elements<GfVec3f>(restPointsValue))

  _ApplyPackedBlendShapes(
    _Elements<GfVec4f>(blendShapeOffsetsValue),
    _Elements<GfVec2i>(blendShapeOffsetRangesValue),
    _Elements<number>(blendShapeWeightsValue),
    skinnedPoints)

  const numInfluencesPerComponent = numInfluencesPerComponentValue

  if (numInfluencesPerComponent <= 0) {
    ctx.setOutputValue(
      UsdSkelImagingExtComputationOutputNameTokens.skinnedPoints,
      VtValue.createArray(_ToVec3fArray(skinnedPoints)))
    return
  }

  const skinningXforms = _Elements<GfMatrix4f>(skinningXformsValue)
  const influences = _Elements<GfVec2f>(influencesValue)

  if (hasConstantInfluencesValue) {
    // Have constant influences. Compute a rigid deformation.
    const skinnedTransform = _SkinTransform(
      skinningMethod, geomBindXformValue, skinningXforms, influences)
    if (skinnedTransform) {
      // The computed skinnedTransform is the transform which, when applied
      // to the points of the skinned prim, results in skinned points in
      // *skel* space, and need to be xformed to prim local space.

      const restToPrimLocalSkinnedXf =
        new GfMatrix4d(skinnedTransform)
          .getMultiply(skelLocalToWorldValue)
          .getMultiply(primWorldToLocalValue)

      // XXX: Ideally we would modify the xform of the skinned prim, rather
      // than its underlying points (which is particularly important if we
      // want to preserve instancing!). For now, bake the rigid deformation
      // into the points.
      _TransformPoints(skinnedPoints, restToPrimLocalSkinnedXf)
    } else {
      // Nothing to do. We initialized skinnedPoints to the restPoints, so
      // just return that.
    }
  } else {
    const { indices, weights } = _SplitInfluences(influences)
    UsdSkelSkinPoints(
      skinningMethod,
      _Matrix4Array(geomBindXformValue),
      skinningXforms.map(_Matrix4Array),
      indices, weights,
      numInfluencesPerComponent,
      skinnedPoints,
      'float')

    // The points returned above are in skel space, and need to be
    // transformed to prim local space.
    const skelToPrimLocal = skelLocalToWorldValue.getMultiply(primWorldToLocalValue)

    _TransformPoints(skinnedPoints, skelToPrimLocal)
  }

  ctx.setOutputValue(
    UsdSkelImagingExtComputationOutputNameTokens.skinnedPoints,
    VtValue.createArray(_ToVec3fArray(skinnedPoints)))
}

/** GfMatrix4d(m).ExtractRotationMatrix().GetInverse().GetTranspose() */
function _InvTransposeRotation(m: GfMatrix4d): GfMatrix3d {
  return (m.extractRotationMatrix() as GfMatrix3d).getInverse().getTranspose()
}

/** extComputations.cpp:233-332 */
function _DeformNormalsWithSkinning(
  skinningMethod: string,
  geomBindXform: GfMatrix4f,
  skinningXforms: readonly GfMatrix4f[],
  influences: readonly GfVec2f[],
  hasConstantInfluences: boolean,
  numInfluencesPerComponent: number,
  faceVertexIndices: ArrayLike<number>,
  seklToPrimLocalXform: GfMatrix4d,
  hasFaceVaryingNormals: boolean,
  skinnedNormals: Float32Array,
): void {
  if (hasConstantInfluences) {
    // Have constant influences. Compute a rigid deformation.
    const skinnedTransform = _SkinTransform(
      skinningMethod, geomBindXform, skinningXforms, influences)
    if (skinnedTransform) {
      // The computed skinnedTransform is the transform which, when applied
      // to the normals of the skinned prim, results in skinned normals in
      // *skel* space, and need to be xformed to prim local space.

      const restToPrimLocalSkinnedXf =
        new GfMatrix4d(skinnedTransform).getMultiply(seklToPrimLocalXform)
      const restToPrimLocalSkinnedXfInvTranspose =
        _InvTransposeRotation(restToPrimLocalSkinnedXf)

      _TransformNormals(skinnedNormals, restToPrimLocalSkinnedXfInvTranspose)
    }
  } else {
    // Get geomBindInvTransposeXform
    const geomBindInvTransposeXform =
      _InvTransposeRotation(new GfMatrix4d(geomBindXform))

    // Get skinningInvTransposeXforms
    const skinningInvTransposeXforms = skinningXforms.map(
      xform => [..._InvTransposeRotation(new GfMatrix4d(xform)).GetArray()])

    const { indices, weights } = _SplitInfluences(influences)
    if (hasFaceVaryingNormals) {
      UsdSkelSkinFaceVaryingNormals(
        skinningMethod,
        [...geomBindInvTransposeXform.GetArray()],
        skinningInvTransposeXforms,
        indices, weights,
        numInfluencesPerComponent,
        faceVertexIndices,
        skinnedNormals)
    } else {
      UsdSkelSkinNormals(
        skinningMethod,
        [...geomBindInvTransposeXform.GetArray()],
        skinningInvTransposeXforms,
        indices, weights,
        numInfluencesPerComponent,
        skinnedNormals)
    }

    // Output of skinning is in *skel* space.
    // Transform the result into gprim space.
    const skelToGprimInvTransposeXform = _InvTransposeRotation(seklToPrimLocalXform)
    _TransformNormals(skinnedNormals, skelToGprimInvTransposeXform)
  }
}

/** extComputations.cpp:334-426 */
function _InvokeSkinningComputationNormals(
  skinningMethod: string,
  ctx: UsdSkelImagingExtComputationContext,
): void {
  const A = UsdSkelImagingExtAggregatorComputationInputNameTokens
  const I = UsdSkelImagingExtComputationInputNameTokens
  const L = UsdSkelImagingExtComputationLegacyInputNameTokens
  const restNormalsValue = _Get(ctx.getInputValue(A.restNormals))
  const geomBindXformValue = _Get(ctx.getInputValue(A.geomBindXform))
  const influencesValue = _Get(ctx.getInputValue(A.influences))
  const numInfluencesPerComponentValue = _Get(ctx.getInputValue(A.numInfluencesPerComponent))
  const hasConstantInfluencesValue = _Get(ctx.getInputValue(A.hasConstantInfluences))
  const primWorldToLocalValue = _Get(ctx.getInputValue(L.primWorldToLocal))
  const skinningXformsValue = _Get(ctx.getInputValue(I.skinningXforms))
  const skelLocalToWorldValue = _Get(ctx.getInputValue(L.skelLocalToWorld))
  const faceVertexIndicesValue = _Get(ctx.getInputValue(A.faceVertexIndices))
  const hasFaceVaryingNormalsValue = _Get(ctx.getInputValue(A.hasFaceVaryingNormals))

  // Ensure inputs are holding the right value types.
  if (!_IsHoldingArray(restNormalsValue, 'GfVec3f', GfVec3f) ||
      !(geomBindXformValue instanceof GfMatrix4f) ||
      !_IsHoldingArray(influencesValue, 'GfVec2f', GfVec2f) ||
      !(typeof numInfluencesPerComponentValue === 'number') ||
      !(typeof hasConstantInfluencesValue === 'boolean') ||
      !(primWorldToLocalValue instanceof GfMatrix4d) ||
      !_IsHoldingArray(skinningXformsValue, 'GfMatrix4f', GfMatrix4f) ||
      !(skelLocalToWorldValue instanceof GfMatrix4d) ||
      !_IsHoldingArray(faceVertexIndicesValue, 'int') ||
      !(typeof hasFaceVaryingNormalsValue === 'boolean')) {
    ctx.raiseComputationError()
    return
  }

  const restNormals = _Elements<GfVec3f>(restNormalsValue)

  const numInfluencesPerComponent = numInfluencesPerComponentValue

  if (numInfluencesPerComponent <= 0) {
    ctx.setOutputValue(
      UsdSkelImagingExtComputationOutputNameTokens.skinnedNormals,
      VtValue.createArray(new VtArray<GfVec3f>(restNormals, VtValueTypes.GfVec3f)))
    return
  }

  const skinnedNormals = _ToFlat(restNormals)

  // The points returned above are in skel space, and need to be transformed
  // to prim local space.
  const skelToPrimLocal = skelLocalToWorldValue.getMultiply(primWorldToLocalValue)
  _DeformNormalsWithSkinning(
    skinningMethod,
    geomBindXformValue,
    _Elements<GfMatrix4f>(skinningXformsValue),
    _Elements<GfVec2f>(influencesValue),
    hasConstantInfluencesValue,
    numInfluencesPerComponent,
    _Elements<number>(faceVertexIndicesValue),
    skelToPrimLocal,
    hasFaceVaryingNormalsValue,
    skinnedNormals)

  ctx.setOutputValue(
    UsdSkelImagingExtComputationOutputNameTokens.skinnedNormals,
    VtValue.createArray(_ToVec3fArray(skinnedNormals)))
}

/** extComputations.cpp:428-452. Invoke the skinning ext computation. */
export function UsdSkelImagingInvokeExtComputation(
  skinningMethod: string,
  ctx: UsdSkelImagingExtComputationContext,
): void {
  const restPointsValuePtr = ctx.getOptionalInputValue(
    UsdSkelImagingExtAggregatorComputationInputNameTokens.restPoints)
  const restNormalsValuePtr = ctx.getOptionalInputValue(
    UsdSkelImagingExtAggregatorComputationInputNameTokens.restNormals)
  if (restPointsValuePtr === undefined && restNormalsValuePtr === undefined) {
    TF_CODING_ERROR('No rest points or normals provided')
    ctx.raiseComputationError()
    return
  }

  const computePoints = restPointsValuePtr !== undefined
  if (computePoints) {
    _InvokeSkinningComputationPoints(skinningMethod, ctx)
  } else {
    _InvokeSkinningComputationNormals(skinningMethod, ctx)
  }
}

///////////////////////////////////////////////////////////////////////////////
/// UsdSkelImagingExtComputationCpuCallback

/** extComputations.cpp:457-473 */
class _SkinningComputationCpuCallback {
  constructor(private readonly _skinningMethod: string) {}

  compute(ctx: UsdSkelImagingExtComputationContext): void {
    UsdSkelImagingInvokeExtComputation(this._skinningMethod, ctx)
  }
}

/** extComputations.cpp:477-486 */
function _ExtComputationCpuCallbackDataSource(skinningMethod: string): HdExtComputationCpuCallbackDataSource {
  return HdRetainedTypedSampledDataSource.new<object>(
    new _SkinningComputationCpuCallback(skinningMethod))
}

const _cpuCallbacks = new Map<string, HdExtComputationCpuCallbackDataSource>()

/** extComputations.cpp:489-509. Data source for skinning CPU computation. */
export function UsdSkelImagingExtComputationCpuCallback(
  skinningMethod: string,
): HdExtComputationCpuCallbackDataSource | undefined {
  if (skinningMethod === UsdSkelTokens.classicLinear ||
      skinningMethod === UsdSkelTokens.dualQuaternion) {
    let result = _cpuCallbacks.get(skinningMethod)
    if (!result) {
      result = _ExtComputationCpuCallbackDataSource(skinningMethod)
      _cpuCallbacks.set(skinningMethod, result)
    }
    return result
  }

  TF_WARN(`Unknown skinning method ${skinningMethod}\n`)

  return undefined
}

///////////////////////////////////////////////////////////////////////////////
/// UsdSkelImagingExtComputationGlslKernel

/** extComputations.cpp:513-537 */
function _LoadSkinningComputeKernel(kernelKey: string): HdStringDataSource | undefined {
  const gfx = new HioGlslfx(UsdSkelImagingPackageSkinningShader())
  if (!gfx.isValid()) {
    TF_CODING_ERROR("Couldn't load UsdImagingGLPackageSkinningShader")
    return undefined
  }

  const shaderSource = gfx.getSource(TfToken(kernelKey))
  if (shaderSource.length === 0) {
    // TF_VERIFY(!shaderSource.empty())
    TF_CODING_ERROR("Failed verification: ' !shaderSource.empty() '")
    TF_WARN(`Skinning compute shader is missing kernel '${kernelKey}'`)
    return undefined
  }

  return HdRetainedTypedSampledDataSource.new<string>(shaderSource) as unknown as HdStringDataSource
}

const _glslKernels = new Map<string, HdStringDataSource | undefined>()

function _CachedKernel(kernelKey: string): HdStringDataSource | undefined {
  // The function-local statics of extComputations.cpp:551-570.
  if (!_glslKernels.has(kernelKey)) {
    _glslKernels.set(kernelKey, _LoadSkinningComputeKernel(kernelKey))
  }
  return _glslKernels.get(kernelKey)
}

/** extComputations.cpp:539-578. Data source for skinning GPU computation. */
export function UsdSkelImagingExtComputationGlslKernel(
  skinningMethod: string,
  computationType: string,
): HdStringDataSource | undefined {
  if (TfGetEnvSetting(USDSKELIMAGING_FORCE_CPU_COMPUTE)) {
    return undefined
  }

  if (skinningMethod === UsdSkelTokens.classicLinear) {
    if (computationType === UsdSkelImagingExtComputationTypeTokens.points) {
      return _CachedKernel(_tokens.skinPointsLBSKernel)
    }
    if (computationType === UsdSkelImagingExtComputationTypeTokens.normals) {
      return _CachedKernel(_tokens.skinNormalsLBSKernel)
    }
  }
  if (skinningMethod === UsdSkelTokens.dualQuaternion) {
    if (computationType === UsdSkelImagingExtComputationTypeTokens.points) {
      return _CachedKernel(_tokens.skinPointsDQSKernel)
    }
    if (computationType === UsdSkelImagingExtComputationTypeTokens.normals) {
      return _CachedKernel(_tokens.skinNormalsDQSKernel)
    }
  }

  TF_WARN(`Unknown skinning method "${skinningMethod}" or computation type "${computationType}"\n`)

  return undefined
}
