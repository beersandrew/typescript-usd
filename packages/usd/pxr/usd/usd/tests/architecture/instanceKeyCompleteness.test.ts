// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/instanceKey.cpp, pxr/usd/usd/clipSetDefinition.h,
//  pxr/usd/usd/instanceKey.h
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Prototype identity must be keyed by the full Usd_InstanceKey — the Pcp
// instance key PLUS clip-set definitions, stage load rules, and the
// population mask — per pxr/usd/usd/instanceKey.h:32-61 and
// instanceKey.cpp:84-110, consumed by UsdStage::_NameChildrenPred via
// Usd_InstanceCache::RegisterInstancePrimIndex (stage.cpp:1009-1011).
// History: typescript-usd originally keyed prototypes on the raw Pcp instance key
// alone (the usd-instance-key-completeness debt, retired when
// src/instanceKey.ts landed the full key); this file is the gate that
// caught it and now holds it closed.
//
// Suite placement: architecture, not tests/upstream. testUsdInstancing.py
// has no value-clip case at all, and its load coverage (test_Payloads :502,
// test_Payloads2 :573) runs against the payloads/ testenv asset trees with
// notice validation — the minimal fixtures here are live captures, not 1:1
// testenv ports. Every expected value below is a "Live 26.05 capture:" from
// the reference build (Usd.Stage python) on byte-identical layers.
//
// Captured caveat (clipSetDefinition.h:41-53): identical clips dictionaries
// authored on two DIFFERENT instance prims still separate their prototypes
// natively, because Usd_ClipSetDefinition equality includes sourceLayerStack
// and sourcePrimPath — the site of the clips opinion is identity, not just
// its value. Clips authored once inside the shared referenced asset resolve
// to the same source site for every instance and DO share (green control).

import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Stage, StagePopulationMask } from '../../src/index.ts'

const enc = (text: string) => new TextEncoder().encode(text)

// --- Scenario A fixtures: clip-differing instances -------------------------

const PROP = enc(`#usda 1.0
(
    defaultPrim = "Prop"
)

def Xform "Prop"
{
    def Cube "geom"
    {
        double size = 2
    }
}
`)

const CLIP_A = enc(`#usda 1.0
(
    defaultPrim = "Prop"
)

def Xform "Prop"
{
    def Cube "geom"
    {
        double size = 5
    }
}
`)

const CLIPS_ON_INSTANCES = enc(`#usda 1.0

def "WithClips" (
    instanceable = true
    references = @./prop.usda@
    clips = {
        dictionary default = {
            asset[] assetPaths = [@./clip_a.usda@]
            string primPath = "/Prop"
            double2[] times = [(0, 0)]
        }
    }
)
{
}

def "WithClips2" (
    instanceable = true
    references = @./prop.usda@
    clips = {
        dictionary default = {
            asset[] assetPaths = [@./clip_a.usda@]
            string primPath = "/Prop"
            double2[] times = [(0, 0)]
        }
    }
)
{
}

def "NoClips" (
    instanceable = true
    references = @./prop.usda@
)
{
}
`)

const PROP_WITH_CLIPS = enc(`#usda 1.0
(
    defaultPrim = "Prop"
)

def Xform "Prop" (
    clips = {
        dictionary default = {
            asset[] assetPaths = [@./clip_a.usda@]
            string primPath = "/Prop"
            double2[] times = [(0, 0)]
        }
    }
)
{
    def Cube "geom"
    {
        double size = 2
    }
}
`)

const CLIPS_IN_TARGET = enc(`#usda 1.0

def "SharedA" (
    instanceable = true
    references = @./prop_clips.usda@
)
{
}

def "SharedB" (
    instanceable = true
    references = @./prop_clips.usda@
)
{
}
`)

async function openClipsOnInstancesStage(): Promise<Stage> {
  return (await Stage.open('clipsRoot.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'clipsRoot.usda': CLIPS_ON_INSTANCES,
      'prop.usda': PROP,
      'clip_a.usda': CLIP_A,
    })),
  }))!
}

async function openClipsInTargetStage(): Promise<Stage> {
  return (await Stage.open('clipsShared.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'clipsShared.usda': CLIPS_IN_TARGET,
      'prop_clips.usda': PROP_WITH_CLIPS,
      'clip_a.usda': CLIP_A,
    })),
  }))!
}

// --- Scenario B fixtures: load-rule-differing instances --------------------
// The payload sits BENEATH the instance root (on /Model/Inner inside the
// referenced layer), so every instance's own prim index carries identical
// arcs regardless of load state — the load-rule split is visible ONLY through
// the UsdStageLoadRules component of Usd_InstanceKey (instanceKey.cpp:106,
// _MakeLoadRulesRelativeTo), never through the raw Pcp key.

const PAYLOAD = enc(`#usda 1.0
(
    defaultPrim = "Payload"
)

def Xform "Payload"
{
    def Cube "geom"
    {
        double size = 3
    }
}
`)

const MODEL = enc(`#usda 1.0
(
    defaultPrim = "Model"
)

def Xform "Model"
{
    def "Inner" (
        payload = @./payload.usda@
    )
    {
    }
}
`)

