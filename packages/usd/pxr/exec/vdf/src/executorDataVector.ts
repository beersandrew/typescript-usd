// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorDataVector.cpp,
//  pxr/exec/vdf/executorDataVector.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorDataVector.h and
// pxr/exec/vdf/executorDataVector.cpp.
//
// Mapping notes:
// - DataHandle is a number (an index into the data arrays). InvalidHandle,
//   size_t(-1) upstream, is -1.
// - The segmented locations array holds Uint32Array segments. Upstream
//   leaves segments uninitialized (executorDataVector.cpp:124-136) and
//   validates every location with the back pointer in the output data; a
//   zero-filled segment is validated the same way.
// - The tbb::concurrent_vectors are arrays; reserve() and the capacity
//   management of Clear() have no observable effect and are dropped. The
//   Valgrind annotation (executorDataVector.cpp:24-48) is dropped.

import { TF_DEV_AXIOM } from 'typescript-usd/tf'

import { VdfExecutorBufferData } from './executorBufferData.ts'
import { VdfExecutorInvalidationData } from './executorInvalidationData.ts'
import type { VdfNetwork } from './network.ts'
import { VdfOutput } from './output.ts'
import { VdfSMBLData } from './smblData.ts'

/** The auxiliary output data stored for each output (executorDataVector.h:198-216). */
class _OutputData {
  outputId: number
  invalidationTimestamp = VdfExecutorInvalidationData.InitialInvalidationTimestamp
  touched = false

  constructor(oid: number) {
    this.outputId = oid
  }

  Reset(oid: number): void {
    this.outputId = oid
    this.invalidationTimestamp = VdfExecutorInvalidationData.InitialInvalidationTimestamp
    this.touched = false
  }
}

// executorDataVector.h:235: the size of a segment of the locations array.
// Must be a power of two.
const _SegmentSize = 4096

/**
 * Vdf_ExecutorDataVector (executorDataVector.h:39-249): a vector-like
 * container for executor data used by VdfDataManagerVector.
 */
export class Vdf_ExecutorDataVector {
  /** This sentinel index denotes an invalid handle (executorDataVector.h:49). */
  static readonly InvalidHandle = -1

  // executorDataVector.h:238: the locations array, indexing the data vector.
  private readonly _locations: (Uint32Array | null)[] = []

  // executorDataVector.h:244-247: the data vectors.
  private _outputData: _OutputData[] = []
  private _bufferData: VdfExecutorBufferData[] = []
  private _invalidationData: VdfExecutorInvalidationData[] = []
  private _smblData: (VdfSMBLData | null)[] = []

  /** Resize (executorDataVector.cpp:58-86). */
  resize(network: VdfNetwork): void {
    const newSize = network.getOutputCapacity()

    // Already appropriately sized?
    if (newSize <= this._locations.length * _SegmentSize) {
      return
    }

    // Segment the array and only allocate segments as they are required.
    const numSegments = Math.floor(newSize / _SegmentSize) + 1
    while (this._locations.length < numSegments) {
      this._locations.push(null)
    }
  }

  /** GetOrCreateDataHandle (executorDataVector.h:253-296). */
  getOrCreateDataHandle(outputId: number): number {
    const outputIndex = VdfOutput.getIndexFromId(outputId)

    // Compute the index of the segment.
    const segmentIndex = Math.floor(outputIndex / _SegmentSize)
    TF_DEV_AXIOM(segmentIndex < this._locations.length, 'segmentIndex < _locations.size()')

    // Retrieve the corresponding segment, or create a new one of necessary.
    let segment = this._locations[segmentIndex]!
    if (!segment) {
      segment = this._createSegment(segmentIndex)
    }

    // Using the segment offset, look up the location in the segment.
    const segmentOffset = outputIndex & (_SegmentSize - 1)
    const location = segment[segmentOffset]!

    // The location may be stale, so let's do a bounds check against the data
    // vector, and check whether the index at the location points back to the
    // same output. If not, insert a new entry and update the location.
    const numData = this.getNumData()
    if (location >= numData ||
        outputIndex !== VdfOutput.getIndexFromId(this._outputData[location]!.outputId)) {
      segment[segmentOffset] = numData
      this._createData(outputId)
      return numData
    }

    // If the location points to the right place in the data vector, we must
    // also verify the output version. If the version has changed the output
    // data must be reset.
    else if (outputId !== this._outputData[location]!.outputId) {
      this.Reset(location, outputId)
    }

    return location
  }

