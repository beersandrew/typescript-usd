// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/texture.cpp,
//  pxr/imaging/hgi/texture.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/texture.{h,cpp} (OpenUSD 26.11.1).

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import {
  HgiComponentSwizzle,
  HgiSampleCount,
  HgiTextureType,
  type HgiTextureUsage,
} from './enums.ts'
import { HgiHandle } from './handle.ts'
import type { HgiCpuData } from './buffer.ts'
import { HgiFormat, HgiGetMipInfos } from './types.ts'

/** texture.h:37-43 */
export class HgiComponentMapping {
  constructor(
    public r: HgiComponentSwizzle = HgiComponentSwizzle.HgiComponentSwizzleR,
    public g: HgiComponentSwizzle = HgiComponentSwizzle.HgiComponentSwizzleG,
    public b: HgiComponentSwizzle = HgiComponentSwizzle.HgiComponentSwizzleB,
    public a: HgiComponentSwizzle = HgiComponentSwizzle.HgiComponentSwizzleA,
  ) {}

  /** operator== (texture.cpp:47-54) */
  equals(rhs: HgiComponentMapping): boolean {
    return this.r === rhs.r &&
      this.g === rhs.g &&
      this.b === rhs.b &&
      this.a === rhs.a
  }
}

/** texture.h:90-120 */
export class HgiTextureDesc {
  debugName = ''
  usage: HgiTextureUsage = 0
  format: HgiFormat = HgiFormat.HgiFormatInvalid
  componentMapping: HgiComponentMapping = new HgiComponentMapping(
    HgiComponentSwizzle.HgiComponentSwizzleR,
    HgiComponentSwizzle.HgiComponentSwizzleG,
    HgiComponentSwizzle.HgiComponentSwizzleB,
    HgiComponentSwizzle.HgiComponentSwizzleA)
  type: HgiTextureType = HgiTextureType.HgiTextureType2D
  dimensions: GfVec3i = new GfVec3i(0, 0, 0)
  layerCount = 1
  mipLevels = 1
  sampleCount: HgiSampleCount = HgiSampleCount.HgiSampleCount1
  pixelsByteSize = 0
  initialData: HgiCpuData | null = null

  /** Copy (C++ copy construction / assignment). */
  clone(): HgiTextureDesc {
    const c = Object.assign(new HgiTextureDesc(), this)
    const m = this.componentMapping
    c.componentMapping = new HgiComponentMapping(m.r, m.g, m.b, m.a)
    c.dimensions = new GfVec3i(this.dimensions)
    return c
  }

  /** operator== (texture.cpp:62-76); layerCount, mipLevels and
   *  initialData are not compared upstream. */
  equals(rhs: HgiTextureDesc): boolean {
    return this.debugName === rhs.debugName &&
      this.usage === rhs.usage &&
      this.format === rhs.format &&
      this.componentMapping.equals(rhs.componentMapping) &&
      this.type === rhs.type &&
      this.dimensions.equals(rhs.dimensions) &&
      this.sampleCount === rhs.sampleCount &&
      this.pixelsByteSize === rhs.pixelsByteSize
      // Omitted because data ptr is set to nullptr after CreateTexture
      // lhs.initialData == rhs.initialData
  }
}

/** texture.h:143-193 */
export abstract class HgiTexture {
  protected _descriptor: HgiTextureDesc

  /** texture.cpp:13-16 */
  protected constructor(desc: HgiTextureDesc) {
    this._descriptor = desc.clone()
  }

  /** texture.cpp:20-24 */
  getDescriptor(): HgiTextureDesc {
    return this._descriptor
  }

  /** texture.h:156 */
  abstract getByteSizeOfResource(): number

  /** texture.h:170. Upstream returns the backend handle as uint64_t; the
   *  backend object itself is returned here. */
  abstract getRawResource(): unknown

  /** texture.h:177 */
  abstract submitLayoutChange(newLayout: HgiTextureUsage): HgiTextureUsage

  /** texture.cpp:26-45 */
  protected static _getByteSizeOfResource(descriptor: HgiTextureDesc): number {
    // Compute all mip levels down to 1x1(x1)
    const mipInfos = HgiGetMipInfos(
      descriptor.format, descriptor.dimensions, descriptor.layerCount)

    // Number of mip levels actually used.
    const mipLevels = Math.min(mipInfos.length, descriptor.mipLevels)

    // Get the last mip level actually used.
    const mipInfo = mipInfos[mipLevels - 1]!

    // mipInfo.byteOffset is the sum of all mip levels prior
    // to the last mip level actually used.
    return mipInfo.byteOffset + descriptor.layerCount * mipInfo.byteSizePerLayer
  }
}

/** texture.h:196-197 */
export type HgiTextureHandle = HgiHandle<HgiTexture>
export type HgiTextureHandleVector = HgiTextureHandle[]

/** texture.h:228-246 */
export class HgiTextureViewDesc {
  debugName = ''
  format: HgiFormat = HgiFormat.HgiFormatInvalid
  layerCount = 1
  mipLevels = 1
  sourceTexture: HgiTextureHandle = new HgiHandle<HgiTexture>()
  sourceFirstLayer = 0
  sourceFirstMip = 0

  /** operator== (texture.cpp:84-95) */
  equals(rhs: HgiTextureViewDesc): boolean {
    return this.debugName === rhs.debugName &&
      this.format === rhs.format &&
      this.layerCount === rhs.layerCount &&
      this.mipLevels === rhs.mipLevels &&
      this.sourceTexture.equals(rhs.sourceTexture) &&
      this.sourceFirstLayer === rhs.sourceFirstLayer &&
      this.sourceFirstMip === rhs.sourceFirstMip
  }
}

/** texture.h:276-300. Not abstract upstream: backends create plain
 *  HgiTextureViews holding a backend texture (hgiMetal/hgi.mm:212-220). */
export class HgiTextureView {
  protected _viewTexture: HgiTextureHandle = new HgiHandle<HgiTexture>()

  /** texture.cpp:103-105 */
  constructor(_desc: HgiTextureViewDesc) {}

  /** texture.cpp:109-113 */
  setViewTexture(handle: HgiTextureHandle): void {
    this._viewTexture = handle
  }

  /** texture.cpp:115-119 */
  getViewTexture(): HgiTextureHandle {
    return this._viewTexture
  }
}

/** texture.h:302-303 */
export type HgiTextureViewHandle = HgiHandle<HgiTextureView>
export type HgiTextureViewHandleVector = HgiTextureViewHandle[]
