// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/bboxCache.cpp,
//  pxr/usd/usdGeom/bboxCache.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdGeomBBoxCache — caches per-prim, per-purpose bounds.
// Port of pxr/usd/usdGeom/bboxCache.{h,cpp} at OpenUSD v26.08.
//
// Upstream resolves sibling subtrees and instance prototypes on worker
// threads (WorkDispatcher, bboxCache.cpp:61-229, :1083-1112, :1403-1417);
// here the same tasks run in sequence, in the order upstream's dependency
// tracking permits (prototypes before the prims that instance them).

import type { Prim, Stage, Attribute } from 'typescript-usd/usd'
import {
  PrimRange as UsdPrimRange, PrimIsActive, PrimIsDefined, PrimIsAbstract,
  TimeCode as UsdTimeCode,
} from 'typescript-usd/usd'
import { BBox3d as GfBBox3d, Matrix4d as GfMatrix4d, Range3d as GfRange3d, Vec3d as GfVec3d } from 'typescript-usd/gf'
import type { Matrix4 } from 'typescript-usd/gf'
import { Registry as KindRegistry, Tokens as KindTokens } from 'typescript-usd/kind'
import { RaiseWarning as TfWarn } from 'typescript-usd/tf'
import {
  Imageable, _registerBBoxCache, getInheritablePurpose, type PurposeInfo,
} from './imageable.ts'
import { Boundable } from './boundable.ts'
import { transformMightBeTimeVarying } from './xformable.ts'
import { PointInstancer } from './pointInstancer.ts'
import { XformCache } from './xformCache.ts'
import { attrVal, toFloat32 } from './valueUtils.ts'

type TimeArg = number | UsdTimeCode | undefined

function toTime(time: TimeArg): number | undefined {
  if (time === undefined) return undefined
  if (typeof time === 'number') return time
  return time.isDefault() ? undefined : time.GetValue()
}

function toGfMatrix(m: Matrix4): GfMatrix4d {
  return new GfMatrix4d(...m)
}

function parentPath(path: string): string | null {
  if (path === '/' || !path.startsWith('/')) return null
  const idx = path.lastIndexOf('/')
  return idx === 0 ? '/' : path.slice(0, idx)
}

// UsdPrimIsActive && UsdPrimIsDefined && !UsdPrimIsAbstract
// (bboxCache.cpp:1024-1025, :1320-1321, :1325-1326).
const CHILD_PREDICATE = PrimIsActive.and(PrimIsDefined).and(PrimIsAbstract.not())

// _PurposeToBBoxMap (bboxCache.h:383-384).
type PurposeToBBoxMap = Map<string, GfBBox3d>

function copyBBoxes(bboxes: PurposeToBBoxMap): PurposeToBBoxMap {
  const copy: PurposeToBBoxMap = new Map()
  for (const [purpose, bbox] of bboxes) copy.set(purpose, new GfBBox3d(bbox))
  return copy
}

// _PrimContext (bboxCache.h:403-430): a prim plus the purpose it would
// inherit from the prim that instances it (empty outside prototypes).
interface PrimContext {
  prim: Prim
  instanceInheritablePurpose: string
}

function primContext(prim: Prim, purpose = ''): PrimContext {
  return { prim, instanceInheritablePurpose: purpose }
}

function contextKey(context: PrimContext): string {
  return `${context.instanceInheritablePurpose}\u0000${context.prim.path}`
}

// _Entry (bboxCache.h:464-490).
class Entry {
  // The cached bboxes for the various values of purpose token.
  bboxes: PurposeToBBoxMap = new Map()
  // Computed purpose info of the prim associated with the entry; unset while
  // purpose is empty.
  purposeInfo: PurposeInfo = { purpose: '', isInheritable: false }
  // True when data in the entry is valid.
  isComplete = false
  // True when the entry varies over time.
  isVarying = false
  // True when the entry is visible.
  isIncluded = false

  clone(): Entry {
    const entry = new Entry()
    entry.bboxes = copyBBoxes(this.bboxes)
    entry.purposeInfo = { ...this.purposeInfo }
    entry.isComplete = this.isComplete
    entry.isVarying = this.isVarying
    entry.isIncluded = this.isIncluded
    return entry
  }
}

// _IsVaryingImpl (bboxCache.cpp:794-838).
function isVaryingImpl(time: number | undefined, attr: Attribute | undefined): boolean {
  if (!attr) return false
  const queryTime = time === undefined ? 1.000001 : time + 0.000001
  let bracket = attr.getBracketingTimeSamples(queryTime)
  if (bracket.length === 0) return false
  let [lower, upper] = bracket
  // Between samples?
  if (lower !== upper) return true
  // Out of range (lower) or exactly on a time sample?
  bracket = attr.getBracketingTimeSamples(lower + 0.000001)
  ;[lower, upper] = bracket as [number, number]
  if (lower !== upper) return true
  // Out of range (greater)?
  bracket = attr.getBracketingTimeSamples(lower - 0.000001)
  ;[lower, upper] = bracket as [number, number]
  if (lower !== upper) return true
  // Really only one time sample --> not varying for our purposes
  return false
}

