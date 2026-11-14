// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/piPrototypePropagatingSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/piPrototypePropagatingSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/piPrototypePropagatingSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - C++ RAII: an _InstancerObserver removes its scene indices and prims in
//   its destructor, and scene indices it created stop observing their inputs
//   when their last reference goes away. JavaScript has no destructors, so
//   _InstancerObserver has an explicit _Destroy() that does the destructor's
//   work and also detaches the observers this port registers (the observer on
//   the prototype scene index and the filtering scene indices' observers on
//   their inputs). Every place upstream drops a unique_ptr<_InstancerObserver>
//   calls _Destroy(). UsdImagingPiPrototypePropagatingSceneIndex.destroy()
//   stands for the scene index destructor.
// - HdEncapsulatingSceneIndexBase is not ported in hd; GetEncapsulatedScenes
//   is kept as a plain method.
// - TF_DEFINE_ENV_SETTING USDIMAGING_SHOW_POINT_PROTOTYPE_SCENE_INDICES is a
//   static flag (default false, as upstream).

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  FilteringSceneIndexBase as HdFilteringSceneIndexBase,
  InstancerTopologySchema as HdInstancerTopologySchema,
  InstancerTopologySchemaTokens as HdInstancerTopologySchemaTokens,
  MergingSceneIndex as HdMergingSceneIndex,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SceneIndexPrimView as HdSceneIndexPrimView,
  ContainerDataSource as HdContainerDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  type AddedPrimEntry, type DataSourceBase as HdDataSourceBase,
  type DirtiedPrimEntry, type MergingInputScene as HdMergingInputScene,
  type RemovedPrimEntry, type RenamedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase, type SceneIndexObserver as HdSceneIndexObserver,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { HashCombine as TfHashCombine } from 'typescript-usd/tf'
import { UsdImaging_PiPrototypeSceneIndex } from './piPrototypeSceneIndex.ts'
import { UsdImagingRerootingSceneIndex } from './rerootingSceneIndex.ts'
import { TF_WARN } from './tfDiagnostic.ts'
import { UsdImagingUsdPrimInfoSchema, UsdImagingUsdPrimInfoSchemaTokens } from './usdPrimInfoSchema.ts'

/** piPrototypePropagatingSceneIndex.cpp:31-34 */
const USDIMAGING_SHOW_POINT_PROTOTYPE_SCENE_INDICES = false

const _HasPrefix = (path: string, prefix: string): boolean =>
  prefix === '/' ? path.startsWith('/') : path === prefix || path.startsWith(prefix + '/')
const _AppendChild = (path: string, name: string): string => path === '/' ? `/${name}` : `${path}/${name}`
const _ReplacePrefix = (path: string, oldPrefix: string, newPrefix: string): string => {
  if (!_HasPrefix(path, oldPrefix)) return path
  if (path === oldPrefix) return newPrefix
  const rest = oldPrefix === '/' ? path.slice(1) : path.slice(oldPrefix.length + 1)
  return _AppendChild(newPrefix, rest)
}
/** SdfPath operator< for prim paths (element-wise comparison). */
const _ComparePaths = (a: string, b: string): number => {
  // Scans the elements between '/' in place (it is sorted with): the same
  // order as comparing a.slice(1).split('/') element by element.
  if (a === b) return 0
  if (a === '/') return -1
  if (b === '/') return 1
  let i = 1, j = 1
  for (;;) {
    let ei = a.indexOf('/', i), ej = b.indexOf('/', j)
    if (ei < 0) ei = a.length
    if (ej < 0) ej = b.length
    const n = Math.min(ei - i, ej - j)
    for (let k = 0; k < n; k++) {
      const d = a.charCodeAt(i + k) - b.charCodeAt(j + k)
      if (d !== 0) return d < 0 ? -1 : 1
    }
    if (ei - i !== ej - j) return ei - i < ej - j ? -1 : 1
    const aEnd = ei >= a.length, bEnd = ej >= b.length
    if (aEnd || bEnd) return aEnd === bEnd ? 0 : aEnd ? -1 : 1
    i = ei + 1; j = ej + 1
  }
}

