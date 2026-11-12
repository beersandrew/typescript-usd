// Ported from OpenUSD 26.11.1: pxr/usd/ar/resolver.cpp,
//  pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLBasicDrawing.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Browser half of tests/browser/usdimaging-gl-image/run.mjs: runs one registered
// usdImagingGL test of the testUsdImagingGLBasicDrawing program
// (pxr/usdImaging/usdImagingGL/tests/upstream/testUsdImagingGLBasicDrawing.ts)
// per page load on HgiWebGPU, posts each image the test writes (the 8-bit
// data Hio_StbImage::Write would write, unitTestGLDrawing.ts) and the run's
// record, then loads the page for the next test. Tooling only.
//
// The test's working directory is the copy of its testenv directory the
// registration names (capture.json "cwd"), served by run.mjs; relative stage
// paths in the command resolve against it, as the native run's do. Assets
// are read over HTTP through an ArResolver registered for the http URI
// scheme (the plugInfo "uriSchemes" extension point, ar/resolver.cpp:208-285).
import { TfDiagnosticMgr } from 'typescript-usd/tf'
import { DefineResolver, InMemoryAsset, ResolvedPath, Resolver } from 'typescript-usd/ar'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { HgiWebGPU } from 'typescript-usd/hgiWebGPU'
import 'typescript-usd/hdSt'
import 'typescript-usd/hdStorm'
import { VirtualFileSystem, getVirtualFileSystem, setVirtualFileSystem } from '@mtlx/format'
import { UsdShaders_RegisterShaderNodesAsync } from 'typescript-usd/usdShaders'
// The plugins of the reference build, as the viewer loads them
// (apps/usdview/src/stage-view-engine.ts): usdSkelImaging (the skeleton
// adapters and the skinning resolving scene indices), usdVolImaging (the
// OpenVDBAsset and Field3DAsset field adapters), hioOpenVDB (.vdb field
// textures) and usdHydra's Sdr nodes (HwFieldReader_*).
import 'typescript-usd/usdSkelImaging'
import 'typescript-usd/usdVolImaging'
import 'typescript-usd/hioOpenVDB'
import { UsdHydra_RegisterShaderNodesAsync } from 'typescript-usd/usdHydra'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../../pxr/imaging/hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts'
import { Hdx_RegisterShaderResources } from '../../../pxr/imaging/hdx/src/shaderResources.ts'
import { BasicTest, My_TestGLDrawing } from '../../../pxr/usdImaging/usdImagingGL/tests/upstream/testUsdImagingGLBasicDrawing.ts'

interface TestEntry { name: string, argv: string[], cwd: string, env: Record<string, string> }

const q = new URLSearchParams(location.search)
const index = Number(q.get('i') ?? 0)
const logEl = document.getElementById('log')!

const existence = new Map<string, Promise<boolean>>()
// The test's working directory and its files (run.mjs /__testenvFiles), set
// before the test runs.
let cwdUrl = location.href
let cwdFiles = new Set<string>()
// ArDefaultResolver's search paths (defaultResolver.cpp:33-38 _IsSearchPath):
// relative, not starting with ./ or ../
const isSearchPath = (p: string) => !/^[a-z][a-z\d+.-]*:/i.test(p) && !p.startsWith('/') &&
  !p.startsWith('./') && !p.startsWith('../')
