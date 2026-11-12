// Ported from OpenUSD 26.11.1: pxr/exec/esfUsd/stageData.cpp,
//  pxr/exec/esfUsd/stageData.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/stageData.h and stageData.cpp.
//
// EsfUsdStageData holds data that is cached per-stage (stageData.h:39-53):
// the attribute connection tables. The outgoing table maps each owning
// attribute path to the paths its connections target; the incoming table
// maps each targeted object path to the attributes whose connections target
// it. The tables are populated when a stage is first registered and kept up
// to date by listening to UsdNotice::ObjectsChanged from the stage; clients
// register a ListenerBase to be told which targets' incoming connections
// changed.
//
// Containers (openexec-x1.md 4.1, section 5): the tbb concurrent containers
// are JS containers, and WorkDispatcher/WorkParallelForEach/WorkParallelForN
// come from typescript-usd/work, which runs them serially; the
// listener mutex is dropped.
//  * _OutgoingPathTable, tbb::concurrent_map<SdfPath, SdfPathVector,
//    _PathRangeLessThan> (stageData.h:156-157), is an ordered table: keys in
//    SdfPath order (SdfPath.compare, SdfPath::operator<) with lower_bound
//    over the path and over a _PathPrefix (stageData.h:136-153).
//  * _IncomingPathTable, tbb::concurrent_unordered_map<SdfPath,
//    tbb::concurrent_vector<SdfPath>> (stageData.h:160-162), is a Map keyed
//    by SdfPath.pathString.
//  * ChangedPathSet, tbb::concurrent_unordered_set<SdfPath>
//    (stageData.h:56-60), is SdfPathSet.
//
// Lifetime: RegisterStage returns the stage data that upstream returns in a
// std::shared_ptr, and the global stage data table holds it weakly
// (std::weak_ptr, stageData.cpp:53-60), so the stage data lives as long as a
// client holds it. The notice listener is registered with a weak pointer to
// itself (TfCreateWeakPtr, stageData.cpp:653-658), so it does not keep the
// stage data alive; when the stage data is collected its notice
// registration is revoked (~_NoticeListener, stageData.cpp:661-664) by a
// FinalizationRegistry, rather than at the point the last strong reference
// is dropped.

import { TF_VERIFY, Notice as TfNotice, type NoticeKey as TfNoticeKey } from 'typescript-usd/tf'
import { SdfPath, SdfPathSet } from 'typescript-usd/sdf/path'
import {
  Notice as UsdNotice, PrimRange as UsdPrimRange,
  type Attribute as UsdAttribute, type Prim as UsdPrim, type Stage as UsdStage,
} from 'typescript-usd/usd'
import { WorkDispatcher, WorkParallelForEach, WorkParallelForN } from 'typescript-usd/work'
import { _EsfUsdPrimDefaultPredicate } from './object.ts'

/**
 * A set of paths, used to indicate the set of targets for which incoming
 * connections have changed (stageData.h:56-60).
 */
type ChangedPathSet = SdfPathSet

// SdfFieldKeys->ConnectionPaths.
const _ConnectionPathsField = 'connectionPaths'

// Global table of stage data, keyed by stage (stageData.cpp:45-60). The
// stage key is held weakly, like the UsdStageConstPtr key of upstream's
// table, and the value is a weak reference (std::weak_ptr).
const stageDataTable = new WeakMap<UsdStage, WeakRef<EsfUsdStageData>>()

// Revokes a collected stage data's notice registration (~_NoticeListener).
const _noticeKeyRevoker = new FinalizationRegistry<TfNoticeKey>(key => key.revoke())

// The _PathPrefix lower_bound key of stageData.h:136-139.
interface _PathPrefix {
  readonly prefix: SdfPath
}

/** An entry of the outgoing connection table. */
interface _OutgoingEntry {
  readonly path: SdfPath
  targets: SdfPath[]
}

/**
 * _OutgoingPathTable (stageData.h:156-157): an ordered map from owning
 * attribute paths to target object paths, ordered by _PathRangeLessThan
 * (stageData.h:141-153). find, operator[] / emplace, unsafe_erase and
 * lower_bound keep upstream's names; iterators are indices.
 */