/**
 * HdSceneIndexObserver::ConvertPrimsRenamedToRemovedAndAdded
 * (pxr/imaging/hd/sceneIndexObserver.cpp:15-75).
 *
 * Divergence: hd does not export this helper in this port; usdImaging's
 * observers share this copy.
 */
export function UsdImaging_ConvertPrimsRenamedToRemovedAndAdded(
  sender: HdSceneIndexBase,
  renamedEntries: readonly RenamedPrimEntry[],
  observer: HdSceneIndexObserver,
): void {
  const removedEntries: RemovedPrimEntry[] = []
  const addedEntries: AddedPrimEntry[] = []
  for (const renamedEntry of renamedEntries) {
    // if the paths are equal, skip it
    if (renamedEntry.oldPrimPath === renamedEntry.newPrimPath) {
      continue
    }
    // remove the old prim
    removedEntries.push({ primPath: renamedEntry.oldPrimPath })
    // add back based on traversal on input from new path
    const workQueue: string[] = [renamedEntry.newPrimPath]
    while (workQueue.length > 0) {
      const path = workQueue.pop()!
      // insert backwards as we are pulling off the end.
      const prim = sender.getPrim(path)
      addedEntries.push({ primPath: path, primType: prim.primType })
      const childPaths = sender.getChildPrimPaths(path)
      for (let i = childPaths.length - 1; i >= 0; --i) {
        workQueue.push(childPaths[i]!)
      }
    }
  }
  observer.primsRemoved(sender, removedEntries)
  observer.primsAdded(sender, addedEntries)
}

// ---------------------------------------------------------------------------
// namespace UsdImagingPiPrototypePropagatingSceneIndex_Impl

/**
 * piPrototypePropagatingSceneIndex.cpp:45-93.
 *
 * Container data source for __usdPrimInfo/piPropagatedPrototypes
 *
 * It stores a map internally and has API to modify the map.
 */
class _PropagatedPrototypesSource extends HdContainerDataSource {
  // std::map<TfToken, SdfPath>: GetNames returns the keys sorted.
  private readonly _instancerHashToPropagatedPrototype = new Map<string, string>()

  static new(): _PropagatedPrototypesSource {
    return new _PropagatedPrototypesSource()
  }

  getNames(): string[] {
    return [...this._instancerHashToPropagatedPrototype.keys()].sort()
  }

  Get(name: string): HdDataSourceBase | undefined {
    const it = this._instancerHashToPropagatedPrototype.get(name)
    if (it === undefined) {
      return undefined
    }
    return HdRetainedTypedSampledDataSource.new(it)
  }

  // Makes Get(instancerHash) return propagatedPrototoype.
  addPropagatedPrototype(instancerHash: string, propagatedPrototype: string): void {
    this._instancerHashToPropagatedPrototype.set(instancerHash, propagatedPrototype)
  }

  // Removes entry for instancerHash.
  removePropagatedPrototype(instancerHash: string): void {
    this._instancerHashToPropagatedPrototype.delete(instancerHash)
  }

  IsEmpty(): boolean {
    return this._instancerHashToPropagatedPrototype.size === 0
  }
}

/**
 * piPrototypePropagatingSceneIndex.cpp:97-212.
 *
 * A retained scene index providing a container data source at
 * __usdPrimInfo:piPropagatedSceneIndices.
 * For each prototype (that is each prim targeted by a the prototype
 * relationship of a Usd point instancer), the container data
 * source is a map from instancerHash's to propagated prototypes
 * (that is the copies of the prototype created).
 */
class _UsdPrimInfoSceneIndex extends HdRetainedSceneIndex {
  static new(): _UsdPrimInfoSceneIndex {
    return new _UsdPrimInfoSceneIndex()
  }

