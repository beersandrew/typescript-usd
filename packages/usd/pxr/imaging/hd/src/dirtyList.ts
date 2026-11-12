// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dirtyList.cpp,
//  pxr/imaging/hd/dirtyList.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/dirtyList.{h,cpp} — Hd_DirtyList, used for faster
// iteration of dirty Rprims by the render index. GetDirtyRprims() implicitly
// refreshes and caches the list using the change tracker's version numbers:
//   - scene state unchanged + same filters     -> empty list (super fast)
//   - varying state changed                    -> just the varying Rprims
//   - filter/index changed (new prim, new tag) -> all matching Rprims
//
import { HdChangeTracker, HdRprimChangeTracker } from './changeTracker.ts'
import type { HdDirtyBits } from './changeTracker.ts'
import { HdPerfLog } from './perfLog.ts'
import { HdPerfTokens } from './tokens.ts'

const { InitRepr, Varying, AllSceneDirtyBits, Clean } = HdChangeTracker

function _arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// std::set_union over sorted, unique string vectors.
function _setUnion(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort()
}

// The slice of HdRenderIndex that Hd_DirtyList consults (upstream takes the
// render index itself).
interface HdDirtyListIndex {
  getChangeTracker(): HdRprimChangeTracker
  getRprimIds(): string[]
  // Analog of HdRenderIndex::UpdateRenderTag — returns the prim's render tag.
  getRprimRenderTag(id: string): string
}

// -----------------------------------------------------------------------------
// Hd_DirtyList — ports pxr/imaging/hd/dirtyList.cpp's rebuild/filter logic.
// -----------------------------------------------------------------------------

export class Hd_DirtyList {
  private _index: HdDirtyListIndex
  private _trackedRenderTags: string[] = []
  private _trackedReprs: string[] = []
  private _dirtyIds: string[] = []

  private _sceneStateVersion: number
  private _rprimIndexVersion: number
  private _rprimRenderTagVersion: number
  private _varyingStateVersion: number

  private _rebuildDirtyList = false
  private _pruneDirtyList = false

  constructor(index: HdDirtyListIndex) {
    this._index = index
    const t = index.getChangeTracker()
    // Initialize one behind so the first GetDirtyRprims() rebuilds.
    this._sceneStateVersion = t.getSceneStateVersion() - 1
    this._rprimIndexVersion = t.getRprimIndexVersion() - 1
    this._rprimRenderTagVersion = t.getRenderTagVersion() - 1
    this._varyingStateVersion = t.getVaryingStateVersion() - 1
  }

  getDirtyRprims(): string[] {
    const t = this._index.getChangeTracker()
    const currentSceneStateVersion = t.getSceneStateVersion()

    // If the scene state hasn't changed and the tracked filters are the same,
    // all Rprims are up-to-date; return an empty vector (don't clear _dirtyIds,
    // its result may be reused when only existing varying Rprims are dirtied).
    if (this._sceneStateVersion === currentSceneStateVersion &&
        !this._pruneDirtyList &&
        !this._rebuildDirtyList) {
      return []
    }

    this._sceneStateVersion = currentSceneStateVersion
    this._updateDirtyIdsIfNeeded()
    return this._dirtyIds
  }

  updateRenderTagsAndReprSelectors(tags: string[], reprs: string[]): void {
    let trackedRenderTagsChanged = false

    // Grow the tracked render tags set if necessary (additive only).
    {
      const combined = [...this._trackedRenderTags]
      for (const tag of tags) {
        if (!combined.includes(tag)) combined.push(tag)
      }
      if (!_arraysEqual(this._trackedRenderTags, combined)) {
        this._trackedRenderTags = combined
        trackedRenderTagsChanged = true
      }
    }

    // Grow (or reset) the tracked repr set. We can only grow it when we can
    // guarantee all Rprims have had a chance to initialize the tracked reprs,
    // i.e. neither the render tags nor the rprim index/render-tag versions
    // moved. Otherwise reset to the requested reprs.
    let trackedReprsChanged = false
    {
      const t = this._index.getChangeTracker()
      const currentRprimIndexVersion = t.getRprimIndexVersion()
      const currentRprimRenderTagVersion = t.getRenderTagVersion()
      if (trackedRenderTagsChanged ||
          this._rprimIndexVersion !== currentRprimIndexVersion ||
          this._rprimRenderTagVersion !== currentRprimRenderTagVersion) {
        // Reset tracked repr set.
        this._trackedReprs = [...reprs].sort()
        trackedReprsChanged = true
      } else {
        // Combine.
        const combined = _setUnion(this._trackedReprs, reprs)
        if (!_arraysEqual(this._trackedReprs, combined)) {
          this._trackedReprs = combined
          trackedReprsChanged = true
        }
      }
    }

    if (trackedRenderTagsChanged || trackedReprsChanged) {
      this._rebuildDirtyList = true
    }
  }

  // Sets the flag to prune the dirty list to just the varying Rprims on the
  // next call to GetDirtyRprims.
  pruneToVaryingRprims(): void {
    this._pruneDirtyList = true
  }

  private _updateDirtyIdsIfNeeded(): void {
    const t = this._index.getChangeTracker()
    const currentRprimIndexVersion = t.getRprimIndexVersion()
    const currentRprimRenderTagVersion = t.getRenderTagVersion()
    const currentVaryingStateVersion = t.getVaryingStateVersion()

    const gatherAllRprims =
      this._rebuildDirtyList ||
      this._rprimIndexVersion !== currentRprimIndexVersion ||
      this._rprimRenderTagVersion !== currentRprimRenderTagVersion

    const gatherVaryingRprims =
      this._pruneDirtyList ||
      this._varyingStateVersion !== currentVaryingStateVersion

    const reuseDirtyIds = !(gatherAllRprims || gatherVaryingRprims)
    if (reuseDirtyIds) return

    HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.dirtyListsRebuilt)

    let mask: HdDirtyBits = AllSceneDirtyBits
    if (gatherAllRprims) {
      this._rprimIndexVersion = currentRprimIndexVersion
      this._rprimRenderTagVersion = currentRprimRenderTagVersion
      this._varyingStateVersion = currentVaryingStateVersion
      this._rebuildDirtyList = false
      this._pruneDirtyList = true // Trim to varying ids on the next iteration.
      // Clean is interpreted as an all-pass filter (see _Filter).
      mask = Clean
    } else if (gatherVaryingRprims) {
      this._varyingStateVersion = currentVaryingStateVersion
      this._pruneDirtyList = false
      mask = Varying
    }

    // Run the predicate filter over all rprim ids (the prim-gather fast path:
    // include = root, exclude = empty).
    this._dirtyIds = []
    for (const id of this._index.getRprimIds()) {
      if (this._filter(id, mask)) this._dirtyIds.push(id)
    }

    if (mask === Clean) {
      // New prims may have reprs they've not seen before; flag them for
      // reevaluation (Storm repr initialization).
      for (const id of this._dirtyIds) {
        t._MarkRprimDirty(id, InitRepr)
      }
    }
  }

  // Mirrors _DirtyRprimIdsFilterPredicate.
  private _filter(id: string, mask: HdDirtyBits): boolean {
    const t = this._index.getChangeTracker()
    const bits = t.getRprimDirtyBits(id)

    if (mask === Clean || (bits & mask) !== 0) {
      const primRenderTag = this._index.getRprimRenderTag(id)
      // An empty render tag set means everything passes the filter.
      if (this._trackedRenderTags.length === 0) return true
      return this._trackedRenderTags.includes(primRenderTag)
    }
    return false
  }
}
