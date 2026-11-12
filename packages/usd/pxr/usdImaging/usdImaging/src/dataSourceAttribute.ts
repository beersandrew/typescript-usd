// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceAttribute.cpp,
//  pxr/usdImaging/usdImaging/dataSourceAttribute.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceAttribute.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - UsdImagingDataSourceAttribute<T> is one class here. Upstream instantiates
//   it per C++ value type T through a factory map keyed by the attribute's
//   SdfValueTypeName type (dataSourceAttribute.cpp:144-170). In this port
//   GetTypedValue returns what UsdAttributeQuery::Get returns in TypeScript
//   (Gf values, VtArray, number, string, SdfAssetPath), and GetValue returns
//   that value in a VtValue typed by the attribute's value type, which is
//   what upstream's `VtValue(GetTypedValue(...))` holds
//   (dataSourceAttribute.h:41-44). _UsdImagingVtValueFromUsdValue is the one
//   place that turns a USD value into a VtValue.
// - The data source class (HdIntArrayDataSource, HdMatrixDataSource, ...)
//   is not encoded in the TypeScript class: hd schemas check data source
//   kinds only (hd/schema.ts header).
// - UsdImagingDataSourceAssetPathAttribute resolves a UDIM pattern with
//   UsdShadeUdimUtils' synchronous resolveUdimPath (usdShade/src/
//   udimUtils.ts: the tiles are resolved ahead when the stage prepares its
//   asset-valued attributes). Its cached value at shutter offset 0 is a
//   plain field (no atomics in single-threaded JavaScript).

import { Interval as GfInterval } from 'typescript-usd/gf'
import { DataSourceLocator as HdDataSourceLocator, TypedSampledDataSource as HdTypedSampledDataSource, type SampledDataSource as HdSampledDataSource } from 'typescript-usd/hd'
import { AssetPath as SdfAssetPath, Layer as SdfLayer, findValueTypeName } from 'typescript-usd/sdf'
import { Type as TfType } from 'typescript-usd/tf'
import { TF_WARN } from './tfDiagnostic.ts'
import { AttributeQuery as UsdAttributeQuery, TimeCode as UsdTimeCode, type Attribute as UsdAttribute } from 'typescript-usd/usd'
import { UdimUtils as UsdShadeUdimUtils } from 'typescript-usd/usdShade'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'

const _SdfAssetPathType = TfType.declare('SdfAssetPath')
const _SdfTimeCodeType = TfType.declare('SdfTimeCode')
const _SdfPathExpressionType = TfType.declare('SdfPathExpression')
const _SdfOpaqueValueType = TfType.declare('SdfOpaqueValue')

/** The TfType of a scalar Sdf value type (SdfValueTypeName::GetType()). */
export function _UsdImagingTfTypeForSdfType(sdfType: string): TfType | undefined {
  switch (sdfType) {
    case 'asset': return _SdfAssetPathType
    case 'timecode': return _SdfTimeCodeType
    case 'pathExpression': return _SdfPathExpressionType
    case 'opaque': return _SdfOpaqueValueType
  }
  return (VtValueTypes as Record<string, TfType>)[sdfType]
}

/** The VtValue UsdAttribute::Get(VtValue*) produces for a value read from an
 *  attribute of Sdf value type `typeName` (see the header). */
export function _UsdImagingVtValueFromUsdValue(value: unknown, typeName: string): VtValue {
  if (value === undefined || value === null) return VtValue.getEmpty()
  if (value instanceof VtValue) return value
  if (value instanceof VtArray) return VtValue.createArray(value as VtArray<unknown>)
  const valueType = findValueTypeName(typeName)
  const scalar = valueType?.isArray ? valueType.scalarType : valueType
  const type = scalar ? _UsdImagingTfTypeForSdfType(scalar.type) : undefined
  if (valueType?.isArray && type) {
    return VtValue.createArray(new VtArray<unknown>(Array.from(value as ArrayLike<unknown>), type))
  }
  if (!type) return VtValue.take(value, TfType.declare(typeName))
  // Token and string values may be boxed String objects.
  const held = typeof value === 'object' && value instanceof String ? String(value) : value
  return VtValue.create(held, type)
}

