// Ported from OpenUSD 26.11.1: pxr/usd/pcp/changes.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Sublayer additions and reorders through PcpChanges, with the minimal
// change lists PcpChanges builds for sublayer operations (changes.cpp:
// 2182-2346). Expected values: OpenUSD v26.08, Pcp._TestChangeProcessor on a
// USD-mode cache.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import {
  Cache as PcpCache, LayerOpener as PcpLayerOpener, _TestChangeProcessor as PcpTestChangeProcessor,
} from '../../src/index.ts'

const enc = (text: string) => new TextEncoder().encode(text)

function openerOver(layers: readonly Layer[]): PcpLayerOpener {
  const byPath = new Map(layers.map(layer => [layer.filePath, layer]))
  return async filePath => byPath.get(filePath) ?? null
}

describe('Pcp layer-stack changes', () => {
  it('resyncs only the prims an added sublayer contributes', async () => {
    const a = Layer.fromBytes(enc('#usda 1.0\ndef Scope "A" {\n double value = 1\n}\n'), 'lsc-add-a.usda')
    const b = Layer.fromBytes(enc('#usda 1.0\ndef Scope "A" {\n double value = 2\n}\n'), 'lsc-add-b.usda')
    const root = Layer.fromBytes(enc(`#usda 1.0
(
  subLayers = [@lsc-add-a.usda@]
)
def Scope "B" {}
`), 'lsc-add-root.usda')
    const cache = await PcpCache.create(root, openerOver([root, a, b]))
    for (const path of ['/', '/A', '/B']) await cache.computePrimIndex(path)
    const unaffected = cache.findPrimIndex('/B')

    const cp = new PcpTestChangeProcessor(cache).enter()
    root.setField('/', 'subLayers', ['lsc-add-b.usda', 'lsc-add-a.usda'])
    await cp.process()
    expect(cp.getSignificantChanges()).toEqual(['/A'])
    expect(cp.getSpecChanges()).toEqual([])
    expect(cp.getPrimChanges()).toEqual([])
    await cp.exit()

    expect(cache.findPrimIndex('/A')).toBeUndefined()
    expect(cache.findPrimIndex('/B')).toBe(unaffected)
    expect(cache.getLayerStack().getLayers()).toEqual([root, b, a])
  })

  it('rescans prim stacks when existing sublayers reorder', async () => {
    const a = Layer.fromBytes(enc('#usda 1.0\nover "World" {\n over "Ball" {\n  double radius = 1\n }\n}\n'), 'lsc-order-a.usda')
    const b = Layer.fromBytes(enc('#usda 1.0\nover "World" {\n over "Ball" {\n  double radius = 2\n }\n}\n'), 'lsc-order-b.usda')
    const root = Layer.fromBytes(enc(`#usda 1.0
(
  subLayers = [@lsc-order-a.usda@, @lsc-order-b.usda@]
)
`), 'lsc-order-root.usda')
    const cache = await PcpCache.create(root, openerOver([root, a, b]))
    for (const path of ['/', '/World', '/World/Ball']) await cache.computePrimIndex(path)
    const ball = cache.findPrimIndex('/World/Ball')!

    const cp = new PcpTestChangeProcessor(cache).enter()
    root.setField('/', 'subLayers', ['lsc-order-b.usda', 'lsc-order-a.usda'])
    await cp.process()
    expect(cp.getSignificantChanges()).toEqual([])
    expect(cp.getSpecChanges()).toEqual(['/World', '/World/Ball'])
    expect(cp.getPrimChanges()).toEqual([])
    await cp.exit()

    expect(cache.findPrimIndex('/World/Ball')).toBe(ball)
    expect(ball.composePrimStack().map(entry => entry.layer)).toEqual([b, a])
  })
})
