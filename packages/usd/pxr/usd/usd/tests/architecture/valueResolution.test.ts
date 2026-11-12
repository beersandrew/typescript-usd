// Ported from OpenUSD 26.11.1: pxr/usd/usd/resolver.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Local instructive evidence for OpenUSD v26.08 pxr/usd/usd/resolver.cpp.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Cache as PcpCache, Layer as PcpLayer, LayerOpener as PcpLayerOpener } from 'typescript-usd/pcp'
import { Stage } from '../../src/index.ts'
import {
  usdResolveAttributeDefault, usdResolveAttributeValue, usdResolvePrimField,
} from '../../src/resolver.ts'

const fixtures = fileURLToPath(new URL('fixtures/composition/', import.meta.url))
function opener(): PcpLayerOpener {
  const cache = new Map<string, PcpLayer>()
  return async (filePath: string) => {
    const hit = cache.get(filePath)
    if (hit) return hit
    try {
      const layer = (await Layer.open(filePath))!
      cache.set(filePath, layer)
      return layer
    } catch { return null }
  }
}
async function open(name: string) {
  const entry = path.join(fixtures, name, 'entry.usda')
  const stage = (await Stage.open(entry))!
  const root = (await opener()(entry))!
  return { stage, cache: await PcpCache.create(root, opener()) }
}

describe('local value-resolution evidence', () => {
  it('matches stage defaults through local, inherit, and specialize arcs', async () => {
    const cases: [string, string][] = [
      ['default', '/Root.root'], ['inheritance', '/Root.first'],
      ['inheritance', '/Root.second'], ['specializes', '/Root/Container/Base.arc'],
      ['specializes', '/Root/Container/Specialized.arc'],
      ['specializes', '/Root/Container/Inherits.arc'],
    ]
    for (const [name, attrPath] of cases) {
      const { stage, cache } = await open(name)
      const dot = attrPath.lastIndexOf('.')
      const index = await cache.computePrimIndex(attrPath.slice(0, dot))
      expect(usdResolveAttributeDefault(index, attrPath.slice(dot + 1))).toEqual(
        stage.get(attrPath)!.getDefaultValue(),
      )
    }
  })

  it('matches stage time-sample keys', async () => {
    const { stage, cache } = await open('time-samples')
    const index = await cache.computePrimIndex('/Root')
    const keys = usdResolveAttributeValue(index, 'root', undefined).timeSamples?.map(([time]) => time)
    expect(keys).toEqual(stage.get('/Root.root')!.getTimeSampleKeys())
  })

  it('resolves prim typeName through a reference', async () => {
    const { stage, cache } = await open('specializes')
    const index = await cache.computePrimIndex('/Root/Container/Base')
    expect(usdResolvePrimField(index, 'typeName')).toEqual(
      stage.getPrim('/Root/Container/Base')!.typeName,
    )
  })
})
