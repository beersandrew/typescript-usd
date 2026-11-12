// Ported from OpenUSD 26.11.1: pxr/base/ts/regressionPreventer.cpp,
//  pxr/base/ts/regressionPreventer.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { TsKnot } from './knot.ts'
import { Ts_KnotData, Ts_KnotDataFromKnot } from './knotData.ts'
import { Ts_Segment, Ts_SegmentInterp } from './segment.ts'
import type { TsSpline } from './spline.ts'
import { TsAntiRegressionMode, TsCurveType, TsInterpMode } from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/regressionPreventer.h and
// regressionPreventer.cpp.

// regressionPreventer.h:52-67.
export enum TsRegressionPreventerInteractiveMode {
  ModeLimitActive = 100,
  ModeLimitOpposite = 101,
}

// regressionPreventer.h:162-171: unified interactive and batch modes.
type _Mode = TsAntiRegressionMode | TsRegressionPreventerInteractiveMode
const _ModeNone = TsAntiRegressionMode.None
const _ModeContain = TsAntiRegressionMode.Contain
const _ModeKeepRatio = TsAntiRegressionMode.KeepRatio
const _ModeKeepStart = TsAntiRegressionMode.KeepStart
const _ModeLimitActive = TsRegressionPreventerInteractiveMode.ModeLimitActive
const _ModeLimitOpposite = TsRegressionPreventerInteractiveMode.ModeLimitOpposite

// regressionPreventer.cpp:155-170.
const kWritePadding = 1e-5
const kReadPadding = 1e-6
const kContainedMax = 1.0
const kVertMax = 4.0 / 3.0
const kVertMin = 1.0 / 3.0

/** Copy only the time parameters of knot data (Ts_KnotData slicing copy). */
function copyParams(d: Ts_KnotData): Ts_KnotData {
  const r = new Ts_KnotData()
  r.time = d.time
  r.preTanWidth = d.preTanWidth
  r.postTanWidth = d.postTanWidth
  r.nextInterp = d.nextInterp
  r.curveType = d.curveType
  r.dualValued = d.dualValued
  r.preTanAlgorithm = d.preTanAlgorithm
  r.postTanAlgorithm = d.postTanAlgorithm
  return r
}

// regressionPreventer.h:80-104.
export class TsRegressionPreventerSetResult {
  adjusted = false
  havePreSegment = false
  preActiveAdjusted = false
  preActiveAdjustedWidth = 0
  preOppositeAdjusted = false
  preOppositeAdjustedWidth = 0
  havePostSegment = false
  postActiveAdjusted = false
  postActiveAdjustedWidth = 0
  postOppositeAdjusted = false
  postOppositeAdjustedWidth = 0

  // regressionPreventer.cpp:1155-1180.
  getDebugDescription(precision = 6): string {
    const f = (v: number | boolean): string =>
      typeof v === 'boolean' ? String(v) : v.toFixed(precision)
    const lines = [
      'TsRegressionPreventer::SetResult:',
      `  adjusted: ${f(this.adjusted)}`,
      `  havePreSegment: ${f(this.havePreSegment)}`,
      `  preActiveAdjusted: ${f(this.preActiveAdjusted)}`,
      `  preActiveAdjustedWidth: ${f(this.preActiveAdjustedWidth)}`,
      `  preOppositeAdjusted: ${f(this.preOppositeAdjusted)}`,
      `  preOppositeAdjustedWidth: ${f(this.preOppositeAdjustedWidth)}`,
      `  havePostSegment: ${f(this.havePostSegment)}`,
      `  postActiveAdjusted: ${f(this.postActiveAdjusted)}`,
      `  postActiveAdjustedWidth: ${f(this.postActiveAdjustedWidth)}`,
      `  postOppositeAdjusted: ${f(this.postOppositeAdjusted)}`,
      `  postOppositeAdjustedWidth: ${f(this.postOppositeAdjustedWidth)}`,
    ]
    return lines.join('\n') + '\n'
  }
}

// regressionPreventer.h:187-213 and regressionPreventer.cpp:1089-1110.
class _KnotState {
  readonly originalKnot: TsKnot
  currentParams: Ts_KnotData

