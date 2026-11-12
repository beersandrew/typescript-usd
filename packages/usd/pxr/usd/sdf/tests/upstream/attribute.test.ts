// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfAttribute.py
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfAttribute.py.
//
// Upstream runs the suite once per file format (TestSdfAttributeUsda and
// TestSdfAttributeUsdc); describe.each does the same here.

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import { Range1d, Vec3f } from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import { Spline as TsSpline } from 'typescript-usd/ts'
import { Array as VtArray, ArrayEditBuilder as VtArrayEditBuilder, type ArrayEdit as VtArrayEdit } from 'typescript-usd/vt'
import * as Sdf from '../../src/index.ts'
import {
  AssetPath, AttributeSpec, Layer, ListOp, PrimSpec, PropertySpec, ValueTypeNames, sdfCreatePrimInLayer,
  type ListProxy,
} from '../../src/index.ts'
import { SdfPath } from '../../src/path.ts'

// Python assertEqual on Sdf/Vt/Ts values: the value type's operator==.
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    if (a.constructor !== b.constructor) return false
    const equals = (a as { equals?: (other: unknown) => boolean }).equals
    if (typeof equals === 'function') return equals.call(a, b)
  }
  return isDeepStrictEqual(a, b)
}

// The Python list proxy's insert (pyListProxy.h _Insert): a negative index
// counts from the end, and an index outside [0, size] raises IndexError.
function pyInsert<T>(proxy: ListProxy<T>, index: number, value: T): void {
  if (index < 0) index += proxy.size()
  if (index < 0 || index > proxy.size()) throw new RangeError('list index out of range')
  proxy.insert(index, value)
}

// SdfAttributeSpec::EraseTimeSample (attributeSpec.h).
const eraseTimeSample = (attr: AttributeSpec, time: number): void =>
  (attr as unknown as { eraseTimeSample(time: number): void }).eraseTimeSample(time)

// Sdf.OpaqueValue (SdfOpaqueValue, opaqueValue.h).
const OpaqueValue = (Sdf as unknown as { OpaqueValue: new () => unknown }).OpaqueValue

