// Ported from OpenUSD 26.11.1: pxr/base/ts/testenv/testTsSegmentIterator.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/testenv/testTsSegmentIterator.cpp.
// The expected segments are the upstream hand-computed values
// (testTsSegmentIterator.cpp:249-779).
import { describe, expect, it } from 'vitest'
import { Interval as GfInterval } from 'typescript-usd/gf'
import {
  Extrapolation, ExtrapHeld, ExtrapLinear, ExtrapLoopOscillate, ExtrapLoopRepeat,
  ExtrapLoopReset, ExtrapSloped, ExtrapValueBlock, InterpCurve, InterpHeld,
  InterpLinear, Knot, LoopParams, Spline, Ts_Segment, Ts_SegmentInterp,
  Ts_SegmentIterator, Ts_SegmentKnotIterator, Ts_SegmentLoopIterator,
  Ts_SegmentPrototypeIterator, type InterpMode, type Ts_SplineData, type Ts_Vec2,
} from '../../src/index.ts'

// testTsSegmentIterator.cpp:24-34.
enum Dir { Fwd, Rev }
const inf = Infinity
const OPEN = false
const CLOSED = true

// testTsSegmentIterator.cpp:43-60.
function K(
  time: number, value: number,
  preWidth: number, preSlope: number,
  postWidth: number, postSlope: number,
  interp: InterpMode,
): Knot {
  return new Knot({
    time, value,
    preTanWidth: preWidth, preTanSlope: preSlope,
    postTanWidth: postWidth, postTanSlope: postSlope,
    nextInterp: interp,
  })
}

function S(p0: Ts_Vec2, t0: Ts_Vec2, t1: Ts_Vec2, p1: Ts_Vec2, interp: Ts_SegmentInterp): Ts_Segment {
  return new Ts_Segment(p0, t0, t1, p1, interp)
}

// testTsSegmentIterator.cpp:62-77.
class TestCase {
  name = ''
  spline = new Spline()
  segments: Ts_Segment[] = []
  preExtrapValueOffset = 0.0
  postExtrapValueOffset = 0.0

  // C++ copy semantics.
  copy(): TestCase {
    const r = new TestCase()
    r.name = this.name
    r.spline = this.spline.clone()
    r.segments = this.segments.map(s => s.clone())
    r.preExtrapValueOffset = this.preExtrapValueOffset
    r.postExtrapValueOffset = this.postExtrapValueOffset
    return r
  }
}

function hasKnot(spline: Spline, time: number): boolean {
  return spline.getKnots().has(time)
}