  constructor(readonly spline: TsSpline, originalKnotIn: TsKnot) {
    this.originalKnot = originalKnotIn.clone()
    this.currentParams = copyParams(Ts_KnotDataFromKnot(originalKnotIn))
  }

  restoreOriginal(): void {
    this.spline._setKnotUnchecked(this.originalKnot)
  }

  removeCurrent(): void {
    this.spline.removeKnot(this.currentParams.time)
  }

  write(newKnot: TsKnot): void {
    this.removeCurrent()
    this.spline._setKnotUnchecked(newKnot)
    this.currentParams = copyParams(Ts_KnotDataFromKnot(newKnot))
  }
}

// regressionPreventer.h:217-259 and regressionPreventer.cpp:1112-1149.
class _WorkingKnotState {
  readonly parentState: _KnotState | undefined
  readonly proposedKnot: TsKnot | undefined
  readonly proposedParams: Ts_KnotData
  workingParams: Ts_KnotData

  constructor(parent: _KnotState | Ts_KnotData, proposedKnotIn?: TsKnot) {
    if (parent instanceof _KnotState) {
      this.parentState = parent
      this.proposedKnot = (proposedKnotIn ?? parent.originalKnot).clone()
      this.proposedParams = copyParams(Ts_KnotDataFromKnot(this.proposedKnot))
    } else {
      this.parentState = undefined
      this.proposedKnot = undefined
      this.proposedParams = copyParams(parent)
    }
    this.workingParams = copyParams(this.proposedParams)
  }

  writeProposed(): void {
    const parent = this.parentState!
    const knot = this.proposedKnot!
    parent.spline._setKnotUnchecked(knot)
    parent.currentParams = copyParams(Ts_KnotDataFromKnot(knot))
  }

  writeWorking(): void {
    const parent = this.parentState!
    const knot = this.proposedKnot!.clone()
    knot.setPreTanWidth(this.workingParams.preTanWidth)
    knot.setPostTanWidth(this.workingParams.postTanWidth)
    parent.spline._setKnotUnchecked(knot)
    parent.currentParams = copyParams(this.workingParams)
  }
}

enum WhichSegment { PreSegment, PostSegment }

// regressionPreventer.h:264-327 and regressionPreventer.cpp:663-1087.
class _SegmentSolver {
  readonly #whichSegment: WhichSegment
  readonly #mode: _Mode
  readonly #segment: Ts_Segment | undefined
  readonly #activeKnotState: _WorkingKnotState | undefined
  readonly #oppositeKnotState: _WorkingKnotState | undefined
  readonly #result: TsRegressionPreventerSetResult | undefined

  constructor(
    whichSegment: WhichSegment,
    mode: _Mode,
    activeKnotState: _WorkingKnotState | undefined,
    oppositeKnotState: _WorkingKnotState | undefined,
    result: TsRegressionPreventerSetResult | undefined,
    segment?: Ts_Segment,
  ) {
    this.#whichSegment = segment ? WhichSegment.PostSegment : whichSegment
    this.#mode = mode
    this.#segment = segment
    this.#activeKnotState = activeKnotState
    this.#oppositeKnotState = oppositeKnotState
    this.#result = result
  }

  // regressionPreventer.cpp:663-689.
  adjust(): boolean {
    if (this.#mode === _ModeContain) {
      return this.#adjustWithContain()
    }
    if (!_AreTanWidthsRegressive(
        this.#getProposedActiveWidth(), this.#getProposedOppositeWidth())) {
      return true
    }
    switch (this.#mode) {
      case _ModeKeepRatio: return this.#adjustWithKeepRatio()
      case _ModeKeepStart: return this.#adjustWithKeepStart()
      case _ModeLimitActive: return this.#adjustWithLimitActive()
      case _ModeLimitOpposite: return this.#adjustWithLimitOpposite()
      default: return false
    }
  }

  // regressionPreventer.cpp:691-711.
  #adjustWithContain(): boolean {
    if (this.#getProposedActiveWidth() > kContainedMax) {
      this.#setActiveWidth(kContainedMax)
    }
    if (this.#getProposedOppositeWidth() > kContainedMax) {
      this.#setOppositeWidth(kContainedMax)
    }
    return true
  }

