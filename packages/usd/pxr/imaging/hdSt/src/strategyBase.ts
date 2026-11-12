// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/strategyBase.cpp,
//  pxr/imaging/hdSt/strategyBase.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/strategyBase.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - AggregationId is a string: it is only a cache key in
//   HdStBufferArrayRegistry, so any stable value serves.
// - GetResourceAllocation fills the given VtDictionary as upstream does.

import type {
  BufferArray as HdBufferArray,
  BufferArrayRange as HdBufferArrayRange,
  BufferArrayUsageHint as HdBufferArrayUsageHint,
  BufferSpec as HdBufferSpec,
} from 'typescript-usd/hd'
import { Value as VtValue, ValueTypes as VtValueTypes, type Dictionary as VtDictionary } from 'typescript-usd/vt'

/** strategyBase.h:34 */
export type HdStAggregationId = string

/** strategyBase.h:31-67. Aggregation strategy base class. */
export abstract class HdStAggregationStrategy {
  /** strategyBase.h:40-43. Factory for creating HdBufferArray. */
  abstract createBufferArray(
    role: string,
    bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdBufferArray

  /** strategyBase.h:46. Factory for creating HdBufferArrayRange. */
  abstract createBufferArrayRange(): HdBufferArrayRange

  /** strategyBase.h:50-52. Returns id for given bufferSpecs to be used for
   *  aggregation. */
  abstract computeAggregationId(
    bufferSpecs: readonly HdBufferSpec[],
    usageHint: HdBufferArrayUsageHint): HdStAggregationId

  /** strategyBase.h:55-56. Returns the buffer specs from a given buffer
   *  array. */
  abstract getBufferSpecs(bufferArray: HdBufferArray): HdBufferSpec[]

  /** strategyBase.h:60-62. Returns the accumulated GPU resource allocation
   *  for items in the BufferArray passed as parameter. */
  abstract getResourceAllocation(bufferArray: HdBufferArray, result: VtDictionary): number

  /** strategyBase.h:66. (Optional) called to flush consolidated / staging
   *  buffers. */
  flush(): void {}
}

/** The key part of TfHash::Combine(salt, bufferSpecs, usageHint)
 *  (vboMemoryManager.cpp:62-73 and siblings) as a string. */
export function HdSt_AggregationIdOf(
  salt: string,
  bufferSpecs: readonly HdBufferSpec[],
  usageHint: HdBufferArrayUsageHint,
): HdStAggregationId {
  let key = `${salt}|${usageHint}`
  for (const s of bufferSpecs) {
    key += `|${s.name}:${s.tupleType.type}:${s.tupleType.count}`
  }
  return key
}

/** VtValue(size_t): a uint64 VtValue holding a JS number. */
export function HdSt_SizeValue(size: number): VtValue {
  return VtValue.create(size, VtValueTypes.uint64)
}

/** The size_t held by a VtDictionary entry, or `def`
 *  (VtDictionaryGet<size_t>(dict, key, VtDefault = def)). */
export function HdSt_GetSize(result: VtDictionary, key: string, def = 0): number {
  const v = result.get(key)
  return v && !v.IsEmpty() ? Number(v.Get<number>()) : def
}

/** The per-role tally of the memory managers' GetResourceAllocation
 *  (vboMemoryManager.cpp:87-123 and siblings): the size of each distinct GPU
 *  buffer of `resources`, accumulated under its role. `skipEmpty` skips
 *  resources without a buffer (vboSimpleMemoryManager.cpp:96-99). */
export function HdSt_TallyResources(
  resources: Iterable<readonly [string, {
    getHandle(): { Get(): { getRawResource(): unknown } | null }
    getRole(): string
    getSize(): number
  }]>,
  result: VtDictionary,
  skipEmpty: boolean,
): number {
  const idSet = new Set<unknown>()
  let gpuMemoryUsed = 0
  for (const [, resource] of resources) {
    const buffer = resource.getHandle().Get()
    // XXX avoid double counting of resources shared within a buffer
    const id = buffer ? buffer.getRawResource() ?? buffer : 0
    if (skipEmpty && id === 0) continue
    if (!idSet.has(id)) {
      idSet.add(id)
      const role = resource.getRole()
      const size = resource.getSize()
      if (result.count(role)) {
        result.set(role, HdSt_SizeValue(HdSt_GetSize(result, role) + size))
      } else {
        result.set(role, HdSt_SizeValue(size))
      }
      gpuMemoryUsed += size
    }
  }
  return gpuMemoryUsed
}
