// Ported from OpenUSD 26.11.1: pxr/base/ts/sample.cpp, pxr/base/ts/sample.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Interval as GfInterval } from 'typescript-usd/gf'
import { Ts_Breakdown, type Ts_BreakdownOut } from './eval.ts'
import { Ts_SegmentIterator, Ts_SegmentKnotIterator } from './iterator.ts'
import { Ts_TypedKnotData } from './knotData.ts'
import { Ts_RegressionPreventerBatchAccess } from './regressionPreventer.ts'
import { Ts_Segment, Ts_SegmentInterp } from './segment.ts'
import { Ts_BinarySearch, Ts_LowerBound, Ts_SplineData } from './splineData.ts'
import {
  TsAntiRegressionMode, TsCurveType, TsExtrapMode, TsExtrapolation, TsInterpMode,
  TsLoopParams, TsSplineSamples, TsSplineSamplesWithSources, TsSplineSampleSource,
  TsTangentAlgorithm,
} from './types.ts'

export { TsSplineSamples, TsSplineSamplesWithSources } from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/sample.h and sample.cpp.

const inf = Infinity
const OPEN = false
const CLOSED = true

type Vertex = readonly [number, number]
const sameVertex = (a: Vertex | undefined, b: Vertex): boolean =>
  a !== undefined && a[0] === b[0] && a[1] === b[1]

// sample.h:24-37.
export interface Ts_SampleDataInterface {
  addSegment(time0: number, value0: number, time1: number, value1: number,
    source: TsSplineSampleSource): void
  clear(): void
}

// sample.h:58-112 and 114-176: Ts_SampleData specializations.
export class Ts_SampleData implements Ts_SampleDataInterface {
  constructor(readonly sampledSpline: TsSplineSamples | TsSplineSamplesWithSources) {}

  addSegment(time0: number, value0: number, time1: number, value1: number,
    source: TsSplineSampleSource): void {
    if (time0 > time1) {
      [time0, time1] = [time1, time0]
      ;[value0, value1] = [value1, value0]
    }
    const vertex0: Vertex = [time0, value0]
    const vertex1: Vertex = [time1, value1]
    const samples = this.sampledSpline
    const polylines = samples.polylines
    const withSources = samples instanceof TsSplineSamplesWithSources ? samples : undefined

    const last = polylines[polylines.length - 1]
    let needNewPolyline = polylines.length === 0 ||
      (last !== undefined && last.length > 0 && !sameVertex(last[last.length - 1], vertex0))
    if (withSources) {
      needNewPolyline = needNewPolyline ||
        (withSources.sources[withSources.sources.length - 1] !== source &&
         !sameVertex(vertex0, vertex1))
    }

    if (needNewPolyline) {
      polylines.push([vertex0, vertex1])
      withSources?.sources.push(source)
    } else if (!sameVertex(vertex0, vertex1)) {
      const polyline = polylines[polylines.length - 1]!
      if (sameVertex(polyline[polyline.length - 2], vertex0) &&
          sameVertex(polyline[polyline.length - 1], vertex0)) {
        polyline[polyline.length - 1] = vertex1
      } else {
        polyline.push(vertex1)
      }
    }
  }