  /** piPrototypePropagatingSceneIndex.cpp:132-145 */
  private _getDataSource(prototype: string): _PropagatedPrototypesSource | undefined {
    const primSource = this.getPrim(prototype).dataSource
    const schema = UsdImagingUsdPrimInfoSchema.getFromParent(primSource)
    const ds = schema.getPiPropagatedPrototypes()
    return ds instanceof _PropagatedPrototypesSource ? ds : undefined
  }

  /** piPrototypePropagatingSceneIndex.cpp:147-164 */
  private _createDataSource(prototype: string): _PropagatedPrototypesSource {
    const ds = _PropagatedPrototypesSource.new()
    this.addPrims([{
      primPath: prototype,
      primType: '',
      dataSource: HdRetainedContainerDataSource.new(
        [UsdImagingUsdPrimInfoSchema.getSchemaToken()],
        [new UsdImagingUsdPrimInfoSchema.Builder()
          .setPiPropagatedPrototypes(ds)
          .build()]),
    }])
    return ds
  }

  /** piPrototypePropagatingSceneIndex.cpp:166-176 */
  private _getOrCreateDataSource(prototype: string): _PropagatedPrototypesSource {
    const ds = this._getDataSource(prototype)
    if (ds) {
      return ds
    } else {
      return this._createDataSource(prototype)
    }
  }

  /** piPrototypePropagatingSceneIndex.cpp:178-195.
   *  Makes it so that the data source at
   *  __usdPrimInfo:piPropagatedPrototypes:INSTANCER_HASH
   *  for the prim at prototype contains the path
   *  propagatedPrototypes. */
  addPropagatedPrototype(prototype: string, instancerHash: string, propagatedPrototype: string): void {
    const ds = this._getOrCreateDataSource(prototype)
    ds.addPropagatedPrototype(instancerHash, propagatedPrototype)

    const locator = UsdImagingUsdPrimInfoSchema.getDefaultLocator()
      .append(UsdImagingUsdPrimInfoSchemaTokens.piPropagatedPrototypes)
    this.dirtyPrims([{ primPath: prototype, dirtyLocators: new HdDataSourceLocatorSet([locator]) }])
  }

  /** piPrototypePropagatingSceneIndex.cpp:197-212.
   *  Removes entry for prim at prototype and locator
   *  __usdPrimInfo:piPropagatedPrototypes:INSTANCER_HASH. */
  removePropagatedPrototype(prototype: string, instancerHash: string): void {
    const ds = this._getDataSource(prototype)
    if (!ds) {
      return
    }
    ds.removePropagatedPrototype(instancerHash)
    if (ds.IsEmpty()) {
      this.removePrims([{ primPath: prototype }])
    }
  }
}

/** piPrototypePropagatingSceneIndex.cpp:214-317 */
class _Context {
  /** Scene index used to override the instancerTopology::prototypes
   *  data sources of instancers to account for the re-rooting. */
  readonly instancerSceneIndex: HdRetainedSceneIndex
  /** Scene index providing the data source at
   *  __usdPrimInfo:piPropagatedSceneIndices. */
  readonly usdPrimInfoSceneIndex: _UsdPrimInfoSceneIndex
  /** Our "output" scene index. */
  readonly mergingSceneIndex: HdMergingSceneIndex

  private _batchDepth = 0
  private readonly _pendingInserts: HdMergingInputScene[] = []
  private readonly _pendingRemovals: HdSceneIndexBase[] = []

  constructor(readonly inputSceneIndex: HdSceneIndexBase) {
    this.instancerSceneIndex = HdRetainedSceneIndex.new()
    this.usdPrimInfoSceneIndex = _UsdPrimInfoSceneIndex.new()
    this.mergingSceneIndex = HdMergingSceneIndex.new()
    this.mergingSceneIndex.addInputScene(this.instancerSceneIndex, '/')
    this.mergingSceneIndex.addInputScene(this.usdPrimInfoSceneIndex, '/')
  }

