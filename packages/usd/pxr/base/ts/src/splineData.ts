// Ported from OpenUSD 26.11.1: pxr/base/ts/splineData.cpp,
//  pxr/base/ts/splineData.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Type as TfType } from 'typescript-usd/tf'
import { _CopyHeldValue } from 'typescript-usd/vt'
import { Ts_TypedKnotData } from './knotData.ts'
import { TsCurveType, TsExtrapMode, TsExtrapolation, TsInterpMode, TsLoopParams } from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/splineData.h and splineData.cpp.
//
// typescript-usd stores every supported value type as a JS number, so this is the
// Ts_TypedSplineData<double> layout (splineData.h:173-247) with the value type
// carried alongside.

export type Ts_CustomData = Record<string, unknown>

/** Index of the first knot at or after time (std::lower_bound). */
export function Ts_LowerBound(times: readonly number[], time: number, begin = 0, end = times.length): number {
  let lo = begin, hi = end
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (times[mid]! < time) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Index of the first knot strictly after time (std::upper_bound). */
export function Ts_UpperBound(times: readonly number[], time: number, begin = 0, end = times.length): number {
  let lo = begin, hi = end
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (times[mid]! <= time) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** std::binary_search over sorted knot times. */
export function Ts_BinarySearch(times: readonly number[], time: number): boolean {
  const i = Ts_LowerBound(times, time)
  return i < times.length && times[i] === time
}

function copyExtrap(e: TsExtrapolation): TsExtrapolation {
  return new TsExtrapolation(e.mode, e.slope, e.loopBoundaryTime)
}
function copyLoop(p: TsLoopParams): TsLoopParams {
  return new TsLoopParams(p.protoStart, p.protoEnd, p.numPreLoops, p.numPostLoops, p.valueOffset)
}

export class Ts_SplineData {
  // splineData.h:144-170.
  isTyped = false
  timeValued = false
  curveType: TsCurveType = TsCurveType.Bezier
  valueType: TfType = TfType.declare('double')
  preExtrapolation = new TsExtrapolation()
  postExtrapolation = new TsExtrapolation()
  loopParams = new TsLoopParams()
  times: number[] = []
  customData = new Map<number, Ts_CustomData>()

  // Per-knot data (splineData.h:246).
  knots: Ts_TypedKnotData[] = []

  // splineData.cpp:29-68.
  static create(valueType?: TfType, overallParamSource?: Ts_SplineData): Ts_SplineData {
    const result = new Ts_SplineData()
    result.curveType = TsCurveType.Bezier
    result.valueType = valueType ?? TfType.declare('double')
    result.isTyped = valueType !== undefined
    if (overallParamSource) {
      result.curveType = overallParamSource.curveType
      result.preExtrapolation = copyExtrap(overallParamSource.preExtrapolation)
      result.postExtrapolation = copyExtrap(overallParamSource.postExtrapolation)
      result.loopParams = copyLoop(overallParamSource.loopParams)
    }
    return result
  }

  GetValueType(): TfType { return this.valueType }

  // splineData.h:271-276.
  Clone(): Ts_SplineData {
    const r = new Ts_SplineData()
    r.isTyped = this.isTyped
    r.timeValued = this.timeValued
    r.curveType = this.curveType
    r.valueType = this.valueType
    r.preExtrapolation = copyExtrap(this.preExtrapolation)
    r.postExtrapolation = copyExtrap(this.postExtrapolation)
    r.loopParams = copyLoop(this.loopParams)
    r.times = [...this.times]
    r.knots = this.knots.map(k => k.clone())
    for (const [time, dict] of this.customData) {
      r.customData.set(time, _CopyHeldValue(dict) as Ts_CustomData)
    }
    return r
  }

  // splineData.h:278-312 (custom data compared by key set and identity of
  // serialized content).
  equals(other: Ts_SplineData): boolean {
    const timeValued = (d: Ts_SplineData): boolean =>
      d.timeValued || ['GfTimeCode','GfDuration'].includes(d.valueType.getTypeName())
    if (this.isTyped !== other.isTyped ||
        timeValued(this) !== timeValued(other) ||
        this.curveType !== other.curveType ||
        !this.preExtrapolation.equals(other.preExtrapolation) ||
        !this.postExtrapolation.equals(other.postExtrapolation) ||
        !this.loopParams.equals(other.loopParams) ||
        this.customData.size !== other.customData.size) {
      return false
    }
    for (const [time, dict] of this.customData) {
      const o = other.customData.get(time)
      if (o === undefined || JSON.stringify(o) !== JSON.stringify(dict)) return false
    }
    if (this.valueType !== other.valueType) return false
    return this.knots.length === other.knots.length &&
      this.knots.every((k, i) => k.equals(other.knots[i]!))
  }

  reserveForKnotCount(_count: number): void {}

  // splineData.h:322-336.
  pushKnot(knotData: Ts_TypedKnotData, customData?: Ts_CustomData): void {
    this.times.push(knotData.time)
    this.knots.push(knotData.clone())
    if (customData && Object.keys(customData).length > 0) {
      this.customData.set(knotData.time, _CopyHeldValue(customData) as Ts_CustomData)
    }
  }

  // splineData.h:376-414.
  setKnot(knotData: Ts_TypedKnotData, customData?: Ts_CustomData): number {
    const idx = Ts_LowerBound(this.times, knotData.time)
    const overwrite = idx < this.times.length && this.times[idx] === knotData.time
    if (overwrite) {
      this.times[idx] = knotData.time
      this.knots[idx] = knotData.clone()
    } else {
      this.times.splice(idx, 0, knotData.time)
      this.knots.splice(idx, 0, knotData.clone())
    }
    if (customData && Object.keys(customData).length > 0) {
      this.customData.set(knotData.time, _CopyHeldValue(customData) as Ts_CustomData)
    }
    return idx
  }

  // splineData.h:416-476: double data needs no conversion.
  setKnotFromDouble(knotData: Ts_TypedKnotData, customData?: Ts_CustomData): number {
    return this.setKnot(knotData, customData)
  }

  cloneKnotAtIndex(index: number): Ts_TypedKnotData { return this.knots[index]!.clone() }

  cloneKnotAtTime(time: number): Ts_TypedKnotData | undefined {
    const i = Ts_LowerBound(this.times, time)
    if (i === this.times.length || this.times[i] !== time) return undefined
    return this.knots[i]!.clone()
  }

  /** Live (mutable) knot record, like GetKnotPtrAtIndex. */
  getKnotPtrAtIndex(index: number): Ts_TypedKnotData { return this.knots[index]! }

  getKnotDataAsDouble(index: number): Ts_TypedKnotData { return this.knots[index]!.clone() }
  getKnotValueAsDouble(index: number): number { return this.knots[index]!.value }
  getKnotPreValueAsDouble(index: number): number { return this.knots[index]!.getPreValue() }

  clearKnots(): void {
    this.times = []
    this.customData.clear()
    this.knots = []
  }

  // splineData.h:571-597.
  removeKnotAtTime(time: number): void {
    const idx = Ts_LowerBound(this.times, time)
    if (idx === this.times.length || this.times[idx] !== time) {
      return
    }
    this.times.splice(idx, 1)
    this.customData.delete(time)
    this.knots.splice(idx, 1)
    if (idx > 0) {
      this.updateKnotTangentsAtIndex(idx - 1)
    }
    if (idx < this.times.length) {
      this.updateKnotTangentsAtIndex(idx)
    }
  }

  // splineData.h:599-722.
  applyOffsetAndScale(offset: number, scale: number): void {
    if (scale < 0 && this.hasInnerLoops()) {
      return
    }

    if (scale < 0) {
      [this.preExtrapolation, this.postExtrapolation] =
        [this.postExtrapolation, this.preExtrapolation]
    }

    if (this.preExtrapolation.isLooping() && this.preExtrapolation.loopBoundaryTime !== undefined) {
      this.preExtrapolation.loopBoundaryTime = this.preExtrapolation.loopBoundaryTime * scale + offset
    }
    if (this.postExtrapolation.isLooping() && this.postExtrapolation.loopBoundaryTime !== undefined) {
      this.postExtrapolation.loopBoundaryTime = this.postExtrapolation.loopBoundaryTime * scale + offset
    }

    const lp = this.loopParams
    if (lp.protoEnd > lp.protoStart) {
      lp.protoStart = lp.protoStart * scale + offset
      lp.protoEnd = lp.protoEnd * scale + offset
    }

    this.times = this.times.map(time => time * scale + offset)

    if (scale < 0) {
      this.times.reverse()
      const knots = this.knots
      for (let i = 0; i < knots.length; i++) {
        const idx = knots.length - 1 - i
        const reversedKnot = new Ts_TypedKnotData()
        const knot = knots[idx]!.clone()
        if (knot.dualValued) {
          reversedKnot.value = knot.preValue
          reversedKnot.dualValued = true
          reversedKnot.preValue = knot.value
        } else {
          reversedKnot.value = knot.value
        }
        reversedKnot.time = knot.time
        reversedKnot.preTanWidth = knot.postTanWidth
        reversedKnot.postTanWidth = knot.preTanWidth
        reversedKnot.preTanSlope = knot.postTanSlope
        reversedKnot.postTanSlope = knot.preTanSlope
        reversedKnot.preTanAlgorithm = knot.postTanAlgorithm
        reversedKnot.postTanAlgorithm = knot.preTanAlgorithm
        if (idx > 0) {
          reversedKnot.nextInterp = knots[idx - 1]!.nextInterp
        }
        knots[idx] = reversedKnot
      }
      knots.reverse()
    }

    const applyToKnot = (k: Ts_TypedKnotData): void => {
      k.time = k.time * scale + offset
      k.preTanWidth *= Math.abs(scale)
      k.postTanWidth *= Math.abs(scale)
    }

    if (this.valueType.getTypeName() === 'GfDuration') {
      // splineData.h:729-738: relative durations scale without an offset.
      for (const k of this.knots) { applyToKnot(k); k.value *= scale; k.preValue *= scale }
    } else if (this.timeValued || this.valueType.getTypeName() === 'GfTimeCode') {
      for (const k of this.knots) {
        applyToKnot(k)
        k.value = k.value * scale + offset
        k.preValue = k.preValue * scale + offset
      }
    } else {
      for (const k of this.knots) {
        applyToKnot(k)
        k.preTanSlope /= scale
        k.postTanSlope /= scale
      }
      if (this.preExtrapolation.mode === TsExtrapMode.Sloped) {
        this.preExtrapolation.slope /= scale
      }
      if (this.postExtrapolation.mode === TsExtrapMode.Sloped) {
        this.postExtrapolation.slope /= scale
      }
    }

    if (this.customData.size > 0) {
      const newCustomData = new Map<number, Ts_CustomData>()
      for (const [time, dict] of this.customData) newCustomData.set(time * scale + offset, dict)
      this.customData = newCustomData
    }
  }

  // splineData.h:724-751.
  hasValueBlocks(): boolean {
    if (this.knots.length === 0) return false
    if (this.preExtrapolation.mode === TsExtrapMode.ValueBlock ||
        this.postExtrapolation.mode === TsExtrapMode.ValueBlock) {
      return true
    }
    return this.knots.some(k => k.nextInterp === TsInterpMode.ValueBlock)
  }

  // splineData.h:753-792.
  hasValueBlockAtTime(time: number): boolean {
    if (this.knots.length === 0) return false
    const lb = Ts_LowerBound(this.times, time)
    if (lb === this.times.length) {
      return this.postExtrapolation.mode === TsExtrapMode.ValueBlock
    }
    if (this.times[lb] === time) {
      return this.knots[lb]!.nextInterp === TsInterpMode.ValueBlock
    }
    if (lb === 0) {
      return this.preExtrapolation.mode === TsExtrapMode.ValueBlock
    }
    return this.knots[lb - 1]!.nextInterp === TsInterpMode.ValueBlock
  }

  // splineData.h:794-812.
  updateKnotTangentsAtIndex(index: number): boolean {
    if (index < 0 || index >= this.knots.length) {
      return false
    }
    const prevKnot = index > 0 ? this.knots[index - 1] : undefined
    const knot = this.knots[index]!
    const nextKnot = index < this.knots.length - 1 ? this.knots[index + 1] : undefined
    return knot.updateTangents(prevKnot, nextKnot, this.curveType)
  }

  // splineData.cpp:72-104. If firstProtoIndexOut is given, its value receives
  // the index of the first prototype knot.
  hasInnerLoops(firstProtoIndexOut?: { value: number }): boolean {
    const lp = this.loopParams
    if (lp.protoEnd <= lp.protoStart) return false
    if (!lp.numPreLoops && !lp.numPostLoops) return false
    const it = Ts_LowerBound(this.times, lp.protoStart)
    if (it === this.times.length || this.times[it] !== lp.protoStart) return false
    if (firstProtoIndexOut) firstProtoIndexOut.value = it
    return true
  }

  // splineData.cpp:106-120.
  getPreExtrapTime(): number {
    if (this.times.length === 0) return 0.0
    let result = this.times[0]!
    if (this.hasInnerLoops()) {
      const lp = this.loopParams
      const loopSpan = lp.protoEnd - lp.protoStart
      result = Math.min(result, lp.protoStart - lp.numPreLoops * loopSpan)
    }
    return result
  }

  // splineData.cpp:122-136.
  getPostExtrapTime(): number {
    if (this.times.length === 0) return 0.0
    let result = this.times[this.times.length - 1]!
    if (this.hasInnerLoops()) {
      const lp = this.loopParams
      const loopSpan = lp.protoEnd - lp.protoStart
      result = Math.max(result, lp.protoEnd + lp.numPostLoops * loopSpan)
    }
    return result
  }

  // splineData.cpp:138-156.
  getPreExtrapValue(): number {
    if (this.times.length === 0) return 0.0
    const first = { value: 0 }
    if (this.hasInnerLoops(first)) {
      const lp = this.loopParams
      const loopSpan = lp.protoEnd - lp.protoStart
      const loopBegin = lp.protoStart - lp.numPreLoops * loopSpan
      if (loopBegin <= this.times[0]!) {
        return this.getKnotPreValueAsDouble(first.value) - lp.numPreLoops * lp.valueOffset
      }
    }
    return this.getKnotPreValueAsDouble(0)
  }

  // splineData.cpp:158-176.
  getPostExtrapValue(): number {
    if (this.times.length === 0) return 0.0
    const first = { value: 0 }
    if (this.hasInnerLoops(first)) {
      const lp = this.loopParams
      const loopSpan = lp.protoEnd - lp.protoStart
      const loopEnd = lp.protoEnd + lp.numPostLoops * loopSpan
      if (loopEnd >= this.times[this.times.length - 1]!) {
        return this.getKnotValueAsDouble(first.value) + (lp.numPostLoops + 1) * lp.valueOffset
      }
    }
    return this.getKnotValueAsDouble(this.times.length - 1)
  }
}

export class Ts_TypedSplineData extends Ts_SplineData {}
