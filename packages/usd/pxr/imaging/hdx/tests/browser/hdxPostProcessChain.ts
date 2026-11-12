// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/shaders/colorCorrection.glslfx,
//  pxr/imaging/hdx/testenv/testHdxRenderTask.cpp
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Browser self-check (not an upstream comparison) of the hdx post-process
// chain on a real GPU: the testHdxRenderTask scene (Hdx_UnitTestDelegate grid,
// render setup and render tasks) followed by HdxAovInputTask ->
// HdxColorCorrectionTask (sRGB) -> HdxPresentTask, which composites through
// HgiInterop into a WebGPU application texture (UNorm8Vec4).
//
// The expectation is derived from the linear color AOV the same run renders
// and colorCorrection.glslfx's FloatToSRGB (ColorCorrection.Fragment), with
// the Float16 colorIntermediate rounding and the unorm8 conversion of the
// destination; the presented image must equal it within 1/255 per channel,
// with the destination's rows top-down (hgiInterop/src/webgpu.ts). This
// checks this repository's chain against itself and the shader's formula;
// it is not a native capture comparison.
//
// Run: node tests/browser/hdx-image/run.mjs --test hdxPostProcessChain

import { Matrix4d as GfMatrix4d, Vec2i as GfVec2i, Vec3i as GfVec3i, Vec4d as GfVec4d, Vec4i as GfVec4i } from 'typescript-usd/gf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  AovTokens as HdAovTokens,
  Engine as HdEngine,
  RenderIndex as HdRenderIndex,
  Tokens as HdTokens,
  type Task as HdTask,
} from 'typescript-usd/hd'
import {
  HgiFormat,
  HgiSubmitWaitType,
  HgiTextureDesc,
  HgiTextureGpuToCpuOp,
  HgiTextureUsageBits,
  HgiTokens,
  type Hgi,
} from 'typescript-usd/hgi'
import { RenderDelegate as HdStRenderDelegate } from 'typescript-usd/hdSt'
import { HgiInteropWebGPUTokens } from 'typescript-usd/hgiInterop'
import { HdxAovInputTask, HdxAovInputTaskParams, HdxAovInputTaskParamsType } from '../../src/aovInputTask.ts'
import {
  HdxColorCorrectionTask,
  HdxColorCorrectionTaskParams,
  HdxColorCorrectionTaskParamsType,
} from '../../src/colorCorrectionTask.ts'
import { HdxPresentTask, HdxPresentTaskParams, HdxPresentTaskParamsType } from '../../src/presentTask.ts'
import { HdxRenderTaskParams, HdxRenderTaskParamsType } from '../../src/renderSetupTask.ts'
import { HdxColorCorrectionTokens } from '../../src/tokens.ts'
import { Hdx_UnitTestDelegate } from '../../src/unitTestDelegate.ts'

const W = 256
const H = 256

function halfToFloat(h: number): number {
  const s = (h & 0x8000) ? -1 : 1
  const e = (h >> 10) & 0x1f
  const f = h & 0x3ff
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024)
  if (e === 31) return f ? NaN : s * Infinity
  return s * Math.pow(2, e - 15) * (1 + f / 1024)
}

/** Round to the nearest binary16 value (as a number). */
function toHalf(v: number): number {
  if (v === 0 || !isFinite(v)) return v
  const e = Math.floor(Math.log2(Math.abs(v)))
  const step = Math.pow(2, Math.max(e, -14) - 10)
  return Math.round(v / step) * step
}

/** colorCorrection.glslfx FloatToSRGB, per component, in float32. */
function floatToSRGB(v: number): number {
  const f = Math.fround
  return v < 0.0031308 ? f(f(v) * f(12.92)) : f(f(1.055) * f(Math.pow(f(v), f(1.0 / 2.4))) - f(0.055))
}