// _IsComponentOrSubComponent (bboxCache.cpp:851-861).
function isComponentOrSubComponent(prim: Prim): boolean {
  const kind = prim.getKind()
  if (!kind) return false
  return KindRegistry.isA(kind, KindTokens.component) ||
    KindRegistry.isA(kind, KindTokens.subcomponent)
}

// _GetNearestComponent (bboxCache.cpp:869-882).
function getNearestComponent(prim: Prim): Prim {
  const stage = prim.getStage()
  let path: string | null = prim.path
  while (path) {
    const modelPrim = stage.getPrim(path)
    if (!modelPrim) break
    if (isComponentOrSubComponent(modelPrim)) return modelPrim
    path = parentPath(path)
  }
  return stage.getPrim('/')!
}

// Adds `path` and all of its ancestors, as inserting into an SdfPathTable
// does (bboxCache.cpp:427-438).
function addPathAndAncestors(set: Set<string>, path: string | null): void {
  while (path && !set.has(path)) {
    set.add(path)
    path = parentPath(path)
  }
}

export class BBoxCache {
  private _time: number | undefined
  private _baseTime: number | undefined | null = null
  private _includedPurposes: string[]
  private _useExtentsHint: boolean
  private _ignoreVisibility: boolean
  // _ctmCache and _bboxCache (bboxCache.h:563-566). UsdGeomXformCache and
  // UsdPrim keys are stage-aware upstream; both are partitioned by stage here.
  private _ctmCaches = new Map<Stage, XformCache>()
  private _bboxCache = new Map<Stage, Map<string, Entry>>()

  // UsdGeomBBoxCache(time, includedPurposes, useExtentsHint, ignoreVisibility)
  // and the copy constructor (bboxCache.cpp:275-297).
  constructor(other: BBoxCache)
  constructor(
    time: TimeArg, includedPurposes: readonly string[],
    useExtentsHint?: boolean, ignoreVisibility?: boolean)
  constructor(
    timeOrOther: TimeArg | BBoxCache, includedPurposes: readonly string[] = [],
    useExtentsHint = false, ignoreVisibility = false,
  ) {
    if (timeOrOther instanceof BBoxCache) {
      const other = timeOrOther
      this._time = other._time
      this._baseTime = other._baseTime
      this._includedPurposes = [...other._includedPurposes]
      this._useExtentsHint = other._useExtentsHint
      this._ignoreVisibility = other._ignoreVisibility
      for (const stage of other._ctmCaches.keys()) {
        this._ctmCaches.set(stage, new XformCache(stage, other._time))
      }
      for (const [stage, entries] of other._bboxCache) {
        const copy = new Map<string, Entry>()
        for (const [key, entry] of entries) copy.set(key, entry.clone())
        this._bboxCache.set(stage, copy)
      }
      return
    }
    this._time = toTime(timeOrOther)
    this._includedPurposes = [...includedPurposes]
    this._useExtentsHint = useExtentsHint
    this._ignoreVisibility = ignoreVisibility
  }

  // ---- Public API (bboxCache.cpp:323-760) ----

  computeWorldBound(prim: Prim): GfBBox3d {
    this._verifyPrim(prim)
    const bboxes = this._resolve(prim)
    if (!bboxes) return new GfBBox3d()
    const bbox = this._getCombinedBBoxForIncludedPurposes(bboxes)
    bbox.Transform(this._ctm(prim))
    return bbox
  }

  computeRelativeBound(prim: Prim, relativeToAncestorPrim: Prim): GfBBox3d {
    this._verifyPrim(prim)
    const bboxes = this._resolve(prim)
    if (!bboxes) return new GfBBox3d()
    const bbox = this._getCombinedBBoxForIncludedPurposes(bboxes)
    const primCtm = this._ctm(prim)
    const ancestorCtm = this._ctm(relativeToAncestorPrim)
    bbox.Transform(primCtm.getMultiply(ancestorCtm.getInverse()))
    return bbox
  }

  computeLocalBound(prim: Prim): GfBBox3d {
    this._verifyPrim(prim)
    const bboxes = this._resolve(prim)
    if (!bboxes) return new GfBBox3d()
    const bbox = this._getCombinedBBoxForIncludedPurposes(bboxes)
    // The value of resetsXformStack does not affect the local bound.
    bbox.Transform(this._localTransformation(prim))
    return bbox
  }

