// Ported from OpenUSD 26.11.1: pxr/usd/usd/primRange.cpp,
//  pxr/usd/usd/primRange.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usd/primRange.{h,cpp} at OpenUSD v26.05.

import { Error as TfError } from 'typescript-usd/tf'
import type { Stage } from './stage.ts'
import type { Prim } from './prim.ts'
import {
  asPrimPredicate, PrimAllPrimsPredicate, PrimDefaultPredicate,
  type UsdPrimPredicate, type UsdPrimFlagsPredicate,
} from './primFlags.ts'

interface Visit {
  prim: Prim
  post: boolean
}

export class UsdPrimRangeIterator implements IterableIterator<Prim> {
  private readonly _stack: Visit[]
  private _last: Visit | undefined
  private _pending: Prim | undefined
  private _prune = false

  constructor(
    roots: Prim[],
    private readonly _predicate: UsdPrimFlagsPredicate,
    private readonly _preAndPost: boolean,
  ) {
    this._stack = roots.slice().reverse().map(prim => ({ prim, post: false }))
  }

  [Symbol.iterator](): IterableIterator<Prim> { return this }

  next(): IteratorResult<Prim> {
    // Usd_PyPrimRangeIterator::next (wrapPrimRange.cpp:144-161): an iterator
    // whose current prim has expired cannot advance.
    if (this._last && !this._last.prim.isValid()) {
      throw new TfError(`Iterator points to expired prim <${this._last.prim.path}>`)
    }
    // Defer descent until the next advancement so PruneChildren can affect
    // the current visit (primRange.cpp:52-89). Keep next itself stable:
    // JavaScript's iteration protocol caches the method before advancing.
    const pending = this._pending
    this._pending = undefined
    if (pending) {
      // Native post-order visits include leaves and pruned prims too
      // (primRange.cpp:72-73).
      if (this._preAndPost) this._stack.push({ prim: pending, post: true })
      if (!this._prune) {
        const children = pending.getFilteredChildren(this._predicate)
        for (let i = children.length - 1; i >= 0; i--) {
          this._stack.push({ prim: children[i]!, post: false })
        }
      }
    }
    while (this._stack.length > 0) {
      const visit = this._stack.pop()!
      this._last = visit
      this._prune = false
      if (visit.post) return { done: false, value: visit.prim }
      if (!this._predicate.evaluate(visit.prim)) continue
      this._pending = visit.prim
      return { done: false, value: visit.prim }
    }
    return { done: true, value: undefined }
  }

  pruneChildren(): void {
    // primRange.cpp:42-46: post-visit children have already been processed.
    if (this._last?.post) {
      throw new TfError(`Cannot prune children during post-visit because the children have already been processed. Current node: ${this._last.prim.path}`)
    }
    this._prune = true
  }
  isPostVisit(): boolean { return this._last?.post ?? false }
}

export class UsdPrimRange implements Iterable<Prim> {
  constructor(
    private readonly _roots: Prim[],
    private readonly _predicate = PrimDefaultPredicate,
    private readonly _preAndPost = false,
  ) {}

  static fromPrim(
    root: Prim, predicate: UsdPrimPredicate = PrimDefaultPredicate,
  ): UsdPrimRange {
    return new UsdPrimRange([root], asPrimPredicate(predicate))
  }

  static allPrims(root: Prim): UsdPrimRange {
    return new UsdPrimRange([root], PrimAllPrimsPredicate)
  }

  static stage(
    stage: Stage, predicate: UsdPrimPredicate = PrimDefaultPredicate,
  ): UsdPrimRange {
    const pred = asPrimPredicate(predicate)
    const roots = stage.getAllChildPrimPaths('/')
      .map(path => stage.getPrim(path)).filter((prim): prim is Prim => prim !== undefined)
    return new UsdPrimRange(roots, pred)
  }

  static preAndPostVisit(
    root: Prim, predicate: UsdPrimPredicate = PrimDefaultPredicate,
  ): UsdPrimRange {
    return new UsdPrimRange([root], asPrimPredicate(predicate), true)
  }

  [Symbol.iterator](): UsdPrimRangeIterator {
    // Usd_PyPrimRange::__iter__ (wrapPrimRange.cpp:174-184): a non-empty range
    // whose start prim has expired raises.
    const start = this._roots[0]
    if (start && !start.isValid()) {
      throw new TfError(`Invalid range starting with expired prim <${start.path}>`)
    }
    return new UsdPrimRangeIterator(this._roots, this._predicate, this._preAndPost)
  }
}
