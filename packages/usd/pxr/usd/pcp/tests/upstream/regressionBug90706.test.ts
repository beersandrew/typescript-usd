// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpRegressionBugs_bug90706.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usd/pcp/testenv/testPcpRegressionBugs_bug90706.py (registration
// testPcpRegressionBugs_bug90706) with its testenv
// (fixtures/testPcpRegressionBugs_bug90706.testenv, copied unmodified).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sdfCreatePrimInLayer, type Layer } from 'typescript-usd/sdf'
import { Layer as UsdLayer } from 'typescript-usd/usd/_internal'
import {
  ArcType as PcpArcType, Cache as PcpCache, _TestChangeProcessor as PcpTestChangeProcessor,
  type Layer as PcpLayer, type LayerOpener as PcpLayerOpener,
} from '../../src/index.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testPcpRegressionBugs_bug90706.testenv')

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

describe('testPcpRegressionBugs_bug90706', () => {
  it('test_Basic', async () => {
    const rootLayer = (await opener(path.join(TESTENV, 'bug90706/root.usda'))) as Layer
    const pcpCache = await PcpCache.create(rootLayer, opener)

    // testPcpRegressionBugs_bug90706.py:14-22.
    let err: unknown[] = []
    let index = await pcpCache.computePrimIndex('/Sarah/EmptyPrim', err as never)
    expect(index.isValid()).toBe(true)
    expect(err.length).toBe(0)
    expect(index.rootNode.children.length).toBe(0)

    // testPcpRegressionBugs_bug90706.py:24-31.
    const cp = new PcpTestChangeProcessor(pcpCache).enter()
    sdfCreatePrimInLayer(rootLayer, '/Sarah{displayColor=red}EmptyPrim')
    await cp.exit()
    expect(pcpCache.findPrimIndex('/Sarah/EmptyPrim')).toBeUndefined()

    // testPcpRegressionBugs_bug90706.py:32-45.
    err = []
    index = await pcpCache.computePrimIndex('/Sarah/EmptyPrim', err as never)
    expect(index.isValid()).toBe(true)
    expect(err.length).toBe(0)
    expect(index.rootNode.children.length).toBe(1)
    expect(index.rootNode.children[0]!.arcType).toBe(PcpArcType.Variant)
    expect(index.rootNode.children[0]!.layerStack).toBe(index.rootNode.layerStack)
    expect(index.rootNode.children[0]!.path.pathString).toBe('/Sarah{displayColor=red}EmptyPrim')
  })
})
