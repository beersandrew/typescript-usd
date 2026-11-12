// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/dependencyForwardingSceneIndex.cpp,
//  pxr/imaging/hd/dependencyForwardingSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/dependencyForwardingSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences (no threads in JavaScript): the tbb concurrent maps/sets are
// insertion-ordered Map/Set keyed by path strings (upstream iteration order
// is unspecified); WorkParallelFor* loops run serially; the atomic
// flaggedForDeletion flags are plain booleans; WorkSwapDestroyAsync is a
// plain reset. The _VisitedNode set is keyed by path + NUL-joined locator.
// Not ported: TRACE_FUNCTION.

import { SdfPath } from 'typescript-usd/sdf/path'
import { HdRetainedContainerDataSource, type HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator, HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import { HdDependenciesSchema } from './dependenciesSchema.ts'
import { HdSingleInputFilteringSceneIndexBase } from './filteringSceneIndex.ts'
import { HdBlockDataSource, HdOverlayContainerDataSource } from './overlayContainerDataSource.ts'
import type {
  AddedPrimEntry,
  DirtiedPrimEntry,
  HdSceneIndexBase,
  HdSceneIndexPrim,
  RemovedPrimEntry,
} from './sceneIndex.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** dependencyForwardingSceneIndex.h:94-98 */
interface _LocatorsEntry {
  dependedOnDataSourceLocator: HdDataSourceLocator
  affectedDataSourceLocator: HdDataSourceLocator
}

// The token used as a key here corresponds to the first member of an
// HdDependenciesSchema::EntryPair and provides an identifier for a
// dependency declaration. An affected prim may depend on more than one
// data source of another prim. That identifier is used here for updating
// or removing a dependency.
type _LocatorsEntryMap = Map<string, _LocatorsEntry>

/** dependencyForwardingSceneIndex.h:111-140 */
interface _AffectedPrimDependencyEntry {
  locatorsEntryMap: _LocatorsEntryMap
  flaggedForDeletion: boolean
}

// Reverse mapping from a depended on prim to its discovered-thus-far
// affected prims and data source locators..
type _AffectedPrimsDependencyMap = Map<string, _AffectedPrimDependencyEntry>

// Top-level map keyed by paths of depended-on paths
type _DependedOnPrimsAffectedPrimsMap = Map<string, _AffectedPrimsDependencyMap>

type _PathSet = Set<string>

/** dependencyForwardingSceneIndex.h:173-203 */
interface _AffectedPrimToDependsOnPathsEntry {
  dependsOnPaths: _PathSet
  flaggedForDeletion: boolean
}

type _AffectedPrimToDependsOnPathsEntryMap = Map<string, _AffectedPrimToDependsOnPathsEntry>

// Dependencies may reasonably describe cycles; when following affected paths
// to propogate dirtiness, cycles are detected with a "visited" set of
// (primPath, locator) nodes (dependencyForwardingSceneIndex.h:226-262).
type _VisitedNodeSet = Set<string>
function _VisitedNode(primPath: string, locator: HdDataSourceLocator): string {
  return primPath + '\u0001' + locator.GetString('\u0000')
}

type _AdditionalDirtiedVector = DirtiedPrimEntry[]

function _HasPrefix(path: string, prefix: string): boolean {
  return SdfPath.fromString(path).hasPrefix(SdfPath.fromString(prefix))
}

let _blockDeps: HdContainerDataSource | undefined

/**
 * dependencyForwardingSceneIndex.h:24-311,
 * dependencyForwardingSceneIndex.cpp:19-703.
 *
 * Observes HdDependenciesSchema (__dependencies) declarations of prims of its
 * input and forwards PrimsDirtied notices to the affected prims/locators.
 */
export class HdDependencyForwardingSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  // Lazily-populated mapping of depended on paths to the affected paths
  // and data source locators used for forwarding of dirtying.
  // NOTE: This is mutable because it can be updated during calls to
  //       GetPrim -- which is defined as const within HdSceneIndexBase.
  //       This is in service of lazy population goals.
  private _dependedOnPrimToDependentsMap: _DependedOnPrimsAffectedPrimsMap = new Map()

  // lazily-populated set of depended on paths for affected prims. This
  // is used to update _dependedOnPrimToDependentsMap when a prim's
  // __dependencies data source is dirtied (or the prim is removed)
  private _affectedPrimToDependsOnPathsMap: _AffectedPrimToDependsOnPathsEntryMap = new Map()

  // accumulated depended-on prim paths whose affected prims may have been
  // removed.
  private readonly _potentiallyDeletedDependedOnPaths: _PathSet = new Set()

  // Accumulated affected prim paths who may have been deleted. Normally this
  // is needed to track affected prims which have an entry in
  // _dependedOnPrimToDependentsMap but which is empty -- and therefore
  // won't be handled by their dependencies inclusion in
  // _potentiallyDeletedDependedOnPaths
  private readonly _potentiallyDeletedAffectedPaths: _PathSet = new Set()

  private _manualGarbageCollect = false

  static new(inputScene: HdSceneIndexBase): HdDependencyForwardingSceneIndex {
    return new HdDependencyForwardingSceneIndex(inputScene)
  }

  /** dependencyForwardingSceneIndex.cpp:19-24 */
  protected constructor(inputScene: HdSceneIndexBase) {
    super(inputScene)
  }

  /**
   * Provided for the sake of unit testing.
   * By default, or if SetManualGarbageCollect(false) is called,
   * we call RemoveDeletedEntries at the end of all of the notice
   * handlers... dependencyForwardingSceneIndex.cpp:26-30
   */
  setManualGarbageCollect(manualGarbageCollect: boolean): void {
    this._manualGarbageCollect = manualGarbageCollect
  }

  /** dependencyForwardingSceneIndex.cpp:32-58 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    // Check incoming prim for dependencies.
    if (!this._affectedPrimToDependsOnPathsMap.has(primPath)) {
      this._updateDependencies(primPath, prim)
    }

    // HdDependencyForwardingSceneIndex implements invalidation for
    // incoming dependencies, so downstream observers need not bother.
    // Block the dependencies from further processing.
    if (this._affectedPrimToDependsOnPathsMap.has(primPath)) {
      const blockDeps = _blockDeps ??= HdRetainedContainerDataSource.new(
        [HdDependenciesSchema.getSchemaToken()],
        [HdBlockDataSource.new()])
      return {
        primType: prim.primType,
        dataSource: HdOverlayContainerDataSource.overlayedContainerDataSources(
          blockDeps, prim.dataSource),
      }
    }

    return prim
  }

  /** dependencyForwardingSceneIndex.cpp:60-66 */
  getChildPrimPaths(primPath: string): string[] {
    // pass through without change
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** dependencyForwardingSceneIndex.cpp:68-136 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    const visited: _VisitedNodeSet = new Set()
    const additionalDirtied: _AdditionalDirtiedVector = []
    const rebuildDependencies: _PathSet = new Set()

    for (const entry of entries) {
      // If this prim shows up in the dependency map, make sure we clear
      // cached dependency data.

      // Clear out the affected prim map.
      if (this._affectedPrimToDependsOnPathsMap.has(entry.primPath)) {
        this._clearDependencies(entry.primPath)
      }

      // Send out relevant invalidations.
      const dit = this._dependedOnPrimToDependentsMap.get(entry.primPath)
      if (dit) {
        for (const [affectedPrimPath, affected] of dit) {
          // Filter out self-dependencies.
          if (affectedPrimPath === entry.primPath) {
            continue
          }

          // Dirty affected prims.
          const affectedLocators = new HdDataSourceLocatorSet()
          for (const locatorsEntry of affected.locatorsEntryMap.values()) {
            affectedLocators.insert(locatorsEntry.affectedDataSourceLocator)
          }

          if (!affectedLocators.IsEmpty()) {
            additionalDirtied.push({ primPath: affectedPrimPath, dirtyLocators: affectedLocators })
            this._primDirtied(affectedPrimPath, affectedLocators,
              visited, additionalDirtied, rebuildDependencies)
          }
        }
      }
    }

    for (const rebuildPath of rebuildDependencies) {
      this._clearDependencies(rebuildPath)
      this._updateDependencies(rebuildPath)
    }

    if (!this._manualGarbageCollect) {
      this.removeDeletedEntries()
    }

    this._sendPrimsAdded(entries)
    if (additionalDirtied.length > 0) {
      this._sendPrimsDirtied(additionalDirtied)
    }
  }

  /** dependencyForwardingSceneIndex.cpp:138-162 */
  private _resetDependencies(): void {
    // deleting these maps can be surprisingly expensive!
    if (!this._manualGarbageCollect) {
      this._dependedOnPrimToDependentsMap = new Map()
      this._affectedPrimToDependsOnPathsMap = new Map()
      this._potentiallyDeletedDependedOnPaths.clear()
      this._potentiallyDeletedAffectedPaths.clear()
    } else {
      for (const [path, affected] of this._dependedOnPrimToDependentsMap) {
        this._potentiallyDeletedDependedOnPaths.add(path)
        for (const locEntry of affected.values()) {
          locEntry.flaggedForDeletion = true
        }
      }
      for (const [path, entry] of this._affectedPrimToDependsOnPathsMap) {
        this._potentiallyDeletedAffectedPaths.add(path)
        entry.flaggedForDeletion = true
      }
    }
  }

  /** dependencyForwardingSceneIndex.cpp:164-336 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    // Reset deps and early out if the entry vector starts with "/".
    // (Note: we don't search the whole vector for "/", since that's additional
    // work for our current call patterns; and we have another early out below.
    // ... we could search in the future if warranted though.)
    if (entries.length > 0 && entries[0]!.primPath === '/') {
      this._resetDependencies()
      this._sendPrimsRemoved(entries)
      return
    }

    const visited: _VisitedNodeSet = new Set()
    const additionalDirtied: _AdditionalDirtiedVector = []
    const rebuildDependencies: _PathSet = new Set()

    // For performance, if the PrimsRemoved vector is really large we add the
    // entries to a hash set; we can check a prim by iterating up-hierarchy and
    // checking against the hash set.  This tells us whether a prim has been
    // removed in O(max scene depth) time.
    //
    // If the vector is small, checking against PrimsRemoved entries is still
    // faster, as this is O(notice size).
    const HashsetThreshold = 30
    let hasBeenRemoved: (primToCheck: string) => boolean
    if (entries.length > HashsetThreshold) {
      const removedEntriesHashSet = new Set(entries.map(e => e.primPath))
      // Function to quickly check if a prim (including any parent prim) has
      // been removed.
      // (When a parent prim is removed, all child prims are also removed).
      hasBeenRemoved = (primToCheck: string): boolean => {
        for (let path = SdfPath.fromString(primToCheck); !path.isEmpty();
          path = path.getParentPath()) {
          if (removedEntriesHashSet.has(path.pathString)) {
            return true
          }
          if (path.isAbsoluteRootPath()) {
            break
          }
        }
        return false
      }
    } else {
      hasBeenRemoved = (primToCheck: string): boolean => {
        for (const entry of entries) {
          if (_HasPrefix(primToCheck, entry.primPath)) {
            return true
          }
        }
        return false
      }
    }

    // Because of the recursive nature of remove notices, we need to iterate the
    // whole dependency map.
    //
    // Iterate _affectedPrimToDependsOnPathsMap looking for:
    // - Affected prims that are descendants of primPath.
    // Clear their dependency info out.
    for (const [path, entry] of this._affectedPrimToDependsOnPathsMap) {
      if (hasBeenRemoved(path)) {
        entry.flaggedForDeletion = true
        this._potentiallyDeletedAffectedPaths.add(path)
      }
    }

    // If we deleted every affected prim, there's no point looping over
    // dependedOn prims; we can reset deps and stop here.
    if (this._potentiallyDeletedAffectedPaths.size ===
        this._affectedPrimToDependsOnPathsMap.size) {
      this._resetDependencies()
      this._sendPrimsRemoved(entries)
      return
    }

    // Iterate _dependedOnPrimToDependentsMap looking for:
    // - Depended on prims with affected entries that are descendants of
    //   primPath.
    // Clear their dependency info out.
    // - Depended on prims that are descendants of primPath with affected
    //   entries that are *not* descendants of primPath.
    // Send out relevant dirty notices.
    for (const [dependedOnPath, affectedMap] of this._dependedOnPrimToDependentsMap) {
      let dependedOnChecked = false
      let dependedOnRemoved = false
      for (const [affectedPath, affected] of affectedMap) {
        if (hasBeenRemoved(affectedPath)) {
          affected.flaggedForDeletion = true
          this._potentiallyDeletedDependedOnPaths.add(dependedOnPath)
        }

        // We keep this condition separate, in case this has already been
        // flagged for deletion from elsewhere.
        if (affected.flaggedForDeletion) {
          continue
        }

        // Only check ONCE per "depPair.first" if the "depended on" was
        // removed. This is either true or false for all items in the inner
        // loop.
        if (!dependedOnChecked) {
          dependedOnRemoved = hasBeenRemoved(dependedOnPath)
          dependedOnChecked = true
        }

        // Otherwise, if the affected prim remains but the depended on
        // prim was deleted, send dirty notices.
        if (dependedOnRemoved) {
          const affectedLocators = new HdDataSourceLocatorSet()
          for (const locatorsEntry of affected.locatorsEntryMap.values()) {
            affectedLocators.insert(locatorsEntry.affectedDataSourceLocator)
          }

          if (!affectedLocators.IsEmpty()) {
            additionalDirtied.push({ primPath: affectedPath, dirtyLocators: affectedLocators })
            this._primDirtied(affectedPath, affectedLocators,
              visited, additionalDirtied, rebuildDependencies)
          }
        }
      }
    }

    // Dependency rebuild done after _PrimDirtied for consistent semantics,
    // and so that we don't invalidate iterators everywhere...
    for (const rebuildPath of rebuildDependencies) {
      this._clearDependencies(rebuildPath)
      this._updateDependencies(rebuildPath)
    }

    if (!this._manualGarbageCollect) {
      this.removeDeletedEntries()
    }

    this._sendPrimsRemoved(entries)
    if (additionalDirtied.length > 0) {
      this._sendPrimsDirtied(additionalDirtied)
    }
  }

  /** dependencyForwardingSceneIndex.cpp:338-390 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    const visited: _VisitedNodeSet = new Set()
    const additionalEntries: _AdditionalDirtiedVector = []
    const rebuildDependencies: _PathSet = new Set()

    const depsLoc = HdDependenciesSchema.getDefaultLocator()

    for (const entry of entries) {
      // Check if dependencies were directly invalidated.
      if (entry.dirtyLocators.intersects(depsLoc)) {
        const visitedNode = _VisitedNode(entry.primPath, depsLoc)
        if (!visited.has(visitedNode)) {
          visited.add(visitedNode)
          rebuildDependencies.add(entry.primPath)
        }
      }

      this._primDirtied(entry.primPath, entry.dirtyLocators,
        visited, additionalEntries, rebuildDependencies)
    }

    // Dependency rebuild done after _PrimDirtied for consistent semantics,
    // and so that we don't invalidate iterators everywhere...
    for (const rebuildPath of rebuildDependencies) {
      this._clearDependencies(rebuildPath)
      this._updateDependencies(rebuildPath)
    }

    if (!this._manualGarbageCollect) {
      this.removeDeletedEntries()
    }

    if (additionalEntries.length === 0) {
      this._sendPrimsDirtied(entries)
    } else {
      this._sendPrimsDirtied([...entries, ...additionalEntries])
    }
  }

  /** impl for PrimDirtied which handles propogation of PrimDirtied notices
   *  for affected prims/dataSources. dependencyForwardingSceneIndex.cpp:392-458 */
  private _primDirtied(
    primPath: string,
    sourceLocatorSet: HdDataSourceLocatorSet,
    visited: _VisitedNodeSet,
    moreDirtiedEntries: _AdditionalDirtiedVector,
    rebuildDependencies: _PathSet,
  ): void {
    if (!TF_VERIFY(visited) || !TF_VERIFY(rebuildDependencies)) {
      return
    }

    const depsLoc = HdDependenciesSchema.getDefaultLocator()

    // check me in the reverse update table
    const affectedMap = this._dependedOnPrimToDependentsMap.get(primPath)
    if (!affectedMap) {
      return
    }

    for (const [affectedPrimPath, affected] of affectedMap) {
      const affectedLocators = new HdDataSourceLocatorSet()

      // now dirty any dependencies
      for (const entry of affected.locatorsEntryMap.values()) {
        if (!sourceLocatorSet.intersects(entry.dependedOnDataSourceLocator)) {
          continue
        }

        // Don't recurse if we've seen this invalidation before...
        const visitedNode = _VisitedNode(affectedPrimPath, entry.affectedDataSourceLocator)
        if (!visited.has(visitedNode)) {
          visited.add(visitedNode)
          affectedLocators.insert(entry.affectedDataSourceLocator)
          if (entry.affectedDataSourceLocator.Equals(depsLoc)) {
            rebuildDependencies.add(affectedPrimPath)
          } else if (entry.affectedDataSourceLocator.intersects(depsLoc)) {
            const depsNode = _VisitedNode(affectedPrimPath, depsLoc)
            if (!visited.has(depsNode)) {
              visited.add(depsNode)
              rebuildDependencies.add(affectedPrimPath)
            }
          }
        }
      }

      // Add the dependent invalidations & recurse
      if (!affectedLocators.IsEmpty()) {
        moreDirtiedEntries.push({ primPath: affectedPrimPath, dirtyLocators: affectedLocators })
        this._primDirtied(affectedPrimPath, affectedLocators,
          visited, moreDirtiedEntries, rebuildDependencies)
      }
    }
  }

  /** dependencyForwardingSceneIndex.cpp:460-502 */
  private _clearDependencies(primPath: string): void {
    const affectedPrimEntry = this._affectedPrimToDependsOnPathsMap.get(primPath)
    if (!affectedPrimEntry) {
      return
    }

    // Mark the affected entry for garbage collection.
    affectedPrimEntry.flaggedForDeletion = true
    this._potentiallyDeletedAffectedPaths.add(primPath)

    // Flag entries within our depended-on prims and add those prims to the
    // set of paths which should be checked during RemoveDeletedEntries
    for (const dependedOnPrimPath of affectedPrimEntry.dependsOnPaths) {
      const affectedPrimsMap = this._dependedOnPrimToDependentsMap.get(dependedOnPrimPath)
      if (!affectedPrimsMap) {
        continue
      }

      const thisAffectedPrimEntry = affectedPrimsMap.get(primPath)
      if (!thisAffectedPrimEntry) {
        continue
      }

      thisAffectedPrimEntry.flaggedForDeletion = true
      this._potentiallyDeletedDependedOnPaths.add(dependedOnPrimPath)
    }
  }

  /** dependencyForwardingSceneIndex.cpp:504-509 and 511-584 */
  private _updateDependencies(primPath: string, prim?: HdSceneIndexPrim): void {
    if (prim === undefined) {
      prim = this._getInputSceneIndex().getPrim(primPath)
    }

    if (!prim.dataSource) {
      return
    }

    const dependenciesSchema = HdDependenciesSchema.getFromParent(prim.dataSource)

    // NOTE: This early exit prevents addition of an entry within
    //       _affectedPrimToDependsOnPathsMap if there isn't one already.
    //       The trade-off is repeatedly doing this check vs adding an entry
    //       for every prim which doesn't have dependencies.
    if (!dependenciesSchema.isDefined()) {
      return
    }

    // presence (even if empty) indicates we've been checked
    // NOTE: we only add to this set. We'll remove entries (and the map itself)
    //       as part of single-threaded clearing.
    let dependsOnPathsEntry = this._affectedPrimToDependsOnPathsMap.get(primPath)
    if (!dependsOnPathsEntry) {
      dependsOnPathsEntry = { dependsOnPaths: new Set(), flaggedForDeletion: false }
      this._affectedPrimToDependsOnPathsMap.set(primPath, dependsOnPathsEntry)
    }
    dependsOnPathsEntry.flaggedForDeletion = false

    const dependsOnPaths = dependsOnPathsEntry.dependsOnPaths

    for (const [entryName, depSchema] of dependenciesSchema.getEntries()) {
      if (!depSchema.isDefined()) {
        continue
      }

      let dependedOnPrimPath = ''
      const dependedOnPrimPathDataSource = depSchema.getDependedOnPrimPath()
      if (dependedOnPrimPathDataSource) {
        dependedOnPrimPath = dependedOnPrimPathDataSource.getTypedValue(0.0)
      }

      let dependedOnDataSourceLocator = HdDataSourceLocator.EmptyLocator
      let affectedSourceLocator = HdDataSourceLocator.EmptyLocator

      const dependedOnLds = depSchema.getDependedOnDataSourceLocator()
      if (dependedOnLds) {
        dependedOnDataSourceLocator = dependedOnLds.getTypedValue(0.0)
      }

      const affectedLds = depSchema.getAffectedDataSourceLocator()
      if (affectedLds) {
        affectedSourceLocator = affectedLds.getTypedValue(0.0)
      }

      // self dependency
      if (!dependedOnPrimPath) {
        dependedOnPrimPath = primPath
      }

      dependsOnPaths.add(dependedOnPrimPath)

      let reverseDependencies = this._dependedOnPrimToDependentsMap.get(dependedOnPrimPath)
      if (!reverseDependencies) {
        reverseDependencies = new Map()
        this._dependedOnPrimToDependentsMap.set(dependedOnPrimPath, reverseDependencies)
      }

      let reverseDependenciesEntry = reverseDependencies.get(primPath)
      if (!reverseDependenciesEntry) {
        reverseDependenciesEntry = { locatorsEntryMap: new Map(), flaggedForDeletion: false }
        reverseDependencies.set(primPath, reverseDependenciesEntry)
      }

      reverseDependenciesEntry.locatorsEntryMap.set(entryName, {
        dependedOnDataSourceLocator,
        affectedDataSourceLocator: affectedSourceLocator,
      })
      reverseDependenciesEntry.flaggedForDeletion = false
    }
  }

  /**
   * XXX does thread-unsafe deletion.
   * NOTE: optional arguments are in service of unit testing to provide
   *       insight in to what was removed.
   * dependencyForwardingSceneIndex.cpp:586-701
   */
  removeDeletedEntries(
    removedAffectedPrimPaths?: string[],
    removedDependedOnPrimPaths?: string[],
  ): void {
    for (const dependedOnPrimPath of this._potentiallyDeletedDependedOnPaths) {
      const affectedPrimsMap = this._dependedOnPrimToDependentsMap.get(dependedOnPrimPath)
      if (!affectedPrimsMap) {
        continue
      }

      // Note: some prims have pretty wild fan-out, so we iterate over
      // whichever set of potentially affected prims is smaller...
      if (affectedPrimsMap.size <= this._potentiallyDeletedAffectedPaths.size) {
        for (const [path, entry] of [...affectedPrimsMap]) {
          if (entry.flaggedForDeletion) {
            affectedPrimsMap.delete(path)
          }
        }
      } else {
        for (const path of this._potentiallyDeletedAffectedPaths) {
          const entry = affectedPrimsMap.get(path)
          if (entry && entry.flaggedForDeletion) {
            affectedPrimsMap.delete(path)
          }
        }
      }

      // If we've erased all of the affected entries, we need to erase
      // the dependedOn entry as well.
      if (affectedPrimsMap.size === 0) {
        removedDependedOnPrimPaths?.push(dependedOnPrimPath)
        this._dependedOnPrimToDependentsMap.delete(dependedOnPrimPath)
      }
    }

    for (const affectedPrimPath of this._potentiallyDeletedAffectedPaths) {
      const entry = this._affectedPrimToDependsOnPathsMap.get(affectedPrimPath)
      if (!entry) {
        continue
      }

      if (entry.flaggedForDeletion) {
        removedAffectedPrimPaths?.push(affectedPrimPath)
        this._affectedPrimToDependsOnPathsMap.delete(affectedPrimPath)
      }
    }

    this._potentiallyDeletedDependedOnPaths.clear()
    this._potentiallyDeletedAffectedPaths.clear()
  }
}
