// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/sampler.h,
//  pxr/imaging/hgiMetal/sampler.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUSampler. Modelled on pxr/imaging/hgiMetal/sampler.{h,mm}.

import {
  HGI_MAX_ANISOTROPY,
  HgiMipFilter,
  HgiSampler,
  HgiSamplerFilter,
  type HgiSamplerDesc,
} from 'typescript-usd/hgi'
import { TfGetEnvSetting } from 'typescript-usd/tf'
import { HgiWebGPUConversions } from './conversions.ts'

export class HgiWebGPUSampler extends HgiSampler {
  private _samplerId: GPUSampler | null
  private readonly _device: GPUDevice
  private readonly _smpDesc: GPUSamplerDescriptor
  private _footprintSamplerId: GPUSampler | null = null

  /** hgiMetal/sampler.mm:17-53 */
  constructor(device: GPUDevice, desc: HgiSamplerDesc) {
    super(desc)

    const smpDesc: GPUSamplerDescriptor = {
      label: desc.debugName,
      addressModeU: HgiWebGPUConversions.getSamplerAddressMode(desc.addressModeU),
      addressModeV: HgiWebGPUConversions.getSamplerAddressMode(desc.addressModeV),
      addressModeW: HgiWebGPUConversions.getSamplerAddressMode(desc.addressModeW),
      minFilter: HgiWebGPUConversions.getMinMagFilter(desc.minFilter),
      magFilter: HgiWebGPUConversions.getMinMagFilter(desc.magFilter),
      mipmapFilter: HgiWebGPUConversions.getMipFilter(desc.mipFilter),
    }
    if (desc.mipFilter === HgiMipFilter.HgiMipFilterNotMipmapped) {
      // MTLSamplerMipFilterNotMipmapped samples level 0.
      smpDesc.lodMaxClamp = 0
    }
    // WebGPU adaptation: Metal sets compareFunction on every sampler and
    // applies it only to depth-compare sampling; a WebGPU sampler with a
    // compare function is a comparison sampler, so it is set only when the
    // descriptor enables comparison.
    if (desc.enableCompare) {
      smpDesc.compare = HgiWebGPUConversions.getCompareFunction(desc.compareFunction)
    }
    // hgiMetal/sampler.mm:38-46, with WebGPU's requirement that anisotropic
    // filtering use linear min, mag and mip filters.
    if (desc.minFilter === HgiSamplerFilter.HgiSamplerFilterLinear &&
        desc.magFilter === HgiSamplerFilter.HgiSamplerFilterLinear &&
        desc.mipFilter === HgiMipFilter.HgiMipFilterLinear) {
      const maxAnisotropy = 16
      smpDesc.maxAnisotropy = Math.max(1, Math.floor(Math.min(
        maxAnisotropy, desc.maxAnisotropy, TfGetEnvSetting(HGI_MAX_ANISOTROPY))))
    }

    this._samplerId = device.createSampler(smpDesc)
    this._device = device
    this._smpDesc = smpDesc
  }

  /** This sampler with repeat addressing on every axis (its filters, level
   *  clamp and anisotropy unchanged), with which the clamp-to-border
   *  emulation samples a texture's footprint texture (samplerState.ts). */
  getBorderFootprintSamplerId(): GPUSampler | null {
    if (!this._samplerId) return null
    this._footprintSamplerId ??= this._device.createSampler({
      ...this._smpDesc,
      label: `${this._smpDesc.label ?? ''} border footprint`,
      addressModeU: 'repeat', addressModeV: 'repeat', addressModeW: 'repeat',
    })
    return this._footprintSamplerId
  }

  /** hgiMetal/sampler.mm:55-67 */
  _destroy(): void {
    this._samplerId = null
    this._footprintSamplerId = null
  }

  /** hgiMetal/sampler.mm:69-73 */
  getRawResource(): GPUSampler | null {
    return this._samplerId
  }

  /** hgiMetal/sampler.mm:75-79 */
  getSamplerId(): GPUSampler | null {
    return this._samplerId
  }
}
