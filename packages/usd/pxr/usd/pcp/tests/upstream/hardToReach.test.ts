// Ported from OpenUSD 26.11.1: pxr/usd/pcp/testenv/testPcpHardToReach.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD v26.08
// pxr/usd/pcp/testenv/testPcpHardToReach.cpp.

import { describe, expect, it } from 'vitest'
import {
  Cache as PcpCache,
  type Layer as PcpLayer,
  type LayerOpener as PcpLayerOpener,
} from '../../src/index.ts'

type Scene = Record<string, Record<string, unknown>>

function layer(filePath: string, scene: Scene): PcpLayer {
  return {
    filePath,
    // An Sdf layer always has its pseudo-root spec.
    hasSpec: specPath => specPath === '/' || scene[specPath] !== undefined,
    getSpecType: specPath => specPath === '/' ? 'pseudoRoot' : 'prim',
    getSpecPaths: () => Object.keys(scene),
    getFieldNames: specPath => Object.keys(scene[specPath] ?? {}),
    getField: (specPath, fieldName) => scene[specPath]?.[fieldName],
    resolveAsset: assetPath => assetPath,
  }
}

const arc = (assetPath: string, primPath: string) => [{
  assetPath, primPath, layerOffset: { offset: 0, scale: 1 },
}]

describe('testPcpHardToReach', () => {
  it('parallel recursive indexing discovers ancestral payload inclusions', async () => {
    const payloadLayer = layer('/payload', {
      '/': { primChildren: ['Payload'] }, '/Payload': {},
    })
    const rootLayer = layer('/root', {
      '/': { primChildren: ['Ref', 'Root'] },
      '/Ref': { primChildren: ['Child'] },
      '/Ref/Child': { payload: arc('/payload', '/Payload') },
      '/Root': { references: arc('', '/Ref/Child') },
    })
    const layers = new Map([
      [rootLayer.filePath, rootLayer], [payloadLayer.filePath, payloadLayer],
    ])
    const opener: PcpLayerOpener = async filePath => layers.get(filePath) ?? null
    const cache = await PcpCache.create(rootLayer, opener)
    expect(cache.getIncludedPayloadPaths()).toEqual([])

    const errors = await cache.computePrimIndexesInParallel(
      '/', () => true, () => true,
    )
    expect(errors).toEqual([])
    expect(cache.getIncludedPayloadPaths()).toEqual(['/Ref/Child', '/Root'])
  })
})
