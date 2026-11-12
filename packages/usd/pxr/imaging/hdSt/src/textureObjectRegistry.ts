// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureObjectRegistry.cpp,
//  pxr/imaging/hdSt/textureObjectRegistry.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/textureObjectRegistry.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences (each also noted at its site):
// - Loading. Upstream Commit() loads the dirty textures in parallel on
//   worker threads and then commits them (textureObjectRegistry.cpp:
//   224-262), so no client ever sees a texture whose load is unfinished.
//   Reading assets and decoding images is asynchronous in the browser, so
//   the load phase is also available on its own as LoadAsync(): it loads
//   the textures the next Commit() would process and awaits them. Commit()
//   commits the dirty textures whose load is done (or completes
//   synchronously, e.g. dynamic textures) and returns only those. A dirty
//   texture whose load has not finished is not committed at all: it keeps
//   its previous GPU resource (none when new), stays dirty, loads in the
//   background and is committed and returned by the first Commit() after
//   its load finished, as upstream's Commit() would have done. The
//   callback given to SetLoadCompletionCallback is told when such a load
//   finishes. IsCommitPending() names these textures:
//   HdSt_TextureHandleRegistry defers their handles and shaders, and
//   HdSt_RenderPass draws nothing (and is not converged) while
//   HasUncommittedTextures() (renderPass.ts).
// - Lifetime: shared/weak pointers to texture objects are modelled as
//   described in textureObject.ts; GarbageCollect destroys the objects
//   only the registry holds.
// - HF_TRACE / TF_DESCRIBE_SCOPE / TF_PY_ALLOW_THREADS_IN_SCOPE are not
//   ported.

import { Token as TfToken, Hash as TfHash } from 'typescript-usd/tf'
import { Dictionary as VtDictionary, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { InstanceRegistry as HdInstanceRegistry } from 'typescript-usd/hd'
import { HgiFormat, type HgiTextureHandle } from 'typescript-usd/hgi'
import { HdStDynamicUvTextureObject } from './dynamicUvTextureObject.ts'
import { HdStTextureType } from './enums.ts'
import { HdStPtexTextureObject } from './ptexTextureObject.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdStDynamicCubemapSubtextureIdentifier,
  HdStDynamicUvSubtextureIdentifier,
} from './subtextureIdentifier.ts'
import type { HdStTextureIdentifier } from './textureIdentifier.ts'
import {
  HdStAssetUvTextureObject,
  HdStFieldTextureObject,
  HdStUvTextureObject,
  type HdStTextureObject,
} from './textureObject.ts'
import { HdStUdimTextureObject } from './udimTextureObject.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** VtValue of an integral dictionary entry (int64_t / size_t / int). */
function _Int(v: number): VtValue {
  return VtValue.create(v, VtValueTypes.int)
}

/** textureObjectRegistry.cpp:102-117 _FetchTextureInfo */
function _FetchTextureInfo(textureHandle: HgiTextureHandle, refCount: number): VtDictionary {
  const info = new VtDictionary()
  const texture = textureHandle.Get()
  info.set('uniqueIdentifier', _Int(textureHandle.getId()))
  if (!texture) return info
  const textureDesc = texture.getDescriptor()
  info.set('memoryUsed', _Int(texture.getByteSizeOfResource()))
  info.set('width', _Int(textureDesc.dimensions.data[0]!))
  info.set('height', _Int(textureDesc.dimensions.data[1]!))
  info.set('depth', _Int(textureDesc.dimensions.data[2]!))
  // TfEnum::GetName(format).substr(9): the name without "HgiFormat".
  info.set('format', VtValue.create((HgiFormat[textureDesc.format] ?? '').slice(9), VtValueTypes.string))
  info.set('referenceCount', _Int(refCount))
  info.set('debugName', VtValue.create(textureDesc.debugName, VtValueTypes.string))
  return info
}

/** textureObjectRegistry.h:35-131. A central registry for texture GPU
 *  resources. */
export class HdSt_TextureObjectRegistry {
  private _totalTextureMemory = 0

