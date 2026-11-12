// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/shaderCode.cpp,
//  pxr/imaging/hdSt/shaderCode.h, pxr/imaging/hdSt/textureHandle.h
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/shaderCode.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - ID is a bigint (TfHash). The hashes are cache keys only.
// - Lifetime: the texture system holds shader code through weak pointers
//   (HdStShaderCodePtr, textureHandle.h:20-21). `_expired` is set by the
//   last holder of a shader code that is dropped; weak pointers to it then
//   no longer lock (the convention of hd/src/instanceRegistry.ts).

import { Token as TfToken, HashCombine as TfHashCombine } from 'typescript-usd/tf'
import { Dictionary as VtDictionary } from 'typescript-usd/vt'
import type {
  BufferArrayRange as HdBufferArrayRange,
  BufferSource as HdBufferSource,
} from 'typescript-usd/hd'
import type { HioGlslfx } from 'typescript-usd/hio'
import type { HdStBindingRequest } from './binding.ts'
import type { HdStTextureType } from './enums.ts'
import type { HdSt_MaterialParam } from './materialParam.ts'
import type { HdSt_ResourceBinder } from './resourceBinder.ts'
import type {
  HdStComputation,
  HdStComputeQueue,
  HdStResourceRegistry,
} from './resourceRegistry.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

import type { HdStTextureHandle } from './textureHandle.ts'

export type HdStShaderCodeID = bigint

/** shaderCode.h:173-196 */
export interface HdStShaderCodeNamedTextureHandle {
  /// Name by which the texture(s) will be accessed, i.e., the name
  /// of the accesor for the texture(s) will be HdGet_name(...).
  name: TfToken
  /// Equal to handle->GetTextureObject()->GetTextureType().
  /// Saved here for convenience (note that name and type
  /// completely determine the creation of the texture accesor
  /// HdGet_name(...)).
  type: HdStTextureType
  /// The texture(s). Multiple handles indicate an array of textures.
  handles: HdStTextureHandle[]
  /// A hash unique to the corresponding asset; used to
  /// split draw batches when not using bindless textures.
  hash: bigint
}
export type HdStShaderCodeNamedTextureHandleVector = HdStShaderCodeNamedTextureHandle[]

/** shaderCode.h:243-268. The context available in implementations of
 *  AddResourcesFromTextures. */
export class HdStShaderCodeResourceContext {
  private _registry: HdStResourceRegistry

  /** shaderCode.cpp:131-135 */
  constructor(registry: HdStResourceRegistry) {
    this._registry = registry
  }

  /** shaderCode.cpp:107-113 */
  addSource(range: HdBufferArrayRange, source: HdBufferSource): void {
    this._registry.addSource(range, source)
  }

  /** shaderCode.cpp:115-121 */
  addSources(range: HdBufferArrayRange, sources: HdBufferSource[]): void {
    this._registry.addSources(range, sources)
  }

  /** shaderCode.cpp:123-130 */
  addComputation(range: HdBufferArrayRange | null, computation: HdStComputation,
    queue: HdStComputeQueue): void {
    this._registry.addComputation(range, computation, queue)
  }

  /** shaderCode.h:257-259 */
  getResourceRegistry(): HdStResourceRegistry {
    return this._registry
  }
}

const _emptyParams: HdSt_MaterialParam[] = []
const _emptyTokens: TfToken[] = []
const _emptyNamedTextureHandles: HdStShaderCodeNamedTextureHandle[] = []

/** shaderCode.h:58-290. A base class representing the implementation
 *  (code) of a shader, used in conjunction with HdRenderPass. */
export abstract class HdStShaderCode {
  static readonly ResourceContext = HdStShaderCodeResourceContext

  /** Set by the last holder when the shader code is dropped (see the
   *  header). */
  _expired = false

  /** shaderCode.h:72-79. Returns the hash value of the shader code and
   *  configuration. */
  abstract computeHash(): HdStShaderCodeID

  /** shaderCode.cpp:30-40. Returns the combined hash values of multiple
   *  shaders. */
  static computeHashOfShaders(shaders: readonly HdStShaderCode[]): HdStShaderCodeID {
    let hash = 0n
    for (const it of shaders) {
      hash = TfHashCombine(hash, it.computeHash())
    }
    return hash
  }

  /** shaderCode.cpp:101-104 */
  computeTextureSourceHash(): HdStShaderCodeID {
    return 0n
  }

  /** shaderCode.h:102-104. Returns the shader source provided by this shader
   *  for `shaderStageKey`. */
  abstract getSource(shaderStageKey: TfToken): string

  /** shaderCode.cpp:144-160. Returns the resource layout for the shader
   *  stages specified by `shaderStageKeys`. */
  getLayout(shaderStageKeys: readonly TfToken[]): VtDictionary {
    const glslfx = this._getGlslfx()
    if (!glslfx) {
      return new VtDictionary()
    }

    const errorStr = { value: '' }
    const layoutAsDict =
      glslfx.getLayoutAsDictionary(shaderStageKeys, errorStr)

    if (errorStr.value.length !== 0) {
      TF_CODING_ERROR(`Error parsing GLSLFX layout:\n${errorStr.value}\n`)
    }

    return layoutAsDict
  }

  /** shaderCode.cpp:50-56 */
  getParams(): readonly HdSt_MaterialParam[] {
    return _emptyParams
  }

  /** shaderCode.cpp:58-63 */
  isEnabledPrimvarFiltering(): boolean {
    return false
  }

  /** shaderCode.cpp:65-71 */
  getPrimvarNames(): readonly TfToken[] {
    return _emptyTokens
  }

  /** shaderCode.cpp:81-87 */
  getNamedTextureHandles(): readonly HdStShaderCodeNamedTextureHandle[] {
    return _emptyNamedTextureHandles
  }

  /** shaderCode.cpp:73-79 */
  getShaderData(): HdBufferArrayRange | null {
    return null
  }

  /** shaderCode.h:217-221. Binds shader-specific resources to `program`. */
  abstract bindResources(program: number, binder: HdSt_ResourceBinder): void

  /** shaderCode.h:223-225 */
  abstract unbindResources(program: number, binder: HdSt_ResourceBinder): void

  /** shaderCode.h:227-228. Add custom bindings (used by codegen). */
  abstract addBindings(customBindings: HdStBindingRequest[]): void

  /** shaderCode.cpp:42-47 */
  getMaterialTag(): TfToken {
    return TfToken()
  }

  /** shaderCode.cpp:89-94 */
  addResourcesFromTextures(_ctx: HdStShaderCodeResourceContext): void {
  }

  /** shaderCode.cpp:137-142. Returns the HioGlslfx instance used to
   *  configure this shader. */
  protected _getGlslfx(): HioGlslfx | null {
    return null
  }
}
export type HdStShaderCodeSharedPtr = HdStShaderCode
export type HdStShaderCodeSharedPtrVector = HdStShaderCode[]