  addInputScene(scene: HdSceneIndexBase, sceneRoot: string): void {
    if (this._batchDepth === 0) {
      this.mergingSceneIndex.addInputScene(scene, sceneRoot)
      return
    }
    this._pendingInserts.push({ scene, activeInputSceneRoot: sceneRoot })
  }

  removeInputScene(scene: HdSceneIndexBase): void {
    if (this._batchDepth === 0) {
      this.mergingSceneIndex.removeInputScene(scene)
      return
    }
    const it = this._pendingInserts.findIndex(inputScene => inputScene.scene === scene)
    if (it >= 0) {
      this._pendingInserts.splice(it, 1)
      return
    }
    this._pendingRemovals.push(scene)
  }

  /** _Context::BatchScope (piPrototypePropagatingSceneIndex.cpp:269-293):
   *  runs fn with the batch depth raised and flushes at the outermost exit. */
  static batch<T>(context: _Context | undefined, fn: () => T): T {
    if (context) {
      ++context._batchDepth
    }
    try {
      return fn()
    } finally {
      if (context && --context._batchDepth === 0) {
        context._flushInputScenes()
      }
    }
  }

  private _flushInputScenes(): void {
    if (this._pendingRemovals.length > 0) {
      this.mergingSceneIndex.removeInputScenes([...this._pendingRemovals])
      this._pendingRemovals.length = 0
    }
    if (this._pendingInserts.length > 0) {
      this.mergingSceneIndex.insertInputScenes([...this._pendingInserts])
      this._pendingInserts.length = 0
    }
  }
}

/** piPrototypePropagatingSceneIndex.cpp:426-437 */
function _RerootingSceneIndex(sceneIndex: HdSceneIndexBase, srcPrefix: string, dstPrefix: string): HdSceneIndexBase {
  if (srcPrefix === '/' && dstPrefix === '/') {
    return sceneIndex
  } else {
    return UsdImagingRerootingSceneIndex.new(sceneIndex, srcPrefix, dstPrefix)
  }
}

/** piPrototypePropagatingSceneIndex.cpp:529-541 */
function _InstancerTopology(prototypes: string[]): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdInstancerTopologySchema.getSchemaToken()],
    [new HdInstancerTopologySchema.Builder()
      .setPrototypes(HdRetainedTypedSampledDataSource.new(prototypes))
      .build()])
}

/** piPrototypePropagatingSceneIndex.cpp:618-628 */
function _GetPrototypes(instancer: HdSceneIndexPrim): string[] {
  const topologySchema = HdInstancerTopologySchema.getFromParent(instancer.dataSource)
  const ds = topologySchema.getPrototypes()
  if (ds) {
    return [...(ds.getTypedValue(0) as Iterable<string>)]
  } else {
    return []
  }
}

// For point instancers nested within this prototype, we store the map
// instancer -> prototype -> _InstancerObserver.
type _Map0 = Map<string, _InstancerObserver>
type _Map1 = Map<string, _Map0>

/**
 * piPrototypePropagatingSceneIndex.cpp:319-424.
 *
 * A scene index observer that adds the root of a scene or re-rooted
 * prototypes to the mergingSceneIndex.
 *
 * It observes the scene to detect instancers within the prototype.
 *
 * It querries the instancer for its prototypes to then add (recursively)
 * _InstancerObservers to add re-rooted copies of the prototype and update the
 * instancers with the re-rooted paths by authoring stronger opinions
 * in the instancerSceneIndex.
 */
class _InstancerObserver implements HdSceneIndexObserver {
  private readonly _prototypeSceneIndex: HdSceneIndexBase
  private readonly _isolatingSceneIndex: HdSceneIndexBase
  private readonly _rerootingSceneIndex: HdSceneIndexBase
  // instancer -> prototype -> instancerObserver
  // (std::map: iterate in SdfPath order, see _SortedSubinstancerKeys.)
  private readonly _subinstancerObservers: _Map1 = new Map()

