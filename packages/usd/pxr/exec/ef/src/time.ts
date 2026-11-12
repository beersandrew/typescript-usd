// Ported from OpenUSD 26.11.1: pxr/exec/ef/time.cpp, pxr/exec/ef/time.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/time.h and pxr/exec/ef/time.cpp.
//
// EfTime is a value type (openexec-x1.md section 4, rule 5): a time code plus
// a set of application-specific spline evaluation flags.

import { TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import { TimeCode as UsdTimeCode } from 'typescript-usd/usd'

import { VdfExecutionTypeRegistry } from 'typescript-usd/vdf'

/** UsdTimeCode operator== (usd/timeCode.h:165-171). */
function _TimeCodeEquals(lhs: UsdTimeCode, rhs: UsdTimeCode): boolean {
  if (lhs.isDefault() && rhs.isDefault()) {
    return true
  }
  return lhs.GetValue() === rhs.GetValue() &&
    lhs.isPreTime() === rhs.isPreTime()
}

/** UsdTimeCode operator< (usd/timeCode.h:185-192). */
function _TimeCodeLessThan(lhs: UsdTimeCode, rhs: UsdTimeCode): boolean {
  if (lhs.isDefault() || rhs.isDefault()) {
    return lhs.isDefault() && !rhs.isDefault()
  }
  return lhs.GetValue() < rhs.GetValue() ||
    (lhs.GetValue() === rhs.GetValue() &&
      lhs.isPreTime() && !rhs.isPreTime())
}

/**
 * EfTime (time.h:23-150).
 *
 * `SplineEvaluationFlags` is `uint8_t` upstream; values are masked to 8 bits
 * where they are stored.
 */
export class EfTime {
  // The time code value.
  private _timeCode: UsdTimeCode

  // The spline evaluation flags to use during computation.
  private _splineFlags: EfTime.SplineEvaluationFlags

  /**
   * EfTime() (time.h:31-34): the default frame value.
   * EfTime(timeCode, splineFlags = 0) (time.h:38-43).
   * EfTime(rhs) is the copy constructor.
   */
  constructor()
  constructor(timeCode: UsdTimeCode, splineFlags?: EfTime.SplineEvaluationFlags)
  constructor(rhs: EfTime)
  constructor(
    timeCode: UsdTimeCode | EfTime = UsdTimeCode.Default(),
    splineFlags: EfTime.SplineEvaluationFlags = 0,
  ) {
    if (timeCode instanceof EfTime) {
      this._timeCode = timeCode._timeCode
      this._splineFlags = timeCode._splineFlags
      return
    }
    this._timeCode = timeCode
    this._splineFlags = splineFlags & 0xff
  }

  /** Copy constructor. */
  Clone(): EfTime {
    return new EfTime(this)
  }

  /** Assignment operator. */
  assign(rhs: EfTime): this {
    this._timeCode = rhs._timeCode
    this._splineFlags = rhs._splineFlags
    return this
  }

  /** Returns the time code (time.h:51-53). */
  getTimeCode(): UsdTimeCode {
    return this._timeCode
  }

  /** Sets the time code to `timeCode` (time.h:57-59). */
  setTimeCode(timeCode: UsdTimeCode): void {
    this._timeCode = timeCode
  }

  /** Returns the spline evaluation flags (time.h:68-70). */
  getSplineEvaluationFlags(): EfTime.SplineEvaluationFlags {
    return this._splineFlags
  }

  /** Sets the spline evaluation flags (time.h:74-76). */
  setSplineEvaluationFlags(flags: EfTime.SplineEvaluationFlags): void {
    this._splineFlags = flags & 0xff
  }

  /** operator== (time.h:83-89). */
  Equals(rhs: EfTime): boolean {
    if (!this._timeCode.isDefault() && !rhs._timeCode.isDefault()) {
      return _TimeCodeEquals(this._timeCode, rhs._timeCode) &&
        this._splineFlags === rhs._splineFlags
    }
    return this._timeCode.isDefault() === rhs._timeCode.isDefault()
  }

  /** operator!= (time.h:91-93). */
  notEquals(rhs: EfTime): boolean {
    return !this.Equals(rhs)
  }

  /**
   * operator< (time.h:105-112). A default time is lesser than all non-default
   * times; spline flags only provide a stable ordering.
   */
  lessThan(rhs: EfTime): boolean {
    if (this._timeCode.isDefault() || rhs._timeCode.isDefault()) {
      return _TimeCodeLessThan(this._timeCode, rhs._timeCode)
    }
    return _TimeCodeLessThan(this._timeCode, rhs._timeCode) ||
      (_TimeCodeEquals(this._timeCode, rhs._timeCode) &&
        this._splineFlags < rhs._splineFlags)
  }

  /** operator<= (time.h:114-116). */
  lessThanOrEqual(rhs: EfTime): boolean {
    return !rhs.lessThan(this)
  }

  /** operator> (time.h:118-120). */
  greaterThan(rhs: EfTime): boolean {
    return rhs.lessThan(this)
  }

  /** operator>= (time.h:122-124). */
  greaterThanOrEqual(rhs: EfTime): boolean {
    return !this.lessThan(rhs)
  }

  /**
   * Canonical key of this value (openexec-x1.md 4.1 "Pointers"): two times
   * have equal keys exactly when Equals() is true. It follows TfHashAppend
   * (time.h:128-134): the flags take part only for non-default times.
   */
  getKey(): string {
    if (this._timeCode.isDefault()) {
      return 'default'
    }
    const value = this._timeCode.GetValue()
    // -0 == 0 for UsdTimeCode equality, so both get the same key.
    const valueKey = value === 0 ? '0' : String(value)
    return `${valueKey}${this._timeCode.isPreTime() ? 'p' : 'a'}${this._splineFlags}`
  }

  /**
   * EfTime::GetAsString (time.cpp:35-51). The evaluation location is only
   * denoted when the time code IsPreTime().
   */
  getAsString(): string {
    let res = this._timeCode.isDefault()
      ? '(default)'
      : _StdToString(this._timeCode.GetValue())

    if (this._timeCode.isPreTime()) {
      res += ' (pre)'
    }

    if (this._splineFlags !== 0) {
      res += _SplineFlagsToString(this._splineFlags)
    }

    return res
  }

  /** operator<<(std::ostream &, const EfTime &) (time.cpp:53-72). */
  toString(): string {
    let os = '( frame='

    if (this.getTimeCode().isDefault()) {
      os += 'default'
    } else {
      os += _OstreamDouble(this.getTimeCode().GetValue())
    }

    os += ' location=' + (this.getTimeCode().isPreTime() ? 'Pre' : 'AtTime')

    const flags = this.getSplineEvaluationFlags()
    os += ' flags=' + _SplineFlagsToString(flags)

    return os + ' )'
  }
}

export declare namespace EfTime {
  /** Data type for storing app-specific spline evaluation flags (uint8_t). */
  type SplineEvaluationFlags = number
}

/** TfType::Define<EfTime>() (time.cpp:18-21). */
export const EfTimeType: TfType = TfType.define('EfTime')

// TF_REGISTRY_FUNCTION(VdfExecutionTypeRegistry) (time.cpp:23-26).
TfRegistryManager.add('VdfExecutionTypeRegistry', () => {
  VdfExecutionTypeRegistry.define(EfTimeType, new EfTime())
})

/** _SplineFlagsToString (time.cpp:28-33): the flags as 8 binary digits. */
function _SplineFlagsToString(flags: EfTime.SplineEvaluationFlags): string {
  return (flags & 0xff).toString(2).padStart(8, '0')
}

/** std::to_string(double): printf "%f". */
function _StdToString(value: number): string {
  if (Number.isNaN(value)) return value < 0 ? '-nan' : 'nan'
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf'
  const text = value.toFixed(6)
  return Object.is(value, -0) ? `-${text}` : text
}

/** std::ostream insertion of a double: printf "%g" at precision 6. */
function _OstreamDouble(value: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 'nan' : value > 0 ? 'inf' : '-inf'
  if (value === 0) return Object.is(value, -0) ? '-0' : '0'
  const [mantissa, exponentText] = value.toExponential(5).split('e')
  const exponent = Number(exponentText)
  if (exponent < -4 || exponent >= 6) {
    const m = mantissa!.includes('.') ? mantissa!.replace(/\.?0+$/, '') : mantissa!
    const sign = exponent < 0 ? '-' : '+'
    return `${m}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`
  }
  const fixed = value.toFixed(Math.max(0, 5 - exponent))
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}
