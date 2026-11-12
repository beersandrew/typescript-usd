// Ported from OpenUSD 26.11.1: pxr/usd/usd/stageCache.cpp,
//  pxr/usd/usd/stageCache.h, pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/stageCacheContext.cpp, pxr/usd/usd/stageCacheContext.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdStageCache from OpenUSD 26.11.1 pxr/usd/usd/stageCache.{h,cpp}, and
// UsdStageCacheContext from pxr/usd/usd/stageCacheContext.{h,cpp}.
//
// A stage cache holds stages by Id and by root layer. UsdStage::Open
// consults the caches bound by UsdStageCacheContext (stage.cpp:1414-1446):
// it returns a matching stage from a readable cache, and publishes a stage
// it manufactures to every writable cache (stage.cpp:1113-1116).
//
// The TF_DEFINE_STACKED context stack is a module-level stack here. JS has
// one thread, so the per-thread stacks of upstream collapse to one; a
// context is bound by construction and unbound by close() (the C++
// destructor). Stage.open reads the stack when it is called, before it
// awaits anything.

import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'
import { ResolverContext as ArResolverContext } from 'typescript-usd/ar'
import type { Layer } from 'typescript-usd/sdf'
import type { Stage } from './stage.ts'

const codingError = (message: string, func: string, line: number): void => {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError,
    { file: 'pxr/usd/usd/stageCache.cpp', function: func, line }))
}

// stageCache.cpp:39-41: ids count up from 9223000 across all caches.
let idCounter = 9223000

// UsdStageCache::Id (stageCache.h:81-131).
export class UsdStageCacheId {
  private constructor(private readonly _value: number) {}

  /** Default construct an invalid id. */
  static invalid(): UsdStageCacheId { return new UsdStageCacheId(-1) }
  static fromLongInt(val: number): UsdStageCacheId { return new UsdStageCacheId(val) }
  static fromString(s: string): UsdStageCacheId {
    const value = Number.parseInt(s, 10)
    if (!Number.isSafeInteger(value)) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `'${s}' overflowed during conversion to int64_t.`, TfDiagnosticType.CodingError,
        { file: 'pxr/usd/usd/stageCache.h', function: 'UsdStageCache::Id::FromString', line: 95 }))
    }
    return new UsdStageCacheId(value)
  }
  toLongInt(): number { return this._value }
  ToString(): string { return String(this._value) }
  isValid(): boolean { return this._value !== -1 }
  equals(other: UsdStageCacheId): boolean { return this._value === other._value }
}

type MatchArgs =
  | []
  | [sessionLayer: Layer | null]
  | [pathResolverContext: ArResolverContext]
  | [sessionLayer: Layer | null, pathResolverContext: ArResolverContext]

// The optional session layer and resolver context of the FindOneMatching /
// FindAllMatching / EraseAll overloads (stageCache.h:213-288).
function splitMatchArgs(args: MatchArgs): {
  session?: Layer | null, context?: ArResolverContext,
} {
  if (args.length === 2) return { session: args[0], context: args[1] }
  if (args.length === 1) {
    return args[0] instanceof ArResolverContext ? { context: args[0] } : { session: args[0] }
  }
  return {}
}

function stageSessionLayer(stage: Stage): Layer | null {
  return stage.hasSessionLayer() ? stage.getSessionLayer() : null
}

function stageMatches(stage: Stage, rootLayer: Layer, args: MatchArgs): boolean {
  if (stage.getRootLayer() !== rootLayer) return false
  const { session, context } = splitMatchArgs(args)
  if (session !== undefined && stageSessionLayer(stage) !== session) return false
  if (context !== undefined && !stage.getPathResolverContext().equals(context)) return false
  return true
}

export class UsdStageCache {
  // Insertion-ordered entries (the StageContainer maps, stageCache.cpp:58-168).
  #byId = new Map<number, Stage>()
  #byStage = new Map<Stage, UsdStageCacheId>()
  #debugName = ''

