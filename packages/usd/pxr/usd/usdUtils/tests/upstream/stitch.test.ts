// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsStitch.cpp,
//  pxr/usd/usdUtils/testenv/testUsdUtilsStitch.py
// Copyright 2017, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsStitch.py
// (registered as testUsdUtilsStitch). The testenv directory
// testUsdUtilsStitch.testenv (src/Particles_Splash.*.usd,
// src/letters_perFrame.*.usda, src/variants_*.usda) is copied unmodified
// into fixtures/testUsdUtilsStitch (Copyright 2017 Pixar, TOST 1.0
// , https://openusd.org/license). Upstream runs in a copy of that
// directory, so each test copies the fixtures into a temporary directory
// and runs there.
//
// API mapping: UsdUtils.StitchLayers is UsdUtilsStitchLayers. Sdf.Layer's
// rootPrims, nameChildren, attributes and relationships are getRootPrims(),
// getNameChildren(), getAttributes(), getRelationships(); spec.path is
// getPath(). The Python layer properties framesPerSecond, framePrecision,
// startTimeCode and endTimeCode (SdfLayer::Get..., the authored value or the
// schema fallback, never None) are read as the pseudo-root field or its
// schema fallback. GetInfo('targetPaths'/'connectionPaths') holds the list
// op value; Sdf.PathListOp / Sdf.StringListOp comparisons are SdfListOp
// equality. Tf.NamedTemporaryFile(suffix='usda') is a temporary file name
// ending in 'usda' (tempfile.mkstemp, no dot). Each test's setUp is the
// async `setUp()` below; replacing the resolver clears the layer registry,
// as Python drops each case's layers.
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { _setResolverForTest } from 'typescript-usd/ar/_internal'
import { Layer, ListOp as SdfListOp, Schema as SdfSchema } from 'typescript-usd/sdf'
import { UsdUtilsStitchLayers } from 'typescript-usd/usdUtils'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdUtilsStitch')

let cwd = ''
let scratch = ''
beforeEach(() => {
  cwd = process.cwd()
  scratch = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsStitch-'))
  cpSync(TESTENV, scratch, { recursive: true })
  process.chdir(scratch)
  _setResolverForTest(ArGetResolver())
})
afterEach(() => {
  process.chdir(cwd)
  rmSync(scratch, { recursive: true, force: true })
})

// SdfLayer::GetFramesPerSecond / GetFramePrecision / GetStartTimeCode /
// GetEndTimeCode: the authored pseudo-root field or the schema fallback.
function layerMetadata(layer: Layer, field: string): unknown {
  return layer.hasField('/', field) ? layer.getField('/', field) : SdfSchema.getInstance().getFallback(field)
}

function pathListOp(prependedItems: string[]): SdfListOp<unknown> {
  const listOp = new SdfListOp<unknown>()
  listOp.setPrependedItems(prependedItems)
  return listOp
}

function expectListOpEqual(actual: unknown, expected: SdfListOp<unknown>): void {
  const listOp = SdfListOp.fromValue<unknown>(actual)
  expect(listOp.equals(expected), `${listOp.toString()} != ${expected.toString()}`).toBe(true)
}

