// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp,
//  pxr/imaging/hio/stbImage.cpp
// Copyright 2018, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Browser half of tests/browser/storm-image/run.mjs: runs the ported
// testHdStDepthBias (pxr/imaging/hdSt/tests/upstream/testHdStDepthBias.ts)
// on HgiWebGPU with the GLSL-to-WGSL translator, reads the color AOV back
// and posts it quantized as upstream's HioImage writes PNGs
// (hio/stbImage.cpp:566-603, floor(255 * v + 0.499999) clamped, rows flipped
// because WriteToFile sets storage.flipped, unitTestHelper.h:416-421).
import { TfDiagnosticMgr } from '../../../pxr/base/tf/src/diagnostic.ts'
import { HgiWebGPU, HgiWebGPUGraphicsCmds, HgiWebGPUComputeCmds } from '../../../pxr/imaging/hgiWebGPU/src/index.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../../pxr/imaging/hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts'
import { Hdx_RegisterShaderResources } from '../../../pxr/imaging/hdx/src/shaderResources.ts'
import '../../../pxr/imaging/hdSt/src/index.ts'
import { My_TestGLDrawing } from '../../../pxr/imaging/hdSt/tests/upstream/testHdStDepthBias.ts'
import type { HdStTestAovReadback } from '../../../pxr/imaging/hdSt/src/unitTestHelper.ts'

const log = document.getElementById('log')!
const diagnostics: string[] = []
const gpuErrors: string[] = []
TfDiagnosticMgr.GetInstance().addDelegate({
  issueError(e) { diagnostics.push(`error: ${(e as { getCommentary?: () => string }).getCommentary?.() ?? String(e)}`) },
  issueWarning(w) { diagnostics.push(`warning: ${(w as { getCommentary?: () => string }).getCommentary?.() ?? String(w)}`) },
  issueStatus() {},
})

function halfToFloat(h: number): number {
  const s = (h & 0x8000) ? -1 : 1
  const e = (h >> 10) & 0x1f
  const f = h & 0x3ff
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024)
  if (e === 31) return f ? NaN : s * Infinity
  return s * Math.pow(2, e - 15) * (1 + f / 1024)
}

/** hio/stbImage.cpp:566-575 */
function quantize(value: number): number {
  // In float32, as the C++ computes it: 0.5 quantizes to 128, not 127.
  const r = Math.floor(Math.fround(Math.fround(255 * Math.fround(value)) + Math.fround(0.499999)))
  return Math.min(255, Math.max(0, r))
}

function toRgba8(rb: HdStTestAovReadback | null): { width: number, height: number, rgba: number[] } | null {
  if (!rb) return null
  const { width, height } = rb
  const halves = new Uint16Array(rb.data.buffer, rb.data.byteOffset, width * height * 4)
  const rgba = new Array<number>(width * height * 4)
  for (let y = 0; y < height; y++) {
    // flipped: the first row written is the last row of the buffer
    const srcRow = rb.flipped ? height - 1 - y : y
    for (let i = 0; i < width * 4; i++) {
      rgba[y * width * 4 + i] = quantize(halfToFloat(halves[srcRow * width * 4 + i]!))
    }
  }
  return { width, height, rgba }
}

const result: Record<string, unknown> = { userAgent: navigator.userAgent }
// Call trace of the Hgi command objects (for diagnosing a run).
const trace: string[] = []
const traceArg = (a: unknown): string => typeof a === 'number' || typeof a === 'boolean' ? String(a)
  : typeof a === 'string' ? a : a && typeof a === 'object' && 'data' in (a as object) ? `[${Array.from((a as { data: ArrayLike<number> }).data).join(',')}]` : typeof a
for (const [cls, name] of [[HgiWebGPUGraphicsCmds, 'gfx'], [HgiWebGPUComputeCmds, 'compute']] as const) {
  const proto = cls.prototype as unknown as Record<string, unknown>
  for (const m of Object.getOwnPropertyNames(proto)) {
    const f = proto[m]
    if (m === 'constructor' || typeof f !== 'function' || !/^[A-Z]/.test(m)) continue
    proto[m] = function (this: unknown, ...args: unknown[]) {
      if (trace.length < 400) trace.push(`${name}.${m}(${args.map(traceArg).join(', ')})`)
      return (f as (...a: unknown[]) => unknown).apply(this, args)
    }
  }
}
try {
  Hdx_RegisterShaderResources()
  const hgi = await HgiWebGPU.create()
  if (!hgi) throw new Error('no WebGPU device')
  hgi.setShaderBodyTranslator(HgiWebGPUGlslShaderBodyTranslator)
  hgi.getPrimaryDevice().addEventListener('uncapturederror', (ev) => {
    const msg = (ev as GPUUncapturedErrorEvent).error.message
    if (gpuErrors.length < 50) gpuErrors.push(msg)
  })
  const test = new My_TestGLDrawing(hgi)
  test.initTest()
  const { disabled, enabled } = await test.offscreenTest()
  result.disabled = toRgba8(disabled)
  result.enabled = toRgba8(enabled)
  // Scene state (for diagnosing a run).
  const driver = test.getDriver() as unknown as {
    getDelegate(): { getRenderIndex(): { getRprimIds(): string[], getDrawItems(c: unknown, t: string[]): unknown[] } }
    _renderPasses: { getRprimCollection(): unknown, _getCommandBuffer(): { getTotalSize(): number } }[]
  }
  const index = driver.getDelegate().getRenderIndex()
  result.scene = {
    rprims: index.getRprimIds(),
    passes: driver._renderPasses.map(rp => ({
      drawItems: index.getDrawItems(rp.getRprimCollection(), ['geometry']).length,
      commandBuffer: rp._getCommandBuffer().getTotalSize(),
    })),
  }
} catch (e) {
  result.exception = String((e as Error)?.stack ?? e)
}
const mgr = TfDiagnosticMgr.GetInstance()
for (let i = mgr.getErrorBegin(); i < mgr.getErrorEnd(); i++) {
  diagnostics.push(`error: ${mgr.getError(i)?.getCommentary()}`)
}
result.diagnostics = diagnostics
result.gpuErrors = gpuErrors
result.trace = trace
await fetch('/__result', { method: 'POST', body: JSON.stringify(result) })
log.textContent = result.exception ? `failed: ${result.exception}` : 'done'