// testTsSegmentIterator.cpp:103-244.
function GenSegments(testCase: TestCase, interval: GfInterval, direction: Dir): Ts_Segment[] {
  const result: Ts_Segment[] = []

  if (testCase.segments.length === 0) {
    return result
  }

  const seg0 = testCase.segments[0]!
  const seg1 = testCase.segments[testCase.segments.length - 1]!

  const numKnots = testCase.spline.getKnots().length

  const segTime0 = Number.isFinite(seg0.p0[0]) ? seg0.p0[0] : seg0.p1[0]
  const segTime1 = Number.isFinite(seg1.p1[0]) ? seg1.p1[0] : seg1.p0[0]
  const segTimeSpan = segTime1 - segTime0

  const preExtrap = testCase.spline.getPreExtrapolation()
  const postExtrap = testCase.spline.getPostExtrapolation()

  let preLoopEndTime = segTime1
  let postLoopStartTime = segTime0
  let preExtrapLoop = preExtrap.isLooping() && segTimeSpan > 0
  let postExtrapLoop = postExtrap.isLooping() && segTimeSpan > 0

  if (preExtrapLoop && preExtrap.loopBoundaryTime !== undefined) {
    const boundary = preExtrap.loopBoundaryTime
    if (boundary === segTime0 || !hasKnot(testCase.spline, boundary)) {
      preExtrapLoop = false
    } else {
      preLoopEndTime = boundary
    }
  }
  if (postExtrapLoop && postExtrap.loopBoundaryTime !== undefined) {
    const boundary = postExtrap.loopBoundaryTime
    if (boundary === segTime1 || !hasKnot(testCase.spline, boundary)) {
      postExtrapLoop = false
    } else {
      postLoopStartTime = boundary
    }
  }

  const minTime = interval.getMin()
  const maxTime = interval.getMax()
  const preSpan = preLoopEndTime - segTime0
  const postSpan = segTime1 - postLoopStartTime

  const minIter = preSpan > 0 && preExtrapLoop
    ? Math.floor((minTime - segTime0) / preSpan)
    : 0
  const maxIter = postSpan > 0 && postExtrapLoop
    ? Math.ceil((maxTime - segTime1) / postSpan)
    : 0

  const skip = (seg: Ts_Segment, iter: number, regionInterval: GfInterval): boolean => {
    if ((numKnots > 1 && ((!Number.isFinite(seg.p0[0]) && preExtrapLoop) ||
                          (!Number.isFinite(seg.p1[0]) && postExtrapLoop))) ||
        (iter !== 0 && (!Number.isFinite(seg.p0[0]) || !Number.isFinite(seg.p1[0])))) {
      return true
    }
    if (iter !== 0 &&
        !regionInterval.intersects(new GfInterval(seg.p0[0], seg.p1[0], CLOSED, OPEN))) {
      return true
    }
    return false
  }

  for (let iter = minIter; iter <= maxIter; ++iter) {
    let regionStartTime = segTime0
    let regionEndTime = segTime1
    if (iter < 0) {
      regionEndTime = preLoopEndTime
    } else if (iter > 0) {
      regionStartTime = postLoopStartTime
    }
    const regionInterval = new GfInterval(regionStartTime, regionEndTime, CLOSED, OPEN)
    const span = regionEndTime - regionStartTime

    const segValueOffset = iter < 0
      ? testCase.preExtrapValueOffset
      : testCase.postExtrapValueOffset

    const oscillating = iter < 0
      ? preExtrap.mode === ExtrapLoopOscillate
      : postExtrap.mode === ExtrapLoopOscillate
    const reversed = oscillating && iter % 2 !== 0

    if (reversed) {
      const shift1: Ts_Vec2 = [iter * span + regionStartTime, iter * segValueOffset]
      const timeShift2 = regionEndTime

      const t1 = -(interval.getMin() - shift1[0]) + timeShift2
      const t0 = -(interval.getMax() - shift1[0]) + timeShift2
      const iterInterval = new GfInterval(t0, t1, CLOSED, OPEN)

      for (let i = testCase.segments.length - 1; i >= 0; --i) {
        const seg = testCase.segments[i]!
        if (skip(seg, iter, regionInterval)) {
          continue
        }
        if (iterInterval.intersects(new GfInterval(seg.p0[0], seg.p1[0], CLOSED, OPEN))) {
          result.push(seg.Sub(timeShift2).negate().addInPlace(shift1))
        }
      }
    } else {
      const shift1: Ts_Vec2 = [iter * span, iter * segValueOffset]

      const iterInterval = interval.getDifference(new GfInterval(shift1[0]))

      for (const seg of testCase.segments) {
        if (skip(seg, iter, regionInterval)) {
          continue
        }
        if (iterInterval.intersects(new GfInterval(seg.p0[0], seg.p1[0], CLOSED, OPEN))) {
          result.push(seg.add(shift1))
        }
      }
    }
  }

  if (direction === Dir.Rev) {
    result.reverse()
  }

  return result
}

// testTsSegmentIterator.cpp:79-99.
let oneKnot = new TestCase()
let oneKnotExtrapLoop = new TestCase()
let simpleInnerLoop = new TestCase()
let simpleInnerLoopDualValued = new TestCase()
let twoKnotBezier = new TestCase()
let simpleSpline = new TestCase()
let simpleSplineDualValued = new TestCase()
let longLoop = new TestCase()
let extrapValueBlock = new TestCase()
let extrapHeld = new TestCase()
let extrapLinear = new TestCase()
let extrapSloped = new TestCase()
let extrapReset = new TestCase()
let extrapResetDualValued = new TestCase()
let extrapResetLoopBoundary = new TestCase()
let extrapResetInvalidLoopBoundary = new TestCase()
let extrapRepeat = new TestCase()
let extrapRepeatDualValuedLoopBoundary = new TestCase()
let extrapOscillate = new TestCase()
let extrapOscillateLoopBoundary = new TestCase()

function extrapWithBoundary(mode: number, boundary: number): Extrapolation {
  const ex = new Extrapolation(mode)
  ex.loopBoundaryTime = boundary
  return ex
}