  // ComputeUntransformedBound(prim) and its (pathsToSkip, ctmOverrides)
  // overload (bboxCache.cpp:410-521).
  computeUntransformedBound(prim: Prim): GfBBox3d
  computeUntransformedBound(
    prim: Prim, pathsToSkip: Iterable<string>,
    ctmOverrides: ReadonlyMap<string, GfMatrix4d>): GfBBox3d
  computeUntransformedBound(
    prim: Prim, pathsToSkip?: Iterable<string>,
    ctmOverrides?: ReadonlyMap<string, GfMatrix4d>,
  ): GfBBox3d {
    if (pathsToSkip !== undefined) {
      return this._computeBoundWithOverridesHelper(
        prim, pathsToSkip, undefined, ctmOverrides ?? new Map())
    }
    this._verifyPrim(prim)
    const bboxes = this._resolve(prim)
    if (!bboxes) return new GfBBox3d()
    return this._getCombinedBBoxForIncludedPurposes(bboxes)
  }

  computeWorldBoundWithOverrides(
    prim: Prim, pathsToSkip: Iterable<string>, primOverride: GfMatrix4d,
    ctmOverrides: ReadonlyMap<string, GfMatrix4d>,
  ): GfBBox3d {
    return this._computeBoundWithOverridesHelper(
      prim, pathsToSkip, primOverride, ctmOverrides)
  }

  // Point-instance bounds (bboxCache.h:211-335, bboxCache.cpp:537-680). The
  // plural forms return undefined where upstream returns false.
  computePointInstanceWorldBounds(
    instancer: PointInstancer, instanceIds: readonly number[],
  ): GfBBox3d[] | undefined {
    return this._computePointInstanceBoundsHelper(
      instancer, instanceIds, this._ctm(instancer.prim))
  }

  computePointInstanceWorldBound(instancer: PointInstancer, instanceId: number): GfBBox3d {
    return this.computePointInstanceWorldBounds(instancer, [instanceId])?.[0] ?? new GfBBox3d()
  }

  computePointInstanceRelativeBounds(
    instancer: PointInstancer, instanceIds: readonly number[], relativeToAncestorPrim: Prim,
  ): GfBBox3d[] | undefined {
    const primCtm = this._ctm(instancer.prim)
    const ancestorCtm = this._ctm(relativeToAncestorPrim)
    const relativeCtm = ancestorCtm.getInverse().getMultiply(primCtm)
    return this._computePointInstanceBoundsHelper(instancer, instanceIds, relativeCtm)
  }

  computePointInstanceRelativeBound(
    instancer: PointInstancer, instanceId: number, relativeToAncestorPrim: Prim,
  ): GfBBox3d {
    return this.computePointInstanceRelativeBounds(
      instancer, [instanceId], relativeToAncestorPrim)?.[0] ?? new GfBBox3d()
  }

  computePointInstanceLocalBounds(
    instancer: PointInstancer, instanceIds: readonly number[],
  ): GfBBox3d[] | undefined {
    return this._computePointInstanceBoundsHelper(
      instancer, instanceIds, this._localTransformation(instancer.prim))
  }

  computePointInstanceLocalBound(instancer: PointInstancer, instanceId: number): GfBBox3d {
    return this.computePointInstanceLocalBounds(instancer, [instanceId])?.[0] ?? new GfBBox3d()
  }

  computePointInstanceUntransformedBounds(
    instancer: PointInstancer, instanceIds: readonly number[],
  ): GfBBox3d[] | undefined {
    return this._computePointInstanceBoundsHelper(instancer, instanceIds, new GfMatrix4d(1))
  }

  computePointInstanceUntransformedBound(instancer: PointInstancer, instanceId: number): GfBBox3d {
    return this.computePointInstanceUntransformedBounds(instancer, [instanceId])?.[0] ??
      new GfBBox3d()
  }

  clear(): void {
    for (const cache of this._ctmCaches.values()) cache.clear()
    this._bboxCache.clear()
  }

  setIncludedPurposes(includedPurposes: readonly string[]): void {
    this._includedPurposes = [...includedPurposes]
  }

  getIncludedPurposes(): string[] { return [...this._includedPurposes] }

  getUseExtentsHint(): boolean { return this._useExtentsHint }

  getIgnoreVisibility(): boolean { return this._ignoreVisibility }

