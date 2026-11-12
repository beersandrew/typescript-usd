// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/vboMemoryManager.cpp,
//  pxr/imaging/hdSt/vboMemoryManager.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/vboMemoryManager.{h,cpp} (OpenUSD 26.11.1).
//
// VBO memory manager: non-interleaved, non-uniform buffer arrays. Each
// channel is its own GPU buffer; ranges are packed tightly by element.
//
//    vec3 | pos.x (prim0)  ||  pos.x (prim1)  || ... |
//    vec4 | color.r (prim0)||  color.r (prim1)|| ... |
//          ^--range0.numElements--^^--range1.numElements--^
//
// Divergences:
// - The nested classes are the module classes HdStVBOMemoryManager_*
//   (also reachable as HdStVBOMemoryManager._StripedBufferArray[Range]).
// - PLATFORM-DIVERGENCE(hd-bar-shared-ptr): the range destructor runs when the
//   range is expired (_OnExpired); the buffer array destructor is destroy().
// - DebugDump returns its text.

import {
  HgiBufferCpuToGpuOp,
  HgiBufferDesc,
  HgiBufferUsageBits,
  HgiHandle,
  type HgiBufferHandle,
  type HgiBufferUsage,
} from 'typescript-usd/hgi'
import {
  BufferArray as HdBufferArray,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  DataSizeOfTupleType as HdDataSizeOfTupleType,
  DebugCodes as HdDebugCodes,
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  TupleTypeEquals as HdTupleTypeEquals,
  Type as HdType,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferArrayUsageHint as HdBufferArrayUsageHint,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
  type TupleType as HdTupleType,
} from 'typescript-usd/hd'
import { Debug as TfDebug, TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import type { Dictionary as VtDictionary, Value as VtValue } from 'typescript-usd/vt'
import { HdStBufferArrayRange } from './bufferArrayRange.ts'
import { HdStBufferResource, type HdStBufferResourceNamedList } from './bufferResource.ts'
import { HdStBufferRelocator, HdStReadBuffer, HdSt_CopyHandle } from './bufferUtils.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdStAggregationStrategy, HdSt_AggregationIdOf, HdSt_TallyResources,
  type HdStAggregationId,
} from './strategyBase.ts'
import { HdStPerfTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** vboMemoryManager.cpp:38-39 */
export const HD_MAX_VBO_SIZE = new TfEnvSetting<number>('HD_MAX_VBO_SIZE', 1 * 1024 * 1024 * 1024,
  'Maximum aggregated VBO size')

/** The storage limit GetMaxNumElements divides (vboMemoryManager.cpp:441-448). */
export function HdSt_MaxBufferBytes(resourceRegistry: HdStResourceRegistry): number {
  const vboMaxSize = TfGetEnvSetting(HD_MAX_VBO_SIZE)
  const caps = resourceRegistry.getHgi().getCapabilities()
  const storageMaxSize = caps ? caps.getMaxShaderStorageBlockSize() : vboMaxSize
  return Math.min(storageMaxSize, vboMaxSize)
}

function _TupleTypeName(t: HdTupleType): string {
  return `${HdType[t.type]} (${t.type}) x ${t.count}`
}

/** vboMemoryManager.h:77-217 */
export class HdStVBOMemoryManager_StripedBufferArrayRange extends HdStBufferArrayRange {
  private _stripedBufferArray: HdStVBOMemoryManager_StripedBufferArray | null = null
  private _elementOffset = 0
  private _numElements = 0
  private _capacity = 0

  /** vboMemoryManager.h:81-88 */
  constructor(resourceRegistry: HdStResourceRegistry) {
    super(resourceRegistry)
  }

  /** vboMemoryManager.cpp:520-535 (the destructor). Notify that hosting
   *  buffer array needs to be garbage collected. */
  protected override _onExpired(): void {
    if (this._stripedBufferArray) {
      this._stripedBufferArray.setNeedsCompaction()

      // notify source bufferArray to bump the version so that
      // drawbatches to be rebuilt.
      // Also note that the buffer migration takes place only in
      // this StripedBufferArray, not in other InterleavedVBO/SimpleVBO.
      this._stripedBufferArray.incrementVersion()
    }
  }

  /** vboMemoryManager.h:95-97 */
  override isValid(): boolean {
    return this._stripedBufferArray !== null
  }

  /** vboMemoryManager.cpp:538-542 */
  override isAssigned(): boolean {
    return this._stripedBufferArray !== null
  }

  /** vboMemoryManager.cpp:544-549 */
  override isImmutable(): boolean {
    return this._stripedBufferArray !== null &&
      this._stripedBufferArray.isImmutable()
  }

  /** vboMemoryManager.cpp:551-555 */
  override requiresStaging(): boolean {
    return true
  }

  /** vboMemoryManager.cpp:557-623 */
  resize(numElements: number): boolean {
    if (!TF_VERIFY(this._stripedBufferArray)) return false

    let needsReallocation = false

    // XXX: varying topology points fix (bug 114080): reallocate whenever
    // numElements changes in an aggregated buffer
    // (vboMemoryManager.cpp:567-604).
    if (this._capacity !== numElements) {
      const numMaxElements = this.getMaxNumElements()

      if (numElements > numMaxElements) {
        TF_WARN(`Attempting to resize the BAR with 0x${numElements.toString(16)} ` +
          'elements when the max number of elements in the buffer array is ' +
          `0x${numMaxElements.toString(16)}. Clamping BAR size to the latter.`)

        numElements = numMaxElements
      }
      this._stripedBufferArray!.setNeedsReallocation()
      needsReallocation = true
    }

    this._numElements = numElements
    return needsReallocation
  }

  /** vboMemoryManager.cpp:625-684 */
  copyData(bufferSource: HdBufferSource): void {
    if (!TF_VERIFY(this._stripedBufferArray)) return

    const VBO = this._stripedBufferArray!.getResource(bufferSource.getName())

    if (!TF_VERIFY(VBO && VBO.getHandle().isSet(),
                   `VBO doesn't exist for ${bufferSource.getName()}`)) {
      return
    }

    // datatype of bufferSource has to match with bufferResource
    if (!TF_VERIFY(HdTupleTypeEquals(bufferSource.getTupleType(), VBO!.getTupleType()),
                   `'${bufferSource.getName()}': ` +
                   `(${_TupleTypeName(bufferSource.getTupleType())}) != ` +
                   `(${_TupleTypeName(VBO!.getTupleType())})\n`)) {
      return
    }

    const bytesPerElement = HdDataSizeOfTupleType(VBO!.getTupleType())

    // overrun check. for graceful handling of erroneous assets,
    // issue warning here and continue to copy for the valid range.
    const dstSize = this._numElements * bytesPerElement
    let srcSize = bufferSource.getNumElements() *
      HdDataSizeOfTupleType(bufferSource.getTupleType())
    if (srcSize > dstSize) {
      TF_WARN(`${bufferSource.getName()}: size ${srcSize} is larger than the range (${dstSize})`)
      srcSize = dstSize
    }
    const vboOffset = bytesPerElement * this._elementOffset

    HdPerfLog.GetInstance().incrementCounter(HdStPerfTokens.copyBufferCpuToGpu)

    const blitOp = new HgiBufferCpuToGpuOp()
    blitOp.cpuSourceBuffer = bufferSource.getData()
    blitOp.gpuDestinationBuffer = HdSt_CopyHandle(VBO!.getHandle())

    blitOp.sourceByteOffset = 0
    blitOp.byteSize = srcSize
    blitOp.destinationByteOffset = vboOffset

    const stagingBuffer = this.getResourceRegistry().getStagingBuffer()
    stagingBuffer.stageCopy(blitOp)
  }

  /** vboMemoryManager.cpp:686-701 */
  getByteOffset(resourceName: string): number {
    if (!TF_VERIFY(this._stripedBufferArray)) return 0
    const VBO = this._stripedBufferArray!.getResource(resourceName)

    if (!VBO || (!VBO.getHandle().isSet() && this._numElements > 0)) {
      TF_CODING_ERROR(`VBO doesn't exist for ${resourceName}`)
      return 0
    }

    return this._getByteOffset(VBO)
  }

  /** vboMemoryManager.cpp:703-731 */
  override ReadData(name: string): VtValue | null {
    if (!TF_VERIFY(this._stripedBufferArray)) return null

    const VBO = this._stripedBufferArray!.getResource(name)

    if (!VBO || (!VBO.getHandle().isSet() && this._numElements > 0)) {
      TF_CODING_ERROR(`VBO doesn't exist for ${name}`)
      return null
    }

    const vboOffset = this._getByteOffset(VBO)

    return HdStReadBuffer(VBO.getHandle(),
                          VBO.getTupleType(),
                          vboOffset,
                          /*stride=*/0, // not interleaved.
                          this._numElements,
                          /*elementStride=*/0,
                          this.getResourceRegistry())
  }

  /** vboMemoryManager.h:123-125 */
  getElementOffset(): number {
    return this._elementOffset
  }

  /** vboMemoryManager.h:132-134 */
  getNumElements(): number {
    return this._numElements
  }

  /** vboMemoryManager.h:137-139 */
  override getVersion(): number {
    return this._stripedBufferArray!.getVersion()
  }

  /** vboMemoryManager.h:142-144 */
  override incrementVersion(): void {
    this._stripedBufferArray!.incrementVersion()
  }

  /** vboMemoryManager.cpp:733-737 */
  override getMaxNumElements(): number {
    return this._stripedBufferArray!.getMaxNumElements()
  }

  /** vboMemoryManager.cpp:739-747 */
  override getUsageHint(): HdBufferArrayUsageHint {
    if (!TF_VERIFY(this._stripedBufferArray)) {
      return 0
    }
    return this._stripedBufferArray!.getUsageHint()
  }

  /** vboMemoryManager.cpp:750-764 */
  getResource(name?: string): HdStBufferResource | null {
    if (!TF_VERIFY(this._stripedBufferArray)) return null
    return this._stripedBufferArray!.getResource(name)
  }

  /** vboMemoryManager.cpp:766-774 */
  getResources(): HdStBufferResourceNamedList {
    if (!TF_VERIFY(this._stripedBufferArray)) {
      return []
    }
    return this._stripedBufferArray!.getResources()
  }

  /** vboMemoryManager.cpp:776-780 */
  override setBufferArray(bufferArray: HdBufferArray | null): void {
    this._stripedBufferArray = bufferArray as HdStVBOMemoryManager_StripedBufferArray | null
  }

  /** vboMemoryManager.cpp:782-789 */
  override debugDump(): string {
    return `[StripedBAR] offset = ${this._elementOffset}, ` +
      `numElements = ${this._numElements}, capacity = ${this._capacity}\n`
  }

  /** vboMemoryManager.h:176-178 */
  setElementOffset(offset: number): void {
    this._elementOffset = offset
  }

  /** vboMemoryManager.h:181-183 */
  setNumElements(numElements: number): void {
    this._numElements = numElements
  }

  /** vboMemoryManager.h:186-188 */
  getCapacity(): number {
    return this._capacity
  }

  /** vboMemoryManager.h:191-193 */
  setCapacity(capacity: number): void {
    this._capacity = capacity
  }

  /** vboMemoryManager.h:196-198 */
  invalidate(): void {
    this._stripedBufferArray = null
  }

  /** vboMemoryManager.cpp:791-795 */
  protected override _getAggregation(): unknown {
    return this._stripedBufferArray
  }

  /** vboMemoryManager.cpp:797-802 */
  private _getByteOffset(resource: HdStBufferResource): number {
    return HdDataSizeOfTupleType(resource.getTupleType()) * this._elementOffset
  }
}

/** vboMemoryManager.h:227-316 */
export class HdStVBOMemoryManager_StripedBufferArray extends HdBufferArray {
  private readonly _resourceRegistry: HdStResourceRegistry
  private _needsCompaction = false
  private _totalCapacity = 0
  private _maxBytesPerElement = 0
  private _bufferUsage: HgiBufferUsage = 0
  private readonly _resourceList: HdStBufferResourceNamedList = []

  /** vboMemoryManager.cpp:129-202 */
  constructor(
    resourceRegistry: HdStResourceRegistry,
    role: string,
    bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint,
  ) {
    super(role, HdPerfTokens.garbageCollectedVbo, usageHint)
    this._resourceRegistry = resourceRegistry

    // populate BufferResources
    for (const it of bufferSpecs) {
      const stride = HdDataSizeOfTupleType(it.tupleType)
      this._addResource(it.name, it.tupleType, /*offset*/0, stride)
    }

    // VBO Memory Manage supports an effectivly limitless set of ranges
    this._setMaxNumRanges(Number.MAX_SAFE_INTEGER)

    // compute max bytes / elements
    for (const [, res] of this.getResources()) {
      this._maxBytesPerElement = Math.max(
        this._maxBytesPerElement,
        HdDataSizeOfTupleType(res.getTupleType()))
    }

    // GetMaxNumElements() will crash with a divide by 0
    // error if _maxBytesPerElement is 0.
    if (!TF_VERIFY(this._maxBytesPerElement !== 0)) {
      this._maxBytesPerElement = 1
    }

    if (usageHint & HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage) {
      this._bufferUsage |= HgiBufferUsageBits.HgiBufferUsageStorage
    }
    if (usageHint & HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsVertex) {
      this._bufferUsage |= HgiBufferUsageBits.HgiBufferUsageVertex
    }
    if (usageHint & HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsIndex) {
      this._bufferUsage |= HgiBufferUsageBits.HgiBufferUsageIndex32
    }
    if (this._bufferUsage === 0) {
      TF_CODING_ERROR('Buffer usage was not specified!')
    }
  }

  /** vboMemoryManager.cpp:204-224 */
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

  /** vboMemoryManager.cpp:226-241 (the destructor). Invalidate buffer array
   *  ranges in range list (these ranges may still be held by drawItems). */
  destroy(): void {
    const rangeCount = this.getRangeCount()
    for (let rangeIdx = 0; rangeIdx < rangeCount; ++rangeIdx) {
      const range = this._getRangeSharedPtr(rangeIdx)
      if (range) {
        range.invalidate()
      }
    }
  }

  /** vboMemoryManager.cpp:244-269 */
  override garbageCollect(): boolean {
    if (this._needsCompaction) {
      this.removeUnusedRanges()

      const ranges: HdBufferArrayRange[] = []
      const rangeCount = this.getRangeCount()
      for (let i = 0; i < rangeCount; ++i) {
        const range = this.getRange(i)
        if (range && !range._expired) ranges.push(range)
      }
      this.reallocate(ranges, this)
    }

    if (this.getRangeCount() === 0) {
      this._deallocateResources()
      return true
    }
    return false
  }

  /** vboMemoryManager.cpp:271-428 */
  reallocate(ranges: HdBufferArrayRange[], curRangeOwner: HdBufferArray): void {
    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.vboRelocated)

    const curRangeOwner_ = curRangeOwner as HdStVBOMemoryManager_StripedBufferArray

    if (!TF_VERIFY(this.getResources().length ===
                   curRangeOwner_.getResources().length)) {
      TF_CODING_ERROR('Resource mismatch when reallocating buffer array')
      return
    }

    if (TfDebug.isEnabled(HdDebugCodes.HD_SAFE_MODE)) {
      let bresIdx = 0
      for (const [name] of this.getResources()) {
        TF_VERIFY(curRangeOwner_.getResources()[bresIdx++]![1] ===
                  curRangeOwner_.getResource(name))
      }
    }

    // count up total elements and update new offsets
    let totalNumElements = 0
    const newOffsets: number[] = []

    for (const range of ranges) {
      if (!range) {
        TF_CODING_ERROR('Expired range found in the reallocation list')
        continue
      }

      // save new offset
      newOffsets.push(totalNumElements)

      // XXX: always tightly pack for now.
      totalNumElements += range.getNumElements()
    }

    // update range list (should be done before early exit)
    this._setRangeList(ranges)

    this._totalCapacity = totalNumElements

    const hgi = this._resourceRegistry.getHgi()
    const blitCmds = this._resourceRegistry.getGlobalBlitCmds()
    blitCmds.pushDebugGroup('HdStVBOMemoryManager::_StripedBufferArray::Reallocate')

    // resize each BufferResource
    const resources = this.getResources()
    for (let bresIdx = 0; bresIdx < resources.length; ++bresIdx) {
      const bres = resources[bresIdx]![1]
      const curRes = curRangeOwner_.getResources()[bresIdx]![1]

      const bytesPerElement = HdDataSizeOfTupleType(bres.getTupleType())
      TF_VERIFY(bytesPerElement > 0)
      const bufferSize = bytesPerElement * this._totalCapacity

      // allocate new one
      // curBuf and oldBuf will be different when we are adopting ranges
      // from another buffer array.
      const oldBuf = bres.getHandle()
      const curBuf = curRes.getHandle()
      let newBuf: HgiBufferHandle = new HgiHandle()

      // Skip buffers of zero size
      if (bufferSize > 0) {
        const bufDesc = new HgiBufferDesc()
        bufDesc.usage = this._bufferUsage
        bufDesc.byteSize = bufferSize
        bufDesc.vertexStride = bytesPerElement
        bufDesc.debugName = resources[bresIdx]![0]
        newBuf = hgi.createBuffer(bufDesc)
      }

      // if old and new buffer exist, copy unchanged data
      if (curBuf.isSet() && newBuf.isSet()) {
        let newOffsetIt = 0

        // pre-pass to combine consecutive buffer range relocation
        const relocator = new HdStBufferRelocator(curBuf, newBuf)
        for (const it of ranges) {
          const range = it as HdStVBOMemoryManager_StripedBufferArrayRange
          if (!range) {
            TF_CODING_ERROR('_StripedBufferArrayRange expired unexpectedly.')
            continue
          }

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
          const oldOffset = range.getElementOffset()
          if (copySize > 0) {
            const readOffset = oldOffset * bytesPerElement
            const writeOffset = newOffsets[newOffsetIt]! * bytesPerElement

            relocator.addRange(readOffset, writeOffset, copySize)
          }
          ++newOffsetIt
        }

        // buffer copy
        relocator.commit(blitCmds)
      }
      if (oldBuf.isSet()) {
        // delete old buffer
        hgi.destroyBuffer(oldBuf)
      }

      // update allocation of buffer resource
      bres.setAllocation(newBuf, bufferSize)
    }

    // update ranges
    for (let idx = 0; idx < ranges.length; ++idx) {
      const range = ranges[idx] as HdStVBOMemoryManager_StripedBufferArrayRange
      if (!range) {
        TF_CODING_ERROR('_StripedBufferArrayRange expired unexpectedly.')
        continue
      }
      range.setElementOffset(newOffsets[idx]!)
      range.setCapacity(range.getNumElements())
    }

    blitCmds.popDebugGroup()

    this._needsReallocation = false
    this._needsCompaction = false

    // increment version to rebuild dispatch buffers.
    this.incrementVersion()
  }

  /** vboMemoryManager.cpp:430-437 */
  protected _deallocateResources(): void {
    const hgi = this._resourceRegistry.getHgi()
    for (const [, res] of this.getResources()) {
      hgi.destroyBuffer(res.getHandle())
    }
  }

  /** vboMemoryManager.cpp:439-448 */
  override getMaxNumElements(): number {
    return Math.floor(HdSt_MaxBufferBytes(this._resourceRegistry) / this._maxBytesPerElement)
  }

  /** vboMemoryManager.cpp:450-464 */
  override debugDump(): string {
    let out = '  HdStVBOMemoryManager\n'
    out += `  total capacity = ${this._totalCapacity}\n`
    out += `    Range entries ${this.getRangeCount()}:\n`

    const rangeCount = this.getRangeCount()
    for (let rangeIdx = 0; rangeIdx < rangeCount; ++rangeIdx) {
      const range = this._getRangeSharedPtr(rangeIdx)
      if (range) {
        out += `      ${rangeIdx}${range.debugDump()}`
      }
    }
    return out
  }

  /** vboMemoryManager.h:262-264 */
  override setNeedsReallocation(): void {
    this._needsReallocation = true
  }

  /** vboMemoryManager.h:267-269 */
  setNeedsCompaction(): void {
    this._needsCompaction = true
  }

  /** vboMemoryManager.cpp:466-504. With no (or an empty) name, the single
   *  resource (vboMemoryManager.cpp:466-487). */
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

  /** vboMemoryManager.h:284-285 */
  getResources(): HdStBufferResourceNamedList {
    return this._resourceList
  }

  /** vboMemoryManager.cpp:506-515 */
  getBufferSpecs(): HdBufferSpec[] {
    return this._resourceList.map(([name, res]) => ({ name, tupleType: res.getTupleType() }))
  }

  /** vboMemoryManager.h:313-315 */
  private _getRangeSharedPtr(idx: number): HdStVBOMemoryManager_StripedBufferArrayRange | null {
    const range = this.getRange(idx)
    return range && !range._expired
      ? range as HdStVBOMemoryManager_StripedBufferArrayRange : null
  }
}

