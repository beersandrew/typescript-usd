// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/materialNetworkShader.cpp,
//  pxr/imaging/hdSt/materialNetworkShader.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/materialNetworkShader.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences (each also noted at its site):
// - ID is a bigint; the hashes are cache keys only. ArchHash of the sources
//   (materialNetworkShader.cpp:174-177) is TfHash of the same strings.
// - SetNamedTextureHandles releases the handles it no longer holds (the
//   shared pointers dropped with the old vector, textureHandle.ts header).
// - Lifetime (PLATFORM-DIVERGENCE(hd-bar-shared-ptr), hd/src/bufferArrayRange.ts):
//   upstream shaders are shared_ptrs held by their HdStMaterial and by the
//   HdStDrawItems drawing with them. Those holders call _retain() and
//   release() here; when the last one releases, _destroy() runs the
//   destructor: the texture handles and the parameter range are dropped and
//   the weak pointers to the shader (`_expired`, shaderCode.ts) stop
//   locking. A shader no holder retained (a fallback shader) is never
//   destroyed. The draw batches' programs also hold the shader upstream;
//   they are not counted (they are rebuilt before they draw again).

import {
  Token as TfToken,
  MakeTokens as TfMakeTokens,
  HashCombine as TfHashCombine,
  Hash as TfHash,
  TfEnvSetting,
  TfGetEnvSetting,
} from 'typescript-usd/tf'
import { Vec3f as GfVec3f, Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes, Array as VtArray } from 'typescript-usd/vt'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  ShaderTokens as HdShaderTokens,
  Tokens as HdTokens,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import type { HdStBindingRequest } from './binding.ts'
import { HdSt_MaterialParam } from './materialParam.ts'
import { HdSt_ResourceBindingSuffixTokens, type HdSt_ResourceBinder } from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdStShaderCode,
  type HdStShaderCodeID,
  type HdStShaderCodeNamedTextureHandle,
  type HdStShaderCodeResourceContext,
} from './shaderCode.ts'
import { HdSt_TextureBinder } from './textureBinder.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** materialNetworkShader.cpp:29-30 */
const HDST_ENABLE_MATERIAL_PRIMVAR_FILTERING = new TfEnvSetting<boolean>(
  'HDST_ENABLE_MATERIAL_PRIMVAR_FILTERING', true,
  'Enables filtering of primvar signals by material binding.')

/** materialNetworkShader.cpp:32-35 */
function _IsEnabledMaterialPrimvarFiltering(): boolean {
  return TfGetEnvSetting(HDST_ENABLE_MATERIAL_PRIMVAR_FILTERING)
}

/** materialNetworkShader.h:30-171. A scene-based material network shader.
 *  This is the shader used for materials authored on prims in the scene. */
export class HdSt_MaterialNetworkShader extends HdStShaderCode {
  private _fragmentSource = ''
  private _displacementSource = ''

  // Shader Parameters
  private _params: HdSt_MaterialParam[] = []
  private _paramSpec: HdBufferSpec[] = []
  private _paramArray: HdBufferArrayRange | null = null
  private _primvarNames: TfToken[]
  private _isEnabledPrimvarFiltering: boolean
  private _paramToDefValue = new Map<TfToken, VtValue>()

  private _computedHash: HdStShaderCodeID = 0n
  private _isValidComputedHash = false
  private _computedTextureSourceHash: HdStShaderCodeID = 0n
  private _isValidComputedTextureSourceHash = false

  private _namedTextureHandles: HdStShaderCodeNamedTextureHandle[] = []

  private _materialTag: TfToken = TfToken()

  private _holders = 0

  /** A holder copies the shared_ptr (see the header). */
  _retain(): this {
    ++this._holders
    return this
  }

  /** A holder drops its shared_ptr; the last one destroys the shader (see
   *  the header). */
  release(): void {
    if (!TF_VERIFY(this._holders > 0, 'HdSt_MaterialNetworkShader released too often')) return
    if (--this._holders === 0) this._destroy()
  }

  /** The destructor: the members' shared_ptrs go with the shader. */
  protected _destroy(): void {
    this._expired = true
    for (const named of this._namedTextureHandles) {
      for (const handle of named.handles) handle.release()
    }
    this._namedTextureHandles = []
    this._setParamArray(null)
  }

  private _setParamArray(range: HdBufferArrayRange | null): void {
    if (this._paramArray === range) return
    range?._retain()
    this._paramArray?.release()
    this._paramArray = range
  }

  /** materialNetworkShader.cpp:40-54 */
  constructor() {
    super()
    this._primvarNames = _CollectPrimvarNames(this._params)
    this._isEnabledPrimvarFiltering = _IsEnabledMaterialPrimvarFiltering()
  }

