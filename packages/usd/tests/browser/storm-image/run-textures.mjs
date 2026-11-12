// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStDynamicUvTexture.cpp,
//  pxr/imaging/hdSt/testenv/testHdStSamplerObjectRegistry.cpp,
//  pxr/imaging/hdSt/testenv/testHdStTextureHandleRegistry.cpp,
//  pxr/imaging/hdSt/testenv/testHdStTextureObjectRegistry.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to JavaScript and modified. See LICENSE and NOTICE.

// Safari run of the ported Storm texture image tests
// (testHdStTextureObjectRegistry, testHdStTextureHandleRegistry,
// testHdStSamplerObjectRegistry, testHdStDynamicUvTexture; see textures.ts)
// in the pattern of run.mjs (packages/usd/docs/imaging-i1.md section 6.4,
// browser tests): serves textures.ts with Vite on 127.0.0.1, opens it in
// Safari (`open -a Safari`), waits for the posted images, compares each with
// the native capture (pxr/imaging/hdSt/tests/fixtures/textureImages, from the
// reference build) under the adopted tolerance (imaging-i1.md section 6.3:
// every channel within 2/255 and at most 0.5% of pixels differing at all),
// writes the images, difference images and results.json, and stops the
// server.
//
//   node tests/browser/storm-image/run-textures.mjs --out <dir> [--port 8801] [--test <name>]
//       [--browser safari|chrome]  (default safari; chrome: tests/browser/browser.mjs)
import { browserLabel, browserOption, closeBrowser, openPage } from '../browser.mjs'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
const browser = browserOption(args)
const out = path.resolve(opt('out', 'storm-texture-out'))
const port = Number(opt('port', '8801'))
const only = opt('test', '')
mkdirSync(out, { recursive: true })
const here = path.dirname(new URL(import.meta.url).pathname)
const fixtures = path.resolve(here, '../../../pxr/imaging/hdSt/tests/fixtures/textureImages')
const codegenFixtures = path.resolve(here, '../../../pxr/imaging/hdSt/tests/fixtures/texturedCodegen')

// --- minimal PNG codec (8-bit gray/RGB/RGBA, non-interlaced), as run.mjs ---
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
function decodePng(file) {
  const b = readFileSync(file)
  let p = 8, width = 0, height = 0, colorType = 0, idat = []
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8), data = b.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported png') }
    if (type === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0
  if (!ch) throw new Error(`png color type ${colorType}`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * ch, img = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? img[y * stride + x - ch] : 0, up = y ? img[(y - 1) * stride + x] : 0, ul = y && x >= ch ? img[(y - 1) * stride + x - ch] : 0
      let v = row[x]
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1
      else if (f === 4) { const pp = a + up - ul, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - ul); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : ul }
      img[y * stride + x] = v & 0xff
    }
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) for (let c = 0; c < 4; c++) rgba[i * 4 + c] = c < ch ? img[i * ch + c] : (ch === 1 && c < 3 ? img[i] : 255)
  return { width, height, rgba }
}
function encodePng(width, height, rgba) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)).copy(raw, y * (width * 4 + 1) + 1)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// imaging-i1.md section 6.3
const TOL = 2, MAX_FRACTION = 0.005
function compare(test, name, ours) {
  const nativeFile = test === 'texturedCodegen' ? path.join(codegenFixtures, name) : path.join(fixtures, test, name)
  if (!existsSync(nativeFile)) return { test, name, pass: false, error: 'no native image' }
  const native = decodePng(nativeFile)
  if (!ours) return { test, name, pass: false, error: 'no image' }
  if (ours.width !== native.width || ours.height !== native.height) return { test, name, pass: false, error: `size ${ours.width}x${ours.height} vs native ${native.width}x${native.height}` }
  const ourRgba = Buffer.from(ours.rgba, 'base64')
  const diff = new Uint8Array(native.rgba.length)
  let maxDiff = 0, differing = 0, overTol = 0
  for (let i = 0; i < native.width * native.height; i++) {
    let px = 0
    for (let c = 0; c < 4; c++) px = Math.max(px, Math.abs(ourRgba[i * 4 + c] - native.rgba[i * 4 + c]))
    maxDiff = Math.max(maxDiff, px)
    if (px > 0) differing++
    if (px > TOL) overTol++
    const v = Math.min(255, px * 32)
    diff[i * 4] = v; diff[i * 4 + 1] = v; diff[i * 4 + 2] = v; diff[i * 4 + 3] = 255
  }
  mkdirSync(path.join(out, test), { recursive: true })
  writeFileSync(path.join(out, test, name), encodePng(native.width, native.height, new Uint8Array(ourRgba)))
  writeFileSync(path.join(out, test, name.replace(/\.png$/, '_diff.png')), encodePng(native.width, native.height, diff))
  const fraction = differing / (native.width * native.height)
  return { test, name, pass: overTol === 0 && fraction <= MAX_FRACTION, maxDiff, differingPixels: differing, fraction, pixelsOverTolerance: overTol, identical: differing === 0 }
}

