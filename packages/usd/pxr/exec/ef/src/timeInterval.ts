// Ported from OpenUSD 26.11.1: pxr/exec/ef/timeInterval.cpp,
//  pxr/exec/ef/timeInterval.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/timeInterval.h and
// pxr/exec/ef/timeInterval.cpp.

import { Interval as GfInterval, MultiInterval as GfMultiInterval } from 'typescript-usd/gf'

import type { EfTime } from './time.ts'

/**
 * EfTimeInterval (timeInterval.h:31-218): a GfMultiInterval on the frame
 * timeline plus a bool for the "default" time, which is a single point not on
 * the timeline.
 */
export class EfTimeInterval {
  // The time multi interval.
  private _timeMultiInterval: GfMultiInterval

  // Whether or not the default time is set.
  private _defaultTime: boolean

  /**
   * Constructors (timeInterval.h:35-69):
   * - EfTimeInterval(GfMultiInterval = GfMultiInterval(), defaultTime = false)
   * - EfTimeInterval(GfInterval, defaultTime = false)
   * - EfTimeInterval(times: number[], defaultTime = false): a multi interval
   *   from the discrete times (the vector and initializer_list overloads).
   * - EfTimeInterval(rhs: EfTimeInterval): the copy constructor.
   */
  constructor(
    timeMultiInterval?: GfMultiInterval | GfInterval | readonly number[] | EfTimeInterval,
    defaultTime = false,
  ) {
    if (timeMultiInterval instanceof EfTimeInterval) {
      this._timeMultiInterval = new GfMultiInterval(timeMultiInterval._timeMultiInterval)
      this._defaultTime = timeMultiInterval._defaultTime
      return
    }
    this._defaultTime = defaultTime
    if (timeMultiInterval === undefined) {
      this._timeMultiInterval = new GfMultiInterval()
    } else if (timeMultiInterval instanceof GfMultiInterval) {
      this._timeMultiInterval = new GfMultiInterval(timeMultiInterval)
    } else if (timeMultiInterval instanceof GfInterval) {
      this._timeMultiInterval = new GfMultiInterval(timeMultiInterval)
    } else {
      this._timeMultiInterval = new GfMultiInterval()
      for (const t of timeMultiInterval) {
        this._timeMultiInterval.add(new GfInterval(t))
      }
    }
  }

  /** Copy constructor. */
  Clone(): EfTimeInterval {
    return new EfTimeInterval(this)
  }

  /** Assignment operator. */
  assign(rhs: EfTimeInterval): this {
    this._timeMultiInterval = new GfMultiInterval(rhs._timeMultiInterval)
    this._defaultTime = rhs._defaultTime
    return this
  }

  /** Clears the time interval to an empty interval (timeInterval.h:72-75). */
  clear(): void {
    this._timeMultiInterval.clear()
    this._defaultTime = false
  }

  /** Returns true if the interval is empty (timeInterval.h:78-80). */
  IsEmpty(): boolean {
    return !this._defaultTime && this._timeMultiInterval.IsEmpty()
  }

  /** Returns the multi interval on the frame timeline (timeInterval.h:84-86). */
  getTimeMultiInterval(): GfMultiInterval {
    return this._timeMultiInterval
  }

  /** Returns true if the interval contains the default time (timeInterval.h:89-91). */
  isDefaultTimeSet(): boolean {
    return this._defaultTime
  }

  /**
   * Contains(const EfTime &) (timeInterval.h:99-103) and
   * Contains(const EfTimeInterval &) (timeInterval.h:109-114).
   */
  contains(arg: EfTime | EfTimeInterval): boolean {
    if (arg instanceof EfTimeInterval) {
      const rhs = arg
      if (!this._defaultTime && rhs.isDefaultTimeSet()) {
        return false
      }
      return this._timeMultiInterval.contains(rhs.getTimeMultiInterval())
    }
    const time = arg
    return time.getTimeCode().isDefault()
      ? this._defaultTime
      : this._containsTime(time)
  }

  /**
   * Returns true if the time interval contains the full frame timeline and
   * the default time (timeInterval.h:119-122).
   */
  isFullInterval(): boolean {
    return this._defaultTime &&
      this._timeMultiInterval.equals(GfMultiInterval.getFullInterval())
  }

  /** The full time interval: (-inf, inf) with the default time (timeInterval.h:125-127). */
  static getFullInterval(): EfTimeInterval {
    return new EfTimeInterval(GfMultiInterval.getFullInterval(), true)
  }