// testTsSegmentIterator.cpp:246-779.
function InitTestCases(): void {
  // ================ OneKnot ================
  oneKnot.name = 'OneKnot'
  oneKnot.spline.setKnots([
    K(1.0, 1.0, 0.0, 0.0, 0.0, 0.0, InterpHeld),
  ])
  oneKnot.segments = [
    S([-inf, 0.0], [0.0, 0.0], [0.0, 0.0], [1.0, 1.0], Ts_SegmentInterp.PreExtrap),
    S([1.0, 1.0], [0.0, 0.0], [0.0, 0.0], [+inf, 0.0], Ts_SegmentInterp.PostExtrap),
  ]
  oneKnot.spline.setPreExtrapolation(new Extrapolation(ExtrapHeld))
  oneKnot.spline.setPostExtrapolation(new Extrapolation(ExtrapHeld))

  // ================ OneKnotExtrapLoop ================
  oneKnotExtrapLoop = oneKnot.copy()
  oneKnotExtrapLoop.name = 'OneKnotExtrapLoop'
  oneKnotExtrapLoop.spline.setPreExtrapolation(new Extrapolation(ExtrapLoopReset))
  oneKnotExtrapLoop.spline.setPostExtrapolation(new Extrapolation(ExtrapLoopOscillate))

  // ================ TwoKnotBezier ================
  twoKnotBezier.name = 'TwoKnotBezier'
  twoKnotBezier.spline.setKnots([
    K(1.0, 1.0, 0.0, 0.0, 0.5, 1.0, InterpCurve),
    K(5.0, 2.0, 0.5, 0.0, 0.0, 0.0, InterpCurve),
  ])
  twoKnotBezier.segments = [
    S([-inf, 0.0], [0.0, 0.0], [0.0, 0.0], [1.0, 1.0], Ts_SegmentInterp.PreExtrap),
    S([1.0, 1.0], [1.5, 1.5], [4.5, 2.0], [5.0, 2.0], Ts_SegmentInterp.Bezier),
    S([5.0, 2.0], [0.0, 0.0], [0.0, 0.0], [+inf, 0.0], Ts_SegmentInterp.PostExtrap),
  ]

  // ================ SimpleInnerLoop ================
  simpleInnerLoop.name = 'SimpleInnerLoop'
  simpleInnerLoop.spline.setKnots([
    //  t      v     pre-tan     post-tan       interp
    K(112, 8.8, 0.0, 0.0, 0.9, 15.0, InterpCurve),
    K(137, 0.0, 1.3, -5.3, 1.8, -5.3, InterpCurve),
    K(145, 8.5, 1.0, 12.5, 1.2, 12.5, InterpCurve),
    K(155, 20.2, 0.7, -15.7, 0.8, -15.7, InterpCurve),
    K(181, 38.2, 2.0, -9.0, 0.0, 0.0, InterpCurve),
  ])
  simpleInnerLoop.spline.setInnerLoopParams(new LoopParams(137, 155, 1, 1, 20.2))

  const proto1 = S([137.0, 0.0], [138.8, -9.54], [144.0, -4.0], [145.0, 8.5],
    Ts_SegmentInterp.Bezier)
  const proto2 = S([145.0, 8.5], [146.2, 23.5], [153.7, 27.09], [155.0, 20.2],
    Ts_SegmentInterp.Bezier)
  const offset: Ts_Vec2 = [18.0, 20.2]

  const pre1 = proto1.Sub(offset)
  const pre2 = proto2.Sub(offset)
  const post1 = proto1.add(offset)
  const post2 = proto2.add(offset)

  const knots0 = S([112, 8.8],
    [112 + 0.9, 8.8 + 0.9 * 15.0],
    [pre1.p0[0] - 1.3, pre1.p0[1] + 1.3 * 5.3],
    [pre1.p0[0], pre1.p0[1]],
    Ts_SegmentInterp.Bezier)
  const knots1 = S([post2.p1[0], post2.p1[1]],
    [post2.p1[0] + 1.8, post2.p1[1] - 1.8 * 5.3],
    [181.0 - 2.0, 38.2 + 2.0 * 9.0],
    [181.0, 38.2],
    Ts_SegmentInterp.Bezier)
  const preExtrap = S([-inf, 0.0], [0.0, 0.0], [0.0, 0.0], [112, 8.8],
    Ts_SegmentInterp.PreExtrap)
  const postExtrap = S([181.0, 38.2], [0.0, 0.0], [0.0, 0.0], [+inf, 0.0],
    Ts_SegmentInterp.PostExtrap)

  simpleInnerLoop.segments = [
    preExtrap, // [0]
    knots0, // [1]
    pre1, // [2]
    pre2, // [3]
    proto1, // [4]
    proto2, // [5]
    post1, // [6]
    post2, // [7]
    knots1, // [8]
    postExtrap, // [9]
  ]

  // ================ SimpleInnerLoopDualValued ================
  simpleInnerLoopDualValued = simpleInnerLoop.copy()
  simpleInnerLoopDualValued.name = 'SimpleInnerLoopDualValued'

  const knotStart = simpleInnerLoopDualValued.spline.getKnot(137.0)!
  const knotEnd = simpleInnerLoopDualValued.spline.getKnot(155.0)!
  knotStart.setPreValue(0.0)
  knotEnd.setPreValue(20.2)
  simpleInnerLoopDualValued.spline.setKnot(knotStart)
  simpleInnerLoopDualValued.spline.setKnot(knotEnd)

  simpleInnerLoopDualValued.spline.removeKnot(112.0)

  {
    const origSegment = simpleInnerLoopDualValued.segments[0]!
    const destSegment = simpleInnerLoopDualValued.segments[1]!
    destSegment.p0 = [origSegment.p0[0], origSegment.p0[1]]
    destSegment.t0 = [origSegment.t0[0], origSegment.t0[1]]
    destSegment.t1 = [origSegment.t1[0], origSegment.t1[1]]
    destSegment.interp = origSegment.interp
    simpleInnerLoopDualValued.segments.splice(0, 1)
  }

  // ================ simpleSpline ================
  simpleSpline.name = 'SimpleSpline'
  simpleSpline.spline.setKnots([
    //  t      v     pre-tan     post-tan       interp
    K(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, InterpHeld),
    K(1.0, 1.0, 0.0, 0.0, 0.0, 0.0, InterpLinear),
    K(2.0, 2.5, 0.0, 0.0, 0.0, 0.0, InterpLinear),
    K(3.0, 2.0, 0.0, 0.0, 0.0, 0.0, InterpLinear),
    K(4.0, 4.0, 0.0, 0.0, 0.0, 0.0, InterpHeld),
  ])

  simpleSpline.segments = [
    S([-inf, 0.0], [0.0, 0.0], [0.0, 0.0], [0.0, 0.0], Ts_SegmentInterp.PreExtrap),
    S([0.0, 0.0], [0.0, 0.0], [1.0, 1.0], [1.0, 1.0], Ts_SegmentInterp.Held),
    S([1.0, 1.0], [1.0, 1.0], [2.0, 2.5], [2.0, 2.5], Ts_SegmentInterp.Linear),
    S([2.0, 2.5], [2.0, 2.5], [3.0, 2.0], [3.0, 2.0], Ts_SegmentInterp.Linear),
    S([3.0, 2.0], [3.0, 2.0], [4.0, 4.0], [4.0, 4.0], Ts_SegmentInterp.Linear),
    S([4.0, 4.0], [0.0, 0.0], [0.0, 0.0], [+inf, 0.0], Ts_SegmentInterp.PostExtrap),
  ]

  // ================ SimpleSplineDualValued ================
  simpleSplineDualValued = simpleSpline.copy()
  simpleSplineDualValued.name = 'SimpleSpline'

  const knot1 = simpleSplineDualValued.spline.getKnot(1.0)!
  const knot3 = simpleSplineDualValued.spline.getKnot(3.0)!
  const knot4 = simpleSplineDualValued.spline.getKnot(4.0)!
  knot1.setPreValue(5.0)
  knot3.setPreValue(2.0)
  knot4.setPreValue(2.0)
  simpleSplineDualValued.spline.setKnot(knot1)
  simpleSplineDualValued.spline.setKnot(knot3)
  simpleSplineDualValued.spline.setKnot(knot4)

  simpleSplineDualValued.segments[1]!.p1[1] = 5.0
  simpleSplineDualValued.segments[1]!.t1[1] = 5.0
  simpleSplineDualValued.segments[4]!.p1[1] = 2.0
  simpleSplineDualValued.segments[4]!.t1[1] = 2.0

  // ================ LongLoop ================
  longLoop = simpleSpline.copy()
  longLoop.name = 'LongLoop'
  longLoop.spline.setInnerLoopParams(new LoopParams(1.0, 3.0, 2, 2, 2.0))

  longLoop.segments = [
    S([-inf, 0.0], [0.0, 0.0], [0.0, 0.0], [-3.0, -3.0], Ts_SegmentInterp.PreExtrap), //  0: pre-extrap
    S([-3.0, -3.0], [-3.0, -3.0], [-2.0, -1.5], [-2.0, -1.5], Ts_SegmentInterp.Linear), //  1: iter -2
    S([-2.0, -1.5], [-2.0, -1.5], [-1.0, -1.0], [-1.0, -1.0], Ts_SegmentInterp.Linear), //  2:
    S([-1.0, -1.0], [-1.0, -1.0], [0.0, 0.5], [0.0, 0.5], Ts_SegmentInterp.Linear), //  3: iter -1
    S([0.0, 0.5], [0.0, 0.5], [1.0, 1.0], [1.0, 1.0], Ts_SegmentInterp.Linear), //  4:
    S([1.0, 1.0], [1.0, 1.0], [2.0, 2.5], [2.0, 2.5], Ts_SegmentInterp.Linear), //  5: prototype
    S([2.0, 2.5], [2.0, 2.5], [3.0, 3.0], [3.0, 3.0], Ts_SegmentInterp.Linear), //  6:
    S([3.0, 3.0], [3.0, 3.0], [4.0, 4.5], [4.0, 4.5], Ts_SegmentInterp.Linear), //  7: iter 1
    S([4.0, 4.5], [4.0, 4.5], [5.0, 5.0], [5.0, 5.0], Ts_SegmentInterp.Linear), //  8:
    S([5.0, 5.0], [5.0, 5.0], [6.0, 6.5], [6.0, 6.5], Ts_SegmentInterp.Linear), //  9: iter 2
    S([6.0, 6.5], [6.0, 6.5], [7.0, 7.0], [7.0, 7.0], Ts_SegmentInterp.Linear), // 10:
    S([7.0, 7.0], [0.0, 0.0], [0.0, 0.0], [+inf, 0.0], Ts_SegmentInterp.PostExtrap), // 11: post-extrap
  ]

  // ================ ExtrapValueBlock ================
  extrapValueBlock = longLoop.copy()
  extrapValueBlock.name = 'ExtrapValueBlock'
  extrapValueBlock.segments[0]!.interp = Ts_SegmentInterp.ValueBlock
  extrapValueBlock.segments[extrapValueBlock.segments.length - 1]!.interp = Ts_SegmentInterp.ValueBlock

  extrapValueBlock.spline.setPreExtrapolation(new Extrapolation(ExtrapValueBlock))
  extrapValueBlock.spline.setPostExtrapolation(new Extrapolation(ExtrapValueBlock))

  // ================ ExtrapHeld ================
  extrapHeld = longLoop.copy()
  extrapHeld.name = 'ExtrapHeld'
  extrapHeld.spline.setPreExtrapolation(new Extrapolation(ExtrapHeld))
  extrapHeld.spline.setPostExtrapolation(new Extrapolation(ExtrapHeld))

  // ================ ExtrapLinear ================
  extrapLinear = longLoop.copy()
  extrapLinear.name = 'ExtrapLinear'
  extrapLinear.segments[0]!.p0[1] = 1.5 // pre-extrap slope
  extrapLinear.segments[extrapLinear.segments.length - 1]!.p1[1] = 0.5 // post-extrap slope
  extrapLinear.spline.setPreExtrapolation(new Extrapolation(ExtrapLinear))
  extrapLinear.spline.setPostExtrapolation(new Extrapolation(ExtrapLinear))

  // ================ ExtrapSloped ================
  extrapSloped = longLoop.copy()
  extrapSloped.name = 'ExtrapSloped'
  extrapSloped.segments[0]!.p0[1] = 1.0 // pre-extrap slope
  extrapSloped.segments[extrapSloped.segments.length - 1]!.p1[1] = 1.0 // post-extrap slope
  const sloped = new Extrapolation(ExtrapSloped, 1.0)
  extrapSloped.spline.setPreExtrapolation(sloped)
  extrapSloped.spline.setPostExtrapolation(sloped)

  // ================ ExtrapReset ================
  extrapReset = longLoop.copy()
  extrapReset.name = 'ExtrapReset'
  extrapReset.spline.setPreExtrapolation(new Extrapolation(ExtrapLoopReset))
  extrapReset.spline.setPostExtrapolation(new Extrapolation(ExtrapLoopReset))

  // ================ ExtrapResetDualValued ================
  extrapResetDualValued = extrapReset.copy()
  extrapResetDualValued.name = 'ExtrapResetDualValued'
  const knotExtrapResetDV = extrapResetDualValued.spline.getKnot(2.0)!
  knotExtrapResetDV.setPreValue(2.5)
  extrapResetDualValued.spline.setKnot(knotExtrapResetDV)

  // ================ ExtrapResetLoopBoundary ================
  extrapResetLoopBoundary = simpleSpline.copy()
  extrapResetLoopBoundary.name = 'ExtrapResetLoopBoundary'
  extrapResetLoopBoundary.spline.setPreExtrapolation(extrapWithBoundary(ExtrapLoopReset, 2.0))
  extrapResetLoopBoundary.spline.setPostExtrapolation(extrapWithBoundary(ExtrapLoopReset, 3.0))

  // ================ ExtrapResetInvalidLoopBoundary ================
  extrapResetInvalidLoopBoundary = simpleSpline.copy()
  extrapResetInvalidLoopBoundary.name = 'ExtrapResetInvalidLoopBoundary'
  extrapResetInvalidLoopBoundary.spline.setPreExtrapolation(
    extrapWithBoundary(ExtrapLoopReset, 0.0)) // held
  extrapResetInvalidLoopBoundary.spline.setPostExtrapolation(
    extrapWithBoundary(ExtrapLoopReset, 3.5)) // value block
  extrapResetInvalidLoopBoundary.segments[
    extrapResetInvalidLoopBoundary.segments.length - 1]!.interp = Ts_SegmentInterp.ValueBlock

  // ================ ExtrapRepeatDualValuedLoopBoundary ================
  extrapRepeatDualValuedLoopBoundary = simpleSpline.copy()
  extrapRepeatDualValuedLoopBoundary.name = 'ExtrapRepeatDualValuedLoopBoundary'
  extrapRepeatDualValuedLoopBoundary.spline.setPreExtrapolation(
    extrapWithBoundary(ExtrapLoopRepeat, 2.0))
  extrapRepeatDualValuedLoopBoundary.spline.setPostExtrapolation(
    extrapWithBoundary(ExtrapLoopRepeat, 2.0))
  {
    const tc = extrapRepeatDualValuedLoopBoundary

    const knot0 = tc.spline.getKnot(0.0)!
    knot0.setPreValue(-0.5)
    tc.spline.setKnot(knot0)
    tc.segments[0]!.t1[1] = -0.5
    tc.segments[0]!.p1[1] = -0.5

    const knot2 = tc.spline.getKnot(2.0)!
    knot2.setPreValue(1.5)
    tc.spline.setKnot(knot2)
    tc.segments[2]!.t1[1] = 1.5
    tc.segments[2]!.p1[1] = 1.5

    const knot4b = tc.spline.getKnot(4.0)!
    knot4b.setPreValue(4.0)
    knot4b.setValue(6.0)
    tc.spline.setKnot(knot4b)
    tc.segments[5]!.t0[1] = 6.0
    tc.segments[5]!.p0[1] = 6.0
  }
  extrapRepeatDualValuedLoopBoundary.preExtrapValueOffset = 2.0
  extrapRepeatDualValuedLoopBoundary.postExtrapValueOffset = 3.5

  // ================ ExtrapOscillateLoopBoundary ================
  extrapOscillateLoopBoundary = simpleSpline.copy()
  extrapOscillateLoopBoundary.name = 'ExtrapOscillateLoopBoundary'
  extrapOscillateLoopBoundary.spline.setPreExtrapolation(
    extrapWithBoundary(ExtrapLoopOscillate, 1.0))
  extrapOscillateLoopBoundary.spline.setPostExtrapolation(
    extrapWithBoundary(ExtrapLoopOscillate, 2.0))

  // ================ ExtrapRepeat ================
  extrapRepeat = extrapReset.copy()
  extrapRepeat.name = 'ExtrapRepeat'
  extrapRepeat.spline.setPreExtrapolation(new Extrapolation(ExtrapLoopRepeat))
  extrapRepeat.spline.setPostExtrapolation(new Extrapolation(ExtrapLoopRepeat))
  extrapRepeat.preExtrapValueOffset = 10.0
  extrapRepeat.postExtrapValueOffset = 10.0

  // ================ ExtrapOscillate ================
  extrapOscillate = extrapReset.copy()
  extrapOscillate.name = 'ExtrapOscillate'
  extrapOscillate.spline.setPreExtrapolation(new Extrapolation(ExtrapLoopOscillate))
  extrapOscillate.spline.setPostExtrapolation(new Extrapolation(ExtrapLoopOscillate))
}

