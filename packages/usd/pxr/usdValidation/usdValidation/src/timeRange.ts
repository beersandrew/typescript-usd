// Ported from OpenUSD 26.11.1: pxr/usdValidation/usdValidation/timeRange.cpp,
//  pxr/usdValidation/usdValidation/timeRange.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdValidation/timeRange.{h,cpp}.
import { Interval as GfInterval } from 'typescript-usd/gf'
import { TimeCode as UsdTimeCode } from 'typescript-usd/usd'

/**
 * The time range a validation runs over: an interval plus whether
 * UsdTimeCode::Default() is included (timeRange.h:21-77).
 */
export class UsdValidationTimeRange {
  readonly #interval: GfInterval
  readonly #includeTimeCodeDefault: boolean

  /**
   * timeRange.cpp:14-17: the full interval, including default.
   * timeRange.cpp:19-24: one time code; the default time code is an empty
   * interval that includes default.
   * timeRange.cpp:26-30: an interval, including default unless told not to.
   */
  constructor()
  constructor(timeCode: UsdTimeCode)
  constructor(interval: GfInterval, includeTimeCodeDefault?: boolean)
  constructor(timeCodeOrInterval?: UsdTimeCode | GfInterval, includeTimeCodeDefault = true) {
    if (timeCodeOrInterval === undefined) {
      this.#interval = GfInterval.getFullInterval()
      this.#includeTimeCodeDefault = true
    } else if (timeCodeOrInterval instanceof UsdTimeCode) {
      this.#interval = timeCodeOrInterval.isDefault()
        ? new GfInterval() : new GfInterval(timeCodeOrInterval.GetValue())
      this.#includeTimeCodeDefault = timeCodeOrInterval.isDefault()
    } else {
      this.#interval = timeCodeOrInterval
      this.#includeTimeCodeDefault = includeTimeCodeDefault
    }
  }

  /** timeRange.cpp:32-36. */
  includesTimeCodeDefault(): boolean {
    return this.#includeTimeCodeDefault
  }

  /** timeRange.cpp:38-42. */
  getInterval(): GfInterval {
    return this.#interval
  }
}
