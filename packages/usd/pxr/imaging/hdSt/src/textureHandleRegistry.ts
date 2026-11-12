// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureHandleRegistry.cpp,
//  pxr/imaging/hdSt/textureHandleRegistry.h,
//  pxr/imaging/hdSt/simpleLightingShader.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/textureHandleRegistry.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - Weak pointers to texture handles, texture objects and shader code lock
//   unless the object `_expired` / `_dead` (textureHandle.ts,
//   textureObject.ts, shaderCode.ts).
// - LoadAsync(): the asynchronous load phase of the texture object
//   registry (textureObjectRegistry.ts header), preceded by the garbage
//   collection and target memory computation Commit() does first so that
//   the textures load at the right size.
// - std::set results are insertion-ordered Sets.
// - _Commit defers what depends on a texture whose load the texture object
//   registry could not commit yet (IsCommitPending, textureObjectRegistry.ts
//   header): the handles of such a texture stay dirty (their samplers are
//   allocated once the texture is loaded, as upstream allocates them after
//   the load) and their shader code is not returned, so no
//   AddResourcesFromTextures runs against an unloaded texture (e.g. the
//   dome light computations, simpleLightingShader.cpp:584-686). The
//   commit that commits the texture returns them, as upstream's single
//   commit does.

import type { SamplerParameters as HdSamplerParameters } from 'typescript-usd/hd'
import type { HdStTextureType } from './enums.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdSt_SamplerObjectRegistry } from './samplerObjectRegistry.ts'
import type { HdStShaderCode } from './shaderCode.ts'
import { HdStTextureHandle } from './textureHandle.ts'
import type { HdStTextureIdentifier } from './textureIdentifier.ts'
import type { HdStTextureObject } from './textureObject.ts'
import { HdSt_TextureObjectRegistry } from './textureObjectRegistry.ts'

/** weak_ptr<HdStShaderCode>::lock(). */
function _LockShader(shader: HdStShaderCode | null): HdStShaderCode | null {
  return shader && !shader._expired ? shader : null
}

/** textureHandleRegistry.cpp:21-142 */
class _TextureToHandlesMap {
  private _size = 0
  private readonly _map = new Map<HdStTextureObject, HdStTextureHandle[]>()

  /** textureHandleRegistry.cpp:32-43. Get handles associated to a
   *  texture. */
  getHandles(texture: HdStTextureObject): HdStTextureHandle[] | null {
    return this._map.get(texture) ?? null
  }

  /** textureHandleRegistry.cpp:45-52. Insert an association of a handle
   *  with a texture. */
  insert(texture: HdStTextureObject, handle: HdStTextureHandle): void {
    this._size++
    this._getOrCreate(texture).push(handle)
  }

  /** textureHandleRegistry.cpp:54-78. Remove weak pointers to expired
   *  handles that were associated with the given textures. Return true if
   *  such texture has no more associated handles (and remove entry for that
   *  texture). */
  garbageCollect(textures: ReadonlySet<HdStTextureObject>): boolean {
    let result = false

    for (const texture of textures) {
      const vec = this._map.get(texture)
      if (vec === undefined) {
        result = true
      } else {
        if (this._garbageCollect(vec)) {
          result = true
          this._map.delete(texture)
        }
      }
    }

    return result
  }

  getMap(): ReadonlyMap<HdStTextureObject, HdStTextureHandle[]> { return this._map }

  getSize(): number { return this._size }

  /** textureHandleRegistry.cpp:87-121. Remove all expired weak pointers
   *  from vector, return true if no weak pointers left. Also update
   *  _size. */
  private _garbageCollect(vec: HdStTextureHandle[]): boolean {
    // Go from left to right, filling slots that became empty
    // with valid weak pointers from the right.
    let last = vec.length

    for (let i = 0; i < last; i++) {
      if (vec[i]!._expired) {
        this._size--
        for (;;) {
          last--
          if (i === last) {
            break
          }
          if (!vec[last]!._expired) {
            vec[i] = vec[last]!
            break
          }
        }
      }
    }

    vec.length = last

    return last === 0
  }

