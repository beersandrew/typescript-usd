// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceRenderPrims.cpp,
//  pxr/usdImaging/usdImaging/dataSourceRenderPrims.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceRenderPrims.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  RenderPassSchema as HdRenderPassSchema,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import type { Attribute as UsdAttribute, Prim as UsdPrim, Rel as UsdRelationship } from 'typescript-usd/usd'
import {
  Pass as UsdRenderPass,
  Product as UsdRenderProduct,
  Settings as UsdRenderSettings,
  SettingsBase as UsdRenderSettingsBase,
  Tokens as UsdRenderTokens,
  Var as UsdRenderVar,
} from 'typescript-usd/usdRender'
import { UsdImagingDataSourceAttributeNew } from './dataSourceAttribute.ts'
import { UsdImagingDataSourcePrim } from './dataSourcePrim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { TF_WARN } from './tfDiagnostic.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'
import { UsdImagingUsdRenderProductSchema, UsdImagingUsdRenderProductSchemaTokens } from './usdRenderProductSchema.ts'
import { UsdImagingUsdRenderSettingsSchema, UsdImagingUsdRenderSettingsSchemaTokens } from './usdRenderSettingsSchema.ts'
import { UsdImagingUsdRenderVarSchema, UsdImagingUsdRenderVarSchemaTokens } from './usdRenderVarSchema.ts'

/** dataSourceRenderPrims.cpp:28-35 */
const _tokens = {
  RenderSettings: 'RenderSettings',
  riIntegrator: 'ri:integrator',
  riSampleFilters: 'ri:sampleFilters',
  riDisplayFilters: 'ri:displayFilters',
  riEnergyFilters: 'ri:energyFilters',
} as const

/** dataSourceRenderPrims.cpp:37-45 */
function _Concat(a: readonly string[], b: readonly string[]): string[] {
  return [...a, ...b]
}

/** UsdPrim::GetAuthoredAttributes (prim.h): the authored properties of the
 *  prim whose defining spec is an attribute spec, in property order. */
function _GetAuthoredAttributes(prim: UsdPrim): UsdAttribute[] {
  const result: UsdAttribute[] = []
  for (const name of prim.getAuthoredPropertyNames()) {
    const attr = prim.getAttr(name)
    if (attr?.isValid()) {
      result.push(attr)
    }
  }
  return result
}

/** UsdPrim::GetRelationship + UsdObject's explicit bool conversion: the
 *  relationship when the prim has a property of that name whose defining
 *  spec is a relationship spec, else undefined. */
function _GetRelationship(prim: UsdPrim, name: string): UsdRelationship | undefined {
  if (!prim.hasProperty(name) || prim.getAttr(name)?.isValid()) {
    return undefined
  }
  return prim.rel(name)
}

/** UsdProperty::GetAttribute + bool conversion: the attribute when its
 *  defining spec is an attribute spec, else undefined. */
function _GetAttribute(prim: UsdPrim, name: string): UsdAttribute | undefined {
  const attr = prim.getAttr(name)
  return attr?.isValid() ? attr : undefined
}

/** UsdRelationship::HasAuthoredTargets (relationship.cpp:287-291):
 *  HasAuthoredMetadata(SdfFieldKeys->TargetPaths). */
function _HasAuthoredTargets(rel: UsdRelationship): boolean {
  return rel.getMetadata('targetPaths') !== undefined
}

/** dataSourceRenderPrims.cpp:47-57 */
function _IsNamespacedAttribute(attr: UsdAttribute): boolean {
  const name = attr.name
  // Strip "outputs:" prefix (UsdShadeOutput convention) before checking
  // for a namespace delimiter.
  const basename = (name.length > 8 && name.startsWith('outputs:'))
    ? name.substring(8) : name
  return basename.includes(':')
}

const _riRelNames = [
  _tokens.riIntegrator,
  _tokens.riSampleFilters,
  _tokens.riDisplayFilters,
  _tokens.riEnergyFilters,
]

/** dataSourceRenderPrims.cpp:58-145. A container data source for
 *  "namespacedSettings" that vends each namespaced attribute as a live
 *  UsdImagingDataSourceAttribute, preserving time-varying values and
 *  registering them with the stage globals.
 *
 *  XXX: We explicitly populate PxrRenderTerminalsAPI relationships
 *  to RenderSettings, avoiding populating all relationships; this
 *  should be moved to renderman-specific code in a future change.
 *  https://jira.pixar.com/browse/HYD-3280 */