describe.each(['usda', 'usdc'])('testSdfAttribute (%s)', (extension) => {
  const CreateAnonymous = (): Layer => Layer.createAnonymous(extension)

  // Sdf.Path(p).MakeAbsolutePath(anchor), as the list proxies store paths.
  const abs = (p: string, anchor: SdfPath): string => SdfPath.fromString(p).makeAbsolutePath(anchor).pathString

  it('test_Creation', () => {
    // Test SdPropertySpec abstractness
    expect(() => {
      new (PropertySpec as unknown as new () => unknown)()
    }).toThrow()

    // Test SdAttributeSpec creation and name
    const layer = CreateAnonymous()
    const prim = PrimSpec.new(layer, 'test', 'def', 'bogus_type')!
    const attr = AttributeSpec.new(prim, 'numCrvs', ValueTypeNames.Int)!
    expect(attr.getName()).toBe('numCrvs')
    expect(attr.getTypeName()).toBe(ValueTypeNames.Int)
    expect(attr.getOwner()?.equals(prim)).toBe(true)
    expect(prim.getProperties().size()).toBe(1)
    expect(prim.getProperties().values().some(p => p.equals(attr))).toBe(true)
    expect(prim.getProperties().has(attr.getName())).toBe(true)
    expect(prim.getProperties().at(0).equals(attr)).toBe(true)
    expect(prim.getProperties().get(attr.getName())?.equals(attr)).toBe(true)
    expect(prim.getProperties().at(0).isCustom()).toBe(false)

    // create a duplicate attribute: error expected
    expect(() => {
      AttributeSpec.new(
        attr.getOwner() as PrimSpec, attr.getName(), ValueTypeNames.Int)
      expect(prim.getProperties().size()).toBe(1)
    }).toThrow()

    // create a duplicate attribute via renaming: error expected
    const dupe = AttributeSpec.new(attr.getOwner() as PrimSpec, 'dupe', ValueTypeNames.Int)
    expect(dupe).toBeTruthy()
    expect(() => dupe!.setName(attr.getName())).toThrow()
    expect(dupe!.getName()).toBe('dupe')

    // create an attribute under an expired prim: error expected
    const prim2 = PrimSpec.new(layer, 'test2', 'def', 'bogus_type')!
    expect(prim2.getName()).toBe('test2')
    expect(prim2.expired).toBe(false)
    layer.getRootPrims().erase(prim2.getName())
    expect(prim2.expired).toBe(true)
    expect(() => AttributeSpec.new(prim2, 'attr2', ValueTypeNames.Int)).toThrow()

    // create an attribute on the PseudoRoot: error expected
    expect(layer.getPseudoRoot().getProperties().size()).toBe(0)
    expect(() => {
      AttributeSpec.new(
        layer.getPseudoRoot(), 'badAttr', ValueTypeNames.Int)
    }).toThrow()
    expect(layer.getPseudoRoot().getProperties().size()).toBe(0)
  })

  it('test_Rename', () => {
    const layer = CreateAnonymous()
    const prim = PrimSpec.new(layer, 'test', 'def', 'bogus_type')!
    const attr = AttributeSpec.new(prim, 'numCrvs', ValueTypeNames.Int)!
    attr.setName('numberOfCurves')
    expect(attr.getName()).toBe('numberOfCurves')

    // Check invalid cases.
    for (const badName of ['', 'a.b', '<ab>', 'a[]', 'a/']) {
      const oldName = attr.getName()
      expect(oldName).not.toBe('')
      expect(oldName).not.toBe(badName)
      expect(() => attr.setName(badName), badName).toThrow()
      expect(attr.getName()).toBe(oldName)
    }
  })

  it('test_InvalidName', () => {
    const layer = CreateAnonymous()
    const prim = PrimSpec.new(layer, 'test', 'def', 'bogus_type')!
    for (const badName of ['', 'a.b', '<ab>', 'a[]', 'a/']) {
      expect(() => {
        AttributeSpec.new(
          prim, badName, ValueTypeNames.Int)
      }, badName).toThrow()
    }
  })

  it('test_Metadata', () => {
    const layer = CreateAnonymous()
    const prim = PrimSpec.new(layer, 'test', 'def', 'bogus_type')!
    const attr = AttributeSpec.new(prim, 'numCrvs', ValueTypeNames.Int)!

    // assign a default value, otherwise after ClearInfo, attr will expire.
    attr.setDefaultValue(1)

    expect(attr.isCustom()).toBe(false)
    attr.setCustom(true)
    expect(attr.isCustom()).toBe(true)
    attr.setCustom(false)
    expect(attr.isCustom()).toBe(false)

    // attr.customData = {...} assigns the whole dictionary
    // (wrapPropertySpec.cpp _SetCustomData).
    expect(attr.hasInfo('customData')).toBe(false)
    expect(attr.getCustomData().size() === 0).toBe(true)
    attr.getCustomData().assign({ attrCustomData: { attrBool: true } })
    expect(attr.hasInfo('customData')).toBe(true)
    expect(attr.getCustomData().size() === 1).toBe(true)
    expect(attr.getCustomData().get('attrCustomData')).toEqual({ attrBool: true })
    attr.getCustomData().assign({ attrCustomData: { attrFloat: 1.0 } })
    expect(attr.hasInfo('customData')).toBe(true)
    expect(attr.getCustomData().size() === 1).toBe(true)
    expect(attr.getCustomData().get('attrCustomData')).toEqual({ attrFloat: 1.0 })
    attr.clearInfo('customData')
    expect(attr.hasInfo('customData')).toBe(false)
    expect(attr.getCustomData().size() === 0).toBe(true)
    expect(() => {
      // This dict's Gf.Range1d values are not supported as metadata in
      // scene description.
      attr.getCustomData().assign({
        foo: { bar: new Range1d(1.0, 2.0) },
        bar: new Range1d(1.0, 2.0),
      })
    }).toThrow()
    expect(attr.getCustomData().size() === 0).toBe(true)

    // Setting doc so that we can clear default without expiring.
    attr.setDocumentation('some documentation')
    attr.clearInfo('default')
    expect(attr.hasInfo('default')).toBe(false)
    expect(attr.hasDefaultValue()).toBe(false)
    expect(attr.getDefaultValue()).toBeUndefined()
    for (let val = -10; val < 10; val++) {
      attr.setDefaultValue(val)
      attr.setDefaultValue(val) // do this twice to cover the SetDefault
      // short-circuit
      expect(attr.hasInfo('default')).toBe(true)
      expect(attr.hasDefaultValue()).toBe(true)
      expect(attr.getDefaultValue()).toBe(val)
      expect(attr.getDefaultValue()).not.toBeUndefined()
      expect(attr.getDefaultValue()).not.toBeInstanceOf(VtArray)
    }
    attr.clearDefaultValue()
    expect(attr.hasInfo('default')).toBe(false)
    expect(attr.hasDefaultValue()).toBe(false)
    expect(attr.getDefaultValue()).toBeUndefined()

    const shapedAttr = AttributeSpec.new(
      prim, 'testShapedAttr', ValueTypeNames.IntArray)!
    expect(shapedAttr.hasInfo('default')).toBe(false)
    expect(shapedAttr.getDefaultValue()).toBeUndefined()

    // set documentation so that we can clear without expiring.
    shapedAttr.setDocumentation('some shaped documentation')

    for (let dim = 1; dim < 10; dim++) {
      // Vt.IntArray(dim); val[...] = range(dim)
      const val = new VtArray<number>([...Array(dim).keys()], TfType.findByName('int'))
      expect(val.size).toBe(dim)
      shapedAttr.setDefaultValue(val)
      expect(shapedAttr.hasInfo('default')).toBe(true)
      expect(valuesEqual(shapedAttr.getDefaultValue(), val)).toBe(true)
      expect(shapedAttr.getDefaultValue()).not.toBeUndefined()
      expect(shapedAttr.getDefaultValue()).toBeInstanceOf(VtArray)
    }
    shapedAttr.clearInfo('default')
    expect(shapedAttr.hasInfo('default')).toBe(false)
    expect(shapedAttr.getDefaultValue()).toBeUndefined()

    expect(attr.getComment()).toBe('')
    attr.setComment('foo')
    expect(attr.getComment()).toBe('foo')
    attr.setComment('bar')
    expect(attr.getComment()).toBe('bar')
    attr.setComment('')
    expect(attr.getComment()).toBe('')

    attr.clearInfo('documentation')
    expect(attr.hasInfo('documentation')).toBe(false)
    expect(attr.getDocumentation()).toBe('')
    attr.setDocumentation('foo')
    expect(attr.hasInfo('documentation')).toBe(true)
    expect(attr.getDocumentation()).toBe('foo')
    attr.setDocumentation('bar')
    expect(attr.hasInfo('documentation')).toBe(true)
    expect(attr.getDocumentation()).toBe('bar')
    attr.clearInfo('documentation')
    expect(attr.hasInfo('documentation')).toBe(false)
    expect(attr.getDocumentation()).toBe('')

    expect(attr.hasInfo('displayGroup')).toBe(false)
    expect(attr.getDisplayGroup()).toBe('')
    attr.setDisplayGroup('foo')
    expect(attr.hasInfo('displayGroup')).toBe(true)
    expect(attr.getDisplayGroup()).toBe('foo')
    attr.setDisplayGroup('bar')
    expect(attr.hasInfo('displayGroup')).toBe(true)
    expect(attr.getDisplayGroup()).toBe('bar')
    attr.clearInfo('displayGroup')
    expect(attr.hasInfo('displayGroup')).toBe(false)
    expect(attr.getDisplayGroup()).toBe('')

    // arraySizeConstraint
    expect(attr.hasArraySizeConstraint()).toBe(false)
    expect(attr.getArraySizeConstraint()).toBe(0)

    attr.setArraySizeConstraint(10)
    expect(attr.getArraySizeConstraint()).toBe(10)
    expect(attr.hasArraySizeConstraint()).toBe(true)

    attr.setArraySizeConstraint(-10)
    expect(attr.getArraySizeConstraint()).toBe(-10)
    expect(attr.hasArraySizeConstraint()).toBe(true)

    attr.clearArraySizeConstraint()
    expect(attr.getArraySizeConstraint()).toBe(0)
    expect(attr.hasArraySizeConstraint()).toBe(false)
  })

  it('test_ClearUnexpectedField', () => {
    const layer = CreateAnonymous()
    layer.importFromString(
`#usda 1.0
def Sphere "Foo"
{
    double radius (
        displayName = "Radius"
        unrecognized = "Test"
    )
}
`)

    const spec = layer.getPropertyAtPath('/Foo.radius')!
    expect(spec.hasInfo('unrecognized')).toBe(true)
    spec.clearInfo('unrecognized')
    expect(spec.hasInfo('unrecognized')).toBe(false)
  })

  it('test_Connections', () => {
    const layer = CreateAnonymous()
    const prim = PrimSpec.new(layer, 'test', 'def', 'bogus_type')!
    const attr = AttributeSpec.new(prim, 'numCrvs', ValueTypeNames.Int)!
    const primPath = (): SdfPath => attr.getPath().getPrimPath()

    expect(attr.hasInfo('connectionPaths')).toBe(false)
    expect(attr.getConnectionPathList().isExplicit()).toBe(false)
    expect(attr.getConnectionPathList().getExplicitItems().size()).toBe(0)
    let testPath = 'test.attr'
    attr.getConnectionPathList().getExplicitItems().append(testPath)
    testPath = abs(testPath, primPath())
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).toContain(testPath)
    expect(attr.hasInfo('connectionPaths')).toBe(true)
    expect(attr.getConnectionPathList().isExplicit()).toBe(true)
    let testPath2 = 'test2.attr'
    attr.getConnectionPathList().getExplicitItems().append(testPath2)
    testPath2 = abs(testPath2, primPath())
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).toContain(testPath2)
    expect(attr.getConnectionPathList().getExplicitItems().toArray())
      .toEqual([testPath, testPath2])
    attr.getConnectionPathList().getExplicitItems().clear()
    expect(attr.hasInfo('connectionPaths')).toBe(true)
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).not.toContain(testPath)
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).not.toContain(testPath2)
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).toEqual([])
    attr.getConnectionPathList().getExplicitItems().assign([testPath, testPath2])
    expect(attr.hasInfo('connectionPaths')).toBe(true)
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).toContain(testPath)
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).toContain(testPath2)
    expect(attr.getConnectionPathList().getExplicitItems().toArray())
      .toEqual([testPath, testPath2])

    // adding connection to invalid path: errors expected
    const bogus = '/Not/A{Valid=Connection}Path/to/test.attribute'
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).not.toContain(bogus)
    expect(() => attr.getConnectionPathList().getExplicitItems().append(bogus)).toThrow()
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).not.toContain(bogus)

    // inserting connection paths at various indices
    const testPath1 = abs('test.foo', primPath())
    testPath2 = abs('test2.foo', primPath())
    attr.getConnectionPathList().getExplicitItems().assign([testPath1, testPath2])
    const testPath_middle = abs('middle.foo', primPath())
    pyInsert(attr.getConnectionPathList().getExplicitItems(), 1, testPath_middle)
    const testPath_first = abs('first.foo', primPath())
    pyInsert(attr.getConnectionPathList().getExplicitItems(), 0, testPath_first)
    expect(() => pyInsert(attr.getConnectionPathList().getExplicitItems(), 1000, 'last.foo'))
      .toThrow(RangeError)
    const testPath_penultimate = abs('penultimate.foo', primPath())
    pyInsert(attr.getConnectionPathList().getExplicitItems(), -1, testPath_penultimate)
    expect(attr.getConnectionPathList().getExplicitItems().toArray())
      .toEqual([testPath_first, testPath1, testPath_middle,
        testPath_penultimate, testPath2])

    // removing connection paths by value
    const testPath_dead = abs('dead.foo', primPath())
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).not.toContain(testPath_dead)
    pyInsert(attr.getConnectionPathList().getExplicitItems(), 2, testPath_dead)
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).toContain(testPath_dead)
    // del items[value] (pyListProxy.h __delitem__ -> Remove)
    attr.getConnectionPathList().getExplicitItems().remove(testPath_dead)
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).not.toContain(testPath_dead)

    // adding duplicate connection path
    testPath = attr.getConnectionPathList().getExplicitItems().get(0)
    expect(attr.getConnectionPathList().getExplicitItems().count(testPath)).toBe(1)
    attr.getConnectionPathList().getExplicitItems().append(testPath)
    expect(attr.getConnectionPathList().getExplicitItems().count(testPath)).toBe(1)

    // modifying connection paths via info API (disallowed)
    expect(() => attr.setInfo('connectionPaths', new ListOp<string>())).toThrow()
    expect(() => attr.clearInfo('connectionPaths')).toThrow()

    // adding variant-selection connection path: error expected
    const varSelPath = '/Variant{vset=vsel}Is/Not/Allowed'
    const connectionPathListEditor = attr.getConnectionPathList().getExplicitItems()
    expect(() => connectionPathListEditor.append(varSelPath)).toThrow()

    // changing paths for connection paths'
    const testPath_shlep = abs('shlep.foo', primPath())
    attr.getConnectionPathList().getExplicitItems().assign([testPath1, testPath2])
    attr.getConnectionPathList().replaceItemEdits(testPath1, testPath_shlep)
    expect(attr.getConnectionPathList().getExplicitItems().toArray())
      .toEqual([testPath_shlep, testPath2])

    attr.getConnectionPathList().clearEditsAndMakeExplicit()
    expect(attr.getConnectionPathList().isExplicit()).toBe(true)
    expect(attr.getConnectionPathList().getExplicitItems().size()).toBe(0)
    expect(attr.getConnectionPathList().getAddedItems().size()).toBe(0)
    expect(attr.getConnectionPathList().getDeletedItems().size()).toBe(0)
    expect(attr.getConnectionPathList().getOrderedItems().size()).toBe(0)

    attr.getConnectionPathList().clearEdits()
    expect(attr.getConnectionPathList().isExplicit()).toBe(false)
    expect(attr.getConnectionPathList().getExplicitItems().size()).toBe(0)
    expect(attr.getConnectionPathList().getAddedItems().size()).toBe(0)
    expect(attr.getConnectionPathList().getDeletedItems().size()).toBe(0)
    expect(attr.getConnectionPathList().getOrderedItems().size()).toBe(0)

    const testPath3 = abs('test3.foo', primPath())
    const testPath4 = abs('test4.foo', primPath())
    const testPath_shlep2 = abs('shlep2.foo', primPath())

    attr.getConnectionPathList().getAddedItems().assign([testPath1, testPath2])
    attr.getConnectionPathList().getDeletedItems().assign([testPath3, testPath4])
    attr.getConnectionPathList().getOrderedItems().assign([testPath2, testPath1])

    attr.getConnectionPathList().replaceItemEdits(testPath2, testPath_shlep)
    attr.getConnectionPathList().replaceItemEdits(testPath3, testPath_shlep2)
    expect(attr.getConnectionPathList().getAddedItems().toArray())
      .toEqual([testPath1, testPath_shlep])
    expect(attr.getConnectionPathList().getDeletedItems().toArray())
      .toEqual([testPath_shlep2, testPath4])
    expect(attr.getConnectionPathList().getOrderedItems().toArray())
      .toEqual([testPath_shlep, testPath1])

    attr.getConnectionPathList().clearEdits()
    expect(attr.getConnectionPathList().isExplicit()).toBe(false)
    expect(attr.getConnectionPathList().getExplicitItems().size()).toBe(0)
    expect(attr.getConnectionPathList().getAddedItems().size()).toBe(0)
    expect(attr.getConnectionPathList().getDeletedItems().size()).toBe(0)
    expect(attr.getConnectionPathList().getOrderedItems().size()).toBe(0)

    // removing connection paths via the list editor's RemoveItemEdits API
    attr.getConnectionPathList().getExplicitItems().assign([testPath1, testPath2])
    attr.getConnectionPathList().removeItemEdits(testPath2)
    expect(attr.getConnectionPathList().getExplicitItems().toArray()).toEqual([testPath1])

    attr.getConnectionPathList().clearEdits()

    attr.getConnectionPathList().getAddedItems().assign([testPath1, testPath2])
    attr.getConnectionPathList().getDeletedItems().assign([testPath1, testPath2])
    attr.getConnectionPathList().getOrderedItems().assign([testPath1, testPath2])

    attr.getConnectionPathList().removeItemEdits(testPath1)
    expect(attr.getConnectionPathList().getAddedItems().toArray()).toEqual([testPath2])
    expect(attr.getConnectionPathList().getDeletedItems().toArray()).toEqual([testPath2])
    expect(attr.getConnectionPathList().getOrderedItems().toArray()).toEqual([testPath2])

    attr.getConnectionPathList().clearEdits()
  })

  it('test_Path', () => {
    const layer = CreateAnonymous()
    const prim = PrimSpec.new(layer, 'test', 'def', 'bogus_type')!
    const attr = AttributeSpec.new(prim, 'numCrvs', ValueTypeNames.Int)!
    expect(attr.getPath().pathString)
      .toBe(SdfPath.fromString('/' + prim.getName() + '.' + attr.getName()).pathString)
    expect(prim.getAttributeAtPath(
      SdfPath.fromString('.' + attr.getName()))?.equals(attr)).toBe(true)
    expect(prim.getObjectAtPath(
      SdfPath.fromString('.' + attr.getName()))?.equals(attr)).toBe(true)
    expect(layer.getAttributeAtPath(attr.getPath())?.equals(attr)).toBe(true)
    expect(layer.getObjectAtPath(attr.getPath())?.equals(attr)).toBe(true)
    // Try a bad path... access a relational attribute of an attribute!
    expect(prim.getAttributeAtPath(
      SdfPath.fromString('.' + attr.getName() + '[targ].attr'))).toBeUndefined()

    // dormant object path, for code coverage
    prim.getProperties().erase(attr.getName())
    expect(attr.expired).toBe(true)
  })

  it('test_Inertness', () => {
    // Test attribute-specific 'IsInert()' and 'hasOnlyRequiredFields'
    // behavior.
    //
    // Having any connections render the spec non-inert and having more than
    // only required fields. This is important due to the 'remove if inert'
    // cleanup step that automatically runs after any call to ClearInfo.

    const layer = CreateAnonymous()
    const prim = PrimSpec.new(layer, 'test', 'def', 'bogus_type')!
    const attr = AttributeSpec.new(prim, 'testAttr', ValueTypeNames.Int)!
    expect(attr).toBeTruthy()
    expect(attr.isInert()).toBe(false)
    expect(attr.hasOnlyRequiredFields()).toBe(true)
    attr.getConnectionPathList().getExplicitItems().append('/connection.path')
    expect(attr.isInert()).toBe(false)
    expect(attr.hasOnlyRequiredFields()).toBe(false)

    attr.getConnectionPathList().clearEdits()
    expect(attr.getConnectionPathList().getExplicitItems().size()).toBe(0)
    expect(attr.isInert()).toBe(false)
    expect(attr.hasOnlyRequiredFields()).toBe(true)
  })

  it('test_TimeSamples', () => {
    // Test interaction with time samples on an attribute
    const timeSamplesLayer = CreateAnonymous()
    timeSamplesLayer.importFromString(
`#usda 1.0
def Scope "Scope"
{
    custom double empty = 0
    double empty.timeSamples = {
    }
    custom double radius = 1.0
    double radius.timeSamples = {
        1.23: 5,
        3.23: 10,
        6: 5,
    }
    custom string desc = ""
    string desc.timeSamples = {
        1.23: "foo",
        3.23: "bar",
        6: "baz",
    }
}
`)
    expect(timeSamplesLayer).toBeTruthy()
    const prim = timeSamplesLayer.getPrimAtPath('/Scope')!
    expect(prim).toBeTruthy()
    // SdfTimeSampleMap values are ordered (time, value) pairs.
    expect(prim.getAttributes().get('empty')!.getInfo('timeSamples')).toEqual([])
    expect(prim.getAttributes().get('radius')!.getInfo('timeSamples'))
      .toEqual([[1.23, 5], [3.23, 10], [6, 5]])
    expect(prim.getAttributes().get('desc')!.getInfo('timeSamples'))
      .toEqual([[1.23, 'foo'], [3.23, 'bar'], [6, 'baz']])

    prim.getAttributes().get('radius')!.setTimeSample(4.0, 2.0)
    expect(prim.getAttributes().get('radius')!.queryTimeSample(4.0)).toBe(2.0)

    prim.getAttributes().get('desc')!.setTimeSample(10, 'boom')
    expect(prim.getAttributes().get('desc')!.getNumTimeSamples()).toBe(4)
    expect(prim.getAttributes().get('desc')!.listTimeSamples()).toEqual([1.23, 3.23, 6, 10])
    eraseTimeSample(prim.getAttributes().get('desc')!, 10)
    expect(prim.getAttributes().get('desc')!.getNumTimeSamples()).toBe(3)
    // (True, 1.23, 3.23)
    expect(prim.getAttributes().get('desc')!.getBracketingTimeSamples(2.0)).toEqual([1.23, 3.23])
  })

  it('test_Spline', () => {
    const splineLayer = CreateAnonymous()
    splineLayer.importFromString(
`#usda 1.0
def Xform "Prim"
{
    double a.spline = {
        1: 5; post held,
        2: 18; post held,
    }
    double a2
    float b.spline = {
        1: 10; post held,
    }
    double c.timeSamples = {
        6: 5,
    }
    int e
}
`)
    // Test HasSpline, GetSpline, SetSpline and ClearSpline works on
    // compatible types
    expect(splineLayer).toBeTruthy()
    const a = splineLayer.getAttributeAtPath('/Prim.a')!
    const splineA = a.getSpline() as TsSpline
    expect(splineA).toBeTruthy()
    expect(a.hasInfo('spline')).toBe(true)
    expect(a.hasSpline()).toBe(true)
    expect(splineA.IsEmpty()).toBe(false)
    expect(splineA.getKnots().length).toBe(2)
    expect(splineA.GetValueTypeName()).toBe('double')
    expect(a.getTypeName()!.cppTypeName).toBe('double')
    const a2 = splineLayer.getAttributeAtPath('/Prim.a2')!
    expect(a2).toBeTruthy()
    expect(a2.hasInfo('spline')).toBe(false)
    expect(a2.hasSpline()).toBe(false)
    expect((a2.getSpline() as TsSpline).IsEmpty()).toBe(true)
    a2.setSpline(splineA)
    const splineA2 = a2.getSpline() as TsSpline
    expect(splineA2).toBeTruthy()
    expect(a2.hasInfo('spline')).toBe(true)
    expect(a2.hasSpline()).toBe(true)
    expect(splineA2.IsEmpty()).toBe(false)
    expect(splineA2.getKnots().length).toBe(2)
    const b = splineLayer.getAttributeAtPath('/Prim.b')!
    const splineB = b.getSpline() as TsSpline
    expect(splineB).toBeTruthy()
    expect(b.hasInfo('spline')).toBe(true)
    expect(b.hasSpline()).toBe(true)
    expect(splineB.IsEmpty()).toBe(false)
    expect(splineB.getKnots().length).toBe(1)
    expect(splineB.GetValueTypeName()).toBe('float')
    expect(b.getTypeName()!.cppTypeName).toBe('float')
    a.clearSpline()
    b.clearSpline()
    expect(a.hasInfo('spline')).toBe(false)
    expect(a.hasSpline()).toBe(false)
    expect(b.hasInfo('spline')).toBe(false)
    expect(b.hasSpline()).toBe(false)

    // Test that SetSpline results in a coding error when trying to set a
    // float spline on a double attribute.
    expect(a.getTypeName()!.cppTypeName).toBe('double')
    expect(() => a.setSpline(splineB)).toThrow()
    // No spline gets set on a
    expect(a.hasInfo('spline')).toBe(false)
    expect(a.hasSpline()).toBe(false)

    // Test that HasInfo returns false when spline is not set, yet GetSpline
    // returns an empty spline.
    const c = splineLayer.getAttributeAtPath('/Prim.c')!
    expect(c).toBeTruthy()
    expect(c.hasInfo('spline')).toBe(false)
    expect(c.hasSpline()).toBe(false)
    expect((c.getSpline() as TsSpline).IsEmpty()).toBe(true)

    // Test that SetSpline results in a coding error when trying to set a
    // spline on an attribute that doesn't support splines.
    const e = splineLayer.getAttributeAtPath('/Prim.e')!
    expect(TsSpline.isSupportedValueType(e.getTypeName()!.type)).toBe(false)
    expect(e.hasInfo('spline')).toBe(false)
    expect(e.hasSpline()).toBe(false)
    expect(() => e.setSpline(splineA)).toThrow()
    // No spline was set on e
    expect(e.hasInfo('spline')).toBe(false)
    expect(e.hasSpline()).toBe(false)
  })

  it('test_SplineRoundTrip', async () => {
    const layer = CreateAnonymous()
    layer.importFromString(
`#usda 1.0
def Xform "Prim"
{
    double a.spline = {
        1: 5; post held,
        2: 18; post held,
    }
    float b.spline = {
        1: 10; post held,
    }
    double c.spline = {
        pre: loop repeat(5),
        post: loop repeat
    }
    double d.spline = {
        pre: loop oscillate(5),
        post: loop reset(5),
        5: 5.5; post held,
        6: 6.0; post held,
    }
}
`)
    const a = layer.getAttributeAtPath('/Prim.a')!.getSpline()
    const b = layer.getAttributeAtPath('/Prim.b')!.getSpline()
    const c = layer.getAttributeAtPath('/Prim.c')!.getSpline()
    const d = layer.getAttributeAtPath('/Prim.d')!.getSpline()

    // Export to file & string, open and compare. (Upstream writes into the
    // test's working directory.)
    const fname = join(mkdtempSync(join(tmpdir(), 'testSdfAttribute-')),
      'testSdfAttributeArrayEditAuthoring.' + extension)
    await layer.export(fname)

    const fileLayer = (await Layer.findOrOpen(fname))!
    expect(fileLayer).toBeTruthy()

    const strLayer = CreateAnonymous()
    expect(strLayer.importFromString(layer.exportToString())).toBe(true)

    expect(valuesEqual(
      fileLayer.getAttributeAtPath('/Prim.a')!.getSpline(), a)).toBe(true)
    expect(valuesEqual(
      fileLayer.getAttributeAtPath('/Prim.b')!.getSpline(), b)).toBe(true)
    expect(valuesEqual(
      fileLayer.getAttributeAtPath('/Prim.c')!.getSpline(), c)).toBe(true)
    expect(valuesEqual(
      fileLayer.getAttributeAtPath('/Prim.d')!.getSpline(), d)).toBe(true)
  })

  it('test_Limits', () => {
    // Exercise basic API for the limits metadata field
    const layer = CreateAnonymous()
    layer.importFromString(
`#usda 1.0
def Sphere "Foo"
{
    double radius (
        limits = {
            dictionary "hard" = {
                double minimum = 0.0
                double maximum = 10.0
                string foo = "bar"
            }
        }
    )
}
`)

    const spec = layer.getAttributeAtPath('/Foo.radius')!

    // Check initial value
    const myLimits: Record<string, Record<string, unknown>> = {
      hard: {
        minimum: 0.0,
        maximum: 10.0,
        foo: 'bar',
      },
    }

    expect(spec.hasLimits()).toBe(true)
    expect(spec.getLimits()).toEqual(myLimits)

    // Modify
    myLimits['hard']!['minimumValue'] = 5.5
    myLimits['hard']!['foo'] = 'baz'

    spec.setLimits(myLimits)
    expect(spec.hasLimits()).toBe(true)
    expect(spec.getLimits()).toEqual(myLimits)

    // Clear
    spec.clearLimits()
    expect(spec.hasLimits()).toBe(false)
    expect(spec.getLimits()).toEqual({})
  })

  it('test_OpaqueNoAuthoredDefault', () => {
    // Attempting to set the default value of an opaque attribute should fail.
    const layer = CreateAnonymous()
    const prim = PrimSpec.new(layer, 'Test', 'def', 'TestType')!
    const attr = AttributeSpec.new(prim, 'Attr', ValueTypeNames.Opaque)!
    expect(attr.getDefaultValue()).toBeUndefined()
    const opaqueValue = new OpaqueValue()
    expect(() => attr.setDefaultValue(opaqueValue)).toThrow()
    expect(attr.getDefaultValue()).toBeUndefined()
  })

  it('test_GroupNoAuthoredDefault', () => {
    // Attempting to set the default value of a group attribute should fail.
    const layer = CreateAnonymous()
    const prim = PrimSpec.new(layer, 'Test', 'def', 'TestType')!
    const attr = AttributeSpec.new(prim, 'Attr', ValueTypeNames.Group)!
    expect(attr.getDefaultValue()).toBeUndefined()
    const opaqueValue = new OpaqueValue()
    expect(() => attr.setDefaultValue(opaqueValue)).toThrow()
    expect(attr.getDefaultValue()).toBeUndefined()
  })

  it('test_ArrayEditAuthoring', async () => {
    // Test authoring array edit values.
    const layer = CreateAnonymous()

    const prim = sdfCreatePrimInLayer(layer, '/prim')!

    const ia = AttributeSpec.new(prim, 'ia', ValueTypeNames.IntArray)!
    const fa = AttributeSpec.new(prim, 'fa', ValueTypeNames.FloatArray)!
    const sa = AttributeSpec.new(prim, 'sa', ValueTypeNames.StringArray)!
    const aa = AttributeSpec.new(prim, 'aa', ValueTypeNames.AssetArray)!
    const p3fa = AttributeSpec.new(prim, 'p3fa', ValueTypeNames.Point3fArray)!

    // Create values.
    const iaDefault = (new VtArrayEditBuilder<number>()
      .append(123)
      .insertRef(0, -1)
      .setSize(1024)
      .finalizeAndReset())
    // Vt.FloatArrayEditBuilder holds float literals; the TS builder is
    // untyped, so the literals are narrowed to float here.
    const faDefault = (new VtArrayEditBuilder<number>()
      .append(Math.fround(1.23))
      .insertRef(-1, -2)
      .setSize(99)
      .finalizeAndReset())
    const saDefault = (new VtArrayEditBuilder<string>()
      .append('123')
      .insertRef(-2, 0)
      .minSize(999, 'fill')
      .finalizeAndReset())
    const aaDefault = (new VtArrayEditBuilder<AssetPath>()
      .append(new AssetPath('woody'))
      .prepend(new AssetPath('buzz'))
      .maxSize(3)
      .finalizeAndReset())
    const p3faDefault = (new VtArrayEditBuilder<Vec3f>()
      .append(new Vec3f(1, 2, 3))
      .insert(new Vec3f(2, 3, 4), 1)
      .setSize(2048, new Vec3f(7, 7, 7))
      .finalizeAndReset())

    // Author defaults.
    ia.setDefaultValue(iaDefault)
    fa.setDefaultValue(faDefault)
    sa.setDefaultValue(saDefault)
    aa.setDefaultValue(aaDefault)
    p3fa.setDefaultValue(p3faDefault)

    // Author time samples.
    const iaSample = new VtArrayEditBuilder<number>().prepend(123).finalizeAndReset()
    const faSample = new VtArrayEditBuilder<number>().insert(
      Math.fround(1.23), 0).finalizeAndReset()
    const saSample = new VtArrayEditBuilder<string>().minSize(
      123, '123').finalizeAndReset()
    const aaSample = new VtArrayEditBuilder<AssetPath>().prepend(
      new AssetPath('123')).finalizeAndReset()
    const p3faSample = new VtArrayEditBuilder<Vec3f>().prepend(
      new Vec3f(1, 2, 3)).finalizeAndReset()

    ia.setTimeSample(1.0, iaSample)
    fa.setTimeSample(1.0, faSample)
    sa.setTimeSample(1.0, saSample)
    aa.setTimeSample(1.0, aaSample)
    p3fa.setTimeSample(1.0, p3faSample)

    // Check that authoring didn't modify the values.
    const check = (a: VtArrayEdit<unknown> | unknown, b: unknown, what: string): void => {
      expect(valuesEqual(a, b), what).toBe(true)
    }
    check(iaDefault, ia.getDefaultValue(), 'ia.default')
    check(faDefault, fa.getDefaultValue(), 'fa.default')
    check(saDefault, sa.getDefaultValue(), 'sa.default')
    check(aaDefault, aa.getDefaultValue(), 'aa.default')
    check(p3faDefault, p3fa.getDefaultValue(), 'p3fa.default')

    check(iaSample, ia.queryTimeSample(1.0), 'ia sample')
    check(faSample, fa.queryTimeSample(1.0), 'fa sample')
    check(saSample, sa.queryTimeSample(1.0), 'sa sample')
    check(aaSample, aa.queryTimeSample(1.0), 'aa sample')
    check(p3faSample, p3fa.queryTimeSample(1.0), 'p3fa sample')

    // Export to file & string, open and compare. (Upstream writes into the
    // test's working directory.)
    const fname = join(mkdtempSync(join(tmpdir(), 'testSdfAttribute-')),
      'testSdfAttributeArrayEditAuthoring.' + extension)
    await layer.export(fname)

    const fileLayer = (await Layer.findOrOpen(fname))!
    expect(fileLayer).toBeTruthy()

    const strLayer = CreateAnonymous()
    expect(strLayer.importFromString(layer.exportToString())).toBe(true)

    check(
      fileLayer.getAttributeAtPath('/prim.ia')!.getDefaultValue(),
      ia.getDefaultValue(), 'file ia.default')
    check(
      fileLayer.getAttributeAtPath('/prim.fa')!.getDefaultValue(),
      fa.getDefaultValue(), 'file fa.default')
    check(
      fileLayer.getAttributeAtPath('/prim.sa')!.getDefaultValue(),
      sa.getDefaultValue(), 'file sa.default')
    check(
      fileLayer.getAttributeAtPath('/prim.aa')!.getDefaultValue(),
      aa.getDefaultValue(), 'file aa.default')
    check(
      fileLayer.getAttributeAtPath('/prim.p3fa')!.getDefaultValue(),
      p3fa.getDefaultValue(), 'file p3fa.default')

    check(
      fileLayer.getAttributeAtPath('/prim.ia')!.queryTimeSample(1.0),
      ia.queryTimeSample(1.0), 'file ia sample')
    check(
      fileLayer.getAttributeAtPath('/prim.fa')!.queryTimeSample(1.0),
      fa.queryTimeSample(1.0), 'file fa sample')
    check(
      fileLayer.getAttributeAtPath('/prim.sa')!.queryTimeSample(1.0),
      sa.queryTimeSample(1.0), 'file sa sample')
    check(
      fileLayer.getAttributeAtPath('/prim.aa')!.queryTimeSample(1.0),
      aa.queryTimeSample(1.0), 'file aa sample')
    check(
      fileLayer.getAttributeAtPath('/prim.p3fa')!.queryTimeSample(1.0),
      p3fa.queryTimeSample(1.0), 'file p3fa sample')

    check(
      strLayer.getAttributeAtPath('/prim.ia')!.getDefaultValue(),
      ia.getDefaultValue(), 'str ia.default')
    check(
      strLayer.getAttributeAtPath('/prim.fa')!.getDefaultValue(),
      fa.getDefaultValue(), 'str fa.default')
    check(
      strLayer.getAttributeAtPath('/prim.sa')!.getDefaultValue(),
      sa.getDefaultValue(), 'str sa.default')
    check(
      strLayer.getAttributeAtPath('/prim.aa')!.getDefaultValue(),
      aa.getDefaultValue(), 'str aa.default')
    check(
      strLayer.getAttributeAtPath('/prim.p3fa')!.getDefaultValue(),
      p3fa.getDefaultValue(), 'str p3fa.default')

    check(
      strLayer.getAttributeAtPath('/prim.ia')!.queryTimeSample(1.0),
      ia.queryTimeSample(1.0), 'str ia sample')
    check(
      strLayer.getAttributeAtPath('/prim.fa')!.queryTimeSample(1.0),
      fa.queryTimeSample(1.0), 'str fa sample')
    check(
      strLayer.getAttributeAtPath('/prim.sa')!.queryTimeSample(1.0),
      sa.queryTimeSample(1.0), 'str sa sample')
    check(
      strLayer.getAttributeAtPath('/prim.aa')!.queryTimeSample(1.0),
      aa.queryTimeSample(1.0), 'str aa sample')
    check(
      strLayer.getAttributeAtPath('/prim.p3fa')!.queryTimeSample(1.0),
      p3fa.queryTimeSample(1.0), 'str p3fa sample')
  })
})
