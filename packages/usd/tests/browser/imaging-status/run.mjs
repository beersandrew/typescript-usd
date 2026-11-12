#!/usr/bin/env node
// Imaging status ledger: runs every Safari image suite of the repo and the
// viewer's asset acceptance, each under the shared Safari lock (acquired per
// suite and released between suites so other work can use Safari), and writes
// packages/usd/docs/imaging-status.md and imaging-status.json: per upstream
// image test and per asset, pass/fail against native OpenUSD, the differing
// pixels and their share, the largest channel difference, the classified
// cause with its FAITHFULNESS-DEBT tag(s) or owning gap
// (classification.json, maintained by hand with evidence), and the run date
// and commit of each suite; plus the never-run list (upstream image
// registrations with native captures but no runner, and registrations with no
// capture). Tooling only: no upstream OpenUSD counterpart. Browser runs are
// Safari's (`open -a Safari`, inside each runner) unless --browser chrome.
// Renders stay in --out and are never committed.
//
//   node tests/browser/imaging-status/run.mjs [--browser safari|chrome] [--out DIR]
//       [--port 8825] [--lock DIR] [--suites id,id] [--assets curated,corpus|none]
//       [--corpus-chunk 40] [--suite-timeout SECONDS] [--resume] [--ledger-only]
//
//   --browser   safari (default) or chrome: every runner and the asset harness
//               get --browser chrome and open their pages in a separate Google
//               Chrome instance (tests/browser/browser.mjs). Chrome's rows go to
//               docs/imaging-status-chrome.json and to the Chrome section of
//               imaging-status.md (ledger.mjs), never over Safari's; its
//               defaults are --out imaging-status-out-chrome, --port 8845 and
//               no lock. Each Chrome section records the Chrome version and
//               the WebGPU adapter (the runner's chrome-info.json).
//   --out       where every runner writes (default: imaging-status-out under
//               the OS temp folder); one sub-folder per suite and per asset set.
//   --lock      the Safari lock directory (mkdir is the acquire; its removal the
//               release). Default: $SAFARI_LOCK (Safari runs); without one no
//               lock is taken.
//   --suites    run only these suites (ids below, and assets-curated /
//               assets-corpus); the ledger keeps the other suites' rows from
//               the committed imaging-status.json, so a partial run updates
//               only what it ran (every section recorded in --out/runs.json).
//   --assets    asset sets to run: curated (assets.json, 3 runs, scored on 3)
//               and corpus (assets-corpus.json, 1 run, scored on 1); "none"
//               skips the asset acceptance.
//   --resume    reuse renders already in --out (the asset harness's --resume);
//               suites whose results.json exists are not run again.
//   --ledger-only  run nothing; rebuild the ledger from --out.
//
// Run from anywhere: paths are relative to this file. Environment: as the
// runners (ASWF for the asset harness). The asset sets need their prepared
// scenes and native references in <out>/assets-<set> (asset-acceptance/run.mjs
// header).
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserOption } from '../browser.mjs'
import { buildLedger } from './ledger.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = path.resolve(here, '../../..') // packages/usd
const repo = path.resolve(pkg, '../..')
const app = path.join(repo, 'apps/usdview')
const harness = path.join(app, 'scripts/asset-acceptance')

const args = process.argv.slice(2)
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true }
const option = (name, fallback) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v }
const browser = browserOption(args); option('--browser', null)
const chrome = browser === 'chrome'
// Chrome passes --browser chrome on; Safari's command lines are as they were.
const browserArgs = chrome ? ['--browser', 'chrome'] : []
const out = path.resolve(option('--out', path.join(os.tmpdir(), chrome ? 'imaging-status-out-chrome' : 'imaging-status-out')))
const port = option('--port', chrome ? '8845' : '8825')
const lockDir = option('--lock', chrome ? null : process.env.SAFARI_LOCK ?? null)
const onlySuites = option('--suites', null)?.split(',').filter(Boolean) ?? null
const assetSets = option('--assets', 'curated,corpus').split(',').filter(s => s && s !== 'none')
const corpusChunk = Number(option('--corpus-chunk', 40))
const suiteTimeoutS = Number(option('--suite-timeout', 0))
const resume = flag('--resume'), ledgerOnly = flag('--ledger-only')
if (args.length) throw new Error(`unknown arguments: ${args.join(' ')}`)
mkdirSync(out, { recursive: true })

