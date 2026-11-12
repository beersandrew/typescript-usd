// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/stageCache.cpp,
//  pxr/usd/usdUtils/stageCache.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/stageCache.{h,cpp} (OpenUSD 26.11.1).
//
// UsdUtilsStageCache: a process-wide UsdStageCache singleton for all USD
// clients, and a cache of session layers holding variant selections.

import { Layer, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { StageCache as UsdStageCache } from 'typescript-usd/usd'

// _SessionLayerMap / GetSessionLayerMap (stageCache.cpp:21-34): cache of
// string keys (currently representing variant selections) to session layers.
// Upstream heap-allocates and leaks it to avoid static destruction order
// problems; a module-level map lives as long as the module.
const sessionLayerMap = new Map<string, Layer>()

// UsdUtilsStageCache::Get's static (stageCache.cpp:36-43).
let theCache: UsdStageCache | undefined

// std::sort of std::pair<std::string, std::string> (stageCache.cpp:59-62):
// lexicographic by variant set, then selection.
const comparePairs = (a: readonly [string, string], b: readonly [string, string]): number =>
  a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0

/** UsdUtilsStageCache (stageCache.h:28-63). */
export class UsdUtilsStageCache {
  /** UsdUtilsStageCache::Get (stageCache.cpp:36-43): the singleton stage cache. */
  static Get(): UsdStageCache {
    return (theCache ??= new UsdStageCache())
  }

  /**
   * UsdUtilsStageCache::GetSessionLayerForVariantSelections
   * (stageCache.cpp:45-100): a session layer with overs carrying the given
   * variant selections, cached by prim path and (sorted) selections.
   *
   * A string names a root model (the TfToken modelName overload,
   * stageCache.cpp:45-52, whose prim is /modelName); an SdfPath is the prim
   * path overload.
   */
  static GetSessionLayerForVariantSelections(
    modelNameOrPrimPath: string | SdfPath,
    variantSelections: ReadonlyArray<readonly [string, string]>,
  ): Layer {
    // stageCache.cpp:45-52
    const primPath = typeof modelNameOrPrimPath === 'string'
      ? SdfPath.absoluteRootPath.appendChild(modelNameOrPrimPath)
      : modelNameOrPrimPath

    // Sort so that the key is deterministic.
    const variantSelectionsSorted = [...variantSelections].sort(comparePairs)

    let sessionKey = primPath.pathString
    for (const [varSet, varSel] of variantSelectionsSorted) {
      sessionKey += ':' + varSet + '=' + varSel
    }

    // stageCache.cpp:71-96. JavaScript runs this on one thread, so the
    // mutex upstream takes around the map has no counterpart.
    const existing = sessionLayerMap.get(sessionKey)
    if (existing) return existing

    const layer = Layer.createAnonymous()
    if (variantSelections.length > 0) {
      const over = sdfCreatePrimInLayer(layer, primPath)
      for (const [varSet, varSel] of variantSelections) {
        // Construct the variant opinion for the session layer.
        over?.getVariantSelections().set(varSet, varSel)
      }
    }
    sessionLayerMap.set(sessionKey, layer)
    return layer
  }
}
