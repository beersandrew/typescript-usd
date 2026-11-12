// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsStitchClips.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsStitchClips.py
// (registered as testUsdUtilsStitchClips). The testenv directory
// testUsdUtilsStitchClips.testenv (src/Particles_Splash.*.usd,
// src/PTS_dev.*.usd, src/topology.usd, src/alt_topology.usd) is copied
// unmodified into fixtures/testUsdUtilsStitchClips (Copyright 2017 Pixar,
// TOST 1.0, https://openusd.org/license). Upstream runs in a copy
// of that directory and writes its result layers beside the inputs, so each
// test copies the fixtures into a temporary directory and runs there.
//
// API mapping: UsdUtils.StitchClips / StitchClipsTopology /
// StitchClipsTemplate / GenerateClipTopologyName are the async
// UsdUtilsStitchClips / UsdUtilsStitchClipsTopology /
// UsdUtilsStitchClipsTemplate and UsdUtilsGenerateClipTopologyName, with
// Python's keyword arguments as positional ones (startFrame and endFrame
// default to std::numeric_limits<double>::max(), Number.MAX_VALUE). The
// Python wrapper's None arguments are those defaults. Sdf.Layer.CreateNew
// is the async Layer.createNew. A Tf.ErrorException raised by a call is an
// error posted while it runs (TfErrorMark). The layer properties
// startTimeCode / endTimeCode / subLayerPaths are the pseudo-root fields /
// getSubLayerPaths(). Vt.Vec2dArray and Sdf.AssetPathArray values are
// compared as plain arrays; Sdf.AssetPath by its authored path.
// Usd.Stage.Open(layer) is Stage.open(layer); Ts.Spline / Ts.Knot are
// TsSpline / TsKnot. Python's setUp runs before every test; here each test
// calls setUp() in a fresh directory, and replacing the resolver clears the
// layer registry, as Python drops each case's layers.
import { chmodSync, cpSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { _setResolverForTest } from 'typescript-usd/ar/_internal'
import { AssetPath as SdfAssetPath, Layer, ValueTypeNames } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { TfErrorMark } from 'typescript-usd/tf'
import { InterpCurve as TsInterpCurve, Knot as TsKnot, Spline as TsSpline } from 'typescript-usd/ts'
import { Stage } from 'typescript-usd/usd'
import {
  UsdUtilsGenerateClipTopologyName, UsdUtilsStitchClips, UsdUtilsStitchClipsTemplate, UsdUtilsStitchClipsTopology,
} from 'typescript-usd/usdUtils'
import { Array as VtArray } from 'typescript-usd/vt'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdUtilsStitchClips')

let cwd = ''
let scratch = ''
beforeEach(() => {
  cwd = process.cwd()
  scratch = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsStitchClips-'))
  cpSync(TESTENV, scratch, { recursive: true })
  process.chdir(scratch)
  _setResolverForTest(ArGetResolver())
})
afterEach(() => {
  process.chdir(cwd)
  rmSync(scratch, { recursive: true, force: true })
})

async function createNew(identifier: string): Promise<Layer> {
  const layer = await Layer.createNew(identifier)
  expect(layer, `Sdf.Layer.CreateNew('${identifier}')`).toBeDefined()
  return layer!
}

const startTimeCodeOf = (layer: Layer): unknown => layer.getField('/', 'startTimeCode')
const endTimeCodeOf = (layer: Layer): unknown => layer.getField('/', 'endTimeCode')

function assetPathString(value: unknown): string {
  return value instanceof SdfAssetPath ? value.getAuthoredPath() : String(value)
}

function plainArray(value: unknown): unknown[] {
  expect(value).toBeInstanceOf(VtArray)
  return (value as VtArray<unknown>).toArray().map(item =>
    item instanceof SdfAssetPath || typeof item === 'string' ? assetPathString(item)
      : (item as { data: readonly number[] }).data ? [...(item as { data: readonly number[] }).data] : item)
}

describe('TestUsdUtilsStitchClips', () => {
  const layerFileNames = ['src/Particles_Splash.101.usd',
    'src/Particles_Splash.102.usd',
    'src/Particles_Splash.103.usd',
    'src/Particles_Splash.104.usd',
    'src/Particles_Splash.105.usd',
    'src/Particles_Splash.106.usd',
    'src/Particles_Splash.107.usd',
    'src/Particles_Splash.108.usd',
    'src/PTS_dev.1.usd',
    'src/PTS_dev.2.usd',
    'src/PTS_dev.3.usd',
    'src/PTS_dev.4.usd',
    'src/PTS_dev.5.usd',
    'src/PTS_dev.6.usd',
    'src/PTS_dev.7.usd',
    'src/PTS_dev.8.usd',
    'src/PTS_dev.9.usd',
    'src/PTS_dev.10.usd',
    'src/PTS_dev.11.usd',
    'src/PTS_dev.12.usd',
    'src/PTS_dev.13.usd',
    'src/PTS_dev.14.usd',
    'src/PTS_dev.15.usd',
    'src/PTS_dev.16.usd',
    'src/PTS_dev.17.usd',
    'src/PTS_dev.18.usd',
    'src/PTS_dev.19.usd',
    'src/PTS_dev.20.usd',
    'src/PTS_dev.21.usd',
    'src/PTS_dev.22.usd',
    'src/PTS_dev.23.usd',
    'src/PTS_dev.24.usd']

  const clipPath = SdfPath.fromString('/World/fx/Particles_Splash')
  const baseName = 'testModelClips.usd'
  const startTimeCode = 101
  const endTimeCode = 108
  let rootLayer: Layer

  async function setUp(): Promise<void> {
    rootLayer = (await Layer.findOrOpen(baseName)) ?? await createNew(baseName)
    await UsdUtilsStitchClips(rootLayer, layerFileNames.slice(0, 7),
      clipPath, startTimeCode, endTimeCode,
      /* interpolateMissingClipValues = */ true)
  }

  it('test_ValidClipMetadata', async () => {
    await setUp()
    const clipPrim = rootLayer.getPrimAtPath(clipPath)
    expect(clipPrim).toBeTruthy()
    expect(new Set(clipPrim!.listInfoKeys())).toEqual(new Set(['clips', 'specifier']))
    const clips = clipPrim!.getInfo('clips') as Record<string, Record<string, unknown>>
    expect(new Set(Object.keys(clips))).toEqual(new Set(['default']))
    expect(new Set(Object.keys(clips['default']!))).toEqual(new Set(['times', 'assetPaths', 'primPath',
      'manifestAssetPath', 'active',
      'interpolateMissingClipValues']))
  })

  it('test_ValidUsdLayerGeneration', async () => {
    await setUp()
    expect(rootLayer).toBeTruthy()
  })

  it('test_RelativeAssetPaths', async () => {
    await setUp()
    const rootLayerFile = 'relativePaths.usd'
    rmSync(rootLayerFile, { force: true })

    const layer = await createNew(rootLayerFile)
    expect(layer).toBeTruthy()

    const localLayerNames = layerFileNames.map(i => path.relative(process.cwd(), i))

    await UsdUtilsStitchClips(layer, localLayerNames, clipPath)
    const prim = layer.getPrimAtPath(clipPath)!
    const assetPaths = plainArray((prim.getInfo('clips') as Record<string, Record<string, unknown>>)
      ['default']!['assetPaths']) as string[]

    // ensure all paths are relative
    expect(assetPaths.length).toBe(32)
    expect(assetPaths.some(i => path.isAbsolute(i))).toBe(false)
  })

  // This test ensures that we are grabbing our frame data from the layers
  // directly so we incur no precision loss from string parsing as we
  // believe we were previously.
  it('test_NumericalPrecisionLoss', async () => {
    await setUp()
    const rootLayerFile = 'numericalPrecision.usd'
    const pointsPath = SdfPath.fromString('/World/fx/points')
    const layer = await createNew(rootLayerFile)
    await UsdUtilsStitchClips(layer, layerFileNames.slice(8), pointsPath)
    expect(layer).toBeTruthy()
    expect(startTimeCodeOf(layer)).toBe(1.00000)
    // previously, the precision error was causing us to end up with an
    // end frame of 24.0006
    expect(endTimeCodeOf(layer)).toBe(24.000000)
  })

  it('test_FilePermissions', async () => {
    await setUp()
    const rootLayerFile = 'permissions.usd'
    const pointsPath = SdfPath.fromString('/World/fx/points')
    const layer = await createNew(rootLayerFile)
    const mode = statSync(rootLayerFile).mode & 0o7777
    chmodSync(rootLayerFile, mode & ~0o222)
    const mark = new TfErrorMark()
    try {
      await UsdUtilsStitchClips(layer, layerFileNames, pointsPath)
      // Python raises Tf.ErrorException for the posted runtime error;
      // without it, "Failed to raise runtime error on unwritable file."
      expect(mark.isClean(), 'Failed to raise runtime error on unwritable file.').toBe(false)
    } finally {
      mark.clear()
      mark.dispose()
      chmodSync(rootLayerFile, mode)
    }
  })

  it('test_StitchTopologyOnly', async () => {
    await setUp()
    // Generate a fresh topology
    const topologyLayer = await createNew('topologyLayer.usd')
    await UsdUtilsStitchClipsTopology(topologyLayer, layerFileNames.slice(0, 7))
    expect(topologyLayer).toBeTruthy()
    expect(topologyLayer.getPrimAtPath(clipPath)).toBeTruthy()

    // Aggregate into an existing topology
    const newClipPath = SdfPath.fromString('/World/fx/points')
    await UsdUtilsStitchClipsTopology(topologyLayer, layerFileNames.slice(8, 10))
    expect(topologyLayer).toBeTruthy()
    expect(topologyLayer.getPrimAtPath(newClipPath)).toBeTruthy()
  })

  it('test_ExplicitEndCodes', async () => {
    await setUp()
    const start = 104
    const end = 105
    const resultLayer = await createNew('explicitEndCodes.usd')
    await UsdUtilsStitchClips(resultLayer, layerFileNames.slice(0, 7), clipPath, start, end)

    expect(startTimeCodeOf(resultLayer)).toBe(start)
    expect(endTimeCodeOf(resultLayer)).toBe(end)
  })

  it('test_TopologySublayerAuthoring', async () => {
    await setUp()
    let resultLayer = await createNew('sublayerTopology.usd')
    await UsdUtilsStitchClips(resultLayer, layerFileNames.slice(0, 7), clipPath)

    expect(resultLayer.getSubLayerPaths()).toEqual(['./sublayerTopology.topology.usd'])

    resultLayer = await createNew('foo.usd')
    const topLayer = await createNew('foo.topology.usd')
    const manifestLayer = await createNew('foo.manifest.usd')
    await UsdUtilsStitchClipsTemplate(resultLayer, topLayer, manifestLayer,
      clipPath, 'asset.#.usd', 101, 120, 1)
    expect(resultLayer.getSubLayerPaths()).toEqual(['./foo.topology.usd'])
  })

  it('test_GenerateTopologyName', async () => {
    await setUp()
    const names = [['/foo/bar/baz.foo.usd', '/foo/bar/baz.foo.topology.usd'],
      ['foo.usda', 'foo.topology.usda'],
      ['./mars.usd', './mars.topology.usd']] as const

    for (const [original, expected] of names) {
      expect(UsdUtilsGenerateClipTopologyName(original)).toBe(expected)
    }
  })

  // Test authoring with a custom set name 'bob'
  it('test_CustomSetName', async () => {
    await setUp()
    // template case
    let resultLayer = await createNew('customSetName.usd')
    const topLayer = await createNew('customSetName.topology.usd')
    const manifestLayer = await createNew('customSetName.manifest.usd')
    await UsdUtilsStitchClipsTemplate(resultLayer, topLayer, manifestLayer,
      clipPath,
      'asset.#.usd', 101, 120, 1, 0.3,
      /* interpolateMissingClipValues = */ true,
      /* clipSet = */ 'bob')
    expect(resultLayer.getSubLayerPaths()).toEqual(['./customSetName.topology.usd'])
    expect(endTimeCodeOf(resultLayer)).toBe(120)
    expect(startTimeCodeOf(resultLayer)).toBe(101)

    let prim = resultLayer.getPrimAtPath('/World/fx/Particles_Splash')!
    expect(prim.getMetaDataInfoKeys()).toContain('clips')
    const templateExpected: Record<string, unknown> = {
      templateStartTime: 101.0,
      templateStride: 1.0,
      templateActiveOffset: 0.3,
      primPath: '/World/fx/Particles_Splash',
      templateAssetPath: 'asset.#.usd',
      templateEndTime: 120.0,
      interpolateMissingClipValues: true,
    }

    // Ensure that our custom set name applied
    let actualValues = (prim.getInfo('clips') as Record<string, Record<string, unknown>>)['bob']
    expect(actualValues).toBeDefined()

    // Ensure all of our values were written out
    for (const k of ['templateStartTime', 'templateStride', 'templateEndTime',
      'primPath', 'templateAssetPath']) {
      expect(actualValues![k]).toEqual(templateExpected[k])
    }

    // non template case
    resultLayer = await createNew('customSetNameNonTemplate.usd')
    await UsdUtilsStitchClips(resultLayer, layerFileNames.slice(0, 7),
      clipPath, undefined, undefined, undefined, /* clipSet = */ 'bob')

    expect(startTimeCodeOf(resultLayer)).toBe(101)
    expect(endTimeCodeOf(resultLayer)).toBe(107)
    expect(resultLayer.getSubLayerPaths()).toEqual(['./customSetNameNonTemplate.topology.usd'])

    prim = resultLayer.getPrimAtPath('/World/fx/Particles_Splash')!
    const expectedValues: Record<string, unknown> = {
      active: [[101.0, 0.0],
        [102.0, 1.0],
        [103.0, 2.0],
        [104.0, 3.0],
        [105.0, 4.0],
        [106.0, 5.0],
        [107.0, 6.0]],
      times: [[101.0, 101.0],
        [102.0, 102.0],
        [103.0, 103.0],
        [104.0, 104.0],
        [105.0, 105.0],
        [106.0, 106.0],
        [107.0, 107.0]],
      manifestAssetPath: './customSetNameNonTemplate.manifest.usd',
      assetPaths: ['./src/Particles_Splash.101.usd',
        './src/Particles_Splash.102.usd',
        './src/Particles_Splash.103.usd',
        './src/Particles_Splash.104.usd',
        './src/Particles_Splash.105.usd',
        './src/Particles_Splash.106.usd',
        './src/Particles_Splash.107.usd'],
      primPath: '/World/fx/Particles_Splash',
    }

    // Ensure that our custom set name applied
    actualValues = (prim.getInfo('clips') as Record<string, Record<string, unknown>>)['bob']
    expect(actualValues).toBeDefined()

    // Ensure all of our values were written out
    expect(plainArray(actualValues!['active'])).toEqual(expectedValues['active'])
    expect(plainArray(actualValues!['times'])).toEqual(expectedValues['times'])
    expect(actualValues!['manifestAssetPath']).toBeInstanceOf(SdfAssetPath)
    expect(assetPathString(actualValues!['manifestAssetPath'])).toBe(expectedValues['manifestAssetPath'])
    expect(actualValues!['primPath']).toBe(expectedValues['primPath'])
    expect(plainArray(actualValues!['assetPaths'])).toEqual(expectedValues['assetPaths'])
  })

  // Test that the expectation of the spline format makes it to the
  // manifest, and spline definitions are included in the stitched topology.
  it('test_StitchClipsWithSplines', async () => {
    await setUp()
    const makeSplineClip = async (
      fileName: string, primPath: SdfPath, attrName: string, time: number, value: number,
    ): Promise<string> => {
      const stage = await Stage.open(await createNew(fileName))
      const prim = stage.definePrim(primPath.pathString)
      const attr = prim.createAttribute(attrName, ValueTypeNames.Double.name)
      const spline = new TsSpline()
      spline.setKnot(new TsKnot({ time, value, nextInterp: TsInterpCurve }))
      attr.setSpline(spline)
      await stage.save()
      return fileName
    }

    const primPath = SdfPath.fromString('/Model/Foo')
    const clips: string[] = []
    for (let i = 1; i < 4; i++) {
      clips.push(await makeSplineClip(`splineClip${i}.usda`, primPath, 'splineAttr', 100 + i, i))
    }

    const result = await createNew('splineResult.usd')
    await UsdUtilsStitchClips(result, clips, primPath, 101, 103)

    const attrPath = primPath.appendProperty('splineAttr')

    // Manifest marks the attribute with "spline"
    const manifest = await Layer.findOrOpen('splineResult.manifest.usd')
    expect(manifest).toBeTruthy()
    const manifestAttr = manifest!.getAttributeAtPath(attrPath)
    expect(manifestAttr).toBeTruthy()
    expect(manifestAttr!.hasInfo('spline')).toBe(true)

    // Topology keeps the attribute but not the spline data
    const topology = await Layer.findOrOpen('splineResult.topology.usd')
    expect(topology).toBeTruthy()
    const topologyAttr = topology!.getAttributeAtPath(attrPath)
    expect(topologyAttr).toBeTruthy()
    expect(topologyAttr!.hasInfo('spline')).toBe(false)
  })
})
