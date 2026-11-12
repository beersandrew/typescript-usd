// Ported from OpenUSD 26.11.1: pxr/base/ts/spline.cpp, pxr/base/ts/spline.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Interval as GfInterval } from 'typescript-usd/gf'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError, Type as TfType } from 'typescript-usd/tf'
import {
  Ts_Breakdown, Ts_Eval, Ts_EvalAspect, Ts_EvalLocation, type Ts_BreakdownOut,
} from './eval.ts'
import { TsKnot, TsKnotMap } from './knot.ts'
import { Ts_KnotDataFromKnot, Ts_KnotFromKnotData } from './knotData.ts'
import { Ts_RegressionPreventerBatchAccess } from './regressionPreventer.ts'
import { Ts_Bake, Ts_Sample, Ts_SampleData, Ts_Truncate } from './sample.ts'
import { Ts_SplineData } from './splineData.ts'
import {
  TsAntiRegressionMode, TsCurveType, TsExtrapMode, TsExtrapolation,
  TsInterpMode, TsLoopParams, TsSplineSamples, TsSplineSamplesWithSources, tsLoopCountToInt32,
  Ts_StringifyNumber,
} from './types.ts'

interface IntervalLike {
  getMin(): number
  getMax(): number
  isMinClosed?(): boolean
  isMaxClosed?(): boolean
  IsEmpty?(): boolean
}

export interface TsCanBreakdownResult {
  value: boolean
  reason: string
}

let authoringMode = TsAntiRegressionMode.KeepRatio

// Ported from OpenUSD v26.08 pxr/base/ts/spline.{h,cpp}, eval.cpp and sample.cpp.
export class TsSpline {
  #timeValued = false
  #curveType = TsCurveType.Bezier
  #preExtrapolation = new TsExtrapolation()
  #postExtrapolation = new TsExtrapolation()
  #innerLoopParams = new TsLoopParams()
  #knots = new TsKnotMap()
  // Snapshot used by evaluation; cleared by every mutation.
  #cache: Ts_SplineData | undefined
  readonly valueType: TfType

  constructor(valueType: TfType | string = TfType.declare('double')) {
    this.valueType = typeof valueType === 'string' ? TfType.declare(valueType==='duration'?'GfDuration':valueType) : valueType
  }

  clone(): TsSpline {
    const s = new TsSpline(this.valueType)
    s.#timeValued = this.#timeValued
    s.#curveType = this.#curveType
    s.#preExtrapolation = copyExtrap(this.#preExtrapolation)
    s.#postExtrapolation = copyExtrap(this.#postExtrapolation)
    s.#innerLoopParams = copyLoop(this.#innerLoopParams)
    s.#knots = new TsKnotMap(...this.#knots.map(k => k.clone()))
    return s
  }

