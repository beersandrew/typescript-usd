// Ported from OpenUSD 26.11.1: pxr/imaging/hd/mergingSceneIndex.cpp,
//  pxr/imaging/hd/mergingSceneIndex.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/mergingSceneIndex.{h,cpp}
// HdMergingSceneIndex — merges multiple scenes together. For prims which exist
// in more than one input scene, data sources are overlayed (down to the leaf)
// with the earlier inserted scene having the stronger opinion.

import {
  HdContainerDataSource,
  HdRetainedContainerDataSource,
} from './dataSource.ts'
import { HdOverlayContainerDataSource } from './overlayContainerDataSource.ts'
import {
  HdSceneIndexBase,
  HdSceneIndexPrimView,
  type AddedPrimEntry,
  type DirtiedPrimEntry,
  type HdSceneIndexObserver,
  type HdSceneIndexPrim,
  type RemovedPrimEntry,
  type RenamedPrimEntry,
} from './sceneIndex.ts'
import { HdFilteringSceneIndexBase } from './filteringSceneIndex.ts'
import {
  HdSiHasPrefix,
  HdSiIsAbsoluteRootOrPrimPath,
  HdSiParentPath,
  HdSiComponents,
  HdSiChildPath,
} from './retainedSceneIndex.ts'

const _emptyContainer: HdContainerDataSource = HdRetainedContainerDataSource.new(
  [],
  [],
)

// ---- Input entry to add a scene to the merging scene index ----

export interface HdMergingInputScene {
  scene: HdSceneIndexBase | undefined
  // The shallowest path at which prims in the scene should be considered.
  activeInputSceneRoot?: string
  // The position where to insert the scene (default: after the last scene).
  pos?: number
}

interface _InputEntry {
  sceneIndex: HdSceneIndexBase
  sceneRoot: string
}

const _noInputEntries: readonly _InputEntry[] = []

function _primIsDefined(prim: HdSceneIndexPrim): boolean {
  return prim.dataSource !== undefined
}

export class HdMergingSceneIndex extends HdFilteringSceneIndexBase {
  private _inputs: _InputEntry[] = []
  // mergingSceneIndex.h:174-181 (_InputEntriesByPathTable): an entry for
  // every input sceneRoot and (implicitly, as SdfPathTable inserts them) each
  // of its ancestors, holding the inputs whose sceneRoot is that path or an
  // ancestor of it, in input order.
  private _inputsPathTable = new Map<string, _InputEntry[]>()
  // The table's paths by parent path: FindSubtreeRange's children, for
  // GetChildPrimPaths (mergingSceneIndex.cpp:424-429).
  private _inputsPathTableChildren = new Map<string, string[]>()
  private _observer: HdSceneIndexObserver
  private _destroyed = false

  constructor() {
    super()
    this._observer = {
      primsAdded: (sender, entries) => this._primsAdded(sender, entries),
      primsRemoved: (sender, entries) => this._primsRemoved(sender, entries),
      primsDirtied: (sender, entries) => this._primsDirtied(sender, entries),
      primsRenamed: (sender, entries) => this._primsRenamed(sender, entries),
    }
  }

  static new(): HdMergingSceneIndex {
    return new HdMergingSceneIndex()
  }

  addInputScene(
    inputScene: HdSceneIndexBase | undefined,
    activeInputSceneRoot = '/',
  ): void {
    this.insertInputScene(this._inputs.length, inputScene, activeInputSceneRoot)
  }

  insertInputScene(
    pos: number,
    inputScene: HdSceneIndexBase | undefined,
    activeInputSceneRoot = '/',
  ): void {
    this.insertInputScenes([{ scene: inputScene, activeInputSceneRoot, pos }])
  }

  // mergingSceneIndex.cpp:71-95: with few inputs, all of them; otherwise
  // those of the closest enclosing path table entry.
  private _getInputEntriesByPath(primPath: string): readonly _InputEntry[] {
    if (this._inputs.length < 5) return this._inputs
    // The answer for a path is kept until the table is rebuilt
    // (_rebuildInputsPathTable clears _entriesByPath).
    const memo = this._entriesByPath.get(primPath)
    if (memo) return memo
    let found: readonly _InputEntry[] = _noInputEntries
    for (let p = primPath; p !== ''; p = HdSiParentPath(p)) {
      const entries = this._inputsPathTable.get(p)
      if (entries) { found = entries; break }
    }
    if (this._entriesByPath.size > 200000) this._entriesByPath.clear()
    this._entriesByPath.set(primPath, found)
    return found
  }
  private readonly _entriesByPath = new Map<string, readonly _InputEntry[]>()

