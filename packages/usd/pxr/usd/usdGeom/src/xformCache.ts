// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/xformCache.cpp,
//  pxr/usd/usdGeom/xformCache.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdGeomXformCache — caches local-to-world transforms.
// Reference: pxr/usd/usdGeom/xformCache.{h,cpp}
//
// Row-vector convention: worldMatrix = localMatrix · parentWorldMatrix
// (a vertex is transformed by its own ops first, then each ancestor's).
//
// Upstream caches per UsdPrim and is not bound to a stage
// (UsdGeomXformCache(time)); every query takes a prim. typescript-usd also
// keeps the stage-bound spelling (new XformCache(stage, time) with prim
// paths) its imaging code uses; both share one cache keyed by stage and
// prim path.

import type { Prim, Stage } from 'typescript-usd/usd'
import { XformQuery, transformMightBeTimeVarying, type XformResult } from './xformable.ts'
import { type Matrix4, IDENTITY_MATRIX, mul4 } from 'typescript-usd/gf'

function parentPath(path: string): string | null {
  if (path === '/' || !path.startsWith('/')) return null
  const idx = path.lastIndexOf('/')
  return idx === 0 ? '/' : path.slice(0, idx)
}

// _Entry (xformCache.h:137-151): the prim's XformQuery and its ctm. The
// query is built once per entry and kept across SetTime, so per-frame
// evaluation reuses the resolved ops.
interface Entry {
  readonly prim: Prim
  /** The prim is an Xformable, so the entry has a non-default XformQuery. */
  readonly xformable: boolean
  readonly query: XformQuery
  mightBeTimeVarying: boolean | undefined
  ctm: Matrix4
  ctmIsValid: boolean
}

const DEFAULT_QUERY = new XformQuery()

export class XformCache {
  private _cache = new Map<Stage, Map<string, Entry>>()
  private readonly _stage: Stage | undefined
  private _time: number | undefined

  // UsdGeomXformCache(time) / UsdGeomXformCache() (xformCache.cpp:18-27);
  // undefined is UsdTimeCode::Default().
  constructor(time?: number)
  constructor(stage: Stage, time?: number)
  constructor(stageOrTime?: Stage | number, time?: number) {
    if (typeof stageOrTime === 'object') {
      this._stage = stageOrTime
      this._time = time
    } else {
      this._stage = undefined
      this._time = stageOrTime
    }
  }

  get time(): number | undefined { return this._time }
  getTime(): number | undefined { return this._time }

  // UsdGeomXformCache::SetTime (xformCache.cpp:213-225): mark all cached
  // CTMs invalid, but leave the queries behind.
  setTime(time: number | undefined): void {
    if (time === this._time) return
    for (const entries of this._cache.values()) {
      for (const entry of entries.values()) entry.ctmIsValid = false
    }
    this._time = time
  }

  // UsdGeomXformCache::Clear (xformCache.cpp:227-230).
  clear(): void {
    this._cache.clear()
  }

  // UsdGeomXformCache::Swap (xformCache.cpp:232-237).
  swap(other: XformCache): void {
    const cache = this._cache
    this._cache = other._cache
    other._cache = cache
    const time = this._time
    this._time = other._time
    other._time = time
  }

  // The prim's own transformation (its xformOpOrder flattened), without
  // ancestors, and whether it resets the xform stack
  // (UsdGeomXformCache::GetLocalTransformation, xformCache.cpp:101-120).
  getLocalTransformation(primOrPath: Prim | string): XformResult {
    // xformCache.cpp:98-116: the entry's XformQuery, identity for a prim that
    // is not an Xformable (the pseudo-root, a Scope, an untyped prim).
    const entry = this._entry(this._resolve(primOrPath))
    if (!entry || !entry.xformable) return { matrix: [...IDENTITY_MATRIX] as Matrix4, resetsXformStack: false }
    return { matrix: entry.query.getLocalTransformation(this._time), resetsXformStack: entry.query.getResetXformStack() }
  }

  // Returns a copy: the cached matrix must not be mutable by callers, which
  // OpenUSD guarantees by returning it by value (xformCache.h).
  getLocalToWorldTransform(primOrPath: Prim | string): Matrix4 {
    return [...this._getCtm(this._resolve(primOrPath))] as Matrix4
  }

