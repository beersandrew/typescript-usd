// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/plugin/usdShaders/shaders/previewSurface.glslfx,
//  pxr/usd/plugin/usdShaders/shaders/uvTexture.glslfx,
//  pxr/usd/usdHydra/shaders/empty.glslfx
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Production bundle check (Rollup output run in Node, not a browser test):
// plugin resource directories must be distinct and must resolve once the
// modules are bundled. In a bundle every module shares its chunk's
// import.meta.url, so a resource root derived from the module's URL makes
// two plugins share one directory: usdShaders and usdHydra then had the same
// shaders/shaderDefs.usda, UsdPreviewSurface/UsdUVTexture became invalid Sdr
// nodes whose implementation was that .usda (HioGlslfx: "First line in file
// must be version info"), and the built viewer drew no UsdPreviewSurface
// material. Source-based tests, where each package has its own directory,
// cannot see this; the browser-side check is the asset harness's --build
// mode (scripts/asset-acceptance/run.mjs).
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build, type Rollup } from 'vite'
import { expect, it } from 'vitest'

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))

it('keeps plugin resource directories distinct and resolvable in one bundle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usdview-plugin-resources-'))
  const entry = '\0usdview-plugin-resources-probe'
  // The registrations the viewer's engine performs (stage-view-engine.ts),
  // bundled into one file, so every module has the same import.meta.url.
  const source = `
    import { Registry as PlugRegistry, PlugFindPluginResource } from 'typescript-usd/plug';
    import { Registry as SdrRegistry } from 'typescript-usd/sdr';
    import { UsdShaders_RegisterShaderNodesAsync } from 'typescript-usd/usdShaders';
    import { UsdHydra_RegisterShaderNodesAsync } from 'typescript-usd/usdHydra';
    import 'typescript-usd/hdSt';
    import { _RegisterShaderResources as registerHdx } from 'typescript-usd/hdx';
    registerHdx();
    await UsdShaders_RegisterShaderNodesAsync();
    await UsdHydra_RegisterShaderNodesAsync();
    const plugins = ['usdShaders', 'usdHydra', 'hdSt', 'hdx'].map(name => PlugRegistry.GetInstance().GetPluginWithName(name));
    const node = (id) => {
      const n = SdrRegistry.getInstance().getShaderNodeByIdentifierAndType(id, 'glslfx');
      const uri = n?.getResolvedImplementationURI() ?? '';
      return { valid: n?.isValid() ?? false, implementation: uri.slice(uri.lastIndexOf('/') + 1) };
    };
    console.log('PLUGIN_RESOURCES=' + JSON.stringify({
      resourcePaths: plugins.map(p => p?.GetResourcePath() ?? null),
      shaderDefs: plugins.slice(0, 2).map(p => PlugFindPluginResource(p, 'shaders/shaderDefs.usda')),
      nodes: Object.fromEntries(['UsdPreviewSurface', 'UsdUVTexture', 'HwUvTexture_1'].map(id => [id, node(id)])),
    }));
  `
  try {
    await build({
      configFile: false, root, logLevel: 'silent',
      plugins: [{ name: 'plugin-resources-probe', resolveId(id) { if (id === entry) return id }, load(id) { if (id === entry) return source } }],
      build: {
        target: 'es2022', outDir: directory, emptyOutDir: true, minify: true,
        rollupOptions: { input: entry, output: { entryFileNames: 'probe.mjs', inlineDynamicImports: true } },
      },
    })
    const { stdout } = await run(process.execPath, [join(directory, 'probe.mjs')], { cwd: directory })
    const line = stdout.split('\n').find(l => l.startsWith('PLUGIN_RESOURCES='))
    if (!line) throw new Error(`The bundled probe returned no result: ${stdout}`)
    const result = JSON.parse(line.slice('PLUGIN_RESOURCES='.length))
    // The installed layout's lib/usd/<plugin>/resources, one per plugin.
    expect(result.resourcePaths).toEqual(['/usd/usdShaders/resources', '/usd/usdHydra/resources', '/usd/hdSt/resources', '/usd/hdx/resources'])
    expect(result.shaderDefs).toEqual(['/usd/usdShaders/resources/shaders/shaderDefs.usda', '/usd/usdHydra/resources/shaders/shaderDefs.usda'])
    expect(result.nodes).toEqual({
      UsdPreviewSurface: { valid: true, implementation: 'previewSurface.glslfx' },
      UsdUVTexture: { valid: true, implementation: 'uvTexture.glslfx' },
      HwUvTexture_1: { valid: true, implementation: 'empty.glslfx' },
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 60_000)

it('keeps the Ar read-ahead registrations of hio, usdShade and usdImaging in a bundle', async () => {
  // These registrations are module-level statements whose modules are only
  // re-exported (hio/src/glslfxPrefetch.ts) or imported bare
  // (usdImaging/src/cardTexturePrefetch.ts): unless the package declares
  // them side effects, Rollup drops them, and the built viewer then never
  // reads ahead a scene's glslfx files (volume field shaders: "File doesn't
  // exist"), card textures or UDIM tiles, while the dev server's source
  // modules do.
  const directory = await mkdtemp(join(tmpdir(), 'usdview-prefetchers-'))
  const entry = '\0usdview-prefetchers-probe'
  const source = `
    import { HioGlslfx } from 'typescript-usd/hio';
    import { UdimUtils } from 'typescript-usd/usdShade';
    import { UsdImagingCreateSceneIndices } from 'typescript-usd/usdImaging';
    // What the engine uses (HdSt opens glslfx; the scene index chain
    // includes the draw mode standins), kept so Rollup includes them.
    globalThis.used = [HioGlslfx, UdimUtils, UsdImagingCreateSceneIndices];
    import { _ArHasAssetPrefetcher, _ArHasAssetPropertyPrefetcher, _ArPrefetchAssetPath } from 'typescript-usd/ar/_internal';
    const asked = [];
    const reader = { resolve: async path => { asked.push(path); return { toString: () => '' } }, openAsset: async () => undefined };
    await _ArPrefetchAssetPath('/probe/tex.<UDIM>.png', undefined, reader);
    console.log('PREFETCHERS=' + JSON.stringify({
      glslfx: _ArHasAssetPrefetcher('/probe/shader.glslfx'),
      cardTexture: _ArHasAssetPropertyPrefetcher('model:cardTextureXPos'),
      udimFirstTile: asked[0] ?? null,
    }));
  `
  try {
    await build({
      configFile: false, root, logLevel: 'silent',
      plugins: [{ name: 'prefetchers-probe', resolveId(id) { if (id === entry) return id }, load(id) { if (id === entry) return source } }],
      build: {
        target: 'es2022', outDir: directory, emptyOutDir: true, minify: true,
        rollupOptions: { input: entry, output: { entryFileNames: 'probe.mjs', inlineDynamicImports: true } },
      },
    })
    const { stdout } = await run(process.execPath, [join(directory, 'probe.mjs')], { cwd: directory })
    const line = stdout.split('\n').find(l => l.startsWith('PREFETCHERS='))
    if (!line) throw new Error(`The bundled probe returned no result: ${stdout}`)
    expect(JSON.parse(line.slice('PREFETCHERS='.length))).toEqual({ glslfx: true, cardTexture: true, udimFirstTile: '/probe/tex.1001.png' })
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 60_000)

it('derives no directory from a module URL in the viewer build except the viewer root', async () => {
  // new URL('<file>', import.meta.url) of an emitted asset or worker is
  // relocatable (Vite rewrites it to the emitted file); a directory of the
  // module ('.', '..') means the chunk's directory in a bundle. Only
  // src/app-root.ts may ask for it: the viewer's own root (written with
  // String(import.meta.url) so the dev server leaves it alone).
  const outDir = await mkdtemp(join(tmpdir(), 'usdview-module-dirs-'))
  try {
    const result = await build({ root, logLevel: 'silent', build: { outDir, emptyOutDir: true, write: false } }) as Rollup.RollupOutput
    const users = result.output.filter((c): c is Rollup.OutputChunk => c.type === 'chunk')
      .flatMap(c => Object.entries(c.modules))
      .filter(([, m]) => /new URL\(\s*["'`]\.{1,2}\/?["'`]\s*,\s*(?:String\(\s*)?import\.meta\.url\s*\)?\s*\)/.test(m.code ?? ''))
      .map(([id]) => id.slice(id.indexOf('/apps/') >= 0 ? id.indexOf('/apps/') : id.indexOf('/packages/')))
    expect(users).toEqual(['/apps/usdview/src/app-root.ts'])
  } finally { await rm(outDir, { recursive: true, force: true }) }
}, 120_000)