  // SetTime (bboxCache.cpp:698-740).
  setTime(time: TimeArg): void {
    const newTime = toTime(time)
    if (newTime === this._time) return

    // If we're switching time into or out of default, then clear all the
    // entries in the cache (_IsVarying ignores a default that differs from a
    // single time sample).
    const clearUnvarying = this._time === undefined || newTime === undefined
    for (const entries of this._bboxCache.values()) {
      for (const entry of entries.values()) {
        if (clearUnvarying || entry.isVarying) {
          entry.isComplete = false
          entry.bboxes.clear()
        }
      }
    }
    this._time = newTime
    for (const cache of this._ctmCaches.values()) cache.setTime(newTime)
  }

  getTime(): UsdTimeCode {
    return this._time === undefined ? UsdTimeCode.Default() : new UsdTimeCode(this._time)
  }

  setBaseTime(baseTime: TimeArg): void { this._baseTime = toTime(baseTime) }

  getBaseTime(): UsdTimeCode {
    if (this._baseTime === null) return this.getTime()
    return this._baseTime === undefined ? UsdTimeCode.Default() : new UsdTimeCode(this._baseTime)
  }

  clearBaseTime(): void { this._baseTime = null }

  hasBaseTime(): boolean { return this._baseTime !== null }

  // ---- Private ----

  private _verifyPrim(prim: Prim | undefined): void {
    if (!prim || !prim.isValid()) {
      throw new Error(`Invalid prim: ${prim ? `<${prim.path}>` : 'null prim'}`)
    }
  }

  private _xformCache(stage: Stage): XformCache {
    let cache = this._ctmCaches.get(stage)
    if (!cache) {
      cache = new XformCache(stage, this._time)
      this._ctmCaches.set(stage, cache)
    }
    // Setting the time redundantly is a no-op (bboxCache.cpp:1209-1210).
    cache.setTime(this._time)
    return cache
  }

  private _ctm(prim: Prim): GfMatrix4d {
    return toGfMatrix(this._xformCache(prim.getStage()).getLocalToWorldTransform(prim.path))
  }

  private _localTransformation(prim: Prim): GfMatrix4d {
    return toGfMatrix(this._xformCache(prim.getStage()).getLocalTransformation(prim.path).matrix)
  }

  private _entries(stage: Stage): Map<string, Entry> {
    let entries = this._bboxCache.get(stage)
    if (!entries) {
      entries = new Map()
      this._bboxCache.set(stage, entries)
    }
    return entries
  }

  // _FindEntry / _InsertEntry (bboxCache.h:543-556).
  private _findEntry(context: PrimContext): Entry | undefined {
    return this._bboxCache.get(context.prim.getStage())?.get(contextKey(context))
  }

  private _insertEntry(context: PrimContext): Entry {
    const entries = this._entries(context.prim.getStage())
    const key = contextKey(context)
    let entry = entries.get(key)
    if (!entry) {
      entry = new Entry()
      entries.set(key, entry)
    }
    return entry
  }

  // _ComputeBoundWithOverridesHelper (bboxCache.cpp:412-509).
  private _computeBoundWithOverridesHelper(
    prim: Prim, pathsToSkipIn: Iterable<string>, primOverride: GfMatrix4d | undefined,
    ctmOverrides: ReadonlyMap<string, GfMatrix4d>,
  ): GfBBox3d {
    this._verifyPrim(prim)
    const pathsToSkip = new Set(pathsToSkipIn)

    const ancestorsOfPathsToSkip = new Set<string>()
    for (const p of pathsToSkip) addPathAndAncestors(ancestorsOfPathsToSkip, parentPath(p))

    const ancestorsOfOverrides = new Set<string>()
    for (const p of ctmOverrides.keys()) addPathAndAncestors(ancestorsOfOverrides, parentPath(p))

    const stage = prim.getStage()
    let result = new GfBBox3d()
    const it = UsdPrimRange.fromPrim(prim)[Symbol.iterator]()
    for (let step = it.next(); !step.done; step = it.next()) {
      const p = step.value
      const primPath = p.path

      // If this is one of the paths to be skipped, then prune subtree.
      if (pathsToSkip.has(primPath)) {
        it.pruneChildren()
        continue
      }
      // Ancestors of skipped paths or of overridden paths keep traversing.
      if (ancestorsOfPathsToSkip.has(primPath)) continue
      if (ancestorsOfOverrides.has(primPath)) continue

      // Check to see if any of the ancestors of the prim or the prim itself
      // has an xform override.
      let pathWithOverride: string | null = primPath
      let overridePath: string | undefined
      while (pathWithOverride && pathWithOverride !== prim.path) {
        if (ctmOverrides.has(pathWithOverride)) {
          overridePath = pathWithOverride
          break
        }
        pathWithOverride = parentPath(pathWithOverride)
      }

      let bbox: GfBBox3d
      if (overridePath === undefined) {
        bbox = this.computeRelativeBound(p, prim)
        if (primOverride) bbox.Transform(primOverride)
      } else {
        // Compute bound relative to the path for which we know the corrected
        // prim-relative CTM, then apply the override CTM.
        bbox = this.computeRelativeBound(p, stage.getPrim(overridePath)!)
        bbox.Transform(ctmOverrides.get(overridePath)!)
      }

      result = GfBBox3d.combine(result, bbox)
      it.pruneChildren()
    }
    return result
  }

