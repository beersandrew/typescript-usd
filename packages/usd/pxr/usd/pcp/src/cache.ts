// Ported from OpenUSD 26.11.1: pxr/usd/pcp/cache.cpp, pxr/usd/pcp/cache.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PcpCache — retained prim indexes and layer stacks for one root layer stack.
// Port of OpenUSD v26.08 pxr/usd/pcp/cache.{h,cpp}.
//
// Prim indexing and layer stack computation are synchronous (as upstream)
// over a memo of loaded layers. The async entry points retry the synchronous
// computation after loading any layer it reported missing (PcpNeedsLayer).

import type { PcpLayer, PcpLayerHandle, PcpLayerOpener, PcpLayerStackIdentifier } from './layerStackIdentifier.ts'
import { type PcpLayerSource, PcpLayerStack, PcpNeedsLayer } from './layerStack.ts'
import { pcpRunMaybeAsync, type PcpMaybeAsync } from './maybeAsync.ts'
import { PcpLayerStackRegistry } from './layerStackRegistry.ts'
import type { PcpNodeRef } from './node.ts'
import {
  type PcpCulledDependency, type PcpPrimIndex, type PcpPrimIndexCache, PcpPrimIndexInputs,
  PcpPrimIndexOutputs, pcpComputePrimIndex, pcpRescanForSpecs,
} from './primIndex.ts'
import { PcpDynamicFileFormatDependencyData } from './dynamicFileFormatDependencyData.ts'
import { PcpDependencies } from './dependencies.ts'
import {
  PcpDependency, PcpDependencyType, type PcpDependencyFlags, pcpClassifyNodeDependency,
  pcpNodeIntroducesDependency,
} from './dependency.ts'
import { PcpMapFunction } from './mapFunction.ts'
import {
  pcpTranslatePathFromNodeToRoot, pcpTranslatePathFromNodeToRootUsingFunction,
} from './pathTranslation.ts'
import { PcpArcType } from './arc.ts'
import { type PcpCacheChanges, PcpChanges, type PcpLifeboat } from './changes.ts'
import { type PcpError, PcpErrorType } from './errors.ts'
import type { LogicalTraceContext } from 'typescript-usd/trace/_internal'
import type { PcpTraceContextHolder } from './traceTypes.ts'
import { _pcpBuildPropertyIndexSync } from './propertyIndex.ts'
import { pcpBuildFilteredTargetIndex } from './targetIndex.ts'
import { pcpSite } from './site.ts'
import { Layer as SdfLayer, type Spec as SdfSpec, type SpecType as SdfSpecType } from 'typescript-usd/sdf'
import { _storePcpTraceData, _withPcpTraceScope, _withPcpTraceScopeSync } from './traceScope.ts'
import { SdfPath } from 'typescript-usd/sdf/path'
import { SdfPathTable } from 'typescript-usd/sdf/pathTable'

const traceContexts = new WeakMap<PcpCache, PcpTraceContextHolder>()

// How far computePrimIndexesInParallel looks ahead while a prim waits for a
// layer: queued prims considered, and layer loads kept in flight.
const COMPUTE_AHEAD_PRIMS = 1024
const COMPUTE_AHEAD_LOADS = 64

export type PcpComputationEventKind =
  | 'primIndexRequest' | 'primIndexCompute'
  | 'namespaceDiscovery' | 'materialization' | 'usdDependencyResolution'

type PathLike = SdfPath | string
const toPath = (path: PathLike): SdfPath => typeof path === 'string' ? SdfPath.fromString(path) : path

// The cache's synchronous view of loaded layers. Loaded layers persist, as
// layers retained by the cache's layer stacks and change lifeboats do
// upstream. Failed loads persist until the next change processing step, so
// recomputation retries them as upstream's SdfLayer::FindOrOpen does.
class PcpCacheLayerSource implements PcpLayerSource {
  private readonly _loaded = new Map<string, PcpLayer>()
  // Failed loads, with the commentary of the errors each posted.
  private readonly _failed = new Map<string, string>()
  private readonly _pending = new Map<string, Promise<void>>()
  private readonly _seeded = new Set<string>()

  constructor(private readonly _opener: PcpLayerOpener) {}

  findOrOpen(identifier: string): PcpLayer | null {
    const layer = this._loaded.get(identifier)
    if (layer) return layer
    if (this._failed.has(identifier)) return null
    // SdfLayer::FindOrOpen only finds an anonymous layer, which needs no
    // loading.
    if (identifier.startsWith('anon:')) {
      const anonymous = SdfLayer.find(identifier) as PcpLayer | undefined
      if (!anonymous) return null
      this._loaded.set(identifier, anonymous)
      return anonymous
    }
    throw new PcpNeedsLayer(identifier)
  }

  // SdfLayer::Find: an already-open layer, never loading.
  find(identifier: string): PcpLayer | null {
    return this._loaded.get(identifier) ?? null
  }

  // The errors a failed findOrOpen of identifier posted, joined with "; "
  // (layerStack.cpp:1794-1802, primIndex.cpp:2317-2324).
  failureMessages(identifier: string): string {
    return this._failed.get(identifier) ?? ''
  }