interface SegmentIter {
  AtEnd(): boolean
  Get(): Ts_Segment
  increment(): unknown
  stepForward(): boolean
  stepBackward(): boolean
}
type IterFactory = (data: Ts_SplineData, interval: GfInterval, reversed: boolean) => SegmentIter

// testTsSegmentIterator.cpp:781-804.
function ReportMismatch(
  errors: string[], title: string,
  expectedSeg: Ts_Segment | undefined, iterSeg: Ts_Segment | undefined,
): void {
  errors.push(`${title}:\n  expected: ${expectedSeg ? expectedSeg.toString() : 'AtEnd'}` +
    `\n  iterated: ${iterSeg ? iterSeg.toString() : 'AtEnd'}`)
}

// testTsSegmentIterator.cpp:806-885.
function RunStepTest(
  errors: string[],
  make: IterFactory,
  testCase: TestCase,
  iterInterval: GfInterval,
  direction: Dir,
  titleIn: string,
  expectedIn: readonly Ts_Segment[],
  backward: boolean,
): boolean {
  let result = true

  const iter = make(testCase.spline._getData(), iterInterval, direction === Dir.Rev)

  const expected = backward ? [...expectedIn].reverse() : [...expectedIn]
  let expectedIter = 0

  const title = titleIn + (backward ? ' (StepBackward)' : ' (StepForward)')

  let stepSuccess = true
  if (backward) {
    let i = 0
    while (stepSuccess && !iter.AtEnd()) {
      stepSuccess = iter.stepForward()
      i++
    }
    if (stepSuccess && i > 0) {
      const success = iter.stepBackward()
      if (!success) {
        errors.push(`${title}; StepBackward failed after successful StepForward`)
        return false
      }
      i++
    }
  }

  while (expectedIter !== expected.length && (!iter.AtEnd() || !stepSuccess)) {
    const iterSeg = iter.Get()
    const expectedSeg = expected[expectedIter]!
    if (!iterSeg.equals(expectedSeg)) {
      ReportMismatch(errors, title, expectedSeg, iterSeg)
      result = false
    }
    stepSuccess = backward ? iter.stepBackward() : iter.stepForward()
    ++expectedIter
  }
  stepSuccess = true
  while (!iter.AtEnd()) {
    ReportMismatch(errors, title, undefined, iter.Get())
    result = false
    stepSuccess = backward ? iter.stepBackward() : iter.stepForward()
    if (!stepSuccess) break
  }
  while (expectedIter !== expected.length) {
    ReportMismatch(errors, title, expected[expectedIter]!, undefined)
    result = false
    ++expectedIter
  }

  return result
}

