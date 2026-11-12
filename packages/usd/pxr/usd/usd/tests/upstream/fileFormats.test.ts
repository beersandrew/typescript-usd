// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdFileFormats.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdFileFormats.py, run
// once per registration that shares it: testUsdFileFormats,
// testUsdFileFormats_asset (USDC_USE_ASSET=1) and testUsdFileFormats_pread
// (USDC_USE_PREAD=1). Those environment settings choose how the crate
// reader accesses the file (mmap, ArAsset or pread); typescript-usd always
// reads crate bytes from the ArAsset buffer, so the three runs execute the
// same code here. The testenv pxr/usd/usd/testenv/testUsdFileFormats
// (ascii.usd, crate.usd) is copied unmodified into
// fixtures/testUsdFileFormats (Copyright 2017 Pixar, TOST 1.0,
// https://openusd.org/license). The test writes files into its working
// directory, so each case runs in a scratch copy of the testenv.
//
// Missing typescript-usd API (sub-assertions skipped, each noted inline):
// - Sdf.UsdFileFormat.GetUnderlyingFormatForLayer
// - Sdf.Layer.CreateNew and Sdf.Layer.New
// - Sdf.UsdFileFormat.Tokens (Target, FormatArg)
// - SdfLayer::Save(force)
// - Tf.GetEnvSetting('USD_DEFAULT_FILE_FORMAT')
// Usd.Stage.CreateNew(path) is emulated as in changeProcessing.test.ts: an
// empty layer exported to the path and opened.

