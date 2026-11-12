// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/renderSettingsFlatteningSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/renderSettingsFlatteningSceneIndex.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/renderSettingsFlatteningSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource,
  DependenciesSchema as HdDependenciesSchema,
  DependencySchema as HdDependencySchema,
  PrimTypeTokens as HdPrimTypeTokens,
  RenderProductSchema as HdRenderProductSchema,
  RenderSettingsSchema as HdRenderSettingsSchema,
  RenderSettingsSchemaTokens as HdRenderSettingsSchemaTokens,
  RenderVarSchema as HdRenderVarSchema,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  type AddedPrimEntry,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocator as HdDataSourceLocator,
  type DirtiedPrimEntry,
  type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'
import { UsdImagingUsdRenderProductSchema } from './usdRenderProductSchema.ts'
import { UsdImagingUsdRenderSettingsSchema } from './usdRenderSettingsSchema.ts'
import { UsdImagingUsdRenderVarSchema } from './usdRenderVarSchema.ts'

/** renderSettingsFlatteningSceneIndex.cpp:26-42 */
const _tokens = {
  renderSettings_includedPurposes_depOn_usdRenderSettings_includedPurposes:
    'renderSettings_includedPurposes_depOn_usdRenderSettings_includedPurposes',
  renderSettings_materialBindingPurposes_depOn_usdRenderSettings_materialBindingPurposes:
    'renderSettings_materialBindingPurposes_depOn_usdRenderSettings_materialBindingPurposes',
  renderSettings_namespacedSettings_depOn_usdRenderSettings_namespacedSettings:
    'renderSettings_namespacedSettings_depOn_usdRenderSettings_namespacedSettings',
  renderSettings_renderingColorSpace_depOn_usdRenderSettings_renderingColorSpace:
    'renderSettings_renderingColorSpace_depOn_usdRenderSettings_renderingColorSpace',
  renderSettings_camera_depOn_usdRenderSettings_camera:
    'renderSettings_camera_depOn_usdRenderSettings_camera',
  renderSettings_disableDepthOfField_depOn_usdRenderSettings_disableDepthOfField:
    'renderSettings_disableDepthOfField_depOn_usdRenderSettings_disableDepthOfField',
  renderSettings_disableMotionBlur_depOn_usdRenderSettings_disableMotionBlur:
    'renderSettings_disableMotionBlur_depOn_usdRenderSettings_disableMotionBlur',
  renderSettings_renderProducts_depOn_usdRenderSettings_resolution:
    'renderSettings_renderProducts_depOn_usdRenderSettings_resolution',
  renderSettings_renderProducts_depOn_usdRenderSettings_pixelAspectRatio:
    'renderSettings_renderProducts_depOn_usdRenderSettings_pixelAspectRatio',
  renderSettings_renderProducts_depOn_usdRenderSettings_aspectRatioConformPolicy:
    'renderSettings_renderProducts_depOn_usdRenderSettings_aspectRatioConformPolicy',
  renderSettings_renderProducts_depOn_usdRenderSettings_dataWindowNDC:
    'renderSettings_renderProducts_depOn_usdRenderSettings_dataWindowNDC',
  renderSettings_renderProducts_depOn_usdRenderSettings_disableMotionBlur:
    'renderSettings_renderProducts_depOn_usdRenderSettings_disableMotionBlur',
  renderSettings_renderProducts_depOn_usdRenderSettings_disableDepthOfField:
    'renderSettings_renderProducts_depOn_usdRenderSettings_disableDepthOfField',
  renderSettings_renderProducts_depOn_usdRenderSettings_camera:
    'renderSettings_renderProducts_depOn_usdRenderSettings_camera',
  __dependencies_depOn_usdRenderSettings_products:
    '__dependencies_depOn_usdRenderSettings_products',
} as const

/** renderSettingsFlatteningSceneIndex.cpp:47-66. A fallback container data
 *  source for use when an invalid one is provided to avoid conditional checks
 *  in the data source overrides below. */
class _EmptyContainerDataSource extends HdContainerDataSource {
  static new(): _EmptyContainerDataSource {
    return new _EmptyContainerDataSource()
  }

  getNames(): string[] {
    return []
  }

  Get(_name: string): HdDataSourceBase | undefined {
    return undefined
  }
}

