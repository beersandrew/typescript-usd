// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/colorizeSelectionTask.cpp,
//  pxr/imaging/hdx/colorizeSelectionTask.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/colorizeSelectionTask.{h,cpp} (OpenUSD
// 26.11.1).
//
// Divergences:
// - Task dirty bits are passed by value and cleared by the render index;
//   `*dirtyBits = Clean` is that.
// - HdxColorizeSelectionTaskParams is a class; VtValue holds it under
//   HdxColorizeSelectionTaskParamsType (Clone() is the struct copy, Equals()
//   operator==; operator<< is not ported).
// - HdRenderBuffer::Map is synchronous upstream. HdStRenderBuffer's
//   readback is asynchronous here (hdSt/src/renderBuffer.ts MapAsync), so
//   _ColorizeSelection colorizes from the bytes of the buffers' last
//   completed MapAsync (Map()), and skips colorizing while there are none,
//   as upstream does when Map returns nullptr. Renderers whose render
//   buffers map synchronously behave as upstream.
// - The destructor is Destroy() (releases the texture and the compositor).
// - _ParameterBuffer (std430: vec2 texelSize, int enableOutline, int
//   radius) is packed into a 16-byte ArrayBuffer for SetShaderConstants.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Vec2f as GfVec2f, Vec3i as GfVec3i, Vec4f as GfVec4f } from 'typescript-usd/gf'
import {
  AovTokens as HdAovTokens,
  ChangeTracker as HdChangeTracker,
  DataSizeOfFormat as HdDataSizeOfFormat,
  Format as HdFormat,
  PrimTypeTokens as HdPrimTypeTokens,
  type DirtyBits as HdDirtyBits,
  type RenderBuffer as HdRenderBuffer,
  type RenderIndex as HdRenderIndex,
  type SceneDelegate as HdSceneDelegate,
  type TaskContext as HdTaskContext,
} from 'typescript-usd/hd'
import {
  HgiBlendFactor,
  HgiBlendOp,
  HgiDepthStencilState,
  HgiHandle,
  HgiSampleCount,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionDesc,
  HgiShaderStageBits,
  HgiTextureDesc,
  HgiTextureUsageBits,
  type HgiTexture,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HdxFullscreenShader } from './fullscreenShader.ts'
import { HdxHgiConversions } from './hgiConversions.ts'
import { HdxPackageOutlineShader } from './package.ts'
import { HdxSelectionTracker } from './selectionTracker.ts'
import { HdxTask } from './task.ts'
import { HdxTokens } from './tokens.ts'
import { TF_WARN } from './tfDiagnostic.ts'

/** colorizeSelectionTask.cpp:21-28 */
const _tokens = {
  outlineFrag: TfToken('OutlineFragment'),
  colorIn: TfToken('colorIn'),
  enableOutline: TfToken('enableOutline'),
  radius: TfToken('radius'),
  texelSize: TfToken('texelSize'),
}

/** colorizeSelectionTask.h:20-45 */
export class HdxColorizeSelectionTaskParams {
  enableSelectionHighlight = false
  enableLocateHighlight = false
  selectionColor = new GfVec4f(0, 0, 0, 0)
  locateColor = new GfVec4f(0, 0, 0, 0)
  enableOutline = false
  outlineRadius = 5

  primIdBufferPath = ''
  instanceIdBufferPath = ''
  elementIdBufferPath = ''

  /** The struct's copy. */
  Clone(): HdxColorizeSelectionTaskParams {
    return Object.assign(new HdxColorizeSelectionTaskParams(), this)
  }

  /** colorizeSelectionTask.cpp:432-442 (operator==) */
  Equals(rhs: HdxColorizeSelectionTaskParams): boolean {
    return this.enableSelectionHighlight === rhs.enableSelectionHighlight &&
      this.enableLocateHighlight === rhs.enableLocateHighlight &&
      this.selectionColor.equals(rhs.selectionColor) &&
      this.locateColor.equals(rhs.locateColor) &&
      this.primIdBufferPath === rhs.primIdBufferPath &&
      this.instanceIdBufferPath === rhs.instanceIdBufferPath &&
      this.elementIdBufferPath === rhs.elementIdBufferPath
  }
}
export const HdxColorizeSelectionTaskParamsType = TfType.declare('HdxColorizeSelectionTaskParams')

/** colorizeSelectionTask.h:93-106 _ParameterBuffer. This struct must match
 *  ParameterBuffer in outline.glslfx. */
class _ParameterBuffer {
  // Size of a colorIn texel - to iterate adjacent texels.
  texelSize = new GfVec2f(0, 0)
  // Draws outline when enabled, or color overlay when disabled.
  enableOutline = 0
  // The outline radius (thickness).
  radius = 5