  // Registry for texture and sampler objects.
  private readonly _textureObjectRegistry = new HdInstanceRegistry<HdStTextureObject>()

  // Map file paths to texture objects for quick invalidation
  // by file path.
  private readonly _filePathToTextureObjects = new Map<TfToken, HdStTextureObject[]>()

  // File paths for which GPU resources need to be (re-)loaded
  private _dirtyFilePaths: TfToken[] = []

  // Texture for which GPU resources need to be (re-)loaded
  private _dirtyTextures: HdStTextureObject[] = []

  private readonly _resourceRegistry: HdStResourceRegistry

  // The load phase (see the header): textures whose _Load finished since
  // they were last marked dirty, loads in flight, and a per-texture count
  // of dirty marks so that a load overtaken by a new mark is not used.
  private readonly _loaded = new Set<HdStTextureObject>()
  private readonly _loading = new Map<HdStTextureObject, Promise<void>>()
  private readonly _dirtyCount = new Map<HdStTextureObject, number>()
  private _loadCompletionCallback: (() => void) | null = null
  // The textures the last Commit() left uncommitted (see the header).
  private _commitPending = new Set<HdStTextureObject>()

  /** textureObjectRegistry.cpp:23-28 */
  constructor(registry: HdStResourceRegistry) {
    this._resourceRegistry = registry
  }

  /** textureObjectRegistry.cpp:44-81 */
  private _makeTextureObject(
    textureId: HdStTextureIdentifier,
    textureType: HdStTextureType,
  ): HdStTextureObject | null {
    const subId = textureId.getSubtextureIdentifier()
    switch (textureType) {
      case HdStTextureType.Uv:
        if (subId instanceof HdStDynamicUvSubtextureIdentifier) {
          return new HdStDynamicUvTextureObject(textureId, this)
        } else {
          return new HdStAssetUvTextureObject(textureId, this)
        }
      case HdStTextureType.Field:
        return new HdStFieldTextureObject(textureId, this)
      case HdStTextureType.Ptex:
        return new HdStPtexTextureObject(textureId, this)
      case HdStTextureType.Udim:
        return new HdStUdimTextureObject(textureId, this)
      case HdStTextureType.Cubemap:
        if (subId instanceof HdStDynamicCubemapSubtextureIdentifier) {
          return new HdStDynamicUvTextureObject(textureId, this)
        }
    }

    TF_CODING_ERROR('Texture type not supported by texture object registry.')
    return null
  }

  /** textureObjectRegistry.cpp:83-100. Allocate texture. This just creates
   *  the HdStTextureObject, the actual GPU resources won't be allocated
   *  until the Commit phase. The caller holds the returned object and
   *  calls its Release() when done (textureObject.ts header). */
  allocateTextureObject(
    textureId: HdStTextureIdentifier,
    textureType: HdStTextureType,
  ): HdStTextureObject | null {
    // Check with instance registry and allocate texture and sampler object
    // if first object.
    const inst = this._textureObjectRegistry.GetInstance(TfHash(textureId))

    if (inst.isFirstInstance()) {
      const texture = this._makeTextureObject(textureId.copy(), textureType)
      if (!texture) {
        return null
      }

      inst.setValue(texture)
      this._dirtyTextures.push(texture)
      let vec = this._filePathToTextureObjects.get(textureId.getFilePath())
      if (!vec) {
        vec = []
        this._filePathToTextureObjects.set(textureId.getFilePath(), vec)
      }
      vec.push(texture)
    }

    return inst.GetValue()!._retain()
  }

