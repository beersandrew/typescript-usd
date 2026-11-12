// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/aovInputTask.cpp,
//  pxr/imaging/hdx/aovInputTask.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/aovInputTask.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Task dirty bits are passed by value and cleared by the render index.
// - HdxAovInputTaskParams is a class (Clone() / Equals(); operator<< not
//   ported); VtValue holds it under HdxAovInputTaskParamsType.
// - The destructor is Destroy().
// - A render buffer's GetResource returns the HgiTextureHandle, or undefined
//   for the empty VtValue (hd/src/renderBuffer.ts); "IsHolding
//   <HgiTextureHandle>" is an instanceof HgiHandle check.
// - The CPU-texel path (_UpdateTexture) reads the render buffer's Map();
//   HdStRenderBuffer maps asynchronously (hdSt/src/renderBuffer.ts), but
//   Storm render buffers always provide an HgiTexture, so the CPU path is
//   taken only for render buffers of other render delegates.

import { Type as TfType } from 'typescript-usd/tf'
import { Vec3i as GfVec3i } from 'typescript-usd/gf'
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
  HgiHandle,
  HgiSampleCount,
  HgiTextureCpuToGpuOp,
  HgiTextureDesc,
  HgiTextureUsageBits,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HdxHgiConversions } from './hgiConversions.ts'
import { HdxTask } from './task.ts'
import { HdxAovTokens } from './tokens.ts'
import { TF_WARN } from './tfDiagnostic.ts'

/** aovInputTask.h:84-91. AovInput parameters. */
export class HdxAovInputTaskParams {
  aovBufferPath = ''
  depthBufferPath = ''

  Clone(): HdxAovInputTaskParams {
    return Object.assign(new HdxAovInputTaskParams(), this)
  }

  /** aovInputTask.cpp:342-347 (operator==) */
  Equals(rhs: HdxAovInputTaskParams): boolean {
    return this.aovBufferPath === rhs.aovBufferPath &&
      this.depthBufferPath === rhs.depthBufferPath
  }
}
export const HdxAovInputTaskParamsType = TfType.declare('HdxAovInputTaskParams')

/** aovInputTask.cpp:223-247 */
function _ConvertRGBtoRGBA(rgbValues: Float32Array, numRgbValues: number): Float32Array | null {
  if (numRgbValues % 3 !== 0) {
    TF_WARN('Value count should be divisible by 3.')
    return null
  }

  const numRgbaValues = numRgbValues * 4 / 3
  const rgbaValues = new Float32Array(numRgbaValues)
  for (let i = 0, j = 0; j < numRgbaValues; i += 3, j += 4) {
    rgbaValues[j] = rgbValues[i]!
    rgbaValues[j + 1] = rgbValues[i + 1]!
    rgbaValues[j + 2] = rgbValues[i + 2]!
    rgbaValues[j + 3] = 1.0
  }
  return rgbaValues
}

function _IsTextureHandle(v: unknown): v is HgiTextureHandle {
  return v instanceof HgiHandle
}

/** aovInputTask.h:23-79. A task for taking input AOV data comming from a
 *  render buffer that was filled by render tasks and converting it to a
 *  HgiTexture. The aov render buffer can be a GPU or CPU buffer, while the
 *  resulting output HgiTexture will always be a GPU texture.
 *
 *  The HgiTexture is placed in the shared task context so that following
 *  tasks maybe operate on this HgiTexture without having to worry about
 *  converting the aov data from CPU to GPU. */
export class HdxAovInputTask extends HdxTask {
  private _converged = false

  private _aovBufferPath = ''
  private _depthBufferPath = ''

  private _aovBuffer: HdRenderBuffer | null = null
  private _depthBuffer: HdRenderBuffer | null = null

  private _aovTexture: HgiTextureHandle = new HgiHandle()
  private _depthTexture: HgiTextureHandle = new HgiHandle()
  private _aovTextureIntermediate: HgiTextureHandle = new HgiHandle()
  private _depthTextureIntermediate: HgiTextureHandle = new HgiHandle()

  /** aovInputTask.cpp:21-30 */
  constructor(_delegate: HdSceneDelegate | null, id: string) {
    super(id)
  }

  /** aovInputTask.cpp:32-46 (the destructor). */
  destroy(): void {
    for (const key of ['_aovTexture', '_aovTextureIntermediate', '_depthTexture',
      '_depthTextureIntermediate'] as const) {
      if (this[key].isSet()) {
        this._getHgi().destroyTexture(this[key])
        this[key] = new HgiHandle()
      }
    }
  }

  /** aovInputTask.cpp:48-52 */
  override isConverged(): boolean {
    return this._converged
  }