class _OutgoingPathTable {
  private readonly _entries: _OutgoingEntry[] = []
  private readonly _byPath = new Map<string, _OutgoingEntry>()

  get size(): number {
    return this._entries.length
  }

  /** Iterator access: the entry at position \p i. */
  at(i: number): _OutgoingEntry {
    return this._entries[i]!
  }

  find(path: SdfPath): _OutgoingEntry | undefined {
    return this._byPath.get(path.pathString)
  }

  /**
   * lower_bound (stageData.h:141-153): the first position whose key is not
   * less than \p key. For a _PathPrefix, a key is less than the prefix when
   * `lhs < rhs.prefix || lhs.HasPrefix(rhs.prefix)`.
   */
  lower_bound(key: SdfPath | _PathPrefix): number {
    const less = key instanceof SdfPath
      ? (lhs: SdfPath) => SdfPath.compare(lhs, key) < 0
      : (lhs: SdfPath) => SdfPath.compare(lhs, key.prefix) < 0 || lhs.hasPrefix(key.prefix)
    let lo = 0
    let hi = this._entries.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (less(this._entries[mid]!.path)) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    return lo
  }

  /** emplace: inserts when \p path is not yet a key; returns whether it
   *  inserted. */
  emplace(path: SdfPath, targets: SdfPath[]): boolean {
    if (this._byPath.has(path.pathString)) {
      return false
    }
    const entry: _OutgoingEntry = { path, targets }
    this._entries.splice(this.lower_bound(path), 0, entry)
    this._byPath.set(path.pathString, entry)
    return true
  }

  /** operator[](path) = targets. */
  Set(path: SdfPath, targets: SdfPath[]): void {
    const entry = this._byPath.get(path.pathString)
    if (entry) {
      entry.targets = targets
    } else {
      this.emplace(path, targets)
    }
  }

  /** unsafe_erase(key). */
  unsafe_erase(path: SdfPath): void {
    if (!this._byPath.delete(path.pathString)) {
      return
    }
    const i = this.lower_bound(path)
    this._entries.splice(i, 1)
  }

  /** unsafe_erase(iterator): returns the iterator following the erased
   *  element. */
  unsafe_erase_at(i: number): number {
    const entry = this._entries[i]!
    this._byPath.delete(entry.path.pathString)
    this._entries.splice(i, 1)
    return i
  }
}

/** An entry of an incoming connection table: the owning attribute paths of
 *  connections that target `path`. */
interface _IncomingEntry {
  readonly path: SdfPath
  readonly owners: SdfPath[]
}

/**
 * _IncomingPathTable (stageData.h:160-162): a map from target object paths
 * to owning attribute paths, keyed by SdfPath.pathString.
 */
class _IncomingPathTable {
  private readonly _map = new Map<string, _IncomingEntry>()

  get size(): number {
    return this._map.size
  }

  empty(): boolean {
    return this._map.size === 0
  }

  find(path: SdfPath): _IncomingEntry | undefined {
    return this._map.get(path.pathString)
  }

  /** operator[](path): the owners vector for \p path, inserting an empty
   *  one when absent. */
  Get(path: SdfPath): SdfPath[] {
    let entry = this._map.get(path.pathString)
    if (!entry) {
      entry = { path, owners: [] }
      this._map.set(path.pathString, entry)
    }
    return entry.owners
  }

  unsafe_erase(path: SdfPath): void {
    this._map.delete(path.pathString)
  }

  values(): IterableIterator<_IncomingEntry> {
    return this._map.values()
  }
}

// std::set<SdfPath> of a path vector, in SdfPath order.
function _SortedPathSet(paths: readonly SdfPath[]): SdfPath[] {
  const unique = new Map<string, SdfPath>()
  for (const path of paths) {
    unique.set(path.pathString, path)
  }
  return [...unique.values()].sort(SdfPath.compare)
}

// std::set_difference(a, b) of sorted path sets.
function _SetDifference(a: readonly SdfPath[], b: readonly SdfPath[], out: SdfPath[]): void {
  let j = 0
  for (const path of a) {
    while (j < b.length && SdfPath.compare(b[j]!, path) < 0) {
      j++
    }
    if (j < b.length && SdfPath.compare(b[j]!, path) === 0) {
      continue
    }
    out.push(path)
  }
}

