// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStCurveDrawing.cpp,
//  pxr/imaging/hio/stbImage.cpp
// Copyright 2018, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Browser half of tests/browser/storm-image/curves/run.mjs: runs the ported
// testHdStCurveDrawing (pxr/imaging/hdSt/tests/upstream/testHdStCurveDrawing.ts)
// on HgiWebGPU with the GLSL-to-WGSL translator, once per registered test the
// page is given (its pxr_register_test arguments), reads the color AOV back
// and posts it quantized as upstream's HioImage writes PNGs
// (hio/stbImage.cpp:566-603, floor(255 * v + 0.499999) clamped, rows flipped
// because WriteToFile sets storage.flipped, unitTestHelper.h:416-421), with
// the Tf diagnostics and WebGPU errors of that test.
import { TfDiagnosticMgr } from '../../../../pxr/base/tf/src/diagnostic.ts'
import { HgiWebGPU } from '../../../../pxr/imaging/hgiWebGPU/src/index.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../../../pxr/imaging/hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts'
import { Hdx_RegisterShaderResources } from '../../../../pxr/imaging/hdx/src/shaderResources.ts'
import '../../../../pxr/imaging/hdSt/src/index.ts'
import { BasicTest } from '../../../../pxr/imaging/hdSt/tests/upstream/testHdStCurveDrawing.ts'
import type { HdStTestAovReadback } from '../../../../pxr/imaging/hdSt/src/unitTestHelper.ts'

const log = document.getElementById('log')!
let diagnostics: string[] = []
let gpuErrors: string[] = []
TfDiagnosticMgr.GetInstance().addDelegate({
  issueError(e) { if (diagnostics.length < 200) diagnostics.push(`error: ${(e as { getCommentary?: () => string }).getCommentary?.() ?? String(e)}`) },
  issueWarning(w) { if (diagnostics.length < 200) diagnostics.push(`warning: ${(w as { getCommentary?: () => string }).getCommentary?.() ?? String(w)}`) },
  issueStatus() {},
})

function halfToFloat(h: number): number {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024)
  if (e === 31) return f ? NaN : s * Infinity
  return s * Math.pow(2, e - 15) * (1 + f / 1024)
}
/** hio/stbImage.cpp:566-575 */
// In float32, as the C++ computes it: 0.5 quantizes to 128, not 127.
const quantize = (v: number) => Math.min(255, Math.max(0, Math.floor(Math.fround(Math.fround(255 * Math.fround(v)) + Math.fround(0.499999)))))

function toRgba8(rb: HdStTestAovReadback): { width: number, height: number, rgba: string } {
  const { width, height } = rb
  const halves = new Uint16Array(rb.data.buffer, rb.data.byteOffset, width * height * 4)
  const bytes = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcRow = rb.flipped ? height - 1 - y : y
    for (let i = 0; i < width * 4; i++) bytes[y * width * 4 + i] = quantize(halfToFloat(halves[srcRow * width * 4 + i]!))
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { width, height, rgba: btoa(binary) }
}

const tests = await (await fetch('/__tests')).json() as { name: string, argv: string[] }[]
Hdx_RegisterShaderResources()
const hgi = await HgiWebGPU.create()
if (!hgi) throw new Error('no WebGPU device')
hgi.setShaderBodyTranslator(HgiWebGPUGlslShaderBodyTranslator)
hgi.getPrimaryDevice().addEventListener('uncapturederror', ev => {
  if (gpuErrors.length < 50) gpuErrors.push((ev as GPUUncapturedErrorEvent).error.message)
})
for (const test of tests) {
  log.textContent = `${test.name}…`
  diagnostics = []; gpuErrors = []
  const result: Record<string, unknown> = { name: test.name, userAgent: navigator.userAgent }
  const mgr = TfDiagnosticMgr.GetInstance()
  const errorsBefore = mgr.getErrorEnd()
  try {
    const { image, output } = await BasicTest(hgi, test.argv)
    result.output = output
    if (image) result.image = toRgba8(image)
  } catch (e) {
    result.exception = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
  }
  for (let i = errorsBefore; i < mgr.getErrorEnd(); i++) diagnostics.push(`error: ${mgr.getError(i)?.getCommentary()}`)
  result.diagnostics = diagnostics
  result.gpuErrors = gpuErrors
  await fetch('/__result', { method: 'POST', body: JSON.stringify(result) })
}
await fetch('/__done', { method: 'POST', body: '{}' })
log.textContent = 'done'
