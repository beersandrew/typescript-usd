// Ported from OpenUSD 26.11.1: pxr/imaging/hd/containerDataSourceEditor.cpp,
//  pxr/imaging/hd/containerDataSourceEditor.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/containerDataSourceEditor.{h,cpp}
// Utility for lazily constructing and composing data source hierarchies.

import { HdContainerDataSource, HdDataSourceBase } from './dataSource.ts'
import {
  HdDataSourceLocator,
  HdDataSourceLocatorSet,
} from './dataSourceLocator.ts'
import {
  HdOverlayContainerDataSource,
  HdBlockDataSource,
} from './overlayContainerDataSource.ts'

// Mirrors HdDataSourceLocatorSentinelTokens->container.
const SENTINEL_CONTAINER = '__containerDataSource'

interface _Entry {
  dataSource?: HdDataSourceBase | undefined
  childNode?: _Node | undefined
}

class _Node {
  entries = new Map<string, _Entry>()
}

// Container view over an editor node tree.
class _NodeContainerDataSource extends HdContainerDataSource {
  private _node: _Node | undefined

  constructor(node?: _Node) {
    super()
    this._node = node
  }

  static new(node?: _Node): _NodeContainerDataSource {
    return new _NodeContainerDataSource(node)
  }

  getNames(): string[] {
    const result: string[] = []
    if (this._node) {
      for (const [name, entry] of this._node.entries) {
        if (entry.dataSource || entry.childNode) {
          result.push(name)
        }
      }
    }
    return result
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (this._node) {
      const entry = this._node.entries.get(name)
      if (entry === undefined) {
        return undefined
      }

      if (entry.dataSource instanceof HdContainerDataSource) {
        const container = entry.dataSource
        if (!entry.childNode) {
          return container
        } else {
          return HdOverlayContainerDataSource.new(
            _NodeContainerDataSource.new(entry.childNode),
            container,
          )
        }
      } else if (entry.dataSource) {
        return entry.dataSource
      }

      if (entry.childNode) {
        return _NodeContainerDataSource.new(entry.childNode)
      }
    }

    return undefined
  }
}

export class HdContainerDataSourceEditor {
  private _root: _Node | undefined
  private _initialContainer: HdContainerDataSource | undefined
  private _directContainerSets: HdDataSourceLocator[] = []

  constructor(initialContainer?: HdContainerDataSource) {
    this._initialContainer = initialContainer
  }

  private _getNode(locator: HdDataSourceLocator): _Node {
    if (!this._root) {
      this._root = new _Node()
    }
    let currentNode = this._root

    for (let i = 0, e = locator.getElementCount(); i < e; ++i) {
      const name = locator.getElement(i)

      const entries = currentNode.entries
      const it = entries.get(name)

      if (it === undefined) {
        const newNode = new _Node()
        entries.set(name, { childNode: newNode })
        currentNode = newNode
      } else {
        if (!it.childNode) {
          it.childNode = new _Node()
        }
        currentNode = it.childNode
      }
    }

    return currentNode
  }

  // Replaces data source at given locator and descending locations (if given a
  // container data source) by given data source.
  Set(
    locator: HdDataSourceLocator,
    dataSource: HdDataSourceBase | undefined,
  ): this {
    if (locator.getElementCount() === 0) {
      return this
    }

    const parentNode = this._getNode(locator.removeLastElement())

    const lastName = locator.getLastElement()
    let entry = parentNode.entries.get(lastName)
    if (entry === undefined) {
      entry = {}
      parentNode.entries.set(lastName, entry)
    }

    if (!dataSource) {
      entry.dataSource = HdBlockDataSource.new()
    } else {
      entry.dataSource = dataSource
    }

    // If we are deleting or setting a container directly, we must block the
    // child values from the _initialContainer. Record the locators here.
    if (
      this._initialContainer &&
      (!dataSource || dataSource instanceof HdContainerDataSource)
    ) {
      this._directContainerSets.push(locator)
    }

    // setting something directly clears previous children
    entry.childNode = undefined

    return this
  }

  // Overlays data source at given location by given data source so that data
  // sources in the initial container at descending locations can still come
  // through.
  overlay(
    locator: HdDataSourceLocator,
    dataSource: HdContainerDataSource | undefined,
  ): this {
    if (locator.getElementCount() === 0) {
      return this
    }

    if (!dataSource) {
      return this
    }

    const parentNode = this._getNode(locator.removeLastElement())

    const lastName = locator.getLastElement()
    let entry = parentNode.entries.get(lastName)
    if (entry === undefined) {
      entry = {}
      parentNode.entries.set(lastName, entry)
    }

    entry.dataSource = dataSource

    return this
  }

  // Returns final container data source with all edits applied.
  finish(): HdContainerDataSource | undefined {
    if (this._initialContainer) {
      if (this._directContainerSets.length === 0) {
        return HdOverlayContainerDataSource.new(
          _NodeContainerDataSource.new(this._root),
          this._initialContainer,
        )
      } else {
        const block = HdBlockDataSource.new()

        // Construct a container tree whose leaves are block data sources to go
        // in between the newly constructed tree and the _initialContainer.
        // This prevents children from replaced containers from the
        // _initialContainer from shining through. Sort so that longer locators
        // are set first in case a shallower block exists.
        const sorted = [...this._directContainerSets].sort(
          (a, b) => a.getElementCount() - b.getElementCount(),
        )

        const blocksEditor = new HdContainerDataSourceEditor()
        for (const loc of sorted) {
          blocksEditor.Set(loc, block)
        }

        return HdOverlayContainerDataSource.new(
          _NodeContainerDataSource.new(this._root),
          blocksEditor._finishWithNoInitialContainer(),
          this._initialContainer,
        )
      }
    } else if (!this._root) {
      // If no initial container and no edits, return nullptr.
      return undefined
    } else {
      return this._finishWithNoInitialContainer()
    }
  }

  // Computes the set of locators that need to be invalidated given the set of
  // locators for which data sources are being set or overlaid.
  static computeDirtyLocators(
    locatorSet: HdDataSourceLocatorSet,
  ): HdDataSourceLocatorSet {
    // The universal set already invalidates everything.
    for (const loc of locatorSet) {
      if (loc.getElementCount() === 0) {
        return locatorSet
      }
    }

    const result = new HdDataSourceLocatorSet()

    // Invalidate the chain of container handles leading to the data source
    // that is being set/overlaid.
    for (const loc of locatorSet) {
      // For locator "a/b/c", we want to insert the following locators:
      //  "__containerDataSource"
      //  "a/__containerDataSource"
      //  "a/b/__containerDataSource"
      //  "a/b/c"
      let curLoc = HdDataSourceLocator.EmptyLocator
      for (let i = 0, e = loc.getElementCount(); i < e; ++i) {
        result.add(curLoc.append(SENTINEL_CONTAINER))
        curLoc = curLoc.append(loc.getElement(i))
      }
      // Finally, insert the locator for the data source that needs refetching.
      result.add(loc)
    }

    return result
  }

  private _finishWithNoInitialContainer(): HdContainerDataSource {
    return _NodeContainerDataSource.new(this._root)
  }
}
