// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdExecImaging/valueKeyMap.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/valueKeyMap.h (OpenUSD 26.11.1).
//
// pxr_tsl::robin_map<UsdExecImagingValueKey, int, TfHash> is a JS Map keyed by
// UsdExecImaging_ValueKeyMapKey; the SdfPath-keyed map is keyed by the path
// string.

import type { UsdExecImagingPrimAdapterInterface } from './primAdapterInterface.ts'
import type { UsdExecImagingValueKey } from './valueKey.ts'

/** Information stored for each value key (valueKeyMap.h:29-40). */
export interface UsdExecImaging_ValueKeyInfo {
  /** The original value key. */
  readonly valueKey: UsdExecImagingValueKey
  /** Path to the prim whose adapter added this value key. */
  readonly adaptedPrimPath: string
  /** The adapter that added the value key. */
  readonly primAdapter: UsdExecImagingPrimAdapterInterface
}

/**
 * UsdExecImaging_ValueKeyMap stores additional information about the value
 * keys in a UsdExecImaging_Request (valueKeyMap.h:20-57).
 *
 * This information is used to extract values from the request, to notify prim
 * adapters of invalidation, and to discover prims whose adapters have changed.
 */
export class UsdExecImaging_ValueKeyMap {
  /** The ValueKeyInfo at index i provides information about the value key
   *  at request index i. */
  indexToValueKeyInfo: UsdExecImaging_ValueKeyInfo[] = []

  /** Maps value keys (UsdExecImaging_ValueKeyMapKey) to their corresponding
   *  positions in the request. */
  valueKeyToIndexMap = new Map<string, number>()

  /** Maps each adapted prim to its adapter. */
  primToAdapterMap = new Map<string, UsdExecImagingPrimAdapterInterface>()
}
