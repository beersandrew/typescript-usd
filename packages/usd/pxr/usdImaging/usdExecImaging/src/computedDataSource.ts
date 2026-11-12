// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdExecImaging/computedDataSource.cpp,
//  pxr/usdImaging/usdExecImaging/computedDataSource.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/computedDataSource.{h,cpp}
// (OpenUSD 26.11.1).
//
// HdSampledDataSource::GetValue returns a VtValue upstream. In this hd port a
// typed data source's GetValue returns the plain value by default; these data
// sources return the VtValue the request accessor produced, as
// UsdImagingDataSourceAttribute does (usdImaging/src/dataSourceAttribute.ts).
//
// UsdExecImagingComputedTypedSampledDataSource<ValueType> takes the TfType of
// ValueType as its first New() argument (docs/openexec-x1.md 4.1, template
// value-type parameters). GetTypedValue extracts with VtValue::Get<ValueType>.
// Upstream's Get on an empty or mismatched VtValue posts the coding error
// below and returns a value-initialized ValueType (value.cpp:557-572); here
// the coding error is posted and then the call throws, since a fabricated
// value would draw silently wrong.

import { TypedSampledDataSource as HdTypedSampledDataSource, SampledDataSource as HdSampledDataSource } from 'typescript-usd/hd'
import { TF_CODING_ERROR, type Type as TfType } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  UsdExecImagingRequestAccessorInterface, type UsdExecImagingRequestAccessorInterfaceSharedPtr,
} from './requestAccessorInterface.ts'
import type { UsdExecImagingValueKey } from './valueKey.ts'

/** A stub implementation of UsdExecImagingRequestAccessorInterface that always
 *  produces empty values (computedDataSource.cpp:13-29).
 *
 *  This implementation is used when a client erroneously constructs a data
 *  source with a null request accessor. By using this stub implementation, the
 *  data sources can always dereference their request accessors without fear of
 *  dereferencing a null pointer. */
class _EmptyRequestAccessor extends UsdExecImagingRequestAccessorInterface {
  getComputedValue(_valueKey: UsdExecImagingValueKey): VtValue {
    return VtValue.getEmpty()
  }
}

/**
 * Common implementation for data sources that produce exec-computed values
 * (computedDataSource.h:20-44).
 *
 * This class is pseudo-private. Clients should not instantiate it directly.
 */
export class UsdExecImaging_ComputedDataSourceImpl {
  private readonly _requestAccessor: UsdExecImagingRequestAccessorInterface
  private readonly _valueKey: UsdExecImagingValueKey

  /** computedDataSource.cpp:33-45 */
  constructor(requestAccessor: UsdExecImagingRequestAccessorInterfaceSharedPtr, valueKey: UsdExecImagingValueKey) {
    if (!requestAccessor) {
      TF_CODING_ERROR(
        'UsdExecImaging data source constructed with null request ' +
        'accessor.')
    }
    this._requestAccessor = requestAccessor ?? new _EmptyRequestAccessor()
    this._valueKey = valueKey
  }

  /** computedDataSource.cpp:47-51 */
  GetValue(_shutterOffset: number): VtValue {
    return this._requestAccessor.getComputedValue(this._valueKey)
  }

  /** computedDataSource.cpp:53-60 */
  GetContributingSampleTimesForInterval(
    _startTime: number,
    _endTime: number,
    _outSampleTimes: number[],
  ): boolean {
    return false
  }
}

/**
 * An HdSampledDataSource that produces exec-computed values
 * (computedDataSource.h:46-78).
 *
 * The data source produces a computed value by reading it from a
 * UsdExecImagingRequestAccessorInterface specified in the constructor.
 */
export class UsdExecImagingComputedSampledDataSource extends HdSampledDataSource {
  private readonly _impl: UsdExecImaging_ComputedDataSourceImpl

  private constructor(requestAccessor: UsdExecImagingRequestAccessorInterfaceSharedPtr, valueKey: UsdExecImagingValueKey) {
    super()
    this._impl = new UsdExecImaging_ComputedDataSourceImpl(requestAccessor, valueKey)
  }

  /** HD_DECLARE_DATASOURCE New */
  static new(
    requestAccessor: UsdExecImagingRequestAccessorInterfaceSharedPtr, valueKey: UsdExecImagingValueKey,
  ): UsdExecImagingComputedSampledDataSource {
    return new UsdExecImagingComputedSampledDataSource(requestAccessor, valueKey)
  }

  GetValue(shutterOffset: number): VtValue {
    return this._impl.GetValue(shutterOffset)
  }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number, outSampleTimes: number[]): boolean {
    return this._impl.GetContributingSampleTimesForInterval(startTime, endTime, outSampleTimes)
  }
}

/**
 * An HdTypedSampledDataSource that produces exec-computed values
 * (computedDataSource.h:80-122).
 *
 * The data source produces a computed value by reading it from a
 * UsdExecImagingRequestAccessorInterface specified in the constructor.
 */
export class UsdExecImagingComputedTypedSampledDataSource<ValueType> extends HdTypedSampledDataSource<ValueType> {
  private readonly _valueType: TfType
  private readonly _impl: UsdExecImaging_ComputedDataSourceImpl

  private constructor(
    valueType: TfType,
    requestAccessor: UsdExecImagingRequestAccessorInterfaceSharedPtr,
    valueKey: UsdExecImagingValueKey,
  ) {
    super()
    this._valueType = valueType
    this._impl = new UsdExecImaging_ComputedDataSourceImpl(requestAccessor, valueKey)
  }

  /** HD_DECLARE_DATASOURCE New; valueType is the TfType of ValueType. */
  static new<ValueType>(
    valueType: TfType,
    requestAccessor: UsdExecImagingRequestAccessorInterfaceSharedPtr,
    valueKey: UsdExecImagingValueKey,
  ): UsdExecImagingComputedTypedSampledDataSource<ValueType> {
    return new UsdExecImagingComputedTypedSampledDataSource<ValueType>(valueType, requestAccessor, valueKey)
  }

  override GetValue(shutterOffset: number): VtValue {
    return this._impl.GetValue(shutterOffset)
  }

  getTypedValue(shutterOffset: number): ValueType {
    // _impl.GetValue(shutterOffset).template Get<ValueType>()
    // (computedDataSource.h:96-98).
    const value = this._impl.GetValue(shutterOffset)
    if (!value.IsHolding(this._valueType)) {
      // value.cpp:557-572 (VtValue::_FailGet).
      const typeName = this._valueType.getTypeName()
      const message = value.IsEmpty()
        ? `Attempted to get value of type '${typeName}' from empty VtValue.`
        : `Attempted to get value of type '${typeName}' from VtValue holding '${value.getTypeName()}'`
      TF_CODING_ERROR(message)
      throw new Error(message)
    }
    return value.Get<ValueType>()
  }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number, outSampleTimes: number[]): boolean {
    return this._impl.GetContributingSampleTimesForInterval(startTime, endTime, outSampleTimes)
  }
}
