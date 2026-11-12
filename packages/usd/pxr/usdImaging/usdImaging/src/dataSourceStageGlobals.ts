// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceStageGlobals.cpp,
//  pxr/usdImaging/usdImaging/dataSourceStageGlobals.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceStageGlobals.{h,cpp}
// (OpenUSD 26.11.1).

import type { DataSourceLocator as HdDataSourceLocator } from 'typescript-usd/hd'
import type { TimeCode as UsdTimeCode } from 'typescript-usd/usd'

/** dataSourceStageGlobals.h:19-49: a context object with global stage
 *  information, passed down to data sources to help them answer scene
 *  queries. */
export abstract class UsdImagingDataSourceStageGlobals {
  /** Returns the current time represented in this instance. */
  abstract getTime(): UsdTimeCode

  /** Flags the given hydraPath as time varying at the given locator. */
  abstract flagAsTimeVarying(hydraPath: string, locator: HdDataSourceLocator): void

  /** Flags the object at usdPath as dependent on an asset path. usdPath may
   *  point to a prim (e.g., if the prim has asset path metadata) or an
   *  attribute (e.g., if the attribute has an asset path value). */
  abstract flagAsAssetPathDependent(usdPath: string): void
}
