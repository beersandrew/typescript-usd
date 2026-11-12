// Ported from OpenUSD 26.11.1: pxr/imaging/hd/sceneDelegate.cpp,
//  pxr/imaging/hd/sceneDelegate.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/sceneDelegate.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - SdfPath ids are path strings, as everywhere else in this hd port; the
//   empty SdfPath is ''.
// - Out-parameters are boxes or arrays: GetIndexedPrimvar's VtIntArray*
//   outIndices is `{ value: number[] } | null`; the Sample* functions fill
//   caller-provided `sampleTimes` / `sampleValues` arrays (the C++ float* /
//   T* buffers) and return the authored sample count. The CAPACITY template
//   overloads take an HdTimeSampleArray.
// - HdDisplayStyle is the existing class in displayStyle.ts (re-exported
//   here, where upstream declares it, sceneDelegate.h:58-130).
// - HdExtComputation{Input,Output}Descriptor and
//   HdExtComputationPrimvarDescriptor are the existing shapes in
//   extComputation.ts / extComputationUtils.ts.
// - HdIdVectorSharedPtr is `string[] | null`.

import type { HdExtComputationContextArg } from './extComputationContextInternal.ts'
import type { Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import { Matrix4d as GfMatrix4d, Range3d as GfRange3d, Vec3f as GfVec3f } from 'typescript-usd/gf'
import { SubdivTags as PxOsdSubdivTags } from 'typescript-usd/pxOsd'
import { HdMeshTopology } from './meshTopology.ts'
import { HdBasisCurvesTopology } from './basisCurvesTopology.ts'
import { HdCullStyle, HdDisplayStyle, HdReprSelector } from './displayStyle.ts'
import { HdInterpolation } from './enums.ts'
import { HdOptionTokens, HdPrimvarRoleTokens, HdRenderTagTokens } from './tokens.ts'
import { HdRenderBufferDescriptor } from './aov.ts'
import type { HdDirtyBits } from './changeTracker.ts'
import type { HdRenderIndex } from './renderIndex.ts'
import type { HdTimeSampleArray } from './timeSampleArray.ts'
import type { HdTupleType } from './types.ts'
import type {
  HdExtComputationInputDescriptor, HdExtComputationOutputDescriptor,
} from './extComputation.ts'
import type {
  HdExtComputationContext, HdExtComputationPrimvarDescriptor,
} from './extComputationUtils.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

export { HdDisplayStyle }

/** sceneDelegate.h:38 */
export type HdIdVectorSharedPtr = string[] | null

/** sceneDelegate.h:42: (instancer path, instance index) pairs. */
export type HdInstancerContext = Array<[string, number]>

/** sceneDelegate.h:48-54 */
export interface HdSyncRequestVector {
  IDs: string[]
  dirtyBits: HdDirtyBits[]
}

/** sceneDelegate.h:137-184 */
export class HdPrimvarDescriptor {
  name: TfToken
  interpolation: HdInterpolation
  role: TfToken
  indexed: boolean
  elementSize: number

  constructor(
    name: TfToken = '' as TfToken,
    interpolation: HdInterpolation = HdInterpolation.HdInterpolationConstant,
    role: TfToken = HdPrimvarRoleTokens.none,
    indexed = false,
    elementSize = 1,
  ) {
    this.name = name
    this.interpolation = interpolation
    this.role = role
    this.indexed = indexed
    this.elementSize = elementSize
  }

  /** sceneDelegate.h:173-178 (indexed is not compared upstream). */
  Equals(rhs: HdPrimvarDescriptor): boolean {
    return this.name === rhs.name && this.role === rhs.role
      && this.interpolation === rhs.interpolation
      && this.elementSize === rhs.elementSize
  }
}

export type HdPrimvarDescriptorVector = HdPrimvarDescriptor[]

// hd/tokens.h:403-414 HD_MODEL_DRAWMODE_TOKENS used by the default below.
const _modelDrawModeInherited = 'inherited' as TfToken
const _modelDrawModeCross = 'cross' as TfToken

/** sceneDelegate.h:197-262. SdfAssetPath card textures are asset path
 *  strings ('' is the empty SdfAssetPath). */
export class HdModelDrawMode {
  drawMode: TfToken
  applyDrawMode: boolean
  drawModeColor: GfVec3f
  cardGeometry: TfToken
  cardTextureXPos: string
  cardTextureYPos: string
  cardTextureZPos: string
  cardTextureXNeg: string
  cardTextureYNeg: string
  cardTextureZNeg: string

  constructor(
    drawMode: TfToken = _modelDrawModeInherited,
    applyDrawMode = false,
    drawModeColor: GfVec3f = new GfVec3f(0.18),
    cardGeometry: TfToken = _modelDrawModeCross,
    cardTextureXPos = '', cardTextureYPos = '', cardTextureZPos = '',
    cardTextureXNeg = '', cardTextureYNeg = '', cardTextureZNeg = '',
  ) {
    this.drawMode = drawMode
    this.applyDrawMode = applyDrawMode
    this.drawModeColor = drawModeColor
    this.cardGeometry = cardGeometry
    this.cardTextureXPos = cardTextureXPos
    this.cardTextureYPos = cardTextureYPos
    this.cardTextureZPos = cardTextureZPos
    this.cardTextureXNeg = cardTextureXNeg
    this.cardTextureYNeg = cardTextureYNeg
    this.cardTextureZNeg = cardTextureZNeg
  }

  /** sceneDelegate.h:244-256 */
  Equals(rhs: HdModelDrawMode): boolean {
    return this.drawMode === rhs.drawMode
      && this.applyDrawMode === rhs.applyDrawMode
      && this.drawModeColor.equals(rhs.drawModeColor)
      && this.cardGeometry === rhs.cardGeometry
      && this.cardTextureXPos === rhs.cardTextureXPos
      && this.cardTextureYPos === rhs.cardTextureYPos
      && this.cardTextureZPos === rhs.cardTextureZPos
      && this.cardTextureXNeg === rhs.cardTextureXNeg
      && this.cardTextureYNeg === rhs.cardTextureYNeg
      && this.cardTextureZNeg === rhs.cardTextureZNeg
  }
}

/** sceneDelegate.h:383-398 */
export class HdVolumeFieldDescriptor {
  constructor(
    public fieldName: TfToken = '' as TfToken,
    public fieldPrimType: TfToken = '' as TfToken,
    public fieldId = '',
  ) {}
}

export type HdVolumeFieldDescriptorVector = HdVolumeFieldDescriptor[]

/** The value type of HdExtComputationPrimvarDescriptor (sceneDelegate.h:275). */
export type HdExtComputationPrimvarValueType = HdTupleType

// SdfPath::ReplacePrefix(oldPrefix, '/') for absolute prim paths.
function _ReplacePrefixWithRoot(path: string, prefix: string): string {
  if (prefix === '/' || prefix === '') return path
  if (path === prefix) return '/'
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length)
  return path
}

