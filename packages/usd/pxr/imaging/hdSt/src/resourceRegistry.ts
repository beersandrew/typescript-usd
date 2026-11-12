// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/resourceRegistry.cpp,
//  pxr/imaging/hdSt/resourceRegistry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/resourceRegistry.{h,cpp} (OpenUSD 26.11.1).
//
// A central registry of all GPU resources: buffer array range allocation
// and migration, the commit of buffer sources and GPU computations, the
// instance registries, dispatch / misc buffers, and the global Hgi blit and
// compute command queues.
//
// Divergences:
// - Texture loading is asynchronous (textureObjectRegistry.ts header):
//   LoadTexturesAsync() runs the load phase of the next commit, and
//   SetTextureLoadCompletionCallback() reports background loads finishing.
// - GetDetailedResourceAllocation's textureAllocations (a
//   std::vector<VtDictionary>) is held as a VtValue of a JS array of
//   VtDictionary.
// - PLATFORM-DIVERGENCE(hd-instance-use-count) / (hd-bar-shared-ptr): see
//   hd/src/instanceRegistry.ts and hd/src/bufferArrayRange.ts.
//   GarbageCollectDispatchBuffers / GarbageCollectBufferResources drop the
//   entries whose `_expired` flag is set.
// - Instance keys are `number | bigint | string`.
// - The tbb concurrent containers are plain arrays and maps; resolve runs
//   serially.
// - SubmitBlitWork / SubmitComputeWork return Hgi.SubmitCmds' promise (void
//   upstream); synchronous callers ignore it, as upstream code returns
//   immediately for HgiSubmitWaitTypeNoWait.
// - destroy() is the destructor.
// - operator<< is GetDebugString.

