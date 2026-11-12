// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfColorConfig.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/sdf/testenv/testSdfColorConfig.py
//
// Upstream exercises SdfLayer's colorConfiguration / colorManagementSystem
// metadata and SdfAttributeSpec's colorSpace via the high-level
// Has*/Clear*/property accessors. typescript-usd exposes these as plain layer fields
// (root-spec layer metadata for colorConfiguration/colorManagementSystem,
// attribute-spec field for colorSpace), so this port mirrors each upstream
// case using the field-level public API:
//   layer.colorConfiguration            -> layer.getField('/', 'colorConfiguration')
//   layer.HasColorConfiguration()       -> getFieldNames('/').includes(...)
//   layer.ClearColorConfiguration()     -> layer.eraseField('/', 'colorConfiguration')
//   layer.colorConfiguration = v        -> layer.setField('/', 'colorConfiguration', v)
//   attr.colorSpace / HasColorSpace()   -> getField/getFieldNames(attrPath, 'colorSpace')
//
// Golden values captured from the Pixar build (usd-2605, Python 3.9.21):
//   colorConfig.usda colorConfiguration ==
//     'https://github.com/imageworks/OpenColorIO-Configs/blob/master/aces_1.0.1/config.ocio'
//   default (anonymous) layer: colorConfiguration '' / HasColorConfiguration False,
//     colorManagementSystem '' / HasColorManagementSystem False
//   colorSpace.usda: baseColor colorSpace 'lin_srgb' (HasColorSpace True),
//     extraColors colorSpace '' (authored empty -> HasColorSpace True),
//     unknownColor (no field -> HasColorSpace False)
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

// Mirrors testSdfColorConfig.testenv/colorConfig.usda
const colorConfigUsda = `#usda 1.0
(
    colorConfiguration = @https://github.com/imageworks/OpenColorIO-Configs/blob/master/aces_1.0.1/config.ocio@
)
`

// Mirrors testSdfColorConfig.testenv/colorSpace.usda
const colorSpaceUsda = `#usda 1.0

def Shader "Pattern"
{
    color3f baseColor = (0, .1, .9) (
        colorSpace = "lin_srgb"
    )

    color3f[] extraColors = [(.8, .8, .8), (0, .2, .5), (0, 0, 1)] (
        colorSpace = ""
    )

    color4f unknownColor
}
`

const ACES_101 =
  'https://github.com/imageworks/OpenColorIO-Configs/blob/master/aces_1.0.1/config.ocio'
const ACES_103 =
  'https://github.com/imageworks/OpenColorIO-Configs/blob/master/aces_1.0.3/config.ocio'

// HasColorConfiguration()/HasColorSpace() semantics: the field is *present*
// on the spec (an authored empty string still counts as present).
const hasField = (layer: Layer, path: string, field: string): boolean =>
  layer.getFieldNames(path).includes(field)

describe('SdfLayer color config', () => {
  // test_LayerColorConfig
  it('reads, clears and authors layer colorConfiguration', () => {
    const layer = Layer.createInMemory('colorConfig.usda', colorConfigUsda)
    expect(layer).not.toBeNull()

    expect(layer.getField('/', 'colorConfiguration')).toBe(ACES_101)
    expect(hasField(layer, '/', 'colorConfiguration')).toBe(true)

    layer.eraseField('/', 'colorConfiguration')
    expect(hasField(layer, '/', 'colorConfiguration')).toBe(false)

    layer.setField('/', 'colorConfiguration', ACES_103)
    expect(layer.getField('/', 'colorConfiguration')).toBe(ACES_103)
    expect(hasField(layer, '/', 'colorConfiguration')).toBe(true)

    layer.eraseField('/', 'colorConfiguration')
    expect(hasField(layer, '/', 'colorConfiguration')).toBe(false)
  })

  // Fallback / default values (the Pixar suite covers these via the property
  // accessors on a layer with no authored color metadata).
  it('has no color metadata by default', () => {
    const layer = Layer.createInMemory('empty.usda', '#usda 1.0\n')

    expect(layer.getField('/', 'colorConfiguration')).toBeUndefined()
    expect(hasField(layer, '/', 'colorConfiguration')).toBe(false)

    expect(layer.getField('/', 'colorManagementSystem')).toBeUndefined()
    expect(hasField(layer, '/', 'colorManagementSystem')).toBe(false)
  })

  // colorConfig.usda authors only colorConfiguration, not colorManagementSystem.
  it('does not have colorManagementSystem when unauthored', () => {
    const layer = Layer.createInMemory('colorConfig2.usda', colorConfigUsda)
    expect(layer.getField('/', 'colorManagementSystem')).toBeUndefined()
    expect(hasField(layer, '/', 'colorManagementSystem')).toBe(false)
  })
})

describe('SdfAttributeSpec color space', () => {
  // test_AttrColorSpace
  it('reads, clears and authors attribute colorSpace', () => {
    const layer = Layer.createInMemory('colorSpace.usda', colorSpaceUsda)
    expect(layer).not.toBeNull()

    const baseColor = '/Pattern.baseColor'
    const extraColors = '/Pattern.extraColors'
    const unknownColor = '/Pattern.unknownColor'

    // All three attribute specs exist.
    expect(layer.getFieldNames(baseColor)).toContain('typeName')
    expect(layer.getFieldNames(extraColors)).toContain('typeName')
    expect(layer.getFieldNames(unknownColor)).toContain('typeName')

    // baseColor and extraColors author colorSpace (empty string still counts);
    // unknownColor does not.
    expect(hasField(layer, baseColor, 'colorSpace')).toBe(true)
    expect(hasField(layer, extraColors, 'colorSpace')).toBe(true)
    expect(hasField(layer, unknownColor, 'colorSpace')).toBe(false)

    expect(layer.getField(baseColor, 'colorSpace')).toBe('lin_srgb')

    layer.eraseField(extraColors, 'colorSpace')
    expect(hasField(layer, extraColors, 'colorSpace')).toBe(false)

    layer.setField(unknownColor, 'colorSpace', 'lin_rec709')
    expect(hasField(layer, unknownColor, 'colorSpace')).toBe(true)
    expect(layer.getField(unknownColor, 'colorSpace')).toBe('lin_rec709')
  })
})
