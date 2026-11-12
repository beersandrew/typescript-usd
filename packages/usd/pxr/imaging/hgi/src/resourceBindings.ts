// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/resourceBindings.cpp,
//  pxr/imaging/hgi/resourceBindings.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/resourceBindings.{h,cpp} (OpenUSD 26.11.1).

import {
  HgiBindResourceType,
  HgiShaderStageBits,
  type HgiShaderStage,
} from './enums.ts'
import { HgiHandle, HgiHandleVectorEquals } from './handle.ts'
import type { HgiBufferHandle, HgiBufferHandleVector } from './buffer.ts'
import type { HgiSamplerHandleVector } from './sampler.ts'
import type { HgiTextureHandleVector } from './texture.ts'

function _numberVectorEquals(lhs: readonly number[], rhs: readonly number[]): boolean {
  return lhs.length === rhs.length && lhs.every((v, i) => v === rhs[i])
}

/** resourceBindings.h:62-74 (constructor: resourceBindings.cpp:24-29).
 *  `resourceType` is left uninitialized by the upstream constructor; it
 *  starts at HgiBindResourceTypeCount here so an unset value fails the
 *  "Unknown buffer type to bind" check in Hgi::CreateResourceBindings. */
export class HgiBufferBindDesc {
  buffers: HgiBufferHandleVector = []
  offsets: number[] = []
  sizes: number[] = []
  resourceType: HgiBindResourceType = HgiBindResourceType.HgiBindResourceTypeCount
  bindingIndex = 0
  stageUsage: HgiShaderStage = HgiShaderStageBits.HgiShaderStageVertex |
    HgiShaderStageBits.HgiShaderStagePostTessellationVertex
  writable = false

  /** operator== (resourceBindings.cpp:31-42) */
  equals(rhs: HgiBufferBindDesc): boolean {
    return HgiHandleVectorEquals(this.buffers, rhs.buffers) &&
      this.resourceType === rhs.resourceType &&
      _numberVectorEquals(this.offsets, rhs.offsets) &&
      _numberVectorEquals(this.sizes, rhs.sizes) &&
      this.bindingIndex === rhs.bindingIndex &&
      this.stageUsage === rhs.stageUsage &&
      this.writable === rhs.writable
  }
}
export type HgiBufferBindDescVector = HgiBufferBindDesc[]

/** resourceBindings.h:111-122 (constructor: resourceBindings.cpp:51-57) */
export class HgiTextureBindDesc {
  textures: HgiTextureHandleVector = []
  samplers: HgiSamplerHandleVector = []
  resourceType: HgiBindResourceType = HgiBindResourceType.HgiBindResourceTypeCombinedSamplerImage
  bindingIndex = 0
  stageUsage: HgiShaderStage = HgiShaderStageBits.HgiShaderStageFragment
  writable = false

  /** operator== (resourceBindings.cpp:59-69) */
  equals(rhs: HgiTextureBindDesc): boolean {
    return HgiHandleVectorEquals(this.textures, rhs.textures) &&
      this.resourceType === rhs.resourceType &&
      this.bindingIndex === rhs.bindingIndex &&
      this.stageUsage === rhs.stageUsage &&
      HgiHandleVectorEquals(this.samplers, rhs.samplers) &&
      this.writable === rhs.writable
  }
}
export type HgiTextureBindDescVector = HgiTextureBindDesc[]

/** resourceBindings.h:146-154 */
export class HgiResourceBindingsDesc {
  debugName = ''
  buffers: HgiBufferBindDesc[] = []
  textures: HgiTextureBindDesc[] = []

  /** operator== (resourceBindings.cpp:80-87) */
  equals(rhs: HgiResourceBindingsDesc): boolean {
    return this.debugName === rhs.debugName &&
      this.buffers.length === rhs.buffers.length &&
      this.buffers.every((b, i) => b.equals(rhs.buffers[i]!)) &&
      this.textures.length === rhs.textures.length &&
      this.textures.every((t, i) => t.equals(rhs.textures[i]!))
  }
}

/** resourceBindings.h:173-193 */
export abstract class HgiResourceBindings {
  protected _descriptor: HgiResourceBindingsDesc

  /** resourceBindings.cpp:11-14 */
  protected constructor(desc: HgiResourceBindingsDesc) {
    this._descriptor = new HgiResourceBindingsDesc()
    this._descriptor.debugName = desc.debugName
    this._descriptor.buffers = [...desc.buffers]
    this._descriptor.textures = [...desc.textures]
  }

  /** resourceBindings.cpp:18-22 */
  getDescriptor(): HgiResourceBindingsDesc {
    return this._descriptor
  }
}

/** resourceBindings.h:195-196 */
export type HgiResourceBindingsHandle = HgiHandle<HgiResourceBindings>
export type HgiResourceBindingsHandleVector = HgiResourceBindingsHandle[]

/** resourceBindings.h:211-226 */
export class HgiVertexBufferBinding {
  constructor(
    public buffer: HgiBufferHandle,
    public byteOffset: number,
    public index: number,
  ) {}
}
/** resourceBindings.h:228 */
export type HgiVertexBufferBindingVector = HgiVertexBufferBinding[]
