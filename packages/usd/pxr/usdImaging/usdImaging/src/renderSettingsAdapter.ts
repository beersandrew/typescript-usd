// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/renderSettingsAdapter.cpp,
//  pxr/usdImaging/usdImaging/renderSettingsAdapter.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/renderSettingsAdapter.{h,cpp} (OpenUSD 26.11.1):
// the 2.0 (scene index) prim adapter API.
//
// The 1.0 (UsdImagingDelegate) part is not ported (primAdapter.ts header):
// IsSupported, Populate, _RemovePrim, TrackVariability, UpdateForTime,
// ProcessPropertyChange, MarkDirty, Get, _StripRelsFromSettings,
// _ToHdRenderProducts and the LEGACY_PXR_RENDER_TERMINALS_API_ALLOWED_AND_WARN
// env setting.

import {
  PrimTypeTokens as HdPrimTypeTokens,
  type ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingDataSourceRenderSettingsPrim } from './dataSourceRenderPrims.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingPrimAdapter } from './primAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** renderSettingsAdapter.h:24-131 */
export class UsdImagingRenderSettingsAdapter extends UsdImagingPrimAdapter {
  /** renderSettingsAdapter.cpp:68-72 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** renderSettingsAdapter.cpp:74-83 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.renderSettings
    }
    return ''
  }

  /** renderSettingsAdapter.cpp:85-97 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim === '') {
      return UsdImagingDataSourceRenderSettingsPrim.new(
        prim.path, prim, stageGlobals)
    }

    return undefined
  }

  /** renderSettingsAdapter.cpp:99-112 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim === '') {
      return UsdImagingDataSourceRenderSettingsPrim.invalidate(
        prim, subprim, properties, invalidationType)
    }

    return new HdDataSourceLocatorSet()
  }
}