/** renderSettingsFlatteningSceneIndex.cpp:68-126 */
function _GetProductAndVarPaths(
  settingsDs: HdContainerDataSource,
  si: HdSceneIndexBase,
  products: string[],
  vars: string[],
): void {
  const usdRss = UsdImagingUsdRenderSettingsSchema.getFromParent(settingsDs)

  const usdProductsDs = usdRss.getProducts()
  if (!usdProductsDs) {
    return
  }
  const vProductPaths = usdProductsDs.getTypedValue(0.0)

  // SdfPathSet: an ordered set of paths.
  const varPaths = new Set<string>()

  for (const productPath of vProductPaths) {
    // Validate that the product prim exists ...
    const prodPrim = si.getPrim(productPath)
    if (!prodPrim.dataSource) {
      continue
    }

    // ... and has a valid data source ...
    const usdRps = UsdImagingUsdRenderProductSchema.getFromParent(prodPrim.dataSource)
    if (!usdRps.isDefined()) {
      continue
    }

    // Legit product!
    products.push(productPath)

    // For vars, aggregate the paths into a set and validate after looping
    // over the products.
    const usdVarsDs = usdRps.getOrderedVars()
    if (usdVarsDs) {
      const vVarPaths = usdVarsDs.getTypedValue(0.0)
      for (const varPath of vVarPaths) {
        varPaths.add(varPath)
      }
    }
  }

  // SdfPathSet iterates in SdfPath::operator< order; sort to match.
  for (const varPath of [...varPaths].sort(_SdfPathLess)) {
    const varPrim = si.getPrim(varPath)
    if (!varPrim.dataSource) {
      continue
    }
    const usdRvs = UsdImagingUsdRenderVarSchema.getFromParent(varPrim.dataSource)

    if (usdRvs.isDefined()) {
      vars.push(varPath)
    }
  }
}

/** SdfPath::operator< (path.cpp: _LessThanCompareNodes) for absolute prim
 *  paths: compare element-wise from the root; a prefix sorts first. */
function _SdfPathLess(a: string, b: string): number {
  const ea = a.split('/'), eb = b.split('/')
  const n = Math.min(ea.length, eb.length)
  for (let i = 0; i < n; ++i) {
    if (ea[i] !== eb[i]) return ea[i]! < eb[i]! ? -1 : 1
  }
  return ea.length - eb.length
}

interface _SelfDependencyEntry {
  name: string
  dependedOnLocator: HdDataSourceLocator
  affectedLocator: HdDataSourceLocator
}

let _selfDependencyEntries: _SelfDependencyEntry[] | undefined

/** renderSettingsFlatteningSceneIndex.cpp:128-321. Build and return a data
 *  source that captures the following dependencies:
 *
 *  1. Changes to fields on the `__usdRenderSettings` data source should
 *     be forwarded to the (flattened) `renderSettings` data source.
 *
 *  2. The dependencies captured in (3) and (4) below depend on the render
 *     products generated by the settings prim. When this changes, the
 *     dependencies should be updated.
 *
 *  3. Any changes to a render product prim generated by the render settings
 *     prim should dirty the `renderProducts` locator on the (flattened)
 *     `renderSettings` data source (i.e., HdRenderSettingsSchema).
 *
 *  4. Similarly, any changes to a render var that is (transitively) generated
 *     by the render settings prim should dirty the `renderProducts` locator on
 *     the (flattened) `renderSettings` data source. */
