// Ported from OpenUSD 26.11.1: pxr/base/ts/eval.cpp, pxr/base/ts/eval.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Interval as GfInterval } from 'typescript-usd/gf'
import { Ts_TypedKnotData } from './knotData.ts'
import { Ts_RegressionPreventerBatchAccess } from './regressionPreventer.ts'
import { Ts_BinarySearch, Ts_LowerBound, Ts_SplineData, Ts_UpperBound } from './splineData.ts'
import {
  TsAntiRegressionMode, TsCurveType, TsExtrapMode, TsExtrapolation, TsInterpMode,
  TsTangentAlgorithm,
} from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/eval.h and eval.cpp.

// eval.h:23-36.
export enum Ts_EvalAspect {
  Value,
  HeldValue,
  Derivative,
}
export enum Ts_EvalLocation {
  Pre,
  AtTime,
  Post,
}
export const Ts_EvalValue = Ts_EvalAspect.Value
export const Ts_EvalHeldValue = Ts_EvalAspect.HeldValue
export const Ts_EvalDerivative = Ts_EvalAspect.Derivative
export const Ts_EvalPre = Ts_EvalLocation.Pre
export const Ts_EvalAtTime = Ts_EvalLocation.AtTime
export const Ts_EvalPost = Ts_EvalLocation.Post

// eval.cpp:25.
const _parameterEpsilon = 1.0e-10

////////////////////////////////////////////////////////////////////////////////
// BEZIER MATH (eval.cpp:27-367)

interface _Quadratic { a: number, b: number, c: number }
interface _Cubic { a: number, b: number, c: number, d: number }

function _QuadEval(q: _Quadratic, t: number): number {
  return t * (t * q.a + q.b) + q.c
}
function _CubicFromPoints(p0: number, p1: number, p2: number, p3: number): _Cubic {
  return {
    a: -p0 + 3 * p1 - 3 * p2 + p3,
    b: 3 * p0 - 6 * p1 + 3 * p2,
    c: -3 * p0 + 3 * p1,
    d: p0,
  }
}
function _CubicEval(c: _Cubic, t: number): number {
  return t * (t * (t * c.a + c.b) + c.c) + c.d
}
function _CubicDerivative(c: _Cubic): _Quadratic {
  return { a: 3 * c.a, b: 2 * c.b, c: c.c }
}

// eval.cpp:96-158.
function _FilterZeros(z0: number, z1: number, z2?: number): number {
  let result = z0
  let minError = Math.abs(z0 - 0.5)
  let error = Math.abs(z1 - 0.5)
  if (error < minError) {
    result = z1
    minError = error
  }
  if (z2 !== undefined) {
    error = Math.abs(z2 - 0.5)
    if (error < minError) {
      result = z2
      minError = error
    }
  }
  return result
}

// eval.cpp:167-174.
function _FindMonotonicZeroQuadratic(quad: _Quadratic): number {
  const discrim = Math.sqrt(Math.pow(quad.b, 2) - 4 * quad.a * quad.c)
  const root0 = (-quad.b - discrim) / (2 * quad.a)
  const root1 = (-quad.b + discrim) / (2 * quad.a)
  return _FilterZeros(root0, root1)
}

// eval.cpp:181-219.
function _FindMonotonicZeroNormalizedCubic(b: number, c: number, d: number): number {
  const p = (3 * c - b * b) / 3
  const p3 = p / 3
  const p33 = p3 * p3 * p3
  const q = (2 * b * b * b - 9 * b * c + 27 * d) / 27
  const q2 = q / 2
  const discrim = q2 * q2 + p33
  const b3 = b / 3

  if (discrim < 0) {
    const r = Math.sqrt(-p33)
    const t = -q / (2 * r)
    const phi = Math.acos(Math.min(Math.max(t, -1), 1))
    const t1 = 2 * Math.cbrt(r)
    const root1 = t1 * Math.cos(phi / 3) - b3
    const root2 = t1 * Math.cos((phi + 2 * Math.PI) / 3) - b3
    const root3 = t1 * Math.cos((phi + 4 * Math.PI) / 3) - b3
    return _FilterZeros(root1, root2, root3)
  } else if (discrim === 0) {
    const u1 = -Math.cbrt(q2)
    const root1 = 2 * u1 - b3
    const root2 = -u1 - b3
    return _FilterZeros(root1, root2)
  } else {
    const sd = Math.sqrt(discrim)
    const u1 = Math.cbrt(sd - q2)
    const v1 = Math.cbrt(sd + q2)
    return u1 - v1 - b3
  }
}

// eval.cpp:231-275. GfIsClose(a, 0, eps) is |a| < eps (gf/math.h).
function _FindMonotonicZero(cubic: _Cubic): number {
  const epsilon = 1e-10
  const aZero = Math.abs(cubic.a) < epsilon
  const bZero = Math.abs(cubic.b) < epsilon
  const cZero = Math.abs(cubic.c) < epsilon

  if (aZero && bZero && cZero) {
    return 0.0
  }
  if (aZero && bZero) {
    return -cubic.d / cubic.c
  }
  if (aZero) {
    return _FindMonotonicZeroQuadratic({ a: cubic.b, b: cubic.c, c: cubic.d })
  }
  return _FindMonotonicZeroNormalizedCubic(
    cubic.b / cubic.a, cubic.c / cubic.a, cubic.d / cubic.a)
}

// eval.cpp:284-318.
export function _FindBezierParameter(
  beginData: Ts_TypedKnotData,
  endData: Ts_TypedKnotData,
  time: number,
): number {
  const timeCubic = _CubicFromPoints(
    beginData.time - time,
    beginData.time + beginData.getPostTanWidth() - time,
    endData.time - endData.getPreTanWidth() - time,
    endData.time - time)

  let t = _FindMonotonicZero(timeCubic)
  if (t < 0) {
    t = 0
  } else if (t > 1) {
    t = 1
  }
  return t
}

