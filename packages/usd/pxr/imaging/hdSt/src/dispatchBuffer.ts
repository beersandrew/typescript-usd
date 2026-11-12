// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/dispatchBuffer.cpp,
//  pxr/imaging/hdSt/dispatchBuffer.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/dispatchBuffer.{h,cpp} (OpenUSD 26.11.1).
//
// A VBO of a simple array of unsigned integers, used to prepare data on the
// GPU for indirect dispatch (MultiDrawIndirect, DispatchComputeIndirect),
// with interleaved views bound as additional shader inputs
// (dispatchBuffer.h:26-73).
//
// Divergences:
// - CopyData takes a Uint32Array (or number array) for std::vector<uint32_t>.
// - destroy() is the destructor; DebugDump returns its text.
// - Hgi.SubmitCmds returns a promise that CopyData does not wait for, as
//   upstream does not wait.

import {
  HgiBufferCpuToGpuOp,
  HgiBufferDesc,
  HgiBufferUsageBits,
  HgiHandle,
  HgiMemoryBarrierBits,
} from 'typescript-usd/hgi'
import {
  BufferArray as HdBufferArray,
  DebugCodes as HdDebugCodes,
  PerfLog as HdPerfLog,
  Type as HdType,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferArrayUsageHint as HdBufferArrayUsageHint,
  type BufferSource as HdBufferSource,
  type TupleType as HdTupleType,
} from 'typescript-usd/hd'
import { Debug as TfDebug } from 'typescript-usd/tf'
import type { Value as VtValue } from 'typescript-usd/vt'
import { HdStBufferArrayRange } from './bufferArrayRange.ts'
import { HdStBufferResource, type HdStBufferResourceNamedList } from './bufferResource.ts'
import { HdSt_CopyHandle } from './bufferUtils.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStPerfTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

const _unsupported = "Hd_DispatchBufferArrayRange doesn't support this operation"

/** dispatchBuffer.cpp:21-155 */
class Hd_DispatchBufferArrayRange extends HdStBufferArrayRange {
  private readonly _buffer: HdStDispatchBuffer

  /** dispatchBuffer.cpp:25-29 */
  constructor(resourceRegistry: HdStResourceRegistry, buffer: HdStDispatchBuffer) {
    super(resourceRegistry)
    this._buffer = buffer
  }

  /** dispatchBuffer.cpp:32-34 */
  override isValid(): boolean { return true }

  /** dispatchBuffer.cpp:37-39 */
  override isAssigned(): boolean { return this._buffer !== null }

  /** dispatchBuffer.cpp:42-44. Dispatch buffer array range is always
   *  mutable. */
  override isImmutable(): boolean { return false }

  /** dispatchBuffer.cpp:47-49 */
  override requiresStaging(): boolean { return false }

  /** dispatchBuffer.cpp:53-56 */
  resize(_numElements: number): boolean {
    TF_CODING_ERROR(_unsupported)
    return false
  }

  /** dispatchBuffer.cpp:59-61 */
  copyData(_bufferSource: HdBufferSource): void {
    TF_CODING_ERROR(_unsupported)
  }

  /** dispatchBuffer.cpp:64-67 */
  override ReadData(_name: string): VtValue | null {
    TF_CODING_ERROR(_unsupported)
    return null
  }

  /** dispatchBuffer.cpp:71-74 */
  getElementOffset(): number {
    TF_CODING_ERROR(_unsupported)
    return 0
  }

  /** dispatchBuffer.cpp:78-81 */
  getByteOffset(_resourceName: string): number {
    TF_CODING_ERROR(_unsupported)
    return 0
  }

  /** dispatchBuffer.cpp:84-87 */
  getNumElements(): number {
    TF_CODING_ERROR(_unsupported)
    return 0
  }

  /** dispatchBuffer.cpp:90-93 */
  getCapacity(): number {
    TF_CODING_ERROR(_unsupported)
    return 0
  }

  /** dispatchBuffer.cpp:96-99 */
  override getVersion(): number {
    TF_CODING_ERROR(_unsupported)
    return 0
  }

