// Builds the Stagehand runtime plugin for typescript-usdview into OUT
// (default ./dist): stagehand.js (bare typescript-usd/* imports left for the
// page's import map), plugInfo.json, generatedSchema.usda and heath.usda.
//   node examples/stagehand/browser/build.mjs [OUT]
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const here = fileURLToPath(new URL('.', import.meta.url))
const out = resolve(process.argv[2] ?? `${here}/dist`)
// esbuild as the viewer's vite resolves it (pnpm keeps it beside vite's real path).
const vite = realpathSync(fileURLToPath(new URL('../../../../../apps/usdview/node_modules/vite/package.json', import.meta.url)))
const require = createRequire(vite)
const esbuild = require('esbuild')

mkdirSync(out, { recursive: true })
await esbuild.build({
  entryPoints: [`${here}/entry.ts`], bundle: true, format: 'esm', target: 'es2022',
  outfile: `${out}/stagehand.js`, external: ['typescript-usd/*'], keepNames: true,
  // packages/usd's sideEffects list doesn't name the examples; their imports register things.
  ignoreAnnotations: true,
})
copyFileSync(`${here}/plugInfo.json`, `${out}/plugInfo.json`)
copyFileSync(`${here}/../resources/generatedSchema.usda`, `${out}/generatedSchema.usda`)
copyFileSync(`${here}/heath.usda`, `${out}/heath.usda`)
console.log(`built ${out}`)