  /** textureObjectRegistry.cpp:119-165. Returns a list of all allocated
   *  textures form this registry along with various parameters related to
   *  their creation. */
  getAllocInfo(): VtDictionary[] {
    const resourceList: VtDictionary[] = []
    for (const [, entry] of this._textureObjectRegistry) {
      const textureObject = entry.value
      if (!textureObject) continue
      // use_count(): the registry plus the other holders.
      const refCount = 1 + (textureObject._expired ? 0 : 1)
      switch (textureObject.getTextureType()) {
        case HdStTextureType.Uv:
        case HdStTextureType.Cubemap:
          resourceList.push(_FetchTextureInfo(
            (textureObject as HdStUvTextureObject).getTexture(), refCount))
          break
        case HdStTextureType.Field:
          resourceList.push(_FetchTextureInfo(
            (textureObject as HdStFieldTextureObject).getTexture(), refCount))
          break
        case HdStTextureType.Ptex:
          resourceList.push(_FetchTextureInfo(
            (textureObject as HdStPtexTextureObject).getTexelTexture(), refCount))
          resourceList.push(_FetchTextureInfo(
            (textureObject as HdStPtexTextureObject).getLayoutTexture(), refCount))
          break
        case HdStTextureType.Udim:
          resourceList.push(_FetchTextureInfo(
            (textureObject as HdStUdimTextureObject).getTexelTexture(), refCount))
          resourceList.push(_FetchTextureInfo(
            (textureObject as HdStUdimTextureObject).getLayoutTexture(), refCount))
          break
        default:
          TF_CODING_ERROR('Unhandled Type!')
          break
      }
    }
    return resourceList
  }

  /** textureObjectRegistry.cpp:167-172. Mark texture file path as dirty.
   *  All textures whose identifier contains the file path will be reloaded
   *  during the next Commit. */
  markTextureFilePathDirty(filePath: TfToken): void {
    this._dirtyFilePaths.push(filePath)
    for (const texture of this._filePathToTextureObjects.get(filePath) ?? []) {
      this._invalidateLoad(texture)
    }
  }

  /** textureObjectRegistry.cpp:174-179. Mark that the GPU resource for a
   *  texture needs to be (re-)loaded, e.g., because the memory request
   *  changed. */
  markTextureObjectDirty(textureObject: HdStTextureObject): void {
    this._dirtyTextures.push(textureObject)
    this._invalidateLoad(textureObject)
  }

  /** textureObjectRegistry.h:83-86. Get resource registry. */
  getResourceRegistry(): HdStResourceRegistry {
    return this._resourceRegistry
  }

  /** textureObjectRegistry.h:88-92. The total GPU memory consumed by all
   *  textures managed by this registry. */
  getTotalTextureMemory(): number {
    return this._totalTextureMemory
  }

  /** textureObjectRegistry.cpp:181-185. Add signed number to total texture
   *  memory amount. Called from texture objects when (de-)allocated GPU
   *  resources. */
  adjustTotalTextureMemory(memDiff: number): void {
    this._totalTextureMemory += memDiff
  }

  /** textureObjectRegistry.h:100-103. The number of texture objects. */
  getNumberOfTextureObjects(): number {
    return this._textureObjectRegistry.size()
  }

  /** The textures the next Commit() processes: textureObjectRegistry.cpp:
   *  223-235, with weak pointers that no longer lock dropped (_Uniquify,
   *  textureObjectRegistry.cpp:187-215). */
  private _collectDirtyTextures(): Set<HdStTextureObject> {
    const result = new Set<HdStTextureObject>()

    // Record all textures as dirty corresponding to file paths
    // explicitly marked dirty by client.
    for (const dirtyFilePath of this._dirtyFilePaths) {
      for (const texture of this._filePathToTextureObjects.get(dirtyFilePath) ?? []) {
        if (!texture._dead) result.add(texture)
      }
    }

    // Also record all textures explicitly marked dirty.
    for (const texture of this._dirtyTextures) {
      if (!texture._dead) result.add(texture)
    }
    return result
  }

  /** A new dirty mark: an earlier load result is stale. */
  private _invalidateLoad(texture: HdStTextureObject): void {
    this._loaded.delete(texture)
    this._dirtyCount.set(texture, (this._dirtyCount.get(texture) ?? 0) + 1)
  }

