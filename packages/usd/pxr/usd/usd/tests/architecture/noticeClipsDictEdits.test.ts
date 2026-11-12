// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/testenv/testUsdValueClips.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Notice classification for edits to the `clips` metadata dictionary — an
// architecture-level invariant with no single upstream testenv counterpart
// (upstream covers it implicitly through testUsdValueClips' change-processing
// paths). Upstream classifies ANY change to a clip-related field as a
// recompose: UsdStage::_ComputePendingChanges routes fields through
// UsdIsClipRelatedField (pxr/usd/usd/stage.cpp:4597), which matches the
// `clips` field name alone — it does not inspect the old/new values, so
// editing a value INSIDE an existing clips dictionary resyncs the prim
// exactly like adding or removing the whole dictionary.
//
// Live 26.05 capture (Sdf.PrimSpec.SetInfo('clips', ...) on an opened stage;
// GetChangedFields shown in brackets):
//   add whole dict     -> Resynced [('/Model', ['clips'])], ChangedInfoOnly []
//   edit 'active' array
//     inside existing  -> Resynced [('/Model', ['clips'])], ChangedInfoOnly []
//   remove whole dict  -> Resynced [('/Model', ['clips'])], ChangedInfoOnly []
// The notice path is the prim path exactly, and ChangedInfoOnly is empty in
// all three cases.
//
// Divergence under test: pcp/src/changes.ts:73-76 classifies clips/clipSets
// changes as 'significant' only on PRESENCE changes (dict added or removed);
// an edit within an existing dict classifies as 'value' and surfaces as an
// info-only notice with no recompose — where upstream resyncs.

import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { _sdfCloneValue } from 'typescript-usd/sdf/_internal'
import { Stage } from '../../src/index.ts'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const enc = (text: string) => new TextEncoder().encode(text)

// The corpus-style clips dict shape (valueClips.test.ts openClips fixture),
// so typescript-usd parses the dictionary the same way its value-clips suite does.
const ROOT_WITH_CLIPS = `#usda 1.0
def "Model" (
  clips = { dictionary default = {
    double2[] active = [(0, 0), (10, 1)]
    asset[] assetPaths = [@./clip0.usda@, @./clip1.usda@]
    string primPath = "/Clip"
    double2[] times = [(0, 0), (10, 10)]
  } }
) { double value ; }
`

const ROOT_WITHOUT_CLIPS = `#usda 1.0
def "Model" { double value ; }
`

const ROOT_WITH_DIRECT_SAMPLE = `#usda 1.0
(
  subLayers = [@./samples.usda@]
)
over "Model" {}
`

const SAMPLES = `#usda 1.0
def "Model" { double value.timeSamples = { 0: 100 } ; }
`

const CLIP0 = `#usda 1.0
def "Clip" { double value.timeSamples = { 0: 0, 10: 10 } ; }`
const CLIP1 = `#usda 1.0
def "Clip" { double value.timeSamples = { 0: 100, 10: 110 } ; }`

async function openStage(root: string): Promise<Stage> {
  return (await Stage.open('root.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'root.usda': enc(root),
      'samples.usda': enc(SAMPLES),
      'clip0.usda': enc(CLIP0),
      'clip1.usda': enc(CLIP1),
    })),
  }))!
}

function collectNotices(stage: Stage): ObjectsChangedSummary[] {
  const notices: ObjectsChangedSummary[] = []
  onObjectsChanged(stage, notice => notices.push(notice))
  return notices
}

async function noticeFor(
  root: string,
  edit: (stage: Stage) => void,
): Promise<ObjectsChangedSummary[]> {
  const stage = await openStage(root)
  expect(stage.getPrim('/Model')).toBeDefined()
  const notices = collectNotices(stage)
  edit(stage)
  await stage.flushChanges()
  return notices
}

// The parsed clips dictionary from the authored fixture, reused as the
// setField payload so the add case authors the exact shape typescript-usd parses.
async function parsedClipsDict(): Promise<Record<string, unknown>> {
  const stage = await openStage(ROOT_WITH_CLIPS)
  // getField's value may be shared with the layer (SdfLayer::GetField
  // returns a copy-on-write VtValue); the tests edit a copy.
  const dict = stage.getRootLayer().getField('/Model', 'clips')
  expect(dict).toBeDefined()
  return _sdfCloneValue(dict) as Record<string, unknown>
}

describe('clips metadata dictionary edits (notice classification)', () => {
  it('adding a clips dict resyncs the prim', async () => {
    // Live 26.05 capture: Resynced {'/Model': ['clips']}.
    const dict = await parsedClipsDict()
    expect(await noticeFor(ROOT_WITHOUT_CLIPS, (stage) => {
      stage.getRootLayer().setField('/Model', 'clips', dict)
    })).toEqual([{ resyncedPaths: ['/Model'], changedInfoOnlyPaths: [] }])
  })

  it('editing a value inside an existing clips dict resyncs the prim', async () => {
    // Live 26.05 capture: Resynced {'/Model': ['clips']} — identical to the
    // add case; UsdIsClipRelatedField matches on the field name alone
    // (stage.cpp:4597), never on whether the dictionary already existed.
    const dict = await parsedClipsDict()
    const inner = dict['default'] as Record<string, unknown>
    expect(inner).toBeDefined()
    expect(inner['active']).toBeDefined()
    inner['active'] = [[0, 1], [10, 0]]
    expect(await noticeFor(ROOT_WITH_CLIPS, (stage) => {
      stage.getRootLayer().setField('/Model', 'clips', dict)
    })).toEqual([{ resyncedPaths: ['/Model'], changedInfoOnlyPaths: [] }])
  })

  it('removing the clips dict resyncs the prim', async () => {
    // Live 26.05 capture: Resynced {'/Model': ['clips']}.
    expect(await noticeFor(ROOT_WITH_CLIPS, (stage) => {
      stage.getRootLayer().eraseField('/Model', 'clips')
    })).toEqual([{ resyncedPaths: ['/Model'], changedInfoOnlyPaths: [] }])
  })

  it('a layer first observed as clip-free composes its first clips field live', async () => {
    // Live 26.05 capture: the initial value is the direct sample (100),
    // authoring the complete clips dictionary resyncs /Model, and the same
    // stage immediately resolves the clip sample (0). This specifically
    // exercises the false -> true cache-lifetime transition.
    const stage = await openStage(ROOT_WITH_DIRECT_SAMPLE)
    expect(stage.get('/Model.value')?.getValueAtTime(0)).toBe(100)
    const notices = collectNotices(stage)
    stage.getRootLayer().setField('/Model', 'clips', await parsedClipsDict())
    await stage.flushChanges()

    expect(notices).toEqual([{
      resyncedPaths: ['/Model'], changedInfoOnlyPaths: [],
    }])
    expect(stage.get('/Model.value')?.getValueAtTime(0)).toBe(0)
  })
})
