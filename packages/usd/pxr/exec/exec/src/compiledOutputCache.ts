// Ported from OpenUSD 26.11.1: pxr/exec/exec/compiledOutputCache.cpp,
//  pxr/exec/exec/compiledOutputCache.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/compiledOutputCache.h and
// compiledOutputCache.cpp.
//
// The output map, keyed by Exec_OutputKey::Identity with TfHash, is an
// Exec_HashKeyedMap (GetHash/Equals); the reverse map keyed by VdfId is a JS
// Map keyed by the id number.

import { TF_VERIFY } from 'typescript-usd/tf'

import { VdfMaskedOutput } from 'typescript-usd/vdf'

import { Exec_HashKeyedMap } from './compilerTaskSync.ts'
import type { Exec_OutputKey } from './outputKey.ts'

/**
 * The output cache stores a compiled masked output for a given output key
 * (compiledOutputCache.h:25-98).
 */
export class Exec_CompiledOutputCache {
  // compiledOutputCache.h:83 (unused upstream as well).
  private readonly _invalidMaskedOutput = new VdfMaskedOutput()

  // Maps each output key to its masked output and compilation version.
  private readonly _outputMap =
    new Exec_HashKeyedMap<Exec_OutputKey.Identity, Exec_CompiledOutputCache.MappedType>()

  // Maps nodes to output keys, for "reverse" lookups into the output map, so
  // we can identify which masked outputs need to be purged in response to
  // uncompilation.
  private readonly _reverseMap = new Map<number, Exec_OutputKey.Identity[]>()

  /**
   * Insert a masked output corresponding to the output key
   * (compiledOutputCache.cpp:17-40). Returns true if a new mapping was
   * inserted, or false if a mapping already existed for `key`, in which case
   * the existing mapping is not modified.
   */
  insert(
    key: Exec_OutputKey.Identity,
    maskedOutput: VdfMaskedOutput,
    compilationVersion: number,
  ): boolean {
    const inserted = this._outputMap.emplace(
      key, new Exec_CompiledOutputCache.MappedType(maskedOutput, compilationVersion))
    if (!inserted) {
      return false
    }

    // We expect that the caller provided a non-null VdfOutput. If not, we
    // still inserted the entry and must return true here.
    const output = maskedOutput.GetOutput()
    if (!TF_VERIFY(output, 'maskedOutput.GetOutput()')) {
      return true
    }

    const nodeId = output!.getNode().getId()
    let keys = this._reverseMap.get(nodeId)
    if (!keys) {
      keys = []
      this._reverseMap.set(nodeId, keys)
    }
    keys.push(key)
    return true
  }

  /**
   * Find a masked output in the compiled output cache
   * (compiledOutputCache.cpp:42-51). Returns the mapped value for `key`, or
   * null if it does not exist.
   */
  find(key: Exec_OutputKey.Identity): Exec_CompiledOutputCache.MappedType | null {
    return this._outputMap.find(key) ?? null
  }

  /**
   * Erases all entries whose VdfMaskedOutputs are owned by the node with id
   * `nodeId` (compiledOutputCache.cpp:53-69).
   */
  eraseByNodeId(nodeId: number): void {
    const keys = this._reverseMap.get(nodeId)

    // Not finding an entry in the reverse map is not an error, because there
    // are a couple instances where nodes won't have any output keys associated
    // with them (e.g. leaf nodes, value conversion nodes).
    if (keys === undefined) {
      return
    }

    for (const key of keys) {
      this._outputMap.erase(key)
    }
    this._reverseMap.delete(nodeId)
  }
}

export namespace Exec_CompiledOutputCache {
  /**
   * The information stored with each output key in the cache
   * (compiledOutputCache.h:30-45).
   */
  export class MappedType {
    /** The compiled output. */
    readonly output: VdfMaskedOutput
    /** The compilation version at the time the output was added. */
    readonly compilationVersion: number

    constructor(output: VdfMaskedOutput, compilationVersion: number) {
      this.output = output
      this.compilationVersion = compilationVersion
    }
  }
}
