// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/samplerObject.cpp,
//  pxr/imaging/hdSt/samplerObject.h,
//  pxr/imaging/hdSt/samplerObjectRegistry.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/samplerObject.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence (lifetime): upstream sampler objects are std::shared_ptr's
// held by the registry and by a texture handle; the registry frees those
// with use_count() == 1 (samplerObjectRegistry.cpp:121-152). Here the
// owning texture handle calls Release() when it drops the sampler, and
// `_expired` says that no holder besides the registry is left. The
// destructors run as _Destroy(), called by the registry.

import {
  BorderColor as HdBorderColor,
  CompareFunction as HdCompareFunction,
  MagFilter as HdMagFilter,
  MinFilter as HdMinFilter,
  SamplerParameters as HdSamplerParameters,
  Wrap as HdWrap,
} from 'typescript-usd/hd'
import { HgiHandle, HgiSamplerDesc, type Hgi, type HgiSampler, type HgiSamplerHandle } from 'typescript-usd/hgi'
import { HdStHgiConversions } from './hgiConversions.ts'
import type { HdStPtexTextureObject } from './ptexTextureObject.ts'
import type { HdSt_SamplerObjectRegistry } from './samplerObjectRegistry.ts'
import type { HdStFieldTextureObject, HdStUvTextureObject } from './textureObject.ts'
import type { HdStUdimTextureObject } from './udimTextureObject.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

///////////////////////////////////////////////////////////////////////////////
// HdStSamplerObject

/** samplerObject.h:32-66. A base class encapsulating a GPU sampler object.
 *
 *  The subclasses of HdStSamplerObject mirror the subclasses of
 *  HdStTextureObject with the intention that they will be used in
 *  conjunction. The GPU resources is con-/destructed immediately in the
 *  c'tor/d'tor. */
export abstract class HdStSamplerObject {
  protected readonly _samplerObjectRegistry: HdSt_SamplerObjectRegistry

  /** Set by the owner when it drops the sampler (see the header). */
  private _released = false

  /** samplerObject.cpp:22-26 */
  protected constructor(samplerObjectRegistry: HdSt_SamplerObjectRegistry) {
    this._samplerObjectRegistry = samplerObjectRegistry
  }

  /** The owner drops its shared pointer (see the header). */
  release(): void {
    this._released = true
  }

  /** use_count() == 1 (see the header). */
  get _expired(): boolean {
    return this._released
  }

  /** The C++ destructor (see the header). */
  abstract _destroy(): void

  /** samplerObject.cpp:30-47 */
  protected _getHgi(): Hgi | null {
    if (!TF_VERIFY(this._samplerObjectRegistry)) {
      return null
    }

    const registry = this._samplerObjectRegistry.getResourceRegistry()
    if (!TF_VERIFY(registry)) {
      return null
    }

    const hgi = registry.getHgi()
    TF_VERIFY(hgi)

    return hgi
  }
}
export type HdStSamplerObjectSharedPtr = HdStSamplerObject

///////////////////////////////////////////////////////////////////////////////
// Helpers

/** samplerObject.cpp:52-79. Translate to Hgi. */
function _ToHgiSamplerDesc(samplerParameters: HdSamplerParameters): HgiSamplerDesc {
  const desc = new HgiSamplerDesc()
  desc.debugName = 'HdStSamplerObject'
  desc.magFilter = HdStHgiConversions.getHgiMagFilter(samplerParameters.magFilter)
  const minMip = HdStHgiConversions.getHgiMinAndMipFilter(samplerParameters.minFilter)
  desc.minFilter = minMip.hgiSamplerFilter
  desc.mipFilter = minMip.hgiMipFilter
  desc.addressModeU = HdStHgiConversions.getHgiSamplerAddressMode(samplerParameters.wrapS)
  desc.addressModeV = HdStHgiConversions.getHgiSamplerAddressMode(samplerParameters.wrapT)
  desc.addressModeW = HdStHgiConversions.getHgiSamplerAddressMode(samplerParameters.wrapR)
  desc.maxAnisotropy = samplerParameters.maxAnisotropy
  desc.borderColor = HdStHgiConversions.getHgiBorderColor(samplerParameters.borderColor)
  desc.enableCompare = samplerParameters.enableCompare
  desc.compareFunction = HdStHgiConversions.getHgiCompareFunction(
    samplerParameters.compareFunction)
  return desc
}

