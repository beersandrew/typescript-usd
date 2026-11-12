// HioImage reads through Ar against native OpenUSD 26.11.1's HioImage
// (fixtures/imageAr): hdx's default dome light texture
// StinsonBeach.hdr (Radiance .hdr), the testUsdImagingGLDomeLight
// testImage.png, and hdSt's fallbackBlackDomeLight.png, which Ar opens as the
// plugin resource file it is (ar/src/platformFilesystem.ts). Each image's
// properties and a whole-image Read(), unflipped and flipped, are compared
// with the native read's sha256 and sampled words.
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HioImage, HioImageMakeStorageSpec } from '../src/hioImage.ts'
import { HdSt_RegisterShaderResources } from '../../hdSt/src/shaderResources.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

HdSt_RegisterShaderResources()

interface Read { flipped: boolean, ok: boolean, size: number, sha256: string, samples: number[] }
interface Case {
  file: string, width: number, height: number, format: number, bytesPerPixel: number,
  numMipLevels: number, sRGB: boolean, reads: Read[]
}
const native = readOracleFixture<{ cases: Case[] }>(new URL('./fixtures/imageAr/expected.json', import.meta.url))

function tsPath(file: string): string {
  return file.startsWith('<install>/lib/usd/')
    ? file.replace('<install>/lib/usd/', '/usd/')
    : fileURLToPath(new URL(`./fixtures/imageAr/${file}`, import.meta.url))
}

describe('HioImage reads through Ar as native OpenUSD 26.11.1 reads', () => {
  for (const c of native.cases) {
    it(c.file, async () => {
      const image = await HioImage.openForReadingAsync(tsPath(c.file))
      expect(image).not.toBeNull()
      expect({
        width: image!.getWidth(), height: image!.getHeight(), format: image!.GetFormat(),
        bytesPerPixel: image!.getBytesPerPixel(), numMipLevels: image!.getNumMipLevels(),
        sRGB: image!.isColorSpaceSRGB(),
      }).toEqual({
        width: c.width, height: c.height, format: c.format, bytesPerPixel: c.bytesPerPixel,
        numMipLevels: c.numMipLevels, sRGB: c.sRGB,
      })
      const reads = c.reads.map(({ flipped }) => {
        const storage = HioImageMakeStorageSpec()
        storage.width = image!.getWidth()
        storage.height = image!.getHeight()
        storage.depth = 1
        storage.format = image!.GetFormat()
        storage.flipped = flipped
        storage.data = new Uint8Array(storage.width * storage.height * image!.getBytesPerPixel())
        const ok = image!.Read(storage)
        const data = storage.data
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
        const samples: number[] = []
        for (let offset = 0; offset < data.length - 3; offset += 997 * 4) samples.push(view.getUint32(offset, true))
        return {
          flipped, ok, size: data.length,
          sha256: createHash('sha256').update(data).digest('hex'), samples,
        }
      })
      expect(reads).toEqual(c.reads)
    })
  }
})