  /** dispatchBuffer.cpp:102-104 */
  override incrementVersion(): void {
    TF_CODING_ERROR(_unsupported)
  }

  /** dispatchBuffer.cpp:107-110 */
  override getMaxNumElements(): number {
    TF_CODING_ERROR(_unsupported)
    return 1
  }

  /** dispatchBuffer.cpp:113-115 */
  override getUsageHint(): HdBufferArrayUsageHint {
    return this._buffer.getUsageHint()
  }

  /** dispatchBuffer.cpp:119-126 */
  getResource(name?: string): HdStBufferResource | null {
    return this._buffer.getResource(name)
  }

  /** dispatchBuffer.cpp:129-131 */
  getResources(): HdStBufferResourceNamedList {
    return this._buffer.getResources()
  }

  /** dispatchBuffer.cpp:134-136 */
  override setBufferArray(_bufferArray: HdBufferArray | null): void {
    TF_CODING_ERROR(_unsupported)
  }

  /** dispatchBuffer.cpp:139-140 */
  override debugDump(): string {
    return ''
  }

  /** dispatchBuffer.cpp:143-145 */
  invalidate(): void {
    TF_CODING_ERROR(_unsupported)
  }

  /** dispatchBuffer.cpp:149-151 */
  protected override _getAggregation(): unknown {
    return this
  }
}

/** dispatchBuffer.h:74-155 */
export class HdStDispatchBuffer extends HdBufferArray {
  private readonly _resourceRegistry: HdStResourceRegistry
  private readonly _count: number
  private readonly _commandNumUints: number
  private readonly _resourceList: HdStBufferResourceNamedList = []
  private readonly _entireResource: HdStBufferResource
  private readonly _bar: HdStBufferArrayRange

  /** PLATFORM-DIVERGENCE(hd-bar-shared-ptr): set by the last holder; the
   *  registry's GarbageCollectDispatchBuffers then drops (and destroys) the
   *  buffer, where upstream tests use_count() == 1. */
  _expired = false

  /** dispatchBuffer.cpp:158-192. commandNumUints is given in how many
   *  integers. */
  constructor(resourceRegistry: HdStResourceRegistry, role: string, count: number,
    commandNumUints: number) {
    super(role, '', 0)
    this._resourceRegistry = resourceRegistry
    this._count = count
    this._commandNumUints = commandNumUints

    const stride = commandNumUints * 4
    const dataSize = count * stride

    // just allocate uninitialized
    const bufDesc = new HgiBufferDesc()
    bufDesc.usage = HgiBufferUsageBits.HgiBufferUsageStorage |
      HgiBufferUsageBits.HgiBufferUsageVertex | HgiBufferUsageBits.HgiBufferUsageIndirect
    bufDesc.byteSize = dataSize
    bufDesc.vertexStride = stride
    bufDesc.debugName = 'Dispatch'
    const buffer = this._resourceRegistry.getHgi().createBuffer(bufDesc)

    // monolithic resource
    this._entireResource = new HdStBufferResource(
      role, { type: HdType.HdTypeInt32, count: 1 }, /*offset=*/0, stride)
    this._entireResource.setAllocation(buffer, dataSize)

    // create a buffer array range, which aggregates all views
    // (will be added by AddBufferResourceView)
    this._bar = new Hd_DispatchBufferArrayRange(resourceRegistry, this)
  }

  /** dispatchBuffer.cpp:194-199 (the destructor) */
  destroy(): void {
    const buffer = this._entireResource.getHandle()
    this._resourceRegistry.getHgi().destroyBuffer(buffer)
    this._entireResource.setAllocation(new HgiHandle(), 0)
  }