// testTsSegmentIterator.cpp:887-978. Returns the mismatch reports.
function DoOneTest(
  iterName: string,
  make: IterFactory,
  testCase: TestCase,
  iterInterval: GfInterval,
  domainInterval: GfInterval,
  direction: Dir,
): string[] {
  const errors: string[] = []

  const iter = make(testCase.spline._getData(), iterInterval, direction === Dir.Rev)

  const title = `Testing ${iterName}: Spline = ${testCase.name}` +
    (direction === Dir.Rev ? ' (reversed)' : '')

  const expected = GenSegments(testCase, iterInterval.getIntersection(domainInterval), direction)
  let expectedIter = 0

  let result = true
  while (!iter.AtEnd() && expectedIter !== expected.length) {
    const iterSeg = iter.Get()
    const expectedSeg = expected[expectedIter]!
    if (!iterSeg.equals(expectedSeg)) {
      ReportMismatch(errors, title, expectedSeg, iterSeg)
      result = false
    }
    iter.increment()
    ++expectedIter
  }
  while (!iter.AtEnd()) {
    ReportMismatch(errors, title, undefined, iter.Get())
    result = false
    iter.increment()
  }
  while (expectedIter !== expected.length) {
    ReportMismatch(errors, title, expected[expectedIter]!, undefined)
    result = false
    ++expectedIter
  }

  if (result) {
    result = RunStepTest(errors, make, testCase, iterInterval, direction, title, expected, true)
  }
  if (result) {
    RunStepTest(errors, make, testCase, iterInterval, direction, title, expected, false)
  }

  return errors
}

