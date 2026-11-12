// Ported from OpenUSD 26.11.1: pxr/exec/vdf/maskedOutputVector.cpp,
//  pxr/exec/vdf/maskedOutputVector.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/maskedOutputVector.h and
// maskedOutputVector.cpp.

import { HashCombine as TfHashCombine } from 'typescript-usd/tf'

import { VdfMaskedOutput, Vdf_MaskedOutputKey } from './maskedOutput.ts'
import type { VdfNetwork } from './network.ts'
import { VdfOutput } from './output.ts'

/** VdfMaskedOutputVector (maskedOutputVector.h:26). */
export type VdfMaskedOutputVector = VdfMaskedOutput[]

/**
 * VdfMaskedOutputVector_Hash (maskedOutputVector.h:30-51): hashes the size,
 * up to three leading entries and the last entry.
 */
export function VdfMaskedOutputVector_Hash(vector: readonly VdfMaskedOutput[]): number {
  const combine = (...v: number[]): number =>
    Number(BigInt.asUintN(53, TfHashCombine(...v)))
  let hash = combine(vector.length)
  const num = Math.min(vector.length, 3)
  for (let i = 0; i < num; ++i) {
    hash = combine(hash, VdfMaskedOutput.Hash(vector[i]!))
  }
  if (vector.length > 3) {
    hash = combine(hash, VdfMaskedOutput.Hash(vector[vector.length - 1]!))
  }
  return hash
}

/**
 * The canonical key of a VdfMaskedOutputVector for JS Maps (the map in
 * VdfSparseOutputTraverser keyed by sorted requests).
 */
export function Vdf_MaskedOutputVectorKey(vector: readonly VdfMaskedOutput[]): string {
  return vector.map(Vdf_MaskedOutputKey).join('|')
}

/**
 * VdfSortAndUniqueMaskedOutputVector (maskedOutputVector.cpp:43-56): sorts by
 * output index and removes consecutive equal entries. Upstream's
 * WorkParallelSort is not stable; this sort is, which is one of its valid
 * outcomes.
 */
export function VdfSortAndUniqueMaskedOutputVector(vector: VdfMaskedOutput[]): void {
  if (vector.length <= 1) return

  // VdfMaskedOutputVector_SortPredicate (maskedOutputVector.cpp:29-39).
  vector.sort((lhs, rhs) =>
    VdfOutput.getIndexFromId(lhs.GetOutput()!.getId()) -
    VdfOutput.getIndexFromId(rhs.GetOutput()!.getId()))

  // std::unique
  let w = 0
  for (let r = 1; r < vector.length; ++r) {
    if (!vector[w]!.Equals(vector[r]!)) {
      vector[++w] = vector[r]!
    }
  }
  vector.length = w + 1
}

/**
 * VdfGetMaskedOutputVectorNetwork (maskedOutputVector.cpp:58-64): the
 * network of the first output, or null for an empty vector.
 */
export function VdfGetMaskedOutputVectorNetwork(
  vector: readonly VdfMaskedOutput[]): VdfNetwork | null {
  return vector.length ? vector[0]!.GetOutput()!.getNode().getNetwork() : null
}