  private async _open(identifier: string): Promise<void> {
    const errors: string[] = []
    let layer: PcpLayer | null | undefined
    try {
      layer = await this._opener(identifier, errors)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
    if (layer) {
      this._loaded.set(identifier, layer)
      this._failed.delete(identifier)
    } else {
      this._loaded.delete(identifier)
      this._failed.set(identifier, errors.join('; '))
    }
  }

  seed(identifier: string, layer: PcpLayer): void {
    this._loaded.set(identifier, layer)
    this._seeded.add(identifier)
  }

  // Re-open every opened identifier, as SdfLayer::FindOrOpen re-resolves
  // identifiers after a resolver change.
  async refresh(): Promise<void> {
    this._failed.clear()
    for (const identifier of [...this._loaded.keys()]) {
      if (this._seeded.has(identifier)) continue
      await this._open(identifier)
    }
  }

  load(identifier: string): Promise<void> {
    const pending = this._pending.get(identifier)
    if (pending) return pending
    const promise = (async () => {
      try {
        await this._open(identifier)
      } finally {
        this._pending.delete(identifier)
      }
    })()
    this._pending.set(identifier, promise)
    return promise
  }

  forgetFailures(): void { this._failed.clear() }

  pendingLoadCount(): number { return this._pending.size }

  /** @internal Every layer this source has opened. */
  _loadedLayers(): Iterable<PcpLayer> { return this._loaded.values() }
}

export interface PcpTargetPathsOptions {
  readonly localOnly?: boolean
  readonly stopProperty?: SdfSpec | null
  readonly includeStopProperty?: boolean
}

export interface PcpTargetPathsResult {
  readonly paths: SdfPath[]
  readonly deletedPaths: SdfPath[]
  readonly errors: PcpError[]
}

// Run a synchronous computation, loading missing layers and retrying.
async function withLayerRetry<T>(source: PcpCacheLayerSource, fn: () => T): Promise<T> {
  for (;;) {
    try {
      return fn()
    } catch (e) {
      if (!(e instanceof PcpNeedsLayer)) throw e
      await source.load(e.identifier)
    }
  }
}

// Pcp_NodeUsesLayerOrLayerStack (dependencies.h).
function nodeUsesLayerOrLayerStack(node: PcpNodeRef, layerOrLayerStack: PcpLayer | PcpLayerStack): boolean {
  return layerOrLayerStack instanceof PcpLayerStack
    ? node.getLayerStack() === layerOrLayerStack
    : node.getLayerStack().hasLayer(layerOrLayerStack)
}

// Pcp_ForEachDependentNodeImpl (dependencies.h).
function forEachDependentNodeImpl(
  sitePath: SdfPath, layerOrLayerStack: PcpLayer | PcpLayerStack, depIndexPath: SdfPath,
  cache: PcpCache, fn: (depIndexPath: SdfPath, node: PcpNodeRef) => void,
): boolean {
  let foundDep = false
  let primIndex: PcpPrimIndex | undefined
  for (let indexPath = depIndexPath.getAbsoluteRootOrPrimPath(); !indexPath.isEmpty();
    indexPath = indexPath.getParentPath()) {
    primIndex = cache.findPrimIndex(indexPath)
    if (primIndex) break
    if (indexPath.isAbsoluteRootPath()) break
  }
  if (primIndex) {
    for (const node of primIndex.getNodeRange()) {
      if (pcpNodeIntroducesDependency(node) && nodeUsesLayerOrLayerStack(node, layerOrLayerStack) &&
          sitePath.hasPrefix(node.getPath())) {
        foundDep = true
        fn(depIndexPath, node)
      }
    }
  }
  return foundDep
}

/**
 * Pcp_ForEachDependentNode (dependencies.h): invoke nodeFn for each node in
 * the prim index at depIndexPath that introduced a dependency on sitePath in
 * the layer stack, and culledDepFn for each matching culled dependency.
 */
export function pcpForEachDependentNode(
  sitePath: SdfPath, layerOrLayerStack: PcpLayer | PcpLayerStack, depIndexPath: SdfPath, cache: PcpCache,
  nodeFn: (depIndexPath: SdfPath, node: PcpNodeRef) => void,
  culledDepFn?: (depIndexPath: SdfPath, dep: PcpCulledDependency) => void,
): void {
  forEachDependentNodeImpl(sitePath, layerOrLayerStack, depIndexPath, cache, nodeFn)
  if (!culledDepFn) return
  for (const dep of cache._primDependencies.getCulledDependencies(depIndexPath)) {
    const usesLayer = layerOrLayerStack instanceof PcpLayerStack
      ? layerOrLayerStack === dep.layerStack : dep.layerStack.hasLayer(layerOrLayerStack)
    if (usesLayer && sitePath.hasPrefix(dep.sitePath)) {
      culledDepFn(depIndexPath, dep)
    }
  }
}

// _ProcessDependentNode (cache.cpp:548-590).
function processDependentNode(
  node: PcpNodeRef, localSitePath: SdfPath, cacheFilterFn: (indexPath: SdfPath) => boolean,
  deps: PcpDependency[],
): void {
  let translated
  if (node.getArcType() === PcpArcType.Relocate) {
    // A relocate node's map function is identity: step out of consecutive
    // relocate nodes by prefix replacement, then translate.
    let parent = node.getParentNode()!
    while (parent.getArcType() === PcpArcType.Relocate) parent = parent.getParentNode()!
    translated = pcpTranslatePathFromNodeToRoot(
      parent, localSitePath.replacePrefix(node.getPath(), parent.getPath()))
  } else {
    translated = pcpTranslatePathFromNodeToRoot(node, localSitePath)
  }
  if (translated.pathWasTranslated && !translated.path.isEmpty() &&
      cacheFilterFn(translated.path)) {
    deps.push(new PcpDependency(translated.path, localSitePath, node.getMapToRoot().evaluate()))
  }
}

// _ProcessCulledDependency (cache.cpp:592-621).
function processCulledDependency(
  dep: PcpCulledDependency, localSitePath: SdfPath,
  cacheFilterFn: (indexPath: SdfPath) => boolean, deps: PcpDependency[],
): void {
  const translated = pcpTranslatePathFromNodeToRootUsingFunction(dep.mapToRoot,
    dep.unrelocatedSitePath.isEmpty()
      ? localSitePath
      : localSitePath.replacePrefix(dep.sitePath, dep.unrelocatedSitePath))
  if (translated.pathWasTranslated && !translated.path.isEmpty() &&
      cacheFilterFn(translated.path)) {
    deps.push(new PcpDependency(translated.path, localSitePath, dep.mapToRoot))
  }
}

export class PcpCache implements PcpPrimIndexCache {
  private _variantFallbacks: Record<string, readonly string[]> = {}
  private readonly _includedPayloads = new Set<string>()
  private readonly _primIndexInputs = new PcpPrimIndexInputs()
  // Default-constructed (null) entries are the implicitly inserted ancestors
  // of computed indexes.
  private readonly _primIndexCache = new SdfPathTable<PcpPrimIndex | null>(null)
  /** @internal */ readonly _primDependencies = new PcpDependencies()
  private readonly _registry: PcpLayerStackRegistry
  private _layerStack: PcpLayerStack | undefined
  private readonly _source: PcpCacheLayerSource
  private readonly _layerStackIdentifier: PcpLayerStackIdentifier
  private readonly _fileFormatTarget: string
  private _computationObserver:
    ((kind: PcpComputationEventKind, path: string) => void) | undefined

