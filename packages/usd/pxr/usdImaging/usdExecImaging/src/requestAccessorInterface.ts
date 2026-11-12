// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdExecImaging/requestAccessorInterface.cpp,
//  pxr/usdImaging/usdExecImaging/requestAccessorInterface.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/requestAccessorInterface.{h,cpp}
// (OpenUSD 26.11.1). std::shared_ptr ownership is GC.

import type { Value as VtValue } from 'typescript-usd/vt'
import type { UsdExecImagingValueKey } from './valueKey.ts'

/**
 * Interface for reading exec-computed values within an implementation of
 * UsdExecImagingPrimAdapterInterface (requestAccessorInterface.h:25-45).
 */
export abstract class UsdExecImagingRequestAccessorInterface {
  /**
   * Reads the computed value identified by valueKey.
   *
   * The calling UsdExecImagingAdapter must have added the equivalent value
   * key in its implementation of BuildRequest, or else this method may
   * return an empty value. If the requested valueKey was not previously
   * added to the exec request, this emits a TF_CODING_ERROR.
   */
  abstract getComputedValue(valueKey: UsdExecImagingValueKey): VtValue
}

/** UsdExecImagingRequestAccessorInterfaceSharedPtr (requestAccessorInterface.h:20-21). */
export type UsdExecImagingRequestAccessorInterfaceSharedPtr = UsdExecImagingRequestAccessorInterface | null