  /** materialNetworkShader.cpp:58-69 */
  protected _setSource(shaderStageKey: TfToken, source: string): void {
    if (shaderStageKey === HdShaderTokens.fragmentShader) {
      this._fragmentSource = source
      this._isValidComputedHash = false
    } else if (shaderStageKey === HdShaderTokens.displacementShader) {
      this._displacementSource = source
      this._isValidComputedHash = false
    }
  }

  // ---------------------------------------------------------------------- //
  // HdShader Virtual Interface                                             //
  // ---------------------------------------------------------------------- //

  /** materialNetworkShader.cpp:75-86 */
  override getSource(shaderStageKey: TfToken): string {
    if (shaderStageKey === HdShaderTokens.fragmentShader) {
      return this._fragmentSource
    } else if (shaderStageKey === HdShaderTokens.displacementShader) {
      return this._displacementSource
    }

    return ''
  }

  /** materialNetworkShader.cpp:87-92 */
  override getParams(): readonly HdSt_MaterialParam[] {
    return this._params
  }

  /** materialNetworkShader.cpp:93-98 */
  setEnabledPrimvarFiltering(enabled: boolean): void {
    this._isEnabledPrimvarFiltering =
      enabled && _IsEnabledMaterialPrimvarFiltering()
  }

  /** materialNetworkShader.cpp:99-104 */
  override isEnabledPrimvarFiltering(): boolean {
    return this._isEnabledPrimvarFiltering
  }

  /** materialNetworkShader.cpp:105-110 */
  override getPrimvarNames(): readonly TfToken[] {
    return this._primvarNames
  }

  /** materialNetworkShader.cpp:111-116 */
  override getShaderData(): HdBufferArrayRange | null {
    return this._paramArray
  }

  /** materialNetworkShader.cpp:118-122 */
  override getNamedTextureHandles(): readonly HdStShaderCodeNamedTextureHandle[] {
    return this._namedTextureHandles
  }

  /** materialNetworkShader.cpp:124-130 */
  override bindResources(_program: number, binder: HdSt_ResourceBinder): void {
    HdSt_TextureBinder.bindResources(binder, this._namedTextureHandles)
  }

  /** materialNetworkShader.cpp:131-137 */
  override unbindResources(_program: number, binder: HdSt_ResourceBinder): void {
    HdSt_TextureBinder.unbindResources(binder, this._namedTextureHandles)
  }

  /** materialNetworkShader.cpp:138-143 */
  override addBindings(_customBindings: HdStBindingRequest[]): void {
  }

  /** materialNetworkShader.cpp:145-155 */
  override computeHash(): HdStShaderCodeID {
    // All mutator methods that might affect the hash must reset this (fragile).
    if (!this._isValidComputedHash) {
      this._computedHash = this._computeHash()
      this._isValidComputedHash = true
    }
    return this._computedHash
  }

  /** materialNetworkShader.cpp:157-166 */
  override computeTextureSourceHash(): HdStShaderCodeID {
    if (!this._isValidComputedTextureSourceHash) {
      this._computedTextureSourceHash = this._computeTextureSourceHash()
      this._isValidComputedTextureSourceHash = true
    }
    return this._computedTextureSourceHash
  }

  /** materialNetworkShader.cpp:168-187 */
  protected _computeHash(): HdStShaderCodeID {
    let hash = HdSt_MaterialParam.computeHash(this._params)

    hash = TfHashCombine(hash,
      TfHash(this._fragmentSource),
      TfHash(this._displacementSource),
    )

    // Codegen is inspecting the shader bar spec to generate some
    // of the struct's, so we should probably use _paramSpec
    // in the hash computation as well.
    //
    // In practise, _paramSpec is generated from the
    // HdSt_MaterialParam's so the above is sufficient.

    return hash
  }

  /** materialNetworkShader.cpp:189-215 */
  protected _computeTextureSourceHash(): HdStShaderCodeID {
    // To avoid excessive plumbing and checking of HgiCapabilities in order to
    // determine if bindless textures are enabled, we make things a little
    // easier for ourselves by having this function check and return 0 if
    // using bindless textures.
    const useBindlessHandles = this._namedTextureHandles.length > 0 &&
      this._namedTextureHandles[0]!.handles[0]!.useBindlessHandles()

    if (useBindlessHandles) {
      return 0n
    }

    let hash = 0n

    for (const namedHandle of this._namedTextureHandles) {
      // Use name, texture object and sampling parameters.
      hash = TfHashCombine(hash, namedHandle.name, namedHandle.hash)
    }

    return hash
  }

  /** materialNetworkShader.cpp:217-222. Setter method for prim. */
  setFragmentSource(source: string): void {
    this._fragmentSource = source
    this._isValidComputedHash = false
  }

  /** materialNetworkShader.cpp:224-229 */
  setDisplacementSource(source: string): void {
    this._displacementSource = source
    this._isValidComputedHash = false
  }

