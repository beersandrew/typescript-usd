// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/testenv/testHdxRenderTask.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to JavaScript and modified. See LICENSE and NOTICE.

// Safari runs of the ported hdx testenv programs
// (pxr/imaging/hdx/tests/upstream/testHdx*.ts): serves main.ts with Vite on
// 127.0.0.1, opens it in Safari (`open -a Safari`; or
// Chrome, --browser chrome) once per test, collects the images each program
// writes with Hdx_UnitTestDelegate::WriteRenderBufferToFile and its exit
// status and stdout, compares each image with the native capture of the
// reference build (pxr/imaging/hdx/tests/fixtures/testenvImages/<test>/,
// capture.json records the native exit status) under the adopted tolerance
// (imaging-i1.md section 6.3: every channel within 2/255 and at most 0.5% of
// pixels differing at all), writes our images, difference images and
// results.json, and stops the server.
//
//   node tests/browser/hdx-image/run.mjs --out <dir> [--port 8813] [--timeout 180] [--test testHdxRenderTask,...]
//       [--browser safari|chrome]  (default safari; chrome: tests/browser/browser.mjs)
import { browserLabel, browserOption, closeBrowser, openPage } from '../browser.mjs'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
const browser = browserOption(args)
const out = path.resolve(opt('out', 'hdx-image-out'))
const port = Number(opt('port', '8813'))
const here = path.dirname(new URL(import.meta.url).pathname)
const repo = path.resolve(here, '../../..')
const fixtures = path.resolve(repo, 'pxr/imaging/hdx/tests/fixtures/testenvImages')
const programs = path.resolve(repo, 'pxr/imaging/hdx/tests/upstream')
const timeoutS = Number(opt('timeout', '180'))
// The tests are hdx's registrations (pxr/testing/upstreamTestManifest.json,
// from hdx/CMakeLists.txt pxr_register_test): each runs its program with the
// registration's arguments and ENV, and is compared on exactly the images
// the registration lists (IMAGE_DIFF_COMPARE). A registration whose program
// is not ported is listed as not run.
const ported = new Set(readdirSync(programs).filter(f => /^testHdx\w+\.ts$/.test(f)).map(f => f.replace(/\.ts$/, '')))
const only = opt('test', '').split(',').filter(Boolean)
const registrations = JSON.parse(readFileSync(path.join(repo, 'pxr/testing/upstreamTestManifest.json'), 'utf8')).tests
  .filter(t => t.library === 'hdx' && (!only.length || only.includes(t.name)))
  .map(t => {
    const [command, ...argv] = t.command.split(/\s+/)
    // TF_DEBUG only selects debug output (the stdout comparison removes it);
    // the other variables are TfEnvSettings the page sets
    // (pxr/base/tf/src/envSetting.ts reads globalThis.process.env).
    const env = Object.fromEntries((t.env ?? []).map(e => e.split('=')).filter(([k, v]) => /^[A-Z][A-Z0-9_]*$/.test(k) && k !== 'TF_DEBUG' && v !== undefined))
    return { name: t.name, program: path.basename(command), argv, env, images: t.imageDiffCompare ?? [], expectedReturnCode: Number(t.expectedReturnCode ?? 0) }
  })
const tests = registrations.filter(t => ported.has(t.program))
const notRun = registrations.filter(t => !ported.has(t.program)).map(t => ({ name: t.name, reason: `program ${t.program} not ported` }))
mkdirSync(out, { recursive: true })

// --- minimal PNG codec (8-bit gray/RGB/RGBA, non-interlaced), no dependencies ---
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
function compare(test, name, image) {
  const file = path.join(fixtures, test, name)
  const ours = new Uint8Array(Buffer.from(image.rgba, 'base64'))
  writeFileSync(path.join(out, `${test}_${name}`), encodePng(image.width, image.height, ours))
  if (!existsSync(file)) return { image: name, pass: false, error: `no native capture ${path.relative(repo, file)}` }
  const native = decodePng(file)
  const { width, height } = image
  if (width !== native.width || height !== native.height) return { image: name, pass: false, error: `size ${width}x${height} vs native ${native.width}x${native.height}` }
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
  writeFileSync(path.join(out, `${test}_${name.replace(/\.png$/, '_diff.png')}`), encodePng(width, height, diff))
  const fraction = differing / (width * height)
  return { image: name, pass: overTol === 0 && fraction <= MAX_FRACTION, maxDiff, differingPixels: differing, fraction: +fraction.toFixed(5), pixelsOverTolerance: overTol, identical: differing === 0 }
}