  // regressionPreventer.cpp:713-737.
  #adjustWithKeepRatio(): boolean {
    if (this.#getProposedActiveWidth() < kReadPadding) {
      this.#setOppositeWidth(kContainedMax - kWritePadding)
    } else if (this.#getProposedOppositeWidth() < kReadPadding) {
      this.#setActiveWidth(kContainedMax - kWritePadding)
    } else {
      const ratio = this.#getProposedActiveWidth() / this.#getProposedOppositeWidth()
      const adjustedOpposite = (Math.sqrt(ratio) + ratio + 1) / (ratio * ratio + ratio + 1)
      this.#setActiveWidth(ratio * adjustedOpposite - kWritePadding)
      this.#setOppositeWidth(adjustedOpposite - kWritePadding)
    }
    return true
  }

  // regressionPreventer.cpp:739-756.
  #adjustWithKeepStart(): boolean {
    if (this.#getProposedStartWidth() >= kVertMax) {
      this.#setStartWidth(kVertMax - kWritePadding)
      this.#setEndWidth(kVertMin - kWritePadding)
    } else {
      const adjustedWidth = _ComputeOtherWidthForVert(
        this.#getProposedStartWidth(), this.#getProposedEndWidth())
      this.#setEndWidth(adjustedWidth - kWritePadding)
    }
    return true
  }

  // regressionPreventer.cpp:758-776.
  #adjustWithLimitActive(): boolean {
    if (this.#getProposedOppositeWidth() >= kVertMax) {
      this.#setOppositeWidth(kVertMax - kWritePadding)
      this.#setActiveWidth(Math.min(kVertMin - kWritePadding, this.#getProposedActiveWidth()))
    } else {
      const adjustedWidth = _ComputeOtherWidthForVert(
        this.#getProposedOppositeWidth(), this.#getProposedActiveWidth())
      this.#setActiveWidth(adjustedWidth - kWritePadding)
    }
    return true
  }

  // regressionPreventer.cpp:778-803.
  #adjustWithLimitOpposite(): boolean {
    if (this.#getProposedOppositeWidth() <= kVertMin) {
      const adjustedWidth = _ComputeOtherWidthForVert(
        this.#getProposedOppositeWidth(), this.#getProposedActiveWidth())
      this.#setActiveWidth(adjustedWidth - kWritePadding)
    } else if (this.#getProposedActiveWidth() >= kVertMax) {
      this.#setActiveWidth(kVertMax - kWritePadding)
      this.#setOppositeWidth(kVertMin - kWritePadding)
    } else {
      const adjustedWidth = _ComputeOtherWidthForVert(
        this.#getProposedActiveWidth(), this.#getProposedOppositeWidth())
      this.#setOppositeWidth(adjustedWidth - kWritePadding)
    }
    return true
  }

  // regressionPreventer.cpp:895-905.
  #getProposedActiveWidth(): number {
    const seg = this.#segment
    const width = seg
      ? seg.t0[0] - seg.p0[0]
      : this.#whichSegment === WhichSegment.PreSegment
        ? this.#activeKnotState!.proposedParams.preTanWidth
        : this.#activeKnotState!.proposedParams.postTanWidth
    return width / this.#getSegmentWidth()
  }

  // regressionPreventer.cpp:907-917.
  #getProposedOppositeWidth(): number {
    const seg = this.#segment
    const width = seg
      ? seg.p1[0] - seg.t1[0]
      : this.#whichSegment === WhichSegment.PreSegment
        ? this.#oppositeKnotState!.proposedParams.postTanWidth
        : this.#oppositeKnotState!.proposedParams.preTanWidth
    return width / this.#getSegmentWidth()
  }

  // regressionPreventer.cpp:919-958.
  #setActiveWidth(width: number): void {
    const adjusted = width !== this.#getProposedActiveWidth()
    const rawWidth = width * this.#getSegmentWidth()
    const result = this.#result
    const seg = this.#segment

    if (seg) {
      const tangent: [number, number] = [seg.t0[0] - seg.p0[0], seg.t0[1] - seg.p0[1]]
      const scale = tangent[0] === 0 ? 1.0 : rawWidth / tangent[0]
      seg.t0 = [seg.p0[0] + tangent[0] * scale, seg.p0[1] + tangent[1] * scale]
      if (result) {
        result.adjusted ||= adjusted
        result.postActiveAdjusted ||= adjusted
        result.postActiveAdjustedWidth = rawWidth
      }
    } else if (this.#whichSegment === WhichSegment.PreSegment) {
      this.#activeKnotState!.workingParams.setPreTanWidth(rawWidth)
      if (result) {
        result.adjusted ||= adjusted
        result.preActiveAdjusted ||= adjusted
        result.preActiveAdjustedWidth = rawWidth
      }
    } else {
      this.#activeKnotState!.workingParams.setPostTanWidth(rawWidth)
      if (result) {
        result.adjusted ||= adjusted
        result.postActiveAdjusted ||= adjusted
        result.postActiveAdjustedWidth = rawWidth
      }
    }
  }

  // regressionPreventer.cpp:960-1001.
  #setOppositeWidth(width: number): void {
    const adjusted = width !== this.#getProposedOppositeWidth()
    const rawWidth = width * this.#getSegmentWidth()
    const result = this.#result
    const seg = this.#segment

    if (seg) {
      const tangent: [number, number] = [seg.t1[0] - seg.p1[0], seg.t1[1] - seg.p1[1]]
      const scale = tangent[0] === 0 ? 1.0 : -rawWidth / tangent[0]
      seg.t1 = [seg.p1[0] + tangent[0] * scale, seg.p1[1] + tangent[1] * scale]
      if (result) {
        result.adjusted ||= adjusted
        result.postOppositeAdjusted ||= adjusted
        result.postOppositeAdjustedWidth = rawWidth
      }
    } else if (this.#whichSegment === WhichSegment.PreSegment) {
      this.#oppositeKnotState!.workingParams.setPostTanWidth(rawWidth)
      if (result) {
        result.adjusted ||= adjusted
        result.preOppositeAdjusted ||= adjusted
        result.preOppositeAdjustedWidth = rawWidth
      }
    } else {
      this.#oppositeKnotState!.workingParams.setPreTanWidth(rawWidth)
      if (result) {
        result.adjusted ||= adjusted
        result.postOppositeAdjusted ||= adjusted
        result.postOppositeAdjustedWidth = rawWidth
      }
    }
  }

  // regressionPreventer.cpp:1003-1041.
  #getProposedStartWidth(): number {
    return this.#whichSegment === WhichSegment.PreSegment
      ? this.#getProposedOppositeWidth()
      : this.#getProposedActiveWidth()
  }
  #getProposedEndWidth(): number {
    return this.#whichSegment === WhichSegment.PreSegment
      ? this.#getProposedActiveWidth()
      : this.#getProposedOppositeWidth()
  }
  #setStartWidth(width: number): void {
    if (this.#whichSegment === WhichSegment.PreSegment) this.#setOppositeWidth(width)
    else this.#setActiveWidth(width)
  }
  #setEndWidth(width: number): void {
    if (this.#whichSegment === WhichSegment.PreSegment) this.#setActiveWidth(width)
    else this.#setOppositeWidth(width)
  }

  // regressionPreventer.cpp:1043-1065.
  #getSegmentWidth(): number {
    const seg = this.#segment
    if (seg) {
      return seg.p1[0] - seg.p0[0]
    }
    let width = this.#activeKnotState!.proposedParams.time -
      this.#oppositeKnotState!.proposedParams.time
    if (this.#whichSegment === WhichSegment.PostSegment) {
      width *= -1
    }
    if (!(width > 0)) {
      return 1.0
    }
    return width
  }
}