function _GetRenderSettingsDependenciesDataSource(
  settingsDs: HdContainerDataSource | undefined,
  si: HdSceneIndexBase,
  settingsPrimPath: string,
): HdContainerDataSource | undefined {
  if (!settingsDs) {
    return undefined
  }

  // Get the render products and vars generated by this settings prim.
  const products: string[] = []
  const vars: string[] = []
  _GetProductAndVarPaths(settingsDs, si, products, vars)

  // ------------------------------------------------------------------------
  // Build dependencies data source.
  // ------------------------------------------------------------------------

  // Populate known "self" dependencies.
  const entries = _selfDependencyEntries ??= [
    // Note: a --> b is to be read as "a depends on b".
    // renderSettings --> __usdRenderSettings
    // (1a) Schema entries that map 1:1.
    {
      name: _tokens.renderSettings_includedPurposes_depOn_usdRenderSettings_includedPurposes,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getIncludedPurposesLocator(),
      affectedLocator: HdRenderSettingsSchema.getIncludedPurposesLocator(),
    },
    {
      name: _tokens.renderSettings_materialBindingPurposes_depOn_usdRenderSettings_materialBindingPurposes,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getMaterialBindingPurposesLocator(),
      affectedLocator: HdRenderSettingsSchema.getMaterialBindingPurposesLocator(),
    },
    {
      name: _tokens.renderSettings_namespacedSettings_depOn_usdRenderSettings_namespacedSettings,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getNamespacedSettingsLocator(),
      affectedLocator: HdRenderSettingsSchema.getNamespacedSettingsLocator(),
    },
    {
      name: _tokens.renderSettings_renderingColorSpace_depOn_usdRenderSettings_renderingColorSpace,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getRenderingColorSpaceLocator(),
      affectedLocator: HdRenderSettingsSchema.getRenderingColorSpaceLocator(),
    },
    {
      name: _tokens.renderSettings_camera_depOn_usdRenderSettings_camera,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getCameraLocator(),
      affectedLocator: HdRenderSettingsSchema.getCameraLocator(),
    },
    {
      name: _tokens.renderSettings_disableDepthOfField_depOn_usdRenderSettings_disableDepthOfField,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getDisableDepthOfFieldLocator(),
      affectedLocator: HdRenderSettingsSchema.getDisableDepthOfFieldLocator(),
    },
    {
      name: _tokens.renderSettings_disableMotionBlur_depOn_usdRenderSettings_disableMotionBlur,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getDisableMotionBlurLocator(),
      affectedLocator: HdRenderSettingsSchema.getDisableMotionBlurLocator(),
    },
    // (1b) USD render product-related entries that map to the flattened
    //     render products locator.
    {
      name: _tokens.renderSettings_renderProducts_depOn_usdRenderSettings_resolution,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getResolutionLocator(),
      affectedLocator: HdRenderSettingsSchema.getRenderProductsLocator(),
    },
    {
      name: _tokens.renderSettings_renderProducts_depOn_usdRenderSettings_pixelAspectRatio,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getPixelAspectRatioLocator(),
      affectedLocator: HdRenderSettingsSchema.getRenderProductsLocator(),
    },
    {
      name: _tokens.renderSettings_renderProducts_depOn_usdRenderSettings_aspectRatioConformPolicy,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getAspectRatioConformPolicyLocator(),
      affectedLocator: HdRenderSettingsSchema.getRenderProductsLocator(),
    },
    {
      name: _tokens.renderSettings_renderProducts_depOn_usdRenderSettings_dataWindowNDC,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getDataWindowNDCLocator(),
      affectedLocator: HdRenderSettingsSchema.getRenderProductsLocator(),
    },
    {
      name: _tokens.renderSettings_renderProducts_depOn_usdRenderSettings_disableMotionBlur,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getDisableMotionBlurLocator(),
      affectedLocator: HdRenderSettingsSchema.getRenderProductsLocator(),
    },
    {
      name: _tokens.renderSettings_renderProducts_depOn_usdRenderSettings_disableDepthOfField,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getDisableDepthOfFieldLocator(),
      affectedLocator: HdRenderSettingsSchema.getRenderProductsLocator(),
    },
    {
      name: _tokens.renderSettings_renderProducts_depOn_usdRenderSettings_camera,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getCameraLocator(),
      affectedLocator: HdRenderSettingsSchema.getRenderProductsLocator(),
    },
    // (2) __dependencies --> __usdRenderSettings
    {
      name: _tokens.__dependencies_depOn_usdRenderSettings_products,
      dependedOnLocator: UsdImagingUsdRenderSettingsSchema.getProductsLocator(),
      affectedLocator: HdDependenciesSchema.getDefaultLocator(),
    },
  ]

  const names: string[] = []
  const values: HdDataSourceBase[] = []

  // (1 & 2) Add "self" dependencies that we compiled above.
  for (const entry of entries) {
    names.push(entry.name)
    values.push(
      new HdDependencySchema.Builder()
        .setDependedOnPrimPath(
          HdRetainedTypedSampledDataSource.new<string>(settingsPrimPath))
        .setDependedOnDataSourceLocator(
          HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
            entry.dependedOnLocator))
        .setAffectedDataSourceLocator(
          HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
            entry.affectedLocator))
        .build(),
    )
  }

  // (3) Add renderSettings --> renderProduct dependencies
  const prefix = 'renderSettings_depOn_'
  for (let pid = 0; pid < products.length; ++pid) {
    const depName = prefix + 'product_' + String(pid)
    names.push(depName)

    values.push(
      new HdDependencySchema.Builder()
        .setDependedOnPrimPath(
          HdRetainedTypedSampledDataSource.new<string>(products[pid]!))
        .setDependedOnDataSourceLocator(
          HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
            UsdImagingUsdRenderProductSchema.getDefaultLocator()))
        .setAffectedDataSourceLocator(
          HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
            HdRenderSettingsSchema.getRenderProductsLocator()))
        .build(),
    )
  }

  // (4) Add renderSettings --> renderVar dependencies.
  for (let vid = 0; vid < vars.length; ++vid) {
    const depName = prefix + 'var_' + String(vid)
    names.push(depName)

    values.push(
      new HdDependencySchema.Builder()
        .setDependedOnPrimPath(
          HdRetainedTypedSampledDataSource.new<string>(vars[vid]!))
        .setDependedOnDataSourceLocator(
          HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
            UsdImagingUsdRenderVarSchema.getDefaultLocator()))
        .setAffectedDataSourceLocator(
          HdRetainedTypedSampledDataSource.new<HdDataSourceLocator>(
            HdRenderSettingsSchema.getRenderProductsLocator()))
        .build(),
    )
  }

  return HdRetainedContainerDataSource.new(names, values)
}

