// Native Hio OpenEXR reads (fixtures/openexrHio: files written by
// the OpenUSD 26.11.1 install's OpenEXR library, read by HioImage::OpenForReading /
// Read of OpenUSD 26.11.1's hioOpenEXR plugin) through HioImage's
// asynchronous open: every compression the vendored OpenEXRCore decodes,
// half / float / uint pixels, channel layouts, line orders, tiles and mips,
// multipart files, flipped, cropped and resized reads.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { TfDiagnosticMgr } from 'typescript-usd/tf'
import { HioImage, HioImageMakeStorageSpec } from '../src/index.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

const root = new URL('./fixtures/openexrHio/', import.meta.url)
const native = readOracleFixture(new URL('expected.json', root))

interface Mip {
  mip: number, open: boolean, width?: number, height?: number, format?: number, bytesPerPixel?: number,
  numMipLevels?: number, srgb?: boolean, wrapU?: number, read?: boolean, diagnostics: string[],
  flip?: boolean, crop?: boolean, resize?: boolean
}

async function withDiagnostics<T>(fn: () => Promise<T>): Promise<{ result: T, messages: string[] }> {
  const messages: string[] = []
  const mgr = TfDiagnosticMgr.GetInstance()
  const delegate = {
    issueError(e: { getCommentary(): string }) { messages.push('error: ' + e.getCommentary()) },
    issueFatalError() {}, issueStatus() {},
    issueWarning(w: { getCommentary(): string }) { messages.push('warning: ' + w.getCommentary()) },
  }
  mgr.addDelegate(delegate as never)
  try {
    return { result: await fn(), messages }
  } finally {
    mgr.removeDelegate(delegate as never)
  }
}

function read(image: HioImage, w: number, h: number, flipped: boolean, crop: number[] | null): { ok: boolean, data: Uint8Array } {
  const storage = HioImageMakeStorageSpec()
  storage.width = w; storage.height = h; storage.depth = 1
  storage.format = image.GetFormat()
  storage.flipped = flipped
  const data = new Uint8Array(w * h * Math.max(0, image.getBytesPerPixel())).fill(0xcd)
  storage.data = data
  const ok = crop ? image.ReadCropped(crop[0]!, crop[1]!, crop[2]!, crop[3]!, storage) : image.Read(storage)
  return { ok, data }
}

const bin = (name: string) => new Uint8Array(readFileSync(new URL(name, root)))
// Warnings exactly (the file named by its base name, as captured); coding
// errors as the set of messages (their count depends on how often a call
// chain asks for the invalid format's sizes).
const warnings = (m: string[]) => m.filter(s => s.startsWith('warning: ')).map(s => s.replace(/[^ "(]*\/(?=[^/ ]*\.exr)/g, ''))
const errors = (m: string[]) => [...new Set(m.filter(s => s.startsWith('error: ')))].sort()

for (const c of native.cases as { name: string, extra: string[], mips: Mip[] }[]) {
  it(`reads ${c.name}.exr as native Hio does`, async () => {
    const file = fileURLToPath(new URL(`${c.name}.exr`, root))
    for (const m of c.mips) {
      const { result: image, messages } = await withDiagnostics(async () => {
        const image = await HioImage.openForReadingAsync(file, 0, m.mip)
        if (!image) return null
        const r = read(image, image.getWidth(), image.getHeight(), false, null)
        const extra: Record<string, { ok: boolean, data: Uint8Array }> = {}
        if (m.mip === 0) {
          for (const mode of c.extra) {
            const w = image.getWidth(), h = image.getHeight()
            extra[mode] = mode === 'flip' ? read(image, w, h, true, null)
              : mode === 'crop' ? read(image, w - 4, h - 3, false, [1, 2, 3, 1])
              : read(image, Math.trunc(w / 2), Math.trunc(h / 2), false, null)
          }
        }
        return { image, r, extra }
      })
      const label = `${c.name} mip ${m.mip}`
      expect(!!image, label).toBe(m.open)
      expect(warnings(messages), label).toEqual(warnings(m.diagnostics))
      expect(errors(messages), label).toEqual(errors(m.diagnostics))
      if (!image) continue
      const img = image.image
      expect([img.getWidth(), img.getHeight(), img.GetFormat(), img.getBytesPerPixel(), img.getNumMipLevels(),
        img.isColorSpaceSRGB(), img.getSamplerMetadata(0)], label)
        .toEqual([m.width, m.height, m.format, m.bytesPerPixel, m.numMipLevels, m.srgb, m.wrapU])
      expect(image.r.ok, label).toBe(m.read)
      expect(Buffer.from(image.r.data).equals(Buffer.from(bin(`${c.name}.${m.mip}.bin`))), `${label} pixels`).toBe(true)
      for (const mode of m.mip === 0 ? c.extra : []) {
        expect(image.extra[mode]!.ok, `${label} ${mode}`).toBe(m[mode as 'flip'])
        const want = bin(`${c.name}.${mode}.bin`)
        const got = image.extra[mode]!.data
        let diff = 0
        for (let i = 0; i < want.length; i++) if (want[i] !== got[i]) diff++
        expect(diff, `${label} ${mode} differing bytes of ${want.length}`).toBe(0)
      }
    }
  })
}

// Not a native capture: nanoexr_read_header asks a deep scanline part for
// its tile levels (openexr-c.c:304-318), which OpenEXRCore refuses
// (EXR_ERR_TILE_SCAN_MIXEDAPI), so the open fails with upstream's warning.
// (Deep tiled parts get past the header; the port's decode refuses them,
// openexrCore.ts header.)
it('diagnoses a deep scanline file instead of reading it', async () => {
  const file = fileURLToPath(new URL('deep-scanline.exr', root))
  const { result, messages } = await withDiagnostics(() => HioImage.openForReadingAsync(file))
  expect(result).toBeNull()
  expect(warnings(messages)).toEqual(['warning: Cannot open image "deep-scanline.exr" for reading,  operation: nanoexr_get_tile_levels. result: EXR_ERR_TILE_SCAN_MIXEDAPI'])
})