// Fill helper for the Sample* defaults: one sample at time 0.
function _SampleOnce<T>(maxSampleCount: number, sampleTimes: number[],
  sampleValues: T[], value: () => T): number {
  if (maxSampleCount > 0) {
    sampleTimes[0] = 0.0
    sampleValues[0] = value()
    return 1
  }
  return 0
}

/**
 * sceneDelegate.h:409-1123. Adapter class providing data exchange with the
 * client scene graph.
 */
export abstract class HdSceneDelegate {
  private _index: HdRenderIndex
  private _delegateID: string

  /** sceneDelegate.cpp:19-29 */
  constructor(parentIndex: HdRenderIndex, delegateID: string) {
    this._index = parentIndex
    this._delegateID = delegateID
    if (!delegateID.startsWith('/')) {
      TF_CODING_ERROR(`Scene Delegate Id must be an absolute path: ${delegateID}`)
      this._delegateID = `/${delegateID}`
    }
  }

  /** sceneDelegate.h:419 */
  getRenderIndex(): HdRenderIndex { return this._index }

  /** sceneDelegate.h:427 */
  getDelegateID(): string { return this._delegateID }

  /** sceneDelegate.cpp:33-37 */
  sync(_request: HdSyncRequestVector | null): void {}

  /** sceneDelegate.cpp:39-42 */
  postSyncCleanup(): void {}

  /** sceneDelegate.cpp:48-56 */
  isEnabled(option: TfToken | string): boolean {
    if (option === HdOptionTokens.parallelRprimSync) {
      return true
    }
    return false
  }

  /** sceneDelegate.cpp:73-78 */
  getMeshTopology(_id: string): HdMeshTopology {
    return new HdMeshTopology()
  }

  /** sceneDelegate.cpp:80-85. HdBasisCurvesTopology() is (linear, '',
   *  nonperiodic) (basisCurvesTopology.cpp:36-46). */
  getBasisCurvesTopology(_id: string): HdBasisCurvesTopology {
    return new HdBasisCurvesTopology('linear', '', 'nonperiodic', [])
  }

