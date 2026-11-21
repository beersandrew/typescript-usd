import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { aswfRoot } from './aswf-server'

// Example scenes a build carries beyond public/assets/scenes.json (the
// committed fixtures): assets copied at build time from the local ASWF corpus
// checkout (aswf-server.ts), which is not committed here. Each one is written
// under assets/examples/<name>/ with the corpus's Apache-2.0 LICENSE and the
// asset's Readme, and listed in assets/build-scenes.json, which main.ts adds
// to the examples (and the welcome note) when present. Without the corpus the
// list is empty and the build carries only the committed fixtures.

/** Corpus file (relative to its root) -> example. Kept small: the whole
 *  build, Pyodide included, stays well under 120 MB. */
const CORPUS_EXAMPLES = [
  { dir: 'full_assets/CarbonFrameBike', file: 'CarbonFrameBike.usdz', readme: 'Readme.md', label: 'ASWF · Carbon Frame Bike (usdz, 27 MB)' },
] as const

export function buildExamples(): Plugin {
  return {
    name: 'usdview-build-examples',
    apply: 'build',
    generateBundle() {
      const root = aswfRoot(), scenes: { label: string, url: string, welcome: true, origin: string }[] = []
      for (const example of CORPUS_EXAMPLES) {
        const source = path.join(root, example.dir, example.file)
        if (!existsSync(source)) { this.warn(`Example ${example.file} not found under ${root} (set ASWF_ASSET_ROOT); the build leaves it out.`); continue }
        const name = path.basename(example.dir), out = `assets/examples/${name}`
        this.emitFile({ type: 'asset', fileName: `${out}/${example.file}`, source: readFileSync(source) })
        this.emitFile({ type: 'asset', fileName: `${out}/LICENSE.txt`, source: readFileSync(path.join(root, 'LICENSE')) })
        const readme = path.join(root, example.dir, example.readme)
        if (existsSync(readme)) this.emitFile({ type: 'asset', fileName: `${out}/${example.readme}`, source: readFileSync(readme) })
        scenes.push({ label: example.label, url: `./${out}/${example.file}`, welcome: true, origin: `ASWF USD assets (${path.basename(root)}), Apache License 2.0` })
      }
      this.emitFile({ type: 'asset', fileName: 'assets/build-scenes.json', source: JSON.stringify(scenes, null, 2) + '\n' })
    },
  }
}
