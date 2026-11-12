// Ported from OpenUSD 26.11.1: pxr/usd/usd/editContext.cpp,
//  pxr/usd/usd/editContext.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdEditContext from OpenUSD v26.08 pxr/usd/usd/editContext.{h,cpp}: sets a
// stage's edit target and restores the previous one when closed (the C++
// destructor).

import type { Layer } from 'typescript-usd/sdf'
import type { UsdEditTarget } from './editTarget.ts'
import type { Stage } from './stage.ts'

export class UsdEditContext {
  private readonly _originalEditTarget: UsdEditTarget | undefined
  private _closed = false

  constructor(private readonly _stage: Stage, editTarget?: Layer | UsdEditTarget) {
    if (editTarget === undefined) return
    this._originalEditTarget = _stage.getEditTarget()
    _stage.setEditTarget(editTarget)
  }

  /** Restores the stage's original edit target. */
  close(): void {
    if (this._closed) return
    this._closed = true
    if (this._originalEditTarget) this._stage.setEditTarget(this._originalEditTarget)
  }
}