class HttpResolver extends Resolver {
  // As ArDefaultResolver::_CreateIdentifier (ar/defaultResolver.cpp:126-160):
  // a path anchored to the anchor, except a search path whose anchored file
  // does not exist, which is the working directory's file when there is one
  // and otherwise stays a search path.
  override createIdentifier(assetPath: string, anchor = new ResolvedPath()): string {
    if (!assetPath) return ''
    if (!anchor.valid) return isSearchPath(assetPath) ? assetPath : new URL(assetPath, cwdUrl).href
    const anchored = new URL(assetPath, anchor.toString()).href
    if (isSearchPath(assetPath) && anchored.startsWith(cwdUrl) && !cwdFiles.has(anchored.slice(cwdUrl.length))) {
      // ArDefaultResolver resolves such a search path from the working
      // directory first (defaultResolver.cpp:189-225), which this resolver
      // answers for; the default resolver Ar dispatches a scheme-less path
      // to has no working directory here, so the path is anchored there.
      const fromCwd = new URL(assetPath, cwdUrl).href
      return cwdFiles.has(fromCwd.slice(cwdUrl.length)) ? fromCwd : assetPath
    }
    return anchored
  }
  // As ArDefaultResolver::_Resolve (ar/defaultResolver.cpp:189-225), an
  // asset that does not exist resolves to the empty path: UDIM tiles are
  // found by resolving each tile (usdShade/udimUtils.cpp:58-98,
  // hdSt/udimTextureObject.cpp:76-102). A relative path resolves from the
  // working directory.
  override async resolve(assetPath: string): Promise<ResolvedPath> {
    const url = assetPath && isSearchPath(assetPath) ? new URL(assetPath, cwdUrl).href : this.createIdentifier(assetPath)
    if (!url) return new ResolvedPath()
    let exists = existence.get(url)
    if (!exists) {
      exists = fetch(url, { method: 'HEAD' }).then(r => r.ok, () => false)
      existence.set(url, exists)
    }
    return (await exists) ? new ResolvedPath(url) : new ResolvedPath()
  }
  override async openAsset(resolvedPath: ResolvedPath): Promise<InMemoryAsset | undefined> {
    if (!resolvedPath.valid) return undefined
    const response = await fetch(resolvedPath.toString())
    if (!response.ok) return undefined
    return new InMemoryAsset(new Uint8Array(await response.arrayBuffer()))
  }
}

