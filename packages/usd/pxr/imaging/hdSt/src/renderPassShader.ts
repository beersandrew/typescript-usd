// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderPassShader.cpp,
//  pxr/imaging/hdSt/renderPassShader.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/renderPassShader.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences (each also noted at its site):
// - The three constructors (renderPassShader.h:31-38) are one constructor
//   taking nothing, a glslfx file token, or an HioGlslfx.
// - std::map<TfToken, HdStBindingRequest> _customBuffers is a Map iterated
//   in sorted key order, as std::map is ("Lexicographic ordering for stable
//   output between runs").
// - Texture handle lifetime: handles this shader drops are Release()d
//   (textureHandle.ts header).

import { Token as TfToken, HashCombine as TfHashCombine, Hash as TfHash } from 'typescript-usd/tf'
import {
  BorderColor as HdBorderColor,
  CompareFunction as HdCompareFunction,
  MagFilter as HdMagFilter,
  MinFilter as HdMinFilter,
  PrimTypeTokens as HdPrimTypeTokens,
  SamplerParameters as HdSamplerParameters,
  Wrap as HdWrap,
  type RenderIndex as HdRenderIndex,
  type RenderPassAovBinding as HdRenderPassAovBinding,
} from 'typescript-usd/hd'
import { Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { HioGlslfx, HioGlslfxInputStream } from 'typescript-usd/hio'
import type { HdStBindingRequest } from './binding.ts'
import { HdSt_MaterialParam } from './materialParam.ts'
import { HdStRenderBuffer } from './renderBuffer.ts'
import { HdStTextureType } from './enums.ts'
import type { HdStTextureIdentifier } from './textureIdentifier.ts'
import { HdStPackageRenderPassShader } from './package.ts'
import { HdSt_RenderPassShaderKey } from './renderPassShaderKey.ts'
import type { HdSt_ResourceBinder } from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdStShaderCode,
  type HdStShaderCodeID,
  type HdStShaderCodeNamedTextureHandle,
} from './shaderCode.ts'
import { HdSt_TextureBinder } from './textureBinder.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** HdInstance<HdStRenderPassShaderSharedPtr> (hd/instanceRegistry.h) */
interface _RenderPassShaderInstance {
  isFirstInstance(): boolean
  setValue(value: HdStRenderPassShader): void
  GetValue(): HdStRenderPassShader | null
}

/** renderPassShader.cpp:33-38 */
interface _NamedTextureIdentifier {
  name: TfToken
  id: HdStTextureIdentifier
}

/** renderPassShader.cpp:40-44 */
function _GetInputName(aovName: TfToken): TfToken {
  return TfToken(aovName + 'Readback')
}

/** renderPassShader.cpp:46-71. An AOV is backed by a render buffer. And
 *  Storm backs a render buffer by a texture. The identifier for this texture
 *  can be obtained from the HdStRenderBuffer. */
function _GetNamedTextureIdentifiers(
  aovInputBindings: readonly HdRenderPassAovBinding[],
  renderIndex: HdRenderIndex,
): _NamedTextureIdentifier[] {
  const result: _NamedTextureIdentifier[] = []

  for (const aovBinding of aovInputBindings) {
    const renderBuffer = renderIndex.getBprim(
      HdPrimTypeTokens.renderBuffer, aovBinding.renderBufferId)
    if (renderBuffer instanceof HdStRenderBuffer) {
      result.push({
        name: _GetInputName(TfToken(aovBinding.aovName)),
        id: renderBuffer.GetTextureIdentifier(/* multiSampled = */ false),
      })
    }
  }

  return result
}

/** renderPassShader.cpp:73-104. Check whether the given named texture
 *  handles match the given named texture identifiers. */
function _AreHandlesValid(
  namedTextureHandles: readonly HdStShaderCodeNamedTextureHandle[],
  namedTextureIdentifiers: readonly _NamedTextureIdentifier[],
): boolean {
  if (namedTextureHandles.length !== namedTextureIdentifiers.length) {
    return false
  }

  for (let i = 0; i < namedTextureHandles.length; i++) {
    const namedTextureHandle = namedTextureHandles[i]!
    const namedTextureIdentifier = namedTextureIdentifiers[i]!

    if (namedTextureHandle.name !== namedTextureIdentifier.name) {
      return false
    }
    if (namedTextureHandle.handles.length > 1) {
      TF_CODING_ERROR("Don't support array of textures for AOV textures")
    }
    const textureObject = namedTextureHandle.handles[0]!.getTextureObject()
    if (!textureObject.GetTextureIdentifier().equals(namedTextureIdentifier.id)) {
      return false
    }
  }

  return true
}

/** renderPassShader.cpp:299-303 (the function-static sampler parameters). */
const _aovSamplerParameters = new HdSamplerParameters(
  HdWrap.HdWrapClamp, HdWrap.HdWrapClamp, HdWrap.HdWrapClamp,
  HdMinFilter.HdMinFilterNearest, HdMagFilter.HdMagFilterNearest,
  HdBorderColor.HdBorderColorTransparentBlack, /*enableCompare*/false,
  HdCompareFunction.HdCmpFuncNever, /*maxAnisotropy*/1)