  /** materialNetworkShader.cpp:231-242 */
  setParams(params: readonly HdSt_MaterialParam[]): void {
    this._params = [...params]
    this._primvarNames = _CollectPrimvarNames(this._params)
    for (const param of params) {
      if (!param.fallbackValue.IsEmpty()) {
        this._paramToDefValue.set(param.name, param.fallbackValue)
      }
    }
    this._isValidComputedHash = false
  }

  /** materialNetworkShader.cpp:244-250 */
  setNamedTextureHandles(namedTextureHandles: readonly HdStShaderCodeNamedTextureHandle[]): void {
    // The old vector's handles are dropped (see the header).
    const kept = new Set(namedTextureHandles.flatMap((h) => h.handles))
    for (const old of this._namedTextureHandles) {
      for (const handle of old.handles) {
        if (!kept.has(handle)) handle.release()
      }
    }
    this._namedTextureHandles = [...namedTextureHandles]
    this._isValidComputedTextureSourceHash = false
  }

  /** materialNetworkShader.cpp:252-292 */
  setBufferSources(
    bufferSpecs: readonly HdBufferSpec[],
    bufferSources: HdBufferSource[],
    resourceRegistry: HdStResourceRegistry,
  ): void {
    if (bufferSpecs.length === 0) {
      if (this._paramSpec.length !== 0) {
        this._isValidComputedHash = false
      }

      this._paramSpec = []
      this._setParamArray(null)
    } else {
      if (!this._paramArray || !_SpecsEqual(this._paramSpec, bufferSpecs)) {
        this._paramSpec = [...bufferSpecs]

        // establish a buffer range
        const range: HdBufferArrayRange | null =
          resourceRegistry.allocateShaderStorageBufferArrayRange(
            HdTokens.materialParams,
            bufferSpecs,
            HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)

        if (!TF_VERIFY(range!.isValid())) {
          this._setParamArray(null)
        } else {
          this._setParamArray(range)
        }
        this._isValidComputedHash = false
      }

      if (this._paramArray && this._paramArray.isValid()) {
        if (bufferSources.length !== 0) {
          resourceRegistry.addSources(this._paramArray, bufferSources)
        }
      }
    }
  }

  /** materialNetworkShader.cpp:294-298 */
  override getMaterialTag(): TfToken {
    return this._materialTag
  }

  /** materialNetworkShader.cpp:300-305 */
  setMaterialTag(tag: TfToken): void {
    this._materialTag = tag
    this._isValidComputedHash = false
  }

  /** materialNetworkShader.cpp:307-312. If the prim is based on asset,
   *  reload that asset. */
  reload(): void {
    // Nothing to do, this shader's sources are externally managed.
  }

  /** materialNetworkShader.cpp:375-385 */
  getFallbackValueForParam(paramName: TfToken): VtValue | null {
    const foundVal = this._paramToDefValue.get(paramName)
    if (foundVal !== undefined) {
      return foundVal
    } else {
      return _GetFallbackValueForPrimvarName(paramName)
    }
  }

  /** materialNetworkShader.cpp:442-459. Called after textures have been
   *  committed. */
  override addResourcesFromTextures(ctx: HdStShaderCodeResourceContext): void {
    const doublesSupported = ctx.getResourceRegistry().getHgi()
      .getCapabilities()!.isSet(
        HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)

    // Add buffer sources for bindless texture handles (and
    // other texture metadata such as the sampling transform for
    // a field texture).
    const result: HdBufferSource[] = []
    HdSt_TextureBinder.computeBufferSources(
      this.getNamedTextureHandles(), result, doublesSupported)

    if (result.length !== 0) {
      ctx.addSources(this.getShaderData()!, result)
    }
  }

  /** materialNetworkShader.cpp:461-473. Adds the fallback value of the given
   *  material param to buffer specs and sources using the param's name. */
  static addFallbackValueToSpecsAndSources(
    param: HdSt_MaterialParam,
    specs: HdBufferSpec[],
    sources: HdBufferSource[],
  ): void {
    const sourceName = TfToken(
      param.name +
      HdSt_ResourceBindingSuffixTokens.fallback)

    const source = new HdVtBufferSource(sourceName, param.fallbackValue)
    specs.push(...source.getBufferSpecs())
    sources.push(source)
  }
}
export type HdSt_MaterialNetworkShaderSharedPtr = HdSt_MaterialNetworkShader

/** HdBufferSpecVector operator!= (materialNetworkShader.cpp:265). */
function _SpecsEqual(a: readonly HdBufferSpec[], b: readonly HdBufferSpec[]): boolean {
  return a.length === b.length && a.every((s, i) =>
    s.name === b[i]!.name &&
    s.tupleType.type === b[i]!.tupleType.type &&
    s.tupleType.count === b[i]!.tupleType.count)
}

