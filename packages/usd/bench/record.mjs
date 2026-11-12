// Runs bench/layer.bench.ts (or the file given with --bench) and records its
// results, with the machine, Node version, commit and load average, as
// bench/results/<label>.json.
// Usage: node bench/record.mjs <label> [--bench <file>] [extra vitest args...]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const [label, ...rest] = process.argv.slice(2)
const benchAt = rest.indexOf('--bench')
const benchFile = benchAt >= 0 ? rest[benchAt + 1] : 'bench/layer.bench.ts'
const extra = benchAt >= 0 ? [...rest.slice(0, benchAt), ...rest.slice(benchAt + 2)] : rest
if (!label) throw new Error('usage: node bench/record.mjs <label>')
const raw = path.join(os.tmpdir(), `typescript-usd-bench-${process.pid}.json`)
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const loadBefore = os.loadavg()
execFileSync('npx', ['vitest', 'bench', '--run', benchFile, '--outputJson', raw, ...extra],
  { cwd: root, stdio: 'inherit' })
const loadAfter = os.loadavg()
const report = JSON.parse(readFileSync(raw, 'utf8'))
rmSync(raw)

// "(... 13.31 MB)" in a group or bench name gives the input size for MB/s.
const sizeOf = text => Number(/([0-9.]+) MB\)/.exec(text)?.[1] ?? NaN)
const results = []
for (const file of report.files) {
  for (const group of file.groups) {
    const groupName = group.fullName.replace(/^.*?> /, '')
    for (const b of group.benchmarks) {
      const mb = sizeOf(b.name) || sizeOf(groupName)
      results.push({
        group: groupName,
        name: b.name,
        meanMs: +b.mean.toFixed(3),
        minMs: +b.min.toFixed(3),
        maxMs: +b.max.toFixed(3),
        p99Ms: +b.p99.toFixed(3),
        sdMs: +b.sd.toFixed(3),
        rmePercent: +b.rme.toFixed(2),
        samples: b.sampleCount,
        ...(Number.isFinite(mb) ? { mbPerSecMean: +(mb / (b.mean / 1000)).toFixed(2) } : {}),
      })
    }
  }
}

const cpus = os.cpus()
const out = {
  label,
  bench: benchFile,
  commit: git('rev-parse', 'HEAD'),
  dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
  date: new Date().toISOString(),
  machine: { platform: `${os.platform()} ${os.release()}`, cpu: cpus[0]?.model, cores: cpus.length, memoryGB: Math.round(os.totalmem() / 2 ** 30) },
  node: process.version,
  loadAverage1m: { before: +loadBefore[0].toFixed(1), after: +loadAfter[0].toFixed(1) },
  note: 'Recorded on a shared developer machine under other load; compare means alongside min, sd and rme, not single runs.',
  results,
}
mkdirSync(path.join(root, 'bench/results'), { recursive: true })
const target = path.join(root, 'bench/results', `${label}.json`)
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`)
console.log(`wrote ${path.relative(root, target)}`)