// eval.cpp:320-362.
export function _EvalBezier(
  beginDataIn: Ts_TypedKnotData,
  endDataIn: Ts_TypedKnotData,
  time: number,
  aspect: Ts_EvalAspect,
): number {
  const beginData = beginDataIn.clone()
  const endData = endDataIn.clone()
  Ts_RegressionPreventerBatchAccess.processSegment(
    beginData, endData, TsAntiRegressionMode.KeepRatio)

  const t = _FindBezierParameter(beginData, endData, time)

  const valueCubic = _CubicFromPoints(
    beginData.value,
    beginData.value + beginData.getPostTanHeight(),
    endData.getPreValue() + endData.getPreTanHeight(),
    endData.getPreValue())

  if (aspect === Ts_EvalAspect.Value) {
    return _CubicEval(valueCubic, t)
  }

  const timeCubic = _CubicFromPoints(
    beginData.time,
    beginData.time + beginData.getPostTanWidth(),
    endData.time - endData.getPreTanWidth(),
    endData.time)

  const valueDeriv = _CubicDerivative(valueCubic)
  const timeDeriv = _CubicDerivative(timeCubic)
  return _QuadEval(valueDeriv, t) / _QuadEval(timeDeriv, t)
}

////////////////////////////////////////////////////////////////////////////////
// HERMITE MATH (eval.cpp:367-480)

export function _EvalHermite(
  beginData: Ts_TypedKnotData,
  endData: Ts_TypedKnotData,
  time: number,
  aspect: Ts_EvalAspect,
): number {
  const t0 = beginData.time
  const v0 = beginData.value
  const m0 = beginData.postTanSlope

  const t1 = endData.time
  const v1 = endData.getPreValue()
  const m1 = endData.preTanSlope

  if (!(t0 < t1)) {
    return v0
  }

  const dt = t1 - t0
  const dv = v1 - v0

  const u = (time - t0) / dt
  const um0 = m0 * dt
  const um1 = m1 * dt

  const a = -2 * dv + um0 + um1
  const b = 3 * dv - 2 * um0 - um1
  const c = um0
  const d = v0

  if (aspect === Ts_EvalAspect.Derivative) {
    return (u * (u * 3 * a + 2 * b) + c) / dt
  }
  return u * (u * (u * a + b) + c) + d
}

////////////////////////////////////////////////////////////////////////////////
// EVAL HELPERS (eval.cpp:482-605)

function _GetSegmentSlope(beginData: Ts_TypedKnotData, endData: Ts_TypedKnotData): number {
  return (endData.getPreValue() - beginData.value) / (endData.time - beginData.time)
}

export function _GetExtrapolationSlope(
  extrap: TsExtrapolation,
  haveMultipleKnots: boolean,
  endKnotData: Ts_TypedKnotData,
  adjacentData: Ts_TypedKnotData,
  location: Ts_EvalLocation,
): number | undefined {
  if (extrap.mode === TsExtrapMode.ValueBlock) {
    return undefined
  }
  if (extrap.mode === TsExtrapMode.Held) {
    return 0.0
  }
  if (extrap.mode === TsExtrapMode.Sloped) {
    return extrap.slope
  }
  if (!haveMultipleKnots) {
    return 0.0
  }
  if (extrap.mode !== TsExtrapMode.Linear) {
    return 0.0
  }
  if (endKnotData.dualValued) {
    return 0.0
  }

  if (location === Ts_EvalLocation.Pre) {
    if (endKnotData.nextInterp === TsInterpMode.Held ||
        endKnotData.nextInterp === TsInterpMode.ValueBlock) {
      return 0.0
    }
    if (endKnotData.nextInterp === TsInterpMode.Linear) {
      return _GetSegmentSlope(endKnotData, adjacentData)
    }
    return endKnotData.postTanSlope
  } else {
    if (adjacentData.nextInterp === TsInterpMode.Held ||
        adjacentData.nextInterp === TsInterpMode.ValueBlock) {
      return 0.0
    }
    if (adjacentData.nextInterp === TsInterpMode.Linear) {
      return _GetSegmentSlope(adjacentData, endKnotData)
    }
    return endKnotData.preTanSlope
  }
}

function _ExtrapolateLinear(
  knotData: Ts_TypedKnotData,
  slope: number,
  time: number,
  location: Ts_EvalLocation,
): number {
  if (location === Ts_EvalLocation.Pre) {
    return knotData.getPreValue() - slope * (knotData.time - time)
  }
  return knotData.value + slope * (time - knotData.time)
}

////////////////////////////////////////////////////////////////////////////////
// LOOPING (eval.cpp:607-1350)

class _LoopResolver {
  readonly #data: Ts_SplineData
  readonly #aspect: Ts_EvalAspect

  #evalTime: number
  #location: Ts_EvalLocation

  #valueOffset = 0
  #negate = false
  #betweenLastProtoAndEnd = false

  #haveInnerLoops = false
  #firstInnerProtoIndex = 0
  #havePreExtrapLoops = false
  #havePostExtrapLoops = false
  #firstTime = 0
  #lastTime = 0
  #firstTimeLooped = false
  #lastTimeLooped = false
  #doPreExtrap = false
  #doPostExtrap = false
  #extrapValueOffset = 0
  #betweenPreUnloopedAndLooped = false
  #betweenLoopedAndPostUnlooped = false
  #extrapKnot1 = new Ts_TypedKnotData()
  #extrapKnot2 = new Ts_TypedKnotData()
  #invalidPreExtrapLoop = false
  #invalidPostExtrapLoop = false

