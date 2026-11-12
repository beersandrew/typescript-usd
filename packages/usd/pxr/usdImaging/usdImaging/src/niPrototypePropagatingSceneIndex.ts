// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/niPrototypePropagatingSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/niPrototypePropagatingSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/niPrototypePropagatingSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - Lifetime. Upstream, _SceneIndexCache holds weak pointers (TfWeakPtr) to
//   the scene indices it creates; they live as long as some
//   UsdImagingNiPrototypePropagatingSceneIndex references them, and a scene
//   index stops observing its input when it is deleted. JavaScript has
//   neither weak scene-index pointers with deterministic expiry nor
//   destructors, so the cache counts the propagating scene indices using an
//   entry (_SceneIndices1.refCount) and, when the count drops to zero,
//   destroys the scene indices it created (destroy() detaches each filtering
//   scene index from its input) and clears the entry, which is what the
//   expired weak pointer means upstream. The isolating scene index expires
//   when no _SceneIndices1 of its prototype is alive (upstream it is kept
//   alive by the prototype scene indices built on it).
//   UsdImagingNiPrototypePropagatingSceneIndex.destroy() stands for the
//   destructor; scene indices dropped from
//   _instancersToPropagatedPrototypeSceneIndex are destroyed after the
//   batched merging scene index operations are applied.
// - _MergingSceneIndexOperations is RAII upstream; here Apply() is called
//   explicitly where the C++ object goes out of scope.
// - HdEncapsulatingSceneIndexBase is not ported in hd; GetEncapsulatedScenes
//   is kept as a plain method.
// - TF_DEFINE_ENV_SETTING USDIMAGING_SHOW_NATIVE_PROTOTYPE_SCENE_INDICES is
//   a static flag (default false, as upstream).

