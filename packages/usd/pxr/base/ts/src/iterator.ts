// Ported from OpenUSD 26.11.1: pxr/base/ts/iterator.cpp,
//  pxr/base/ts/iterator.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Interval as GfInterval } from 'typescript-usd/gf'
import { Ts_TypedKnotData } from './knotData.ts'
import { Ts_Segment, Ts_SegmentInterp } from './segment.ts'
import { Ts_LowerBound, Ts_SplineData, Ts_UpperBound } from './splineData.ts'
import { TsExtrapMode, TsLoopParams, TsSplineSampleSource } from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/iterator.h and iterator.cpp.

const inf = Infinity
const OPEN = false
const CLOSED = true
const INT32_MIN = -2147483648
const INT32_MAX = 2147483647

// iterator.cpp:27-32.
function _GetOpenLoopedInterval(lp: TsLoopParams): GfInterval {
  const result = lp.getLoopedInterval()
  result.setMax(result.getMax(), OPEN)
  return result
}

// iterator.cpp:34-53.
function _SegmentAtEnd(interval: GfInterval, segment: Ts_Segment, reversed: boolean): boolean {
  if (reversed) {
    const t0 = segment.p0[0]
    if (!interval.contains(t0) || t0 === interval.getMin()) {
      return true
    }
  } else {
    const t1 = segment.p1[0]
    if (!interval.contains(t1)) {
      return true
    }
  }
  return false
}

// iterator.cpp:55-61.
function _SegmentOverlapsInterval(interval: GfInterval, segment: Ts_Segment): boolean {
  const segInterval = new GfInterval(segment.p0[0], segment.p1[0], CLOSED, OPEN)
  return !segInterval.getIntersection(interval).IsEmpty()
}

/** Build a segment from the knots that bound it (iterator.cpp:144-154). */
function _SegmentFromKnots(
  prevKnot: Ts_TypedKnotData,
  nextKnot: Ts_TypedKnotData,
  data: Ts_SplineData,
): Ts_Segment {
  const segment = new Ts_Segment()
  segment.p0 = [prevKnot.time, prevKnot.value]
  segment.p1 = [nextKnot.time, nextKnot.getPreValue()]
  segment.t0 = [segment.p0[0] + prevKnot.postTanWidth,
    segment.p0[1] + prevKnot.postTanWidth * prevKnot.postTanSlope]
  segment.t1 = [segment.p1[0] + -nextKnot.preTanWidth,
    segment.p1[1] + nextKnot.getPreTanHeight()]
  segment.setInterp(prevKnot.nextInterp, data.curveType)
  return segment
}

////////////////////////////////////////////////////////////////
// Ts_SegmentPrototypeIterator (iterator.cpp:64-219)

export class Ts_SegmentPrototypeIterator {
  #data: Ts_SplineData | undefined
  #interval = new GfInterval()
  #segment = new Ts_Segment()
  #reversed = false
  #atEnd = true
  #timesIt = 0
  #firstProtoKnotIndex = 0