  /** piPrototypePropagatingSceneIndex.cpp:439-475.
   *  With only a context: instancer = SdfPath(), prototype =
   *  propagatedPrototype = SdfPath::AbsoluteRootPath().
   *  Otherwise: adds the prims under prototype at propagatedPrototype
   *  and sets the instancedBy:paths data source of those prims
   *  to instancer. */
  constructor(
    private readonly _context: _Context,
    instancer = '',
    private readonly _prototype = '/',
    private readonly _propagatedPrototype = '/',
    // Prototype paths of ancestor _InstancerObservers, used to detect
    // recursive prototypes.  These are ancestors in the sense of being
    // previously-seen prototypes, but not necessarily namespace path
    // prefixes.  For example, there may be co-recursive cycles:
    //
    //   </PrototypeA/InstancerOfPrototypeB>
    //   </PrototypeB/InstancerOfPrototypeA>
    //
    // This possibility is a consequence of UsdGeomPointInstancer's
    // ability to use prototypes outside the scope of the instancer.
    //
    private readonly _ancestorPrototypes: ReadonlySet<string> = new Set(),
  ) {
    this._isolatingSceneIndex = _RerootingSceneIndex(
      // Isolate the prototype
      _context.inputSceneIndex, _prototype, _prototype)
    this._prototypeSceneIndex = UsdImaging_PiPrototypeSceneIndex.new(
      this._isolatingSceneIndex, instancer, _prototype)
    this._rerootingSceneIndex = _RerootingSceneIndex(
      this._prototypeSceneIndex, _prototype, _propagatedPrototype)

    this._context.addInputScene(this._rerootingSceneIndex, _propagatedPrototype)
    this._prototypeSceneIndex.addObserver(this)
    this._populate()
  }

  /** ~_InstancerObserver (piPrototypePropagatingSceneIndex.cpp:477-498). */
  _destroy(): void {
    // _InstancerObserver is RAII.
    // Upon deletion, it removes the scene indices and prims it added
    // to the merging scene index and retained scene index, respectively.
    if (this._subinstancerObservers.size > 0) {
      const removedInstancers: RemovedPrimEntry[] = []
      for (const instancer of this._sortedSubinstancerKeys()) {
        removedInstancers.push({ primPath: this._rerootedPath(instancer) })
      }
      this._context.instancerSceneIndex.removePrims(removedInstancers)
      for (const map0 of this._subinstancerObservers.values()) {
        _DestroyMap0(map0)
      }
      this._subinstancerObservers.clear()
    }

    // We remove the scene indices in the order opposite to how we
    // added them.
    this._context.removeInputScene(this._rerootingSceneIndex)

    // (Port: release the observers C++ drops with the last references.)
    this._prototypeSceneIndex.removeObserver(this)
    for (const si of [this._rerootingSceneIndex, this._prototypeSceneIndex, this._isolatingSceneIndex]) {
      if (si !== this._context.inputSceneIndex && si instanceof HdSingleInputFilteringSceneIndexBase) {
        si.destroy()
      }
    }
  }

  private _sortedSubinstancerKeys(): string[] {
    return [...this._subinstancerObservers.keys()].sort(_ComparePaths)
  }

  /** piPrototypePropagatingSceneIndex.cpp:500-504 */
  private _rerootedPath(instancer: string): string {
    return _ReplacePrefix(instancer, this._prototype, this._propagatedPrototype)
  }