const results = []
let resolveDone, currentRun = null
const body = req => new Promise(resolve => { let s = ''; req.on('data', c => { s += c }); req.on('end', () => resolve(s)) })
const server = await createServer({
  root: here,
  configFile: false,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [path.resolve(repo, '../..')] } },
  plugins: [{
    name: 'hdx-image-sink',
    configureServer(s) {
      s.middlewares.use(async (req, res, next) => {
        if (req.method === 'POST' && req.url === '/__result') {
          const posted = JSON.parse(await body(req))
          res.end('ok')
          // Only the page of the test in flight: a page that outlived its
          // test's timeout (Safari keeps its tab running) posts later, and
          // must not be taken for the next test's result (its images were
          // once recorded under the next test's name).
          if (posted.run === currentRun) resolveDone?.(posted)
          else console.log(`   ignored a late result of ${posted.test} (page ${posted.run})`)
          return
        }
        next()
      })
    },
  }],
})
try {
  await server.listen()
  for (const reg of tests) {
    const test = reg.name
    const capture = existsSync(path.join(fixtures, test, 'capture.json'))
      ? JSON.parse(readFileSync(path.join(fixtures, test, 'capture.json'), 'utf8')).payload : null
    const done = new Promise(r => { resolveDone = r })
    currentRun = `${test}-${Date.now()}`
    const url = `http://127.0.0.1:${port}/index.html?` + new URLSearchParams({ test: reg.program, argv: JSON.stringify(reg.argv), env: JSON.stringify(reg.env), run: currentRun })
    await openPage(browser, url, { out })
    const timeout = new Promise(r => setTimeout(() => r({ exception: `timeout (${timeoutS} s)` }), timeoutS * 1000))
    const posted = await Promise.race([done, timeout])
    const written = posted.images ?? {}
    // Exactly the registration's images: a registered image not written is
    // missing; an image the registration does not list is an error row.
    const images = Object.entries(written).map(([name, image]) => reg.images.includes(name) ? compare(test, name, image)
      : { image: name, pass: false, error: `not registered: ${test} compares ${reg.images.join(', ') || 'no images'}` })
    const missing = reg.images.filter(n => !(n in written))
    // The native stdout, less the GL vendor, renderer and version lines
    // HdSt_UnitTestWindow::OnInitializeGL prints
    // (hdSt/unitTestGLDrawing.cpp:72-74); compared as a multiset of lines,
    // since the programs print hits in hash-map order. The TF_DEBUG output
    // the registration enables (HD_SELECTION_UPDATE, hd/selection.cpp;
    // HDX_SELECTION_SETUP, hdx/selectionTracker.cpp) is removed.
    const nativeLines = capture?.stdout != null
      ? capture.stdout
        .replace(/Adding [^\n]*? to HdSelection \(mode \d+\)( with point color index -?\d+)?/g, '')
        .split('\n').filter(l => !l.startsWith('nothing selected:')).slice(capture.command.includes('--offscreen') ? 3 : 0).filter(Boolean).sort() : null
    const ourLines = (posted.stdout ?? '').split('\n').filter(Boolean).sort()
    const stdoutMatchesNative = nativeLines ? JSON.stringify(nativeLines) === JSON.stringify(ourLines) : null
    const result = {
      stdoutMatchesNative,
      test, status: posted.status ?? null, nativeStatus: capture?.returnCode ?? null, nativeStdout: capture?.stdout ?? null,
      stdout: posted.stdout ?? '', exception: posted.exception ?? null,
      images, missingImages: missing,
      pass: !posted.exception && missing.length === 0 && images.every(i => i.pass) && (posted.status ?? 1) === reg.expectedReturnCode,
      diagnostics: [...new Set(posted.diagnostics ?? [])], gpuErrors: posted.gpuErrors ?? [], userAgent: posted.userAgent,
    }
    results.push(result)
    console.log(`${result.pass ? 'pass' : 'FAIL'} ${test} status ${result.status} (native ${result.nativeStatus})${stdoutMatchesNative === null ? '' : `, stdout ${stdoutMatchesNative ? 'matches' : 'differs from'} native`}${result.exception ? ` exception: ${result.exception.split('\n')[0]}` : ''}`)
    for (const i of images) console.log(`   ${i.pass ? 'pass' : 'FAIL'} ${i.image.padEnd(44)} ${i.error ?? `over ${TOL}: ${i.pixelsOverTolerance} px, differing ${(100 * i.fraction).toFixed(2)}%, max ${i.maxDiff}`}`)
    if (missing.length) console.log(`   missing: ${missing.join(', ')}`)
    if (result.diagnostics.length) console.log(`   ${result.diagnostics.length} distinct diagnostics: ${result.diagnostics.slice(0, 3).join(' | ').slice(0, 400)}`)
    if (result.gpuErrors.length) console.log(`   ${result.gpuErrors.length} WebGPU errors: ${result.gpuErrors[0].slice(0, 300)}`)
  }
  for (const n of notRun) console.log(`not run ${n.name}: ${n.reason}`)
  writeFileSync(path.join(out, 'results.json'), JSON.stringify({ tolerance: { channel: TOL, maxFraction: MAX_FRACTION }, results, notRun }, null, 2))
} finally {
  await closeBrowser()
  // The page's HMR socket can keep server.close() waiting; do not hold the
  // Safari lock on it.
  await Promise.race([server.close(), new Promise(r => setTimeout(r, 5000))])
  process.exit(0)
}