import {
  HgiBufferDesc,
  HgiComputeCmdsDesc,
  HgiComputeDispatch,
  HgiDeviceCapabilitiesBits,
  HgiMemoryBarrierBits,
  HgiSubmitWaitType,
  type Hgi,
  type HgiBlitCmds,
  type HgiBufferUsage,
  type HgiComputeCmds,
  type HgiComputePipelineHandle,
  type HgiGraphicsPipelineHandle,
  type HgiResourceBindingsHandle,
} from 'typescript-usd/hgi'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpec as HdBufferSpec,
  DataSizeOfTupleType as HdDataSizeOfTupleType,
  DebugCodes as HdDebugCodes,
  Instance as HdInstance,
  InstanceRegistry as HdInstanceRegistry,
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  ResourceRegistry as HdResourceRegistry,
  ResourceTypeTokens as HdResourceTypeTokens,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferArrayUsageHint as HdBufferArrayUsageHint,
  type BufferSource as HdBufferSource,
  type InstanceKeyType as HdInstanceKeyType,
  type TupleType as HdTupleType,
  type SamplerParameters as HdSamplerParameters,
  type Format as HdFormat,
} from 'typescript-usd/hd'
import type { Vec2i as GfVec2i } from 'typescript-usd/gf'
import { Glslfx as HioGlslfx } from 'typescript-usd/hio'
import { Debug as TfDebug, Hash as TfHash, Token as TfToken, TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import { Dictionary as VtDictionary, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { HdStBufferArrayRegistry } from './bufferArrayRegistry.ts'
import { HdStBufferResource } from './bufferResource.ts'
import { HdStComputation } from './computation.ts'
import { HdStCopyComputationGPU } from './copyComputation.ts'
import { HdStDispatchBuffer } from './dispatchBuffer.ts'
import type { HdSt_GeometricShader } from './geometricShader.ts'
import type { HdStGLSLProgram } from './glslProgram.ts'
import {
  HdStInterleavedSSBOMemoryManager,
  HdStInterleavedUBOMemoryManager,
} from './interleavedMemoryManager.ts'
import type { HdStRenderPassShader } from './renderPassShader.ts'
import { HdStRenderBufferPool, type HdStPooledRenderBufferUniquePtr } from './renderBufferPool.ts'
import { HdStStagingBuffer } from './stagingBuffer.ts'
import { HdSt_GetSize, HdSt_SizeValue, type HdStAggregationStrategy } from './strategyBase.ts'
import { HdStVBOMemoryManager } from './vboMemoryManager.ts'
import { HdStVBOSimpleMemoryManager } from './vboSimpleMemoryManager.ts'
import type { HdStTextureType } from './enums.ts'
import { HdStShaderCodeResourceContext, type HdStShaderCode } from './shaderCode.ts'
import type { HdStTextureHandle } from './textureHandle.ts'
import { HdSt_TextureHandleRegistry } from './textureHandleRegistry.ts'
import type { HdStTextureIdentifier } from './textureIdentifier.ts'
import type { HdStTextureObject } from './textureObject.ts'
import type { HdSt_VertexAdjacencyBuilder } from './vertexAdjacency.ts'
import { TF_CODING_ERROR, TF_RUNTIME_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

export { HdStComputation } from './computation.ts'

// FAITHFULNESS-DEBT(hdst-topology-types): HdSt_MeshTopology
// (hdSt/meshTopology.h) and HdSt_BasisCurvesTopology
// (hdSt/basisCurvesTopology.h) are typed opaquely here; replace with
// `import type` from ./meshTopology.ts and ./basisCurvesTopology.ts.
type HdSt_MeshTopology = object
type HdSt_BasisCurvesTopology = object

/** resourceRegistry.h:46-73 */
export type HdSt_MeshTopologySharedPtr = HdSt_MeshTopology
export type HdSt_BasisCurvesTopologySharedPtr = HdSt_BasisCurvesTopology
export type HdSt_VertexAdjacencyBuilderSharedPtr = HdSt_VertexAdjacencyBuilder
export type HdSt_GeometricShaderSharedPtr = HdSt_GeometricShader
export type HdStRenderPassShaderSharedPtr = HdStRenderPassShader
export type HdStGLSLProgramSharedPtr = HdStGLSLProgram
export type HioGlslfxSharedPtr = HioGlslfx
export type HgiResourceBindingsSharedPtr = HgiResourceBindingsHandle
export type HgiGraphicsPipelineSharedPtr = HgiGraphicsPipelineHandle
export type HgiComputePipelineSharedPtr = HgiComputePipelineHandle
/** MaterialX::ShaderPtr (resourceRegistry.h:32-37), opaque here. */
export type HdStMaterialXShaderPtr = object

/** resourceRegistry.h:92-97 */
export enum HdStComputeQueue {
  HdStComputeQueueZero = 0,
  HdStComputeQueueOne,
  HdStComputeQueueTwo,
  HdStComputeQueueThree,
  HdStComputeQueueCount,
}

/** resourceRegistry.h:99-100 */
export type HdStComputationComputeQueuePairVector = [HdStComputation, HdStComputeQueue][]

/** resourceRegistry.cpp:37-38 */
export const HDST_ENABLE_RESOURCE_INSTANCING = new TfEnvSetting<boolean>(
  'HDST_ENABLE_RESOURCE_INSTANCING', true,
  'Enable instance registry deduplication of resource data')

/** resourceRegistry.cpp:40-45 */
const _perfTokens = {
  numberOfTextureObjects: 'numberOfTextureObjects',
  numberOfTextureHandles: 'numberOfTextureHandles',
} as const

/** resourceRegistry.cpp:47-60 */
function _CopyChainedBuffers(src: HdBufferSource, range: HdBufferArrayRange): void {
  if (src.hasChainedBuffer()) {
    const chainedSrcs = src.getChainedBuffers()
    // Traverse the tree in a depth-first fashion.
    for (const c of chainedSrcs) {
      range.copyData(c)
      HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.sourcesCommitted)
      _CopyChainedBuffers(c, range)
    }
  }
}

/** resourceRegistry.cpp:62-80 */
function _GetChainedStagingSize(src: HdBufferSource): number {
  let size = 0

  if (src.hasChainedBuffer()) {
    const chainedSrcs = src.getChainedBuffers()
    // Traverse the tree in a depth-first fashion.
    for (const c of chainedSrcs) {
      const numElements = c.getNumElements()
      if (numElements > 0) {
        size += numElements * HdDataSizeOfTupleType(c.getTupleType())
      }
      size += _GetChainedStagingSize(c)
    }
  }

  return size
}

/** resourceRegistry.cpp:82-94 */
function _GetBufferSourceStagingSize(src: HdBufferSource): number {
  let size = 0

  const numElements = src.getNumElements()
  if (numElements > 0) {
    size += numElements * HdDataSizeOfTupleType(src.getTupleType())
  }
  size += _GetChainedStagingSize(src)

  return size
}

/** resourceRegistry.cpp:96-102 */
function _IsEnabledResourceInstancing(): boolean {
  return TfGetEnvSetting(HDST_ENABLE_RESOURCE_INSTANCING)
}

/** resourceRegistry.cpp:104-121 */
function _Register<T>(id: HdInstanceKeyType, registry: HdInstanceRegistry<T>,
  perfToken: string): HdInstance<T> {
  if (_IsEnabledResourceInstancing()) {
    const instance = registry.GetInstance(id)

    if (instance.isFirstInstance()) {
      HdPerfLog.GetInstance().incrementCounter(perfToken)
    }

    return instance
  } else {
    // Return an instance that is not managed by the registry when
    // topology instancing is disabled.
    return new HdInstance<T>(id)
  }
}

/** resourceRegistry.h:592-615 */
class _PendingSource {
  constructor(
    public range: HdBufferArrayRange | null,
    public sources: HdBufferSource[],
  ) {}
}

/** resourceRegistry.h:633-639 */
class _PendingComputation {
  constructor(
    public range: HdBufferArrayRange | null,
    public computation: HdStComputation,
  ) {}
}

/** The registry map of resourceRegistry.h:685-688 with operator[]. */
class _TopologyIndexRangeInstanceRegMap {
  private readonly _map = new Map<string, HdInstanceRegistry<HdBufferArrayRange>>()

  get(name: string): HdInstanceRegistry<HdBufferArrayRange> {
    let reg = this._map.get(name)
    if (!reg) {
      reg = new HdInstanceRegistry<HdBufferArrayRange>()
      this._map.set(name, reg)
    }
    return reg
  }

  values(): IterableIterator<HdInstanceRegistry<HdBufferArrayRange>> {
    return this._map.values()
  }
}

/** resourceRegistry.h:107-753. A central registry of all GPU resources. */
export class HdStResourceRegistry extends HdResourceRegistry {
  private readonly _hgi: Hgi
  // resourceRegistry.h:613-614
  private readonly _textureHandleRegistry: HdSt_TextureHandleRegistry
  // resourceRegistry.h:752
  private readonly _renderBufferPool = new HdStRenderBufferPool()

  // Contains (vector of sources we need to commit, BAR we need to commit
  // them to).
  private _pendingSources: _PendingSource[] = []
  // Contains (unresolved source, whether said source requires staging).
  private _pendingSourcesToResolve: [HdBufferSource, boolean][] = []
  // Size of the staging buffer we'll need for _pendingSources.
  private _pendingStagingSize = 0

  private readonly _pendingComputations: _PendingComputation[][] = []

  // aggregated buffer array
  private readonly _nonUniformBufferArrayRegistry = new HdStBufferArrayRegistry()
  private readonly _nonUniformImmutableBufferArrayRegistry = new HdStBufferArrayRegistry()
  private readonly _uniformUboBufferArrayRegistry = new HdStBufferArrayRegistry()
  private readonly _uniformSsboBufferArrayRegistry = new HdStBufferArrayRegistry()
  private readonly _singleBufferArrayRegistry = new HdStBufferArrayRegistry()

  // current aggregation strategies
  private _nonUniformAggregationStrategy: HdStAggregationStrategy
  private _nonUniformImmutableAggregationStrategy: HdStAggregationStrategy
  private _uniformUboAggregationStrategy: HdStAggregationStrategy
  private _uniformSsboAggregationStrategy: HdStAggregationStrategy
  private _singleAggregationStrategy: HdStAggregationStrategy

  private _dispatchBufferRegistry: HdStDispatchBuffer[] = []
  private _bufferResourceRegistry: HdStBufferResource[] = []

  private readonly _meshTopologyRegistry = new HdInstanceRegistry<HdSt_MeshTopologySharedPtr>()
  private readonly _basisCurvesTopologyRegistry =
    new HdInstanceRegistry<HdSt_BasisCurvesTopologySharedPtr>()
  private readonly _vertexAdjacencyBuilderRegistry =
    new HdInstanceRegistry<HdSt_VertexAdjacencyBuilderSharedPtr>()

  private readonly _meshTopologyIndexRangeRegistry = new _TopologyIndexRangeInstanceRegMap()
  private readonly _basisCurvesTopologyIndexRangeRegistry = new _TopologyIndexRangeInstanceRegMap()
  private readonly _implicitPrimsTopologyIndexRangeRegistry = new _TopologyIndexRangeInstanceRegMap()

  private readonly _primvarRangeRegistry = new HdInstanceRegistry<HdBufferArrayRange>()
  private readonly _extComputationDataRangeRegistry = new HdInstanceRegistry<HdBufferArrayRange>()
  private readonly _geometricShaderRegistry = new HdInstanceRegistry<HdSt_GeometricShaderSharedPtr>()
  private readonly _renderPassShaderRegistry = new HdInstanceRegistry<HdStRenderPassShaderSharedPtr>()
  private readonly _glslProgramRegistry = new HdInstanceRegistry<HdStGLSLProgramSharedPtr>()
  private readonly _glslfxFileRegistry = new HdInstanceRegistry<HioGlslfxSharedPtr>()
  private readonly _materialXShaderRegistry = new HdInstanceRegistry<HdStMaterialXShaderPtr>()

  private readonly _resourceBindingsRegistry = new HdInstanceRegistry<HgiResourceBindingsSharedPtr>()
  private readonly _graphicsPipelineRegistry = new HdInstanceRegistry<HgiGraphicsPipelineSharedPtr>()
  private readonly _computePipelineRegistry = new HdInstanceRegistry<HgiComputePipelineSharedPtr>()

  private readonly _subResourceRegistries = new Map<string, HdResourceRegistry>()

  private _blitCmds: HgiBlitCmds | null = null
  private _computeCmds: HgiComputeCmds | null = null

  private readonly _stagingBuffer: HdStStagingBuffer

  /** resourceRegistry.cpp:123-143 */
  constructor(hgi: Hgi) {
    super()
    this._hgi = hgi
    // resourceRegistry.cpp:140
    this._textureHandleRegistry = new HdSt_TextureHandleRegistry(this)
    for (let i = 0; i < HdStComputeQueue.HdStComputeQueueCount; ++i) {
      this._pendingComputations.push([])
    }
    // default aggregation strategies for varying (vertex, varying) primvars
    this._nonUniformAggregationStrategy = new HdStVBOMemoryManager(this)
    this._nonUniformImmutableAggregationStrategy = new HdStVBOMemoryManager(this)
    // default aggregation strategy for uniform on UBO (for globals)
    this._uniformUboAggregationStrategy = new HdStInterleavedUBOMemoryManager(this)
    // default aggregation strategy for uniform on SSBO (for primvars)
    this._uniformSsboAggregationStrategy = new HdStInterleavedSSBOMemoryManager(this)
    // default aggregation strategy for single buffers (for nested instancer)
    this._singleAggregationStrategy = new HdStVBOSimpleMemoryManager(this)
    this._stagingBuffer = new HdStStagingBuffer(this)
  }

  /** resourceRegistry.cpp:145-152 (the destructor). Ideally all the
   *  HdInstanceRegistry would get destroyed here and they cleanup all GPU
   *  resources. Since that mechanism isn't in place yet, we call
   *  GarbageCollect to emulate this behavior. */
  destroy(): void {
    this.garbageCollect()
    this._stagingBuffer.destroy()
    this._hgi.garbageCollect()
  }

  /** resourceRegistry.cpp:154-162 */
  override invalidateShaderRegistry(): void {
    this._geometricShaderRegistry.invalidate()
    this._renderPassShaderRegistry.invalidate()
    this._glslfxFileRegistry.invalidate()
    this._materialXShaderRegistry.invalidate()
  }

  /** resourceRegistry.cpp:165-184 */
  override reloadResource(resourceType: string, path: string): void {
    // find the file and invalidate it
    if (resourceType === HdResourceTypeTokens.shaderFile) {
      const pathHash = TfHash(path)
      const glslfxInstance = this.registerGLSLFXFile(pathHash)

      // Reload the glslfx file.
      glslfxInstance.setValue(new HioGlslfx(path))
    } else if (resourceType === HdResourceTypeTokens.texture) {
      const reg = this._textureHandleRegistry.getTextureObjectRegistry()
      reg.markTextureFilePathDirty(TfToken(path))
    }
  }

  /** resourceRegistry.cpp:186-231 */
  getResourceAllocation(): VtDictionary {
    const result = new VtDictionary()

    let gpuMemoryUsed = 0

    // buffer array allocation

    const nonUniformSize =
      this._nonUniformBufferArrayRegistry.getResourceAllocation(
        this._nonUniformAggregationStrategy, result) +
      this._nonUniformImmutableBufferArrayRegistry.getResourceAllocation(
        this._nonUniformImmutableAggregationStrategy, result)
    const uboSize =
      this._uniformUboBufferArrayRegistry.getResourceAllocation(
        this._uniformUboAggregationStrategy, result)
    const ssboSize =
      this._uniformSsboBufferArrayRegistry.getResourceAllocation(
        this._uniformSsboAggregationStrategy, result)
    const singleBufferSize =
      this._singleBufferArrayRegistry.getResourceAllocation(
        this._singleAggregationStrategy, result)

    result.set(HdPerfTokens.nonUniformSize, HdSt_SizeValue(nonUniformSize))
    result.set(HdPerfTokens.uboSize, HdSt_SizeValue(uboSize))
    result.set(HdPerfTokens.ssboSize, HdSt_SizeValue(ssboSize))
    result.set(HdPerfTokens.singleBufferSize, HdSt_SizeValue(singleBufferSize))
    gpuMemoryUsed += nonUniformSize +
                     uboSize +
                     ssboSize +
                     singleBufferSize

    result.set(HdPerfTokens.gpuMemoryUsed, HdSt_SizeValue(gpuMemoryUsed))

    // Prompt derived registries to tally their resources.
    this._tallyResourceAllocation(result)

    gpuMemoryUsed = HdSt_GetSize(result, HdPerfTokens.gpuMemoryUsed, 0)

    HdPerfLog.GetInstance().setCounter(HdPerfTokens.gpuMemoryUsed, gpuMemoryUsed)

    return result
  }

  /** resourceRegistry.cpp:233-241 */
  getDetailedResourceAllocation(): VtDictionary {
    const result = new VtDictionary()
    result.set(HdPerfTokens.stats, VtValueOfDictionary(this.getResourceAllocation()))
    result.set(HdPerfTokens.textureAllocations, VtValue.create(
      this._textureHandleRegistry.getTextureObjectRegistry().getAllocInfo(),
      VtValueTypes.dictionary))
    return result
  }

  /** resourceRegistry.cpp:243-247. Returns Hgi used to create/destroy GPU
   *  resources. */
  getHgi(): Hgi {
    return this._hgi
  }

  // ------------------------------------------------------------------------
  // Texture allocation API
  // ------------------------------------------------------------------------

  /** resourceRegistry.cpp:1417-1429. Allocate texture handle (encapsulates
   *  texture and sampler object, memory request and callback to shader).
   *
   *  The actual GPU resources will be allocated during the commit phase.
   *  The caller holds the handle and calls its Release() when it drops it
   *  (textureHandle.ts header). */
  allocateTextureHandle(
    textureId: HdStTextureIdentifier,
    textureType: HdStTextureType,
    samplerParams: HdSamplerParameters,
    memoryRequest: number,
    shaderCode: HdStShaderCode | null,
  ): HdStTextureHandle | null {
    return this._textureHandleRegistry.allocateTextureHandle(
      textureId, textureType,
      samplerParams, memoryRequest,
      shaderCode)
  }

  /** resourceRegistry.cpp:1431-1442. Allocate texture object. The caller
   *  calls the object's Release() when it drops it (textureObject.ts
   *  header). */
  allocateTextureObject(
    textureId: HdStTextureIdentifier,
    textureType: HdStTextureType,
  ): HdStTextureObject | null {
    const reg = this._textureHandleRegistry.getTextureObjectRegistry()

    return reg.allocateTextureObject(textureId, textureType)
  }

  /** resourceRegistry.cpp:1405-1415. Allocate a RenderBuffer to be used
   *  only for this Render Graph's execution.
   *
   *  Useful for instances where client code wants a RenderBuffer only
   *  temporarily and doesn't care about its contents before or after
   *  Ex: intermediary RenderBuffers or per Render Graph shadow maps. The
   *  caller Destroy()s the result when it drops it (renderBufferPool.ts). */
  allocateTempRenderBuffer(graphPath: string, fmt: HdFormat,
    dims: GfVec2i | readonly [number, number], multiSampled: boolean,
    depth: boolean): HdStPooledRenderBufferUniquePtr {
    return this._renderBufferPool.allocate(this, graphPath, fmt, dims,
      multiSampled, depth)
  }

  /** resourceRegistry.cpp:1444-1451. Sets how much memory a single texture
   *  can consume in bytes by texture type. */
  setMemoryRequestForTextureType(textureType: HdStTextureType, memoryRequest: number): void {
    this._textureHandleRegistry.setMemoryRequestForTextureType(
      textureType, memoryRequest)
  }

  /** The load phase of the next texture commit (see the header). */
  loadTexturesAsync(): Promise<void> {
    return this._textureHandleRegistry.loadAsync()
  }

  /** Called when a background texture load finishes (see the header). */
  setTextureLoadCompletionCallback(callback: (() => void) | null): void {
    this._textureHandleRegistry.getTextureObjectRegistry()
      .setLoadCompletionCallback(callback)
  }

  /** The texture handle registry (resourceRegistry.h:613-614, a private
   *  member upstream; tests reach it through the texture test driver). */
  _getTextureHandleRegistry(): HdSt_TextureHandleRegistry {
    return this._textureHandleRegistry
  }


  // ------------------------------------------------------------------------
  // BAR allocation API
  // ------------------------------------------------------------------------

  /** resourceRegistry.cpp:252-264 */
  allocateNonUniformBufferArrayRange(role: string, bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArrayRange | null {
    return this._allocateBufferArrayRange(
      this._nonUniformAggregationStrategy,
      this._nonUniformBufferArrayRegistry,
      role,
      bufferSpecs,
      usageHint)
  }

  /** resourceRegistry.cpp:266-280 */
  allocateNonUniformImmutableBufferArrayRange(role: string,
    bufferSpecs: readonly HdBufferSpec[], usageHint: HdBufferArrayUsageHint,
  ): HdBufferArrayRange | null {
    usageHint |= HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsImmutable

    return this._allocateBufferArrayRange(
      this._nonUniformImmutableAggregationStrategy,
      this._nonUniformImmutableBufferArrayRegistry,
      role,
      bufferSpecs,
      usageHint)
  }

  /** resourceRegistry.cpp:282-294 */
  allocateUniformBufferArrayRange(role: string, bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArrayRange | null {
    return this._allocateBufferArrayRange(
      this._uniformUboAggregationStrategy,
      this._uniformUboBufferArrayRegistry,
      role,
      bufferSpecs,
      usageHint)
  }

  /** resourceRegistry.cpp:296-308 */
  allocateShaderStorageBufferArrayRange(role: string, bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArrayRange | null {
    return this._allocateBufferArrayRange(
      this._uniformSsboAggregationStrategy,
      this._uniformSsboBufferArrayRegistry,
      role,
      bufferSpecs,
      usageHint)
  }

  /** resourceRegistry.cpp:310-322 */
  allocateSingleBufferArrayRange(role: string, bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArrayRange | null {
    return this._allocateBufferArrayRange(
      this._singleAggregationStrategy,
      this._singleBufferArrayRegistry,
      role,
      bufferSpecs,
      usageHint)
  }

  // ------------------------------------------------------------------------
  // BAR allocation/migration/update API
  // ------------------------------------------------------------------------

  /** resourceRegistry.cpp:327-341 */
  updateNonUniformBufferArrayRange(role: string, curRange: HdBufferArrayRange | null,
    updatedOrAddedSpecs: readonly HdBufferSpec[], removedSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArrayRange | null {
    return this._updateBufferArrayRange(
      this._nonUniformAggregationStrategy,
      this._nonUniformBufferArrayRegistry,
      role,
      curRange,
      updatedOrAddedSpecs, removedSpecs, usageHint)
  }

  /** resourceRegistry.cpp:343-359 */
  updateNonUniformImmutableBufferArrayRange(role: string, curRange: HdBufferArrayRange | null,
    updatedOrAddedSpecs: readonly HdBufferSpec[], removedSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArrayRange | null {
    usageHint |= HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsImmutable

    return this._updateBufferArrayRange(
      this._nonUniformImmutableAggregationStrategy,
      this._nonUniformImmutableBufferArrayRegistry,
      role,
      curRange,
      updatedOrAddedSpecs, removedSpecs, usageHint)
  }

  /** resourceRegistry.cpp:361-375 */
  updateUniformBufferArrayRange(role: string, curRange: HdBufferArrayRange | null,
    updatedOrAddedSpecs: readonly HdBufferSpec[], removedSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArrayRange | null {
    return this._updateBufferArrayRange(
      this._uniformUboAggregationStrategy,
      this._uniformUboBufferArrayRegistry,
      role,
      curRange,
      updatedOrAddedSpecs, removedSpecs, usageHint)
  }

  /** resourceRegistry.cpp:377-391 */
  updateShaderStorageBufferArrayRange(role: string, curRange: HdBufferArrayRange | null,
    updatedOrAddedSpecs: readonly HdBufferSpec[], removedSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArrayRange | null {
    return this._updateBufferArrayRange(
      this._uniformSsboAggregationStrategy,
      this._uniformSsboBufferArrayRegistry,
      role,
      curRange,
      updatedOrAddedSpecs, removedSpecs, usageHint)
  }

  // ------------------------------------------------------------------------
  // Resource update & computation queuing API
  // ------------------------------------------------------------------------

  /** resourceRegistry.cpp:396-461. Append source data for given range to be
   *  committed later. */
  addSources(range: HdBufferArrayRange | null, sources: HdBufferSource[]): void {
    if (sources.length === 0) {
      TF_RUNTIME_ERROR('sources list is empty')
      return
    }

    // range has to be valid
    if (!(range && range.isValid())) {
      TF_RUNTIME_ERROR('range is null or invalid')
      return
    }

    // Check that each buffer is valid and if not erase it from the list
    // (by moving the item off the end of the vector, as upstream does).
    sources = [...sources]
    let srcNum = 0
    while (srcNum < sources.length) {
      const src = sources[srcNum]!
      if (src.isValid()) {
        if (src.hasPreChainedBuffer()) {
          this.addSource(src.getPreChainedBuffer()!)
        }
        if (!src.isResolved()) {
          this._pendingSourcesToResolve.push([src, range.requiresStaging()])
        } else if (range.requiresStaging()) {
          const size = _GetBufferSourceStagingSize(src)
          if (size > 0) {
            this._pendingStagingSize += size
          }
        }
        ++srcNum
      } else {
        TF_RUNTIME_ERROR(`Source Buffer for ${src.getName()} is invalid`)

        // Move the last item in the vector over this one.
        sources[srcNum] = sources[sources.length - 1]!
        sources.pop()
      }
    }

    // Add sources to commit list; note that if all of the provided
    // sources failed validity, we need to early out.
    if (sources.length > 0) {
      this._pendingSources.push(new _PendingSource(range, sources))
    }
  }

  /** resourceRegistry.cpp:463-536. Append a source data for given range to
   *  be committed later, or with no range, a source data just to be resolved
   *  (used for cpu computations). */
  addSource(range: HdBufferArrayRange | null, source: HdBufferSource | null): void
  addSource(source: HdBufferSource | null): void
  addSource(a: HdBufferArrayRange | HdBufferSource | null, b?: HdBufferSource | null): void {
    if (b === undefined) {
      this._addSource(a as HdBufferSource | null)
      return
    }
    const range = a as HdBufferArrayRange | null
    const source = b
    if (!source || !range) {
      TF_RUNTIME_ERROR('An input pointer is null')
      return
    }

    // range has to be valid
    if (!range.isValid()) {
      TF_RUNTIME_ERROR('range is invalid')
      return
    }

    // Buffer has to be valid
    if (!source.isValid()) {
      TF_RUNTIME_ERROR(`source buffer for ${source.getName()} is invalid`)
      return
    }

    if (source.hasPreChainedBuffer()) {
      this.addSource(source.getPreChainedBuffer()!)
    }

    if (!source.isResolved()) {
      this._pendingSourcesToResolve.push([source, range.requiresStaging()])
    } else if (range.requiresStaging()) {
      const size = _GetBufferSourceStagingSize(source)
      if (size > 0) {
        this._pendingStagingSize += size
      }
    }
    this._pendingSources.push(new _PendingSource(range, [source]))
  }

  /** resourceRegistry.cpp:508-536 */
  private _addSource(source: HdBufferSource | null): void {
    if (!source) {
      TF_RUNTIME_ERROR('source pointer is null')
      return
    }

    // Buffer has to be valid
    if (!source.isValid()) {
      TF_RUNTIME_ERROR(`source buffer for ${source.getName()} is invalid`)
      return
    }

    if (source.hasPreChainedBuffer()) {
      this.addSource(source.getPreChainedBuffer()!)
    }

    if (!source.isResolved()) {
      this._pendingSourcesToResolve.push([source, false])
    }
    this._pendingSources.push(new _PendingSource(null, [source]))
  }

  /** resourceRegistry.cpp:538-549. Append a gpu computation into queue.
   *  The parameter 'range' specifies the destination buffer range, which has
   *  to be allocated by caller of this function. GPU computations will be
   *  executed in the order that they are registered. */
  addComputation(range: HdBufferArrayRange | null, computation: HdStComputation,
    queue: HdStComputeQueue): void {
    if (TF_VERIFY(queue < HdStComputeQueue.HdStComputeQueueCount)) {
      this._pendingComputations[queue]!.push(new _PendingComputation(range, computation))
    }
  }

  // ------------------------------------------------------------------------
  // Dispatch & buffer API
  // ------------------------------------------------------------------------

  /** resourceRegistry.cpp:554-565. Register a buffer allocated with
   *  count * commandNumUints * sizeof(uint32_t) to be used as an indirect
   *  dispatch buffer. */
  registerDispatchBuffer(role: string, count: number, commandNumUints: number): HdStDispatchBuffer {
    const result = new HdStDispatchBuffer(this, role, count, commandNumUints)

    this._dispatchBufferRegistry.push(result)

    return result
  }

  /** resourceRegistry.cpp:567-591. Register a misc buffer resource. */
  registerBufferResource(role: string, tupleType: HdTupleType, bufferUsage: HgiBufferUsage,
    debugName = ''): HdStBufferResource {
    const result = new HdStBufferResource(role, tupleType, /*offset*/ 0, /*stride*/ 0)

    const byteSize = HdDataSizeOfTupleType(tupleType)

    const bufDesc = new HgiBufferDesc()
    bufDesc.usage = bufferUsage
    bufDesc.byteSize = byteSize
    bufDesc.debugName = debugName
    const buffer = this._hgi.createBuffer(bufDesc)

    result.setAllocation(buffer, byteSize)

    this._bufferResourceRegistry.push(result)

    return result
  }

  /** resourceRegistry.cpp:593-605. Remove any entries associated with
   *  expired dispatch buffers. PLATFORM-DIVERGENCE(hd-bar-shared-ptr) */
  garbageCollectDispatchBuffers(): void {
    this._dispatchBufferRegistry = this._dispatchBufferRegistry.filter(ptr => {
      if (ptr._expired) {
        ptr.destroy()
        return false
      }
      return true
    })
  }

  /** resourceRegistry.cpp:607-619. Remove any entries associated with
   *  expired misc buffers. PLATFORM-DIVERGENCE(hd-bar-shared-ptr) */
  garbageCollectBufferResources(): void {
    this._bufferResourceRegistry = this._bufferResourceRegistry.filter(ptr => !ptr._expired)
  }

  // ------------------------------------------------------------------------
  // Instance Registries
  // ------------------------------------------------------------------------

  /** resourceRegistry.cpp:624-630. Topology instancing. */
  registerMeshTopology(id: HdInstanceKeyType): HdInstance<HdSt_MeshTopologySharedPtr> {
    return _Register(id, this._meshTopologyRegistry, HdPerfTokens.instMeshTopology)
  }

  /** resourceRegistry.cpp:632-638 */
  registerBasisCurvesTopology(id: HdInstanceKeyType): HdInstance<HdSt_BasisCurvesTopologySharedPtr> {
    return _Register(id, this._basisCurvesTopologyRegistry,
                     HdPerfTokens.instBasisCurvesTopology)
  }

  /** resourceRegistry.cpp:640-646 */
  registerVertexAdjacencyBuilder(id: HdInstanceKeyType,
  ): HdInstance<HdSt_VertexAdjacencyBuilderSharedPtr> {
    return _Register(id, this._vertexAdjacencyBuilderRegistry,
                     HdPerfTokens.instVertexAdjacency)
  }

  /** resourceRegistry.cpp:648-654. Topology Index buffer array range
   *  instancing. */
  registerMeshIndexRange(id: HdInstanceKeyType, name: string): HdInstance<HdBufferArrayRange> {
    return _Register(id, this._meshTopologyIndexRangeRegistry.get(name),
                     HdPerfTokens.instMeshTopologyRange)
  }

  /** resourceRegistry.cpp:656-662 */
  registerBasisCurvesIndexRange(id: HdInstanceKeyType, name: string): HdInstance<HdBufferArrayRange> {
    return _Register(id, this._basisCurvesTopologyIndexRangeRegistry.get(name),
                     HdPerfTokens.instBasisCurvesTopologyRange)
  }

  /** resourceRegistry.cpp:664-670 */
  registerImplicitPrimsIndexRange(id: HdInstanceKeyType, name: string,
  ): HdInstance<HdBufferArrayRange> {
    return _Register(id, this._implicitPrimsTopologyIndexRangeRegistry.get(name),
                     HdPerfTokens.instImplicitPrimsTopologyRange)
  }

  /** resourceRegistry.cpp:672-678. Primvar array range instancing. */
  registerPrimvarRange(id: HdInstanceKeyType): HdInstance<HdBufferArrayRange> {
    return _Register(id, this._primvarRangeRegistry, HdPerfTokens.instPrimvarRange)
  }

  /** resourceRegistry.cpp:680-686. ExtComputation data array range
   *  instancing. */
  registerExtComputationDataRange(id: HdInstanceKeyType): HdInstance<HdBufferArrayRange> {
    return _Register(id, this._extComputationDataRangeRegistry,
                     HdPerfTokens.instExtComputationDataRange)
  }

  /** resourceRegistry.cpp:688-693. Register a geometric shader. */
  registerGeometricShader(id: HdInstanceKeyType): HdInstance<HdSt_GeometricShaderSharedPtr> {
    return this._geometricShaderRegistry.GetInstance(id)
  }

  /** resourceRegistry.cpp:695-700. Register a render pass shader. */
  registerRenderPassShader(id: HdInstanceKeyType): HdInstance<HdStRenderPassShaderSharedPtr> {
    return this._renderPassShaderRegistry.GetInstance(id)
  }

  /** resourceRegistry.cpp:702-712. Register a GLSL program into the program
   *  registry. */
  registerGLSLProgram(id: HdInstanceKeyType): HdInstance<HdStGLSLProgramSharedPtr> {
    const instance = this._glslProgramRegistry.GetInstance(id)
    if (instance.isFirstInstance()) {
      HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.instGlslProgram)
    }
    return instance
  }

  /** resourceRegistry.cpp:714-719. Register a GLSLFX file. */
  registerGLSLFXFile(id: HdInstanceKeyType): HdInstance<HioGlslfxSharedPtr> {
    return this._glslfxFileRegistry.GetInstance(id)
  }

  /** resourceRegistry.cpp:721-728. Register MaterialX GLSLFX Shader. */
  registerMaterialXShader(id: HdInstanceKeyType): HdInstance<HdStMaterialXShaderPtr> {
    return this._materialXShaderRegistry.GetInstance(id)
  }

  /** resourceRegistry.cpp:730-735. Register a Hgi resource bindings into the
   *  registry. */
  registerResourceBindings(id: HdInstanceKeyType): HdInstance<HgiResourceBindingsSharedPtr> {
    return this._resourceBindingsRegistry.GetInstance(id)
  }

  /** resourceRegistry.cpp:737-742. Register a Hgi graphics pipeline into the
   *  registry. */
  registerGraphicsPipeline(id: HdInstanceKeyType): HdInstance<HgiGraphicsPipelineSharedPtr> {
    return this._graphicsPipelineRegistry.GetInstance(id)
  }

  /** resourceRegistry.cpp:744-749. Register a Hgi compute pipeline into the
   *  registry. */
  registerComputePipeline(id: HdInstanceKeyType): HdInstance<HgiComputePipelineSharedPtr> {
    return this._computePipelineRegistry.GetInstance(id)
  }

  /** resourceRegistry.cpp:751-762. Finds a sub resource registry for the
   *  given identifier if it already exists or creates one by invoking the
   *  provided factory function. */
  findOrCreateSubResourceRegistry(identifier: string,
    factory: () => HdResourceRegistry): HdResourceRegistry {
    let it = this._subResourceRegistries.get(identifier)
    if (!it) {
      it = factory()
      this._subResourceRegistries.set(identifier, it)
    }
    return it
  }

  /** resourceRegistry.cpp:779-786. Returns the global hgi blit command queue
   *  for recording blitting work. The returned object should not be held
   *  onto by the client as it is only valid until the HgiBlitCmds has been
   *  submitted. */
  getGlobalBlitCmds(): HgiBlitCmds {
    if (!this._blitCmds) {
      this._blitCmds = this._hgi.createBlitCmds()
    }
    return this._blitCmds
  }

  /** resourceRegistry.cpp:788-812. Returns the global hgi compute cmd queue
   *  for recording compute work. */
  getGlobalComputeCmds(
    dispatchMethod: HgiComputeDispatch = HgiComputeDispatch.HgiComputeDispatchSerial,
  ): HgiComputeCmds {
    // If the HGI device isn't capable of concurrent dispatch then
    // only specify serial.
    const concurrentDispatchSupported = this._hgi.getCapabilities()?.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsConcurrentDispatch) ?? false
    if (!concurrentDispatchSupported) {
      dispatchMethod = HgiComputeDispatch.HgiComputeDispatchSerial
    }

    if (this._computeCmds && this._computeCmds.getDispatchMethod() !== dispatchMethod) {
      void this.submitComputeWork()
      this._computeCmds = null
    }

    if (!this._computeCmds) {
      const desc = new HgiComputeCmdsDesc()
      desc.dispatchMethod = dispatchMethod
      this._computeCmds = this._hgi.createComputeCmds(desc)
    }

    return this._computeCmds
  }

  /** resourceRegistry.cpp:820-827. Submits blit work queued in global blit
   *  cmds for GPU execution. */
  submitBlitWork(wait: HgiSubmitWaitType = HgiSubmitWaitType.HgiSubmitWaitTypeNoWait): Promise<void> {
    if (this._blitCmds) {
      const done = this._hgi.submitCmds(this._blitCmds, wait)
      this._blitCmds = null
      return done
    }
    return Promise.resolve()
  }

  /** resourceRegistry.cpp:829-836. Submits compute work queued in global
   *  compute cmds for GPU execution. */
  submitComputeWork(wait: HgiSubmitWaitType = HgiSubmitWaitType.HgiSubmitWaitTypeNoWait): Promise<void> {
    if (this._computeCmds) {
      const done = this._hgi.submitCmds(this._computeCmds, wait)
      this._computeCmds = null
      return done
    }
    return Promise.resolve()
  }

  /** resourceRegistry.cpp:814-818. Returns the staging buffer used when
   *  committing data to the GPU. */
  getStagingBuffer(): HdStStagingBuffer {
    return this._stagingBuffer
  }

  // ------------------------------------------------------------------------
  // Unit test API
  // ------------------------------------------------------------------------

  /** resourceRegistry.h:522-525. Set the aggregation strategy for non
   *  uniform parameters (vertex, varying, facevarying). */
  setNonUniformAggregationStrategy(strategy: HdStAggregationStrategy): void {
    this._nonUniformAggregationStrategy = strategy
  }

  /** resourceRegistry.h:530-533 */
  setNonUniformImmutableAggregationStrategy(strategy: HdStAggregationStrategy): void {
    this._nonUniformImmutableAggregationStrategy = strategy
  }

  /** resourceRegistry.h:537-540. Set the aggregation strategy for uniform
   *  (shader globals). */
  setUniformAggregationStrategy(strategy: HdStAggregationStrategy): void {
    this._uniformUboAggregationStrategy = strategy
  }

  /** resourceRegistry.h:544-547. Set the aggregation strategy for SSBO
   *  (uniform primvars). */
  setShaderStorageAggregationStrategy(strategy: HdStAggregationStrategy): void {
    this._uniformSsboAggregationStrategy = strategy
  }

  /** resourceRegistry.h:551-554. Set the aggregation strategy for single
   *  buffers (for nested instancer). */
  setSingleStorageAggregationStrategy(strategy: HdStAggregationStrategy): void {
    this._singleAggregationStrategy = strategy
  }

  /** resourceRegistry.cpp:764-777 operator<< */
  getDebugString(): string {
    let out = 'HdStResourceRegistry :\n'
    out += this._nonUniformBufferArrayRegistry.getDebugString()
    out += this._nonUniformImmutableBufferArrayRegistry.getDebugString()
    out += this._uniformUboBufferArrayRegistry.getDebugString()
    out += this._uniformSsboBufferArrayRegistry.getDebugString()
    out += this._singleBufferArrayRegistry.getDebugString()
    return out
  }

  /** resourceRegistry.cpp:838-853 */
  private _commitTextures(): void {
    const ctx = new HdStShaderCodeResourceContext(this)

    const shaderCodes = this._textureHandleRegistry.commit()

    // Give assoicated HdStShaderCode objects a chance to add buffer
    // sources that rely on texture sampler handles (bindless) or
    // texture metadata (e.g., sampling transform for volume fields).
    for (const shaderCode of shaderCodes) {
      shaderCode.addResourcesFromTextures(ctx)
    }
    this._renderBufferPool.commit()
  }

  /** resourceRegistry.cpp:855-1096 */
  protected override _commit(): void {
    // Process sub resource registries before other resources in
    // case they depend on any resources in this resource registry
    // being committed.
    for (const subResourceRegistry of this._subResourceRegistries.values()) {
      subResourceRegistry.commit()
    }

    // Process textures before resolving buffer sources since
    // some computation buffer sources need meta-data from textures
    // (such as the grid transform for an OpenVDB file) or texture
    // handles (for bindless textures).
    this._commitTextures()

    {
      // 1a. resolve phase:
      // for sources which were added unresolved, loop trying to resolve them.
      let numIterations = 0
      let remainingToResolve: [HdBufferSource, boolean][] = []
      const numBufferSourcesToResolve = this._pendingSourcesToResolve.length

      while (this._pendingSourcesToResolve.length > 0) {
        for (const it of this._pendingSourcesToResolve) {
          const [source, requiresStaging] = it
          // We expect the sources in this list to be unresolved, but if
          // we missed something early out. XXX: coding error?
          if (source.isResolved()) {
            continue
          }
          if (source.resolve()) {
            // We expect the buffer to report itself as resolved if
            // Resolve() completed successfully.
            if (!source.isResolved()) {
              TF_VERIFY(false, `Name = ${source.getName()}`)
            }
            if (requiresStaging) {
              const size = _GetBufferSourceStagingSize(source)
              if (size > 0) {
                this._pendingStagingSize += size
              }
            }
          } else {
            // If the buffer source failed to resolve (e.g. maybe
            // because a dependent source wasn't resolved yet), queue
            // it up for the next trip around.
            remainingToResolve.push(it)
          }
        }
        this._pendingSourcesToResolve = remainingToResolve
        remainingToResolve = []
        if (++numIterations > 100) {
          TF_CODING_ERROR('Too many iterations resolving buffer sources.')
          break
        }
      }
      TF_VERIFY(this._pendingSourcesToResolve.length === 0)
      HdPerfLog.GetInstance().addCounter(HdPerfTokens.bufferSourcesResolved,
                                         numBufferSourcesToResolve)
    }

    {
      // 1b. resize phase:
      // Resize any ranges as needed based on the element count of the first
      // source (per range). We assume that all sources submitted for a range
      // are the same size, and if that assumption isn't true we'll get a
      // warning in CopyData.
      for (const req of this._pendingSources) {
        if (req.range && TF_VERIFY(req.sources.length > 0)) {
          const numElements = req.sources[0]!.getNumElements()
          if (req.range.getNumElements() !== numElements) {
            req.range.resize(numElements)
          }
        }
      }
    }

    {
      // 2. GPU computation prep phase:
      // for each gpu computation, make sure its destination buffer to be
      // allocated.
      for (const compVec of this._pendingComputations) {
        for (const pendingComp of compVec) {
          const comp = pendingComp.computation
          const dstRange = pendingComp.range
          if (dstRange) {
            // ask the size of destination buffer of the gpu computation
            const numElements = comp.getNumOutputElements()
            if (numElements > 0) {
              // We call BufferArray->Reallocate() later so that
              // the reallocation happens only once per BufferArray.
              //
              // if the range is already larger than the current one,
              // leave it as it is (there is a possibility that GPU
              // computation generates less data than it was).
              const currentNumElements = dstRange.getNumElements()
              if (currentNumElements < numElements) {
                dstRange.resize(numElements)
              }
            }
          }
        }
      }
    }

    {
      // 3. reallocation phase:
      this._nonUniformBufferArrayRegistry.reallocateAll(
        this._nonUniformAggregationStrategy)
      this._nonUniformImmutableBufferArrayRegistry.reallocateAll(
        this._nonUniformImmutableAggregationStrategy)
      this._uniformUboBufferArrayRegistry.reallocateAll(
        this._uniformUboAggregationStrategy)
      this._uniformSsboBufferArrayRegistry.reallocateAll(
        this._uniformSsboAggregationStrategy)
      this._singleBufferArrayRegistry.reallocateAll(
        this._singleAggregationStrategy)

      // APPLE METAL: The above creates a set of GPU to GPU copies. However
      // the next phase may create some CPU to GPU copies to the same memory.
      // Ideally we wouldn't have requested the GPU copy at all (as it's
      // redundant) but we did, so we need to ensure these operations are
      // completed before we issue the CPU to GPU updates.
      void this.submitBlitWork(HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)
    }

    {
      // 4. copy phase:
      this._stagingBuffer.resize(this._pendingStagingSize)

      for (const pendingSource of this._pendingSources) {
        const dstRange = pendingSource.range
        // CPU computation may not have a range. (e.g. adjacency)
        if (!dstRange) continue

        // CPU computation may result in an empty buffer source
        // (e.g. GPU quadrangulation table could be empty for quad only
        // mesh)
        if (dstRange.getNumElements() === 0) continue

        for (const src of pendingSource.sources) { // execute copy
          dstRange.copyData(src)
          HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.sourcesCommitted)

          // also copy any chained buffers
          _CopyChainedBuffers(src, dstRange)
        }

        if (TfDebug.isEnabled(HdDebugCodes.HD_BUFFER_ARRAY_RANGE_CLEANED)) {
          TfDebug.msg(HdDebugCodes.HD_BUFFER_ARRAY_RANGE_CLEANED,
            `CLEAN: ${dstRange.debugDump()}\n`)
        }
      }
    }

    {
      // 5. flush phase:
      //
      // flush consolidated / staging buffer updates
      this._nonUniformAggregationStrategy.flush()
      this._nonUniformImmutableAggregationStrategy.flush()
      this._uniformUboAggregationStrategy.flush()
      this._uniformSsboAggregationStrategy.flush()
      this._singleAggregationStrategy.flush()

      this._stagingBuffer.flush()

      // Make sure the writes are visible to computations that follow
      if (this._blitCmds) {
        this._blitCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)
      }
      void this.submitBlitWork()
    }

    {
      // 6. execute GPU computations
      //
      // note: GPU computations have to be executed in the order that
      // they are registered.
      //   e.g. smooth normals -> quadrangulation.
      for (const compVec of this._pendingComputations) {
        for (const pendingComp of compVec) {
          const comp = pendingComp.computation
          const dstRange = pendingComp.range
          comp.Execute(dstRange, this)
          HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.computationsCommitted)
        }

        // Submit Hgi work between each computation queue to feed GPU.
        // Some computations may use BlitCmds (CopyComputation) so we must
        // submit blit and compute work.
        // We must ensure that shader writes are visible to computations
        // in the next queue by setting a memory barrier.
        if (this._blitCmds) {
          this._blitCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)
          void this.submitBlitWork()
        }
        if (this._computeCmds) {
          this._computeCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)
          void this.submitComputeWork()
        }
      }
    }

    // release sources
    this._pendingStagingSize = 0
    this._pendingSources = []
    for (const compVec of this._pendingComputations) {
      const dropped = compVec.splice(0)
      for (const pending of dropped) pending.computation._destroy()
    }

    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.committed)
  }

  /** resourceRegistry.cpp:1121-1218 */
  protected override _garbageCollect(): void {
    // The sequence in which we run garbage collection is significant.
    // We want to clean objects first which might be holding references
    // to other objects which will be subsequently cleaned up.

    for (const subResourceRegistry of this._subResourceRegistries.values()) {
      subResourceRegistry.garbageCollect()
    }

    this.garbageCollectDispatchBuffers()
    this.garbageCollectBufferResources()

    const perfLog = HdPerfLog.GetInstance()
    {
      const count = this._meshTopologyRegistry.garbageCollect()
      perfLog.setCounter(HdPerfTokens.instMeshTopology, count)
    }

    {
      const count = this._basisCurvesTopologyRegistry.garbageCollect()
      perfLog.setCounter(HdPerfTokens.instBasisCurvesTopology, count)
    }

    {
      const count = this._vertexAdjacencyBuilderRegistry.garbageCollect()
      perfLog.setCounter(HdPerfTokens.instVertexAdjacency, count)
    }

    {
      let count = 0
      for (const reg of this._meshTopologyIndexRangeRegistry.values()) {
        count += reg.garbageCollect()
      }
      perfLog.setCounter(HdPerfTokens.instMeshTopologyRange, count)
    }

    {
      let count = 0
      for (const reg of this._basisCurvesTopologyIndexRangeRegistry.values()) {
        count += reg.garbageCollect()
      }
      perfLog.setCounter(HdPerfTokens.instBasisCurvesTopologyRange, count)
    }

    {
      let count = 0
      for (const reg of this._implicitPrimsTopologyIndexRangeRegistry.values()) {
        count += reg.garbageCollect()
      }

      perfLog.setCounter(HdPerfTokens.instImplicitPrimsTopologyRange, count)
    }

    {
      const count = this._primvarRangeRegistry.garbageCollect()
      perfLog.setCounter(HdPerfTokens.instPrimvarRange, count)
    }

    {
      const count = this._extComputationDataRangeRegistry.garbageCollect()
      perfLog.setCounter(HdPerfTokens.instExtComputationDataRange, count)
    }

    // Cleanup Shader registries
    this._geometricShaderRegistry.garbageCollect()
    this._renderPassShaderRegistry.garbageCollect()
    {
      const count = this._glslProgramRegistry.garbageCollect()
      perfLog.setCounter(HdPerfTokens.instGlslProgram, count)
    }
    this._glslfxFileRegistry.garbageCollect()
    this._materialXShaderRegistry.garbageCollect()

    this._textureHandleRegistry.garbageCollect()

    // Cleanup Hgi resources (resourceRegistry.cpp:1098-1119, 1199-1205)
    this._resourceBindingsRegistry.garbageCollect(
      (resourceBindings) => this._hgi.destroyResourceBindings(resourceBindings))
    this._graphicsPipelineRegistry.garbageCollect(
      (graphicsPipeline) => this._hgi.destroyGraphicsPipeline(graphicsPipeline))
    this._computePipelineRegistry.garbageCollect(
      (computePipeline) => this._hgi.destroyComputePipeline(computePipeline))

    // cleanup buffer array
    // buffer array retains weak_ptrs of range. All unused ranges should be
    // deleted (expired) at this point.
    this._nonUniformBufferArrayRegistry.garbageCollect()
    this._nonUniformImmutableBufferArrayRegistry.garbageCollect()
    this._uniformUboBufferArrayRegistry.garbageCollect()
    this._uniformSsboBufferArrayRegistry.garbageCollect()
    this._singleBufferArrayRegistry.garbageCollect()

    // Garbage collection may reallocate buffers, so we must submit blit work.
    void this.submitBlitWork()
  }

  /** resourceRegistry.cpp:1220-1233. Wrapper function for BAR allocation. */
  private _allocateBufferArrayRange(
    strategy: HdStAggregationStrategy,
    bufferArrayRegistry: HdStBufferArrayRegistry,
    role: string,
    bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint,
  ): HdBufferArrayRange | null {
    return bufferArrayRegistry.allocateRange(
      strategy,
      role,
      bufferSpecs,
      usageHint)
  }

  /** resourceRegistry.cpp:1235-1322. Wrapper function for BAR
   *  allocation/reallocation-migration. */
  private _updateBufferArrayRange(
    strategy: HdStAggregationStrategy,
    bufferArrayRegistry: HdStBufferArrayRegistry,
    role: string,
    curRange: HdBufferArrayRange | null,
    updatedOrAddedSpecs: readonly HdBufferSpec[],
    removedSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint,
  ): HdBufferArrayRange | null {
    if (!curRange || !curRange.isValid()) {
      if (removedSpecs.length > 0) {
        TF_CODING_ERROR('Non-empty removed specs during BAR allocation\n')
      }

      // Allocate a new BAR and return it.
      return this._allocateBufferArrayRange(strategy, bufferArrayRegistry, role,
        updatedOrAddedSpecs, usageHint)
    }

    const curBufferSpecs = curRange.getBufferSpecs()

    // Determine if the BAR needs reallocation + migration
    {
      const haveBuffersToUpdate = updatedOrAddedSpecs.length > 0
      const dataUpdateForImmutableBar = curRange.isImmutable() &&
                                        haveBuffersToUpdate
      const usageHintChanged = curRange.getUsageHint() !== usageHint

      const needsMigration =
        dataUpdateForImmutableBar ||
        usageHintChanged ||
        // buffer removal or addition
        removedSpecs.length > 0 ||
        !HdBufferSpec.isSubset(updatedOrAddedSpecs, curBufferSpecs)

      if (!needsMigration) {
        // The existing BAR can be used to queue any updates.
        return curRange
      }
    }

    // Create new BAR, avoiding changing the order of existing specs, to
    // avoid unnecessary invalidation of the shader cache.
    let newBufferSpecs: HdBufferSpec[]
    {
      // Compute eXclusive members of the add and remove lists, because
      // we can't guarantee here that removedSpecs and updatedOrAddedSpecs
      // have no elements in common, and ignoring overlaps is required for
      // order preservation here.
      const specsAddX =
        HdBufferSpec.computeDifference(updatedOrAddedSpecs, removedSpecs)
      const specsRemoveX =
        HdBufferSpec.computeDifference(removedSpecs, updatedOrAddedSpecs)

      newBufferSpecs = HdBufferSpec.computeUnion(
        HdBufferSpec.computeDifference(curBufferSpecs, specsRemoveX),
        specsAddX)
    }

    const newRange = this._allocateBufferArrayRange(
      strategy, bufferArrayRegistry, role, newBufferSpecs, usageHint)

    // ... and migrate relevant buffers that haven't changed.
    // (skip the dirty sources, since new data needs to be copied over)
    const migrateSpecs = HdBufferSpec.computeDifference(
      newBufferSpecs, updatedOrAddedSpecs)
    for (const spec of migrateSpecs) {
      this.addComputation(/*dstRange*/newRange,
                          new HdStCopyComputationGPU(
                            /*src=*/curRange, spec.name),
                          /*CopyComp queue*/HdStComputeQueue.HdStComputeQueueZero)
    }

    // Increment version of the underlying bufferArray to notify
    // all batches pointing to the range to be rebuilt.
    curRange.incrementVersion()

    // XXX: The existing range may no longer used. Currently, the caller is
    // expected to flag garbage collection to reclaim its resources.

    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.bufferArrayRangeMigrated)

    return newRange
  }

  /** resourceRegistry.cpp:1324-1403. Tally resources by key into the given
   *  dictionary. Any additions should be cumulative with the existing key
   *  values. */
  private _tallyResourceAllocation(result: VtDictionary): void {
    let gpuMemoryUsed = HdSt_GetSize(result, HdPerfTokens.gpuMemoryUsed, 0)

    // dispatch buffers
    for (const buffer of this._dispatchBufferRegistry) {
      if (!TF_VERIFY(buffer)) {
        continue
      }

      const role = buffer.getRole()
      const size = buffer.getEntireResource().getSize()

      result.set(role, HdSt_SizeValue(HdSt_GetSize(result, role, 0) + size))

      gpuMemoryUsed += size
    }

    // misc buffers
    for (const buffer of this._bufferResourceRegistry) {
      if (!TF_VERIFY(buffer)) {
        continue
      }

      const role = buffer.getRole()
      const size = buffer.getSize()

      result.set(role, HdSt_SizeValue(HdSt_GetSize(result, role, 0) + size))

      gpuMemoryUsed += size
    }

    // glsl program & ubo allocation
    for (const [, holder] of this._glslProgramRegistry) {
      const program = holder.value
      // In the event of a compile or link error, programs can be null
      if (!program) {
        continue
      }

      const prgHandle = program.getProgram()
      const size = prgHandle.isSet() ? prgHandle.Get()!.getByteSizeOfResource() : 0

      // the role of program and global uniform buffer is always same.
      const role = program.getRole()
      result.set(role, HdSt_SizeValue(HdSt_GetSize(result, role, 0) + size))

      gpuMemoryUsed += size
    }

    // Texture Memory and other texture information
    {
      const textureObjectRegistry =
        this._textureHandleRegistry.getTextureObjectRegistry()

      const textureMemory = textureObjectRegistry.getTotalTextureMemory()
      result.set(HdPerfTokens.textureMemory, HdSt_SizeValue(textureMemory))
      gpuMemoryUsed += textureMemory

      const numTexObjects = textureObjectRegistry.getNumberOfTextureObjects()
      result.set(_perfTokens.numberOfTextureObjects, HdSt_SizeValue(numTexObjects))

      const numTexHandles = this._textureHandleRegistry.getNumberOfTextureHandles()
      result.set(_perfTokens.numberOfTextureHandles, HdSt_SizeValue(numTexHandles))
    }

    result.set(HdPerfTokens.gpuMemoryUsed, HdSt_SizeValue(gpuMemoryUsed))
  }
}

/** VtValue(VtDictionary) */
function VtValueOfDictionary(dict: VtDictionary): VtValue {
  return VtValue.createDictionary(dict)
}

/** resourceRegistry.h:62-63 */
export type HdStResourceRegistrySharedPtr = HdStResourceRegistry
