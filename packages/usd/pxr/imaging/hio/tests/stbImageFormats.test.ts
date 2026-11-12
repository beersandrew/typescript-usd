// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stbImage.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Expected pixels captured from the stb_image copy OpenUSD 26.11.1's
// Hio_StbImage compiles, decoding as stbi_load_from_memory(..., 0)
// (pxr/imaging/hio/stbImage.cpp:454-456): JPEG, BMP and TGA images (stb's
// failure reasons included); see fixtures/stbImageFormats.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stbi_load_from_memory } from '../src/stbImageDecode.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

interface Case {
  file: string
  fileSha256: string
  width?: number
  height?: number
  channels?: number
  sha256?: string
  pixels?: string
  error?: string
}

const root = new URL('./fixtures/stbImageFormats/', import.meta.url)
const fixture = readOracleFixture(new URL('expected.json', root)) as { cases: Case[] }
const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')
const hex = (data: Uint8Array): string => Buffer.from(data).toString('hex')

describe('stb_image JPEG, BMP and TGA decoding matches the native Hio build', () => {
  for (const c of fixture.cases) {
    const label = c.error ? `${c.file} is rejected (${c.error})` :
      `${c.file} decodes to ${c.width}x${c.height}x${c.channels}`
    it(label, async () => {
      const bytes = new Uint8Array(readFileSync(new URL(c.file, root)))
      expect(sha256(bytes)).toBe(c.fileSha256)
      let reason: string | null = null
      const image = await stbi_load_from_memory(bytes, (r) => { reason = r })
      if (c.error) {
        expect(image).toBeNull()
        expect(reason).toBe(c.error)
        return
      }
      expect(image).not.toBeNull()
      expect({ width: image!.width, height: image!.height, channels: image!.channels })
        .toEqual({ width: c.width, height: c.height, channels: c.channels })
      expect(image!.data.length).toBe(c.width! * c.height! * c.channels!)
      if (c.pixels !== undefined) expect(hex(image!.data)).toBe(c.pixels)
      expect(sha256(image!.data)).toBe(c.sha256)
    })
  }
})
