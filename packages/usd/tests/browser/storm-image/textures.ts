// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hdSt/testenv/testHdStTextureHandleRegistry.cpp,
//  pxr/imaging/hio/stbImage.cpp, pxr/imaging/hio/glslfx.cpp
// Copyright 2016, 2018, 2020 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Browser half of tests/browser/storm-image/run-textures.mjs: runs the ported
// Storm texture image tests (pxr/imaging/hdSt/tests/upstream/
// testHdStTextureObjectRegistry.ts, testHdStTextureHandleRegistry.ts,
// testHdStSamplerObjectRegistry.ts, testHdStDynamicUvTexture.ts) on
// HgiWebGPU with the GLSL-to-WGSL translator and posts the images their
// WriteToFile calls produce (HdSt_TextureTestDriver quantises them as
// HioImage writes PNGs). Each test reads its testenv input textures,
// served from pxr/imaging/hdSt/tests/fixtures/textureImages/<test>/, through
// an in-memory asset resolver standing in for the test's working directory.
import { TfDiagnosticMgr } from '../../../pxr/base/tf/src/diagnostic.ts'
import { ArInMemoryResolver, _setResolverForTest } from '../../../pxr/usd/ar/src/internal.ts'
import { ArDefaultResolver } from '../../../pxr/usd/ar/src/resolver.ts'
import { ArInMemoryAsset } from '../../../pxr/usd/ar/src/asset.ts'
import { ArResolvedPath } from '../../../pxr/usd/ar/src/resolvedPath.ts'
import { HgiWebGPU } from '../../../pxr/imaging/hgiWebGPU/src/index.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../../pxr/imaging/hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts'
import '../../../pxr/imaging/hdSt/src/index.ts'
import type { HdSt_TextureTestImage } from '../../../pxr/imaging/hdSt/src/textureTestDriver.ts'
import * as objectRegistry from '../../../pxr/imaging/hdSt/tests/upstream/testHdStTextureObjectRegistry.ts'
import * as handleRegistry from '../../../pxr/imaging/hdSt/tests/upstream/testHdStTextureHandleRegistry.ts'
import * as samplerRegistry from '../../../pxr/imaging/hdSt/tests/upstream/testHdStSamplerObjectRegistry.ts'
import * as dynamicUv from '../../../pxr/imaging/hdSt/tests/upstream/testHdStDynamicUvTexture.ts'
import { TexturedDrawing } from '../../../pxr/imaging/hdSt/tests/texturedCodegenScene.ts'
import { Hdx_RegisterShaderResources } from '../../../pxr/imaging/hdx/src/shaderResources.ts'
import { UsdShaders_RegisterShaderNodesAsync } from '../../../pxr/usd/plugin/usdShaders/src/index.ts'
import type { HdStTestAovReadback } from '../../../pxr/imaging/hdSt/src/unitTestHelper.ts'

const log = document.getElementById('log')!
const diagnostics: string[] = []
const gpuErrors: string[] = []
TfDiagnosticMgr.GetInstance().addDelegate({
  issueError(e) { diagnostics.push(`error: ${(e as { getCommentary?: () => string }).getCommentary?.() ?? String(e)}`) },
  issueWarning(w) { diagnostics.push(`warning: ${(w as { getCommentary?: () => string }).getCommentary?.() ?? String(w)}`) },
  issueStatus() {},
})

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function halfToFloat(h: number): number {
  const s = (h & 0x8000) ? -1 : 1
  const e = (h >> 10) & 0x1f
  const f = h & 0x3ff
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024)
  if (e === 31) return f ? NaN : s * Infinity
  return s * Math.pow(2, e - 15) * (1 + f / 1024)
}

/** hio/stbImage.cpp:566-575, rows flipped as WriteToFile does
 *  (unitTestHelper.h:416-421); as main.ts. */
function aovToRgba8(rb: HdStTestAovReadback): { width: number, height: number, rgba: Uint8Array } {
  const { width, height } = rb
  const halves = new Uint16Array(rb.data.buffer, rb.data.byteOffset, width * height * 4)
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcRow = rb.flipped ? height - 1 - y : y
    for (let i = 0; i < width * 4; i++) {
      // In float32, as the C++ computes it: 0.5 quantizes to 128, not 127.
      const v = Math.floor(Math.fround(Math.fround(255 * Math.fround(halfToFloat(halves[srcRow * width * 4 + i]!))) + Math.fround(0.499999)))
      rgba[y * width * 4 + i] = Math.min(255, Math.max(0, v))
    }
  }
  return { width, height, rgba }
}