/** renderSettingsFlatteningSceneIndex.cpp:322-347 */
function _ToHdRenderVarDS(
  var_: UsdImagingUsdRenderVarSchema,
  varPath: string,
): HdDataSourceBase {
  return new HdRenderVarSchema.Builder()
    .setPath(HdRetainedTypedSampledDataSource.new<string>(varPath))
    .setDataType(var_.getDataType())
    // HdRenderVarSchema uses token for sourceName while
    // UsdImagingUsdRenderVarSchema mimics the UsdRenderVar schema and
    // uses string.
    .setSourceName(
      HdRetainedTypedSampledDataSource.new<string>(
        String(var_.getSourceName()!.getTypedValue(0))))
    .setSourceType(var_.getSourceType())
    .setNamespacedSettings(var_.getNamespacedSettings())
    .build()
}

/** renderSettingsFlatteningSceneIndex.cpp:342-355. The UsdRender OM has
 *  UsdRenderSettings and UsdRenderProduct share a common "base" set of
 *  properties. For value resolution, if the product has an authored opinion,
 *  that wins; else the settings opinion is used. Note that this isn't driven
 *  by prim inheritance in scene description (i.e., the RenderSettings and
 *  RenderProduct prims don't need to inherit from a common RenderSettingsBase
 *  prim). */
function _Resolve<T>(productDsHandle: T | undefined, settingsDsHandle: T | undefined): T | undefined {
  return productDsHandle ? productDsHandle : settingsDsHandle
}

/** renderSettingsFlatteningSceneIndex.cpp:357-391 */
function _ToHdRenderProductDS(
  settings: UsdImagingUsdRenderSettingsSchema,
  product: UsdImagingUsdRenderProductSchema,
  productPath: string,
  vars: HdDataSourceBase[],
): HdDataSourceBase {
  const s = settings
  const p = product
  return new HdRenderProductSchema.Builder()
    .setPath(HdRetainedTypedSampledDataSource.new<string>(productPath))
    .setType(p.getProductType())
    .setName(p.getProductName())
    .setResolution(_Resolve(p.getResolution(), s.getResolution()))
    .setRenderVars(
      HdRetainedSmallVectorDataSource.new(vars))
    .setCameraPrim(_Resolve(p.getCamera(), s.getCamera()))
    .setPixelAspectRatio(
      _Resolve(p.getPixelAspectRatio(), s.getPixelAspectRatio()))
    .setAspectRatioConformPolicy(
      _Resolve(p.getAspectRatioConformPolicy(),
        s.getAspectRatioConformPolicy()))
    .setApertureSize(/*XXX*/undefined)
    .setDataWindowNDC(
      _Resolve(p.getDataWindowNDC(), s.getDataWindowNDC()))
    .setDisableMotionBlur(
      _Resolve(p.getDisableMotionBlur(), s.getDisableMotionBlur()))
    .setDisableDepthOfField(
      _Resolve(p.getDisableDepthOfField(), s.getDisableDepthOfField()))
    .setNamespacedSettings(p.getNamespacedSettings())
    .build()
}

