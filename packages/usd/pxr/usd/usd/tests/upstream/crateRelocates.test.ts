// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateFile.cpp,
//  pxr/usd/usd/testenv/testUsdCrateRelocates.py
// Copyright 2016, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdCrateRelocates.py
// (registered as testUsdCrateRelocates). The testenv directory
// testUsdCrateRelocates.testenv (model.usdc, root_no_relocates.usdc,
// root_with_relocates.usdc) is copied unmodified into
// fixtures/testUsdCrateRelocates (Copyright 2024 Pixar, TOST 1.0,
// https://openusd.org/license). Upstream runs in a copy of that directory
// and writes exported files beside the inputs, so each test here copies
// the fixtures into a temporary directory first.
//
// API mapping: Sdf.CrateInfo.Open(file).GetFileVersion() has no TS
// counterpart; the version is read from the crate bootstrap header
// (crateFile.cpp _BootStrap: "PXR-USDC" then major, minor, patch bytes).
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdCrateRelocates')

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdCrateRelocates'))
  cpSync(TESTENV, dir, { recursive: true })
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })
const file = (name: string): string => path.join(dir, name)

function crateFileVersion(fileName: string): [number, number, number] {
  const bytes = readFileSync(fileName)
  return [bytes[8]!, bytes[9]!, bytes[10]!]
}