  Equals(other: _ParameterBuffer): boolean {
    return this.texelSize.equals(other.texelSize) &&
      this.enableOutline === other.enableOutline &&
      this.radius === other.radius
  }

  /** The std430 bytes. */
  bytes(): ArrayBuffer {
    const buf = new ArrayBuffer(16)
    const f = new Float32Array(buf, 0, 2)
    f[0] = this.texelSize.get(0)
    f[1] = this.texelSize.get(1)
    const i = new Int32Array(buf, 8, 2)
    i[0] = this.enableOutline
    i[1] = this.radius
    return buf
  }
}

/** colorizeSelectionTask.h:49-148. A task for taking ID buffer data and
 *  turning it into a "selection overlay" that can be composited on top of
 *  hydra's color output. */
export class HdxColorizeSelectionTask extends HdxTask {
  // Incoming data
  private _params = new HdxColorizeSelectionTaskParams()
  private _lastVersion = -1
  private _hasSelection = false
  private _selectionOffsets: number[] = []

  private _primId: HdRenderBuffer | null = null
  private _instanceId: HdRenderBuffer | null = null
  private _elementId: HdRenderBuffer | null = null

  private _outputBuffer: Uint8Array | null = null
  private _outputBufferSize = 0
  private _converged = false

  private _compositor: HdxFullscreenShader | null = null

  private _parameterData = new _ParameterBuffer()
  private _texture: HgiTextureHandle = new HgiHandle<HgiTexture>()
  private _pipelineCreated = false

  /** colorizeSelectionTask.cpp:30-47 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** colorizeSelectionTask.cpp:49-56 (the destructor). */
  destroy(): void {
    this._outputBuffer = null

    if (this._texture.isSet()) {
      this._getHgi().destroyTexture(this._texture)
      this._texture = new HgiHandle<HgiTexture>()
    }
    this._compositor?.destroy()
    this._compositor = null
  }

  /** colorizeSelectionTask.cpp:58-62 */
  override isConverged(): boolean {
    return this._converged
  }

