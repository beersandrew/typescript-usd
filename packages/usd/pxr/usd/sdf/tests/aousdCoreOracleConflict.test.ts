// Ported from OpenUSD 26.11.1: pxr/usd/sdf/parserValueContext.cpp,
//  pxr/usd/sdf/usdaData.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.08 pxr/usd/sdf/parserValueContext.cpp:44-90 constructs the
// declared Sdf value type before authoring it, and pxr/usd/sdf/usdaData.cpp:25-39
// rejects nonconforming USDA version strings.  These regressions pin
// OpenUSD's behaviour for both; Core/OpenUSD disagreements are recorded in
// docs/core-1.1.md.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Spline as TsSpline } from 'typescript-usd/ts'
import { Layer } from '../src/index.ts'

const splineFixture = fileURLToPath(new URL(
  'fixtures/oracleConflict/spline.usda', import.meta.url,
))

describe('OpenUSD v26.08 text-oracle conflict regressions', () => {
  it('authors declared float values with OpenUSD float32 precision', () => {
    const layer = Layer.fromBytes(
      new TextEncoder().encode('#usda 1.0\ndef "P" { float value = 0.4; }\n'), 'test.usda')
    expect(layer.getField('/P.value', 'default')).toBe(Math.fround(0.4))
  })

  it('authors declared float vector arrays with OpenUSD float32 precision', () => {
    const value = 9.536743228977684e-7
    const layer = Layer.createAnonymous('float-vector-array')
    layer.definePrimSpec('/P')
    layer.setField('/P.extent', 'typeName', 'float3[]')
    layer.setField('/P.extent', 'default', [
      [-value, 0, 0],
      [value, 0, 0],
    ])
    expect(layer.getField('/P.extent', 'default')).toEqual([
      [-Math.fround(value), 0, 0],
      [Math.fround(value), 0, 0],
    ])
  })

  it('rejects a nonconforming USDA layer version like OpenUSD', () => {
    expect(() => Layer.fromBytes(
      new TextEncoder().encode('#usda 1.0.123123123\n'), 'test.usda')).toThrow()
  })

  it('evaluates a parsed spline with OpenUSD Cardano/Horner results', () => {
    const layer = Layer.fromBytes(readFileSync(splineFixture), splineFixture)
    const spline = layer.getField('/MyPrim.myAttr', 'spline') as TsSpline
    // OpenUSD v26.08 pxr/base/ts/eval.cpp:237-357.
    expect([spline.eval(2), spline.eval(3), spline.eval(5)]).toEqual([
      9.59597964943972, 12.537697489642433, 18.622326115023988,
    ])
  })
})