  private constructor(
    rootLayer: PcpLayer, opener: PcpLayerOpener, sessionLayer: PcpLayer | undefined,
    payloadPredicate: ((path: string) => boolean) | undefined,
    traceContext: PcpTraceContextHolder,
    fileFormatTarget = '',
  ) {
    traceContexts.set(this, traceContext)
    this._fileFormatTarget = fileFormatTarget
    this._layerStackIdentifier = sessionLayer ? { rootLayer, sessionLayer } : { rootLayer }
    this._source = new PcpCacheLayerSource(opener)
    this._source.seed(rootLayer.filePath, rootLayer)
    if (sessionLayer) this._source.seed(sessionLayer.filePath, sessionLayer)
    this._registry = new PcpLayerStackRegistry(
      this._layerStackIdentifier, true, this._source, fileFormatTarget)
    this._registry._traceHolder = traceContext
    const inputs = this._primIndexInputs
    inputs.cache = this
    inputs.variantFallbacks = this._variantFallbacks
    inputs.includedPayloads = this._includedPayloads
    inputs.includePayloadPredicate = payloadPredicate ?? null
    inputs.cull = true
    inputs.usd = true
    inputs.fileFormatTarget = fileFormatTarget
  }

  // PcpCache::PcpCache (cache.cpp:91-112): fileFormatTarget is specified as
  // the file format target when layers are opened during composition.
  static async create(
    rootLayer: PcpLayer, opener: PcpLayerOpener, sessionLayer?: PcpLayer,
    payloadPredicate?: (path: string) => boolean,
    options: { readonly fileFormatTarget?: string } = {},
  ): Promise<PcpCache> {
    return PcpCache._create(
      rootLayer, opener, sessionLayer, payloadPredicate, undefined, [],
      options.fileFormatTarget ?? '')
  }

  private static async _create(
    rootLayer: PcpLayer, opener: PcpLayerOpener, sessionLayer: PcpLayer | undefined,
    payloadPredicate: ((path: string) => boolean) | undefined,
    logicalContext?: LogicalTraceContext, mutedLayers: Iterable<string> = [],
    fileFormatTarget = '',
  ): Promise<PcpCache> {
    const holder: PcpTraceContextHolder = { current: logicalContext }
    const cache = new PcpCache(
      rootLayer, opener, sessionLayer, payloadPredicate, holder, fileFormatTarget)
    // Layers muted before anything is computed (RequestLayerMuting on an
    // empty cache).
    const toMute = [...mutedLayers].filter(id => id && id !== rootLayer.filePath)
    if (toMute.length > 0) cache._registry.muteAndUnmuteLayers(rootLayer, toMute, [])
    await cache._computeRootLayerStack()
    return cache
  }

  /**
   * @internal A cache whose root layer stack needs no layer loading (for
   * example an anonymous in-memory root layer), created synchronously.
   * Throws PcpNeedsLayer when the root layer stack does need a layer.
   */
  static _createSync(
    rootLayer: PcpLayer, opener: PcpLayerOpener, sessionLayer?: PcpLayer,
    payloadPredicate?: (path: string) => boolean,
  ): PcpCache {
    const cache = new PcpCache(rootLayer, opener, sessionLayer, payloadPredicate, { current: undefined })
    cache.computeLayerStack(cache._layerStackIdentifier, [])
    return cache
  }

  private async _computeRootLayerStack(): Promise<void> {
    const holder = traceContexts.get(this)!
    await _withPcpTraceScope(holder, 'typescript-usd:computePcpLayerStack', async (scope) => {
      _storePcpTraceData(scope, 'rootLayer', this._layerStackIdentifier.rootLayer.filePath)
      const errors: PcpError[] = []
      const previous = holder.current
      if (scope) holder.current = scope
      try {
        await withLayerRetry(this._source, () =>
          this.computeLayerStack(this._layerStackIdentifier, errors))
      } finally {
        holder.current = previous
      }
    })
  }

  /** @internal */ get _layerSource(): PcpCacheLayerSource { return this._source }

  // ---- Parameters -------------------------------------------------------------

  getLayerStackIdentifier(): PcpLayerStackIdentifier { return this._layerStackIdentifier }

  getLayerStack(): PcpLayerStack {
    if (!this._layerStack) throw new Error('PcpCache root layer stack has not been computed')
    return this._layerStack
  }

  hasRootLayerStack(layerStack: PcpLayerStack): boolean { return layerStack === this._layerStack }
  findLayerStack(id: PcpLayerStackIdentifier): PcpLayerStack | undefined { return this._registry.find(id) }
  usesLayerStack(layerStack: PcpLayerStack): boolean { return this._registry.contains(layerStack) }
  findAllLayerStacksUsingLayer(layer: PcpLayer): readonly PcpLayerStack[] {
    return this._registry.findAllUsingLayer(layer)
  }
  forEachLayerStack(fn: (layerStack: PcpLayerStack) => void): void {
    this._registry.forEachLayerStack(fn)
  }
  /** @internal Pcp_LayerStackRegistry::FindAllUsingMutedLayer. */
  _findAllLayerStacksUsingMutedLayer(layerId: string): readonly PcpLayerStack[] {
    return this._registry.findAllUsingMutedLayer(layerId)
  }
  isUsd(): boolean { return true }
  // PcpCache::GetFileFormatTarget (cache.cpp:193-197).
  getFileFormatTarget(): string { return this._fileFormatTarget }
  getPrimIndexInputs(): PcpPrimIndexInputs { return this._primIndexInputs }

  // ComputeLayerStack (cache.cpp:381-394).
  computeLayerStack(id: PcpLayerStackIdentifier, allErrors: PcpError[]): PcpLayerStack {
    const result = this._registry.findOrCreate(id, allErrors)
    if (!this._layerStack && id.rootLayer === this._layerStackIdentifier.rootLayer &&
        id.sessionLayer === this._layerStackIdentifier.sessionLayer &&
        !id.expressionVariablesOverrideSource) {
      this._layerStack = result
    }
    return result
  }

  /** @internal Architecture-test observer; does not participate in cache policy. */
  setComputationObserver(observer?: (kind: PcpComputationEventKind, path: string) => void): void {
    this._computationObserver = observer
  }

  /** @internal Used by the Usd consumer to report work at the retained cache boundary. */
  recordComputationEvent(kind: PcpComputationEventKind, path: string): void {
    this._computationObserver?.(kind, path)
  }

  getVariantFallbacks(): Record<string, readonly string[]> {
    return copyFallbacks(this._variantFallbacks)
  }

  // SetVariantFallbacks (cache.cpp:205-219).
  setVariantFallbacks(fallbacks: Record<string, readonly string[]>, changes?: PcpChanges): void {
    if (fallbackMapsEqual(this._variantFallbacks, fallbacks)) return
    this._variantFallbacks = copyFallbacks(fallbacks)
    this._primIndexInputs.variantFallbacks = this._variantFallbacks
    changes?.didChangeSignificantly(this, SdfPath.absoluteRootPath)
  }

  // ---- Payloads ---------------------------------------------------------------

  isPayloadIncluded(path: PathLike): boolean { return this._includedPayloads.has(toPath(path).pathString) }