  /** piPrototypePropagatingSceneIndex.cpp:506-527.
   *  Create a unique name for re-rooted prototypes for instancers within
   *  this prototype. */
  private _instancerHash(instancer: string): string {
    // Compute name when making a re-rooted copy of the prototype.
    //
    // This name uses the (1) instancer name and (2) the re-rooted path of the
    // prototype inserted by this _InstancerObserver.
    //
    // This is for the following reasons:
    // (1) Two instancers within this prototype could instance the same
    // prototype.
    //
    // (2) This prototype could have been instantiated by two different
    // instancers and we have two _InstancerObservers, each one needs to in
    // turn insert the same prototype under different names. Note that the
    // re-rooted path of this prototype contains the instancer hash, so we
    // actually compute a chain of hashes if we have nested point instancers.
    //
    // We use a hash of the path string representation, rather than the
    // SdfPath instance, in order to provide a stable result run-to-run.
    // Note that SdfPath's hash method uses the memory address of the
    // heap allocated path node, which will vary.
    const h = TfHashCombine(instancer, this._propagatedPrototype)
    return `ForInstancer${h.toString(16)}`
  }

  /** piPrototypePropagatingSceneIndex.cpp:543-616.
   *  Create or destory instancerObservers for an instancer within this
   *  prototype. */
  private _updateInstancerPrototypes(
    prototypeToInstancerObserver: _Map0,
    instancer: string,
    prototypes: string[],
  ): void {
    const rerootedInstancer = this._rerootedPath(instancer)
    const instancerHash = this._instancerHash(instancer)

    {
      // Remove _InstancerObservers for prims that are no longer targeted by the
      // instancer's prototype relationship.
      const prototypeSet = new Set(prototypes)
      for (const prototype of [...prototypeToInstancerObserver.keys()].sort(_ComparePaths)) {
        if (!prototypeSet.has(prototype)) {
          this._context.usdPrimInfoSceneIndex.removePropagatedPrototype(prototype, instancerHash)
          prototypeToInstancerObserver.get(prototype)!._destroy()
          prototypeToInstancerObserver.delete(prototype)
        }
      }
    }

    // Record this prototype as having been visited, for purposes
    // of cycle detection.
    const ancestorPrototypes = new Set(this._ancestorPrototypes)
    ancestorPrototypes.add(this._prototype)

    // Compute the re-rooted paths for the instancer's prototypes.
    // Add a _InstancerObserver for the re-rooted path if there wasn't a _InstancerObserver
    // already.
    const propagatedPrototypes: string[] = []
    for (const prototype of prototypes) {
      if (_HasPrefix(instancer, prototype) || this._ancestorPrototypes.has(prototype)) {
        // In the case of cycles, we create the _InstancerObserver but
        // do not populate the prototype.  This case is exercised by
        // the pi_cycles.usda case in testUsdImagingGLPointInstancer.
        TF_WARN(
          'Cycle detected in point instancer prototype propagation: ' +
          `prototype <${prototype}> contains a point instancer <${instancer}> using ` +
          'itself as a prototype.  Skipping to avoid infinite ' +
          'recursion.')
        continue
      }
      const propagatedPrototype = _AppendChild(prototype, instancerHash)
      propagatedPrototypes.push(propagatedPrototype)

      if (!prototypeToInstancerObserver.get(prototype)) {
        prototypeToInstancerObserver.set(prototype, new _InstancerObserver(
          this._context, rerootedInstancer, prototype, propagatedPrototype,
          ancestorPrototypes))
        this._context.usdPrimInfoSceneIndex.addPropagatedPrototype(
          prototype, instancerHash, propagatedPrototype)
      }
    }

    // Update the instancer's prototypes to point to the re-rooted prototypes.
    this._context.instancerSceneIndex.addPrims([{
      primPath: rerootedInstancer,
      primType: HdPrimTypeTokens.instancer,
      dataSource: _InstancerTopology(propagatedPrototypes),
    }])
  }

