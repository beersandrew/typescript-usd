// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpRegressionBugs_bug92955.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD v26.08
// pxr/usd/pcp/testenv/testPcpRegressionBugs_bug92955.py.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/usd/_internal'
import {
  Cache as PcpCache,
  DependencyType,
  _TestChangeProcessor as PcpTestChangeProcessor,
  type Layer as PcpLayer,
  type LayerOpener as PcpLayerOpener,
} from '../../src/index.ts'

const FIXTURES = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testPcpRegressionBugs_bug92955.testenv/bug92955',
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

describe('testPcpRegressionBugs_bug92955', () => {
  it('preserves unrelated symmetric dependencies when a class is removed', async () => {
    const open = opener()
    const rootLayer = await open(path.join(FIXTURES, 'root.usda'))
    expect(rootLayer).not.toBeNull()
    const cache = await PcpCache.create(rootLayer!, open)

    const paths = ['/']
    while (paths.length > 0) {
      const primPath = paths.shift()!
      const index = await cache.computePrimIndex(primPath)
      for (const name of index.computePrimChildNames()) {
        paths.push(primPath === '/' ? `/${name}` : `${primPath}/${name}`)
      }
    }

    // Verify there are symmetric corresponding paths on SymRig.
    const layerStack = cache.getLayerStack()
    const findDeps = () => cache.findSiteDependencies(layerStack, '/Model/Rig/SymRig',
      DependencyType.Direct | DependencyType.NonVirtual, false, false, false)
      .map(dep => [dep.indexPath.pathString, dep.sitePath.pathString])
    const x = findDeps()
    expect(x.length).not.toBe(0)

    // Delete the unrelated class.
    const cp = new PcpTestChangeProcessor(cache).enter()
    ;(rootLayer as Layer).getPrimAtPath('/Model/Rig')!.getNameChildren().erase('SymScope')
    await cp.exit()

    // Verify the same symmetric corresponding paths are on SymRig.
    expect(findDeps()).toEqual(x)
  })
})