// The Safari image suites: runner script (relative to packages/usd/tests/browser),
// extra arguments, timeout. Every runner takes --out and --port.
const SUITES = [
  { id: 'depth-bias', script: 'storm-image/run.mjs', timeoutS: 600 },
  { id: 'textures', script: 'storm-image/run-textures.mjs', timeoutS: 900 },
  { id: 'lighting-shaders', script: 'storm-image/lighting/run.mjs', args: ['--test', 'shaders'], timeoutS: 600 },
  { id: 'lighting-simple', script: 'storm-image/lighting/run.mjs', args: ['--test', 'simple'], timeoutS: 600 },
  { id: 'basic-drawing', script: 'storm-image/basic-drawing/run.mjs', timeoutS: 600 },
  { id: 'curves', script: 'storm-image/curves/run.mjs', timeoutS: 900 },
  { id: 'hdst-gpu', script: 'storm-image/hdst-gpu/run.mjs', timeoutS: 900 },
  { id: 'tessellator', script: 'storm-image/tessellator/run.mjs', timeoutS: 900 },
  { id: 'hdst-programs', script: 'storm-image/hdst-programs/run.mjs', timeoutS: 900 },
  { id: 'usdimaging-gl', script: 'usdimaging-gl-image/run.mjs', args: ['--timeout', '180'], timeoutS: 5400 },
  { id: 'usdimaging-gl-materialx', script: 'usdimaging-gl-image/run.mjs', args: ['--fixtures', 'materialXImages', '--timeout', '180'], timeoutS: 3600 },
  { id: 'usdimaging-gl-nurbs-tetmesh', script: 'usdimaging-gl-image/run.mjs', args: ['--fixtures', 'nurbsTetMeshImages', '--timeout', '180'], timeoutS: 1800 },
  { id: 'usdimaging-gl-velocity-motion', script: 'usdimaging-gl-image/run.mjs', args: ['--fixtures', 'velocityMotionImages', '--timeout', '180'], timeoutS: 1800 },
  { id: 'hdx', script: 'hdx-image/run.mjs', timeoutS: 3600 },
]

