// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/testenv/testHdxPresentTask.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/testenv/testHdxPresentTask.cpp (OpenUSD
// 26.11.1): HgiInterop::TransferToApp's normalizedSrcRegion, which
// HdxPresentTask hands to the interop. Browser test program
// (tests/browser/hdx-image/run.mjs); no images.
//
// The reference build exits with a segmentation fault (capture.json
// returnCode -11): the test treats the Hgi texture's raw resource as an
// OpenGL texture name (testHdxPresentTask.cpp:117-123) and binds a GL
// framebuffer, which holds only for an HgiGL build; the reference build is
// hgiMetal, where GetRawResource is an id<MTLTexture>.
//
// Divergences (WebGPU destination, hgiInterop/src/webgpu.ts):
// - The destination framebuffer is an application texture of the same Hgi
//   (an HgiInteropWebGPUFramebuffer) instead of a GL FBO, and dstApi is
//   WebGPU. Each blit composites into a new destination texture (WebGPU
//   zero-initializes textures), which plays glClear(0, 0, 0, 0).
// - The GL_NEAREST sampler state of the source (testHdxPresentTask.cpp:
//   117-123) is the interop's own nearest sampler.
// - glReadPixels reads rows bottom-up (OpenGL's origin); a WebGPU
//   application texture is displayed top-down, so the readback row r of the
//   destination is OpenGL's row kH - 1 - r. The expected quadrant layout is
//   upstream's, read through that mapping.
// - Returns the exit status and stdout instead of exiting; std::cerr lines
//   go to stdout.

import { Vec3i as GfVec3i, Vec4f as GfVec4f, Vec4i as GfVec4i } from 'typescript-usd/gf'

import {
  HgiFormat,
  HgiSubmitWaitType,
  HgiTextureDesc,
  HgiTextureGpuToCpuOp,
  HgiTextureUsageBits,
  type Hgi,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HgiInterop, HgiInteropWebGPUTokens } from 'typescript-usd/hgiInterop'
import { TF_RUNTIME_ERROR, TF_VERIFY } from '../../src/tfDiagnostic.ts'

// testHdxPresentTask.cpp:46-52
const kW = 4
const kH = 4

const kRed = [255, 0, 0, 255]
const kGreen = [0, 255, 0, 255]
const kBlue = [0, 0, 255, 255]
const kWhite = [255, 255, 255, 255]

/** testHdxPresentTask.cpp:54-71 */
function BuildTestPixels(): Uint8Array {
  const data = new Uint8Array(kW * kH * 4)
  for (let row = 0; row < kH; ++row) {
    for (let col = 0; col < kW; ++col) {
      let c: number[]
      if (row < 2) { c = col < 2 ? kRed : kGreen } else { c = col < 2 ? kBlue : kWhite }
      const i = (row * kW + col) * 4
      data[i + 0] = c[0]!; data[i + 1] = c[1]!
      data[i + 2] = c[2]!; data[i + 3] = c[3]!
    }
  }
  return data
}

/** testHdxPresentTask.cpp:73-80 (glReadPixels): read the destination back
 *  and return OpenGL's bottom-up rows (see the header). */
async function ReadPixels(hgi: Hgi, tex: HgiTextureHandle, w: number, h: number): Promise<Uint8Array> {
  const raw = new Uint8Array(w * h * 4)
  const blit = hgi.createBlitCmds()
  const op = new HgiTextureGpuToCpuOp()
  op.gpuSourceTexture = tex
  op.cpuDestinationBuffer = raw
  op.destinationBufferByteSize = raw.byteLength
  blit.copyTextureGpuToCpu(op)
  await hgi.submitCmds(blit, HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)
  const buf = new Uint8Array(w * h * 4)
  for (let r = 0; r < h; ++r) {
    buf.set(raw.subarray((h - 1 - r) * w * 4, (h - r) * w * 4), r * w * 4)
  }
  return buf
}

/** testHdxPresentTask.cpp:82-94. Returns true if every pixel in the buffer
 *  matches the expected color. */
function AllPixelsMatch(px: Uint8Array, w: number, h: number, expected: number[]): boolean {
  for (let i = 0; i < w * h; ++i) {
    const o = i * 4
    if (px[o] !== expected[0] || px[o + 1] !== expected[1] || px[o + 2] !== expected[2]) {
      return false
    }
  }
  return true
}

