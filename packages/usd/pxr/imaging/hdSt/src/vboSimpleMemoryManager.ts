// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/vboSimpleMemoryManager.cpp,
//  pxr/imaging/hdSt/vboSimpleMemoryManager.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/vboSimpleMemoryManager.{h,cpp} (OpenUSD 26.11.1).
//
// VBO simple memory manager: one buffer array per range, no aggregation
// (used for nested instancer buffers).
//
// Divergences:
// - The nested classes are the module classes HdStVBOSimpleMemoryManager_*.
// - PLATFORM-DIVERGENCE(hd-bar-shared-ptr): see vboMemoryManager.ts.
// - DebugDump returns its text.

import {
  HgiBufferCpuToGpuOp,
  HgiBufferDesc,
  HgiBufferGpuToGpuOp,
  HgiBufferUsageBits,
  type HgiBufferUsage,
} from 'typescript-usd/hgi'
import {
  BufferArray as HdBufferArray,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  DataSizeOfTupleType as HdDataSizeOfTupleType,
  DebugCodes as HdDebugCodes,
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferArrayUsageHint as HdBufferArrayUsageHint,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
  type TupleType as HdTupleType,
} from 'typescript-usd/hd'
import { Debug as TfDebug } from 'typescript-usd/tf'
import type { Dictionary as VtDictionary, Value as VtValue } from 'typescript-usd/vt'
import { HdStBufferArrayRange } from './bufferArrayRange.ts'
import { HdStBufferResource, type HdStBufferResourceNamedList } from './bufferResource.ts'
import { HdStReadBuffer, HdSt_CopyHandle } from './bufferUtils.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdStAggregationStrategy, HdSt_TallyResources, type HdStAggregationId,
} from './strategyBase.ts'
import { HdStPerfTokens } from './tokens.ts'
import { HdSt_MaxBufferBytes } from './vboMemoryManager.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** vboSimpleMemoryManager.h:72-194 */
export class HdStVBOSimpleMemoryManager_SimpleBufferArrayRange extends HdStBufferArrayRange {
  private _simpleBufferArray: HdStVBOSimpleMemoryManager_SimpleBufferArray | null = null
  private _numElements = 0

  /** vboSimpleMemoryManager.h:76-80 */
  constructor(resourceRegistry: HdStResourceRegistry) {
    super(resourceRegistry)
  }

  /** vboSimpleMemoryManager.h:83-85 */
  override isValid(): boolean {
    return this._simpleBufferArray !== null
  }

  /** vboSimpleMemoryManager.cpp:411-415 */
  override isAssigned(): boolean {
    return this._simpleBufferArray !== null
  }

  /** vboSimpleMemoryManager.cpp:417-422 */
  override isImmutable(): boolean {
    return this._simpleBufferArray !== null && this._simpleBufferArray.isImmutable()
  }

  /** vboSimpleMemoryManager.cpp:424-428 */
  override requiresStaging(): boolean {
    return false
  }

  /** vboSimpleMemoryManager.h:99-102 */
  resize(numElements: number): boolean {
    this._numElements = numElements
    return this._simpleBufferArray!.resize(numElements)
  }

  /** vboSimpleMemoryManager.cpp:430-473 */
  copyData(bufferSource: HdBufferSource): void {
    if (!TF_VERIFY(this._simpleBufferArray)) return

    const VBO = this._simpleBufferArray!.getResource(bufferSource.getName())

    if (!VBO || !VBO.getHandle().isSet()) {
      TF_CODING_ERROR(`VBO doesn't exist for ${bufferSource.getName()}`)
      return
    }

    const bytesPerElement = HdDataSizeOfTupleType(VBO.getTupleType())
    // overrun check. for graceful handling of erroneous assets,
    // issue warning here and continue to copy for the valid range.
    const dstSize = this._numElements * bytesPerElement
    let srcSize = bufferSource.getNumElements() *
      HdDataSizeOfTupleType(bufferSource.getTupleType())
    if (srcSize > dstSize) {
      TF_WARN(`${bufferSource.getName()}: size ${srcSize} is larger than the range (${dstSize})`)
      srcSize = dstSize
    }

    HdPerfLog.GetInstance().incrementCounter(HdStPerfTokens.copyBufferCpuToGpu)

    const blitOp = new HgiBufferCpuToGpuOp()
    blitOp.cpuSourceBuffer = bufferSource.getData()
    blitOp.gpuDestinationBuffer = HdSt_CopyHandle(VBO.getHandle())

    blitOp.sourceByteOffset = 0
    blitOp.byteSize = srcSize
    blitOp.destinationByteOffset = 0

    const blitCmds = this.getResourceRegistry().getGlobalBlitCmds()
    blitCmds.copyBufferCpuToGpu(blitOp)
  }

