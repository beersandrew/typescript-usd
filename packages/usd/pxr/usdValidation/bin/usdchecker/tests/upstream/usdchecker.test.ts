// Ported from OpenUSD 26.11.1: pxr/usdValidation/bin/usdchecker/CMakeLists.txt
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1's usdchecker test registrations
// (pxr/usdValidation/bin/usdchecker/CMakeLists.txt:21-192). The testenv
// directory testUsdChecker is copied unmodified into fixtures/ (Copyright
// Pixar, TOST 1.0, https://openusd.org/license). Each registration runs its
// COMMAND in a copy of the testenv and checks EXPECTED_RETURN_CODE;
// testUsdCheckerListValidators also redirects standard output to
// baseRules_validationFramework.txt and DIFF_COMPAREs it with the one in
// baseline/. Each case here does the same in a temporary copy that is the
// working directory, running the tool in process with usdchecker(argv).

import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { usdchecker } from '../../usdchecker.ts'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdChecker')

let dir = ''
let cwd = ''
afterEach(() => {
  if (cwd !== '') process.chdir(cwd)
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
  cwd = ''
  dir = ''
})

async function run(args: string[]) {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdChecker'))
  cpSync(TESTENV, dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)
  // Each registration is its own process, with its own layer registry.
  _resetResolverForTest()
  let stdout = ''
  let stderr = ''
  const exitCode = await usdchecker(args, { stdout: t => { stdout += t }, stderr: t => { stderr += t } })
  return { exitCode, stdout, stderr }
}

// [name, CMakeLists.txt lines, COMMAND arguments, EXPECTED_RETURN_CODE].
const registrations: [string, string, string, number][] = [
  ['testUsdChecker1', '31-35', 'clean/clean.usd', 0],
  ['testUsdChecker2', '38-42', 'clean/clean_flat.usdc', 0],
  ['testUsdChecker3', '44-48', 'clean/clean.usdz', 0],
  ['testUsdChecker4', '50-54', 'clean/clean_flat.usdz', 0],
  ['testUsdChecker5', '57-61', '--rootPackageOnly bad/sceneWithInvalidPackage.usda', 0],
  ['testUsdChecker6', '64-68', 'bad/sceneWithInvalidPackage.usda', 1],
  ['testUsdChecker7', '70-74', 'bad/badUsdz.usdz', 1],
  ['testUsdChecker8', '78-82', '--dumpRules bad/badVariants.usdc', 1],
  ['testUsdChecker9', '86-90', 'bad/badVariants2.usda', 1],
  ['testUsdChecker10', '93-97', 'bad/badVariants2.usda --variants testSet:test2,testSet2:test2C', 1],
  ['testUsdChecker11', '100-104', 'bad/badVariants2.usda --variants testSet:test1,testSet2:test2A', 0],
  ['testUsdChecker12', '108-112', 'bad/badVariants2.usda --variants testSet:test1,testSet2:test2C', 0],
  ['testUsdChecker13', '115-119', 'bad/badVariants2.usda --variantSets testSet', 1],
  ['testUsdChecker14', '123-127', 'bad/badVariants3.usda', 1],
  ['testUsdChecker15', '130-134', 'bad/badVariants3.usda --variantSets set1', 1],
  ['testUsdChecker16', '137-141', 'bad/badVariants3.usda --variantSets set2', 0],
  ['testUsdChecker17', '143-147', 'bad/badVariants3.usda --variantSets set3', 0],
  ['testUsdChecker18', '150-154', 'bad/badVariants3.usda --variants set1:ref2,set2:A,set3:D', 1],
  ['testUsdChecker19', '157-161', 'bad/badVariants3.usda --variants set1:ref2 --variantSets set3', 1],
  ['testUsdChecker20', '163-167', 'bad/brokenRef.usd', 1],
  ['testUsdChecker21', '169-173', 'bad/badShaderUnsupportedTexture.usdc', 1],
  ['testUsdChecker22', '175-179', 'clean/cleanNormalMapReader.usda', 0],
  ['testUsdChecker23', '181-185', 'bad/badImageableConnectableMaterialDesc.usda', 1],
  ['testUsdChecker24', '188-192', 'clean/clean_variable_expression.usda', 0],
]

describe('usdchecker', () => {
  // CMakeLists.txt:21-27
  it('testUsdCheckerListValidators', async () => {
    const r = await run(['--includeKeywords',
      'UsdCoreValidators,UsdGeomValidators,UsdLuxValidators,UsdPhysicsValidators,UsdShadeValidators,' +
      'UsdSkelValidators,UsdUtilsValidators', '-d'])
    expect(r.exitCode, r.stderr).toBe(0)
    // STDOUT_REDIRECT baseRules_validationFramework.txt, DIFF_COMPARE.
    expect(r.stdout).toBe(readFileSync(path.join(dir, 'baseline/baseRules_validationFramework.txt'), 'utf8'))
  })

  // One case per registration (CMakeLists.txt at the lines given).
  for (const [name, , command, expectedReturnCode] of registrations) {
    it(name, async () => {
      const r = await run(command.split(' '))
      expect(r.exitCode, r.stdout + r.stderr).toBe(expectedReturnCode)
    })
  }
})
