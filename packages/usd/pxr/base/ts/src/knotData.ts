// Ported from OpenUSD 26.11.1: pxr/base/ts/knotData.cpp,
//  pxr/base/ts/knotData.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Type as TfType } from 'typescript-usd/tf'
import { TsKnot } from './knot.ts'
import { TsCurveType, TsInterpMode, TsTangentAlgorithm } from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/knotData.h and knotData.cpp.
//
// Ts_KnotData holds the value-type-independent knot fields (knotData.h:39-117).
// typescript-usd stores every supported value type as a JS number, so the double
// specialization Ts_TypedKnotData<double> (knotData.h:124-180) is the only
// typed form.
export class Ts_KnotData {
  // knotData.cpp:17-27: default field values.
  time = 0
  preTanWidth = 0
  postTanWidth = 0
  nextInterp: TsInterpMode = TsInterpMode.Held
  curveType: TsCurveType = TsCurveType.Bezier
  dualValued = false
  preTanAlgorithm: TsTangentAlgorithm = TsTangentAlgorithm.None
  postTanAlgorithm: TsTangentAlgorithm = TsTangentAlgorithm.None

  getPreTanWidth(): number { return this.preTanWidth }
  getPostTanWidth(): number { return this.postTanWidth }
  setPreTanWidth(width: number): void { this.preTanWidth = width }
  setPostTanWidth(width: number): void { this.postTanWidth = width }
}

export class Ts_TypedKnotData extends Ts_KnotData {
  value = 0
  preValue = 0
  preTanSlope = 0
  postTanSlope = 0

  clone(): Ts_TypedKnotData {
    const r = new Ts_TypedKnotData()
    r.time = this.time
    r.preTanWidth = this.preTanWidth
    r.postTanWidth = this.postTanWidth
    r.nextInterp = this.nextInterp
    r.curveType = this.curveType
    r.dualValued = this.dualValued
    r.preTanAlgorithm = this.preTanAlgorithm
    r.postTanAlgorithm = this.postTanAlgorithm
    r.value = this.value
    r.preValue = this.preValue
    r.preTanSlope = this.preTanSlope
    r.postTanSlope = this.postTanSlope
    return r
  }

  // knotData.h:268-294: curveType is deprecated and not compared; preValue is
  // compared only for dual-valued knots.
  equals(other: Ts_TypedKnotData): boolean {
    return this.time === other.time &&
      this.preTanWidth === other.preTanWidth &&
      this.postTanWidth === other.postTanWidth &&
      this.dualValued === other.dualValued &&
      this.nextInterp === other.nextInterp &&
      this.value === other.value &&
      (!this.dualValued || this.preValue === other.preValue) &&
      this.preTanSlope === other.preTanSlope &&
      this.postTanSlope === other.postTanSlope &&
      this.preTanAlgorithm === other.preTanAlgorithm &&
      this.postTanAlgorithm === other.postTanAlgorithm
  }

  // knotData.h:296-324.
  getPreValue(): number { return this.dualValued ? this.preValue : this.value }
  getPreTanSlope(): number { return this.preTanSlope }
  getPreTanHeight(): number { return -this.preTanWidth * this.preTanSlope }
  getPostTanSlope(): number { return this.postTanSlope }
  getPostTanHeight(): number { return this.postTanWidth * this.postTanSlope }

  // knotData.cpp:70-86.
  updateTangents(
    prevData: Ts_TypedKnotData | undefined,
    nextData: Ts_TypedKnotData | undefined,
    curveType: TsCurveType,
  ): boolean {
    const preResult = this._updateTangent(prevData, nextData, curveType, true)
    const postResult = this._updateTangent(prevData, nextData, curveType, false)
    return preResult || postResult
  }

  // knotData.cpp:88-123.
  _updateTangent(
    prevData: Ts_TypedKnotData | undefined,
    nextData: Ts_TypedKnotData | undefined,
    curveType: TsCurveType,
    updatePre: boolean,
  ): boolean {
    const algorithm = updatePre ? this.preTanAlgorithm : this.postTanAlgorithm
    switch (algorithm) {
      case TsTangentAlgorithm.None:
      case TsTangentAlgorithm.Custom:
        if (curveType === TsCurveType.Hermite) {
          if (updatePre && prevData) {
            this.preTanWidth = (this.time - prevData.time) / 3
          } else if (!updatePre && nextData) {
            this.postTanWidth = (nextData.time - this.time) / 3
          }
        }
        return true
      case TsTangentAlgorithm.AutoEase:
        return this._updateTangentAutoEase(prevData, nextData, updatePre)
    }
    return false
  }

