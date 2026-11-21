// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdtree/CMakeLists.txt
// Copyright 2022 Apple. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1's usdtree test registrations
// (pxr/usd/bin/usdtree/CMakeLists.txt:14-76), run in process
// (pxr/testing/toolRegistration.ts). The testenv directories are copied
// unmodified into fixtures/ (Copyright Pixar, TOST 1.0,
// https://openusd.org/license).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runRegistration } from '../../../../../testing/toolRegistration.ts'
import { usdtree } from '../../usdtree.ts'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

// [name, CMakeLists.txt lines, TESTENV, COMMAND arguments, output file].
const registrations: [string, string, string, string, string][] = [
  ['testUsdTree', '14-20', 'testUsdTree', '--flatten input.usda', 'output.txt'],
  ['testUsdTreeLoaded', '22-28', 'testUsdTreePayload', '--flatten input.usda', 'output.txt'],
  ['testUsdTreeUnloaded', '30-36', 'testUsdTreePayload', '--flatten --unloaded input.usda', 'output_unloaded.txt'],
  ['testUsdTreeAttributes', '38-44', 'testUsdTree', '--flatten --attributes --metadata input.usda',
    'output_attributes.txt'],
  ['testUsdTreeNotFlattened', '46-52', 'testUsdTreePayload', '--unloaded --attributes --metadata input.usda',
    'output_notflattened.txt'],
  ['testUsdTreeMasked', '54-60', 'testUsdTreePayload',
    '--flatten --attributes --metadata --mask /root/child1 input.usda', 'output_masked.txt'],
  ['testUsdTreeFlattenLayerStack', '62-68', 'testUsdTreePayload', '--flattenLayerStack input.usda', 'output_fls.txt'],
  ['testUsdTreeSimple', '70-76', 'testUsdTreePayload', '--simple input.usda', 'output_simple.txt'],
]

describe('usdtree', () => {
  // One case per registration (CMakeLists.txt at the lines given): STDOUT_REDIRECT
  // and DIFF_COMPARE of the output file, EXPECTED_RETURN_CODE 0.
  for (const [name, , testenv, command, output] of registrations) {
    it(name, async () => {
      const r = await runRegistration(usdtree, {
        testenv: path.join(FIXTURES, testenv), args: command.split(' '), stdoutRedirect: output, diffCompare: [output],
      })
      expect(r.exitCode, r.stderr).toBe(0)
      for (const [, got, baseline] of r.compared) expect(got).toBe(baseline)
    })
  }
})