  private _hasPrim(path: string): boolean {
    if (this._inputsPathTable.has(path)) return true
    return _primIsDefined(this.getPrim(path))
  }

  // Rebuild _inputsPathTable from the current contents of _inputs
  // (mergingSceneIndex.cpp:109-127): an entry for each sceneRoot and its
  // ancestors, each entry holding the inputs whose sceneRoot is in the
  // entry's ancestry (FindSubtreeRange(sceneRoot) gives an input to every
  // entry at or below its root), in input order.
  private _rebuildInputsPathTable(): void {
    this._entriesByPath.clear()
    this._inputsPathTable.clear()
    this._inputsPathTableChildren.clear()
    const byRoot = new Map<string, number[]>()
    this._inputs.forEach((entry, index) => {
      const at = byRoot.get(entry.sceneRoot)
      if (at) at.push(index)
      else byRoot.set(entry.sceneRoot, [index])
      for (let path = entry.sceneRoot; path !== '' && !this._inputsPathTable.has(path); path = HdSiParentPath(path)) {
        this._inputsPathTable.set(path, [])
        const parent = HdSiParentPath(path)
        if (parent !== '') {
          const children = this._inputsPathTableChildren.get(parent)
          if (children) children.push(path)
          else this._inputsPathTableChildren.set(parent, [path])
        }
      }
    })
    for (const [path, entries] of this._inputsPathTable) {
      const indices: number[] = []
      for (let p = path; p !== ''; p = HdSiParentPath(p)) {
        const at = byRoot.get(p)
        if (at) indices.push(...at)
      }
      indices.sort((a, b) => a - b)
      for (const index of indices) entries.push(this._inputs[index]!)
    }
  }

  // Add strict prefixes of activeInputSceneRoot's. If adding a scene index at,
  // e.g., /A/B/C, make AddedPrimEntries for /A and /A/B.
  private _addStrictPrefixesOfSceneRoots(
    inputScenes: HdMergingInputScene[],
    addedEntries: AddedPrimEntry[],
  ): void {
    const visited = new Set<string>()

    for (const inputScene of inputScenes) {
      if (!inputScene.scene) continue
      const sceneRoot = inputScene.activeInputSceneRoot ?? '/'
      if (!HdSiIsAbsoluteRootOrPrimPath(sceneRoot)) continue

      const components = HdSiComponents(sceneRoot)
      const n = components.length
      if (n <= 1) continue // nothing to do for, e.g., /A

      let hasPrim = true
      // Walk the strict prefixes (skip the sceneRoot itself and the root path).
      let prefix = '/'
      for (let i = 0; i < n - 1; i++) {
        prefix = HdSiChildPath(prefix, components[i]!)
        hasPrim = hasPrim && this._hasPrim(prefix)
        if (hasPrim) continue
        if (visited.has(prefix)) continue
        visited.add(prefix)
        addedEntries.push({ primPath: prefix, primType: '' })
      }
    }
  }

  // Depth-first fill of added child entries (synchronous; upstream parallelizes
  // this with a WorkDispatcher, but the result ordering is the same set).
  private _fillAddedChildEntriesRecursively(
    inputSceneIndex: HdSceneIndexBase,
    parentPath: string,
    out: AddedPrimEntry[],
  ): void {
    for (const childPath of inputSceneIndex.getChildPrimPaths(parentPath)) {
      // Old scene indices might have a prim of a different type at the given
      // path, so we query the merging scene index itself here.
      const resolvedPrimType = this.getPrim(childPath).primType
      out.push({ primPath: childPath, primType: resolvedPrimType })
      this._fillAddedChildEntriesRecursively(inputSceneIndex, childPath, out)
    }
  }

  insertInputScenes(inputScenes: HdMergingInputScene[]): void {
    if (inputScenes.length === 0) return

    const addedEntries: AddedPrimEntry[] = []
    if (this._isObserved()) {
      this._addStrictPrefixesOfSceneRoots(inputScenes, addedEntries)
    }

    for (const inputScene of inputScenes) {
      if (!inputScene.scene) continue
      const sceneRoot = inputScene.activeInputSceneRoot ?? '/'
      if (!HdSiIsAbsoluteRootOrPrimPath(sceneRoot)) {
        // TF_CODING_ERROR: non-prim path as activeInputSceneRoot.
        continue
      }
      const pos = Math.min(
        inputScene.pos ?? this._inputs.length,
        this._inputs.length,
      )
      this._inputs.splice(pos, 0, {
        sceneIndex: inputScene.scene,
        sceneRoot,
      })
      inputScene.scene.addObserver(this._observer)
    }

    this._rebuildInputsPathTable()

    if (!this._isObserved()) return

    // Add entries for each input scene.
    for (const inputScene of inputScenes) {
      if (!inputScene.scene) continue
      const sceneRoot = inputScene.activeInputSceneRoot ?? '/'
      if (!HdSiIsAbsoluteRootOrPrimPath(sceneRoot)) continue

      addedEntries.push({
        primPath: sceneRoot,
        primType: this.getPrim(sceneRoot).primType,
      })
      this._fillAddedChildEntriesRecursively(
        inputScene.scene,
        sceneRoot,
        addedEntries,
      )
    }

    this._sendPrimsAdded(addedEntries)
  }

