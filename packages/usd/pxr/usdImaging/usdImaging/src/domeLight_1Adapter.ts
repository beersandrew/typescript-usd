// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/domeLight_1Adapter.cpp,
//  pxr/usdImaging/usdImaging/domeLight_1Adapter.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/domeLight_1Adapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index part.
//
// Not ported (UsdImagingDelegate only, see primAdapter.ts):
// GetLightParamValue (the Hydra 1.0 domeOffset path), IsSupported, Populate
// and _RemovePrim (domeLight_1Adapter.cpp:198-233).

import { Matrix4d as GfMatrix4d, makeRotation as GfRotation } from 'typescript-usd/gf'
import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  LightSchema as HdLightSchema,
  LightTokens as HdLightTokens,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimTypeTokens as HdPrimTypeTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  Tokens as HdTokens,
  TypedSampledDataSource as HdTypedSampledDataSource,
  type ContainerDataSource as HdContainerDataSource,
} from 'typescript-usd/hd'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { DomeLight_1 as UsdLuxDomeLight_1, Tokens as UsdLuxTokens } from 'typescript-usd/usdLux'
import { ValueTypes as VtValueTypes, Value as VtValue } from 'typescript-usd/vt'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingLightAdapter } from './lightAdapter.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** domeLight_1Adapter.cpp:37-60: return a matrix that will align the given
 *  dome light with its "poleAxis". */
function _GetDomeOffset(prim: UsdPrim): GfMatrix4d {
  const offset = new GfMatrix4d(1.0)
  const domeLight = new UsdLuxDomeLight_1(prim, prim.getStage())
  if (domeLight.isValid()) {
    const poleAxis = domeLight.getPoleAxisAttr()?.get()
    const zupRot = GfRotation([1.0, 0.0, 0.0], 90.0)
    if (poleAxis === UsdLuxTokens.scene) {
      // UsdGeomTokens->upAxis; typescript-usd/usdGeom exports no tokens.
      const stageUpAxis = prim.getStage().getMetadata('upAxis')
      if (stageUpAxis !== undefined) {
        if (stageUpAxis === 'Z' /* UsdGeomTokens->z */) {
          offset.setRotate(zupRot)
        }
      }
    } else if (poleAxis === UsdLuxTokens.Z) {
      offset.setRotate(zupRot)
    }
  }
  return offset
}

/** domeLight_1Adapter.cpp:62-95: an HdTypedSampledDataSource that determines
 *  the dome offset matrix for its stored UsdPrim at the time its value is
 *  requested. */
class _LazyDomeOffsetDataSource extends HdTypedSampledDataSource<GfMatrix4d> {
  private constructor(private readonly _prim: UsdPrim) { super() }

  static new(prim: UsdPrim): _LazyDomeOffsetDataSource {
    return new _LazyDomeOffsetDataSource(prim)
  }

  override GetValue(shutterOffset: number): VtValue {
    return VtValue.create(this.getTypedValue(shutterOffset), VtValueTypes.GfMatrix4d)
  }

  getTypedValue(_shutterOffset: number): GfMatrix4d {
    return _GetDomeOffset(this._prim)
  }

  GetContributingSampleTimesForInterval(
    _startTime: number, _endTime: number, _outSampleTimes: number[],
  ): boolean {
    return false
  }
}

/** domeLight_1Adapter.cpp:96-132: an HdTypedSampledDataSource that
 *  determines the list of portals. */
class _PortalsDataSource extends HdTypedSampledDataSource<string[]> {
  private constructor(private readonly _prim: UsdPrim) { super() }

  static new(prim: UsdPrim): _PortalsDataSource {
    return new _PortalsDataSource(prim)
  }

  getTypedValue(_shutterOffset: number): string[] {
    const portalsRel = new UsdLuxDomeLight_1(this._prim, this._prim.getStage()).getPortalsRel()
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

/** domeLight_1Adapter.h:25-85 */
export class UsdImagingDomeLight_1Adapter extends UsdImagingLightAdapter {
  /** domeLight_1Adapter.cpp:140-144 */
  override getImagingSubprims(_prim: UsdPrim): string[] {
    return ['']
  }

  /** domeLight_1Adapter.cpp:146-155 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string): string {
    if (subprim === '') {
      return HdPrimTypeTokens.domeLight
    }

    return ''
  }

  /** domeLight_1Adapter.cpp:157-175 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    // Hydra 2.0 code path: Overlay the domeOffset onto the light adapter's
    // result.
    return HdOverlayContainerDataSource.new(
      HdRetainedContainerDataSource.new(
        [HdLightSchema.getSchemaToken()],
        [HdRetainedContainerDataSource.new(
          [HdLightTokens.domeOffset, HdTokens.portals],
          [_LazyDomeOffsetDataSource.new(prim), _PortalsDataSource.new(prim)])]),
      super.getImagingSubprimData(prim, subprim, stageGlobals))
  }

  /** domeLight_1Adapter.cpp:177-196 */
  override invalidateImagingSubprim(
    prim: UsdPrim, subprim: string, properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const result = super.invalidateImagingSubprim(prim, subprim, properties, invalidationType)

    for (const propertyName of properties) {
      if (propertyName === UsdLuxTokens.poleAxis ||
          propertyName === UsdLuxTokens.portals) {
        result.insert(HdLightSchema.getDefaultLocator())
      }
    }

    return result
  }
}
