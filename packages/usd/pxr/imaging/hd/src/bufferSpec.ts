// Ported from OpenUSD 26.11.1: pxr/imaging/hd/bufferSpec.cpp,
//  pxr/imaging/hd/bufferSpec.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/bufferSpec.{h,cpp} (OpenUSD 26.11.1).
//
// A HdBufferSpec names one channel of a buffer array and gives its element
// type: { name, tupleType }. A *vector* of specs describes the full layout of a
// buffer array (e.g. points:FloatVec3, normals:FloatVec3).
//
// Divergences:
// - The struct is a plain `{ name, tupleType }` interface; its static members
//   and operators live on the `HdBufferSpec` namespace object and the
//   HdBufferSpecEquals / HdBufferSpecLess functions.
// - Out-parameters are return values (GetBufferSpecs also appends to an
//   optional `bufferSpecs` vector, as upstream does).
// - Dump returns its text instead of writing to std::cout.
// - ComputeHash (not upstream) is a stable, order-independent cache key over a
//   spec vector, kept for existing callers.

import { Hash as TfHash } from 'typescript-usd/tf'
import { type HdTupleType, HdTupleTypeEquals, HdTupleTypeLess, HdType } from './types.ts'

export interface HdBufferSpec {
  name: string
  tupleType: HdTupleType
}

/** The source side of HdBufferSpec::GetBufferSpecs (bufferSpec.h:42-50). */
interface _HdBufferSpecSource {
  isValid?(): boolean
  getBufferSpecs(): HdBufferSpec[]
}

/** bufferSpec.h:89-91 operator== */
export function HdBufferSpecEquals(a: HdBufferSpec, b: HdBufferSpec): boolean {
  return a.name === b.name && HdTupleTypeEquals(a.tupleType, b.tupleType)
}

/** bufferSpec.h:97-100 operator< */
export function HdBufferSpecLess(a: HdBufferSpec, b: HdBufferSpec): boolean {
  return a.name < b.name || (a.name === b.name &&
    HdTupleTypeLess(a.tupleType, b.tupleType))
}

function _find(specs: readonly HdBufferSpec[], spec: HdBufferSpec): boolean {
  return specs.some(s => HdBufferSpecEquals(s, spec))
}

export const HdBufferSpec = {
  /** bufferSpec.h:42-50. Appends the specs of every valid source. */
  getBufferSpecs(
    sources: readonly _HdBufferSpecSource[],
    bufferSpecs: HdBufferSpec[] = [],
  ): HdBufferSpec[] {
    for (const src of sources) {
      if (src.isValid?.() ?? true) {
        bufferSpecs.push(...src.getBufferSpecs())
      }
    }
    return bufferSpecs
  },

  /** bufferSpec.cpp:17-29 */
  isSubset(subset: readonly HdBufferSpec[], superset: readonly HdBufferSpec[]): boolean {
    for (const spec of subset) {
      if (!_find(superset, spec)) return false
    }
    return true
  },

  /** bufferSpec.cpp:31-56 */
  computeUnion(specs1: readonly HdBufferSpec[], specs2: readonly HdBufferSpec[]): HdBufferSpec[] {
    const r: HdBufferSpec[] = []
    for (const s of specs1) {
      if (_find(r, s)) continue
      r.push(s)
    }
    for (const s of specs2) {
      if (_find(r, s)) continue
      r.push(s)
    }
    return r
  },

  /** bufferSpec.cpp:58-80 */
  computeDifference(specs1: readonly HdBufferSpec[], specs2: readonly HdBufferSpec[]): HdBufferSpec[] {
    const r: HdBufferSpec[] = []
    for (const s of specs1) {
      if (_find(specs2, s)) continue
      if (_find(r, s)) continue
      r.push(s)
    }
    return r
  },

  /** bufferSpec.cpp:88-99. Returns the text upstream writes to std::cout. */
  dump(specs: readonly HdBufferSpec[]): string {
    let out = 'BufferSpecVector\n'
    for (let i = 0; i < specs.length; ++i) {
      const s = specs[i]!
      out += `${i} : ${s.name}, ${HdType[s.tupleType.type]} (${s.tupleType.type}), ` +
        `${s.tupleType.count}\n`
    }
    return out
  },

  /** bufferSpec.cpp:82-86 HdBufferSpec::Hash (TfHashAppend, bufferSpec.h:107-112). */
  Hash(spec: HdBufferSpec): bigint {
    return TfHash([spec.name, [BigInt(spec.tupleType.type), BigInt(spec.tupleType.count)]])
  },

  // A stable, order-independent hash of a spec vector (not upstream; kept
  // for existing callers as a cache key). FNV-1a over the sorted
  // name/type/count triples.
  computeHash(specs: readonly HdBufferSpec[]): number {
    const sorted = [...specs].sort((a, b) => (HdBufferSpecLess(a, b) ? -1 : HdBufferSpecLess(b, a) ? 1 : 0))
    let h = 0x811c9dc5
    const mix = (n: number): void => {
      h ^= n & 0xff;        h = Math.imul(h, 0x01000193)
      h ^= (n >>> 8) & 0xff; h = Math.imul(h, 0x01000193)
      h ^= (n >>> 16) & 0xff; h = Math.imul(h, 0x01000193)
      h ^= (n >>> 24) & 0xff; h = Math.imul(h, 0x01000193)
    }
    for (const s of sorted) {
      for (let i = 0; i < s.name.length; i++) { h ^= s.name.charCodeAt(i); h = Math.imul(h, 0x01000193) }
      mix(s.tupleType.type)
      mix(s.tupleType.count)
    }
    return h >>> 0
  },
}
