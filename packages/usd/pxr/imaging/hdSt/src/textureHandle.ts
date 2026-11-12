// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureHandle.cpp,
//  pxr/imaging/hdSt/textureHandle.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/textureHandle.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence (lifetime): upstream texture handles are std::shared_ptr's that
// the registry tracks through weak pointers; ~HdStTextureHandle marks the
// texture and shader dirty (textureHandle.cpp:33-46). Here the holder of a
// handle calls Release() when it drops it: that runs the destructor and
// makes the registry's weak pointers to the handle stop locking
// (`_expired`). The handle's holds on its texture object and sampler object
// are released with it (textureObject.ts, samplerObject.ts).

import type { SamplerParameters as HdSamplerParameters } from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import type { HdStSamplerObject } from './samplerObject.ts'
import type { HdStShaderCode } from './shaderCode.ts'
import type { HdSt_TextureHandleRegistry } from './textureHandleRegistry.ts'
import type { HdStTextureObject } from './textureObject.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** textureHandle.h:34-103. Represents a texture and sampler that will be
 *  allocated and loaded from a texture file during commit, possibly a
 *  texture sampler handle and a memory request. It is intended for
 *  HdStShaderCode and HdStShaderCode::AddResourcesFromTextures() is called
 *  whenever the underlying texture and sampler gets allocated and
 *  (re-)loaded so that the shader code can react to, e.g., changing texture
 *  sampler handle for bindless or changing texture metadata such as a field
 *  bounding box for volumes. */
export class HdStTextureHandle {
  private readonly _textureObject: HdStTextureObject
  private _samplerObject: HdStSamplerObject | null = null
  private readonly _samplerParams: HdSamplerParameters
  private readonly _memoryRequest: number
  private readonly _shaderCode: HdStShaderCode | null
  private readonly _textureHandleRegistry: HdSt_TextureHandleRegistry

  private _released = false

  /** textureHandle.cpp:20-31. See
   *  HdStResourceRegistry::AllocateTextureHandle for details. The handle
   *  takes over the caller's hold on `textureObject`. */
  constructor(
    textureObject: HdStTextureObject,
    samplerParams: HdSamplerParameters,
    memoryRequest: number,
    shaderCode: HdStShaderCode | null,
    textureHandleRegistry: HdSt_TextureHandleRegistry,
  ) {
    this._textureObject = textureObject
    this._samplerParams = samplerParams
    this._memoryRequest = memoryRequest
    this._shaderCode = shaderCode
    this._textureHandleRegistry = textureHandleRegistry
  }

  /** The holder drops the handle: textureHandle.cpp:33-46 (destructor),
   *  see the header. */
  release(): void {
    if (this._released) {
      return
    }
    this._released = true
    if (TF_VERIFY(this._textureHandleRegistry)) {
      // The target memory of the texture might change, so mark dirty.
      this._textureHandleRegistry.markDirty(this._textureObject)
      // The shader needs to be updated after it dropped a texture
      // handle (i.e., because it re-allocated the shader bar after
      // dropping a texture).
      this._textureHandleRegistry.markDirty(this._shaderCode)
      this._textureHandleRegistry.markSamplerGarbageCollectionNeeded()
    }
    // The members' shared pointers go with the handle.
    this._samplerObject?.release()
    this._textureObject.release()
  }

  /** True once the holder dropped the handle (a weak pointer to it no
   *  longer locks). */
  get _expired(): boolean {
    return this._released
  }

  /** textureHandle.h:56-61. Get texture object. Can be accessed after
   *  commit. */
  getTextureObject(): HdStTextureObject {
    return this._textureObject
  }

  /** textureHandle.h:63-68. Get sampler object. Can be accessed after
   *  commit. */
  getSamplerObject(): HdStSamplerObject | null {
    return this._samplerObject
  }

  /** textureHandle.h:70-74. Get sampler parameters. */
  GetSamplerParameters(): HdSamplerParameters {
    return this._samplerParams
  }

  /** textureHandle.h:76-80. Get how much memory this handle requested for
   *  the texture. */
  getMemoryRequest(): number {
    return this._memoryRequest
  }

  /** textureHandle.h:82-86. Get the shader code associated with this
   *  handle (a weak pointer: see shaderCode.ts on `_expired`). */
  getShaderCode(): HdStShaderCode | null {
    return this._shaderCode
  }

  /** textureHandle.cpp:48-75. Allocate sampler for this handle (not
   *  thread-safe). */
  reallocateSamplerIfNecessary(): void {
    if (this._samplerObject) {
      if (!this.useBindlessHandles()) {
        // There is no setter for sampler parameters,
        // so we only need to create a sampler once...
        return
      }

      // ... except that the sampler object has a texture sampler
      // handle that needs to be re-created if the underlying texture
      // changes, so continue.
      if (TF_VERIFY(this._textureHandleRegistry)) {
        this._textureHandleRegistry.markSamplerGarbageCollectionNeeded()
      }

      this._samplerObject.release()
      this._samplerObject = null
    }

    // Create sampler object through registry.
    const samplerObjectRegistry = this._textureHandleRegistry.getSamplerObjectRegistry()

    this._samplerObject = samplerObjectRegistry.allocateSampler(
      this._textureObject, this._samplerParams)
  }

  /** textureHandle.cpp:77-86. Get whether bindless texture handles are
   *  enabled. */
  useBindlessHandles(): boolean {
    if (TF_VERIFY(this._textureHandleRegistry)) {
      return this._textureHandleRegistry.getTextureObjectRegistry()
        .getResourceRegistry().getHgi().getCapabilities()!
        .isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBindlessTextures)
    }
    return false
  }
}
export type HdStTextureHandleSharedPtr = HdStTextureHandle