  // knotData.cpp:125-243. Values are stored as doubles, so the slope never
  // overflows the storage type and the width is never recomputed.
  _updateTangentAutoEase(
    prevData: Ts_TypedKnotData | undefined,
    nextData: Ts_TypedKnotData | undefined,
    updatePre: boolean,
  ): boolean {
    if ((updatePre && !prevData) || (!updatePre && !nextData)) {
      return false
    }

    const prevTime = prevData ? prevData.time : 0.0
    const nextTime = nextData ? nextData.time : 0.0

    const discontinuity = !prevData ||
      !nextData ||
      this.dualValued ||
      this.nextInterp === TsInterpMode.ValueBlock ||
      prevData.nextInterp === TsInterpMode.ValueBlock

    if (discontinuity || !prevData || !nextData) {
      if (updatePre) {
        this.preTanSlope = 0.0
        this.preTanWidth = (this.time - prevTime) / 3
      } else {
        this.postTanSlope = 0.0
        this.postTanWidth = (nextTime - this.time) / 3
      }
      return true
    }

    const prevValue = prevData.value
    const knotValue = this.value
    const nextValue = nextData.getPreValue()
    const prevSlope = (knotValue - prevValue) / (this.time - prevTime)
    const nextSlope = (nextValue - knotValue) / (nextTime - this.time)

    let slope = 0.0
    if (prevSlope * nextSlope > 0) {
      const f = (this.time - prevTime) / (nextTime - prevTime)
      const u = f - 0.5
      const g = 0.5 + u * (0.5 + 2 * u * u)
      // GfLerp (gf/math.h:303).
      slope = (1 - g) * prevSlope + g * nextSlope
      if (nextSlope > 0) {
        slope = Math.min(slope, 3 * nextSlope, 3 * prevSlope)
      } else {
        slope = Math.max(slope, 3 * nextSlope, 3 * prevSlope)
      }
    }

    const width = (updatePre ? this.time - prevTime : nextTime - this.time) / 3.0
    if (updatePre) {
      this.preTanSlope = slope
      this.preTanWidth = width
    } else {
      this.postTanSlope = slope
      this.postTanWidth = width
    }
    return true
  }
}

// knotData.h:184-262: the proxy layer type-erases knot storage. typescript-usd keeps
// it as a thin wrapper over the double knot data.
export class Ts_KnotDataProxy {
  constructor(readonly data: Ts_TypedKnotData, readonly valueType: TfType = TfType.declare('double')) {}
  cloneData(): Ts_TypedKnotData { return this.data.clone() }
  GetValueType(): TfType { return this.valueType }
  isDataEqualTo(other: Ts_TypedKnotData): boolean { return this.data.equals(other) }
}
export class Ts_TypedKnotDataProxy extends Ts_KnotDataProxy {}

/** TsKnot::_GetData analog: copy a knot's fields into knot data. */
export function Ts_KnotDataFromKnot(knot: TsKnot): Ts_TypedKnotData {
  const d = new Ts_TypedKnotData()
  d.time = knot.getTime()
  d.preTanWidth = knot.getPreTanWidth()
  d.postTanWidth = knot.getPostTanWidth()
  d.nextInterp = knot.getNextInterpolation()
  d.curveType = knot.getCurveType()
  d.dualValued = knot.isDualValued()
  d.preTanAlgorithm = knot.getPreTanAlgorithm()
  d.postTanAlgorithm = knot.getPostTanAlgorithm()
  d.value = knot.GetValue()
  d.preValue = knot.isDualValued() ? knot.getPreValue() : 0
  d.preTanSlope = knot.getPreTanSlope()
  d.postTanSlope = knot.getPostTanSlope()
  return d
}

/** TsKnot(Ts_KnotData*, valueType, customData) analog (knot.cpp). */
export function Ts_KnotFromKnotData(
  data: Ts_TypedKnotData,
  valueType: TfType,
  customData?: Record<string, unknown>,
): TsKnot {
  const knot = new TsKnot(valueType)
  knot.SetTime(data.time)
  knot.setNextInterpolation(data.nextInterp)
  knot.setCurveType(data.curveType)
  knot.setValue(data.value)
  if (data.dualValued) knot.setPreValue(data.preValue)
  knot.setPreTanWidth(data.preTanWidth)
  knot.setPostTanWidth(data.postTanWidth)
  knot.setPreTanSlope(data.preTanSlope)
  knot.setPostTanSlope(data.postTanSlope)
  knot.setPreTanAlgorithm(data.preTanAlgorithm)
  knot.setPostTanAlgorithm(data.postTanAlgorithm)
  if (customData) knot.setCustomData(customData)
  return knot
}
