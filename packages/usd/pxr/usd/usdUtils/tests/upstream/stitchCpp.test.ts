// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/testenv/testUsdUtilsStitch.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsStitch.cpp
// (registered as testUsdUtilsStitchCpp).
//
// API mapping: SdfLayer::CreateAnonymous is Layer.createAnonymous;
// SdfCreatePrimInLayer is sdfCreatePrimInLayer; SdfAttributeSpec::New is
// AttributeSpec.new. GetCustomData()[key] = value is
// getCustomData().set(key, value), and GetCustomData() read back is
// getCustomData().toObject(). The UsdUtilsStitchValueFn's VtValue*
// stitchedValue is the `{ value }` holder it receives; TF_AXIOM is expect.
// Layer handle equality is object identity.
import { describe, expect, it } from 'vitest'
import { AttributeSpec, Layer, ValueTypeNames, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { StitchValueStatus, UsdUtilsStitchLayers, type UsdUtilsStitchValueFn } from 'typescript-usd/usdUtils'

describe('testUsdUtilsStitchCpp', () => {
  it('TestCallback', () => {
    const layer1 = Layer.createAnonymous('.usda')
    const strongPrim = sdfCreatePrimInLayer(layer1, SdfPath.fromString('/Root'))
    const strongAttr = AttributeSpec.new(strongPrim, 'attr', ValueTypeNames.Double)!
    strongAttr.setTimeSample(1.0, 1.0)

    const layer2 = Layer.createAnonymous('.usda')
    const weakPrim = sdfCreatePrimInLayer(layer2, SdfPath.fromString('/Root'))
    const weakAttr = AttributeSpec.new(weakPrim, 'attr', ValueTypeNames.Double)!
    weakAttr.getCustomData().set('copy_samples', false)
    weakAttr.setTimeSample(2.0, 2.0)

    const maybeMergeTimeSamples: UsdUtilsStitchValueFn = (
      field, path, strongLayer, fieldInStrongLayer, weakLayer, fieldInWeakLayer, stitchedValue,
    ) => {
      expect(strongLayer).toBe(layer1)
      expect(weakLayer).toBe(layer2)

      if (field === 'timeSamples') {
        expect(path.equals(SdfPath.fromString('/Root.attr'))).toBe(true)

        // Both layers have time samples in them.
        expect(fieldInStrongLayer).toBe(true)
        expect(fieldInWeakLayer).toBe(true)

        const attrSpec = weakLayer.getAttributeAtPath(path)!
        const shouldCopy = attrSpec.getCustomData().get('copy_samples')
        if (!shouldCopy) {
          return StitchValueStatus.NoStitchedValue
        }
      } else if (field === 'customData') {
        expect(path.equals(SdfPath.fromString('/Root.attr'))).toBe(true)
        expect(path.equals(SdfPath.fromString('/Root.attr'))).toBe(true)

        const customData = strongLayer.getAttributeAtPath(path)!.getCustomData().toObject()
        let numStitched = typeof customData['num_stitched'] === 'number' ? customData['num_stitched'] : 0

        customData['num_stitched'] = ++numStitched
        stitchedValue.value = customData
        return StitchValueStatus.UseSuppliedValue
      }

      return StitchValueStatus.UseDefaultValue
    }

    // Stitch layer1 and layer2 together. Time samples for the attribute
    // should not be merged together.
    UsdUtilsStitchLayers(layer1, layer2, maybeMergeTimeSamples)
    expect(layer1.listTimeSamplesForPath(strongAttr.getPath().pathString)).not.toContain(2.0)
    expect(strongAttr.getCustomData().toObject()).toEqual({ num_stitched: 1 })

    // Set custom data to allow merging time samples and stitch again.
    weakAttr.getCustomData().set('copy_samples', true)

    UsdUtilsStitchLayers(layer1, layer2, maybeMergeTimeSamples)
    expect(layer1.listTimeSamplesForPath(strongAttr.getPath().pathString)).toContain(2.0)
    expect(strongAttr.getCustomData().toObject()).toEqual({ num_stitched: 2 })
  })
})
