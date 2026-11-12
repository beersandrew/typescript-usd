// Ported from OpenUSD 26.11.1: pxr/exec/ef/testenv/testEfTime.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/testenv/testEfTime.cpp
//
// Upstream's main() is one test function; it is one it(). TF_AXIOM(cond)
// becomes expect(cond).toBe(true). UsdTimeCode's implicit conversion from
// double is spelled `new UsdTimeCode(t)`.

import { describe, expect, it } from 'vitest'
import { Interval as GfInterval, MultiInterval as GfMultiInterval } from 'typescript-usd/gf'
import { TimeCode as UsdTimeCode } from 'typescript-usd/usd'

import { EfTime } from '../../src/time.ts'
import { EfTimeInterval } from '../../src/timeInterval.ts'

function TF_AXIOM(cond: boolean): void {
  expect(cond).toBe(true)
}

describe('testEfTime', () => {
  it('main', () => {
    const CustomFlag: EfTime.SplineEvaluationFlags = (1 << 0)

    let time = new EfTime()

    // Test default constructed time
    time = new EfTime()
    TF_AXIOM(time.getTimeCode().isDefault())
    TF_AXIOM(!time.getTimeCode().isPreTime())
    TF_AXIOM(time.getSplineEvaluationFlags() === 0)

    // Test constructors
    time = new EfTime(UsdTimeCode.Default())
    TF_AXIOM(time.getTimeCode().isDefault())
    TF_AXIOM(!time.getTimeCode().isPreTime())
    TF_AXIOM(time.getSplineEvaluationFlags() === 0)

    time = new EfTime(new UsdTimeCode(0.0), CustomFlag)
    TF_AXIOM(!time.getTimeCode().isDefault())
    TF_AXIOM(!time.getTimeCode().isPreTime())
    TF_AXIOM(time.getSplineEvaluationFlags() === CustomFlag)

    time = new EfTime(UsdTimeCode.PreTime(0))
    TF_AXIOM(!time.getTimeCode().isDefault())
    TF_AXIOM(time.getTimeCode().isPreTime())
    TF_AXIOM(time.getSplineEvaluationFlags() === 0)

    time = new EfTime(UsdTimeCode.PreTime(0), CustomFlag)
    TF_AXIOM(!time.getTimeCode().isDefault())
    TF_AXIOM(time.getTimeCode().isPreTime())
    TF_AXIOM(time.getSplineEvaluationFlags() === CustomFlag)

    // Verify that passing a 0 initializes the spline evaluation flags
    time = new EfTime(new UsdTimeCode(0.0), 0)
    TF_AXIOM(!time.getTimeCode().isPreTime())
    TF_AXIOM(time.getSplineEvaluationFlags() === 0)

    // Test SetFrame
    time.setTimeCode(new UsdTimeCode(1.0))
    TF_AXIOM(!time.getTimeCode().isDefault())
    TF_AXIOM(time.getTimeCode().GetValue() === 1.0)

    // Test evaluation location
    time.setTimeCode(UsdTimeCode.PreTime(1.0))
    TF_AXIOM(time.getTimeCode().isPreTime())

    // Test SetSplineEvaluationFlags
    time.setSplineEvaluationFlags(CustomFlag)
    TF_AXIOM(time.getSplineEvaluationFlags() === CustomFlag)

    // Test ==
    TF_AXIOM(new EfTime().Equals(new EfTime()))
    TF_AXIOM(!(new EfTime(new UsdTimeCode(0.0)).Equals(new EfTime())))
    TF_AXIOM(!(new EfTime(new UsdTimeCode(1.0)).Equals(new EfTime())))

    const defaultTime = new EfTime()
    const defaultWithFlag = new EfTime()
    defaultWithFlag.setSplineEvaluationFlags(CustomFlag)
    TF_AXIOM(defaultWithFlag.Equals(defaultTime))

    // Test <
    TF_AXIOM(new EfTime(new UsdTimeCode(0.0)).lessThan(new EfTime(new UsdTimeCode(1.0))))
    TF_AXIOM(!(defaultTime.lessThan(new EfTime())))
    TF_AXIOM(new EfTime().lessThan(new EfTime(UsdTimeCode.PreTime(0.0))))
    TF_AXIOM(new EfTime(UsdTimeCode.PreTime(0.0)).lessThan(new EfTime(new UsdTimeCode(0.0))))
    TF_AXIOM(new EfTime().lessThan(new EfTime(new UsdTimeCode(0.0), CustomFlag)))

    // Test interval membership
    time = new EfTime()
    TF_AXIOM(!new EfTimeInterval(new GfInterval()).contains(time))
    TF_AXIOM(!new EfTimeInterval(new GfInterval(-1.0, 1.0)).contains(time))

    time = new EfTime(new UsdTimeCode(0.0))
    TF_AXIOM(!new EfTimeInterval(new GfInterval()).contains(time))
    TF_AXIOM(new EfTimeInterval(new GfInterval(-1.0, 1.0)).contains(time))

    time = new EfTime(new UsdTimeCode(-1.0))
    TF_AXIOM(new EfTimeInterval(new GfInterval(-1.0, 1.0)).contains(time))
    TF_AXIOM(!new EfTimeInterval(
      new GfInterval(-1.0, 1.0, /* minClosed */ false, /* maxClosed */ false))
      .contains(time))
    TF_AXIOM(new EfTimeInterval(
      new GfMultiInterval(new GfInterval(-1.0, 1.0))).contains(time))
    TF_AXIOM(!new EfTimeInterval(new GfMultiInterval(
      new GfInterval(-1.0, 1.0, /* minClosed */ false, /* maxClosed */ false)))
      .contains(time))

    time = new EfTime(new UsdTimeCode(1.0))
    TF_AXIOM(new EfTimeInterval(new GfInterval(-1.0, 1.0)).contains(time))
    TF_AXIOM(!new EfTimeInterval(
      new GfInterval(-1.0, 1.0, /* minClosed */ false, /* maxClosed */ false))
      .contains(time))
    TF_AXIOM(new EfTimeInterval(
      new GfMultiInterval(new GfInterval(-1.0, 1.0))).contains(time))
    TF_AXIOM(!new EfTimeInterval(new GfMultiInterval(
      new GfInterval(-1.0, 1.0, /* minClosed */ false, /* maxClosed */ false)))
      .contains(time))

    time = new EfTime(UsdTimeCode.PreTime(-1.0))
    TF_AXIOM(!new EfTimeInterval(new GfInterval(-1.0, 1.0)).contains(time))
    TF_AXIOM(!new EfTimeInterval(
      new GfInterval(-1.0, 1.0, /* minClosed */ false, /* maxClosed */ false))
      .contains(time))
    TF_AXIOM(!new EfTimeInterval(
      new GfMultiInterval(new GfInterval(-1.0, 1.0))).contains(time))
    TF_AXIOM(!new EfTimeInterval(new GfMultiInterval(
      new GfInterval(-1.0, 1.0, /* minClosed */ false, /* maxClosed */ false)))
      .contains(time))

    time = new EfTime(UsdTimeCode.PreTime(1.0))
    TF_AXIOM(new EfTimeInterval(new GfInterval(-1.0, 1.0)).contains(time))
    TF_AXIOM(new EfTimeInterval(
      new GfInterval(-1.0, 1.0, /* minClosed */ false, /* maxClosed */ false))
      .contains(time))
    TF_AXIOM(new EfTimeInterval(
      new GfMultiInterval(new GfInterval(-1.0, 1.0))).contains(time))
    TF_AXIOM(new EfTimeInterval(new GfMultiInterval(
      new GfInterval(-1.0, 1.0, /* minClosed */ false, /* maxClosed */ false)))
      .contains(time))

    time = new EfTime(new UsdTimeCode(0.0))
    TF_AXIOM(new EfTimeInterval(new GfInterval(0.0, 0.0)).contains(time))
    TF_AXIOM(!new EfTimeInterval(
      new GfInterval(0.0, 0.0, /* minClosed */ false, /* maxClosed */ false))
      .contains(time))
    TF_AXIOM(!new EfTimeInterval(
      new GfInterval(0.0, 0.0, /* minClosed */ true, /* maxClosed */ false))
      .contains(time))
    TF_AXIOM(!new EfTimeInterval(
      new GfInterval(0.0, 0.0, /* minClosed */ false, /* maxClosed */ true))
      .contains(time))
  })
})
