// Ported from OpenUSD 26.11.1: pxr/exec/vdf/inputAndOutputSpecsRegistry.cpp,
//  pxr/exec/vdf/inputAndOutputSpecsRegistry.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/inputAndOutputSpecsRegistry.h and
// inputAndOutputSpecsRegistry.cpp.
//
// A per-network registry of shared, reference-counted VdfInputAndOutputSpecs.
// Upstream's tbb::concurrent_hash_map keyed by value (hash + equality,
// inputAndOutputSpecsRegistry.h:53-68) is a Map from GetHash() to a bucket of
// entries compared with operator==.

import { TF_VERIFY } from 'typescript-usd/tf'

import type { VdfInputSpecs, VdfOutputSpecs } from './connectorSpecs.ts'
import { VdfInputAndOutputSpecs } from './inputAndOutputSpecs.ts'

interface _Entry {
  readonly specs: VdfInputAndOutputSpecs
  refCount: number
}

export class Vdf_InputAndOutputSpecsRegistry {
  // _specsTable (inputAndOutputSpecsRegistry.h:66-68).
  private readonly _specsTable = new Map<number, _Entry[]>()

  /**
   * AcquireSharedSpecs (inputAndOutputSpecsRegistry.cpp:11-33): returns the
   * shared specs equal to (inputSpecs, outputSpecs), incrementing its
   * reference count, or inserts a new entry with a count of one.
   */
  acquireSharedSpecs(
    inputSpecs: VdfInputSpecs,
    outputSpecs: VdfOutputSpecs): VdfInputAndOutputSpecs {
    const key = new VdfInputAndOutputSpecs(inputSpecs, outputSpecs)
    const hash = key.getHash()
    let bucket = this._specsTable.get(hash)
    if (!bucket) {
      bucket = []
      this._specsTable.set(hash, bucket)
    }
    for (const entry of bucket) {
      if (entry.specs.Equals(key)) {
        ++entry.refCount
        return entry.specs
      }
    }
    bucket.push({ specs: key, refCount: 1 })
    return key
  }

  /**
   * ReleaseSharedSpecs (inputAndOutputSpecsRegistry.cpp:35-80): decrements the
   * reference count and erases the entry when it reaches zero. Null specs are
   * allowed.
   */
  releaseSharedSpecs(specs: VdfInputAndOutputSpecs | null): void {
    if (!specs) return

    const hash = specs.getHash()
    const bucket = this._specsTable.get(hash)
    const index = bucket ? bucket.findIndex(e => e.specs.Equals(specs)) : -1
    if (!TF_VERIFY(bucket && index >= 0, '_specsTable.find(accessor, *specs)')) {
      return
    }
    const entry = bucket![index]!
    if (!TF_VERIFY(specs === entry.specs, 'specs == &accessor->first')) {
      return
    }
    if (--entry.refCount === 0) {
      bucket!.splice(index, 1)
      if (bucket!.length === 0) this._specsTable.delete(hash)
    }
  }
}
