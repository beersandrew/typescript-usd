// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/bufferArrayRange.cpp,
//  pxr/imaging/hdSt/bufferArrayRange.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/bufferArrayRange.{h,cpp} (OpenUSD 26.11.1).
//
// The Storm buffer array range: an HdBufferArrayRange whose channels are
// HdStBufferResources.
//
// Divergences:
// - GetResource() and GetResource(name) are one method with an optional name
//   (the empty name is GetResource(), as the hdSt implementations do).
// - GetBufferSpecs returns the specs instead of filling an out vector.

import {
  BufferArrayRange as HdBufferArrayRange,
  PerfLog as HdPerfLog,
  PerfTokens as HdPerfTokens,
  type BufferSpec as HdBufferSpec,
} from 'typescript-usd/hd'
import type { HdStBufferResource, HdStBufferResourceNamedList } from './bufferResource.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** bufferArrayRange.h:42-80 */
export abstract class HdStBufferArrayRange extends HdBufferArrayRange {
  private readonly _resourceRegistry: HdStResourceRegistry

  /** bufferArrayRange.cpp:15-19 */
  constructor(resourceRegistry: HdStResourceRegistry) {
    super()
    this._resourceRegistry = resourceRegistry
  }

  /** bufferArrayRange.h:57-60. Returns the named GPU resource, or with no
   *  (or an empty) name the single GPU resource. */
  abstract getResource(name?: string): HdStBufferResource | null

  /** bufferArrayRange.h:63 */
  abstract getResources(): HdStBufferResourceNamedList

  /** bufferArrayRange.cpp:25-35 */
  override getBufferSpecs(): HdBufferSpec[] {
    const specs: HdBufferSpec[] = []
    for (const [name, res] of this.getResources()) {
      specs.push({ name, tupleType: res.getTupleType() })
    }
    return specs
  }

  /** bufferArrayRange.h:69-71 */
  getElementStride(): number {
    return 0
  }

  /** bufferArrayRange.cpp:37-47 */
  protected getResourceRegistry(): HdStResourceRegistry {
    return this._resourceRegistry
  }
}

/** bufferArrayRange.h:24-25 */
export type HdStBufferArrayRangeSharedPtr = HdStBufferArrayRange

/** bufferArrayRange.h:90-108 */
export class HdStBufferArrayRangeContainer {
  private _ranges: (HdStBufferArrayRange | null)[]

  /** bufferArrayRange.h:94 */
  constructor(size: number) {
    this._ranges = new Array<HdStBufferArrayRange | null>(size).fill(null)
  }

  /** bufferArrayRange.cpp:57-73 */
  Set(index: number, range: HdStBufferArrayRange | null): void {
    if (index < 0) {
      TF_CODING_ERROR('Index negative in HdStBufferArrayRangeContainer::Set()')
      return
    }
    if (index >= this._ranges.length) {
      HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.bufferArrayRangeContainerResized)
      while (this._ranges.length < index + 1) this._ranges.push(null)
    }
    // Each slot holds its range (hd/src/bufferArrayRange.ts,
    // PLATFORM-DIVERGENCE(hd-bar-shared-ptr)): the element's copy assignment.
    const old = this._ranges[index] ?? null
    if (old === range) return
    range?._retain()
    this._ranges[index] = range
    old?.release()
  }

  /** The destructor (~std::vector): releases every range. */
  destroy(): void {
    const ranges = this._ranges
    this._ranges = []
    for (const range of ranges) range?.release()
  }

  /** bufferArrayRange.cpp:75-85 */
  Get(index: number): HdStBufferArrayRange | null {
    if (index < 0 || index >= this._ranges.length) {
      // out of range access is not an errorneous path.
      // (i.e. element/instance bars can be null if not exists)
      return null
    }
    return this._ranges[index]!
  }
}