  /** aovInputTask.cpp:54-71 */
  protected _sync(delegate: HdSceneDelegate, _ctx: HdTaskContext, dirtyBits: HdDirtyBits): void {
    if (dirtyBits & HdChangeTracker.DirtyParams) {
      const params = this._getTaskParams(delegate, HdxAovInputTaskParams)
      if (params) {
        this._aovBufferPath = params.aovBufferPath
        this._depthBufferPath = params.depthBufferPath
      }
    }
  }

  /** aovInputTask.cpp:73-109 */
  Prepare(_ctx: HdTaskContext, renderIndex: HdRenderIndex): void {
    // Wrap one HdEngine::Execute frame with Hgi StartFrame and EndFrame.
    // EndFrame is currently called in the PresentTask.
    // This is important for Hgi garbage collection to run.
    this._getHgi().startFrame()

    this._aovBuffer = null
    this._depthBuffer = null

    // An empty _aovBufferPath disables the task
    if (this._aovBufferPath !== '') {
      this._aovBuffer = (renderIndex.getBprim(
        HdPrimTypeTokens.renderBuffer, this._aovBufferPath) ?? null) as HdRenderBuffer | null
    }

    if (this._depthBufferPath !== '') {
      this._depthBuffer = (renderIndex.getBprim(
        HdPrimTypeTokens.renderBuffer, this._depthBufferPath) ?? null) as HdRenderBuffer | null
    }

    // Create / update the texture that will be used to ping-pong between color
    // targets in tasks that wish to read from and write to the color target.
    if (this._aovBuffer) {
      this._aovTextureIntermediate = this._updateIntermediateTexture(
        this._aovTextureIntermediate, this._aovBuffer,
        HgiTextureUsageBits.HgiTextureUsageBitsColorTarget)
    }

    // Do the same for the intermediate depth texture.
    if (this._depthBuffer) {
      this._depthTextureIntermediate = this._updateIntermediateTexture(
        this._depthTextureIntermediate, this._depthBuffer,
        HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget)
    }
  }

  /** aovInputTask.cpp:111-195 */
  Execute(ctx: HdTaskContext): void {
    // This task requires an aov buffer to have been set and is immediately
    // converged if there is no aov buffer.
    if (!this._aovBuffer) {
      this._converged = true
      return
    }

    // Check converged state of buffer(s)
    this._converged = this._aovBuffer.isConverged()
    if (this._depthBuffer) {
      this._converged = this._converged && this._depthBuffer.isConverged()
    }

    // Resolve the buffers before we read them.
    this._aovBuffer.resolve()
    if (this._depthBuffer) {
      this._depthBuffer.resolve()
    }

    // Start by clearing aov texture handles from task context.
    // These are last frames textures and we may be visualizing different aovs.
    ctx.delete(HdAovTokens.color)
    ctx.delete(HdAovTokens.depth)
    ctx.delete(HdxAovTokens.colorIntermediate)
    ctx.delete(HdxAovTokens.depthIntermediate)

    // If the aov is already backed by a HgiTexture we skip creating a new
    // GPU HgiTexture for it and place it directly on the shared task context
    // for consecutive tasks to find and operate on.
    // The lifetime management of that HgiTexture remains with the aov.

    let hgiHandleProvidedByAov = false
    const mulSmp = false

    const aov = this._aovBuffer.getResource(mulSmp)
    if (_IsTextureHandle(aov)) {
      hgiHandleProvidedByAov = true
      ctx.set(HdAovTokens.color, aov)
    }

    ctx.set(HdxAovTokens.colorIntermediate, this._aovTextureIntermediate)

    if (this._depthBuffer) {
      const depth = this._depthBuffer.getResource(mulSmp)
      if (_IsTextureHandle(depth)) {
        ctx.set(HdAovTokens.depth, depth)
      }

      ctx.set(HdxAovTokens.depthIntermediate, this._depthTextureIntermediate)
    }

    if (hgiHandleProvidedByAov) {
      return
    }

    // If the aov is not backed by a HgiTexture (e.g. RenderMan, Embree) we
    // convert the aov pixel data to a HgiTexture and place that new texture
    // in the shared task context.
    // The lifetime of this new HgiTexture is managed by this task.

    this._aovTexture = this._updateTexture(this._aovTexture, this._aovBuffer,
      HgiTextureUsageBits.HgiTextureUsageBitsColorTarget)
    if (this._aovTexture.isSet()) {
      ctx.set(HdAovTokens.color, this._aovTexture)
    }

    if (this._depthBuffer) {
      this._depthTexture = this._updateTexture(this._depthTexture, this._depthBuffer,
        HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget)
      if (this._depthTexture.isSet()) {
        ctx.set(HdAovTokens.depth, this._depthTexture)
      }
    }
  }