  // _ComputePointInstanceBoundsHelper (bboxCache.cpp:537-614).
  private _computePointInstanceBoundsHelper(
    instancer: PointInstancer, instanceIds: readonly number[], xform: GfMatrix4d,
  ): GfBBox3d[] | undefined {
    const prim = instancer.prim
    const stage = prim.getStage()
    const time = this._time
    const protoIndicesValue = attrVal(prim, 'protoIndices', time)
    if (protoIndicesValue === undefined) {
      TfWarn(`${prim.path} -- no prototype indices`)
      return undefined
    }
    const protoIndices = PointInstancer.getProtoIndices(prim, time)

    const protoPaths = PointInstancer.getPrototypes(prim)
    if (protoPaths.length === 0) {
      TfWarn(`${prim.path} -- no prototypes`)
      return undefined
    }

    // Verify that all the protoIndices are in bounds.
    for (const protoIndex of protoIndices) {
      if (protoIndex < 0 || protoIndex >= protoPaths.length) {
        TfWarn(`${prim.path} -- invalid prototype index: ${protoIndex}. ` +
          `Should be in [0, ${protoPaths.length})`)
        return undefined
      }
    }

    // Instance transforms are computed unmasked so each instance id keeps
    // its prototype mapping (IncludeProtoXform, IgnoreMask).
    const { xforms: instanceTransforms } = PointInstancer.computeInstanceTransforms(prim, {
      time, includeProtoXform: true, stage, applyMask: false,
    })
    if (instanceTransforms.length !== protoIndices.length) {
      TfWarn(`${prim.path} -- could not compute instance transforms`)
      return undefined
    }

    const result: GfBBox3d[] = []
    for (const iid of instanceIds) {
      const protoIndex = protoIndices[iid]!
      const protoPrim = stage.getPrim(protoPaths[protoIndex]!)!
      // Get the prototype bounding box and apply the instance transform and
      // the caller's transform.
      const thisBounds = this.computeUntransformedBound(protoPrim)
      thisBounds.Transform(toGfMatrix(instanceTransforms[iid]!).getMultiply(xform))
      result.push(thisBounds)
    }
    return result
  }

  // _GetCombinedBBoxForIncludedPurposes (bboxCache.cpp:682-696).
  private _getCombinedBBoxForIncludedPurposes(bboxes: PurposeToBBoxMap): GfBBox3d {
    let combinedBound = new GfBBox3d()
    for (const purpose of this._includedPurposes) {
      const bboxForPurpose = bboxes.get(purpose)
      if (bboxForPurpose && !bboxForPurpose.getRange().IsEmpty()) {
        combinedBound = GfBBox3d.combine(combinedBound, bboxForPurpose)
      }
    }
    return combinedBound
  }

  // _ShouldIncludePrim (bboxCache.cpp:746-788).
  private _shouldIncludePrim(prim: Prim): boolean {
    // A typeless prim or one of unknown type may have imageable descendants.
    if (!prim.isA('Typed')) return true
    // A typed prim participates in child bound accumulation only if it is
    // imageable.
    if (!prim.isA('Imageable')) return false
    if (!this._ignoreVisibility) {
      const vis = attrVal(prim, 'visibility', this._time)
      if (vis === 'invisible') return false
    }
    return true
  }

  // _ComputePurposeInfo (bboxCache.cpp:884-956).
  private _computePurposeInfo(entry: Entry, context: PrimContext, isRecursive: boolean): void {
    if (entry.purposeInfo.purpose) return

    const prim = context.prim
    // Prototypes have no purpose of their own; the instancing prim provides
    // it when its purpose is inheritable.
    if (prim.isPrototype()) {
      entry.purposeInfo = context.instanceInheritablePurpose
        ? { purpose: context.instanceInheritablePurpose, isInheritable: true }
        : { purpose: 'default', isInheritable: false }
      return
    }

    const parent = parentPath(prim.path)
    if (parent && parent !== '/') {
      const parentPrim = prim.getStage().getPrim(parent)
      if (parentPrim) {
        // A prim in a prototype shares its parent's inheritable instance
        // purpose.
        const parentContext = primContext(parentPrim, context.instanceInheritablePurpose)
        const parentEntry = this._findEntry(parentContext)
        if (parentEntry) {
          if (isRecursive) {
            this._computePurposeInfo(parentEntry, parentContext, true)
            entry.purposeInfo = Imageable.computePurposeInfo(prim, parentEntry.purposeInfo)
            return
          }
          if (parentEntry.purposeInfo.purpose) {
            entry.purposeInfo = Imageable.computePurposeInfo(prim, parentEntry.purposeInfo)
            return
          }
        }
      }
    }
    entry.purposeInfo = Imageable.computePurposeInfo(prim)
  }

