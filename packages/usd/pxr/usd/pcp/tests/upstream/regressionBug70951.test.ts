// Ported from OpenUSD 26.11.1: pxr/usd/pcp/primIndex.cpp,
//  pxr/usd/pcp/testenv/testPcpRegressionBugs_bug70951.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usd/pcp/testenv/testPcpRegressionBugs_bug70951.py (registration
// testPcpRegressionBugs_bug70951) with its testenv
// (fixtures/testPcpRegressionBugs_bug70951.testenv, copied unmodified).
// typescript-usd caches are USD mode, which keeps no _primStack
// (primIndex.cpp); primIndex.primStack is read as composePrimStack(), the
// (layer, path) of every contributing spec in strength order.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sdfCreatePrimInLayer, type Layer } from 'typescript-usd/sdf'
import { Layer as UsdLayer } from 'typescript-usd/usd/_internal'
import {
  Cache as PcpCache, _TestChangeProcessor as PcpTestChangeProcessor,
  type Layer as PcpLayer, type LayerOpener as PcpLayerOpener, type PrimIndex as PcpPrimIndex,
} from '../../src/index.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testPcpRegressionBugs_bug70951.testenv')

const opened = new Map<string, PcpLayer>()
const opener: PcpLayerOpener = async identifier => {
  const existing = opened.get(identifier)
  if (existing) return existing
  try {
    const layer = await UsdLayer.open(identifier)
    if (!layer) return null
    opened.set(identifier, layer)
    return layer
  } catch {
    return null
  }
}
const findOrOpen = async (rel: string) => (await opener(path.join(TESTENV, rel))) as Layer

const primStack = (index: PcpPrimIndex) =>
  index.composePrimStack().map(e => [e.layer, e.path.pathString] as const)

describe('testPcpRegressionBugs_bug70951', () => {
  it('test_Basic', async () => {
    const rootLayer = await findOrOpen('bug70951/root.usda')
    const refLayer = await findOrOpen('bug70951/JoyGroup.usda')
    const pcpCache = await PcpCache.create(rootLayer, opener)

    // testPcpRegressionBugs_bug70951.py:21-29.
    let errors: unknown[] = []
    let primIndex = await pcpCache.computePrimIndex('/World/anim/chars/JoyGroup/Sim', errors as never)
    expect(errors.length).toBe(0)
    expect(primStack(primIndex)).toEqual([[refLayer, '/JoyGroup/Sim']])
    expect(primIndex.rootNode.hasSpecs).toBe(false)

    // testPcpRegressionBugs_bug70951.py:31-36.
    const cp = new PcpTestChangeProcessor(pcpCache).enter()
    const emptyOver = sdfCreatePrimInLayer(rootLayer, '/World/anim/chars/JoyGroup/Sim')
    expect(emptyOver!.isInert()).toBe(true)
    await cp.exit()

    // testPcpRegressionBugs_bug70951.py:38-44.
    errors = []
    primIndex = await pcpCache.computePrimIndex('/World/anim/chars/JoyGroup/Sim', errors as never)
    expect(errors.length).toBe(0)
    expect(primStack(primIndex)).toEqual([
      [rootLayer, '/World/anim/chars/JoyGroup/Sim'], [refLayer, '/JoyGroup/Sim']])
    expect(primIndex.rootNode.hasSpecs).toBe(true)
  })
})