// regressionPreventer.cpp:807-830.
function _AreTanWidthsRegressive(width1: number, width2: number): boolean {
  if (width1 <= kContainedMax && width2 <= kContainedMax) {
    return false
  }
  const w1 = width1 + kReadPadding
  const w2 = width2 + kReadPadding
  return (w1 * w1) + (w2 * w2) - 2 * (w1 + w2) + (w1 * w2) + 1 > 0.0
}

// regressionPreventer.cpp:832-853.
function _ComputeOtherWidthForVert(width: number, hint: number): number {
  if (width > kVertMax) {
    return kVertMin
  }
  const b = width - 2.0
  const c = Math.pow(width - 1.0, 2)
  const rootBase = -b / 2.0
  const rootOffset = Math.sqrt(b * b - 4 * c) / 2.0
  return hint > rootBase ? rootBase + rootOffset : rootBase - rootOffset
}

// regressionPreventer.h:37-157 and regressionPreventer.cpp:172-505.
export class TsRegressionPreventer {
  static readonly InteractiveMode = TsRegressionPreventerInteractiveMode
  static readonly ModeLimitActive = TsRegressionPreventerInteractiveMode.ModeLimitActive
  static readonly ModeLimitOpposite = TsRegressionPreventerInteractiveMode.ModeLimitOpposite
  static readonly SetResult = TsRegressionPreventerSetResult

