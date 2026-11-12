// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLBasicDrawing.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to JavaScript and modified. See LICENSE and NOTICE.

// Safari run of the registered usdImagingGL image tests that use the
// testUsdImagingGLBasicDrawing program (pxr/usdImaging/usdImagingGL/
// CMakeLists.txt), against the native captures committed in
// pxr/usdImaging/usdImagingGL/tests/fixtures/testenvImages (captured from the
// OpenUSD 26.11.1 reference build; FIXTURES.md). Serves main.ts with Vite on 127.0.0.1, serves each test's
// testenv directory from the pinned OpenUSD source tree as its working
// directory, opens the page in Safari (`open -a Safari`; or
// Chrome, --browser chrome), collects the written images, compares each with the
// native capture under the I-1 tolerance (packages/usd/docs/imaging-i2.md
// section 3: every channel within 2/255 and at most 0.5% of pixels differing
// at all), writes the images, difference images and results.json, and stops
// the server. Tooling only.
//
//   node tests/browser/usdimaging-gl-image/run.mjs --out <dir> [--port 8814]
//       [--browser safari|chrome]  (default safari; chrome: tests/browser/browser.mjs)
//     [--tests <regex>] [--openusd <OpenUSD 26.11.1 checkout>] [--timeout 240]
//     [--fixtures materialXImages]
// --fixtures names another capture directory beside testenvImages (e.g.
// materialXImages, the testUsdImagingGLMaterialX* captures).
import { browserLabel, browserOption, closeBrowser, openPage } from '../browser.mjs'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt }
const browser = browserOption(args)
const out = path.resolve(opt('out', 'usdimaging-gl-image-out'))
const port = Number(opt('port', '8814'))
const select = new RegExp(opt('tests', '.*'))
const timeoutSec = Number(opt('timeout', '240'))
const openusd = path.resolve(opt('openusd', process.env.OPENUSD_SOURCE ?? new URL('../../../../../../OpenUSD-26.11.1', import.meta.url).pathname).replace(/^~/, os.homedir()))
const testenvRoot = path.join(openusd, 'pxr/usdImaging/usdImagingGL/testenv')
mkdirSync(out, { recursive: true })
const here = path.dirname(new URL(import.meta.url).pathname)
const fixtures = path.resolve(here, '../../../pxr/usdImaging/usdImagingGL/tests/fixtures', opt('fixtures', 'testenvImages'))

// The registered tests of the program, from the captures' records.
const PROGRAM = 'testUsdImagingGLBasicDrawing'
// The registrations' ENV entries are applied in the page (main.ts sets them
// as the environment TfGetEnvSetting reads), except these: TF_DEBUG only adds
// debug output, and HGIGL_ENABLE_BINDLESS_TEXTURE is an HgiGL setting
// (hgiGL/capabilities.cpp) with no HgiWebGPU counterpart.
const IGNORED_ENV = new Set(['TF_DEBUG', 'HGIGL_ENABLE_BINDLESS_TEXTURE'])
const tests = [], notRun = []
for (const name of readdirSync(fixtures).sort()) {
  const capture = path.join(fixtures, name, 'capture.json')
  if (!existsSync(capture) || !select.test(name)) continue
  const p = JSON.parse(readFileSync(capture, 'utf8')).payload
  const argv = p.command.split(/\s+/)
  argv[0] = path.basename(argv[0])
  const cwd = p.cwd.split('/').pop()
  const env = Object.fromEntries(Object.entries(p.env).filter(([k]) => !IGNORED_ENV.has(k)))
  const envNotApplied = Object.fromEntries(Object.entries(p.env).filter(([k]) => IGNORED_ENV.has(k)))
  const declared = p.images.filter(i => i.written && !i.nondeterministic).map(i => i.name)
  if (argv[0] !== PROGRAM) { notRun.push({ name, reason: `program ${argv[0]} (not ${PROGRAM})` }); continue }
  if (/^(false|0)$/i.test(env.USDIMAGINGGL_ENGINE_ENABLE_SCENE_INDEX ?? '')) {
    notRun.push({ name, reason: 'USDIMAGINGGL_ENGINE_ENABLE_SCENE_INDEX=false: the UsdImagingDelegate path is not ported' }); continue
  }
  tests.push({ name, argv, cwd, env, envNotApplied, images: declared })
}