  /** vboSimpleMemoryManager.cpp:475-498 */
  override ReadData(name: string): VtValue | null {
    if (!TF_VERIFY(this._simpleBufferArray)) return null

    const VBO = this._simpleBufferArray!.getResource(name)

    if (!VBO || (!VBO.getHandle().isSet() && this._numElements > 0)) {
      TF_CODING_ERROR(`VBO doesn't exist for ${name}`)
      return null
    }

    return HdStReadBuffer(VBO.getHandle(),
                          VBO.getTupleType(),
                          /*offset=*/0,
                          /*stride=*/0,  // not interleaved.
                          this._numElements,
                          /*elementStride=*/0,
                          this.getResourceRegistry())
  }

  /** vboSimpleMemoryManager.h:114-116 */
  getElementOffset(): number {
    return 0
  }

  /** vboSimpleMemoryManager.h:120-123 */
  getByteOffset(_resourceName: string): number {
    return 0
  }

  /** vboSimpleMemoryManager.h:126-128 */
  getNumElements(): number {
    return this._numElements
  }

  /** vboSimpleMemoryManager.h:131-133 */
  getCapacity(): number {
    return this._simpleBufferArray!.getCapacity()
  }

  /** vboSimpleMemoryManager.h:136-138 */
  override getVersion(): number {
    return this._simpleBufferArray!.getVersion()
  }

  /** vboSimpleMemoryManager.h:141-143 */
  override incrementVersion(): void {
    this._simpleBufferArray!.incrementVersion()
  }

  /** vboSimpleMemoryManager.cpp:500-504 */
  override getMaxNumElements(): number {
    return this._simpleBufferArray!.getMaxNumElements()
  }

  /** vboSimpleMemoryManager.cpp:506-514 */
  override getUsageHint(): HdBufferArrayUsageHint {
    if (!TF_VERIFY(this._simpleBufferArray)) {
      return 0
    }
    return this._simpleBufferArray!.getUsageHint()
  }

  /** vboSimpleMemoryManager.cpp:516-529 */
  getResource(name?: string): HdStBufferResource | null {
    if (!TF_VERIFY(this._simpleBufferArray)) return null
    return this._simpleBufferArray!.getResource(name)
  }

  /** vboSimpleMemoryManager.cpp:531-539 */
  getResources(): HdStBufferResourceNamedList {
    if (!TF_VERIFY(this._simpleBufferArray)) {
      return []
    }
    return this._simpleBufferArray!.getResources()
  }

  /** vboSimpleMemoryManager.cpp:541-545 */
  override setBufferArray(bufferArray: HdBufferArray | null): void {
    this._simpleBufferArray = bufferArray as HdStVBOSimpleMemoryManager_SimpleBufferArray | null
  }

  /** vboSimpleMemoryManager.cpp:547-552 */
  override debugDump(): string {
    return `[SimpleBAR] numElements = ${this._numElements}\n`
  }

  /** vboSimpleMemoryManager.h:175-177 */
  invalidate(): void {
    this._simpleBufferArray = null
  }

  /** vboSimpleMemoryManager.cpp:554-558 */
  protected override _getAggregation(): unknown {
    return this._simpleBufferArray
  }
}

/** vboSimpleMemoryManager.h:207-291 */
export class HdStVBOSimpleMemoryManager_SimpleBufferArray extends HdBufferArray {
  private readonly _resourceRegistry: HdStResourceRegistry
  private _capacity = 0
  private _maxBytesPerElement = 0
  private _bufferUsage: HgiBufferUsage = 0
  private readonly _resourceList: HdStBufferResourceNamedList = []

