// Ported from OpenUSD 26.11.1: pxr/usd/usd/primData.cpp,
//  pxr/usd/usd/primData.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Usd_PrimData — the stage's cached data for one prim: its prim index, type
// info, composed flags and links in the stage's prim tree. Port of OpenUSD
// v26.08 pxr/usd/usd/primData.{h,cpp}.
//
// Values, metadata and properties are not cached here; they are resolved
// from the prim index when queried.

import type { PrimIndex as PcpPrimIndex } from 'typescript-usd/pcp'
import { UsdPrimTypeInfo } from './primTypeInfo.ts'

// Usd_PrimFlags (primFlags.h).
export const enum UsdPrimFlag {
  Active = 1 << 0,
  Loaded = 1 << 1,
  Model = 1 << 2,
  Group = 1 << 3,
  Component = 1 << 4,
  Abstract = 1 << 5,
  Defined = 1 << 6,
  HasClassSpecifier = 1 << 7,
  HasDefiningSpecifier = 1 << 8,
  Instance = 1 << 9,
  HasPayload = 1 << 10,
  Clips = 1 << 11,
  Dead = 1 << 12,
  Prototype = 1 << 13,
  InstanceProxy = 1 << 14,
  PseudoRoot = 1 << 15,
}

// The stage services prim data reads (UsdStage friend access).
export interface UsdPrimDataStage {
  /** @internal */ _getPrimDataAtPath(path: string): UsdPrimData | undefined
  /** @internal */ _getPrimDataAtPathOrInPrototype(path: string): UsdPrimData | undefined
  /** @internal */ _getPrototypeForInstance(prim: UsdPrimData): UsdPrimData | undefined
}

const parentPathOf = (path: string): string => {
  if (path === '/') return ''
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? '/' : path.slice(0, slash)
}

export class UsdPrimData {
  /** @internal */ _stage: UsdPrimDataStage | null
  /** @internal */ _primIndex: PcpPrimIndex | null = null
  /** @internal */ _primTypeInfo: UsdPrimTypeInfo = UsdPrimTypeInfo.getEmptyPrimType()
  /** @internal */ _firstChild: UsdPrimData | null = null
  // The next sibling, or for the last child, its parent (the bit upstream
  // stores in a TfPointerAndBits).
  /** @internal */ _nextSiblingOrParent: UsdPrimData | null = null
  /** @internal */ _nextIsParent = false
  /** @internal */ _flags = 0
  readonly name: string

  constructor(stage: UsdPrimDataStage, readonly path: string) {
    this._stage = stage
    this.name = path === '/' ? '' : path.slice(path.lastIndexOf('/') + 1)
  }

  private _flag(flag: UsdPrimFlag): boolean { return (this._flags & flag) !== 0 }
  /** @internal */
  _setFlag(flag: UsdPrimFlag, value: boolean): void {
    this._flags = value ? this._flags | flag : this._flags & ~flag
  }

  getTypeName(): string { return this._primTypeInfo.getTypeName() }
  getPrimTypeInfo(): UsdPrimTypeInfo { return this._primTypeInfo }

  isPseudoRoot(): boolean { return this._flag(UsdPrimFlag.PseudoRoot) }
  isActive(): boolean { return this._flag(UsdPrimFlag.Active) }
  isLoaded(): boolean { return this._flag(UsdPrimFlag.Loaded) }
  isModel(): boolean { return this._flag(UsdPrimFlag.Model) }
  isGroup(): boolean { return this._flag(UsdPrimFlag.Group) }
  isComponent(): boolean { return this._flag(UsdPrimFlag.Component) }
  isAbstract(): boolean { return this._flag(UsdPrimFlag.Abstract) }
  isDefined(): boolean { return this._flag(UsdPrimFlag.Defined) }
  hasDefiningSpecifier(): boolean { return this._flag(UsdPrimFlag.HasDefiningSpecifier) }
  hasClassSpecifier(): boolean { return this._flag(UsdPrimFlag.HasClassSpecifier) }
  hasPayload(): boolean { return this._flag(UsdPrimFlag.HasPayload) }
  mayHaveOpinionsInClips(): boolean { return this._flag(UsdPrimFlag.Clips) }
  isInstance(): boolean { return this._flag(UsdPrimFlag.Instance) }
  isInPrototype(): boolean { return this._flag(UsdPrimFlag.Prototype) }
  // A root prim path in a prototype is the prototype itself.
  isPrototype(): boolean {
    return this.isInPrototype() && this.path.lastIndexOf('/') === 0 && this.path !== '/'
  }
  /** @internal */ _isDead(): boolean { return this._flag(UsdPrimFlag.Dead) }

  // GetParent (primData.cpp).
  getParent(): UsdPrimData | undefined {
    const parentLink = this.getParentLink()
    if (parentLink) return parentLink
    const parent = parentPathOf(this.path)
    return parent === '' ? undefined : this._stage?._getPrimDataAtPath(parent)
  }

  // GetPrimIndex: prototype prims expose no prim index.
  getPrimIndex(): PcpPrimIndex | null {
    return this.isPrototype() ? null : this._primIndex
  }

  getSourcePrimIndex(): PcpPrimIndex {
    if (!this._primIndex) throw new Error(`Prim <${this.path}> has no prim index`)
    return this._primIndex
  }

  getFirstChild(): UsdPrimData | null { return this._firstChild }
  getNextSibling(): UsdPrimData | null { return this._nextIsParent ? null : this._nextSiblingOrParent }
  getParentLink(): UsdPrimData | null { return this._nextIsParent ? this._nextSiblingOrParent : null }

  // GetNextPrim: the next prim in depth-first order after this prim's subtree.
  getNextPrim(): UsdPrimData | null {
    const sibling = this.getNextSibling()
    if (sibling) return sibling
    for (let p = this.getParentLink(); p; p = p.getParentLink()) {
      const s = p.getNextSibling()
      if (s) return s
    }
    return null
  }

  getPrimDataAtPathOrInPrototype(path: string): UsdPrimData | undefined {
    return this._stage?._getPrimDataAtPathOrInPrototype(path)
  }

  getPrototype(): UsdPrimData | undefined {
    return this._stage?._getPrototypeForInstance(this)
  }

  /** @internal */
  _setSiblingLink(sibling: UsdPrimData): void {
    this._nextSiblingOrParent = sibling
    this._nextIsParent = false
  }

  /** @internal */
  _setParentLink(parent: UsdPrimData): void {
    this._nextSiblingOrParent = parent
    this._nextIsParent = true
  }

  /** @internal */
  _markDead(): void {
    this._setFlag(UsdPrimFlag.Dead, true)
    this._stage = null
    this._primIndex = null
  }

  /** @internal The children, in order. */
  *_children(): IterableIterator<UsdPrimData> {
    for (let c = this._firstChild; c; c = c.getNextSibling()) yield c
  }

  /** @internal Usd_PrimDataSubtreeIterator over the descendants, depth first. */
  *_subtree(): IterableIterator<UsdPrimData> {
    const end = this.getNextPrim()
    let p: UsdPrimData | null = this._firstChild ?? this.getNextPrim()
    while (p && p !== end) {
      yield p
      p = p._firstChild ?? p.getNextPrim()
    }
  }
}
