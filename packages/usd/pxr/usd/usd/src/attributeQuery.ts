// Ported from OpenUSD 26.11.1: pxr/usd/usd/attributeQuery.cpp,
//  pxr/usd/usd/attributeQuery.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Public counterpart of pxr/usd/usd/attributeQuery.{h,cpp}.

import { Interval as GfInterval } from 'typescript-usd/gf'
import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'
import type { UsdResolveTarget } from './resolveTarget.ts'
import { ValueBlock as SdfValueBlock } from 'typescript-usd/sdf'
import {
  _sdfHandOut, _sdfMakeTypedValue, _sdfMetadataValueTypeName,
} from 'typescript-usd/sdf/_internal'
import { Value as VtValue } from 'typescript-usd/vt'
import type { Spline as TsSpline } from 'typescript-usd/ts'
import { usdEvaluateSpline, usdTransformSpline } from './interpolators.ts'
import type { Attribute, Prim } from './prim.ts'
import { _getUsdResolveInfoResult, UsdResolveInfo } from './resolveInfo.ts'
import {
  usdInterpolateResolvedSamples, usdResolvedBracketingTimes, usdResolvedSampleCount, usdResolvedSampleTimes,
} from './resolver.ts'
import { _usdTimeCodeQuery, type UsdTimeCode } from './timeCode.ts'

export class UsdAttributeQuery {
  readonly #attr: Attribute | undefined
  readonly #resolveInfo: UsdResolveInfo | undefined
  readonly #resolveTarget: UsdResolveTarget | undefined