  /** vboSimpleMemoryManager.cpp:122-164 */
  constructor(
    resourceRegistry: HdStResourceRegistry,
    role: string,
    bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint,
  ) {
    super(role, '', usageHint)
    this._resourceRegistry = resourceRegistry

    // populate BufferResources
    for (const it of bufferSpecs) {
      const stride = HdDataSizeOfTupleType(it.tupleType)
      this._addResource(it.name, it.tupleType, /*offset=*/0, stride)
    }

    this._setMaxNumRanges(1)

    // compute max bytes / elements
    for (const [, bres] of this.getResources()) {
      this._maxBytesPerElement = Math.max(
        this._maxBytesPerElement,
        HdDataSizeOfTupleType(bres.getTupleType()))
    }

    if (usageHint & HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsUniform) {
      this._bufferUsage |= HgiBufferUsageBits.HgiBufferUsageUniform
    }
    if (usageHint & HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage) {
      this._bufferUsage |= HgiBufferUsageBits.HgiBufferUsageStorage
    }
    if (usageHint & HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex) {
      this._bufferUsage |= HgiBufferUsageBits.HgiBufferUsageVertex
    }
    if (this._bufferUsage === 0) {
      TF_CODING_ERROR('Buffer usage was not specified!')
    }
  }

  /** vboSimpleMemoryManager.cpp:166-187 */
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

  /** vboSimpleMemoryManager.cpp:189-200 (the destructor). Invalidate buffer
   *  array range (the range may still be held by drawItems). */
  destroy(): void {
    const range = this._getRangeSharedPtr()
    if (range) {
      range.invalidate()
    }
  }

  /** vboSimpleMemoryManager.cpp:203-216 */
  override garbageCollect(): boolean {
    // no range referring this buffer = empty
    if (this.getRangeCount() > 0 && this.getRange(0)!._expired) {
      this._deallocateResources()
      HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.garbageCollectedVbo)
      return true
    }
    return false
  }

  /** vboSimpleMemoryManager.cpp:218-223 */
  override debugDump(): string {
    return `  HdStVBOSimpleMemoryManager  total capacity = ${this._capacity}\n`
  }

  /** vboSimpleMemoryManager.cpp:225-241. Set to resize buffers. Actual
   *  reallocation happens on next call to Reallocate. */
  resize(numElements: number): boolean {
    // see the comment in
    // HdStVBOMemoryManager::_StripedBufferArrayRange::Resize(int numElements)
    // this change is for the unit test consistency.
    //
    // if (_capacity < numElements) {
    if (this._capacity !== numElements) {
      this._needsReallocation = true
      return true
    }
    return false
  }

  /** vboSimpleMemoryManager.cpp:243-339 */
  reallocate(ranges: HdBufferArrayRange[], curRangeOwner: HdBufferArray): void {
    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.vboRelocated)

    if (!TF_VERIFY(curRangeOwner === this)) {
      TF_CODING_ERROR("HdStVBOSimpleMemoryManager can't reassign ranges")
      return
    }

    if (ranges.length > 1) {
      TF_CODING_ERROR("HdStVBOSimpleMemoryManager can't take multiple ranges")
      return
    }
    this._setRangeList(ranges)

    const range = this._getRangeSharedPtr()

    if (!range) {
      TF_CODING_ERROR('_SimpleBufferArrayRange expired unexpectedly.')
      return
    }

    const numElements = range.getNumElements()

    // Use blit work to record resource copy commands.
    const hgi = this._resourceRegistry.getHgi()
    const blitCmds = this._resourceRegistry.getGlobalBlitCmds()
    blitCmds.pushDebugGroup('HdStVBOSimpleMemoryManager::_SimpleBufferArray::Reallocate')

    for (const [name, bres] of this.getResources()) {
      const bytesPerElement = HdDataSizeOfTupleType(bres.getTupleType())
      let bufferSize = bytesPerElement * numElements

      // Clamp for 0-sized buffers, Metal doesn't support them.
      bufferSize = Math.max(bufferSize, 256)

      const oldBuf = bres.getHandle()

      const bufDesc = new HgiBufferDesc()
      bufDesc.byteSize = bufferSize
      bufDesc.usage = this._bufferUsage
      bufDesc.vertexStride = bytesPerElement
      bufDesc.debugName = name
      const newBuf = hgi.createBuffer(bufDesc)

      // copy the range. There are three cases:
      //
      // 1. src length (capacity) == dst length (numElements)
      //   Copy the entire range
      //
      // 2. src length < dst length
      //   Enlarging the range. This typically happens when
      //   applying quadrangulation/subdivision to populate
      //   additional data at the end of source data.
      //
      // 3. src length > dst length
      //   Shrinking the range. When the garbage collection
      //   truncates ranges.
      //
      const oldSize = range.getCapacity()
      const newSize = range.getNumElements()
      const copySize = Math.min(oldSize, newSize) * bytesPerElement
      if (copySize > 0 && oldBuf.isSet()) {
        HdPerfLog.GetInstance().incrementCounter(HdStPerfTokens.copyBufferGpuToGpu)

        const blitOp = new HgiBufferGpuToGpuOp()
        blitOp.gpuSourceBuffer = HdSt_CopyHandle(oldBuf)
        blitOp.gpuDestinationBuffer = HdSt_CopyHandle(newBuf)
        blitOp.byteSize = copySize
        blitCmds.copyBufferGpuToGpu(blitOp)
      }

      // delete old buffer
      if (oldBuf.isSet()) {
        hgi.destroyBuffer(oldBuf)
      }

      bres.setAllocation(newBuf, bufferSize)
    }

    blitCmds.popDebugGroup()

    this._capacity = numElements
    this._needsReallocation = false

    // increment version to rebuild dispatch buffers.
    this.incrementVersion()
  }

  /** vboSimpleMemoryManager.cpp:341-349 */
  override getMaxNumElements(): number {
    return Math.floor(HdSt_MaxBufferBytes(this._resourceRegistry) / this._maxBytesPerElement)
  }

  /** vboSimpleMemoryManager.h:245-247 */
  getCapacity(): number {
    return this._capacity
  }

  /** vboSimpleMemoryManager.cpp:351-358 */
  protected _deallocateResources(): void {
    const hgi = this._resourceRegistry.getHgi()
    for (const [, res] of this.getResources()) {
      hgi.destroyBuffer(res.getHandle())
    }
  }

  /** vboSimpleMemoryManager.cpp:360-395 */
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

  /** vboSimpleMemoryManager.h:262 */
  getResources(): HdStBufferResourceNamedList {
    return this._resourceList
  }

  /** vboSimpleMemoryManager.cpp:397-406 */
  getBufferSpecs(): HdBufferSpec[] {
    return this._resourceList.map(([name, res]) => ({ name, tupleType: res.getTupleType() }))
  }

  /** vboSimpleMemoryManager.h:286-290 */
  private _getRangeSharedPtr(): HdStVBOSimpleMemoryManager_SimpleBufferArrayRange | null {
    if (this.getRangeCount() === 0) return null
    const range = this.getRange(0)
    return range && !range._expired
      ? range as HdStVBOSimpleMemoryManager_SimpleBufferArrayRange : null
  }
}