/** The zero-initialized value `T result{}` of dataSourceAttribute.h:50 for an
 *  attribute of Sdf value type `typeName`. */
function _ZeroValue(typeName: string): unknown {
  const valueType = findValueTypeName(typeName)
  if (!valueType) return undefined
  const scalar = valueType.isArray ? valueType.scalarType : valueType
  const type = scalar ? _UsdImagingTfTypeForSdfType(scalar.type) : undefined
  if (valueType.isArray) return type ? new VtArray<unknown>([], type) : []
  switch (scalar?.type) {
    case 'bool': return false
    case 'string': case 'token': return ''
    case 'asset': return new SdfAssetPath()
    case 'uchar': case 'int': case 'uint': case 'int64': case 'uint64':
    case 'half': case 'float': case 'double': return 0
  }
  return undefined
}

/** Whether `value`, read from an attribute of Sdf value type `typeName`,
 *  is held as that type: the IsHolding<T>() test of the typed read
 *  `_usdAttrQuery.Get<T>(&result, time)` (dataSourceAttribute.h:53;
 *  SdfAbstractDataTypedValue<T>::_StoreVtValueImpl, sdf/abstractData.h:
 *  510-535), whose T is the attribute's value type
 *  (SdfValueTypeName::GetType() of UsdAttribute::GetTypeName(), which a
 *  builtin attribute takes from its prim definition: stage.cpp:6699-6713).
 *  A VtArray carries its element type, so an array value is checked exactly
 *  (an int[] or double3[] "normals" is not the normal3f[] VtVec3fArray). A
 *  value of a scalar type is checked for not being an array: typescript-usd
 *  scalar values (numbers, Gf values) do not record which C++ type they were
 *  stored as. */
function _HoldsValueType(value: unknown, typeName: string): boolean {
  const valueType = findValueTypeName(typeName)
  if (!valueType) return true
  if (!valueType.isArray) return !(value instanceof VtArray)
  if (!(value instanceof VtArray)) return false
  const scalar = valueType.scalarType
  const type = scalar ? _UsdImagingTfTypeForSdfType(scalar.type) : undefined
  return type === undefined || value.getElementType().getTypeName() === type.getTypeName()
}

/** dataSourceAttribute.h:30-152 */
export class UsdImagingDataSourceAttribute<T = unknown> extends HdTypedSampledDataSource<T> {
  protected readonly _usdAttrQuery: UsdAttributeQuery
  protected readonly _typeName: string

  /** dataSourceAttribute.h:224-243 */
  protected constructor(
    usdAttrQuery: UsdAttributeQuery,
    protected readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
    sceneIndexPath = '',
    timeVaryingFlagLocator: HdDataSourceLocator = HdDataSourceLocator.EmptyLocator,
  ) {
    super()
    this._usdAttrQuery = usdAttrQuery
    this._typeName = usdAttrQuery.getAttribute()?.typeName ?? ''
    if (timeVaryingFlagLocator.getElementCount() !== 0) {
      if (this._usdAttrQuery.valueMightBeTimeVarying()) {
        this._stageGlobals.flagAsTimeVarying(sceneIndexPath, timeVaryingFlagLocator)
      }
    }
    // dataSourceAttribute.h:194-210: asset path-valued attributes are
    // recorded in the stage globals.
    if (findValueTypeName(this._typeName)?.type === 'asset') {
      const attr = usdAttrQuery.getAttribute()
      if (attr) this._stageGlobals.flagAsAssetPathDependent(attr.getPath())
    }
  }

