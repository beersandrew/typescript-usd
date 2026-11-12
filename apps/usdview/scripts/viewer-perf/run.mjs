#!/usr/bin/env node
// Viewer performance measurements (packages/usd/docs/performance-viewer.md):
// the Node (CPU only) half, and the summary that joins it with the native
// OpenUSD 26.11.1 and Safari halves. Tooling only.
//
//   node scripts/viewer-perf/run.mjs --prep DIR --out DIR [--safari DIR]
//       [--runs N] [--orbit N] [--playback N] [--skip-node] [assetId ...]
//
//   --prep DIR   prepared scenes (<DIR>/<id>/scene.usda with /AcceptanceCam):
//                the asset harness's native half, run with the
//                capture tooling kept outside this repository (FIXTURES.md),
//                with --manifest scripts/viewer-perf/assets.json.
//   --safari DIR asset-acceptance output directories of the Safari runs:
//                DIR/guard (3 runs, no --perf: open, first frame, settled,
//                last-frame CPU, playback) and DIR/perf (one --perf run:
//                phases, orbit, playback, memory). Either may be absent.
// Steps:
//   1. native: not in this repository. The capture tooling's native half
//      (viewerPerf.cpp: UsdImagingGLEngine, Storm on HgiMetal, --runs fresh
//      processes per asset) writes <id>.native into --out/results.json, which
//      this script keeps;
//   2. node: node.ts bundled with Vite (SSR, source maps) and run --runs
//      times per asset in fresh processes, then once more with each step
//      under the V8 sampling profiler (its times are not used); each
//      profile's self time (profile.mjs) and
//      inclusive time (inclusive.mjs) are mapped to library sources;
//   3. summary.json and summary.md in --out: per asset, native, Node and
//      Safari medians and the Safari / native ratios.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(here, '../..')
const repo = path.resolve(app, '../..')
const args = process.argv.slice(2)
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true }
const option = (name, fallback) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v }
const prep = path.resolve(option('--prep', ''))
const out = path.resolve(option('--out', path.join(here, 'out')))
const safari = option('--safari', null)
const runs = Number(option('--runs', 5))
const orbit = Number(option('--orbit', 60))
const playback = Number(option('--playback', 120))
const skipNode = flag('--skip-node')
const manifest = JSON.parse(readFileSync(path.join(here, 'assets.json'), 'utf8'))
const only = new Set(args)
const assets = manifest.groups.flatMap(g => g.assets).filter(a => !only.size || only.has(a.id)).filter(a => existsSync(path.join(prep, a.id, 'scene.usda')))
if (!assets.length) throw new Error(`no prepared scenes in ${prep}`)
mkdirSync(path.join(out, 'build'), { recursive: true })
const median = v => { const s = v.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null }
const lastJson = text => JSON.parse(text.trim().split('\n').filter(l => l.startsWith('{')).at(-1))
const results = existsSync(path.join(out, 'results.json')) ? JSON.parse(readFileSync(path.join(out, 'results.json'), 'utf8')) : {}
const save = () => writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1))
const metaFor = id => JSON.parse(readFileSync(path.join(prep, id, 'meta.json'), 'utf8'))