const protoFactory: IterFactory = (d, i, r) => new Ts_SegmentPrototypeIterator(d, i, r)
const loopFactory: IterFactory = (d, i, r) => new Ts_SegmentLoopIterator(d, i, r)
const knotFactory: IterFactory = (d, i, r) => new Ts_SegmentKnotIterator(d, i, r)
const fullFactory: IterFactory = (d, i) => new Ts_SegmentIterator(d, i)

// testTsSegmentIterator.cpp:980-993.
function ProtoTest(testCase: TestCase, minTime: number, maxTime: number, dir: Dir): string[] {
  const iterInterval = new GfInterval(minTime, maxTime, CLOSED, OPEN)
  const lp = testCase.spline.getInnerLoopParams()
  const domainInterval = lp.getPrototypeInterval()
  return DoOneTest('Ts_SegmentPrototypeIterator', protoFactory,
    testCase, iterInterval, domainInterval, dir)
}

// testTsSegmentIterator.cpp:995-1012.
function LoopTest(testCase: TestCase, minTime: number, maxTime: number, dir: Dir): string[] {
  const iterInterval = new GfInterval(minTime, maxTime, CLOSED, OPEN)
  const lp = testCase.spline.getInnerLoopParams()
  const domainInterval = lp.getLoopedInterval()
  domainInterval.setMax(domainInterval.getMax(), OPEN)
  return DoOneTest('Ts_SegmentLoopIterator', loopFactory,
    testCase, iterInterval, domainInterval, dir)
}