  /** Starts (or joins) the load of one texture: the per-texture body of the
   *  parallel load in textureObjectRegistry.cpp:236-244. Returns null when
   *  the load completed synchronously. */
  private _startLoad(texture: HdStTextureObject): Promise<void> | null {
    const inFlight = this._loading.get(texture)
    if (inFlight) {
      return inFlight
    }
    const mark = this._dirtyCount.get(texture) ?? 0
    const result = texture._load()
    if (!(result instanceof Promise)) {
      this._loaded.add(texture)
      return null
    }
    const promise = result.then(() => {
      this._loading.delete(texture)
      if ((this._dirtyCount.get(texture) ?? 0) === mark && !texture._dead) {
        this._loaded.add(texture)
      }
    }, (error: unknown) => {
      this._loading.delete(texture)
      TF_CODING_ERROR(`Loading texture ${texture.GetTextureIdentifier().getFilePath()} ` +
        `failed: ${String(error)}`)
      if ((this._dirtyCount.get(texture) ?? 0) === mark && !texture._dead) {
        this._loaded.add(texture)
      }
    })
    this._loading.set(texture, promise)
    return promise
  }

  /** The load phase of Commit() on its own (see the header): loads every
   *  texture the next Commit() will process and resolves when they are
   *  loaded. */
  async loadAsync(): Promise<void> {
    for (;;) {
      const pending: Promise<void>[] = []
      for (const texture of this._collectDirtyTextures()) {
        if (this._loaded.has(texture)) continue
        const promise = this._startLoad(texture)
        if (promise) pending.push(promise)
      }
      if (pending.length === 0) return
      await Promise.all(pending)
    }
  }

  /** Called when a background load (see the header) finishes, so that a
   *  client can run Commit() again. */
  setLoadCompletionCallback(callback: (() => void) | null): void {
    this._loadCompletionCallback = callback
  }

  /** True while background loads are in flight. */
  hasPendingLoads(): boolean {
    return this._loading.size > 0
  }

  /** True when the texture is dirty and the last Commit() could not commit
   *  it because its load had not finished (see the header). */
  isCommitPending(texture: HdStTextureObject): boolean {
    return this._commitPending.has(texture)
  }

  /** True while textures wait for their load to be committed (see the
   *  header): those the last Commit() left pending, and any marked dirty
   *  since. Upstream never has such textures after a commit. */
  hasUncommittedTextures(): boolean {
    return this._collectDirtyTextures().size > 0
  }

  /** textureObjectRegistry.cpp:217-262. Create GPU texture objects, load
   *  textures from files and upload to GPU (see the header for the load
   *  phase). */
  commit(): Set<HdStTextureObject> {
    const dirty = this._collectDirtyTextures()
    const result = new Set<HdStTextureObject>()
    const pending: HdStTextureObject[] = []

    // Load texture files (textureObjectRegistry.cpp:236-244).
    for (const texture of dirty) {
      if (this._loaded.has(texture)) {
        result.add(texture)
        continue
      }
      const promise = this._startLoad(texture)
      if (promise) {
        pending.push(texture)
        void promise.then(() => this._loadCompletionCallback?.())
      } else {
        result.add(texture)
      }
    }

    // Commit loaded files to GPU (textureObjectRegistry.cpp:248-259).
    for (const texture of result) {
      texture._commit()
      this._loaded.delete(texture)
    }

    // Textures still loading are committed by a later Commit() (see the
    // header).
    this._dirtyFilePaths = []
    this._dirtyTextures = pending
    this._commitPending = new Set(pending)

    // MipMap generation for textures requiers us to submit blit work.
    void this._resourceRegistry.submitBlitWork()

    return result
  }

  /** textureObjectRegistry.cpp:300-307. Free GPU resources of textures not
   *  used by any client. */
  garbageCollect(): void {
    this._textureObjectRegistry.garbageCollect((texture) => {
      texture._dead = true
      texture._destroy()
      this._loaded.delete(texture)
      this._dirtyCount.delete(texture)
      this._commitPending.delete(texture)
    })

    // textureObjectRegistry.cpp:283-298 _GarbageCollect of
    // _filePathToTextureObjects: drop expired weak pointers and empty
    // entries.
    for (const [filePath, vec] of [...this._filePathToTextureObjects]) {
      const alive = vec.filter((texture) => !texture._dead)
      if (alive.length === 0) {
        this._filePathToTextureObjects.delete(filePath)
      } else {
        this._filePathToTextureObjects.set(filePath, alive)
      }
    }
  }
}
