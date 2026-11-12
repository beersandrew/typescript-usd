// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpStreamingLayerReload.py
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/pcp/testenv/testPcpStreamingLayerReload.py
// (registered as testPcpStreamingLayerReload) with its testenv fixtures. The
// TestPcpStreamingLayerReload C++ plugin is expressed as a registered test
// file format: a usda format whose InitData supplies data that streams.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Data as SdfData, UsdaFileFormat as SdfUsdaFileFormat } from 'typescript-usd/sdf'
import { _sdfRegisterFileFormat } from 'typescript-usd/sdf/_internal'
import { Layer } from 'typescript-usd/usd/_internal'
import {
  Cache as PcpCache, type Layer as PcpLayer, type LayerOpener as PcpLayerOpener,
  _TestChangeProcessor as PcpTestChangeProcessor,
} from '../../src/index.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testPcpStreamingLayerReload.testenv')

class TestPcpStreamingData extends SdfData {
  override streamsData(): boolean { return true }
}

class TestPcpStreamingLayerReloadFileFormat extends SdfUsdaFileFormat {
  override readonly formatId = 'testpcpstreaminglayerreload'
  override readonly extensions = ['testpcpstreaminglayerreload']
  override initData(): TestPcpStreamingData {
    const data = new TestPcpStreamingData()
    data.createSpec('/', 'pseudoRoot')
    return data
  }
}
_sdfRegisterFileFormat(new TestPcpStreamingLayerReloadFileFormat())

const opened = new Map<string, PcpLayer>()
const opener: PcpLayerOpener = async (identifier) => {
  const existing = opened.get(identifier)
  if (existing) return existing
  try {
    const layer = (await Layer.open(identifier))!
    opened.set(identifier, layer)
    return layer
  } catch {
    return null
  }
}

describe('testPcpStreamingLayerReload', () => {
  it('test_StreamingLayerReload', async () => {
    // Open a layer with the streaming format.
    const l = (await opener(path.join(TESTENV, 'root.testpcpstreaminglayerreload'))) as Layer
    expect(l).toBeTruthy()
    expect(l.streamsData()).toBe(true)

    const cache = await PcpCache.create(l, opener)

    // /torus1/mesh_0 does not exist yet.
    let primIndex = await cache.computePrimIndex('/torus1/mesh_0')
    expect(primIndex.composePrimStack()).toEqual([])

    // Replace l's content with asset.usda's: this only changes the sublayer
    // list. l's data streams, which exercises a different change processing
    // path (the layer content is replaced, not diffed).
    const assetLayer = (await opener(path.join(TESTENV, 'asset.usda'))) as Layer
    expect(assetLayer).toBeTruthy()
    const cp = new PcpTestChangeProcessor(cache).enter()
    l.transferContent(assetLayer)
    await cp.exit()

    // The mesh now has a spec from the added sublayer.
    primIndex = await cache.computePrimIndex('/torus1/mesh_0')
    expect(primIndex.composePrimStack().length).toBeGreaterThan(0)
  })
})
