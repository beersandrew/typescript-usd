// Ported from OpenUSD 26.11.1: pxr/usd/usd/primData.cpp, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Local, unscored population-lifetime checks. Native observations are captured
// in fixtures/loadedFlags from OpenUSD v26.11.1 (FIXTURES.md), not inferred here.
// Governing mechanism: usd/primData.cpp:103-140, usd/stage.cpp:3443-3471.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { Stage, StagePopulationMask } from 'typescript-usd/usd'
import { Resolver, ResolvedPath, InMemoryAsset } from 'typescript-usd/ar'
import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

const directory = fileURLToPath(new URL('./fixtures/loadedFlags/', import.meta.url))
const expected = readOracleFixture(directory + 'expected.json') as {
  probes: string[]
  states: unknown[]
  memory: unknown[]
  prototypeCounts: number[]
}
const operations = JSON.parse(readFileSync(directory + 'operations.json', 'utf8')) as
  Array<[string, string?, (string | boolean)?]>
class FixtureResolver extends Resolver {
  async resolve(path: string) { return new ResolvedPath(path) }
  async openAsset(path: ResolvedPath) {
    return new InMemoryAsset(new Uint8Array(readFileSync(path.toString())))
  }
}
const open = () => Stage.open(directory + 'root.usda', {
  loadPayloads: false,
  resolverContext: _resolverContextForResolver(new FixtureResolver()),
}).then(value => value!)
function snapshot(stage: Stage) {
  return {
    traverse: [...stage.traverse()],
    flags: Object.fromEntries(expected.probes.map(path => {
      const prim = stage.getPrim(path)
      return [path, prim ? { active: prim.isActive, loaded: prim.isLoaded } : null]
    })),
    prototypeRootsLoaded: stage.getPrototypes().every(prim => prim.isLoaded),
  }
}

async function apply(stage: Stage, [kind, path, value]: typeof operations[number]) {
  if (kind === 'load') await stage.load(path!, value === 'withoutDescendants' ? 'withoutDescendants' : 'withDescendants')
  else if (kind === 'unload') await stage.unload(path!)
  else if (kind === 'active') await stage.getPrim(path!)!.setActive(value as boolean)
  else if (kind === 'activeMetadata') stage.getPrim(path!)!.setMetadata('active', value)
  else if (kind === 'clearActive') stage.getPrim(path!)!.clearMetadata('active')
  else if (kind === 'mute') await stage.muteLayer(directory + path)
  else if (kind === 'unmute') await stage.unmuteLayer(directory + path)
  else if (kind === 'session') stage.setEditTarget(stage.getSessionLayer())
  else if (kind === 'variant') await stage.getVariantSets('/Variant').getVariantSet('mode').setVariantSelection(path!)
  else if (kind === 'payloads') await stage.getPrim(path!)!.getPayloads().setReferences(value ? [{ assetPath: directory + 'two.usda', primPath: '/Child' }] : [])
  else if (kind === 'define') stage.definePrim(path!, 'Scope')
  else if (kind === 'mask') await stage.setPopulationMask(new StagePopulationMask([path!]))
  else if (kind === 'remove') {
    const prim = stage.getEditTarget().getLayer()!.getPrimAtPath(path!)!
    prim.getRealNameParent()!.removeNameChild(prim)
  }
  else throw new Error(kind)
  await stage.flushChanges()
}

describe('retained loaded flags', () => {
  it('matches native population, session edits, payloads and instance transitions before notices', async () => {
    const stage = await open()
    const retained = stage.getPrim('/A')!
    expect(snapshot(stage)).toEqual(expected.states[0])
    let observed: unknown
    const revoke = onObjectsChanged(stage, () => { observed = snapshot(stage) })
    try {
      for (const [i, operation] of operations.entries()) {
        const [kind, path] = operation
        observed = undefined
        await apply(stage, operation)
        expect(snapshot(stage), `${i}: ${kind} ${path}`).toEqual(expected.states[i + 1])
        expect(retained.isLoaded).toBe(stage.getPrim('/A')!.isLoaded)
        if (observed !== undefined) expect(observed, `notice ${i}: ${kind}`).toEqual(expected.states[i + 1])
      }
    } finally { revoke() }
  })

  it('maintains native flags on a newly authored in-memory stage', async () => {
    const stage = Stage.createNew()
    stage.definePrim('/New/Child', 'Scope')
    expect(snapshot(stage)).toEqual(expected.memory[0])
    stage.getPrim('/New')!.setMetadata('active', false)
    expect(stage.getPrim('/New')!.isLoaded).toBe(false)
    await stage.getPrim('/New')!.setActive(false)
    expect(snapshot(stage)).toEqual(expected.memory[1])
    await stage.getPrim('/New')!.setActive(true)
    expect(snapshot(stage)).toEqual(expected.memory[2])
  })

  // Native prototype identity retention is distinct from the loaded flag.
  // This plain red reproduces on 985d1b58 too: after the nested payload is
  // reloaded, typescript-usd merges prototypes which native USD still keeps separate.
  // OpenUSD v26.08 instanceCache.cpp:112; captured counts are native.
  it('retains native prototype multiplicity after reloading an instance-proxy payload', async () => {
    const stage = await open()
    const index = operations.findIndex(op => op[0] === 'load' && op[1] === '/I1/P')
    for (const op of operations.slice(0, index + 1)) await apply(stage, op)
    expect(stage.getPrototypes()).toHaveLength(expected.prototypeCounts[index + 1]!)
  })

  it('does not revisit composition sites when reading retained loaded flags', async () => {
    const stage = await open()
    const index = stage.getPrimIndex('/A')!
    const spy = vi.spyOn(index, 'getNodeRange')
    try {
      const prim = stage.getPrim('/A')!
      for (let i = 0; i < 100; i++) expect(prim.isLoaded).toBe(false)
      expect(spy).not.toHaveBeenCalled()
    } finally { spy.mockRestore() }
  })
})
