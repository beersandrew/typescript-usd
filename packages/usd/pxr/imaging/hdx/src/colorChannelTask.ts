// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/colorChannelTask.cpp,
//  pxr/imaging/hdx/colorChannelTask.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/colorChannelTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Upstream draws into the color AOV texture while sampling it
//   (colorChannelTask.cpp:120-123: BindTextures({aovTexture}) and
//   Draw(aovTexture)), a read/write feedback loop OpenGL and Metal tolerate
//   for same-texel reads. WebGPU rejects a texture used as an attachment and
//   a sampled binding in one pass, so the task draws into the
//   colorIntermediate AOV and swaps it with color (HdxTask::
//   _ToggleRenderTarget), as HdxColorCorrectionTask does. Without a
//   colorIntermediate in the task context the task posts a warning and does
//   nothing.
// - Task dirty bits are passed by value and cleared by the render index.
// - HdxColorChannelTaskParams is a class (Clone() / Equals(); operator<< not
//   ported); VtValue holds it under HdxColorChannelTaskParamsType.
// - The destructor is Destroy().

import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import {
  AovTokens as HdAovTokens,
  ChangeTracker as HdChangeTracker,
  type DirtyBits as HdDirtyBits,
  type RenderIndex as HdRenderIndex,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import {
  HgiHandle,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionDesc,
  HgiShaderStageBits,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HdxFullscreenShader } from './fullscreenShader.ts'
import { HdxPackageColorChannelShader } from './package.ts'
import { HdxTask } from './task.ts'
import { HdxAovTokens, HdxColorChannelTokens } from './tokens.ts'
import { TF_WARN } from './tfDiagnostic.ts'

/** colorChannelTask.cpp:24-27 */
const _tokens = {
  colorChannelFrag: TfToken('ColorChannelFragment'),
}

/** HdxColorChannelTokens->allTokens, in declaration order (tokens.h:101-111). */
const _allChannelTokens: readonly TfToken[] = [
  HdxColorChannelTokens.color,
  HdxColorChannelTokens.red,
  HdxColorChannelTokens.green,
  HdxColorChannelTokens.blue,
  HdxColorChannelTokens.alpha,
  HdxColorChannelTokens.luminance,
]

/** colorChannelTask.h:83-91. ColorChannelTask parameters. */
export class HdxColorChannelTaskParams {
  // Specifies which output color channel should be drawn. Defaults to 'color'
  // (untouched RGBA).
  channel: TfToken = HdxColorChannelTokens.color

  Clone(): HdxColorChannelTaskParams {
    return Object.assign(new HdxColorChannelTaskParams(), this)
  }

  /** colorChannelTask.cpp:156-160 (operator==) */
  Equals(rhs: HdxColorChannelTaskParams): boolean {
    return this.channel === rhs.channel
  }
}
export const HdxColorChannelTaskParamsType = TfType.declare('HdxColorChannelTaskParams')

/** colorChannelTask.h:21-80. A task for choosing a color channel for
 *  display. */
export class HdxColorChannelTask extends HdxTask {
  private _compositor: HdxFullscreenShader | null = null
  // colorChannelTask.h:63-72: _ParameterBuffer { vec2 screenSize; int
  // channel; } (std430).
  private _parameterData = { screenSize: [0, 0], channel: 0 }
  private _parameterDataValid = false

  // The color channel to be rendered (see HdxColorChannelTokens for the
  // possible values).
  private _channel: TfToken = HdxColorChannelTokens.color

  /** colorChannelTask.cpp:29-35 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** colorChannelTask.cpp:37 (the destructor). */
  destroy(): void {
    this._compositor?.destroy()
    this._compositor = null
  }

  /** colorChannelTask.cpp:39-59 */
  protected _sync(delegate: HdSceneDelegate, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    if (!this._compositor) {
      this._compositor = new HdxFullscreenShader(this._getHgi(), 'ColorChannel')
    }

    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxColorChannelTaskParams)
      if (params) {
        this._channel = params.channel
      }
    }
  }

  /** colorChannelTask.cpp:61-65 */
  Prepare(_ctx: HdTaskContext, _renderIndex: HdRenderIndex): void {}

  /** colorChannelTask.cpp:67-109 (see the header on the destination). */
  Execute(ctx: HdTaskContext): void {
    const aovTexture = HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdAovTokens.color)
    if (!aovTexture?.isSet()) {
      return
    }
    const aovTextureIntermediate =
      HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdxAovTokens.colorIntermediate)
    if (!aovTextureIntermediate?.isSet()) {
      TF_WARN('HdxColorChannelTask: no colorIntermediate AOV to draw into')
      return
    }

    const fragDesc = new HgiShaderFunctionDesc()
    fragDesc.debugName = _tokens.colorChannelFrag
    fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddStageInput(
      fragDesc, 'uvOut', 'vec2')
    HgiShaderFunctionAddTexture(
      fragDesc, 'colorIn')
    HgiShaderFunctionAddStageOutput(
      fragDesc, 'hd_FragColor', 'vec4', 'color')

    // The order of the constant parameters has to match the order in the
    // _ParameterBuffer struct
    HgiShaderFunctionAddConstantParam(
      fragDesc, 'screenSize', 'vec2')
    HgiShaderFunctionAddConstantParam(
      fragDesc, 'channel', 'int')

    this._compositor!.setProgram(
      HdxPackageColorChannelShader(),
      _tokens.colorChannelFrag,
      fragDesc)
    const aovDesc = aovTexture.Get()!.getDescriptor()
    if (this._updateParameterBuffer(
      aovDesc.dimensions.get(0),
      aovDesc.dimensions.get(1))) {
      const bytes = new ArrayBuffer(12)
      const f = new Float32Array(bytes, 0, 2)
      f[0] = this._parameterData.screenSize[0]!
      f[1] = this._parameterData.screenSize[1]!
      new Int32Array(bytes, 8, 1)[0] = this._parameterData.channel
      this._compositor!.setShaderConstants(bytes.byteLength, bytes)
    }

    this._compositor!.bindTextures([aovTexture])

    this._compositor!.draw(aovTextureIntermediate, /*no depth*/new HgiHandle())

    this._toggleRenderTarget(ctx)
  }

  /** colorChannelTask.cpp:111-139. Utility function to update the shader
   *  uniform parameters. Returns true if the values were updated. False if
   *  unchanged. */
  private _updateParameterBuffer(screenSizeX: number, screenSizeY: number): boolean {
    // Get an integer that represents the color channel. This can be used to
    // pass the color channel option as into the glsl shader.
    // (see the `#define CHANNEL_*` lines in the shader).
    // If _channel contains an invalid entry the shader will return 'color'.
    let i = 0
    for (const channelToken of _allChannelTokens) {
      if (channelToken === this._channel) break
      ++i
    }
    const pb = { screenSize: [Math.fround(screenSizeX), Math.fround(screenSizeY)], channel: i }

    // All data is still the same, no need to update the storage buffer
    if (this._parameterDataValid && pb.channel === this._parameterData.channel &&
      pb.screenSize[0] === this._parameterData.screenSize[0] &&
      pb.screenSize[1] === this._parameterData.screenSize[1]) {
      return false
    }

    this._parameterData = pb
    this._parameterDataValid = true

    return true
  }
}
