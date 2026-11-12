// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/lightAPIAdapter.cpp,
//  pxr/usdImaging/usdImaging/lightAPIAdapter.h,
//  pxr/usdImaging/usdImaging/primAdapter.cpp
// Copyright 2016, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/lightAPIAdapter.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: UsdImagingPrimAdapter::LookupLightParamAttribute
// (primAdapter.cpp:674-722) is a static utility of UsdImagingPrimAdapter;
// primAdapter.ts ports only the scene index API of that class, so the
// utility is ported here as UsdImagingPrimAdapter_LookupLightParamAttribute,
// next to its scene index caller.

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  LightSchema as HdLightSchema,
  LightSchemaTokens as HdLightSchemaTokens,
  LightTokens as HdLightTokens,
  MaterialSchema as HdMaterialSchema,
  MaterialTerminalTokens as HdMaterialTerminalTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  Tokens as HdTokens,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import type { Attribute as UsdAttribute, Prim as UsdPrim } from 'typescript-usd/usd'
import { LightAPI as UsdLuxLightAPI, Tokens as UsdLuxTokens } from 'typescript-usd/usdLux'
import { UsdImagingAPISchemaAdapter } from './apiSchemaAdapter.ts'
import { UsdImagingDataSourceAttributeNew } from './dataSourceAttribute.ts'
import { UsdImagingDataSourceMaterial } from './dataSourceMaterial.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** primAdapter.cpp:681-714 paramToAttrName */
const _paramToAttrName = new Map<string, string>([
  [HdLightTokens.angle, UsdLuxTokens.inputsAngle],
  [HdLightTokens.color, UsdLuxTokens.inputsColor],
  [HdLightTokens.colorTemperature, UsdLuxTokens.inputsColorTemperature],
  [HdLightTokens.diffuse, UsdLuxTokens.inputsDiffuse],
  [HdLightTokens.enableColorTemperature, UsdLuxTokens.inputsEnableColorTemperature],
  [HdLightTokens.exposure, UsdLuxTokens.inputsExposure],
  [HdLightTokens.height, UsdLuxTokens.inputsHeight],
  [HdLightTokens.intensity, UsdLuxTokens.inputsIntensity],
  [HdLightTokens.length, UsdLuxTokens.inputsLength],
  [HdLightTokens.normalize, UsdLuxTokens.inputsNormalize],
  [HdLightTokens.radius, UsdLuxTokens.inputsRadius],
  [HdLightTokens.specular, UsdLuxTokens.inputsSpecular],
  [HdLightTokens.textureFile, UsdLuxTokens.inputsTextureFile],
  [HdLightTokens.textureFormat, UsdLuxTokens.inputsTextureFormat],
  [HdLightTokens.width, UsdLuxTokens.inputsWidth],

  [HdLightTokens.shapingFocus, UsdLuxTokens.inputsShapingFocus],
  [HdLightTokens.shapingFocusTint, UsdLuxTokens.inputsShapingFocusTint],
  [HdLightTokens.shapingConeAngle, UsdLuxTokens.inputsShapingConeAngle],
  [HdLightTokens.shapingConeSoftness, UsdLuxTokens.inputsShapingConeSoftness],
  [HdLightTokens.shapingIesFile, UsdLuxTokens.inputsShapingIesFile],
  [HdLightTokens.shapingIesAngleScale, UsdLuxTokens.inputsShapingIesAngleScale],
  [HdLightTokens.shapingIesNormalize, UsdLuxTokens.inputsShapingIesNormalize],
  [HdLightTokens.shadowEnable, UsdLuxTokens.inputsShadowEnable],
  [HdLightTokens.shadowColor, UsdLuxTokens.inputsShadowColor],
  [HdLightTokens.shadowDistance, UsdLuxTokens.inputsShadowDistance],
  [HdLightTokens.shadowFalloff, UsdLuxTokens.inputsShadowFalloff],
  [HdLightTokens.shadowFalloffGamma, UsdLuxTokens.inputsShadowFalloffGamma],
])

/** primAdapter.cpp:674-722 UsdImagingPrimAdapter::LookupLightParamAttribute:
 *  provides paramName->UsdAttribute value mappings. */
export function UsdImagingPrimAdapter_LookupLightParamAttribute(
  prim: UsdPrim, paramName: string,
): UsdAttribute | undefined {
  // Fallback to USD attributes.
  const attrName = _paramToAttrName.get(paramName)

  if (prim.hasAttribute(attrName !== undefined ? attrName : paramName)) {
    return prim.getAttr(attrName !== undefined ? attrName : paramName)
  }

  return undefined
}