/**
 * The base class for listeners defined by clients in order to be notified of
 * scene changes (stageData.h:62-77).
 */
abstract class _ListenerBase {
  /** Called to communicate scene changes to a client listener
   *  (stageData.h:70-75). */
  abstract _didObjectsChanged(
    objectsChanged: UsdNotice.ObjectsChanged,
    changedTargetPaths: ChangedPathSet,
  ): void
}

export class EsfUsdStageData {
  /** The listener base class (stageData.h:62-77). */
  static readonly ListenerBase = _ListenerBase

  // stageData.h:236
  private readonly _stage: UsdStage | null

  // stageData.h:239-240: the notice registration of _NoticeListener.
  private readonly _noticeListener: TfNoticeKey | null

  // Registered listeners, used to communicate change notification to
  // clients (stageData.h:243).
  private readonly _listeners: Array<_ListenerBase | null> = []

  // stageData.h:246
  private readonly _outgoing = new _OutgoingPathTable()

  // stageData.h:248
  private readonly _incoming = new _IncomingPathTable()

  // stageData.cpp:64-71
  private constructor(stage: UsdStage | null) {
    this._stage = stage
    this._noticeListener = stage ? EsfUsdStageData._noticeListener(this, stage) : null
    this._populateConnectionTables()
  }

  // The stage data GetStageData returns when the client did not register
  // the stage (stageData.cpp:136-152, `static EsfUsdStageData
  // empty(nullptr)`). With a null stage it registers no notice listener.
  private static _empty: EsfUsdStageData | undefined
  private static _getEmpty(): EsfUsdStageData {
    return (EsfUsdStageData._empty ??= new EsfUsdStageData(null))
  }

  /**
   * Registers \p stage as a stage for which cached data should be held,
   * returning the stage data the client must hold until the cached data is
   * no longer needed (stageData.cpp:72-114). \p listener will be notified of
   * scene changes.
   */
  static registerStage(stage: UsdStage, newListener: _ListenerBase | null): EsfUsdStageData {
    // If the table has an entry and the stage data is still alive, add the
    // listener and return it.
    const ptr = stageDataTable.get(stage)?.deref()
    if (ptr) {
      ptr._listeners.push(newListener)
      return ptr
    }

    // Otherwise, no stage data has been allocated for this entry. Create the
    // stage data and store it in the table.
    const created = new EsfUsdStageData(stage)
    created._listeners.push(newListener)
    stageDataTable.set(stage, new WeakRef(created))
    return created
  }

  /** Notifies that \p listener no longer needs to be informed of changes
   *  (stageData.cpp:116-125). */
  unregister(listener: _ListenerBase | null): void {
    const it = this._listeners.indexOf(listener)
    if (TF_VERIFY(it !== -1, 'it != _listeners.end()')) {
      this._listeners.splice(it, 1)
    }
  }

  /**
   * Get the cached stage data for \p stage (stageData.cpp:127-155). The
   * client must first have registered \p stage by calling RegisterStage and
   * must still be holding the stage data.
   */
  static getStageData(stage: UsdStage | null): EsfUsdStageData {
    TF_VERIFY(stage, 'stage')

    const entry = stage ? stageDataTable.get(stage) : undefined
    const found = entry !== undefined
    if (!TF_VERIFY(found, 'found')) {
      return EsfUsdStageData._getEmpty()
    }

    const ptr = entry!.deref()
    if (!TF_VERIFY(ptr, 'ptr')) {
      return EsfUsdStageData._getEmpty()
    }

    return ptr!
  }

