// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/dataSourceStage.cpp,
//  pxr/usdImaging/usdImaging/dataSourceStage.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceStage.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource, RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource, type DataSourceBase as HdDataSourceBase,
  SceneGlobalsSchema as HdSceneGlobalsSchema, SceneGlobalsSchemaTokens as HdSceneGlobalsSchemaTokens,
  SystemSchemaTokens as HdSystemSchemaTokens,
} from 'typescript-usd/hd'
import type { Stage as UsdStage } from 'typescript-usd/usd'
import { getStageUpAxis as UsdGeomGetStageUpAxis } from 'typescript-usd/usdGeom'
import { UsdImagingUsdUpAxisSchema, UsdImagingUsdUpAxisSchemaTokens } from './usdUpAxisSchema.ts'

/** hdar/systemSchema.h HDAR_SYSTEM_SCHEMA_TOKENS. hdar is not ported as a
 *  library; its system schema contributes only these two names. */
const HdarSystemSchemaTokens = { assetResolution: 'assetResolution', resolverContext: 'resolverContext' } as const

/** usdRender/tokens.h UsdRenderTokens->renderSettingsPrimPath */
const _renderSettingsPrimPath = 'renderSettingsPrimPath'

/** dataSourceStage.h:20-43: the data source of the absolute root path,
 *  holding stage-level data. */
export class UsdImagingDataSourceStage extends HdContainerDataSource {
  private constructor(private readonly _stage: UsdStage) { super() }

  static new(stage: UsdStage): UsdImagingDataSourceStage {
    return new UsdImagingDataSourceStage(stage)
  }

  /** dataSourceStage.cpp:24-32 */
  getNames(): string[] {
    return [
      HdSystemSchemaTokens.system,
      HdSceneGlobalsSchemaTokens.sceneGlobals,
      UsdImagingUsdUpAxisSchemaTokens.usdUpAxis,
    ]
  }

  /** dataSourceStage.cpp:34-80 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdSystemSchemaTokens.system) {
      // HdarSystemSchema::Builder().SetResolverContext(...).Build()
      return HdRetainedContainerDataSource.new(
        [HdarSystemSchemaTokens.assetResolution],
        [HdRetainedContainerDataSource.new(
          [HdarSystemSchemaTokens.resolverContext],
          [HdRetainedTypedSampledDataSource.new(this._stage.getPathResolverContext())])])
    }
    if (name === HdSceneGlobalsSchemaTokens.sceneGlobals) {
      // Update the sceneGlobals locator if we have stage metadata for the
      // the render settings prim to use for rendering.
      const pathStr = this._stage.hasMetadata(_renderSettingsPrimPath)
        ? String(this._stage.getMetadata(_renderSettingsPrimPath) ?? '') : ''

      return new HdSceneGlobalsSchema.Builder()
        .setActiveRenderSettingsPrim(pathStr === ''
          ? undefined
          : HdRetainedTypedSampledDataSource.new(pathStr))
        .setStartTimeCode(HdRetainedTypedSampledDataSource.new(this._stage.startTimeCode ?? 0))
        .setEndTimeCode(HdRetainedTypedSampledDataSource.new(this._stage.endTimeCode ?? 0))
        .setTimeCodesPerSecond(HdRetainedTypedSampledDataSource.new(this._stage.timeCodesPerSecond))
        .build()
    }
    if (name === UsdImagingUsdUpAxisSchema.getSchemaToken()) {
      return HdRetainedContainerDataSource.new(
        [UsdImagingUsdUpAxisSchemaTokens.upAxis],
        [HdRetainedTypedSampledDataSource.new(UsdGeomGetStageUpAxis(this._stage))])
    }
    return undefined
  }
}
