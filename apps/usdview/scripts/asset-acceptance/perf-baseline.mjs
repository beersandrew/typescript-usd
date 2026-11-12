#!/usr/bin/env node
// Writes the performance guard's baseline (score.mjs, perf-baseline.json)
// from an asset-acceptance run of the hand-written renderer: the runs of
// typescript-usd at 15513a1 (the last commit with hdStWgsl,
// packages/usd/docs/imaging-i2.md "Decision: one faithful implementation, no
// backup renderer"), made with that commit's own harness:
//
//   git -C <repo> worktree add --detach <dir> 15513a14 && (cd <dir> && pnpm install --frozen-lockfile --offline)
//   (cd <dir>/apps/usdview && node scripts/asset-acceptance/run.mjs --renderer viewer --runs 3 \
//       --skip-native --skip-usdview --out <out> --port <port>)
//   node scripts/asset-acceptance/perf-baseline.mjs <out> [--commit 15513a14] [--write FILE]
//
// Per asset: the medians over the runs of settledMs and lastFrameCpuMs, the
// playback p95 frame time and its run-to-run spread, as summarizeRuns
// computes them for the guarded renderer. Assets with a failed run get no
// baseline (they are not guarded). Tooling only.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, loadavg } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { median, spread } from './score.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => { const i = args.indexOf(name); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v }
const commit = option('--commit', '15513a14')
const renderer = option('--renderer-dir', 'hdStWgsl')
const target = path.resolve(option('--write', path.join(here, 'perf-baseline.json')))
const out = path.resolve(args[0] ?? '')
const assets = {}
let userAgent, runsSeen = 0
for (const id of readdirSync(out).sort()) {
  const base = path.join(out, id, 'runs', renderer)
  if (!existsSync(base)) continue
  const runs = readdirSync(base).map(k => path.join(base, k, 'browser.json')).filter(existsSync).map(f => JSON.parse(readFileSync(f, 'utf8')))
  if (!runs.length) continue
  runsSeen = Math.max(runsSeen, runs.length)
  userAgent ??= runs[0].userAgent
  if (runs.some(r => r.outcome !== 'captured')) continue
  const timing = key => runs.map(r => r.timings?.[key]).filter(v => typeof v === 'number')
  const p95s = runs.map(r => r.playback?.p95Ms).filter(v => typeof v === 'number')
  assets[id] = { runs: runs.length, settledMs: median(timing('settledMs')), lastFrameCpuMs: median(timing('lastFrameCpuMs')),
    playbackP95Ms: median(p95s), playbackSpreadMs: p95s.length ? spread(p95s) : null }
}
const record = {
  comment: 'Performance guard baseline (score.mjs; packages/usd/docs/imaging-i2.md section 1.3): the hand-written renderer hdStWgsl at its last commit, timed by that commit\'s asset-acceptance harness in Safari. Medians over runs. Machine-specific: compare only with runs on the same machine. Written by perf-baseline.mjs.',
  renderer: 'hdStWgsl', commit, recorded: new Date().toISOString(), runs: runsSeen,
  machine: { cpu: cpus()[0]?.model, cores: cpus().length, loadAverage1m: Math.round(loadavg()[0] * 10) / 10 }, userAgent,
  assets,
}
writeFileSync(target, JSON.stringify(record, null, 1) + '\n')
console.log(`${Object.keys(assets).length} assets -> ${target}`)