  /** piPrototypePropagatingSceneIndex.cpp:630-660 (the three
   *  _UpdateInstancer convenience overloads). */
  private _updateInstancer(
    a: _Map0 | string, b?: string | HdSceneIndexPrim,
  ): void {
    if (typeof a !== 'string') {
      // _UpdateInstancer(_Map0 *, const SdfPath &path)
      const path = b as string
      this._updateInstancerPrototypes(a, path, _GetPrototypes(this._prototypeSceneIndex.getPrim(path)))
    } else if (b !== undefined) {
      // _UpdateInstancer(const SdfPath &path, const HdSceneIndexPrim &prim)
      this._updateInstancerPrototypes(this._getOrCreateMap0(a), a, _GetPrototypes(b as HdSceneIndexPrim))
    } else {
      // _UpdateInstancer(const SdfPath &path)
      this._updateInstancer(this._getOrCreateMap0(a), a)
    }
  }

  /** `_subinstancerObservers[path]` (std::map::operator[]). */
  private _getOrCreateMap0(path: string): _Map0 {
    let map0 = this._subinstancerObservers.get(path)
    if (!map0) {
      map0 = new Map()
      this._subinstancerObservers.set(path, map0)
    }
    return map0
  }

  /** piPrototypePropagatingSceneIndex.cpp:662-681 */
  private _populate(): void {
    const view = new HdSceneIndexPrimView(this._prototypeSceneIndex, this._prototype)
    const it = view[Symbol.iterator]()
    for (let r = it.next(); !r.done; r = it.next()) {
      const path = r.value
      const prim = this._prototypeSceneIndex.getPrim(path)
      if (prim.primType === HdPrimTypeTokens.instancer) {
        this._updateInstancer(path, prim)
        // Do not visit descendants: if the instancer has another instancer
        // as descendant, then we only want to pick it up if it is within
        // a prototype of this instancer.
        // The _InstancerObserver that _UpdateInstancer inserted will
        // do that.
        it.skipDescendants()
      }
    }
  }

  /** piPrototypePropagatingSceneIndex.cpp:683-707 */
  primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    _Context.batch(this._context, () => {
      for (const entry of entries) {
        const path = entry.primPath
        if (entry.primType === HdPrimTypeTokens.instancer) {
          this._updateInstancer(path)
        } else {
          // If prim was re-synced and is no longer an instancer,
          // delete it from the necessary places.
          const map0 = this._subinstancerObservers.get(path)
          if (map0) {
            _DestroyMap0(map0)
            this._subinstancerObservers.delete(path)
            this._context.instancerSceneIndex.removePrims([{ primPath: this._rerootedPath(path) }])
          }
        }
      }
    })
  }

  /** piPrototypePropagatingSceneIndex.cpp:709-738 */
  primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    if (this._subinstancerObservers.size === 0) {
      return
    }

    const locator = HdInstancerTopologySchema.getDefaultLocator().append(
      HdInstancerTopologySchemaTokens.prototypes)

    _Context.batch(this._context, () => {
      for (const entry of entries) {
        const path = entry.primPath
        if (!entry.dirtyLocators.contains(locator)) {
          continue
        }
        const it = this._subinstancerObservers.get(path)
        if (!it) {
          continue
        }
        this._updateInstancer(it, path)
      }
    })
  }

  /** piPrototypePropagatingSceneIndex.cpp:740-768 */
  primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    if (this._subinstancerObservers.size === 0) {
      return
    }

    const removedInstancers: RemovedPrimEntry[] = []

    _Context.batch(this._context, () => {
      for (const entry of entries) {
        const path = entry.primPath
        // Find all instancers that are namespace descendants of
        // the removed prim to delete them.
        for (const instancer of this._sortedSubinstancerKeys()) {
          if (!_HasPrefix(instancer, path)) continue
          removedInstancers.push({ primPath: this._rerootedPath(instancer) })
          _DestroyMap0(this._subinstancerObservers.get(instancer)!)
          this._subinstancerObservers.delete(instancer)
        }
      }

      if (removedInstancers.length > 0) {
        this._context.instancerSceneIndex.removePrims(removedInstancers)
      }
    })
  }

  /** piPrototypePropagatingSceneIndex.cpp:770-775 */
  primsRenamed(sender: HdSceneIndexBase, entries: RenamedPrimEntry[]): void {
    UsdImaging_ConvertPrimsRenamedToRemovedAndAdded(sender, entries, this)
  }
}

