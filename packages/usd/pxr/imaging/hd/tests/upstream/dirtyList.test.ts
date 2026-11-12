// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdDirtyList.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/testenv/testHdDirtyList.cpp (BasicTest) — exercises
// Hd_DirtyList's rebuild/filter and varying-state behavior, asserting both the
// dirty-rprim count and the dirtyListsRebuilt perf counter after each section.
//
// Upstream drives this through Hd_TestDriver + HdUnitTestDelegate (Storm GPU
// infra). Here a focused in-memory harness (Hd_DirtyListTestIndex below +
// HdRprimChangeTracker, see src/changeTracker.ts) reproduces the observable
// behavior without GPU/Storm.

import { describe, expect, it } from 'vitest'
import { HdChangeTracker, HdRprimChangeTracker } from '../../src/changeTracker.ts'
import { HdPerfLog } from '../../src/perfLog.ts'
import { HdPerfTokens, HdRenderTagTokens } from '../../src/tokens.ts'
import { Hd_DirtyList } from '../../src/dirtyList.ts'

// Minimal scene/render-index model: holds rprims, each with a render tag,
// backed by an HdRprimChangeTracker. Stands in for HdRenderIndex +
// HdUnitTestDelegate (AddCube) — the upstream test scaffolding.
interface AddCubeOptions {
  guide?: boolean
}

class Hd_DirtyListTestIndex {
  private _tracker = new HdRprimChangeTracker()
  private _renderTags = new Map<string, string>()
  private _rprimIds: string[] = []

  getChangeTracker(): HdRprimChangeTracker { return this._tracker }
  getRprimIds(): string[] { return this._rprimIds }

  // Analog of HdRenderIndex::UpdateRenderTag — returns the prim's render tag.
  getRprimRenderTag(id: string): string {
    return this._renderTags.get(id) ?? HdRenderTagTokens.geometry
  }

  addCube(path: string, opts: AddCubeOptions = {}): void {
    const renderTag = opts.guide
      ? HdRenderTagTokens.guide
      : HdRenderTagTokens.geometry
    // HdRprim::GetInitialDirtyBitsMask returns AllDirty, which deliberately
    // excludes the Varying tracker-state bit (changeTracker.h:45).
    this._tracker.rprimInserted(path, HdChangeTracker.AllDirty)
    this._renderTags.set(path, renderTag)
    if (!this._rprimIds.includes(path)) this._rprimIds.push(path)
  }
}

// Repr selectors (HdReprTokens). Only the primary token matters to the model.
const surface = 'refined'
const wireOnSurf = 'wireOnSurf'

describe('Hd_DirtyList (testHdDirtyList BasicTest)', () => {
  it('rebuilds, filters and prunes the dirty list faithfully', () => {
    const perfLog = HdPerfLog.GetInstance()
    perfLog.enable()

    const index = new Hd_DirtyListTestIndex()

    // Add 3 prims (2 geometry, 1 guide).
    let numGeometryPrims = 0
    let numGuidePrims = 0
    index.addCube('/cube1'); numGeometryPrims++
    index.addCube('/cube2'); numGeometryPrims++
    index.addCube('/cube3', { guide: true }); numGuidePrims++

    const dl = new Hd_DirtyList(index)
    // The dirty list has no tracked render tags or reprs yet.

    const rebuilt = () => perfLog.getCounter(HdPerfTokens.dirtyListsRebuilt)

    // 1. Empty render tags is treated as an all-pass filter, so all the rprims
    //    should be in the dirty list.
    {
      perfLog.resetCounters()

      dl.updateRenderTagsAndReprSelectors([], [surface])

      expect(dl.getDirtyRprims().length).toBe(numGeometryPrims + numGuidePrims)
      expect(rebuilt()).toBe(1)
    }

    // 2. Toggle the repr. This grows the tracked repr set and rebuilds to
    //    initialize the repr for all rprims. On switching back, the dirty list
    //    is rebuilt to just the varying rprims (none).
    {
      perfLog.resetCounters()

      dl.updateRenderTagsAndReprSelectors([], [wireOnSurf])
      expect(dl.getDirtyRprims().length).toBe(numGeometryPrims + numGuidePrims)

      dl.updateRenderTagsAndReprSelectors([], [surface])
      expect(dl.getDirtyRprims().length).toBe(0)
      expect(rebuilt()).toBe(2)
    }

    // 3. Update the render tags.
    {
      perfLog.resetCounters()

      // empty -> geometry : apply just the 'geometry' tag filter on rebuild.
      dl.updateRenderTagsAndReprSelectors(
        [HdRenderTagTokens.geometry], [surface])
      expect(dl.getDirtyRprims().length).toBe(numGeometryPrims)

      // geometry -> guide : the tracked render tag set grows (no rprims
      // added/removed, repr opinion unchanged), so it rebuilds to include both
      // geometry and guide prims.
      dl.updateRenderTagsAndReprSelectors(
        [HdRenderTagTokens.guide], [surface])
      expect(dl.getDirtyRprims().length).toBe(numGeometryPrims + numGuidePrims)
      expect(rebuilt()).toBe(2)

      // guide -> geometry : rebuilt to just the varying ones (none).
      dl.updateRenderTagsAndReprSelectors(
        [HdRenderTagTokens.geometry], [surface])
      expect(dl.getDirtyRprims().length).toBe(0)
      expect(rebuilt()).toBe(3)
    }

    // 4. Add an rprim. This resets the active repr set and rebuilds the list.
    {
      perfLog.resetCounters()

      index.addCube('/cube4'); numGeometryPrims++

      expect(dl.getDirtyRprims().length).toBe(numGeometryPrims + numGuidePrims)
      expect(rebuilt()).toBe(1)
    }

    // 5. Varying test. Clean a few rprims (simulate the render delegate sync'ing
    //    and clearing dirty bits), then make edits. This reduces the dirty list
    //    from all rprims to just the varying ones.
    {
      perfLog.resetCounters()

      const tracker = index.getChangeTracker()
      tracker.markRprimClean('/cube1')
      tracker.markRprimClean('/cube3')

      tracker.markRprimDirty('/cube1', HdChangeTracker.DirtyPrimvar)
      tracker.markRprimDirty('/cube3', HdChangeTracker.DirtyPoints)

      expect(dl.getDirtyRprims().length).toBe(2)
      expect(rebuilt()).toBe(1)

      // Querying again when nothing has changed returns an empty list.
      expect(dl.getDirtyRprims().length).toBe(0)
    }
  })
})
