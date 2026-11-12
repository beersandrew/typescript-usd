// Ported from OpenUSD 26.11.1: pxr/usd/pcp/testenv/testPcpOwner.py,
//  pxr/usd/sdf/layer.h
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/pcp/testenv/testPcpOwner.py, using its
// testPcpOwner.testenv fixtures. SdfLayer's owner, sessionOwner and
// hasOwnedSubLayers properties (layer.h:1020-1058) read and write the
// pseudo-root fields of the same names, so the port reads and writes those
// fields directly.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/usd/_internal'
import {
  Cache as PcpCache, ErrorInvalidSublayerOwnership,
  type LayerOpener as PcpLayerOpener, type LayerStackIdentifier as PcpLayerStackIdentifier,
} from '../../src/index.ts'

const FIXTURES = path.join(
  fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testPcpOwner.testenv',
)

const opener: PcpLayerOpener = async (filePath) => {
  try {
    return (await Layer.findOrOpen(filePath))!
  } catch {
    return null
  }
}

const findOrOpen = (name: string): Promise<Layer> =>
  Layer.findOrOpen(path.join(FIXTURES, name)).then(value => value!)

const getOwner = (layer: Layer): unknown => layer.getField('/', 'owner')
const setOwner = (layer: Layer, owner: string): void => layer.setField('/', 'owner', owner)
const getSessionOwner = (layer: Layer): unknown => layer.getField('/', 'sessionOwner')
const setSessionOwner = (layer: Layer, owner: string): void =>
  layer.setField('/', 'sessionOwner', owner)
const getHasOwnedSubLayers = (layer: Layer): boolean =>
  layer.getField('/', 'hasOwnedSubLayers') === true
const setHasOwnedSubLayers = (layer: Layer, value: boolean): void =>
  layer.setField('/', 'hasOwnedSubLayers', value)

describe('TestPcpOwner', () => {
  let animLayer: Layer
  let strongerLayer: Layer
  let userLayer: Layer
  let weakerLayer: Layer
  let rootLayer: Layer
  let sessionLayer: Layer
  let layerStackId: PcpLayerStackIdentifier

  beforeEach(async () => {
    // Find the sibling sublayers that contain value opinions.
    animLayer = await findOrOpen('anim.usda')
    strongerLayer = await findOrOpen('stronger.usda')
    userLayer = await findOrOpen('owned.usda')
    weakerLayer = await findOrOpen('weaker.usda')

    expect(strongerLayer).toBeTruthy()
    expect(userLayer).toBeTruthy()
    expect(weakerLayer).toBeTruthy()

    // Open the shot, and ensure that it has a session layer.
    rootLayer = await findOrOpen('shot.usda')
    expect(rootLayer).toBeTruthy()

    sessionLayer = Layer.createAnonymous('session')
    expect(sessionLayer).toBeTruthy()
    setSessionOwner(sessionLayer, 'testUser')
    expect(getSessionOwner(sessionLayer)).toBeTruthy()

    layerStackId = { rootLayer, sessionLayer }
  })

  // PcpCache::ComputeLayerStack for a fresh cache. PcpCache.create computes
  // the root layer stack eagerly, so the errors from creating it are its
  // local errors (layerStackRegistry.cpp:130-160).
  async function computeLayerStack() {
    const cache = await PcpCache.create(rootLayer, opener, sessionLayer)
    expect(cache).toBeTruthy()
    const layerStack = cache.computeLayerStack(layerStackId, [])
    return { layerStack, errors: layerStack.localErrors }
  }

  it('test_OwnerBasics', async () => {
    // Test basic composition behaviors related to layer ownership.
    //
    // Note that we don't normally expect these values to be changed at
    // runtime, but the system should still respond correctly.

    const testResolve = async (expectedSourceLayer: Layer) => {
      const attrPath = '/Sphere.radius'

      // XXX: We create the cache from scratch each time because
      //      Pcp doesn't yet respond to Sd notices (regarding
      //      changes to layer ownership).
      const { layerStack, errors } = await computeLayerStack()
      expect(errors).toHaveLength(0)
      expect(layerStack).toBeTruthy()

      // Find the strongest layer with an opinion about the radius default.
      let strongestLayer: unknown = null
      for (const { layer } of layerStack.layers) {
        const radiusAttr = (layer as Layer).getAttributeAtPath(attrPath)
        if (radiusAttr && radiusAttr.getDefaultValue()) {
          strongestLayer = layer
          break
        }
      }

      // Ensure the strongest layer with an opinion is the expectedSourceLayer.
      expect(strongestLayer).toBe(expectedSourceLayer)
    }

    // Verify that this field was read correctly, then clear it.
    expect(getOwner(userLayer)).toBe('_PLACEHOLDER_')
    setOwner(userLayer, '')

    // Initially, the strongest layer's opinion should win, as usual.
    await testResolve(strongerLayer)

    // Make the owner of the "owned" layer the same as the owner denoted by
    // the session layer. Now the "owned" layer's opinion should win.
    setOwner(userLayer, getSessionOwner(sessionLayer) as string)
    await testResolve(userLayer)

    // If we change the session's owner, the "stronger" layer should win
    // once again. Setting it back should produce the previous result.
    setSessionOwner(sessionLayer, '_bogus_user_')
    await testResolve(strongerLayer)

    setSessionOwner(sessionLayer, getOwner(userLayer) as string)
    await testResolve(userLayer)

    // Similarly, changing the owner of a sublayer should also let the
    // "stronger" layer win once again.
    setOwner(userLayer, '_other_bogus_user_')
    await testResolve(strongerLayer)

    setOwner(userLayer, getSessionOwner(sessionLayer) as string)
    await testResolve(userLayer)

    // Changing both the session owner and the layer's owner to another
    // value should still produce the expected result.
    setSessionOwner(sessionLayer, '_foo_')
    setOwner(weakerLayer, '_foo_')
    await testResolve(weakerLayer)

    // Changing the required "hasOwnedSubLayers" bit on the parent layer
    // (anim) should affect the results.
    expect(getHasOwnedSubLayers(animLayer)).toBe(true)
    setHasOwnedSubLayers(animLayer, false)
    expect(getHasOwnedSubLayers(animLayer)).toBe(false)
    await testResolve(strongerLayer)

    setHasOwnedSubLayers(animLayer, true)
    expect(getHasOwnedSubLayers(animLayer)).toBe(true)
    await testResolve(weakerLayer)

    // Having more than one sibling layer with the same owner should
    // be detected as an error.
    setSessionOwner(sessionLayer, '_foo_')
    setOwner(weakerLayer, '_foo_')
    setOwner(strongerLayer, '_foo_')
    // XXX: Force the layer stack creation because Pcp doesn't
    //      respond to Sd notices.
    const { errors } = await computeLayerStack()

    for (const err of errors) {
      expect(err, `Unexpected Error: ${err.message}`)
        .toBeInstanceOf(ErrorInvalidSublayerOwnership)
    }

    expect(errors).toHaveLength(1)
  })
})