/** Destroys the _InstancerObservers of a _Map0 (std::map destructor). */
function _DestroyMap0(map0: _Map0): void {
  for (const prototype of [...map0.keys()].sort(_ComparePaths)) {
    map0.get(prototype)!._destroy()
  }
  map0.clear()
}

/**
 * piPrototypePropagatingSceneIndex.h:22-405, .cpp:779-851.
 *
 * A scene index translating USD point instancers into Hydra instancers.
 *
 * It applies various USD semantics and populates the "instancedBy" schema,
 * including the prototypeRoot data source which is needed by the USD native
 * instancing scene index.
 *
 * To achieve various USD behaviors, it has a (recursive) instancer observer
 * that inserts copies of prototypes processed through the prototype scene
 * index into appropriate places in namespace.
 *
 * (See piPrototypePropagatingSceneIndex.h:31-375 for the worked examples.)
 */
export class UsdImagingPiPrototypePropagatingSceneIndex extends HdFilteringSceneIndexBase {
  private readonly _context: _Context
  private readonly _mergingSceneIndexObserver: HdSceneIndexObserver
  private _instancerObserver: _InstancerObserver | undefined

  /** piPrototypePropagatingSceneIndex.cpp:781-788 */
  static new(inputSceneIndex: HdSceneIndexBase): UsdImagingPiPrototypePropagatingSceneIndex {
    return new UsdImagingPiPrototypePropagatingSceneIndex(inputSceneIndex)
  }

  /** piPrototypePropagatingSceneIndex.cpp:790-797 and
   *  _MergingSceneIndexObserver (.cpp:833-840). */
  private constructor(inputSceneIndex: HdSceneIndexBase) {
    super()
    this._context = new _Context(inputSceneIndex)
    const self = this
    this._mergingSceneIndexObserver = {
      primsAdded(_sender, entries) { self._sendPrimsAdded(entries) },
      primsDirtied(_sender, entries) { self._sendPrimsDirtied(entries) },
      primsRemoved(_sender, entries) { self._sendPrimsRemoved(entries) },
      primsRenamed(sender, entries) {
        UsdImaging_ConvertPrimsRenamedToRemovedAndAdded(sender, entries, this)
      },
    }
    this._context.mergingSceneIndex.addObserver(this._mergingSceneIndexObserver)
    this._instancerObserver = new _InstancerObserver(this._context)
  }

  /** ~UsdImagingPiPrototypePropagatingSceneIndex
   *  (piPrototypePropagatingSceneIndex.cpp:799-804). */
  destroy(): void {
    _Context.batch(this._context, () => {
      this._instancerObserver?._destroy()
      this._instancerObserver = undefined
    })
    this._context.mergingSceneIndex.removeObserver(this._mergingSceneIndexObserver)
  }

  /** piPrototypePropagatingSceneIndex.cpp:806-815 */
  getInputScenes(): HdSceneIndexBase[] {
    if (USDIMAGING_SHOW_POINT_PROTOTYPE_SCENE_INDICES) {
      return this._context.mergingSceneIndex.getInputScenes()
    } else {
      return [this._context.inputSceneIndex]
    }
  }

  /** piPrototypePropagatingSceneIndex.cpp:817-821 */
  getEncapsulatedScenes(): HdSceneIndexBase[] {
    return [this._context.mergingSceneIndex]
  }

  /** piPrototypePropagatingSceneIndex.cpp:823-829 */
  getPrim(primPath: string): HdSceneIndexPrim {
    return this._context.mergingSceneIndex.getPrim(primPath)
  }

  /** piPrototypePropagatingSceneIndex.cpp:831-837 */
  getChildPrimPaths(primPath: string): string[] {
    return this._context.mergingSceneIndex.getChildPrimPaths(primPath)
  }
}