/** renderSettingsFlatteningSceneIndex.cpp:393-450 */
function _FlattenRenderProducts(
  settingsPrimDs: HdContainerDataSource | undefined,
  si: HdSceneIndexBase,
): HdDataSourceBase | undefined {
  if (!settingsPrimDs) {
    return undefined
  }

  const usdRss = UsdImagingUsdRenderSettingsSchema.getFromParent(settingsPrimDs)

  const usdProductsDs = usdRss.getProducts()
  if (!usdProductsDs) {
    return undefined
  }
  const productPaths = usdProductsDs.getTypedValue(0.0)

  const hdProductsDs: HdDataSourceBase[] = []

  for (const productPath of productPaths) {
    const prodPrim = si.getPrim(productPath)
    if (!prodPrim.dataSource) {
      continue
    }

    const usdRps = UsdImagingUsdRenderProductSchema.getFromParent(prodPrim.dataSource)
    if (!usdRps.isDefined()) {
      continue
    }

    const usdVarsDs = usdRps.getOrderedVars()
    const varsPaths = usdVarsDs!.getTypedValue(0.0)
    const hdVarsDs: HdDataSourceBase[] = []
    for (const varPath of varsPaths) {
      const varPrim = si.getPrim(varPath)
      if (!varPrim.dataSource) {
        continue
      }
      const usdRvs = UsdImagingUsdRenderVarSchema.getFromParent(varPrim.dataSource)

      if (usdRvs.isDefined()) {
        hdVarsDs.push(_ToHdRenderVarDS(usdRvs, varPath))
      }
    }

    hdProductsDs.push(
      _ToHdRenderProductDS(usdRss, usdRps, productPath, hdVarsDs))
  }

  return HdRetainedSmallVectorDataSource.new(hdProductsDs)
}

/** renderSettingsFlatteningSceneIndex.cpp:452-546. Flattened render
 *  settings representation. */
class _RenderSettingsDataSource extends HdContainerDataSource {
  private static _names: string[] | undefined
  private readonly _input: HdContainerDataSource

  static new(
    settingsPrimDs: HdContainerDataSource | undefined, si: HdSceneIndexBase,
  ): _RenderSettingsDataSource {
    return new _RenderSettingsDataSource(settingsPrimDs, si)
  }

  private constructor(
    settingsPrimDs: HdContainerDataSource | undefined,
    private readonly _si: HdSceneIndexBase,
  ) {
    super()
    if (!settingsPrimDs) {
      TF_CODING_ERROR('Invalid container data source input provided.')
      this._input = _EmptyContainerDataSource.new()
    } else {
      this._input = settingsPrimDs
    }
  }

  getNames(): string[] {
    // Note: 'active' and 'shutterInterval' are skipped here; these are
    //        expected to be provided by a downstream scene index.
    //        (e.g., HdsiRenderSettingsFilteringSceneIndex)
    return [...(_RenderSettingsDataSource._names ??= [
      HdRenderSettingsSchemaTokens.namespacedSettings,
      HdRenderSettingsSchemaTokens.camera,
      HdRenderSettingsSchemaTokens.disableMotionBlur,
      HdRenderSettingsSchemaTokens.disableDepthOfField,
      HdRenderSettingsSchemaTokens.renderProducts,
      HdRenderSettingsSchemaTokens.includedPurposes,
      HdRenderSettingsSchemaTokens.materialBindingPurposes,
      HdRenderSettingsSchemaTokens.renderingColorSpace])]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdRenderSettingsSchemaTokens.namespacedSettings) {
      const usdRss = UsdImagingUsdRenderSettingsSchema.getFromParent(this._input)
      return usdRss.getNamespacedSettings()
    }

    if (name === HdRenderSettingsSchemaTokens.camera) {
      const usdRss = UsdImagingUsdRenderSettingsSchema.getFromParent(this._input)
      return usdRss.getCamera()
    }

    if (name === HdRenderSettingsSchemaTokens.disableMotionBlur) {
      const usdRss = UsdImagingUsdRenderSettingsSchema.getFromParent(this._input)
      return usdRss.getDisableMotionBlur()
    }

    if (name === HdRenderSettingsSchemaTokens.disableDepthOfField) {
      const usdRss = UsdImagingUsdRenderSettingsSchema.getFromParent(this._input)
      return usdRss.getDisableDepthOfField()
    }

    if (name === HdRenderSettingsSchemaTokens.renderProducts) {
      return _FlattenRenderProducts(this._input, this._si)
    }

    if (name === HdRenderSettingsSchemaTokens.includedPurposes) {
      const usdRss = UsdImagingUsdRenderSettingsSchema.getFromParent(this._input)
      return usdRss.getIncludedPurposes()
    }