  // The accumulated transform of the prim's ancestors (excludes the prim's
  // own ops) (UsdGeomXformCache::GetParentToWorldTransform,
  // xformCache.cpp:35-40).
  getParentToWorldTransform(primOrPath: Prim | string): Matrix4 {
    return [...this._getCtm(this._parent(this._resolve(primOrPath)))] as Matrix4
  }

  // UsdGeomXformCache::TransformMightBeTimeVarying (xformCache.cpp:42-55).
  transformMightBeTimeVarying(primOrPath: Prim | string): boolean {
    const entry = this._entry(this._resolve(primOrPath))
    if (!entry) return true
    // typescript-usd: upstream asks the entry's query
    // (XformQuery::TransformMightBeTimeVarying), which also answers false for
    // an op followed by its inverse (TransformMightHaveEffect); this keeps the
    // UsdGeomXformable::TransformMightBeTimeVarying answer
    // (xformable.cpp:760-794) the cache has always given, computed once per
    // entry.
    entry.mightBeTimeVarying ??= entry.xformable && transformMightBeTimeVarying(entry.prim)
    return entry.mightBeTimeVarying
  }

  // UsdGeomXformCache::GetResetXformStack (xformCache.cpp:57-68).
  getResetXformStack(primOrPath: Prim | string): boolean {
    return this._entry(this._resolve(primOrPath))?.query.getResetXformStack() ?? false
  }

  // UsdGeomXformCache::ComputeRelativeTransform (xformCache.cpp:122-142):
  // the product of local transformations from prim up to (excluding)
  // ancestor, stopping at a prim that resets the xform stack.
  computeRelativeTransform(
    primOrPath: Prim | string, ancestorOrPath: Prim | string,
  ): { matrix: Matrix4, resetXformStack: boolean } {
    let xform = [...IDENTITY_MATRIX] as Matrix4
    let resetXformStack = false
    const ancestor = this._resolve(ancestorOrPath)
    for (let p = this._resolve(primOrPath); p && !(ancestor && p.path === ancestor.path &&
      p.getStage() === ancestor.getStage()); p = this._parent(p)) {
      const local = this.getLocalTransformation(p)
      xform = mul4(xform, local.matrix)
      resetXformStack = local.resetsXformStack
      if (resetXformStack) break
    }
    return { matrix: xform, resetXformStack }
  }

  private _resolve(primOrPath: Prim | string): Prim | undefined {
    if (typeof primOrPath !== 'string') return primOrPath.isValid() ? primOrPath : undefined
    return this._stage?.getPrim(primOrPath)
  }

  // UsdPrim::GetParent: the pseudo-root has no parent.
  private _parent(prim: Prim | undefined): Prim | undefined {
    if (!prim) return undefined
    const parent = parentPath(prim.path)
    return parent === null ? undefined : prim.getStage().getPrim(parent)
  }

  // _GetCacheEntryForPrim (xformCache.cpp:84-99).
  private _entry(prim: Prim | undefined): Entry | undefined {
    if (!prim) return undefined
    const stage = prim.getStage()
    let entries = this._cache.get(stage)
    if (!entries) { entries = new Map(); this._cache.set(stage, entries) }
    let entry = entries.get(prim.path)
    if (!entry) {
      // The entry's XformQuery is built only for a prim that is an Xformable
      // (xformCache.cpp:89-91, UsdTyped::_IsCompatible typed.cpp:98-104); a
      // default query neither resets the stack nor varies over time.
      const xformable = prim.isA('Xformable')
      entry = {
        prim,
        xformable,
        query: xformable ? new XformQuery(prim) : DEFAULT_QUERY,
        mightBeTimeVarying: undefined,
        ctm: [...IDENTITY_MATRIX] as Matrix4,
        ctmIsValid: false,
      }
      entries.set(prim.path, entry)
    }
    return entry
  }

  // _GetCtm (xformCache.cpp:144-176): the pseudo-root's parent (an invalid
  // prim) is identity; otherwise local · parent ctm unless the prim resets
  // the xform stack.
  private _getCtm(prim: Prim | undefined): Matrix4 {
    const entry = this._entry(prim)
    if (!prim || !entry) return IDENTITY_MATRIX as Matrix4
    if (entry.ctmIsValid) return entry.ctm
    const local = entry.query.getLocalTransformation(this._time)
    entry.ctm = !entry.query.getResetXformStack() ? mul4(local, this._getCtm(this._parent(prim))) : local
    entry.ctmIsValid = true
    return entry.ctm
  }
}