const LOAD_ROOT = enc(`#usda 1.0

def "Model_1" (
    instanceable = true
    references = @./model.usda@
)
{
}

def "Model_2" (
    instanceable = true
    references = @./model.usda@
)
{
}

def "Model_3" (
    instanceable = true
    references = @./model.usda@
)
{
}
`)

async function openLoadStage(loadPayloads: boolean): Promise<Stage> {
  return (await Stage.open('loadRoot.usda', {
    loadPayloads,
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'loadRoot.usda': LOAD_ROOT,
      'model.usda': MODEL,
      'payload.usda': PAYLOAD,
    })),
  }))!
}

const protoOf = (stage: Stage, path: string) =>
  stage.getPrim(path)?.getPrototype()?.path

describe('instance-key completeness: value clips', () => {
  it('clips authored inside the shared referenced asset keep one prototype (control)', async () => {
    // Live 26.05 capture: prototype count 1; /SharedA and /SharedB both map
    // to /__Prototype_1 (same sourceLayerStack + sourcePrimPath </Prop>, so
    // their Usd_ClipSetDefinitions compare equal).
    const stage = await openClipsInTargetStage()
    expect(stage.getPrototypes()).toHaveLength(1)
    const sharedA = protoOf(stage, '/SharedA')
    expect(sharedA).toBeTruthy()
    expect(protoOf(stage, '/SharedB')).toBe(sharedA)
    expect(stage.getInstances(sharedA!)).toEqual(['/SharedA', '/SharedB'])
  })

  it('clips authored on the instance prims split prototypes (native: 3)', async () => {
    // Live 26.05 capture: prototype count 3 —
    //   /WithClips  -> /__Prototype_2
    //   /WithClips2 -> /__Prototype_1
    //   /NoClips    -> /__Prototype_3
    // Even the two IDENTICAL clips dictionaries split, because the clips
    // opinions live at different source sites (</WithClips> vs </WithClips2>
    // in the root layer stack; clipSetDefinition.h:49-50).
    const stage = await openClipsOnInstancesStage()
    const withClips = protoOf(stage, '/WithClips')
    const withClips2 = protoOf(stage, '/WithClips2')
    const noClips = protoOf(stage, '/NoClips')
    expect(withClips).toBeTruthy()
    expect(withClips2).toBeTruthy()
    expect(noClips).toBeTruthy()
    expect(stage.getPrototypes()).toHaveLength(3)
    expect(withClips).not.toBe(noClips)
    expect(withClips2).not.toBe(noClips)
    expect(withClips).not.toBe(withClips2)
  })
})

describe('instance-key completeness: stage load rules', () => {
  it('load-identical instances share one prototype (control)', async () => {
    // Live 26.05 capture, LoadAll: prototype count 1, all three Models on
    // /__Prototype_1, Inner/geom composed inside the prototype.
    const loaded = await openLoadStage(true)
    expect(loaded.getPrototypes()).toHaveLength(1)
    const loadedProto = protoOf(loaded, '/Model_1')
    expect(loadedProto).toBeTruthy()
    expect(protoOf(loaded, '/Model_2')).toBe(loadedProto)
    expect(protoOf(loaded, '/Model_3')).toBe(loadedProto)
    expect(loaded.getPrim(`${loadedProto}/Inner/geom`)).toBeTruthy()

    // Live 26.05 capture, LoadNone: prototype count 1, all three Models on
    // /__Prototype_1, Inner/geom NOT composed.
    const unloaded = await openLoadStage(false)
    expect(unloaded.getPrototypes()).toHaveLength(1)
    const unloadedProto = protoOf(unloaded, '/Model_1')
    expect(unloadedProto).toBeTruthy()
    expect(protoOf(unloaded, '/Model_2')).toBe(unloadedProto)
    expect(protoOf(unloaded, '/Model_3')).toBe(unloadedProto)
    expect(unloaded.getPrim(`${unloadedProto}/Inner/geom`)).toBeUndefined()
  })

  it('a load-rule split beneath instances splits prototypes (native: 2)', async () => {
    // Live 26.05 capture: LoadNone open, then stage.Load('/Model_1') —
    //   prototype count 2
    //   /Model_1 -> /__Prototype_2 (Inner/geom composed)
    //   /Model_2 -> /__Prototype_1 (Inner/geom absent)
    //   /Model_3 -> /__Prototype_1 (Inner/geom absent)
    const stage = await openLoadStage(false)
    await stage.load('/Model_1')
    const loadedProto = protoOf(stage, '/Model_1')
    const unloadedProto = protoOf(stage, '/Model_2')
    expect(loadedProto).toBeTruthy()
    expect(unloadedProto).toBeTruthy()
    expect(stage.getPrototypes()).toHaveLength(2)
    expect(loadedProto).not.toBe(unloadedProto)
    expect(protoOf(stage, '/Model_3')).toBe(unloadedProto)
    expect(stage.getInstances(loadedProto!)).toEqual(['/Model_1'])
    expect(stage.getInstances(unloadedProto!)).toEqual(['/Model_2', '/Model_3'])
    expect(stage.getPrim(`${loadedProto}/Inner/geom`)).toBeTruthy()
    expect(stage.getPrim(`${unloadedProto}/Inner/geom`)).toBeUndefined()
  })
})

