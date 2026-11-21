// Ported from OpenUSD 26.11.1: pxr/usd/bin/usddiff/CMakeLists.txt
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1's usddiff test registrations
// (pxr/usd/bin/usddiff/CMakeLists.txt:10-285). The testenv directories are
// copied unmodified into fixtures/ (Copyright Pixar, TOST 1.0,
// https://openusd.org/license). Each registration runs its COMMAND in a copy
// of its TESTENV and checks EXPECTED_RETURN_CODE; one with a STDOUT_REDIRECT
// writes standard output to that file, strips its CLEAN_OUTPUT pattern from
// it (testWrapper.py _stripPath, cmake/macros/testWrapper.py:122-150) and
// DIFF_COMPAREs it with the one in baseline/ (diff --strip-trailing-cr).
// Each case here does the same in a temporary copy that is the working
// directory, running the tool in process with usddiff(argv) and no diff
// tool environment variables. The registrations under PXR_BUILD_ALEMBIC_PLUGIN
// (testUsdDiffToolVariousFormats3-5, CMakeLists.txt:57-84) and
// PXR_BUILD_DRACO_PLUGIN (testUsdDiffWith*Draco*, CMakeLists.txt:86-139) need
// the usdAbc and usdDraco plugins, which are not ported (KNOWN-GAPS.md), so
// they are not registered here either.

import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { usddiff } from '../../usddiff.ts'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

let dir = ''
let cwd = ''
afterEach(() => {
  if (cwd !== '') process.chdir(cwd)
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
  cwd = ''
  dir = ''
})

// [name, CMakeLists.txt lines, TESTENV, COMMAND arguments,
//  EXPECTED_RETURN_CODE, STDOUT_REDIRECT, CLEAN_OUTPUT].
const registrations: [string, string, string, string, number, string?, RegExp?][] = [
  ['testUsdDiffExitCodesForDiff1', '10-17', 'testExitCodesForDiff', 'a.usda a.usda --noeffect', 0],
  ['testUsdDiffExitCodesForDiff2', '19-26', 'testExitCodesForDiff', 'a.usda b.usda --noeffect', 1],
  ['testUsdDiffToolSelectionDefault', '28-37', 'testDiffToolSelectionDefault', 'a.usda b.usda --noeffect', 1, 'out.txt'],
  ['testUsdDiffToolVariousFormats1', '39-46', 'testDiffToolVariousUsdFormats', 'a.usda a.usd --noeffect', 0],
  ['testUsdDiffToolVariousFormats2', '48-55', 'testDiffToolVariousUsdFormats', 'a.usdc a.usd --noeffect', 0],
  ['testUsdDiffComposedResults1', '143-152', 'testDiffToolComposedResults', 'a.usd b.usd --noeffect', 1, 'layer_diff.txt'],
  ['testUsdDiffComposedResults2', '154-164', 'testDiffToolComposedResults', 'a.usd b.usd --noeffect --flatten', 1,
    'composed_diff.txt', /(?:[A-Za-z]:)?\/.*\//g],
  ['testUsdDiffWithDirectories1', '166-173', 'testDiffWithDirectories', '--noeffect a/ a/', 0],
  ['testUsdDiffWithDirectories2', '175-182', 'testDiffWithDirectories', '--noeffect a/ b/', 1],
  ['testUsdDiffWithDirectories3', '184-191', 'testDiffWithDirectories', '--noeffect . a/', 0],
  ['testUsdDiffWithDirectories4', '193-200', 'testDiffWithDirectories', '--noeffect a.usda a/', 0],
  ['testUsdDiffWithDirectories5', '202-209', 'testDiffWithDirectories', '--noeffect a.usda b/', 1],
  ['testUsdDiffWithDirectories6', '211-218', 'testDiffWithDirectories', '--noeffect b/ a.usda', 1],
  ['testUsdDiffWithDirectories7', '220-227', 'testDiffWithDirectories', '--noeffect a.usda b.usda b/', 1],
  ['testUsdDiffWithDirectories8', '229-236', 'testDiffWithDirectories', '--noeffect b/ a.usda b.usda', 1],
  ['testDiffToolIterateUsdz1', '238-245', 'testDiffToolIterateUsdz', 'a.usdz a.usdz', 0],
  ['testDiffToolIterateUsdz2', '247-256', 'testDiffToolIterateUsdz', 'a.usdz b.usdz', 1, 'iterate_usd.txt'],
  ['testDiffToolIterateUsdz3', '258-265', 'testDiffToolIterateUsdz', 'imagea.usdz imagea.usdz', 0],
  ['testDiffToolIterateUsdz4', '267-274', 'testDiffToolIterateUsdz', 'imagea.usdz imageb.usdz', 1],
  ['testDiffToolIterateUsdz5', '276-285', 'testDiffToolIterateUsdz', 'a_crate.usdz b_crate.usdz', 1,
    'iterate_usd_crate.txt'],
]

describe('usddiff', () => {
  // One case per registration (CMakeLists.txt at the lines given).
  for (const [name, , testenv, command, expectedReturnCode, stdoutRedirect, cleanOutput] of registrations) {
    it(name, async () => {
      dir = mkdtempSync(path.join(tmpdir(), 'testUsdDiff'))
      cpSync(path.join(FIXTURES, testenv), dir, { recursive: true })
      cwd = process.cwd()
      process.chdir(dir)
      // Each registration is its own process, with its own layer registry.
      _resetResolverForTest()
      let stdout = ''
      let stderr = ''
      const exitCode = await usddiff(command.split(' '),
        { stdout: t => { stdout += t }, stderr: t => { stderr += t }, env: { PATH: process.env['PATH'] } })
      expect(exitCode, stdout + stderr).toBe(expectedReturnCode)
      if (stdoutRedirect !== undefined) {
        const cleaned = cleanOutput ? stdout.replace(cleanOutput, '') : stdout
        const baseline = readFileSync(path.join(dir, 'baseline', stdoutRedirect), 'utf8')
        expect(cleaned.replace(/\r\n/g, '\n')).toBe(baseline.replace(/\r\n/g, '\n'))
      }
    })
  }
})
