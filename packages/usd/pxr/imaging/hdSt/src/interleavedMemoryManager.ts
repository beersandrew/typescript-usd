// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/interleavedMemoryManager.cpp,
//  pxr/imaging/hdSt/interleavedMemoryManager.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/interleavedMemoryManager.{h,cpp} (OpenUSD 26.11.1).
//
// Interleaved memory managers: all channels of a range are packed into one
// struct per element, with std140 (UBO) / std430 (SSBO) alignment, or C++
// padding when the device reports HgiDeviceCapabilitiesBitsCppShaderPadding.
//
//      .--range["color"].offset
//      v
//    | Xf      : Color      || Xf       : Color   || ...|
//     ^------- stride ------^
//
// Divergences:
// - The nested classes are the module classes
//   HdStInterleavedMemoryManager_StripedInterleavedBuffer[Range].
// - PLATFORM-DIVERGENCE(hd-bar-shared-ptr): see vboMemoryManager.ts.
// - DebugDump returns its text.

import {
  HgiBufferCpuToGpuOp,
  HgiBufferDesc,
  HgiBufferUsageBits,
  HgiDeviceCapabilitiesBits,
  HgiHandle,
  type HgiBufferHandle,
  type HgiBufferUsage,
} from 'typescript-usd/hgi'
import {
  BufferArray as HdBufferArray,
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  DataSizeOfTupleType as HdDataSizeOfTupleType,
  DataSizeOfType as HdDataSizeOfType,
  DebugCodes as HdDebugCodes,
  GetComponentCount as HdGetComponentCount,
  GetComponentType as HdGetComponentType,
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  Type as HdType,
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
import { HdStBufferRelocator, HdStReadBuffer, HdSt_CopyHandle } from './bufferUtils.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdStAggregationStrategy, HdSt_AggregationIdOf, HdSt_TallyResources,
  type HdStAggregationId,
} from './strategyBase.ts'
import { HdStPerfTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** interleavedMemoryManager.h:175 */
const NOT_ALLOCATED = -1

function _TupleTypeName(t: HdTupleType): string {
  return `${HdType[t.type]} (${t.type}) x ${t.count}`
}

/** interleavedMemoryManager.cpp:178-182 */
export function HdSt_ComputePadding(alignment: number, currentOffset: number): number {
  return ((alignment - (currentOffset & (alignment - 1))) & (alignment - 1))
}

/** interleavedMemoryManager.cpp:184-212 */
export function HdSt_ComputeAlignment(tupleType: HdTupleType): number {
  const componentType = HdGetComponentType(tupleType.type)
  const numComponents = HdGetComponentCount(tupleType.type)
  const componentSize = HdDataSizeOfType(componentType)

  // This is simplified to treat arrays of int and floats
  // as vectors. The padding rules state that if we have
  // an array of 2 ints, it would get aligned to the size
  // of a vec4, where as a vec2 of ints or floats is aligned
  // to the size of a vec2. Since we don't know if something is
  // an array or vector, we are treating them as vectors.
  //
  // XXX:Arrays: Now that we do know whether a value is an array
  // or vector, we can update this to do the right thing.

  // Matrices are treated as an array of vec4s, so the
  // max num components we are looking at is 4
  let alignComponents = Math.min(numComponents, 4)

  // single elements and vec2's are allowed, but
  // vec3's get rounded up to vec4's
  if (alignComponents === 3) {
    alignComponents = 4
  }

  return componentSize * alignComponents
}

/** interleavedMemoryManager.h:42-180 */
export class HdStInterleavedMemoryManager_StripedInterleavedBufferRange extends HdStBufferArrayRange {
  private _stripedBuffer: HdStInterleavedMemoryManager_StripedInterleavedBuffer | null = null
  private _index = NOT_ALLOCATED
  private _numElements = 1
  private _capacity = 0

  /** interleavedMemoryManager.h:46-51 */
  constructor(resourceRegistry: HdStResourceRegistry) {
    super(resourceRegistry)
  }

  /** interleavedMemoryManager.cpp:627-636 (the destructor). Notify that
   *  hosting buffer array needs to be garbage collected. */
  protected override _onExpired(): void {
    if (this._stripedBuffer) {
      this._stripedBuffer.setNeedsCompaction()
    }
  }

  /** interleavedMemoryManager.h:58-61 */
  override isValid(): boolean {
    return this._stripedBuffer !== null
  }

  /** interleavedMemoryManager.cpp:639-643 */
  override isAssigned(): boolean {
    return this._stripedBuffer !== null
  }

  /** interleavedMemoryManager.cpp:645-650 */
  override isImmutable(): boolean {
    return this._stripedBuffer !== null && this._stripedBuffer.isImmutable()
  }

  /** interleavedMemoryManager.cpp:652-656 */
  override requiresStaging(): boolean {
    return true
  }

  /** interleavedMemoryManager.cpp:658-691 */
  resize(numElements: number): boolean {
    if (!TF_VERIFY(this._stripedBuffer)) return false

    // XXX Some tests rely on an interleaved buffer being valid, even if given
    // no data.
    if (numElements === 0) {
      numElements = 1
    }

    let needsReallocation = false

    if (this._capacity !== numElements) {
      const numMaxElements = this.getMaxNumElements()

      if (numElements > numMaxElements) {
        TF_WARN(`Attempting to resize the BAR with 0x${numElements.toString(16)} ` +
          'elements when the max number of elements in the buffer array is ' +
          `0x${numMaxElements.toString(16)}. Clamping BAR size to the latter.`)

        numElements = numMaxElements
      }
      this._stripedBuffer!.setNeedsReallocation()
      needsReallocation = true
    }

    this._numElements = numElements
    return needsReallocation
  }

  /** interleavedMemoryManager.cpp:693-766 */
  copyData(bufferSource: HdBufferSource): void {
    if (!TF_VERIFY(this._stripedBuffer)) return

    const VBO = this._stripedBuffer!.getResource(bufferSource.getName())

    if (!VBO || !VBO.getHandle().isSet()) {
      TF_CODING_ERROR(`VBO doesn't exist for ${bufferSource.getName()}`)
      return
    }

    // overrun check
    // XXX:Arrays:  Note that we only check tuple type here, not arity.
    // This code allows N-tuples and N-element arrays to be interchanged.
    // It would seem better to have upstream buffers adjust their tuple
    // arity as needed.
    if (!TF_VERIFY(
      bufferSource.getTupleType().type === VBO.getTupleType().type,
      `'${bufferSource.getName()}': (${_TupleTypeName(bufferSource.getTupleType())}) != ` +
      `(${_TupleTypeName(VBO.getTupleType())})\n`)) {
      return
    }

    const vboStride = VBO.getStride()
    let vboOffset = VBO.getOffset() + vboStride * this._index
    const vboDataSize = HdDataSizeOfTupleType(VBO.getTupleType())
    const sourceDataSize = HdDataSizeOfTupleType(bufferSource.getTupleType())
    const elementStride = this._stripedBuffer!.getElementStride()

    const data = bufferSource.getData()
    let dataOffset = 0

    const blitOp = new HgiBufferCpuToGpuOp()
    blitOp.gpuDestinationBuffer = HdSt_CopyHandle(VBO.getHandle())
    blitOp.sourceByteOffset = 0
    if (sourceDataSize <= vboDataSize) {
      blitOp.byteSize = sourceDataSize
    } else {
      TF_WARN(`Source data size (${sourceDataSize} bytes) is larger than buffer resource ` +
              `(${vboDataSize} bytes). Clamping copy op to the latter.\n`)
      blitOp.byteSize = vboDataSize
    }

    const stagingBuffer = this.getResourceRegistry().getStagingBuffer()

    const byteSize = blitOp.byteSize
    for (let i = 0; i < this._numElements; ++i) {
      blitOp.cpuSourceBuffer = data
      blitOp.sourceByteOffset = dataOffset
      blitOp.destinationByteOffset = vboOffset

      // Divergence: a source with fewer bytes than its tuple type (an empty
      // VtArray, which HdVtBufferSource reports as one T with zero elements,
      // vtBufferSource.cpp _SetValue) makes upstream read past its data; the
      // copy here is clamped to the source's bytes.
      blitOp.byteSize = Math.min(byteSize, Math.max(0, data.byteLength - dataOffset))
      if (blitOp.byteSize > 0) {
        stagingBuffer.stageCopy(blitOp)
      }

      vboOffset += elementStride
      dataOffset += vboDataSize
    }

    HdPerfLog.GetInstance().addCounter(HdStPerfTokens.copyBufferCpuToGpu, this._numElements)
  }

  /** interleavedMemoryManager.cpp:768-794 */
  override ReadData(name: string): VtValue | null {
    if (!TF_VERIFY(this._stripedBuffer)) return null

    const VBO = this._stripedBuffer!.getResource(name)

    if (!VBO || !VBO.getHandle().isSet()) {
      TF_CODING_ERROR(`VBO doesn't exist for ${name}`)
      return null
    }

    return HdStReadBuffer(VBO.getHandle(),
                          VBO.getTupleType(),
                          VBO.getOffset() + VBO.getStride() * this._index,
                          VBO.getStride(),
                          this._numElements,
                          this._stripedBuffer!.getElementStride(),
                          this.getResourceRegistry())
  }

  /** interleavedMemoryManager.h:88-90 */
  getElementOffset(): number {
    return this._index
  }

  /** interleavedMemoryManager.h:94-99 */
  getByteOffset(_resourceName: string): number {
    if (!TF_VERIFY(this._stripedBuffer) ||
        !TF_VERIFY(this._index !== NOT_ALLOCATED)) return 0
    return this._stripedBuffer!.getStride() * this._index
  }

  /** interleavedMemoryManager.h:102-104 */
  getNumElements(): number {
    return this._numElements
  }

  /** interleavedMemoryManager.h:107-109 */
  override getVersion(): number {
    return this._stripedBuffer!.getVersion()
  }

  /** interleavedMemoryManager.h:111-113 */
  override getElementStride(): number {
    return this._stripedBuffer!.getElementStride()
  }

  /** interleavedMemoryManager.h:116-118 */
  override incrementVersion(): void {
    this._stripedBuffer!.incrementVersion()
  }

  /** interleavedMemoryManager.cpp:796-800 */
  override getMaxNumElements(): number {
    return this._stripedBuffer!.getMaxNumElements()
  }

  /** interleavedMemoryManager.cpp:802-811 */
  override getUsageHint(): HdBufferArrayUsageHint {
    if (!TF_VERIFY(this._stripedBuffer)) {
      return 0
    }
    return this._stripedBuffer!.getUsageHint()
  }

  /** interleavedMemoryManager.cpp:813-832. Don't use GetResource(void) as a
   *  shortcut for a name even an interleaved buffer is sharing one
   *  underlying GL resource. We may need an appropriate offset depending on
   *  name. */
  getResource(name?: string): HdStBufferResource | null {
    if (!TF_VERIFY(this._stripedBuffer)) return null
    return this._stripedBuffer!.getResource(name)
  }

  /** interleavedMemoryManager.cpp:834-842 */
  getResources(): HdStBufferResourceNamedList {
    if (!TF_VERIFY(this._stripedBuffer)) {
      return []
    }
    return this._stripedBuffer!.getResources()
  }

  /** interleavedMemoryManager.cpp:844-848 */
  override setBufferArray(bufferArray: HdBufferArray | null): void {
    this._stripedBuffer = bufferArray as HdStInterleavedMemoryManager_StripedInterleavedBuffer | null
  }

  /** interleavedMemoryManager.cpp:850-856 */
  override debugDump(): string {
    return `[StripedIBR] index = ${this._index}\n`
  }

  /** interleavedMemoryManager.h:150-152 */
  setIndex(index: number): void {
    this._index = index
  }

  /** interleavedMemoryManager.h:155-157 */
  invalidate(): void {
    this._stripedBuffer = null
  }

  /** interleavedMemoryManager.h:160-162 */
  getCapacity(): number {
    return this._capacity
  }

  /** interleavedMemoryManager.h:165-167 */
  setCapacity(capacity: number): void {
    this._capacity = capacity
  }

  /** interleavedMemoryManager.cpp:858-862 */
  protected override _getAggregation(): unknown {
    return this._stripedBuffer
  }
}

/** interleavedMemoryManager.h:190-305 */
export class HdStInterleavedMemoryManager_StripedInterleavedBuffer extends HdBufferArray {
  private readonly _manager: HdStInterleavedMemoryManager
  private readonly _resourceRegistry: HdStResourceRegistry
  private _needsCompaction = false
  private _stride = 0
  private readonly _bufferOffsetAlignment: number
  private readonly _maxSize: number
  private _elementStride = 0
  private _bufferUsage: HgiBufferUsage = 0
  private readonly _resourceList: HdStBufferResourceNamedList = []

  /** interleavedMemoryManager.cpp:214-341 */
  constructor(
    mgr: HdStInterleavedMemoryManager,
    resourceRegistry: HdStResourceRegistry,
    role: string,
    bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint,
    bufferOffsetAlignment = 0,
    structAlignment = 0,
    maxSize = 0,
    garbageCollectionPerfToken: string = HdPerfTokens.garbageCollectedUbo,
  ) {
    super(role, garbageCollectionPerfToken, usageHint)
    this._manager = mgr
    this._resourceRegistry = resourceRegistry
    this._bufferOffsetAlignment = bufferOffsetAlignment
    this._maxSize = maxSize

    /*
     do std140/std430 packing (GL spec section 7.6.2.2)
      When using the "std430" storage layout, shader storage
      blocks will be laid out in buffer storage identically to uniform and
      shader storage blocks using the "std140" layout, except that the base
      alignment of arrays of scalars and vectors in rule (4) and of structures
      in rule (9) are not rounded up a multiple of the base alignment of a vec4.

      ***Unless we're using Metal, and then we use C++ alignment padding rules.
     */
    const useCppShaderPadding = this._resourceRegistry.getHgi().getCapabilities()?.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsCppShaderPadding) ?? false

    for (const it of bufferSpecs) {
      // Figure out the alignment we need for this type of data
      const alignment = HdSt_ComputeAlignment(it.tupleType)
      this._stride += HdSt_ComputePadding(alignment, this._stride)

      // We need to save the max alignment size for later because the
      // stride for our struct needs to be aligned to this
      structAlignment = Math.max(structAlignment, alignment)

      this._stride += HdDataSizeOfTupleType(it.tupleType)

      if (useCppShaderPadding) {
        this._stride += HdSt_ComputePadding(alignment, this._stride)
      }
    }

    // Our struct stride needs to be aligned to the max alignment needed within
    // our struct.
    this._stride += HdSt_ComputePadding(structAlignment, this._stride)

    this._elementStride = this._stride

    // and also aligned if bufferOffsetAlignment exists (for UBO binding)
    if (this._bufferOffsetAlignment > 0) {
      this._stride += HdSt_ComputePadding(this._bufferOffsetAlignment, this._stride)
    }

    if (this._stride > this._maxSize) {
      TF_WARN(`Computed stride = ${this._stride} of interleaved buffer is larger than max` +
        ` size ${this._maxSize}, cannot create buffer.`)
      this._setMaxNumRanges(0)
      return
    }
    if (this._stride === 0) {
      TF_WARN(`Computed stride = ${this._stride} of interleaved buffer is 0, cannot ` +
        ' create buffer.')
      this._setMaxNumRanges(0)
      return
    }

    if (TfDebug.isEnabled(HdDebugCodes.HD_BUFFER_ARRAY_INFO)) {
      TfDebug.msg(HdDebugCodes.HD_BUFFER_ARRAY_INFO,
        `Create interleaved buffer array: stride = ${this._stride}\n`)
    }

    // populate BufferResources, interleaved
    let offset = 0
    for (const it of bufferSpecs) {
      // Figure out alignment for this data member
      const alignment = HdSt_ComputeAlignment(it.tupleType)
      // Add any needed padding to fixup alignment
      offset += HdSt_ComputePadding(alignment, offset)

      this._addResource(it.name, it.tupleType, offset, this._stride)

      if (TfDebug.isEnabled(HdDebugCodes.HD_BUFFER_ARRAY_INFO)) {
        TfDebug.msg(HdDebugCodes.HD_BUFFER_ARRAY_INFO,
          `  ${it.name} : offset = ${offset}, alignment = ${alignment}\n`)
      }

      const thisSize = HdDataSizeOfTupleType(it.tupleType)
      offset += thisSize
      if (useCppShaderPadding) {
        offset += HdSt_ComputePadding(alignment, thisSize)
      }
    }

    this._setMaxNumRanges(Math.floor(this._maxSize / this._stride))

    TF_VERIFY(this._stride + offset)

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

  /** interleavedMemoryManager.cpp:343-365 */
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

  /** interleavedMemoryManager.cpp:368-384 (the destructor). Invalidate
   *  buffer array ranges in range list (these ranges may still be held by
   *  drawItems). */
  destroy(): void {
    const rangeCount = this.getRangeCount()
    for (let rangeIdx = 0; rangeIdx < rangeCount; ++rangeIdx) {
      const range = this._getRangeSharedPtr(rangeIdx)
      if (range) {
        range.invalidate()
      }
    }
  }

  /** interleavedMemoryManager.cpp:386-412 */
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

  /** interleavedMemoryManager.cpp:414-549 */
  reallocate(ranges: HdBufferArrayRange[], curRangeOwner: HdBufferArray): void {
    const blitCmds = this._resourceRegistry.getGlobalBlitCmds()
    blitCmds.pushDebugGroup('HdStInterleavedMemoryManager::_StripedInterleavedBuffer::Reallocate')

    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.vboRelocated)

    // Calculate element count
    let elementCount = 0
    for (const range of ranges) {
      if (!range) {
        TF_CODING_ERROR('Expired range found in the reallocation list')
      }
      elementCount += range.getNumElements()
    }
    const totalSize = elementCount * this._stride

    // update range list (should be done before early exit)
    this._setRangeList(ranges)

    // resize each BufferResource
    // all HdBufferSources are sharing same VBO

    // allocate new one
    // curBuf and oldBuf will be different when we are adopting ranges
    // from another buffer array.
    const oldBuf = this.getResources()[0]![1].getHandle()

    const curRangeOwner_ = curRangeOwner as HdStInterleavedMemoryManager_StripedInterleavedBuffer

    const curBuf = curRangeOwner_.getResources()[0]![1].getHandle()
    let newBuf: HgiBufferHandle = new HgiHandle()

    const hgi = this._resourceRegistry.getHgi()

    // Skip buffers of zero size.
    if (totalSize > 0) {
      const bufDesc = new HgiBufferDesc()
      bufDesc.byteSize = totalSize
      bufDesc.usage = this._bufferUsage
      newBuf = hgi.createBuffer(bufDesc)
    }

    // if old and new buffer exist, copy unchanged data
    if (curBuf.isSet() && newBuf.isSet()) {
      let index = 0

      const rangeCount = this.getRangeCount()

      // pre-pass to combine consecutive buffer range relocation
      const relocator = new HdStBufferRelocator(curBuf, newBuf)
      for (let rangeIdx = 0; rangeIdx < rangeCount; ++rangeIdx) {
        const range = this._getRangeSharedPtr(rangeIdx)

        if (!range) {
          TF_CODING_ERROR('_StripedInterleavedBufferRange expired ' +
                          'unexpectedly.')
          continue
        }
        const oldIndex = range.getElementOffset()
        if (oldIndex >= 0) {
          // copy old data
          const readOffset = oldIndex * this._stride
          const writeOffset = index * this._stride

          const oldSize = range.getCapacity()
          const newSize = range.getNumElements()
          const copySize = this._stride * Math.min(oldSize, newSize)

          relocator.addRange(readOffset, writeOffset, copySize)
        }

        range.setIndex(index)
        index += range.getNumElements()
      }

      // buffer copy
      relocator.commit(blitCmds)
    } else {
      // just set index
      let index = 0

      const rangeCount = this.getRangeCount()
      for (let rangeIdx = 0; rangeIdx < rangeCount; ++rangeIdx) {
        const range = this._getRangeSharedPtr(rangeIdx)
        if (!range) {
          TF_CODING_ERROR('_StripedInterleavedBufferRange expired ' +
                          'unexpectedly.')
          continue
        }

        range.setIndex(index)
        index += range.getNumElements()
      }
    }
    if (oldBuf.isSet()) {
      // delete old buffer
      hgi.destroyBuffer(oldBuf)
    }

    // update allocation to all buffer resources
    for (const [, res] of this.getResources()) {
      res.setAllocation(newBuf, totalSize)
    }

    // update ranges
    for (let idx = 0; idx < ranges.length; ++idx) {
      const range = ranges[idx] as HdStInterleavedMemoryManager_StripedInterleavedBufferRange
      if (!range) {
        TF_CODING_ERROR(
          '_StripedInterleavedBufferRange expired unexpectedly.')
        continue
      }
      range.setCapacity(range.getNumElements())
    }

    blitCmds.popDebugGroup()

    this._needsReallocation = false
    this._needsCompaction = false

    // increment version to rebuild dispatch buffers.
    this.incrementVersion()
  }

  /** interleavedMemoryManager.cpp:551-558 */
  protected _deallocateResources(): void {
    const resource = this.getResource()
    if (resource) {
      this._resourceRegistry.getHgi().destroyBuffer(resource.getHandle())
    }
  }

  /** interleavedMemoryManager.cpp:560-574 */
  override debugDump(): string {
    let out = '  HdStInterleavedMemoryManager\n'
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

  /** interleavedMemoryManager.h:224-226 */
  override setNeedsReallocation(): void {
    this._needsReallocation = true
  }

  /** interleavedMemoryManager.h:229-231 */
  setNeedsCompaction(): void {
    this._needsCompaction = true
  }

  /** interleavedMemoryManager.h:234-236 */
  getStride(): number {
    return this._stride
  }

  /** interleavedMemoryManager.h:238-240 */
  getElementStride(): number {
    return this._elementStride
  }

  /** interleavedMemoryManager.cpp:576-611 */
  getResource(name?: string): HdStBufferResource | null {
    if (!name) {
      if (this._resourceList.length === 0) return null

      if (TfDebug.isEnabled(HdDebugCodes.HD_SAFE_MODE)) {
        // make sure this buffer array has only one resource.
        const buffer = this._resourceList[0]![1].getHandle()
        for (const [, res] of this._resourceList) {
          if (!res.getHandle().equals(buffer)) {
            TF_CODING_ERROR('GetResource(void) called on' +
                            'HdBufferArray having multiple GL resources')
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

  /** interleavedMemoryManager.h:255 */
  getResources(): HdStBufferResourceNamedList {
    return this._resourceList
  }

  /** interleavedMemoryManager.cpp:613-622 */
  getBufferSpecs(): HdBufferSpec[] {
    return this._resourceList.map(([name, res]) => ({ name, tupleType: res.getTupleType() }))
  }

  /** interleavedMemoryManager.h:261-264 */
  getManager(): HdStInterleavedMemoryManager {
    return this._manager
  }

  /** interleavedMemoryManager.h:301-303 */
  private _getRangeSharedPtr(idx: number): HdStInterleavedMemoryManager_StripedInterleavedBufferRange | null {
    const range = this.getRange(idx)
    return range && !range._expired
      ? range as HdStInterleavedMemoryManager_StripedInterleavedBufferRange : null
  }
}

/** interleavedMemoryManager.h:34-323. Interleaved memory manager (base
 *  class). */
export abstract class HdStInterleavedMemoryManager extends HdStAggregationStrategy {
  static readonly _StripedInterleavedBuffer = HdStInterleavedMemoryManager_StripedInterleavedBuffer
  static readonly _StripedInterleavedBufferRange =
    HdStInterleavedMemoryManager_StripedInterleavedBufferRange

  protected readonly _resourceRegistry: HdStResourceRegistry

  /** interleavedMemoryManager.h:307-308 */
  constructor(resourceRegistry: HdStResourceRegistry) {
    super()
    this._resourceRegistry = resourceRegistry
  }

  /** interleavedMemoryManager.cpp:39-43. Factory for creating
   *  HdBufferArrayRange. */
  createBufferArrayRange(): HdBufferArrayRange {
    return new HdStInterleavedMemoryManager_StripedInterleavedBufferRange(this._resourceRegistry)
  }

  /** interleavedMemoryManager.cpp:45-53. Returns the buffer specs from a
   *  given buffer array. */
  getBufferSpecs(bufferArray: HdBufferArray): HdBufferSpec[] {
    return (bufferArray as HdStInterleavedMemoryManager_StripedInterleavedBuffer).getBufferSpecs()
  }

  /** interleavedMemoryManager.cpp:55-92. Returns the size of the GPU memory
   *  used by the passed buffer array. */
  getResourceAllocation(bufferArray: HdBufferArray, result: VtDictionary): number {
    return HdSt_TallyResources(
      (bufferArray as HdStInterleavedMemoryManager_StripedInterleavedBuffer).getResources(),
      result, false)
  }
}

/** interleavedMemoryManager.h:325-343 */
export class HdStInterleavedUBOMemoryManager extends HdStInterleavedMemoryManager {
  /** interleavedMemoryManager.cpp:97-119. Factory for creating
   *  HdBufferArray managed by HdStVBOMemoryManager aggregation. */
  createBufferArray(role: string, bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArray {
    const caps = this._resourceRegistry.getHgi().getCapabilities()
    const uniformBufferOffsetAlignment = caps?.getUniformBufferOffsetAlignment() ?? 0
    const maxUniformBlockSize = caps?.getMaxUniformBlockSize() ?? 0

    return new HdStInterleavedMemoryManager_StripedInterleavedBuffer(
      this,
      this._resourceRegistry,
      role,
      bufferSpecs,
      usageHint,
      uniformBufferOffsetAlignment,
      /*structAlignment=*/4 * 4,
      maxUniformBlockSize,
      HdPerfTokens.garbageCollectedUbo)
  }

  /** interleavedMemoryManager.cpp:121-133 */
  computeAggregationId(bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdStAggregationId {
    return HdSt_AggregationIdOf('HdStInterleavedUBOMemoryManager::ComputeAggregationId',
      bufferSpecs, usageHint)
  }
}

/** interleavedMemoryManager.h:345-363 */
export class HdStInterleavedSSBOMemoryManager extends HdStInterleavedMemoryManager {
  /** interleavedMemoryManager.cpp:138-158 */
  createBufferArray(role: string, bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArray {
    const maxShaderStorageBlockSize =
      this._resourceRegistry.getHgi().getCapabilities()?.getMaxShaderStorageBlockSize() ?? 0

    return new HdStInterleavedMemoryManager_StripedInterleavedBuffer(
      this,
      this._resourceRegistry,
      role,
      bufferSpecs,
      usageHint,
      /*bufferOffsetAlignment=*/0,
      /*structAlignment=*/0,
      maxShaderStorageBlockSize,
      HdPerfTokens.garbageCollectedSsbo)
  }

  /** interleavedMemoryManager.cpp:160-172 */
  computeAggregationId(bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdStAggregationId {
    return HdSt_AggregationIdOf('HdStInterleavedSSBOMemoryManager::ComputeAggregationId',
      bufferSpecs, usageHint)
  }
}