  /** aovInputTask.cpp:249-311. Returns the (possibly new) texture. */
  private _updateTexture(texture: HgiTextureHandle, buffer: HdRenderBuffer,
    usage: HgiTextureUsageBits): HgiTextureHandle {
    const hgi = this._getHgi()
    const dim = new GfVec3i(
      buffer.getWidth(),
      buffer.getHeight(),
      buffer.getDepth())

    const mapped = buffer.Map()
    let pixelData: ArrayBufferView | null = mapped

    let hdFormat = buffer.GetFormat()
    // HgiFormatFloat32Vec3 not a supported texture format for Vulkan. Convert
    // data to vec4 format.
    if (hdFormat === HdFormat.HdFormatFloat32Vec3) {
      hdFormat = HdFormat.HdFormatFloat32Vec4
      const numValues = 3 * dim.get(0) * dim.get(1) * dim.get(2)
      pixelData = mapped
        ? _ConvertRGBtoRGBA(new Float32Array(mapped.buffer, mapped.byteOffset, numValues), numValues)
        : null
    }

    const bufFormat = HdxHgiConversions.getHgiFormat(hdFormat)
    const pixelByteSize = HdDataSizeOfFormat(hdFormat)
    const dataByteSize = dim.get(0) * dim.get(1) * dim.get(2) * pixelByteSize

    // Update the existing texture if specs are compatible. This is more
    // efficient than re-creating, because the underlying framebuffer that
    // had the old texture attached would also need to be re-created.
    if (texture.isSet() && texture.Get()!.getDescriptor().dimensions.equals(dim) &&
      texture.Get()!.getDescriptor().format === bufFormat) {
      const copyOp = new HgiTextureCpuToGpuOp()
      copyOp.bufferByteSize = dataByteSize
      copyOp.cpuSourceBuffer = pixelData
      copyOp.gpuDestinationTexture = texture
      const blitCmds = hgi.createBlitCmds()
      blitCmds.pushDebugGroup('Upload CPU texels')
      blitCmds.copyTextureCpuToGpu(copyOp)
      blitCmds.popDebugGroup()
      void hgi.submitCmds(blitCmds)
    } else {
      // Destroy old texture
      if (texture.isSet()) {
        hgi.destroyTexture(texture)
      }
      // Create a new texture
      const texDesc = new HgiTextureDesc()
      texDesc.debugName = 'AovInput Texture'
      texDesc.dimensions = dim
      texDesc.format = bufFormat
      texDesc.initialData = pixelData
      texDesc.layerCount = 1
      texDesc.mipLevels = 1
      texDesc.pixelsByteSize = dataByteSize
      texDesc.sampleCount = HgiSampleCount.HgiSampleCount1
      texDesc.usage = usage | HgiTextureUsageBits.HgiTextureUsageBitsShaderRead

      texture = hgi.createTexture(texDesc)
    }
    buffer.unmap()
    return texture
  }

  /** aovInputTask.cpp:313-354. Returns the (possibly new) texture. */
  private _updateIntermediateTexture(texture: HgiTextureHandle, buffer: HdRenderBuffer,
    usage: HgiTextureUsageBits): HgiTextureHandle {
    const hgi = this._getHgi()
    const dim = new GfVec3i(
      buffer.getWidth(),
      buffer.getHeight(),
      buffer.getDepth())

    // HgiFormatFloat32Vec3 not a supported texture format for Vulkan. Use vec4
    // format instead.
    let hdFormat = buffer.GetFormat()
    if (hdFormat === HdFormat.HdFormatFloat32Vec3) {
      hdFormat = HdFormat.HdFormatFloat32Vec4
    }

    const hgiFormat = HdxHgiConversions.getHgiFormat(hdFormat)

    if (texture.isSet()) {
      const desc = texture.Get()!.getDescriptor()
      if (!dim.equals(desc.dimensions) || hgiFormat !== desc.format) {
        hgi.destroyTexture(texture)
        texture = new HgiHandle()
      }
    }

    if (!texture.isSet()) {
      const texDesc = new HgiTextureDesc()
      texDesc.debugName = 'AovInput Intermediate Texture'
      texDesc.dimensions = dim

      texDesc.format = hgiFormat
      texDesc.layerCount = 1
      texDesc.mipLevels = 1
      texDesc.sampleCount = HgiSampleCount.HgiSampleCount1
      texDesc.usage = usage | HgiTextureUsageBits.HgiTextureUsageBitsShaderRead

      texture = hgi.createTexture(texDesc)
    }
    return texture
  }
}