  constructor(data?: Ts_SplineData, interval?: GfInterval, reversed = false) {
    if (interval === undefined) {
      return
    }
    this.#data = data
    this.#interval = interval.clone()
    this.#reversed = reversed
    this.#atEnd = false

    const first = { value: 0 }
    if (!data || !data.hasInnerLoops(first)) {
      this.#atEnd = true
      return
    }
    this.#firstProtoKnotIndex = first.value

    const protoInterval = data.loopParams.getPrototypeInterval()
    const iterInterval = interval.getIntersection(protoInterval)

    if (iterInterval.IsEmpty()) {
      this.#atEnd = true
      this.#interval = iterInterval
      return
    }

    const times = data.times
    if (this.#reversed) {
      this.#timesIt = Ts_LowerBound(times, iterInterval.getMax())
      if (this.#timesIt !== times.length &&
          this.#interval.isMaxClosed() &&
          times[this.#timesIt] === this.#interval.getMax()) {
        // This knot is the beginning of the segment.
      } else if (this.#timesIt !== 0) {
        --this.#timesIt
      }
    } else {
      this.#timesIt = Ts_UpperBound(times, iterInterval.getMin())
      if (this.#timesIt !== 0) {
        --this.#timesIt
      }
    }

    this.#updateSegment()
    this.#atEnd = false
  }

  #updateSegment(): void {
    const data = this.#data!
    const times = data.times
    const lp = data.loopParams

    const prevIndex = this.#timesIt
    const prevKnot = data.getKnotDataAsDouble(prevIndex)
    let nextKnot: Ts_TypedKnotData

    const nextIndex = prevIndex + 1
    if (nextIndex < times.length && times[nextIndex]! < lp.protoEnd) {
      nextKnot = data.getKnotDataAsDouble(nextIndex)
    } else {
      nextKnot = data.getKnotDataAsDouble(this.#firstProtoKnotIndex)
      nextKnot.time += lp.protoEnd - lp.protoStart
      nextKnot.preValue += lp.valueOffset
      nextKnot.value += lp.valueOffset
    }

    this.#segment = _SegmentFromKnots(prevKnot, nextKnot, data)
  }

  AtEnd(): boolean { return this.#atEnd }
  Get(): Ts_Segment { return this.#segment.clone() }

  increment(): this {
    if (_SegmentAtEnd(this.#interval, this.#segment, this.#reversed)) {
      this.#atEnd = true
      return this
    }
    this.stepForward()
    return this
  }

  stepForward(): boolean {
    if (this.#interval.IsEmpty()) {
      this.#atEnd = true
      return false
    }

    const data = this.#data!
    const times = data.times
    if (this.#timesIt < 0 || this.#timesIt >= times.length) {
      this.#atEnd = true
      return false
    }

    const lp = data.loopParams
    if ((this.#reversed && times[this.#timesIt]! <= lp.protoStart) ||
        (!this.#reversed && times[this.#timesIt]! >= lp.protoEnd)) {
      this.#atEnd = true
      return false
    }

    if (this.#reversed) {
      if (this.#timesIt === 0) {
        this.#atEnd = true
        return false
      }
      --this.#timesIt
    } else {
      if (this.#timesIt + 1 === times.length ||
          times[this.#timesIt + 1]! >= lp.protoEnd) {
        this.#atEnd = true
        return false
      }
      ++this.#timesIt
    }

    this.#updateSegment()
    this.#atEnd = !_SegmentOverlapsInterval(this.#interval, this.#segment)
    return true
  }

  stepBackward(): boolean {
    this.#reversed = !this.#reversed
    const success = this.stepForward()
    this.#reversed = !this.#reversed
    return success
  }
}

////////////////////////////////////////////////////////////////
// Ts_SegmentLoopIterator (iterator.cpp:221-400)

export class Ts_SegmentLoopIterator {
  #protoIt = new Ts_SegmentPrototypeIterator()
  #data: Ts_SplineData | undefined
  #interval = new GfInterval()
  #segment = new Ts_Segment()
  #protoSpan = 0
  #valueOffset = 0
  #minIteration = 0
  #maxIteration = 0
  #curIteration = 0
  #reversed = false
  #atEnd = true
  #steppingBackward = false
  #initializedPrototypeItBackward = false

  constructor(data?: Ts_SplineData, interval?: GfInterval, reversed = false) {
    if (interval === undefined) {
      return
    }
    this.#data = data
    this.#interval = interval.clone()
    this.#reversed = reversed
    this.#atEnd = false

    if (!data || !data.hasInnerLoops()) {
      this.#atEnd = true
      return
    }

    const lp = data.loopParams
    const loopedInterval = _GetOpenLoopedInterval(lp)
    const iterInterval = this.#interval.getIntersection(loopedInterval)

    if (iterInterval.IsEmpty()) {
      this.#atEnd = true
      this.#interval = iterInterval
      return
    }

    const protoStart = lp.protoStart
    const protoEnd = lp.protoEnd
    this.#protoSpan = protoEnd - protoStart
    this.#valueOffset = lp.valueOffset

    this.#minIteration = -lp.numPreLoops
    this.#maxIteration = lp.numPostLoops

    let initialTimeOffset: number
    if (this.#reversed) {
      initialTimeOffset = iterInterval.getMax() - protoStart
      this.#curIteration = Math.floor(initialTimeOffset / this.#protoSpan)
      if (this.#curIteration * this.#protoSpan === initialTimeOffset) {
        --this.#curIteration
      }
    } else {
      initialTimeOffset = iterInterval.getMin() - protoStart
      this.#curIteration = Math.floor(initialTimeOffset / this.#protoSpan)
    }
    this.#curIteration = Math.min(Math.max(this.#curIteration, this.#minIteration), this.#maxIteration)

    this.#updatePrototypeIterator()
    this.#updateSegment()
    this.#atEnd = this.#protoIt.AtEnd()
  }

  #updateSegment(): void {
    this.#segment = this.#protoIt.Get()
    this.#segment.addInPlace([
      this.#curIteration * this.#protoSpan, this.#curIteration * this.#valueOffset])
  }

  #updatePrototypeIterator(): void {
    const data = this.#data!
    const lp = data.loopParams
    const timeDelta = this.#curIteration * this.#protoSpan

    const protoInterval = new GfInterval(lp.protoStart, lp.protoEnd, CLOSED, OPEN)
    if (this.#reversed) {
      const startTime = this.#interval.getMax() - timeDelta
      if (protoInterval.contains(startTime)) {
        protoInterval.setMax(startTime, OPEN)
      }
    } else {
      const startTime = this.#interval.getMin() - timeDelta
      if (protoInterval.contains(startTime)) {
        protoInterval.setMin(startTime, CLOSED)
      }
    }

    this.#protoIt = new Ts_SegmentPrototypeIterator(data, protoInterval, this.#reversed)
  }

  AtEnd(): boolean { return this.#atEnd }
  Get(): Ts_Segment { return this.#segment.clone() }

  increment(): this {
    if (_SegmentAtEnd(this.#interval, this.#segment, this.#reversed)) {
      this.#atEnd = true
      return this
    }
    this.stepForward()
    return this
  }

  stepForward(): boolean {
    if (this.#interval.IsEmpty()) {
      this.#atEnd = true
      return false
    }

    const loopedInterval = _GetOpenLoopedInterval(this.#data!.loopParams)
    if (_SegmentAtEnd(loopedInterval, this.#segment, this.#reversed)) {
      this.#atEnd = true
      return false
    }

    const stepBackward = this.#steppingBackward !== this.#initializedPrototypeItBackward
    const success = stepBackward ? this.#protoIt.stepBackward() : this.#protoIt.stepForward()
    if (!success) {
      this.#curIteration += this.#reversed ? -1 : 1

      if ((this.#reversed && this.#curIteration < this.#minIteration) ||
          (!this.#reversed && this.#curIteration > this.#maxIteration)) {
        this.#atEnd = true
        return false
      }

      this.#initializedPrototypeItBackward = this.#steppingBackward
      this.#updatePrototypeIterator()
    }

    this.#updateSegment()
    this.#atEnd = !_SegmentOverlapsInterval(this.#interval, this.#segment)
    return true
  }

  stepBackward(): boolean {
    this.#reversed = !this.#reversed
    this.#steppingBackward = true
    const success = this.stepForward()
    this.#steppingBackward = false
    this.#reversed = !this.#reversed
    return success
  }
}

////////////////////////////////////////////////////////////////
// Ts_SegmentKnotIterator (iterator.cpp:402-713)

enum KnotSection {
  PreInnerLooping,
  InnerLooping,
  PostInnerLooping,
}

export class Ts_SegmentKnotIterator {
  #loopIt = new Ts_SegmentLoopIterator()
  #data: Ts_SplineData | undefined
  #interval = new GfInterval()
  #segment = new Ts_Segment()
  #knotSection = KnotSection.PostInnerLooping
  #reversed = false
  #atEnd = true
  #hasInnerLoops = false
  #steppingBackward = false
  #initializedLoopItBackward = false
  #timesIt = 0
  #loopedInterval = new GfInterval()
  #firstProtoKnotIndex = 0

  constructor(data?: Ts_SplineData, interval?: GfInterval, reversed = false) {
    if (interval === undefined) {
      return
    }
    this.#data = data
    this.#interval = interval.clone()
    this.#reversed = reversed
    this.#atEnd = false

    if (!data) {
      this.#atEnd = true
      return
    }

    const times = data.times

    let firstTime = times[0]!
    let lastTime = times[times.length - 1]!

    const first = { value: 0 }
    this.#hasInnerLoops = data.hasInnerLoops(first)
    this.#firstProtoKnotIndex = first.value
    if (this.#hasInnerLoops) {
      this.#loopedInterval = _GetOpenLoopedInterval(data.loopParams)
      firstTime = Math.min(firstTime, this.#loopedInterval.getMin())
      lastTime = Math.max(lastTime, this.#loopedInterval.getMax())
    }

    if (times.length < 2 && !this.#hasInnerLoops) {
      this.#atEnd = true
      return
    }

    this.#interval.intersectWith(new GfInterval(firstTime, lastTime, CLOSED, OPEN))
    if (this.#interval.IsEmpty()) {
      this.#atEnd = true
      return
    }

    const iv = this.#interval
    const looped = this.#loopedInterval
    if (this.#hasInnerLoops) {
      if (this.#reversed) {
        if (times[times.length - 1]! > looped.getMax() && iv.getMax() > looped.getMax()) {
          this.#knotSection = KnotSection.PostInnerLooping
        } else if (iv.getMax() > looped.getMin()) {
          this.#knotSection = KnotSection.InnerLooping
        } else if (iv.getMax() > times[0]!) {
          this.#knotSection = KnotSection.PreInnerLooping
        } else {
          this.#knotSection = KnotSection.PreInnerLooping
          this.#atEnd = true
          return
        }
      } else {
        if (times[0]! < looped.getMin() && iv.getMin() < looped.getMin()) {
          this.#knotSection = KnotSection.PreInnerLooping
        } else if (iv.getMin() < looped.getMax()) {
          this.#knotSection = KnotSection.InnerLooping
        } else if (iv.getMin() < times[times.length - 1]!) {
          this.#knotSection = KnotSection.PostInnerLooping
        } else {
          this.#knotSection = KnotSection.PostInnerLooping
          this.#atEnd = true
          return
        }
      }
    } else {
      this.#knotSection = KnotSection.PostInnerLooping
    }

    if (this.#knotSection === KnotSection.InnerLooping) {
      this.#loopIt = new Ts_SegmentLoopIterator(data, this.#interval, this.#reversed)
    } else {
      if (this.#reversed) {
        this.#timesIt = Ts_LowerBound(times, iv.getMax())
        if (this.#timesIt !== times.length &&
            iv.isMaxClosed() &&
            times[this.#timesIt] === iv.getMax()) {
          // This knot is the beginning of the segment.
        } else if (this.#timesIt !== 0) {
          --this.#timesIt
        }
      } else {
        this.#timesIt = Ts_UpperBound(times, iv.getMin())
        if (this.#timesIt !== 0) {
          --this.#timesIt
        }
      }
    }

    this.#updateSegment()
  }

  // iterator.cpp:540-597.
  #updateSegment(): void {
    if (this.#knotSection === KnotSection.InnerLooping) {
      this.#segment = this.#loopIt.Get()
      return
    }

    const data = this.#data!
    const times = data.times
    const lp = data.loopParams

    let prevKnot: Ts_TypedKnotData
    let nextKnot: Ts_TypedKnotData
    const prevIndex = this.#timesIt
    const nextIndex = prevIndex + 1

    if (this.#hasInnerLoops && this.#knotSection === KnotSection.PostInnerLooping &&
        times[prevIndex]! <= this.#loopedInterval.getMax()) {
      prevKnot = data.getKnotDataAsDouble(this.#firstProtoKnotIndex)
      prevKnot.time += (lp.protoEnd - lp.protoStart) * (lp.numPostLoops + 1)
      prevKnot.value += lp.valueOffset * (lp.numPostLoops + 1)
    } else {
      prevKnot = data.getKnotDataAsDouble(prevIndex)
    }

    if (this.#hasInnerLoops && this.#knotSection === KnotSection.PreInnerLooping &&
        times[nextIndex]! >= this.#loopedInterval.getMin()) {
      nextKnot = data.getKnotDataAsDouble(this.#firstProtoKnotIndex)
      nextKnot.time -= (lp.protoEnd - lp.protoStart) * lp.numPreLoops
      nextKnot.value -= lp.valueOffset * lp.numPreLoops
    } else {
      nextKnot = data.getKnotDataAsDouble(nextIndex)
    }

    this.#segment = _SegmentFromKnots(prevKnot, nextKnot, data)
  }

  AtEnd(): boolean { return this.#atEnd }
  Get(): Ts_Segment { return this.#segment.clone() }

  increment(): this {
    if (_SegmentAtEnd(this.#interval, this.#segment, this.#reversed)) {
      this.#atEnd = true
      return this
    }
    this.stepForward()
    return this
  }

  // iterator.cpp:616-700.
  stepForward(): boolean {
    if (this.#interval.IsEmpty()) {
      this.#atEnd = true
      return false
    }

    const data = this.#data!
    const times = data.times

    if (this.#knotSection === KnotSection.InnerLooping) {
      const stepBackward = this.#steppingBackward !== this.#initializedLoopItBackward
      const success = stepBackward ? this.#loopIt.stepBackward() : this.#loopIt.stepForward()
      if (!success) {
        this.#knotSection = this.#reversed ? KnotSection.PreInnerLooping : KnotSection.PostInnerLooping
        if (this.#reversed) {
          this.#timesIt = Ts_LowerBound(times, this.#loopedInterval.getMin())
          if (this.#timesIt === 0) {
            this.#atEnd = true
            return false
          }
          --this.#timesIt
        } else {
          this.#timesIt = Ts_UpperBound(times, this.#loopedInterval.getMax())
          if (this.#timesIt === times.length || this.#timesIt === 0) {
            this.#atEnd = true
            return false
          }
          --this.#timesIt
        }
      }
    } else {
      if (this.#reversed) {
        if (this.#timesIt === 0 || this.#timesIt + 1 >= times.length) {
          this.#atEnd = true
          return false
        }
        --this.#timesIt
        if (this.#knotSection === KnotSection.PostInnerLooping &&
            times[this.#timesIt]! < this.#loopedInterval.getMax()) {
          this.#knotSection = KnotSection.InnerLooping
          this.#initializedLoopItBackward = this.#steppingBackward
          this.#loopIt = new Ts_SegmentLoopIterator(data, this.#interval, this.#reversed)
        }
      } else {
        if (this.#timesIt === times.length ||
            (this.#knotSection === KnotSection.PostInnerLooping &&
             this.#timesIt + 2 >= times.length)) {
          this.#atEnd = true
          return false
        }
        ++this.#timesIt

        if (this.#knotSection === KnotSection.PreInnerLooping &&
            times[this.#timesIt]! >= this.#loopedInterval.getMin()) {
          this.#knotSection = KnotSection.InnerLooping
          this.#initializedLoopItBackward = this.#steppingBackward
          this.#loopIt = new Ts_SegmentLoopIterator(data, this.#interval, this.#reversed)
        }
      }
    }

    this.#updateSegment()
    this.#atEnd = !_SegmentOverlapsInterval(this.#interval, this.#segment)
    return true
  }

  stepBackward(): boolean {
    this.#reversed = !this.#reversed
    this.#steppingBackward = true
    const success = this.stepForward()
    this.#steppingBackward = false
    this.#reversed = !this.#reversed
    return success
  }
}

////////////////////////////////////////////////////////////////
// Ts_SegmentIterator (iterator.cpp:715-1319)

export class Ts_SegmentIterator {
  #knotIt = new Ts_SegmentKnotIterator()
  #data: Ts_SplineData | undefined
  #interval = new GfInterval()
  #segment = new Ts_Segment()
  #splineRegion: TsSplineSampleSource = TsSplineSampleSource.KnotInterp
  #minIteration = 0
  #maxIteration = 0
  #curIteration = 0
  #firstKnotTime = 0
  #lastKnotTime = 0
  #firstKnotPreValue = 0
  #firstKnotValue = 0
  #lastKnotPreValue = 0
  #lastKnotValue = 0
  #lastPreExtrapKnotTime = 0
  #lastPreExtrapKnotPreValue = 0
  #firstPostExtrapKnotTime = 0
  #firstPostExtrapKnotValue = 0
  #preExtrapLooped = false
  #postExtrapLooped = false
  #oscillating = false
  #shift1 = 0
  #shift2 = 0
  #valueShift = 0
  #fullKnotRegion = new GfInterval()
  #atEnd = true
  #reversing = false
  #initializedKnotItBackward = false

  // iterator.cpp:727-842.
  constructor(data?: Ts_SplineData, interval?: GfInterval) {
    if (interval === undefined) {
      return
    }
    this.#data = data
    this.#interval = interval.clone()
    this.#atEnd = false

    if (this.#interval.IsEmpty() || !data || data.times.length === 0) {
      this.#atEnd = true
      return
    }

    const times = data.times
    const lp = data.loopParams

    this.#firstKnotTime = times[0]!
    this.#lastKnotTime = times[times.length - 1]!

    this.#firstKnotPreValue = data.getKnotPreValueAsDouble(0)
    this.#firstKnotValue = data.getKnotValueAsDouble(0)
    this.#lastKnotPreValue = data.getKnotPreValueAsDouble(times.length - 1)
    this.#lastKnotValue = data.getKnotValueAsDouble(times.length - 1)

    const first = { value: 0 }
    if (data.hasInnerLoops(first)) {
      const firstProtoIndex = first.value
      const loopedInterval = _GetOpenLoopedInterval(lp)

      if (loopedInterval.getMin() <= this.#firstKnotTime) {
        this.#firstKnotTime = loopedInterval.getMin()
        this.#firstKnotPreValue = data.getKnotPreValueAsDouble(firstProtoIndex)
        this.#firstKnotPreValue -= lp.valueOffset * lp.numPreLoops
        this.#firstKnotValue = data.getKnotValueAsDouble(firstProtoIndex)
        this.#firstKnotValue -= lp.valueOffset * lp.numPreLoops
      }

      if (loopedInterval.getMax() >= this.#lastKnotTime) {
        this.#lastKnotTime = loopedInterval.getMax()
        this.#lastKnotPreValue = data.getKnotPreValueAsDouble(firstProtoIndex)
        this.#lastKnotPreValue += lp.valueOffset * (lp.numPostLoops + 1)
        this.#lastKnotValue = data.getKnotValueAsDouble(firstProtoIndex)
        this.#lastKnotValue += lp.valueOffset * (lp.numPostLoops + 1)
      }
    }

    this.#preExtrapLooped = this.#initExtrapLooping(true)
    this.#postExtrapLooped = this.#initExtrapLooping(false)
    if ((this.#preExtrapLooped && !this.#interval.isMinFinite()) ||
        (this.#postExtrapLooped && !this.#interval.isMaxFinite())) {
      this.#atEnd = true
      return
    }

    this.#curIteration = 0
    if (this.#preExtrapLooped && this.#interval.getMin() < this.#firstKnotTime) {
      const knotSpan = this.#lastPreExtrapKnotTime - this.#firstKnotTime
      const offset = this.#interval.getMin() - this.#firstKnotTime
      this.#curIteration = Math.floor(offset / knotSpan)
    } else if (this.#postExtrapLooped && this.#interval.getMin() >= this.#lastKnotTime) {
      const knotSpan = this.#lastKnotTime - this.#firstPostExtrapKnotTime
      const offset = this.#interval.getMin() - this.#lastKnotTime
      this.#curIteration = 1 + Math.floor(offset / knotSpan)
    }

    this.#minIteration = this.#maxIteration = 0
    if (this.#preExtrapLooped) {
      this.#minIteration = INT32_MIN
    }
    if (this.#postExtrapLooped) {
      this.#maxIteration = INT32_MAX
    }

    if (this.#interval.getMin() < this.#firstKnotTime) {
      this.#splineRegion = this.#preExtrapLooped
        ? TsSplineSampleSource.PreExtrapLoop
        : TsSplineSampleSource.PreExtrap
    } else if (this.#interval.getMin() < this.#lastKnotTime) {
      this.#splineRegion = TsSplineSampleSource.KnotInterp
    } else {
      this.#splineRegion = this.#postExtrapLooped
        ? TsSplineSampleSource.PostExtrapLoop
        : TsSplineSampleSource.PostExtrap
    }

    this.#atEnd = false
    this.#updateKnotIterator()
    this.#updateSegment()
  }

  // iterator.cpp:844-891.
  #initExtrapLooping(isPre: boolean): boolean {
    if (this.#firstKnotTime >= this.#lastKnotTime) {
      return false
    }

    const data = this.#data!
    const times = data.times
    const extrap = isPre ? data.preExtrapolation : data.postExtrapolation
    if (!extrap.isLooping()) {
      return false
    }

    if (extrap.loopBoundaryTime === undefined) {
      if (isPre) {
        this.#lastPreExtrapKnotTime = this.#lastKnotTime
        this.#lastPreExtrapKnotPreValue = this.#lastKnotPreValue
      } else {
        this.#firstPostExtrapKnotTime = this.#firstKnotTime
        this.#firstPostExtrapKnotValue = this.#firstKnotValue
      }
      return true
    }

    const boundary = extrap.loopBoundaryTime

    if ((isPre && boundary === this.#firstKnotTime) ||
        (!isPre && boundary === this.#lastKnotTime)) {
      return false
    }

    const it = Ts_LowerBound(times, boundary)
    if (it === times.length || times[it] !== boundary) {
      return false
    }

    if (isPre) {
      this.#lastPreExtrapKnotTime = boundary
      this.#lastPreExtrapKnotPreValue = data.getKnotPreValueAsDouble(it)
    } else {
      this.#firstPostExtrapKnotTime = boundary
      this.#firstPostExtrapKnotValue = data.getKnotValueAsDouble(it)
    }
    return true
  }

  AtEnd(): boolean { return this.#atEnd }
  Get(): Ts_Segment { return this.#segment.clone() }

  /** The spline region of the current segment (the iterator's _splineRegion). */
  _getSplineRegion(): TsSplineSampleSource { return this.#splineRegion }

  // iterator.cpp:899-909.
  increment(): this {
    if (_SegmentAtEnd(this.#interval, this.#segment, false)) {
      this.#atEnd = true
      return this
    }
    this.stepForward()
    return this
  }

  next(): IteratorResult<Ts_Segment> {
    if (this.#atEnd) return { done: true, value: undefined }
    const value = this.Get()
    this.increment()
    return { done: false, value }
  }

  [Symbol.iterator](): this { return this }

  // iterator.cpp:911-960.
  stepForward(): boolean {
    if (this.#interval.IsEmpty()) {
      return false
    }

    if (this.#splineRegion === TsSplineSampleSource.PostExtrap) {
      this.#atEnd = true
      return false
    }

    let initializedKnotIt = false
    if (this.#splineRegion === TsSplineSampleSource.PreExtrap) {
      this.#splineRegion = TsSplineSampleSource.KnotInterp
      this.#curIteration = 0
      this.#initializedKnotItBackward = false
      initializedKnotIt = true
      this.#updateKnotIterator()
    } else {
      const success = this.#initializedKnotItBackward
        ? this.#knotIt.stepBackward()
        : this.#knotIt.stepForward()
      if (!success || !_SegmentOverlapsInterval(this.#fullKnotRegion, this.#knotIt.Get())) {
        ++this.#curIteration
        this.#initializedKnotItBackward = false
        initializedKnotIt = true
        this.#updateKnotIterator()
      }
    }

    if ((this.#curIteration > this.#maxIteration ||
         (initializedKnotIt && this.#knotIt.AtEnd())) && !this.#postExtrapLooped) {
      this.#splineRegion = TsSplineSampleSource.PostExtrap
    }

    this.#updateSegment()
    this.#atEnd = !_SegmentOverlapsInterval(this.#interval, this.#segment)
    return true
  }

  // iterator.cpp:962-1006.
  stepBackward(): boolean {
    if (this.#interval.IsEmpty()) {
      return false
    }

    if (this.#splineRegion === TsSplineSampleSource.PreExtrap) {
      this.#atEnd = true
      return false
    }

    let initializedKnotIt = false
    if (this.#splineRegion === TsSplineSampleSource.PostExtrap) {
      this.#splineRegion = TsSplineSampleSource.KnotInterp
      this.#curIteration = 0
      this.#initializedKnotItBackward = true
      initializedKnotIt = true
      this.#updateKnotIterator()
    } else {
      const success = this.#initializedKnotItBackward
        ? this.#knotIt.stepForward()
        : this.#knotIt.stepBackward()
      if (!success || !_SegmentOverlapsInterval(this.#fullKnotRegion, this.#knotIt.Get())) {
        --this.#curIteration
        this.#initializedKnotItBackward = true
        initializedKnotIt = true
        this.#updateKnotIterator()
      }
    }

    if ((this.#curIteration < this.#minIteration ||
         (initializedKnotIt && this.#knotIt.AtEnd())) && !this.#preExtrapLooped) {
      this.#splineRegion = TsSplineSampleSource.PreExtrap
    }

    this.#updateSegment()
    this.#atEnd = !_SegmentOverlapsInterval(this.#interval, this.#segment)
    return true
  }

  // iterator.cpp:1008-1137.
  #updateKnotIterator(): void {
    if (this.#splineRegion === TsSplineSampleSource.PreExtrap ||
        this.#splineRegion === TsSplineSampleSource.PostExtrap) {
      return
    }

    if (this.#curIteration > this.#maxIteration || this.#curIteration < this.#minIteration) {
      this.#knotIt = new Ts_SegmentKnotIterator()
      return
    }

    const data = this.#data!

    let firstKnotTime = this.#firstKnotTime
    let lastKnotTime = this.#lastKnotTime
    if (this.#curIteration < 0) {
      lastKnotTime = this.#lastPreExtrapKnotTime
    } else if (this.#curIteration > 0) {
      firstKnotTime = this.#firstPostExtrapKnotTime
    }
    const knotTimeSpan = lastKnotTime - firstKnotTime
    const timeDelta = this.#curIteration * knotTimeSpan

    this.#fullKnotRegion = new GfInterval(firstKnotTime, lastKnotTime, CLOSED, OPEN)

    if (this.#curIteration < 0) {
      this.#oscillating = data.preExtrapolation.mode === TsExtrapMode.LoopOscillate
      this.#valueShift = data.preExtrapolation.mode === TsExtrapMode.LoopRepeat
        ? this.#curIteration * (this.#lastPreExtrapKnotPreValue - this.#firstKnotPreValue)
        : 0.0
    } else if (this.#curIteration > 0) {
      this.#oscillating = data.postExtrapolation.mode === TsExtrapMode.LoopOscillate
      this.#valueShift = data.postExtrapolation.mode === TsExtrapMode.LoopRepeat
        ? this.#curIteration * (this.#lastKnotValue - this.#firstPostExtrapKnotValue)
        : 0.0
    } else {
      this.#oscillating = false
      this.#valueShift = 0.0
    }

    const oscillateReversing = this.#oscillating && this.#curIteration % 2 !== 0
    this.#reversing = this.#initializedKnotItBackward !== oscillateReversing
    if (oscillateReversing) {
      this.#shift1 = timeDelta + firstKnotTime
      this.#shift2 = lastKnotTime
      this.#valueShift = 0.0
    } else {
      this.#shift1 = timeDelta
      this.#shift2 = 0
    }

    const knotIterInterval = new GfInterval(firstKnotTime, lastKnotTime, CLOSED, OPEN)

    if (this.#interval.getMin() >= timeDelta + firstKnotTime &&
        this.#interval.getMin() < timeDelta + firstKnotTime + knotTimeSpan &&
        !this.#initializedKnotItBackward) {
      if (oscillateReversing) {
        const t1 = -(this.#interval.getMin() - this.#shift1) + this.#shift2
        knotIterInterval.setMax(t1, OPEN)
      } else {
        knotIterInterval.setMin(this.#interval.getMin() - this.#shift1)
      }
    }

    this.#knotIt = new Ts_SegmentKnotIterator(data, knotIterInterval, this.#reversing)
  }

  // iterator.cpp:1139-1157.
  #updateSegment(): void {
    if (this.#splineRegion === TsSplineSampleSource.PreExtrap) {
      this.#updatePreExtrapSegment()
    } else if (this.#splineRegion === TsSplineSampleSource.PostExtrap) {
      this.#updatePostExtrapSegment()
    } else {
      this.#segment = this.#knotIt.Get()
      if (this.#oscillating && this.#curIteration % 2 !== 0) {
        this.#segment = this.#segment.Sub(this.#shift2).negate().addInPlace(this.#shift1)
      } else {
        this.#segment.addInPlace([this.#shift1, this.#valueShift])
      }
    }
  }

  // iterator.cpp:1159-1238.
  #updatePreExtrapSegment(): void {
    const data = this.#data!
    const extrap = data.preExtrapolation
    let mode = extrap.mode

    if (extrap.isLooping()) {
      if (this.#firstKnotTime === this.#lastKnotTime) {
        mode = TsExtrapMode.Held
      } else if (extrap.loopBoundaryTime !== undefined) {
        mode = extrap.loopBoundaryTime === this.#firstKnotTime
          ? TsExtrapMode.Held
          : TsExtrapMode.ValueBlock
      } else {
        mode = TsExtrapMode.ValueBlock
      }
    }

    const endPt: [number, number] = [this.#firstKnotTime, this.#firstKnotPreValue]

    let slope = 0.0
    const interp = mode === TsExtrapMode.ValueBlock
      ? Ts_SegmentInterp.ValueBlock
      : Ts_SegmentInterp.PreExtrap

    if (mode === TsExtrapMode.Sloped) {
      slope = data.preExtrapolation.slope
    }

    if (mode !== TsExtrapMode.Linear || this.#firstKnotPreValue !== this.#firstKnotValue) {
      this.#segment = new Ts_Segment([-inf, slope], [0.0, 0.0], [0.0, 0.0], endPt, interp)
      return
    }

    const tmpKnotIt = new Ts_SegmentKnotIterator(
      data, new GfInterval(this.#firstKnotTime, this.#lastKnotTime), false)
    if (tmpKnotIt.AtEnd()) {
      slope = 0.0
    } else {
      slope = tmpKnotIt.Get()._computeDerivative(0.0)
    }

    this.#segment = new Ts_Segment(
      [-inf, slope], [0.0, 0.0], [0.0, 0.0], endPt, Ts_SegmentInterp.PreExtrap)
  }

  // iterator.cpp:1240-1317.
  #updatePostExtrapSegment(): void {
    const data = this.#data!
    const extrap = data.postExtrapolation
    let mode = extrap.mode

    if (extrap.isLooping()) {
      if (this.#firstKnotTime === this.#lastKnotTime) {
        mode = TsExtrapMode.Held
      } else if (extrap.loopBoundaryTime !== undefined) {
        mode = extrap.loopBoundaryTime === this.#lastKnotTime
          ? TsExtrapMode.Held
          : TsExtrapMode.ValueBlock
      } else {
        mode = TsExtrapMode.ValueBlock
      }
    }

    const endPt: [number, number] = [this.#lastKnotTime, this.#lastKnotValue]

    let slope = 0.0
    const interp = mode === TsExtrapMode.ValueBlock
      ? Ts_SegmentInterp.ValueBlock
      : Ts_SegmentInterp.PostExtrap

    if (mode === TsExtrapMode.Sloped) {
      slope = data.postExtrapolation.slope
    }

    if (mode !== TsExtrapMode.Linear || this.#lastKnotPreValue !== this.#lastKnotValue) {
      this.#segment = new Ts_Segment(endPt, [0.0, 0.0], [0.0, 0.0], [+inf, slope], interp)
      return
    }

    const tmpKnotIt = new Ts_SegmentKnotIterator(
      data, new GfInterval(this.#firstKnotTime, this.#lastKnotTime), true)
    if (tmpKnotIt.AtEnd()) {
      slope = 0.0
    } else {
      slope = tmpKnotIt.Get()._computeDerivative(1.0)
    }

    this.#segment = new Ts_Segment(
      endPt, [0.0, 0.0], [0.0, 0.0], [+inf, slope], Ts_SegmentInterp.PostExtrap)
  }
}
