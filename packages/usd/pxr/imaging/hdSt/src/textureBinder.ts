// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureBinder.cpp,
//  pxr/imaging/hdSt/textureBinder.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/textureBinder.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - The functor/template dispatch (_Dispatch, _CastAndCompute,
//   textureBinder.cpp:470-541) is one switch over the texture type with
//   instanceof checks for the dynamic_casts.
// - Bindless handles are 0 (PLATFORM-DIVERGENCE(hdst-bindless-handles),
//   resourceBinder.ts); Hgi WebGPU and Metal report no bindless textures,
//   so the bindless branches do not run.

import { Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  ResolvedBufferSource as HdResolvedBufferSource,
  Type as HdType,
  VtBufferSource as HdVtBufferSource,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
  type TupleType as HdTupleType,
} from 'typescript-usd/hd'
import type {
  HgiResourceBindingsDesc,
  HgiSamplerHandle,
  HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HdStTextureType } from './enums.ts'
import { HdStPtexTextureObject } from './ptexTextureObject.ts'
import { HdSt_ResourceBindingSuffixTokens, HdSt_ResourceBinder } from './resourceBinder.ts'
import {
  HdStFieldSamplerObject,
  HdStPtexSamplerObject,
  HdStUdimSamplerObject,
  HdStUvSamplerObject,
} from './samplerObject.ts'
import type {
  HdStShaderCodeNamedTextureHandle,
  HdStShaderCodeNamedTextureHandleVector,
} from './shaderCode.ts'
import { HdStFieldTextureObject, HdStUvTextureObject } from './textureObject.ts'
import { HdStUdimTextureObject } from './udimTextureObject.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** textureBinder.cpp:20-24 */
function _Concat(a: string, b: string): TfToken {
  return TfToken(a + b)
}

/** textureBinder.cpp:89-131. A bindless GL sampler buffer. This identifies
 *  a texture as a 64-bit handle, passed to GLSL as "uvec2". */
class HdSt_BindlessSamplerBufferSource extends HdResolvedBufferSource {
  private readonly _name: TfToken
  private readonly _value: BigUint64Array

  constructor(name: TfToken, value: readonly bigint[]) {
    super()
    this._name = name
    this._value = BigUint64Array.from(value)
  }

  getName(): TfToken {
    return this._name
  }
  getData(): ArrayBufferView {
    return this._value
  }
  getTupleType(): HdTupleType {
    return { type: HdType.HdTypeUInt32Vec2, count: this._value.length }
  }
  getNumElements(): number {
    return 1
  }
  getBufferSpecs(): HdBufferSpec[] {
    return [{ name: this._name, tupleType: this.getTupleType() }]
  }
  protected _checkValid(): boolean {
    return true
  }
}

type _Typed =
  | { type: 'uv', textures: HdStUvTextureObject[], samplers: HdStUvSamplerObject[] }
  | { type: 'field', textures: HdStFieldTextureObject[], samplers: HdStFieldSamplerObject[] }
  | { type: 'ptex', textures: HdStPtexTextureObject[], samplers: HdStPtexSamplerObject[] }
  | { type: 'udim', textures: HdStUdimTextureObject[], samplers: HdStUdimSamplerObject[] }

/** textureBinder.cpp:470-512 _CastAndCompute<textureType>: the typed
 *  texture and sampler objects of a named texture handle, or null after a
 *  coding error. */
function _Cast(namedTextureHandle: HdStShaderCodeNamedTextureHandle): _Typed | null {
  const kind = ((): _Typed['type'] => {
    switch (namedTextureHandle.type) {
      case HdStTextureType.Uv:
      case HdStTextureType.Cubemap:
        return 'uv'
      case HdStTextureType.Field:
        return 'field'
      case HdStTextureType.Ptex:
        return 'ptex'
      case HdStTextureType.Udim:
        return 'udim'
    }
  })()
  const textureClass = { uv: HdStUvTextureObject, field: HdStFieldTextureObject,
    ptex: HdStPtexTextureObject, udim: HdStUdimTextureObject }[kind]
  const samplerClass = { uv: HdStUvSamplerObject, field: HdStFieldSamplerObject,
    ptex: HdStPtexSamplerObject, udim: HdStUdimSamplerObject }[kind]

  const textures: unknown[] = []
  const samplers: unknown[] = []
  for (const tex of namedTextureHandle.handles) {
    if (!tex) {
      TF_CODING_ERROR('Invalid texture handle in texture binder.')
      return null
    }
    const typedTexture = tex.getTextureObject()
    if (!(typedTexture instanceof textureClass)) {
      TF_CODING_ERROR('Bad texture object')
      return null
    }
    textures.push(typedTexture)

    const typedSampler = tex.getSamplerObject()
    if (!(typedSampler instanceof samplerClass)) {
      TF_CODING_ERROR('Bad sampler object')
      return null
    }
    samplers.push(typedSampler)
  }
  return { type: kind, textures, samplers } as _Typed
}

