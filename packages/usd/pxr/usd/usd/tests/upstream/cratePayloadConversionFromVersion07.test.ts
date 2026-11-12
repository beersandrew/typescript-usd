// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateFile.cpp,
//  pxr/usd/usd/testenv/testUsdCratePayloadConversionFromVersion07.py
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usd/testenv/testUsdCratePayloadConversionFromVersion07.py
// (registered as testUsdCratePayloadConversionFromVersion07). The testenv
// directory testUsdCratePayloadConversionFromVersion07.testenv
// (crate07SinglePayload.usdc, singlePayload.usda) is copied unmodified into
// fixtures/testUsdCratePayloadConversionFromVersion07 (Copyright 2019 Pixar,
// TOST 1.0, https://openusd.org/license). Upstream runs in a copy
// of that directory and writes exported files beside the inputs, so each
// test here copies the fixtures into a temporary directory first.
//
// API mapping: Sdf.CrateInfo.Open(file).GetFileVersion() has no TS
// counterpart; the version is read from the crate bootstrap header
// (crateFile.cpp _BootStrap: "PXR-USDC" then major, minor, patch bytes).
// prim.payloadList is SdfPrimSpec.getPayloadList(); Sdf.Payload is
// SdfPayload.
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AttributeSpec, Layer, Payload as SdfPayload, ValueTypeNames } from 'typescript-usd/sdf'
import { TimeCode as GfTimeCode } from 'typescript-usd/gf'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdCratePayloadConversionFromVersion07')

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdCratePayloadConversionFromVersion07'))
  cpSync(TESTENV, dir, { recursive: true })
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })
const file = (name: string): string => path.join(dir, name)

const payload = (assetPath: string, primPath: string, offset?: { offset: number, scale: number }): SdfPayload =>
  new SdfPayload(assetPath, primPath, offset)
const payloads = (items: readonly SdfPayload[]) =>
  items.map(p => ({ assetPath: p.assetPath, primPath: p.primPath, layerOffset: { ...p.layerOffset } }))

// Verify that a payload list has a specific set of explicit items
type SdfPayloadEditorProxy = ReturnType<NonNullable<ReturnType<Layer['getPrimAtPath']>>['getPayloadList']>
function verifyPayloadList(payloadList: SdfPayloadEditorProxy, explicitItems?: SdfPayload[]): void {
  if (explicitItems === undefined) {
    // None means that we expect the payload list to be completely
    // empty and not explicit which is different than the list being
    // explicitly set to being an empty list.
    expect(payloadList.isExplicit()).toBe(false)
    expect(payloadList.getExplicitItems().toArray()).toEqual([])
  } else {
    // Otherwise the payload list should be explicit and its
    // explicitItems must match the list passed in.
    expect(payloadList.isExplicit()).toBe(true)
    expect(payloads(payloadList.getExplicitItems().toArray())).toEqual(payloads(explicitItems))
  }

  // All the other list op properties are expected to be empty.
  expect(payloadList.getAddedItems().toArray()).toEqual([])
  expect(payloadList.getAppendedItems().toArray()).toEqual([])
  expect(payloadList.getDeletedItems().toArray()).toEqual([])
  expect(payloadList.getOrderedItems().toArray()).toEqual([])
  expect(payloadList.getPrependedItems().toArray()).toEqual([])
}

const prims = (layer: Layer) => {
  const payloadRef1 = layer.getPrimAtPath('/PayloadRef1')
  const payloadRef2 = layer.getPrimAtPath('/PayloadRef2')
  const payloadRefNone = layer.getPrimAtPath('/PayloadRefNone')
  const payloadNoOpinion = layer.getPrimAtPath('/PayloadNoOpinion')
  expect(payloadRef1).toBeTruthy()
  expect(payloadRef2).toBeTruthy()
  expect(payloadRefNone).toBeTruthy()
  expect(payloadNoOpinion).toBeTruthy()
  return { payloadRef1: payloadRef1!, payloadRef2: payloadRef2!, payloadRefNone: payloadRefNone!, payloadNoOpinion: payloadNoOpinion! }
}

// Verify the opened layer has the prims we expect and these prim specs
// have the payloads we expect.
function verifyLayerPrims(layer: Layer): void {
  const { payloadRef1, payloadRef2, payloadRefNone, payloadNoOpinion } = prims(layer)

  // Single explicit payload for these two prims
  verifyPayloadList(payloadRef1.getPayloadList(), [payload('Payload.usda', '/Parent')])
  verifyPayloadList(payloadRef2.getPayloadList(), [payload('Payload2.usda', '/Parent')])

  // Payload is explicitly set to be None which is equates to an
  // explicitly empty payload list
  verifyPayloadList(payloadRefNone.getPayloadList(), [])

  // No payload opinion on this prim which is equates to a non-explicit
  // empty payload list.
  verifyPayloadList(payloadNoOpinion.getPayloadList())
}

