// Ported from OpenUSD 26.11.1: pxr/imaging/hd/primvarSchema.cpp,
//  pxr/imaging/hd/primvarSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/primvarSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Primvar entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream primvarSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue } from 'typescript-usd/vt'
import { HdContainerDataSource, HdRetainedTypedSampledDataSource, HdSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdIntArrayDataSource, HdIntDataSource, HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { TF_WARN } from './tfDiagnostic.ts'

// --(BEGIN CUSTOM CODE: Declares)--
// primvarSchema.cpp anonymous namespace: _ComputeFlattened /
// _ComputeFlattenedValue / _HdDataSourceFlattenedPrimvarValue.

function _indicesArray(v: unknown): readonly number[] {
  // A data source's GetValue may return the VtValue holding the VtIntArray
  // (UsdImagingDataSourceAttribute does, as upstream GetValue always does).
  if (v instanceof VtValue) v = v.IsEmpty() ? undefined : v.Get()
  if (Array.isArray(v)) return v as number[]
  const a = v as { toArray?: () => number[] } | undefined
  return a?.toArray ? a.toArray() : []
}

// Divergence: upstream visits VtValue holding VtArray<T>. This port's typed
// data sources may also return a plain JS array (not a VtValue); those are
// flattened element-wise and returned as a plain array.
function _computeFlattenedValue(value: unknown, indices: readonly number[]): unknown {
  if (value instanceof VtValue) {
    if (!value.isArrayValued()) {
      TF_WARN('Unsupported indexed primvar type')
      return value
    }
    if (indices.length === 0) return value
    const array = value.Get<VtArray<unknown>>()
    const elemType = value.getElementType()
    const fallback = VtArray.ofSize<unknown>(1, elemType).get(0)
    const out: unknown[] = new Array(indices.length)
    let invalidIndices = false
    for (let i = 0; i < indices.length; ++i) {
      const index = indices[i]!
      if (index >= 0 && index < array.size) out[i] = array.get(index)
      else { out[i] = fallback; invalidIndices = true }
    }
    if (invalidIndices) TF_WARN('Invalid primvar indices')
    return VtValue.createArray(new VtArray<unknown>(out, elemType))
  }
  if (Array.isArray(value)) {
    if (indices.length === 0) return value
    let invalidIndices = false
    const out = indices.map(index => {
      if (index >= 0 && index < value.length) return value[index]
      invalidIndices = true
      return undefined
    })
    if (invalidIndices) TF_WARN('Invalid primvar indices')
    return out
  }
  TF_WARN('Unsupported indexed primvar type')
  return value
}

class _HdDataSourceFlattenedPrimvarValue extends HdSampledDataSource {
  constructor(
    private readonly _indexedValue: HdSampledDataSource,
    private readonly _indices: HdSampledDataSource,
  ) { super() }

  static new(indexedValue: HdSampledDataSource, indices: HdSampledDataSource) {
    return new _HdDataSourceFlattenedPrimvarValue(indexedValue, indices)
  }

  GetValue(shutterOffset: number): unknown {
    const indexedValue = this._indexedValue.GetValue(shutterOffset)
    const indices = _indicesArray(this._indices.GetValue(shutterOffset))
    return _computeFlattenedValue(indexedValue, indices)
  }

  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    // HdGetMergedContributingSampleTimesForInterval over both inputs.
    const times = new Set<number>()
    let varying = false
    for (const ds of [this._indexedValue, this._indices]) {
      const t: number[] = []
      if (ds.GetContributingSampleTimesForInterval(startTime, endTime, t)) {
        varying = true
        for (const x of t) times.add(x)
      }
    }
    if (varying) outSampleTimes.splice(0, outSampleTimes.length,
      ...[...times].sort((a, b) => a - b))
    return varying
  }
}
// --(END CUSTOM CODE: Declares)--

