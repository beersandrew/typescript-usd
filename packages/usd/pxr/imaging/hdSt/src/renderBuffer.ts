// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderBuffer.cpp,
//  pxr/imaging/hdSt/renderBuffer.h, pxr/imaging/hdSt/textureUtils.cpp
// Copyright 2019, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/renderBuffer.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Texture object lifetime: upstream drops its shared_ptr's to the
//   HdStDynamicUvTextureObjects; here the render buffer Release()s them
//   (the texture object registry's convention, textureObject.ts header).
// - The texture identifier (renderBuffer.cpp:64-86) appends the object's
//   address ("[%p] ") for uniqueness across render delegates sharing a
//   resource registry; a per-object serial number stands in for it.
// - Map(): reading a texture back waits for the GPU
//   (HdStTextureUtils::HgiTextureReadback submits with
//   HgiSubmitWaitTypeWaitUntilCompleted, textureUtils.cpp:571-618). WebGPU
//   readback is asynchronous, so MapAsync() performs the readback and resolves
//   with the bytes; Map() returns the bytes of the last completed MapAsync()
//   (or null).

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  AovHasDepthSemantic as HdAovHasDepthSemantic,
  AovHasDepthStencilSemantic as HdAovHasDepthStencilSemantic,
  Format as HdFormat,
  RenderBuffer as HdRenderBuffer,
  type DirtyBits as HdDirtyBits,
  type RenderParam as HdRenderParam,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import type { DirtyBitsRef as HdDirtyBitsRef } from 'typescript-usd/hd'
import {
  HgiGetDataSizeOfFormat,
  HgiSampleCount,
  HgiSubmitWaitType,
  HgiTextureDesc,
  HgiTextureGpuToCpuOp,
  HgiTextureType,
  HgiTextureUsageBits,
  type HgiTextureHandle,
  type HgiTextureUsage,
} from 'typescript-usd/hgi'
import { Token as TfToken } from 'typescript-usd/tf'
import { HdStDynamicUvTextureObject } from './dynamicUvTextureObject.ts'
import { HdStTextureType } from './enums.ts'
import { HdStHgiConversions } from './hgiConversions.ts'
import { HdStDynamicUvSubtextureIdentifier } from './subtextureIdentifier.ts'
import { HdStTextureIdentifier } from './textureIdentifier.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStRenderBufferTokens } from './tokens.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** The HdSceneDelegate members HdStRenderBuffer::Sync reads. */
interface _RenderBufferSceneDelegate {
  Get(id: string, key: string): unknown
  getRenderBufferDescriptor(id: string): { dimensions: readonly [number, number, number], format: HdFormat, multiSampled: boolean }
}

/** renderBuffer.cpp:19-33 */
function _GetTextureUsage(_format: HdFormat, name: string): HgiTextureUsage {
  // We are assuming at some point in a render buffer's lifetime it could be
  // used to read from, so provide that ability to the render buffer. This is
  // especially useful for the HgiVulkan backend.
  if (HdAovHasDepthStencilSemantic(name)) {
    return HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget |
      HgiTextureUsageBits.HgiTextureUsageBitsStencilTarget |
      HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
  } else if (HdAovHasDepthSemantic(name)) {
    return HgiTextureUsageBits.HgiTextureUsageBitsDepthTarget |
      HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
  }
  return HgiTextureUsageBits.HgiTextureUsageBitsColorTarget |
    HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
}

/** SdfPath::GetNameToken for a path string. */
function _NameToken(id: string): string {
  const slash = id.lastIndexOf('/')
  return slash >= 0 ? id.slice(slash + 1) : id
}

let _nextRenderBufferSerial = 1

/** renderBuffer.cpp:88-94. Debug name for texture. */
function _GetDebugName(textureObject: HdStDynamicUvTextureObject): string {
  return textureObject.GetTextureIdentifier().getFilePath()
}

/** renderBuffer.cpp:96-106 */
function _CreateTexture(textureObject: HdStDynamicUvTextureObject, desc: HgiTextureDesc): void {
  const texture = textureObject.getTexture()
  if (texture.isSet() && texture.Get()!.getDescriptor().equals(desc)) {
    return
  }

  textureObject.createTexture(desc)
}

/** renderBuffer.cpp:231-239 */
function _GetResource(textureObject: HdStDynamicUvTextureObject | null): HgiTextureHandle | undefined {
  if (textureObject) {
    return textureObject.getTexture()
  } else {
    return undefined
  }
}

/** renderBuffer.cpp:260-274 */
function _GetDimensions(textureObject: HdStDynamicUvTextureObject | null): GfVec3i {
  const invalidDimensions = new GfVec3i(0, 0, 0)

  if (!textureObject) {
    return invalidDimensions
  }
  const texture = textureObject.getTexture()
  if (!texture.isSet()) {
    return invalidDimensions
  }
  return texture.Get()!.getDescriptor().dimensions
}