// 2. node
if (!skipNode) {
  const { build } = await import(pathToFileURL(createRequire(path.join(app, 'package.json')).resolve('vite')).href)
  await build({ configFile: false, root: app, logLevel: 'warn', ssr: { noExternal: true, target: 'node' },
    resolve: { conditions: ['node', 'import'] },
    build: { ssr: path.join(here, 'node.ts'), outDir: path.join(out, 'build/node'), emptyOutDir: true, minify: false, target: 'esnext', sourcemap: true,
      rollupOptions: { output: { entryFileNames: 'node.mjs', inlineDynamicImports: true } } } })
  const bundle = path.join(out, 'build/node/node.mjs')
  const { summarizeProfile } = await import('./profile.mjs')
  const { inclusiveProfile } = await import('./inclusive.mjs')
  for (const asset of assets) {
    const meta = metaFor(asset.id)
    const list = []
    const profDir = path.join(out, 'profiles', asset.id)
    mkdirSync(profDir, { recursive: true })
    for (let k = 0; k <= runs; k++) {
      // The last run is profiled (the sampling profiler slows it: its times are not used).
      const profiling = k === runs
      const prof = profiling ? ['--profile-dir', profDir] : []
      const r = spawnSync(process.execPath, ['--max-old-space-size=16384', bundle, path.join(prep, asset.id, 'scene.usda'), '--orbit', String(orbit), '--playback', String(playback), '--complexity', meta.complexity ?? 'low', ...prof],
        { encoding: 'utf8', timeout: 1800_000, maxBuffer: 64 << 20 })
      if (r.status !== 0) { console.error(r.stderr.slice(-3000)); list.push({ error: `exit ${r.status}: ${r.stderr.split('\n').find(l => /Error/.test(l)) ?? ''}` }); continue }
      if (!profiling) list.push(lastJson(r.stdout))
    }
    ;(results[asset.id] ??= {}).node = list
    results[asset.id].nodeProfile = Object.fromEntries(['open', 'firstRender', 'orbit', 'playback'].map(step => [step, path.join(profDir, `${step}.cpuprofile`)])
      .filter(([, file]) => existsSync(file)).map(([step, file]) => [step, { ...summarizeProfile(file, `${bundle}.map`, 40), inclusive: inclusiveProfile(file, `${bundle}.map`, 80).top }]))
    console.log(`node ${asset.id}: first render ${median(list.map(x => x.firstRenderMs))?.toFixed(1)} ms, orbit ${median(list.map(x => x.orbit?.medianMs))?.toFixed(2)} ms`)
    save()
  }
}