const tests = await (await fetch('/__tests')).json() as TestEntry[]
const test = tests[index]
if (!test) {
  await fetch('/__done', { method: 'POST', body: '{}' })
  logEl.textContent = 'all done'
} else {
  logEl.textContent = `${index + 1}/${tests.length} ${test.name}`
  // The registration's ENV (pxr_register_test ENV; run.mjs lists the ones it
  // leaves out), as the environment TfGetEnvSetting reads
  // (pxr/base/tf/src/envSetting.ts): e.g. HDX_ENABLE_OIT_PACKED_DATA=1 of
  // testUsdImagingGLOITPacked. One test runs per page load, so a test's
  // settings do not reach the next one.
  ;(globalThis as { process?: { env: Record<string, string> } }).process = { env: { ...test.env } }
  const record: Record<string, unknown> = { name: test.name, userAgent: navigator.userAgent }
  const stdout: string[] = []
  const diagnostics: string[] = []
  const gpuErrors: string[] = []
  const images: string[] = []
  TfDiagnosticMgr.GetInstance().addDelegate({
    issueError(e) { if (diagnostics.length < 200) diagnostics.push(`error: ${(e as { getCommentary?: () => string }).getCommentary?.() ?? String(e)}`) },
    issueWarning(w) { if (diagnostics.length < 200) diagnostics.push(`warning: ${(w as { getCommentary?: () => string }).getCommentary?.() ?? String(w)}`) },
    issueStatus() {},
  })
  const t0 = performance.now()
  try {
    const cwd = new URL(`/__testenv/${test.cwd}/`, location.href).href
    cwdUrl = cwd
    cwdFiles = new Set(await (await fetch(`/__testenvFiles?cwd=${encodeURIComponent(test.cwd)}`)).json() as string[])
    // MaterialX reads files through its file system, which in a browser is
    // @mtlx/format's virtual file system, its root the working directory:
    // the working directory's files under the MaterialX search paths of the
    // registration's ENV (PXR_MTLX_PLUGIN_SEARCH_PATHS, read by usdMtlx and
    // hdMtlx) are put there.
    let vfs = getVirtualFileSystem()
    if (!vfs) { vfs = VirtualFileSystem.create('/mtlx'); setVirtualFileSystem(vfs) }
    for (const dir of (test.env.PXR_MTLX_PLUGIN_SEARCH_PATHS ?? '').split(':').filter(Boolean)) {
      const prefix = dir.replace(/^(\.\/)+/, '').replace(/\/*$/, '/')
      for (const file of cwdFiles) {
        if (file.startsWith(prefix)) vfs.addFile(file, await (await fetch(new URL(file, cwd))).text())
      }
    }
    // Storm's MaterialX support (PXR_ENABLE_MATERIALX_SUPPORT in the reference
    // build; pxr/imaging/hdSt/src/materialx.ts), which also registers usdMtlx;
    // loaded once the ENV is set, as usdMtlx reads its search paths when its
    // plugin registers (upstream, in a process started with the ENV).
    await import('typescript-usd/hdSt/materialx')
    // The test's http resolver, a URI resolver plugin of this page.
    DefineResolver('UsdImagingGLTestHttpResolver', HttpResolver)
    PlugRegistry.GetInstance().RegisterPlugins({ Plugins: [{
      Name: 'UsdImagingGLTestHttpResolver', Type: 'library',
      Info: { Types: { UsdImagingGLTestHttpResolver: { bases: ['ArResolver'], uriSchemes: ['http'] } } },
    }] })
    Hdx_RegisterShaderResources()
    await UsdShaders_RegisterShaderNodesAsync()
    await UsdHydra_RegisterShaderNodesAsync()
    const hgi = await HgiWebGPU.create()
    if (!hgi) throw new Error('no WebGPU device')
    hgi.setShaderBodyTranslator(HgiWebGPUGlslShaderBodyTranslator)
    hgi.getPrimaryDevice().addEventListener('uncapturederror', ev => {
      if (gpuErrors.length < 50) gpuErrors.push((ev as GPUUncapturedErrorEvent).error.message)
    })
    // The test's working directory (see the header).
    const argv = test.argv.map((a, i) => test.argv[i - 1] === '-stage' ? new URL(a, cwd).href : a)
    const driver = new My_TestGLDrawing(hgi, line => stdout.push(line))
    driver.setImageWriter(async image => {
      images.push(image.filename)
      const header = JSON.stringify({ width: image.width, height: image.height, channels: image.channels })
      await fetch(`/__image?test=${encodeURIComponent(test.name)}&name=${encodeURIComponent(image.filename)}&header=${encodeURIComponent(header)}`,
        { method: 'POST', body: new Blob([image.data as Uint8Array<ArrayBuffer>]) })
    })
    const { exitCode, numErrors } = await BasicTest(argv, driver, line => stdout.push(line))
    record.exitCode = exitCode
    record.numErrors = numErrors
    const renderIndex = driver.getEngine()?._getRenderIndexForTesting() as
      { getRprimIds(): string[], getSprimIds(): string[], getBprimIds(): string[], getTaskIds(): string[] } | null
    if (renderIndex) {
      record.renderIndex = {
        rprims: renderIndex.getRprimIds().length,
        sprims: renderIndex.getSprimIds().length,
        bprims: renderIndex.getBprimIds().length,
        tasks: renderIndex.getTaskIds(),
      }
    }
  } catch (e) {
    record.exception = String((e as Error)?.stack ?? e)
  }
  const mgr = TfDiagnosticMgr.GetInstance()
  for (let i = mgr.getErrorBegin(); i < mgr.getErrorEnd(); i++) {
    if (diagnostics.length < 200) diagnostics.push(`error (marked): ${mgr.getError(i)?.getCommentary()}`)
  }
  record.ms = Math.round(performance.now() - t0)
  record.stdout = stdout
  record.diagnostics = [...new Set(diagnostics)]
  record.gpuErrors = gpuErrors
  record.images = images
  await fetch('/__result', { method: 'POST', body: JSON.stringify(record) })
  location.replace(`${location.pathname}?i=${index + 1}`)
}