const commit = (() => {
  try {
    const head = execFileSync('git', ['-C', repo, 'rev-parse', '--short=10', 'HEAD'], { encoding: 'utf8' }).trim()
    // Uncommitted edits to the ledger tooling itself (this folder, the asset
    // harness) do not change what is rendered; any other edit marks the run.
    const dirty = execFileSync('git', ['-C', repo, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' })
      .split('\n').filter(Boolean).map(l => l.slice(3))
      .filter(f => !f.startsWith('packages/usd/tests/browser/imaging-status/') && !f.startsWith('packages/usd/docs/imaging-status.') && !f.startsWith('packages/usd/docs/imaging-status-chrome.')
        && f !== 'packages/usd/tests/browser/browser.mjs' && !f.startsWith('apps/usdview/scripts/asset-acceptance/'))
    return dirty.length ? `${head}+dirty` : head
  } catch { return 'unknown' }
})()
const today = () => new Date().toISOString().slice(0, 10)
// A Chrome section's browser and adapter (tests/browser/browser.mjs chrome-info.json).
function chromeInfo(dir) {
  if (!chrome) return {}
  let info = null
  try { info = JSON.parse(readFileSync(path.join(dir, 'chrome-info.json'), 'utf8')) } catch { return { chrome: null, adapter: null } }
  const a = info.webgpu?.info
  return { chrome: info.version?.product ?? null, adapter: a ? [a.vendor, a.architecture, a.device, a.description].filter(Boolean).join(' ') : info.webgpu?.error ?? null }
}
const runsFile = path.join(out, 'runs.json')
const runs = existsSync(runsFile) ? JSON.parse(readFileSync(runsFile, 'utf8')) : {}
const saveRuns = () => writeFileSync(runsFile, JSON.stringify(runs, null, 1))

// --- Safari lock ---
let holding = false
async function acquire(what) {
  if (!lockDir) return
  for (let waited = 0; ; waited++) {
    try { mkdirSync(lockDir); break } catch (e) { if (e.code !== 'EEXIST') throw e }
    if (waited % 20 === 0) {
      let owner = ''; try { owner = readFileSync(path.join(lockDir, 'owner'), 'utf8').trim() } catch {}
      console.log(`   waiting for the Safari lock (held by ${owner || 'unknown'})`)
    }
    await new Promise(r => setTimeout(r, 15_000))
  }
  holding = true
  writeFileSync(path.join(lockDir, 'owner'), `imaging-status ${process.pid} ${what} ${new Date().toString()}\n`)
}
function release() {
  if (!lockDir || !holding) return
  // Only a lock this process still owns (another track may have taken over
  // a lock it judged stale).
  let owner = ''
  try { owner = readFileSync(path.join(lockDir, 'owner'), 'utf8') } catch {}
  if (owner.startsWith(`imaging-status ${process.pid} `)) rmSync(lockDir, { recursive: true, force: true })
  else console.log(`   the Safari lock is no longer ours (${owner.trim() || 'gone'}); not removing it`)
  holding = false
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { release(); process.exit(130) })
process.on('exit', release)

function run(command, argv, { cwd, timeoutS, log }) {
  return new Promise(resolve => {
    const start = Date.now()
    const child = spawn(command, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    let text = '', timedOut = false
    const onData = d => { text += d; process.stdout.write(d.toString().split('\n').filter(Boolean).map(l => `   ${l}\n`).join('')) }
    child.stdout.on('data', onData); child.stderr.on('data', onData)
    // The whole process group: a runner's Vite server must not outlive it.
    const timer = timeoutS ? setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL') } catch {} }, timeoutS * 1000) : null
    child.on('close', code => {
      clearTimeout(timer)
      if (log) writeFileSync(log, `$ ${command} ${argv.join(' ')}\n${text}`)
      resolve({ code: timedOut ? 124 : code, timedOut, ms: Date.now() - start })
    })
  })
}

async function runSuite(suite) {
  const script = path.join(pkg, 'tests/browser', suite.script)
  if (!existsSync(script)) {
    if (!suite.optional) console.log(`== ${suite.id}: runner ${suite.script} missing`)
    return
  }
  const dir = path.join(out, 'suites', suite.id)
  if (resume && existsSync(path.join(dir, 'results.json'))) { console.log(`== ${suite.id}: results present (--resume)`); return }
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  await acquire(suite.id)
  console.log(`== ${suite.id}: ${suite.script} ${(suite.args ?? []).join(' ')}`)
  let r
  try {
    r = await run(process.execPath, [script, '--out', dir, '--port', port, ...(suite.args ?? []), ...browserArgs],
      { cwd: pkg, timeoutS: suiteTimeoutS || suite.timeoutS, log: path.join(dir, 'runner.log') })
  } finally { release() }
  runs[suite.id] = { date: today(), commit, exit: r.code, timedOut: r.timedOut, wallS: Math.round(r.ms / 1000), ...chromeInfo(dir) }
  saveRuns()
  console.log(`== ${suite.id}: exit ${r.code}${r.timedOut ? ' (timed out)' : ''} in ${Math.round(r.ms / 1000)} s`)
}

const assetRun = (argv, opts) => run(process.execPath, [path.join(harness, 'run.mjs'), ...argv], { cwd: app, ...opts })
const assetIds = manifestPath => JSON.parse(readFileSync(manifestPath, 'utf8')).groups.flatMap(g => g.assets.map(a => a.id))

async function runAssets(set) {
  const corpus = set === 'corpus'
  const manifest = path.join(harness, corpus ? 'assets-corpus.json' : 'assets.json')
  const dir = path.join(out, `assets-${set}`)
  const common = ['--manifest', manifest, '--out', dir, '--port', port]
  const start = Date.now()
  // The prepared scenes and native references are written into <dir> by the
  // asset harness's native half, with the capture tooling kept outside this
  // repository (FIXTURES.md); the corpus needs no usdview references.
  if (!assetIds(manifest).some(id => existsSync(path.join(dir, id, 'scene.usda')))) {
    console.log(`== assets-${set}: skipped, no prepared scenes in ${dir} (run the native half into it first)`)
    return
  }
  // The browser: under the lock, in chunks for the corpus.
  const harnessArgs = corpus ? ['--runs', '1', '--required-runs', '1', '--browser-timeout', '120', '--resume'] : ['--runs', '3', ...(resume ? ['--resume'] : [])]
  const ids = assetIds(manifest)
  const chunks = corpus ? Array.from({ length: Math.ceil(ids.length / corpusChunk) }, (_, k) => ids.slice(k * corpusChunk, (k + 1) * corpusChunk)) : [[]]
  let hung = 0
  for (const [k, chunk] of chunks.entries()) {
    await acquire(`assets-${set} ${k + 1}/${chunks.length}`)
    console.log(`== assets-${set}: browser ${chunks.length > 1 ? `chunk ${k + 1} of ${chunks.length}` : ''}`)
    try {
      const r = await assetRun([...common, ...harnessArgs, ...browserArgs, ...chunk],
        { log: path.join(out, `assets-${set}-browser-${k + 1}.log`), timeoutS: corpus ? 3600 : 7200 })
      if (r.code !== 0) console.log(`== assets-${set}: browser exit ${r.code}${r.timedOut ? ' (timed out)' : ''}`)
      // Every watchdog stop of the tab (asset-acceptance/run.mjs header).
      hung += (readFileSync(path.join(out, `assets-${set}-browser-${k + 1}.log`), 'utf8').match(/\(watchdog\)/g) ?? []).length
    } finally { release() }
  }
  // The report over every asset (each chunk's report covered only its chunk).
  await run(process.execPath, [path.join(harness, 'report.mjs'), '--manifest', manifest, '--out', dir, '--runs', corpus ? '1' : '3',
    ...(corpus ? ['--reference', 'usdrecord'] : [])], { cwd: app, log: path.join(out, `assets-${set}-report.log`) })
  runs[`assets-${set}`] = { date: today(), commit, wallS: Math.round((Date.now() - start) / 1000), hung, ...chromeInfo(dir) }
  saveRuns()
}

const started = Date.now()
if (!ledgerOnly) {
  for (const suite of SUITES) if (!onlySuites || onlySuites.includes(suite.id)) await runSuite(suite)
  for (const set of assetSets) if (!onlySuites || onlySuites.includes(`assets-${set}`)) await runAssets(set)
}
// The sections run into this --out (runs.json) replace theirs in the
// committed ledger; every other section is kept as it was.
const ledger = buildLedger({ out, runs, suites: SUITES, pkg, harness, browser })
console.log(`ledger: ${ledger.md} and ${ledger.json} (${Math.round((Date.now() - started) / 1000)} s)`)
