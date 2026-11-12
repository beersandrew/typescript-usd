// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/rerootingContainerDataSource.cpp,
//  pxr/usdImaging/usdImaging/rerootingContainerDataSource.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/rerootingContainerDataSource.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence (type dispatch): upstream _RerootingCreateDataSource dispatches
// on the C++ data source type (HdTypedSampledDataSource<SdfPath>,
// <VtArray<SdfPath>>, <SdfPathExpression>). TypeScript generics are erased
// and SdfPath is a string in this port, so a sampled data source is
// classified by its value at shutter offset 0: an SdfPathExpression instance
// is a path expression, a string beginning with '/' is an SdfPath and an
// array (or VtArray) whose elements are all such strings is a path array.
// Tokens never begin with '/'; a std::string value beginning with '/' would
// be misclassified as a path (no upstream data source of that kind passes
// through the rerooting scene index in UsdImaging).

import {
  ContainerDataSource as HdContainerDataSource,
  SampledDataSource as HdSampledDataSource,
  TypedSampledDataSource as HdTypedSampledDataSource,
  VectorDataSource as HdVectorDataSource,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import { MapFunction as PcpMapFunction } from 'typescript-usd/pcp'
import { SdfPath } from 'typescript-usd/sdf/path'
import { SdfPathExpression } from 'typescript-usd/sdf/pathExpression'
import { Array as VtArray, Value as VtValue } from 'typescript-usd/vt'

/** PcpMapFunction::MapSourceToTarget on a string path; '' if not mapped. */
export function UsdImaging_MapSourceToTarget(mapFn: PcpMapFunction, path: string): string {
  if (!path) return ''
  const result = mapFn.mapSourceToTarget(SdfPath.fromString(path))
  return result.isEmpty() ? '' : result.pathString
}

/** PcpMapFunction::MapTargetToSource on a string path; '' if not mapped. */
export function UsdImaging_MapTargetToSource(mapFn: PcpMapFunction, path: string): string {
  if (!path) return ''
  const result = mapFn.mapTargetToSource(SdfPath.fromString(path))
  return result.isEmpty() ? '' : result.pathString
}

const _IsPathString = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/')

function _Unwrap(value: unknown): unknown {
  return value instanceof VtValue ? value.UncheckedGet<unknown>() : value
}

function _IsPathArray(value: unknown): boolean {
  if (value instanceof VtArray) {
    const n = value.size
    if (n === 0) return false
    for (let i = 0; i < n; ++i) {
      if (!_IsPathString(value.get(i))) return false
    }
    return true
  }
  return Array.isArray(value) && value.length > 0 && value.every(_IsPathString)
}

/** rerootingContainerDataSource.cpp:15-63 */
class _RerootingPathDataSource extends HdTypedSampledDataSource<string> {
  private constructor(
    private readonly _inputDataSource: HdSampledDataSource | undefined,
    private readonly _mapFn: PcpMapFunction,
  ) { super() }

  static new(inputDataSource: HdSampledDataSource | undefined, mapFn: PcpMapFunction): _RerootingPathDataSource {
    return new _RerootingPathDataSource(inputDataSource, mapFn)
  }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number, outSampleTimes: number[]): boolean {
    if (!this._inputDataSource) {
      return false
    }
    return this._inputDataSource.GetContributingSampleTimesForInterval(startTime, endTime, outSampleTimes)
  }

  getTypedValue(shutterOffset: number): string {
    if (!this._inputDataSource) {
      return ''
    }
    const srcPath = _Unwrap(this._inputDataSource.GetValue(shutterOffset))
    if (typeof srcPath !== 'string') return ''
    const targetPath = UsdImaging_MapSourceToTarget(this._mapFn, srcPath)
    // If the path is outside the mapping, this data source
    // implicitly leaves the path alone; it does not enforce
    // encapsulation in the way that USD composition arcs do.
    return targetPath === '' ? srcPath : targetPath
  }
}

/** rerootingContainerDataSource.cpp:67-117 */
class _RerootingPathArrayDataSource extends HdTypedSampledDataSource<unknown> {
  private constructor(
    private readonly _inputDataSource: HdSampledDataSource | undefined,
    private readonly _mapFn: PcpMapFunction,
  ) { super() }

  static new(inputDataSource: HdSampledDataSource | undefined, mapFn: PcpMapFunction): _RerootingPathArrayDataSource {
    return new _RerootingPathArrayDataSource(inputDataSource, mapFn)
  }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number, outSampleTimes: number[]): boolean {
    if (!this._inputDataSource) {
      return false
    }
    return this._inputDataSource.GetContributingSampleTimesForInterval(startTime, endTime, outSampleTimes)
  }

  /** Returns the same container kind as the input (VtArray or string[]). */
  getTypedValue(shutterOffset: number): unknown {
    if (!this._inputDataSource) {
      return []
    }
    const input = _Unwrap(this._inputDataSource.GetValue(shutterOffset))
    const map = (path: string): string => {
      const targetPath = UsdImaging_MapSourceToTarget(this._mapFn, path)
      return targetPath !== '' ? targetPath : path
    }
    if (input instanceof VtArray) {
      const result: string[] = []
      for (let i = 0; i < input.size; ++i) result.push(map(input.get(i) as string))
      return new VtArray<string>(result)
    }
    if (Array.isArray(input)) {
      return input.map(p => map(p as string))
    }
    return []
  }
}

