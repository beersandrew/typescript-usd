// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderBufferPool.cpp,
//  pxr/imaging/hdSt/renderBufferPool.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/renderBufferPool.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Lifetime. HdStPooledRenderBufferUniquePtr's destructor frees the slot
//   (renderBufferPool.cpp:30-39), and Commit drops the buffers the pool alone
//   holds (shared_ptr use_count() == 1, renderBufferPool.cpp:100-110).
//   JavaScript cannot observe either, so the holder of a pooled render buffer
//   calls Destroy() when it drops it, and the pool counts the pooled
//   buffers handed out per render buffer. A dropped render buffer is
//   finalized (its texture objects released, renderBuffer.ts) as the
//   HdStRenderBuffer destructor releases them upstream.
// - The unordered_map keyed by _PooledRenderBufferDesc (with its
//   HashFunctor) is a Map keyed by the descriptor's fields; std::map<SdfPath,
//   _AllocationTracker> is a Map keyed by path.
// - The render buffer path uses TfEnum::GetName(fmt), the HdFormat
//   enumerator's name.

import type { Vec2i as GfVec2i } from 'typescript-usd/gf'
import { Format as HdFormat } from 'typescript-usd/hd'
import { HdStRenderBuffer } from './renderBuffer.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'

/** renderBufferPool.h:30-55. Represents a Render Buffer that may be re-used
 *  between render graphs. Client code has exclusive access to this buffer
 *  during render graph execution, but there are no guarentees about
 *  contents before first usage and after last usage. */
export class HdStPooledRenderBuffer {
  private _destroyed = false

  /** renderBufferPool.cpp:18-28 */
  constructor(
    private readonly _buffer: HdStRenderBuffer,
    private readonly _pool: HdStRenderBufferPool,
    private readonly _graphPath: string,
    private readonly _isDepth: boolean,
    private readonly _idx: number,
  ) {
    _pool._hold(_buffer)
  }

  /** renderBufferPool.cpp:30-39 (the destructor; see the header). */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._pool.Free(
      this._buffer.GetFormat(),
      [this._buffer.getWidth(), this._buffer.getHeight()],
      this._buffer.isMultiSampled(),
      this._isDepth,
      this._graphPath,
      this._idx)
    this._pool._unhold(this._buffer)
  }

  /** renderBufferPool.h:43 */
  getBuffer(): HdStRenderBuffer { return this._buffer }
}

export type HdStPooledRenderBufferUniquePtr = HdStPooledRenderBuffer

/** renderBufferPool.h:110-121 */
class _AllocationTracker {
  private max = 0
  private freeList: number[] = []

  /** renderBufferPool.cpp:112-122 */
  allocate(): number {
    if (this.freeList.length === 0) {
      return this.max++
    } else {
      return this.freeList.pop()!
    }
  }

  /** renderBufferPool.cpp:124-127 */
  Free(index: number): void {
    this.freeList.push(index)
  }
}

/** renderBufferPool.h:123-127 */
interface _HdStRenderBufferPoolEntry {
  allocs: Map<string, _AllocationTracker>
  buffers: (HdStRenderBuffer | null)[]
}

type _Dims = GfVec2i | readonly [number, number]
const _dim = (dims: _Dims, i: number): number =>
  Array.isArray(dims) ? (dims as readonly number[])[i]! : (dims as GfVec2i).get(i)

/** renderBufferPool.h:85-106 _PooledRenderBufferDesc, as a map key. */
function _DescKey(fmt: HdFormat, dims: _Dims, multiSampled: boolean, depth: boolean): string {
  return `${fmt}|${_dim(dims, 0)}|${_dim(dims, 1)}|${multiSampled ? 1 : 0}|${depth ? 1 : 0}`
}

/** renderBufferPool.h:57-131. System for re-using HdStRenderBuffers between
 *  tasks in different graphs that regenerate data per-frame. Ex: Shadow
 *  buffers. */
export class HdStRenderBufferPool {
  private _pooledRenderBuffers = new Map<string, _HdStRenderBufferPoolEntry>()
  // The pooled render buffers handed out per buffer (see the header).
  private _holds = new Map<HdStRenderBuffer, number>()

  /** renderBufferPool.cpp:41-81. Allocate a RenderBuffer for usage during
   *  the current render graph. */
  allocate(
    registry: HdStResourceRegistry,
    graphPath: string,
    fmt: HdFormat,
    dims: _Dims,
    multiSampled: boolean,
    depth: boolean,
  ): HdStPooledRenderBufferUniquePtr {
    const key = _DescKey(fmt, dims, multiSampled, depth)
    let entry = this._pooledRenderBuffers.get(key)
    if (!entry) {
      entry = { allocs: new Map(), buffers: [] }
      this._pooledRenderBuffers.set(key, entry)
    }

    const buffers = entry.buffers
    let tracker = entry.allocs.get(graphPath)
    if (!tracker) entry.allocs.set(graphPath, tracker = new _AllocationTracker())
    const slot = tracker.allocate()
    while (slot >= buffers.length) {
      buffers.push(null)
    }
    if (!buffers[slot]) {
      const path = `aov_Temp_${HdFormat[fmt]}_${_dim(dims, 0)}x${_dim(dims, 1)}_` +
        `${multiSampled ? 'multiSampled' : ''}${depth ? 'depth' : ''}`
      const buffer = new HdStRenderBuffer(registry, path)
      buffer.allocate(
        [_dim(dims, 0), _dim(dims, 1), 1],
        fmt,
        multiSampled)
      buffers[slot] = buffer
    }
    return new HdStPooledRenderBuffer(
      buffers[slot]!, this, graphPath, depth, slot)
  }

  /** renderBufferPool.cpp:83-98 */
  Free(
    fmt: HdFormat,
    dims: _Dims,
    multiSampled: boolean,
    depth: boolean,
    graphPath: string,
    idx: number,
  ): void {
    const key = _DescKey(fmt, dims, multiSampled, depth)
    let entry = this._pooledRenderBuffers.get(key)
    if (!entry) {
      entry = { allocs: new Map(), buffers: [] }
      this._pooledRenderBuffers.set(key, entry)
    }
    let tracker = entry.allocs.get(graphPath)
    if (!tracker) entry.allocs.set(graphPath, tracker = new _AllocationTracker())
    tracker.Free(idx)
  }

  /** renderBufferPool.cpp:100-110. Frees allocations that are no longer in
   *  use by any render graphs. */
  commit(): void {
    for (const type of this._pooledRenderBuffers.values()) {
      for (let i = 0; i < type.buffers.length; i++) {
        const buffer = type.buffers[i]
        if (buffer && !this._holds.has(buffer)) {
          // ~HdStRenderBuffer: drop its texture objects.
          buffer.finalize(null)
          type.buffers[i] = null
        }
      }
    }
  }

  /** A pooled render buffer for `buffer` was handed out (see the header). */
  _hold(buffer: HdStRenderBuffer): void {
    this._holds.set(buffer, (this._holds.get(buffer) ?? 0) + 1)
  }

  /** A pooled render buffer for `buffer` was destroyed (see the header). */
  _unhold(buffer: HdStRenderBuffer): void {
    const n = (this._holds.get(buffer) ?? 0) - 1
    if (n > 0) this._holds.set(buffer, n)
    else this._holds.delete(buffer)
  }
}
