// Ported from OpenUSD 26.11.1: pxr/exec/vdf/parallelExecutorDataVector.cpp,
//  pxr/exec/vdf/parallelExecutorDataVector.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/parallelExecutorDataVector.h and
// pxr/exec/vdf/parallelExecutorDataVector.cpp.
//
// Ported for VdfSimpleExecutor (see parallelExecutorDataManagerInterface.ts).
// Single-threaded (doc section 5): atomics are plain fields, the CAS
// operations always succeed, the spin mutex is dropped, and the
// construction checksum of _OutputData (which synchronizes concurrent
// emplacement, parallelExecutorDataVector.cpp:272-317) is not needed because
// the data entries are created in lock step. A location is only ever
// pending inside the call that creates it, so _WaitForLocation never waits.
//
// Containers: the segmented locations array holds Int32Array segments; the
// touched bitset uses 32-bit words (upstream 64-bit), which only changes the
// word size; the tbb::concurrent_vectors are arrays. DataHandle is a number,
// InvalidHandle (size_t(-1) upstream) is -1.

import { TF_AXIOM, TF_DEV_AXIOM } from 'typescript-usd/tf'
import { WorkParallelForN } from 'typescript-usd/work'

import { VdfExecutorBufferData } from './executorBufferData.ts'
import { VdfExecutorInvalidationData } from './executorInvalidationData.ts'
import type { VdfMask } from './mask.ts'
import type { VdfNetwork } from './network.ts'
import { VdfOutput } from './output.ts'
import type { VdfVector } from './vector.ts'

// _BufferIndices bit layout (parallelExecutorDataVector.h:363-372).
const _privateOffset = 0
const _scratchOffset = 2
const _publicOffset = 4
const _privateMask = 0x03
const _scratchMask = 0x0C
const _publicMask = 0x30

/**
 * _BufferIndices (parallelExecutorDataVector.h:291-377): an 8-bit field of
 * indices into the executor buffer data arrays.
 */
class _BufferIndices {
  private _indices = 0

  constructor() {
    this.Reset()
  }

  Reset(): void {
    this._indices =
      (0 << _privateOffset) |
      (1 << _scratchOffset) |
      (2 << _publicOffset)
  }

  getPrivateIndex(): number {
    return (this._indices & _privateMask) >> _privateOffset
  }

  getScratchIndex(): number {
    return (this._indices & _scratchMask) >> _scratchOffset
  }

  getPublicIndex(): number {
    return (this._indices & _publicMask) >> _publicOffset
  }

  /** Swaps the private buffer with the public buffer index. */
  publishPrivateIndex(): void {
    const indices = this._indices
    this._indices =
      // Scratch index stays.
      (indices & _scratchMask) |
      // Public index replaces the private index.
      ((indices >> _publicOffset) & _privateMask) |
      // Private index replaces the public index.
      ((indices & _privateMask) << _publicOffset)
  }

  /** Swaps the scratch buffer with the public buffer index. */
  publishScratchIndex(): void {
    const indices = this._indices
    this._indices =
      // Private index stays.
      (indices & _privateMask) |
      // Public index replaces the scratch index.
      ((indices >> _scratchOffset) & _scratchMask) |
      // Scratch index replaces the public index.
      ((indices & _scratchMask) << _scratchOffset)
  }
}

/** The generic output data stored for each entry (parallelExecutorDataVector.h:383-449). */
class _OutputData {
  outputId = 0
  readonly bufferIndices = new _BufferIndices()
  invalidationTimestamp = VdfExecutorInvalidationData.InitialInvalidationTimestamp

  constructor(oid: number) {
    this.Reset(oid)
  }

  Reset(oid: number): void {
    this.bufferIndices.Reset()
    this.invalidationTimestamp = VdfExecutorInvalidationData.InitialInvalidationTimestamp
    this.outputId = oid
  }
}

/**
 * _Inbox (parallelExecutorDataVector.h:455-502): output values that had
 * their ownership transferred into this data manager.
 */
class _Inbox {
  private _buffer: VdfExecutorBufferData | null = null

  /** Take (parallelExecutorDataVector.cpp:365-395). */
  take(value: VdfVector, mask: VdfMask): boolean {
    // Bail out if there is already a value assigned to this inbox.
    if (this._buffer) {
      return false
    }

    // Allocate a new buffer, which will assume ownership of the value.
    const newBuffer = new VdfExecutorBufferData()
    newBuffer.takeOwnership(value)
    newBuffer.setExecutorCacheMask(mask)
    this._buffer = newBuffer
    return true
  }

