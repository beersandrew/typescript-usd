#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdAppUtils/frameRecorder.cpp
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to JavaScript and modified. See LICENSE and NOTICE.

// Browser asset acceptance: renders real assets through the typescript-usd
// viewer runtime in Safari and compares the pixels with the OpenUSD 26.11.1
// reference build's usdrecord and usdview renders of the same scenes. The
// viewer renders only through the faithful Storm port (imaging-i2.md,
// "Decision: one faithful implementation, no backup renderer"), so the bar is
// the comparison with native OpenUSD. Tooling only (no upstream counterpart).
//
// The native half (steps 1, 2 and 2b) is not in this repository: the capture
// tooling kept outside it (FIXTURES.md at the repository root) writes the
// prepared scenes and the native references into the --out directory, with
// the same --manifest, --width and asset ids; this script then renders and
// scores those scenes. An asset without a prepared scene is skipped.
//
//   node scripts/asset-acceptance/run.mjs [--out DIR] [--manifest FILE]
//       [--width N] [--browser-timeout SECONDS] [--skip-browser]
//       [--port N] [--material-ambient X]
//       [--reference usdview|usdrecord] [--score-reference usdrecord|usdview]
//       [--runs N] [--required-runs N] [--resume] [--group ID] [--perf]
//       [--perf-baseline FILE] [--build] [--browser safari|chrome] [assetId ...]
//
// Run from apps/usdview (paths below are relative to this file, so any cwd works).
// Steps, per asset in the manifest (default assets.json; or the ids given):
//   1. (native half) <out>/<id>/scene.usda and meta.json: the asset
//      subLayered unchanged under a camera /AcceptanceCam framing its bounds;
//   2. (native half) usdrecord --camera /AcceptanceCam -w <width>
//      [--complexity c] wrote <out>/<id>/native.png, native.log and
//      native.json (exit, wall ms, diagnostics). usdrecord's defaults are the reference settings: camera
//      light on (with ambient 0.01), default material (ambient 0.2, specular
//      0.1, shininess 32),
//      sRGB colour correction, clear colour (0,0,0,0), purposes default+proxy,
//      dome light visibility off, the stage start time code, complexity 1.0
//      (usdAppUtils/frameRecorder.cpp:396-468, usdrecord:132-198);
//   2b. (native half) testusdview wrote <out>/<id>/usdview.png and
//      usdview.json: usdview's own StageView with the harness's view settings.
//      usdview is what the viewer follows; its camera light has no ambient,
//      unlike usdrecord's. Each reference is compared
//      with the browser capture lit as it is: usdview.png with browser.png,
//      native.png with browser-usdrecord.png (--reference picks the one the
//      latest-run table shows, default usdview; the report shows both);
//   3. a Vite dev server for this app (the same transforms as `pnpm dev`)
//      serves a driver page and harness.ts, plus the prepared scenes and the
//      manifest's asset roots at their absolute filesystem paths (so the
//      scene's absolute subLayer path resolves over HTTP to the same file);
//      the driver is opened with `open -a Safari` and loads one harness
//      iframe per asset, which posts browser.png and browser.json back; the
//      server is closed when the driver reports done (or on the watchdog);
//      the browser step runs --runs times (default 3); run k is written to
//      <out>/<id>/runs/storm/<k>/ and the latest run is also copied to
//      <out>/<id>/browser.{png,json} (and browser-usdrecord.png, the capture
//      with usdrecord's lighting). Assets with "guard": {"playback": true}
//      also time playback over the stage's time codes (checked by the performance guard, score.mjs);
//   4. report.mjs compares the images and writes <out>/report.html and
//      <out>/report.json, including the verdict against native OpenUSD per
//      asset and overall (score.mjs: matches, differs, fails, incomplete)
//      against --score-reference (default usdrecord).
//   --build renders through the production build instead of the dev server:
//   step 3 first runs `vite build` with this app's vite.config.ts (its
//   plugins, chunking and asset handling, as `pnpm build`) into <out>/dist,
//   with harness.html as one more page input, and serves that output with
//   `vite preview` (static files, no transforms); the driver, the endpoints
//   and the asset roots are the same. The harness page then runs the bundled
//   runtime as the shipped viewer does (its chunks, its import.meta.url
//   resource roots, lazily loaded imaging/MaterialX/image chunks and
//   workers), which the dev server's per-module source layout hides. Use a
//   separate --out for build runs; results are expected to equal the dev
//   server's (README.md, "Production build").
//   --group ID restricts the run to one manifest group (e.g. features).
//   --perf adds the viewer performance measurements (harness.ts perf=1:
//   phase spans, WebGPU allocations, orbit and playback frame times;
//   packages/usd/docs/performance-viewer.md, ../viewer-perf/run.mjs). A
//   perf run preloads the imaging modules, so the performance guard does not
//   read its timings: use separate --out directories for perf and guard runs.
//   --perf-baseline FILE: the performance guard's baseline (score.mjs;
//   default perf-baseline.json here).
//   --browser chrome opens the driver in a separate Google Chrome instance
//   (packages/usd/tests/browser/browser.mjs: fresh profile, its own DevTools port,
//   WebGPU at Chrome's defaults; the Chrome version, GPU and WebGPU adapter go
//   to <out>/chrome-info.json) instead of `open -a Safari`; each reopen of the
//   driver replaces the tab before it. Its default --out is out-chrome, so a
//   Chrome run never writes over Safari's renders.
//   --required-runs N: runs an asset needs to be scored (default 3; the full
//   corpus, assets-corpus.json, runs once: --runs 1 --required-runs 1).
//   --resume keeps what an earlier invocation wrote into --out: the browser
//   step renders only the assets without a result for run k.
//   A stopped tab does not block the rest: the driver posts each asset's
//   start and its steps (browser.log, with the harness page's steps); when
//   nothing arrives for that asset's browser timeout plus 120 s (a page
//   whose main thread is stuck never fires its own timeout), the driver is
//   reopened for the assets of that run without a result (at most 5 times
//   per run). The asset in flight is rendered again there, once; a second
//   stop records it as a timeout ("hung"). A stop with no asset in flight
//   (120 s quiet between a result and the next start) charges no asset.
//   Stops are kept in the asset's browser.json (watchdogStops).
//
// Output defaults to scripts/asset-acceptance/out (gitignored): renders of
// third-party assets are never committed.
// Environment: one variable per manifest root (ASWF, OPENUSD) to move it.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, readFileSync, realpathSync, statSync, writeFileSync, appendFileSync, createReadStream } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserOption, closeBrowser, openPage } from '../../../../packages/usd/tests/browser/browser.mjs'
import { buildReport, printScoring } from './report.mjs'
import { RENDERER } from './score.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(here, '../..')
const args = process.argv.slice(2)
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true }
const option = (name, fallback) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v }
const browser = browserOption(args); option('--browser', null)
const manifestPath = path.resolve(option('--manifest', path.join(here, 'assets.json')))
const out = path.resolve(option('--out', path.join(here, browser === 'chrome' ? 'out-chrome' : 'out')))
const width = Number(option('--width', 512))
const browserTimeoutS = Number(option('--browser-timeout', 300))
const port = Number(option('--port', 5197))
// The viewer's default-material ambient (usdview's 0.2, as usdrecord).
// usdrecord's camera light also carries ambient 0.01
// (usdAppUtils/frameRecorder.cpp:442, SCENE_AMBIENT) while usdview's has none
// (usdviewq/stageView.py:1459-1465). The viewer keeps usdview's lighting;
// the harness captures each asset twice (harness.ts): browser.png with
// usdview's lighting (compared with usdview.png, step 2b) and
// browser-usdrecord.png with the lighting state usdrecord's frame recorder
// hands the engine (runtime.setLightingSource('frameRecorder'), ported in
// src/frame-recorder-lighting.ts), compared with usdrecord's native.png and
// scored (report.mjs). --material-ambient changes only the usdview-lit
// capture's default material (an old experiment).
const materialAmbient = option('--material-ambient', '0.2')
const reference = option('--reference', 'usdview')
const scoreReference = option('--score-reference', 'usdrecord')
const runs = Number(option('--runs', 3))
if (!(runs >= 1)) throw new Error('--runs must be at least 1')
const requiredRuns = Number(option('--required-runs', 3))
const resume = flag('--resume')
const groupOnly = option('--group', null)
const perfMode = flag('--perf')
const buildMode = flag('--build')
const perfBaselineArg = option('--perf-baseline', null)
const perfBaseline = perfBaselineArg ? path.resolve(perfBaselineArg) : null
const skipBrowser = flag('--skip-browser')
const only = new Set(args)

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const assets = manifest.groups.filter(group => !groupOnly || group.id === groupOnly).flatMap(group => group.assets.map(asset => ({ ...asset, group: group.id }))).filter(asset => !only.size || only.has(asset.id))
if (!assets.length) throw new Error('No assets selected')
mkdirSync(out, { recursive: true })

