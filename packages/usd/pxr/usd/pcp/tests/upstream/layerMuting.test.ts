// Ported from OpenUSD 26.11.1: pxr/usd/pcp/testenv/testPcpLayerMuting.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/pcp/testenv/testPcpLayerMuting.py
// (registered as testPcpLayerMuting), with its testPcpLayerMuting.testenv
// fixtures. typescript-usd caches are USD-mode.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { Layer as UsdLayer } from 'typescript-usd/usd/_internal'
import {
  ArcType as PcpArcType, Cache as PcpCache, ErrorType as PcpErrorType,
  type Layer as PcpLayer, type LayerOpener as PcpLayerOpener, type PrimIndex as PcpPrimIndex,
} from '../../src/index.ts'

const TESTENV = path.join(
  fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testPcpLayerMuting.testenv')

// Sdf.Layer.FindOrOpen: one layer per identifier across caches.
const opened = new Map<string, PcpLayer>()
const opener: PcpLayerOpener = async (identifier) => {
  const existing = opened.get(identifier)
  if (existing) return existing
  if (identifier.startsWith('anon:')) return null
  try {
    const layer = await UsdLayer.open(identifier)
    if (!layer) return null
    opened.set(identifier, layer)
    return layer
  } catch {
    return null
  }
}
const loadLayer = async (relativePath: string): Promise<Layer> =>
  (await opener(path.join(TESTENV, relativePath))) as Layer

async function loadPcpCache(layer: Layer, sessionLayer?: Layer): Promise<PcpCache> {
  return PcpCache.create(layer, opener, sessionLayer)
}

// The primStack: the (layer, path) of every contributing spec.
function primStack(index: PcpPrimIndex): Array<[PcpLayer, string]> {
  return index.composePrimStack().map(entry => [entry.layer, entry.path.pathString])
}

async function computePrimIndex(cache: PcpCache, primPath: string) {
  const errors: unknown[] = []
  const index = await cache.computePrimIndex(primPath)
  errors.push(...index.localErrors)
  return { index, errors }
}

describe('testPcpLayerMuting', () => {
  it('test_MutingSublayers', async () => {
    const layer = await loadLayer('sublayers/root.usda')
    const sublayer = await loadLayer('sublayers/sublayer.usda')
    const anonymousSublayer = Layer.createAnonymous('.usda')
    opened.set(anonymousSublayer.filePath, anonymousSublayer)

    // Add a prim in an anonymous sublayer to the root layer.
    sdfCreatePrimInLayer(anonymousSublayer, '/Root')
    const subLayers = layer.getField('/', 'subLayers') as string[]
    layer.setField('/', 'subLayers', [...subLayers, anonymousSublayer.filePath])

    // Two caches for the same layer stack: muting in one does not affect
    // the other.
    const pcp = await loadPcpCache(layer)
    const pcp2 = await loadPcpCache(layer)
    const all: Array<[PcpLayer, string]> = [
      [layer, '/Root'], [sublayer, '/Root'], [anonymousSublayer, '/Root'],
    ]

    const expectState = async (
      cache: PcpCache, stack: Array<[PcpLayer, string]>, muted: string[],
    ): Promise<void> => {
      const { index, errors } = await computePrimIndex(cache, '/Root')
      expect(errors).toEqual([])
      expect(primStack(index)).toEqual(stack)
      expect(cache.getMutedLayers()).toEqual(muted)
      expect([...index.rootNode.layerStack.mutedLayers]).toEqual(muted)
    }

    await expectState(pcp, all, [])
    await expectState(pcp2, all, [])

    // Muting the cache's root layer is explicitly disallowed.
    await expect(pcp.requestLayerMuting([layer.filePath], [])).rejects.toThrow()

    // Mute sublayer: it no longer appears in /Root's prim stack.
    await pcp.requestLayerMuting([sublayer.filePath], [])
    await expectState(pcp, [[layer, '/Root'], [anonymousSublayer, '/Root']], [sublayer.filePath])
    await expectState(pcp2, all, [])

    // Unmute sublayer: it comes back.
    await pcp.requestLayerMuting([], [sublayer.filePath])
    await expectState(pcp, all, [])
    await expectState(pcp2, all, [])

    // The same for the anonymous sublayer.
    await pcp.requestLayerMuting([anonymousSublayer.filePath], [])
    await expectState(pcp, [[layer, '/Root'], [sublayer, '/Root']], [anonymousSublayer.filePath])
    await expectState(pcp2, all, [])

    await pcp.requestLayerMuting([], [anonymousSublayer.filePath])
    await expectState(pcp, all, [])
    await expectState(pcp2, all, [])
  })

  it('test_MutingSessionLayer', async () => {
    const layer = await loadLayer('session/root.usda')
    const sessionLayer = await loadLayer('session/session.usda')
    const pcp = await loadPcpCache(layer, sessionLayer)

    let { index, errors } = await computePrimIndex(pcp, '/Root')
    expect(errors).toEqual([])
    expect(primStack(index)).toEqual([[sessionLayer, '/Root'], [layer, '/Root']])
    expect([...index.rootNode.layerStack.mutedLayers]).toEqual([])

    await pcp.requestLayerMuting([sessionLayer.filePath], [])
    ;({ index, errors } = await computePrimIndex(pcp, '/Root'))
    expect(errors).toEqual([])
    expect(primStack(index)).toEqual([[layer, '/Root']])
    expect(pcp.getMutedLayers()).toEqual([sessionLayer.filePath])
    expect([...index.rootNode.layerStack.mutedLayers]).toEqual([sessionLayer.filePath])

    await pcp.requestLayerMuting([], [sessionLayer.filePath])
    ;({ index, errors } = await computePrimIndex(pcp, '/Root'))
    expect(errors).toEqual([])
    expect(primStack(index)).toEqual([[sessionLayer, '/Root'], [layer, '/Root']])
    expect(pcp.getMutedLayers()).toEqual([])
    expect([...index.rootNode.layerStack.mutedLayers]).toEqual([])
  })

  it('test_MutingReferencedLayers', async () => {
    const rootLayer = await loadLayer('refs/root.usda')
    const refLayer = await loadLayer('refs/ref.usda')

    const test = async (primPath: string): Promise<void> => {
      const pcp = await loadPcpCache(rootLayer)
      const pcp2 = await loadPcpCache(rootLayer)
      const expectReference = async (cache: PcpCache): Promise<void> => {
        const { index, errors } = await computePrimIndex(cache, primPath)
        expect(errors).toEqual([])
        expect(index.rootNode.children[0]!.arcType).toBe(PcpArcType.Reference)
        expect(index.rootNode.children[0]!.layerStack.layers[0]!.layer).toBe(refLayer)
      }
      await expectReference(pcp)
      await expectReference(pcp2)

      // Muting the referenced layer stack's root layer: a composition error
      // and no reference node.
      await pcp.requestLayerMuting([refLayer.filePath], [])
      expect(pcp.getMutedLayers()).toEqual([refLayer.filePath])
      const { index, errors } = await computePrimIndex(pcp, primPath)
      expect(errors.length).toBeGreaterThan(0)
      expect(index.rootNode.children).toHaveLength(0)
      await expectReference(pcp2)

      // Unmuting resolves the error and restores the reference.
      await pcp.requestLayerMuting([], [refLayer.filePath])
      expect(pcp.getMutedLayers()).toEqual([])
      await expectReference(pcp)
      await expectReference(pcp2)
    }

    await test('/ReferenceToDef')
    await test('/ReferenceToOver')
  })

  it('test_MutingWithFileFormatTarget', async () => {
    const sublayerPath = path.join(TESTENV, 'sublayers/sublayer.usda')
    const hasInvalidSublayerError = (errors: readonly { errorType: PcpErrorType }[]) =>
      errors.some(e => e.errorType === PcpErrorType.InvalidSublayerPath)
    const testMuting = async (
      mutedId: string, expectMutedLayerId = mutedId, expectInvalidSublayerError = false,
    ): Promise<void> => {
      const root = await loadLayer('sublayers/root.usda')
      const pcp = await PcpCache.create(
        root, opener, undefined, undefined, { fileFormatTarget: 'bogus' })
      expect(pcp.getFileFormatTarget()).toBe('bogus')
      await pcp.requestLayerMuting([mutedId], [])
      expect(pcp.getMutedLayers()).toEqual([expectMutedLayerId])
      const { errors } = await computePrimIndex(pcp, '/Root')
      if (!expectInvalidSublayerError) {
        expect(hasInvalidSublayerError(errors as never)).toBe(false)
      }
    }
    await testMuting(sublayerPath, sublayerPath)
    await testMuting(`${sublayerPath}:SDF_FORMAT_ARGS:target=bogus`, sublayerPath)
    await testMuting(`${sublayerPath}:SDF_FORMAT_ARGS:target=bogus2`, undefined, true)
  })
})
