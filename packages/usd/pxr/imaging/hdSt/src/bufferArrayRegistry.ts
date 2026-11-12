// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/bufferArrayRegistry.cpp,
//  pxr/imaging/hdSt/bufferArrayRegistry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/bufferArrayRegistry.{h,cpp} (OpenUSD 26.11.1).
//
// Manages the pool of buffer arrays.
//
// Divergences:
// - Single-threaded: the entry lock / condition variable and the
//   expected-tail check of _InsertNewBufferArray have nothing to guard.
// - std::list is an array; insert-before is splice.
// - operator<< is GetDebugString.

import type {
  BufferArray as HdBufferArray,
  BufferArrayRange as HdBufferArrayRange,
  BufferArrayUsageHint as HdBufferArrayUsageHint,
  BufferSpec as HdBufferSpec,
} from 'typescript-usd/hd'
import type { Dictionary as VtDictionary } from 'typescript-usd/vt'
import type { HdStAggregationId, HdStAggregationStrategy } from './strategyBase.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** bufferArrayRegistry.h:92-102 */
interface _Entry {
  bufferArrays: HdBufferArray[]
}

/** bufferArrayRegistry.h:38-138 */
export class HdStBufferArrayRegistry {
  private readonly _entries = new Map<HdStAggregationId, _Entry>()

  /** bufferArrayRegistry.cpp:19-123. Allocate new buffer array range using
   *  strategy. */
  allocateRange(
    strategy: HdStAggregationStrategy | null,
    role: string,
    bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint,
  ): HdBufferArrayRange | null {
    if (!strategy) {
      TF_CODING_ERROR('Aggregation strategy is set to null')
      return null
    }

    // early out for empty specs
    if (bufferSpecs.length === 0) {
      return null
    }

    // compute an aggregation Id on current aggregation strategy
    const aggrId = strategy.computeAggregationId(bufferSpecs, usageHint)

    let entry = this._entries.get(aggrId)
    if (!entry) {
      entry = { bufferArrays: [] }
      this._entries.set(aggrId, entry)
      // We just created a new entry so make sure it has a buffer in it.
      this._insertNewBufferArray(entry, null, strategy, role, bufferSpecs, usageHint)
    }

    const range = strategy.createBufferArrayRange()

    // Try to find where to insert the range.
    // while no new slots can free up during allocate,
    // garbage collection may create empty slots in entries.
    // So we have to go through the list to find slots.
    let it = 0
    let numIterations = 0
    do {
      const currentArray = entry.bufferArrays[it]!

      if (!currentArray.tryAssignRange(range)) {
        const prev = it
        ++it

        if (it === entry.bufferArrays.length) {
          // Reached end of buffer list, so try to insert new buffer
          this._insertNewBufferArray(entry, currentArray, strategy, role,
                                     bufferSpecs, usageHint)
          it = prev
          ++it
        }
      }

      if (++numIterations > 100) {
        TF_WARN('Too many iterations in attempting to assign range ' +
                `containing buffer ${bufferSpecs[0]!.name}, likely due to invalid ` +
                'buffer array size.')
        break
      }
    } while (!range.isAssigned())

    if (!range.isAssigned()) {
      return null
    }

    return range
  }