// testTsSegmentIterator.cpp:1014-1042. TsKnotMap::GetTimeSpan is the closed
// interval between the first and last knot times (empty without knots).
function KnotTest(testCase: TestCase, minTime: number, maxTime: number, dir: Dir): string[] {
  const iterInterval = new GfInterval(minTime, maxTime, CLOSED, OPEN)
  const lp = testCase.spline.getInnerLoopParams()
  const domainInterval = lp.getLoopedInterval()
  domainInterval.setMax(domainInterval.getMax(), OPEN)
  const knots = testCase.spline.getKnots()
  const knotInterval = knots.length === 0
    ? new GfInterval()
    : new GfInterval(knots[0]!.getTime(), knots[knots.length - 1]!.getTime())
  knotInterval.setMax(knotInterval.getMax(), OPEN)
  domainInterval.unionWith(knotInterval)
  return DoOneTest('Ts_SegmentKnotIterator', knotFactory,
    testCase, iterInterval, domainInterval, dir)
}

// testTsSegmentIterator.cpp:1044-1056.
function FullTest(testCase: TestCase, minTime: number, maxTime: number, dir: Dir): string[] {
  const iterInterval = new GfInterval(minTime, maxTime, CLOSED, OPEN)
  const domainInterval = new GfInterval(-inf, inf)
  return DoOneTest('Ts_SegmentIterator', fullFactory,
    testCase, iterInterval, domainInterval, dir)
}

InitTestCases()

type TestFn = (testCase: TestCase, minTime: number, maxTime: number, dir: Dir) => string[]
const F = Dir.Fwd
const R = Dir.Rev

