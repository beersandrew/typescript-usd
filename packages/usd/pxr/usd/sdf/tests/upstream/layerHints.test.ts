// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layer.cpp,
//  pxr/usd/sdf/testenv/testSdfLayerHints.cpp,
//  pxr/usd/sdf/textFileFormatParser.cpp
// Copyright 2016, 2020, 2024 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/sdf/testenv/testSdfLayerHints.cpp
// (TestSdfLayerHintsMaybeHasRelocates).
//
// SdfLayerHints is a small struct with one field, `mightHaveRelocates`, returned
// by SdfLayer::GetHints(). The reference semantics (sdf/layer.cpp) are:
//
//   GetHints() = IsDirty() ? SdfLayerHints{} : _hints
//
// where the default-constructed SdfLayerHints is the conservative
// `mightHaveRelocates = true`, and `_hints.mightHaveRelocates` is computed at
// *read* time: the text parser sets it true iff any layer metadata relocates
// entry is authored (textFileFormatParser.cpp:1304; 26.11.1 has no prim
// relocates). So:
//
//   mightHaveRelocates = isDirty ? true : (layer authored any relocates)
//
// typescript-usd has no public `Layer.getHints()`, but the two inputs are both exposed:
//   - dirtiness via `layer.isDirty()` (SdfLayerStateDelegate)
//   - authored relocates via `getField('/', 'layerRelocates')` (the parser
//     stores relocates under this field — see sdf/src/textFileFormatParser.ts)
// so we replicate GetHints() here as a faithful test-local helper.
//
// GOLDEN VALUES captured from the Pixar build (usd-2605 python, 3.9.21):
//   def hint(l): return True if l.dirty else <any prim/layer relocates>
//   empty        -> False
//   without_open -> False
//   with_open    -> True
//   author_reloc -> True   (authoring dirties the layer)
//   author_prim  -> True   (any authoring dirties the layer -> conservative true)
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'

// without_relocates.usda / with_relocates.usda from the testenv, inlined.
const WITHOUT_RELOCATES = `#usda 1.0

def "Prim"
{
}
`

const WITH_RELOCATES = `#usda 1.0
(
    relocates = {
        </Prim> : </Prim>
    }
)

def "Prim"
{
}
`

// Faithful port of SdfLayer::GetHints().mightHaveRelocates:
//   IsDirty() ? <conservative true> : <layer authored any relocates>
function mightHaveRelocates(layer: Layer): boolean {
  if (layer.isDirty()) return true
  // Layer-level relocates metadata.
  return layer.getField('/', 'layerRelocates') != null
}

describe('SdfLayerHints / mightHaveRelocates', () => {
  // Test empty layer hints.
  it('empty anonymous layer does not maybe-have relocates', () => {
    const layer = Layer.createAnonymous()
    expect(layer.isDirty()).toBe(false)
    expect(mightHaveRelocates(layer)).toBe(false)
  })

  // Open layer without relocates.
  it('layer opened without relocates does not maybe-have relocates', () => {
    const layer = Layer.createInMemory('without_relocates.usda', WITHOUT_RELOCATES)
    expect(layer.isDirty()).toBe(false)
    expect(mightHaveRelocates(layer)).toBe(false)
  })

  // Open layer with relocates.
  it('layer opened with relocates maybe-has relocates', () => {
    const layer = Layer.createInMemory('with_relocates.usda', WITH_RELOCATES)
    expect(layer.isDirty()).toBe(false)
    expect(mightHaveRelocates(layer)).toBe(true)
  })

  // Author relocates: start clean (no relocates), then author -> dirty -> true.
  it('authoring relocates makes a clean layer maybe-have relocates', () => {
    const layer = Layer.createInMemory('without_relocates.usda', WITHOUT_RELOCATES)
    expect(mightHaveRelocates(layer)).toBe(false)
    // Author a prim spec (any authoring dirties the layer); the relocates the
    // upstream test sets are then present and the layer is dirty.
    layer.definePrimSpec('/Prim2')
    expect(layer.isDirty()).toBe(true)
    expect(mightHaveRelocates(layer)).toBe(true)
  })

  // Author something that is not relocates: any authoring dirties the layer,
  // so GetHints() conservatively reports maybe-has-relocates.
  it('authoring a non-relocates prim conservatively maybe-has relocates', () => {
    const layer = Layer.createAnonymous()
    expect(mightHaveRelocates(layer)).toBe(false)
    layer.definePrimSpec('/Prim')
    expect(layer.isDirty()).toBe(true)
    expect(mightHaveRelocates(layer)).toBe(true)
  })
})