  // _UseExtentsHintForPrim (bboxCache.cpp:958-964).
  private _useExtentsHintForPrim(prim: Prim): boolean {
    return this._useExtentsHint && prim.isModel() && prim.path !== '/'
  }

  // UsdGeomModelAPI(prim).GetExtentsHintAttr() read as a VtVec3fArray.
  private _getExtentsHint(prim: Prim): GfVec3d[] | undefined {
    const value = attrVal(prim, 'extentsHint', this._time)
    if (value === undefined || value === null) return undefined
    const flat = toFloat32(value) ?? new Float32Array(0)
    const extents: GfVec3d[] = []
    for (let i = 0; i + 2 < flat.length; i += 3) {
      extents.push(new GfVec3d(flat[i]!, flat[i + 1]!, flat[i + 2]!))
    }
    return extents
  }

  // _ShouldPruneChildren (bboxCache.cpp:966-990).
  private _shouldPruneChildren(prim: Prim, entry: Entry): boolean {
    // If the entry is already complete, we don't need to try to initialize it.
    if (entry.isComplete) return true
    // Boundables provide their own extent.
    if (prim.isA('Boundable')) return true
    if (!this._useExtentsHintForPrim(prim)) return false
    const extentsHint = this._getExtentsHint(prim)
    return extentsHint !== undefined && extentsHint.length >= 2
  }

  // _FindOrCreateEntriesForPrim (bboxCache.cpp:992-1064).
  private _findOrCreateEntriesForPrim(
    context: PrimContext, prototypePrimContexts: PrimContext[],
  ): Entry {
    // We always have an entry for the given prim, even if it does not pass
    // the traversal predicate below.
    const entry = this._insertEntry(context)
    if (entry.isComplete) return entry

    // isIncluded for the queried prim itself (children get theirs in
    // _ResolvePrim).
    entry.isIncluded = this._shouldIncludePrim(context.prim)

    // Pre-populate all cache entries. Unloaded prims are kept: they may have
    // authored extentsHints.
    const seenPrototypePrimContexts = new Set<string>()
    const it = UsdPrimRange.fromPrim(context.prim, CHILD_PREDICATE)[Symbol.iterator]()
    for (let step = it.next(); !step.done; step = it.next()) {
      const prim = step.value
      const cachePrimContext = primContext(prim, context.instanceInheritablePurpose)
      const cacheEntry = this._insertEntry(cachePrimContext)

      if (this._shouldPruneChildren(prim, cacheEntry)) {
        it.pruneChildren()
      } else if (prim.isInstance()) {
        // An instance without an extent or hint: resolve its prototype, with
        // this instance's inheritable purpose (computed recursively now).
        const prototype = prim.getPrototype()!
        this._computePurposeInfo(cacheEntry, cachePrimContext, true)
        const prototypePrimContext = primContext(
          prototype, getInheritablePurpose(cacheEntry.purposeInfo))
        const key = contextKey(prototypePrimContext)
        if (!seenPrototypePrimContexts.has(key)) {
          seenPrototypePrimContexts.add(key)
          prototypePrimContexts.push(prototypePrimContext)
        }
        it.pruneChildren()
      }
    }
    return entry
  }

  // _PrototypeBBoxResolver::Resolve (bboxCache.cpp:136-229): populate the
  // prototype dependency graph, then resolve each prototype once all the
  // prototypes of its nested instances are resolved.
  private _resolvePrototypes(prototypePrimContexts: readonly PrimContext[]): void {
    interface PrototypeTask {
      context: PrimContext
      numDependencies: number
      dependentPrototypes: string[]
    }
    const prototypeTasks = new Map<string, PrototypeTask>()
    const populate = (prototypePrim: PrimContext): void => {
      const key = contextKey(prototypePrim)
      if (prototypeTasks.has(key)) return
      const task: PrototypeTask = {
        context: prototypePrim, numDependencies: 0, dependentPrototypes: [],
      }
      prototypeTasks.set(key, task)
      const requiredPrototypes: PrimContext[] = []
      this._findOrCreateEntriesForPrim(prototypePrim, requiredPrototypes)
      task.numDependencies = requiredPrototypes.length
      for (const reqPrototype of requiredPrototypes) {
        populate(reqPrototype)
        prototypeTasks.get(contextKey(reqPrototype))!.dependentPrototypes.push(key)
      }
    }
    for (const prototypePrim of prototypePrimContexts) populate(prototypePrim)

    const ready: string[] = []
    for (const [key, task] of prototypeTasks) {
      if (task.numDependencies === 0) ready.push(key)
    }
    while (ready.length > 0) {
      const task = prototypeTasks.get(ready.shift()!)!
      this._resolvePrim(task.context, new GfMatrix4d(1.0))
      for (const dependentKey of task.dependentPrototypes) {
        const dependent = prototypeTasks.get(dependentKey)!
        if (--dependent.numDependencies === 0) ready.push(dependentKey)
      }
    }
  }