// testTsSegmentIterator.cpp:1058-1167 (TestIterators), in order.
const cases: [string, TestFn, () => TestCase, number, number, Dir][] = [
  ['ProtoTest', ProtoTest, () => oneKnot, -5, 5, F],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 137, 155, F],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 137, 155, R],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 0, 999, F],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 0, 999, R],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 137, 145.00001, F],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 137, 145.00001, R],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 137, 145, F],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 137, 145, R],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 145, 146, F],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 145, 146, R],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 147, 148, F],
  ['ProtoTest', ProtoTest, () => simpleInnerLoop, 147, 148, R],
  ['ProtoTest', ProtoTest, () => twoKnotBezier, 0, 999, F],
  ['ProtoTest', ProtoTest, () => twoKnotBezier, 0, 999, R],

  ['LoopTest', LoopTest, () => simpleInnerLoop, 137, 155, F],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 137, 155, R],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 0, 999, F],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 0, 999, R],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 137, 145.00001, F],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 137, 145.00001, R],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 119, 127.00001, F],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 119, 127.00001, R],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 119, 127, F],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 119, 127, R],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 163, 164, F],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 163, 164, R],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 165, 166, F],
  ['LoopTest', LoopTest, () => simpleInnerLoop, 165, 166, R],
  ['LoopTest', LoopTest, () => twoKnotBezier, 0, 999, F],
  ['LoopTest', LoopTest, () => twoKnotBezier, 0, 999, R],

  ['KnotTest', KnotTest, () => simpleInnerLoop, 137, 155, F],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 137, 155, R],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 0, 999, F],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 0, 999, R],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 137, 145.00001, F],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 137, 145.00001, R],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 119, 127.00001, F],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 119, 127.00001, R],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 119, 127, F],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 119, 127, R],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 119, 137, F],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 119, 137, R],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 112, 181, F],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 112, 181, R],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 163, 164, F],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 163, 164, R],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 165, 166, F],
  ['KnotTest', KnotTest, () => simpleInnerLoop, 165, 166, R],
  ['KnotTest', KnotTest, () => twoKnotBezier, 0, 999, F],
  ['KnotTest', KnotTest, () => twoKnotBezier, 0, 999, R],
  ['KnotTest', KnotTest, () => simpleSplineDualValued, -5, 10, F],
  ['KnotTest', KnotTest, () => simpleSplineDualValued, -5, 10, R],

  ['FullTest', FullTest, () => oneKnot, -5, 5, F],
  ['FullTest', FullTest, () => oneKnotExtrapLoop, -5, 5, F],
  ['FullTest', FullTest, () => simpleInnerLoop, 137, 155, F],
  ['FullTest', FullTest, () => simpleInnerLoop, 0, 999, F],
  ['FullTest', FullTest, () => simpleInnerLoopDualValued, 0, 999, F],
  ['FullTest', FullTest, () => simpleSpline, -5, 10, F],
  ['FullTest', FullTest, () => longLoop, -5, 10, F],
  ['FullTest', FullTest, () => longLoop, 0, 999, F],
  ['FullTest', FullTest, () => extrapValueBlock, -10, 10, F],
  ['FullTest', FullTest, () => extrapHeld, -10, 10, F],
  ['FullTest', FullTest, () => extrapLinear, -10, 10, F],
  ['FullTest', FullTest, () => extrapSloped, -10, 10, F],
  ['FullTest', FullTest, () => extrapRepeat, -10, 10, F],
  ['FullTest', FullTest, () => extrapRepeat, 0, 999, F],
  ['FullTest', FullTest, () => extrapOscillate, -10, 10, F],
  ['FullTest', FullTest, () => extrapOscillate, 0, 999, F],
  ['FullTest', FullTest, () => twoKnotBezier, 0, 999, F],
  ['FullTest', FullTest, () => extrapResetDualValued, -10, 10, F],
  ['FullTest', FullTest, () => extrapResetLoopBoundary, -10, 10, F],
  ['FullTest', FullTest, () => extrapResetInvalidLoopBoundary, -10, 10, F],
  ['FullTest', FullTest, () => extrapRepeatDualValuedLoopBoundary, -10, 10, F],
  ['FullTest', FullTest, () => extrapOscillateLoopBoundary, -10, 10, F],
  ['FullTest', FullTest, () => extrapOscillateLoopBoundary, 0, 999, F],
]

describe('testTsSegmentIterator', () => {
  for (const [kind, fn, getCase, minTime, maxTime, dir] of cases) {
    const testCase = getCase()
    it(`${kind}(${testCase.name}, ${minTime}, ${maxTime}, ${dir === F ? 'Fwd' : 'Rev'})`, () => {
      expect(fn(testCase, minTime, maxTime, dir)).toEqual([])
    })
  }
})