  /** sceneDelegate.cpp:87-92 */
  getSubdivTags(_id: string): PxOsdSubdivTags {
    return new PxOsdSubdivTags()
  }

  /** sceneDelegate.cpp:94-99 */
  getExtent(_id: string): GfRange3d {
    return new GfRange3d()
  }

  /** sceneDelegate.cpp:101-106 */
  getTransform(_id: string): GfMatrix4d {
    return new GfMatrix4d(1)
  }

  /** sceneDelegate.cpp:108-123 / 125-137 */
  sampleTransform(id: string, maxSampleCount: number,
    sampleTimes: number[], sampleValues: GfMatrix4d[]): number
  sampleTransform(id: string, startTime: number, endTime: number,
    maxSampleCount: number, sampleTimes: number[], sampleValues: GfMatrix4d[]): number
  sampleTransform(id: string, sa: HdTimeSampleArray<GfMatrix4d>, capacity: number): void
  sampleTransform(id: string, startTime: number, endTime: number,
    sa: HdTimeSampleArray<GfMatrix4d>, capacity: number): void
  sampleTransform(id: string, ...args: unknown[]): number | void {
    return this._sample<GfMatrix4d>(args,
      (max, times, values) => _SampleOnce(max, times, values, () => this.getTransform(id)),
      (_start, _end, max, times, values) => this.sampleTransform(id, max, times, values))
  }

  /** sceneDelegate.cpp:139-143 */
  getVisible(_id: string): boolean { return true }

  /** sceneDelegate.cpp:145-149 */
  getDoubleSided(_id: string): boolean { return false }

  /** sceneDelegate.cpp:151-156 */
  getCullStyle(_id: string): HdCullStyle { return HdCullStyle.HdCullStyleDontCare }

  /** sceneDelegate.cpp:158-163 */
  getShadingStyle(_id: string): VtValue { return VtValue.getEmpty() }

  /** sceneDelegate.cpp:165-170 */
  getDisplayStyle(_id: string): HdDisplayStyle { return new HdDisplayStyle() }

  /** sceneDelegate.cpp:172-177 */
  Get(_id: string, _key: TfToken | string): VtValue { return VtValue.getEmpty() }

  /** sceneDelegate.cpp:179-189: an empty value, not Get(id, key), so callers
   *  never see a non-indexed primvar with empty indices. */
  getIndexedPrimvar(_id: string, _key: TfToken | string,
    _outIndices: { value: number[] } | null): VtValue {
    return VtValue.getEmpty()
  }

  /** sceneDelegate.cpp:191-219 */
  samplePrimvar(id: string, key: TfToken | string, maxSampleCount: number,
    sampleTimes: number[], sampleValues: VtValue[]): number
  samplePrimvar(id: string, key: TfToken | string, startTime: number, endTime: number,
    maxSampleCount: number, sampleTimes: number[], sampleValues: VtValue[]): number
  samplePrimvar(id: string, key: TfToken | string, sa: HdTimeSampleArray<VtValue>, capacity: number): void
  samplePrimvar(id: string, key: TfToken | string, startTime: number, endTime: number,
    sa: HdTimeSampleArray<VtValue>, capacity: number): void
  samplePrimvar(id: string, key: TfToken | string, ...args: unknown[]): number | void {
    return this._sample<VtValue>(args,
      (max, times, values) => _SampleOnce(max, times, values, () => this.Get(id, key)),
      (_start, _end, max, times, values) => this.samplePrimvar(id, key, max, times, values))
  }

  /** sceneDelegate.cpp:221-252 */
  sampleIndexedPrimvar(id: string, key: TfToken | string, maxSampleCount: number,
    sampleTimes: number[], sampleValues: VtValue[], sampleIndices: number[][]): number
  sampleIndexedPrimvar(id: string, key: TfToken | string, startTime: number, endTime: number,
    maxSampleCount: number, sampleTimes: number[], sampleValues: VtValue[],
    sampleIndices: number[][]): number
  sampleIndexedPrimvar(id: string, key: TfToken | string, ...args: unknown[]): number {
    if (args.length === 4) {
      const [maxSampleCount, sampleTimes, sampleValues, sampleIndices] =
        args as [number, number[], VtValue[], number[][]]
      if (maxSampleCount > 0) {
        sampleTimes[0] = 0.0
        const indices = { value: [] as number[] }
        sampleValues[0] = this.getIndexedPrimvar(id, key, indices)
        sampleIndices[0] = indices.value
        return 1
      }
      return 0
    }
    const [, , maxSampleCount, sampleTimes, sampleValues, sampleIndices] =
      args as [number, number, number, number[], VtValue[], number[][]]
    return this.sampleIndexedPrimvar(id, key, maxSampleCount, sampleTimes,
      sampleValues, sampleIndices)
  }

