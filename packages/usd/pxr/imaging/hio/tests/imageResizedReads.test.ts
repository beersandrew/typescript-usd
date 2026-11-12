// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/udimTextureObject.cpp,
//  pxr/imaging/hio/stbImage.cpp
// Copyright 2018, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// One HioImage read into successively smaller storage, as
// HdStUdimTextureObject fills a UDIM tile's mips from the image it opened
// (hdSt/udimTextureObject.cpp:206-219), against native OpenUSD 26.11.1's
// HioImage (fixtures/imageResizedReads): each read resizes from
// the whole image, whatever an earlier read resized to
// (stbImage.cpp:442-458,491-534).
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { HioImage, HioImageMakeStorageSpec } from '../src/hioImage.ts'
import { HioGetDataSize } from '../src/types.ts'
import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

interface Read { width: number, height: number, ok: boolean, size: number, sha256: string, samples: number[] }
const native = readOracleFixture<{ file: string, width: number, height: number, format: number, reads: Read[] }>(
  new URL('./fixtures/imageResizedReads/expected.json', import.meta.url))

describe('HioImage resized reads of one image as native OpenUSD 26.11.1 reads', () => {
  it(native.file, async () => {
    const image = await HioImage.openForReadingAsync(
      fileURLToPath(new URL(`./fixtures/imageAr/${native.file}`, import.meta.url)))
    expect(image).not.toBeNull()
    expect([image!.getWidth(), image!.getHeight(), image!.GetFormat()])
      .toEqual([native.width, native.height, native.format])
    for (const read of native.reads) {
      const spec = HioImageMakeStorageSpec()
      spec.width = read.width
      spec.height = read.height
      spec.format = image!.GetFormat()
      spec.flipped = true
      spec.data = new Uint8Array(HioGetDataSize(spec.format, new GfVec3i(read.width, read.height, 1)))
      expect(image!.Read(spec), `${read.width}x${read.height}`).toBe(read.ok)
      const data = spec.data
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      const words: number[] = []
      for (let offset = 0; offset + 3 < data.length; offset += 997 * 4) words.push(view.getUint32(offset, true))
      expect({ size: data.length, sha256: createHash('sha256').update(data).digest('hex'), samples: words },
        `${read.width}x${read.height}`).toEqual({ size: read.size, sha256: read.sha256, samples: read.samples })
    }
  })
})