  // _Resolve (bboxCache.cpp:1066-1130). Returns undefined where upstream
  // returns false (no bboxes).
  private _resolve(prim: Prim): PurposeToBBoxMap | undefined {
    // NOTE: Bounds are cached in local space, but computed in world space.
    const prototypePrimContexts: PrimContext[] = []
    const context = primContext(prim)
    let entry: Entry | undefined = this._findOrCreateEntriesForPrim(context, prototypePrimContexts)
    if (entry.isComplete) {
      return entry.bboxes.size > 0 ? copyBBoxes(entry.bboxes) : undefined
    }

    // Resolve all prototype prims first.
    if (prototypePrimContexts.length > 0) this._resolvePrototypes(prototypePrimContexts)

    // Find the nearest ancestor prim that's a model or a subcomponent. Its
    // CTM is read after _ctmCache has been swapped with a fresh thread-local
    // UsdGeomXformCache (bboxCache.cpp:1099-1105), i.e. at
    // UsdTimeCode::Default() (xformCache.cpp:24-27), whatever the cache time.
    const modelPrim = getNearestComponent(prim)
    const inverseComponentCtm = toGfMatrix(new XformCache(modelPrim.getStage())
      .getLocalToWorldTransform(modelPrim.path)).getInverse()
    this._resolvePrim(context, inverseComponentCtm)

    // The map may contain unresolved entries; future queries populate them.
    entry = this._findEntry(context)
    if (!entry) return undefined
    return entry.bboxes.size > 0 ? copyBBoxes(entry.bboxes) : undefined
  }

  // _GetBBoxFromExtentsHint (bboxCache.cpp:1132-1171).
  private _getBBoxFromExtentsHint(prim: Prim, bboxes: PurposeToBBoxMap): boolean {
    const extents = this._getExtentsHint(prim)
    if (!extents) return false

    const purposeTokens = Imageable.getOrderedPurposeTokens()
    for (let i = 0; i < purposeTokens.length; ++i) {
      const idx = i * 2
      // Missing extents for a purpose imply the rest of the bounds are empty.
      if (idx + 2 > extents.length) break
      bboxes.set(purposeTokens[i]!, new GfBBox3d(new GfRange3d(extents[idx]!, extents[idx + 1]!)))
    }
    return true
  }