  readonly #spline: TsSpline
  readonly #mode: _Mode
  readonly #limit: boolean
  #valid = true
  #initialAdjustmentDone = false
  #activeKnotState: _KnotState | undefined
  #preKnotState: _KnotState | undefined
  #postKnotState: _KnotState | undefined
  #overwrittenKnotState: _KnotState | undefined

  /**
   * TsRegressionPreventer(spline, activeKnotTime, limit = true) uses
   * TsSpline::GetAntiRegressionAuthoringMode(); passing an InteractiveMode as
   * the third argument selects that mode (regressionPreventer.cpp:177-199).
   */
  constructor(
    spline: TsSpline,
    activeKnotTime: number,
    modeOrLimit?: TsRegressionPreventerInteractiveMode | boolean,
    limit = true,
  ) {
    let mode: _Mode
    if (typeof modeOrLimit === 'number') {
      mode = modeOrLimit
    } else {
      mode = spline.getAntiRegressionAuthoringMode()
      if (typeof modeOrLimit === 'boolean') limit = modeOrLimit
    }
    this.#spline = spline
    this.#mode = mode
    this.#limit = limit

    // regressionPreventer.cpp:201-264.
    if (this.#spline.getCurveType() !== TsCurveType.Bezier) {
      this.#valid = false
      return
    }

    const map = this.#spline.getKnots()
    const activeIt = map.indexOfTime(activeKnotTime)
    if (activeIt < 0) {
      this.#valid = false
      return
    }

    if (this.#spline.hasInnerLoops()) {
      const lp = this.#spline.getInnerLoopParams()
      if (lp.getLoopedInterval().contains(activeKnotTime) &&
          !lp.getPrototypeInterval().contains(activeKnotTime)) {
        this.#valid = false
        return
      }
    }

    const activeKnot = map[activeIt]!
    this.#activeKnotState = new _KnotState(this.#spline, activeKnot)
    if (activeIt > 0) {
      const preOppositeKnot = map[activeIt - 1]!
      if (preOppositeKnot.getNextInterpolation() === TsInterpMode.Curve) {
        this.#preKnotState = new _KnotState(this.#spline, preOppositeKnot)
      }
    }
    if (activeIt + 1 < map.length) {
      const postOppositeKnot = map[activeIt + 1]!
      if (activeKnot.getNextInterpolation() === TsInterpMode.Curve) {
        this.#postKnotState = new _KnotState(this.#spline, postOppositeKnot)
      }
    }
  }