  Get(): VdfExecutorBufferData | null {
    return this._buffer
  }

  Reset(): void {
    this._buffer = null
  }
}

// parallelExecutorDataVector.h:554: the number of output buffers
// (public, private, scratch).
const _NumBuffers = 3

// parallelExecutorDataVector.h:563-564: sentinels for invalid (not yet
// created) and pending (currently being created) location indices.
const _LocationInvalid = -1
const _LocationPending = -2

// parallelExecutorDataVector.h:568: the number of bits in a word of the
// touched array (32 here, see the file header).
const _TouchedWordBits = 32

// parallelExecutorDataVector.h:573: the size of a segment of the locations
// array. Must be a power of two.
const _SegmentSize = 4096

/**
 * Vdf_ParallelExecutorDataVector (parallelExecutorDataVector.h:40-611): a
 * data container for executor data managers that stores data in vectors
 * indexed by output ids.
 */
export class Vdf_ParallelExecutorDataVector {
  /** This sentinel index denotes an invalid handle (parallelExecutorDataVector.h:50). */
  static readonly InvalidHandle = -1

  // parallelExecutorDataVector.h:579-580: the segmented locations array.
  private _numSegments = 0
  private _locations: (Int32Array | null)[] = []

  // parallelExecutorDataVector.h:585-586: the touched bitset.
  private _numTouched = 0
  private _touched = new Uint32Array(0)

  // parallelExecutorDataVector.h:591-609: the data arrays.
  private _outputData: _OutputData[] = []
  private _bufferData: VdfExecutorBufferData[][] = [[], [], []]
  private _inboxes: _Inbox[] = []
  private _invalidationData: VdfExecutorInvalidationData[] = []

  /** Resize (parallelExecutorDataVector.cpp:89-127). */
  resize(network: VdfNetwork): void {
    const newSize = network.getOutputCapacity()

    // Already appropriately sized?
    if (newSize <= this._numSegments * _SegmentSize) {
      return
    }

    // Resize the locations array.
    const newNumSegments = Math.floor(newSize / _SegmentSize) + 1
    while (this._locations.length < newNumSegments) {
      this._locations.push(null)
    }
    this._numSegments = newNumSegments

    // Resize the touched array, but only do so if an array has previously
    // been allocated.
    if (this._numTouched !== 0) {
      this._growTouched()
    }
  }

  /** GetOrCreateDataHandle (parallelExecutorDataVector.h:615-654). */
  getOrCreateDataHandle(outputId: number): number {
    const outputIndex = VdfOutput.getIndexFromId(outputId)

    // Compute the index to the segment.
    const segmentIndex = Math.floor(outputIndex / _SegmentSize)
    TF_DEV_AXIOM(segmentIndex < this._numSegments, 'segmentIndex < _numSegments')

    // Retrieve the segment, allocating it if required.
    let segment = this._locations[segmentIndex]!
    if (!segment) {
      segment = this._createSegment(segmentIndex)
    }

    // Using the output index, look up the location in the data vector.
    const segmentOffset = outputIndex & (_SegmentSize - 1)
    const currentLocation = segment[segmentOffset]!

    // Create a new entry, if the location is still uninitialized.
    if (currentLocation < 0) {
      return this._createLocation(outputId, currentLocation, segment, segmentOffset)
    }

    // Make sure the output id matches at the location, and reset the entry
    // if there is a mismatch.
    else if (outputId !== this._outputData[currentLocation]!.outputId) {
      this._resetLocation(outputId, currentLocation, segment, segmentOffset)
    }

    return currentLocation
  }

  /** GetDataHandle (parallelExecutorDataVector.h:656-700). */
  getDataHandle(outputId: number): number {
    const outputIndex = VdfOutput.getIndexFromId(outputId)

    // Compute the index to the segment.
    const segmentIndex = Math.floor(outputIndex / _SegmentSize)

    // If the index is out of bounds, we can bail out right away.
    if (segmentIndex >= this._numSegments) {
      return Vdf_ParallelExecutorDataVector.InvalidHandle
    }

    // If the segment is not allocated, we can bail out right away.
    const segment = this._locations[segmentIndex]
    if (!segment) {
      return Vdf_ParallelExecutorDataVector.InvalidHandle
    }

    const segmentOffset = outputIndex & (_SegmentSize - 1)
    let currentLocation = segment[segmentOffset]!

    if (currentLocation === _LocationPending) {
      currentLocation = this._waitForLocation(currentLocation, segment, segmentOffset)
    }

    return currentLocation >= 0 &&
      this._outputData[currentLocation]!.outputId === outputId
      ? currentLocation
      : Vdf_ParallelExecutorDataVector.InvalidHandle
  }

