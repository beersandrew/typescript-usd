// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/presentTask.cpp,
//  pxr/imaging/hdx/presentTask.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/presentTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - HgiInterop composites into a WebGPU application (hgiInterop/src/
//   webgpu.ts): dstApi is HgiInteropWebGPUTokens.WebGPU and dstFramebuffer
//   an HgiInteropWebGPUFramebuffer (the application's color texture, e.g. the
//   canvas's current texture wrapped with HgiWebGPU.WrapExternalTexture, and
//   an optional depth texture). The default dstApi stays upstream's OpenGL,
//   which HgiInterop reports as an unsupported destination; clients set
//   dstApi.
// - Task dirty bits are passed by value and cleared by the render index.
// - HdxPresentTaskParams is a class (Clone() / Equals(); operator<< not
//   ported); VtValue holds it under HdxPresentTaskParamsType.

import { Type as TfType, type Token as TfToken } from 'typescript-usd/tf'
import { Vec4f as GfVec4f, Vec4i as GfVec4i } from 'typescript-usd/gf'
import {
  AovTokens as HdAovTokens,
  ChangeTracker as HdChangeTracker,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import { HgiFormat, HgiIsCompressed, HgiTokens, type HgiTextureHandle } from 'typescript-usd/hgi'
import { HgiInterop } from 'typescript-usd/hgiInterop'
import { HdxTask } from './task.ts'
import { TF_WARN } from './tfDiagnostic.ts'

/** presentTask.h:20-52 */
export class HdxPresentTaskParams {
  // The graphics lib that is used by the application / viewer.
  // (The 'interopSrc' is determined by checking Hgi->GetAPIName)
  dstApi: TfToken = HgiTokens.OpenGL

  dstFramebuffer: unknown = undefined

  // Subrectangular region of the framebuffer over which to composite aov
  // contents. Coordinates are (left, BOTTOM, width, height), which is the
  // same convention as OpenGL viewport coordinates. Note that this
  // is specified in *pixel* coordinates.
  dstRegion = new GfVec4i(0, 0, 0, 0)

  // Normalized [0,1] sub-rectangle of the source AOV textures to sample.
  // Coordinates are (left, bottom, width, height). Identity is (0,0,1,1)
  // which samples the entire texture. Note this is specified in *normalized*
  // coordinates.
  normalizedSrcRegion = new GfVec4f(0.0, 0.0, 1.0, 1.0)

  // When not enabled, present task does not execute, but still calls
  // Hgi::EndFrame.
  enabled = true

  Clone(): HdxPresentTaskParams {
    return Object.assign(new HdxPresentTaskParams(), this)
  }

  /** presentTask.cpp:134-142 (operator==) */
  Equals(rhs: HdxPresentTaskParams): boolean {
    const lhs = this
    return lhs.dstApi === rhs.dstApi &&
      lhs.dstFramebuffer === rhs.dstFramebuffer &&
      lhs.dstRegion.equals(rhs.dstRegion) &&
      lhs.normalizedSrcRegion.equals(rhs.normalizedSrcRegion) &&
      lhs.enabled === rhs.enabled
  }
}
export const HdxPresentTaskParamsType = TfType.declare('HdxPresentTaskParams')

/** presentTask.cpp:17-28 */
function _IsIntegerFormat(format: HgiFormat): boolean {
  return (format === HgiFormat.HgiFormatUInt16 ||
    format === HgiFormat.HgiFormatUInt16Vec2 ||
    format === HgiFormat.HgiFormatUInt16Vec3 ||
    format === HgiFormat.HgiFormatUInt16Vec4 ||
    format === HgiFormat.HgiFormatInt32 ||
    format === HgiFormat.HgiFormatInt32Vec2 ||
    format === HgiFormat.HgiFormatInt32Vec3 ||
    format === HgiFormat.HgiFormatInt32Vec4)
}

/** presentTask.h:55-104. A task for taking the final result of the aovs
 *  and compositing it over the currently bound framebuffer.
 *  This task uses the 'color' and optionally 'depth' aov's in the task
 *  context. The 'color' aov is expected to use non-integer (i.e., float or
 *  norm) types to keep the interop step simple. */
export class HdxPresentTask extends HdxTask {
  private _params = new HdxPresentTaskParams()
  private _interop = new HgiInterop()

  /** presentTask.cpp:30-37. Returns true if the format is supported for
   *  presentation. This is useful for upstream tasks to prepare the AOV data
   *  accordingly, and keeps the interop step simple. */
  static isFormatSupported(aovFormat: HgiFormat): boolean {
    // Integer formats are not supported (this requires the GL interop to
    // support additional sampler types), nor are compressed formats.
    return !_IsIntegerFormat(aovFormat) && !HgiIsCompressed(aovFormat)
  }

  /** presentTask.cpp:39-42 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** presentTask.cpp:44 (the destructor). */
  destroy(): void {
    this._interop.destroy()
  }

  /** presentTask.cpp:46-62 */
  protected _sync(delegate: HdSceneDelegate, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxPresentTaskParams)
      if (params) {
        this._params = params.Clone()
      }
    }
  }

  /** presentTask.cpp:64-67 */
  Prepare(_ctx: HdTaskContext, _renderIndex: HdRenderIndex): void {}

  /** presentTask.cpp:69-118 */
  Execute(ctx: HdTaskContext): void {
    // The present task can be disabled in case an application does offscreen
    // rendering or doesn't use Hgi interop (e.g. directly access AOV results).
    // But we still need to call Hgi::EndFrame.

    if (this._params.enabled && HdxTask._hasTaskContextData(ctx, HdAovTokens.color)) {
      // The color and depth aovs have the results we want to blit to the
      // application. Depth is optional. When we are previewing a custom aov
      // we may not have a depth buffer.

      const aovTexture = HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdAovTokens.color)
      if (aovTexture && aovTexture.isSet()) {
        const texDesc = aovTexture.Get()!.getDescriptor()
        if (!HdxPresentTask.isFormatSupported(texDesc.format)) {
          // Warn, but don't bail.
          TF_WARN(`Aov texture format ${texDesc.format} may not be correctly supported ` +
            'for presentation via HgiInterop.')
        }
      }

      let depthTexture: HgiTextureHandle | undefined
      if (HdxTask._hasTaskContextData(ctx, HdAovTokens.depth)) {
        depthTexture = HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdAovTokens.depth)
      }

      // Use HgiInterop to composite the Hgi textures over the application's
      // framebuffer contents.
      this._interop.transferToApp(
        this._getHgi(),
        aovTexture!, depthTexture ?? null,
        this._params.dstApi,
        this._params.dstFramebuffer,
        this._params.dstRegion,
        this._params.normalizedSrcRegion)
    }

    // Wrap one HdEngine::Execute frame with Hgi StartFrame and EndFrame.
    // StartFrame is currently called in the AovInputTask.
    // This is important for Hgi garbage collection to run.
    this._getHgi().endFrame()
  }
}
