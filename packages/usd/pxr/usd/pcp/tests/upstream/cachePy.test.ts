// Ported from OpenUSD 26.11.1: pxr/usd/pcp/testenv/testPcpCache.py,
//  pxr/usd/pcp/wrapCache.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/usd/pcp/testenv/testPcpCache.py
// (registration testPcpCache) with its testenv
// testPcpMuseum_BasicReference.testenv (fixtures/, copied unmodified).
//
// typescript-usd PcpCaches are always USD mode (cache.ts isUsd), so the
// Pcp.Cache(lsi) and Pcp.Cache(lsi, fileFormatTarget=...) caches upstream
// builds in non-USD mode are built in USD mode here and their
// `assertFalse(pi.IsUsd())` checks are out of scope (non-USD/Presto Pcp mode
// is not implemented). The localErrors counts upstream asserts for those
// caches are unchanged in USD mode (checked against the 26.11.1 build).
// Pcp.Cache.Reload is wrapCache.cpp:204-209: Reload into a PcpChanges, then
// Apply.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer, PrimSpec as SdfPrimSpec } from 'typescript-usd/sdf'
import { Layer as UsdLayer } from 'typescript-usd/usd/_internal'
import {
  Cache as PcpCache, Changes as PcpChanges, ErrorInvalidAssetPath as PcpErrorInvalidAssetPath,
  pcpLayerStackIdentifier, type Error as PcpError, type Layer as PcpLayer,
  type LayerOpener as PcpLayerOpener,
} from '../../src/index.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testPcpMuseum_BasicReference.testenv')

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

describe('testPcpCache', () => {
  // testPcpCache.py:12-56.
  it('test_Basic', async () => {
    const layer = (await opener(path.join(TESTENV, 'BasicReference/root.usda'))) as Layer
    expect(layer).toBeTruthy()
    let pcpCache = await PcpCache.create(layer, opener)
    expect(pcpCache).toBeTruthy()
    pcpCache.getUsedLayers()
    const ls = pcpCache.getLayerStack()
    expect(pcpCache.hasRootLayerStack(ls)).toBe(true)

    // Layers without the correct target are marked invalid during composition.
    pcpCache = await PcpCache.create(layer, opener, undefined, undefined, { fileFormatTarget: 'usd' })
    let pi = await pcpCache.computePrimIndex('/PrimWithReferences')
    expect(pi.isValid()).toBe(true)
    expect(pi.localErrors.length).toBe(0)

    pcpCache = await PcpCache.create(layer, opener, undefined, undefined,
      { fileFormatTarget: 'UnspecifiedPrestoTarget' })
    pi = await pcpCache.computePrimIndex('/PrimWithReferences')
    expect(pi.isValid()).toBe(true)
    expect(pi.localErrors.length).toBe(2)
    expect(pi.localErrors.every((e: PcpError) => e instanceof PcpErrorInvalidAssetPath)).toBe(true)

    const usdPcpCache = await PcpCache.create(layer, opener)
    expect(usdPcpCache).toBeTruthy()
    pi = await usdPcpCache.computePrimIndex('/PrimWithReferences')
    expect(pi.isValid()).toBe(true)
    expect(pi.isUsd()).toBe(true)
    expect(pi.localErrors.length).toBe(0)
  })

  // testPcpCache.py:58-81.
  it('test_PcpCacheReloadSessionLayers', async () => {
    const rootLayer = Layer.createAnonymous()
    const sessionRootLayer = Layer.createAnonymous()
    expect(sessionRootLayer).toBeTruthy()
    const sessionSubLayer = Layer.createAnonymous()
    expect(sessionSubLayer).toBeTruthy()
    for (const l of [rootLayer, sessionRootLayer, sessionSubLayer]) opened.set(l.identifier, l)

    sessionRootLayer.insertSubLayerPath(sessionSubLayer.identifier)

    SdfPrimSpec.new(sessionSubLayer, 'Root', 'def')
    expect(sessionSubLayer.getPrimAtPath('/Root')).toBeTruthy()

    const lsi = pcpLayerStackIdentifier(rootLayer, sessionRootLayer)
    const pcpCache = await PcpCache.create(rootLayer, opener, sessionRootLayer)
    expect(pcpCache).toBeTruthy()
    pcpCache.computeLayerStack(lsi, [])

    const changes = new PcpChanges()
    await pcpCache.reload(changes)
    await changes.apply()
    expect(sessionSubLayer.getPrimAtPath('/Root')).toBeTruthy()
  })
})
