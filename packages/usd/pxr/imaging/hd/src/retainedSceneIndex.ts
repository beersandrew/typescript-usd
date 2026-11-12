// Ported from OpenUSD 26.11.1: pxr/imaging/hd/retainedSceneIndex.cpp,
//  pxr/imaging/hd/retainedSceneIndex.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/retainedSceneIndex.{h,cpp}
// HdRetainedSceneIndex — a concrete scene container which can be externally
// populated and dirtied.

import {
  HdContainerDataSource,
  HdRetainedContainerDataSource,
} from './dataSource.ts'
import type { HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import {
  HdSceneIndexBase,
  type AddedPrimEntry,
  type DirtiedPrimEntry,
  type HdSceneIndexPrim,
  type RemovedPrimEntry,
} from './sceneIndex.ts'

// ---- Path helpers (string SdfPath, matching neighboring hd/src style) ----
// These mirror the SdfPath operations used by the C++ scene-index family.

export function HdSiComponents(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0)
}

export function HdSiParentPath(path: string): string {
  if (path === '/' || path === '') return ''
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.substring(0, i)
}

export function HdSiName(path: string): string {
  const i = path.lastIndexOf('/')
  return path.substring(i + 1)
}

export function HdSiChildPath(parent: string, name: string): string {
  return parent === '/' ? '/' + name : parent + '/' + name
}

// Is 'path' equal to, or a descendant of, 'prefix'?
export function HdSiHasPrefix(path: string, prefix: string): boolean {
  if (prefix === '/') return true
  return path === prefix || path.startsWith(prefix + '/')
}

export function HdSiIsAbsoluteRootOrPrimPath(path: string): boolean {
  if (path === '/') return true
  return path.startsWith('/') && !path.includes('.')
}

// ---- AddedPrimEntry for the retained index (carries a data source) ----

export interface HdRetainedAddedPrimEntry {
  primPath: string
  primType: string
  dataSource: HdContainerDataSource | undefined
}

export interface HdRetainedDirtiedPrimEntry {
  primPath: string
  dirtyLocators: HdDataSourceLocatorSet
}

// ---- Internal path tree (mirrors SdfPathTable) ----
//
// SdfPathTable auto-creates ancestor entries when a descendant is inserted and
// stores siblings in reverse-insertion order (new children are prepended). The
// scene-index notification ordering depends on both behaviors, so we replicate
// them faithfully here.

class _PrimNode {
  primType = ''
  dataSource: HdContainerDataSource | undefined = undefined
  // child name -> node, plus an explicit order list (newest first).
  children = new Map<string, _PrimNode>()
  childOrder: string[] = []
}

const _emptyContainer: HdContainerDataSource = HdRetainedContainerDataSource.new(
  [],
  [],
)

export class HdRetainedSceneIndex extends HdSceneIndexBase {
  private _root = new _PrimNode() // corresponds to "/"
  // Every node of the tree by its path, as SdfPathTable finds an entry by
  // hashing its path rather than walking from the root (pathTable.h).
  private _nodes = new Map<string, _PrimNode>([['/', this._root]])

  static new(): HdRetainedSceneIndex {
    return new HdRetainedSceneIndex()
  }

  private _find(path: string): _PrimNode | undefined {
    return path === '' ? this._root : this._nodes.get(path)
  }

  // Insert (creating ancestors as needed) and return the leaf node.
  private _insert(path: string): _PrimNode {
    let node = this._root
    let nodePath = '/'
    for (const name of HdSiComponents(path)) {
      nodePath = HdSiChildPath(nodePath, name)
      let next = node.children.get(name)
      if (!next) {
        next = new _PrimNode()
        node.children.set(name, next)
        node.childOrder.unshift(name) // prepend, mirroring SdfPathTable
        this._nodes.set(nodePath, next)
      }
      node = next
    }
    return node
  }

  // Erase a path and its entire subtree.
  private _erase(path: string): void {
    if (path === '/' || path === '') {
      this._root = new _PrimNode()
      this._nodes = new Map([['/', this._root]])
      return
    }
    const parent = this._find(HdSiParentPath(path))
    if (!parent) return
    const name = HdSiName(path)
    const node = parent.children.get(name)
    if (node && parent.children.delete(name)) {
      const i = parent.childOrder.indexOf(name)
      if (i >= 0) parent.childOrder.splice(i, 1)
      this._forgetSubtree(HdSiChildPath(HdSiParentPath(path), name), node)
    }
  }

  private _forgetSubtree(path: string, node: _PrimNode): void {
    this._nodes.delete(path)
    for (const [name, child] of node.children) this._forgetSubtree(HdSiChildPath(path, name), child)
  }

  addPrims(entries: HdRetainedAddedPrimEntry[]): void {
    const observerEntries: AddedPrimEntry[] = []

    for (const entry of entries) {
      observerEntries.push({ primPath: entry.primPath, primType: entry.primType })
      const node = this._insert(entry.primPath)
      node.primType = entry.primType
      node.dataSource = entry.dataSource
    }

    this._sendPrimsAdded(observerEntries)
  }

  removePrims(entries: RemovedPrimEntry[]): void {
    for (const entry of entries) {
      this._erase(entry.primPath)
    }

    this._sendPrimsRemoved(entries)
  }

  dirtyPrims(entries: HdRetainedDirtiedPrimEntry[]): void {
    // Filter the DirtyPrims notices to include only paths present in the
    // internal table (matching upstream).
    const observerEntries: DirtiedPrimEntry[] = []
    for (const entry of entries) {
      if (!this._find(entry.primPath)) continue
      observerEntries.push({
        primPath: entry.primPath,
        dirtyLocators: entry.dirtyLocators,
      })
    }

    this._sendPrimsDirtied(observerEntries)
  }

  getPrim(primPath: string): HdSceneIndexPrim {
    const node = this._find(primPath)
    if (!node) {
      return { primType: '', dataSource: undefined }
    }
    if (!node.dataSource) {
      return { primType: node.primType, dataSource: _emptyContainer }
    }
    return { primType: node.primType, dataSource: node.dataSource }
  }

  getChildPrimPaths(primPath: string): string[] {
    const node = this._find(primPath)
    if (!node) return []
    return node.childOrder.map((name) => HdSiChildPath(primPath, name))
  }
}