  getIncludedPayloads(): readonly string[] { return [...this._includedPayloads].sort() }

  /** @deprecated Use getIncludedPayloads. */
  getIncludedPayloadPaths(): readonly string[] { return this.getIncludedPayloads() }

  // RequestPayloads (cache.cpp:221-262).
  requestPayloads(
    pathsToInclude: Iterable<PathLike>, pathsToExclude: Iterable<PathLike>, changes?: PcpChanges,
  ): void {
    const includes = new Set([...pathsToInclude].map(p => toPath(p).pathString))
    for (const key of includes) {
      const path = SdfPath.fromString(key)
      if (!path.isPrimPath()) continue
      if (this._includedPayloads.has(key)) continue
      this._includedPayloads.add(key)
      changes?.didChangeSignificantly(this, path)
    }
    for (const p of pathsToExclude) {
      const path = toPath(p)
      if (!path.isPrimPath() || includes.has(path.pathString)) continue
      if (this._includedPayloads.delete(path.pathString)) changes?.didChangeSignificantly(this, path)
    }
  }

  // ---- Muting -----------------------------------------------------------------

  // RequestLayerMuting (cache.cpp:264-352). Without a PcpChanges the changes
  // are computed and applied here (Pcp_CacheChangesHelper).
  async requestLayerMuting(
    layersToMute: readonly string[], layersToUnmute: readonly string[], changes?: PcpChanges,
  ): Promise<{ newLayersMuted: string[]; newLayersUnmuted: string[] }> {
    const result = pcpRunMaybeAsync(this._requestLayerMuting(layersToMute, layersToUnmute, changes))
    return result instanceof Promise ? await result : result
  }

  /** @internal RequestLayerMuting, continuing asynchronously only if a layer must load. */
  *_requestLayerMuting(
    layersToMute: readonly string[], layersToUnmute: readonly string[], changes?: PcpChanges,
  ): PcpMaybeAsync<{ newLayersMuted: string[]; newLayersUnmuted: string[] }> {
    const finalMute: string[] = []
    for (const layer of layersToMute) {
      if (!layer) continue
      // TF_CODING_ERROR upstream, raised as an exception in Python.
      if (this._source.find(layer) === this._layerStackIdentifier.rootLayer ||
          layer === this._layerStackIdentifier.rootLayer.filePath) {
        throw new Error(`Cannot mute cache's root layer @${layer}@`)
      }
      finalMute.push(layer)
    }
    const finalUnmute = layersToUnmute.filter(layer => layer && !layersToMute.includes(layer))
    if (finalMute.length === 0 && finalUnmute.length === 0) {
      return { newLayersMuted: [], newLayersUnmuted: [] }
    }
    this._registry.muteAndUnmuteLayers(this._layerStackIdentifier.rootLayer, finalMute, finalUnmute)
    const cacheChanges = changes ?? new PcpChanges()
    yield* cacheChanges._didMuteAndUnmuteLayersMaybeAsync(this, finalMute, finalUnmute)
    // Unmuting the root layer of a reference or payload layer stack is not
    // handled above, as prim indexing skipped computing that layer stack;
    // treat it as reloading the unmuted asset.
    if (finalUnmute.length > 0) {
      for (const [, primIndex] of this._primIndexCache) {
        if (!primIndex?.isValid()) continue
        for (const error of primIndex.getLocalErrors()) {
          if (error.errorType !== PcpErrorType.MutedAssetPath) continue
          if (!finalUnmute.includes(error.resolvedAssetPath)) continue
          yield* cacheChanges._didMaybeFixAssetMaybeAsync(this, error.site,
            error.sourceLayer as PcpLayer | undefined, error.resolvedAssetPath)
        }
      }
    }
    if (!changes) yield* cacheChanges._applyMaybeAsync()
    return { newLayersMuted: finalMute, newLayersUnmuted: finalUnmute }
  }

  getMutedLayers(): readonly string[] { return this._registry.getMutedLayers() }

  // IsLayerMuted (cache.cpp:360-373): the canonical muted identifier when
  // `layerId`, anchored to `anchorLayer`, is muted.
  isLayerMuted(anchorLayer: PcpLayerHandle, layerId: string): string | undefined {
    return this._registry.isLayerMuted(anchorLayer, layerId)
  }

  isLayerMutedById(layerId: string): boolean {
    return this._registry.isLayerMuted(this._layerStackIdentifier.rootLayer, layerId) !== undefined
  }

  // ---- Prim indexes -----------------------------------------------------------

  /** PcpCache::FindPrimIndex: never computes a missing index. */
  findPrimIndex(path: PathLike): PcpPrimIndex | undefined {
    const index = this._primIndexCache.get(toPath(path))
    return index?.isValid() ? index : undefined
  }

  /** PcpCache::ForEachPrimIndex over the computed indexes. */
  forEachPrimIndex(callback: (index: PcpPrimIndex) => void): void {
    for (const [, index] of this._primIndexCache) if (index?.isValid()) callback(index)
  }

  // PcpCache::ComputePrimIndex(path, allErrors) (cache.h:280): errors
  // from computing an index not already cached are appended to allErrors.
  async computePrimIndex(path: PathLike, allErrors?: PcpError[]): Promise<PcpPrimIndex> {
    return this._computePrimIndex(toPath(path).pathString, undefined, allErrors)
  }

  private async _computePrimIndex(
    path: string,
    parentTraceContext: LogicalTraceContext | undefined = traceContexts.get(this)?.current,
    allErrors?: PcpError[],
  ): Promise<PcpPrimIndex> {
    this.recordComputationEvent('primIndexRequest', path)
    const sdfPath = SdfPath.fromString(path)
    const retained = this.findPrimIndex(sdfPath)
    if (retained) return retained
    const holder = traceContexts.get(this) ?? { current: undefined }
    const compute = (scope: LogicalTraceContext | undefined): Promise<PcpPrimIndex> =>
      withLayerRetry(this._source, () => _withPcpTraceScopeSync(
        holder, 'typescript-usd:PcpPrimIndexer.buildPrimIndex', (inner) => {
          _storePcpTraceData(inner, 'primPath', path)
          const attemptErrors: PcpError[] = []
          const index = this._computePrimIndexWithCompatibleInputs(
            sdfPath, this._primIndexInputs, attemptErrors)
          allErrors?.push(...attemptErrors)
          return index
        }, scope))
    if (parentTraceContext === undefined) return compute(undefined)
    return _withPcpTraceScope(holder, 'typescript-usd:PcpCache.computePrimIndex', (scope) => {
      _storePcpTraceData(scope, 'primPath', path)
      return compute(scope)
    }, parentTraceContext)
  }

