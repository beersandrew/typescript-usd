// Ported from OpenUSD 26.11.1: pxr/usd/usd/object.h,
//  pxr/usd/usd/testenv/testUsdDataFormats.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdDataFormats.py
// (registered as testUsdDataFormats).
//
// Mapping: Usd.Stage.CreateNew('test.' + fmt) writes a new file; here the
// stage is opened on an anonymous layer of the same format
// (Sdf.Layer.CreateAnonymous('test.' + fmt)), which keeps the same layer data
// implementation without touching the file system. SetCustomDataByKey /
// GetCustomDataByKey are the customData dictionary-key metadata accessors
// (object.h SetCustomDataByKey -> SetMetadataByDictKey).

import { describe, expect, it } from 'vitest'
import { AssetPath as SdfAssetPath, Layer, PrimSpec as SdfPrimSpec } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'

const allFormats = ['usda', 'usdc']

describe('testUsdDataFormats', () => {
  it('test_PseudoRoot', () => {
    for (const fmt of allFormats) {
      const layer = Layer.createAnonymous('pseudoroot.' + fmt)
      expect(layer, 'Could not create ' + fmt + ' layer').toBeTruthy()
      expect(layer.getPseudoRoot().hasInfo('specifier'),
        fmt + ' layer reports unexpected pseudoroot specifier').toBe(false)
      const prim = SdfPrimSpec.new(layer, 'root', 'def')!
      expect(prim).toBeTruthy()
      expect(prim.hasInfo('specifier')).toBe(true)
      expect(prim.listInfoKeys()).toContain('specifier')
      expect(prim.getInfo('specifier')).toBe('def')
      prim.clearInfo('specifier')
      expect(prim.getInfo('specifier')).toBe('over')
      expect(prim.hasInfo('specifier')).toBe(true)
      expect(prim.listInfoKeys()).toContain('specifier')
    }
  })

  it('test_Sublayers', () => {
    // Regression test to ensure that all formats can read and write sublayer
    // paths.
    for (const fmt of allFormats) {
      const a = Layer.createAnonymous('test.' + fmt)
      const layerName = 'hello.usd'
      a.insertSubLayerPath(layerName)
      a.exportToString()
      expect(a.getSubLayerPaths().length).toBe(1)
      expect(a.getSubLayerPaths()[0]).toBe(layerName)
    }
  })

  it('test_AssetPath', async () => {
    // Regression test to ensure that VtDictionaries holding SdfAssetPath can
    // be represented in all formats.
    for (const fmt of allFormats) {
      const s = await Stage.open(Layer.createAnonymous('test.' + fmt))
      const p = s.definePrim('/X', 'Scope')
      p.setMetadataByDictKey('customData', 'identifier', new SdfAssetPath('asset.usd'))
      expect(p.getMetadataByDictKey('customData', 'identifier'))
        .toEqual(new SdfAssetPath('asset.usd'))
    }
  })
})