  /** textureHandleRegistry.cpp:123-135. Get the vector of associated
   *  handles for given texture or insert empty vector if not accounted for
   *  yet. */
  private _getOrCreate(texture: HdStTextureObject): HdStTextureHandle[] {
    let result = this._map.get(texture)
    if (!result) {
      result = []
      this._map.set(texture, result)
    }
    return result
  }
}

/** textureHandleRegistry.h:44-173. Keeps track of texture handles and
 *  allocates the textures and samplers using the
 *  HdSt_TextureObjectRegistry, respectively, HdSt_SamplerObjectRegistry.
 *  Its responsibilities including tracking what texture handles are
 *  associated to a texture, computing the target memory of a texture from
 *  the memory requests in the texture handles, triggering sampler and
 *  texture garbage collection, and determining what HdStShaderCode
 *  instances are affecting by (re-)committing a texture. */
export class HdSt_TextureHandleRegistry {
  // Maps texture type to memory a single texture of that type can consume
  // (in bytes).
  // Will be taken into account when computing the maximum of all the
  // memory requests of the texture handles.
  private readonly _textureTypeToMemoryRequest = new Map<HdStTextureType, number>()
  // Has _textureTypeToMemoryRequest changed since the last commit.
  private _textureTypeToMemoryRequestChanged = false

  // Handles that are new or for which the underlying texture has
  // changed: samplers might need to be (re-)allocated and the
  // corresponding shader code might need to update the shader bar.
  private _dirtyHandles: HdStTextureHandle[] = []

  // Textures whose set of associated handles and target memory
  // might have changed.
  private _dirtyTextures: HdStTextureObject[] = []

  // Shaders that dropped a texture handle also need to be notified
  // (for example because they re-allocated the shader bar after dropping
  // the texture).
  private _dirtyShaders: Array<HdStShaderCode | null> = []

  private readonly _samplerObjectRegistry: HdSt_SamplerObjectRegistry
  private readonly _textureObjectRegistry: HdSt_TextureObjectRegistry
  private readonly _textureToHandlesMap = new _TextureToHandlesMap()

  /** textureHandleRegistry.cpp:144-153 */
  constructor(registry: HdStResourceRegistry) {
    this._samplerObjectRegistry = new HdSt_SamplerObjectRegistry(registry)
    this._textureObjectRegistry = new HdSt_TextureObjectRegistry(registry)
  }

  /** textureHandleRegistry.cpp:157-185. Allocate texture handle. See
   *  HdStResourceRegistry::AllocateTextureHandle for details. The caller
   *  holds the handle and calls its Release() when done. */
  allocateTextureHandle(
    textureId: HdStTextureIdentifier,
    textureType: HdStTextureType,
    samplerParams: HdSamplerParameters,
    memoryRequest: number,
    shaderCode: HdStShaderCode | null,
  ): HdStTextureHandle | null {
    // Allocate texture (CPU only)
    const textureObject =
      this._textureObjectRegistry.allocateTextureObject(textureId, textureType)
    if (!textureObject) {
      return null
    }

    const result = new HdStTextureHandle(
      textureObject,
      samplerParams,
      memoryRequest,
      shaderCode,
      this)

    // Keep track and mark dirty
    this._textureToHandlesMap.insert(textureObject, result)
    this._dirtyHandles.push(result)
    this._dirtyTextures.push(textureObject)

    return result
  }

  /** textureHandleRegistry.cpp:187-191. Mark that sampler garbage
   *  collection needs to happen during next commit. */
  markSamplerGarbageCollectionNeeded(): void {
    this._samplerObjectRegistry.markGarbageCollectionNeeded()
  }

