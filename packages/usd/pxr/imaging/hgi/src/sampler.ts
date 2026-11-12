// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/sampler.cpp,
//  pxr/imaging/hgi/sampler.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/sampler.{h,cpp} (OpenUSD 26.11.1).

import { TfEnvSetting } from 'typescript-usd/tf'
import {
  HgiBorderColor,
  HgiCompareFunction,
  HgiMipFilter,
  HgiSamplerAddressMode,
  HgiSamplerFilter,
} from './enums.ts'
import { HgiHandle } from './handle.ts'

/** sampler.h:29 (sampler.cpp:11-13). Sets the maximum anisotropic filtering
 *  ratio for all samplers. */
export const HGI_MAX_ANISOTROPY = new TfEnvSetting<number>('HGI_MAX_ANISOTROPY', 16,
  'Maximum anisotropic filtering ratio for all samplers')

/** sampler.h:61-87 */
export class HgiSamplerDesc {
  debugName = ''
  magFilter: HgiSamplerFilter = HgiSamplerFilter.HgiSamplerFilterNearest
  minFilter: HgiSamplerFilter = HgiSamplerFilter.HgiSamplerFilterNearest
  mipFilter: HgiMipFilter = HgiMipFilter.HgiMipFilterNotMipmapped
  addressModeU: HgiSamplerAddressMode = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge
  addressModeV: HgiSamplerAddressMode = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge
  addressModeW: HgiSamplerAddressMode = HgiSamplerAddressMode.HgiSamplerAddressModeClampToEdge
  borderColor: HgiBorderColor = HgiBorderColor.HgiBorderColorTransparentBlack
  enableCompare = false
  compareFunction: HgiCompareFunction = HgiCompareFunction.HgiCompareFunctionNever
  maxAnisotropy = 16

  /** operator== (sampler.cpp:27-39); borderColor, enableCompare and
   *  compareFunction are not compared upstream. */
  equals(rhs: HgiSamplerDesc): boolean {
    return this.debugName === rhs.debugName &&
      this.magFilter === rhs.magFilter &&
      this.minFilter === rhs.minFilter &&
      this.mipFilter === rhs.mipFilter &&
      this.addressModeU === rhs.addressModeU &&
      this.addressModeV === rhs.addressModeV &&
      this.addressModeW === rhs.addressModeW &&
      this.maxAnisotropy === rhs.maxAnisotropy
  }
}

/** sampler.h:107-140 */
export abstract class HgiSampler {
  protected _descriptor: HgiSamplerDesc

  /** sampler.cpp:14-17 */
  protected constructor(desc: HgiSamplerDesc) {
    this._descriptor = Object.assign(new HgiSamplerDesc(), desc)
  }

  /** sampler.cpp:21-25 */
  getDescriptor(): HgiSamplerDesc {
    return this._descriptor
  }

  /** sampler.h:128. The backend object itself (uint64_t upstream). */
  abstract getRawResource(): unknown
}

/** sampler.h:142-143 */
export type HgiSamplerHandle = HgiHandle<HgiSampler>
export type HgiSamplerHandleVector = HgiSamplerHandle[]
