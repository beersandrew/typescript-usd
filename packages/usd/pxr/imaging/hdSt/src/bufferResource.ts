// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/bufferResource.cpp,
//  pxr/imaging/hdSt/bufferResource.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/bufferResource.{h,cpp} (OpenUSD 26.11.1).
//
// A named GPU buffer resource: the Hgi buffer handle and the layout of one
// channel in it (tuple type, byte offset and stride).
//
// Divergences:
// - HdStBufferResourceNamedPair is a `[name, resource]` tuple.

import type { HgiBufferHandle } from 'typescript-usd/hgi'
import { HgiHandle } from 'typescript-usd/hgi'
import type { TupleType as HdTupleType } from 'typescript-usd/hd'

/** bufferResource.h:38-83 */
export class HdStBufferResource {
  private _handle: HgiBufferHandle = new HgiHandle()
  private _size = 0
  private readonly _role: string
  private readonly _tupleType: HdTupleType
  private readonly _offset: number
  private readonly _stride: number

  /** PLATFORM-DIVERGENCE(hd-bar-shared-ptr): set by the last holder of a
   *  resource made by HdStResourceRegistry::RegisterBufferResource; the
   *  registry's GarbageCollectBufferResources then drops it, where upstream
   *  tests use_count() == 1. */
  _expired = false

  /** bufferResource.cpp:13-23 */
  constructor(role: string, tupleType: HdTupleType, offset: number, stride: number) {
    this._role = role
    this._tupleType = tupleType
    this._offset = offset
    this._stride = stride
  }

  /** bufferResource.h:51 */
  getRole(): string { return this._role }

  /** bufferResource.h:54. The size of the buffer in bytes. */
  getSize(): number { return this._size }

  /** bufferResource.h:57 */
  getTupleType(): HdTupleType { return this._tupleType }

  /** bufferResource.h:60. Byte offset of the channel in an interleaved
   *  element (0 for non-interleaved buffers). */
  getOffset(): number { return this._offset }

  /** bufferResource.h:63. Byte distance between consecutive elements. */
  getStride(): number { return this._stride }

  /** bufferResource.cpp:27-32 */
  setAllocation(handle: HgiBufferHandle, size: number): void {
    this._handle = handle
    this._size = size
  }

  /** bufferResource.h:70 */
  getHandle(): HgiBufferHandle { return this._handle }
}

/** bufferResource.h:26-32 */
export type HdStBufferResourceSharedPtr = HdStBufferResource
export type HdStBufferResourceNamedPair = [string, HdStBufferResource]
export type HdStBufferResourceNamedList = HdStBufferResourceNamedPair[]
