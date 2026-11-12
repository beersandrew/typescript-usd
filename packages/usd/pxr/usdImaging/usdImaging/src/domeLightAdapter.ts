// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/domeLightAdapter.cpp,
//  pxr/usdImaging/usdImaging/domeLightAdapter.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/domeLightAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part.
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts): IsSupported,
// Populate and _RemovePrim (domeLightAdapter.cpp:130-150).

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  LightSchema as HdLightSchema,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  Tokens as HdTokens,
  TypedSampledDataSource as HdTypedSampledDataSource,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { DomeLight as UsdLuxDomeLight, Tokens as UsdLuxTokens } from 'typescript-usd/usdLux'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingLightAdapter } from './lightAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** domeLightAdapter.cpp:33-70: an HdTypedSampledDataSource that determines
 *  the list of portals. */
class _PortalsDataSource extends HdTypedSampledDataSource<string[]> {
  private constructor(private readonly _prim: UsdPrim) { super() }

  static new(prim: UsdPrim): _PortalsDataSource {
    return new _PortalsDataSource(prim)
  }

  getTypedValue(_shutterOffset: number): string[] {
    const portalsRel = new UsdLuxDomeLight(this._prim, this._prim.getStage()).getPortalsRel()
    let portalPaths: string[] = []
    if (portalsRel) {
      portalPaths = portalsRel.getForwardedTargets()
    }
    return portalPaths
  }

  GetContributingSampleTimesForInterval(
    _startTime: number, _endTime: number, _outSampleTimes: number[],
  ): boolean {
    return false
  }
}

/** domeLightAdapter.h:25-76 */
export class UsdImagingDomeLightAdapter extends UsdImagingLightAdapter {
  /** domeLightAdapter.cpp:77-81 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** domeLightAdapter.cpp:83-92 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.domeLight
    }

    return ''
  }

  /** domeLightAdapter.cpp:94-107 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    return HdOverlayContainerDataSource.new(
      HdRetainedContainerDataSource.new(
        [HdLightSchema.getSchemaToken()],
        [HdRetainedContainerDataSource.new(
          [HdTokens.portals],
          [_PortalsDataSource.new(prim)])]),
      super.getImagingSubprimData(prim, subprim, stageGlobals))
  }

  /** domeLightAdapter.cpp:109-128 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const result = super.invalidateImagingSubprim(prim, subprim, properties, invalidationType)

    for (const propertyName of properties) {
      if (propertyName === UsdLuxTokens.portals) {
        result.insert(HdLightSchema.getDefaultLocator())
      }
    }

    return result
  }
}
