// Ported from OpenUSD 26.11.1: pxr/exec/vdf/compressedIndexMapping.cpp,
//  pxr/exec/vdf/compressedIndexMapping.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/compressedIndexMapping.h and
// compressedIndexMapping.cpp.
//
// Out-parameters (openexec-x1.md section 4, convention 6): FindDataIndex's
// in/out block hint is an object `{ value }`; ComputeDataIndex returns the
// data index or -1; FindBlockRange returns [firstBlockIdx, lastBlockIdx].

import { TF_DEV_AXIOM, TF_VERIFY, type TfCompressedBits } from 'typescript-usd/tf'

/**
 * A mapping that relates logical blocks of indices to actual stored data
 * (compressedIndexMapping.h:19-37).
 */
export interface Vdf_IndexBlockMapping {
  // The first logical index of the block of contiguous elements.
  logicalStartIndex: number
  // The index into packed raw storage of the element AFTER the final element
  // in this block of logically contiguous elements.
  dataEndIndex: number
}

/** An in/out block hint for Vdf_CompressedIndexMapping.FindDataIndex. */
export interface Vdf_BlockHint {
  value: number
}

// std::upper_bound over the blocks' logicalStartIndex.
function _UpperBound(mappings: readonly Vdf_IndexBlockMapping[], logicalIdx: number): number {
  let lo = 0
  let hi = mappings.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (logicalIdx < mappings[mid]!.logicalStartIndex) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return lo
}

/**
 * All the info required to take a logical index into a compressed VdfVector
 * and obtain a raw index into packed storage (compressedIndexMapping.h:39-131).
 */
export class Vdf_CompressedIndexMapping {
  _blockMappings: Vdf_IndexBlockMapping[] = []

  /** Copy constructor. */
  Clone(): Vdf_CompressedIndexMapping {
    const copy = new Vdf_CompressedIndexMapping()
    copy._blockMappings = this._blockMappings.map((m) => ({ ...m }))
    return copy
  }

  /**
   * Computes a mapping with block layout that matches the bits set in `bits`
   * (compressedIndexMapping.cpp:17-70).
   */
  initialize(bits: TfCompressedBits): void {
    if (!TF_VERIFY(bits.getFirstSet() < bits.getSize(), 'bits.GetFirstSet() < bits.GetSize()')) {
      return
    }
    this._blockMappings = new Array<Vdf_IndexBlockMapping>(bits.getNumSetPlatforms())
    let currentBlockIdx = 0
    let currentDataIdx = 0
    const platforms = bits.getPlatformsView()
    for (const it = platforms.begin(), e = platforms.end(); !it.Equals(e); it.increment()) {
      // Skip unset platforms
      if (!it.isSet()) {
        continue
      }
      currentDataIdx += it.getPlatformSize()
      this._blockMappings[currentBlockIdx] = {
        logicalStartIndex: it.Get(),
        dataEndIndex: currentDataIdx,
      }
      ++currentBlockIdx
    }
    // compressedIndexMapping.cpp:55-69 (TF_DEV_BUILD sanity checks).
    for (const m of this._blockMappings) {
      TF_DEV_AXIOM(m.logicalStartIndex >= bits.getFirstSet(), 'lsi >= bits.GetFirstSet()')
      TF_DEV_AXIOM(m.logicalStartIndex <= bits.getLastSet(), 'lsi <= bits.GetLastSet()')
      TF_DEV_AXIOM(m.dataEndIndex > 0, 'dei > 0')
      TF_DEV_AXIOM(m.dataEndIndex <= bits.getNumSet(), 'dei <= bits.GetNumSet()')
    }
  }