  /** GetPrivateBufferData (parallelExecutorDataVector.h:90-93). */
  getPrivateBufferData(handle: number): VdfExecutorBufferData {
    const idx = this._outputData[handle]!.bufferIndices.getPrivateIndex()
    return this._bufferData[idx]![handle]!
  }

  /** GetScratchBufferData (parallelExecutorDataVector.h:100-103). */
  getScratchBufferData(handle: number): VdfExecutorBufferData {
    const idx = this._outputData[handle]!.bufferIndices.getScratchIndex()
    return this._bufferData[idx]![handle]!
  }

  /** GetPublicBufferData (parallelExecutorDataVector.h:110-113). */
  getPublicBufferData(handle: number): VdfExecutorBufferData {
    const idx = this._outputData[handle]!.bufferIndices.getPublicIndex()
    return this._bufferData[idx]![handle]!
  }

  /** PublishPrivateBufferData (parallelExecutorDataVector.h:122-124). */
  publishPrivateBufferData(handle: number): void {
    this._outputData[handle]!.bufferIndices.publishPrivateIndex()
  }

  /** PublishScratchBufferData (parallelExecutorDataVector.h:133-135). */
  publishScratchBufferData(handle: number): void {
    this._outputData[handle]!.bufferIndices.publishScratchIndex()
  }

  /** GetTransferredBufferData (parallelExecutorDataVector.h:144-147). */
  getTransferredBufferData(handle: number): VdfExecutorBufferData | null {
    return this._inboxes[handle]!.Get()
  }

  /** TransferBufferData (parallelExecutorDataVector.h:161-166). */
  transferBufferData(handle: number, value: VdfVector, mask: VdfMask): boolean {
    return this._inboxes[handle]!.take(value, mask)
  }

  /** ResetTransferredBufferData (parallelExecutorDataVector.h:175-177). */
  resetTransferredBufferData(handle: number): void {
    this._inboxes[handle]!.Reset()
  }

  /** GetInvalidationData (parallelExecutorDataVector.h:185-188). */
  getInvalidationData(handle: number): VdfExecutorInvalidationData {
    return this._invalidationData[handle]!
  }

  /** GetInvalidationTimestamp (parallelExecutorDataVector.h:196-199). */
  getInvalidationTimestamp(handle: number): number {
    return this._outputData[handle]!.invalidationTimestamp
  }

  /** SetInvalidationTimestamp (parallelExecutorDataVector.h:208-212). */
  setInvalidationTimestamp(handle: number, timestamp: number): void {
    this._outputData[handle]!.invalidationTimestamp = timestamp
  }

  /** IsTouched (parallelExecutorDataVector.h:217-225). */
  isTouched(outputId: number): boolean {
    const outputIdx = VdfOutput.getIndexFromId(outputId)
    const idx = Math.floor(outputIdx / _TouchedWordBits)
    const bit = (1 << (outputIdx & (_TouchedWordBits - 1))) >>> 0
    return idx < this._numTouched && (this._touched[idx]! & bit) !== 0
  }

  /** Touch (parallelExecutorDataVector.h:230-243). */
  touch(outputId: number): void {
    // Lazily initialize the touched array, if necessary.
    if (this._numTouched === 0) {
      this._growTouched()
    }

    const outputIdx = VdfOutput.getIndexFromId(outputId)
    const idx = Math.floor(outputIdx / _TouchedWordBits)
    const bit = (1 << (outputIdx & (_TouchedWordBits - 1))) >>> 0
    if ((this._touched[idx]! & bit) === 0) {
      this._touched[idx] = (this._touched[idx]! | bit) >>> 0
    }
  }

  /** Untouch (parallelExecutorDataVector.h:251-261). */
  untouch(outputId: number): boolean {
    const outputIdx = VdfOutput.getIndexFromId(outputId)
    const idx = Math.floor(outputIdx / _TouchedWordBits)
    const bit = (1 << (outputIdx & (_TouchedWordBits - 1))) >>> 0
    if (idx < this._numTouched && (this._touched[idx]! & bit) !== 0) {
      const previous = this._touched[idx]!
      this._touched[idx] = (previous & ~bit) >>> 0
      return (previous & bit) !== 0
    }
    return false
  }