/** lightAPIAdapter.cpp:34-122 */
class _LightDataSource extends HdContainerDataSource {
  /** lightAPIAdapter.cpp:114-119 */
  private constructor(
    private readonly _lightApi: UsdLuxLightAPI,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(lightApi: UsdLuxLightAPI, stageGlobals: UsdImagingDataSourceStageGlobals): _LightDataSource {
    return new _LightDataSource(lightApi, stageGlobals)
  }

  /** lightAPIAdapter.cpp:39-43 */
  getNames(): string[] {
    return _LightDataSource._getNames()
  }

  /** lightAPIAdapter.cpp:45-95 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdTokens.filters) {
      const filterPaths = this._lightApi.getFiltersRel().getForwardedTargets()
      // HdCreateTypedRetainedDataSource(VtValue(filterPaths)): an
      // HdRetainedTypedSampledDataSource<SdfPathVector>.
      return HdRetainedTypedSampledDataSource.new(filterPaths)
    }
    if (name === HdTokens.isLight) {
      return HdRetainedTypedSampledDataSource.new(true)
    }
    if (name === HdTokens.materialSyncMode) {
      // XXX: This branch is functionally identical to the else branch
      // below. Maintained separate because materialSyncMode is a known
      // light schema member. Also note that UsdLux declares
      // materialSyncMode as `uniform` and, strictly speaking, should
      // never be time-varying. However, time-varying values survive so
      // long as USD_VALIDATE_VARIABILITY isn't enabled. Allowing this
      // parameter to be time-varying is useful for testing purposes; if
      // production demands require time-varying materialSyncMode, UsdLux
      // schema will need to be updated to drop `uniform` from the
      // declaration.
      const attr = this._lightApi.getMaterialSyncModeAttr()
      if (attr?.isValid()) {
        return UsdImagingDataSourceAttributeNew(
          attr,
          this._stageGlobals,
          this._lightApi.prim.path,
          HdLightSchema.getDefaultLocator().append(HdTokens.materialSyncMode))
      }
    } else {
      // fallback to UsdAttribute lookup so that we still support
      // render delegates which query via GetLightParamValue rather
      // than GetMaterialResource.
      const attr = UsdImagingPrimAdapter_LookupLightParamAttribute(this._lightApi.prim, name)
      if (attr?.isValid()) {
        return UsdImagingDataSourceAttributeNew(
          attr,
          this._stageGlobals,
          this._lightApi.prim.path,
          HdLightSchema.getDefaultLocator().append(name))
      }
    }

    return undefined
  }

  private static _names: string[] | undefined

  /** lightAPIAdapter.cpp:99-112 */
  private static _getNames(): string[] {
    // Light linking fields 'lightLink' and 'shadowLink' that provide the
    // category ID for the corresponding collection  are computed by a
    // scene index downstream.
    // The collections are transported by collectionAPIAdapter.
    //
    return _LightDataSource._names ??= [
      HdTokens.filters,
      HdTokens.isLight,
      HdTokens.materialSyncMode,
    ]
  }
}

/** lightAPIAdapter.h:19-41 */
export class UsdImagingLightAPIAdapter extends UsdImagingAPISchemaAdapter {
  /** lightAPIAdapter.cpp:126-145 */
  override getImagingSubprimType(_prim: UsdPrim, subprim: string, appliedInstanceName: string): string {
    // UsdLuxLightAPI is not a multi-apply schema.
    if (appliedInstanceName !== '') {
      return ''
    }
    // Override the prim type only for the primary hydra prim.
    // This adapter does not define any additional subprims.
    if (subprim !== '') {
      return ''
    }

    // Note that this opinion weakly composes with opinions from other
    // adapters servicing this prim.
    return HdLightSchemaTokens.light
  }

  /** lightAPIAdapter.cpp:147-171 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, appliedInstanceName: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim !== '' || appliedInstanceName !== '') {
      return undefined
    }

    if (subprim === '') {
      return HdRetainedContainerDataSource.new(
        [HdMaterialSchema.getSchemaToken(), HdLightSchemaTokens.light],
        [
          UsdImagingDataSourceMaterial.new(
            prim,
            stageGlobals,
            HdMaterialTerminalTokens.light),
          _LightDataSource.new(new UsdLuxLightAPI(prim, prim.getStage()), stageGlobals),
        ])
    }

    return undefined
  }

  /** lightAPIAdapter.cpp:173-215 */
  override invalidateImagingSubprim(
    _prim: UsdPrim, subprim: string, appliedInstanceName: string,
    properties: readonly string[], _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim !== '' || appliedInstanceName !== '') {
      return new HdDataSourceLocatorSet()
    }

    let dirtiedMaterial = false
    let dirtiedLight = false

    const result = new HdDataSourceLocatorSet()
    for (const propertyName of properties) {
      if (!dirtiedMaterial && propertyName.startsWith('inputs:')) {
        dirtiedMaterial = true
        // NOTE: since we don't have access to the prim itself and our
        //       light terminal is currently named for the USD path,
        //       we cannot be specific to the individual parameter.
        //       TODO: Consider whether we want to make the terminal node
        //             in the material network have a fixed name for the
        //             light case so that we could.
        result.insert(HdMaterialSchema.getDefaultLocator())

        // since we report parameter values in the "light" data source
        // also, we need to invalidate it also
        result.insert(HdLightSchema.getDefaultLocator())
      }

      if (!dirtiedLight && !dirtiedMaterial &&
          // This will capture other contents of light data source
          propertyName.startsWith('light:')) {
        dirtiedLight = true
        result.insert(HdLightSchema.getDefaultLocator())
      }
    }

    return result
  }
}
