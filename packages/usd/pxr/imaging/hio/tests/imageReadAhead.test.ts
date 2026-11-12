// PLATFORM-DIVERGENCE(hio-image-read-ahead) (src/stbImage.ts): an image read
// and decoded ahead opens from what was read, with the properties and pixels
// of native OpenUSD 26.11.1's read (fixtures/imageAr), and without
// reading the asset again; once released it is read at its open as before.
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { HioImage, HioImageMakeStorageSpec } from '../src/hioImage.ts'
import { _HioImagesReadAhead, _HioReadImageAhead, _HioReleaseImageAhead } from '../src/internal.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

interface Read { flipped: boolean, ok: boolean, size: number, sha256: string }
interface Case { file: string, width: number, height: number, format: number, sRGB: boolean, reads: Read[] }
const native = readOracleFixture<{ cases: Case[] }>(new URL('./fixtures/imageAr/expected.json', import.meta.url))
const png = native.cases.find(c => c.file === 'testImage.png')!
const path = fileURLToPath(new URL('./fixtures/imageAr/testImage.png', import.meta.url))

async function openAndRead(): Promise<Record<string, unknown>> {
  const image = await HioImage.openForReadingAsync(path)
  expect(image).not.toBeNull()
  const storage = HioImageMakeStorageSpec()
  storage.width = image!.getWidth()
  storage.height = image!.getHeight()
  storage.depth = 1
  storage.format = image!.GetFormat()
  storage.data = new Uint8Array(storage.width * storage.height * image!.getBytesPerPixel())
  const ok = image!.Read(storage)
  return {
    width: image!.getWidth(), height: image!.getHeight(), format: image!.GetFormat(), sRGB: image!.isColorSpaceSRGB(),
    ok, sha256: createHash('sha256').update(storage.data).digest('hex'),
  }
}
const expected = { width: png.width, height: png.height, format: png.format, sRGB: png.sRGB, ok: true, sha256: png.reads.find(r => !r.flipped)!.sha256 }

describe('HioImage read ahead (hio-image-read-ahead)', () => {
  afterEach(() => { _HioReleaseImageAhead(path); vi.restoreAllMocks() })

  it('opens an image read ahead from what was read, as native OpenUSD reads it', async () => {
    await _HioReadImageAhead(path)
    expect(_HioImagesReadAhead()).toContain(path)
    const openAsset = vi.spyOn(ArGetResolver(), 'openAsset')
    expect(await openAndRead()).toEqual(expected)
    expect(openAsset).not.toHaveBeenCalled()
    // Held until released: a second open uses it too.
    expect(await openAndRead()).toEqual(expected)
    expect(openAsset).not.toHaveBeenCalled()
  })

  it('reads a released image at its open', async () => {
    await _HioReadImageAhead(path)
    _HioReleaseImageAhead(path)
    expect(_HioImagesReadAhead()).not.toContain(path)
    const openAsset = vi.spyOn(ArGetResolver(), 'openAsset')
    expect(await openAndRead()).toEqual(expected)
    expect(openAsset).toHaveBeenCalledTimes(1)
  })

  it('leaves an image that cannot be read to its open', async () => {
    const missing = fileURLToPath(new URL('./fixtures/imageAr/missing.png', import.meta.url))
    await _HioReadImageAhead(missing)
    expect(await HioImage.openForReadingAsync(missing, 0, 0, undefined, true)).toBeNull()
    _HioReleaseImageAhead(missing)
  })
})