  // _ResolvePrim (bboxCache.cpp:1173-1516).
  private _resolvePrim(context: PrimContext, inverseComponentCtm: GfMatrix4d): void {
    // NOTE: Bounds are cached in local space, but computed in world space.
    const entry = this._findEntry(context)
    if (!entry) return
    const bboxes = entry.bboxes
    if (entry.isComplete) return

    // Initially the bboxes map is empty, which implies empty bounds.
    const prim = context.prim

    // Not recursive: any parent's purpose is already cached.
    this._computePurposeInfo(entry, context, false)

    // Check if the prim is a model and has extentsHint.
    const useExtentsHintForPrim = this._useExtentsHintForPrim(prim)
    if (useExtentsHintForPrim) {
      const extentsHintAttr = prim.getAttr('extentsHint')
      if (extentsHintAttr && this._getBBoxFromExtentsHint(prim, bboxes)) {
        entry.isComplete = true
        entry.isVarying = isVaryingImpl(this._time, extentsHintAttr)
        entry.isIncluded = this._shouldIncludePrim(prim)
        return
      }
    }

    // Only checked while isVarying is false; child variability is also
    // accumulated into entry.isVarying below.
    if (!entry.isVarying) {
      const visAttr = !this._ignoreVisibility && prim.isA('Imageable')
        ? prim.getAttr('visibility') : undefined
      const extentAttr = prim.isA('Boundable') ? prim.getAttr('extent') : undefined
      entry.isVarying =
        (prim.isA('Xformable') && transformMightBeTimeVarying(prim)) ||
        isVaryingImpl(this._time, extentAttr) ||
        isVaryingImpl(this._time, visAttr)
    }

    // Leaf gprims and boundable intermediate prims: an authored extent is
    // expected to incorporate the extent of all children.
    if (prim.isA('Boundable')) {
      const extent = Boundable.computeExtent(prim, this._time)
      if (extent) {
        const purpose = entry.purposeInfo.purpose
        const bboxForPurpose = bboxes.get(purpose) ?? new GfBBox3d()
        bboxes.set(purpose, bboxForPurpose)
        bboxForPurpose.setRange(new GfRange3d(
          new GfVec3d(...extent[0]), new GfVec3d(...extent[1])))
      }
    } else {
      // Not a boundable, so descend to children. The bbox is in local space;
      // merging child bounds temporarily moves it into component space.
      let bboxInComponentSpace = false
      let localToComponentXform = new GfMatrix4d(1.0)

      // The enclosing model's (or subcomponent's) inverse CTM, used to
      // compute the child bounds in model-space.
      const inverseEnclosingComponentCtm = isComponentOrSubComponent(prim)
        ? this._ctm(prim).getInverse()
        : inverseComponentCtm

      const included: PrimContext[] = []
      let children: Prim[]
      let childInheritableInstancePurpose: string
      const primIsInstance = prim.isInstance()
      if (primIsInstance) {
        // The prototype's children inherit this instance's purpose.
        children = prim.getPrototype()!.getFilteredChildren(CHILD_PREDICATE)
        childInheritableInstancePurpose = getInheritablePurpose(entry.purposeInfo)
      } else {
        children = prim.getFilteredChildren(CHILD_PREDICATE)
        childInheritableInstancePurpose = context.instanceInheritablePurpose
      }

      for (const childPrim of children) {
        const childPrimContext = primContext(childPrim, childInheritableInstancePurpose)

        // Skip excluded children here so an invisible prim queried
        // explicitly still returns its bound.
        const childEntry = this._findEntry(childPrimContext)
        if (!childEntry) continue

        // Populate isIncluded when processing the child for the first time.
        if (!childEntry.isComplete) childEntry.isIncluded = this._shouldIncludePrim(childPrim)

        if (!this._ignoreVisibility && !childEntry.isIncluded) {
          // Mark the parent varying if the excluded child's visibility is
          // varying, so it is dirtied when the child becomes visible.
          if (childPrim.isA('Imageable')) {
            entry.isVarying ||= isVaryingImpl(this._time, childPrim.getAttr('visibility'))
          }
          continue
        }
        included.push(childPrimContext)
      }

      // Prototype children of an instance were resolved in _Resolve; other
      // children are resolved now.
      if (!primIsInstance) {
        for (const childPrimContext of included) {
          this._resolvePrim(childPrimContext, inverseEnclosingComponentCtm)
        }
      }

      // Accumulate child variability and bounds into this cache entry.
      for (const childPrimContext of included) {
        const childPrim = childPrimContext.prim
        const childEntry = this._findEntry(childPrimContext)
        if (!childEntry?.isComplete) continue

        entry.isVarying ||= childEntry.isVarying

        if (childEntry.bboxes.size > 0) {
          if (!bboxInComponentSpace) {
            // Put the local extent into "baked" component space, i.e. a bbox
            // with identity transform.
            localToComponentXform =
              this._ctm(prim).getMultiply(inverseEnclosingComponentCtm)
            for (const [purpose, bbox] of bboxes) {
              bbox.setMatrix(localToComponentXform)
              bboxes.set(purpose, new GfBBox3d(bbox.ComputeAlignedRange()))
            }
            bboxInComponentSpace = true
          }

          const childBBoxes = copyBBoxes(childEntry.bboxes)

          const childLocalToComponentXform = primIsInstance
            ? this._localTransformation(childPrim).getMultiply(localToComponentXform)
            : this._ctm(childPrim).getMultiply(inverseEnclosingComponentCtm)

          // Convert the resolved BBox to component space and union there.
          for (const [purposeToken, childBBox] of childBBoxes) {
            childBBox.Transform(childLocalToComponentXform)
            const bbox = bboxes.get(purposeToken) ?? new GfBBox3d()
            bboxes.set(purposeToken, bbox)
            bbox.setRange(new GfRange3d(bbox.getRange()).unionWith(childBBox.ComputeAlignedRange()))
          }
        }
      }

      // All prims are cached in local space: convert from component space.
      if (bboxInComponentSpace) {
        const componentToLocalXform = localToComponentXform.getInverse()
        for (const bbox of bboxes.values()) bbox.setMatrix(componentToLocalXform)
      }
    }

    // Mark as cached.
    entry.isComplete = true
  }
}

_registerBBoxCache(BBoxCache)
