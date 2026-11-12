// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpSubLayersAndOffsetsMismatch.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usd/pcp/testenv/testPcpSubLayersAndOffsetsMismatch.cpp (registration
// testPcpSubLayersAndOffsetsMismatch). The error message is the native
// capture in fixtures/subLayersAndOffsetsMismatch/expected.json (FIXTURES.md).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import {
  Cache as PcpCache, ErrorInvalidSublayerAndOffsetCount as PcpErrorInvalidSublayerAndOffsetCount,
  type Error as PcpError, type Layer as PcpLayer, type LayerOpener as PcpLayerOpener,
  pcpLayerStackIdentifier,
} from '../../src/index.ts'

const expected = JSON.parse(readFileSync(
  new URL('./fixtures/subLayersAndOffsetsMismatch/expected.json', import.meta.url), 'utf8',
)).payload as { errors: { message: string }[] }

describe('testPcpSubLayersAndOffsetsMismatch', () => {
  // testPcpSubLayersAndOffsetsMismatch.cpp:28-68.
  it('TestSubLayersAndOffsetsMismatch', async () => {
    const sublayer = Layer.createAnonymous('.usda')
    const rootLayer = Layer.createAnonymous('.usda')
    const layers = new Map<string, PcpLayer>([[sublayer.identifier, sublayer], [rootLayer.identifier, rootLayer]])
    const opener: PcpLayerOpener = async id => layers.get(id) ?? null

    // Author sublayers directly, bypassing the sublayer list editor, so that
    // the sublayerOffsets field is left unauthored.
    rootLayer.setField('/', 'subLayers', [sublayer.identifier])
    expect(rootLayer.getSubLayerPaths().length).toBe(1)
    // SdfLayer::GetSubLayerOffsets (layer.cpp) reads the sublayerOffsets
    // field, which is unauthored here.
    expect((rootLayer.getField('/', 'subLayerOffsets') as unknown[] | undefined) ?? []).toEqual([])

    const id = pcpLayerStackIdentifier(rootLayer)
    // PcpCache cache(id, std::string(), true): typescript-usd caches are USD mode.
    const cache = await PcpCache.create(rootLayer, opener)
    // PcpCache.create already computed the root layer stack (the async
    // cache computes it eagerly), so ComputeLayerStack finds it and reports
    // nothing (Pcp_LayerStackRegistry::FindOrCreate returns a found stack
    // without errors); the first computation's errors are the stack's
    // local errors.
    const found: PcpError[] = []
    const layerStack = cache.computeLayerStack(id, found)
    expect(layerStack).toBeTruthy()
    expect(found).toEqual([])
    const errors = layerStack.localErrors
    expect(errors.length).toBe(1)
    const error = errors[0] as PcpErrorInvalidSublayerAndOffsetCount
    expect(error).toBeInstanceOf(PcpErrorInvalidSublayerAndOffsetCount)
    expect(error.layer).toBe(rootLayer)
    expect(error.sublayerCount).toBe(1)
    expect(error.offsetCount).toBe(0)
    expect(error.toString()).toBe(expected.errors[0]!.message.replace('{layer}', rootLayer.identifier))

    // We should still have a sublayer with identity offset, so that the layer
    // stack is valid.
    const stackLayers = layerStack.getLayers()
    expect(stackLayers.length).toBe(2)
    expect(stackLayers[0]).toBe(rootLayer)
    expect(stackLayers[1]).toBe(sublayer)
    expect(layerStack.getLayerOffsetForLayer(sublayer)).toBeNull()
  })
})