  // eval.cpp:740-813.
  constructor(data: Ts_SplineData, timeIn: number, aspect: Ts_EvalAspect, location: Ts_EvalLocation) {
    this.#data = data
    this.#aspect = aspect
    this.#evalTime = timeIn
    this.#location = location

    const first = { value: 0 }
    this.#haveInnerLoops = data.hasInnerLoops(first)
    this.#firstInnerProtoIndex = first.value

    const haveMultipleKnots = this.#haveInnerLoops || data.times.length > 1

    this.#havePreExtrapLoops = haveMultipleKnots && data.preExtrapolation.isLooping()
    this.#havePostExtrapLoops = haveMultipleKnots && data.postExtrapolation.isLooping()

    if (!this.#haveInnerLoops && !this.#havePreExtrapLoops && !this.#havePostExtrapLoops) {
      return
    }

    const rawFirstTime = this.#firstTime = data.times[0]!
    const rawLastTime = this.#lastTime = data.times[data.times.length - 1]!
    if (this.#haveInnerLoops) {
      const loopedInterval = data.loopParams.getLoopedInterval()
      if (loopedInterval.getMin() < rawFirstTime) {
        this.#firstTime = loopedInterval.getMin()
        this.#firstTimeLooped = true
      }
      if (loopedInterval.getMax() > rawLastTime) {
        this.#lastTime = loopedInterval.getMax()
        this.#lastTimeLooped = true
      }
    }

    if (this.#havePreExtrapLoops || this.#havePostExtrapLoops) {
      this.#resolveExtrap()
    }
    if (this.#haveInnerLoops) {
      this.#resolveInner()
    }
  }