  removeInputScenes(sceneIndices: HdSceneIndexBase[]): void {
    if (sceneIndices.length === 0) return

    // Remove our observer from the scene indices being removed.
    for (const sceneIndex of sceneIndices) {
      sceneIndex.removeObserver(this._observer)
    }

    // Remove the scene indices from our list of inputs, and record their scene
    // roots for generating the added/removed notifications below. We keep the
    // removed inputs in their original relative order (stable partition).
    const sceneIndicesSet = new Set(sceneIndices)
    const removedInputs: _InputEntry[] = []
    const keptInputs: _InputEntry[] = []
    for (const entry of this._inputs) {
      if (sceneIndicesSet.has(entry.sceneIndex)) {
        removedInputs.push(entry)
      } else {
        keptInputs.push(entry)
      }
    }
    this._inputs = keptInputs

    this._rebuildInputsPathTable()

    if (!this._isObserved()) return

    // Prims unique to these inputs get removed.
    const removedEntries: RemovedPrimEntry[] = []
    // Prims which these inputs contributed to are resynced via PrimsAdded.
    const addedEntries: AddedPrimEntry[] = []

    const visitedPaths = new Set<string>()

    for (const removedInput of removedInputs) {
      // Signal removal for anything not present once this scene is removed.
      const removalTestQueue: string[] = [removedInput.sceneRoot]

      while (removalTestQueue.length > 0) {
        const path = removalTestQueue.pop()!

        const prim = this.getPrim(path)
        if (_primIsDefined(prim)) {
          if (!visitedPaths.has(path)) {
            visitedPaths.add(path)
            addedEntries.push({ primPath: path, primType: prim.primType })
          }
          for (const childPath of removedInput.sceneIndex.getChildPrimPaths(path)) {
            removalTestQueue.push(childPath)
          }
        } else {
          if (!visitedPaths.has(path)) {
            visitedPaths.add(path)
            removedEntries.push({ primPath: path })
          }
        }
      }
    }

    if (removedEntries.length > 0) {
      this._sendPrimsRemoved(removedEntries)
    }
    if (addedEntries.length > 0) {
      this._sendPrimsAdded(addedEntries)
    }
  }

  removeInputScene(sceneIndex: HdSceneIndexBase): void {
    this.removeInputScenes([sceneIndex])
  }

  getInputScenes(): HdSceneIndexBase[] {
    return this._inputs.map((entry) => entry.sceneIndex)
  }