    if (name === HdRenderSettingsSchemaTokens.materialBindingPurposes) {
      const usdRss = UsdImagingUsdRenderSettingsSchema.getFromParent(this._input)
      return usdRss.getMaterialBindingPurposes()
    }

    if (name === HdRenderSettingsSchemaTokens.renderingColorSpace) {
      const usdRss = UsdImagingUsdRenderSettingsSchema.getFromParent(this._input)
      return usdRss.getRenderingColorSpace()
    }

    return this._input.Get(name)
  }
}

/** renderSettingsFlatteningSceneIndex.cpp:548-599. Prim data source override
 *  that adds the flattened representation for backend/emulation consumption
 *  and dependencies for notice forwarding. */
class _RenderSettingsPrimDataSource extends HdContainerDataSource {
  private readonly _input: HdContainerDataSource

  static new(
    input: HdContainerDataSource | undefined, si: HdSceneIndexBase, primPath: string,
  ): _RenderSettingsPrimDataSource {
    return new _RenderSettingsPrimDataSource(input, si, primPath)
  }

  private constructor(
    input: HdContainerDataSource | undefined,
    private readonly _si: HdSceneIndexBase,
    private readonly _primPath: string,
  ) {
    super()
    if (!input) {
      TF_CODING_ERROR('Invalid container data source input provided.')
      this._input = _EmptyContainerDataSource.new()
    } else {
      this._input = input
    }
  }

  getNames(): string[] {
    const names = this._input.getNames()
    names.push(HdRenderSettingsSchema.getSchemaToken())
    names.push(HdDependenciesSchema.getSchemaToken())
    return names
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdRenderSettingsSchema.getSchemaToken()) {
      return _RenderSettingsDataSource.new(this._input, this._si)
    }
    if (name === HdDependenciesSchema.getSchemaToken()) {
      return _GetRenderSettingsDependenciesDataSource(
        this._input, this._si, this._primPath)
    }

    return this._input.Get(name)
  }
}

/** renderSettingsFlatteningSceneIndex.h:15-52. Stateless scene index that
 *  adds a flattened render settings representation (as modeled by
 *  HdRenderSettingsSchema) for downstream consumption by a Hydra render
 *  backend, and adds dependencies from the settings prim to the targeted
 *  products and vars (using HdDependenciesSchema) so that change notices are
 *  forwarded back to appropriate locators on the flattened data source. */
export class UsdImagingRenderSettingsFlatteningSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  /** renderSettingsFlatteningSceneIndex.cpp:605-611 */
  static new(inputSceneIndex: HdSceneIndexBase): UsdImagingRenderSettingsFlatteningSceneIndex {
    return new UsdImagingRenderSettingsFlatteningSceneIndex(inputSceneIndex)
  }

  /** renderSettingsFlatteningSceneIndex.cpp:613-618 */
  protected constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
  }

  /** renderSettingsFlatteningSceneIndex.cpp:620-634 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const prim = this._getInputSceneIndex().getPrim(primPath)

    if (prim.primType === HdPrimTypeTokens.renderSettings) {
      // Override to add the flattened hydra render settings data source and
      // dependencies for notice forwarding.
      return {
        primType: prim.primType,
        dataSource: _RenderSettingsPrimDataSource.new(
          prim.dataSource, this._getInputSceneIndex(), primPath),
      }
    }

    return prim
  }

  /** renderSettingsFlatteningSceneIndex.cpp:636-641 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** renderSettingsFlatteningSceneIndex.cpp:643-651 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    // Note: We could suppress notices that add renderProduct and renderVar
    //       prims here.
    this._sendPrimsAdded(entries)
  }

  /** renderSettingsFlatteningSceneIndex.cpp:653-667 */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    // Note: In USD, if a targeted prim (e.g., product or var) is removed,
    //       the relationship connections on the targeting prim (e.g. settings
    //       or product) aren't updated. So, when a product is removed, we won't
    //       receive a change notice that `products` under `__usdRenderSettings`
    //       has changed.
    //       XXX The dependency forwarding scene index doesn't handle this
    //       scenario yet. Update this comment once addressed.

    this._sendPrimsRemoved(entries)
  }

  /** renderSettingsFlatteningSceneIndex.cpp:669-679 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    // Nothing to do here since we rely on the dependency forwarding scene index
    // to flag the affected data source locator(s) on the flattened data
    // source.
    this._sendPrimsDirtied(entries)
  }
}