function runProcess(command, argv, { env, cwd, timeoutMs, logPath }) {
  return new Promise(resolve => {
    const start = Date.now()
    const child = spawn(command, argv, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', timedOut = false
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs) : undefined
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (logPath) writeFileSync(logPath, `$ ${command} ${argv.join(' ')}\n--- stdout\n${stdout}\n--- stderr\n${stderr}`)
      resolve({ code: timedOut ? 124 : code, signal, timedOut, ms: Date.now() - start, stdout, stderr })
    })
  })
}

// 1-2b. the native half (the capture tooling outside this repository)
const unprepared = assets.filter(a => !existsSync(path.join(out, a.id, 'scene.usda')))
for (const a of unprepared) console.log(`${a.id}: not prepared in ${out} (run the native half first)`)
if (unprepared.length === assets.length) throw new Error(`No prepared scenes in ${out}: the native half writes them (FIXTURES.md)`)

// 3. browser
if (!skipBrowser) await runBrowser()

// 4. report
const report = buildReport({ manifest, manifestPath, out, assets, width, reference, scoreReference, requiredRuns, ...(perfBaseline ? { perfBaseline } : {}) })
console.log(`report: ${path.join(out, 'report.html')}`)
printScoring(report.summary, report.rows)

async function runBrowser() {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const { createServer, build, preview } = await import(pathToFileURL(createRequire(path.join(app, 'package.json')).resolve('vite')).href)
  // Roots served at their absolute paths: the output folder and every manifest
  // root, each in its literal and real form (/tmp vs /private/tmp).
  // A relative root is relative to the manifest's directory (as prepare.py).
  const rootFor = name => path.resolve(path.dirname(manifestPath), (process.env[name] ?? manifest.roots[name]).replace(/^~/, homedir()))
  const roots = [...new Set([out, ...Object.keys(manifest.roots).map(rootFor)].filter(existsSync).flatMap(r => [path.resolve(r), realpathSync(r)]))]
  const runAssets = assets.filter(a => existsSync(path.join(out, a.id, 'scene.usda')))
  if (!resume) for (const a of runAssets) {
    for (const f of ['browser.png', 'browser-usdrecord.png', 'browser.json']) rmSync(path.join(out, a.id, f), { force: true })
    rmSync(path.join(out, a.id, 'runs', RENDERER), { recursive: true, force: true })
  }
  let currentRun = 1, inFlight = null, lastFinished = null, driverToken = null
  // Watchdog stops of a page, per run and asset (see the watchdog below).
  const stops = new Map(), stopsOf = id => stops.get(`${currentRun}\0${id}`) ?? []
  const runDir = id => { const d = path.join(out, id, 'runs', RENDERER, String(currentRun)); mkdirSync(d, { recursive: true }); return d }
  const hasResult = id => existsSync(path.join(out, id, 'runs', RENDERER, String(currentRun), 'browser.json'))
  const sceneUrl = id => encodeURI(path.join(out, id, 'scene.usda'))
  const metaFor = id => JSON.parse(readFileSync(path.join(out, id, 'meta.json'), 'utf8'))
  const driverAssets = runAssets.map(a => ({ id: a.id, scene: sceneUrl(a.id), complexity: metaFor(a.id).complexity ?? 'low', complexityRoundTrip: metaFor(a.id).complexityRoundTrip ?? null, viewerAxes: metaFor(a.id).viewerAxes ? 1 : 0, timeoutS: a.browserTimeout ?? browserTimeoutS, materialAmbient, playback: a.guard?.playback ? 1 : 0, perf: perfMode ? 1 : 0 }))
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json', '.mtlx': 'application/xml', '.exr': 'image/x-exr', '.hdr': 'image/vnd.radiance' }
  let lastActivity = Date.now(), finished
  let done = new Promise(resolve => { finished = resolve })
  const browserLog = path.join(out, 'browser.log')
  writeFileSync(browserLog, '')
  const body = req => new Promise((resolve, reject) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject) })
  const driverHtml = driverAssets => `<!doctype html><meta charset="utf-8"><title>typescript-usd asset acceptance</title>
<body style="margin:0;background:#111;color:#ccc;font:12px monospace"><pre id="log"></pre>
<script type="module">
const assets = ${JSON.stringify(driverAssets)}, width = ${width}
const log = m => { document.querySelector('#log').textContent += m + '\\n' }
// Each step of the driver goes to browser.log with the server's time, so a
// tab that stops can be placed between two steps.
const trace = (id, step) => fetch('/__acceptance/log?id=' + encodeURIComponent(id), { method: 'POST', body: 'driver: ' + step }).catch(() => {})
for (const asset of assets) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'width:' + (width / devicePixelRatio + 8) + 'px;height:' + (width / devicePixelRatio + 8) + 'px;border:0;display:block'
  const t0 = performance.now()
  const finished = new Promise(r => addEventListener('message', function on(e) { if (e.data?.acceptanceDone === asset.id) { removeEventListener('message', on); r('done') } }))
  await fetch('/__acceptance/start?id=' + encodeURIComponent(asset.id), { method: 'POST', body: '{}' })
  frame.onload = () => { void trace(asset.id, 'harness page loaded') }
  frame.src = '/__acceptance/harness?' + new URLSearchParams({ id: asset.id, scene: asset.scene, w: width, h: width, complexity: asset.complexity, ...(asset.complexityRoundTrip ? { complexityRoundTrip: asset.complexityRoundTrip } : {}), ...(asset.viewerAxes ? { axes: 1 } : {}), ...(asset.materialAmbient ? { ambient: asset.materialAmbient } : {}), ...(asset.playback ? { playback: 1 } : {}), ...(asset.perf ? { perf: 1 } : {}) })
  document.body.prepend(frame)
  const outcome = await Promise.race([finished, new Promise(r => setTimeout(() => r('timeout'), asset.timeoutS * 1000))])
  if (outcome === 'timeout') await fetch('/__acceptance/result?id=' + encodeURIComponent(asset.id), { method: 'POST', body: JSON.stringify({ id: asset.id, outcome: 'timeout', error: 'No result within ' + asset.timeoutS + ' s', timings: { totalMs: Math.round(performance.now() - t0) } }) })
  log(asset.id + ': ' + outcome + ' in ' + Math.round(performance.now() - t0) + ' ms')
  await trace(asset.id, outcome + ', removing the harness page')
  frame.remove()
  await trace(asset.id, 'harness page removed')
  await new Promise(r => setTimeout(r, 500))
}
await fetch('/__acceptance/done?token=' + new URLSearchParams(location.search).get('run'), { method: 'POST', body: '{}' })
log('done: this tab can be closed')
</script>`
  let pending = driverAssets
  const harnessPage = path.join(here, 'harness.html')
  const harnessHtml = readFileSync(harnessPage, 'utf8')
  // --build: the production build, with the harness page as one more input.
  const dist = path.join(out, 'dist')
  const builtHarness = '/' + path.relative(app, harnessPage).split(path.sep).join('/')
  if (buildMode) {
    console.log(`== browser: vite build into ${dist}`)
    await build({
      configFile: path.join(app, 'vite.config.ts'), root: app, logLevel: 'warn', clearScreen: false,
      build: { outDir: dist, emptyOutDir: true, rollupOptions: { input: { 'acceptance-harness': harnessPage } } },
    })
    if (!existsSync(path.join(dist, 'index.html')) || !existsSync(path.join(dist, builtHarness))) throw new Error(`vite build did not write index.html and ${builtHarness} into ${dist}`)
    writeFileSync(path.join(out, 'viewer-build.json'), JSON.stringify({ mode: 'production', dist, harness: builtHarness, builtAt: new Date().toISOString() }, null, 1))
  }
  const middleware = s => async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const id = url.searchParams.get('id') ?? ''
    const safe = /^[A-Za-z0-9_.-]+$/.test(id) && runAssets.some(a => a.id === id)
    try {
      if (url.pathname === '/__acceptance/driver') { res.setHeader('content-type', 'text/html'); res.end(driverHtml(pending)); return }
      if (url.pathname === '/__acceptance/harness') {
        // The built page is served as built, at its own path (its URLs are relative to it).
        if (buildMode) { res.statusCode = 302; res.setHeader('location', builtHarness + url.search); res.end(); return }
        res.setHeader('content-type', 'text/html'); res.end(await s.transformIndexHtml(req.url, harnessHtml)); return
      }
      if (req.method === 'POST' && url.pathname.startsWith('/__acceptance/')) {
        lastActivity = Date.now()
        const data = await body(req)
        if (url.pathname === '/__acceptance/done') { if (url.searchParams.get('token') === driverToken) finished('done'); res.end('ok'); return }
        if (!safe) { res.statusCode = 400; res.end('unknown asset'); return }
        if (url.pathname === '/__acceptance/start') { inFlight = id; res.end('ok'); return }
        if (url.pathname === '/__acceptance/log') appendFileSync(browserLog, `${new Date().toISOString()} run ${currentRun} ${id}: ${data}\n`)
        else if (url.pathname === '/__acceptance/image') {
          // browser.png: usdview's lighting; browser-usdrecord.png: the
          // same view with usdrecord's lighting state (harness.ts).
          const file = url.searchParams.get('lighting') === 'frameRecorder' ? 'browser-usdrecord.png' : 'browser.png'
          writeFileSync(path.join(runDir(id), file), data); writeFileSync(path.join(out, id, file), data)
        }
        else if (url.pathname === '/__acceptance/result') {
          const posted = JSON.parse(data.toString())
          // A result after a watchdog stop says so (the stop is not hidden).
          if (stopsOf(id).length) posted.watchdogStops = stopsOf(id)
          const text = JSON.stringify(posted, null, 1)
          writeFileSync(path.join(runDir(id), 'browser.json'), text); writeFileSync(path.join(out, id, 'browser.json'), text)
          if (inFlight === id) inFlight = null
          lastFinished = id
          // A run without an image must not keep the previous run's PNG.
          for (const f of ['browser.png', 'browser-usdrecord.png']) if (!existsSync(path.join(runDir(id), f))) rmSync(path.join(out, id, f), { force: true })
          console.log(`== browser ${RENDERER} run ${currentRun} ${id}: ${JSON.parse(data.toString()).outcome}`)
        }
        res.end('ok'); return
      }
      const file = decodeURIComponent(url.pathname)
      if (req.method === 'GET' && roots.some(r => file.startsWith(r + path.sep))) {
        lastActivity = Date.now()
        const real = realpathSync(file)
        if (!roots.some(r => real.startsWith(r + path.sep)) || !statSync(real).isFile()) throw new Error('outside roots')
        res.setHeader('content-type', types[path.extname(real).toLowerCase()] ?? 'application/octet-stream')
        res.setHeader('cache-control', 'no-store')
        createReadStream(real).pipe(res); return
      }
    } catch (error) { res.statusCode = 404; res.end(String(error)); return }
    next()
  }
  const plugins = [{ name: 'asset-acceptance', configureServer(s) { s.middlewares.use(middleware(s)) }, configurePreviewServer(s) { s.middlewares.use(middleware(s)) } }]
  const server = buildMode
    ? await preview({ configFile: path.join(app, 'vite.config.ts'), root: app, logLevel: 'warn', clearScreen: false, build: { outDir: dist }, preview: { host: '127.0.0.1', port, strictPort: true, open: false }, plugins })
    : await createServer({ configFile: path.join(app, 'vite.config.ts'), root: app, logLevel: 'warn', clearScreen: false, server: { host: '127.0.0.1', port, strictPort: true, open: false }, plugins })
  if (!buildMode) await server.listen()
  // The quiet time allowed: the browser timeout of the asset in flight plus
  // 120 s; with none in flight (before the first start, between a result and
  // the next start: the driver's own steps, a few seconds), 120 s.
  const quietFor = () => ((driverAssets.find(a => a.id === inFlight)?.timeoutS ?? 0) + 120) * 1000
  const watchdog = setInterval(() => { if (Date.now() - lastActivity > quietFor()) finished('watchdog') }, 5000)
  for (currentRun = 1; currentRun <= runs; currentRun++) {
    for (let restarts = 0; ; restarts++) {
      pending = driverAssets.filter(a => !hasResult(a.id))
      if (!pending.length) break
      // A run's image is posted before its result; clear a stale image first.
      for (const a of pending) for (const f of ['browser.png', 'browser-usdrecord.png']) rmSync(path.join(out, a.id, f), { force: true })
      driverToken = String(Date.now())
      const driver = `http://127.0.0.1:${port}/__acceptance/driver?run=${driverToken}`
      console.log(`== browser ${RENDERER} run ${currentRun} of ${runs}: ${pending.length} assets: ${driver}`)
      lastActivity = Date.now(); inFlight = null
      if (browser === 'safari') await runProcess('open', ['-a', 'Safari', driver], {})
      else await openPage(browser, driver, { out })
      const how = await done
      done = new Promise(resolve => { finished = resolve })
      console.log(`== browser run ${currentRun} finished (${how})`)
      if (how !== 'watchdog') break
      // The tab stopped (its own timers did not fire). With an asset in
      // flight, that asset is rendered again in the reopened driver, once;
      // a second stop in the same run records it as a timeout ("hung"). With
      // none in flight the tab stopped between two assets (after a result,
      // before the next start), which no asset is charged with: the driver
      // is reopened for the assets left. Every stop is in browser.log, and in
      // the asset's result as watchdogStops. The hung tab is left as it is.
      const quietS = quietFor() / 1000
      if (inFlight) {
        const hung = inFlight, key = `${currentRun}\0${hung}`
        const list = [...stopsOf(hung), `run ${currentRun}: no activity for ${quietS} s; the driver was reopened`]
        stops.set(key, list)
        appendFileSync(browserLog, `${new Date().toISOString()} run ${currentRun} ${hung}: page stopped (watchdog, ${quietS} s); ${list.length < 2 ? 'rendering it again' : 'recorded as hung'}\n`)
        console.log(`== browser ${RENDERER} run ${currentRun} ${hung}: page stopped (watchdog); ${list.length < 2 ? 'rendering it again' : 'hung'}`)
        if (list.length >= 2) {
          const text = JSON.stringify({ id: hung, outcome: 'timeout', error: `hung: the page stopped ${list.length} times (no activity for ${quietS} s, watchdog)`, watchdogStops: list, timings: {} }, null, 1)
          writeFileSync(path.join(runDir(hung), 'browser.json'), text); writeFileSync(path.join(out, hung, 'browser.json'), text)
        }
      } else {
        appendFileSync(browserLog, `${new Date().toISOString()} run ${currentRun}: driver stopped between assets, after ${lastFinished ?? 'none'} (watchdog, ${quietS} s); reopened for the rest\n`)
        console.log(`== browser ${RENDERER} run ${currentRun}: driver stopped between assets, after ${lastFinished ?? 'none'} (watchdog); reopened`)
      }
      if (restarts >= 5) { console.log(`== browser run ${currentRun}: giving up after ${restarts} restarts`); break }
    }
  }
  clearInterval(watchdog)
  await closeBrowser()
  await server.close()
  console.log('== browser: server stopped')
}