/** vboSimpleMemoryManager.cpp:61-62 */
let _simpleAggregationId = 0

/** vboSimpleMemoryManager.h:28-294. VBO simple memory manager. */
export class HdStVBOSimpleMemoryManager extends HdStAggregationStrategy {
  static readonly _SimpleBufferArray = HdStVBOSimpleMemoryManager_SimpleBufferArray
  static readonly _SimpleBufferArrayRange = HdStVBOSimpleMemoryManager_SimpleBufferArrayRange

  private readonly _resourceRegistry: HdStResourceRegistry

  constructor(resourceRegistry: HdStResourceRegistry) {
    super()
    this._resourceRegistry = resourceRegistry
  }

  /** vboSimpleMemoryManager.cpp:39-47 */
  createBufferArray(role: string, bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArray {
    return new HdStVBOSimpleMemoryManager_SimpleBufferArray(
      this._resourceRegistry, role, bufferSpecs, usageHint)
  }

  /** vboSimpleMemoryManager.cpp:49-54 */
  createBufferArrayRange(): HdBufferArrayRange {
    return new HdStVBOSimpleMemoryManager_SimpleBufferArrayRange(this._resourceRegistry)
  }

  /** vboSimpleMemoryManager.cpp:56-67. Always returns a different value. */
  computeAggregationId(_bufferSpecs: readonly HdBufferSpec[],
    _usageHint: HdBufferArrayUsageHint): HdStAggregationId {
    return String(_simpleAggregationId++)
  }

  /** vboSimpleMemoryManager.cpp:69-77 */
  getBufferSpecs(bufferArray: HdBufferArray): HdBufferSpec[] {
    return (bufferArray as HdStVBOSimpleMemoryManager_SimpleBufferArray).getBufferSpecs()
  }

  /** vboSimpleMemoryManager.cpp:79-117 */
  getResourceAllocation(bufferArray: HdBufferArray, result: VtDictionary): number {
    // XXX Reallocate inserts an empty (invalid) handle for empty buffers.
    return HdSt_TallyResources(
      (bufferArray as HdStVBOSimpleMemoryManager_SimpleBufferArray).getResources(), result, true)
  }
}