  /** Synchronous PcpCache::ComputePrimIndex. Throws PcpNeedsLayer when a layer must load. */
  computePrimIndexSync(path: PathLike, allErrors: PcpError[] = []): PcpPrimIndex {
    return this._computePrimIndexWithCompatibleInputs(toPath(path), this._primIndexInputs, allErrors)
  }

  /**
   * PcpCache::ComputeRelationshipTargetPaths (cache.cpp:402-439). Returns the
   * composed target paths, the deleted paths and the errors.
   */
  async computeRelationshipTargetPaths(
    relPath: PathLike, options: PcpTargetPathsOptions = {},
  ): Promise<PcpTargetPathsResult> {
    return withLayerRetry(this._source, () =>
      this.computeRelationshipTargetPathsSync(relPath, options))
  }

  /** Synchronous ComputeRelationshipTargetPaths. Throws PcpNeedsLayer when a layer must load. */
  computeRelationshipTargetPathsSync(
    relPath: PathLike, options: PcpTargetPathsOptions = {},
  ): PcpTargetPathsResult {
    return this._computeTargetPaths(toPath(relPath), 'relationship', options)
  }

  /** PcpCache::ComputeAttributeConnectionPaths (cache.cpp:441-478). */
  async computeAttributeConnectionPaths(
    attrPath: PathLike, options: PcpTargetPathsOptions = {},
  ): Promise<PcpTargetPathsResult> {
    return withLayerRetry(this._source, () =>
      this.computeAttributeConnectionPathsSync(attrPath, options))
  }

  /** Synchronous ComputeAttributeConnectionPaths. Throws PcpNeedsLayer when a layer must load. */
  computeAttributeConnectionPathsSync(
    attrPath: PathLike, options: PcpTargetPathsOptions = {},
  ): PcpTargetPathsResult {
    return this._computeTargetPaths(toPath(attrPath), 'attribute', options)
  }

  private _computeTargetPaths(
    path: SdfPath, relOrAttrType: SdfSpecType, options: PcpTargetPathsOptions,
  ): PcpTargetPathsResult {
    if (!path.isPropertyPath()) {
      throw new Error(`Path <${path.pathString}> must be ${
        relOrAttrType === 'relationship' ? 'a relationship' : 'an attribute'} path`)
    }
    // USD does not cache property indexes, but we can still build one to
    // get the targets (PcpBuildPropertyIndex).
    const allErrors: PcpError[] = []
    const propIndex = _pcpBuildPropertyIndexSync(path, this, allErrors)
    const [targetIndex, deletedPaths] = pcpBuildFilteredTargetIndex(
      pcpSite(this.getLayerStackIdentifier(), path.pathString),
      propIndex, relOrAttrType,
      options.localOnly ?? false, options.stopProperty ?? null,
      options.includeStopProperty ?? false, this, allErrors)
    return { paths: targetIndex.paths, deletedPaths: [...deletedPaths], errors: allErrors }
  }

  // _ComputePrimIndexWithCompatibleInputs (cache.cpp:1741-1790).
  /** @internal */
  _computePrimIndexWithCompatibleInputs(
    path: SdfPath, inputs: PcpPrimIndexInputs, allErrors: PcpError[],
  ): PcpPrimIndex {
    const cached = this._primIndexCache.get(path)
    if (cached?.isValid()) return cached
    if (!this._layerStack) this.computeLayerStack(this._layerStackIdentifier, allErrors)
    this.recordComputationEvent('primIndexCompute', path.pathString)
    const outputs = new PcpPrimIndexOutputs()
    pcpComputePrimIndex(path, this._layerStack!, inputs, outputs)
    allErrors.push(...outputs.allErrors)
    this._primDependencies.add(outputs.primIndex, outputs.culledDependencies,
      outputs.dynamicFileFormatDependency, outputs.expressionVariablesDependency)
    if (outputs.payloadState === PcpPrimIndexOutputs.PayloadState.IncludedByPredicate) {
      this._includedPayloads.add(path.pathString)
    }
    if (outputs.payloadState === PcpPrimIndexOutputs.PayloadState.ExcludedByPredicate) {
      this._includedPayloads.delete(path.pathString)
    }
    this._primIndexCache.set(path, outputs.primIndex)
    return outputs.primIndex
  }

  /**
   * PcpCache::ComputePrimIndexesInParallel (cache.cpp:1687-1733): computes
   * `roots` and, while `childrenPredicate` accepts, their namespace
   * descendants. Prims are visited (predicate, errors, events) in depth-first
   * order; while a prim waits for a layer, prims already queued behind it are
   * computed ahead so their layers load concurrently, as upstream's parallel
   * indexing opens layers from several threads at once.
   */
  async computePrimIndexesInParallel(
    roots: PathLike | readonly PathLike[],
    childrenPredicate: (index: PcpPrimIndex, childNames: string[]) => boolean,
    payloadPredicate: (path: string) => boolean,
  ): Promise<readonly PcpError[]> {
    const result = pcpRunMaybeAsync(
      this._computePrimIndexesInParallel(roots, childrenPredicate, payloadPredicate))
    return result instanceof Promise ? await result : result
  }

  /** @internal ComputePrimIndexesInParallel, continuing asynchronously only if a layer must load. */
  *_computePrimIndexesInParallel(
    roots: PathLike | readonly PathLike[],
    childrenPredicate: (index: PcpPrimIndex, childNames: string[]) => boolean,
    payloadPredicate: (path: string) => boolean,
  ): PcpMaybeAsync<readonly PcpError[]> {
    const errors: PcpError[] = []
    const inputs = this._primIndexInputs.clone()
    inputs.includePayloadPredicate = payloadPredicate
    const pending = (Array.isArray(roots) ? [...roots] : [roots as PathLike]).map(toPath)
    // Indexes computed ahead of their visit, with the errors their
    // computation reported.
    const computed = new Map<string, { index: PcpPrimIndex, errors: PcpError[] }>()
    // Prims computed ahead that wait for a layer, until it settles.
    const waiting = new Set<string>()
    const attempt = (path: SdfPath): { index: PcpPrimIndex, errors: PcpError[] } | Promise<void> => {
      const attemptErrors: PcpError[] = []
      try {
        return { index: this._computePrimIndexWithCompatibleInputs(path, inputs, attemptErrors), errors: attemptErrors }
      } catch (e) {
        if (!(e instanceof PcpNeedsLayer)) throw e
        return this._source.load(e.identifier)
      }
    }
    const computeAhead = () => {
      let loads = this._source.pendingLoadCount()
      for (let i = 0; i < pending.length && i < COMPUTE_AHEAD_PRIMS && loads < COMPUTE_AHEAD_LOADS; i++) {
        const path = pending[i]!, key = path.pathString
        if (computed.has(key) || waiting.has(key)) continue
        let result: ReturnType<typeof attempt>
        // A failure other than a missing layer is reported when the prim is
        // visited, in order.
        try { result = attempt(path) } catch { continue }
        if (result instanceof Promise) {
          waiting.add(key)
          loads = this._source.pendingLoadCount()
          void result.finally(() => waiting.delete(key))
        } else {
          computed.set(key, result)
        }
      }
    }
    while (pending.length > 0) {
      const path = pending.shift()!
      this.recordComputationEvent('primIndexRequest', path.pathString)
      let result = computed.get(path.pathString)
      computed.delete(path.pathString)
      while (!result) {
        const next = attempt(path)
        if (!(next instanceof Promise)) { result = next; break }
        computeAhead()
        yield next
      }
      errors.push(...result.errors)
      const index = result.index
      const names = index.computePrimChildNames()
      if (!childrenPredicate(index, names)) continue
      pending.unshift(...names.map(name => path.appendChild(name)))
    }
    return errors
  }

