// Ported from OpenUSD 26.11.1: pxr/imaging/hd/retainedDataSource.cpp,
//  pxr/imaging/hd/retainedDataSource.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/retainedDataSource.{h,cpp} (OpenUSD 26.11.1):
// the type-erased retained sampled data source.
//
// HdRetainedContainerDataSource, HdRetainedTypedSampledDataSource and
// HdRetainedSmallVectorDataSource live in dataSource.ts (where this port
// first declared them) and are re-exported here under their upstream file.
//
// Divergence: HdSampledDataSource::GetValue returns VtValue upstream; in this
// port typed sampled data sources return their typed value from GetValue.
// HdRetainedSampledDataSource holds and returns a VtValue, as upstream.
// For the same reason HdMakeStaticCopy of a sampled data source whose GetValue
// returns a typed value retains that value with the source's Vt type instead
// of passing it through HdCreateTypedRetainedDataSource.

import { Value as VtValue } from 'typescript-usd/vt'
import {
  HdContainerDataSource,
  type HdDataSourceBase,
  HdRetainedContainerDataSource,
  HdRetainedSmallVectorDataSource,
  HdRetainedTypedSampledDataSource,
  HdSampledDataSource,
  HdVectorDataSource,
} from './dataSource.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

export {
  HdRetainedContainerDataSource,
  HdRetainedTypedSampledDataSource,
  HdRetainedSmallVectorDataSource,
} from './dataSource.ts'

/** retainedDataSource.h:114-143 */
export class HdRetainedSampledDataSource extends HdSampledDataSource {
  protected constructor(protected readonly _value: VtValue) { super() }

  static new(value: VtValue): HdRetainedSampledDataSource {
    return new HdRetainedSampledDataSource(value)
  }

  GetContributingSampleTimesForInterval(_startTime: number, _endTime: number,
    _outSampleTimes: number[]): boolean {
    return false
  }

  GetValue(_shutterOffset: number): VtValue {
    return this._value
  }
}

/** retainedDataSource.cpp:355-401 HdCreateTypedRetainedDataSource: a typed
 *  retained data source holding the VtValue's held object; nullptr when the
 *  value is empty. The Vt type is kept with the value (see
 *  HdRetainedTypedSampledDataSource.valueType). */
export function HdCreateTypedRetainedDataSource(v: VtValue): HdSampledDataSource | undefined {
  if (!(v instanceof VtValue)) {
    return v === undefined ? undefined : HdRetainedTypedSampledDataSource.new(v as unknown)
  }
  if (v.IsEmpty()) {
    return undefined
  }
  return new HdRetainedTypedSampledDataSource(v.UncheckedGet<unknown>(), v.getType())
}

/** retainedDataSource.cpp:419-424 */
function _MakeStaticCopySampled(ds: HdSampledDataSource): HdSampledDataSource | undefined {
  const value = ds.GetValue(0.0)
  if (value instanceof VtValue) {
    return HdCreateTypedRetainedDataSource(value)
  }
  // Divergence (see the top of this file): a typed sampled data source
  // returns its typed value; it is retained with the source's Vt type.
  if (value === undefined) {
    return undefined
  }
  return new HdRetainedTypedSampledDataSource(value, (ds as { valueType?: unknown }).valueType)
}

/** retainedDataSource.cpp:426-438 */
function _MakeStaticCopyVector(ds: HdVectorDataSource): HdVectorDataSource {
  const n = ds.getNumElements()
  const values: HdDataSourceBase[] = []
  for (let i = 0; i < n; ++i) {
    values.push(HdMakeStaticCopy(ds.getElement(i))!)
  }
  return HdRetainedSmallVectorDataSource.new(values)
}

/** retainedDataSource.cpp:440-476 HdMakeStaticCopy: a deep copy of a data
 *  source into retained data sources, sampled at shutter offset 0. */
export function HdMakeStaticCopy(ds: HdContainerDataSource | undefined): HdContainerDataSource | undefined
export function HdMakeStaticCopy(ds: HdDataSourceBase | undefined): HdDataSourceBase | undefined
export function HdMakeStaticCopy(ds: HdDataSourceBase | undefined): HdDataSourceBase | undefined {
  if (!ds) {
    return undefined
  }
  if (ds instanceof HdContainerDataSource) {
    const names = ds.getNames()
    const items: HdDataSourceBase[] = []
    for (const name of names) {
      items.push(HdMakeStaticCopy(ds.Get(name))!)
    }
    return HdRetainedContainerDataSource.new(names, items)
  }
  if (ds instanceof HdVectorDataSource) {
    return _MakeStaticCopyVector(ds)
  }
  if (ds instanceof HdSampledDataSource) {
    return _MakeStaticCopySampled(ds)
  }
  TF_CODING_ERROR('Unsupported data source type')
  return undefined
}
