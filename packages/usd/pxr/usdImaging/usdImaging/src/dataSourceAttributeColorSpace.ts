// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceAttributeColorSpace.cpp,
//  pxr/usdImaging/usdImaging/dataSourceAttributeColorSpace.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceAttributeColorSpace.{h,cpp}
// (OpenUSD 26.11.1).

import { TokenDataSource as HdTokenDataSource } from 'typescript-usd/hd'
import { ColorSpaceAPI as UsdColorSpaceAPI, type Attribute as UsdAttribute } from 'typescript-usd/usd'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'

const _inputSourceColorSpace = 'inputs:sourceColorSpace'

/** dataSourceAttributeColorSpace.h:18-104. A data source that represents the
 *  metadata on a USD Attribute. */
export class UsdImagingDataSourceAttributeColorSpace extends HdTokenDataSource {
  /** dataSourceAttributeColorSpace.cpp:12-16. Constructs a new
   *  UsdImagingDataSourceAttributeColorSpace for the given usdAttr. */
  private constructor(private readonly _usdAttr: UsdAttribute) { super() }

  static new(usdAttr: UsdAttribute): UsdImagingDataSourceAttributeColorSpace {
    return new UsdImagingDataSourceAttributeColorSpace(usdAttr)
  }

  /** dataSourceAttributeColorSpace.h:30-35. Returns the VtValue of the
   *  colorspace for the attribute. */
  override GetValue(shutterOffset: number): VtValue {
    return VtValue.create(this.getTypedValue(shutterOffset), VtValueTypes.token)
  }

  /** dataSourceAttributeColorSpace.h:37-57. Returns the extracted TfToken
   *  value of the color space for the attribute. */
  getTypedValue(_shutterOffset: number): string {
    if (!this._usdAttr.isValid()) {
      return ''
    }

    // Special Case handling of UsdUVTexture Nodes which has an
    // 'inputs:sourceColorSpace' that we want to consolidate on the
    // 'inputs:file' parameter
    const sourceColorSpaceInput = this._getSourceColorSpaceInput()
    if (sourceColorSpaceInput !== '') {
      return sourceColorSpaceInput
    }

    // If there is no inputs:sourceColorSpace value authored, use the
    // ColorspaceAPI to find the resolved color space for the attribute.
    return UsdColorSpaceAPI.computeColorSpaceName(this._usdAttr)
  }

  /** dataSourceAttributeColorSpace.h:59-70. Returns false since we do not
   *  expect the color space value to vary over time. */
  GetContributingSampleTimesForInterval(
    _startTime: number, _endTime: number, _outSampleTimes: number[],
  ): boolean {
    return false
  }

  /** dataSourceAttributeColorSpace.h:80-99. Helper to get the TfToken
   *  authored to the 'inputs:sourceColorSpace' for the 'inputs:file'
   *  attribute. */
  private _getSourceColorSpaceInput(): string {
    // Only add add the source color space to the file attribute
    if (this._usdAttr.name !== 'inputs:file') {
      return ''
    }

    let sourceColorSpace = ''
    const prim = this._usdAttr.getStage().getPrim(this._usdAttr.primPath)
    if (prim?.hasAttribute(_inputSourceColorSpace)) {
      // VtValue sourceCSValue; ...Get(&sourceCSValue);
      // if (sourceCSValue.IsHolding<TfToken>())
      const attr = prim.getAttr(_inputSourceColorSpace)!
      const value = attr.get()
      if (typeof value === 'string' && attr.typeName === 'token') {
        sourceColorSpace = value
      }
    }
    return sourceColorSpace
  }
}