/** samplerObject.cpp:81-99. Generate sampler. */
function _GenSampler(
  samplerObjectRegistry: HdSt_SamplerObjectRegistry,
  samplerParameters: HdSamplerParameters,
): HgiSamplerHandle {
  const registry = samplerObjectRegistry.getResourceRegistry()
  if (!TF_VERIFY(registry)) {
    return new HgiHandle<HgiSampler>()
  }

  const hgi = registry.getHgi()
  if (!TF_VERIFY(hgi)) {
    return new HgiHandle<HgiSampler>()
  }

  return hgi.createSampler(_ToHgiSamplerDesc(samplerParameters))
}

function _DestroySampler(hgi: Hgi | null, sampler: HgiSamplerHandle): void {
  if (hgi && sampler.isSet()) {
    hgi.destroySampler(sampler)
  }
}

///////////////////////////////////////////////////////////////////////////////
// Uv sampler

/** samplerObject.cpp:104-126. Resolve a wrap parameter using the opinion
 *  authored in the metadata of a texture file. */
function _ResolveSamplerParameter(textureOpinion: HdWrap, parameter: HdWrap): HdWrap {
  if (parameter === HdWrap.HdWrapNoOpinion) {
    parameter = textureOpinion
  }

  // Legacy behavior for HwUvTexture_1
  if (parameter === HdWrap.HdWrapLegacyNoOpinionFallbackRepeat) {
    if (textureOpinion === HdWrap.HdWrapNoOpinion) {
      // Use repeat if there is no opinion on either the
      // texture node or in the texture file.
      parameter = HdWrap.HdWrapRepeat
    } else {
      parameter = textureOpinion
    }
  }
  return parameter
}

/** samplerObject.cpp:128-145. Resolve wrapS or wrapT of the
 *  samplerParameters using metadata from the texture file. */
function _ResolveUvSamplerParameters(
  texture: HdStUvTextureObject,
  samplerParameters: HdSamplerParameters,
): HdSamplerParameters {
  const p = samplerParameters
  const result = new HdSamplerParameters(p.wrapS, p.wrapT, p.wrapR, p.minFilter,
    p.magFilter, p.borderColor, p.enableCompare, p.compareFunction, p.maxAnisotropy)
  result.wrapS = _ResolveSamplerParameter(texture.getWrapParameters()[0], result.wrapS)
  result.wrapT = _ResolveSamplerParameter(texture.getWrapParameters()[1], result.wrapT)
  return result
}

/** samplerObject.h:72-96. A sampler suitable for HdStUvTextureObject.
 *
 *  Note that when this sampler is used with an HdStUvTextureObject referring
 *  to a cubemap, the wrap modes in the sampler parameters will be ignored
 *  because we default to using seamless cubemap sampling. */
export class HdStUvSamplerObject extends HdStSamplerObject {
  private _sampler: HgiSamplerHandle

  /** samplerObject.cpp:147-158 */
  constructor(
    texture: HdStUvTextureObject,
    samplerParameters: HdSamplerParameters,
    samplerObjectRegistry: HdSt_SamplerObjectRegistry,
  ) {
    super(samplerObjectRegistry)
    this._sampler = _GenSampler(samplerObjectRegistry,
      _ResolveUvSamplerParameters(texture, samplerParameters))
  }

  /** samplerObject.cpp:160-165 (destructor). */
  _destroy(): void {
    _DestroySampler(this._getHgi(), this._sampler)
  }

  /** samplerObject.h:88-91. The sampler. */
  getSampler(): HgiSamplerHandle {
    return this._sampler
  }
}

///////////////////////////////////////////////////////////////////////////////
// Field sampler

/** samplerObject.h:103-124. A sampler suitable for HdStFieldTextureObject. */
export class HdStFieldSamplerObject extends HdStSamplerObject {
  private _sampler: HgiSamplerHandle

  /** samplerObject.cpp:170-180 */
  constructor(
    _texture: HdStFieldTextureObject,
    samplerParameters: HdSamplerParameters,
    samplerObjectRegistry: HdSt_SamplerObjectRegistry,
  ) {
    super(samplerObjectRegistry)
    this._sampler = _GenSampler(samplerObjectRegistry, samplerParameters)
  }

  /** samplerObject.cpp:182-188 (destructor). */
  _destroy(): void {
    _DestroySampler(this._getHgi(), this._sampler)
  }

  /** samplerObject.h:116-119. The sampler. */
  getSampler(): HgiSamplerHandle {
    return this._sampler
  }
}

///////////////////////////////////////////////////////////////////////////////
// Ptex sampler

/** samplerObject.cpp:195-205. Wrap modes such as repeat or mirror do not
 *  make sense for ptex, so set them to clamp. */