// --- minimal PNG codec (8-bit gray/RGB/RGBA, non-interlaced), as storm-image/run.mjs ---
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
function decodePng(file) {
  const b = readFileSync(file)
  let p = 8, width = 0, height = 0, colorType = 0
  const idat = []
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
  return { width, height, channels: ch, data: img }
}
function encodePng(width, height, channels, data) {
  const chunk = (type, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), d]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : channels === 3 ? 2 : 0
  const stride = width * channels, raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) Buffer.from(data.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// packages/usd/docs/imaging-i2.md section 3 (I-1's tolerance)
const TOL = 2, MAX_FRACTION = 0.005
function compare(test, imageName, ours) {
  const nativeFile = path.join(fixtures, test, imageName)
  if (!existsSync(nativeFile)) return { image: imageName, pass: false, error: 'no native capture for this image' }
  const native = decodePng(nativeFile)
  if (!ours) return { image: imageName, pass: false, error: 'not written' }
  if (ours.width !== native.width || ours.height !== native.height) return { image: imageName, pass: false, error: `size ${ours.width}x${ours.height} vs native ${native.width}x${native.height}` }
  if (ours.channels !== native.channels) return { image: imageName, pass: false, error: `${ours.channels} channels vs native ${native.channels}` }
  const n = native.width * native.height, ch = native.channels
  const diff = new Uint8Array(n * 4)
  let maxDiff = 0, differing = 0, overTol = 0
  for (let i = 0; i < n; i++) {
    let px = 0
    for (let c = 0; c < ch; c++) px = Math.max(px, Math.abs(ours.data[i * ch + c] - native.data[i * ch + c]))
    maxDiff = Math.max(maxDiff, px)
    if (px > 0) differing++
    if (px > TOL) overTol++
    const v = Math.min(255, px * 32)
    diff[i * 4] = v; diff[i * 4 + 1] = v; diff[i * 4 + 2] = v; diff[i * 4 + 3] = 255
  }
  const dir = path.join(out, test)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, imageName), encodePng(native.width, native.height, ch, ours.data))
  writeFileSync(path.join(dir, imageName.replace(/\.png$/, '_diff.png')), encodePng(native.width, native.height, 4, diff))
  const fraction = differing / n
  return { image: imageName, pass: overTol === 0 && fraction <= MAX_FRACTION, maxDiff, differingPixels: differing,
    fraction: Math.round(fraction * 1e6) / 1e6, pixelsOverTolerance: overTol, identical: differing === 0 }
}

const images = new Map() // test -> Map(name -> {width, height, channels, data})
const records = new Map()
let waiting = null
const notify = () => { const w = waiting; waiting = null; w?.() }
let allDone = false

