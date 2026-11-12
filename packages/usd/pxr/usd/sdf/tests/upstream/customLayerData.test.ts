// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/sdf/testenv/testSdfCustomLayerData.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

// Port of pxr/usd/sdf/testenv/testSdfCustomLayerData.py
//
// Upstream exercises the customLayerData layer-metadata dictionary through the
// Sdf.Layer API: read it off a fixture layer, HasCustomLayerData /
// ClearCustomLayerData, and re-author a fresh dict. typescript-usd has no dedicated
// customLayerData accessor pair, but the field is plain layer metadata on the
// pseudo-root spec ('/'), so the generic Layer field API is the faithful
// equivalent:
//   layer.customLayerData            -> layer.getField('/', 'customLayerData')
//   layer.HasCustomLayerData()       -> getField(...) !== undefined
//   layer.ClearCustomLayerData()     -> layer.eraseField('/', 'customLayerData')
//   layer.customLayerData = value    -> layer.setField('/', 'customLayerData', value)
//
// Golden values captured from the Pixar build (usd-2605, Python 3.9.21) reading
// testSdfCustomLayerData.testenv/layerAccess.usda:
//   layerAccessId            => 'id'
//   layerAccessAssetPath     => Sdf.AssetPath('/layer/access.usda')
//   layerAccessRandomNumber  => 5
// typescript-usd represents the asset-path value as its plain authored-path string, the
// equivalent of Sdf.AssetPath('/layer/access.usda').

// The fixture layer (testSdfCustomLayerData.testenv/layerAccess.usda), inlined.
const LAYER_ACCESS_USDA = `#usda 1.0
(
    customLayerData = {
        token layerAccessId = 'id'
        asset layerAccessAssetPath  = @/layer/access.usda@
        int layerAccessRandomNumber = 5
    }
)
`

describe('Sdf customLayerData', () => {
  it('reads the customLayerData dictionary from a layer', () => {
    const layer = Layer.createInMemory('layerAccess.usda', LAYER_ACCESS_USDA)
    expect(layer).not.toBeNull()

    const expectedValue = {
      layerAccessId: 'id',
      layerAccessAssetPath: '/layer/access.usda',
      layerAccessRandomNumber: 5,
    }
    expect(layer.getField('/', 'customLayerData')).toEqual(expectedValue)
  })

  it('Has / Clear customLayerData', () => {
    const layer = Layer.createInMemory('layerAccess.usda', LAYER_ACCESS_USDA)

    // HasCustomLayerData() — the field is authored on the fixture.
    expect(layer.getField('/', 'customLayerData')).not.toBeUndefined()

    // ClearCustomLayerData()
    layer.eraseField('/', 'customLayerData')
    expect(layer.getField('/', 'customLayerData')).toBeUndefined()
  })

  it('authors a fresh customLayerData dictionary, then clears it', () => {
    const layer = Layer.createInMemory('layerAccess.usda', LAYER_ACCESS_USDA)
    layer.eraseField('/', 'customLayerData')
    expect(layer.getField('/', 'customLayerData')).toBeUndefined()

    const newValue = {
      newLayerAccessId: 'newId',
      newLayerAccessAssetPath: '/new/layer/access.usda',
      newLayerAccessRandomNumber: 1,
    }
    layer.setField('/', 'customLayerData', newValue)
    expect(layer.getField('/', 'customLayerData')).toEqual(newValue)

    // HasCustomLayerData() after re-authoring.
    expect(layer.getField('/', 'customLayerData')).not.toBeUndefined()

    // ClearCustomLayerData()
    layer.eraseField('/', 'customLayerData')
    expect(layer.getField('/', 'customLayerData')).toBeUndefined()
  })
})