import { copyFileSync, cpSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { postedErrors } from '../../../../testing/postedErrors.ts'
import { Layer, PrimSpec as SdfPrimSpec } from 'typescript-usd/sdf'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { Stage, StagePopulationMask } from 'typescript-usd/usd'
import { _setResolverForTest } from 'typescript-usd/usd/_internal'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdFileFormats')

function diffLayers(layer1: Layer, layer2: Layer): void {
  expect(layer1.exportToString()).toBe(layer2.exportToString())
}

// In order to verify the underlying file format of the given .usd file,
// we're going to try to load the file but use an extension override to force
// the use of the expected underlying file format. If the file fails to load,
// we'll know it wasn't the right format.
async function verifyUsdFileFormat(usdFileName: string, underlyingFormatId: string): Promise<void> {
  // Copy the file to a temporary location and replace the extension with
  // the expected format, then try to open it.
  const tmpDir = mkdtempSync(path.join(tmpdir(), path.parse(usdFileName).name))
  const tmpFileName = path.join(tmpDir, `${path.parse(usdFileName).name}.${underlyingFormatId}`)
  copyFileSync(usdFileName, tmpFileName)

  expect(Layer.find(tmpFileName)).toBeUndefined()
  expect(Layer.find(usdFileName)).toBeUndefined()
  const layer = await Layer.findOrOpen(tmpFileName).catch(() => undefined)
  expect(layer).toBeTruthy()

  unlinkSync(tmpFileName)
  rmSync(tmpDir, { recursive: true, force: true })
}

const verifyUsdFileIsASCII = (usdFileName: string) => verifyUsdFileFormat(usdFileName, 'usda')
const verifyUsdFileIsCrate = (usdFileName: string) => verifyUsdFileFormat(usdFileName, 'usdc')

// Usd.Stage.CreateNew(path).
async function createNewStage(identifier: string): Promise<Stage> {
  const empty = Layer.createAnonymous()
  empty.importFromString('#usda 1.0\n')
  await empty.export(identifier)
  return Stage.openMasked((await Layer.findOrOpen(identifier))!, StagePopulationMask.all())
}

describe.each([
  'testUsdFileFormats', 'testUsdFileFormats_asset', 'testUsdFileFormats_pread',
])('%s', () => {
  let cwd: string
  let scratch: string
  beforeEach(() => {
    cwd = process.cwd()
    scratch = mkdtempSync(path.join(tmpdir(), 'testUsdFileFormats-'))
    cpSync(TESTENV, scratch, { recursive: true })
    process.chdir(scratch)
    // Python drops each case's layers; replacing the resolver clears the
    // layer registry to the same effect.
    _setResolverForTest(ArGetResolver())
  })
  afterEach(() => {
    process.chdir(cwd)
    rmSync(scratch, { recursive: true, force: true })
  })

  // test_NewUsdLayer: every assertion needs Sdf.Layer.CreateNew /
  // Sdf.Layer.New with format arguments, Sdf.UsdFileFormat.
  // GetUnderlyingFormatForLayer and Tf.GetEnvSetting('USD_DEFAULT_FILE_FORMAT');
  // none exists in typescript-usd, so the case is not ported.

  it('test_UsdLayerSave', async () => {
    // Verify that opening a .usd file, authoring changes, and saving it
    // maintains the same underlying file format.
    const testLayerOpenAndSave = async (srcFilename: string, expectedFileFormat: string) => {
      const dstFilename = `testUsdLayerSave_${expectedFileFormat}.usd`
      copyFileSync(srcFilename, dstFilename)
      const layer = (await Layer.findOrOpen(dstFilename))!
      expect(layer).toBeTruthy()
      // assertEqual(Sdf.UsdFileFormat.GetUnderlyingFormatForLayer(layer),
      // expectedFileFormat): no GetUnderlyingFormatForLayer.

      SdfPrimSpec.new(layer, 'TestUsdLayerSave', 'def')
      expect(await layer.save()).toBe(true)

      // assertEqual(Sdf.UsdFileFormat.GetUnderlyingFormatForLayer(layer),
      // expectedFileFormat): no GetUnderlyingFormatForLayer.
    }

    const asciiFile = 'ascii.usd'
    await testLayerOpenAndSave(asciiFile, 'usda')

    const crateFile = 'crate.usd'
    await testLayerOpenAndSave(crateFile, 'usdc')
  })

  it('test_UsdLayerExport', async () => {
    const testExport = async (layer: Layer) => {
      expect(layer).toBeTruthy()

      const exportedLayerId = path.basename(layer.identifier).replace('.usd', '_exported.usd')
      expect(await layer.export(exportedLayerId)).toBe(true)

      const exportedLayer = (await Layer.findOrOpen(exportedLayerId))!
      expect(exportedLayer).toBeTruthy()

      // Exporting to a new .usd file should produce a binary file, since
      // that's the default format for .usd:
      // assertEqual(Sdf.UsdFileFormat.GetUnderlyingFormatForLayer(
      // exportedLayer), "usdc"): no GetUnderlyingFormatForLayer.

      // The contents of the exported layer should equal to the contents of
      // the original layer.
      diffLayers(layer, exportedLayer)
    }

    // newLayer = Sdf.Layer.CreateNew('testUsdLayerExport.usd') with a Scope
    // prim spec, saved and exported: no Sdf.Layer.CreateNew.

    const asciiFile = 'ascii.usd'
    await testExport((await Layer.findOrOpen(asciiFile))!)

    const crateFile = 'crate.usd'
    await testExport((await Layer.findOrOpen(crateFile))!)
  })

  it('test_LoadASCIIUsdLayer', async () => {
    const asciiFile = 'ascii.usd'
    await verifyUsdFileIsASCII(asciiFile)

    const l = (await Layer.findOrOpen(asciiFile))!
    expect(l).toBeTruthy()
  })

  it('test_LoadCrateUsdLayer', async () => {
    const crateFile = 'crate.usd'
    await verifyUsdFileIsCrate(crateFile)

    const l = (await Layer.findOrOpen(crateFile))!
    expect(l).toBeTruthy()
  })

  it('test_UsdLayerString', async () => {
    // Verify that we get non-empty string representations for binary,
    // text, and crate .usd layers.
    const asciiFile = 'ascii.usd'
    const asciiLayer = (await Layer.findOrOpen(asciiFile))!
    const asciiLayerAsString = asciiLayer.exportToString()
    expect(asciiLayerAsString.length).toBeGreaterThan(0)

    const crateFile = 'crate.usd'
    const crateLayer = (await Layer.findOrOpen(crateFile))!
    const crateLayerAsString = crateLayer.exportToString()
    expect(crateLayerAsString.length).toBeGreaterThan(0)

    // All .usd layers use the same string representation as a text .usd
    // layer, so these should match.
    expect(crateLayerAsString).toBe(asciiLayerAsString)

    // Verify that we can import the string representation of a .usd layer
    // into another .usd layer: importLayer =
    // Sdf.Layer.CreateNew('testUsdLayerString.usdc'), ImportFromString and
    // DiffLayers: no Sdf.Layer.CreateNew.
  })

  it('test_BadFileName', async () => {
    // Previously, failing to open a layer would assert-fail in C++/Usd,
    // this test makes sure it is a recoverable error.
    // The open yields no stage and posts errors (Tf.ErrorException natively).
    const { result: stage, errors } = await postedErrors(() => Stage.open('badFileName.usd'))
    expect(stage).toBeUndefined()
    expect(errors.length).toBeGreaterThan(0)
  })

  it('test_UsdcRepeatedSaves', async () => {
    // Repeated saves used to fail due to an fopen mode bug.
    const s = await createNewStage('testUsdcRepeatedSaves.usdc')
    s.definePrim('/foo')
    await s.getRootLayer().save()
    s.definePrim('/foo/bar/baz')
    expect(s.getPrim('/foo')).toBeDefined()
    expect(s.getPrim('/foo/bar')).toBeDefined()
    expect(s.getPrim('/foo/bar/baz')).toBeDefined()
    await s.getRootLayer().save()
    expect(s.getPrim('/foo')).toBeDefined()
    expect(s.getPrim('/foo/bar')).toBeDefined()
    expect(s.getPrim('/foo/bar/baz')).toBeDefined()
    // s.GetRootLayer().Save(force=True): Layer.save takes no force
    // argument; the unforced save stands in.
    await s.getRootLayer().save()
    expect(s.getPrim('/foo')).toBeDefined()
    expect(s.getPrim('/foo/bar')).toBeDefined()
    expect(s.getPrim('/foo/bar/baz')).toBeDefined()
  })

  it('test_ReloadReplaceUsdUsdaWithUsdc', async () => {
    // Test that replacing a .usda-backed .usd file with a .usdc file and
    // reloading it results in a .usdc-backed layer and not a .usda-backed
    // layer with the contents of the .usdc file.
    copyFileSync('ascii.usd', 'test_replace.usd')
    const layer = (await Layer.findOrOpen('test_replace.usd'))!
    // assertEqual(GetUnderlyingFormatForLayer(layer), 'usda'): no
    // Sdf.UsdFileFormat.GetUnderlyingFormatForLayer.

    copyFileSync('crate.usd', 'test_replace.usd')

    // Force a reload, otherwise the reload is skipped sometimes due to file
    // mtimes not changing after copyfile.
    expect(await layer.reload(true)).toBe(true)

    // assertEqual(GetUnderlyingFormatForLayer(layer), 'usdc'): no
    // Sdf.UsdFileFormat.GetUnderlyingFormatForLayer.
  })

  // test_Tokens: Sdf.UsdFileFormat.Tokens.Target == 'usd' and
  // Sdf.UsdFileFormat.Tokens.FormatArg == 'format': typescript-usd has no
  // Sdf.UsdFileFormat.Tokens, so the case is not ported.
})