/** primvarSchema.h TF_DECLARE_PUBLIC_TOKENS(HdPrimvarSchemaTokens) */
export const HdPrimvarSchemaTokens = TfMakeTokens({
  primvarValue: 'primvarValue',
  indexedPrimvarValue: 'indexedPrimvarValue',
  indices: 'indices',
  interpolation: 'interpolation',
  role: 'role',
  colorSpace: 'colorSpace',
  elementSize: 'elementSize',
  transform: 'transform',
  constant: 'constant',
  uniform: 'uniform',
  varying: 'varying',
  vertex: 'vertex',
  faceVarying: 'faceVarying',
  instance: 'instance',
  point: 'point',
  normal: 'normal',
  vector: 'vector',
  color: 'color',
  pointIndex: 'pointIndex',
  edgeIndex: 'edgeIndex',
  faceIndex: 'faceIndex',
  textureCoordinate: 'textureCoordinate',
})

export class HdPrimvarSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  /** primvarSchema.cpp IsIndexed: true if it contains data sources for an
   * indexed primvar value and for indices. */
  isIndexed(): boolean {
    if (this._container) {
      return !!(this._container.Get(HdPrimvarSchemaTokens.indexedPrimvarValue) &&
        this._container.Get(HdPrimvarSchemaTokens.indices))
    }
    return false
  }

  /** primvarSchema.cpp GetPrimvarValue: if the primvar does not have indices,
   * GetPrimvarValue() and GetIndexedPrimvarValue() return the same thing; if
   * it has indices, GetPrimvarValue() returns the flattened value. */
  getPrimvarValue(): HdSampledDataSource | undefined {
    if (this._container) {
      const sds = this._getTypedDataSource(HdPrimvarSchemaTokens.primvarValue)
      if (sds) return sds
      const ivds = this._getTypedDataSource(HdPrimvarSchemaTokens.indexedPrimvarValue)
      const ids = this._getTypedDataSource(HdPrimvarSchemaTokens.indices)
      if (ivds && ids) return _HdDataSourceFlattenedPrimvarValue.new(ivds, ids)
    }
    return undefined
  }

  /** primvarSchema.cpp GetIndexedPrimvarValue */
  getIndexedPrimvarValue(): HdSampledDataSource | undefined {
    if (this.isIndexed()) {
      return this._getTypedDataSource(HdPrimvarSchemaTokens.indexedPrimvarValue)
    }
    return this._getTypedDataSource(HdPrimvarSchemaTokens.primvarValue)
  }

  /** primvarSchema.cpp GetFlattenedPrimvarValue */
  getFlattenedPrimvarValue(): HdSampledDataSource | undefined {
    if (!this._container) return undefined
    const sds = this._getTypedDataSource(HdPrimvarSchemaTokens.primvarValue)
    if (sds) return sds  // Non-indexed case.
    // Indexed case, we need to flatten.
    const ivds = this._getTypedDataSource(HdPrimvarSchemaTokens.indexedPrimvarValue)
    if (!ivds) return undefined
    const ids = this._getTypedDataSource(HdPrimvarSchemaTokens.indices)
    if (!ids) return undefined
    return _HdDataSourceFlattenedPrimvarValue.new(ivds, ids)
  }
  // --(END CUSTOM CODE: Schema Methods)--

  getIndices(): HdIntArrayDataSource | undefined {
    return this._getTypedDataSource<HdIntArrayDataSource>(HdPrimvarSchemaTokens.indices)
  }

  getInterpolation(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdPrimvarSchemaTokens.interpolation)
  }

  getRole(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdPrimvarSchemaTokens.role)
  }

  getColorSpace(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdPrimvarSchemaTokens.colorSpace)
  }

  /**
   * The number of values in the value array that must be aggregated for each
   * element on the the primitive (same as UsdGeomPrimvar).
   */
  getElementSize(): HdIntDataSource | undefined {
    return this._getTypedDataSource<HdIntDataSource>(HdPrimvarSchemaTokens.elementSize)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    primvarValue?: HdSampledDataSource | undefined,
    indexedPrimvarValue?: HdSampledDataSource | undefined,
    indices?: HdIntArrayDataSource | undefined,
    interpolation?: HdTokenDataSource | undefined,
    role?: HdTokenDataSource | undefined,
    colorSpace?: HdTokenDataSource | undefined,
    elementSize?: HdIntDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdPrimvarSchemaTokens.primvarValue]: primvarValue,
      [HdPrimvarSchemaTokens.indexedPrimvarValue]: indexedPrimvarValue,
      [HdPrimvarSchemaTokens.indices]: indices,
      [HdPrimvarSchemaTokens.interpolation]: interpolation,
      [HdPrimvarSchemaTokens.role]: role,
      [HdPrimvarSchemaTokens.colorSpace]: colorSpace,
      [HdPrimvarSchemaTokens.elementSize]: elementSize,
    })
  }

  private static _interpolationDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as interpolation value; the values
   * constant, uniform, varying, vertex, faceVarying, instance are stored statically and reused. */
  static buildInterpolationDataSource(interpolation: string): HdTokenDataSource {
    const known: readonly string[] = [HdPrimvarSchemaTokens.constant, HdPrimvarSchemaTokens.uniform, HdPrimvarSchemaTokens.varying, HdPrimvarSchemaTokens.vertex, HdPrimvarSchemaTokens.faceVarying, HdPrimvarSchemaTokens.instance]
    if (known.includes(interpolation)) {
      const cache = HdPrimvarSchema._interpolationDataSources ??= new Map()
      let ds = cache.get(interpolation)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(interpolation)
        cache.set(interpolation, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(interpolation)
  }

  private static _roleDataSources: Map<string, HdTokenDataSource> | undefined
  /** Returns token data source for use as role value; the values
   * point, normal, vector, color, pointIndex, edgeIndex, faceIndex, textureCoordinate are stored statically and reused. */
  static buildRoleDataSource(role: string): HdTokenDataSource {
    const known: readonly string[] = [HdPrimvarSchemaTokens.point, HdPrimvarSchemaTokens.normal, HdPrimvarSchemaTokens.vector, HdPrimvarSchemaTokens.color, HdPrimvarSchemaTokens.pointIndex, HdPrimvarSchemaTokens.edgeIndex, HdPrimvarSchemaTokens.faceIndex, HdPrimvarSchemaTokens.textureCoordinate]
    if (known.includes(role)) {
      const cache = HdPrimvarSchema._roleDataSources ??= new Map()
      let ds = cache.get(role)
      if (!ds) {
        ds = HdRetainedTypedSampledDataSource.new<string>(role)
        cache.set(role, ds)
      }
      return ds
    }
    // fallback for unknown token
    return HdRetainedTypedSampledDataSource.new<string>(role)
  }
}

export namespace HdPrimvarSchema {
  /** HdPrimvarSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _primvarValue: HdSampledDataSource | undefined
    private _indexedPrimvarValue: HdSampledDataSource | undefined
    private _indices: HdIntArrayDataSource | undefined
    private _interpolation: HdTokenDataSource | undefined
    private _role: HdTokenDataSource | undefined
    private _colorSpace: HdTokenDataSource | undefined
    private _elementSize: HdIntDataSource | undefined
    setPrimvarValue(primvarValue: HdSampledDataSource | undefined): this {
      this._primvarValue = primvarValue
      return this
    }
    setIndexedPrimvarValue(indexedPrimvarValue: HdSampledDataSource | undefined): this {
      this._indexedPrimvarValue = indexedPrimvarValue
      return this
    }
    setIndices(indices: HdIntArrayDataSource | undefined): this {
      this._indices = indices
      return this
    }
    setInterpolation(interpolation: HdTokenDataSource | undefined): this {
      this._interpolation = interpolation
      return this
    }
    setRole(role: HdTokenDataSource | undefined): this {
      this._role = role
      return this
    }
    setColorSpace(colorSpace: HdTokenDataSource | undefined): this {
      this._colorSpace = colorSpace
      return this
    }
    setElementSize(elementSize: HdIntDataSource | undefined): this {
      this._elementSize = elementSize
      return this
    }
    build(): HdContainerDataSource {
      return HdPrimvarSchema.buildRetained(
        this._primvarValue,
        this._indexedPrimvarValue,
        this._indices,
        this._interpolation,
        this._role,
        this._colorSpace,
        this._elementSize,
      )
    }
  }
}
