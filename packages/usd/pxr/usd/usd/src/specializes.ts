// Ported from OpenUSD 26.11.1: pxr/usd/usd/specializes.cpp,
//  pxr/usd/usd/specializes.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usd/specializes.{h,cpp} — UsdSpecializes, the
// specializes list-op authoring handle.

import type { Stage, ListOp } from './stage.ts'
import { ListPositionBackOfPrependList, type UsdListPosition } from './common.ts'

// Authoring handle for a prim's specializes list op (UsdSpecializes). Specialize
// targets are stored as a path ListOp in the 'specializes' field; SetSpecializes
// replaces the list explicitly (matching the `specializes = [ </Base> ]` form).
export class UsdSpecializes {
  constructor(
    private readonly _stage: Stage,
    private readonly _primPath: string,
  ) {}

  // UsdSpecializes::AddSpecialize (specializes.cpp).
  addSpecialize(primPath: string, position: UsdListPosition = ListPositionBackOfPrependList): boolean {
    return this._stage._addPathListItem(this._primPath, 'specializes', primPath, position)
  }

  // UsdSpecializes::RemoveSpecialize (specializes.cpp).
  removeSpecialize(primPath: string): boolean {
    return this._stage._removePathListItem(this._primPath, 'specializes', primPath)
  }

  // Replaces the prim's specializes with exactly `paths`
  // (UsdSpecializes::SetSpecializes).
  async setSpecializes(paths: string[]): Promise<void> {
    const layer = this._stage.getEditTarget().getLayer()!
    await this._stage._ownAuthoringAsync(async () => {
      layer.setField(this._primPath, 'specializes', {
        isExplicit: true, explicitItems: [...paths],
        prependedItems: [], appendedItems: [], deletedItems: [],
      })
      await this._stage._recomposeForEdit()
    })
  }

  // Clears all authored specializes (UsdSpecializes::ClearSpecializes).
  async clearSpecializes(): Promise<void> {
    const layer = this._stage.getEditTarget().getLayer()!
    await this._stage._ownAuthoringAsync(async () => {
      layer.setField(this._primPath, 'specializes', {
        isExplicit: true, explicitItems: [],
        prependedItems: [], appendedItems: [], deletedItems: [],
      })
      await this._stage._recomposeForEdit()
    })
  }

  // The authored specialize target paths on the edit target (the explicit or
  // prepended items) — UsdSpecializes has no direct getter upstream, but
  // GetBaseMaterialPath's fallback for un-composed stages reads them.
  getSpecializes(): string[] {
    const raw = this._stage.getEditTarget().getLayer()!.getField(this._primPath, 'specializes') as
      ListOp<string> | undefined
    if (!raw) return []
    if (raw.isExplicit) return [...raw.explicitItems]
    return [...raw.prependedItems, ...raw.appendedItems]
  }
}
