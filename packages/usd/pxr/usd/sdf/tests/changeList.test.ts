// Ported from OpenUSD 26.11.1: pxr/usd/sdf/changeList.cpp,
//  pxr/usd/sdf/changeManager.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfChangeList entries built from layer mutation records by the
// Sdf_ChangeManager rules (OpenUSD v26.08 pxr/usd/sdf/changeManager.cpp:
// 278-620, changeList.cpp).
import { describe, expect, it } from 'vitest'
import { Knot, Spline } from 'typescript-usd/ts'
import { Layer } from '../src/index.ts'
import { SdfPath } from '../src/path.ts'
import {
  SdfSubLayerChangeType, sdfChangeListFromLayerChanges, type SdfChangeRecord,
} from '../src/changeList.ts'

function recordChanges(layer: Layer, edit: () => void) {
  const records: SdfChangeRecord[] = []
  const unsubscribe = layer._registerDidChangeListener(change => records.push(change))
  edit()
  unsubscribe()
  return sdfChangeListFromLayerChanges(layer, records)
}

describe('SdfChangeList', () => {
  it('flags composition arc and target fields and keeps other fields as info', () => {
    const layer = Layer.createAnonymous('changeList')
    layer.definePrimSpec('/A', 'Scope', 'def')
    const list = recordChanges(layer, () => {
      layer.setField('/A', 'references', { prependedItems: [] })
      layer.setField('/A', 'inheritPaths', { prependedItems: ['/C'] })
      layer.setField('/A', 'kind', 'component')
      layer.setRelTargets('/A', 'rel', ['/B'])
      layer.setAttrTimeSample('/A', 'size', 1, 2)
    })
    const a = list.getEntry(SdfPath.fromString('/A'))
    expect(a.flags.didChangePrimReferences).toBe(true)
    expect(a.flags.didChangePrimInheritPaths).toBe(true)
    expect(a.infoChanged.map(([key]) => key)).toEqual(['references', 'inheritPaths', 'kind'])
    expect(list.getEntry(SdfPath.fromString('/A.rel')).flags.didChangeRelationshipTargets).toBe(true)
    const size = list.getEntry(SdfPath.fromString('/A.size'))
    expect(size.flags.didChangeAttributeTimeSamples).toBe(true)
    expect(size.flags.didAddPropertyWithOnlyRequiredFields).toBe(true)
  })

  it('reports added children as spec additions, not reorders', () => {
    const layer = Layer.createAnonymous('changeList')
    layer.definePrimSpec('/A', 'Scope', 'def')
    const list = recordChanges(layer, () => layer.definePrimSpec('/A/B', undefined, 'over'))
    expect(list.getEntry(SdfPath.fromString('/A')).flags.didReorderChildren).toBe(false)
    expect(list.getEntry(SdfPath.fromString('/A/B')).flags.didAddInertPrim).toBe(true)
    // An over's specifier equals the unauthored fallback: no info change.
    expect(list.getEntry(SdfPath.fromString('/A/B')).infoChanged).toEqual([])
  })

  it('describes sublayer additions, removals and offset edits', () => {
    const layer = Layer.createAnonymous('changeList')
    layer.setField('/', 'subLayers', ['a.usda'])
    const added = recordChanges(layer, () => layer.setField('/', 'subLayers', ['b.usda', 'a.usda']))
    expect(added.getEntry(SdfPath.absoluteRootPath).subLayerChanges)
      .toEqual([['b.usda', SdfSubLayerChangeType.SubLayerAdded]])
    const offset = recordChanges(layer, () =>
      layer.setField('/', 'subLayerOffsets', [{ offset: 0, scale: 1 }, { offset: 10, scale: 1 }]))
    expect(offset.getEntry(SdfPath.absoluteRootPath).subLayerChanges)
      .toEqual([['a.usda', SdfSubLayerChangeType.SubLayerOffset]])
  })

  it('records spec removals with their inertness', () => {
    const layer = Layer.createAnonymous('changeList')
    layer.definePrimSpec('/A', 'Scope', 'def')
    layer.declareProperty('/A', 'x', 'double')
    const list = recordChanges(layer, () => layer.getRootPrims().erase('A'))
    expect(list.getEntry(SdfPath.fromString('/A')).flags.didRemoveNonInertPrim).toBe(true)
    // Removing a subtree that is not inert reports only its root
    // (SdfLayer::_DeleteSpec, layer.cpp:4872-4907).
    expect(list.findEntry(SdfPath.fromString('/A.x'))).toBeUndefined()
  })

  it('creates a diff against an empty layer like SdfLayer::CreateDiff', () => {
    const layer = Layer.createAnonymous('changeList')
    layer.definePrimSpec('/A', 'Scope', 'def')
    layer.setAttrDefault('/A', 'x', 1)
    const empty = Layer.createAnonymous('empty')
    const removal = layer.createDiff(empty, false)
    expect(removal.getEntry(SdfPath.fromString('/A')).flags.didRemoveNonInertPrim).toBe(true)
    expect(removal.getEntry(SdfPath.fromString('/A.x')).flags.didRemoveProperty).toBe(true)
    const addition = empty.createDiff(layer, false)
    expect(addition.getEntry(SdfPath.fromString('/A')).flags.didAddNonInertPrim).toBe(true)
    expect(addition.getEntry(SdfPath.fromString('/A.x')).flags.didAddProperty).toBe(true)
  })

  it('compares splines by value: a different spline is a change, an equal one is not', () => {
    const spline = (value: number) => {
      const s = new Spline('double')
      s.setKnot(new Knot({ time: 0, value }))
      return s
    }
    const layer = Layer.createAnonymous('changeListSpline')
    layer.definePrimSpec('/A', 'Scope', 'def')
    layer.setField('/A.x', 'spline', spline(3))
    const changed = recordChanges(layer, () => layer.setField('/A.x', 'spline', spline(4)))
    expect(changed.getEntry(SdfPath.fromString('/A.x')).infoChanged.map(([key]) => key))
      .toEqual(['spline'])
    const unchanged = recordChanges(layer, () => layer.setField('/A.x', 'spline', spline(4)))
    expect(unchanged.isEmpty()).toBe(true)
  })
})