  /** colorizeSelectionTask.cpp:64-81 */
  protected _sync(delegate: HdSceneDelegate, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    if (!this._compositor) {
      this._compositor = new HdxFullscreenShader(this._getHgi(), 'ColorizeSelection')
    }

    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxColorizeSelectionTaskParams)
      if (params) this._params = params.Clone()
    }
  }

  /** colorizeSelectionTask.cpp:83-114 */
  Prepare(ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    const held = HdxTask._getTaskContextData<unknown>(ctx, HdxTokens.selectionState)
    const sel = held instanceof HdxSelectionTracker ? held : null
    if (sel) {
      sel.updateSelection(renderIndex)
    }

    const bprim = (path: string) => (renderIndex.getBprim(
      HdPrimTypeTokens.renderBuffer, path) as HdRenderBuffer | undefined) ?? null
    this._primId = bprim(this._params.primIdBufferPath)
    this._instanceId = bprim(this._params.instanceIdBufferPath)
    this._elementId = bprim(this._params.elementIdBufferPath)

    if (sel && sel.getVersion() !== this._lastVersion) {
      this._lastVersion = sel.getVersion()
      const offsets = { value: this._selectionOffsets }
      this._hasSelection =
        sel.getSelectionOffsetBuffer(
          renderIndex,
          this._params.enableSelectionHighlight,
          this._params.enableLocateHighlight,
          offsets)
      this._selectionOffsets = offsets.value
    }
  }

  /** colorizeSelectionTask.cpp:116-250 */
  Execute(ctx: HdTaskContext): void {
    if (!HdxTask._hasTaskContextData(ctx, HdAovTokens.color)) {
      this._converged = true
      return
    }

    // The color aov has the rendered results and we wish to apply the
    // selection colorization on top of it.
    const aovTexture = HdxTask._getTaskContextData<HgiTextureHandle>(ctx, HdAovTokens.color)!

    // instance ID and element ID are optional inputs, but if we don't have
    // a prim ID buffer, skip doing anything.
    if (!this._primId) {
      this._converged = true
      return
    }

    // If there's nothing in the selection buffer, return.
    if (!this._hasSelection) {
      this._converged = true
      return
    }

    this._primId.resolve()
    this._converged = this._primId.isConverged()
    const size = this._primId.getWidth() * this._primId.getHeight()

    if (this._instanceId) {
      this._instanceId.resolve()
      const iidSize = this._instanceId.getWidth() * this._instanceId.getHeight()
      if (iidSize !== size) {
        TF_WARN(`Instance Id buffer ${this._params.instanceIdBufferPath} has ` +
          `different dimensions than Prim Id buffer ${this._params.primIdBufferPath}`)
        return
      }
      this._converged = this._converged && this._instanceId.isConverged()
    }
    if (this._elementId) {
      this._elementId.resolve()
      const eidSize = this._elementId.getWidth() * this._elementId.getHeight()
      if (eidSize !== size) {
        TF_WARN(`Element Id buffer ${this._params.elementIdBufferPath} has ` +
          `different dimensions than Prim Id buffer ${this._params.primIdBufferPath}`)
        return
      }
      this._converged = this._converged && this._elementId.isConverged()
    }

    // Allocate the scratch space, if needed.
    if (!this._outputBuffer || this._outputBufferSize !== size) {
      this._outputBuffer = new Uint8Array(size * 4)
      this._outputBufferSize = size
    }

    // Colorize!
    this._colorizeSelection()

    // Blit!
    const fragDesc = new HgiShaderFunctionDesc()
    fragDesc.debugName = _tokens.outlineFrag
    fragDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
    HgiShaderFunctionAddStageInput(fragDesc, 'uvOut', 'vec2')
    HgiShaderFunctionAddTexture(fragDesc, 'colorIn')

    HgiShaderFunctionAddConstantParam(fragDesc, 'texelSize', 'vec2')
    HgiShaderFunctionAddConstantParam(fragDesc, 'enableOutline', 'int')
    HgiShaderFunctionAddConstantParam(fragDesc, 'radius', 'int')

    HgiShaderFunctionAddStageOutput(fragDesc, 'hd_FragColor', 'vec4', 'color')

    const compositor = this._compositor!
    compositor.setProgram(HdxPackageOutlineShader(), _tokens.outlineFrag, fragDesc)

    this._CreateTexture(
      this._primId.getWidth(),
      this._primId.getHeight(),
      HdFormat.HdFormatUNorm8Vec4,
      this._outputBuffer)

    compositor.bindTextures([this._texture])

    if (this._updateParameterBuffer()) {
      const bytes = this._parameterData.bytes()
      compositor.setShaderConstants(bytes.byteLength, bytes)
    }

    // Blend the selection color on top.  ApplySelectionColor uses the
    // calculation:
    //   src.rgb = mix(src.rgb, selection.rgb, selection.a);
    //   src.a = src.a;
    // ... per mode.
    //
    // Since we only get one blend, we pre-multiply alpha into the selection
    // color, and the selection alpha is the residual value used to scale the
    // scene color. This gives us the blend func:
    // GL_ONE, GL_SRC_ALPHA, GL_ZERO, GL_ONE.
    if (!this._pipelineCreated) {
      const depthState = new HgiDepthStencilState()
      depthState.depthTestEnabled = false
      depthState.depthWriteEnabled = false
      depthState.stencilTestEnabled = false

      compositor.setDepthState(depthState)
      this._pipelineCreated = true

      compositor.setBlendState(
        /*enable blending*/true,
        HgiBlendFactor.HgiBlendFactorOne,
        HgiBlendFactor.HgiBlendFactorSrcAlpha,
        HgiBlendOp.HgiBlendOpAdd,
        HgiBlendFactor.HgiBlendFactorZero,
        HgiBlendFactor.HgiBlendFactorOne,
        HgiBlendOp.HgiBlendOpAdd)
    }

    compositor.draw(aovTexture, /*no depth*/new HgiHandle<HgiTexture>())
  }

  /** colorizeSelectionTask.cpp:252-262 */
  private _getColorForMode(mode: number): GfVec4f {
    if (mode === 0) {
      return this._params.selectionColor
    } else if (mode === 1) {
      return this._params.locateColor
    } else {
      return new GfVec4f(0, 0, 0, 0)
    }
  }

  /** colorizeSelectionTask.cpp:264-355. The core colorizing logic of this
   *  task: given the ID buffers and the selection buffer, produce a color
   *  output at each pixel. */
  private _colorizeSelection(): void {
    const int32 = (view: ArrayBufferView | null): Int32Array | null =>
      view ? new Int32Array(view.buffer, view.byteOffset, view.byteLength >> 2) : null
    const piddata = int32(this._primId!.Map())
    if (!piddata) {
      // Skip the colorizing if we can't look up prim ID
      this._primId!.unmap()
      return
    }
    const iiddata = this._instanceId ? int32(this._instanceId.Map()) : null
    const eiddata = this._elementId ? int32(this._elementId.Map()) : null

    const so = this._selectionOffsets
    const out = this._outputBuffer!
    const f = Math.fround
    for (let i = 0; i < this._outputBufferSize; ++i) {
      const output = [0, 0, 0, 1]

      const primId = piddata ? piddata[i]! : -1
      const instanceId = iiddata ? iiddata[i]! : -1
      const elementId = eiddata ? eiddata[i]! : -1

      for (let mode = 0; mode < so[0]!; ++mode) {
        if (primId === -1) {
          continue
        }

        const modeOffset = so[mode + 1]!
        if (modeOffset === 0) {
          continue
        }

        const smin = so[modeOffset]!
        const smax = so[modeOffset + 1]!

        if (primId >= smin && primId < smax) {
          let offset = modeOffset + 2 + primId - smin
          let selectionData = so[offset]!
          let sel = (selectionData & 0x1) !== 0
          let nextOffset = selectionData >> 1

          if (nextOffset !== 0 && !sel) {
            let subprimType = so[nextOffset]!
            if (subprimType === 3 /* INSTANCE */) {
              const imin = so[nextOffset + 1]!
              const imax = so[nextOffset + 2]!
              if (instanceId >= imin && instanceId < imax) {
                offset = nextOffset + 3 + instanceId - imin
                selectionData = so[offset]!
                sel = sel || (selectionData & 0x1) !== 0
                nextOffset = selectionData >> 1
              }
            }
            subprimType = so[nextOffset]!
            if (subprimType === 0 /* ELEMENT */) {
              const emin = so[nextOffset + 1]!
              const emax = so[nextOffset + 2]!
              if (elementId >= emin && elementId < emax) {
                offset = nextOffset + 3 + elementId - emin
                selectionData = so[offset]!
                sel = sel || (selectionData & 0x1) !== 0
                nextOffset = selectionData >> 1
              }
            }
          }

          if (sel) {
            // dst.rgb = mix(dst.rgb, selection.rgb, selection.a)
            // dst.a = mix(dst.a, 0, selection.a);
            const modeColor = this._getColorForMode(mode)
            const a = modeColor.get(3)
            output[0] = f(f(a * modeColor.get(0)) + f(f(1 - a) * output[0]!))
            output[1] = f(f(a * modeColor.get(1)) + f(f(1 - a) * output[1]!))
            output[2] = f(f(a * modeColor.get(2)) + f(f(1 - a) * output[2]!))
            output[3] = f(f(1 - a) * output[3]!)
          }
        }
      }
      // uint8_t(output * 255.0f): truncation.
      out[i * 4 + 0] = Math.trunc(f(output[0]! * 255.0))
      out[i * 4 + 1] = Math.trunc(f(output[1]! * 255.0))
      out[i * 4 + 2] = Math.trunc(f(output[2]! * 255.0))
      out[i * 4 + 3] = Math.trunc(f(output[3]! * 255.0))
    }

    this._primId!.unmap()
    if (iiddata) {
      this._instanceId!.unmap()
    }
    if (eiddata) {
      this._elementId!.unmap()
    }
  }

  /** colorizeSelectionTask.cpp:357-377. Utility function to update the
   *  shader uniform parameters. Returns true if the values were updated.
   *  False if unchanged. */
  private _updateParameterBuffer(): boolean {
    const pb = new _ParameterBuffer()

    if (this._primId!.getWidth() > 0 && this._primId!.getHeight() > 0) {
      pb.texelSize = new GfVec2f(1.0 / this._primId!.getWidth(),
        1.0 / this._primId!.getHeight())
    }

    pb.enableOutline = this._params.enableOutline ? 1 : 0
    pb.radius = this._params.outlineRadius | 0

    // All data is still the same, no need to update the compositor
    if (pb.Equals(this._parameterData)) {
      return false
    }

    this._parameterData = pb
    return true
  }

  /** colorizeSelectionTask.cpp:379-412. Create a new GPU texture for the
   *  provided format and pixel data. If an old texture exists it will be
   *  destroyed first. */
  private _CreateTexture(width: number, height: number, format: HdFormat,
    data: Uint8Array | null): void {
    // Destroy the old texture (if any) if we received new pixels.
    if (this._texture.isSet()) {
      this._getHgi().destroyTexture(this._texture)
      this._texture = new HgiHandle<HgiTexture>()
    }

    // Texture was removed, exit.
    if (width === 0 || height === 0 || data === null) {
      return
    }

    const pixelByteSize = HdDataSizeOfFormat(format)

    const texDesc = new HgiTextureDesc()
    texDesc.debugName = 'HdxColorizeSelectionTask texture'
    texDesc.dimensions = new GfVec3i(width, height, 1)
    texDesc.format = HdxHgiConversions.getHgiFormat(format)
    texDesc.initialData = data
    texDesc.layerCount = 1
    texDesc.mipLevels = 1
    texDesc.pixelsByteSize = width * height * pixelByteSize
    texDesc.sampleCount = HgiSampleCount.HgiSampleCount1
    texDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
    this._texture = this._getHgi().createTexture(texDesc)
  }
}