  constructor(attr?: Attribute, resolveTarget?: UsdResolveTarget) {
    this.#attr = attr
    if (!resolveTarget || resolveTarget.isNull() || !attr) {
      this.#resolveInfo = attr?.getResolveInfo()
      return
    }
    // attributeQuery.cpp:94-120: a target is valid only for its own prim.
    if (attr.primPath !== resolveTarget.getPrimIndex()?.getPath().pathString) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `Invalid resolve target for attribute '${attr.primPath}'. The given resolve target is only valid for attributes on the prim '${resolveTarget.getPrimIndex()?.getPath().pathString}'.`,
        TfDiagnosticType.CodingError))
      this.#resolveInfo = new UsdResolveInfo()
      return
    }
    this.#resolveTarget = resolveTarget
    this.#resolveInfo = attr._getResolveInfoWithResolveTarget(resolveTarget)
  }

  static createQueries(prim: Prim, attrNames: readonly string[]): UsdAttributeQuery[] {
    return attrNames.map(name => new UsdAttributeQuery(prim.getAttr(name)))
  }

  getAttribute(): Attribute | undefined { return this.#attr }
  /** @internal The resolve info this query holds (attributeQuery.h:332
   *  _resolveInfo), for typescript-usd callers that would otherwise resolve
   *  the attribute again. */
  _getResolveInfo(): UsdResolveInfo | undefined { return this.#resolveInfo }
  // UsdAttributeQuery::IsValid is its attribute's IsValid
  // (attributeQuery.h:112-114), false once the attribute has been removed.
  isValid(): boolean { return this.#attr?.isValid() ?? false }

  get(timeCode?: 'default' | number | UsdTimeCode): unknown
  /**
   * UsdAttributeQuery::Get(VtValue *value, UsdTimeCode time)
   * (attributeQuery.h:151): fills `value` with the resolved value held as the
   * attribute's value type (SdfValueTypeName::GetType()) and returns whether
   * there is a value.
   */
  get(value: VtValue, timeCode?: 'default' | number | UsdTimeCode): boolean
  get(
    valueOrTimeCode?: VtValue | 'default' | number | UsdTimeCode,
    timeCode: 'default' | number | UsdTimeCode = 'default'): unknown {
    if (valueOrTimeCode instanceof VtValue) {
      const resolved = this.get(timeCode)
      const typeName = this.#attr?.typeName ?? ''
      const valueType = _sdfMetadataValueTypeName(typeName)
      valueOrTimeCode.swap(valueType === undefined
        ? (resolved instanceof VtValue ? resolved : VtValue.getEmpty())
        : _sdfMakeTypedValue(resolved, valueType))
      return !valueOrTimeCode.IsEmpty()
    }
    return _sdfHandOut(this.#get(valueOrTimeCode ?? 'default'))
  }
  #get(timeCode: 'default' | number | UsdTimeCode): unknown {
    if (!this.#attr || !this.#resolveInfo) return undefined
    const query = timeCode === 'default'
      ? { time: 'default' as const, isPreTime: false }
      : _usdTimeCodeQuery(timeCode)
    const { time, isPreTime } = query
    let result = _getUsdResolveInfoResult(this.#resolveInfo)
    // UsdAttributeQuery::_Get (attributeQuery.cpp:132-160): a time-varying
    // resolve info is recomputed at default time, and the value comes from
    // the resolve info (_GetValueFromResolveInfo), never from the default
    // metadata read UsdAttribute::Get uses — so a blocked default gives the
    // fallback its resolve info reports (stage.cpp:8040-8059).
    if (time === 'default' && this.#resolveInfo.valueSourceMightBeTimeVarying()) {
      result = _getUsdResolveInfoResult(this.#resolveTarget
        ? this.#attr._getResolveInfoWithResolveTarget(this.#resolveTarget, 'default')
        : this.#attr.getResolveInfo('default'))
    }
    // A default source is read from the resolve info's layer on every Get
    // (_GetValueFromResolveInfoImpl, stage.cpp:8014-8030). The resolved value
    // stands while that layer still holds the default it was made from (Sdf
    // stored values are immutable and replaced on edit); after an edit the
    // attribute is resolved again for this read.
    if (result.source === 'default' && !result.valueEvaluator && result.layer &&
        result.specPath !== undefined &&
        result.layer.getField(result.specPath, 'default') !== result.layerDefault) {
      result = _getUsdResolveInfoResult(this.#resolveTarget
        ? this.#attr._getResolveInfoWithResolveTarget(this.#resolveTarget, time)
        : this.#attr.getResolveInfo(time))
    }
    if (time === 'default') {
      return result.valueEvaluator ? result.valueEvaluator(0, false) : result.value
    }
    if (result.source === 'timeSamples') {
      if (result.valueEvaluator) return result.valueEvaluator(time, isPreTime)
      const value = usdInterpolateResolvedSamples(
        result, time, result.interpolation, isPreTime, result.typeName)
      return value instanceof SdfValueBlock ? undefined : value
    }
    // A composing default (an array edit over weaker samples or clips)
    // retains the composed series' evaluator; its value varies with time
    // (UsdResolveInfo::ValueSourceMightBeTimeVarying, resolveInfo.h:136-147).
    if (result.source === 'default' && result.valueEvaluator) {
      return result.valueEvaluator(time, isPreTime)
    }
    if (result.source === 'spline') {
      return usdEvaluateSpline(
        result.spline, time, isPreTime, result.layerToStageOffset)
    }
    // Clip source selection may vary with time; OpenUSD documents that this
    // is the case where AttributeQuery offers less caching benefit.
    if (result.source === 'valueClips') {
      if (result.valueEvaluator) return result.valueEvaluator(time, isPreTime)
      // The canonical clip source retains its scoped evaluator. Never fall
      // back to an unrestricted attribute read if that evaluator is absent.
      return result.value
    }
    return result.value
  }

  getTimeSamples(): number[] {
    if (!this.#resolveInfo) return []
    return usdResolvedSampleTimes(_getUsdResolveInfoResult(this.#resolveInfo))
  }

  getSpline(): TsSpline | undefined {
    if (!this.#resolveInfo) return undefined
    const result = _getUsdResolveInfoResult(this.#resolveInfo)
    // Clips that provide a spline (stage.cpp:9666-9690); clip times already
    // carry the clip set's layer offset.
    if (result.source === 'valueClips') return result.clipSpline?.()
    return result.source === 'spline'
      ? usdTransformSpline(result.spline, result.layerToStageOffset)
      : undefined
  }

  getTimeSamplesInInterval(interval: GfInterval): number[] {
    const min = interval.getMin(), max = interval.getMax()
    return this.getTimeSamples().filter(time =>
      (time > min || time === min && interval.isMinClosed()) &&
      (time < max || time === max && interval.isMaxClosed()))
  }

  static getUnionedTimeSamples(queries: readonly UsdAttributeQuery[]): number[] {
    return [...new Set(queries.flatMap(query => query.getTimeSamples()))].sort((a, b) => a - b)
  }

  static getUnionedTimeSamplesInInterval(
    queries: readonly UsdAttributeQuery[], interval: GfInterval,
  ): number[] {
    return [...new Set(queries.flatMap(query => query.getTimeSamplesInInterval(interval)))]
      .sort((a, b) => a - b)
  }

  getNumTimeSamples(): number {
    return this.#resolveInfo ? usdResolvedSampleCount(_getUsdResolveInfoResult(this.#resolveInfo)) : 0
  }

  getBracketingTimeSamples(time: number): [number, number] | [] {
    return this.#resolveInfo
      ? usdResolvedBracketingTimes(_getUsdResolveInfoResult(this.#resolveInfo), time)
      : []
  }

  hasValue(): boolean {
    return this.#resolveInfo !== undefined &&
      _getUsdResolveInfoResult(this.#resolveInfo).source !== 'none'
  }

  hasSpline(): boolean {
    if (this.#resolveInfo === undefined) return false
    const result = _getUsdResolveInfoResult(this.#resolveInfo)
    return result.source === 'spline' ||
      (result.source === 'valueClips' && result.clipSpline !== undefined)
  }

  hasAuthoredValueOpinion(): boolean {
    return this.#resolveInfo?.hasAuthoredValueOpinion() ?? false
  }

  hasAuthoredValue(): boolean { return this.#resolveInfo?.hasAuthoredValue() ?? false }
  hasFallbackValue(): boolean { return this.#attr?.hasFallbackValue() ?? false }
  getFallbackValue(): unknown { return this.#attr?.getFallbackValue() }

  // UsdAttributeQuery::ValueSourceMightBeTimeVarying (OpenUSD 26.11.1
  // attributeQuery.cpp:325-329).
  valueSourceMightBeTimeVarying(): boolean {
    return this.#resolveInfo?.valueSourceMightBeTimeVarying() ?? false
  }

  valueMightBeTimeVarying(): boolean {
    if (!this.#resolveInfo) return false
    const result = _getUsdResolveInfoResult(this.#resolveInfo)
    if (result.source === 'timeSamples') return this.getNumTimeSamples() > 1
    // _ValueMightBeTimeVaryingFromResolveInfo (stage.cpp:9758-9781).
    if (result.source === 'valueClips' && result.clipValueMightBeTimeVarying !== undefined) {
      return result.clipValueMightBeTimeVarying
    }
    return this.#resolveInfo.valueSourceMightBeTimeVarying()
  }
}