const OUTPUTS = {
  testHdStTextureObjectRegistry: ['outTexture1FullRes.png', 'outTexture1LowRes.png', 'outTexture1Reloaded.png', 'outTexture2.png', 'outGrayscaleTexture.png'],
  testHdStTextureHandleRegistry: ['outTextureBasic.png', 'outTextureSampler1LowRes.png', 'outTextureSampler1.png', 'outTextureSampler2.png', 'outTextureBeforeFileChange.png', 'outTextureAfterFileChange.png', 'outTextureAfterReload.png', 'outTextureWithLowGlobalMemoryRequest.png', 'outTextureWithHighGlobalMemoryRequest.png'],
  testHdStSamplerObjectRegistry: ['outSampler1.png', 'outSampler2.png', 'outHiResSampler.png'],
  testHdStDynamicUvTexture: ['outTextureDarkBlue.png', 'outTextureLightBlue.png'],
  texturedCodegen: ['texturedGrid.png'],
}

let resolveDone
const runId = String(Date.now())
const done = new Promise(r => { resolveDone = r })
const server = await createServer({
  root: here,
  configFile: false,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [path.resolve(here, '../../../../..')] } },
  plugins: [{
    name: 'storm-texture-sink',
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        if (req.method === 'POST' && req.url === '/__result') {
          const chunks = []
          req.on('data', c => { chunks.push(c) })
          req.on('end', () => {
            res.end('ok')
            // Only this run's page: a tab left from an earlier run on the same
            // port (Vite's client reloads it when a new server comes up) posts
            // too, and must not be taken for this run's result.
            const text = Buffer.concat(chunks).toString('utf8')
            let posted = null
            try { posted = JSON.parse(text) } catch {}
            if (posted?.run === runId) resolveDone(text)
            else console.log(`ignored a result from another page (run ${posted?.run ?? 'none'})`)
          })
          return
        }
        if (req.method === 'GET' && req.url === '/__codegenFixtures/texture.png') {
          res.setHeader('Cache-Control', 'no-store')
          res.end(readFileSync(path.join(codegenFixtures, 'texture.png')))
          return
        }
        if (req.method === 'GET' && req.url?.startsWith('/__fixtures/')) {
          const rel = decodeURIComponent(req.url.slice('/__fixtures/'.length))
          const file = path.resolve(fixtures, rel)
          if (!file.startsWith(fixtures + path.sep) || !existsSync(file)) { res.statusCode = 404; res.end(); return }
          res.setHeader('Cache-Control', 'no-store')
          res.end(readFileSync(file))
          return
        }
        next()
      })
    },
  }],
})
try {
  await server.listen()
  const url = `http://127.0.0.1:${port}/textures.html?` + new URLSearchParams({ run: runId, ...(only ? { test: only } : {}) })
  console.log(`opening ${url} in ${browserLabel(browser)}`)
  await openPage(browser, url, { out })
  const r = JSON.parse(await done)
  const comparisons = []
  const tests = {}
  for (const [test, names] of Object.entries(OUTPUTS)) {
    if (only && only !== test) continue
    const result = r.results?.[test]
    tests[test] = { ok: result?.ok ?? false, exception: result?.exception ?? null }
    for (const name of names) comparisons.push(compare(test, name, result?.images?.[name]))
  }
  const summary = { userAgent: r.userAgent, exception: r.exception ?? null, tests, diagnostics: r.diagnostics, gpuErrors: r.gpuErrors, tolerance: { channel: TOL, maxFraction: MAX_FRACTION }, comparisons }
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ ...summary, diagnostics: (summary.diagnostics ?? []).slice(0, 30) }, null, 2))
} finally {
  await closeBrowser()
  await server.close()
}
