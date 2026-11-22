// Builds chosen tool pages for hosting on their own and copies them to a
// folder: only those pages, the code they load, and the samples they offer.
//
//   node scripts/ship.mjs <page,page,...> <outDir>
//
// e.g. `node scripts/ship.mjs usdcat ../site/s/usd-tools`. The folder is
// emptied first. Pages look for TypeScript usdview at ../../usdview/ (beside
// the folder), and link to the tools' index only where it is served.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// The samples each page offers (by manifest name).
const SAMPLES = { usdcat: ['wireframes'], usdzip: ['suitcase'] }

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [pagesArg, outArg] = process.argv.slice(2)
if (!pagesArg || !outArg) { console.error('Usage: node scripts/ship.mjs <page,page,...> <outDir>'); process.exit(2) }
const pages = pagesArg.split(',').map(p => p.trim()).filter(Boolean)
const out = resolve(process.cwd(), outArg)
const dist = join(app, 'dist-ship')

execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', dist, '--emptyOutDir'], { cwd: app, stdio: 'inherit', env: { ...process.env, USD_TOOLS_PAGES: pages.join(',') } })

// Keep only the samples the pages offer, and a manifest that lists them.
const manifest = JSON.parse(readFileSync(join(dist, 'samples/manifest.json'), 'utf8'))
const keep = new Set(pages.flatMap(p => SAMPLES[p] ?? []))
const samples = manifest.samples.filter(s => keep.has(s.name))
const folders = new Set(samples.map(s => s.root.split('/')[0]))
const files = manifest.files.filter(f => folders.has(f.split('/')[0]))
rmSync(join(dist, 'samples'), { recursive: true, force: true })
mkdirSync(join(dist, 'samples'), { recursive: true })
for (const f of files) { mkdirSync(dirname(join(dist, 'samples', f)), { recursive: true }); cpSync(join(app, 'public/samples', f), join(dist, 'samples', f)) }
writeFileSync(join(dist, 'samples/manifest.json'), JSON.stringify({ samples, files }, null, 2) + '\n')

if (existsSync(out)) rmSync(out, { recursive: true, force: true })
cpSync(dist, out, { recursive: true })
rmSync(dist, { recursive: true, force: true })
console.log(`Shipped ${pages.join(', ')} (samples: ${[...keep].join(', ') || 'none'}) to ${out}`)
