// Ported from OpenUSD 26.11.1: pxr/exec/execUsd/cacheView.cpp,
//  pxr/exec/execUsd/cacheView.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/cacheView.h and cacheView.cpp.

import type { Value as VtValue } from 'typescript-usd/vt'
import { Exec_CacheView } from 'typescript-usd/exec'

/**
 * Provides a view of values computed by ExecUsdSystem::Compute
 * (cacheView.h:22-50).
 *
 * Cache views must not outlive the ExecUsdSystem or ExecUsdRequest from
 * which they were built.
 */
export class ExecUsdCacheView {
  private readonly _view: Exec_CacheView

  /** Construct an invalid view (cacheView.h:30-31). */
  constructor()
  /**
   * @internal Constructed by ExecUsd_RequestImpl only (cacheView.h:42-46),
   * taking ownership of `view`.
   */
  constructor(view: Exec_CacheView)
  constructor(view?: Exec_CacheView) {
    this._view = view ?? new Exec_CacheView()
  }

  /**
   * Returns the computed value for the provided extraction `index`
   * (cacheView.cpp:15-23).
   *
   * Emits an error and returns an empty value if the `index` is not
   * evaluated.
   */
  Get(index: number): VtValue {
    // In the future, to support executor bypass for attribute values that do
    // not require computation, index may need to be remapped into the range of
    // _view.  Currently, the index range mapping is always one-to-one.

    return this._view.Get(index)
  }
}