/** renderBuffer.h:24-128 */
export class HdStRenderBuffer extends HdRenderBuffer {
  // HdRenderBuffer::Allocate should take a scene delegate or
  // resource registry so that we do not need to save it here.
  private readonly _resourceRegistry: HdStResourceRegistry
  // Format saved here (somewhat redundantely) since the
  // Hgi texture descriptor holds an HgiFormat instead of HdFormat.
  private _format: HdFormat = HdFormat.HdFormatInvalid
  private _msaaSampleCount = 4
  // The GPU texture resource
  private _textureObject: HdStDynamicUvTextureObject | null = null
  // The GPU multi-sample texture resource (optional)
  private _textureMSAAObject: HdStDynamicUvTextureObject | null = null
  // The number of callers mapping this buffer.
  private _mappers = 0
  // Texels are temp captured into this buffer between map and unmap.
  private _mappedBuffer: Uint8Array | null = null
  // Stands in for the "this" pointer in the texture identifier.
  private readonly _serial = _nextRenderBufferSerial++

  /** renderBuffer.cpp:35-44 */
  constructor(resourceRegistry: HdStResourceRegistry, id: string) {
    super(id)
    this._resourceRegistry = resourceRegistry
  }

  /** renderBuffer.cpp:48-62 */
  override sync(
    sceneDelegateOrPrim: _RenderBufferSceneDelegate | HdSceneIndexPrim,
    renderParam: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBits?: HdDirtyBitsRef,
  ): void {
    // Invoke base class processing for the DirtyDescriptor bit after pulling
    // the MSAA sample count, which is authored for consumption by Storm alone.
    const sceneDelegate = sceneDelegateOrPrim as _RenderBufferSceneDelegate
    if (dirtyBits && (dirtyBits.value & HdRenderBuffer.DirtyDescription)) {
      const val = sceneDelegate.Get(this.getId(), HdStRenderBufferTokens.stormMsaaSampleCount)
      if (val instanceof VtValue && val.getTypeName() === 'uint') {
        this._msaaSampleCount = val.UncheckedGet<number>()
      }
    }
    super.sync(sceneDelegateOrPrim as never, renderParam, dirtyBits)
  }

  /** renderBuffer.cpp:64-86 */
  GetTextureIdentifier(multiSampled: boolean): HdStTextureIdentifier {
    // The texture identifier has to be unique across different render
    // delegates sharing the same resource registry.
    //
    // Thus, we cannot just use the path of the render buffer. Adding
    // "this" pointer to ensure uniqueness.
    let idStr = this.getId()
    if (multiSampled) {
      idStr += ' [MSAA]'
    }
    idStr += `[${this._serial}] `

    return new HdStTextureIdentifier(
      TfToken(idStr),
      // Tag as texture not being loaded from an asset by
      // texture registry but populated by us.
      new HdStDynamicUvSubtextureIdentifier())
  }

  /** The texture object held through `slot`, dropped (see the header). */
  private _releaseTextureObject(object: HdStDynamicUvTextureObject | null): null {
    object?.release()
    return null
  }

  /** resourceRegistry->AllocateTextureObject with the dynamic_pointer_cast
   *  to HdStDynamicUvTextureObject (renderBuffer.cpp:121-128). */
  private _allocateTextureObject(multiSampled: boolean): HdStDynamicUvTextureObject | null {
    const object = this._resourceRegistry.allocateTextureObject(
      this.GetTextureIdentifier(multiSampled),
      HdStTextureType.Uv)
    if (object instanceof HdStDynamicUvTextureObject) {
      return object
    }
    object?.release()
    return null
  }

  /** renderBuffer.cpp:108-166 */
  allocate(dimensions: readonly [number, number, number], format: HdFormat,
    multiSampled: boolean): boolean {
    this._format = format

    if (this._format === HdFormat.HdFormatInvalid) {
      this._textureObject = this._releaseTextureObject(this._textureObject)
      this._textureMSAAObject = this._releaseTextureObject(this._textureMSAAObject)
      return false
    }

    if (!this._textureObject) {
      // Allocate texture object if necessary.
      this._textureObject = this._allocateTextureObject(/* multiSampled = */ false)
      if (!this._textureObject) {
        TF_CODING_ERROR('Expected HdStDynamicUvTextureObject')
        return false
      }
    }

    if (multiSampled) {
      if (!this._textureMSAAObject) {
        // Allocate texture object if necessary
        this._textureMSAAObject = this._allocateTextureObject(/* multiSampled = */ true)
        if (!this._textureMSAAObject) {
          TF_CODING_ERROR('Expected HdStDynamicUvTextureObject')
          return false
        }
      }
    } else {
      // De-allocate texture object
      this._textureMSAAObject = this._releaseTextureObject(this._textureMSAAObject)
    }

    const texDesc = new HgiTextureDesc()
    texDesc.debugName = _GetDebugName(this._textureObject)
    texDesc.dimensions = new GfVec3i(dimensions[0], dimensions[1], dimensions[2])
    texDesc.type = dimensions[2] > 1 ? HgiTextureType.HgiTextureType3D : HgiTextureType.HgiTextureType2D
    texDesc.format = HdStHgiConversions.getHgiFormat(format)
    texDesc.usage = _GetTextureUsage(format, _NameToken(this.getId()))
    texDesc.sampleCount = HgiSampleCount.HgiSampleCount1

    // Allocate actual GPU resource
    _CreateTexture(this._textureObject, texDesc)

    if (multiSampled) {
      const msDesc = new HgiTextureDesc()
      Object.assign(msDesc, texDesc)
      msDesc.debugName = _GetDebugName(this._textureMSAAObject!)
      msDesc.sampleCount = this._msaaSampleCount as HgiSampleCount

      // Allocate actual GPU resource
      _CreateTexture(this._textureMSAAObject!, msDesc)
    }

    return true
  }

