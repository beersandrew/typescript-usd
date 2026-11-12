// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfDetachedLayer.py
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfDetachedLayer.py.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testSdfDetachedLayer-'))
afterAll(() => fs.rmSync(testDir, { recursive: true, force: true }))

// A small layer with metadata, a typed prim hierarchy, and authored
// attribute defaults — enough surface to detect any source/scene aliasing.
const content = `#usda 1.0
(
    defaultPrim = "World"
)

def Xform "World"
{
    custom double myAttr = 3.5
    def Sphere "Ball"
    {
        double radius = 2.0
    }
}
`

// Reads every golden field off a layer and returns a comparable snapshot.
const snapshot = (layer: Layer) => ({
  defaultPrim: layer.getField('/', 'defaultPrim'),
  worldSpecifier: layer.getField('/World', 'specifier'),
  worldType: layer.getField('/World', 'typeName'),
  myAttr: layer.getField('/World.myAttr', 'default'),
  ballType: layer.getField('/World/Ball', 'typeName'),
  radius: layer.getField('/World/Ball.radius', 'default'),
})

// Golden snapshot — values captured from the Pixar build (see header).
const GOLDEN = {
  defaultPrim: 'World',
  worldSpecifier: 'def', // Sdf.SpecifierDef
  worldType: 'Xform',
  myAttr: 3.5,
  ballType: 'Sphere',
  radius: 2,
}

afterEach(async () => { await Layer.setDetachedLayerRules(new Layer.DetachedLayerRules()) })

describe('SdfLayer detached layer rules', () => {
  it('matches include, exclude, and include-all precedence', () => {
    const rules = new Layer.DetachedLayerRules()
    expect(['some_layer.usda', 'some_layer_2.usda', 'other_layer.usda'].map(
      identifier => rules.isIncluded(identifier),
    )).toEqual([false, false, false])

    rules.include(['some_layer'])
    expect(rules.includedAll()).toBe(false)
    expect(rules.getIncluded()).toEqual(['some_layer'])
    expect(rules.getExcluded()).toEqual([])
    expect(['some_layer.usda', 'some_layer_2.usda', 'other_layer.usda'].map(
      identifier => rules.isIncluded(identifier),
    )).toEqual([true, true, false])

    rules.exclude(['some_layer_2'])
    expect(rules.getExcluded()).toEqual(['some_layer_2'])
    expect(['some_layer.usda', 'some_layer_2.usda', 'other_layer.usda'].map(
      identifier => rules.isIncluded(identifier),
    )).toEqual([true, false, false])

    rules.includeAll()
    expect(rules.includedAll()).toBe(true)
    expect(rules.getIncluded()).toEqual([])
    expect(['some_layer.usda', 'some_layer_2.usda', 'other_layer.usda'].map(
      identifier => rules.isIncluded(identifier),
    )).toEqual([true, false, true])
  })

  it('applies installed rules to newly opened crate layers', () => {
    const bytes = Layer.createInMemory('source.usda', content).toUsdc()
    expect(Layer.fromBytes(bytes, 'new_layer.usdc').isDetached()).toBe(false)

    Layer.setDetachedLayerRules(
      new Layer.DetachedLayerRules().include(['new_layer.usdc']),
    )
    expect(Layer.getDetachedLayerRules().getIncluded()).toEqual(['new_layer.usdc'])
    expect(Layer.fromBytes(bytes, 'new_layer.usdc').isDetached()).toBe(true)
  })

  // test_SettingRulesAffectsOpenLayers. USDC data streams from its asset, as
  // the upstream test's streaming file format does.
  it('reloads open layers whose detached classification changes', async () => {
    const openLayerPath = path.join(testDir, 'open_layer.usdc')
    fs.writeFileSync(openLayerPath, Layer.createInMemory('source.usda', content).toUsdc())

    // With an empty rules set, this layer should open as not detached.
    const l = (await Layer.findOrOpen(openLayerPath))!
    expect(l).toBeTruthy()
    expect(l.isDetached()).toBe(false)

    // Setting rules that includes the layer should reload it so that it is
    // now detached.
    await Layer.setDetachedLayerRules(
      new Layer.DetachedLayerRules().include(['open_layer.usdc']))
    expect(l.isDetached()).toBe(true)

    // Excluding the layer from the rules should reload it again so that it
    // goes back to non-detached.
    await Layer.setDetachedLayerRules(
      new Layer.DetachedLayerRules().includeAll().exclude(['open_layer.usdc']))
    expect(l.isDetached()).toBe(false)
  })
})

describe('SdfLayer detachment (in-memory content is asset-independent)', () => {
  it('createInMemory loads fields matching the Pixar build', () => {
    const layer = Layer.createInMemory('detached.usda', content)
    expect(layer).not.toBeNull()
    expect(snapshot(layer)).toEqual(GOLDEN)
  })

  // The core "detached" guarantee: after load there is no live binding to the
  // source bytes. Zeroing the source buffer must not perturb the layer.
  it('fromBytes is independent of the source buffer after load', () => {
    const bytes = new TextEncoder().encode(content)
    const layer = Layer.fromBytes(bytes, 'detached_bytes.usda')

    // Capture, then destroy the backing bytes (simulates the on-disk asset
    // changing or being deleted while the layer stays open).
    const before = snapshot(layer)
    bytes.fill(0)

    expect(snapshot(layer)).toEqual(before)
    expect(snapshot(layer)).toEqual(GOLDEN)
  })

  // Two layers built from the same source text are fully independent — editing
  // one (the typescript-usd setField analog of authoring a detached, in-memory layer)
  // leaves the other at its loaded golden state.
  it('separately loaded layers do not share scene state', () => {
    const a = Layer.createInMemory('a.usda', content)
    const b = Layer.createInMemory('b.usda', content)

    a.setField('/World/Ball.radius', 'default', 5)

    expect(a.getField('/World/Ball.radius', 'default')).toBe(5)
    expect(b.getField('/World/Ball.radius', 'default')).toBe(GOLDEN.radius)
    expect(snapshot(b)).toEqual(GOLDEN)
  })
})