  // stageData.cpp:157-187
  private _populateConnectionTables(): void {
    if (!TF_VERIFY(this._stage, '_stage')) {
      return
    }

    const incoming = this._incoming
    const outgoing = this._outgoing
    // UsdStage::GetPseudoRoot is typescript-usd's Stage.getPrim('/').
    const range = this._stage!.getPrim('/')!.getDescendants()
    WorkParallelForEach(range, (prim: UsdPrim) => {
      for (const attr of prim.getAttributes()) {
        const targetPaths: SdfPath[] = []
        if (!attr.getConnections(targetPaths)) {
          continue
        }

        const ownerPath = SdfPath.fromString(attr.getPath())
        for (const targetPath of targetPaths) {
          incoming.Get(targetPath).push(ownerPath)
        }
        outgoing.emplace(ownerPath, targetPaths)
      }
    })
  }

  /** Returns the paths of all objects that are targets of connections owned
   *  by the attribute at \p attrPath (stageData.cpp:189-200). */
  static getOutgoingConnections(stage: UsdStage | null, attrPath: SdfPath): SdfPath[] {
    if (!TF_VERIFY(stage, 'stage')) {
      return []
    }

    return EsfUsdStageData.getStageData(stage)._getOutgoingConnections(attrPath)
  }

  // stageData.cpp:202-210. Upstream returns a reference to the table's
  // vector; this returns a copy, so callers cannot edit the table.
  private _getOutgoingConnections(attrPath: SdfPath): SdfPath[] {
    const it = this._outgoing.find(attrPath)
    return it !== undefined ? [...it.targets] : []
  }

  /** Returns the paths of all attributes that own connections that target
   *  the object at \p targetPath (stageData.cpp:212-222). */
  static getIncomingConnections(stage: UsdStage | null, targetPath: SdfPath): SdfPath[] {
    if (!TF_VERIFY(stage, 'stage')) {
      return []
    }

    return EsfUsdStageData.getStageData(stage)._getIncomingConnections(targetPath)
  }

  // stageData.cpp:224-242
  private _getIncomingConnections(targetPath: SdfPath): SdfPath[] {
    const it = this._incoming.find(targetPath)
    if (it === undefined) {
      return []
    }

    const result: SdfPath[] = []
    for (const path of it.owners) {
      result.push(path)
    }
    return result
  }

  // Updates attribute connection caches for connections owned by the
  // attribute at \p attrPath, populating \p incomingConnectionsChanged with
  // the paths of objects whose incoming connection paths have changed
  // (stageData.cpp:244-315).
  private _updateForChangedAttributeConnections(
    attrPath: SdfPath,
    incomingConnectionsChanged: ChangedPathSet,
  ): void {
    if (!TF_VERIFY(this._stage, '_stage')) {
      return
    }

    // If the attribute is inactive, unloaded, undefined, or abstract, treat
    // it as if it's not in the scene.
    const attr = ((): UsdAttribute | undefined => {
      const attr = this._stage!.getAttributeAtPath(attrPath.pathString)
      return attr && attr.isValid() && _EsfUsdPrimDefaultPredicate(attr.getPrim())
        ? attr : undefined
    })()

    const newConnections: SdfPath[] = []
    const addedTargetPaths: SdfPath[] = []
    const removedTargetPaths: SdfPath[] = []
    this._getChangedConnectionTargets(
      attrPath, attr,
      newConnections, addedTargetPaths, removedTargetPaths)

    // Note that we are careful not to return early here if the connection
    // order may have changed.
    if (newConnections.length === 0 &&
        addedTargetPaths.length === 0 &&
        removedTargetPaths.length === 0) {
      return
    }

    // Update the incoming connections table
    for (const targetPath of addedTargetPaths) {
      this._incoming.Get(targetPath).push(attrPath)
    }
    for (const removedPath of removedTargetPaths) {
      const incomingIt = this._incoming.find(removedPath)
      if (!TF_VERIFY(incomingIt !== undefined, 'incomingIt != _incoming.end()')) {
        continue
      }

      // To remove from the concurrent_vector, move the last element into
      // the position of the removed element and resize.
      const owners = incomingIt!.owners
      const it = owners.findIndex(owner => owner.equals(attrPath))
      if (!TF_VERIFY(it !== -1, 'it != owners.end()')) {
        continue
      }

      const last = owners.length - 1
      if (it !== last) {
        owners[it] = owners[last]!
      }
      owners.length = owners.length - 1
    }

    // Update the outgoing connections table
    if (newConnections.length === 0) {
      this._outgoing.unsafe_erase(attrPath)
    } else {
      this._outgoing.Set(attrPath, newConnections)
    }

    for (const path of addedTargetPaths) {
      incomingConnectionsChanged.add(path)
    }
    for (const path of removedTargetPaths) {
      incomingConnectionsChanged.add(path)
    }
  }

