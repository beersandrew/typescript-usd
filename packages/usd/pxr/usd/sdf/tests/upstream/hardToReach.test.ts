// Ported from OpenUSD 26.11.1: pxr/usd/sdf/changeList.cpp,
//  pxr/usd/sdf/testenv/testSdfHardToReach.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfHardToReach.cpp (OpenUSD 26.11.1).
// One it() per upstream function, in main()'s order (:1072-1093).
//
// _CompareChangeLists (:65-74) compares the two lists' operator<< text;
// here SdfChangeList.toString (changeList.cpp:30-110), plus the entries'
// info values compared as values. An empty VtValue is undefined; the
// specifier enum is its token. A VtValue(0) for `custom` is the bool false
// the diff carries (both stream as 0 upstream).
//
// Not ported (no TypeScript counterpart):
// - _TestSdfMapEditorProxyOperators' comparison operators (:804-845): C++
//   operator overloads of SdfMapEditProxy against std::map; only the proxies'
//   validity is checked.
// - _TestSdfAbstractDataValue (:847-906): SdfAbstractDataTypedValue<T> stores
//   through a typed C++ pointer; the TS data API returns values instead.
// - SetTimeSample<float> conversions (:378-392): TypeScript has one number
//   type, so the float/double distinction is checked only as values.
import { describe, expect, it } from 'vitest'
import {
  Layer, AttributeSpec, RelationshipSpec, sdfCreatePrimInLayer, Notice as SdfNotice,
} from 'typescript-usd/sdf'
import { Notice as TfNotice } from 'typescript-usd/tf'
import { SdfPath, sdfPathFindLongestPrefix, sdfPathFindLongestStrictPrefix } from '../../src/path.ts'
import { SdfChangeList } from '../../src/changeList.ts'
import { Sdf_ChangeManager, sdfChangeBlock } from '../../src/changeManager.ts'
import { SdfSchema } from '../../src/schema.ts'
import { SdfPayload, SdfReference } from '../../src/reference.ts'
import { sdfQuoteAssetPath, sdfQuoteString } from '../../src/textParserUtils.ts'
import { quoteString } from '../../src/usdaFileFormat.ts'
import { SdfListOp } from '../../src/listOp.ts'
import { SdfPathExpression } from '../../src/pathExpression.ts'
import { sdfComposeTimeSampleMaps } from '../../src/composeTimeSampleSeries.ts'
import { Background as VtBackground, Value as VtValue, ValueComposeOver as VtValueComposeOver } from 'typescript-usd/vt'
import { Type as TfType } from 'typescript-usd/tf'

const P = (s: string) => SdfPath.fromString(s)

// _CreateLayerDiffTestLayers (:29-63).
function createLayerDiffTestLayers(): [Layer, Layer] {
  const actualLayer = Layer.createAnonymous()
  actualLayer.importFromString(`#usda 1.0
            over "a"{}
            def "b"{}
            over "c"{
                int propC = 1
            }
            def "r" {
                int propR = 1
            }
            def "p" {
                int propP = 1
            }
            `)
  const diffLayer = Layer.createAnonymous()
  diffLayer.importFromString(`#usda 1.0
            def "z"{}
            def "b"{}
            over "c"{
                int propC = 2
            }
            def "n" {
                int propN = 1
            }
            def "p" {}
    `)
  return [actualLayer, diffLayer]
}

function compareChangeLists(expected: SdfChangeList, actual: SdfChangeList) {
  expect(actual.toString()).toBe(expected.toString())
  const infos = (cl: SdfChangeList) => cl.getEntryList().map(([path, entry]) =>
    [path.pathString, [...entry.infoChanged]])
  expect(infos(actual)).toEqual(infos(expected))
}

// Copy the layer so we can verify it does not change during the operation.
function diffKeepingLayer(actualLayer: Layer, diffLayer: Layer, compareFieldValues: boolean) {
  const expectedLayer = Layer.createAnonymous()
  expectedLayer.transferContent(actualLayer)
  const expectedLayerStr = expectedLayer.exportToString()
  const actualCl = actualLayer.createDiff(diffLayer, compareFieldValues)
  expect(expectedLayer.exportToString()).toBe(expectedLayerStr)
  return actualCl
}

