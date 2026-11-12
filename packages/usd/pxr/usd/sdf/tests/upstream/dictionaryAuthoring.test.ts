// Ported from OpenUSD 26.11.1: pxr/usd/sdf/fileIO_Common.cpp,
//  pxr/usd/sdf/layer.cpp, pxr/usd/sdf/testenv/testSdfDictionaryAuthoring.cpp
// Copyright 2016, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfDictionaryAuthoring.cpp (OpenUSD
// 26.11.1). An empty VtValue is `undefined` here. SdfLayer::SetCustomLayerData
// is SetField(SdfPath::AbsoluteRootPath(), SdfFieldKeys->CustomLayerData)
// (layer.cpp), spelled with setField. The writer skips empty dictionary
// entries with a warning (fileIO_Common.cpp:861-871), which posts no error.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { TfDiagnosticTrap, TfErrorMark } from 'typescript-usd/tf'

// _GetInvalidDictionary (testSdfDictionaryAuthoring.cpp:22-29).
const invalidDictionary = () => ({ invalid: undefined, valid: 'value' })
// _GetInvalidNestedDictionary (:31-38).
const invalidNestedDictionary = () => ({ invalidNested: { invalid: undefined } })

describe('testSdfDictionaryAuthoring', () => {
  // _VerifyWriterSkipsEmptyValues (:40-68).
  it('_VerifyWriterSkipsEmptyValues', () => {
    const trap = new TfDiagnosticTrap()
    const mark = new TfErrorMark()
    try {
      const layer = Layer.createAnonymous('.usda')
      layer.setField('/', 'customLayerData', invalidDictionary())

      let layerText = layer.exportToString()
      expect(mark.isClean()).toBe(true)
      expect(layerText).not.toContain('invalid =')
      expect(layerText).toContain('string valid = "value"')

      // A dictionary with a single invalid nested item is emitted as an
      // empty dictionary.
      layer.setField('/', 'customLayerData', invalidNestedDictionary())
      layerText = layer.exportToString()
      expect(mark.isClean()).toBe(true)
      expect(layerText).toContain('dictionary invalidNested =')
      expect(layerText).not.toContain('dictionary invalid =')
    } finally {
      mark.dispose()
      trap.clear()
    }
  })
})