  /**
   * Finds the raw data index corresponding to the given logical element
   * index. The block in `blockHint` is checked first; the containing block
   * is returned in `blockHint` (compressedIndexMapping.cpp:72-104).
   */
  findDataIndex(logicalIdx: number, blockHint: Vdf_BlockHint): number {
    const blockIdx = blockHint.value
    let dataIdx = this.computeDataIndex(blockIdx, logicalIdx)
    if (dataIdx >= 0) {
      return dataIdx
    }
    // Try the *next* block, if there is one.
    if (blockIdx + 1 < this._blockMappings.length) {
      dataIdx = this.computeDataIndex(blockIdx + 1, logicalIdx)
      if (dataIdx >= 0) {
        blockHint.value = blockIdx + 1
        return dataIdx
      }
    }
    // Search for the right block using a binary search.
    blockHint.value = this.findBlockIndex(logicalIdx)
    dataIdx = this.computeDataIndex(blockHint.value, logicalIdx)
    TF_VERIFY(dataIdx >= 0, 'ComputeDataIndex(blockIdx, logicalIdx, &dataIdx)',
      `Expected block (${blockHint.value}) does not contain logical index (${logicalIdx})`)
    return dataIdx
  }

  /**
   * Returns the index of the block containing the given logical element
   * index (compressedIndexMapping.cpp:106-121).
   */
  findBlockIndex(logicalIdx: number): number {
    TF_DEV_AXIOM(this._blockMappings.length > 0, '!_blockMappings.empty()')
    return _UpperBound(this._blockMappings, logicalIdx) - 1
  }

  /**
   * Returns the data index of `logicalIndex` if it is in the range of the
   * given block, else -1 (compressedIndexMapping.cpp:123-138).
   */
  computeDataIndex(blockIndex: number, logicalIndex: number): number {
    const block = this._blockMappings[blockIndex]
    if (!block) {
      return -1
    }
    const blockStartIdx = this.getBlockFirstIndex(blockIndex)
    const dataStartIdx = blockIndex === 0 ? 0 : this._blockMappings[blockIndex - 1]!.dataEndIndex
    const dataEndIdx = block.dataEndIndex
    const dataIdx = dataStartIdx + logicalIndex - blockStartIdx
    // Upstream compares size_t values, so an index before the block wraps
    // around and fails the range check.
    if (dataIdx >= dataStartIdx && dataIdx < dataEndIdx) {
      return dataIdx
    }
    return -1
  }

  /** Returns the first logical index mapped by the given block (compressedIndexMapping.cpp:140-144). */
  getBlockFirstIndex(blockIdx: number): number {
    return this._blockMappings[blockIdx]!.logicalStartIndex
  }

  /** Returns the last logical index mapped by the given block (compressedIndexMapping.cpp:146-157). */
  getBlockLastIndex(blockIdx: number): number {
    return this.getBlockFirstIndex(blockIdx) + this.getBlockLength(blockIdx) - 1
  }

  /** compressedIndexMapping.cpp:159-164 */
  getBlockLength(blockIdx: number): number {
    return this._blockMappings[blockIdx]!.dataEndIndex -
      (blockIdx === 0 ? 0 : this._blockMappings[blockIdx - 1]!.dataEndIndex)
  }

  /**
   * Returns the range of blocks that intersect the given logical index range
   * as [firstBlockIdx, lastBlockIdx] (compressedIndexMapping.cpp:166-194).
   */
  findBlockRange(first: number, last: number): [number, number] {
    let firstBlockIdx = _UpperBound(this._blockMappings, first) - 1
    if (first > this.getBlockLastIndex(firstBlockIdx)) {
      firstBlockIdx++
    }
    const lastBlockIdx = _UpperBound(this._blockMappings, last) - 1
    return [firstBlockIdx, lastBlockIdx]
  }

  /** Returns the first logical index in the entire mapping (compressedIndexMapping.h:112-115). */
  getFirstIndex(): number {
    return this.getBlockFirstIndex(0)
  }

  /** Returns the last logical index in the entire mapping (compressedIndexMapping.h:117-120). */
  getLastIndex(): number {
    return this.getBlockLastIndex(this._blockMappings.length - 1)
  }

  /**
   * Appends to `bits` a bit for each of `num` indices, set for each index
   * contained in the mapping (compressedIndexMapping.cpp:196-220).
   */
  computeStoredBits(bits: TfCompressedBits, num: number): void {
    let lastIndex = 0
    for (let b = 0; b < this._blockMappings.length; ++b) {
      const first = this.getBlockFirstIndex(b)
      const len = this.getBlockLength(b)
      bits.append(first - lastIndex, false)
      bits.append(len, true)
      lastIndex = first + len
    }
    bits.append(num - lastIndex, false)
  }
}
