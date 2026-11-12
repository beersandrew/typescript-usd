// Summarizes a V8 .cpuprofile (node --cpu-prof): self time per function,
// with bundle positions mapped back to library sources through the bundle's
// source map (node:module SourceMap). run.mjs uses it for the Node half's
// profiles. Tooling only.
//
//   node scripts/viewer-perf/profile.mjs <file.cpuprofile> <bundle.mjs.map> [top]
import { readFileSync } from 'node:fs'
import { SourceMap } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function summarizeProfile(profileFile, mapFile, top = 25) {
  const profile = JSON.parse(readFileSync(profileFile, 'utf8'))
  const map = new SourceMap(JSON.parse(readFileSync(mapFile, 'utf8')))
  const self = new Map()
  for (let i = 0; i < profile.samples.length; i++) {
    self.set(profile.samples[i], (self.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0))
  }
  const byNode = new Map(profile.nodes.map(node => [node.id, node]))
  const total = [...self.values()].reduce((a, b) => a + b, 0)
  const rows = new Map()
  for (const [id, micros] of self) {
    const { functionName, url, lineNumber, columnNumber } = byNode.get(id).callFrame
    let where = url ? `${path.basename(url)}:${lineNumber + 1}` : ''
    if (url.endsWith('node.mjs') && lineNumber >= 0) {
      const entry = map.findEntry(lineNumber, columnNumber)
      if (entry?.originalSource) {
        const source = entry.originalSource.replace(/^.*?\/packages\/usd\//, '')
        where = `${source}:${entry.originalLine + 1}`
      }
    }
    const key = `${functionName || '(anonymous)'} ${where}`
    rows.set(key, (rows.get(key) ?? 0) + micros)
  }
  return {
    totalMs: +(total / 1000).toFixed(1),
    top: [...rows].sort((a, b) => b[1] - a[1]).slice(0, top)
      .map(([fn, micros]) => ({ fn, selfMs: +(micros / 1000).toFixed(1), percent: +(100 * micros / total).toFixed(1) })),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [profileFile, mapFile, top] = process.argv.slice(2)
  console.log(JSON.stringify(summarizeProfile(profileFile, mapFile, Number(top ?? 25)), null, 1))
}