  // ---- Dynamic file format / expression variable dependencies -------------------

  hasAnyDynamicFileFormatArgumentFieldDependencies(): boolean {
    return this._primDependencies.hasAnyDynamicFileFormatArgumentFieldDependencies()
  }

  hasAnyDynamicFileFormatArgumentAttributeDependencies(): boolean {
    return this._primDependencies.hasAnyDynamicFileFormatArgumentAttributeDependencies()
  }

  isPossibleDynamicFileFormatArgumentField(name: string): boolean {
    return this._primDependencies.isPossibleDynamicFileFormatArgumentField(name)
  }

  isPossibleDynamicFileFormatArgumentAttribute(name: string): boolean {
    return this._primDependencies.isPossibleDynamicFileFormatArgumentAttribute(name)
  }

  getDynamicFileFormatArgumentDependencyData(path: PathLike): PcpDynamicFileFormatDependencyData {
    return this._primDependencies.getDynamicFileFormatArgumentDependencyData(toPath(path)) ??
      new PcpDynamicFileFormatDependencyData()
  }

  getPrimsUsingExpressionVariablesFromLayerStack(layerStack: PcpLayerStack): readonly SdfPath[] {
    return this._primDependencies.getPrimsUsingExpressionVariablesFromLayerStack(layerStack)
  }

  getExpressionVariablesFromLayerStackUsedByPrim(
    primIndexPath: PathLike, layerStack: PcpLayerStack,
  ): ReadonlySet<string> {
    return this._primDependencies.getExpressionVariablesFromLayerStackUsedByPrim(
      toPath(primIndexPath), layerStack)
  }

  // ---- Used layers and site dependencies -----------------------------------------

  // GetUsedLayers (cache.cpp:478-490): layers of layer stacks with stored
  // dependencies, plus the cache's own layer stack.
  getUsedLayers(): Set<PcpLayer> {
    const layers = this._primDependencies.getUsedLayers()
    for (const { layer } of this._layerStack?.layers ?? []) layers.add(layer)
    return layers
  }

  // GetUsedLayersRevision (cache.cpp:492-496).
  getUsedLayersRevision(): number { return this._primDependencies.getLayerStacksRevision() }

  // GetUsedRootLayers (cache.cpp:498-507).
  getUsedRootLayers(): Set<PcpLayer> {
    const layers = this._primDependencies.getUsedRootLayers()
    layers.add(this._layerStackIdentifier.rootLayer as PcpLayer)
    return layers
  }

  /**
   * FindSiteDependencies (cache.cpp:509-840): the dependencies on the given
   * site in a layer stack, or in every layer stack using the given layer
   * (folding in the layer's sublayer offset).
   */
  findSiteDependencies(
    siteLayerOrLayerStack: PcpLayer | PcpLayerStack, sitePathLike: PathLike,
    depMask: PcpDependencyFlags, recurseOnSite: boolean, recurseOnIndex: boolean,
    filterForExistingCachesOnly: boolean,
  ): PcpDependency[] {
    const sitePath = toPath(sitePathLike)
    if (!(siteLayerOrLayerStack instanceof PcpLayerStack)) {
      const layer = siteLayerOrLayerStack
      const result: PcpDependency[] = []
      for (const layerStack of this.findAllLayerStacksUsingLayer(layer)) {
        const offset = layerStack.getLayerOffsetForLayer(layer)
        for (const dep of this.findSiteDependencies(layerStack, sitePath, depMask,
          recurseOnSite, recurseOnIndex, filterForExistingCachesOnly)) {
          if (offset) dep.mapFunc = dep.mapFunc.composeOffset(offset)
          result.push(dep)
        }
      }
      return result
    }
    const siteLayerStack = siteLayerOrLayerStack
    const deps: PcpDependency[] = []
    if (!(depMask & (PcpDependencyType.Virtual | PcpDependencyType.NonVirtual))) return deps
    if (!(depMask & (PcpDependencyType.Root | PcpDependencyType.Direct |
      PcpDependencyType.Ancestral))) return deps
    if ((depMask & PcpDependencyType.Root) && !(depMask & PcpDependencyType.NonVirtual)) return deps
    if (siteLayerStack._registry !== this._registry) return deps

    const cacheFilterFn = (indexPath: SdfPath): boolean => {
      if (!filterForExistingCachesOnly) return true
      if (indexPath.isAbsoluteRootOrPrimPath()) return this.findPrimIndex(indexPath) !== undefined
      // USD mode stores no property indexes: check the owning prim.
      if (indexPath.isPropertyPath()) return this.findPrimIndex(indexPath.getParentPath()) !== undefined
      return false
    }

    // Arcs connect prim, prim variant and absolute root paths; examine
    // structure at the enclosing prim level.
    let sitePrimPath = sitePath
    if (!sitePath.isPrimOrPrimVariantSelectionPath()) {
      sitePrimPath = sitePath.isAbsoluteRootPath()
        ? sitePath : sitePath.getPrimOrPrimVariantSelectionPath()
    }

    // The root dependency. Sites with variant selections never are.
    if ((depMask & PcpDependencyType.Root) && siteLayerStack === this._layerStack &&
        !sitePath.containsPrimVariantSelection() && cacheFilterFn(sitePath)) {
      deps.push(new PcpDependency(sitePath, sitePath, PcpMapFunction.identity()))
    }

    const visitSiteFn = (depPrimIndexPath: SdfPath, depPrimSitePath: SdfPath): void => {
      const isSitePrim = depPrimSitePath.pathString === sitePrimPath.pathString
      // Recursing on a property site must not reach its siblings.
      if (!isSitePrim && depPrimSitePath.hasPrefix(sitePrimPath) &&
          !depPrimSitePath.hasPrefix(sitePath)) return
      // An ancestor's direct dependencies are ancestral for descendants.
      const localMask = !isSitePrim && sitePrimPath.hasPrefix(depPrimSitePath)
        ? (depMask | PcpDependencyType.Direct) : depMask
      // Below the site, use that site; otherwise the requested one.
      const localSitePath = !isSitePrim && depPrimSitePath.hasPrefix(sitePrimPath)
        ? depPrimSitePath : sitePath
      pcpForEachDependentNode(depPrimSitePath, siteLayerStack, depPrimIndexPath, this,
        (_indexPath, node) => {
          if (localMask !== PcpDependencyType.AnyIncludingVirtual) {
            const flags = pcpClassifyNodeDependency(node)
            if ((flags & localMask) !== flags) return
          }
          processDependentNode(node, localSitePath, cacheFilterFn, deps)
        },
        (_indexPath, dep) => {
          if (localMask !== PcpDependencyType.AnyIncludingVirtual) {
            if ((dep.flags & localMask) !== dep.flags) return
          }
          processCulledDependency(dep, localSitePath, cacheFilterFn, deps)
        })
    }
    this._primDependencies.forEachDependencyOnSite(siteLayerStack, sitePrimPath,
      (depMask & PcpDependencyType.Ancestral) !== 0, recurseOnSite, visitSiteFn)

    // Cached descendants that introduced no new arcs are dependent too.
    if (recurseOnIndex) {
      const seenDeps: SdfPath[] = []
      const expandedDeps: PcpDependency[] = []
      for (const dep of deps) {
        const indexPath = dep.indexPath
        if (seenDeps.some(seen => indexPath.hasPrefix(seen))) continue
        seenDeps.push(indexPath)
        expandedDeps.push(dep)
        if (indexPath.isAbsoluteRootOrPrimPath()) {
          let first = true
          this._primIndexCache.forEachInSubtree(indexPath, (subPath, subPrimIndex) => {
            if (first) { first = false; return }
            if (subPrimIndex?.isValid()) {
              expandedDeps.push(new PcpDependency(
                subPath, subPath.replacePrefix(indexPath, dep.sitePath), dep.mapFunc))
            }
          })
        }
      }
      return expandedDeps
    }
    return deps
  }