  static new<T = unknown>(
    usdAttr: UsdAttribute | UsdAttributeQuery,
    stageGlobals: UsdImagingDataSourceStageGlobals,
    sceneIndexPath = '',
    timeVaryingFlagLocator: HdDataSourceLocator = HdDataSourceLocator.EmptyLocator,
  ): UsdImagingDataSourceAttribute<T> {
    const query = usdAttr instanceof UsdAttributeQuery ? usdAttr : new UsdAttributeQuery(usdAttr)
    return new UsdImagingDataSourceAttribute<T>(query, stageGlobals, sceneIndexPath, timeVaryingFlagLocator)
  }

  /** dataSourceAttribute.h:41-44 */
  override GetValue(shutterOffset: number): VtValue {
    return _UsdImagingVtValueFromUsdValue(this.getTypedValue(shutterOffset), this._typeName)
  }

  /** The time code a sample at `shutterOffset` reads
   *  (dataSourceAttribute.h:55-58). */
  protected _getSampleTime(shutterOffset: number): UsdTimeCode {
    const time = this._stageGlobals.getTime()
    return time.isNumeric() ? new UsdTimeCode(time.GetValue() + shutterOffset) : time
  }

  /** dataSourceAttribute.h:46-75 */
  getTypedValue(shutterOffset: number): T {
    if (!this._usdAttrQuery.isValid()) {
      return _ZeroValue(this._typeName) as T
    }
    const value = this._usdAttrQuery.get(this._getSampleTime(shutterOffset))
    if (value !== undefined && _HoldsValueType(value, this._typeName)) {
      return value as T
    }
    // No value of expected type T could be retrieved. Try schema default
    // and if that fails return zero-initialized result.
    const fallback = this._usdAttrQuery.getFallbackValue()
    if (fallback !== undefined) {
      return fallback as T
    }
    return _ZeroValue(this._typeName) as T
  }

  /** dataSourceAttribute.h:77-142 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    if (!this._usdAttrQuery.isValid()) {
      return false
    }
    const time = this._stageGlobals.getTime()
    if (!this._usdAttrQuery.valueMightBeTimeVarying() || !time.isNumeric()) {
      return false
    }

    const interval = new GfInterval(time.GetValue() + startTime, time.GetValue() + endTime)

    // Start with the times that fall within the interval
    const timeSamples = this._usdAttrQuery.getTimeSamplesInInterval(interval)

    // Add bracketing sample times for the leading and trailing edges of the
    // interval.
    let first: number, last: number, ignore: number
    const leading = this._usdAttrQuery.getBracketingTimeSamples(interval.getMin())
    if (leading.length === 0 || leading[0] === leading[1]) {
      first = interval.getMin()
    } else {
      [first, ignore] = leading
    }
    const trailing = this._usdAttrQuery.getBracketingTimeSamples(interval.getMax())
    if (trailing.length === 0 || trailing[0] === trailing[1]) {
      last = interval.getMax()
    } else {
      [ignore, last] = trailing
    }
    void ignore!

    // Add the bracketing sample times only if they actually fall outside the
    // interval. This maintains ordering and uniqueness.
    if (timeSamples.length === 0 || first < timeSamples[0]!) {
      timeSamples.unshift(first)
    }
    if (last > timeSamples[timeSamples.length - 1]!) {
      timeSamples.push(last)
    }

    outSampleTimes.length = 0
    // We need to convert the time array because usd uses double and
    // hydra (and prman) use float (dataSourceAttribute.h:118-123).
    for (const t of timeSamples) outSampleTimes.push(Math.fround(t - time.GetValue()))
    return outSampleTimes.length > 1
  }
}

/** dataSourceAttribute.cpp:21-32 _FindLayerHandle: the layer of the
 *  strongest opinion that authors a default or time samples. */
function _FindLayerHandle(attr: UsdAttribute | undefined, time: UsdTimeCode): SdfLayer | undefined {
  if (!attr) return undefined
  for (const spec of attr.getPropertyStack(time.isNumeric() ? time.GetValue() : 'default')) {
    if (spec.value !== undefined || (spec.timeSamples?.length ?? 0) > 0) {
      return SdfLayer.find(spec.layerIdentifier)
    }
  }
  return undefined
}

/** dataSourceAttribute.cpp:34-107: the attribute data source for
 *  SdfAssetPath values, with proper handling for UDIM paths. */
export class UsdImagingDataSourceAssetPathAttribute extends UsdImagingDataSourceAttribute<SdfAssetPath> {
  /** Cached result at shutterOffset=0.0 */
  private _cachedValue: SdfAssetPath | undefined

