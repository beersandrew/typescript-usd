// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpCompositionResults.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/usd/pcp/CMakeLists.txt:1500-1559.
// The five registered regression programs use testPcpCompositionResults.py in
// USD mode; the command choices and byte baselines below are those exact
// registrations, verified against the live v26.08 reference build.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { testPcpCompositionResults } from './testPcpCompositionResults.ts'

const FIXTURES = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/compositionResults',
)

const CASES = [
  {
    program: 'testPcpRegressionBugs_bug69932',
    testenv: 'testPcpRegressionBugs_bug69932.testenv',
    layer: 'bug69932/root.usda',
    baseline: 'compositionResults_bug69932.txt',
  },
  {
    program: 'testPcpRegressionBugs_bug74847',
    testenv: 'testPcpRegressionBugs_bug74847.testenv',
    layer: 'bug74847/root.usda',
    baseline: 'compositionResults_bug74847.txt',
  },
  {
    program: 'testPcpRegressionBugs_bug92827',
    testenv: 'testPcpRegressionBugs_bug92827.testenv',
    layer: 'bug92827/root.usda',
    baseline: 'compositionResults_bug92827.txt',
    errorBaseline: 'compositionErrors_bug92827.txt',
  },
  {
    program: 'testPcpRegressionBugs_USD-6755',
    testenv: 'testPcpRegressionBugs_USD-6755.testenv',
    layer: 'root.usda',
    baseline: 'compositionResults.txt',
    errorBaseline: 'compositionErrors.txt',
  },
  {
    program: 'testPcpRegressionBugs_case1',
    testenv: 'testPcpRegressionBugs_case1.testenv',
    layer: 'case1/root.usda',
    baseline: 'compositionResults_case1.txt',
  },
] as const

describe('testPcpCompositionResults registered regression programs', () => {
  for (const testCase of CASES) {
    it(`${testCase.program}: byte-identical composition result`, async () => {
      const testenv = path.join(FIXTURES, testCase.testenv)
      const result = await testPcpCompositionResults({
        layerPath: path.join(testenv, testCase.layer),
        layerLabel: testCase.layer,
        errorFile: 'errorBaseline' in testCase,
        consistencyChecks: true,
      })
      expect(result.stdout).toBe(readFileSync(
        path.join(testenv, 'baseline', testCase.baseline), 'utf8',
      ))
      if ('errorBaseline' in testCase) {
        expect(result.errorFile).toBe(readFileSync(
          path.join(testenv, 'baseline', testCase.errorBaseline), 'utf8',
        ))
      }
      expect(result.stderr).toBe('')
    })
  }
})
