// Production bundle check (Rollup output, not a browser test): opening a stage
// needs only the entry chunk and its static imports. Imaging, Storm and
// MaterialX (usdMtlx) are dynamic chunks the runtime imports in parallel.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, type Rollup } from 'vite'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const lazy = /\/pxr\/imaging\/|\/usdImaging\/|\/usdMtlx\/|materialx|\/openvdb\//i

it('keeps imaging, Storm and MaterialX out of the static entry graph', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'usdview-split-'))
  try {
    const result = await build({ root, logLevel: 'silent', build: { outDir, emptyOutDir: true, write: false } }) as Rollup.RollupOutput
    const chunks = new Map(result.output.filter((c): c is Rollup.OutputChunk => c.type === 'chunk').map(c => [c.fileName, c]))
    const entry = [...chunks.values()].find(c => c.isEntry && c.facadeModuleId?.endsWith('index.html'))!
    const staticGraph = new Set<string>()
    const visit = (name: string) => { if (staticGraph.has(name)) return; staticGraph.add(name); for (const i of chunks.get(name)?.imports ?? []) visit(i) }
    visit(entry.fileName)
    const eager = [...staticGraph].flatMap(name => Object.keys(chunks.get(name)!.modules))
    // Two Ar read-ahead registrations (Core-only modules, declared package
    // side effects) start with the entry: a stage reads its
    // glslfx files and card textures ahead as it opens, before imaging loads.
    const readAhead = /\/hio\/src\/glslfxPrefetch\.ts$|\/usdImaging\/src\/cardTexturePrefetch\.ts$/
    expect(eager.filter(id => lazy.test(id) && !readAhead.test(id))).toEqual([])
    expect(eager.some(id => id.includes('/pxr/usd/usd/src/stage'))).toBe(true)
    const deferred = [...chunks.values()].filter(c => !staticGraph.has(c.fileName)).flatMap(c => Object.keys(c.modules))
    for (const part of ['/hdSt/', '/hgiWebGPU/', '/usdImaging/', '/usdMtlx/', '/plugin/usdShaders/', '/hio/']) expect(deferred.some(id => id.includes(part))).toBe(true)
    // Module-level plugin registration must survive tree shaking: UsdImaging's
    // prim adapter registry (usdImaging/src/plugInfo.ts, a bare import).
    const rendered = [...chunks.values()].flatMap(c => Object.entries(c.modules)).filter(([id, m]) => id.includes('/usdImaging/usdImaging/src/plugInfo.ts') && m.renderedLength > 0)
    expect(rendered).toHaveLength(1)
  } finally { await rm(outDir, { recursive: true, force: true }) }
}, 120_000)
