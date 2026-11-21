// Ported from OpenUSD 26.11.1: pxr/bin/usdauthors/CMakeLists.txt
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1's usdauthors test registrations
// (pxr/bin/usdauthors/CMakeLists.txt:13-88), run in process
// (pxr/testing/toolRegistration.ts). The testenv directory is copied
// unmodified into fixtures/ (Copyright Pixar, TOST 1.0,
// https://openusd.org/license).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runRegistration } from '../../../../testing/toolRegistration.ts'
import { usdauthors } from '../../usdauthors.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdAuthors')

// [name, CMakeLists.txt lines, COMMAND arguments, STDOUT_REDIRECT and
//  DIFF_COMPARE file]; EXPECTED_RETURN_CODE 0.
const registrations: [string, string, string, string][] = [
  ['testUsdAuthors', '13-19', 'input.usda', 'output.txt'],
  ['testUsdAuthorsDebug', '21-27', '--debug input.usda', 'output_debug.txt'],
  ['testUsdAuthorsSummary', '29-35', '--summary input.usda', 'output_summary.txt'],
  ['testUsdAuthorsClobbered', '37-43', '--debug clobber.usda', 'output_clobber.txt'],
  ['testUsdAuthorsUnloaded', '45-51', '--unloaded payloaded.usda', 'output_unloaded.txt'],
  ['testUsdAuthorsLayer', '53-59', '--layer input.usda', 'output_layer.txt'],
  ['testUsdAuthorsLayerVariants', '61-67', '--layer variants.usda', 'output_layer_variants.txt'],
  ['testUsdAuthorsVariantsComposed', '69-75', '--debug variants.usda', 'output_variants_debug.txt'],
  ['testUsdAuthorsNoRecords', '77-83', 'empty.usda', 'output_empty.txt'],
]

describe('usdauthors', () => {
  // One case per registration (CMakeLists.txt at the lines given).
  for (const [name, , command, output] of registrations) {
    it(name, async () => {
      const r = await runRegistration(usdauthors, {
        testenv: TESTENV, args: command.split(' '), stdoutRedirect: output, diffCompare: [output],
      })
      expect(r.exitCode, r.stderr).toBe(0)
      for (const [, got, baseline] of r.compared) expect(got).toBe(baseline)
    })
  }

  // CMakeLists.txt:85-88
  it('testUsdAuthorsMissingInput', async () => {
    const r = await runRegistration(usdauthors, { args: ['nonexistent.usda'] })
    expect(r.exitCode).toBe(1)
  })
})
