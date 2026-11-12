// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/dataSourcePrimvar.cpp,
//  pxr/usdImaging/usdSkelImaging/dataSourcePrimvar.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/dataSourcePrimvar.{h,cpp}
// (OpenUSD 26.11.1).

import {
  ContainerDataSource as HdContainerDataSource, PrimvarSchema as HdPrimvarSchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens, type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'

/** dataSourcePrimvar.h:19-42. A primvar data source for UsdSkel's skinning
 *  primvars. */
export class UsdSkelImaging_DataSourcePrimvar extends HdContainerDataSource {
  /** dataSourcePrimvar.cpp:37-43 */
  private constructor(
    private readonly _valueSource: HdDataSourceBase | undefined,
    private readonly _interpolation: string = HdPrimvarSchemaTokens.constant,
    private readonly _role: string = '',
  ) { super() }

  /** HD_DECLARE_DATASOURCE New */
  static new(
    valueSource: HdDataSourceBase | undefined,
    interpolation: string = HdPrimvarSchemaTokens.constant,
    role = '',
  ): UsdSkelImaging_DataSourcePrimvar {
    return new UsdSkelImaging_DataSourcePrimvar(valueSource, interpolation, role)
  }

  /** dataSourcePrimvar.cpp:11-19 */
  getNames(): string[] {
    return [
      HdPrimvarSchemaTokens.primvarValue,
      HdPrimvarSchemaTokens.interpolation,
      HdPrimvarSchemaTokens.role]
  }

  /** dataSourcePrimvar.cpp:21-34 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdPrimvarSchemaTokens.primvarValue) {
      return this._valueSource
    }
    if (name === HdPrimvarSchemaTokens.interpolation) {
      return HdPrimvarSchema.buildInterpolationDataSource(this._interpolation)
    }
    if (name === HdPrimvarSchemaTokens.role) {
      return HdPrimvarSchema.buildRoleDataSource(this._role)
    }
    return undefined
  }
}