export async function main(hgi: Hgi): Promise<{ status: number, stdout: string }> {
  let stdout = ''
  const driver = { name: HgiTokens.renderDriver, driver: hgi }
  const renderDelegate = new HdStRenderDelegate()
  const index = HdRenderIndex.new(renderDelegate, [driver])!
  const delegate = new Hdx_UnitTestDelegate(index)
  const engine = new HdEngine()

  const renderSetupTask = '/renderSetupTask'
  const renderTask = '/renderTask'
  const aovInputTask = '/aovInputTask'
  const colorCorrectionTask = '/colorCorrectionTask'
  const presentTask = '/presentTask'
  delegate.addRenderSetupTask(renderSetupTask)
  delegate.addRenderTask(renderTask)
  index.insertTask(delegate, aovInputTask, HdxAovInputTask)
  index.insertTask(delegate, colorCorrectionTask, HdxColorCorrectionTask)
  index.insertTask(delegate, presentTask, HdxPresentTask)

  const aovBindings = delegate.addAovBindings(new GfVec2i(W, H))
  const colorAovId = aovBindings[0]!.renderBufferId
  {
    const param = delegate.getTaskParam(renderSetupTask, HdTokens.params).Get<HdxRenderTaskParams>().Clone()
    param.viewport = new GfVec4d(0, 0, W, H)
    param.aovBindings = aovBindings
    delegate.setTaskParam(renderSetupTask, HdTokens.params, VtValue.create(param, HdxRenderTaskParamsType))
  }
  {
    const p = new HdxAovInputTaskParams()
    p.aovBufferPath = colorAovId
    p.depthBufferPath = aovBindings[1]!.renderBufferId
    delegate.setTaskParam(aovInputTask, HdTokens.params, VtValue.create(p, HdxAovInputTaskParamsType))
  }
  {
    const p = new HdxColorCorrectionTaskParams()
    p.colorCorrectionMode = HdxColorCorrectionTokens.sRGB
    p.aovName = HdAovTokens.color
    delegate.setTaskParam(colorCorrectionTask, HdTokens.params,
      VtValue.create(p, HdxColorCorrectionTaskParamsType))
  }

  // The application's framebuffer: a UNorm8Vec4 texture (a canvas stand-in).
  const fbDesc = new HgiTextureDesc()
  fbDesc.debugName = 'application framebuffer'
  fbDesc.dimensions = new GfVec3i(W, H, 1)
  fbDesc.format = HgiFormat.HgiFormatUNorm8Vec4
  fbDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget
  const fbTex = hgi.createTexture(fbDesc)
  {
    const p = new HdxPresentTaskParams()
    p.dstApi = HgiInteropWebGPUTokens.WebGPU
    p.dstFramebuffer = { color: fbTex }
    p.dstRegion = new GfVec4i(0, 0, W, H)
    delegate.setTaskParam(presentTask, HdTokens.params, VtValue.create(p, HdxPresentTaskParamsType))
  }

  delegate.addGrid('/grid', new GfMatrix4d(1))

  const tasks: HdTask[] = [renderSetupTask, renderTask, aovInputTask, colorCorrectionTask, presentTask]
    .map(id => index.getTask(id)!)
  engine.Execute(index, tasks)

  // The linear color AOV (Float16Vec4, rows bottom-up).
  let linear: Uint16Array | null = null
  Hdx_UnitTestDelegate.setImageWriter((_path, storage) => {
    linear = new Uint16Array(storage.data.buffer.slice(storage.data.byteOffset,
      storage.data.byteOffset + W * H * 8))
    return true
  })
  await delegate.writeRenderBufferToFile(colorAovId, 'linear')

  // The presented image.
  const presented = new Uint8Array(W * H * 4)
  {
    const blit = hgi.createBlitCmds()
    const op = new HgiTextureGpuToCpuOp()
    op.gpuSourceTexture = fbTex
    op.cpuDestinationBuffer = presented
    op.destinationBufferByteSize = presented.byteLength
    blit.copyTextureGpuToCpu(op)
    await hgi.submitCmds(blit, HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)
  }

  if (!linear) {
    return { status: 1, stdout: 'no linear AOV readback\nFAILED\n' }
  }
  const lin = linear as Uint16Array
  let maxDiff = 0
  let over = 0
  const distinct = new Set<string>()
  for (let r = 0; r < H; ++r) {
    // Destination row r (top-down) is AOV row H-1-r (bottom-up).
    const srcRow = H - 1 - r
    for (let x = 0; x < W; ++x) {
      for (let c = 0; c < 4; ++c) {
        const l = halfToFloat(lin[(srcRow * W + x) * 4 + c]!)
        const v = c < 3 ? toHalf(floatToSRGB(l)) : l
        const expected = Math.round(Math.min(1, Math.max(0, v)) * 255)
        const got = presented[(r * W + x) * 4 + c]!
        const d = Math.abs(got - expected)
        maxDiff = Math.max(maxDiff, d)
        if (d > 1) over++
      }
      distinct.add(Array.from(presented.subarray((r * W + x) * 4, (r * W + x) * 4 + 4)).join(','))
    }
  }
  stdout += `presented vs sRGB(linear AOV): max channel difference ${maxDiff}, ` +
    `channels over 1: ${over}, distinct presented colors: ${distinct.size}\n`

  hgi.destroyTexture(fbTex)
  if (over === 0 && distinct.size > 1) {
    stdout += 'OK\n'
    return { status: 0, stdout }
  }
  stdout += 'FAILED\n'
  return { status: 1, stdout }
}