/** testHdxPresentTask.cpp:98-223 */
export async function main(hgi: Hgi): Promise<{ status: number, stdout: string }> {

  let stdout = ''

  // ---- create Hgi and source texture -------------------------------------

  const pixelData = BuildTestPixels()

  const texDesc = new HgiTextureDesc()
  texDesc.debugName = 'testSrcRegionTexture'
  texDesc.dimensions = new GfVec3i(kW, kH, 1)
  texDesc.format = HgiFormat.HgiFormatUNorm8Vec4
  texDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
  texDesc.initialData = pixelData
  texDesc.pixelsByteSize = pixelData.byteLength

  const srcTex = hgi.createTexture(texDesc)
  TF_VERIFY(srcTex.isSet())

  // ---- create destination framebuffer (see the header) -------------------

  const NewFramebuffer = (): HgiTextureHandle => {
    const fbDesc = new HgiTextureDesc()
    fbDesc.debugName = 'testDstFramebuffer'
    fbDesc.dimensions = new GfVec3i(kW, kH, 1)
    fbDesc.format = HgiFormat.HgiFormatUNorm8Vec4
    fbDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsColorTarget
    return hgi.createTexture(fbDesc)
  }

  const interop = new HgiInterop()
  const dstRegion = new GfVec4i(0, 0, kW, kH)
  let allPassed = true

  // Helper: clear FBO, blit with given srcRegion, read back.
  const blit = async (srcRegion: GfVec4f): Promise<Uint8Array> => {
    const fbTex = NewFramebuffer()
    interop.transferToApp(hgi, srcTex, null,
      HgiInteropWebGPUTokens.WebGPU, { color: fbTex }, dstRegion, srcRegion)
    const px = await ReadPixels(hgi, fbTex, kW, kH)
    hgi.destroyTexture(fbTex)
    return px
  }

  const check = async (name: string, srcRegion: GfVec4f, expected: number[]) => {
    const px = await blit(srcRegion)
    if (!AllPixelsMatch(px, kW, kH, expected)) {
      stdout += `${name} FAILED: pixel(0,0)=(${px[0]},${px[1]},${px[2]}), ` +
        `expected (${expected[0]},${expected[1]},${expected[2]})\n`
      allPassed = false
    } else {
      stdout += `  ${name}: OK\n`
    }
  }

  // ---- test cases --------------------------------------------------------

  // 1. Identity srcRegion: verify all 16 output pixels reproduce the source
  //    texture exactly (quadrant colors in the correct positions).
  {
    const px = await blit(new GfVec4f(0, 0, 1, 1))
    let ok = true
    for (let row = 0; row < kH && ok; ++row) {
      for (let col = 0; col < kW && ok; ++col) {
        let exp: number[]
        if (row < 2) { exp = col < 2 ? kRed : kGreen } else { exp = col < 2 ? kBlue : kWhite }
        const i = (row * kW + col) * 4
        if (px[i] !== exp[0] || px[i + 1] !== exp[1] || px[i + 2] !== exp[2]) {
          ok = false
        }
      }
    }
    if (!ok) {
      TF_RUNTIME_ERROR('identity srcRegion FAILED')
      allPassed = false
    } else {
      stdout += '  identity srcRegion: OK\n'
    }
  }

  // 2-5. Crop to each quadrant: all output pixels should be that quadrant's
  //      color.
  await check('bottom-left quadrant (RED)',
    new GfVec4f(0, 0, 0.5, 0.5), kRed)
  await check('bottom-right quadrant (GREEN)',
    new GfVec4f(0.5, 0, 0.5, 0.5), kGreen)
  await check('top-left quadrant (BLUE)',
    new GfVec4f(0, 0.5, 0.5, 0.5), kBlue)
  await check('top-right quadrant (WHITE)',
    new GfVec4f(0.5, 0.5, 0.5, 0.5), kWhite)

  // ---- cleanup -----------------------------------------------------------

  hgi.destroyTexture(srcTex)
  interop.destroy()

  if (allPassed) {
    stdout += 'OK\n'
    return { status: 0, stdout }
  }
  stdout += 'FAILED\n'
  return { status: 1, stdout }
}