  // Updates attribute connection caches for connections owned by attributes
  // at or under \p resyncedPath (stageData.cpp:317-444).
  private _updateForResync(
    resyncedPath: SdfPath,
    incomingConnectionsChanged: ChangedPathSet,
  ): void {
    if (!TF_VERIFY(this._stage, '_stage')) {
      return
    }

    if (resyncedPath.isPropertyPath()) {
      this._updateForChangedAttributeConnections(
        resyncedPath, incomingConnectionsChanged)
      return
    }

    // We only expect resyncs for prims or properties.
    if (!TF_VERIFY(resyncedPath.isPrimPath(), 'resyncedPath.IsPrimPath()')) {
      return
    }

    // Queue up paths of owner attributes to remove in series.
    const ownerAttrsToRemove: SdfPath[] = []

    // Queue up incoming connections to be removed, since we can't remove
    // these elements in parallel. This is a map from owning attribute to
    // vector of connection target paths that have gone away.
    const incomingToRemove = new _IncomingPathTable()

    const dispatcher = new WorkDispatcher()

    const resyncedPrim = this._stage!.getPrim(resyncedPath.pathString)

    // If there's no prim at the resynced path, or not one that is active,
    // loaded, defined, and non-abstract, then we remove entries from the
    // outgoing connection table for all paths under the given prim path. We
    // queue up incoming connections to be removed later.
    //
    // Note that as long as an owning attribute has a given connection, the
    // incoming connection map entry remains populated, regardless of whether
    // the targeted object exists in the scene.
    if (!_EsfUsdPrimDefaultPredicate(resyncedPrim)) {
      for (let it = this._outgoing.lower_bound(resyncedPath);
        it !== this._outgoing.size && this._outgoing.at(it).path.hasPrefix(resyncedPath);) {
        const entry = this._outgoing.at(it)
        const ownerPath = entry.path
        for (const targetPath of entry.targets) {
          incomingToRemove.Get(targetPath).push(ownerPath)
          incomingConnectionsChanged.add(targetPath)
        }
        it = this._outgoing.unsafe_erase_at(it)
      }
    }

    // Otherwise, the resynced prim still exists, so make updates for that
    // prim and all descendants of that prim (including descendants that are
    // present in the connection tables, but no longer present in the scene).
    //
    // We do this in stages, first starting from the resynced prim and
    // traversing its namespace descendants. New outgoing and incoming
    // connections can be added immediately, but removed incoming
    // connections, and owning attributes whose connections should be
    // removed from the outgoing table, must be queued up to be processed in
    // the second stage. Once the traversal is complete, we apply the queued
    // updates to the incoming and outgoing tables.
    else {
      // Update for the namespace subtree rooted at the resynced prim.
      dispatcher.run(() => {
        const range = UsdPrimRange.fromPrim(resyncedPrim!)
        WorkParallelForEach(range, (prim: UsdPrim) => {
          this._updateForChangedPrim(
            prim, incomingToRemove, incomingConnectionsChanged)
        })
      })

      // Iterate over the outgoing map to find entries for attributes on the
      // resynced prim and its descendants that no longer exist in the scene.
      dispatcher.run(() => {
        this._updateForRemovedAttributes(
          resyncedPath, incomingToRemove, ownerAttrsToRemove)
      })

      // Wait until we've collected all deferred updates.
      dispatcher.Wait()
    }

    // Remove outgoing connections for the queued owner paths.
    if (ownerAttrsToRemove.length !== 0) {
      const outgoing = this._outgoing
      dispatcher.run(() => {
        for (const path of ownerAttrsToRemove) {
          outgoing.unsafe_erase(path)
        }
      })
    }

    // Remove entries from the incoming table.
    if (!incomingToRemove.empty()) {
      dispatcher.run(() => {
        this._removeIncomingTableEntries(incomingToRemove)
      })
    }

    dispatcher.Wait()
  }