  /** GetNumData (parallelExecutorDataVector.h:268-270). */
  getNumData(): number {
    return this._outputData.length
  }

  /** Reset (parallelExecutorDataVector.cpp:129-144). */
  Reset(handle: number, outputId: number): void {
    for (let i = 0; i < _NumBuffers; ++i) {
      this._bufferData[i]![handle]!.Reset()
    }
    this._inboxes[handle]!.Reset()
    this._invalidationData[handle]!.Reset()

    // Note we reset the output data last.
    this._outputData[handle]!.Reset(outputId)
  }

  /** Clear (parallelExecutorDataVector.cpp:146-182). */
  clear(): void {
    // Reset the locations segments that have already been allocated.
    for (let i = 0; i < this._numSegments; ++i) {
      const segment = this._locations[i]
      if (segment) {
        segment.fill(_LocationInvalid)
      }
    }

    // Reset the touched array by clearing all bits.
    const numTouched = this._numTouched
    const touched = this._touched
    WorkParallelForN(numTouched, (begin, end) => {
      touched.fill(0, begin, end)
    })

    // Clear all the executor data.
    this._outputData = []
    for (let i = 0; i < _NumBuffers; ++i) {
      this._bufferData[i] = []
    }
    this._inboxes = []
    this._invalidationData = []
  }

  /** _GrowTouched (parallelExecutorDataVector.cpp:184-222). */
  private _growTouched(): void {
    // We are going to grow the bitset to the full size of the network.
    const networkSize = this._numSegments * _SegmentSize
    const numTouched = Math.floor(networkSize / _TouchedWordBits) + 1

    // If the bitset is already appropriately sized, we can bail out now.
    const oldNumTouched = this._numTouched
    if (oldNumTouched >= numTouched) {
      return
    }

    // Resize the touched array to fit all of the outputs in the network.
    const newTouched = new Uint32Array(numTouched)
    newTouched.set(this._touched.subarray(0, oldNumTouched))
    this._touched = newTouched

    this._numTouched = numTouched
  }

  /** _CreateSegment (parallelExecutorDataVector.cpp:224-248). */
  private _createSegment(segmentIndex: number): Int32Array {
    const newSegment = new Int32Array(_SegmentSize).fill(_LocationInvalid)
    this._locations[segmentIndex] = newSegment
    return newSegment
  }

  /** _CreateLocation (parallelExecutorDataVector.cpp:250-270). */
  private _createLocation(
    outputId: number,
    currentLocation: number,
    segment: Int32Array,
    segmentOffset: number): number {
    // If the location index is invalid and not currently pending, create new
    // data and store the location index.
    if (currentLocation === _LocationInvalid) {
      segment[segmentOffset] = _LocationPending
      const location = this._createData(outputId)
      segment[segmentOffset] = location
      return location
    }

    // If the location index is currently pending, wait until it becomes
    // available.
    return this._waitForLocation(currentLocation, segment, segmentOffset)
  }

  /** _CreateData (parallelExecutorDataVector.cpp:272-317). */
  private _createData(outputId: number): number {
    const idx = this._outputData.length
    this._outputData.push(new _OutputData(outputId))
    for (let i = 0; i < _NumBuffers; ++i) {
      this._bufferData[i]!.push(new VdfExecutorBufferData())
    }
    this._inboxes.push(new _Inbox())
    this._invalidationData.push(new VdfExecutorInvalidationData())
    return idx
  }

  /** _ResetLocation (parallelExecutorDataVector.cpp:319-351). */
  private _resetLocation(
    outputId: number,
    currentLocation: number,
    segment: Int32Array,
    segmentOffset: number): void {
    TF_DEV_AXIOM(currentLocation >= 0, 'currentLocation >= 0')
    segment[segmentOffset] = _LocationPending
    if (outputId !== this._outputData[currentLocation]!.outputId) {
      this.Reset(currentLocation, outputId)
    }
    segment[segmentOffset] = currentLocation
  }

  /**
   * _WaitForLocation (parallelExecutorDataVector.cpp:353-363). Upstream
   * spins while another thread creates the entry; single-threaded, no
   * location is ever pending outside the call that creates it.
   */
  private _waitForLocation(
    currentLocation: number, segment: Int32Array, segmentOffset: number): number {
    if (currentLocation === _LocationPending) {
      currentLocation = segment[segmentOffset]!
    }
    TF_AXIOM(currentLocation !== _LocationPending, 'currentLocation != _LocationPending')
    return currentLocation
  }
}