  // TsSpline::operator== (spline.cpp): same value type, curve type,
  // extrapolation, inner loops and knots.
  equals(other: TsSpline): boolean {
    if (this === other) return true
    if (!(other instanceof TsSpline)) return false
    const sameExtrap = (a: TsExtrapolation, b: TsExtrapolation): boolean =>
      a.mode === b.mode && a.slope === b.slope && a.loopBoundaryTime === b.loopBoundaryTime
    const a = this.#innerLoopParams, b = other.#innerLoopParams
    return this.valueType === other.valueType &&
      this.isTimeValued() === other.isTimeValued() &&
      this.#curveType === other.#curveType &&
      sameExtrap(this.#preExtrapolation, other.#preExtrapolation) &&
      sameExtrap(this.#postExtrapolation, other.#postExtrapolation) &&
      a.protoStart === b.protoStart && a.protoEnd === b.protoEnd &&
      a.numPreLoops === b.numPreLoops && a.numPostLoops === b.numPostLoops &&
      a.valueOffset === b.valueOffset &&
      this.#knots.length === other.#knots.length &&
      this.#knots.every((knot, i) => knot.equals(other.#knots[i]!))
  }

  GetValueType(): TfType { return this.valueType }
  GetValueTypeName(): string { return this.valueType.getTypeName()==='GfDuration'?'duration':this.valueType.getTypeName() }
  isTimeValued(): boolean { return this.#timeValued || ['GfTimeCode','GfDuration'].includes(this.valueType.getTypeName()) }
  getCurveType(): TsCurveType { return this.#curveType }
  getPreExtrapolation(): TsExtrapolation { return copyExtrap(this.#preExtrapolation) }
  getPostExtrapolation(): TsExtrapolation { return copyExtrap(this.#postExtrapolation) }
  getInnerLoopParams(): TsLoopParams { return copyLoop(this.#innerLoopParams) }
  // spline.cpp:353-356 and knotMap.cpp:61-125: an interval selects the knots
  // of every segment it touches, including the knot that starts the segment
  // containing the interval's min and the knot that ends the segment
  // containing its max.
  getKnots(interval?: IntervalLike): TsKnotMap {
    if (!interval) return new TsKnotMap(...this.#knots.map(k => k.clone()))
    const knots = this.#knots
    let lowerIt = knots.lowerBound(interval.getMin())
    if (lowerIt === knots.length) return new TsKnotMap()
    if (lowerIt !== 0 && knots[lowerIt]!.getTime() !== interval.getMin()) {
      --lowerIt
    }
    let upperIt = lowerIt
    while (upperIt < knots.length && knots[upperIt]!.getTime() < interval.getMax()) upperIt++
    if (upperIt !== knots.length) {
      ++upperIt
    }
    return new TsKnotMap(...knots.slice(lowerIt, upperIt).map(k => k.clone()))
  }
  getKnot(time: number): TsKnot | undefined { return this.#knots.get(time)?.clone() }

  setTimeValued(value: boolean): void { this.#cache = undefined; this.#timeValued = value }
  // spline.cpp:132-145: only a switch to Hermite recomputes tangents.
  setCurveType(value: TsCurveType): void {
    if (this.#curveType !== value) {
      this.#cache = undefined
      this.#curveType = value
      if (value === TsCurveType.Hermite) {
        this.#updateAllTangents()
      }
    }
  }
  setPreExtrapolation(value: TsExtrapolation): void {
    this.#cache = undefined
    this.#preExtrapolation = copyExtrap(value)
  }
  setPostExtrapolation(value: TsExtrapolation): void {
    this.#cache = undefined
    this.#postExtrapolation = copyExtrap(value)
  }
  // spline.cpp:233-265 (_SetInnerLoopParams): store a copy with int32
  // counts, ignoring negative loop counts.
  setInnerLoopParams(value: TsLoopParams): void {
    const params = copyLoop(value)
    params.numPreLoops = Math.max(0, tsLoopCountToInt32(params.numPreLoops))
    params.numPostLoops = Math.max(0, tsLoopCountToInt32(params.numPostLoops))
    this._setInnerLoopParamsUnchecked(params)
  }
  /** binary.cpp:491-498: the crate reader stores loop params as read. */
  _setInnerLoopParamsUnchecked(value: TsLoopParams): void {
    this.#cache = undefined
    this.#innerLoopParams = copyLoop(value)
  }
  // spline.cpp:268-292.
  setKnots(value: readonly TsKnot[]): void {
    this.#cache = undefined
    this.#knots = TsKnotMap.from(value, k => k.clone()).sort(byTime) as TsKnotMap
    this.#updateAllTangents()
  }
  // spline.cpp:314-339: update algorithmic tangents of the knot and its
  // neighbors, then de-regress the adjacent segments.
  setKnot(value: TsKnot): readonly [number, number] {
    this.#cache = undefined
    this.#knots.set(value.getTime(), value.clone())
    const i = this.#knots.indexOfTime(value.getTime())
    this.#updateKnotTangents(i)
    return [this.#knots[Math.max(0, i - 1)]?.getTime() ?? value.getTime(),
      this.#knots[Math.min(this.#knots.length - 1, i + 1)]?.getTime() ?? value.getTime()]
  }
  /** spline.cpp:341-346: write a knot without tangent updates or de-regression. */
  _setKnotUnchecked(value: TsKnot): void {
    this.#cache = undefined
    this.#knots.set(value.getTime(), value.clone())
  }
  // spline.cpp:392-400 and splineData.h:571-597.
  removeKnot(time: number): void {
    const idx = this.#knots.indexOfTime(time)
    if (idx < 0) return
    this.#cache = undefined
    this.#knots.splice(idx, 1)
    if (idx > 0) this.#updateKnotTangentsAtIndex(idx - 1)
    if (idx < this.#knots.length) this.#updateKnotTangentsAtIndex(idx)
  }
  clearKnots(): void { this.#cache = undefined; this.#knots = new TsKnotMap() }

  isPreExtrapolationValid(): boolean { return this.#isExtrapValid(this.#preExtrapolation) }
  isPostExtrapolationValid(): boolean { return this.#isExtrapValid(this.#postExtrapolation) }
  IsEmpty(): boolean { return this.#knots.length === 0 }
  hasValueBlocks(): boolean {
    return this.#preExtrapolation.mode === TsExtrapMode.ValueBlock ||
      this.#postExtrapolation.mode === TsExtrapMode.ValueBlock ||
      this.#knots.some(k => k.getNextInterpolation() === TsInterpMode.ValueBlock)
  }
  hasLoops(): boolean { return this.hasInnerLoops() || this.hasExtrapolatingLoops() }
  hasInnerLoops(): boolean {
    const p = this.#innerLoopParams
    return p.protoEnd > p.protoStart && this.#knots.has(p.protoStart) &&
      (p.numPreLoops > 0 || p.numPostLoops > 0)
  }
  hasExtrapolatingLoops(): boolean {
    return this.#preExtrapolation.isLooping() || this.#postExtrapolation.isLooping()
  }
  // splineData.h:753-792.
  hasValueBlockAtTime(time: number): boolean { return this.#evalData().hasValueBlockAtTime(time) }
  doSidesDiffer(time: number): boolean { return this.evalPreValue(time) !== this.eval(time) }

  static isSupportedValueType(valueType: TfType | string): boolean {
    const name = typeof valueType === 'string' ? valueType : valueType.getTypeName()
    return ['double', 'float', 'GfHalf', 'GfTimeCode', 'GfDuration'].includes(name)
  }
  static getAntiRegressionAuthoringMode(): TsAntiRegressionMode { return authoringMode }
  getAntiRegressionAuthoringMode(): TsAntiRegressionMode { return authoringMode }

  // spline.cpp:816-880: every evaluation goes through Ts_Eval.
  eval(time: number): number | undefined {
    return Ts_Eval(this.#evalData(), time, Ts_EvalAspect.Value, Ts_EvalLocation.AtTime)
  }
  evalPreValue(time: number): number | undefined {
    return Ts_Eval(this.#evalData(), time, Ts_EvalAspect.Value, Ts_EvalLocation.Pre)
  }
  evalHeld(time: number): number | undefined {
    return Ts_Eval(this.#evalData(), time, Ts_EvalAspect.HeldValue, Ts_EvalLocation.AtTime)
  }
  evalPreValueHeld(time: number): number | undefined {
    return Ts_Eval(this.#evalData(), time, Ts_EvalAspect.HeldValue, Ts_EvalLocation.Pre)
  }
  evalDerivative(time: number): number | undefined {
    return Ts_Eval(this.#evalData(), time, Ts_EvalAspect.Derivative, Ts_EvalLocation.AtTime)
  }
  evalPreDerivative(time: number): number | undefined {
    return Ts_Eval(this.#evalData(), time, Ts_EvalAspect.Derivative, Ts_EvalLocation.Pre)
  }

  #evalData(): Ts_SplineData {
    this.#cache ??= this._getData()
    return this.#cache
  }

  // spline.cpp:921-939 and eval.cpp:2283-2304.
  canBreakdown(time: number): TsCanBreakdownResult {
    const out: Ts_BreakdownOut = { affectedInterval: new GfInterval(), reason: '' }
    const value = Ts_Breakdown(this._getData(), time, true, out)
    return { value, reason: out.reason }
  }

  /**
   * spline.cpp:901-919. Returns the affected interval on success, or
   * undefined on failure, like the Python wrapper (wrapSpline.cpp:90-106).
   */
  breakdown(time: number): GfInterval | undefined {
    const data = this._getData()
    const out: Ts_BreakdownOut = { affectedInterval: new GfInterval(), reason: '' }
    if (!Ts_Breakdown(data, time, false, out)) return undefined
    this.#setFromData(data)
    return out.affectedInterval
  }

  /**
   * spline.cpp:529-569 and sample.cpp:554-669. Returns undefined for invalid
   * arguments (where TsSpline::Sample returns false).
   */
  Sample(
    interval: IntervalLike, timeScale: number, valueScale: number,
    tolerance: number, withSources = false,
  ): TsSplineSamples | TsSplineSamplesWithSources | undefined {
    const timeInterval = toGfInterval(interval)
    if (timeInterval.IsEmpty() || !(timeScale > 0.0) || !(valueScale > 0.0) || !(tolerance > 0.0)) {
      return undefined
    }
    const result = withSources ? new TsSplineSamplesWithSources() : new TsSplineSamples()
    const sampleData = new Ts_SampleData(result)
    sampleData.clear()
    Ts_Sample(this._getData(), timeInterval, timeScale, valueScale, tolerance, sampleData)
    return result
  }

  // spline.cpp:961-992.
  hasRegressiveTangents(): boolean {
    if (this.#curveType !== TsCurveType.Bezier) return false
    const size = this.#knots.length
    if (size < 2) return false
    for (let i = 0; i < size - 1; i++) {
      if (Ts_RegressionPreventerBatchAccess.isSegmentRegressive(
          Ts_KnotDataFromKnot(this.#knots[i]!), Ts_KnotDataFromKnot(this.#knots[i + 1]!),
          TsSpline.getAntiRegressionAuthoringMode())) {
        return true
      }
    }
    return false
  }

  // spline.cpp:994-1057.
  adjustRegressiveTangents(): boolean {
    if (this.#curveType !== TsCurveType.Bezier) return false
    const size = this.#knots.length
    if (size < 2) return false
    let splineChanged = false
    for (let i = 0; i < size - 1; i++) {
      if (this.#processSegment(i, TsSpline.getAntiRegressionAuthoringMode())) {
        splineChanged = true
      }
    }
    return splineChanged
  }

  // spline.cpp:611-638.
  getTimeScaled(timeScale: number, timeOffset: number): TsSpline {
    if (timeScale === 0) return new TsSpline()
    if (this.#knots.length === 0) {
      const empty = new TsSpline(this.valueType)
      empty.#timeValued = this.#timeValued
      return empty
    }
    let scaledData: Ts_SplineData | undefined
    if (timeScale < 0 && this.hasInnerLoops()) {
      scaledData = Ts_Bake(this._getData(), GfInterval.getFullInterval(), false)
    } else {
      scaledData = this._getData()
    }
    if (!scaledData) return new TsSpline()
    scaledData.applyOffsetAndScale(timeOffset, timeScale)
    return TsSpline._fromData(scaledData)
  }

  // spline.h:516-520 (ValueBlock fallbacks), spline.cpp:590-609 and
  // sample.cpp:795-956.
  getTruncated(
    interval: IntervalLike,
    preFallback = new TsExtrapolation(TsExtrapMode.ValueBlock),
    postFallback = new TsExtrapolation(TsExtrapMode.ValueBlock),
  ): TsSpline {
    const gfInterval = toGfInterval(interval)
    if (gfInterval.IsEmpty() || this.#knots.length === 0) return new TsSpline()
    const truncatedData = Ts_Truncate(this._getData(), gfInterval, preFallback, postFallback)
    return truncatedData ? TsSpline._fromData(truncatedData) : new TsSpline()
  }

  // spline.cpp:430-452.
  getKnotsWithInnerLoopsBaked(): TsKnotMap {
    if (this.hasInnerLoops()) {
      const bakedData = Ts_Bake(this._getData(), GfInterval.getFullInterval(), false)
      if (bakedData) return this.#knotMapFromData(bakedData)
    }
    return this.getKnots()
  }

  // spline.cpp:405-428.
  bakeInnerLoops(): boolean {
    if (!this.hasInnerLoops()) return true
    const bakedData = Ts_Bake(this._getData(), GfInterval.getFullInterval(), false)
    if (bakedData) {
      this.#setFromData(bakedData)
      return true
    }
    return false
  }

  // spline.cpp:454-485.
  getKnotsWithLoopsBaked(interval: IntervalLike): TsKnotMap {
    if (this.#knots.length > 0 &&
        (this.hasInnerLoops() ||
         this.#preExtrapolation.isLooping() ||
         this.#postExtrapolation.isLooping())) {
      const bakedData = Ts_Bake(this._getData(), toGfInterval(interval), true)
      return bakedData ? this.#knotMapFromData(bakedData) : new TsKnotMap()
    }
    return this.getKnots(interval)
  }

  // spline.cpp:792-833 (operator<<).
  toString(): string {
    const extrapNames = ['ValueBlock', 'Held', 'Linear', 'Sloped', 'LoopRepeat', 'LoopReset', 'LoopOscillate']
    const extrapDesc = (e: TsExtrapolation): string =>
      (extrapNames[e.mode] ?? '') + (e.mode === TsExtrapMode.Sloped ? ` ${Ts_StringifyNumber(e.slope)}` : '')
    let out = 'Spline:\n' +
      `  value type ${this.GetValueTypeName()}\n` +
      `  time valued ${this.isTimeValued() ? 1 : 0}\n` +
      `  curve type ${this.#curveType === TsCurveType.Hermite ? 'Hermite' : 'Bezier'}\n` +
      `  pre extrap ${extrapDesc(this.#preExtrapolation)}\n` +
      `  post extrap ${extrapDesc(this.#postExtrapolation)}\n`
    if (this.hasInnerLoops()) {
      const lp = this.#innerLoopParams
      out += 'Loop:\n' +
        `  start ${Ts_StringifyNumber(lp.protoStart)}, end ${Ts_StringifyNumber(lp.protoEnd)}, ` +
        `numPreLoops ${lp.numPreLoops}, numPostLoops ${lp.numPostLoops}, ` +
        `valueOffset ${Ts_StringifyNumber(lp.valueOffset)}\n`
    }
    for (const knot of this.#knots) out += knot.toString()
    return out
  }

  /** Ts_SplineOffsetAccess::ApplyOffsetAndScale target (splineData.h:599-722). */
  _applyOffsetAndScale(offset: number, scale: number): void {
    const data = this._getData()
    data.applyOffsetAndScale(offset, scale)
    this.#setFromData(data)
  }

  /** Ts_GetSplineData analog: a Ts_SplineData snapshot of this spline. */
  _getData(): Ts_SplineData {
    const data = Ts_SplineData.create(this.valueType)
    data.timeValued = this.#timeValued
    data.curveType = this.#curveType
    data.preExtrapolation = copyExtrap(this.#preExtrapolation)
    data.postExtrapolation = copyExtrap(this.#postExtrapolation)
    data.loopParams = copyLoop(this.#innerLoopParams)
    for (const knot of this.#knots) data.pushKnot(Ts_KnotDataFromKnot(knot), knot.getCustomData())
    return data
  }

  /** TsSpline(Ts_SplineData*) analog (spline.cpp:71-76). */
  static _fromData(data: Ts_SplineData): TsSpline {
    const spline = new TsSpline(data.GetValueType())
    spline.#setFromData(data)
    return spline
  }

  #setFromData(data: Ts_SplineData): void {
    this.#cache = undefined
    this.#timeValued = data.timeValued
    this.#curveType = data.curveType
    this.#preExtrapolation = copyExtrap(data.preExtrapolation)
    this.#postExtrapolation = copyExtrap(data.postExtrapolation)
    this.#innerLoopParams = copyLoop(data.loopParams)
    this.#knots = this.#knotMapFromData(data)
  }

  // TsKnotMap(const Ts_SplineData*) analog (knotMap.cpp).
  #knotMapFromData(data: Ts_SplineData): TsKnotMap {
    return new TsKnotMap(...data.knots.map(k =>
      Ts_KnotFromKnotData(k, this.valueType, data.customData.get(k.time))))
  }

  diff(other: TsSpline, interval?: IntervalLike): readonly [number, number] | undefined {
    const times = new Set([...this.#knots.map(k => k.getTime()), ...other.#knots.map(k => k.getTime())])
    const different = [...times].filter(t => (!interval || contains(interval, t)) &&
      (this.eval(t) !== other.eval(t) || this.evalPreValue(t) !== other.evalPreValue(t)))
    return different.length ? [Math.min(...different), Math.max(...different)] : undefined
  }

  // TsSpline::Concatenate (spline.cpp:684-788). Each spline's start knot
  // takes the previous spline's end knot as its pre side: the pre value
  // when it differs from the start value, and the pre tangent; the first
  // non-empty spline gives the pre-extrapolation and the last the post.
  static concatenate(splines: readonly TsSpline[]): TsSpline {
    if (splines.length === 0) return new TsSpline()
    if (splines.length === 1) return splines[0]!.clone()
    const valueType = splines.find(spline => !spline.IsEmpty())?.valueType
    if (!valueType) return new TsSpline()
    const result = new TsSpline(valueType)
    let prevKnot = new TsKnot(valueType)
    let foundPreExtrapolation = false
    for (let i = 0; i < splines.length; ++i) {
      const spline = splines[i]!
      if (spline.IsEmpty()) continue
      if (spline.GetValueTypeName() !== result.GetValueTypeName()) {
        TfDiagnosticMgr.GetInstance().postError(new TfError(
          'Concatenation of splines with varying value types is not supported, ' +
          'returning empty spline.', TfDiagnosticType.CodingError))
        return new TsSpline()
      }
      if (spline.hasInnerLoops()) {
        TfDiagnosticMgr.GetInstance().postError(new TfError(
          'Concatenation of splines with inner loops is not supported, ' +
          'returning empty spline.', TfDiagnosticType.CodingError))
        return new TsSpline()
      }
      const knots = spline.getKnots()
      const startKnot = knots[0]!
      if (i > 0) {
        if (prevKnot.getTime() !== startKnot.getTime()) {
          TfDiagnosticMgr.GetInstance().postError(new TfError(
            'Got boundary knots to TsSpline::Concatenate at mismatched times, ' +
            'returning empty spline', TfDiagnosticType.CodingError))
          return new TsSpline()
        }
        startKnot.clearPreValue()
        const prevKnotPreValue = prevKnot.getPreValue()
        if (startKnot.GetValue() !== prevKnotPreValue) startKnot.setPreValue(prevKnotPreValue)
        startKnot.setPreTanSlope(prevKnot.getPreTanSlope())
        startKnot.setPreTanWidth(prevKnot.getPreTanWidth())
        startKnot.setPreTanAlgorithm(prevKnot.getPreTanAlgorithm())
      }
      for (const knot of knots) result.setKnot(knot)
      prevKnot = knots[knots.length - 1]!
      if (!foundPreExtrapolation) {
        const pre = spline.getPreExtrapolation()
        const preExtrapolation = new TsExtrapolation(pre.mode, pre.slope, pre.loopBoundaryTime)
        if (preExtrapolation.isLooping() && preExtrapolation.loopBoundaryTime === undefined) {
          preExtrapolation.loopBoundaryTime = prevKnot.getTime()
        }
        result.setPreExtrapolation(preExtrapolation)
        foundPreExtrapolation = true
      }
      const post = spline.getPostExtrapolation()
      const postExtrapolation = new TsExtrapolation(post.mode, post.slope, post.loopBoundaryTime)
      if (postExtrapolation.isLooping() && postExtrapolation.loopBoundaryTime === undefined) {
        postExtrapolation.loopBoundaryTime = startKnot.getTime()
      }
      result.setPostExtrapolation(postExtrapolation)
    }
    return result
  }


  #isExtrapValid(extrap: TsExtrapolation): boolean {
    return extrap.loopBoundaryTime === undefined || this.#knots.has(extrap.loopBoundaryTime)
  }

  // spline.cpp:1059-1074.
  #updateAllTangents(): boolean {
    let result = false
    for (let i = 0; i < this.#knots.length; ++i) {
      result = this.#updateKnotTangentsAtIndex(i) || result
    }
    result = this.adjustRegressiveTangents() || result
    return result
  }

  // spline.cpp:1076-1101.
  #updateKnotTangents(idx: number): boolean {
    let result = false
    const first = idx > 0 ? idx - 1 : idx
    const last = idx < this.#knots.length - 1 ? idx + 1 : idx
    for (let i = first; i <= last; ++i) {
      result = this.#updateKnotTangentsAtIndex(i) || result
    }
    if (this.#curveType === TsCurveType.Bezier) {
      for (let i = first; i < last; i++) {
        result = this.#processSegment(i, TsSpline.getAntiRegressionAuthoringMode()) || result
      }
    }
    return result
  }

  // splineData.h:794-812.
  #updateKnotTangentsAtIndex(index: number): boolean {
    const knot = this.#knots[index]
    if (!knot) return false
    this.#cache = undefined
    return knot.updateTangents(this.#knots[index - 1], this.#knots[index + 1], this.#curveType)
  }

  // Ts_RegressionPreventerBatchAccess::ProcessSegment on the segment that
  // starts at knot index i (regressionPreventer.cpp:621-658).
  #processSegment(i: number, mode: TsAntiRegressionMode): boolean {
    const start = this.#knots[i]!
    const end = this.#knots[i + 1]!
    const startData = Ts_KnotDataFromKnot(start)
    const endData = Ts_KnotDataFromKnot(end)
    const changed = Ts_RegressionPreventerBatchAccess.processSegment(startData, endData, mode)
    if (changed) this.#cache = undefined
    if (startData.postTanWidth !== start.getPostTanWidth()) start.setPostTanWidth(startData.postTanWidth)
    if (endData.preTanWidth !== end.getPreTanWidth()) end.setPreTanWidth(endData.preTanWidth)
    return changed
  }
}

export class TsAntiRegressionAuthoringSelector {
  readonly #previous: TsAntiRegressionMode
  constructor(public readonly mode: TsAntiRegressionMode) {
    this.#previous = authoringMode
    authoringMode = mode
  }
  close(): void { authoringMode = this.#previous }
}

export class TsEditBehaviorBlock {
  close(): void {}
}

// spline.cpp:838-846.
export class Ts_SplineOffsetAccess {
  static applyOffsetAndScale(spline: TsSpline, offset: number, scale: number): void {
    spline._applyOffsetAndScale(offset, scale)
  }
}

/** Ts_GetSplineData (splineData.cpp:178-188); typescript-usd returns a snapshot. */
export function Ts_GetSplineData(spline: TsSpline): Ts_SplineData { return spline._getData() }
export const Ts_GetTypedSplineData = Ts_GetSplineData

function copyExtrap(e: TsExtrapolation): TsExtrapolation {
  return new TsExtrapolation(e.mode, e.slope, e.loopBoundaryTime)
}
function copyLoop(p: TsLoopParams): TsLoopParams {
  return new TsLoopParams(p.protoStart, p.protoEnd, p.numPreLoops, p.numPostLoops, p.valueOffset)
}
function byTime(a: TsKnot, b: TsKnot): number { return a.getTime() - b.getTime() }
function toGfInterval(i: IntervalLike): GfInterval {
  if (i instanceof GfInterval) return i.clone()
  if (i.IsEmpty?.()) return new GfInterval()
  return new GfInterval(i.getMin(), i.getMax(), i.isMinClosed?.() ?? true, i.isMaxClosed?.() ?? true)
}
function contains(i: IntervalLike, time: number): boolean {
  return (time > i.getMin() || (time === i.getMin() && (i.isMinClosed?.() ?? true))) &&
    (time < i.getMax() || (time === i.getMax() && (i.isMaxClosed?.() ?? true)))
}
export const Spline = TsSpline