  // Gets the new (i.e., current) connections for the given attribute and
  // computes the added and removed target paths, relative to what was
  // previously stored in the outgoing connection paths table
  // (stageData.cpp:446-488).
  private _getChangedConnectionTargets(
    attrPath: SdfPath,
    attribute: UsdAttribute | undefined,
    newConnections: SdfPath[],
    addedTargetPaths: SdfPath[],
    removedTargetPaths: SdfPath[],
  ): void {
    // If we have no attribute and no record of connections for an attribute
    // at this path, there's nothing to do. At least one way this can happen
    // is if the object at attrPath is a relationship.
    const it = this._outgoing.find(attrPath)
    if (it === undefined && !attribute) {
      return
    }

    const oldConnections: readonly SdfPath[] = it === undefined ? [] : it.targets

    if (attribute) {
      attribute.getConnections(newConnections)
    } else {
      newConnections.length = 0
    }

    const oldSet = _SortedPathSet(oldConnections)
    const newSet = _SortedPathSet(newConnections)

    _SetDifference(newSet, oldSet, addedTargetPaths)
    _SetDifference(oldSet, newSet, removedTargetPaths)
  }

  // Updates outgoing and incoming connection tables for any changes to the
  // given prim (stageData.cpp:490-527). New incoming connections are added
  // immediately; new outgoing connections and removed incoming connections
  // are queued up for deferred processing.
  private _updateForChangedPrim(
    prim: UsdPrim,
    incomingToRemove: _IncomingPathTable,
    incomingConnectionsChanged: ChangedPathSet,
  ): void {
    // Visit all of the attributes on the prim and get the changed
    // connections.
    for (const attribute of prim.getAttributes()) {
      const attrPath = SdfPath.fromString(attribute.getPath())

      const newConnections: SdfPath[] = []
      const addedTargetPaths: SdfPath[] = []
      const removedTargetPaths: SdfPath[] = []
      this._getChangedConnectionTargets(
        attrPath, attribute,
        newConnections, addedTargetPaths, removedTargetPaths)

      // Incoming connections can be added immediately.
      for (const targetPath of addedTargetPaths) {
        this._incoming.Get(targetPath).push(attrPath)
      }

      // Add new connections to the outgoing table.
      this._outgoing.Set(attrPath, newConnections)

      // Queue up incoming connections to be removed.
      for (const targetPath of removedTargetPaths) {
        incomingToRemove.Get(targetPath).push(attrPath)
      }

      for (const path of removedTargetPaths) {
        incomingConnectionsChanged.add(path)
      }
      for (const path of addedTargetPaths) {
        incomingConnectionsChanged.add(path)
      }
    }
  }

  // Find entries in the outgoing connections map for attributes on the
  // resynced prim and its descendants that no longer exist in the scene,
  // populating \p ownerAttrsToRemove and \p incomingToRemove
  // (stageData.cpp:529-562).
  private _updateForRemovedAttributes(
    resyncedPath: SdfPath,
    incomingToRemove: _IncomingPathTable,
    ownerAttrsToRemove: SdfPath[],
  ): void {
    const begin = this._outgoing.lower_bound(resyncedPath)
    const end = this._outgoing.lower_bound({ prefix: resyncedPath })
    if (begin === end) {
      return
    }

    const stage = this._stage!
    const entries: _OutgoingEntry[] = []
    for (let i = begin; i !== end; ++i) {
      entries.push(this._outgoing.at(i))
    }
    WorkParallelForEach(entries, (entry: _OutgoingEntry) => {
      const ownerPath = entry.path
      const attr = stage.getAttributeAtPath(ownerPath.pathString)
      if (attr && attr.isValid() && _EsfUsdPrimDefaultPredicate(attr.getPrim())) {
        return
      }

      ownerAttrsToRemove.push(ownerPath)
      for (const targetPath of entry.targets) {
        incomingToRemove.Get(targetPath).push(ownerPath)
      }
    })
  }

