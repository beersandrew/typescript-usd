// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceAttributeTypeName.cpp,
//  pxr/usdImaging/usdImaging/dataSourceAttributeTypeName.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceAttributeTypeName.{h,cpp}
// (OpenUSD 26.11.1).

import { TokenDataSource as HdTokenDataSource } from 'typescript-usd/hd'
import { findValueTypeName } from 'typescript-usd/sdf'
import type { Attribute as UsdAttribute } from 'typescript-usd/usd'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'

/** dataSourceAttributeTypeName.h:18-69. A data source that represents the
 *  type info on a USD Attribute. */
export class UsdImagingDataSourceAttributeTypeName extends HdTokenDataSource {
  /** dataSourceAttributeTypeName.cpp:12-16. Constructs a new
   *  UsdImagingDataSourceAttributeTypeName for the given usdAttr. */
  private constructor(private readonly _usdAttr: UsdAttribute) { super() }

  static new(usdAttr: UsdAttribute): UsdImagingDataSourceAttributeTypeName {
    return new UsdImagingDataSourceAttributeTypeName(usdAttr)
  }

  /** dataSourceAttributeTypeName.h:28-33. Returns the VtValue of the type
   *  info for the attribute. */
  override GetValue(shutterOffset: number): VtValue {
    return VtValue.create(this.getTypedValue(shutterOffset), VtValueTypes.token)
  }

  /** dataSourceAttributeTypeName.h:35-47. Returns the extracted TfToken
   *  value of the type info metadata on the attribute. */
  getTypedValue(_shutterOffset: number): string {
    if (!this._usdAttr.isValid()) {
      return ''
    }
    // We are using the GetAsToken() here since we do not expect an alias
    // other than the "official" type name.
    // (SdfValueTypeName::GetAsToken: the registered name of the type.)
    const typeName = this._usdAttr.typeName
    return findValueTypeName(typeName)?.name ?? typeName
  }

  /** dataSourceAttributeTypeName.h:49-60. Returns false since we do not
   *  expect the type info to vary over time. */
  GetContributingSampleTimesForInterval(
    _startTime: number, _endTime: number, _outSampleTimes: number[],
  ): boolean {
    return false
  }
}