  /** sceneDelegate.cpp:254-259 */
  getReprSelector(_id: string): HdReprSelector { return new HdReprSelector() }

  /** sceneDelegate.cpp:61-66 */
  getRenderTag(_id: string): TfToken { return HdRenderTagTokens.geometry as TfToken }

  /** sceneDelegate.cpp:261-266 */
  getCategories(_id: string): TfToken[] { return [] }

  /** sceneDelegate.cpp:268-272 */
  getInstanceCategories(_instancerId: string): TfToken[][] { return [] }

  /** sceneDelegate.cpp:274-278 */
  getCoordSysBindings(_id: string): HdIdVectorSharedPtr { return null }

  /** sceneDelegate.cpp:280-284 */
  getModelDrawMode(_id: string): HdModelDrawMode { return new HdModelDrawMode() }

  /** sceneDelegate.cpp:290-296 */
  getInstanceIndices(_instancerId: string, _prototypeId: string): number[] { return [] }

  /** sceneDelegate.cpp:298-303 */
  getInstancerTransform(_instancerId: string): GfMatrix4d { return new GfMatrix4d(1) }

  /** sceneDelegate.cpp:305-310 */
  getInstancerId(_primId: string): string { return '' }

  /** sceneDelegate.cpp:312-317 */
  getInstancerPrototypes(_instancerId: string): string[] { return [] }

  /** sceneDelegate.cpp:319-347 */
  sampleInstancerTransform(instancerId: string, maxSampleCount: number,
    sampleTimes: number[], sampleValues: GfMatrix4d[]): number
  sampleInstancerTransform(instancerId: string, startTime: number, endTime: number,
    maxSampleCount: number, sampleTimes: number[], sampleValues: GfMatrix4d[]): number
  sampleInstancerTransform(instancerId: string, sa: HdTimeSampleArray<GfMatrix4d>, capacity: number): void
  sampleInstancerTransform(instancerId: string, startTime: number, endTime: number,
    sa: HdTimeSampleArray<GfMatrix4d>, capacity: number): void
  sampleInstancerTransform(instancerId: string, ...args: unknown[]): number | void {
    return this._sample<GfMatrix4d>(args,
      (max, times, values) => _SampleOnce(max, times, values,
        () => this.getInstancerTransform(instancerId)),
      (_start, _end, max, times, values) =>
        this.sampleInstancerTransform(instancerId, max, times, values))
  }

  /** sceneDelegate.cpp:353-360 */
  getScenePrimPath(rprimId: string, _instanceIndex: number,
    _instancerContext: HdInstancerContext | null = null): string {
    return _ReplacePrefixWithRoot(rprimId, this._delegateID)
  }

  /** sceneDelegate.cpp:362-370 */
  getScenePrimPaths(rprimId: string, instanceIndices: readonly number[],
    _instancerContexts: HdInstancerContext[] | null = null): string[] {
    return instanceIndices.map(() => _ReplacePrefixWithRoot(rprimId, this._delegateID))
  }

  /** sceneDelegate.cpp:376-381 */
  getMaterialId(_rprimId: string): string { return '' }

  /** sceneDelegate.cpp:383-388 */
  getMaterialResource(_materialId: string): VtValue { return VtValue.getEmpty() }

  /** sceneDelegate.cpp:394-399 */
  getRenderBufferDescriptor(_id: string): HdRenderBufferDescriptor {
    return new HdRenderBufferDescriptor()
  }

  /** sceneDelegate.cpp:405-411 */
  getLightParamValue(_id: string, _paramName: TfToken | string): VtValue {
    return VtValue.getEmpty()
  }

  /** sceneDelegate.cpp:417-423 */
  getCameraParamValue(_cameraId: string, _paramName: TfToken | string): VtValue {
    return VtValue.getEmpty()
  }

  /** sceneDelegate.cpp:429-435 */
  getVolumeParamValue(_id: string, _paramName: TfToken | string): VtValue {
    return VtValue.getEmpty()
  }

  /** sceneDelegate.cpp:437-442 */
  getVolumeFieldDescriptors(_volumeId: string): HdVolumeFieldDescriptorVector { return [] }

