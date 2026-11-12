// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dataSourceHash.cpp,
//  pxr/imaging/hd/dataSourceHash.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/dataSourceHash.{h,cpp} (OpenUSD 26.11.1).
//
// Sampled values: upstream appends the VtValue the _HashVisitor
// (dataSourceHash.cpp:52-123) returns, i.e. the size_t VtValue::GetHash()
// (hash_value(VtValue), value.h:1310-1312) of the value with TfToken and
// SdfPath values replaced by their std::string. TfToken and SdfPath values
// are already strings here (hashed as their string content), so _ValueHash
// below gives that code for values held raw or in a VtValue.

import { Tf_HashState, HashAsCStr as TfHashAsCStr } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  HdContainerDataSource,
  HdSampledDataSource,
  HdVectorDataSource,
  type HdDataSourceBase,
} from './dataSource.ts'

/** dataSourceHash.h:17 (size_t) */
export type HdDataSourceHashType = bigint

interface _Args {
  startTime: number
  endTime: number
}

/** TfHashAppend(_Pair<HdDataSourceBaseHandle>), dataSourceHash.cpp:136-153 */
function _AppendBase(h: Tf_HashState, ds: HdDataSourceBase, args: _Args): void {
  if (ds instanceof HdSampledDataSource) {
    _AppendSampled(h, ds, args)
  }
  if (ds instanceof HdVectorDataSource) {
    _AppendVector(h, ds, args)
  }
  if (ds instanceof HdContainerDataSource) {
    _AppendContainer(h, ds, args)
  }
}

/** VtValue(value).GetHash() (value.cpp: empty hashes as 0, otherwise
 *  TfHash()(held value)), appended as the size_t upstream's
 *  h.Append(VtVisitValue(...)) appends (dataSourceHash.cpp:159, 172). */
function _ValueHash(value: unknown): bigint {
  if (value instanceof VtValue) return value.getHash()
  if (value === undefined) return 0n
  const inner = new Tf_HashState()
  inner.append(value)
  return inner.getCode()
}

/** TfHashAppend(_Pair<HdSampledDataSourceHandle>), dataSourceHash.cpp:155-179 */
function _AppendSampled(h: Tf_HashState, ds: HdSampledDataSource, args: _Args): void {
  if (args.startTime === args.endTime) {
    h.append(_ValueHash(ds.GetValue(args.startTime)))
  } else {
    const sampleTimes: number[] = []
    ds.GetContributingSampleTimesForInterval(args.startTime, args.endTime, sampleTimes)
    if (sampleTimes.length === 0) {
      sampleTimes.push(args.startTime)
    }
    h.append(TfHashAsCStr('TSB'))
    for (const t of sampleTimes) {
      h.append(TfHashAsCStr('Time'))
      h.append(t)
      h.append(TfHashAsCStr('Value'))
      h.append(_ValueHash(ds.GetValue(t)))
    }
    h.append(TfHashAsCStr('TSE'))
  }
}

/** TfHashAppend(_Pair<HdVectorDataSourceHandle>), dataSourceHash.cpp:181-194 */
function _AppendVector(h: Tf_HashState, ds: HdVectorDataSource, args: _Args): void {
  const n = ds.getNumElements()
  h.append(TfHashAsCStr('VB'))
  for (let i = 0; i < n; ++i) {
    h.append(TfHashAsCStr('Element'))
    const childDs = ds.getElement(i)
    if (childDs) {
      _AppendBase(h, childDs, args)
    }
  }
  h.append(TfHashAsCStr('VE'))
}

/** TfHashAppend(_Pair<HdContainerDataSourceHandle>), dataSourceHash.cpp:196-213 */
function _AppendContainer(h: Tf_HashState, ds: HdContainerDataSource, args: _Args): void {
  const names = [...new Set(ds.getNames())].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
  h.append(TfHashAsCStr('CB'))
  for (const name of names) {
    const childDs = ds.Get(name)
    if (childDs) {
      h.append(TfHashAsCStr('Key'))
      // TfToken::Hash() includes a pointer address, so use the hash of
      // the string value instead.
      h.append(name)
      h.append(TfHashAsCStr('Value'))
      _AppendBase(h, childDs, args)
    }
  }
  h.append(TfHashAsCStr('CE'))
}

/**
 * Compute hash of a data source by using sampled from startTime to
 * endTime. dataSourceHash.h:19-33, dataSourceHash.cpp:215-220.
 *
 * Warning: this hash is not strong and is bad for fingerprinting
 * where the hash for two data sources being equal has to imply that
 * the two data sources have equal data with high probability.
 * The has is only 64bit and makes various performance tradeoffs
 * such that is suitable for a hashtable but not for fingerprinting.
 */
export function HdDataSourceHash(
  ds: HdDataSourceBase | undefined,
  startTime: number,
  endTime: number,
): HdDataSourceHashType {
  const h = new Tf_HashState()
  if (ds) {
    _AppendBase(h, ds, { startTime, endTime })
  }
  return h.getCode()
}