import {
  DataSourceHash as HdDataSourceHash,
  DataSourceLocator as HdDataSourceLocator,
  FilteringSceneIndexBase as HdFilteringSceneIndexBase,
  FlatteningSceneIndex as HdFlatteningSceneIndex,
  MergingSceneIndex as HdMergingSceneIndex,
  PrimvarsSchema as HdPrimvarsSchema,
  SceneIndexPrimView as HdSceneIndexPrimView,
  SkinningSettings as HdSkinningSettings,
  type AddedPrimEntry, type ContainerDataSource as HdContainerDataSource,
  type DirtiedPrimEntry, type MergingInputScene as HdMergingInputScene,
  type RemovedPrimEntry, type RenamedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase, type SceneIndexObserver as HdSceneIndexObserver,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { UsdSkelTokens } from 'typescript-usd/usdSkel'
import { UsdImaging_DataSourceRelocatingSceneIndex } from './dataSourceRelocatingSceneIndex.ts'
import { UsdImagingFlattenedDataSourceProviders } from './flattenedDataSourceProviders.ts'
import { UsdImagingModelSchema, UsdImagingModelSchemaTokens } from './modelSchema.ts'
import { UsdImaging_NiInstanceAggregationSceneIndex } from './niInstanceAggregationSceneIndex.ts'
import { UsdImaging_NiPrototypePruningSceneIndex } from './niPrototypePruningSceneIndex.ts'
import { UsdImaging_NiPrototypeSceneIndex } from './niPrototypeSceneIndex.ts'
import { UsdImaging_ConvertPrimsRenamedToRemovedAndAdded } from './piPrototypePropagatingSceneIndex.ts'
import { UsdImagingRerootingSceneIndex } from './rerootingSceneIndex.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** niPrototypePropagatingSceneIndex.cpp:31-35 */
const USDIMAGING_SHOW_NATIVE_PROTOTYPE_SCENE_INDICES = false

const _HasPrefix = (path: string, prefix: string): boolean =>
  prefix === '/' ? path.startsWith('/') : path === prefix || path.startsWith(prefix + '/')
/** SdfPath operator< for prim paths (element-wise comparison). */
const _ComparePaths = (a: string, b: string): number => {
  const ea = a === '/' ? [] : a.slice(1).split('/')
  const eb = b === '/' ? [] : b.slice(1).split('/')
  const n = Math.min(ea.length, eb.length)
  for (let i = 0; i < n; ++i) {
    if (ea[i] !== eb[i]) return ea[i]! < eb[i]! ? -1 : 1
  }
  return ea.length - eb.length
}

/** Port lifetime helper: destroys the filtering scene indices from `top`
 *  down its first input, stopping at (and not destroying) `stop`. */
function _DestroyChain(top: HdSceneIndexBase | undefined, stop: HdSceneIndexBase | undefined): void {
  let si = top
  while (si && si !== stop) {
    const next = si instanceof HdFilteringSceneIndexBase ? si.getInputScenes()[0] : undefined
    const destroyable = si as unknown as { destroy?: () => void }
    if (typeof destroyable.destroy === 'function') {
      destroyable.destroy()
    }
    si = next
  }
}

/** niPrototypePropagatingSceneIndex.h:313-315 */
export type UsdImagingNiPrototypePropagatingSceneIndexSceneIndexAppendCallback =
  (inputScene: HdSceneIndexBase) => HdSceneIndexBase

type _Hash = number | bigint

// Scene indices that can only be created if we have both
// the prototype name and the overlay data source.
interface _SceneIndices1 {
  instanceAggregationSceneIndex: HdSceneIndexBase | undefined
  prototypeSceneIndex: HdSceneIndexBase | undefined
  /** Port: number of live propagating scene indices holding these. */
  refCount: number
}

// Scene indices that can be created if we have only the
// prototype name.
interface _SceneIndices2 {
  isolatingSceneIndex: HdSceneIndexBase | undefined
  hashToSceneIndices: Map<_Hash, _SceneIndices1>
}

/**
 * niPrototypePropagatingSceneIndex.cpp:37-290.
 *
 * Caches scene indices for each USD prototype.
 *
 * Stores weak ptr's to the scene indices.
 */
class _SceneIndexCache {
  // Nested map.
  private readonly _prototypeToBindingHashToSceneIndices = new Map<string, _SceneIndices2>()

  constructor(
    private readonly _inputSceneIndex: HdSceneIndexBase,
    private readonly _instanceDataSourceNames: string[],
    private readonly _sceneIndexAppendCallback: UsdImagingNiPrototypePropagatingSceneIndexSceneIndexAppendCallback | undefined,
  ) {}

  /** niPrototypePropagatingSceneIndex.cpp:58-122.
   *  Get scene indices to propagate the USD prototype with
   *  given name.
   *
   *  We will also overlay the prototype root with the given
   *  data source. We need the hash of the given data source
   *  for caching the result by the pair (prototype name, hash).
   *
   *  (Port: the caller holds a reference until Release.) */
  getSceneIndicesForPrototype(
    prototypeName: string,
    prototypeRootOverlayDsHash: _Hash,
    prototypeRootOverlayDs: HdContainerDataSource | undefined,
  ): { prototypeSceneIndex: HdSceneIndexBase; instanceAggregationSceneIndex: HdSceneIndexBase } {
    let sceneIndices2 = this._prototypeToBindingHashToSceneIndices.get(prototypeName)
    if (!sceneIndices2) {
      sceneIndices2 = { isolatingSceneIndex: undefined, hashToSceneIndices: new Map() }
      this._prototypeToBindingHashToSceneIndices.set(prototypeName, sceneIndices2)
    }
    let sceneIndices1 = sceneIndices2.hashToSceneIndices.get(prototypeRootOverlayDsHash)
    if (!sceneIndices1) {
      sceneIndices1 = { instanceAggregationSceneIndex: undefined, prototypeSceneIndex: undefined, refCount: 0 }
      sceneIndices2.hashToSceneIndices.set(prototypeRootOverlayDsHash, sceneIndices1)
    }

    // Check whether weak ptr references valid scene index.
    let isolatingSceneIndex = sceneIndices2.isolatingSceneIndex
    if (!isolatingSceneIndex) {
      // Allocate new scene index if not.
      isolatingSceneIndex = this._computeIsolatingSceneIndex(prototypeName)
      // Store weak ptr so that it can be re-used in the future.
      sceneIndices2.isolatingSceneIndex = isolatingSceneIndex
    }

    // Are we instantiating, e.g., the instance aggregation scene index
    // to aggregate instances inside a prototype or for everything outside
    // any USD prototype?
    const forPrototype = !!prototypeName

    let prototypeSceneIndex = sceneIndices1.prototypeSceneIndex
    if (!prototypeSceneIndex) {
      prototypeSceneIndex = this._computePrototypeSceneIndex(
        isolatingSceneIndex, forPrototype, prototypeRootOverlayDs)
      sceneIndices1.prototypeSceneIndex = prototypeSceneIndex
    }

    let instanceAggregationSceneIndex = sceneIndices1.instanceAggregationSceneIndex
    if (!instanceAggregationSceneIndex) {
      instanceAggregationSceneIndex = this._computeInstanceAggregationSceneIndex(
        prototypeSceneIndex, forPrototype)
      sceneIndices1.instanceAggregationSceneIndex = instanceAggregationSceneIndex
    }

    ++sceneIndices1.refCount

    return { prototypeSceneIndex, instanceAggregationSceneIndex }
  }

  /** Port: the last strong reference to the scene indices of
   *  (prototypeName, hash) held by one propagating scene index goes away.
   *  Expires the weak pointers whose scene indices are no longer referenced
   *  (see the file header). */
  release(prototypeName: string, prototypeRootOverlayDsHash: _Hash): void {
    const sceneIndices2 = this._prototypeToBindingHashToSceneIndices.get(prototypeName)
    const sceneIndices1 = sceneIndices2?.hashToSceneIndices.get(prototypeRootOverlayDsHash)
    if (!sceneIndices2 || !sceneIndices1) {
      return
    }
    if (--sceneIndices1.refCount > 0) {
      return
    }
    _DestroyChain(sceneIndices1.instanceAggregationSceneIndex, sceneIndices1.prototypeSceneIndex)
    _DestroyChain(sceneIndices1.prototypeSceneIndex, sceneIndices2.isolatingSceneIndex)
    sceneIndices1.instanceAggregationSceneIndex = undefined
    sceneIndices1.prototypeSceneIndex = undefined

    let anyAlive = false
    for (const entry of sceneIndices2.hashToSceneIndices.values()) {
      if (entry.prototypeSceneIndex) {
        anyAlive = true
      }
    }
    if (!anyAlive) {
      _DestroyChain(sceneIndices2.isolatingSceneIndex, this._inputSceneIndex)
      sceneIndices2.isolatingSceneIndex = undefined
    }
  }

  /** niPrototypePropagatingSceneIndex.cpp:124-142 */
  garbageCollect(prototypeName: string, prototypeRootOverlayDsHash: _Hash): void {
    const it = this._prototypeToBindingHashToSceneIndices.get(prototypeName)
    if (!it) {
      return
    }
    _SceneIndexCache._garbageCollect(it.hashToSceneIndices, prototypeRootOverlayDsHash)
    if (it.hashToSceneIndices.size > 0) {
      return
    }
    if (it.isolatingSceneIndex) {
      return
    }
    this._prototypeToBindingHashToSceneIndices.delete(prototypeName)
  }

  /** niPrototypePropagatingSceneIndex.cpp:162-182 */
  private _computeIsolatingSceneIndex(prototypeName: string): HdSceneIndexBase {
    if (!TF_VERIFY(this._inputSceneIndex)) {
      return this._inputSceneIndex
    }

    if (!prototypeName) {
      return UsdImaging_NiPrototypePruningSceneIndex.new(this._inputSceneIndex)
    } else {
      // Isolate prototype from UsdImagingStageSceneIndex and
      // move it under the instancer.
      return UsdImagingRerootingSceneIndex.new(
        this._inputSceneIndex,
        // Path of prototype on UsdImagingStageSceneIndex
        `/${prototypeName}`,
        UsdImaging_NiPrototypeSceneIndex.getPrototypePath())
    }
  }

  /** niPrototypePropagatingSceneIndex.cpp:184-213 */
  private _computePrototypeSceneIndex(
    isolatingSceneIndex: HdSceneIndexBase,
    forPrototype: boolean,
    prototypeRootOverlayDs: HdContainerDataSource | undefined,
  ): HdSceneIndexBase {
    let sceneIndex: HdSceneIndexBase = isolatingSceneIndex
    sceneIndex = UsdImaging_NiPrototypeSceneIndex.new(
      sceneIndex, forPrototype, prototypeRootOverlayDs)

    // We insert the flattening scene index at every recursion level of
    // native instancing.
    //
    // Thus, if we have a nested instance with opinions inside a prototype
    // instanced by a nested instance with opinions, we will flatten them
    // correctly.
    sceneIndex = HdFlatteningSceneIndex.new(
      sceneIndex, UsdImagingFlattenedDataSourceProviders())

    if (this._sceneIndexAppendCallback) {
      // Typically adds the UsdImagingDrawModeSceneIndex.
      sceneIndex = this._sceneIndexAppendCallback(sceneIndex)
    }

    return sceneIndex
  }

  /** niPrototypePropagatingSceneIndex.cpp:215-264 */
  private _computeInstanceAggregationSceneIndex(
    prototypeSceneIndex: HdSceneIndexBase,
    forPrototype: boolean,
  ): HdSceneIndexBase {
    // Relocate model:modelPath to primvars:model:modelPath.
    // Since it can be an arbitrary ancestor path, we want to ignore it for
    // hash computation while surviving instance aggregation.
    // This way they end up as per-instance primvar on the instancer.
    const srcModelPathLocator = new HdDataSourceLocator(
      UsdImagingModelSchema.getSchemaToken(),
      UsdImagingModelSchemaTokens.modelPath)
    const dstModelPathPrimvarLocator = new HdDataSourceLocator(
      HdPrimvarsSchema.getSchemaToken(),
      UsdImagingModelSchemaTokens.modelPathPrimvarName)
    const relocateModelPathSceneIndex = UsdImaging_DataSourceRelocatingSceneIndex.new(
      prototypeSceneIndex,
      srcModelPathLocator, dstModelPathPrimvarLocator,
      /* forNativeInstance */ true)

    if (HdSkinningSettings.isSkinningDeferred() && !forPrototype) {
      // Relocate skelBinding:animationSource to
      // primvars:skel:animationSource so the skel instances
      // with different animationSource can be aggregated.
      // This also allows it to be aggregated to the instancer as an
      // instance primvar.
      //
      // We hardcode the skelBinding tokens here so we don't have to
      // introduce dependency to usdSkelImaging.
      const srcSkelAnimLocator = new HdDataSourceLocator('skelBinding', 'animationSource')
      // This instance primvar will later be picked up by
      // UsdSkelImagingDataSourceXformResolver::GetInstanceAnimationSource()
      const dstSkelAnimPrimvarLocator = new HdDataSourceLocator(
        HdPrimvarsSchema.getSchemaToken(),
        UsdSkelTokens.skelAnimationSource)
      return UsdImaging_NiInstanceAggregationSceneIndex.new(
        UsdImaging_DataSourceRelocatingSceneIndex.new(
          relocateModelPathSceneIndex,
          srcSkelAnimLocator, dstSkelAnimPrimvarLocator,
          /* forNativeInstance */ true),
        forPrototype, this._instanceDataSourceNames)
    }

    return UsdImaging_NiInstanceAggregationSceneIndex.new(
      relocateModelPathSceneIndex,
      forPrototype,
      this._instanceDataSourceNames)
  }

  /** niPrototypePropagatingSceneIndex.cpp:266-282 */
  private static _garbageCollect(
    hashToSceneIndices: Map<_Hash, _SceneIndices1>,
    prototypeRootOverlayDsHash: _Hash,
  ): void {
    const it = hashToSceneIndices.get(prototypeRootOverlayDsHash)
    if (!it) {
      return
    }
    if (it.instanceAggregationSceneIndex) {
      return
    }
    if (it.prototypeSceneIndex) {
      return
    }
    hashToSceneIndices.delete(prototypeRootOverlayDsHash)
  }
}

/** niPrototypePropagatingSceneIndex.cpp:292-327.
 *  An RAII-helper that batches operations to HdMergingSceneIndex.
 *  (Port: Apply() is the destructor.) */
class _MergingSceneIndexOperations {
  private readonly _scenesToInsert: HdMergingInputScene[] = []
  private readonly _scenesToRemove: HdSceneIndexBase[] = []
  /** Port: propagated prototype scene indices whose last reference is
   *  dropped; destroyed after the merging scene index stops using them. */
  readonly scenesToDestroy: UsdImagingRerootingSceneIndex[] = []

  constructor(private readonly _mergingSceneIndex: HdMergingSceneIndex) {}

  /** ~_MergingSceneIndexOperations */
  Apply(): void {
    this._mergingSceneIndex.removeInputScenes(this._scenesToRemove)
    this._mergingSceneIndex.insertInputScenes(this._scenesToInsert)
    for (const scene of this.scenesToDestroy) {
      _DestroyPropagatedPrototypeSceneIndex(scene)
    }
  }

  addInputScene(inputScene: HdSceneIndexBase, activeInputSceneRoot: string): void {
    this._scenesToInsert.push({ scene: inputScene, activeInputSceneRoot })
  }

  /** Do not call with a scene that was given to AddInputScene
   *  earlier - as the scene given to AddInputScene will always
   *  be added. */
  removeInputScene(inputScene: HdSceneIndexBase): void {
    this._scenesToRemove.push(inputScene)
  }
}

/** Port: releases a rerooting scene index wrapping a propagated
 *  UsdImagingNiPrototypePropagatingSceneIndex (the C++ refptr dropping). */
function _DestroyPropagatedPrototypeSceneIndex(scene: UsdImagingRerootingSceneIndex): void {
  const inner = scene.getInputScenes()[0]
  scene.destroy()
  if (inner instanceof UsdImagingNiPrototypePropagatingSceneIndex) {
    inner.destroy()
  }
}

/** niPrototypePropagatingSceneIndex.cpp:475-482 */
function _GetBindingScopeDataSource(sceneIndex: HdSceneIndexBase, primPath: string): HdContainerDataSource | undefined {
  const bindingScope = UsdImaging_NiInstanceAggregationSceneIndex.getBindingScopeFromInstancerPath(primPath)
  return sceneIndex.getPrim(bindingScope).dataSource
}

/**
 * niPrototypePropagatingSceneIndex.h:22-427.
 *
 * A scene index implementing USD native instancing. If combined
 * with the UsdImagingPiPrototypePropagatingSceneIndex, the native
 * instancing scene index has to be run after the point instancing
 * scene index.
 *
 * This scene index uses the UsdImagingNiInstanceAggregationSceneIndex
 * to find all instances, aggregate them and insert instancers for
 * each set of aggregated instances. This scene index then inserts
 * flattened and possibly further transformed (e.g. applying draw mode)
 * copies of the corresponding USD prototype underneath each of these
 * instancers. Each of these copies is actually a
 * UsdImagingNiPrototypePropagatingSceneIndex itself. This way, we can
 * handle nested native instancing. In other words, we can call the
 * UsdImagingNiPrototypePropagatingSceneIndex for a USD prototype and
 * it will find the instances within that prototype.
 *
 * The instancing scene index uses the instancedBy:prototypeRoot
 * of the input scene index during aggregation.
 * Typically, the input scene index will be a
 * UsdImagingPiPrototypePropagatingSceneIndex which populates
 * instancedBy:prototypeRoot based on which point instancer is
 * instancing a prim.
 *
 * This scene index is implemented by a merging scene index with the
 * following inputs:
 * - a scene index ultimately tracing back to UsdImaging_NiPrototypeSceneIndex
 *   which prepares the prototype for which this scene index was created.
 *   The scene indices applied after UsdImaging_NiPrototypeSceneIndex
 *   include a flattening scene index as well as scene indices
 *   that can be specified through a callback by a user (typically,
 *   the draw mode scene index).
 * - the UsdImaging_NiInstanceAggregationSceneIndex instantiated from the
 *   above scene index. The instance aggregation scene index will insert the
 *   instancers for the instances within this prototype.
 * - More UsdImagingNiPrototypePropagatingSceneIndex's:
 *   The _InstanceAggregationSceneIndexObserver will observe the
 *   latter scene index to add
 *   respective UsdImagingNiPrototypePropagatingSceneIndex's under
 *   each instancer.
 *
 * (See niPrototypePropagatingSceneIndex.h:60-305 for the worked examples.)
 */
export class UsdImagingNiPrototypePropagatingSceneIndex extends HdFilteringSceneIndexBase {
  private readonly _prototypeRootOverlayDsHash: _Hash
  private _mergingSceneIndex: HdMergingSceneIndex
  // Propagated prototypes in the _mergingSceneIndex.
  //
  // This map needs to be kept in sync with the HdMergingSceneIndex.
  // There might be a way to avoid the redundant representation.
  // (std::map: iterated in SdfPath order.)
  private readonly _instancersToPropagatedPrototypeSceneIndex = new Map<string, UsdImagingRerootingSceneIndex>()
  private _instanceAggregationSceneIndex: HdSceneIndexBase | undefined
  private readonly _instanceAggregationSceneIndexObserver: HdSceneIndexObserver
  private readonly _mergingSceneIndexObserver: HdSceneIndexObserver
  private _destroyed = false

  /** niPrototypePropagatingSceneIndex.h:316-335, .cpp:329-343.
   *
   *  instanceDataSourceNames are the names of the data sources of a native
   *  instance prim that need to have the same values for the instances to
   *  be aggregated. A copy of these data sources is bundled into the
   *  prim data source for the binding scope.
   *
   *  When propagating a prototype by inserting the scene index isolating
   *  that prototype into the merging scene index implementing this scene
   *  index, we also call sceneIndexAppendCallback.
   *
   *  The use case is for the UsdImagingDrawModeSceneIndex. */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    instanceDataSourceNames: string[],
    sceneIndexAppendCallback?: UsdImagingNiPrototypePropagatingSceneIndexSceneIndexAppendCallback,
  ): UsdImagingNiPrototypePropagatingSceneIndex {
    return UsdImagingNiPrototypePropagatingSceneIndex._new(
      inputSceneIndex,
      /* prototypeName = */ '',
      /* protoypeRootDs =*/ undefined,
      new _SceneIndexCache(inputSceneIndex, instanceDataSourceNames, sceneIndexAppendCallback))
  }

  /** niPrototypePropagatingSceneIndex.cpp:345-356.
   *  Use prototypeName to instantiate for "scene root". */
  private static _new(
    inputSceneIndex: HdSceneIndexBase,
    prototypeName: string,
    prototypeRootOverlayDs: HdContainerDataSource | undefined,
    cache: _SceneIndexCache,
  ): UsdImagingNiPrototypePropagatingSceneIndex {
    return new UsdImagingNiPrototypePropagatingSceneIndex(
      inputSceneIndex, prototypeName, prototypeRootOverlayDs, cache)
  }

  /** niPrototypePropagatingSceneIndex.cpp:358-399 */
  private constructor(
    private readonly _inputSceneIndex: HdSceneIndexBase,
    private readonly _prototypeName: string,
    prototypeRootOverlayDs: HdContainerDataSource | undefined,
    private readonly _cache: _SceneIndexCache,
  ) {
    super()
    this._prototypeRootOverlayDsHash = HdDataSourceHash(prototypeRootOverlayDs, 0, 0)
    this._mergingSceneIndex = HdMergingSceneIndex.new()

    // _InstanceAggregationSceneIndexObserver (.cpp:542-582)
    const self = this
    this._instanceAggregationSceneIndexObserver = {
      primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]) {
        self._primsAddedFromAggregation(entries)
      },
      primsDirtied(_sender: HdSceneIndexBase, _entries: DirtiedPrimEntry[]) {
        // No need to handle this.
      },
      primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]) {
        self._primsRemovedFromAggregation(entries)
      },
      primsRenamed(sender: HdSceneIndexBase, entries: RenamedPrimEntry[]) {
        UsdImaging_ConvertPrimsRenamedToRemovedAndAdded(sender, entries, this)
      },
    }
    // _MergingSceneIndexObserver (.cpp:584-627)
    this._mergingSceneIndexObserver = {
      primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]) {
        self._sendPrimsAdded(entries)
      },
      primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]) {
        self._sendPrimsDirtied(entries)
      },
      primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]) {
        self._sendPrimsRemoved(entries)
      },
      primsRenamed(sender: HdSceneIndexBase, entries: RenamedPrimEntry[]) {
        UsdImaging_ConvertPrimsRenamedToRemovedAndAdded(sender, entries, this)
      },
    }

    const sceneIndices = this._cache.getSceneIndicesForPrototype(
      _prototypeName, this._prototypeRootOverlayDsHash, prototypeRootOverlayDs)

    this._instanceAggregationSceneIndex = sceneIndices.instanceAggregationSceneIndex

    this._mergingSceneIndex.addInputScene(sceneIndices.prototypeSceneIndex, '/')
    this._mergingSceneIndex.addInputScene(sceneIndices.instanceAggregationSceneIndex, '/')

    sceneIndices.instanceAggregationSceneIndex.addObserver(this._instanceAggregationSceneIndexObserver)
    this._mergingSceneIndex.addObserver(this._mergingSceneIndexObserver)

    this._populate(sceneIndices.instanceAggregationSceneIndex)

    if (_prototypeName) {
      this.setDisplayName(`Propagating native prototype ${_prototypeName}`)
    }
  }

  /** ~UsdImagingNiPrototypePropagatingSceneIndex
   *  (niPrototypePropagatingSceneIndex.cpp:401-423). */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true

    // We need to release all references we have to the scene indices...
    // Note that we are not updating the merging scene index here since we are
    // deleting it anyway.
    for (const path of [...this._instancersToPropagatedPrototypeSceneIndex.keys()].sort(_ComparePaths)) {
      _DestroyPropagatedPrototypeSceneIndex(this._instancersToPropagatedPrototypeSceneIndex.get(path)!)
    }
    this._instancersToPropagatedPrototypeSceneIndex.clear()
    this._instanceAggregationSceneIndex?.removeObserver(this._instanceAggregationSceneIndexObserver)
    this._instanceAggregationSceneIndex = undefined

    // Note that the Hydra Scene Debugger could potentially delay the
    // deletion of the merging scene index.
    this._mergingSceneIndex.removeObserver(this._mergingSceneIndexObserver)
    this._mergingSceneIndex.destroy()

    // ... before we can garbage collect.
    this._cache.release(this._prototypeName, this._prototypeRootOverlayDsHash)
    this._cache.garbageCollect(this._prototypeName, this._prototypeRootOverlayDsHash)
  }

  /** niPrototypePropagatingSceneIndex.cpp:425-438 */
  private _populate(instanceAggregationSceneIndex: HdSceneIndexBase): void {
    const mergingSceneIndexOperations = new _MergingSceneIndexOperations(this._mergingSceneIndex)
    for (const primPath of new HdSceneIndexPrimView(instanceAggregationSceneIndex, '/')) {
      this._addPrim(primPath, mergingSceneIndexOperations)
    }
    mergingSceneIndexOperations.Apply()
  }

  /** niPrototypePropagatingSceneIndex.cpp:484-495 (_PrimsAdded). */
  private _primsAddedFromAggregation(entries: AddedPrimEntry[]): void {
    const mergingSceneIndexOperations = new _MergingSceneIndexOperations(this._mergingSceneIndex)
    for (const entry of entries) {
      this._addPrim(entry.primPath, mergingSceneIndexOperations)
    }
    mergingSceneIndexOperations.Apply()
  }

  /** niPrototypePropagatingSceneIndex.cpp:497-547 */
  private _addPrim(primPath: string, mergingSceneIndexOperations: _MergingSceneIndexOperations): void {
    const prototypeName = UsdImaging_NiInstanceAggregationSceneIndex.getPrototypeNameFromInstancerPath(primPath)
    if (!prototypeName) {
      return
    }

    const previous = this._instancersToPropagatedPrototypeSceneIndex.get(primPath)

    // First erase previous entry.
    if (previous) {
      mergingSceneIndexOperations.removeInputScene(previous)
      mergingSceneIndexOperations.scenesToDestroy.push(previous)
    }

    const propagatedPrototypeSceneIndex = UsdImagingRerootingSceneIndex.new(
      UsdImagingNiPrototypePropagatingSceneIndex._new(
        this._inputSceneIndex,
        prototypeName,
        // Apply the container data source from the binding scope
        // to the prototype root.
        // This data source contains opinions of the
        // aggregated native instances about, e.g., purpose.
        //
        // Note that the flattening scene index will
        // propagate these opinions to the descendants of
        // the prototype root without stronger opinion.
        //
        // The bool data source model:applyDrawMode in the container
        // data source has a special role. It will not be touched
        // by the flattening scene index. However, the draw mode
        // scene index will turn the prototype into a draw mode
        // standin if model:applyDrawMode is true and model:drawMode
        // is non-trivial. The draw mode scene index would be called
        // through the AppendSceneIndexCallback.
        /* prototypeRootOverlayDs = */
        _GetBindingScopeDataSource(this._instanceAggregationSceneIndex!, primPath),
        this._cache),
      UsdImaging_NiPrototypeSceneIndex.getInstancerPath(),
      primPath)
    this._instancersToPropagatedPrototypeSceneIndex.set(primPath, propagatedPrototypeSceneIndex)

    // Insert scene index for given instancer.
    mergingSceneIndexOperations.addInputScene(propagatedPrototypeSceneIndex, primPath)
  }

  /** niPrototypePropagatingSceneIndex.cpp:549-559 (_PrimsRemoved). */
  private _primsRemovedFromAggregation(entries: RemovedPrimEntry[]): void {
    const mergingSceneIndexOperations = new _MergingSceneIndexOperations(this._mergingSceneIndex)
    // The map in its (std::map) SdfPath order, once: removal only erases.
    const instancerPaths = [...this._instancersToPropagatedPrototypeSceneIndex.keys()].sort(_ComparePaths)
    for (const entry of entries) {
      this._removePrim(entry.primPath, mergingSceneIndexOperations, instancerPaths)
    }
    mergingSceneIndexOperations.Apply()
  }

  /** niPrototypePropagatingSceneIndex.cpp:561-576 */
  private _removePrim(primPath: string, mergingSceneIndexOperations: _MergingSceneIndexOperations,
    instancerPaths: readonly string[]): void {
    // Erase all entries from map with given prefix: map.lower_bound(primPath)
    // and the entries after it having the prefix.
    let lo = 0, hi = instancerPaths.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (_ComparePaths(instancerPaths[mid]!, primPath) < 0) lo = mid + 1
      else hi = mid
    }
    for (let i = lo; i < instancerPaths.length && _HasPrefix(instancerPaths[i]!, primPath); i++) {
      const path = instancerPaths[i]!
      const scene = this._instancersToPropagatedPrototypeSceneIndex.get(path)
      if (!scene) continue
      mergingSceneIndexOperations.removeInputScene(scene)
      mergingSceneIndexOperations.scenesToDestroy.push(scene)
      this._instancersToPropagatedPrototypeSceneIndex.delete(path)
    }
  }

  /** niPrototypePropagatingSceneIndex.cpp:578-587 */
  getInputScenes(): HdSceneIndexBase[] {
    if (USDIMAGING_SHOW_NATIVE_PROTOTYPE_SCENE_INDICES) {
      return this._mergingSceneIndex.getInputScenes()
    } else {
      return [this._inputSceneIndex]
    }
  }

  /** niPrototypePropagatingSceneIndex.cpp:589-593 */
  getEncapsulatedScenes(): HdSceneIndexBase[] {
    return [this._mergingSceneIndex]
  }

  /** niPrototypePropagatingSceneIndex.cpp:595-601 */
  getPrim(primPath: string): HdSceneIndexPrim {
    return this._mergingSceneIndex.getPrim(primPath)
  }

  /** niPrototypePropagatingSceneIndex.cpp:603-609 */
  getChildPrimPaths(primPath: string): string[] {
    return this._mergingSceneIndex.getChildPrimPaths(primPath)
  }
}