  getEvalTime(): number { return this.#evalTime }
  getEvalLocation(): Ts_EvalLocation { return this.#location }
  isBetweenLastProtoAndEnd(): boolean { return this.#betweenLastProtoAndEnd }
  getValueOffset(): number { return this.#valueOffset }
  getNegate(): boolean { return this.#negate }
  hasInvalidPreExtrapLoop(): boolean { return this.#invalidPreExtrapLoop }
  hasInvalidPostExtrapLoop(): boolean { return this.#invalidPostExtrapLoop }

  // eval.cpp:815-1018.
  #resolveInner(): void {
    const lp = this.#data.loopParams
    const loopedInterval = lp.getLoopedInterval()
    const protoInterval = lp.getPrototypeInterval()

    if (loopedInterval.contains(this.#evalTime) && !protoInterval.contains(this.#evalTime)) {
      const protoSpan = protoInterval.getSize()

      if (this.#evalTime < lp.protoStart) {
        const loopOffset = lp.protoStart - this.#evalTime
        const iterNum = Math.trunc(Math.ceil(loopOffset / protoSpan))
        this.#evalTime += iterNum * protoSpan
        if (this.#aspect === Ts_EvalAspect.Value) {
          this.#valueOffset -= iterNum * lp.valueOffset
        }
      } else {
        const loopOffset = this.#evalTime - lp.protoEnd
        const iterNum = Math.trunc(loopOffset / protoSpan) + 1
        this.#evalTime -= iterNum * protoSpan
        if (this.#aspect === Ts_EvalAspect.Value) {
          this.#valueOffset += iterNum * lp.valueOffset
        }
      }
    }

    const times = this.#data.times
    const firstProtoIt = this.#firstInnerProtoIndex

    if (protoInterval.contains(this.#evalTime)) {
      // Case 1.
      const lbIt = Ts_LowerBound(times, lp.protoEnd, firstProtoIt)
      const lastProtoKnotTime = times[lbIt - 1]!
      if (this.#evalTime > lastProtoKnotTime) {
        this.#betweenLastProtoAndEnd = true
      }
    } else if (this.#evalTime < this.#firstTime) {
      // Case 2.
      if (this.#firstTimeLooped) {
        this.#extrapKnot1 = this.#copyProtoKnotData(this.#firstInnerProtoIndex, -lp.numPreLoops)
        if (times.length > this.#firstInnerProtoIndex + 1 &&
            protoInterval.contains(times[this.#firstInnerProtoIndex + 1]!)) {
          this.#extrapKnot2 = this.#copyProtoKnotData(
            this.#firstInnerProtoIndex + 1, -lp.numPreLoops)
        } else {
          this.#extrapKnot2 = this.#copyProtoKnotData(
            this.#firstInnerProtoIndex, -lp.numPreLoops + 1)
        }
      }
    } else if (this.#evalTime > this.#lastTime) {
      // Case 3.
      if (this.#lastTimeLooped) {
        this.#extrapKnot1 = this.#copyProtoKnotData(this.#firstInnerProtoIndex, lp.numPostLoops + 1)
        const lastProtoIndex = Ts_LowerBound(times, lp.protoEnd, firstProtoIt) - 1
        this.#extrapKnot2 = this.#copyProtoKnotData(lastProtoIndex, lp.numPostLoops)
      }
    } else if (this.#evalTime < loopedInterval.getMin()) {
      // Case 4.
      const lbIt = Ts_LowerBound(times, loopedInterval.getMin(), 0, firstProtoIt)
      if (lbIt !== 0) {
        const lastPreUnloopedKnotTime = times[lbIt - 1]!
        if (this.#evalTime > lastPreUnloopedKnotTime) {
          this.#betweenPreUnloopedAndLooped = true
        }
      }
    } else if (this.#evalTime > loopedInterval.getMax()) {
      // Case 5.
      const ubIt = Ts_UpperBound(times, loopedInterval.getMax(), firstProtoIt + 1)
      if (ubIt !== times.length) {
        const firstPostUnloopedKnotTime = times[ubIt]!
        if (this.#evalTime < firstPostUnloopedKnotTime) {
          this.#betweenLoopedAndPostUnlooped = true
        }
      }
    }
  }

  // eval.cpp:1020-1067.
  #resolveExtrap(): void {
    const knotInterval = new GfInterval(
      this.#firstTime, this.#lastTime,
      this.#location !== Ts_EvalLocation.Pre,
      this.#location === Ts_EvalLocation.Pre)

    if (knotInterval.contains(this.#evalTime)) {
      return
    }

    this.#doPreExtrap = this.#havePreExtrapLoops && this.#evalTime < this.#lastTime
    this.#doPostExtrap = this.#havePostExtrapLoops && this.#evalTime > this.#firstTime
    if (!this.#doPreExtrap && !this.#doPostExtrap) {
      return
    }

    if (this.#doPreExtrap) {
      this.#doExtrap(this.#data.preExtrapolation, this.#firstTime - this.#evalTime, true)
    } else if (this.#doPostExtrap) {
      this.#doExtrap(this.#data.postExtrapolation, this.#evalTime - this.#lastTime, false)
    }
  }

  // eval.cpp:1073-1164.
  #doExtrap(extrapolation: TsExtrapolation, offset: number, isPre: boolean): void {
    let extrapLoopStart = this.#firstTime
    let extrapLoopEnd = this.#lastTime
    if (extrapolation.loopBoundaryTime !== undefined) {
      const boundary = extrapolation.loopBoundaryTime
      if (!Ts_BinarySearch(this.#data.times, boundary)) {
        if (isPre) this.#invalidPreExtrapLoop = true
        else this.#invalidPostExtrapLoop = true
        return
      }
      if (isPre) extrapLoopEnd = boundary
      else extrapLoopStart = boundary
    }
    const protoSpan = extrapLoopEnd - extrapLoopStart

    if (protoSpan === 0) {
      this.#evalTime = isPre ? this.#firstTime : this.#lastTime
      this.#location = isPre ? Ts_EvalLocation.Pre : Ts_EvalLocation.Post
      return
    }

    const numItersFrac = offset / protoSpan
    const numItersTrunc = Math.trunc(numItersFrac)
    const boundary = numItersTrunc === numItersFrac

    const shortOffset = boundary && (
      (isPre && this.#location !== Ts_EvalLocation.Pre) ||
      (!isPre && this.#location === Ts_EvalLocation.Pre))
    const numIters = shortOffset ? numItersTrunc : numItersTrunc + 1

    const iterHop = isPre ? numIters : -numIters

    this.#evalTime += iterHop * protoSpan

    if (extrapolation.mode === TsExtrapMode.LoopRepeat &&
        this.#aspect !== Ts_EvalAspect.Derivative) {
      this.#computeExtrapValueOffset(extrapLoopStart, extrapLoopEnd, isPre)
      this.#valueOffset -= iterHop * this.#extrapValueOffset
    } else if (extrapolation.mode === TsExtrapMode.LoopOscillate && iterHop % 2 !== 0) {
      this.#evalTime = extrapLoopStart + (protoSpan - (this.#evalTime - extrapLoopStart))
      this.#location = this.#location === Ts_EvalLocation.Pre
        ? Ts_EvalLocation.Post
        : Ts_EvalLocation.Pre
      if (this.#aspect === Ts_EvalAspect.Derivative) {
        this.#negate = true
      }
    }
  }

  // eval.cpp:1166-1243.
  #computeExtrapValueOffset(extrapLoopStart: number, extrapLoopEnd: number, isPre: boolean): void {
    const data = this.#data
    const times = data.times
    const lp = data.loopParams

    let firstValue: number
    if (extrapLoopStart !== this.#firstTime) {
      const index = Ts_LowerBound(times, extrapLoopStart)
      const k = data.getKnotDataAsDouble(index)
      firstValue = isPre ? k.getPreValue() : k.value
    } else if (!this.#firstTimeLooped) {
      const k = data.getKnotDataAsDouble(0)
      firstValue = isPre ? k.getPreValue() : k.value
    } else {
      const k = data.getKnotDataAsDouble(this.#firstInnerProtoIndex)
      firstValue = (isPre ? k.getPreValue() : k.value) - lp.numPreLoops * lp.valueOffset
    }

    let lastValue: number
    if (extrapLoopEnd !== this.#lastTime) {
      const index = Ts_LowerBound(times, extrapLoopEnd)
      const k = data.getKnotDataAsDouble(index)
      lastValue = isPre ? k.getPreValue() : k.value
    } else if (!this.#lastTimeLooped) {
      const k = data.getKnotDataAsDouble(times.length - 1)
      lastValue = isPre ? k.getPreValue() : k.value
    } else {
      const k = data.getKnotDataAsDouble(this.#firstInnerProtoIndex)
      lastValue = (isPre ? k.getPreValue() : k.value) + (lp.numPostLoops + 1) * lp.valueOffset
    }

    this.#extrapValueOffset = lastValue - firstValue
  }

  // eval.cpp:1249-1300. Returns the possibly replaced knots and whether each
  // was generated by looping.
  replaceBoundaryKnots(prevData: Ts_TypedKnotData, nextData: Ts_TypedKnotData):
    { prevData: Ts_TypedKnotData, nextData: Ts_TypedKnotData, generatedPrev: boolean, generatedNext: boolean } {
    const lp = this.#data.loopParams
    let generatedPrev = false
    let generatedNext = false

    if (this.#betweenLastProtoAndEnd) {
      nextData = this.#copyProtoKnotData(this.#firstInnerProtoIndex, 1)
      generatedNext = true
    } else if (this.#betweenPreUnloopedAndLooped) {
      nextData = this.#copyProtoKnotData(this.#firstInnerProtoIndex, -lp.numPreLoops)
      generatedNext = true
    } else if (this.#betweenLoopedAndPostUnlooped) {
      prevData = this.#copyProtoKnotData(this.#firstInnerProtoIndex, lp.numPostLoops + 1)
      generatedPrev = true
    }
    return { prevData, nextData, generatedPrev, generatedNext }
  }

  // eval.cpp:1302-1320.
  replacePreExtrapKnots(nextData: Ts_TypedKnotData, nextData2: Ts_TypedKnotData):
    { nextData: Ts_TypedKnotData, nextData2: Ts_TypedKnotData, generatedNext: boolean } {
    if (!this.#firstTimeLooped) {
      return { nextData, nextData2, generatedNext: false }
    }
    return { nextData: this.#extrapKnot1.clone(), nextData2: this.#extrapKnot2.clone(), generatedNext: true }
  }

  // eval.cpp:1322-1340.
  replacePostExtrapKnots(prevData: Ts_TypedKnotData, prevData2: Ts_TypedKnotData):
    { prevData: Ts_TypedKnotData, prevData2: Ts_TypedKnotData, generatedPrev: boolean } {
    if (!this.#lastTimeLooped) {
      return { prevData, prevData2, generatedPrev: false }
    }
    return { prevData: this.#extrapKnot1.clone(), prevData2: this.#extrapKnot2.clone(), generatedPrev: true }
  }

  // eval.cpp:1342-1366.
  #copyProtoKnotData(index: number, shiftIters: number): Ts_TypedKnotData {
    const lp = this.#data.loopParams
    const protoSpan = lp.getPrototypeInterval().getSize()
    const knotCopy = this.#data.getKnotDataAsDouble(index)
    knotCopy.time += shiftIters * protoSpan
    if (this.#aspect === Ts_EvalAspect.Value) {
      const offset = shiftIters * lp.valueOffset
      knotCopy.value += offset
      if (knotCopy.dualValued) {
        knotCopy.preValue += offset
      }
    }
    return knotCopy
  }
}

////////////////////////////////////////////////////////////////////////////////
// MAIN EVALUATION (eval.cpp:1368-1680)

function _Interpolate(
  beginData: Ts_TypedKnotData,
  endData: Ts_TypedKnotData,
  time: number,
  aspect: Ts_EvalAspect,
  curveType: TsCurveType,
): number | undefined {
  if (beginData.nextInterp === TsInterpMode.ValueBlock) {
    return undefined
  }
  if (aspect === Ts_EvalAspect.HeldValue) {
    return beginData.value
  }
  if (beginData.nextInterp === TsInterpMode.Curve) {
    return curveType === TsCurveType.Bezier
      ? _EvalBezier(beginData, endData, time, aspect)
      : _EvalHermite(beginData, endData, time, aspect)
  }
  if (beginData.nextInterp === TsInterpMode.Held) {
    return aspect === Ts_EvalAspect.Value ? beginData.value : 0.0
  }
  if (beginData.nextInterp === TsInterpMode.Linear) {
    const slope = _GetSegmentSlope(beginData, endData)
    if (aspect === Ts_EvalAspect.Derivative) {
      return slope
    }
    return _ExtrapolateLinear(beginData, slope, time, Ts_EvalLocation.Post)
  }
  return undefined
}

function _EvalMain(data: Ts_SplineData, loopRes: _LoopResolver, aspect: Ts_EvalAspect): number | undefined {
  const time = loopRes.getEvalTime()
  const location = loopRes.getEvalLocation()
  const times = data.times
  const n = times.length

  const lbIt = Ts_LowerBound(times, time)
  const atKnot = lbIt !== n && times[lbIt] === time
  const prevIt = lbIt !== 0 ? lbIt - 1 : n
  const knotIt = atKnot ? lbIt : n
  const nextIt = atKnot ? lbIt + 1 : lbIt
  const beforeStart = nextIt === 0
  const afterEnd = loopRes.isBetweenLastProtoAndEnd() ? false : prevIt === n - 1
  const atFirst = knotIt === 0
  const atLast = knotIt === n - 1
  const haveMultipleKnots = n > 1

  let knotData = new Ts_TypedKnotData()
  let prevData = new Ts_TypedKnotData()
  let nextData = new Ts_TypedKnotData()
  if (knotIt !== n) knotData = data.getKnotDataAsDouble(knotIt)
  if (prevIt !== n) prevData = data.getKnotDataAsDouble(prevIt)
  if (nextIt < n) nextData = data.getKnotDataAsDouble(nextIt)

  if (atKnot) {
    if (aspect === Ts_EvalAspect.Value || aspect === Ts_EvalAspect.HeldValue) {
      if (location === Ts_EvalLocation.Pre) {
        if (atFirst) {
          if (data.preExtrapolation.mode === TsExtrapMode.ValueBlock ||
              loopRes.hasInvalidPreExtrapLoop()) {
            return undefined
          }
        } else {
          if (prevData.nextInterp === TsInterpMode.ValueBlock) {
            return undefined
          } else if (prevData.nextInterp === TsInterpMode.Held ||
                     aspect === Ts_EvalAspect.HeldValue) {
            return prevData.value
          }
        }
      } else {
        if (atLast) {
          if (data.postExtrapolation.mode === TsExtrapMode.ValueBlock ||
              loopRes.hasInvalidPostExtrapLoop()) {
            return undefined
          }
        } else {
          if (knotData.nextInterp === TsInterpMode.ValueBlock) {
            return undefined
          }
        }
      }
      return location === Ts_EvalLocation.Pre ? knotData.getPreValue() : knotData.value
    } else {
      if (location === Ts_EvalLocation.Pre) {
        if (atFirst) {
          return _GetExtrapolationSlope(
            data.preExtrapolation, haveMultipleKnots, knotData, nextData, Ts_EvalLocation.Pre)
        }
        switch (prevData.nextInterp) {
          case TsInterpMode.ValueBlock: return undefined
          case TsInterpMode.Held: return 0.0
          case TsInterpMode.Linear: return _GetSegmentSlope(prevData, knotData)
          case TsInterpMode.Curve: return knotData.preTanSlope
        }
      } else {
        if (atLast) {
          return _GetExtrapolationSlope(
            data.postExtrapolation, haveMultipleKnots, knotData, prevData, Ts_EvalLocation.Post)
        }
        switch (knotData.nextInterp) {
          case TsInterpMode.ValueBlock: return undefined
          case TsInterpMode.Held: return 0.0
          case TsInterpMode.Linear: return _GetSegmentSlope(knotData, nextData)
          case TsInterpMode.Curve: return knotData.postTanSlope
        }
      }
    }
  }

  if (beforeStart) {
    if (data.preExtrapolation.mode === TsExtrapMode.ValueBlock ||
        loopRes.hasInvalidPreExtrapLoop()) {
      return undefined
    }
    let nextData2 = new Ts_TypedKnotData()
    if (nextIt + 1 < n) {
      nextData2 = data.getKnotDataAsDouble(nextIt + 1)
    }
    ;({ nextData, nextData2 } = loopRes.replacePreExtrapKnots(nextData, nextData2))

    if (aspect === Ts_EvalAspect.HeldValue) {
      return nextData.getPreValue()
    }

    const slope = _GetExtrapolationSlope(
      data.preExtrapolation, haveMultipleKnots, nextData, nextData2, Ts_EvalLocation.Pre)
    if (slope === undefined) {
      return undefined
    }
    if (aspect === Ts_EvalAspect.Derivative) {
      return slope
    }
    return _ExtrapolateLinear(nextData, slope, time, Ts_EvalLocation.Pre)
  }

  if (afterEnd) {
    if (data.postExtrapolation.mode === TsExtrapMode.ValueBlock ||
        loopRes.hasInvalidPostExtrapLoop()) {
      return undefined
    }
    let prevData2 = new Ts_TypedKnotData()
    if (prevIt !== 0) {
      prevData2 = data.getKnotDataAsDouble(prevIt - 1)
    }
    ;({ prevData, prevData2 } = loopRes.replacePostExtrapKnots(prevData, prevData2))

    if (aspect === Ts_EvalAspect.HeldValue) {
      return prevData.value
    }

    const slope = _GetExtrapolationSlope(
      data.postExtrapolation, haveMultipleKnots, prevData, prevData2, Ts_EvalLocation.Post)
    if (slope === undefined) {
      return undefined
    }
    if (aspect === Ts_EvalAspect.Derivative) {
      return slope
    }
    return _ExtrapolateLinear(prevData, slope, time, Ts_EvalLocation.Post)
  }

  ;({ prevData, nextData } = loopRes.replaceBoundaryKnots(prevData, nextData))

  return _Interpolate(prevData, nextData, time, aspect, data.curveType)
}

// eval.cpp:1682-1708.
export function Ts_Eval(
  data: Ts_SplineData,
  timeIn: number,
  aspect: Ts_EvalAspect,
  location: Ts_EvalLocation,
): number | undefined {
  if (data.times.length === 0) {
    return undefined
  }
  const loopRes = new _LoopResolver(data, timeIn, aspect, location)
  const result = _EvalMain(data, loopRes, aspect)
  if (result === undefined) {
    return undefined
  }
  return (result + loopRes.getValueOffset()) * (loopRes.getNegate() ? -1 : 1)
}

////////////////////////////////////////////////////////////////////////////////
// BREAKDOWN (eval.cpp:1710-2304)

// eval.cpp:1712-1738.
function _BreakdownHermite(
  _data: Ts_SplineData,
  prevData: Ts_TypedKnotData,
  knotData: Ts_TypedKnotData,
  nextData: Ts_TypedKnotData,
): boolean {
  const value = _EvalHermite(prevData, nextData, knotData.time, Ts_EvalAspect.Value)
  const slope = _EvalHermite(prevData, nextData, knotData.time, Ts_EvalAspect.Derivative)

  knotData.value = value
  knotData.preTanSlope = slope
  knotData.postTanSlope = slope

  prevData.postTanAlgorithm = TsTangentAlgorithm.None
  knotData.preTanAlgorithm = TsTangentAlgorithm.None
  knotData.postTanAlgorithm = TsTangentAlgorithm.None
  nextData.preTanAlgorithm = TsTangentAlgorithm.None
  return true
}

type V2 = [number, number]
const lerp2 = (u: number, a: V2, b: V2): V2 => [(1 - u) * a[0] + u * b[0], (1 - u) * a[1] + u * b[1]]
const sub2 = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]]

// eval.cpp:1740-1864.
function _BreakdownBezier(
  _data: Ts_SplineData,
  prevData: Ts_TypedKnotData,
  knotData: Ts_TypedKnotData,
  nextData: Ts_TypedKnotData,
): boolean {
  Ts_RegressionPreventerBatchAccess.processSegment(
    prevData, nextData, TsAntiRegressionMode.KeepRatio)

  const u = _FindBezierParameter(prevData, nextData, knotData.time)

  const cp: [V2, V2, V2, V2] = [
    [prevData.time, prevData.value],
    [prevData.time + prevData.postTanWidth, prevData.value + prevData.getPostTanHeight()],
    [nextData.time - nextData.preTanWidth, nextData.getPreValue() + nextData.getPreTanHeight()],
    [nextData.time, nextData.getPreValue()],
  ]

  const cp01 = lerp2(u, cp[0], cp[1])
  const cp12 = lerp2(u, cp[1], cp[2])
  const cp23 = lerp2(u, cp[2], cp[3])
  const cp012 = lerp2(u, cp01, cp12)
  const cp123 = lerp2(u, cp12, cp23)
  const cp0123 = lerp2(u, cp012, cp123)

  const prevCp: [V2, V2, V2, V2] = [cp[0], cp01, cp012, cp0123]
  const nextCp: [V2, V2, V2, V2] = [cp0123, cp123, cp23, cp[3]]

  let prevDataPostTan = sub2(prevCp[1], prevCp[0])
  let knotDataPreTan = sub2(prevCp[3], prevCp[2])
  let knotDataPostTan = sub2(nextCp[1], nextCp[0])
  let nextDataPreTan = sub2(nextCp[3], nextCp[2])

  const _ConvertTangent = (tangent: V2): V2 => {
    const nearVertical = 200000.0
    if (tangent[0] === 0) {
      if (tangent[1] === 0) {
        return [0.0, 0.0]
      }
      // std::copysign(nearVertical, tangent[1]); tangent[1] is nonzero here.
      return [Math.abs(tangent[1]) / nearVertical, tangent[1] < 0 ? -nearVertical : nearVertical]
    }
    return [tangent[0], tangent[1] / tangent[0]]
  }

  prevDataPostTan = _ConvertTangent(prevDataPostTan)
  knotDataPreTan = _ConvertTangent(knotDataPreTan)
  knotDataPostTan = _ConvertTangent(knotDataPostTan)
  nextDataPreTan = _ConvertTangent(nextDataPreTan)

  prevData.postTanWidth = prevDataPostTan[0]
  prevData.postTanSlope = prevDataPostTan[1]

  knotData.preTanWidth = knotDataPreTan[0]
  knotData.preTanSlope = knotDataPreTan[1]

  knotData.value = cp0123[1]

  knotData.postTanWidth = knotDataPostTan[0]
  knotData.postTanSlope = knotDataPostTan[1]

  nextData.preTanWidth = nextDataPreTan[0]
  nextData.preTanSlope = nextDataPreTan[1]

  prevData.postTanAlgorithm = TsTangentAlgorithm.None
  knotData.preTanAlgorithm = TsTangentAlgorithm.None
  knotData.postTanAlgorithm = TsTangentAlgorithm.None
  nextData.preTanAlgorithm = TsTangentAlgorithm.None

  Ts_RegressionPreventerBatchAccess.processSegment(
    prevData, knotData, TsAntiRegressionMode.KeepRatio)
  Ts_RegressionPreventerBatchAccess.processSegment(
    knotData, nextData, TsAntiRegressionMode.KeepRatio)

  return true
}

// eval.cpp:1866-1902.
function _BreakdownBetweenKnots(
  data: Ts_SplineData,
  prevData: Ts_TypedKnotData,
  knotData: Ts_TypedKnotData,
  nextData: Ts_TypedKnotData,
): boolean {
  switch (prevData.nextInterp) {
    case TsInterpMode.ValueBlock:
      knotData.nextInterp = TsInterpMode.ValueBlock
      return true
    case TsInterpMode.Held:
      knotData.nextInterp = TsInterpMode.Held
      knotData.value = prevData.value
      return true
    case TsInterpMode.Linear: {
      const slope = _GetSegmentSlope(prevData, nextData)
      knotData.nextInterp = TsInterpMode.Linear
      knotData.value = _ExtrapolateLinear(prevData, slope, knotData.time, Ts_EvalLocation.Post)
      return true
    }
    case TsInterpMode.Curve:
      knotData.nextInterp = TsInterpMode.Curve
      return data.curveType === TsCurveType.Bezier
        ? _BreakdownBezier(data, prevData, knotData, nextData)
        : _BreakdownHermite(data, prevData, knotData, nextData)
  }
  return false
}

/** Outputs of Ts_Breakdown (the affectedIntervalOut and reason pointers). */
export interface Ts_BreakdownOut {
  affectedInterval: GfInterval
  reason: string
}

// eval.cpp:1904-2278.
function _BreakdownMain(
  data: Ts_SplineData,
  atTime: number,
  testOnly: boolean,
  loopRes: _LoopResolver,
  out: Ts_BreakdownOut,
): boolean {
  let idx: number
  const times = data.times

  const haveInnerLoops = data.hasInnerLoops()
  const haveMultipleKnots = haveInnerLoops || times.length > 1

  let loopedInterval = new GfInterval()
  if (haveInnerLoops) {
    const protoInterval = data.loopParams.getPrototypeInterval()
    loopedInterval = data.loopParams.getLoopedInterval()
    if (loopedInterval.contains(atTime) && !protoInterval.contains(atTime)) {
      out.reason = `Cannot breakdown a spline in a region masked by inner looping (time=${fmtG(atTime)}).`
      return false
    }
  }

  const knotInterval = new GfInterval(times[0]!, times[times.length - 1]!)
  if (haveInnerLoops) {
    knotInterval.unionWith(loopedInterval)
  }

  if (haveMultipleKnots &&
      ((atTime < knotInterval.getMin() && data.preExtrapolation.isLooping()) ||
       (atTime > knotInterval.getMax() && data.postExtrapolation.isLooping()))) {
    out.reason = `Cannot breakdown a spline in a region generated by extrapolation looping (time=${fmtG(atTime)}).`
    return false
  }

  if (loopRes.getEvalTime() !== atTime) {
    out.reason = `Verification failure: Cannot breakdown a spline in a looped region at time = ${fmtG(atTime)}. Please report a bug.`
    return false
  }

  const n = times.length
  const lbIt = Ts_LowerBound(times, atTime)

  const atKnot = lbIt !== n && times[lbIt] === atTime
  if (atKnot) {
    out.reason = `Cannot breakdown a spline at an existing knot. (time=${fmtG(atTime)})`
    return false
  }

  if (testOnly) {
    return true
  }

  out.affectedInterval = new GfInterval(atTime)

  const prevIt = lbIt !== 0 ? lbIt - 1 : n
  const nextIt = lbIt
  const beforeStart = nextIt === 0
  const afterEnd = !loopRes.isBetweenLastProtoAndEnd() && nextIt === n

  let prevData = new Ts_TypedKnotData()
  let nextData = new Ts_TypedKnotData()
  const knotData = new Ts_TypedKnotData()
  if (prevIt !== n) prevData = data.getKnotDataAsDouble(prevIt)
  if (nextIt !== n) nextData = data.getKnotDataAsDouble(nextIt)

  knotData.time = atTime

  if (beforeStart) {
    let nextData2 = new Ts_TypedKnotData()
    if (nextIt + 1 < n) {
      nextData2 = data.getKnotDataAsDouble(nextIt + 1)
    }
    const r = loopRes.replacePreExtrapKnots(nextData, nextData2)
    nextData = r.nextData
    nextData2 = r.nextData2
    const generatedNext = r.generatedNext

    if (data.preExtrapolation.mode === TsExtrapMode.ValueBlock) {
      knotData.nextInterp = TsInterpMode.ValueBlock
      idx = data.setKnotFromDouble(knotData)
      data.updateKnotTangentsAtIndex(idx)
      data.updateKnotTangentsAtIndex(idx + 1)
      out.affectedInterval.setMax(nextData.time, !generatedNext)
      return true
    }

    const slope = _GetExtrapolationSlope(
      data.preExtrapolation, haveMultipleKnots, nextData, nextData2, Ts_EvalLocation.Pre)
    if (slope === undefined) {
      out.reason = 'Verification failure: Cannot compute pre-extrapolation slope for spline breakdown. Please report a bug.'
      return false
    }

    knotData.value = _ExtrapolateLinear(nextData, slope, atTime, Ts_EvalLocation.Pre)

    switch (data.preExtrapolation.mode) {
      case TsExtrapMode.Held:
        knotData.nextInterp = TsInterpMode.Held
        break
      case TsExtrapMode.Linear:
      case TsExtrapMode.Sloped:
        knotData.nextInterp = TsInterpMode.Linear
        knotData.preTanSlope = knotData.postTanSlope = slope
        break
      default:
        out.reason = `Verification failure: Invalid pre-extrapolation mode (${TsExtrapMode[data.preExtrapolation.mode]}) when breaking down spline. Please report a bug.`
        return false
    }

    knotData.preTanWidth = nextData.preTanWidth
    knotData.preTanAlgorithm = nextData.preTanAlgorithm
    knotData.postTanWidth = (nextData.time - knotData.time) / 3
    knotData.postTanAlgorithm = nextData.preTanAlgorithm

    idx = data.setKnotFromDouble(knotData)
    data.updateKnotTangentsAtIndex(idx)
    data.updateKnotTangentsAtIndex(idx + 1)

    out.affectedInterval.setMax(nextData.time, !generatedNext)
    return true
  }

  if (afterEnd) {
    let prevData2 = new Ts_TypedKnotData()
    if (prevIt !== 0) {
      prevData2 = data.getKnotDataAsDouble(prevIt - 1)
    }
    const r = loopRes.replacePostExtrapKnots(prevData, prevData2)
    prevData = r.prevData
    prevData2 = r.prevData2
    const generatedPrev = r.generatedPrev

    if (data.postExtrapolation.mode === TsExtrapMode.ValueBlock) {
      knotData.nextInterp = TsInterpMode.ValueBlock
      let localIdx = data.setKnotFromDouble(knotData)
      // eval.cpp:2153-2154 assigns UpdateKnotTangentsAtIndex's bool result
      // back to the index.
      localIdx = data.updateKnotTangentsAtIndex(localIdx) ? 1 : 0
      data.updateKnotTangentsAtIndex(localIdx)
      out.affectedInterval = new GfInterval(atTime)

      prevData.nextInterp = TsInterpMode.ValueBlock
      localIdx = data.setKnotFromDouble(prevData)
      data.updateKnotTangentsAtIndex(localIdx)
      out.affectedInterval.setMin(prevData.time, !generatedPrev)
      return true
    }

    const slope = _GetExtrapolationSlope(
      data.postExtrapolation, haveMultipleKnots, prevData, prevData2, Ts_EvalLocation.Post)
    if (slope === undefined) {
      out.reason = 'Coding error: Cannot compute post-extrapolation slope in order to breakdown spline.'
      return false
    }

    knotData.value = _ExtrapolateLinear(prevData, slope, atTime, Ts_EvalLocation.AtTime)

    switch (data.postExtrapolation.mode) {
      case TsExtrapMode.Held:
        knotData.nextInterp = TsInterpMode.Held
        if (prevData.nextInterp !== TsInterpMode.Held) {
          prevData.nextInterp = TsInterpMode.Held
          idx = data.setKnotFromDouble(prevData)
          data.updateKnotTangentsAtIndex(idx)
        }
        break
      case TsExtrapMode.Linear:
      case TsExtrapMode.Sloped:
        knotData.nextInterp = TsInterpMode.Linear
        knotData.preTanSlope = knotData.postTanSlope = slope
        if (prevData.nextInterp !== TsInterpMode.Linear) {
          prevData.nextInterp = TsInterpMode.Linear
          idx = data.setKnotFromDouble(prevData)
          data.updateKnotTangentsAtIndex(idx)
        }
        break
      default:
        out.reason = `Verification failure: Invalid post-extrapolation mode (${TsExtrapMode[data.postExtrapolation.mode]}) when breaking down spline. Please report a bug.`
        return false
    }

    knotData.preTanWidth = (knotData.time - prevData.time) / 3
    knotData.preTanAlgorithm = prevData.postTanAlgorithm
    knotData.postTanWidth = prevData.postTanWidth
    knotData.postTanAlgorithm = prevData.postTanAlgorithm

    idx = data.setKnotFromDouble(knotData)
    data.updateKnotTangentsAtIndex(idx)
    data.updateKnotTangentsAtIndex(idx - 1)

    out.affectedInterval.setMin(prevData.time, !generatedPrev)
    return true
  }

  const r = loopRes.replaceBoundaryKnots(prevData, nextData)
  prevData = r.prevData
  nextData = r.nextData
  const { generatedPrev, generatedNext } = r

  const result = _BreakdownBetweenKnots(data, prevData, knotData, nextData)

  if (result) {
    if (!generatedPrev) {
      data.setKnotFromDouble(prevData)
    }
    idx = data.setKnotFromDouble(knotData)
    if (!generatedNext) {
      data.setKnotFromDouble(nextData)
    }

    data.updateKnotTangentsAtIndex(idx - 1)
    data.updateKnotTangentsAtIndex(idx)
    data.updateKnotTangentsAtIndex(idx + 1)

    out.affectedInterval = new GfInterval(
      prevData.time, nextData.time, !generatedPrev, !generatedNext)
  }

  return result
}

// eval.cpp:2283-2304.
export function Ts_Breakdown(
  data: Ts_SplineData,
  atTime: number,
  testOnly: boolean,
  out: Ts_BreakdownOut = { affectedInterval: new GfInterval(), reason: '' },
): boolean {
  if (data.times.length === 0) {
    out.reason = 'Cannot breakdown an empty spline.'
    return false
  }
  const loopRes = new _LoopResolver(data, atTime, Ts_EvalAspect.Value, Ts_EvalLocation.AtTime)
  return _BreakdownMain(data, atTime, testOnly, loopRes, out)
}

/** printf %g formatting, used by TfStringPrintf reasons. */
function fmtG(value: number): string {
  if (value === 0) return '0'
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : value < 0 ? '-inf' : 'nan'
  const exp = Math.floor(Math.log10(Math.abs(value)))
  if (exp < -4 || exp >= 6) {
    const [m, e] = value.toExponential(5).split('e') as [string, string]
    const mant = m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m
    const en = Number(e)
    return `${mant}e${en < 0 ? '-' : '+'}${String(Math.abs(en)).padStart(2, '0')}`
  }
  const s = value.toPrecision(6)
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s
}