/** vboMemoryManager.h:38-319. VBO memory manager. */
export class HdStVBOMemoryManager extends HdStAggregationStrategy {
  static readonly _StripedBufferArray = HdStVBOMemoryManager_StripedBufferArray
  static readonly _StripedBufferArrayRange = HdStVBOMemoryManager_StripedBufferArrayRange

  private readonly _resourceRegistry: HdStResourceRegistry

  /** vboMemoryManager.h:41-43 */
  constructor(resourceRegistry: HdStResourceRegistry) {
    super()
    this._resourceRegistry = resourceRegistry
  }

  /** vboMemoryManager.cpp:44-52. Factory for creating HdBufferArray managed
   *  by HdStVBOMemoryManager aggregation. */
  createBufferArray(role: string, bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArray {
    return new HdStVBOMemoryManager_StripedBufferArray(
      this._resourceRegistry, role, bufferSpecs, usageHint)
  }

  /** vboMemoryManager.cpp:55-59. Factory for creating HdBufferArrayRange
   *  managed by HdStVBOMemoryManager aggregation. */
  createBufferArrayRange(): HdBufferArrayRange {
    return new HdStVBOMemoryManager_StripedBufferArrayRange(this._resourceRegistry)
  }

  /** vboMemoryManager.cpp:62-73 */
  computeAggregationId(bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdStAggregationId {
    return HdSt_AggregationIdOf('HdStVBOMemoryManager::ComputeAggregationId',
      bufferSpecs, usageHint)
  }

  /** vboMemoryManager.cpp:76-84. Returns the buffer specs from a given
   *  buffer array. */
  getBufferSpecs(bufferArray: HdBufferArray): HdBufferSpec[] {
    return (bufferArray as HdStVBOMemoryManager_StripedBufferArray).getBufferSpecs()
  }

  /** vboMemoryManager.cpp:87-123. Returns the size of the GPU memory used
   *  by the passed buffer array. */
  getResourceAllocation(bufferArray: HdBufferArray, result: VtDictionary): number {
    return HdSt_TallyResources(
      (bufferArray as HdStVBOMemoryManager_StripedBufferArray).getResources(), result, false)
  }
}
