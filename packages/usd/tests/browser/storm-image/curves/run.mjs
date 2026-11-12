// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hdSt/testenv/testHdStCurveDrawing.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to JavaScript and modified. See LICENSE and NOTICE.

// Safari run of the ported Storm curve image tests
// (pxr/imaging/hdSt/tests/upstream/testHdStCurveDrawing.ts), in the pattern
// of ../basic-drawing/run.mjs: every registered testHdStCurveDrawing_*
// test (pxr/testing/upstreamTestManifest.json, arguments unchanged) runs in
// one Safari page; each image is compared with the reference build's
// capture (pxr/imaging/hdSt/tests/fixtures/testenvImages/<test>/) under the
// adopted tolerance (imaging-i1.md section 6.3: every channel within 2/255
// and at most 0.5% of pixels differing at all). Writes the images,
// difference images and results.json, prints one line per test, and stops
// the server. Browser test: run by hand, not part of vitest.
//
//   node tests/browser/storm-image/curves/run.mjs --out <dir> [--port 8808] [--filter <substring>]
//       [--browser safari|chrome]  (default safari; chrome: tests/browser/browser.mjs)
import { browserLabel, browserOption, closeBrowser, openPage } from '../../browser.mjs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
const browser = browserOption(args)
const out = path.resolve(opt('out', 'curves-out'))
const port = Number(opt('port', '8808'))
const filter = opt('filter', '')
mkdirSync(out, { recursive: true })
const here = path.dirname(new URL(import.meta.url).pathname)
const repo = path.resolve(here, '../../../..')
const fixtures = path.join(repo, 'pxr/imaging/hdSt/tests/fixtures/testenvImages')
const manifest = JSON.parse(readFileSync(path.join(repo, 'pxr/testing/upstreamTestManifest.json'), 'utf8')).tests
const registered = manifest.filter(t => /^testHdStCurveDrawing(_|$)/.test(t.name) && t.name.includes(filter))
const unsupportedEnv = t => (t.env ?? []).find(e => /^HD_ENABLE_(OPENSUBDIV3_ADAPTIVE|FORCE_QUADRANGULATE)=/.test(e))
const notRun = registered.filter(unsupportedEnv).map(t => ({ name: t.name, reason: `ENV ${unsupportedEnv(t)}` }))
const tests = registered.filter(t => !unsupportedEnv(t)).map(t => {
  // "${CMAKE_INSTALL_PREFIX}/tests/testHdStCurveDrawing --offscreen ..." -> the arguments
  const argv = t.command.split(/\s+/).slice(1).filter(a => a !== '--offscreen')
  return { name: t.name, argv, image: t.imageDiffCompare?.[0] }
})

// --- minimal PNG codec (8-bit RGB/RGBA, non-interlaced), no dependencies ---
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
function compare(test, posted) {
  const file = path.join(fixtures, test.name, test.image)
  if (!existsSync(file)) return { pass: false, error: `no native capture ${path.relative(repo, file)}` }
  const native = decodePng(file)
  if (posted.exception) return { pass: false, error: posted.exception.split('\n')[0] }
  if (!posted.image) return { pass: false, error: 'no image' }
  const { width, height } = posted.image
  const ours = new Uint8Array(Buffer.from(posted.image.rgba, 'base64'))
  if (width !== native.width || height !== native.height) return { pass: false, error: `size ${width}x${height} vs native ${native.width}x${native.height}` }
  const diff = new Uint8Array(native.rgba.length)
  let maxDiff = 0, differing = 0, overTol = 0
  for (let i = 0; i < width * height; i++) {
    let px = 0
    for (let c = 0; c < 4; c++) px = Math.max(px, Math.abs(ours[i * 4 + c] - native.rgba[i * 4 + c]))
    maxDiff = Math.max(maxDiff, px)
    if (px > 0) differing++
    if (px > TOL) overTol++
    const v = Math.min(255, px * 32)
    diff[i * 4] = v; diff[i * 4 + 1] = v; diff[i * 4 + 2] = v; diff[i * 4 + 3] = 255
  }
  writeFileSync(path.join(out, test.image), encodePng(width, height, ours))
  writeFileSync(path.join(out, test.image.replace(/\.png$/, '_diff.png')), encodePng(width, height, diff))
  const fraction = differing / (width * height)
  return { pass: overTol === 0 && fraction <= MAX_FRACTION, maxDiff, differingPixels: differing, fraction: +fraction.toFixed(5), pixelsOverTolerance: overTol, identical: differing === 0 }
}

const results = []
let resolveDone
const done = new Promise(r => { resolveDone = r })
const body = req => new Promise(resolve => { let s = ''; req.on('data', c => { s += c }); req.on('end', () => resolve(s)) })
const server = await createServer({
  root: path.resolve(here, '..'),
  configFile: false,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [path.resolve(here, '../../../../../..')] } },
  plugins: [{
    name: 'curves-sink',
    configureServer(s) {
      s.middlewares.use(async (req, res, next) => {
        if (req.url === '/__tests') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(tests)); return }
        if (req.method === 'POST' && req.url === '/__result') {
          const posted = JSON.parse(await body(req))
          const test = tests.find(t => t.name === posted.name)
          const comparison = compare(test, posted)
          const diagnostics = [...new Set(posted.diagnostics)]
          results.push({ name: test.name, argv: test.argv.join(' '), ...comparison, diagnostics, gpuErrors: posted.gpuErrors, userAgent: posted.userAgent })
          console.log(`${comparison.pass ? 'pass' : 'FAIL'} ${test.name.padEnd(48)} ${comparison.error ?? `over ${TOL}: ${comparison.pixelsOverTolerance} px, differing ${(100 * comparison.fraction).toFixed(2)}%, max ${comparison.maxDiff}`}${diagnostics.length ? ` (${diagnostics.length} distinct diagnostics)` : ''}${posted.gpuErrors?.length ? ` (${posted.gpuErrors.length} WebGPU errors)` : ''}`)
          res.end('ok'); return
        }
        if (req.method === 'POST' && req.url === '/__done') { res.end('ok'); resolveDone(); return }
        next()
      })
    },
  }],
})
try {
  await server.listen()
  const url = `http://127.0.0.1:${port}/curves/index.html`
  console.log(`opening ${url} in ${browserLabel(browser)} (${tests.length} tests; not run: ${notRun.length})`)
  await openPage(browser, url, { out })
  await done
  const summary = { tolerance: { channel: TOL, maxFraction: MAX_FRACTION }, passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, notRun, results }
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(summary, null, 2))
  console.log(`${summary.passed} pass, ${summary.failed} fail, ${notRun.length} not run; ${path.join(out, 'results.json')}`)
} finally {
  await closeBrowser()
  await server.close()
}