  /** dispatchBuffer.cpp:201-221. Update entire buffer data. */
  copyData(data: Uint32Array | readonly number[]): void {
    if (!TF_VERIFY(data.length * 4 === this._entireResource.getSize())) {
      return
    }

    HdPerfLog.GetInstance().incrementCounter(HdStPerfTokens.copyBufferCpuToGpu)

    // Use blit op to copy over the data.
    const hgi = this._resourceRegistry.getHgi()
    const blitCmds = hgi.createBlitCmds()
    const blitOp = new HgiBufferCpuToGpuOp()
    blitOp.byteSize = this._entireResource.getSize()
    blitOp.cpuSourceBuffer = data instanceof Uint32Array ? data : Uint32Array.from(data)
    blitOp.sourceByteOffset = 0
    blitOp.gpuDestinationBuffer = HdSt_CopyHandle(this._entireResource.getHandle())
    blitOp.destinationByteOffset = 0
    blitCmds.copyBufferCpuToGpu(blitOp)
    blitCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)
    void hgi.submitCmds(blitCmds)
  }

  /** dispatchBuffer.cpp:223-235. Add an interleaved view to this buffer. */
  addBufferResourceView(name: string, tupleType: HdTupleType, offset: number): void {
    const stride = this._commandNumUints * 4

    // add a binding view (resource binder iterates and automatically binds)
    const view = this._addResource(name, tupleType, offset, stride)

    // this is just a view, not consuming memory
    view.setAllocation(this._entireResource.getHandle(), /*size=*/0)
  }

  /** dispatchBuffer.h:98. Returns the dispatch count. */
  getCount(): number { return this._count }

  /** dispatchBuffer.h:101. Returns the number of uints in a single draw
   *  command. */
  getCommandNumUints(): number { return this._commandNumUints }

  /** dispatchBuffer.h:105-107. Returns a bar which locates all interleaved
   *  resources of the entire buffer. */
  getBufferArrayRange(): HdStBufferArrayRange {
    return this._bar
  }

  /** dispatchBuffer.h:110-112. Returns entire buffer as a single
   *  HdStBufferResource. */
  getEntireResource(): HdStBufferResource {
    return this._entireResource
  }

  /** dispatchBuffer.cpp:238-243 */
  override garbageCollect(): boolean {
    TF_CODING_ERROR("HdStDispatchBuffer doesn't support this operation")
    return false
  }

  /** dispatchBuffer.cpp:245-251 */
  reallocate(_ranges: HdBufferArrayRange[], _curRangeOwner: HdBufferArray): void {
    TF_CODING_ERROR("HdStDispatchBuffer doesn't support this operation")
  }

  /** dispatchBuffer.cpp:253-257 */
  override debugDump(): string {
    return ''
  }

  /** dispatchBuffer.cpp:259-294. Returns the named GPU resource, or with no
   *  name the single GPU resource. */
  getResource(name?: string): HdStBufferResource | null {
    if (!name) {
      if (this._resourceList.length === 0) return null

      if (TfDebug.isEnabled(HdDebugCodes.HD_SAFE_MODE)) {
        // make sure this buffer array has only one resource.
        const buffer = this._resourceList[0]![1].getHandle()
        for (const [, res] of this._resourceList) {
          if (!res.getHandle().equals(buffer)) {
            TF_CODING_ERROR('GetResource(void) called on' +
                            'HdBufferArray having multiple GPU resources')
          }
        }
      }

      // returns the first item
      return this._resourceList[0]![1]
    }

    // linear search.
    // The number of buffer resources should be small (<10 or so).
    for (const [n, res] of this._resourceList) {
      if (n === name) return res
    }
    return null
  }

  /** dispatchBuffer.h:138 */
  getResources(): HdStBufferResourceNamedList {
    return this._resourceList
  }

  /** dispatchBuffer.cpp:296-318 */
  protected _addResource(name: string, tupleType: HdTupleType, offset: number,
    stride: number): HdStBufferResource {
    if (TfDebug.isEnabled(HdDebugCodes.HD_SAFE_MODE)) {
      // duplication check
      const bufferRes = this.getResource(name)
      if (!TF_VERIFY(!bufferRes)) {
        return bufferRes!
      }
    }

    const bufferRes = new HdStBufferResource(this.getRole(), tupleType, offset, stride)
    this._resourceList.push([name, bufferRes])
    return bufferRes
  }
}

/** dispatchBuffer.h:24 */
export type HdStDispatchBufferSharedPtr = HdStDispatchBuffer