const only = new URLSearchParams(location.search).get('test')
const results: Record<string, unknown> = {}
// The runner's id of this page (run-textures.mjs ignores other pages' posts).
const run = new URLSearchParams(location.search).get('run') ?? ''
const out: Record<string, unknown> = { run, userAgent: navigator.userAgent, results }
try {
  const hgi = await HgiWebGPU.create()
  if (!hgi) throw new Error('no WebGPU device')
  hgi.setShaderBodyTranslator(HgiWebGPUGlslShaderBodyTranslator)
  hgi.getPrimaryDevice().addEventListener('uncapturederror', (ev) => {
    const msg = (ev as GPUUncapturedErrorEvent).error.message
    if (gpuErrors.length < 50) gpuErrors.push(msg)
  })

  const tests = [
    ['testHdStTextureObjectRegistry', objectRegistry],
    ['testHdStTextureHandleRegistry', handleRegistry],
    ['testHdStSamplerObjectRegistry', samplerRegistry],
    ['testHdStDynamicUvTexture', dynamicUv],
  ] as const
  for (const [name, mod] of tests) {
    if (only && only !== name) continue
    log.textContent = `running ${name}…`
    const files = new Map<string, Uint8Array>()
    for (const file of mod.INPUT_FILES) {
      const res = await fetch(`/__fixtures/${name}/${file}`)
      files.set(file, new Uint8Array(await res.arrayBuffer()))
    }
    _setResolverForTest(new ArInMemoryResolver(files))
    const images: Record<string, { width: number, height: number, rgba: string }> = {}
    const writer = (image: HdSt_TextureTestImage) => {
      images[image.filename] = { width: image.width, height: image.height, rgba: toBase64(image.rgba) }
    }
    const replaceFile = (dst: string, src: string) => { files.set(dst, files.get(src)!) }
    const result: Record<string, unknown> = { images }
    results[name] = result
    try {
      const test = name === 'testHdStTextureHandleRegistry'
        ? new handleRegistry.My_TestGLDrawing(hgi, writer, replaceFile)
        : new (mod as typeof objectRegistry).My_TestGLDrawing(hgi, writer)
      test.initTest()
      await test.offscreenTest()
      await hgi.getPrimaryDevice().queue.onSubmittedWorkDone()
      result.ok = true
    } catch (e) {
      result.ok = false
      result.exception = String((e as Error)?.stack ?? e)
    }
  }
  // The textured material scene of
  // pxr/imaging/hdSt/tests/fixtures/texturedCodegen (texturedCodegenScene.ts).
  if (!only || only === 'texturedCodegen') {
    log.textContent = 'running texturedCodegen…'
    Hdx_RegisterShaderResources()
    const res = await fetch('/__codegenFixtures/texture.png')
    // The capture's texture.png (relative to its working directory) from
    // memory; every other path, Storm's glslfx plugin resource files among
    // them (/usd/hdSt/resources/shaders/*.glslfx, resolved through Ar by
    // hio/glslfx.cpp:151-170), through the default resolver as natively, as
    // hdSt/tests/texturedCodegen.test.ts does. An in-memory resolver alone
    // cannot resolve those files, so no shader compiled and nothing drew.
    const texture = new Uint8Array(await res.arrayBuffer())
    _setResolverForTest(new class extends ArDefaultResolver {
      override async resolve(assetPath: string) {
        return assetPath === 'texture.png' ? new ArResolvedPath(assetPath) : super.resolve(assetPath)
      }
      override async openAsset(resolvedPath: ArResolvedPath) {
        return resolvedPath.toString() === 'texture.png' ? new ArInMemoryAsset(texture) : super.openAsset(resolvedPath)
      }
    }())
    // After the resolver above: the discovery opens usdShaders'
    // shaderDefs.usda (a plugin resource file) through Ar, which the
    // in-memory resolver of the tests before this one cannot resolve.
    await UsdShaders_RegisterShaderNodesAsync()
    const images: Record<string, { width: number, height: number, rgba: string }> = {}
    const result: Record<string, unknown> = { images }
    results.texturedCodegen = result
    try {
      const test = new TexturedDrawing(hgi)
      test.initTest()
      const rb = await test.offscreenTextured()
      if (rb) {
        const img = aovToRgba8(rb)
        images['texturedGrid.png'] = { width: img.width, height: img.height, rgba: toBase64(img.rgba) }
      }
      result.ok = true
    } catch (e) {
      result.ok = false
      result.exception = String((e as Error)?.stack ?? e)
    }
  }
} catch (e) {
  out.exception = String((e as Error)?.stack ?? e)
}
const mgr = TfDiagnosticMgr.GetInstance()
for (let i = mgr.getErrorBegin(); i < mgr.getErrorEnd(); i++) {
  diagnostics.push(`error: ${mgr.getError(i)?.getCommentary()}`)
}
out.diagnostics = diagnostics
out.gpuErrors = gpuErrors
await fetch('/__result', { method: 'POST', body: JSON.stringify(out) })
log.textContent = out.exception ? `failed: ${out.exception}` : 'done'