/** materialNetworkShader.cpp:314-335 */
const _tokens = TfMakeTokens({
  ptexFaceOffset: 'ptexFaceOffset',                   // geometric shader

  displayMetallic: 'displayMetallic',                 // simple lighting shader
  displayRoughness: 'displayRoughness',               // simple lighting shader

  hullColor: 'hullColor',                             // terminal shader
  hullOpacity: 'hullOpacity',                         // terminal shader
  scalarOverride: 'scalarOverride',                   // terminal shader
  scalarOverrideColorRamp: 'scalarOverrideColorRamp', // terminal shader
  selectedWeight: 'selectedWeight',                   // terminal shader

  indicatorColor: 'indicatorColor',                   // renderPass shader
  indicatorWeight: 'indicatorWeight',                 // renderPass shader
  overrideColor: 'overrideColor',                     // renderPass shader
  overrideWireframeColor: 'overrideWireframeColor',   // renderPass shader
  maskColor: 'maskColor',                             // renderPass shader
  maskWeight: 'maskWeight',                           // renderPass shader
  wireframeColor: 'wireframeColor',                   // renderPass shader
})

/** materialNetworkShader.cpp:337-362 */
let _primvarDefaultsMap: Map<TfToken, VtValue> | null = null
function _primvarDefaults(): Map<TfToken, VtValue> {
  if (_primvarDefaultsMap) return _primvarDefaultsMap
  const vec3f = (v: number) => VtValue.create(new GfVec3f(v, v, v), VtValueTypes.GfVec3f)
  const vec4f = (v: number) => VtValue.create(new GfVec4f(v, v, v, v), VtValueTypes.GfVec4f)
  const flt = (v: number) => VtValue.create(v, VtValueTypes.float)
  _primvarDefaultsMap = new Map<TfToken, VtValue>([
    [HdTokens.displayColor, vec3f(1.0)],
    [HdTokens.displayOpacity, flt(1.0)],

    [_tokens.ptexFaceOffset, VtValue.create(0, VtValueTypes.int)],

    [_tokens.displayMetallic, flt(0.0)],
    [_tokens.displayRoughness, flt(1.0)],

    [_tokens.hullColor, vec3f(1.0)],
    [_tokens.hullOpacity, flt(1.0)],
    [_tokens.scalarOverride, flt(1.0)],
    [_tokens.scalarOverrideColorRamp,
      VtValue.createArray(new VtArray<GfVec4f>([], VtValueTypes.GfVec4f))],
    [_tokens.selectedWeight, flt(0.0)],

    [_tokens.indicatorColor, vec4f(1.0)],
    [_tokens.indicatorWeight, flt(0.0)],
    [_tokens.overrideColor, vec4f(1.0)],
    [_tokens.maskColor, vec4f(1.0)],
    [_tokens.maskWeight, flt(0.0)],
    [_tokens.wireframeColor, vec4f(1.0)],
  ])
  return _primvarDefaultsMap
}

/** materialNetworkShader.cpp:364-373 */
function _GetFallbackValueForPrimvarName(input: TfToken): VtValue | null {
  return _primvarDefaults().get(input) ?? null
}

/** materialNetworkShader.cpp:387-415 */
function _GetExtraIncludedShaderPrimvarNames(): readonly TfToken[] {
  return [
    HdTokens.displayColor,
    HdTokens.displayOpacity,

    // Include a few ad hoc primvar names that
    // are used by the built-in material shading system.

    _tokens.ptexFaceOffset,

    _tokens.displayMetallic,
    _tokens.displayRoughness,

    _tokens.hullColor,
    _tokens.hullOpacity,
    _tokens.scalarOverride,
    _tokens.scalarOverrideColorRamp,
    _tokens.selectedWeight,

    _tokens.indicatorColor,
    _tokens.indicatorWeight,
    _tokens.overrideColor,
    _tokens.overrideWireframeColor,
    _tokens.maskColor,
    _tokens.maskWeight,
    _tokens.wireframeColor,
  ]
}

/** materialNetworkShader.cpp:417-440 */
function _CollectPrimvarNames(params: readonly HdSt_MaterialParam[]): TfToken[] {
  const primvarNames = [..._GetExtraIncludedShaderPrimvarNames()]

  for (const param of params) {
    if (param.isPrimvarRedirect()) {
      primvarNames.push(param.name)
      // primvar redirect connections are encoded as sampler coords
      primvarNames.push(...param.samplerCoords)
    } else if (param.isTexture()) {
      // include sampler coords for textures
      primvarNames.push(...param.samplerCoords)
    } else if (param.isAdditionalPrimvar()) {
      primvarNames.push(param.name)
    }
  }
  return primvarNames
}
