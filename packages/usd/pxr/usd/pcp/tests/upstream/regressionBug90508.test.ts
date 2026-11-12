// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpRegressionBugs_bug90508.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD v26.08
// pxr/usd/pcp/testenv/testPcpRegressionBugs_bug90508.py.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/usd/_internal'
import { sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import {
  Cache as PcpCache,
  _TestChangeProcessor as PcpTestChangeProcessor,
  type Layer as PcpLayer,
  type LayerOpener as PcpLayerOpener,
} from '../../src/index.ts'

const FIXTURES = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testPcpRegressionBugs_bug90508.testenv/bug90508',
)

function opener(): PcpLayerOpener {
  const retained = new Map<string, PcpLayer>()
  return async filePath => {
    const existing = retained.get(filePath)
    if (existing) return existing
    try {
      const opened = (await Layer.open(filePath))!
      retained.set(filePath, opened)
      return opened
    } catch {
      return null
    }
  }
}

describe('testPcpRegressionBugs_bug90508', () => {
  it('evicts only the index whose culled implied inherit becomes live', async () => {
    const open = opener()
    const rootLayer = await open(path.join(FIXTURES, 'root.usda'))
    expect(rootLayer).not.toBeNull()
    const cache = await PcpCache.create(rootLayer!, open)

    for (const primPath of ['/Model', '/Model/Child', '/Model/Child/Child2']) {
      await cache.computePrimIndex(primPath)
      expect(cache.findPrimIndex(primPath)).toBeDefined()
    }

    const cp = new PcpTestChangeProcessor(cache).enter()
    sdfCreatePrimInLayer(rootLayer as Layer, '/_class_Model/Child')
    await cp.exit()

    expect(cache.findPrimIndex('/Model')).toBeDefined()
    expect(cache.findPrimIndex('/Model/Child')).toBeUndefined()
    expect(cache.findPrimIndex('/Model/Child/Child2')).toBeDefined()
  })
})