/** rerootingContainerDataSource.cpp:121-170 */
class _RerootingPathExpressionDataSource extends HdTypedSampledDataSource<SdfPathExpression> {
  private constructor(
    private readonly _inputDataSource: HdSampledDataSource | undefined,
    private readonly _mapFn: PcpMapFunction,
  ) { super() }

  static new(inputDataSource: HdSampledDataSource | undefined, mapFn: PcpMapFunction): _RerootingPathExpressionDataSource {
    return new _RerootingPathExpressionDataSource(inputDataSource, mapFn)
  }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number, outSampleTimes: number[]): boolean {
    if (!this._inputDataSource) {
      return false
    }
    return this._inputDataSource.GetContributingSampleTimesForInterval(startTime, endTime, outSampleTimes)
  }

  getTypedValue(shutterOffset: number): SdfPathExpression {
    if (!this._inputDataSource) {
      return new SdfPathExpression()
    }
    const srcExpr = _Unwrap(this._inputDataSource.GetValue(shutterOffset))
    if (!(srcExpr instanceof SdfPathExpression)) return new SdfPathExpression()
    // Apply the path mapping to the expression. Iterate over each
    // source→target mapping and apply ReplacePrefix.
    let result = srcExpr
    for (const [src, tgt] of this._mapFn.getSourceToTargetMap()) {
      result = result.replacePrefix(SdfPath.fromString(src), SdfPath.fromString(tgt))
    }
    return result
  }
}

/** rerootingContainerDataSource.cpp:181-209 */
class _RerootingVectorDataSource extends HdVectorDataSource {
  private constructor(
    private readonly _inputDataSource: HdVectorDataSource,
    private readonly _mapFn: PcpMapFunction,
  ) { super() }

  static new(inputDataSource: HdVectorDataSource, mapFn: PcpMapFunction): _RerootingVectorDataSource {
    return new _RerootingVectorDataSource(inputDataSource, mapFn)
  }

  getNumElements(): number {
    return this._inputDataSource.getNumElements()
  }

  getElement(element: number): HdDataSourceBase | undefined {
    return _RerootingCreateDataSource(this._inputDataSource.getElement(element), this._mapFn)
  }
}

/** rerootingContainerDataSource.cpp:213-247 (see the file header for the
 *  type dispatch divergence). */
function _RerootingCreateDataSource(
  inputDataSource: HdDataSourceBase | undefined,
  mapFn: PcpMapFunction,
): HdDataSourceBase | undefined {
  if (!inputDataSource) {
    return undefined
  }
  if (inputDataSource instanceof HdContainerDataSource) {
    return UsdImagingRerootingContainerDataSource.new(inputDataSource, mapFn)
  }
  if (inputDataSource instanceof HdVectorDataSource) {
    return _RerootingVectorDataSource.new(inputDataSource, mapFn)
  }
  if (inputDataSource instanceof HdSampledDataSource) {
    const value = _Unwrap(inputDataSource.GetValue(0))
    if (_IsPathString(value)) {
      return _RerootingPathDataSource.new(inputDataSource, mapFn)
    }
    if (_IsPathArray(value)) {
      return _RerootingPathArrayDataSource.new(inputDataSource, mapFn)
    }
    if (value instanceof SdfPathExpression) {
      return _RerootingPathExpressionDataSource.new(inputDataSource, mapFn)
    }
  }
  return inputDataSource
}

/**
 * rerootingContainerDataSource.h:19-52, .cpp:251-296.
 *
 * Applies the given PcpMapFunction to data source in the given
 * container data source.
 */
export class UsdImagingRerootingContainerDataSource extends HdContainerDataSource {
  private readonly _mapFn: PcpMapFunction

  /** rerootingContainerDataSource.cpp:251-268 (both constructors). */
  private constructor(
    private readonly _inputDataSource: HdContainerDataSource | undefined,
    mapFnOrSrcPrefix: PcpMapFunction | string,
    dstPrefix?: string,
  ) {
    super()
    this._mapFn = mapFnOrSrcPrefix instanceof PcpMapFunction
      ? mapFnOrSrcPrefix
      : PcpMapFunction.create([[mapFnOrSrcPrefix, dstPrefix ?? '']])
  }

  static new(inputDataSource: HdContainerDataSource | undefined, mapFn: PcpMapFunction): UsdImagingRerootingContainerDataSource
  static new(inputDataSource: HdContainerDataSource | undefined, srcPrefix: string, dstPrefix: string): UsdImagingRerootingContainerDataSource
  static new(
    inputDataSource: HdContainerDataSource | undefined,
    mapFnOrSrcPrefix: PcpMapFunction | string,
    dstPrefix?: string,
  ): UsdImagingRerootingContainerDataSource {
    return new UsdImagingRerootingContainerDataSource(inputDataSource, mapFnOrSrcPrefix, dstPrefix)
  }

  /** rerootingContainerDataSource.cpp:273-281 */
  getNames(): string[] {
    if (!this._inputDataSource) {
      return []
    }
    return this._inputDataSource.getNames()
  }

  /** rerootingContainerDataSource.cpp:283-294 */
  Get(name: string): HdDataSourceBase | undefined {
    if (!this._inputDataSource) {
      return undefined
    }
    return _RerootingCreateDataSource(this._inputDataSource.Get(name), this._mapFn)
  }
}