  static override new<T = SdfAssetPath>(
    usdAttr: UsdAttribute | UsdAttributeQuery,
    stageGlobals: UsdImagingDataSourceStageGlobals,
    sceneIndexPath = '',
    timeVaryingFlagLocator: HdDataSourceLocator = HdDataSourceLocator.EmptyLocator,
  ): UsdImagingDataSourceAttribute<T> {
    const query = usdAttr instanceof UsdAttributeQuery ? usdAttr : new UsdAttributeQuery(usdAttr)
    return new UsdImagingDataSourceAssetPathAttribute(
      query, stageGlobals, sceneIndexPath, timeVaryingFlagLocator) as unknown as UsdImagingDataSourceAttribute<T>
  }

  /** dataSourceAttribute.cpp:43-81. Returns the extracted SdfAssetPath
   *  value of the attribute at `shutterOffset`, with proper handling for
   *  UDIM paths. */
  override getTypedValue(shutterOffset: number): SdfAssetPath {
    // Check for cached value at 0.0 as a special case.
    if (shutterOffset === 0.0 && this._cachedValue) {
      return this._cachedValue
    }

    let result = super.getTypedValue(shutterOffset)
    if (result instanceof SdfAssetPath && UsdShadeUdimUtils.isUdimIdentifier(result.getAssetPath())) {
      let time = this._stageGlobals.getTime()
      if (time.isNumeric()) {
        time = new UsdTimeCode(time.GetValue() + shutterOffset)
      }
      const resolvedPath = UsdShadeUdimUtils.resolveUdimPathSync(
        result.getAssetPath(),
        _FindLayerHandle(this._usdAttrQuery.getAttribute(), time))
      if (resolvedPath !== '') {
        result = new SdfAssetPath(result.getAssetPath(), resolvedPath)
      }
    }

    // Cache the result.
    if (shutterOffset === 0.0) {
      this._cachedValue = result
    }
    return result
  }
}

/** dataSourceAttribute.cpp:172-197 UsdImagingDataSourceAttributeNew: the
 *  attribute data source for the attribute's value type, or undefined (with
 *  a warning) when the attribute has no Sdf value type. */
export function UsdImagingDataSourceAttributeNew(
  usdAttr: UsdAttribute | UsdAttributeQuery,
  stageGlobals: UsdImagingDataSourceStageGlobals,
  sceneIndexPath = '',
  timeVaryingFlagLocator: HdDataSourceLocator = HdDataSourceLocator.EmptyLocator,
): HdSampledDataSource | undefined {
  const query = usdAttr instanceof UsdAttributeQuery ? usdAttr : new UsdAttributeQuery(usdAttr)
  const attr = query.getAttribute()
  if (!attr) {
    // TF_VERIFY(usdAttrQuery.GetAttribute())
    return undefined
  }
  if (!findValueTypeName(attr.typeName)) {
    TF_WARN(`<${attr.getPath()}> Unable to create attribute datasource for type '${attr.typeName}'`)
    return undefined
  }
  // dataSourceAttribute.cpp:121-130: SdfAssetPath values get the asset path
  // data source.
  if (attr.typeName === 'asset') {
    return UsdImagingDataSourceAssetPathAttribute.new(query, stageGlobals, sceneIndexPath, timeVaryingFlagLocator)
  }
  return UsdImagingDataSourceAttribute.new(query, stageGlobals, sceneIndexPath, timeVaryingFlagLocator)
}
