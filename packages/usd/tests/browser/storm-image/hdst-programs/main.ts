// Ported from OpenUSD 26.11.1: pxr/imaging/hio/stbImage.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Browser half of tests/browser/storm-image/hdst-programs/run.mjs: runs the ported
// hdSt testenv programs (pxr/imaging/hdSt/tests/upstream/<program>.ts,
// `BasicTest(hgi, argv)`) on HgiWebGPU with the GLSL-to-WGSL translator,
// once per registration the page is given (its pxr_register_test arguments
// and ENV), reads back every image the program writes and posts them
// quantized as upstream's HioImage writes PNGs (hio/stbImage.cpp:566-603,
// floor(255 * v + 0.499999) clamped, rows flipped because WriteToFile sets
// storage.flipped, unitTestHelper.h:416-421), with the program's stdout,
// Tf diagnostics and WebGPU errors.
//
// ENV: a registration's ENV (and the capture's addedEnv) is applied by
// setting globalThis.process = { env } for the duration of the test:
// TfGetEnvSetting (pxr/base/tf/src/envSetting.ts) reads
// globalThis.process.env at each call, uncached, so settings such as
// HD_ENABLE_FORCE_QUADRANGULATE (hdSt/src/mesh.ts) and
// HD_ENABLE_REFINED_CURVES (hd/src/basisCurves.ts) take the registered
// value. It is removed after the test.
import { TfDiagnosticMgr } from '../../../../pxr/base/tf/src/diagnostic.ts'
import { HgiWebGPU } from '../../../../pxr/imaging/hgiWebGPU/src/index.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../../../pxr/imaging/hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts'
import { Hdx_RegisterShaderResources } from '../../../../pxr/imaging/hdx/src/shaderResources.ts'
import '../../../../pxr/imaging/hdSt/src/index.ts'
import type { Hgi } from '../../../../pxr/imaging/hgi/src/index.ts'
import type { HdStTestAovReadback } from '../../../../pxr/imaging/hdSt/src/unitTestHelper.ts'

type Program = { BasicTest(hgi: Hgi, argv: readonly string[]): Promise<{ images: { name: string, image: HdStTestAovReadback }[], stdout?: string }> }
const programs = import.meta.glob('../../../../pxr/imaging/hdSt/tests/upstream/testHdSt*.ts') as Record<string, () => Promise<Program>>

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
/** hio/stbImage.cpp:566-575, in float32 as the C++ computes it. */
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

const tests = await (await fetch('/__tests')).json() as { name: string, program: string, argv: string[], env: Record<string, string> }[]
Hdx_RegisterShaderResources()
const hgi = await HgiWebGPU.create()
if (!hgi) throw new Error('no WebGPU device')
hgi.setShaderBodyTranslator(HgiWebGPUGlslShaderBodyTranslator)
hgi.getPrimaryDevice().addEventListener('uncapturederror', ev => {
  if (gpuErrors.length < 50) gpuErrors.push((ev as GPUUncapturedErrorEvent).error.message)
})
const g = globalThis as { process?: { env: Record<string, string> } }
for (const test of tests) {
  log.textContent = `${test.name}…`
  diagnostics = []; gpuErrors = []
  const result: Record<string, unknown> = { name: test.name, userAgent: navigator.userAgent }
  const mgr = TfDiagnosticMgr.GetInstance()
  const errorsBefore = mgr.getErrorEnd()
  const hadProcess = 'process' in g, previous = g.process
  g.process = { env: { ...test.env } }
  try {
    const load = programs[`../../../../pxr/imaging/hdSt/tests/upstream/${test.program}.ts`]
    if (!load) throw new Error(`no ported program ${test.program}`)
    const { images, stdout } = await (await load()).BasicTest(hgi, test.argv)
    result.images = Object.fromEntries(images.map(({ name, image }) => [name, toRgba8(image)]))
    result.stdout = stdout ?? ''
  } catch (e) {
    result.exception = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
  } finally {
    if (hadProcess) g.process = previous; else delete g.process
  }
  for (let i = errorsBefore; i < mgr.getErrorEnd(); i++) diagnostics.push(`error: ${mgr.getError(i)?.getCommentary()}`)
  // main(): TfErrorMark; EXIT_FAILURE unless clean (every program here).
  // Errors reach the delegate or the error list; either is an error posted.
  result.status = result.exception ? null : diagnostics.some(d => d.startsWith('error:')) ? 1 : 0
  result.diagnostics = diagnostics
  result.gpuErrors = gpuErrors
  await fetch('/__result', { method: 'POST', body: JSON.stringify(result) })
}
await fetch('/__done', { method: 'POST', body: '{}' })
log.textContent = 'done'