function _Sampler(s: HgiSamplerHandle): HgiSamplerHandle {
  return s
}

/** textureBinder.h:24-80. A class helping HdStShaderCode with binding
 *  textures.
 *
 *  This class helps binding textures or populating the shader bar with
 *  texture sampler handles if bindless textures are used. It also includes
 *  writing texture metadata such as the sampling transform to the shader
 *  bar. */
export class HdSt_TextureBinder {
  /** textureBinder.cpp:26-86. Add buffer specs necessary for the textures
   *  (e.g., for bindless texture sampler handles or sampling transform). */
  static getBufferSpecs(
    textures: readonly HdStShaderCodeNamedTextureHandle[],
    specs: HdBufferSpec[],
    doublesSupported: boolean,
  ): void {
    const useBindlessHandles = textures.length === 0 ? false :
      textures[0]!.handles[0]!.useBindlessHandles()

    for (const texture of textures) {
      switch (texture.type) {
        case HdStTextureType.Uv:
        case HdStTextureType.Cubemap:
          if (useBindlessHandles) {
            specs.push({ name: texture.name,
              tupleType: { type: HdType.HdTypeUInt32Vec2, count: texture.handles.length } })
          }
          specs.push({ name: _Concat(texture.name, HdSt_ResourceBindingSuffixTokens.valid),
            tupleType: { type: HdType.HdTypeBool, count: 1 } })
          break
        case HdStTextureType.Field:
          if (useBindlessHandles) {
            specs.push({ name: texture.name,
              tupleType: { type: HdType.HdTypeUInt32Vec2, count: texture.handles.length } })
          }
          specs.push({ name: _Concat(texture.name, HdSt_ResourceBindingSuffixTokens.valid),
            tupleType: { type: HdType.HdTypeBool, count: 1 } })
          specs.push({
            name: _Concat(texture.name, HdSt_ResourceBindingSuffixTokens.samplingTransform),
            tupleType: { type: doublesSupported ? HdType.HdTypeDoubleMat4 : HdType.HdTypeFloatMat4,
              count: 1 },
          })
          break
        case HdStTextureType.Ptex:
        case HdStTextureType.Udim:
          if (useBindlessHandles) {
            specs.push({ name: texture.name,
              tupleType: { type: HdType.HdTypeUInt32Vec2, count: texture.handles.length } })
            specs.push({ name: _Concat(texture.name, HdSt_ResourceBindingSuffixTokens.layout),
              tupleType: { type: HdType.HdTypeUInt32Vec2, count: texture.handles.length } })
          }
          specs.push({ name: _Concat(texture.name, HdSt_ResourceBindingSuffixTokens.valid),
            tupleType: { type: HdType.HdTypeBool, count: 1 } })
          break
      }
    }
  }

  /** textureBinder.cpp:543-554. Compute buffer sources for shader bar.
   *
   *  This works in conjunction with GetBufferSpecs, but unlike
   *  GetBufferSpecs is extracting information from the texture handles and
   *  thus can only be called after the textures have been committed in
   *  HdStShaderCode::AddResourcesFromTextures(). */
  static computeBufferSources(
    textures: readonly HdStShaderCodeNamedTextureHandle[],
    sources: HdBufferSource[],
    doublesSupported: boolean,
  ): void {
    const useBindlessHandles = textures.length === 0 ? false :
      textures[0]!.handles[0]!.useBindlessHandles()

    for (const namedTextureHandle of textures) {
      const typed = _Cast(namedTextureHandle)
      if (!typed) continue
      const name = namedTextureHandle.name
      // textureBinder.cpp:133-299 _ComputeBufferSourcesFunctor
      if (useBindlessHandles) {
        const bindlessHandles: bigint[] = []
        const bindlessLayoutHandles: bigint[] = []
        for (let i = 0; i < typed.textures.length; i++) {
          switch (typed.type) {
            case 'uv':
            case 'field':
              bindlessHandles.push(HdSt_ResourceBinder.getSamplerBindlessHandle(
                _Sampler(typed.samplers[i]!.getSampler()), typed.textures[i]!.getTexture()))
              break
            case 'ptex':
            case 'udim':
              bindlessHandles.push(HdSt_ResourceBinder.getSamplerBindlessHandle(
                _Sampler(typed.samplers[i]!.getTexelsSampler()),
                typed.textures[i]!.getTexelTexture()))
              bindlessLayoutHandles.push(HdSt_ResourceBinder.getTextureBindlessHandle(
                typed.textures[i]!.getLayoutTexture()))
              break
          }
        }
        sources.push(new HdSt_BindlessSamplerBufferSource(name, bindlessHandles))
        if (typed.type === 'ptex' || typed.type === 'udim') {
          sources.push(new HdSt_BindlessSamplerBufferSource(
            _Concat(name, HdSt_ResourceBindingSuffixTokens.layout), bindlessLayoutHandles))
        }
      }

      sources.push(new HdVtBufferSource(
        _Concat(name, HdSt_ResourceBindingSuffixTokens.valid),
        VtValue.create(typed.textures[0]!.isValid(), VtValueTypes.bool)))

      if (typed.type === 'field') {
        sources.push(new HdVtBufferSource(
          _Concat(name, HdSt_ResourceBindingSuffixTokens.samplingTransform),
          VtValue.create(typed.textures[0]!.getSamplingTransform(), VtValueTypes.GfMatrix4d),
          1,
          doublesSupported))
      }
    }
  }

