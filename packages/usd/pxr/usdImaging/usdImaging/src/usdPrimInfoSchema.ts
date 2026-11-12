// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/usdPrimInfoSchema.cpp,
//  pxr/usdImaging/usdImaging/usdPrimInfoSchema.h,
//  pxr/usdImaging/usdImaging/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/usdPrimInfoSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the UsdPrimInfo entry of pxr/usdImaging/usdImaging/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. The custom code sections
// and the STATIC_TOKEN_DATASOURCE_BUILDERS method are ported by hand.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { ContainerDataSource as HdContainerDataSource, DataSourceLocator as HdDataSourceLocator, Schema as HdSchema, _HdBuildRetained, ContainerOfTypedSampledDataSourcesSchema as HdContainerOfTypedSampledDataSourcesSchema, RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource, type BoolDataSource as HdBoolDataSource, type PathDataSource as HdPathDataSource, type TokenArrayDataSource as HdTokenArrayDataSource, type TokenDataSource as HdTokenDataSource } from 'typescript-usd/hd'

// --(BEGIN CUSTOM CODE: Declares)--
/** usdPrimInfoSchema.h:33-34 */
export type HdTokenDataSourceContainerSchema =
  HdContainerOfTypedSampledDataSourcesSchema<HdTokenDataSource>
// --(END CUSTOM CODE: Declares)--

/** usdPrimInfoSchema.h TF_DECLARE_PUBLIC_TOKENS(UsdImagingUsdPrimInfoSchemaTokens) */
export const UsdImagingUsdPrimInfoSchemaTokens = TfMakeTokens({
  __usdPrimInfo: '__usdPrimInfo',
  specifier: 'specifier',
  typeName: 'typeName',
  isLoaded: 'isLoaded',
  apiSchemas: 'apiSchemas',
  kind: 'kind',
  variantSelections: 'variantSelections',
  niPrototypePath: 'niPrototypePath',
  isNiPrototype: 'isNiPrototype',
  piPropagatedPrototypes: 'piPropagatedPrototypes',
  def: 'def',
  over: 'over',
  class_: 'class',
})

export class UsdImagingUsdPrimInfoSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** usdPrimInfoSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): UsdImagingUsdPrimInfoSchema {
    const ds = fromParentContainer?.Get(UsdImagingUsdPrimInfoSchemaTokens.__usdPrimInfo)
    return new UsdImagingUsdPrimInfoSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getSpecifier(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdPrimInfoSchemaTokens.specifier)
  }

  getTypeName(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdPrimInfoSchemaTokens.typeName)
  }

  getIsLoaded(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdImagingUsdPrimInfoSchemaTokens.isLoaded)
  }

  getApiSchemas(): HdTokenArrayDataSource | undefined {
    return this._getTypedDataSource<HdTokenArrayDataSource>(UsdImagingUsdPrimInfoSchemaTokens.apiSchemas)
  }

  getKind(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(UsdImagingUsdPrimInfoSchemaTokens.kind)
  }

  /** usdPrimInfoSchema.cpp GetVariantSelections */
  getVariantSelections(): HdTokenDataSourceContainerSchema {
    return new HdContainerOfTypedSampledDataSourcesSchema<HdTokenDataSource>(
      this._getContainerDataSource(UsdImagingUsdPrimInfoSchemaTokens.variantSelections))
  }

  getNiPrototypePath(): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(UsdImagingUsdPrimInfoSchemaTokens.niPrototypePath)
  }

  getIsNiPrototype(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(UsdImagingUsdPrimInfoSchemaTokens.isNiPrototype)
  }

  getPiPropagatedPrototypes(): HdContainerDataSource | undefined {
    return this._getContainerDataSource(UsdImagingUsdPrimInfoSchemaTokens.piPropagatedPrototypes)
  }

  static getSchemaToken(): TfToken {
    return UsdImagingUsdPrimInfoSchemaTokens.__usdPrimInfo
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return UsdImagingUsdPrimInfoSchema._defaultLocator ??= new HdDataSourceLocator(UsdImagingUsdPrimInfoSchema.getSchemaToken())
  }

  private static _niPrototypePathLocator: HdDataSourceLocator | undefined
  static getNiPrototypePathLocator(): HdDataSourceLocator {
    return UsdImagingUsdPrimInfoSchema._niPrototypePathLocator ??= UsdImagingUsdPrimInfoSchema.getDefaultLocator().append(UsdImagingUsdPrimInfoSchemaTokens.niPrototypePath)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    specifier?: HdTokenDataSource | undefined,
    typeName?: HdTokenDataSource | undefined,
    isLoaded?: HdBoolDataSource | undefined,
    apiSchemas?: HdTokenArrayDataSource | undefined,
    kind?: HdTokenDataSource | undefined,
    variantSelections?: HdContainerDataSource | undefined,
    niPrototypePath?: HdPathDataSource | undefined,
    isNiPrototype?: HdBoolDataSource | undefined,
    piPropagatedPrototypes?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [UsdImagingUsdPrimInfoSchemaTokens.specifier]: specifier,
      [UsdImagingUsdPrimInfoSchemaTokens.typeName]: typeName,
      [UsdImagingUsdPrimInfoSchemaTokens.isLoaded]: isLoaded,
      [UsdImagingUsdPrimInfoSchemaTokens.apiSchemas]: apiSchemas,
      [UsdImagingUsdPrimInfoSchemaTokens.kind]: kind,
      [UsdImagingUsdPrimInfoSchemaTokens.variantSelections]: variantSelections,
      [UsdImagingUsdPrimInfoSchemaTokens.niPrototypePath]: niPrototypePath,
      [UsdImagingUsdPrimInfoSchemaTokens.isNiPrototype]: isNiPrototype,
      [UsdImagingUsdPrimInfoSchemaTokens.piPropagatedPrototypes]: piPropagatedPrototypes,
    })
  }

  private static _specifierDataSources: Map<string, HdTokenDataSource> | undefined
  /** usdPrimInfoSchema.cpp BuildSpecifierDataSource: returns token data
   *  source for use as specifier value. The values def, over, class_ are
   *  stored statically and reused for future calls. */
  static buildSpecifierDataSource(specifier: string): HdTokenDataSource {
    const known: readonly string[] = [UsdImagingUsdPrimInfoSchemaTokens.def, UsdImagingUsdPrimInfoSchemaTokens.over, UsdImagingUsdPrimInfoSchemaTokens.class_]
    if (known.includes(specifier)) {
      const cache = UsdImagingUsdPrimInfoSchema._specifierDataSources ??= new Map()
      let ds = cache.get(specifier)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(specifier)
        cache.set(specifier, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(specifier)
  }
}

export namespace UsdImagingUsdPrimInfoSchema {
  /** UsdImagingUsdPrimInfoSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _specifier: HdTokenDataSource | undefined
    private _typeName: HdTokenDataSource | undefined
    private _isLoaded: HdBoolDataSource | undefined
    private _apiSchemas: HdTokenArrayDataSource | undefined
    private _kind: HdTokenDataSource | undefined
    private _variantSelections: HdContainerDataSource | undefined
    private _niPrototypePath: HdPathDataSource | undefined
    private _isNiPrototype: HdBoolDataSource | undefined
    private _piPropagatedPrototypes: HdContainerDataSource | undefined
    setSpecifier(specifier: HdTokenDataSource | undefined): this {
      this._specifier = specifier
      return this
    }
    setTypeName(typeName: HdTokenDataSource | undefined): this {
      this._typeName = typeName
      return this
    }
    setIsLoaded(isLoaded: HdBoolDataSource | undefined): this {
      this._isLoaded = isLoaded
      return this
    }
    setApiSchemas(apiSchemas: HdTokenArrayDataSource | undefined): this {
      this._apiSchemas = apiSchemas
      return this
    }
    setKind(kind: HdTokenDataSource | undefined): this {
      this._kind = kind
      return this
    }
    setVariantSelections(variantSelections: HdContainerDataSource | undefined): this {
      this._variantSelections = variantSelections
      return this
    }
    setNiPrototypePath(niPrototypePath: HdPathDataSource | undefined): this {
      this._niPrototypePath = niPrototypePath
      return this
    }
    setIsNiPrototype(isNiPrototype: HdBoolDataSource | undefined): this {
      this._isNiPrototype = isNiPrototype
      return this
    }
    setPiPropagatedPrototypes(piPropagatedPrototypes: HdContainerDataSource | undefined): this {
      this._piPropagatedPrototypes = piPropagatedPrototypes
      return this
    }
    build(): HdContainerDataSource {
      return UsdImagingUsdPrimInfoSchema.buildRetained(
        this._specifier,
        this._typeName,
        this._isLoaded,
        this._apiSchemas,
        this._kind,
        this._variantSelections,
        this._niPrototypePath,
        this._isNiPrototype,
        this._piPropagatedPrototypes,
      )
    }
  }
}