// --- Scenario C fixtures: population-mask-differing instances ---------------

const MASK_PROP = enc(`#usda 1.0
(
    defaultPrim = "Prop"
)

def Xform "Prop"
{
    def Scope "Geom"
    {
        double size = 1
    }
    def Scope "Extra"
    {
        double size = 2
    }
}
`)

const MASK_ROOT = enc(`#usda 1.0
def Xform "World"
{
    def Xform "A" (
        instanceable = true
        prepend references = @maskProp.usda@</Prop>
    )
    {
    }
    def Xform "B" (
        instanceable = true
        prepend references = @maskProp.usda@</Prop>
    )
    {
    }
}
`)

async function openMaskedStage(mask: StagePopulationMask): Promise<Stage> {
  const resolver = new ArInMemoryResolver({
    'maskRoot.usda': MASK_ROOT,
    'maskProp.usda': MASK_PROP,
  })
  return (await Stage.openMasked('maskRoot.usda', mask, {
    resolverContext: _resolverContextForResolver(resolver),
  }))!
}

describe('instance-key completeness: population masks', () => {
  it('a partial mask beneath one instance splits prototypes (native: 2)', async () => {
    // Live 26.05 capture: OpenMasked(['/World/A/Geom', '/World/B']) —
    //   prototype count 2; /World/A -> /__Prototype_1, /World/B -> /__Prototype_2
    //   /World/A/Geom exists, /World/A/Extra does NOT, /World/B/Extra does
    // (_MakeMaskRelativeTo, instanceKey.cpp:22-40: A keys with [/Geom],
    // B with the whole subtree — and each prototype populates per its
    // instances' relative mask.)
    const stage = await openMaskedStage(
      new StagePopulationMask(['/World/A/Geom', '/World/B']))
    const protoA = protoOf(stage, '/World/A')
    const protoB = protoOf(stage, '/World/B')
    expect(protoA).toBeTruthy()
    expect(protoB).toBeTruthy()
    expect(stage.getPrototypes()).toHaveLength(2)
    expect(protoA).not.toBe(protoB)
    expect(stage.getPrim(`${protoA}/Geom`)).toBeTruthy()
    expect(stage.getPrim(`${protoA}/Extra`)).toBeUndefined()
    expect(stage.getPrim(`${protoB}/Extra`)).toBeTruthy()
  })

  it('fully included instances share one prototype (control)', async () => {
    // Live 26.05 capture: OpenMasked(['/World/A', '/World/B']) -> 1 prototype.
    const stage = await openMaskedStage(
      new StagePopulationMask(['/World/A', '/World/B']))
    expect(stage.getPrototypes()).toHaveLength(1)
    expect(protoOf(stage, '/World/A')).toBe(protoOf(stage, '/World/B'))
  })


  it('a live setPopulationMask splits and re-merges prototypes', async () => {
    // Live 26.05 capture: open unmasked -> 1 prototype; SetPopulationMask
    // (['/World/A/Geom', '/World/B']) -> 2 prototypes with A's prototype
    // missing Extra and B's carrying it; SetPopulationMask
    // (['/World/A', '/World/B']) -> back to 1 shared prototype.
    const stage = (await Stage.open('maskRoot.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'maskRoot.usda': MASK_ROOT,
        'maskProp.usda': MASK_PROP,
      })),
    }))!
    expect(stage.getPrototypes()).toHaveLength(1)

    await stage.setPopulationMask(
      new StagePopulationMask(['/World/A/Geom', '/World/B']))
    const protoA = protoOf(stage, '/World/A')
    const protoB = protoOf(stage, '/World/B')
    expect(stage.getPrototypes()).toHaveLength(2)
    expect(protoA).not.toBe(protoB)
    expect(stage.getPrim(`${protoA}/Extra`)).toBeUndefined()
    expect(stage.getPrim(`${protoB}/Extra`)).toBeTruthy()

    await stage.setPopulationMask(
      new StagePopulationMask(['/World/A', '/World/B']))
    expect(stage.getPrototypes()).toHaveLength(1)
    expect(protoOf(stage, '/World/A')).toBe(protoOf(stage, '/World/B'))
  })

  it('masked population prunes excluded subtrees and keeps ancestors', async () => {
    // Live 26.05 capture: OpenMasked(['/World/A']) — /World exists,
    // /World/B does NOT, /World/A/Geom exists (whole subtree included).
    const stage = await openMaskedStage(new StagePopulationMask(['/World/A']))
    expect(stage.getPrim('/World')).toBeTruthy()
    expect(stage.getPrim('/World/B')).toBeUndefined()
    const protoA = protoOf(stage, '/World/A')
    expect(stage.getPrim(`${protoA}/Geom`)).toBeTruthy()
  })
})
