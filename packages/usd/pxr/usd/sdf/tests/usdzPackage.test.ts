// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfZipFile.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdZipFile / createUsdzPackage round trips: zip parsing, USDZ alignment,
// the default-layer rule, and writer/reader round trips (not an upstream
// test; the port of testSdfZipFile.py is upstream/zipFile.test.ts).

import { describe, expect, it } from 'vitest'
import { UsdZipFile, createUsdzPackage } from 'typescript-usd/sdf'

const enc = new TextEncoder()
const dec = new TextDecoder()

function makePackage() {
  return createUsdzPackage([
    { name: 'model.usdc', data: enc.encode('PXR-binary-placeholder') },
    { name: 'textures/diffuse.png', data: enc.encode('png-bytes-here') },
    { name: 'textures/normal.png', data: new Uint8Array(1000).fill(7) },
  ])
}

describe('createUsdzPackage / UsdZipFile round-trip', () => {
  it('round-trips entry names and contents', async () => {
    const zip = UsdZipFile.fromBytes(makePackage())
    expect(zip.entryNames).toEqual(['model.usdc', 'textures/diffuse.png', 'textures/normal.png'])

    expect(dec.decode(await zip.extract('model.usdc'))).toBe('PXR-binary-placeholder')
    expect(dec.decode(await zip.extract('textures/diffuse.png'))).toBe('png-bytes-here')
    const normal = await zip.extract('textures/normal.png')
    expect(normal.length).toBe(1000)
    expect(normal[999]).toBe(7)
  })

  it('aligns every entry\'s file data to 64 bytes (USDZ spec)', () => {
    const zip = UsdZipFile.fromBytes(makePackage())
    for (const name of zip.entryNames) {
      const entry = zip.getEntry(name)!
      expect(entry.dataOffset % 64, `${name} at ${entry.dataOffset}`).toBe(0)
      expect(entry.compressionMethod).toBe(0)   // stored
    }
  })

  it('starts with the zip local-header magic (isZip)', () => {
    const bytes = makePackage()
    expect(UsdZipFile.isZip(bytes)).toBe(true)
    expect(UsdZipFile.isZip(enc.encode('#usda 1.0'))).toBe(false)
  })

  it('defaultLayerName returns the first usd-ish entry', () => {
    const zip = UsdZipFile.fromBytes(makePackage())
    expect(zip.defaultLayerName()).toBe('model.usdc')

    const texturesFirst = UsdZipFile.fromBytes(createUsdzPackage([
      { name: 'thumb.png', data: enc.encode('img') },
      { name: 'scene.usda', data: enc.encode('#usda 1.0') },
    ]))
    expect(texturesFirst.defaultLayerName()).toBe('scene.usda')
  })

  it('throws a clear error for missing entries and non-zips', async () => {
    const zip = UsdZipFile.fromBytes(makePackage())
    await expect(zip.extract('nope.png')).rejects.toThrow(/no entry/)
    expect(() => UsdZipFile.fromBytes(enc.encode('not a zip at all, definitely'))).toThrow(/end-of-central-directory/)
  })

  it('handles empty files and many entries', async () => {
    const files = Array.from({ length: 40 }, (_, i) => ({
      name: `f${i}.bin`,
      data: new Uint8Array(i).fill(i),
    }))
    const zip = UsdZipFile.fromBytes(createUsdzPackage(files))
    expect(zip.entryNames.length).toBe(40)
    expect((await zip.extract('f0.bin')).length).toBe(0)
    expect((await zip.extract('f39.bin')).length).toBe(39)
    for (const name of zip.entryNames) {
      expect(zip.getEntry(name)!.dataOffset % 64).toBe(0)
    }
  })
})