  /** textureHandleRegistry.cpp:193-205. Mark texture dirty: the target
   *  memory of the texture will be recomputed during commit and the data
   *  structure tracking the associated handles will be updated potentially
   *  triggering texture garbage collection. Mark shader dirty: the shader
   *  is scheduled to be updated (i.e., have its AddResourcesFromTextures
   *  called) on the next commit. */
  markDirty(textureOrShader: HdStTextureObject | HdStShaderCode | null): void {
    if (textureOrShader && 'GetTextureIdentifier' in textureOrShader) {
      this._dirtyTextures.push(textureOrShader)
    } else {
      this._dirtyShaders.push(textureOrShader)
    }
  }

  /** textureHandleRegistry.h:108-112. Get texture object registry. */
  getTextureObjectRegistry(): HdSt_TextureObjectRegistry {
    return this._textureObjectRegistry
  }

  /** textureHandleRegistry.h:114-118. Get sampler object registry. */
  getSamplerObjectRegistry(): HdSt_SamplerObjectRegistry {
    return this._samplerObjectRegistry
  }

  /** textureHandleRegistry.cpp:207-245. Compute target memory for
   *  texture. */
  private _computeMemoryRequest(texture: HdStTextureObject): void {
    const handles = this._textureToHandlesMap.getHandles(texture)
    if (!handles) {
      return
    }

    let hasHandle = false
    let maxRequest = 0

    // Take maximum of memory requests from all associated
    // handles.
    for (const handle of handles) {
      if (!handle._expired) {
        maxRequest = Math.max(maxRequest, handle.getMemoryRequest())
        hasHandle = true
      }
    }

    if (maxRequest === 0) {
      // If no handle had an opinion, use default memory request.
      const it = this._textureTypeToMemoryRequest.get(texture.getTextureType())
      if (it !== undefined) {
        maxRequest = it
      }
    }

    if (hasHandle) {
      texture.setTargetMemory(maxRequest)
    }
  }

  /** textureHandleRegistry.cpp:247-257. Compute target memory for
   *  textures. */
  private _computeMemoryRequests(textures: ReadonlySet<HdStTextureObject>): void {
    for (const texture of textures) {
      this._computeMemoryRequest(texture)
    }
  }

  /** textureHandleRegistry.cpp:259-266 */
  private _computeAllMemoryRequests(): void {
    for (const texture of this._textureToHandlesMap.getMap().keys()) {
      this._computeMemoryRequest(texture)
    }
  }

  /** textureHandleRegistry.cpp:283-317 */
  private _garbageCollectHandlesAndComputeTargetMemory(): boolean {
    // Note that dirtyTextures is holding on to shared ptr.
    //
    // This is ok within the context of garbage collecting handles,
    // but not in the context of garbage collecting textures. Garbage
    // collecting textures is happening in a different functions so
    // the dirtyTextures map will be destroyed by then.

    const dirtyTextures = new Set<HdStTextureObject>()
    for (const texture of this._dirtyTextures) {
      if (!texture._dead) dirtyTextures.add(texture)
    }

    // Clean-up the texture to handle map
    const texturesNeedGarbageCollection =
      this._textureToHandlesMap.garbageCollect(dirtyTextures)

    // Compute target memory for dirty textures.
    if (this._textureTypeToMemoryRequestChanged) {
      this._computeAllMemoryRequests()
      this._textureTypeToMemoryRequestChanged = false
    } else {
      this._computeMemoryRequests(dirtyTextures)
    }

    this._dirtyTextures = []

    return texturesNeedGarbageCollection
  }

  /** textureHandleRegistry.cpp:319-337 */
  garbageCollect(): void {
    // Garbage collect unused texture handles for the dirty textures,
    // then re-compute their target memory using the remaining texture
    // handles.
    //
    // Note that this also deletes the texture entries in the
    // _textureToHandlesMap if there are no handles left so that the
    // textures can be freed.
    if (!this._garbageCollectHandlesAndComputeTargetMemory()) {
      return
    }

    // Garbage collect textures.
    this._textureObjectRegistry.garbageCollect()
  }

