// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/clipSetDefinition.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// The clipSets list-op composes independently of the clips dictionary: a
// STRONGER layer authoring only `delete clipSets = [...]` removes a clip set
// introduced by a weaker layer (Usd_ComputeClipSetDefinitionsForPrimIndex
// applies each layer's clipSets op with no clips dict present,
// clipSetDefinition.cpp:450-453). A definition scan that only visits layers
// authoring a `clips` dict misses exactly this case.
//
// Live 26.05 capture (samples in the weakest sublayer, the clips dict in a
// stronger sublayer, the delete in the root layer):
//   without the delete: /Model/Geom.size @ 0 = 5   (the clip value wins)
//   with the delete:    /Model/Geom.size @ 0 = 100 (direct samples win)

import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Stage } from '../../src/index.ts'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const enc = (text: string) => new TextEncoder().encode(text)

const SAMPLES = enc(`#usda 1.0
def Xform "Model"
{
    def Scope "Geom"
    {
        double size = 1
        double size.timeSamples = {
            0: 100,
        }
    }
}
`)

const CLIP_META = enc(`#usda 1.0
over "Model" (
    clips = {
        dictionary main = {
            asset[] assetPaths = [@./c1.usda@]
            string primPath = "/Model"
            double2[] active = [(0, 0)]
        }
    }
)
{
}
`)

const CLIP_LAYER = enc(`#usda 1.0
def Xform "Model"
{
    def Scope "Geom"
    {
        double size.timeSamples = {
            0: 5,
        }
    }
}
`)

const ROOT_WITH_DELETE = enc(`#usda 1.0
(
    subLayers = [@clipmeta.usda@, @samples.usda@]
)
over "Model" (
    delete clipSets = ["main"]
)
{
}
`)

const ROOT_PLAIN = enc(`#usda 1.0
(
    subLayers = [@clipmeta.usda@, @samples.usda@]
)
over "Model"
{
}
`)

async function openStage(root: Uint8Array): Promise<Stage> {
  return (await Stage.open('root.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'root.usda': root,
      'clipmeta.usda': CLIP_META,
      'samples.usda': SAMPLES,
      'c1.usda': CLIP_LAYER,
    })),
  }))!
}

describe('clipSets list-op composition', () => {
  it('a clip set applies from a stronger sublayer (control)', async () => {
    const stage = await openStage(ROOT_PLAIN)
    expect(stage.get('/Model/Geom.size')?.getValueAtTime(0)).toBe(5)
  })

  it('a clipSets-only stronger layer deletes a weaker clip set', async () => {
    const stage = await openStage(ROOT_WITH_DELETE)
    expect(stage.get('/Model/Geom.size')?.getValueAtTime(0)).toBe(100)
  })

  it('a layer first observed as clip-free composes its first clipSets op live', async () => {
    // Live 26.05 capture: the weaker clip initially wins (5); authoring a
    // delete clipSets list-op on the already-open stronger layer resyncs
    // /Model and exposes the direct sample (100) on the same stage.
    const stage = await openStage(ROOT_PLAIN)
    expect(stage.get('/Model/Geom.size')?.getValueAtTime(0)).toBe(5)
    const notices: Array<{ resyncedPaths: readonly string[]; changedInfoOnlyPaths: readonly string[] }> = []
    onObjectsChanged(stage, notice => notices.push(notice))
    stage.getRootLayer().setField('/Model', 'clipSets', {
      isExplicit: false,
      explicitItems: [],
      prependedItems: [],
      appendedItems: [],
      deletedItems: ['main'],
    })
    await stage.flushChanges()

    expect(notices).toEqual([{
      resyncedPaths: ['/Model'], changedInfoOnlyPaths: [],
    }])
    expect(stage.get('/Model/Geom.size')?.getValueAtTime(0)).toBe(100)
  })
})