  clear(): void {
    this.sampledSpline.polylines.length = 0
    if (this.sampledSpline instanceof TsSplineSamplesWithSources) {
      this.sampledSpline.sources.length = 0
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// SAMPLING HELPERS (sample.cpp:28-512)

// sample.cpp:37-59.
function _SetKnotDataPreValues(segment: Ts_Segment, data: Ts_TypedKnotData): void {
  data.time = segment.p1[0]
  data.preTanAlgorithm = TsTangentAlgorithm.None

  if (segment.interp === Ts_SegmentInterp.PreExtrap ||
      segment.interp === Ts_SegmentInterp.ValueBlock) {
    data.preTanWidth = 0.0
    data.preTanSlope = 0.0
  } else {
    data.preTanWidth = segment.p1[0] - segment.t1[0]
    data.preTanSlope = data.preTanWidth === 0
      ? 0
      : (segment.p1[1] - segment.t1[1]) / data.preTanWidth
  }

  data.preValue = segment.p1[1]
}

// sample.cpp:63-103.
function _SetKnotDataValues(segment: Ts_Segment, data: Ts_TypedKnotData): void {
  data.time = segment.p0[0]
  data.postTanAlgorithm = TsTangentAlgorithm.None

  if (segment.interp === Ts_SegmentInterp.PostExtrap ||
      segment.interp === Ts_SegmentInterp.ValueBlock) {
    data.postTanWidth = 0.0
    data.postTanSlope = 0.0
  } else {
    data.postTanWidth = segment.t0[0] - segment.p0[0]
    data.postTanSlope = data.postTanWidth === 0
      ? 0
      : (segment.t0[1] - segment.p0[1]) / data.postTanWidth
  }

  if (segment.p1[0] !== +inf) {
    data.nextInterp = segment.getInterpMode()
  }
  if (data.nextInterp === TsInterpMode.Curve) {
    if (segment.interp === Ts_SegmentInterp.Hermite) {
      data.curveType = TsCurveType.Hermite
    } else if (segment.interp === Ts_SegmentInterp.Bezier) {
      data.curveType = TsCurveType.Bezier
    }
  }

  data.value = segment.p0[1]
}

// sample.cpp:105-112.
function _FinalizeKnotData(data: Ts_TypedKnotData): void {
  if (data.value === data.preValue) {
    data.dualValued = false
    data.preValue = 0
  } else {
    data.dualValued = true
  }
}

// sample.cpp:114-153.
function _GetSegmentSource(segment: Ts_Segment, data: Ts_SplineData): TsSplineSampleSource {
  const knotInterval = new GfInterval(
    data.times[0]!, data.times[data.times.length - 1]!, CLOSED, OPEN)
  const loopedInterval = data.loopParams.getLoopedInterval()
  const splineInterval = data.hasInnerLoops()
    ? knotInterval.getUnion(loopedInterval)
    : knotInterval

  const segmentStartTime = segment.p0[0]
  const segmentEndTime = segment.p1[0]
  if (segmentStartTime < splineInterval.getMin()) {
    return data.preExtrapolation.isLooping()
      ? TsSplineSampleSource.PreExtrapLoop
      : TsSplineSampleSource.PreExtrap
  }
  if (segmentEndTime > splineInterval.getMax()) {
    return data.postExtrapolation.isLooping()
      ? TsSplineSampleSource.PostExtrapLoop
      : TsSplineSampleSource.PostExtrap
  }

  if (!data.hasInnerLoops()) {
    return TsSplineSampleSource.KnotInterp
  }

  const segmentInterval = new GfInterval(segmentStartTime, segmentEndTime, CLOSED, OPEN)
  const protoInterval = data.loopParams.getPrototypeInterval()
  if (protoInterval.contains(segmentInterval)) {
    return TsSplineSampleSource.InnerLoopProto
  } else if (loopedInterval.contains(segmentInterval)) {
    return segmentStartTime < protoInterval.getMin()
      ? TsSplineSampleSource.InnerLoopPreEcho
      : TsSplineSampleSource.InnerLoopPostEcho
  }
  return TsSplineSampleSource.KnotInterp
}

type V2 = [number, number]
type CP = [V2, V2, V2, V2]
const lerp2 = (u: number, a: V2, b: V2): V2 => [(1 - u) * a[0] + u * b[0], (1 - u) * a[1] + u * b[1]]
const lerp = (u: number, a: number, b: number): number => (1 - u) * a + u * b

// sample.cpp:155-182.
function _SubdivideBezier(cp: CP, u: number): [CP, CP] {
  const cp01 = lerp2(u, cp[0], cp[1])
  const cp12 = lerp2(u, cp[1], cp[2])
  const cp23 = lerp2(u, cp[2], cp[3])
  const cp012 = lerp2(u, cp01, cp12)
  const cp123 = lerp2(u, cp12, cp23)
  const cp0123 = lerp2(u, cp012, cp123)
  return [[cp[0], cp01, cp012, cp0123], [cp0123, cp123, cp23, cp[3]]]
}

// sample.cpp:184-264.
function _SampleBezier(
  cp: CP,
  segmentInterval: GfInterval,
  source: TsSplineSampleSource,
  timeScale: number,
  valueScale: number,
  tolerance: number,
  sampledSpline: Ts_SampleDataInterface,
): void {
  const baseVec: V2 = [timeScale * (cp[3][0] - cp[0][0]), valueScale * (cp[3][1] - cp[0][1])]
  const vec1: V2 = [timeScale * (cp[1][0] - cp[0][0]), valueScale * (cp[1][1] - cp[0][1])]
  const vec2: V2 = [timeScale * (cp[2][0] - cp[0][0]), valueScale * (cp[2][1] - cp[0][1])]

  const lenSquared = baseVec[0] * baseVec[0] + baseVec[1] * baseVec[1]
  const t1 = (vec1[0] * baseVec[0] + vec1[1] * baseVec[1]) / lenSquared
  const t2 = (vec2[0] * baseVec[0] + vec2[1] * baseVec[1]) / lenSquared

  const h1: V2 = [vec1[0] - t1 * baseVec[0], vec1[1] - t1 * baseVec[1]]
  const h2: V2 = [vec2[0] - t2 * baseVec[0], vec2[1] - t2 * baseVec[1]]
  const h1Squared = h1[0] * h1[0] + h1[1] * h1[1]
  const h2Squared = h2[0] * h2[0] + h2[1] * h2[1]

  if (Math.max(h1Squared, h2Squared) <= tolerance * tolerance) {
    let st1 = cp[0][0]
    let st2 = cp[3][0]
    let v1 = cp[0][1]
    let v2 = cp[3][1]

    if (st1 < segmentInterval.getMin()) {
      const u = (segmentInterval.getMin() - st1) / (st2 - st1)
      st1 = lerp(u, st1, st2)
      v1 = lerp(u, v1, v2)
    }
    if (st2 > segmentInterval.getMax()) {
      const u = (segmentInterval.getMax() - st1) / (st2 - st1)
      st2 = lerp(u, st1, st2)
      v2 = lerp(u, v1, v2)
    }

    sampledSpline.addSegment(st1, v1, st2, v2, source)
  } else {
    const [leftCp, rightCp] = _SubdivideBezier(cp, 0.5)
    const doLeft = segmentInterval.intersects(new GfInterval(leftCp[0][0], leftCp[3][0]))
    const doRight = segmentInterval.intersects(new GfInterval(rightCp[0][0], rightCp[3][0]))
    if (doLeft) {
      _SampleBezier(leftCp, segmentInterval, source, timeScale, valueScale, tolerance, sampledSpline)
    }
    if (doRight) {
      _SampleBezier(rightCp, segmentInterval, source, timeScale, valueScale, tolerance, sampledSpline)
    }
  }
}

// sample.cpp:268-303.
function _SimplifyOuterLooping(
  data: Ts_SplineData,
  boundaryAdjacentTime: number,
  extrap: TsExtrapolation,
): TsExtrapolation {
  if (!extrap.isLooping()) {
    return copyExtrap(extrap)
  }

  const times = data.times
  if (times.length === 0) {
    return new TsExtrapolation(TsExtrapMode.ValueBlock)
  }

  if (extrap.loopBoundaryTime !== undefined) {
    const boundary = extrap.loopBoundaryTime
    const found = Ts_BinarySearch(times, boundary)
    if (found && boundary === boundaryAdjacentTime) {
      return new TsExtrapolation(TsExtrapMode.Held)
    } else if (!found) {
      return new TsExtrapolation(TsExtrapMode.ValueBlock)
    }
  } else if (data.times.length === 1 && !data.hasInnerLoops()) {
    return new TsExtrapolation(TsExtrapMode.Held)
  }

  return copyExtrap(extrap)
}

function copyExtrap(e: TsExtrapolation): TsExtrapolation {
  return new TsExtrapolation(e.mode, e.slope, e.loopBoundaryTime)
}

// sample.cpp:305-375.
function _BakeAndShiftPreExtrapLoop(
  data: Ts_SplineData,
  interval: GfInterval,
  numSegments: number,
  resultData: Ts_SplineData,
): number {
  const finiteTime = interval.getMax()
  const startPoint = new GfInterval(finiteTime, finiteTime, CLOSED, CLOSED)

  const it = new Ts_SegmentIterator(data, startPoint)
  let d = new Ts_TypedKnotData()
  let segment = it.Get()
  const shiftedBoundary = segment.p0[0]

  const scenarioA = segment.p0[0] === interval.getMax() && interval.isMaxOpen()
  const scenarioB = segment.p0[0] === interval.getMax() && interval.isMaxClosed()
  const scenarioC = segment.p1[0] === +inf
  const scenarioD = !scenarioA && !scenarioB && !scenarioC

  if (scenarioD) {
    _SetKnotDataPreValues(segment, d)
    d.value = d.preValue
    _FinalizeKnotData(d)
    resultData.setKnotFromDouble(d)
    d = new Ts_TypedKnotData()
  }

  if (!scenarioA) {
    _SetKnotDataValues(segment, d)
  }

  for (let i = 0; i < numSegments; ++i) {
    it.stepBackward()
    segment = it.Get()
    _SetKnotDataPreValues(segment, d)

    if (scenarioA && i === 0) {
      d.value = d.preValue
    }

    _FinalizeKnotData(d)
    resultData.setKnotFromDouble(d)
    d = new Ts_TypedKnotData()

    _SetKnotDataValues(segment, d)
  }

  resultData.setKnotFromDouble(d)

  return shiftedBoundary
}

// sample.cpp:377-453.
function _BakeAndShiftPostExtrapLoop(
  data: Ts_SplineData,
  interval: GfInterval,
  numSegments: number,
  resultData: Ts_SplineData,
): number {
  const finiteTime = interval.getMin()
  const startPoint = new GfInterval(finiteTime, finiteTime, CLOSED, CLOSED)

  const it = new Ts_SegmentIterator(data, startPoint)
  let d = new Ts_TypedKnotData()
  let segment = it.Get()

  const scenarioA = segment.p0[0] === interval.getMin()
  const scenarioB = segment.p0[0] === -inf
  const scenarioC = !scenarioA && !scenarioB

  if (scenarioC) {
    _SetKnotDataValues(segment, d)
    resultData.setKnotFromDouble(d)
    d = new Ts_TypedKnotData()
  }

  if (scenarioB || scenarioC) {
    _SetKnotDataPreValues(segment, d)
  }

  const shiftedBoundary = scenarioA ? segment.p0[0] : segment.p1[0]

  for (let i = 0; i < numSegments; ++i) {
    const scenarioAStart = scenarioA && i === 0
    if (!scenarioAStart) {
      it.stepForward()
      segment = it.Get()
    }

    _SetKnotDataValues(segment, d)

    if (!scenarioAStart) {
      _FinalizeKnotData(d)
    }

    resultData.setKnotFromDouble(d)
    d = new Ts_TypedKnotData()

    _SetKnotDataPreValues(segment, d)
  }

  it.stepForward()
  segment = it.Get()
  _SetKnotDataValues(segment, d)
  _FinalizeKnotData(d)
  resultData.setKnotFromDouble(d)

  return shiftedBoundary
}

// sample.cpp:458-549. Updates extrap in place.
function _BakeAndShiftExtrapLoopBoundary(
  data: Ts_SplineData,
  _boundaryOppositeTime: number,
  interval: GfInterval,
  isPre: boolean,
  extrap: TsExtrapolation,
): Ts_SplineData | undefined {
  if (!extrap.isLooping()) {
    return undefined
  }
  const times = data.times

  let numSegments = 0
  let loopBoundaryTime = isPre ? times[times.length - 1]! : times[0]!
  if (data.hasInnerLoops()) {
    const it = new Ts_SegmentKnotIterator(data, GfInterval.getFullInterval())
    while (!it.AtEnd()) {
      numSegments++
      it.increment()
    }
  } else {
    if (extrap.loopBoundaryTime !== undefined) {
      loopBoundaryTime = extrap.loopBoundaryTime
    }
    const it = Ts_LowerBound(times, loopBoundaryTime)
    const dist = isPre ? it : (times.length - it) - 1
    numSegments = dist
  }

  const shiftBoundary = isPre
    ? loopBoundaryTime > interval.getMax()
    : loopBoundaryTime < interval.getMin()

  let resultData: Ts_SplineData | undefined
  if (shiftBoundary) {
    if (extrap.mode === TsExtrapMode.LoopOscillate) {
      numSegments *= 2
      extrap.mode = TsExtrapMode.LoopReset
    }

    resultData = Ts_SplineData.create(data.GetValueType(), data)

    extrap.loopBoundaryTime = isPre
      ? _BakeAndShiftPreExtrapLoop(data, interval, numSegments, resultData)
      : _BakeAndShiftPostExtrapLoop(data, interval, numSegments, resultData)
  } else {
    resultData = Ts_Bake(data, GfInterval.getFullInterval(), false)
  }

  return resultData
}

////////////////////////////////////////////////////////////////////////////////
// SAMPLE ENTRY POINT (sample.cpp:554-669)

export function Ts_Sample(
  data: Ts_SplineData,
  timeInterval: GfInterval,
  timeScale: number,
  valueScale: number,
  tolerance: number,
  sampledSpline: Ts_SampleDataInterface,
): void {
  if (timeInterval.IsEmpty() || !(timeScale > 0.0) || !(valueScale > 0.0) || !(tolerance > 0.0)) {
    return
  }

  if (data.times.length === 0) {
    return
  }

  if (!timeInterval.isFinite()) {
    return
  }

  const it = new Ts_SegmentIterator(data, timeInterval)

  while (!it.AtEnd()) {
    const segment = it.Get()

    switch (segment.interp) {
      case Ts_SegmentInterp.ValueBlock:
        it.increment()
        continue
      case Ts_SegmentInterp.Held:
      case Ts_SegmentInterp.Linear:
      case Ts_SegmentInterp.PreExtrap:
      case Ts_SegmentInterp.PostExtrap: {
        let x0 = segment.p0[0]
        let y0 = segment.p0[1]
        let x1 = segment.p1[0]
        let y1 = segment.interp === Ts_SegmentInterp.Held ? y0 : segment.p1[1]

        let slope = 0.0
        if (x0 === -inf) {
          slope = segment.p0[1]
          x0 = timeInterval.getMin()
          y0 = y1 - slope * (x1 - x0) + 0.0
        } else if (x1 === +inf) {
          slope = segment.p1[1]
          x1 = timeInterval.getMax()
          y1 = y0 + slope * (x1 - x0) + 0.0
        } else if (segment.interp === Ts_SegmentInterp.Linear) {
          slope = (segment.p1[1] - segment.p0[1]) / (segment.p1[0] - segment.p0[0])
        }

        if (timeInterval.getMin() > x0) {
          x0 = timeInterval.getMin()
          y0 = y1 - slope * (x1 - x0) + 0.0
        }
        if (timeInterval.getMax() < x1) {
          x1 = timeInterval.getMax()
          y1 = y0 + slope * (x1 - x0) + 0.0
        }
        const source = _GetSegmentSource(segment, data)
        sampledSpline.addSegment(x0, y0, x1, y1, source)
        break
      }
      case Ts_SegmentInterp.Bezier:
      case Ts_SegmentInterp.Hermite: {
        if (segment.interp === Ts_SegmentInterp.Bezier) {
          Ts_RegressionPreventerBatchAccess.processSegment(segment, TsAntiRegressionMode.KeepRatio)
        }
        const cp: CP = [
          [segment.p0[0], segment.p0[1]],
          [segment.t0[0], segment.t0[1]],
          [segment.t1[0], segment.t1[1]],
          [segment.p1[0], segment.p1[1]],
        ]
        const source = _GetSegmentSource(segment, data)
        _SampleBezier(cp, timeInterval, source, timeScale, valueScale, tolerance, sampledSpline)
        break
      }
    }

    it.increment()
  }
}

////////////////////////////////////////////////////////////////////////////////
// BAKE ENTRY POINT (sample.cpp:671-793)

export function Ts_Bake(
  data: Ts_SplineData,
  timeInterval: GfInterval,
  includeExtrapLoops: boolean,
): Ts_SplineData | undefined {
  if (includeExtrapLoops &&
      (data.times.length > 1 || data.hasInnerLoops()) &&
      ((data.preExtrapolation.isLooping() && !timeInterval.isMinFinite()) ||
       (data.postExtrapolation.isLooping() && !timeInterval.isMaxFinite()))) {
    return undefined
  }

  if (timeInterval.IsEmpty()) {
    return undefined
  }

  const bakedData = Ts_SplineData.create(data.GetValueType(), data)
  if (data.times.length === 0) {
    bakedData.loopParams = new TsLoopParams()
    return bakedData
  }

  const inputInterval = timeInterval.clone()
  if (!includeExtrapLoops) {
    const knotSpan = new GfInterval(data.times[0]!, data.times[data.times.length - 1]!)
    if (data.hasInnerLoops()) {
      knotSpan.unionWith(data.loopParams.getLoopedInterval())
    }
    inputInterval.intersectWith(knotSpan)
  }

  const it = new Ts_SegmentIterator(data, inputInterval)

  let segment = it.Get()
  if (segment.p0[0] !== -inf) {
    it.stepBackward()
    segment = it.Get()
  }
  let d = new Ts_TypedKnotData()
  _SetKnotDataPreValues(segment, d)

  if (segment.p1[0] !== +inf) {
    it.stepForward()
  }

  while (!it.AtEnd()) {
    segment = it.Get()
    _SetKnotDataValues(segment, d)

    _FinalizeKnotData(d)
    bakedData.setKnotFromDouble(d)
    d = new Ts_TypedKnotData()

    _SetKnotDataPreValues(segment, d)
    it.increment()
  }

  const prevKnotDone = bakedData.times.length > 0 &&
    bakedData.times[bakedData.times.length - 1]! >= inputInterval.getMax()
  if (segment.p1[0] !== +inf && !prevKnotDone) {
    if (d.time === inputInterval.getMax() && inputInterval.isMaxOpen()) {
      d.value = d.preValue
    } else {
      it.stepForward()
      segment = it.Get()
      _SetKnotDataValues(segment, d)
    }
    _FinalizeKnotData(d)
    bakedData.setKnotFromDouble(d)
  }

  bakedData.loopParams = new TsLoopParams()

  return bakedData
}

////////////////////////////////////////////////////////////////////////////////
// TRUNCATE ENTRY POINT (sample.cpp:795-956)

export function Ts_Truncate(
  data: Ts_SplineData,
  interval: GfInterval,
  preFallback: TsExtrapolation,
  postFallback: TsExtrapolation,
): Ts_SplineData | undefined {
  if (interval.IsEmpty()) {
    return undefined
  }

  if (data.times.length === 0) {
    return undefined
  }

  let firstTime = data.times[0]!
  let lastTime = data.times[data.times.length - 1]!
  if (data.hasInnerLoops()) {
    const lpInterval = data.loopParams.getLoopedInterval()
    firstTime = Math.min(firstTime, lpInterval.getMin())
    lastTime = Math.max(lastTime, lpInterval.getMax())
  }
  const minFinite = interval.isMinFinite()
  const maxFinite = interval.isMaxFinite()

  const preExtrap = _SimplifyOuterLooping(data, firstTime, data.preExtrapolation)
  const postExtrap = _SimplifyOuterLooping(data, lastTime, data.postExtrapolation)

  if (!minFinite && !maxFinite) {
    const resultData = data.Clone()
    resultData.preExtrapolation = preExtrap
    resultData.postExtrapolation = postExtrap
    return resultData
  }

  let resultData: Ts_SplineData | undefined
  if (minFinite && !maxFinite && postExtrap.isLooping()) {
    resultData = _BakeAndShiftExtrapLoopBoundary(data, firstTime, interval, false, postExtrap)
  } else if (!minFinite && maxFinite && preExtrap.isLooping()) {
    resultData = _BakeAndShiftExtrapLoopBoundary(data, lastTime, interval, true, preExtrap)
  } else {
    const postInfLooping = !maxFinite && data.postExtrapolation.isLooping()
    const preInfLooping = !minFinite && data.preExtrapolation.isLooping()

    if (firstTime === lastTime) {
      resultData = data.Clone()
    } else if (postInfLooping || preInfLooping) {
      const bakeInput = data.Clone()
      if (postInfLooping) {
        bakeInput.postExtrapolation = copyExtrap(postExtrap)
      }
      if (preInfLooping) {
        bakeInput.preExtrapolation = copyExtrap(preExtrap)
      }
      resultData = Ts_Bake(bakeInput, interval, true)
    } else {
      resultData = Ts_Bake(data, interval, true)
    }
  }

  if (resultData === undefined) {
    return undefined
  }
  resultData.loopParams = new TsLoopParams()

  resultData.preExtrapolation = copyExtrap(preExtrap)
  resultData.postExtrapolation = copyExtrap(postExtrap)

  if (minFinite && resultData.times[0] !== interval.getMin()) {
    const removeFirstKnot = resultData.times[0]! < interval.getMin()

    const out: Ts_BreakdownOut = { affectedInterval: new GfInterval(), reason: '' }
    Ts_Breakdown(resultData, interval.getMin(), false, out)

    if (removeFirstKnot) {
      while (resultData.times.length > 0 && resultData.times[0]! < interval.getMin()) {
        resultData.removeKnotAtTime(resultData.times[0]!)
      }
    }
  }

  if (maxFinite && resultData.times[resultData.times.length - 1] !== interval.getMax() &&
      interval.getMax() !== interval.getMin()) {
    const removeLastKnot = resultData.times[resultData.times.length - 1]! > interval.getMax()

    const out: Ts_BreakdownOut = { affectedInterval: new GfInterval(), reason: '' }
    Ts_Breakdown(resultData, interval.getMax(), false, out)

    if (removeLastKnot) {
      while (resultData.times.length > 0 &&
             resultData.times[resultData.times.length - 1]! > interval.getMax()) {
        resultData.removeKnotAtTime(resultData.times[resultData.times.length - 1]!)
      }
    }
  }
  resultData.preExtrapolation = minFinite ? copyExtrap(preFallback) : copyExtrap(preExtrap)
  resultData.postExtrapolation = maxFinite ? copyExtrap(postFallback) : copyExtrap(postExtrap)

  return resultData
}
