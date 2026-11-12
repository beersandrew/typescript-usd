// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfVariableExpression.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 testSdfVariableExpression.py:400-534,742-809.
// Expectations captured from native OpenUSD 26.11.1 (FIXTURES.md).
import { describe, expect, it } from 'vitest'
import expectedFixture from './fixtures/variableExpressionFunctions/expected.json' with { type: 'json' }
import { SdfVariableExpression, SdfVariableExpressionEmptyList, type SdfExpressionVariables } from '../../src/variableExpression.ts'
import { oraclePayload } from '../../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)

describe('native variable expression lists, if and contains', () => {
  for (const row of expected.cases) {
    it(`${row.expression} with ${JSON.stringify(row.variables)}`, () => {
      const expression = new SdfVariableExpression(row.expression)
      expect(expression.isValid()).toBe(row.valid)
      if (!row.valid) { expect(expression.getErrors().length).toBeGreaterThan(0); return }
      const result = expression.evaluate(row.variables as SdfExpressionVariables)
      // Python returns the EmptyList value as an empty list.
      expect(result.value instanceof SdfVariableExpressionEmptyList ? [] : result.value).toEqual(row.value)
      expect(result.errors).toEqual(row.errors)
      expect(result.usedVariables.sort()).toEqual(row.usedVariables)
    })
  }
})