  /** textureHandleRegistry.cpp:339-393 */
  private _commit(): Set<HdStShaderCode> {
    // Commit textures first. The result is a list of
    // textures that have been committed or recommitted (e.g.,
    // target memory changed or file on disk).
    const committedTextures = this._textureObjectRegistry.commit()

    // Compute the set of new texture handles that have never been
    // processed before and ...
    const dirtyHandles = new Set<HdStTextureHandle>()
    for (const handle of this._dirtyHandles) {
      if (!handle._expired) dirtyHandles.add(handle)
    }
    // ... texture handles associated to textures affected by the
    // (re)-commit.
    for (const texture of committedTextures) {
      const handles = this._textureToHandlesMap.getHandles(texture)
      if (handles) {
        for (const handle of handles) {
          if (!handle._expired) dirtyHandles.add(handle)
        }
      }
    }

    // Handles of textures still loading wait for the commit of their
    // texture, and so does their shader code (see the header).
    const deferredHandles: HdStTextureHandle[] = []
    const deferredShaders = new Set<HdStShaderCode>()
    for (const handle of dirtyHandles) {
      if (this._textureObjectRegistry.isCommitPending(handle.getTextureObject())) {
        deferredHandles.push(handle)
        const shader = _LockShader(handle.getShaderCode())
        if (shader) {
          deferredShaders.add(shader)
        }
      }
    }
    for (const handle of deferredHandles) {
      dirtyHandles.delete(handle)
    }

    // Collect associated shader code instances (who might want to
    // add, e.g., bindless handless or other texture metadata to the
    // shader bar)...
    const result = new Set<HdStShaderCode>()
    for (const handle of dirtyHandles) {
      // ... while allocating samplers for the textures.
      handle.reallocateSamplerIfNecessary()
      const shader = _LockShader(handle.getShaderCode())
      if (shader) {
        result.add(shader)
      }
    }
    for (const dirtyShader of this._dirtyShaders) {
      const shader = _LockShader(dirtyShader)
      if (shader) {
        result.add(shader)
      }
    }

    for (const shader of deferredShaders) {
      result.delete(shader)
    }

    this._dirtyHandles = deferredHandles
    this._dirtyShaders = [...deferredShaders]

    // Resource registry uses result to give shader code a chance to
    // add buffer sources.
    return result
  }

  /** textureHandleRegistry.cpp:395-412. Commit textures. Return shader code
   *  instances that depend on the (re-)loaded textures so that they can
   *  add buffer sources based on the texture meta-data. Also garbage
   *  collect textures and samplers if necessary. */
  commit(): Set<HdStShaderCode> {
    // Garbage collect texture handles and textures and compute
    // target memory for the textures before calling the commit
    // on the texture registry.
    this.garbageCollect()

    // Commit textures, update samplers associated with the
    // corresponding texture handles. Return all affected shaders.
    const result = this._commit()

    // Updating the samplers in the above _Commit() could have
    // freed some, so we do sampler garbage collection last.
    this._samplerObjectRegistry.garbageCollect()

    return result
  }

  /** The load phase of the next Commit() (see the header). */
  async loadAsync(): Promise<void> {
    this.garbageCollect()
    await this._textureObjectRegistry.loadAsync()
  }

  /** textureHandleRegistry.cpp:414-424. Sets how much memory a single
   *  texture can consume in bytes by texture type. Only has an effect if
   *  non-zero and only applies to textures if no texture handle
   *  referencing the texture has a memory request. */
  setMemoryRequestForTextureType(textureType: HdStTextureType, memoryRequest: number): void {
    const val = this._textureTypeToMemoryRequest.get(textureType) ?? 0
    if (val !== memoryRequest) {
      this._textureTypeToMemoryRequest.set(textureType, memoryRequest)
      this._textureTypeToMemoryRequestChanged = true
    }
  }

  /** textureHandleRegistry.cpp:426-430 */
  getNumberOfTextureHandles(): number {
    return this._textureToHandlesMap.getSize()
  }
}