  // regressionPreventer.cpp:267-294.
  #initSetResult(proposedActiveKnot: TsKnot, resultOut: TsRegressionPreventerSetResult): void {
    resultOut.havePreSegment = this.#preKnotState !== undefined
    resultOut.havePostSegment = this.#postKnotState !== undefined
    resultOut.preActiveAdjustedWidth = proposedActiveKnot.getPreTanWidth()
    resultOut.postActiveAdjustedWidth = proposedActiveKnot.getPostTanWidth()
    if (this.#preKnotState) {
      resultOut.preOppositeAdjustedWidth = this.#preKnotState.originalKnot.getPostTanWidth()
    }
    if (this.#postKnotState) {
      resultOut.postOppositeAdjustedWidth = this.#postKnotState.originalKnot.getPreTanWidth()
    }
  }

  /**
   * Set an edited version of the active knot (regressionPreventer.cpp:299-324).
   * Returns the SetResult on success and undefined on failure, like the
   * Python wrapper (wrapRegressionPreventer.cpp:33-46).
   */
  Set(proposedActiveKnot: TsKnot): TsRegressionPreventerSetResult | undefined {
    const resultOut = new TsRegressionPreventerSetResult()
    this.#initSetResult(proposedActiveKnot, resultOut)

    if (!this.#valid) {
      return undefined
    }

    if (this.#mode === _ModeNone) {
      this.#activeKnotState!.write(proposedActiveKnot)
      return resultOut
    }

    this.#handleInitialAdjustment(resultOut)
    this.#handleTimeChange(proposedActiveKnot.getTime())
    this.#doSet(proposedActiveKnot, this.#mode, resultOut)
    return resultOut
  }

  // regressionPreventer.cpp:326-361.
  #handleInitialAdjustment(resultOut: TsRegressionPreventerSetResult): void {
    if (this.#initialAdjustmentDone) {
      return
    }
    this.#initialAdjustmentDone = true

    const initialMode = this.#mode === _ModeContain ? _ModeContain : _ModeLimitOpposite
    this.#doSet(this.#activeKnotState!.originalKnot, initialMode, resultOut)

    if (this.#preKnotState) {
      const knot = this.#preKnotState.originalKnot.clone()
      knot.setPostTanWidth(this.#preKnotState.currentParams.postTanWidth)
      this.#preKnotState = new _KnotState(this.#spline, knot)
    }
    if (this.#postKnotState) {
      const knot = this.#postKnotState.originalKnot.clone()
      knot.setPreTanWidth(this.#postKnotState.currentParams.preTanWidth)
      this.#postKnotState = new _KnotState(this.#spline, knot)
    }
  }

  // regressionPreventer.cpp:363-432.
  #handleTimeChange(proposedActiveTime: number): void {
    if (proposedActiveTime === this.#activeKnotState!.currentParams.time) {
      return
    }

    this.#activeKnotState!.removeCurrent()

    if (!this.#overwrittenKnotState &&
        (!this.#preKnotState ||
         proposedActiveTime > this.#preKnotState.originalKnot.getTime()) &&
        (!this.#postKnotState ||
         proposedActiveTime < this.#postKnotState.originalKnot.getTime())) {
      return
    }

    if (this.#overwrittenKnotState) {
      this.#overwrittenKnotState.restoreOriginal()
      this.#overwrittenKnotState = undefined
    }

    if (this.#preKnotState) {
      this.#preKnotState.restoreOriginal()
      this.#preKnotState = undefined
    }
    if (this.#postKnotState) {
      this.#postKnotState.restoreOriginal()
      this.#postKnotState = undefined
    }

    const map = this.#spline.getKnots()
    const lbIt = map.lowerBound(proposedActiveTime)

    if (lbIt < map.length && map[lbIt]!.getTime() === proposedActiveTime) {
      this.#overwrittenKnotState = new _KnotState(this.#spline, map[lbIt]!)
    }

    if (lbIt > 0) {
      this.#preKnotState = new _KnotState(this.#spline, map[lbIt - 1]!)
    }

    const postOffset = this.#overwrittenKnotState ? 1 : 0
    if (lbIt + postOffset < map.length) {
      this.#postKnotState = new _KnotState(this.#spline, map[lbIt + postOffset]!)
    }
  }

  // regressionPreventer.cpp:434-494.
  #doSet(proposedActiveKnot: TsKnot, mode: _Mode, resultOut: TsRegressionPreventerSetResult): void {
    const activeWorking = new _WorkingKnotState(this.#activeKnotState!, proposedActiveKnot)
    let preWorking: _WorkingKnotState | undefined
    let postWorking: _WorkingKnotState | undefined

    if (this.#preKnotState) {
      preWorking = new _WorkingKnotState(this.#preKnotState)
      new _SegmentSolver(
        WhichSegment.PreSegment, mode, activeWorking, preWorking, resultOut).adjust()
    }

    if (this.#postKnotState) {
      postWorking = new _WorkingKnotState(this.#postKnotState)
      new _SegmentSolver(
        WhichSegment.PostSegment, mode, activeWorking, postWorking, resultOut).adjust()
    }

    if (this.#limit) {
      activeWorking.writeWorking()
      preWorking?.writeWorking()
      postWorking?.writeWorking()
    } else {
      activeWorking.writeProposed()
    }
  }
}

// regressionPreventer.h:358-385 and regressionPreventer.cpp:499-658.
export class Ts_RegressionPreventerBatchAccess {
  /**
   * IsSegmentRegressive(startKnot, endKnot, mode) or
   * IsSegmentRegressive(segment, mode).
   */
  static isSegmentRegressive(
    startKnotOrSegment: Ts_KnotData | Ts_Segment,
    endKnotOrMode: Ts_KnotData | TsAntiRegressionMode,
    modeIn?: TsAntiRegressionMode,
  ): boolean {
    let startWidth: number
    let endWidth: number
    let mode: TsAntiRegressionMode
    if (startKnotOrSegment instanceof Ts_Segment) {
      const segment = startKnotOrSegment
      mode = endKnotOrMode as TsAntiRegressionMode
      if (segment.interp !== Ts_SegmentInterp.Bezier) {
        return false
      }
      const interval = segment.p1[0] - segment.p0[0]
      startWidth = (segment.t0[0] - segment.p0[0]) / interval
      endWidth = (segment.p1[0] - segment.t1[0]) / interval
    } else {
      const startKnot = startKnotOrSegment
      const endKnot = endKnotOrMode as Ts_KnotData
      mode = modeIn ?? TsAntiRegressionMode.KeepRatio
      if (startKnot.nextInterp !== TsInterpMode.Curve) {
        return false
      }
      const interval = endKnot.time - startKnot.time
      startWidth = startKnot.getPostTanWidth() / interval
      endWidth = endKnot.getPreTanWidth() / interval
    }

    if (mode === TsAntiRegressionMode.Contain) {
      return startWidth > kContainedMax || endWidth > kContainedMax
    }
    return _AreTanWidthsRegressive(startWidth, endWidth)
  }

  /**
   * ProcessSegment(startKnot, endKnot, mode) or ProcessSegment(segment, mode).
   * Knot data and segments are modified in place; returns whether anything
   * changed.
   */
  static processSegment(
    startKnotOrSegment: Ts_KnotData | Ts_Segment,
    endKnotOrMode: Ts_KnotData | TsAntiRegressionMode,
    modeIn?: TsAntiRegressionMode,
  ): boolean {
    if (startKnotOrSegment instanceof Ts_Segment) {
      const segment = startKnotOrSegment
      const mode = endKnotOrMode as TsAntiRegressionMode
      if (mode === _ModeNone) {
        return false
      }
      if (segment.interp !== Ts_SegmentInterp.Bezier) {
        return false
      }
      const setResult = new TsRegressionPreventerSetResult()
      new _SegmentSolver(
        WhichSegment.PostSegment, mode, undefined, undefined, setResult, segment).adjust()
      return setResult.adjusted
    }

    const startKnot = startKnotOrSegment
    const endKnot = endKnotOrMode as Ts_KnotData
    const mode = modeIn ?? TsAntiRegressionMode.KeepRatio
    if (mode === _ModeNone) {
      return false
    }
    if (startKnot.nextInterp !== TsInterpMode.Curve) {
      return false
    }

    const startWorking = new _WorkingKnotState(startKnot)
    const endWorking = new _WorkingKnotState(endKnot)
    const setResult = new TsRegressionPreventerSetResult()
    new _SegmentSolver(
      WhichSegment.PostSegment, mode, startWorking, endWorking, setResult).adjust()

    if (setResult.postActiveAdjusted) {
      startKnot.postTanWidth = startWorking.workingParams.postTanWidth
    }
    if (setResult.postOppositeAdjusted) {
      endKnot.preTanWidth = endWorking.workingParams.preTanWidth
    }
    return setResult.adjusted
  }
}