  /** operator== (timeInterval.h:129-132). */
  Equals(rhs: EfTimeInterval): boolean {
    return this._timeMultiInterval.equals(rhs._timeMultiInterval) &&
      this._defaultTime === rhs._defaultTime
  }

  /** operator!= (timeInterval.h:134-136). */
  notEquals(rhs: EfTimeInterval): boolean {
    return !this.Equals(rhs)
  }

  /**
   * operator|= (timeInterval.h:139-160): unions this time interval with an
   * EfTimeInterval, a GfInterval or an EfTime.
   */
  orAssign(rhs: EfTimeInterval | GfInterval | EfTime): this {
    if (rhs instanceof EfTimeInterval) {
      this._timeMultiInterval.add(rhs._timeMultiInterval)
      this._defaultTime = this._defaultTime || rhs._defaultTime
    } else if (rhs instanceof GfInterval) {
      this._timeMultiInterval.add(rhs)
    } else {
      const timeCode = rhs.getTimeCode()
      if (timeCode.isDefault()) {
        this._defaultTime = true
      } else {
        this._timeMultiInterval.add(new GfInterval(timeCode.GetValue()))
      }
    }
    return this
  }

  /** operator&= (timeInterval.h:163-166). */
  andAssign(rhs: EfTimeInterval): this {
    this._timeMultiInterval.intersect(rhs._timeMultiInterval)
    this._defaultTime = this._defaultTime && rhs._defaultTime
    return this
  }

  /** operator< (timeInterval.h:169-176). */
  lessThan(rhs: EfTimeInterval): boolean {
    if (this._timeMultiInterval.lessThan(rhs._timeMultiInterval)) return true
    if (!this._timeMultiInterval.equals(rhs._timeMultiInterval)) return false
    if (this._defaultTime !== rhs._defaultTime) return this._defaultTime

    // Equal
    return false
  }

  /**
   * Extends the interval by the given number of frames in each direction
   * (timeInterval.h:184-188).
   */
  extend(leftFrames: number, rightFrames: number): this {
    const extension = new GfInterval(-leftFrames, +rightFrames, true, true)
    this._timeMultiInterval.arithmeticAdd(extension)
    return this
  }

  /** EfTimeInterval::GetAsString (timeInterval.cpp:16-26). */
  getAsString(): string {
    if (this.isFullInterval()) {
      return '( full )'
    }

    if (this.Equals(new EfTimeInterval())) {
      return '( empty )'
    }

    return this.toString()
  }

  /** operator<<(std::ostream &, const EfTimeInterval &) (timeInterval.cpp:83-89). */
  toString(): string {
    return `( default=${this.isDefaultTimeSet() ? 1 : 0}` +
      ` multiInterval=${this.getTimeMultiInterval().toString()} )`
  }

  /**
   * EfTimeInterval::_ContainsTime (timeInterval.cpp:57-81). Works like
   * GfMultiInterval::Contains, with _TimeIsContainedIn at the boundaries.
   */
  private _containsTime(time: EfTime): boolean {
    const timeCode = time.getTimeCode()
    if (timeCode.isDefault() || this._timeMultiInterval.IsEmpty()) {
      return false
    }

    const intervals = this._timeMultiInterval.getSet()

    // Find position of first interval >= [frame, frame].
    let i = this._timeMultiInterval.lower_bound(timeCode.GetValue())

    // Case 1: i is the first interval after d.
    if (i !== intervals.length && _TimeIsContainedIn(time, intervals[i]!)) {
      return true
    }

    // Case 2: the previous interval, (i-1), contains d.
    if (i !== 0 && _TimeIsContainedIn(time, intervals[--i]!)) {
      return true
    }

    return false
  }
}

/**
 * _TimeIsContainedIn (timeInterval.cpp:28-55). The default time is never
 * contained in any interval. PreTime(t) is infinitesimally before t, so it is
 * contained in an interval whose max is t, and not in one whose min is t.
 */
function _TimeIsContainedIn(time: EfTime, interval: GfInterval): boolean {
  const timeCode = time.getTimeCode()

  if (timeCode.isDefault() || interval.IsEmpty()) {
    return false
  } else if (timeCode.GetValue() === interval.getMin()) {
    return !timeCode.isPreTime() && interval.isMinClosed()
  } else if (timeCode.GetValue() === interval.getMax()) {
    return timeCode.isPreTime() || interval.isMaxClosed()
  }

  return interval.contains(timeCode.GetValue())
}