const PTEX_SAMPLER_PARAMETERS = new HdSamplerParameters(
  HdWrap.HdWrapClamp,
  HdWrap.HdWrapClamp,
  HdWrap.HdWrapClamp,
  HdMinFilter.HdMinFilterLinear,
  HdMagFilter.HdMagFilterLinear,
  HdBorderColor.HdBorderColorTransparentBlack,
  /*enableCompare*/false,
  HdCompareFunction.HdCmpFuncNever,
  /*maxAnisotropy*/16)

/** samplerObject.cpp:207-217 */
const LAYOUT_SAMPLER_PARAMETERS = new HdSamplerParameters(
  HdWrap.HdWrapRepeat,
  HdWrap.HdWrapRepeat,
  HdWrap.HdWrapRepeat,
  HdMinFilter.HdMinFilterNearest,
  HdMagFilter.HdMagFilterNearest,
  HdBorderColor.HdBorderColorTransparentBlack,
  /*enableCompare*/false,
  HdCompareFunction.HdCmpFuncNever,
  /*maxAnisotropy*/1)

/** samplerObject.h:131-162. Ptex doesn't bind samplers, so this class is
 *  just holding a sampler to resolve handles for bindless textures. */
export class HdStPtexSamplerObject extends HdStSamplerObject {
  private _texelsSampler: HgiSamplerHandle
  private _layoutSampler: HgiSamplerHandle

  /** samplerObject.cpp:219-235 */
  constructor(
    _ptexTexture: HdStPtexTextureObject,
    // samplerParameters are ignored are ptex
    _samplerParameters: HdSamplerParameters,
    samplerObjectRegistry: HdSt_SamplerObjectRegistry,
  ) {
    super(samplerObjectRegistry)
    this._texelsSampler = _GenSampler(samplerObjectRegistry, PTEX_SAMPLER_PARAMETERS)
    this._layoutSampler = _GenSampler(samplerObjectRegistry, LAYOUT_SAMPLER_PARAMETERS)
  }

  /** samplerObject.cpp:237-243 (destructor). */
  _destroy(): void {
    const hgi = this._getHgi()
    _DestroySampler(hgi, this._texelsSampler)
    _DestroySampler(hgi, this._layoutSampler)
  }

  /** samplerObject.h:145-148. The GPU sampler object for the texels
   *  texture. */
  getTexelsSampler(): HgiSamplerHandle { return this._texelsSampler }

  /** samplerObject.h:150-153. The GPU sampler object for the layout
   *  texture. */
  getLayoutSampler(): HgiSamplerHandle { return this._layoutSampler }
}

///////////////////////////////////////////////////////////////////////////////
// Udim sampler

/** samplerObject.cpp:250-266. Wrap modes such as repeat or mirror do not
 *  make sense for udim, so set them to clamp. */
const UDIM_SAMPLER_PARAMETERS = new HdSamplerParameters(
  HdWrap.HdWrapClamp,
  HdWrap.HdWrapClamp,
  HdWrap.HdWrapClamp,
  HdMinFilter.HdMinFilterLinearMipmapLinear,
  HdMagFilter.HdMagFilterLinear,
  HdBorderColor.HdBorderColorTransparentBlack,
  /*enableCompare*/false,
  HdCompareFunction.HdCmpFuncNever,
  /*maxAnisotropy*/16)

/** samplerObject.h:169-200. A sampler suitable for Udim textures (wraps one
 *  GPU sampler for the texels texture). */
export class HdStUdimSamplerObject extends HdStSamplerObject {
  private _texelsSampler: HgiSamplerHandle
  private _layoutSampler: HgiSamplerHandle

  /** samplerObject.cpp:268-284 */
  constructor(
    _udimTexture: HdStUdimTextureObject,
    // samplerParameters are ignored by udim (at least for now)
    _samplerParameters: HdSamplerParameters,
    samplerObjectRegistry: HdSt_SamplerObjectRegistry,
  ) {
    super(samplerObjectRegistry)
    this._texelsSampler = _GenSampler(samplerObjectRegistry, UDIM_SAMPLER_PARAMETERS)
    this._layoutSampler = _GenSampler(samplerObjectRegistry, LAYOUT_SAMPLER_PARAMETERS)
  }

  /** samplerObject.cpp:286-292 (destructor). */
  _destroy(): void {
    const hgi = this._getHgi()
    _DestroySampler(hgi, this._texelsSampler)
    _DestroySampler(hgi, this._layoutSampler)
  }

  /** samplerObject.h:183-186. The GPU sampler object for the texels
   *  texture. */
  getTexelsSampler(): HgiSamplerHandle { return this._texelsSampler }

  /** samplerObject.h:188-191. The GPU sampler object for the layout
   *  texture. */
  getLayoutSampler(): HgiSamplerHandle { return this._layoutSampler }
}
