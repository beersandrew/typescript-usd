// Portions ported from OpenUSD 26.11.1, including: pxr/usd/sdf/layer.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import { Layer, LayerChange as SdfLayerChange } from '../src/index.ts'

describe('Sdf layer change records', () => {
  it('reports fields, spec creation, time samples, and spec removal', () => {
    const layer = Layer.createAnonymous('changes')
    const changes: SdfLayerChange[] = []
    const unsubscribe = layer._registerDidChangeListener((change) => changes.push(change))

    layer.setField('/World', 'specifier', 'def')
    layer.setAttrTimeSample('/World', 'size', 1, 2)
    layer.eraseField('/World.size', 'timeSamples')
    layer.getRootPrims().erase('World')
    unsubscribe()
    layer.setField('/', 'comment', 'not observed')

    // The old value is the specifier's 'over' fallback, which SdfLayer::
    // GetField reads for the unauthored required field.
    expect(changes).toContainEqual({
      kind: 'field', path: '/World', fieldName: 'specifier',
      oldValue: 'over', newValue: 'def',
    })
    // Spec add/remove records carry the SdfChangeList inert facts
    // (layer.cpp:4925-5006): a def prim contributes opinions (non-inert).
    // Removing a subtree that is not inert reports only its root
    // (SdfLayer::_DeleteSpec, layer.cpp:4872-4907).
    expect(changes).toContainEqual({
      kind: 'specAdded', path: '/World', specType: 'prim', inert: false,
    })
    // Time-sample records only flag the attribute, as upstream
    // SdfChangeList::DidChangeAttributeTimeSamples does.
    expect(changes).toContainEqual({
      kind: 'timeSample', path: '/World.size', fieldName: 'timeSamples',
    })
    // Property specs are created bare and fielded afterwards (upstream
    // SdfAttributeSpec::New authors only required fields), so the creation
    // record is inert even when a value write triggered it.
    expect(changes).toContainEqual({
      kind: 'specAdded', path: '/World.size', specType: 'attribute', inert: true,
    })
    expect(changes).toContainEqual({
      kind: 'field', path: '/World.size', fieldName: 'timeSamples',
      oldValue: [[1, 2]], newValue: undefined,
    })
    expect(changes).toContainEqual({
      kind: 'specRemoved', path: '/World', specType: 'prim', inert: false,
    })
    expect(changes).not.toContainEqual(expect.objectContaining({
      kind: 'specRemoved', path: '/World.size',
    }))
    expect(changes).not.toContainEqual(expect.objectContaining({
      kind: 'field', path: '/', fieldName: 'comment',
    }))
  })
})
