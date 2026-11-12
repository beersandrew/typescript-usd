// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceUsdPrimInfo.cpp,
//  pxr/usdImaging/usdImaging/dataSourceUsdPrimInfo.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceUsdPrimInfo.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import { Type as TfType } from 'typescript-usd/tf'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { PrimAPI as UsdHydraPrimAPI } from 'typescript-usd/usdHydra'
import { Array as VtArray } from 'typescript-usd/vt'
import { UsdImagingUsdPrimInfoSchemaTokens } from './usdPrimInfoSchema.ts'

const _TfTokenType = TfType.declare('token')
const _SdfPathType = TfType.declare('SdfPath')

type _Specifier = 'def' | 'over' | 'class'

let _specifierDataSources: Record<_Specifier, HdDataSourceBase> | undefined

/** dataSourceUsdPrimInfo.cpp:27-60 */
function _SpecifierToDataSource(specifier: _Specifier): HdDataSourceBase | undefined {
  const dataSources = _specifierDataSources ??= {
    def: new HdRetainedTypedSampledDataSource<string>(UsdImagingUsdPrimInfoSchemaTokens.def, _TfTokenType),
    over: new HdRetainedTypedSampledDataSource<string>(UsdImagingUsdPrimInfoSchemaTokens.over, _TfTokenType),
    class: new HdRetainedTypedSampledDataSource<string>(UsdImagingUsdPrimInfoSchemaTokens.class_, _TfTokenType),
  }

  switch (specifier) {
    case 'def':
      return dataSources.def
    case 'over':
      return dataSources.over
    case 'class':
      return dataSources.class
  }

  return undefined
}

/** dataSourceUsdPrimInfo.h:15-34: a container data source containing
 *  metadata such as the specifier of a prim of native instancing
 *  information. */
export class UsdImagingDataSourceUsdPrimInfo extends HdContainerDataSource {
  /** dataSourceUsdPrimInfo.cpp:19-23 */
  private constructor(private readonly _usdPrim: UsdPrim) { super() }

  static new(usdPrim: UsdPrim): UsdImagingDataSourceUsdPrimInfo {
    return new UsdImagingDataSourceUsdPrimInfo(usdPrim)
  }

  /** dataSourceUsdPrimInfo.cpp:62-85 */
  getNames(): string[] {
    const result: string[] = [
      UsdImagingUsdPrimInfoSchemaTokens.specifier,
      UsdImagingUsdPrimInfoSchemaTokens.typeName,
      UsdImagingUsdPrimInfoSchemaTokens.isLoaded,
      UsdImagingUsdPrimInfoSchemaTokens.apiSchemas,
      UsdImagingUsdPrimInfoSchemaTokens.kind,
      UsdImagingUsdPrimInfoSchemaTokens.variantSelections,
    ]

    // If an instance is tagged for expansion, don't provide niPrototypePath.
    if (this._usdPrim.isInstance()
      && !UsdHydraPrimAPI.shouldExpandInstancesForPrim(this._usdPrim)) {
      result.push(UsdImagingUsdPrimInfoSchemaTokens.niPrototypePath)
    }

    if (this._usdPrim.isPrototype()) {
      result.push(UsdImagingUsdPrimInfoSchemaTokens.isNiPrototype)
    }

    return result
  }

  /** dataSourceUsdPrimInfo.cpp:87-155 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdImagingUsdPrimInfoSchemaTokens.specifier) {
      return _SpecifierToDataSource(this._usdPrim.getSpecifier())
    }
    if (name === UsdImagingUsdPrimInfoSchemaTokens.typeName) {
      return new HdRetainedTypedSampledDataSource<string>(this._usdPrim.typeName, _TfTokenType)
    }
    if (name === UsdImagingUsdPrimInfoSchemaTokens.isLoaded) {
      return HdRetainedTypedSampledDataSource.new<boolean>(this._usdPrim.isLoaded)
    }
    if (name === UsdImagingUsdPrimInfoSchemaTokens.apiSchemas) {
      const appliedSchemas = this._usdPrim.getAppliedSchemas()
      if (appliedSchemas.length !== 0) {
        return HdRetainedTypedSampledDataSource.new<VtArray<string>>(
          new VtArray<string>(appliedSchemas, _TfTokenType))
      }
      return undefined
    }
    if (name === UsdImagingUsdPrimInfoSchemaTokens.kind) {
      // UsdPrim::GetKind(TfToken*) (prim.h:300-305) reports whether the
      // kind metadata has a value.
      const kind = this._usdPrim.getMetadata('kind')
      if (typeof kind === 'string') {
        return new HdRetainedTypedSampledDataSource<string>(kind, _TfTokenType)
      }
      return undefined
    }
    if (name === UsdImagingUsdPrimInfoSchemaTokens.variantSelections) {
      // std::map<std::string, std::string>: ordered by set name.
      const sels = this._usdPrim.getVariantSets().getAllVariantSelections()
      const setNames = Object.keys(sels).sort()
      if (setNames.length === 0) {
        return undefined
      }
      const names: string[] = []
      const values: HdDataSourceBase[] = []
      for (const setName of setNames) {
        names.push(setName)
        values.push(new HdRetainedTypedSampledDataSource<string>(sels[setName]!, _TfTokenType))
      }
      return HdRetainedContainerDataSource.new(names, values)
    }
    if (name === UsdImagingUsdPrimInfoSchemaTokens.niPrototypePath) {
      if (!this._usdPrim.isInstance()
        || UsdHydraPrimAPI.shouldExpandInstancesForPrim(this._usdPrim)) {
        return undefined
      }
      const prototype = this._usdPrim.getPrototype()
      if (!prototype?.isValid()) {
        return undefined
      }
      return new HdRetainedTypedSampledDataSource<string>(prototype.path, _SdfPathType)
    }
    if (name === UsdImagingUsdPrimInfoSchemaTokens.isNiPrototype) {
      if (!this._usdPrim.isPrototype()) {
        return undefined
      }
      return HdRetainedTypedSampledDataSource.new<boolean>(true)
    }
    return undefined
  }
}