  // HdSceneIndexBase stores weak observer pointers upstream. Explicitly
  // revoke the strong JavaScript registrations when this owner is released.
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    for (const { sceneIndex } of this._inputs) {
      sceneIndex.removeObserver(this._observer)
    }
    this._inputs = []
    this._rebuildInputsPathTable()
  }

  getPrim(primPath: string): HdSceneIndexPrim {
    const result: HdSceneIndexPrim = { primType: '', dataSource: undefined }

    if (this._inputs.length === 0) return result
    if (this._inputs.length === 1) {
      return this._inputs[0]!.sceneIndex.getPrim(primPath)
    }

    const contributingDataSources: HdContainerDataSource[] = []
    for (const entry of this._getInputEntriesByPath(primPath)) {
      if (!HdSiHasPrefix(primPath, entry.sceneRoot)) continue

      const prim = entry.sceneIndex.getPrim(primPath)

      // Use first non-empty prim type so that sparsely overlaid inputs can
      // contribute data sources without defining type, or type without
      // providing a data source.
      if (result.primType === '' && prim.primType !== '') {
        result.primType = prim.primType
      }

      if (prim.dataSource) {
        contributingDataSources.push(prim.dataSource)
      }
    }

    switch (contributingDataSources.length) {
      case 0:
        // If path is an ancestor of any scene root (including the scene root
        // itself), ensure the prim exists.
        if (this._inputsPathTable.has(primPath)) {
          result.dataSource = _emptyContainer
        }
        break
      case 1:
        result.dataSource = contributingDataSources[0]
        break
      default:
        result.dataSource = HdOverlayContainerDataSource.new(
          ...contributingDataSources,
        )
    }

    return result
  }

  getChildPrimPaths(primPath: string): string[] {
    const childPaths = new Set<string>()

    for (const entry of this._getInputEntriesByPath(primPath)) {
      if (!HdSiHasPrefix(primPath, entry.sceneRoot)) continue
      for (const path of entry.sceneIndex.getChildPrimPaths(primPath)) {
        childPaths.add(path)
      }
    }

    // Insert any intermediate children implied by the existence of nested
    // inputs at deeper sceneRoot paths.
    for (const p of this._inputsPathTableChildren.get(primPath) ?? []) {
      childPaths.add(p)
    }

    return [...childPaths]
  }

  // ---- observer-of-inputs hooks ----

  private _primsAdded(
    sender: HdSceneIndexBase,
    entries: AddedPrimEntry[],
  ): void {
    if (!this._isObserved()) return

    // If there's only one input, no additional interpretation is required.
    if (this._inputs.length < 2) {
      this._sendPrimsAdded(entries)
      return
    }

    // Confirm that the type here is not masked by a stronger contributing
    // input. We still send it along as an add because a weaker input providing
    // potential data sources (at any container depth) does not directly
    // indicate which data sources might be relevant. This ensures the primType
    // is equivalent to what would be returned from GetPrim.
    const filteredEntries: AddedPrimEntry[] = []
    let diverged = false

    for (let e = 0; e < entries.length; e++) {
      const entry = entries[e]!
      let resolvedPrimType = ''

      for (const inputEntry of this._getInputEntriesByPath(entry.primPath)) {
        if (!HdSiHasPrefix(entry.primPath, inputEntry.sceneRoot)) continue

        // Avoid calling GetPrim to get the prim type when the input is the
        // sender (we already have its type in the entry).
        const primType =
          inputEntry.sceneIndex === sender
            ? entry.primType
            : inputEntry.sceneIndex.getPrim(entry.primPath).primType

        // Stop after the first contributing (non-empty) type.
        if (primType !== '') {
          resolvedPrimType = primType
          break
        }
      }

      if (resolvedPrimType !== entry.primType) {
        if (!diverged) {
          diverged = true
          // copy up to this entry
          for (let j = 0; j < e; j++) filteredEntries.push(entries[j]!)
        }
        filteredEntries.push({ primPath: entry.primPath, primType: resolvedPrimType })
      } else if (diverged) {
        filteredEntries.push(entry)
      }
    }

    if (diverged) {
      this._sendPrimsAdded(filteredEntries)
    } else {
      this._sendPrimsAdded(entries)
    }
  }

  private _primsRemoved(
    _sender: HdSceneIndexBase,
    entries: RemovedPrimEntry[],
  ): void {
    if (!this._isObserved()) return

    if (this._inputs.length < 2) {
      this._sendPrimsRemoved(entries)
      return
    }

    // Note: if a prim is removed from an input scene, but exists in another
    // input scene, we trigger that as a resync (signaled by PrimsAdded).
    const addedEntries: AddedPrimEntry[] = []

    for (const entry of entries) {
      const prim = this.getPrim(entry.primPath)
      if (!_primIsDefined(prim)) continue

      addedEntries.push({ primPath: entry.primPath, primType: prim.primType })

      const childPaths = this.getChildPrimPaths(entry.primPath)
      if (childPaths.length === 0) continue

      for (const childPath of childPaths) {
        for (const descendantPath of new HdSceneIndexPrimView(this, childPath)) {
          addedEntries.push({
            primPath: descendantPath,
            primType: this.getPrim(descendantPath).primType,
          })
        }
      }
    }

    this._sendPrimsRemoved(entries)
    this._sendPrimsAdded(addedEntries)
  }

  private _primsDirtied(
    _sender: HdSceneIndexBase,
    entries: DirtiedPrimEntry[],
  ): void {
    if (!this._isObserved()) return
    this._sendPrimsDirtied(entries)
  }

  private _primsRenamed(
    sender: HdSceneIndexBase,
    entries: RenamedPrimEntry[],
  ): void {
    // Initial implementation converts to adds and removes.
    const removed: RemovedPrimEntry[] = []
    const added: AddedPrimEntry[] = []
    for (const entry of entries) {
      removed.push({ primPath: entry.oldPrimPath })
      added.push({ primPath: entry.newPrimPath, primType: '' })
    }
    this._primsRemoved(sender, removed)
    this._primsAdded(sender, added)
  }
}