  // ---- Change processing --------------------------------------------------------

  // Apply (cache.cpp:1006-1158).
  apply(changes: PcpCacheChanges, lifeboat: PcpLifeboat): void {
    if (changes.didChangeSignificantly.has(SdfPath.absoluteRootPath)) {
      this._primIndexCache.clear()
      this._primDependencies.removeAll(lifeboat)
    } else {
      if (changes.didMaybeChangeLayers) this._primDependencies.layerStacksChanged()
      for (const path of changes.didChangeSignificantly) {
        if (path.isPrimPath()) this._removePrimAndPropertyCaches(path, lifeboat)
      }
      for (const path of changes.didChangePrims) this._removePrimCache(path, lifeboat)

      const updateSpecStacks = (path: SdfPath): void => {
        if (!path.isAbsoluteRootOrPrimPath()) return
        const primIndex = this.findPrimIndex(path)
        if (!primIndex) return
        pcpRescanForSpecs(primIndex, true, true)
        // Discard the index if no node has specs left.
        if (!primIndex.getNodeRange().some(node => node.hasSpecs)) {
          this._removePrimAndPropertyCaches(path, lifeboat)
        }
      }
      for (const path of changes.didChangeSpecs) updateSpecStacks(path)
      for (const path of changes._didChangeSpecsInternal) updateSpecStacks(path)
      for (const root of changes._didChangePrimSpecsAndChildrenInternal) {
        this._primIndexCache.forEachInSubtree(root, (_path, primIndex) => {
          if (primIndex?.isValid()) pcpRescanForSpecs(primIndex, true, true)
        })
      }

      for (const [, newPath] of changes.didChangePath) {
        if (!newPath.isEmpty()) this._removePrimAndPropertyCaches(newPath, lifeboat)
      }
      for (const [oldPath] of changes.didChangePath) {
        this._removePrimAndPropertyCaches(oldPath, lifeboat)
      }
    }

    // Fix up payload paths for renames, in order.
    const newIncludes: SdfPath[] = []
    for (const [oldPath, newPath] of changes.didChangePath) {
      for (const key of [...this._includedPayloads]) {
        const payloadPath = SdfPath.fromString(key)
        if (payloadPath.hasPrefix(oldPath)) {
          newIncludes.push(payloadPath.replacePrefix(oldPath, newPath))
          this._includedPayloads.delete(key)
        }
      }
      for (let i = 0; i < newIncludes.length; i++) {
        if (newIncludes[i]!.hasPrefix(oldPath)) {
          newIncludes[i] = newIncludes[i]!.replacePrefix(oldPath, newPath)
        }
      }
    }
    for (const path of newIncludes) this._includedPayloads.add(path.pathString)

    this._expireUnusedLayerStacks(lifeboat)
  }

  // Upstream's registry holds layer stacks weakly (layerStackRegistry.cpp:
  // 237-258): a layer stack expires once no prim index node, dependency,
  // change lifeboat or the cache itself (cache.h:_layerStack) references it.
  // Applying changes is when cached indexes and dependencies are released,
  // so expire the layer stacks nothing here retains any more.
  private _expireUnusedLayerStacks(lifeboat: PcpLifeboat): void {
    const retained = new Set<PcpLayerStack>(lifeboat.getLayerStacks())
    if (this._layerStack) retained.add(this._layerStack)
    for (const [, primIndex] of this._primIndexCache) {
      if (!primIndex?.isValid()) continue
      for (const node of primIndex.getNodeRange()) retained.add(node.getLayerStack())
    }
    this._primDependencies._forEachRetainedLayerStack(layerStack => retained.add(layerStack))
    for (const layerStack of this._registry.getAllLayerStacks()) {
      if (!retained.has(layerStack)) this._registry._remove(layerStack)
    }
  }