/** renderPassShader.h:30-117. A shader that supports common renderPass
 *  functionality. */
export class HdStRenderPassShader extends HdStShaderCode {
  private _glslfx: HioGlslfx
  private _hash: HdStShaderCodeID
  private _hashValid: boolean

  // Lexicographic ordering for stable output between runs.
  private _customBuffers = new Map<TfToken, HdStBindingRequest>()
  private _namedTextureHandles: HdStShaderCodeNamedTextureHandle[] = []
  private _params: HdSt_MaterialParam[] = []

  /** renderPassShader.cpp:113-131 */
  constructor(glslfxFileOrGlslfx?: TfToken | HioGlslfx) {
    super()
    if (glslfxFileOrGlslfx === undefined) {
      // renderPassShader.cpp:113-116
      glslfxFileOrGlslfx = HdStPackageRenderPassShader()
    }
    this._glslfx = typeof glslfxFileOrGlslfx === 'string'
      ? new HioGlslfx(glslfxFileOrGlslfx)
      : glslfxFileOrGlslfx
    this._hash = 0n
    this._hashValid = false
  }

  /** renderPassShader.cpp:136-141 */
  protected override _getGlslfx(): HioGlslfx | null {
    return this._glslfx
  }

  /** _customBuffers in std::map order. */
  private _sortedCustomBuffers(): HdStBindingRequest[] {
    return [...this._customBuffers.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map(k => this._customBuffers.get(k)!)
  }

  /** renderPassShader.cpp:143-170 */
  override computeHash(): HdStShaderCodeID {
    // if nothing changed, returns the cached hash value
    if (this._hashValid) return this._hash

    this._hash = TfHash(this._glslfx.getHash())

    // cullFaces are dynamic, no need to put in the hash.

    // Custom buffer bindings may vary over time, requiring invalidation
    // of down stream clients.
    for (const req of this._sortedCustomBuffers()) {
      this._hash = TfHashCombine(this._hash, req.computeHash())
    }

    for (const namedHandle of this._namedTextureHandles) {
      // Use name and hash only - not the texture itself as this
      // does not affect the generated shader source.
      this._hash = TfHashCombine(this._hash, namedHandle.name, namedHandle.hash)
    }

    this._hashValid = true

    return this._hash
  }

  /** renderPassShader.cpp:172-180 */
  override getSource(shaderStageKey: TfToken): string {
    return this._glslfx.getSource(shaderStageKey)
  }

  /** renderPassShader.cpp:182-192 */
  override bindResources(_program: number, binder: HdSt_ResourceBinder): void {
    for (const req of this._sortedCustomBuffers()) {
      binder.bind(req)
    }

    HdSt_TextureBinder.bindResources(binder, this._namedTextureHandles)
  }

  /** renderPassShader.cpp:194-204 */
  override unbindResources(_program: number, binder: HdSt_ResourceBinder): void {
    for (const req of this._sortedCustomBuffers()) {
      binder.unbind(req)
    }

    HdSt_TextureBinder.unbindResources(binder, this._namedTextureHandles)
  }

  /** renderPassShader.cpp:206-211. Add a custom binding request for use
   *  when this shader executes. */
  addBufferBinding(req: HdStBindingRequest): void {
    this._customBuffers.set(req.getName(), req)
    this._hashValid = false
  }

  /** renderPassShader.cpp:213-218. Remove `name` from custom binding. */
  removeBufferBinding(name: TfToken): void {
    this._customBuffers.delete(name)
    this._hashValid = false
  }

  /** renderPassShader.cpp:220-225. Clear all custom bindings associated
   *  with this shader. */
  clearBufferBindings(): void {
    this._customBuffers.clear()
    this._hashValid = false
  }

  /** renderPassShader.cpp:227-257 */
  override addBindings(customBindings: HdStBindingRequest[]): void {
    // note: be careful, the logic behind this function is tricky.
    //
    // customBindings will be used for two purpose.
    //   1. resouceBinder assigned the binding location and use it
    //      in Bind/UnbindResources. The resourceBinder is held by
    //      drawingProgram in each batch in the renderPass.
    //   2. codeGen generates macros to fill the placeholder of binding location
    //      in glslfx file.
    //
    // To make RenderPassShader work on DrawBatch::Execute(), _customBuffers and
    // other resources should be bound to the right binding locations which were
    // resolved at the compilation time of the drawingProgram.
    //
    // However, if we have 2 or more renderPassStates and if they all share
    // the same shader hash signature, drawingProgram will only be constructed
    // at the first renderPassState and then be reused for the subsequent
    // renderPassStates, because the shaderHash matches in
    // Hd_DrawBatch::_GetDrawingProgram().
    //
    // The shader hash computation must guarantee the consistency such that the
    // resourceBinder held in the drawingProgram is applicable to all other
    // renderPassStates as long as the hash matches.
    //
    for (const req of this._sortedCustomBuffers()) {
      customBindings.push(req)
    }
  }

  /** renderPassShader.cpp:259-263 */
  override getParams(): readonly HdSt_MaterialParam[] {
    return this._params
  }

  /** renderPassShader.cpp:265-269 */
  override getNamedTextureHandles(): readonly HdStShaderCodeNamedTextureHandle[] {
    return this._namedTextureHandles
  }

  /** renderPassShader.cpp:271-332. Sets the textures and params such that
   *  the shader can access the requested aovs with HdGet_AOVNAMEReadback().
   *
   *  Needs to be called in task prepare or sync since it is allocating
   *  texture handles. */
  updateAovInputTextures(
    aovInputBindings: readonly HdRenderPassAovBinding[],
    renderIndex: HdRenderIndex,
  ): void {
    // Compute the identifiers for the textures backing the requested
    // (resolved) AOVs.
    const namedTextureIdentifiers =
      _GetNamedTextureIdentifiers(aovInputBindings, renderIndex)
    // If the (named) texture handles are up-to-date, there is nothing to do.
    if (_AreHandlesValid(this._namedTextureHandles, namedTextureIdentifiers)) {
      return
    }

    this._hashValid = false

    // Otherwise, we need to (re-)allocate texture handles for the
    // given texture identifiers.
    for (const namedHandle of this._namedTextureHandles) {
      for (const handle of namedHandle.handles) handle.release()
    }
    this._namedTextureHandles = []
    this._params = []

    const resourceRegistry = renderIndex.getResourceRegistry() as HdStResourceRegistry | undefined
    if (!TF_VERIFY(resourceRegistry && typeof resourceRegistry.allocateTextureHandle === 'function')) {
      return
    }

    for (const namedTextureIdentifier of namedTextureIdentifiers) {
      // Allocate texture handle for given identifier.
      const textureHandle =
        resourceRegistry!.allocateTextureHandle(
          namedTextureIdentifier.id,
          HdStTextureType.Uv,
          _aovSamplerParameters,
          /* memoryRequest = */ 0,
          this)
      if (!textureHandle) {
        continue
      }
      // Add to _namedTextureHandles so that the texture will
      // be bound to the shader in BindResources.
      this._namedTextureHandles.push({
        name: namedTextureIdentifier.name,
        type: HdStTextureType.Uv,
        handles: [textureHandle],
        hash: 0n,
      })

      // Add a corresponding param so that codegen is
      // generating the accessor HdGet_AOVNAMEReadback().
      this._params.push(new HdSt_MaterialParam(
        HdSt_MaterialParam.ParamTypeTexture,
        namedTextureIdentifier.name,
        VtValue.create(new GfVec4f(0, 0, 0, 0), VtValueTypes.GfVec4f)))
    }
  }

  /** renderPassShader.cpp:356-377 */
  static createRenderPassShaderFromAovs(
    renderPassState: object,
    resourceRegistry: HdStResourceRegistry,
    aovBindings: readonly HdRenderPassAovBinding[],
  ): HdStRenderPassShader | null {
    const renderPassShaderInstance: _RenderPassShaderInstance =
      resourceRegistry.registerRenderPassShader(
        _GetRenderPassShaderHash(aovBindings, renderPassState))

    if (renderPassShaderInstance.isFirstInstance()) {
      const shaderKey = new HdSt_RenderPassShaderKey(aovBindings)
      // std::istringstream s(shaderKey.GetGlslfxString());
      const glslfx = new HioGlslfx(new HioGlslfxInputStream(shaderKey.getGlslfxString()))

      renderPassShaderInstance.setValue(
        new HdStRenderPassShader(glslfx))
    }

    return renderPassShaderInstance.GetValue()
  }
}
export type HdStRenderPassShaderSharedPtr = HdStRenderPassShader

// renderPassShader.cpp:334-354: identity of each HdStRenderPassState for
// the hash (upstream hashes the pointer).
const _renderPassStateIds = new WeakMap<object, number>()
let _nextRenderPassStateId = 1

/** renderPassShader.cpp:334-354 */
function _GetRenderPassShaderHash(
  aovBindings: readonly HdRenderPassAovBinding[],
  renderPassState: object,
): bigint {
  let hash = 0n

  // Aov binding names determine the configuration of the render pass shader
  // key.
  for (const aovBinding of aovBindings) {
    hash = TfHashCombine(hash, aovBinding.aovName)
  }

  // We want each renderPassState to have its own renderPassShader, so
  // include renderPassState in the hash.
  let id = _renderPassStateIds.get(renderPassState)
  if (id === undefined) {
    id = _nextRenderPassStateId++
    _renderPassStateIds.set(renderPassState, id)
  }
  hash = TfHashCombine(hash, id)

  return hash
}