  // Removes the entries indicated by \p incomingToRemove from _incoming
  // (stageData.cpp:564-631).
  private _removeIncomingTableEntries(incomingToRemove: _IncomingPathTable): void {
    // Iterate over the incomingToRemove map, updating changed owner paths in
    // the incoming connections table. Entries that no longer have incoming
    // connections are queued up to be removed in series below.
    const targetsToRemove: SdfPath[] = []
    const incoming = this._incoming
    const buckets = [...incomingToRemove.values()]

    WorkParallelForN(buckets.length, (b: number, e: number) => {
      for (let bucketIdx = b; bucketIdx !== e; ++bucketIdx) {
        const { path: targetPath, owners: toRemove } = buckets[bucketIdx]!

        const incomingIt = incoming.find(targetPath)
        if (!TF_VERIFY(incomingIt !== undefined, 'incomingIt != incoming.end()')) {
          continue
        }

        const owners = incomingIt!.owners
        if (!TF_VERIFY(owners.length >= toRemove.length,
          'owners.size() >= toRemove.size()')) {
          continue
        }

        // If we're removing all of the incoming owners, queue up for removal
        // below.
        const numRemainingOwners = owners.length - toRemove.length
        if (numRemainingOwners === 0) {
          targetsToRemove.push(targetPath)
          continue
        }

        // To remove from the concurrent_vector, move elements from the end
        // and resize.
        let last = owners.length - 1
        for (let it = 0; it !== last;) {
          const owner = owners[it]!
          if (toRemove.some(path => path.equals(owner))) {
            owners[it] = owners[last]!
            --last
          } else {
            ++it
          }
        }
        owners.length = numRemainingOwners
      }
    })

    for (const targetPath of targetsToRemove) {
      this._incoming.unsafe_erase(targetPath)
    }
  }

  // Notifies all listeners of changes (stageData.cpp:633-645).
  private _notify(
    objectsChanged: UsdNotice.ObjectsChanged,
    changedTargetPaths: ChangedPathSet,
  ): void {
    for (const listener of this._listeners) {
      if (listener) {
        listener._didObjectsChanged(objectsChanged, changedTargetPaths)
      }
    }
  }

  // EsfUsdStageData::_NoticeListener (stageData.cpp:647-673): subscribes to
  // UsdNotice::ObjectsChanged from the stage, holding the stage data weakly
  // (TfCreateWeakPtr), and is revoked when the stage data is collected.
  private static _noticeListener(stageData: EsfUsdStageData, stage: UsdStage): TfNoticeKey {
    const weakStageData = new WeakRef(stageData)
    const key = TfNotice.Register(
      UsdNotice.ObjectsChanged,
      (objectsChanged: UsdNotice.ObjectsChanged) => {
        weakStageData.deref()?._didObjectsChanged(objectsChanged)
      },
      stage)
    _noticeKeyRevoker.register(stageData, key)
    return key
  }

  // EsfUsdStageData::_NoticeListener::_DidObjectsChanged
  // (stageData.cpp:675-705).
  private _didObjectsChanged(objectsChanged: UsdNotice.ObjectsChanged): void {
    // Collect paths of targeted objects whose incoming attribute connections
    // have been added and/or removed.
    const changedTargetPaths: ChangedPathSet = new SdfPathSet()

    for (const path of objectsChanged.getResyncedPaths()) {
      this._updateForResync(SdfPath.fromString(path), changedTargetPaths)
    }

    for (const path of objectsChanged.getResolvedAssetPathsResyncedPaths()) {
      this._updateForResync(SdfPath.fromString(path), changedTargetPaths)
    }

    for (const path of objectsChanged.getChangedInfoOnlyPaths()) {
      const changedFields = objectsChanged.getChangedFields(path)
      if (changedFields.includes(_ConnectionPathsField)) {
        this._updateForChangedAttributeConnections(
          SdfPath.fromString(path), changedTargetPaths)
      }
    }

    this._notify(objectsChanged, changedTargetPaths)
  }
}

// The nested types EsfUsdStageData::ListenerBase and
// EsfUsdStageData::ChangedPathSet (stageData.h:56-77).
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace EsfUsdStageData {
  type ListenerBase = _ListenerBase
  type ChangedPathSet = SdfPathSet
}
