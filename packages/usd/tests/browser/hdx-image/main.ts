// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/unitTestDelegate.cpp,
//  pxr/imaging/hio/stbImage.cpp
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Browser half of tests/browser/hdx-image/run.mjs: runs one ported hdx testenv
// program (pxr/imaging/hdx/tests/upstream/<test>.ts, `export async function
// main(hgi)`) on HgiWebGPU with the GLSL-to-WGSL translator. The images the
// program writes through Hdx_UnitTestDelegate::WriteRenderBufferToFile are
// converted as HioImage writes PNGs (hio/stbImage.cpp:566-603:
// floor(255 * v + 0.499999) clamped; rows flipped because WriteRenderBufferToFile
// sets storage.flipped, hdx/unitTestDelegate.cpp:1157) and posted with the
// program's exit status and stdout.
import { TfDiagnosticMgr } from '../../../pxr/base/tf/src/diagnostic.ts'
import { HgiWebGPU } from '../../../pxr/imaging/hgiWebGPU/src/index.ts'
import { HgiWebGPUGlslShaderBodyTranslator } from '../../../pxr/imaging/hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts'
import { Hdx_RegisterShaderResources } from '../../../pxr/imaging/hdx/src/shaderResources.ts'
import { HioFormat } from '../../../pxr/imaging/hio/src/types.ts'
import '../../../pxr/imaging/hdSt/src/index.ts'
import { Hdx_UnitTestDelegate, type Hdx_UnitTestImageStorage } from '../../../pxr/imaging/hdx/src/unitTestDelegate.ts'
import { UsdShaders_RegisterShaderNodesAsync } from '../../../pxr/usd/plugin/usdShaders/src/index.ts'
import type { Hgi } from '../../../pxr/imaging/hgi/src/index.ts'

const log = document.getElementById('log')!
const test = new URLSearchParams(location.search).get('test') ?? ''
// The registered arguments (run.mjs); programs that take none ignore them.
const argv = JSON.parse(new URLSearchParams(location.search).get('argv') ?? '[]') as string[]
// The registration's ENV (e.g. HDX_ENABLE_OIT=1), read by TfGetEnvSetting
// from globalThis.process.env (pxr/base/tf/src/envSetting.ts); one page runs
// one registration, so it is set once before the program loads.
const env = JSON.parse(new URLSearchParams(location.search).get('env') ?? '{}') as Record<string, string>
if (Object.keys(env).length) (globalThis as { process?: { env: Record<string, string> } }).process = { env }
// Ported upstream programs, and browser self-checks of this repository
// (tests/browser/*.ts, same interface; not upstream comparisons).
const programs = import.meta.glob(['../../../pxr/imaging/hdx/tests/upstream/testHdx*.ts',
  '../../../pxr/imaging/hdx/tests/browser/*.ts']) as
  Record<string, () => Promise<{ main(hgi: Hgi): Promise<{ status: number, stdout: string }> }>>

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
  const r = Math.floor(255 * Math.fround(value) + 0.499999)
  return Math.min(255, Math.max(0, r))
}

/** The 8-bit RGBA texels HioImage writes for `storage`. */
function toRgba8(storage: Hdx_UnitTestImageStorage): { width: number, height: number, rgba: string } {
  const { width, height, data } = storage
  const rgba = new Uint8Array(width * height * 4)
  let channels = 4
  let read: (i: number) => number
  switch (storage.format) {
    case HioFormat.HioFormatFloat16Vec4: {
      const halves = new Uint16Array(data.buffer, data.byteOffset, width * height * 4)
      read = i => quantize(halfToFloat(halves[i]!))
      break
    }
    case HioFormat.HioFormatFloat32Vec4: {
      const floats = new Float32Array(data.buffer, data.byteOffset, width * height * 4)
      read = i => quantize(floats[i]!)
      break
    }
    case HioFormat.HioFormatFloat32: {
      const floats = new Float32Array(data.buffer, data.byteOffset, width * height)
      channels = 1
      read = i => quantize(floats[i]!)
      break
    }
    case HioFormat.HioFormatUNorm8Vec4:
    case HioFormat.HioFormatUNorm8Vec4srgb:
      read = i => data[i]!
      break
    default:
      throw new Error(`unsupported HioFormat ${storage.format}`)
  }
  for (let y = 0; y < height; y++) {
    // flipped: the first row written is the last row of the buffer
    const srcRow = storage.flipped ? height - 1 - y : y
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        rgba[(y * width + x) * 4 + c] = channels === 4
          ? read((srcRow * width + x) * 4 + c)
          : c < 3 ? read(srcRow * width + x) : 255
      }
    }
  }
  let bin = ''
  for (let i = 0; i < rgba.length; i += 0x8000) bin += String.fromCharCode(...rgba.subarray(i, i + 0x8000))
  return { width, height, rgba: btoa(bin) }
}

// The runner's id of this page (run.mjs ignores posts of earlier pages).
const run = new URLSearchParams(location.search).get('run') ?? ''
const result: Record<string, unknown> = { test, run, userAgent: navigator.userAgent }
const images: Record<string, unknown> = {}
try {
  const load = programs[`../../../pxr/imaging/hdx/tests/upstream/${test}.ts`] ??
    programs[`../../../pxr/imaging/hdx/tests/browser/${test}.ts`]
  if (!load) throw new Error(`no ported program ${test}`)
  Hdx_RegisterShaderResources()
  // What the native build's plugin system makes known to SdrRegistry
  // (tests/browser/usdimaging-gl-image/main.ts does the same): among them the
  // sdrGlslfx parser plugin, without which GetShaderNodeFromSourceCode
  // finds no parser for "glslfx" and returns null
  // (sdr/registry.cpp:596-655; the parsers come from PlugRegistry,
  // registry.cpp:1093-1103); testHdxPickAndHighlight's translucent
  // material needs it (testHdxPickAndHighlight.cpp:433-438).
  await UsdShaders_RegisterShaderNodesAsync()
  Hdx_UnitTestDelegate.setImageWriter((filePath, storage) => {
    images[filePath] = toRgba8(storage)
    return true
  })
  const hgi = await HgiWebGPU.create()
  if (!hgi) throw new Error('no WebGPU device')
  hgi.setShaderBodyTranslator(HgiWebGPUGlslShaderBodyTranslator)
  hgi.getPrimaryDevice().addEventListener('uncapturederror', (ev) => {
    const msg = (ev as GPUUncapturedErrorEvent).error.message
    if (gpuErrors.length < 50) gpuErrors.push(msg)
  })
  const program = await load()
  const { status, stdout } = await (program.main as (hgi: Hgi, argv: string[]) => Promise<{ status: number, stdout: string }>)(hgi, argv)
  result.status = status
  result.stdout = stdout
} catch (e) {
  // Safari's Error.stack omits the message; record both.
  result.exception = `${String(e)}\n${String((e as Error)?.stack ?? "")}`
}
result.images = images
result.diagnostics = diagnostics
result.gpuErrors = gpuErrors
await fetch('/__result', { method: 'POST', body: JSON.stringify(result) })
log.textContent = result.exception ? `failed: ${result.exception}` : `done: status ${result.status}`