  // Reload (cache.cpp:1160-1213): record changes for invalid sublayers and
  // asset paths that may now resolve, then reload every used layer except
  // session layers.
  async reload(changes: PcpChanges): Promise<void> {
    if (!this._layerStack) return
    for (const layerStack of this._registry.getAllLayerStacks()) {
      for (const e of layerStack.localErrors) {
        if (e.errorType === PcpErrorType.InvalidSublayerPath) {
          await changes.didMaybeFixSublayer(this, e.layer as PcpLayer, e.sublayerPath)
        }
      }
    }
    for (const [, primIndex] of this._primIndexCache) {
      if (!primIndex?.isValid()) continue
      for (const e of primIndex.getLocalErrors()) {
        if (e.errorType === PcpErrorType.InvalidAssetPath) {
          await changes.didMaybeFixAsset(this, e.site, e.sourceLayer as PcpLayer | undefined,
            e.resolvedAssetPath)
        }
      }
    }
    const layersToReload = this.getUsedLayers()
    for (const layer of this._layerStack.getSessionLayers()) layersToReload.delete(layer)
    await reloadLayers(layersToReload)
  }

  // ReloadReferences (cache.cpp:1215-1270).
  async reloadReferences(changes: PcpChanges, primPathLike: PathLike): Promise<void> {
    const primPath = toPath(primPathLike)
    const layerStacksAtOrUnderPrim = new Set<PcpLayerStack>()
    for (const [, primIndex] of this._primIndexCache.findSubtreeRange(primPath)) {
      if (!primIndex?.isValid()) continue
      for (const e of primIndex.getLocalErrors()) {
        if (e.errorType === PcpErrorType.InvalidAssetPath) {
          await changes.didMaybeFixAsset(this, e.site, e.sourceLayer as PcpLayer | undefined,
            e.resolvedAssetPath)
        }
      }
      for (const node of primIndex.getNodeRange()) layerStacksAtOrUnderPrim.add(node.getLayerStack())
    }
    for (const layerStack of layerStacksAtOrUnderPrim) {
      for (const e of layerStack.localErrors) {
        if (e.errorType === PcpErrorType.InvalidSublayerPath) {
          await changes.didMaybeFixSublayer(this, e.layer as PcpLayer, e.sublayerPath)
        }
      }
    }
    const layersToReload = new Set<PcpLayer>()
    for (const layerStack of layerStacksAtOrUnderPrim) {
      for (const { layer } of layerStack.layers) {
        if (!this._layerStack!.hasLayer(layer)) layersToReload.add(layer)
      }
    }
    await reloadLayers(layersToReload)
  }

  // _RemovePrimCache (cache.cpp:1272-1281).
  private _removePrimCache(primPath: SdfPath, lifeboat: PcpLifeboat): void {
    const primIndex = this._primIndexCache.get(primPath)
    if (primIndex === undefined) return
    if (primIndex) this._primDependencies.remove(primIndex, lifeboat)
    this._primIndexCache.set(primPath, null)
  }

  // _RemovePrimAndPropertyCaches (cache.cpp:1283-1298).
  private _removePrimAndPropertyCaches(root: SdfPath, lifeboat: PcpLifeboat): void {
    if (!this._primIndexCache.has(root)) return
    this._primIndexCache.forEachInSubtree(root, (_path, primIndex) => {
      if (primIndex) this._primDependencies.remove(primIndex, lifeboat)
    })
    this._primIndexCache.erase(root)
  }
}

// SdfLayer::ReloadLayers over layers that support reloading.
async function reloadLayers(layers: Iterable<PcpLayer>): Promise<void> {
  for (const layer of layers) {
    const reloadable = layer as PcpLayer & { reload?(): Promise<boolean> }
    if (reloadable.reload) await reloadable.reload()
  }
}

/** @internal Private cross-package composition instrumentation seam. */
export function _createPcpCacheWithTraceContext(
  rootLayer: PcpLayer, opener: PcpLayerOpener, sessionLayer: PcpLayer | undefined,
  payloadPredicate: (path: string) => boolean,
  traceContext: LogicalTraceContext | undefined,
  mutedLayers: Iterable<string> = [],
): Promise<PcpCache> {
  const cacheType = PcpCache as unknown as {
    _create(
      rootLayer: PcpLayer, opener: PcpLayerOpener, sessionLayer: PcpLayer | undefined,
      payloadPredicate: (path: string) => boolean,
      traceContext: LogicalTraceContext | undefined, mutedLayers: Iterable<string>,
    ): Promise<PcpCache>
  }
  return cacheType._create(
    rootLayer, opener, sessionLayer, payloadPredicate, traceContext, mutedLayers)
}

/** @internal Private cross-package composition instrumentation seam. */
export function _getPcpTraceContext(cache: PcpCache): LogicalTraceContext | undefined {
  return traceContexts.get(cache)?.current
}

/** @internal Private cross-package composition instrumentation seam. */
export function _setPcpTraceContext(
  cache: PcpCache, traceContext: LogicalTraceContext | undefined,
): void {
  const holder = traceContexts.get(cache)
  if (holder) holder.current = traceContext
}

/** @internal Installs a retained-cache context for one operation only. */
export async function _withPcpTraceContext<T>(
  cache: PcpCache, traceContext: LogicalTraceContext | undefined,
  fn: () => T | PromiseLike<T>,
): Promise<T> {
  const holder = traceContexts.get(cache)
  if (!holder) return await fn()
  const token = {}
  const installations = holder.installations ??= []
  if (installations.length === 0) {
    if (holder.current) holder.base = holder.current
    else delete holder.base
  }
  installations.push({ token, context: traceContext })
  holder.current = traceContext
  try {
    return await fn()
  } finally {
    const index = installations.findIndex(entry => entry.token === token)
    if (index >= 0) installations.splice(index, 1)
    holder.current = installations.at(-1)?.context ?? holder.base
    if (installations.length === 0) delete holder.base
  }
}

/** @internal Identity-preserving parent propagation for the Usd consumer. */
export function _computePcpPrimIndexWithTraceContext(
  cache: PcpCache, path: string, traceContext: LogicalTraceContext | undefined,
): Promise<PcpPrimIndex> {
  const tracedCache = cache as unknown as {
    _computePrimIndex(path: string, traceContext: LogicalTraceContext | undefined): Promise<PcpPrimIndex>
  }
  return tracedCache._computePrimIndex(path, traceContext)
}

function copyFallbacks(value: Record<string, readonly string[]>): Record<string, readonly string[]> {
  return Object.fromEntries(Object.entries(value).map(([key, selections]) => [key, [...selections]]))
}

function fallbackMapsEqual(
  a: Record<string, readonly string[]>, b: Record<string, readonly string[]>,
): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  return aKeys.length === bKeys.length && aKeys.every((key) => {
    const left = a[key]
    const right = b[key]
    return right !== undefined && left?.length === right.length
      && left.every((selection, index) => selection === right[index])
  })
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