  /** renderBuffer.cpp:168-173 */
  protected _deallocate(): void {
    this._textureObject = this._releaseTextureObject(this._textureObject)
    this._textureMSAAObject = this._releaseTextureObject(this._textureMSAAObject)
  }

  /** renderBuffer.cpp:175-202 (see the header note). */
  Map(): Uint8Array | null {
    this._mappers += 1
    return this._mappedBuffer
  }

  /** renderBuffer.cpp:175-202 with textureUtils.cpp:571-618
   *  (HdStTextureUtils::HgiTextureReadback): read the color texture back
   *  and keep it as the mapped buffer. */
  async MapAsync(): Promise<Uint8Array | null> {
    this._mappers += 1

    if (!this._textureObject) {
      return null
    }

    const texture = this._textureObject.getTexture()
    if (!texture.isSet()) {
      return null
    }
    const hgi = this._resourceRegistry.getHgi()

    const textureDesc = texture.Get()!.getDescriptor()
    const formatByteSize = HgiGetDataSizeOfFormat(textureDesc.format)
    const width = textureDesc.dimensions.get(0)
    const height = textureDesc.dimensions.get(1)
    const dataByteSize = width * height * formatByteSize

    if (dataByteSize === 0) {
      return null
    }

    // For Metal the CPU buffer has to be rounded up to a multiple of the page
    // size.
    const alignment = hgi.getCapabilities()!.getPageSizeAlignment()
    const bitMask = alignment - 1
    const bufferSize = (dataByteSize + bitMask) & ~bitMask

    const rawBuffer = new Uint8Array(bufferSize)

    const blitCmds = hgi.createBlitCmds()
    const copyOp = new HgiTextureGpuToCpuOp()
    copyOp.gpuSourceTexture = texture
    copyOp.sourceTexelOffset = new GfVec3i(0, 0, 0)
    copyOp.mipLevel = 0
    copyOp.cpuDestinationBuffer = rawBuffer
    copyOp.destinationByteOffset = 0
    copyOp.destinationBufferByteSize = bufferSize
    blitCmds.copyTextureGpuToCpu(copyOp)
    await hgi.submitCmds(blitCmds, HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)

    this._mappedBuffer = rawBuffer
    return rawBuffer
  }

  /** renderBuffer.cpp:204-213 */
  unmap(): void {
    // XXX We could consider clearing _mappedBuffer here to free RAM.
    //     For now we assume that Map() will be called frequently so we prefer
    //     to avoid the cost of clearing the buffer over memory savings.
    this._mappers -= 1
  }

  /** renderBuffer.h:80-82 */
  isMapped(): boolean {
    return this._mappers !== 0
  }

  /** renderBuffer.h:85-88 */
  isConverged(): boolean {
    return true
  }

  /** renderBuffer.cpp:215-220. Textures are resolved at the end of a render
   *  pass via the graphicsCmds by supplying the resolve textures to the
   *  graphicsCmds descriptor. */
  resolve(): void {}

  /** renderBuffer.cpp:241-249. The HgiTextureHandle, or undefined (the
   *  empty VtValue). */
  override getResource(multiSampled: boolean): HgiTextureHandle | undefined {
    if (multiSampled) {
      return _GetResource(this._textureMSAAObject)
    } else {
      return _GetResource(this._textureObject)
    }
  }

  /** renderBuffer.cpp:251-255 */
  isMultiSampled(): boolean {
    return this._textureMSAAObject !== null
  }

  /** renderBuffer.cpp:257-261 */
  getMSAASampleCount(): number {
    return this._msaaSampleCount
  }

  /** renderBuffer.cpp:276-292 */
  getWidth(): number { return _GetDimensions(this._textureObject).get(0) }
  getHeight(): number { return _GetDimensions(this._textureObject).get(1) }
  getDepth(): number { return _GetDimensions(this._textureObject).get(2) }

  /** renderBuffer.h:62 */
  GetFormat(): HdFormat { return this._format }
}