  /** bufferArrayRegistry.cpp:126-196. Triggers reallocation on all buffers
   *  managed by the registry. */
  reallocateAll(strategy: HdStAggregationStrategy): void {
    for (const entry of this._entries.values()) {
      for (let bufferIt = 0; bufferIt < entry.bufferArrays.length; ++bufferIt) {
        const bufferArray = entry.bufferArrays[bufferIt]!
        if (!bufferArray.needsReallocation()) continue

        // in case of over aggregation, split the buffer

        bufferArray.removeUnusedRanges()

        const maxTotalElements = bufferArray.getMaxNumElements()
        let numTotalElements = 0

        const rangeCount = bufferArray.getRangeCount()
        let ranges: HdBufferArrayRange[] = []

        for (let rangeIdx = 0; rangeIdx < rangeCount; ++rangeIdx) {
          const range = bufferArray.getRange(rangeIdx)

          if (!range || range._expired) continue // shouldn't exist

          const numElements = range.getNumElements()

          if (numElements > maxTotalElements) {
            // Issue a warning and reset number of elements in the BAR.
            TF_WARN('Number of elements in the buffer array range ' +
                    `(0x${numElements.toString(16)}) is _larger_ than the maximum ` +
                    'number of elements in the buffer array ' +
                    `(0x${maxTotalElements.toString(16)}). ` +
                    `0x${(numElements - maxTotalElements).toString(16)} bytes ` +
                    'of data will be skipped.')

            range.resize(maxTotalElements)
          }

          // over aggregation check of non-uniform buffer
          if (numTotalElements + numElements > maxTotalElements) {
            // create new BufferArray with same specification
            const bufferSpecs = strategy.getBufferSpecs(bufferArray)
            const usageHint = bufferArray.getUsageHint()

            const newBufferArray = strategy.createBufferArray(
              bufferArray.getRole(), bufferSpecs, usageHint)
            newBufferArray.reallocate(ranges, bufferArray)

            // bufferArrays is std::list: insert before bufferIt
            entry.bufferArrays.splice(bufferIt, 0, newBufferArray)
            ++bufferIt

            numTotalElements = 0
            ranges = []
          }

          numTotalElements += numElements
          ranges.push(range)
        }

        bufferArray.reallocate(ranges, bufferArray)
      }
    }
  }

  /** bufferArrayRegistry.cpp:198-222. Frees up buffers that no longer
   *  contain any allocated ranges. */
  garbageCollect(): void {
    for (const [aggrId, entry] of [...this._entries]) {
      entry.bufferArrays = entry.bufferArrays.filter(bufferArray => {
        if (bufferArray.garbageCollect()) {
          bufferArray.destroy()
          return false
        }
        return true
      })

      if (entry.bufferArrays.length === 0) {
        this._entries.delete(aggrId)
      }
    }
  }

  /** bufferArrayRegistry.cpp:224-238. Generate a report on resources
   *  consumed by the managed buffer array. The returned size is an esitmate
   *  of the gpu memory consumed by the buffers. */
  getResourceAllocation(strategy: HdStAggregationStrategy, result: VtDictionary): number {
    let gpuMemoryUsed = 0
    for (const entry of this._entries.values()) {
      for (const bufferArray of entry.bufferArrays) {
        gpuMemoryUsed += strategy.getResourceAllocation(bufferArray, result)
      }
    }

    return gpuMemoryUsed
  }

  /** bufferArrayRegistry.cpp:240-270. Adds a new buffer to an entry. */
  private _insertNewBufferArray(
    entry: _Entry,
    expectedTail: HdBufferArray | null,
    strategy: HdStAggregationStrategy,
    role: string,
    bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint,
  ): void {
    // Check state of list, still matches what is expected.
    if (entry.bufferArrays.length > 0) {
      if (entry.bufferArrays[entry.bufferArrays.length - 1] !== expectedTail) {
        return
      }
    } else {
      // This shouldn't ever happen, because where did the expected tail
      // come from if it wasn't in the list???
      TF_VERIFY(!expectedTail)
    }

    entry.bufferArrays.push(strategy.createBufferArray(role, bufferSpecs, usageHint))
  }

  /** bufferArrayRegistry.cpp:273-290 operator<< */
  getDebugString(): string {
    let out = 'HdStBufferArrayRegistry :\n'
    for (const [aggrId, entry] of this._entries) {
      out += `  _Entry aggrId = ${aggrId}: \n`

      let bufferNum = 0
      for (const _ of entry.bufferArrays) {
        out += `HdBufferArray ${bufferNum}\n`
        bufferNum++
      }
    }
    return out
  }
}