class _DataSourceNamespacedSettings extends HdContainerDataSource {
  static new(
    sceneIndexPath: string, prim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals, locatorPrefix: HdDataSourceLocator,
  ): _DataSourceNamespacedSettings {
    return new _DataSourceNamespacedSettings(sceneIndexPath, prim, stageGlobals, locatorPrefix)
  }

  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _prim: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
    private readonly _locatorPrefix: HdDataSourceLocator,
  ) { super() }

  getNames(): string[] {
    const names: string[] = []
    for (const attr of _GetAuthoredAttributes(this._prim)) {
      if (_IsNamespacedAttribute(attr)) {
        names.push(attr.name)
      }
    }
    // XXX UsdImaging should not have knowledge of RenderMan
    // specific concepts; these should be moved out to a
    // usdRiPxrImaging adapter.
    for (const relName of _riRelNames) {
      const rel = _GetRelationship(this._prim, relName)
      if (rel) {
        if (_HasAuthoredTargets(rel)) {
          names.push(relName)
        }
      }
    }
    return names
  }

  Get(name: string): HdDataSourceBase | undefined {
    // XXX UsdImaging should not have knowledge of RenderMan
    // specific concepts; these should be moved out to a
    // usdRiPxrImaging adapter.
    for (const relName of _riRelNames) {
      if (name === relName) {
        const rel = _GetRelationship(this._prim, name)
        if (rel) {
          const targets = rel.getTargets()
          // XXX Surprisingly, these settings come through as
          // std::vector even though VtArray is what is typically
          // used in the scene index.
          return HdRetainedTypedSampledDataSource.new<string[]>(targets)
        }
        return undefined
      }
    }

    const attr = _GetAttribute(this._prim, name)
    if (attr) {
      return UsdImagingDataSourceAttributeNew(
        attr, this._stageGlobals, this._sceneIndexPath,
        this._locatorPrefix.append(name))
    }
    return undefined
  }
}

// ----------------------------------------------------------------------------
//                               RENDER PASS
// ----------------------------------------------------------------------------

/** dataSourceRenderPrims.cpp:159-218. A container data source representing
 *  render pass. */
class _DataSourceRenderPass extends HdContainerDataSource {
  private static _names: string[] | undefined

  static new(
    sceneIndexPath: string, usdRenderPass: UsdRenderPass,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): _DataSourceRenderPass {
    return new _DataSourceRenderPass(sceneIndexPath, usdRenderPass, stageGlobals)
  }

  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdRenderPass: UsdRenderPass,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static getPropertyNames(): readonly string[] {
    // We do not supply all of the UsdRenderPass attributes,
    // since some are for batch processing purposes.
    return _DataSourceRenderPass._names ??= [
      UsdRenderTokens.passType,
      UsdRenderTokens.renderSource]
  }

  getNames(): string[] {
    return [..._DataSourceRenderPass.getPropertyNames()]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdRenderTokens.passType) {
      const passType = this._usdRenderPass.getPassTypeAttr().get()
      if (passType !== undefined) {
        return HdRetainedTypedSampledDataSource.new<string>(passType as string)
      }
      return undefined
    } else if (name === UsdRenderTokens.renderSource) {
      // UsdRelationship's bool conversion: the relationship exists.
      const renderSourceRel = _GetRelationship(this._usdRenderPass.prim, UsdRenderTokens.renderSource)
        ? this._usdRenderPass.getRenderSourceRel() : undefined
      if (renderSourceRel) {
        const targets = renderSourceRel.getForwardedTargets()
        if (targets.length > 0) {
          return HdRetainedTypedSampledDataSource.new<string>(targets[0]!)
        }
      }
      return undefined
    }
    return undefined
  }
}

/** dataSourceRenderPrims.h:19-49: a prim data source representing
 *  UsdRenderPass. */