describe('TestUsdUtilsStitch', () => {
  let layers: Layer[] = []
  let rootprimsA: ReturnType<Layer['getRootPrims']>
  let rootprimsB: ReturnType<Layer['getRootPrims']>

  async function setUp(): Promise<void> {
    const open = async (file: string): Promise<Layer> => {
      const layer = await Layer.findOrOpen(file)
      expect(layer).toBeDefined()
      return layer!
    }
    layers = [Layer.createAnonymous(),
      await open('src/Particles_Splash.101.usd'),
      await open('src/Particles_Splash.103.usd'),
      Layer.createAnonymous(),
      await open('src/letters_perFrame.101.usda'),
      await open('src/letters_perFrame.102.usda'),
      await open('src/letters_perFrame.103.usda')]

    // stitch layers for basic tests
    UsdUtilsStitchLayers(layers[0]!, layers[1]!)
    UsdUtilsStitchLayers(layers[0]!, layers[2]!)

    rootprimsA = layers[1]!.getRootPrims()
    rootprimsB = layers[2]!.getRootPrims()

    // stitch layers for secondary tests
    UsdUtilsStitchLayers(layers[3]!, layers[4]!)
    UsdUtilsStitchLayers(layers[3]!, layers[5]!)
    UsdUtilsStitchLayers(layers[3]!, layers[6]!)
  }

  it('test_AllPrimsFullyCopied', async () => {
    await setUp()
    for (const prims of [rootprimsA, rootprimsB]) {
      for (const rootprim of prims) {
        for (const child of rootprim.getNameChildren()) {
          expect(layers[0]!.getPrimAtPath(child.getPath()),
            `Missing object at ${child.getPath().pathString}`).toBeTruthy()
        }
        for (const attr of rootprim.getAttributes()) {
          expect(layers[0]!.getAttributeAtPath(attr.getPath()),
            `Missing attribute at ${attr.getPath().pathString}`).toBeTruthy()
        }
        for (const rel of rootprim.getRelationships()) {
          expect(layers[0]!.getRelationshipAtPath(rel.getPath()),
            `Missing relationship at ${rel.getPath().pathString}`).toBeTruthy()
        }
      }
    }
  })

  it('test_AllTimeSamplesMerged', async () => {
    await setUp()
    const timesamplesA = layers[1]!.listAllTimeSamples()
    const timesamplesB = layers[2]!.listAllTimeSamples()

    // the composed layer should have the union of time samples
    expect(layers[0]!.listAllTimeSamples().length).toBe(new Set([...timesamplesA, ...timesamplesB]).size)
  })

  it('test_FrameInfoMerged', async () => {
    await setUp()
    const has = (field: string): boolean =>
      layerMetadata(layers[1]!, field) != null || layerMetadata(layers[2]!, field) != null
    const hasFps = has('framesPerSecond')
    const hasFramePrec = has('framePrecision')
    const hasEndTimeCode = has('endTimeCode')
    const hasStartTimeCode = has('startTimeCode')

    expect((hasFps && layerMetadata(layers[0]!, 'framesPerSecond') != null) || !hasFps, 'Missing fps').toBe(true)
    expect((hasFramePrec && layerMetadata(layers[0]!, 'framePrecision') != null) || !hasFramePrec,
      'Missing fps').toBe(true)
    expect((hasStartTimeCode && layerMetadata(layers[0]!, 'startTimeCode') != null) || !hasStartTimeCode,
      'Missing fps').toBe(true)
    expect((hasEndTimeCode && layerMetadata(layers[0]!, 'endTimeCode') != null) || !hasEndTimeCode,
      'Missing fps').toBe(true)
  })

  // The temporary file's name ends in 'usda' with no dot, so
  // SdfLayer::Export falls back to the layer's own file format
  // (layer.cpp:5241-5257).
  it('test_ValidFileCreation', async () => {
    await setUp()
    const tempUsd = path.join(scratch, `tmp${process.pid}usda`)
    expect(await layers[0]!.export(tempUsd)).toBe(true)
  })

  it('test_TargetPathCopy', async () => {
    await setUp()
    const relPath = '/World/fx/Letters/points.prototypes'
    const rel = layers[3]!.getRelationshipAtPath(relPath)
    expect(rel, 'Relationship not stitched').toBeTruthy()

    const expectedTargets = pathListOp([
      '/World/fx/Letters/points/Prototypes/obj/proto_2',
      '/World/fx/Letters/points/Prototypes/obj/proto_3',
      '/World/fx/Letters/points/Prototypes/obj/proto_1',
      '/World/fx/Letters/points/Prototypes/obj/proto_4',
    ])
    expectListOpEqual(rel!.getInfo('targetPaths'), expectedTargets)
  })

  it('test_ConnectionPathCopy', async () => {
    await setUp()
    const attrPath = '/World/fx/Letters/points.internalValue'
    const attr = layers[3]!.getAttributeAtPath(attrPath)
    expect(attr, 'Attribute not stitched').toBeTruthy()

    const expectedTargets = pathListOp(['/World/fx/Letters.interface:value'])
    expectListOpEqual(attr!.getInfo('connectionPaths'), expectedTargets)
  })

  it('test_Dictionary', async () => {
    await setUp()
    const layer = layers[3]!
    expect(layer.getPrimAtPath('/World')!.getInfo('customData')).toEqual({
      zUp: true,
      testInt: 1,
      testString: 'foo',
    })
  })

  it('test_Variants', async () => {
    await setUp()
    const layer1 = (await Layer.findOrOpen('src/variants_1.usda'))!
    const layer2 = (await Layer.findOrOpen('src/variants_2.usda'))!

    // First, stitch to an empty layer -- this should be equivalent to
    // making a copy of the weaker layer.
    let l = Layer.createAnonymous('.usda')
    UsdUtilsStitchLayers(l, layer1)
    expect(l.exportToString()).toBe(layer1.exportToString())

    l = Layer.createAnonymous('.usda')
    UsdUtilsStitchLayers(l, layer2)
    expect(l.exportToString()).toBe(layer2.exportToString())

    // Stitch the two layers together and verify that variants are merged
    // as expected.
    UsdUtilsStitchLayers(layer1, layer2)

    expect(layer1.getObjectAtPath('/Root{a=x}Child')).toBeTruthy()
    expect(layer1.getObjectAtPath('/Root{a=x}Child.testAttr')).toBeTruthy()
    expect(layer1.getObjectAtPath('/Root{a=x}Child.testRel')).toBeTruthy()
    expect(layer1.getObjectAtPath('/Root{a=x}Child_2')).toBeTruthy()
    expect(layer1.getObjectAtPath('/Root{a=x}Child_2.testAttr')).toBeTruthy()
    expect(layer1.getObjectAtPath('/Root{a=x}Child_2.testRel')).toBeTruthy()
    expect(layer1.getObjectAtPath('/Root{b=x}Child')).toBeTruthy()

    const samples = (attrPath: string): Map<number, unknown> =>
      new Map(layer1.listTimeSamplesForPath(attrPath)
        .map(time => [time, layer1.queryTimeSample(attrPath, time)]))
    expect(samples('/Root{a=x}Child.testAttr')).toEqual(new Map([[1.0, 1.0], [2.0, 2.0]]))
    expect(samples('/Root{a=x}Child_2.testAttr')).toEqual(new Map([[2.0, 2.0]]))

    expectListOpEqual(
      layer1.getRelationshipAtPath('/Root{a=x}Child.testRel')!.getInfo('targetPaths'),
      pathListOp(['/Root/Test', '/Root/Test2']))

    expectListOpEqual(
      layer1.getRelationshipAtPath('/Root{a=x}Child_2.testRel')!.getInfo('targetPaths'),
      pathListOp(['/Root/Test2']))

    expect(layer1.getPrimAtPath('/Root')!.getVariantSelections().toObject()).toEqual({ a: 'x', b: 'x' })

    const expectedNames = new SdfListOp<unknown>()
    expectedNames.setPrependedItems(['a', 'b'])
    expectListOpEqual(layer1.getPrimAtPath('/Root')!.getInfo('variantSetNames'), expectedNames)
  })
})