  // UsdStageCache::GetAllStages (stageCache.cpp:349-360).
  getAllStages(): Stage[] { return [...this.#byId.values()] }
  // UsdStageCache::Size (stageCache.cpp:362-367).
  size(): number { return this.#byId.size }
  IsEmpty(): boolean { return this.size() === 0 }

  // UsdStageCache::Find (stageCache.cpp:439-455).
  find(id: UsdStageCacheId): Stage | undefined { return this.#byId.get(id.toLongInt()) }

  // UsdStageCache::FindOneMatching (stageCache.cpp:457-561).
  findOneMatching(rootLayer: Layer, ...args: MatchArgs): Stage | undefined {
    for (const stage of this.#byId.values()) if (stageMatches(stage, rootLayer, args)) return stage
    return undefined
  }

  // UsdStageCache::FindAllMatching (stageCache.cpp:563-628).
  findAllMatching(rootLayer: Layer, ...args: MatchArgs): Stage[] {
    return [...this.#byId.values()].filter(stage => stageMatches(stage, rootLayer, args))
  }

  // UsdStageCache::Contains (stageCache.h:180-188).
  contains(stageOrId: Stage | UsdStageCacheId): boolean {
    return stageOrId instanceof UsdStageCacheId
      ? this.find(stageOrId) !== undefined : this.getId(stageOrId).isValid()
  }

  // UsdStageCache::GetId (stageCache.cpp:630-637).
  getId(stage: Stage | null | undefined): UsdStageCacheId {
    return (stage && this.#byStage.get(stage)) || UsdStageCacheId.invalid()
  }

  // UsdStageCache::Insert (stageCache.cpp:639-659): a stage already present
  // keeps its id.
  insert(stage: Stage | null | undefined): UsdStageCacheId {
    if (!stage) {
      codingError('Inserted null stage in cache', 'UsdStageCache::Insert', 644)
      return UsdStageCacheId.invalid()
    }
    const existing = this.#byStage.get(stage)
    if (existing) return existing
    const id = UsdStageCacheId.fromLongInt(++idCounter)
    this.#byId.set(id.toLongInt(), stage)
    this.#byStage.set(stage, id)
    return id
  }

  // UsdStageCache::Erase (stageCache.cpp:661-695).
  erase(idOrStage: UsdStageCacheId | Stage | null | undefined): boolean {
    if (!idOrStage) return false
    const stage = idOrStage instanceof UsdStageCacheId ? this.#byId.get(idOrStage.toLongInt()) : idOrStage
    const id = stage && this.#byStage.get(stage)
    if (!stage || !id) return false
    this.#byId.delete(id.toLongInt())
    this.#byStage.delete(stage)
    return true
  }

  // UsdStageCache::EraseAll (stageCache.cpp:697-736).
  eraseAll(rootLayer: Layer, ...args: MatchArgs): number {
    const matching = this.findAllMatching(rootLayer, ...args)
    for (const stage of matching) this.erase(stage)
    return matching.length
  }

  // UsdStageCache::Clear (stageCache.cpp:738-753).
  clear(): void {
    this.#byId = new Map()
    this.#byStage = new Map()
  }

  setDebugName(debugName: string): void { this.#debugName = debugName }
  getDebugName(): string { return this.#debugName }
}

// Usd_NonPopulatingStageCacheWrapper / UsdUseButDoNotPopulateCache
// (stageCacheContext.h:21-40).
export class Usd_NonPopulatingStageCacheWrapper {
  constructor(readonly cache: UsdStageCache) {}
}
export function UsdUseButDoNotPopulateCache(cache: UsdStageCache): Usd_NonPopulatingStageCacheWrapper {
  return new Usd_NonPopulatingStageCacheWrapper(cache)
}

// UsdStageCacheContextBlockType (stageCacheContext.h:42-55).
export enum UsdStageCacheContextBlockType {
  UsdBlockStageCaches = 'UsdBlockStageCaches',
  UsdBlockStageCachePopulation = 'UsdBlockStageCachePopulation',
  Usd_NoBlock = 'Usd_NoBlock',
}
export const UsdBlockStageCaches = UsdStageCacheContextBlockType.UsdBlockStageCaches
export const UsdBlockStageCachePopulation = UsdStageCacheContextBlockType.UsdBlockStageCachePopulation

const contextStack: UsdStageCacheContext[] = []

export class UsdStageCacheContext {
  readonly #cache: UsdStageCache | undefined
  readonly #isReadOnlyCache: boolean
  readonly #blockType: UsdStageCacheContextBlockType
  #closed = false

  // stageCacheContext.h:107-124.
  constructor(binding: UsdStageCache | Usd_NonPopulatingStageCacheWrapper | UsdStageCacheContextBlockType) {
    if (binding instanceof UsdStageCache) {
      this.#cache = binding
      this.#isReadOnlyCache = false
      this.#blockType = UsdStageCacheContextBlockType.Usd_NoBlock
    } else if (binding instanceof Usd_NonPopulatingStageCacheWrapper) {
      this.#cache = binding.cache
      this.#isReadOnlyCache = true
      this.#blockType = UsdStageCacheContextBlockType.Usd_NoBlock
    } else {
      this.#cache = undefined
      this.#isReadOnlyCache = false
      this.#blockType = binding
    }
    contextStack.push(this)
  }

  /** Unbinds this context (the C++ destructor). Contexts close innermost first. */
  close(): void {
    if (this.#closed) return
    this.#closed = true
    const index = contextStack.lastIndexOf(this)
    if (index >= 0) contextStack.splice(index, 1)
  }

  [Symbol.dispose](): void { this.close() }

  // UsdStageCacheContext::_GetReadableCaches (stageCacheContext.cpp:46-63).
  /** @internal */
  static _getReadableCaches(): UsdStageCache[] {
    const caches: UsdStageCache[] = []
    for (let i = contextStack.length - 1; i >= 0; --i) {
      const ctx = contextStack[i]!
      if (ctx.#blockType === UsdStageCacheContextBlockType.UsdBlockStageCaches) break
      if (ctx.#blockType === UsdStageCacheContextBlockType.UsdBlockStageCachePopulation) continue
      caches.push(ctx.#cache!)
    }
    return caches
  }

  // UsdStageCacheContext::_GetWritableCaches (stageCacheContext.cpp:65-82).
  /** @internal */
  static _getWritableCaches(): UsdStageCache[] {
    const caches: UsdStageCache[] = []
    for (let i = contextStack.length - 1; i >= 0; --i) {
      const ctx = contextStack[i]!
      if (ctx.#blockType !== UsdStageCacheContextBlockType.Usd_NoBlock) break
      if (!ctx.#isReadOnlyCache) caches.push(ctx.#cache!)
    }
    return caches
  }
}