export class UsdImagingDataSourceRenderPassPrim extends UsdImagingDataSourcePrim {
  /** dataSourceRenderPrims.cpp:224-229 */
  protected constructor(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceRenderPassPrim {
    return new UsdImagingDataSourceRenderPassPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceRenderPrims.cpp:232-237 */
  override getNames(): string[] {
    // Note: Skip properties on UsdImagingDataSourcePrim.
    return [HdRenderPassSchema.getSchemaToken()]
  }

  /** dataSourceRenderPrims.cpp:239-251 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdRenderPassSchema.getSchemaToken()) {
      return _DataSourceRenderPass.new(
        this._getSceneIndexPath(),
        new UsdRenderPass(this._getUsdPrim()),
        this._getStageGlobals())
    }

    // Note: Skip properties on UsdImagingDataSourcePrim.
    return undefined
  }

  /** dataSourceRenderPrims.cpp:253-278 */
  static override invalidate(
    _prim: UsdPrim, _subprim: string, properties: readonly string[],
    _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const tokensSet = new Set(_DataSourceRenderPass.getPropertyNames())

    const locators = new HdDataSourceLocatorSet()

    for (const propertyName of properties) {
      if (tokensSet.has(propertyName)) {
        locators.add(
          HdRenderPassSchema.getDefaultLocator()
            .append(propertyName))
      }
      // Note: Skip UsdImagingDataSourcePrim::Invalidate(...)
      // since none of the "base" set of properties are relevant here.
    }

    return locators
  }
}

// ----------------------------------------------------------------------------
//                               RENDER SETTINGS
// ----------------------------------------------------------------------------

/** dataSourceRenderPrims.cpp:289-374. A container data source representing
 *  render settings info. */
class _DataSourceRenderSettings extends HdContainerDataSource {
  private static _names: string[] | undefined

  static new(
    sceneIndexPath: string, usdRenderSettings: UsdRenderSettings,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): _DataSourceRenderSettings {
    return new _DataSourceRenderSettings(sceneIndexPath, usdRenderSettings, stageGlobals)
  }

  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdRenderSettings: UsdRenderSettings,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static getPropertyNames(): readonly string[] {
    return _DataSourceRenderSettings._names ??= _Concat(
      UsdRenderSettings.getSchemaAttributeNames(
        /* includeInherited = */ true),
      [UsdImagingUsdRenderSettingsSchemaTokens.namespacedSettings,
        // Relationships need to be explicitly specified.
        UsdImagingUsdRenderSettingsSchemaTokens.camera,
        UsdImagingUsdRenderSettingsSchemaTokens.products])
  }

  getNames(): string[] {
    return [..._DataSourceRenderSettings.getPropertyNames()]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdImagingUsdRenderSettingsSchemaTokens.namespacedSettings) {
      return _DataSourceNamespacedSettings.new(
        this._sceneIndexPath,
        this._usdRenderSettings.prim,
        this._stageGlobals,
        UsdImagingUsdRenderSettingsSchema.getNamespacedSettingsLocator())
    }

    if (name === UsdImagingUsdRenderSettingsSchemaTokens.camera) {
      const targets = this._usdRenderSettings.getCameraRel().getForwardedTargets()
      if (targets.length > 0) {
        return HdRetainedTypedSampledDataSource.new<string>(targets[0]!)
      }
      return undefined
    }

    if (name === UsdImagingUsdRenderSettingsSchemaTokens.products) {
      const targets = this._usdRenderSettings.getProductsRel().getForwardedTargets()
      // VtArray<SdfPath>: arrays of paths are plain arrays in this port
      // (dataSourceTypeDefs.ts).
      return HdRetainedTypedSampledDataSource.new<string[]>(targets)
    }

    const attr = _GetAttribute(this._usdRenderSettings.prim, name)
    if (attr) {
      return UsdImagingDataSourceAttributeNew(
        attr,
        this._stageGlobals,
        this._sceneIndexPath,
        UsdImagingUsdRenderSettingsSchema.getDefaultLocator().append(name))
    } else {
      TF_WARN(`Unhandled attribute ${name} in _DataSourceRenderSettings`)
      return undefined
    }
  }
}

/** dataSourceRenderPrims.h:52-84: a prim data source representing
 *  UsdRenderSettings. */
export class UsdImagingDataSourceRenderSettingsPrim extends UsdImagingDataSourcePrim {
  /** dataSourceRenderPrims.cpp:380-385 */
  protected constructor(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceRenderSettingsPrim {
    return new UsdImagingDataSourceRenderSettingsPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceRenderPrims.cpp:388-393 */
  override getNames(): string[] {
    // Note: Skip properties on UsdImagingDataSourcePrim.
    return [UsdImagingUsdRenderSettingsSchema.getSchemaToken()]
  }

  /** dataSourceRenderPrims.cpp:395-407 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdImagingUsdRenderSettingsSchema.getSchemaToken()) {
      return _DataSourceRenderSettings.new(
        this._getSceneIndexPath(),
        new UsdRenderSettings(this._getUsdPrim()),
        this._getStageGlobals())
    }

    // Note: Skip properties on UsdImagingDataSourcePrim.
    return undefined
  }

  /** dataSourceRenderPrims.cpp:409-442 */
  static override invalidate(
    _prim: UsdPrim, _subprim: string, properties: readonly string[],
    _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const tokensSet = new Set(_DataSourceRenderSettings.getPropertyNames())

    const locators = new HdDataSourceLocatorSet()

    for (const propertyName of properties) {
      if (tokensSet.has(propertyName)) {
        locators.add(
          UsdImagingUsdRenderSettingsSchema.getDefaultLocator()
            .append(propertyName))
      } else {
        // It is likely that the property is an attribute that's
        // aggregated under "namespaced settings". For performance, skip
        // validating whether that is the case.
        locators.add(
          UsdImagingUsdRenderSettingsSchema.getNamespacedSettingsLocator())
      }
      // Note: Skip UsdImagingDataSourcePrim::Invalidate(...)
      // since none of the "base" set of properties are relevant here.
    }

    return locators
  }
}

// ----------------------------------------------------------------------------
//                              RENDER PRODUCT
// ----------------------------------------------------------------------------

/** dataSourceRenderPrims.cpp:452-552. A container data source representing
 *  render product info. */
class _DataSourceRenderProduct extends HdContainerDataSource {
  private static _names: string[] | undefined
  private static _settingsBaseTokenSet: Set<string> | undefined

  static new(
    sceneIndexPath: string, usdRenderProduct: UsdRenderProduct,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): _DataSourceRenderProduct {
    return new _DataSourceRenderProduct(sceneIndexPath, usdRenderProduct, stageGlobals)
  }

  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdRenderProduct: UsdRenderProduct,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static getPropertyNames(): readonly string[] {
    return _DataSourceRenderProduct._names ??= _Concat(
      UsdRenderProduct.getSchemaAttributeNames(
        /* includeInherited = */ true),
      [UsdImagingUsdRenderProductSchemaTokens.namespacedSettings,
        // Relationships need to be explicitly specified.
        UsdImagingUsdRenderProductSchemaTokens.camera,
        UsdImagingUsdRenderProductSchemaTokens.orderedVars])
  }

  getNames(): string[] {
    return [..._DataSourceRenderProduct.getPropertyNames()]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdImagingUsdRenderProductSchemaTokens.namespacedSettings) {
      return _DataSourceNamespacedSettings.new(
        this._sceneIndexPath,
        this._usdRenderProduct.prim,
        this._stageGlobals,
        UsdImagingUsdRenderProductSchema.getNamespacedSettingsLocator())
    }

    if (name === UsdImagingUsdRenderProductSchemaTokens.camera) {
      const targets = this._usdRenderProduct.getCameraRel().getForwardedTargets()
      if (targets.length > 0) {
        return HdRetainedTypedSampledDataSource.new<string>(targets[0]!)
      }
      return undefined
    }

    if (name === UsdImagingUsdRenderProductSchemaTokens.orderedVars) {
      const targets = this._usdRenderProduct.getOrderedVarsRel().getForwardedTargets()
      return HdRetainedTypedSampledDataSource.new<string[]>(targets)
    }

    const attr = _GetAttribute(this._usdRenderProduct.prim, name)
    if (attr) {
      // Only consider authored attributes in UsdRenderSettingsBase,
      // to allow the targeting render settings prim's opinion to be
      // inherited by the product via
      // UsdImagingRenderSettingsFlatteningSceneIndex.
      const settingsBaseTokenSet = _DataSourceRenderProduct._settingsBaseTokenSet ??=
        new Set(UsdRenderSettingsBase.getSchemaAttributeNames())
      const attrInSettingsBase = settingsBaseTokenSet.has(name)

      if (attrInSettingsBase && !attr.hasAuthoredValue()) {
        return undefined
      }

      return UsdImagingDataSourceAttributeNew(
        attr,
        this._stageGlobals,
        this._sceneIndexPath,
        UsdImagingUsdRenderProductSchema.getDefaultLocator().append(name))
    } else {
      TF_WARN(`Unhandled attribute ${name} in _DataSourceRenderProduct`)
      return undefined
    }
  }
}

/** dataSourceRenderPrims.h:87-119: a prim data source representing
 *  UsdRenderProduct. */
export class UsdImagingDataSourceRenderProductPrim extends UsdImagingDataSourcePrim {
  /** dataSourceRenderPrims.cpp:558-563 */
  protected constructor(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceRenderProductPrim {
    return new UsdImagingDataSourceRenderProductPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceRenderPrims.cpp:566-571 */
  override getNames(): string[] {
    // Note: Skip properties on UsdImagingDataSourcePrim.
    return [UsdImagingUsdRenderProductSchema.getSchemaToken()]
  }

  /** dataSourceRenderPrims.cpp:573-585 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdImagingUsdRenderProductSchema.getSchemaToken()) {
      return _DataSourceRenderProduct.new(
        this._getSceneIndexPath(),
        new UsdRenderProduct(this._getUsdPrim()),
        this._getStageGlobals())
    }

    // Note: Skip properties on UsdImagingDataSourcePrim.
    return undefined
  }

  /** dataSourceRenderPrims.cpp:587-619 */
  static override invalidate(
    _prim: UsdPrim, _subprim: string, properties: readonly string[],
    _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const tokensSet = new Set(_DataSourceRenderProduct.getPropertyNames())

    const locators = new HdDataSourceLocatorSet()

    for (const propertyName of properties) {
      if (tokensSet.has(propertyName)) {
        locators.add(
          UsdImagingUsdRenderProductSchema.getDefaultLocator()
            .append(propertyName))
      } else {
        // It is likely that the property is an attribute that's
        // aggregated under "namespaced settings". For performance, skip
        // validating whether that is the case.
        locators.add(
          UsdImagingUsdRenderProductSchema.getNamespacedSettingsLocator())
      }
      // Note: Skip UsdImagingDataSourcePrim::Invalidate(...)
      // since none of the "base" set of properties are relevant here.
    }

    return locators
  }
}

// ----------------------------------------------------------------------------
//                               RENDER VAR
// ----------------------------------------------------------------------------

/** dataSourceRenderPrims.cpp:631-694. A container data source representing
 *  render var info. */
class _DataSourceRenderVar extends HdContainerDataSource {
  private static _names: string[] | undefined

  static new(
    sceneIndexPath: string, usdRenderVar: UsdRenderVar,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): _DataSourceRenderVar {
    return new _DataSourceRenderVar(sceneIndexPath, usdRenderVar, stageGlobals)
  }

  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdRenderVar: UsdRenderVar,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static getPropertyNames(): readonly string[] {
    return _DataSourceRenderVar._names ??= _Concat(
      UsdRenderVar.getSchemaAttributeNames(
        /* includeInherited = */ true),
      [UsdImagingUsdRenderVarSchemaTokens.namespacedSettings])
  }

  getNames(): string[] {
    return [..._DataSourceRenderVar.getPropertyNames()]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdImagingUsdRenderVarSchemaTokens.namespacedSettings) {
      return _DataSourceNamespacedSettings.new(
        this._sceneIndexPath,
        this._usdRenderVar.prim,
        this._stageGlobals,
        UsdImagingUsdRenderVarSchema.getNamespacedSettingsLocator())
    }

    const attr = _GetAttribute(this._usdRenderVar.prim, name)
    if (attr) {
      return UsdImagingDataSourceAttributeNew(
        attr,
        this._stageGlobals,
        this._sceneIndexPath,
        UsdImagingUsdRenderVarSchema.getDefaultLocator().append(name))
    } else {
      TF_WARN(`Unhandled attribute ${name} in _DataSourceRenderVar`)
      return undefined
    }
  }
}

/** dataSourceRenderPrims.h:122-155: a prim data source representing
 *  UsdRenderVar. */
export class UsdImagingDataSourceRenderVarPrim extends UsdImagingDataSourcePrim {
  /** dataSourceRenderPrims.cpp:700-705 */
  protected constructor(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceRenderVarPrim {
    return new UsdImagingDataSourceRenderVarPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceRenderPrims.cpp:708-713 */
  override getNames(): string[] {
    // Note: Skip properties on UsdImagingDataSourcePrim.
    return [UsdImagingUsdRenderVarSchema.getSchemaToken()]
  }

  /** dataSourceRenderPrims.cpp:715-727 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdImagingUsdRenderVarSchema.getSchemaToken()) {
      return _DataSourceRenderVar.new(
        this._getSceneIndexPath(),
        new UsdRenderVar(this._getUsdPrim()),
        this._getStageGlobals())
    }

    // Note: Skip properties on UsdImagingDataSourcePrim.
    return undefined
  }

  /** dataSourceRenderPrims.cpp:729-760 */
  static override invalidate(
    _prim: UsdPrim, _subprim: string, properties: readonly string[],
    _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const tokensSet = new Set(_DataSourceRenderVar.getPropertyNames())

    const locators = new HdDataSourceLocatorSet()

    for (const propertyName of properties) {
      if (tokensSet.has(propertyName)) {
        locators.add(
          UsdImagingUsdRenderVarSchema.getDefaultLocator()
            .append(propertyName))
      } else {
        // It is likely that the property is an attribute that's
        // aggregated under "namespaced settings". For performance, skip
        // validating whether that is the case.
        locators.add(
          UsdImagingUsdRenderVarSchema.getNamespacedSettingsLocator())
      }
    }
    // Note: Skip UsdImagingDataSourcePrim::Invalidate(...)
    // since none of the "base" set of properties are relevant here.

    return locators
  }
}
