// Production package regression: source-based Vitest imports do not exercise
// Rollup's package sideEffects decisions. Execute each bundle in a fresh Node
// process so earlier tests cannot register UsdGeom on this probe's behalf.
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'vite'
import { expect, it } from 'vitest'

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const virtualEntry = '\0usdview-registration-probe'

async function probe(outDir: string, removeBarrelSideEffects = false) {
  // A mesh that authors points but no subdivisionScheme or extent, so it
  // exercises schema fallbacks and computed bounds after bundling.
  const fixture = [
    '#usda 1.0', 'def Xform "World" {', '    def Mesh "Plane_0" {',
    '        int[] faceVertexCounts = [4]', '        int[] faceVertexIndices = [0, 1, 2, 3]',
    '        point3f[] points = [(-1, 0, -1), (1, 0, -1), (1, 0, 1), (-1, 0, 1)]',
    '    }', '}', '',
  ].join('\n')
  const source = `
    import { Stage } from 'typescript-usd/usd';
    import { Layer } from 'typescript-usd/sdf';
    import { BBoxCache } from 'typescript-usd/usdGeom';
    const layer = Layer.createAnonymous();
    layer.importFromString(${JSON.stringify(fixture)});
    const stage = await Stage.open(layer);
    try {
      const mesh = stage.getPrim('/World/Plane_0');
      const range = new BBoxCache(0, ['default']).computeWorldBound(mesh).ComputeAlignedRange();
      console.log('USDVIEW_REGISTRATION=' + JSON.stringify({
        boundable: mesh.isA('Boundable'),
        subdivisionScheme: mesh.getAttr('subdivisionScheme')?.getValue() ?? null,
        boundsEmpty: range.IsEmpty()
      }));
    } finally { stage.dispose(); }
  `
  await build({
    configFile: false, root, logLevel: 'silent',
    plugins: [{
      name: 'usdview-registration-probe',
      resolveId(id) { if (id === virtualEntry) return id },
      load(id) { if (id === virtualEntry) return source },
      // Negative control reproduces the old package metadata without modifying
      // installed dependencies or relying on a second package version.
      transform(code, id) {
        if (removeBarrelSideEffects && /\/pxr\/usd\/usdGeom\/src\/index\.(ts|js)$/.test(id))
          return { code, map: null, moduleSideEffects: false }
      },
    }],
    build: {
      target: 'es2022', outDir, emptyOutDir: true, minify: true,
      rollupOptions: { input: virtualEntry, output: { entryFileNames: 'probe.mjs' } },
    },
  })
  const { stdout } = await run(process.execPath, [join(outDir, 'probe.mjs')])
  const line = stdout.split('\n').find(line => line.startsWith('USDVIEW_REGISTRATION='))
  if (!line) throw new Error(`Bundled registration probe returned no result: ${stdout}`)
  return JSON.parse(line.slice('USDVIEW_REGISTRATION='.length))
}

it('retains UsdGeom registration through the published barrel in a production bundle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usdview-registration-'))
  try {
    expect(await probe(join(directory, 'normal'))).toEqual({
      boundable: true, subdivisionScheme: 'catmullClark', boundsEmpty: false,
    })
    expect(await probe(join(directory, 'old-metadata'), true)).toEqual({
      boundable: false, subdivisionScheme: null, boundsEmpty: true,
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30_000)

it('retains MaterialX format and Sdr discovery registration in a production bundle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usdview-mtlx-registration-'))
  const entry = '\0usdview-mtlx-probe'
  const source = `
    import 'typescript-usd/usdMtlx';
    import { FileFormat } from 'typescript-usd/sdf';
    import { Registry } from 'typescript-usd/sdr';
    const node = Registry.getInstance().getShaderNodeByIdentifier('ND_standard_surface_surfaceshader');
    console.log('MTLX_REGISTRATION=' + JSON.stringify({
      format: FileFormat.findByExtension('material.mtlx')?.formatId,
      discovered: !!node, valid: node?.isValid() ?? false
    }));
  `
  try {
    await build({configFile:false, root, logLevel:'silent', plugins:[{
      name:'mtlx-registration-probe',
      resolveId(id) { if (id === entry) return id },
      load(id) { if (id === entry) return source },
    }], build:{target:'es2022',outDir:directory,emptyOutDir:true,minify:true,
      rollupOptions:{input:entry,output:{entryFileNames:'probe.mjs'}}}})
    const {stdout}=await run(process.execPath,[join(directory,'probe.mjs')])
    const line=stdout.split('\n').find(value=>value.startsWith('MTLX_REGISTRATION='))
    expect(line && JSON.parse(line.slice('MTLX_REGISTRATION='.length))).toEqual({format:'mtlx',discovered:true,valid:true})
  } finally { await rm(directory,{recursive:true,force:true}) }
},30_000)

it('retains Storm scene index plugin and UsdLux Sdr registration in a production bundle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usdview-plugin-registration-'))
  const entry = '\0usdview-plugin-probe'
  // HdSceneIndexPluginRegistry and SdrRegistry find these plugins through
  // the Types their plugInfo declares; the modules defining the types and
  // factories export nothing the probe uses.
  const source = `
    import 'typescript-usd/hdSt';
    import 'typescript-usd/usdLux';
    import { SceneIndexPluginRegistry } from 'typescript-usd/hd';
    import { Registry } from 'typescript-usd/sdr';
    const ids = SceneIndexPluginRegistry.GetInstance().loadAndGetSceneIndexPluginIds('GL', '')
      .filter(id => id.startsWith('HdSt_'));
    const light = Registry.getInstance().getShaderNodeByIdentifier('SphereLight', ['USD']);
    console.log('PLUGIN_REGISTRATION=' + JSON.stringify({ storm: ids.length, light: light?.isValid() ?? false }));
  `
  try {
    await build({configFile:false, root, logLevel:'silent', plugins:[{
      name:'plugin-registration-probe',
      resolveId(id) { if (id === entry) return id },
      load(id) { if (id === entry) return source },
    }], build:{target:'es2022',outDir:directory,emptyOutDir:true,minify:true,
      rollupOptions:{input:entry,output:{entryFileNames:'probe.mjs'}}}})
    const {stdout}=await run(process.execPath,[join(directory,'probe.mjs')])
    const line=stdout.split('\n').find(value=>value.startsWith('PLUGIN_REGISTRATION='))
    expect(line && JSON.parse(line.slice('PLUGIN_REGISTRATION='.length))).toEqual({storm:12,light:true})
  } finally { await rm(directory,{recursive:true,force:true}) }
},30_000)