// 3. summary
const readRuns = (dir, id) => {
  const base = path.join(dir, id, 'runs', 'storm')
  if (!existsSync(base)) return []
  return readdirSync(base).map(k => path.join(base, k, 'browser.json')).filter(existsSync).map(f => JSON.parse(readFileSync(f, 'utf8'))).filter(r => r.outcome === 'captured')
}
const firstRenderSpans = ['materialx-module', 'open', 'storm-coverage', 'profile-claims', 'imaging-module', 'scene-indices', 'validation-render']
const moduleSpans = ['materialx-module', 'imaging-module']
const summary = {}
for (const asset of assets) {
  const r = results[asset.id] ?? {}
  const nat = (r.native ?? []).filter(x => !x.error), nod = (r.node ?? []).filter(x => !x.error)
  const guard = safari ? readRuns(path.join(safari, 'guard'), asset.id) : []
  const perfRun = safari ? readRuns(path.join(safari, 'perf'), asset.id).at(-1) : undefined
  const sm = key => median(guard.map(g => g.timings?.[key]))
  const openStart = sm('openStartMs')
  summary[asset.id] = {
    label: asset.label,
    native: nat.length ? {
      runs: nat.length, openMs: median(nat.map(x => x.openMs)), firstDrawMs: median(nat.map(x => x.firstDrawSinceOpenMs)), firstRenderCpuMs: median(nat.map(x => x.firstRenderCpuMs)),
      settledMs: median(nat.map(x => x.settledSinceOpenMs)), orbitCpuMs: median(nat.map(x => x.orbit?.cpuMs?.median)), orbitFrameMs: median(nat.map(x => x.orbit?.frameMs?.median)),
      playbackCpuMs: median(nat.map(x => x.playback?.cpuMs?.median)), playbackFrameMs: median(nat.map(x => x.playback?.frameMs?.median)),
      gpuMemoryUsed: median(nat.map(x => x.gpuMemoryUsed?.load)), maxRssBytes: median(nat.map(x => x.maxRssBytes)),
    } : null,
    node: nod.length ? {
      runs: nod.length, openMs: median(nod.map(x => x.openMs)), firstRenderMs: median(nod.map(x => x.firstRenderMs)), firstDrawMs: median(nod.map(x => x.firstDrawSinceOpenMs)),
      orbitMs: median(nod.map(x => x.orbit?.medianMs)), playbackMs: median(nod.map(x => x.playback?.medianMs)), heapMB: median(nod.map(x => x.heapMB?.afterFirstRender)),
      firstRenderPhases: nod.at(-1).firstRender?.phases, orbitPhases: nod.at(-1).orbit?.phasesPerFrame, playbackPhases: nod.at(-1).playback?.phasesPerFrame,
      drawsPerFrame: nod.at(-1).orbit?.drawsPerFrame,
    } : null,
    nodeProfile: r.nodeProfile ?? null,
    // Safari: runtime.open() resolves after the first engine Render
    // ('validation-render'), the wait for convergence ('settle') and the
    // first presented frame (runtime.ts), so open -> converged image is
    // openMs, and open -> first Render is the sum of the spans before it.
    // settledMs (the guard's measure) adds the harness's capture loop
    // (harness.ts: 250 ms, then 1 s between captures) and page start-up.
    safari: guard.length || perfRun ? {
      runs: guard.length, openMs: sm('openMs'), convergedMs: sm('openMs'),
      firstDrawMs: median(guard.map(g => firstRenderSpans.reduce((sum, k) => sum + (g.measures?.[k] ?? 0), 0))),
      // The same without loading the MaterialX and imaging modules, which the
      // harness serves unbundled from the Vite dev server.
      moduleLoadMs: median(guard.map(g => moduleSpans.reduce((sum, k) => sum + (g.measures?.[k] ?? 0), 0))),
      firstDrawExModulesMs: median(guard.map(g => firstRenderSpans.filter(k => !moduleSpans.includes(k)).reduce((sum, k) => sum + (g.measures?.[k] ?? 0), 0))),
      convergedExModulesMs: median(guard.map(g => g.timings.openMs - moduleSpans.reduce((sum, k) => sum + (g.measures?.[k] ?? 0), 0))),
      firstFrameMs: openStart !== null && sm('firstFrameMs') !== null ? median(guard.map(g => g.timings.firstFrameMs - g.timings.openStartMs)) : null,
      settledMs: openStart !== null ? median(guard.map(g => g.timings.settledMs - g.timings.openStartMs)) : null, settledSincePageMs: sm('settledMs'),
      lastFrameCpuMs: sm('lastFrameCpuMs'), playbackP95Ms: median(guard.map(g => g.playback?.p95Ms)), playbackMedianMs: median(guard.map(g => g.playback?.medianMs)),
      measures: guard.at(-1)?.measures ?? null,
      perf: perfRun?.perf ?? null,
    } : null,
  }
  const s = summary[asset.id]
  const ratio = (a, b) => typeof a === 'number' && typeof b === 'number' && b > 0 ? Math.round(a / b * 10) / 10 : null
  s.ratios = {
    firstDraw: ratio(s.safari?.firstDrawMs, s.native?.firstDrawMs), converged: ratio(s.safari?.convergedMs, s.native?.settledMs),
    firstDrawExModules: ratio(s.safari?.firstDrawExModulesMs, s.native?.firstDrawMs), convergedExModules: ratio(s.safari?.convergedExModulesMs, s.native?.settledMs),
    orbitCpu: ratio(s.safari?.perf?.orbit?.cpuMs?.median, s.native?.orbitCpuMs), playbackCpu: ratio(s.safari?.perf?.playback?.cpuMs?.median, s.native?.playbackCpuMs),
  }
}
writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1))
const f = v => v === null || v === undefined ? '-' : typeof v === 'number' ? (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) : String(v)
const rows = Object.entries(summary).map(([id, s]) => `| ${id} | ${f(s.native?.firstDrawMs)} | ${f(s.safari?.firstDrawMs)} | ${f(s.ratios.firstDraw)}x | ${f(s.native?.settledMs)} | ${f(s.safari?.convergedMs)} | ${f(s.ratios.converged)}x | ${f(s.native?.orbitCpuMs)} / ${f(s.native?.orbitFrameMs)} | ${f(s.safari?.perf?.orbit?.cpuMs?.median)} / ${f(s.safari?.perf?.orbit?.frameIntervalMs?.median)} | ${f(s.ratios.orbitCpu)}x | ${f(s.node?.firstRenderMs)} | ${f(s.node?.orbitMs)} |`)
writeFileSync(path.join(out, 'summary.md'), ['| asset | native first draw | Safari first Render | ratio | native converged | Safari converged | ratio | native orbit CPU / frame | Safari orbit CPU / interval | CPU ratio | Node first render | Node orbit |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|', ...rows].join('\n') + '\n')
console.log(readFileSync(path.join(out, 'summary.md'), 'utf8'))
