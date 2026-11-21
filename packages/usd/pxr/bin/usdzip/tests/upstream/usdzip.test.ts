// Ported from OpenUSD 26.11.1: pxr/bin/usdzip/CMakeLists.txt
// Copyright 2025 Apple. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1's usdzip test registrations
// (pxr/bin/usdzip/CMakeLists.txt:14-50), run in process
// (pxr/testing/toolRegistration.ts). The testenv directories are copied
// unmodified into fixtures/ (Copyright Pixar, TOST 1.0,
// https://openusd.org/license).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runRegistration } from '../../../../testing/toolRegistration.ts'
import { usdzip } from '../../usdzip.ts'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

// [name, CMakeLists.txt lines, TESTENV, COMMAND arguments,
//  EXPECTED_RETURN_CODE, DIFF_COMPARE].
const registrations: [string, string, string | undefined, string, number, string?][] = [
  ['testUsdZipInputFiles', '14-19', 'testUsdZipInputFiles', 'flat.usdz src -l flat.txt', 0, 'flat.txt'],
  ['testUsdZipInputFiles2', '21-26', 'testUsdZipInputFiles', '-r recursive.usdz src -l recursive.txt', 0,
    'recursive.txt'],
  ['testUsdZipInputFiles3', '28-32', 'testUsdZipInputFiles', 'flat_inputs.usdz src/a.txt src/b.png', 0],
  ['testUsdZipInputFiles4', '34-38', 'testUsdZipInputFiles', 'recursive_inputs.usdz src/a.txt src/b.png src/sub', 0],
  ['testUsdZipMissingInput', '40-43', undefined, 'nonexistent.usdz nonexistent.usd', 1],
  ['testUsdZipAsset', '45-50', 'testUsdZipAsset', '-a root.usd package.usdz -l contents.txt', 0, 'contents.txt'],
]

describe('usdzip', () => {
  // One case per registration (CMakeLists.txt at the lines given).
  for (const [name, , testenv, command, expectedReturnCode, diffCompare] of registrations) {
    it(name, async () => {
      const r = await runRegistration(usdzip, {
        testenv: testenv && path.join(FIXTURES, testenv), args: command.split(' '),
        ...(diffCompare ? { diffCompare: [diffCompare] } : {}),
      })
      expect(r.exitCode, r.stdout + r.stderr).toBe(expectedReturnCode)
      for (const [, got, baseline] of r.compared) expect(got).toBe(baseline)
    })
  }
})