const server = await createServer({
  root: here,
  configFile: false,
  logLevel: 'warn',
  server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [path.resolve(here, '../../../../..')] } },
  plugins: [{
    name: 'usdimaging-gl-image',
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://x')
        if (req.method === 'GET' && url.pathname === '/__tests') {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(tests.map(({ name, argv, cwd, env }) => ({ name, argv, cwd, env }))))
          return
        }
        if (req.method === 'GET' && url.pathname === '/__testenvFiles') {
          // The files of a test's working directory, relative to it, for the
          // page's resolver: ArDefaultResolver checks files synchronously
          // (defaultResolver.cpp:126-160 CreateIdentifier), which HTTP cannot.
          const dir = path.resolve(testenvRoot, url.searchParams.get('cwd') ?? '')
          const files = []
          const walk = (d, rel) => {
            for (const name of readdirSync(d)) {
              const full = path.join(d, name)
              if (statSync(full).isDirectory()) walk(full, rel + name + '/')
              else files.push(rel + name)
            }
          }
          if (dir.startsWith(testenvRoot + path.sep) && existsSync(dir)) walk(dir, '')
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(files))
          return
        }
        if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/__testenv/')) {
          // The test's working directory: a read of the pinned testenv
          // directory (the native run used a copy of it).
          const rel = decodeURIComponent(url.pathname.slice('/__testenv/'.length))
          const file = path.resolve(testenvRoot, rel)
          if (!file.startsWith(testenvRoot + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
            res.statusCode = 404; res.end(); return
          }
          res.end(readFileSync(file))
          return
        }
        if (req.method === 'POST' && ['/__image', '/__result', '/__done'].includes(url.pathname)) {
          const chunks = []
          req.on('data', c => chunks.push(c))
          req.on('end', () => {
            res.end('ok')
            const body = Buffer.concat(chunks)
            if (url.pathname === '/__image') {
              const test = url.searchParams.get('test'), name = url.searchParams.get('name')
              const header = JSON.parse(url.searchParams.get('header'))
              if (!images.has(test)) images.set(test, new Map())
              images.get(test).set(name, { ...header, data: new Uint8Array(body) })
            } else if (url.pathname === '/__result') {
              const r = JSON.parse(body.toString())
              records.set(r.name, r)
              notify()
            } else {
              allDone = true
              notify()
            }
          })
          return
        }
        next()
      })
    },
  }],
})

const results = []
try {
  await server.listen()
  const base = `http://127.0.0.1:${port}/index.html`
  console.log(`${tests.length} tests; opening ${base} in ${browserLabel(browser)}`)
  await openPage(browser, `${base}?i=0`, { out })
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i]
    const started = Date.now()
    while (!records.has(t.name) && !allDone && Date.now() - started < timeoutSec * 1000) {
      await new Promise(r => { waiting = r; setTimeout(r, 1000) })
    }
    const record = records.get(t.name)
    if (!record) {
      console.log(`${t.name}: timeout`)
      results.push({ name: t.name, status: 'timeout', env: t.env })
      await openPage(browser, `${base}?i=${i + 1}`, { out })
      continue
    }
    const written = images.get(t.name) ?? new Map()
    const comparisons = t.images.map(name => compare(t.name, name, written.get(name)))
    const pass = !record.exception && comparisons.length > 0 && comparisons.every(c => c.pass)
    const r = {
      name: t.name, status: pass ? 'pass' : 'fail', command: t.argv.join(' '),
      env: Object.keys(t.env).length ? t.env : undefined,
      envNotApplied: Object.keys(t.envNotApplied).length ? t.envNotApplied : undefined,
      exitCode: record.exitCode, exception: record.exception, ms: record.ms,
      comparisons, diagnostics: record.diagnostics, gpuErrors: record.gpuErrors,
      renderIndex: record.renderIndex, stdout: record.stdout,
    }
    results.push(r)
    const worst = comparisons.map(c => c.error ?? `${c.pass ? 'ok' : 'FAIL'} max ${c.maxDiff} ${(c.fraction * 100).toFixed(3)}%`).join('; ')
    console.log(`${t.name}: ${r.status} (${worst}${record.exception ? `; exception ${record.exception.split('\n')[0]}` : ''})`)
  }
} finally {
  await closeBrowser()
  await server.close()
  const summary = {
    tolerance: { channel: TOL, maxFraction: MAX_FRACTION },
    passed: results.filter(r => r.status === 'pass').map(r => r.name),
    failed: results.filter(r => r.status !== 'pass').map(r => r.name),
    notRun, results,
  }
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(summary, null, 2))
  console.log(`pass ${summary.passed.length} / ${results.length}; not run ${notRun.length}; results in ${path.join(out, 'results.json')}`)
}
