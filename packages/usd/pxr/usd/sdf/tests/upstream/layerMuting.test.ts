// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layer.h,
//  pxr/usd/sdf/testenv/testSdfLayerMuting.py
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfLayerMuting.py (OpenUSD 26.11.1),
// with its testSdfLayerMuting.testenv inputs (a.usda, b.usda) copied
// unmodified into fixtures/testSdfLayerMuting.testenv.
//
// typescript-usd's SdfLayer has no layer-muting API: SdfLayer::AddToMutedLayers,
// SdfLayer::RemoveFromMutedLayers and SdfLayer::IsMuted (layer.h) are absent
// (muting exists only at the Pcp/Usd level). Every assertion that mutes,
// unmutes or queries muting -- and the emptiness/prim checks that depend on
// the mute state -- is not ported; the opening checks are.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

const TESTENV = path.join(
  fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testSdfLayerMuting.testenv')

describe('testSdfLayerMuting', () => {
  // test_UnmuteMutedLayer (testSdfLayerMuting.py:13-46).
  it('test_UnmuteMutedLayer: opening the unmuted layer A', async () => {
    const pathA = path.join(TESTENV, 'a.usda')
    const layerA = (await Layer.findOrOpen(pathA))!
    expect(layerA).toBeTruthy()
    // self.assertFalse(layerA.IsMuted()): not ported (SdfLayer::IsMuted).
    expect(layerA.isEmpty()).toBe(false)
    expect(layerA.getPrimAtPath('/Test')).toBeTruthy()
  })

  it('test_UnmuteMutedLayer: opening layer B', async () => {
    const pathB = path.join(TESTENV, 'b.usda')
    // Sdf.Layer.AddToMutedLayers(pathB) before opening: not ported
    // (SdfLayer::AddToMutedLayers).
    const layerB = (await Layer.findOrOpen(pathB))!
    expect(layerB).toBeTruthy()
    // layerB.IsMuted() / layerB.empty / GetPrimAtPath('/Test') is None while
    // muted, then AddToMutedLayers(pathA) / RemoveFromMutedLayers(pathB) and
    // the reversed checks on both layers (testSdfLayerMuting.py:30-44): not
    // ported (SdfLayer::AddToMutedLayers, RemoveFromMutedLayers, IsMuted).
  })
})
