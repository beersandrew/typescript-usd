// Ported from OpenUSD 26.11.1: pxr/base/ts/eval.cpp,
//  pxr/base/ts/tsTest_Museum.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Checks the port of OpenUSD v26.08 pxr/base/ts/tsTest_Museum.cpp, and
// evaluation (eval.cpp) of every exhibit, against values captured from the
// v26.11.1 build (fixtures/tsOracle.json "museum"; FIXTURES.md).
import { describe, expect, it } from 'vitest'
import { TsTest_Museum, TsTest_MuseumDataId } from '../../src/index.ts'
import { expectClose, expectSplineClose, oracle } from './tsOracle.ts'

describe('tsTest_Museum', () => {
  it('GetAllNames reports every exhibit in registration order', () => {
    expect(TsTest_Museum.getAllNames()).toEqual(oracle.museumNames)
  })

  it('GetSpline and GetSplineByName agree', () => {
    expect(TsTest_Museum.getSpline(TsTest_MuseumDataId.NearCenterVertical)
      .equals(TsTest_Museum.getSplineByName('NearCenterVertical'))).toBe(true)
    expect(TsTest_Museum.getSplineByName('NoSuchExhibit').IsEmpty()).toBe(true)
  })

  for (const name of oracle.museumNames) {
    it(`builds ${name}`, () => {
      expectSplineClose(TsTest_Museum.getSplineByName(name), oracle.museum[name]!.spline, name)
    })
  }
})

describe('Ts_Eval over the museum', () => {
  for (const name of oracle.museumNames) {
    it(name, () => {
      const spline = TsTest_Museum.getSplineByName(name)
      for (const [t, value, preValue, derivative, preDerivative, held] of oracle.museum[name]!.eval) {
        expectClose(spline.eval(t), value!, `${name} Eval(${t})`)
        expectClose(spline.evalPreValue(t), preValue!, `${name} EvalPreValue(${t})`)
        expectClose(spline.evalDerivative(t), derivative!, `${name} EvalDerivative(${t})`, 1e-7)
        expectClose(spline.evalPreDerivative(t), preDerivative!, `${name} EvalPreDerivative(${t})`, 1e-7)
        expectClose(spline.evalHeld(t), held!, `${name} EvalHeld(${t})`)
      }
    })
  }
})
