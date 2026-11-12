// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceRelationship.cpp,
//  pxr/usdImaging/usdImaging/dataSourceRelationship.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceRelationship.{h,cpp}
// (OpenUSD 26.11.1).
//
// SdfPath values are strings in this port; the VtArray<SdfPath> carries the
// SdfPath TfType so GetValue gives the VtValue upstream's
// `VtValue(GetTypedValue(...))` holds.

import { TypedSampledDataSource as HdTypedSampledDataSource } from 'typescript-usd/hd'
import { Type as TfType } from 'typescript-usd/tf'
import type { Rel as UsdRelationship } from 'typescript-usd/usd'
import { Array as VtArray, Value as VtValue } from 'typescript-usd/vt'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'

const _SdfPathType = TfType.declare('SdfPath')

/** dataSourceRelationship.h:18-62: a data source that represents a USD
 *  relationship. */
export class UsdImagingDataSourceRelationship extends HdTypedSampledDataSource<VtArray<string>> {
  /** dataSourceRelationship.cpp:11-16. Constructs a new
   *  UsdImagingDataSourceRelationship for the given `usdRel`.
   *  `stageGlobals` represents the context object for the UsdStage with
   *  which to evaluate this relationship. */
  private constructor(
    private readonly _usdRel: UsdRelationship,
    // Unused upstream as well (dataSourceRelationship.h:60).
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    usdRel: UsdRelationship, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceRelationship {
    return new UsdImagingDataSourceRelationship(usdRel, stageGlobals)
  }

  /** dataSourceRelationship.cpp:18-23: returns the extracted path array
   *  value of the attribute, as a VtValue. `shutterOffset` is ignored. */
  override GetValue(shutterOffset: number): VtValue {
    return VtValue.createArray(this.getTypedValue(shutterOffset))
  }

  /** dataSourceRelationship.cpp:25-33: returns the extracted path array
   *  value of the attribute. `shutterOffset` is ignored. */
  getTypedValue(_shutterOffset: number): VtArray<string> {
    const paths = this._usdRel.getForwardedTargets()
    const vtPaths = new VtArray<string>(paths, _SdfPathType)
    return vtPaths
  }

  /** dataSourceRelationship.cpp:35-43: returns false indicating USD
   *  relationships cannot vary with time. */
  GetContributingSampleTimesForInterval(
    _startTime: number, _endTime: number, _outSampleTimes: number[],
  ): boolean {
    // Relationships are constant across time in USD.
    return false
  }
}
