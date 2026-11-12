// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpRegressionBugs_bug82180.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usd/pcp/testenv/testPcpRegressionBugs_bug82180.py (registration
// testPcpRegressionBugs_bug82180) with its testenv
// (fixtures/testPcpRegressionBugs_bug82180.testenv, copied unmodified).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Layer as UsdLayer } from 'typescript-usd/usd/_internal'
import {
  Cache as PcpCache, _TestChangeProcessor as PcpTestChangeProcessor,
  type Error as PcpError, type Layer as PcpLayer, type LayerOpener as PcpLayerOpener,
} from '../../src/index.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testPcpRegressionBugs_bug82180.testenv')

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

describe('testPcpRegressionBugs_bug82180', () => {
  it('test_Basic', async () => {
    const rootLayer = (await opener(path.join(TESTENV, 'bug82180/root.usda'))) as Layer
    const sessionLayer = Layer.createAnonymous()
    opened.set(sessionLayer.filePath, sessionLayer)
    const pcpCache = await PcpCache.create(rootLayer, opener, sessionLayer)

    // testPcpRegressionBugs_bug82180.py:16-27.
    let errors: PcpError[] = []
    let layerStack = pcpCache.computeLayerStack(pcpCache.getLayerStackIdentifier(), errors)
    expect(layerStack).toBeTruthy()
    expect(layerStack.getLayers()).toEqual([sessionLayer, rootLayer])
    expect(Object.fromEntries(layerStack.relocatesSourceToTarget))
      .toEqual({ '/ModelGroup/Model': '/ModelGroup/Model_1' })
    expect(Object.fromEntries(layerStack.relocatesTargetToSource))
      .toEqual({ '/ModelGroup/Model_1': '/ModelGroup/Model' })
    expect(errors.length).toBe(0)

    // testPcpRegressionBugs_bug82180.py:29-39.
    const emptyLayer = (await opener(path.join(TESTENV, 'bug82180/empty.usda'))) as Layer
    const cp = new PcpTestChangeProcessor(pcpCache).enter()
    sessionLayer.insertSubLayerPath(emptyLayer.identifier, 0)
    await cp.exit()

    // testPcpRegressionBugs_bug82180.py:41-51.
    errors = []
    layerStack = pcpCache.computeLayerStack(pcpCache.getLayerStackIdentifier(), errors)
    expect(layerStack).toBeTruthy()
    expect(layerStack.getLayers()).toEqual([sessionLayer, emptyLayer, rootLayer])
    expect(Object.fromEntries(layerStack.relocatesSourceToTarget))
      .toEqual({ '/ModelGroup/Model': '/ModelGroup/Model_1' })
    expect(Object.fromEntries(layerStack.relocatesTargetToSource))
      .toEqual({ '/ModelGroup/Model_1': '/ModelGroup/Model' })
    expect(errors.length).toBe(0)
  })
})