// _CreateTimeSampleLayerDiffTestLayers (:162-196).
function createTimeSampleLayerDiffTestLayers(): [Layer, Layer] {
  const layerA = Layer.createAnonymous()
  layerA.importFromString(`#usda 1.0
            def Sphere "PixarBall"
            {
                double radius = 100
                double radius.timeSamples = {
                    1: 100,
                    24: 500,
                }
            }
        `)
  const layerB = Layer.createAnonymous()
  layerB.importFromString(`#usda 1.0
            def Sphere "PixarBall"
            {
                double radius = 100
                double radius.timeSamples = {
                    1: 50,
                    48: 1000,
                }
            }
        `)
  return [layerA, layerB]
}

describe('testSdfHardToReach', () => {
  it('_TestSdfChangeManagerExtractLocalChanges', () => {
    const testLayer = Layer.createAnonymous()
    let invocations = 0
    const key = TfNotice.Register(SdfNotice.LayersDidChange, () => { invocations += 1 })
    try {
      // This block should trigger an invocation of the listener.
      sdfChangeBlock(() => { sdfCreatePrimInLayer(testLayer, P('/test1')) })
      expect(invocations).toBe(1)
      // No additional invocation once the block goes out of scope, because
      // the changes for the layer have been extracted.
      sdfChangeBlock(() => {
        sdfCreatePrimInLayer(testLayer, P('/test2'))
        const changes = Sdf_ChangeManager.get().extractLocalChanges(testLayer)
        expect(changes.length).toBeGreaterThan(0)
      })
      expect(invocations).toBe(1)
    } finally {
      key.revoke()
    }
  })

  it('_TestSdfLayerCreateDiffChangeListWithoutValues', () => {
    const [actualLayer, diffLayer] = createLayerDiffTestLayers()
    const expectedCl = new SdfChangeList()
    expectedCl.didRemoveProperty(P('/r.propR'), false)
    expectedCl.didRemovePrim(P('/r'), false)
    expectedCl.didRemoveProperty(P('/p.propP'), false)
    expectedCl.didRemovePrim(P('/a'), true)
    expectedCl.didAddPrim(P('/n'), false)
    expectedCl.didChangeInfo(P('/n'), 'specifier', 'over', 'def')
    expectedCl.didAddProperty(P('/n.propN'), false)
    expectedCl.didAddPrim(P('/z'), false)
    expectedCl.didChangeInfo(P('/z'), 'specifier', 'over', 'def')
    expectedCl.didRemoveProperty(P('/c.propC'), false)
    expectedCl.didAddProperty(P('/c.propC'), false)
    compareChangeLists(expectedCl, diffKeepingLayer(actualLayer, diffLayer, false))
  })

  it('_TestSdfLayerCreateDiffChangeListWithValues', () => {
    const [actualLayer, diffLayer] = createLayerDiffTestLayers()
    const expectedCl = new SdfChangeList()
    expectedCl.didRemoveProperty(P('/r.propR'), false)
    expectedCl.didRemovePrim(P('/r'), false)
    expectedCl.didRemoveProperty(P('/p.propP'), false)
    expectedCl.didRemovePrim(P('/a'), true)
    expectedCl.didAddPrim(P('/n'), false)
    expectedCl.didChangeInfo(P('/n'), 'specifier', 'over', 'def')
    expectedCl.didChangeInfo(P('/r.propR'), 'default', 1, undefined)
    expectedCl.didAddProperty(P('/n.propN'), true)
    expectedCl.didChangeInfo(P('/n.propN'), 'typeName', undefined, 'int')
    expectedCl.didChangeInfo(P('/n.propN'), 'default', undefined, 1)
    expectedCl.didChangeInfo(P('/n.propN'), 'custom', undefined, false)
    expectedCl.didChangeInfo(P('/n.propN'), 'variability', undefined, 'varying')
    expectedCl.didChangeInfo(P('/p.propP'), 'default', 1, undefined)
    expectedCl.didAddPrim(P('/z'), false)
    expectedCl.didChangeInfo(P('/z'), 'specifier', 'over', 'def')
    expectedCl.didChangeInfo(P('/c.propC'), 'default', 1, 2)
    compareChangeLists(expectedCl, diffKeepingLayer(actualLayer, diffLayer, true))
  })

  it('_testSdfLayerCreateDiffTimeSamplesWithValues', () => {
    const [layerA, layerB] = createTimeSampleLayerDiffTestLayers()
    const actualCl = layerA.createDiff(layerB, true)
    const [, entry] = actualCl.getEntryList().find(([p]) => p.pathString === '/PixarBall.radius')!
    expect(actualCl.getEntryList().length).toBe(1)
    expect(entry.flags.didChangeAttributeTimeSamples).toBe(true)
    const change = entry.findInfoChange('timeSamples')!
    const samples = (v: unknown) => [...(v as Iterable<[number, unknown]>)].map(([t, x]) => [t, Number(x)])
    expect(samples(change[0])).toEqual([[1, 100], [24, 500]])
    expect(samples(change[1])).toEqual([[1, 50], [48, 1000]])
  })

  it('_testSdfLayerCreateDiffTimeSamplesWithoutValues', () => {
    const [layerA, layerB] = createTimeSampleLayerDiffTestLayers()
    const expectedCl = new SdfChangeList()
    expectedCl.didRemoveProperty(P('/PixarBall.radius'), false)
    expectedCl.didAddProperty(P('/PixarBall.radius'), false)
    compareChangeLists(expectedCl, layerA.createDiff(layerB, false))
  })

  it('_TestSdfLayerCreateDiffDiffWithOver', () => {
    const layer = Layer.createAnonymous()
    const p = sdfCreatePrimInLayer(layer, P('/p'))!
    const empty = Layer.createAnonymous()
    {
      // The addition of an inert prim has no specifier info entry.
      const expectedCl = new SdfChangeList()
      expectedCl.didAddPrim(P('/p'), true)
      compareChangeLists(expectedCl, empty.createDiff(layer))
    }
    p.setField('specifier', 'def')
    {
      const expectedCl = new SdfChangeList()
      expectedCl.didAddPrim(P('/p'), false)
      expectedCl.didChangeInfo(P('/p'), 'specifier', 'over', 'def')
      compareChangeLists(expectedCl, empty.createDiff(layer))
    }
  })

  it('_TestSdfLayerDictKeyOps', () => {
    const layer = Layer.createAnonymous()
    sdfCreatePrimInLayer(layer, P('/foo'))
    // Set a key in a nested dict.
    layer.setFieldDictValueByKey('/foo', 'customData', 'hello:world', 'value')
    // Obtain the whole dict and check the key was set correctly.
    const dict = layer.getField('/foo', 'customData') as Record<string, Record<string, unknown>>
    expect(dict.hello!.world).toBe('value')
    // Get the one value through Sdf API.
    expect(layer.getFieldDictValueByKey('/foo', 'customData', 'hello:world')).toBe('value')
    // Erase the key through the Sdf API.
    layer.eraseFieldDictValueByKey('/foo', 'customData', 'hello:world')
    expect(layer.getField('/foo', 'customData')).toBeUndefined()
  })

  it('_TestSdfLayerTimeSampleValueType', () => {
    const layer = Layer.createAnonymous()
    const foo = sdfCreatePrimInLayer(layer, P('/foo'))!
    const attr = AttributeSpec.new(foo, 'attr', 'double')!
    const attrPath = attr.getPath().pathString
    layer.setAttrTimeSample('/foo', 'attr', 0.0, 1.0)
    expect(layer.queryTimeSample(attrPath, 0.0)).toBe(1.0)
    layer.setAttrTimeSample('/foo', 'attr', 1.0, 2.0)
    expect(layer.queryTimeSample(attrPath, 1.0)).toBe(2.0)
    layer.setAttrTimeSample('/foo', 'attr', 3.0, 3.0)
    expect(layer.queryTimeSample(attrPath, 3.0)).toBe(3.0)
    layer.setAttrTimeSample('/foo', 'attr', 4.0, 4.0)
    expect(layer.queryTimeSample(attrPath, 4.0)).toBe(4.0)
    // Time samples set and retrieved directly on attributes.
    attr.setTimeSample(5.0, 5.0)
    expect(attr.queryTimeSample(5.0)).toBe(5.0)
    expect(attr.getNumTimeSamples()).toBe(5)
    expect(attr.queryTimeSample(4.0)).toBe(4.0)
  })

  it('_TestSdfLayerTransferContents', () => {
    // An empty over (an inert spec) transferred is the addition of an
    // inert spec.
    const fooPath = P('/Foo')
    const srcLayer = Layer.createAnonymous()
    sdfCreatePrimInLayer(srcLayer, fooPath)
    let changeListVec: [Layer, SdfChangeList][] = []
    const key = TfNotice.Register(SdfNotice.LayersDidChange, (n: SdfNotice.LayersDidChange) => {
      changeListVec = n.getChangeListVec() as [Layer, SdfChangeList][]
    })
    try {
      const dstLayer = Layer.createAnonymous()
      dstLayer.transferContent(srcLayer)
      const found = changeListVec.find(([layer]) => layer === dstLayer)
      expect(found).toBeTruthy()
      const entry = found![1].findEntry(fooPath)
      expect(entry).toBeTruthy()
      expect(entry!.flags.didAddInertPrim).toBe(true)
    } finally {
      key.revoke()
    }
  })

  it('_TestSdfLayerTransferContentsEmptyLayer', () => {
    const srcLayer = Layer.createAnonymous()
    srcLayer.importFromString(`#usda 1.0
    def "Root"{
        def "Node1" (
            prepend variantSets = "testVariants"
            variants = { string testVariants = "option1" }
        )
        {
            variantSet "testVariants" = {
                "option1" {
                    def "VariantChild" {}
                }
            }
            def "Node1Child" {}
        }
    }`)
    expect(srcLayer.isEmpty()).toBe(false)
    srcLayer.transferContent(Layer.createAnonymous())
    expect(srcLayer.isEmpty()).toBe(true)
  })

  it('_TestSdfRelationshipTargetSpecEdits', () => {
    const layer = Layer.createAnonymous()
    const prim = sdfCreatePrimInLayer(layer, P('/Foo'))!
    const rel = RelationshipSpec.new(prim, 'rel')!
    rel.getTargetPathList().prepend('/Target')
    expect(layer.getObjectAtPath(P('/Foo.rel[/Target]'))).toBeTruthy()
    // Bug 153466: removing the path from only one list removes the spec.
    rel.getTargetPathList().append('/Target')
    expect(layer.getObjectAtPath(P('/Foo.rel[/Target]'))).toBeTruthy()
    rel.getTargetPathList().getAppendedItems().clear()
    expect(layer.getObjectAtPath(P('/Foo.rel[/Target]'))).toBeFalsy()
  })

  it('_TestSdfPathFindLongestPrefix', () => {
    const paths = ['/', '/foo', '/foo/bar/baz', '/bar/foo', '/bar/baz', '/qux'].map(P)
    paths.sort(SdfPath.compare)
    const longest = (p: string) => paths[sdfPathFindLongestPrefix(paths, P(p))]!.pathString
    const strict = (p: string) => paths[sdfPathFindLongestStrictPrefix(paths, P(p))]!.pathString
    // The std::vector, std::set and std::map forms (:530-608) search the same
    // sorted sequence.
    expect(longest('/foo/bar/baz/qux')).toBe('/foo/bar/baz')
    expect(longest('/foo/baz/baz/qux')).toBe('/foo')
    expect(longest('/bar/foo')).toBe('/bar/foo')
    expect(longest('/qux/foo/bar')).toBe('/qux')
    expect(longest('/qix')).toBe('/')
    expect(strict('/foo/bar/baz/qux')).toBe('/foo/bar/baz')
    expect(strict('/foo/baz/baz/qux')).toBe('/foo')
    expect(strict('/bar/foo')).toBe('/')
    expect(strict('/qux/foo/bar')).toBe('/qux')
    expect(strict('/qix')).toBe('/')
  })

  it('_TestSdfFpsAndTcps', () => {
    const layer = Layer.createAnonymous()
    let changedFields: string[] = []
    let changeListVec: [Layer, SdfChangeList][] = []
    const keys = [
      TfNotice.Register(SdfNotice.LayerInfoDidChange, (n: SdfNotice.LayerInfoDidChange) => { changedFields.push(n.key()) }, layer),
      TfNotice.Register(SdfNotice.LayersDidChangeSentPerLayer, (n: SdfNotice.LayersDidChangeSentPerLayer) => {
        changeListVec = n.getChangeListVec() as [Layer, SdfChangeList][]
      }, layer),
    ]
    const validateAndClear = (
      oldFps: number | undefined, newFps: number | undefined,
      oldTcps: number | undefined, newTcps: number | undefined,
    ) => {
      expect(layer.getFramesPerSecond()).toBe(newFps ?? 24.0)
      expect(layer.getTimeCodesPerSecond()).toBe(newTcps ?? 24.0)
      const expectedFields: string[] = []
      if (newFps !== oldFps) expectedFields.push('framesPerSecond')
      if (newTcps !== oldTcps) expectedFields.push('timeCodesPerSecond')
      expect(changedFields).toEqual(expectedFields)
      expect(changeListVec.length).toBe(1)
      const entryList = changeListVec[0]![1].getEntryList()
      expect(entryList.length).toBe(1)
      expect(entryList[0]![0].pathString).toBe('/')
      const entry = entryList[0]![1]
      const fps = entry.findInfoChange('framesPerSecond')
      if (newFps !== oldFps) expect(fps).toEqual([oldFps, newFps])
      else expect(fps).toBeUndefined()
      const tcps = entry.findInfoChange('timeCodesPerSecond')
      if (newTcps !== oldTcps) expect(tcps).toEqual([oldTcps, newTcps])
      else expect(tcps).toBeUndefined()
      changedFields = []
      changeListVec = []
    }
    try {
      expect(layer.getFramesPerSecond()).toBe(24)
      expect(layer.getTimeCodesPerSecond()).toBe(24)
      layer.setFramesPerSecond(30)
      validateAndClear(undefined, 30.0, undefined, 30.0)
      layer.setTimeCodesPerSecond(1000)
      validateAndClear(30.0, 30.0, 30.0, 1000.0)
      layer.setFramesPerSecond(48)
      validateAndClear(30.0, 48.0, 1000.0, 1000.0)
      layer.clearTimeCodesPerSecond()
      validateAndClear(48.0, 48.0, 1000.0, 48.0)
      layer.clearFramesPerSecond()
      validateAndClear(48.0, undefined, 48.0, undefined)
    } finally {
      for (const key of keys) key.revoke()
    }
  })

  it('_TestSdfSchemaPathValidation', () => {
    const ok = (a: { isAllowed(): boolean }) => a.isAllowed()
    const E = SdfPath.emptyPath
    expect(ok(SdfSchema.isValidInheritPath(P('/A')))).toBe(true)
    for (const p of [E, P('/A.a'), P('A'), P('/A{x=y}'), P('/A{x=y}B')]) {
      expect(ok(SdfSchema.isValidInheritPath(p)), p.pathString).toBe(false)
      expect(ok(SdfSchema.isValidSpecializesPath(p)), p.pathString).toBe(false)
    }
    expect(ok(SdfSchema.isValidSpecializesPath(P('/A')))).toBe(true)

    expect(ok(SdfSchema.isValidPayload(new SdfPayload('a.usda', E)))).toBe(true)
    expect(ok(SdfSchema.isValidPayload(new SdfPayload('a.usda', P('/A'))))).toBe(true)
    expect(ok(SdfSchema.isValidPayload(new SdfPayload('', P('/A'))))).toBe(true)
    expect(ok(SdfSchema.isValidReference(new SdfReference('a.usda', E)))).toBe(true)
    expect(ok(SdfSchema.isValidReference(new SdfReference('a.usda', P('/A'))))).toBe(true)
    expect(ok(SdfSchema.isValidReference(new SdfReference('', P('/A'))))).toBe(true)
    for (const p of ['/A.a', 'A', '/A{x=y}', '/A{x=y}B'].map(P)) {
      expect(ok(SdfSchema.isValidPayload(new SdfPayload('a.usda', p))), p.pathString).toBe(false)
      expect(ok(SdfSchema.isValidReference(new SdfReference('a.usda', p))), p.pathString).toBe(false)
    }

    for (const p of ['A', '/A', '/A/B'].map(P)) {
      expect(ok(SdfSchema.isValidRelocatesSourcePath(p)), p.pathString).toBe(true)
      expect(ok(SdfSchema.isValidRelocatesTargetPath(p)), p.pathString).toBe(true)
    }
    expect(ok(SdfSchema.isValidRelocatesSourcePath(E))).toBe(false)
    // The empty path is allowed for relocates targets.
    expect(ok(SdfSchema.isValidRelocatesTargetPath(E))).toBe(true)
    for (const p of ['/A.a', '/A{x=y}', '/A{x=y}B'].map(P)) {
      expect(ok(SdfSchema.isValidRelocatesSourcePath(p)), p.pathString).toBe(false)
      expect(ok(SdfSchema.isValidRelocatesTargetPath(p)), p.pathString).toBe(false)
    }
  })

  it('_TestSdfMapEditorProxyOperators (validity only)', () => {
    const layer = Layer.createAnonymous()
    const prim = sdfCreatePrimInLayer(layer, P('/Test'))!
    expect(prim.getVariantSelections().isValid()).toBe(true)
  })

  it('_TestSdfQuoteUtilities', () => {
    expect(sdfQuoteString('\n')).toBe('"""\n"""')
    expect(sdfQuoteString('foo')).toBe('"foo"')
    expect(sdfQuoteString('foo\t')).toBe('"foo\\t"')
    expect(sdfQuoteString('"doubled"')).toBe('\'"doubled"\'')
    expect(sdfQuoteAssetPath('/path/foo')).toBe('@/path/foo@')
    expect(sdfQuoteAssetPath('atted@path')).toBe('@@@atted@path@@@')
    expect(sdfQuoteAssetPath('a@@@p')).toBe('@@@a\\@@@p@@@')
  })

  it('_TestSdfFileIOQuote', () => {
    // Sdf_FileIOUtility::Quote is quoteString.
    expect(quoteString('hello world')).toBe('"hello world"')
    expect(quoteString('hello\nworld')).toBe('"""hello\nworld"""')
    expect(quoteString('hello\nworld', false)).toBe('"hello\\nworld"')
    expect(quoteString('hello "world"')).toBe('\'hello "world"\'')
    expect(quoteString('hello\n"world"')).toBe('\'\'\'hello\n"world"\'\'\'')
    expect(quoteString('hello\n"world"', false)).toBe('\'hello\\n"world"\'')
  })

  // listOp.cpp:83-131 registers the list op compose-over functions.
  it('_TestSdfListOpVtValueComposeOver', () => {
    const intListOp = TfType.findByName('SdfIntListOp')
    const v = (op: SdfListOp<number>) => VtValue.create(op, intListOp)
    const exp123 = new SdfListOp<number>(); exp123.setExplicitItems([1, 2, 3])
    const append9 = new SdfListOp<number>(); append9.setAppendedItems([9])
    const prepend0 = new SdfListOp<number>(); prepend0.setPrependedItems([0])
    const delete2 = new SdfListOp<number>(); delete2.setDeletedItems([2])
    const composedVal = VtValueComposeOver(v(delete2), VtValueComposeOver(v(prepend0), v(append9)))
    const composed = composedVal.Get<SdfListOp<number>>()
    expect(composed.isExplicit()).toBe(false)
    const overBG = VtValueComposeOver(composedVal, VtValue.create(VtBackground, TfType.findByName('VtBackgroundType')))
      .Get<SdfListOp<number>>()
    expect(overBG.isExplicit()).toBe(true)
    expect(overBG.getExplicitItems()).toEqual([0, 9])
    const overExp = VtValueComposeOver(composedVal, v(exp123)).Get<SdfListOp<number>>()
    expect(overExp.isExplicit()).toBe(true)
    expect(overExp.getExplicitItems()).toEqual([0, 1, 3, 9])
    const added7 = new SdfListOp<number>(); added7.setAddedItems([7])
    expect(VtValueComposeOver(v(added7), v(exp123)).Get<SdfListOp<number>>().getAddedItems()).toEqual([7])
  })

  // ComposeOver substitutes the weaker expression as one operand, so "a %_"
  // over "c %_" prints as "a (c %_)" (pathExpression.cpp:399-454).
  it('_TestSdfComposeTimeSampleMaps', () => {
    const E = (text: string) => new SdfPathExpression(text)
    const map = (entries: [number, string][]) => new Map(entries.map(([t, x]) => [t, E(x)]))
    const check = (strong: [number, string][], weak: [number, string][], expected: [number, string][]) => {
      const composed = sdfComposeTimeSampleMaps(map(strong), map(weak))
      expect([...composed].map(([t, x]) => [t, (x as SdfPathExpression).getText()]))
        .toEqual(expected.map(([t, x]) => [t, E(x).getText()]))
    }
    // One composing sample over a non-composing sample at the same time.
    check([[2, 'a %_']], [[2, 'X']], [[2, 'a X']])
    // Earlier composing sample over a non-composing sample.
    check([[1, 'a %_']], [[2, 'X']], [[1, 'a X'], [2, 'a X']])
    // One composing sample over two non-composing samples.
    check([[2, 'a %_']], [[1, 'X'], [3, 'Y']], [[1, 'a X'], [2, 'a X'], [3, 'a Y']])
    // Two composing samples over one non-composing sample.
    check([[1, 'a %_'], [3, 'b %_']], [[2, 'X']], [[1, 'a X'], [2, 'a X'], [3, 'b X']])
    // Non-composing followed by a composing sample over a composing sample.
    check([[1, 'X'], [3, 'a %_']], [[2, 'b %_'], [3, 'c %_']], [[1, 'X'], [2, 'X'], [3, 'a (c %_)']])
  })
})
