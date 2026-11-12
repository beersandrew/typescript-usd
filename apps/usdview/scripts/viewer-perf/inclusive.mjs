// Inclusive (total) time per function of a V8 .cpuprofile, mapped to library
// sources through the bundle's source map, as profile.mjs beside it maps
// self time: a sample counts once for every distinct
// function on its stack (recursion counted once). Tooling only.
//
//   node scripts/viewer-perf/inclusive.mjs <file.cpuprofile> <bundle.mjs.map> [top]
import { readFileSync } from 'node:fs'
import { SourceMap } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function inclusiveProfile(profileFile, mapFile, top = 40) {
  const profile = JSON.parse(readFileSync(profileFile, 'utf8'))
  const map = new SourceMap(JSON.parse(readFileSync(mapFile, 'utf8')))
  const nodes = new Map(profile.nodes.map(n => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const label = new Map()
  const name = id => {
    if (label.has(id)) return label.get(id)
    const { functionName, url, lineNumber, columnNumber } = nodes.get(id).callFrame
    let where = url ? `${path.basename(url)}:${lineNumber + 1}` : ''
    if (url.endsWith('.mjs') && lineNumber >= 0) {
      const e = map.findEntry(lineNumber, columnNumber)
      if (e?.originalSource) where = `${e.originalSource.replace(/^.*?\/(packages\/usd\/|apps\/usdview\/)/, '')}:${e.originalLine + 1}`
    }
    const key = `${functionName || '(anonymous)'} ${where}`
    label.set(id, key)
    return key
  }
  const total = new Map()
  let all = 0
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = profile.timeDeltas[i] ?? 0
    all += dt
    const seen = new Set()
    for (let id = profile.samples[i]; id !== undefined; id = parent.get(id)) {
      const k = name(id)
      if (seen.has(k)) continue
      seen.add(k)
      total.set(k, (total.get(k) ?? 0) + dt)
    }
  }
  return { totalMs: +(all / 1000).toFixed(1), top: [...total].filter(([k]) => !/^\((root|program|idle)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, top)
    .map(([fn, us]) => ({ fn, totalMs: +(us / 1000).toFixed(1), percent: +(100 * us / all).toFixed(1) })) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, map, top] = process.argv.slice(2)
  console.log(JSON.stringify(inclusiveProfile(file, map, Number(top ?? 40)), null, 1))
}
