// Ported from OpenUSD 26.11.1: pxr/exec/vdf/dataManagerAllocator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/dataManagerAllocator.h.
//
// Single-threaded (doc section 5): the atomics are plain fields, the
// tbb::concurrent_queue free list is an array, and WorkHasConcurrency() is
// false, so DeallocateLater takes upstream's synchronous branch
// (dataManagerAllocator.h:234-237) and the isolating dispatcher never runs.
// The template type T becomes a factory for new instances.

import type { VdfNetwork } from './network.ts'

/** The interface the allocated executor data containers provide. */
export interface Vdf_DataManagerAllocatorData {
  resize(network: VdfNetwork): void
  clear(): void
}

// dataManagerAllocator.h:132-133: the weight applied to new samples of the
// exponential moving average. Must be a positive value between 0 and 1.
const _emaWeight = Math.fround(0.01)

/**
 * Vdf_DataManagerAllocator (dataManagerAllocator.h:39-118): returns executor
 * data containers for use by executor data managers, keeping a free list
 * sized by an exponential moving average of the allocation demand.
 */
export class Vdf_DataManagerAllocator<T extends Vdf_DataManagerAllocatorData> {
  // dataManagerAllocator.h:95: the moving average of allocations (a float).
  private _emaAllocated = 0

  // dataManagerAllocator.h:98: the number of outstanding allocations.
  private _numAllocated = 0

  // dataManagerAllocator.h:104: allocations that will be available on the queue.
  private _numPending = 0

  // dataManagerAllocator.h:107-108: the free list.
  private readonly _available: T[] = []

  private readonly _newData: () => T

  constructor(newData: () => T) {
    this._newData = newData
  }

  /** Allocate (dataManagerAllocator.h:157-186). */
  allocate(network: VdfNetwork): T {
    // Increment the number of allocations made
    ++this._numAllocated

    // Try to grab an existing executor data instance from the free list, or
    // allocate a new one if required.
    let data = this._available.shift()
    if (data === undefined) {
      data = this._newData()
    }

    // Update the number of containers pending availability, if one was taken
    // from the free list.
    else {
      --this._numPending
    }

    // Make sure the container is appropriately sized.
    data.resize(network)

    return data
  }

  /**
   * DeallocateLater (dataManagerAllocator.h:188-238). Without concurrency
   * the release happens synchronously (dataManagerAllocator.h:234-237).
   */
  deallocateLater(data: T | null): void {
    if (!data) {
      return
    }

    const numAllocated = this._numAllocated--
    const shouldDelete = this._shouldDeleteData(numAllocated)
    if (shouldDelete) {
      Vdf_DataManagerAllocator._releaseAndDropData(data)
    } else {
      this._releaseAndReuseData(data)
    }
  }

  /** DeallocateNow (dataManagerAllocator.h:240-259). */
  deallocateNow(data: T | null): void {
    if (!data) {
      return
    }

    const numAllocated = this._numAllocated--
    if (this._shouldDeleteData(numAllocated)) {
      Vdf_DataManagerAllocator._releaseAndDropData(data)
    } else {
      this._releaseAndReuseData(data)
    }
  }

  /** Clear (dataManagerAllocator.h:261-270): drops every instance on the free list. */
  clear(): void {
    this._available.length = 0
  }

  /** _UpdateEstimated (dataManagerAllocator.h:272-300). */
  private _updateEstimated(): number {
    const sample = Math.fround(this._numAllocated)
    const currentEMA = this._emaAllocated

    // Apply the new exponential moving average. We only compute the EMA on
    // the falling edges of the signal.
    const newEMA = sample < currentEMA
      ? Math.fround(Math.fround(currentEMA * Math.fround(1 - _emaWeight)) +
          Math.fround(sample * _emaWeight))
      : sample
    this._emaAllocated = newEMA

    return Math.ceil(newEMA) >>> 0
  }

  /** _ShouldDeleteData (dataManagerAllocator.h:302-314). */
  private _shouldDeleteData(numAllocated: number): boolean {
    const emaAllocated = this._updateEstimated()

    // If we have enough pending containers to fulfill the estimated future
    // allocation demand, we will simply delete the data.
    return (this._numPending + numAllocated) > emaAllocated
  }

  /** _ReleaseAndDropData (dataManagerAllocator.h:316-325): frees the data. */
  private static _releaseAndDropData<T>(_data: T): void {
    // `delete data`: the instance is dropped and garbage collected.
  }

  /** _ReleaseAndReuseData (dataManagerAllocator.h:327-343). */
  private _releaseAndReuseData(data: T): void {
    // Clear the data, prep it for reuse and push it on the free list.
    data.clear()

    ++this._numPending

    this._available.push(data)
  }
}