describe('testUsdCrateRelocates', () => {
  // Tests that reading and writing of relocates in layer metadata works as
  // expected in crate files.
  it('test_ReadWriteRelocates', async () => {
    // Expected layer relocates field in the file with relocates.
    const expectedRelocates: [string, string][] = [
      ['/World/Char/Rig/Body/Anim', '/World/Char/Anim/Body'],
      ['/World/Char/Rig/Head/Anim', '/World/Char/Anim/Head'],
    ]

    // Open a crate file and verify the layer has no relocates.
    const openCrateLayerAndVerifyNoRelocates = async (crateFileName: string): Promise<Layer> => {
      // A newly created crate file that has never had relocates added will
      // be verion 0.8.0 or newer.
      const [majver, minver] = crateFileVersion(crateFileName)
      expect(majver).toBe(0)
      expect(minver).toBeGreaterThanOrEqual(8)

      // The layer will have no relocates in its metadata
      const layer = (await Layer.findOrOpen(crateFileName))!
      expect(layer).toBeTruthy()
      expect(layer.hasRelocates()).toBe(false)
      expect(layer.getRelocates()).toEqual([])
      return layer
    }

    // Open a crate file and verify the layer does have the expected
    // relocates.
    const openCrateLayerAndVerifyHasRelocates = async (crateFileName: string): Promise<Layer> => {
      // A crate file that ever had relocates when it was created or saved
      // will have been upgraded to version 0.11
      expect(crateFileVersion(crateFileName)).toEqual([0, 11, 0])

      // The layer will have the expected relocates in its metadata.
      const layer = (await Layer.findOrOpen(crateFileName))!
      expect(layer).toBeTruthy()
      expect(layer.hasRelocates()).toBe(true)
      expect(layer.getRelocates()).toEqual(expectedRelocates)
      return layer
    }

    // The test directory has two usdc files that are identical except one
    // has relocates and the other doesn't
    //
    // Open the no relocates file as a layer and verify it has no relocates.
    let noRelocatesLayer = await openCrateLayerAndVerifyNoRelocates(file('root_no_relocates.usdc'))

    // Open the with relocates file as a layer and verify it has the
    // expected relocates.
    const relocatesLayer = await openCrateLayerAndVerifyHasRelocates(file('root_with_relocates.usdc'))

    // Export both files to new file paths
    const exportNoRelocatesCrateFilename = file('exported_root_no_relocates.usdc')
    expect(await noRelocatesLayer.export(exportNoRelocatesCrateFilename)).toBe(true)
    const exportRelocatesCrateFilename = file('exported_root_with_relocates.usdc')
    expect(await relocatesLayer.export(exportRelocatesCrateFilename)).toBe(true)

    // The exported no relocates file still has no relocates and was not
    // updgraded. The exported "has relocates" file will have relocates.
    noRelocatesLayer = await openCrateLayerAndVerifyNoRelocates(exportNoRelocatesCrateFilename)
    await openCrateLayerAndVerifyHasRelocates(exportRelocatesCrateFilename)

    // Add the expected relocates value to the layer with no relocates; it
    // will now have the expected relocates.
    noRelocatesLayer.setRelocates(expectedRelocates)
    expect(noRelocatesLayer.hasRelocates()).toBe(true)
    expect(noRelocatesLayer.getRelocates()).toEqual(expectedRelocates)

    // Export this edited layer to yet another new file. Open this new crate
    // will correctly have the added relocates.
    const exportEditedNoRelocatesCrateFilename = file('exported_edited_root_no_relocates.usdc')
    expect(await noRelocatesLayer.export(exportEditedNoRelocatesCrateFilename)).toBe(true)
    await openCrateLayerAndVerifyHasRelocates(exportEditedNoRelocatesCrateFilename)

    // Now save the "no relocates" layer that we edited to add relocates and
    // close it. When we open it again, it will have the save relocates.
    // (The layer registry keeps the open layer, so the saved file is opened
    // again through a copy.)
    expect(await noRelocatesLayer.save()).toBe(true)
    const savedCopy = file('saved_copy.usdc')
    cpSync(exportNoRelocatesCrateFilename, savedCopy)
    await openCrateLayerAndVerifyHasRelocates(savedCopy)
  })

  // Tests that relocates are composed correctly on a stage opened from a
  // crate layer.
  it('test_RelocatesOnStage', async () => {
    // Create a stage from the test file with no relocates
    const noRelocatesLayer = (await Layer.findOrOpen(file('root_no_relocates.usdc')))!
    const noRelocatesStage = await Stage.open(noRelocatesLayer)

    // Create a stage from the test file that relocates
    const relocatesLayer = (await Layer.findOrOpen(file('root_with_relocates.usdc')))!
    const relocatesStage = await Stage.open(relocatesLayer)

    // Verify the prims in the "no relocates" stage. Note that without
    // relocates none of the "Anim" prims have been moved out of
    // /World/Char/Rig
    expect([...noRelocatesStage.traverse()]).toEqual([
      '/World',
      '/World/Char',
      '/World/Char/Rig',
      '/World/Char/Rig/Body',
      '/World/Char/Rig/Body/Geom',
      '/World/Char/Rig/Body/Anim',
      '/World/Char/Rig/Head',
      '/World/Char/Rig/Head/Geom',
      '/World/Char/Rig/Head/Anim',
      '/World/Char/Anim'])

    // Verify the prims in the "has relocates" stage. Note that here the
    // "Anim" prims have been moved out of /World/Char/Rig and renamed to
    // "Head" and "Body" under /World/Char/Anim
    const relocatedPrims = [...relocatesStage.traverse()]
    expect(relocatedPrims).toEqual([
      '/World',
      '/World/Char',
      '/World/Char/Rig',
      '/World/Char/Rig/Body',
      '/World/Char/Rig/Body/Geom',
      '/World/Char/Rig/Head',
      '/World/Char/Rig/Head/Geom',
      '/World/Char/Anim',
      '/World/Char/Anim/Body',
      '/World/Char/Anim/Head'])

    // Set the layer relocates in the "no relocates" to be the same as the
    // layer relocates in the "has relocates" layer.
    noRelocatesLayer.setRelocates(relocatesLayer.getRelocates())
    await noRelocatesStage.flushChanges()

    // Verify the prims in the "no relocates" stage have been relocated in
    // the same way as the relocates stage.
    expect([...noRelocatesStage.traverse()]).toEqual(relocatedPrims)
  })
})