  /** sceneDelegate.cpp:448-453 */
  invokeExtComputation(_computationId: string, _context: HdExtComputationContextArg): void {}

  /** sceneDelegate.cpp:455-460 */
  getExtComputationSceneInputNames(_computationId: string): TfToken[] { return [] }

  /** sceneDelegate.cpp:462-468 */
  getExtComputationInputDescriptors(_computationId: string): HdExtComputationInputDescriptor[] {
    return []
  }

  /** sceneDelegate.cpp:470-476 */
  getExtComputationOutputDescriptors(_computationId: string): HdExtComputationOutputDescriptor[] {
    return []
  }

  /** sceneDelegate.cpp:478-483 */
  getPrimvarDescriptors(_id: string, _interpolation: HdInterpolation): HdPrimvarDescriptorVector {
    return []
  }

  /** sceneDelegate.cpp:485-491 */
  getExtComputationPrimvarDescriptors(_rprimId: string,
    _interpolationMode: HdInterpolation): HdExtComputationPrimvarDescriptor[] {
    return []
  }

  /** sceneDelegate.cpp:493-498 */
  getExtComputationInput(_computationId: string, _input: TfToken | string): VtValue {
    return VtValue.getEmpty()
  }

  /** sceneDelegate.cpp:500-530 */
  sampleExtComputationInput(computationId: string, input: TfToken | string,
    maxSampleCount: number, sampleTimes: number[], sampleValues: VtValue[]): number
  sampleExtComputationInput(computationId: string, input: TfToken | string,
    startTime: number, endTime: number, maxSampleCount: number,
    sampleTimes: number[], sampleValues: VtValue[]): number
  sampleExtComputationInput(computationId: string, input: TfToken | string,
    sa: HdTimeSampleArray<VtValue>, capacity: number): void
  sampleExtComputationInput(computationId: string, input: TfToken | string,
    startTime: number, endTime: number, sa: HdTimeSampleArray<VtValue>, capacity: number): void
  sampleExtComputationInput(computationId: string, input: TfToken | string,
    ...args: unknown[]): number | void {
    return this._sample<VtValue>(args,
      (max, times, values) => _SampleOnce(max, times, values,
        () => this.getExtComputationInput(computationId, input)),
      (_start, _end, max, times, values) =>
        this.sampleExtComputationInput(computationId, input, max, times, values))
  }

  /** sceneDelegate.cpp:532-537 */
  getExtComputationKernel(_computationId: string): string { return '' }

  /** sceneDelegate.cpp:539-547: an empty vector means no filtering, which
   *  should be limited to tests. */
  getTaskRenderTags(_taskId: string): TfToken[] { return [] }

  /** sceneDelegate.cpp:549-552 */
  getPrimId(_id: string): number { return -1 }

  // Dispatches the four C++ overload shapes of a Sample* family:
  // (max, times, values), (start, end, max, times, values), and the
  // HdTimeSampleArray templates (sa, capacity) / (start, end, sa, capacity)
  // (sceneDelegate.h:1125-1300), which retry once with the authored count
  // when it exceeds the capacity.
  private _sample<T>(
    args: readonly unknown[],
    plain: (max: number, times: number[], values: T[]) => number,
    interval: (start: number, end: number, max: number, times: number[], values: T[]) => number,
  ): number | void {
    if (args.length === 3) {
      return plain(args[0] as number, args[1] as number[], args[2] as T[])
    }
    if (args.length === 5) {
      return interval(args[0] as number, args[1] as number, args[2] as number,
        args[3] as number[], args[4] as T[])
    }
    const withInterval = args.length === 4
    const sa = (withInterval ? args[2] : args[0]) as HdTimeSampleArray<T>
    const capacity = (withInterval ? args[3] : args[1]) as number
    const run = (max: number): number => {
      const times: number[] = []
      const values: T[] = []
      const n = withInterval
        ? interval(args[0] as number, args[1] as number, max, times, values)
        : plain(max, times, values)
      for (let i = 0; i < Math.min(n, max); ++i) {
        sa.times[i] = times[i]!
        sa.values[i] = values[i]!
      }
      return n
    }
    sa.resize(capacity)
    const authoredSamples = run(capacity)
    if (authoredSamples > capacity) {
      sa.resize(authoredSamples)
      const authoredSamplesSecondAttempt = run(authoredSamples)
      // Number of samples should be consistent through multiple invocations
      // of the sampling function.
      TF_VERIFY(authoredSamples === authoredSamplesSecondAttempt)
    }
    sa.count = authoredSamples
  }
}