  /** GetDataHandle (executorDataVector.h:298-323). */
  getDataHandle(outputId: number): number {
    const outputIndex = VdfOutput.getIndexFromId(outputId)

    // Compute the index to the segment.
    const segmentIndex = Math.floor(outputIndex / _SegmentSize)

    // If the segment index is out of bounds or the segment has not been
    // allocated, we can bail out right away.
    const segment = this._locations[segmentIndex]
    if (segmentIndex >= this._locations.length || !segment) {
      return Vdf_ExecutorDataVector.InvalidHandle
    }

    // If the location points to a valid entry in the data vector, and the
    // data at that index matches the output id, we can return the data.
    const segmentOffset = outputIndex & (_SegmentSize - 1)
    const location = segment[segmentOffset]!
    return location < this.getNumData() && outputId === this._outputData[location]!.outputId
      ? location
      : Vdf_ExecutorDataVector.InvalidHandle
  }

  /** GetBufferData (executorDataVector.h:80-82). */
  getBufferData(handle: number): VdfExecutorBufferData {
    return this._bufferData[handle]!
  }

  /** GetInvalidationData (executorDataVector.h:90-92). */
  getInvalidationData(handle: number): VdfExecutorInvalidationData {
    return this._invalidationData[handle]!
  }

  /** GetInvalidationTimestamp (executorDataVector.h:100-103). */
  getInvalidationTimestamp(handle: number): number {
    return this._outputData[handle]!.invalidationTimestamp
  }

  /** SetInvalidationTimestamp (executorDataVector.h:110-114). */
  setInvalidationTimestamp(handle: number, ts: number): void {
    this._outputData[handle]!.invalidationTimestamp = ts
  }

  /** GetSMBLData (executorDataVector.h:123-125). */
  getSMBLData(handle: number): VdfSMBLData | null {
    return this._smblData[handle]!
  }

  /** GetOrCreateSMBLData (executorDataVector.h:133-138). */
  getOrCreateSMBLData(handle: number): VdfSMBLData {
    let smblData = this._smblData[handle]
    if (!smblData) {
      smblData = new VdfSMBLData()
      this._smblData[handle] = smblData
    }
    return smblData
  }

  /** IsTouched (executorDataVector.h:146-148). */
  isTouched(handle: number): boolean {
    return this._outputData[handle]!.touched
  }

  /** Touch (executorDataVector.h:156-158). */
  touch(handle: number): void {
    this._outputData[handle]!.touched = true
  }

  /** Untouch (executorDataVector.h:166-170). */
  untouch(handle: number): boolean {
    const data = this._outputData[handle]!
    const wasTouched = data.touched
    data.touched = false
    return wasTouched
  }

  /** GetSize (executorDataVector.h:174-176). */
  getSize(): number {
    return this._locations.length
  }

  /** GetNumData (executorDataVector.h:180-182). */
  getNumData(): number {
    return this._bufferData.length
  }

  /** Reset (executorDataVector.h:325-332). */
  Reset(handle: number, outputId: number): void {
    this._outputData[handle]!.Reset(outputId)
    this._bufferData[handle]!.Reset()
    this._invalidationData[handle]!.Reset()
    this._smblData[handle] = null
  }

  /** Clear (executorDataVector.cpp:88-117). */
  clear(): void {
    if (this.getNumData() === 0) {
      return
    }

    this._outputData = []
    this._bufferData = []
    this._invalidationData = []
    this._smblData = []
  }

  /** _CreateSegment (executorDataVector.cpp:119-139). */
  private _createSegment(segmentIndex: number): Uint32Array {
    TF_DEV_AXIOM(this._locations[segmentIndex] === null, '_locations[segmentIndex] == nullptr')

    const segment = new Uint32Array(_SegmentSize)
    this._locations[segmentIndex] = segment
    return segment
  }

  /** _CreateData (executorDataVector.h:334-341). */
  private _createData(outputId: number): void {
    this._outputData.push(new _OutputData(outputId))
    this._bufferData.push(new VdfExecutorBufferData())
    this._invalidationData.push(new VdfExecutorInvalidationData())
    this._smblData.push(null)
  }
}
