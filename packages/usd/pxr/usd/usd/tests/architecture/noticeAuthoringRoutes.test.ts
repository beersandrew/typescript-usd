// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/prim.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Authoring-route invariance of ObjectsChanged notices — an architecture-
// level invariant with no single upstream testenv counterpart. Upstream has
// exactly ONE notice-classification pipeline: every edit lands in the Sdf
// layer, and UsdStage::_ComputePendingChanges reads the resulting
// SdfChangeList (pxr/usd/usd/stage.cpp:4586-4612) — there is no Usd-API side
// channel. So editing a field through the Usd API (UsdPrim::SetTypeName,
// UsdObject::SetMetadata, UsdAttribute::Set, ...) and through the equivalent
// raw Sdf spec edit produce IDENTICAL notices, on every kind of stage.
//
// Live 26.05 capture (fresh stage per route, same logical edit; notices
// compared as (resynced, changedInfoOnly) with GetChangedFields; captured on
// BOTH an opened file-backed stage and Usd.Stage.CreateInMemory — results
// identical across stage kinds):
//   typeName set          -> routes IDENTICAL: Resynced {'/Parent1': ['typeName']}
//   kind SetMetadata      -> routes IDENTICAL: Resynced {'/Parent1': ['kind']}
//   apiSchemas prepend    -> routes IDENTICAL: Resynced {'/Parent1': ['apiSchemas']}
//   attribute default set -> routes IDENTICAL: ChangedInfoOnly {'/Parent1.attr1': ['default']}
//
// This file asserts ROUTE-INVARIANCE only — that the Usd-API route and the
// raw-layer route emit equal notices for the same logical edit. Which
// category each field natively lands in (resync vs info-only) is covered by
// tests/upstream/objectsChangedFieldClassification.test.ts and deliberately
// NOT re-asserted here.
//
// The shared Usd field classifier now drives both raw Sdf batches and the
// direct in-memory authoring path. Public routes exercised: setTypeName,
// setKind/setMetadata, addAppliedSchema, and Attribute.set.

import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Stage, Prim } from '../../src/index.ts'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const enc = (text: string) => new TextEncoder().encode(text)

// The objectsChangedFieldClassification.test.ts fixture shape, so the
// raw-layer route here matches that suite's edits one-for-one.
const LAYER_CONTENTS = `#usda 1.0
def Scope "Parent1" {

    int attr1 = 1

    def Sphere "Child1" {
    }
}
`

// Opened, file-backed stage (pcp-backed composition).
async function openedStage(): Promise<Stage> {
  return (await Stage.open('layer.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'layer.usda': enc(LAYER_CONTENTS) })),
  }))!
}

// In-memory authoring stage (UsdStage::CreateInMemory analog), with the same
// /Parent1 content authored through the Usd API and flushed before the
// measured edit.
async function inMemoryStage(): Promise<Stage> {
  const stage = Stage.createNew()
  const prim = stage.definePrim('/Parent1', 'Scope')
  prim.createAttr('attr1', 1)
  await stage.flushChanges()
  return stage
}

function collectNotices(stage: Stage): ObjectsChangedSummary[] {
  const notices: ObjectsChangedSummary[] = []
  onObjectsChanged(stage, notice => notices.push(notice))
  return notices
}

async function noticesFor(
  makeStage: () => Promise<Stage>,
  edit: (stage: Stage) => void,
): Promise<ObjectsChangedSummary[]> {
  const stage = await makeStage()
  expect(stage.getPrim('/Parent1')).toBeDefined()
  const notices = collectNotices(stage)
  edit(stage)
  await stage.flushChanges()
  return notices
}

// The invariant: the same logical edit made through the Usd API and through
// the raw Sdf layer must produce identical coalesced notices.
async function expectRouteInvariant(
  makeStage: () => Promise<Stage>,
  usdRoute: (stage: Stage) => void,
  sdfRoute: (stage: Stage) => void,
): Promise<void> {
  const viaUsdApi = await noticesFor(makeStage, usdRoute)
  const viaSdfLayer = await noticesFor(makeStage, sdfRoute)
  expect(viaUsdApi).toEqual(viaSdfLayer)
}

const STAGE_KINDS: [string, () => Promise<Stage>][] = [
  ['opened stage', openedStage],
  ['in-memory stage', inMemoryStage],
]

for (const [kind, makeStage] of STAGE_KINDS) {
  describe(`ObjectsChanged notices are authoring-route-invariant (${kind})`, () => {
    it('typeName: Prim.setTypeName equals a raw layer typeName edit', async () => {
      // Live 26.05 capture: both routes -> Resynced {'/Parent1': ['typeName']}.
      await expectRouteInvariant(makeStage,
        (stage) => { stage._primHandle('/Parent1').setTypeName('Cylinder') },
        (stage) => { stage.getRootLayer().setField('/Parent1', 'typeName', 'Cylinder') },
      )
    })

    it('kind: Prim.setKind equals a raw layer kind edit', async () => {
      // Live 26.05 capture: both routes -> Resynced {'/Parent1': ['kind']}.
      await expectRouteInvariant(makeStage,
        (stage) => { stage.getPrim('/Parent1')!.setKind('model') },
        (stage) => { stage.getRootLayer().setField('/Parent1', 'kind', 'model') },
      )
    })

    it('apiSchemas: Prim.addAppliedSchema equals a raw layer listOp edit', async () => {
      // UsdPrim::AddAppliedSchema authors a prepend on the apiSchemas listOp
      // (pxr/usd/usd/prim.cpp:1111-1126).
      // Live 26.05 capture: both routes -> Resynced {'/Parent1': ['apiSchemas']}.
      await expectRouteInvariant(makeStage,
        (stage) => { stage._primHandle('/Parent1').addAppliedSchema('CollectionAPI:myCollection') },
        (stage) => {
          stage.getRootLayer().setField('/Parent1', 'apiSchemas', {
            isExplicit: false,
            explicitItems: [],
            prependedItems: ['CollectionAPI:myCollection'],
            appendedItems: [],
            deletedItems: [],
          })
        },
      )
    })

    it('attribute default: Attribute.set equals a raw layer default edit', async () => {
      // Live 26.05 capture: both routes ->
      // ChangedInfoOnly {'/Parent1.attr1': ['default']}.
      await expectRouteInvariant(makeStage,
        (stage) => { stage._primHandle('/Parent1').attr('attr1').set(42) },
        (stage) => { stage.getRootLayer().setField('/Parent1.attr1', 'default', 42) },
      )
    })
  })
}
