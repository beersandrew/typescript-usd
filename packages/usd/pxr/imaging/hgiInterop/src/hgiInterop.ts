// Ported from OpenUSD 26.11.1: pxr/imaging/hgiInterop/hgiInterop.cpp,
//  pxr/imaging/hgiInterop/hgiInterop.h, pxr/imaging/hgiInterop/metal.mm,
//  pxr/imaging/hgiInterop/opengl.cpp, pxr/imaging/hgiInterop/vulkan.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgiInterop/hgiInterop.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: the OpenGL, Vulkan and Metal transfers (opengl.cpp,
// vulkan.cpp, metal.mm) need an OpenGL application and are not ported. This
// repository renders with HgiWebGPU into a WebGPU application (a canvas), so
// the one supported pair is source and destination API "WebGPU"
// (HgiWebGPUTokens.WebGPU), handled by HgiInteropWebGPU (webgpu.ts), which
// follows HgiInteropOpenGL::CompositeToInterop. Any other pair is the coding
// error upstream reports for unsupported backends.

import type { Token as TfToken } from 'typescript-usd/tf'
import type { Vec4f as GfVec4f, Vec4i as GfVec4i } from 'typescript-usd/gf'
import type { Hgi, HgiTextureHandle } from 'typescript-usd/hgi'
import { HgiInteropWebGPU, HgiInteropWebGPUTokens, type HgiInteropWebGPUFramebuffer } from './webgpu.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** hgiInterop.cpp:27-38 */
interface HgiInteropImpl {
  _webGPUToWebGPU: HgiInteropWebGPU | null
}

/** hgiInterop.h:24-96. Hydra Graphics Interface Interop.
 *
 *  HgiInterop provides functionality to transfer render targets between
 *  supported APIs as efficiently as possible. */
export class HgiInterop {
  private readonly _hgiInteropImpl: HgiInteropImpl = { _webGPUToWebGPU: null }

  /** hgiInterop.cpp:46-111. Composite the provided textures over the
   *  application / viewer's framebuffer contents.
   *
   *  `dstFramebuffer`: for dstApi WebGPU, the HgiInteropWebGPUFramebuffer
   *  (the application's color texture wrapped with
   *  HgiWebGPU.WrapExternalTexture, and an optional depth texture).
   *  `dstRegion`: (left, BOTTOM, width, height) in pixels, as upstream.
   *  `normalizedSrcRegion`: normalized (left, bottom, width, height).
   *
   *  To composite correctly, blending is enabled. If `srcDepth` is provided
   *  (and the framebuffer has depth), depth testing is enabled. */
  transferToApp(
    srcHgi: Hgi,
    srcColor: HgiTextureHandle,
    srcDepth: HgiTextureHandle | null | undefined,
    dstApi: TfToken | string,
    dstFramebuffer: unknown,
    dstRegion: GfVec4i,
    normalizedSrcRegion: GfVec4f,
  ): void {
    const srcApi = srcHgi.getAPIName()

    if (dstApi !== HgiInteropWebGPUTokens.WebGPU) {
      TF_CODING_ERROR(`Unsupported destination Hgi backend: ${dstApi}`)
      return
    }

    if (srcApi === HgiInteropWebGPUTokens.WebGPU) {
      // Transfer WebGPU textures to a WebGPU application
      if (!this._hgiInteropImpl._webGPUToWebGPU) {
        this._hgiInteropImpl._webGPUToWebGPU = new HgiInteropWebGPU(srcHgi)
      }
      this._hgiInteropImpl._webGPUToWebGPU.compositeToInterop(
        srcColor, srcDepth ?? null, dstFramebuffer as HgiInteropWebGPUFramebuffer | null,
        dstRegion, normalizedSrcRegion)
      return
    }

    TF_CODING_ERROR(`Unsupported source Hgi backend: ${srcApi}`)
  }

  /** The destructor: releases the backend's Hgi resources. */
  destroy(): void {
    this._hgiInteropImpl._webGPUToWebGPU?.destroy()
    this._hgiInteropImpl._webGPUToWebGPU = null
  }
}