  /** textureBinder.cpp:556-562. Bind textures. */
  static bindResources(
    binder: HdSt_ResourceBinder,
    textures: readonly HdStShaderCodeNamedTextureHandle[],
  ): void {
    HdSt_TextureBinder._bind(binder, textures, /* bind = */ true)
  }

  /** textureBinder.cpp:564-570. Unbind textures. */
  static unbindResources(
    binder: HdSt_ResourceBinder,
    textures: readonly HdStShaderCodeNamedTextureHandle[],
  ): void {
    HdSt_TextureBinder._bind(binder, textures, /* bind = */ false)
  }

  /** textureBinder.cpp:301-376 _BindFunctor */
  private static _bind(
    binder: HdSt_ResourceBinder,
    textures: readonly HdStShaderCodeNamedTextureHandle[],
    bind: boolean,
  ): void {
    for (const namedTextureHandle of textures) {
      const typed = _Cast(namedTextureHandle)
      if (!typed) continue
      const name = namedTextureHandle.name
      switch (typed.type) {
        case 'uv':
        case 'field': {
          const textureHandles: HgiTextureHandle[] = []
          const samplerHandles: HgiSamplerHandle[] = []
          for (let i = 0; i < typed.textures.length; i++) {
            textureHandles.push(typed.textures[i]!.getTexture())
            samplerHandles.push(_Sampler(typed.samplers[i]!.getSampler()))
          }
          binder.bindTextures(name, samplerHandles, textureHandles, bind)
          break
        }
        case 'ptex':
        case 'udim': {
          const textureHandles: HgiTextureHandle[] = []
          const layoutTextureHandles: HgiTextureHandle[] = []
          const samplerHandles: HgiSamplerHandle[] = []
          const layoutSamplerHandles: HgiSamplerHandle[] = []
          for (let i = 0; i < typed.textures.length; i++) {
            textureHandles.push(typed.textures[i]!.getTexelTexture())
            layoutTextureHandles.push(typed.textures[i]!.getLayoutTexture())
            samplerHandles.push(_Sampler(typed.samplers[i]!.getTexelsSampler()))
            layoutSamplerHandles.push(_Sampler(typed.samplers[i]!.getLayoutSampler()))
          }
          binder.bindTexturesWithLayout(name, samplerHandles, textureHandles,
            layoutSamplerHandles, layoutTextureHandles, bind)
          break
        }
      }
    }
  }

  /** textureBinder.cpp:572-579 and the _BindingDescsFunctor
   *  (textureBinder.cpp:378-468). Get binding descs. */
  static getBindingDescs(
    binder: HdSt_ResourceBinder,
    bindingsDesc: HgiResourceBindingsDesc,
    textures: readonly HdStShaderCodeNamedTextureHandle[],
  ): void {
    for (const namedTextureHandle of textures) {
      const typed = _Cast(namedTextureHandle)
      if (!typed) continue
      const name = namedTextureHandle.name
      switch (typed.type) {
        case 'uv':
        case 'field': {
          const textureHandles: HgiTextureHandle[] = []
          const samplerHandles: HgiSamplerHandle[] = []
          for (let i = 0; i < typed.textures.length; i++) {
            textureHandles.push(typed.textures[i]!.getTexture())
            samplerHandles.push(_Sampler(typed.samplers[i]!.getSampler()))
          }
          binder.getTextureBindingDescs(bindingsDesc, name, samplerHandles, textureHandles)
          break
        }
        case 'ptex':
        case 'udim': {
          const textureHandles: HgiTextureHandle[] = []
          const layoutTextureHandles: HgiTextureHandle[] = []
          const samplerHandles: HgiSamplerHandle[] = []
          const layoutSamplerHandles: HgiSamplerHandle[] = []
          for (let i = 0; i < typed.textures.length; i++) {
            textureHandles.push(typed.textures[i]!.getTexelTexture())
            layoutTextureHandles.push(typed.textures[i]!.getLayoutTexture())
            samplerHandles.push(_Sampler(typed.samplers[i]!.getTexelsSampler()))
            layoutSamplerHandles.push(_Sampler(typed.samplers[i]!.getLayoutSampler()))
          }
          binder.getTextureWithLayoutBindingDescs(bindingsDesc, name, samplerHandles,
            textureHandles, layoutSamplerHandles, layoutTextureHandles)
          break
        }
      }
    }
  }
}
