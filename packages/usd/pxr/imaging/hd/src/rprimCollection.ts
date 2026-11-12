// Ported from OpenUSD 26.11.1: pxr/imaging/hd/rprimCollection.cpp,
//  pxr/imaging/hd/rprimCollection.h, pxr/imaging/hd/repr.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/repr.h (HdReprSelector) and
// pxr/imaging/hd/rprimCollection.h (HdRprimCollection).
//
// A collection is an addressing mechanism that names a group of HdRprims the
// render index can return. It does not hold rprims itself. The draw-items cache
// keys on (collection, renderTags, renderIndex), so faithful equality + a stable
// identity string for the collection is what matters here.

// HdReprSelector lives in displayStyle.ts (mirrors hd/repr.h); re-exported here
// for the rprimCollection call sites that construct/compare it.
import { HdReprSelector } from './displayStyle.ts'
export { HdReprSelector }

export class HdRprimCollection {
  private _name: string
  private _reprSelector: HdReprSelector
  private _forcedRepr: boolean
  private _materialTag: string
  private _rootPaths: string[]
  private _excludePaths: string[]

  constructor(
    name = '',
    reprSelector: HdReprSelector = new HdReprSelector(),
    forcedRepr = false,
    materialTag = '',
  ) {
    this._name = name
    this._reprSelector = reprSelector
    this._forcedRepr = forcedRepr
    this._materialTag = materialTag
    // Defaults to a vector containing only the absolute root path.
    this._rootPaths = ['/']
    this._excludePaths = []
  }

  getName(): string { return this._name }
  setName(name: string): void { this._name = name }

  getReprSelector(): HdReprSelector { return this._reprSelector }
  setReprSelector(reprSelector: HdReprSelector): void { this._reprSelector = reprSelector }

  isForcedRepr(): boolean { return this._forcedRepr }
  setForcedRepr(flag: boolean): void { this._forcedRepr = flag }

  getRootPaths(): readonly string[] { return this._rootPaths }
  setRootPaths(rootPaths: string[]): void { this._rootPaths = [...rootPaths].sort() }
  setRootPath(rootPath: string): void { this._rootPaths = [rootPath] }

  getExcludePaths(): readonly string[] { return this._excludePaths }
  setExcludePaths(excludePaths: string[]): void { this._excludePaths = [...excludePaths].sort() }

  getMaterialTag(): string { return this._materialTag }
  setMaterialTag(tag: string): void { this._materialTag = tag }

  // A copy with the same logical contents (mirrors the copy ctor; collections
  // are passed by value in the C++ render-pass code).
  Clone(): HdRprimCollection {
    const c = new HdRprimCollection(
      this._name, this._reprSelector, this._forcedRepr, this._materialTag)
    c._rootPaths = [...this._rootPaths]
    c._excludePaths = [...this._excludePaths]
    return c
  }

  /** rprimCollection.cpp:71-79. A copy with the root and exclude paths
   *  swapped. */
  createInverseCollection(): HdRprimCollection {
    // Use the copy constructor and then swap the root and exclude paths
    const invCol = this.Clone()
    const root = invCol._rootPaths
    invCol._rootPaths = invCol._excludePaths
    invCol._excludePaths = root
    return invCol
  }

  Equals(other: HdRprimCollection): boolean {
    return this._name === other._name &&
           this._reprSelector.Equals(other._reprSelector) &&
           this._forcedRepr === other._forcedRepr &&
           this._materialTag === other._materialTag &&
           this._rootPaths.length === other._rootPaths.length &&
           this._rootPaths.every((p, i) => p === other._rootPaths[i]) &&
           this._excludePaths.length === other._excludePaths.length &&
           this._excludePaths.every((p, i) => p === other._excludePaths[i])
  }

  // Stable identity string mirroring the fields TfHashAppend combines:
  // name, reprSelector, forcedRepr, rootPaths, excludePaths, materialTag.
  computeKey(): string {
    return [
      this._name,
      this._reprSelector.Key(),
      this._forcedRepr ? '1' : '0',
      this._rootPaths.join(','),
      this._excludePaths.join(','),
      this._materialTag,
    ].join('::')
  }
}
