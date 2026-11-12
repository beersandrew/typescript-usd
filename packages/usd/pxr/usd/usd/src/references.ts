// Ported from OpenUSD 26.11.1: pxr/usd/usd/references.cpp,
//  pxr/usd/usd/references.h, pxr/usd/usd/payloads.cpp, pxr/usd/usd/payloads.h
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usd/references.{h,cpp} + payloads.{h,cpp} — UsdReferences,
// the reference/payload list-op authoring handle (both arcs share the
// list-op shape, selected by the `_field` discriminator).

import type { Stage } from './stage.ts'
import { ListPositionBackOfPrependList, type UsdListPosition } from './common.ts'

const ZERO_OFFSET = { offset: 0, scale: 1 } as const

// Authoring handle for a prim's reference or payload list op — the
// UsdReferences / UsdPayloads analog (both arcs share the list-op shape).
// Items append to the prepended list, upstream's default list position.
export class UsdReferences {
  constructor(
    private readonly _stage: Stage,
    private readonly _primPath: string,
    private readonly _field: 'references' | 'payload',
  ) {}

  // UsdReferences::AddReference (references.cpp) through
  // Usd_ListEditImpl::Add: adds a reference at the current edit target, in
  // the position specified. primPath targets a prim inside the asset,
  // defaulting to its defaultPrim. Waits for change processing.
  async addReference(
    assetPath: string, primPath = '', position: UsdListPosition = ListPositionBackOfPrependList,
  ): Promise<void> {
    this._stage._addReferenceListItem(this._primPath, this._field,
      { assetPath, primPath, layerOffset: { ...ZERO_OFFSET } }, position)
    await this._stage.flushChanges()
  }

  // UsdReferences::RemoveReference (references.cpp:64-68) through
  // Usd_ListEditImpl::Remove: removes the reference from the list edits at
  // the current edit target (and deletes it, unless the list is explicit).
  // Waits for change processing.
  async removeReference(assetPath: string, primPath = ''): Promise<void> {
    this._stage._removeReferenceListItem(this._primPath, this._field,
      { assetPath, primPath, layerOffset: { ...ZERO_OFFSET } })
    await this._stage.flushChanges()
  }

  // UsdReferences::SetReferences through Usd_ListEditImpl::Set.
  async setReferences(
    items: readonly {
      assetPath: string
      primPath?: string
      layerOffset?: { offset: number; scale: number }
    }[],
  ): Promise<void> {
    this._stage._setReferenceListItems(this._primPath, this._field, items.map(item => ({
      assetPath: item.assetPath,
      primPath: item.primPath ?? '',
      layerOffset: item.layerOffset ? { ...item.layerOffset } : { ...ZERO_OFFSET },
    })))
    await this._stage.flushChanges()
  }

  // UsdReferences::ClearReferences through Usd_ListEditImpl::Clear.
  async clear(): Promise<void> {
    this._stage._clearListEdits(this._primPath, this._field)
    await this._stage.flushChanges()
  }
}