const crateVersion = (fileName: string): string => {
  const bytes = readFileSync(fileName)
  return `${bytes[8]}.${bytes[9]}.${bytes[10]}`
}
// Verifies a crate file is the pre-payload list op 0.7.0 crate version
const verifyCrateVersion07 = (fileName: string) => expect(crateVersion(fileName)).toBe('0.7.0')
// Verifies a crate file is the 0.8.0 crate version that introduced payload
// list ops.
const verifyCrateVersion08 = (fileName: string) => expect(crateVersion(fileName)).toBe('0.8.0')
// Verifies a crate file is the 0.9.0 crate version that introduced timecode
// value types.
const verifyCrateVersion09 = (fileName: string) => expect(crateVersion(fileName)).toBe('0.9.0')

describe('testUsdCratePayloadConversionFromVersion07', () => {
  it('test_ExportPayloadCrate', async () => {
    // Test exporting crate file from a layer with payloads
    const usdaFilename = file('singlePayload.usda')
    const singlePayloadCrateFilename = file('exportSinglePayload.usdc')
    const listPayloadCrateFilename = file('exportListPayload.usdc')

    // Load the usda layer file containing single payload variations and
    // verify its contents.
    const usdaLayer = (await Layer.findOrOpen(usdaFilename))!
    verifyLayerPrims(usdaLayer)

    // Export the this layer to a usdc file and verify that it is exported
    // using version 0.8.0.
    expect(await usdaLayer.export(singlePayloadCrateFilename)).toBe(true)
    verifyCrateVersion08(singlePayloadCrateFilename)

    // Open the crate layer and verify that it has the same prims and
    // payloads.
    const crateLayer = (await Layer.findOrOpen(singlePayloadCrateFilename))!
    verifyLayerPrims(crateLayer)

    // Update the "none payloads" prim to have an explicit list of two
    // payloads
    prims(usdaLayer).payloadRefNone.getPayloadList().getExplicitItems().assign([
      payload('PayloadNew1.usda', '/Parent'),
      payload('PayloadNew2.usda', '/Parent')])

    // Export layer to a new crate file and verify that it uses the 0.8.0
    // crate version since it now has payload listops.
    expect(await usdaLayer.export(listPayloadCrateFilename)).toBe(true)
    verifyCrateVersion08(listPayloadCrateFilename)

    // Similar to the generic _VerifyLayerPrims but instead verifies that
    // '/PayloadRefNone' has two payloads instead.
    const listCrateLayer = (await Layer.findOrOpen(listPayloadCrateFilename))!
    const p = prims(listCrateLayer)
    verifyPayloadList(p.payloadRef1.getPayloadList(), [payload('Payload.usda', '/Parent')])
    verifyPayloadList(p.payloadRef2.getPayloadList(), [payload('Payload2.usda', '/Parent')])
    // Payload was updated to be a two payload list
    verifyPayloadList(p.payloadRefNone.getPayloadList(), [
      payload('PayloadNew1.usda', '/Parent'), payload('PayloadNew2.usda', '/Parent')])
    // No payload opinion on this prim which is equates to a non-explicit
    // empty payload list.
    verifyPayloadList(p.payloadNoOpinion.getPayloadList())
  })

  it('test_ExportPayloadCrateWithInternalPayload', async () => {
    // Test exporting crate file from a layer with payloads after adding
    // an internal payload
    const usdaFilename = file('singlePayload.usda')
    const internalPayloadCrateFilename = file('exportInternalPayload.usdc')

    const usdaLayer = (await Layer.findOrOpen(usdaFilename))!
    verifyLayerPrims(usdaLayer)

    // Update the no opinion payload to have a single internal payload
    // (empty assetpath).
    prims(usdaLayer).payloadNoOpinion.getPayloadList().getExplicitItems().assign([payload('', '/PayloadRef1')])

    // Export layer to a new crate file and verify that it uses the 0.8.0
    // crate version.
    expect(await usdaLayer.export(internalPayloadCrateFilename)).toBe(true)
    verifyCrateVersion08(internalPayloadCrateFilename)

    const crateLayer = (await Layer.findOrOpen(internalPayloadCrateFilename))!
    const p = prims(crateLayer)
    verifyPayloadList(p.payloadRef1.getPayloadList(), [payload('Payload.usda', '/Parent')])
    verifyPayloadList(p.payloadRef2.getPayloadList(), [payload('Payload2.usda', '/Parent')])
    // No payload
    verifyPayloadList(p.payloadRefNone.getPayloadList(), [])
    // Payload was updated to have an internal payload
    verifyPayloadList(p.payloadNoOpinion.getPayloadList(), [payload('', '/PayloadRef1')])
  })

  it('test_ExportPayloadCrateWithLayerOffset', async () => {
    // Test exporting crate file from a layer with payloads after adding
    // an layer offset to a payload
    const usdaFilename = file('singlePayload.usda')
    const exportCrateFilename = file('exportLayerOffsetPayload.usdc')

    const usdaLayer = (await Layer.findOrOpen(usdaFilename))!
    verifyLayerPrims(usdaLayer)

    // Update the ref1 payload to have a non-empty layer offset
    prims(usdaLayer).payloadRef1.getPayloadList().getExplicitItems().assign([
      payload('Payload.usda', '/Parent', { offset: 12.0, scale: 1.0 })])

    // Export layer to a new crate file and verify that it uses the 0.8.0
    // crate version or newer.
    expect(await usdaLayer.export(exportCrateFilename)).toBe(true)
    verifyCrateVersion08(exportCrateFilename)

    const crateLayer = (await Layer.findOrOpen(exportCrateFilename))!
    const p = prims(crateLayer)
    verifyPayloadList(p.payloadRef1.getPayloadList(),
      [payload('Payload.usda', '/Parent', { offset: 12.0, scale: 1.0 })])
    verifyPayloadList(p.payloadRef2.getPayloadList(), [payload('Payload2.usda', '/Parent')])
    // No payload
    verifyPayloadList(p.payloadRefNone.getPayloadList(), [])
    verifyPayloadList(p.payloadNoOpinion.getPayloadList())
  })

  it('test_ReadAndSaveCrateFileVersion07And08', async () => {
    // Test reading and saving crate files from the prior crate version

    // Copy the test file so we don't pollute other tests.
    const filename = file('crate07SinglePayloadCopy_0708.usdc')
    cpSync(file('crate07SinglePayload.usdc'), filename)

    // Assert the crate file we're going to open is an older version '0.7.0',
    // before payload list op support was added.
    verifyCrateVersion07(filename)

    // Open the crate file layer and verify it matches the single payload
    // prims.
    const layer = (await Layer.findOrOpen(filename))!
    verifyLayerPrims(layer)

    // Change the prim spec with the empty payload to have an explicit single
    // payload list and save the layer.
    prims(layer).payloadRefNone.getPayloadList().getExplicitItems().assign([
      payload('PayloadNew.usda', '/Parent')])
    expect(await layer.save()).toBe(true)

    // Assert that the crate file is still using the same file version after
    // save as a single explicit payload can be expressed in the old version.
    verifyCrateVersion07(filename)

    // Change the prim spec with no payload opinion to do a list op add of
    // a single payload and save the layer.
    prims(layer).payloadNoOpinion.getPayloadList().getAppendedItems().assign([
      payload('PayloadNew.usda', '/Parent')])
    expect(await layer.save()).toBe(true)

    // Assert that the crate file has now been upgraded to the 0.8.0
    // version as we can't represent adds without list ops.
    verifyCrateVersion08(filename)

    // Force reload the saved layer and verify that we have all the prims
    // and payloads we kept and updated.
    await layer.reload(true)
    const p = prims(layer)
    verifyPayloadList(p.payloadRef1.getPayloadList(), [payload('Payload.usda', '/Parent')])
    verifyPayloadList(p.payloadRef2.getPayloadList(), [payload('Payload2.usda', '/Parent')])
    // Updated to have a single explicit payload.
    verifyPayloadList(p.payloadRefNone.getPayloadList(), [payload('PayloadNew.usda', '/Parent')])
    // Updated to have a single appended payload.
    expect(payloads(p.payloadNoOpinion.getPayloadList().getAppendedItems().toArray()))
      .toEqual(payloads([payload('PayloadNew.usda', '/Parent')]))
  })

  it('test_ReadAndSaveCrateFileVersion07And09', async () => {
    // Test that the payload conversion necessary from 07 to 08 files still
    // happens correctly when a change requires a direct upgrade to 09

    // Copy the test file so we don't pollute other tests.
    const filename = file('crate07SinglePayloadCopy_0709.usdc')
    cpSync(file('crate07SinglePayload.usdc'), filename)

    verifyCrateVersion07(filename)

    const layer = (await Layer.findOrOpen(filename))!
    verifyLayerPrims(layer)

    // Add a timecode valued attribute and set its default value. This will
    // require a crate version update.
    const payloadNoOpinion = prims(layer).payloadNoOpinion
    const attr = AttributeSpec.new(payloadNoOpinion, 'TimeCode', ValueTypeNames.TimeCode)
    expect(attr).toBeTruthy()
    attr!.setDefaultValue(new GfTimeCode(10))
    expect(Number(attr!.getDefaultValue())).toBe(10)

    // Save the layer and verify the 0.9 version.
    expect(await layer.save()).toBe(true)
    verifyCrateVersion09(filename)

    // Force reload the saved layer and verify that we have all the prims
    // and all the same payloads exist and that we also have the timecode
    // attribute with its default.
    expect(await layer.reload(true)).toBe(true)
    verifyLayerPrims(layer)
    expect(Number(layer.getPrimAtPath('/PayloadNoOpinion')!.getAttributes().get('TimeCode')!.getDefaultValue())).toBe(10)
  })
})
