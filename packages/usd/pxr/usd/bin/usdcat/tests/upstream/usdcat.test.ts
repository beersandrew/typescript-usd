// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdcat/CMakeLists.txt
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1's usdcat test registrations
// (pxr/usd/bin/usdcat/CMakeLists.txt:12-72). The testenv directories under
// pxr/usd/bin/usdcat/testenv are copied unmodified into fixtures/ (Copyright
// Pixar, TOST 1.0, https://openusd.org/license). Each registration runs its
// COMMAND in a copy of its TESTENV (an empty directory when it names none),
// checks EXPECTED_RETURN_CODE and, where it names one, DIFF_COMPAREs the
// output file with the one in baseline/; each case here does the same in a
// temporary copy that is the working directory, running the tool in process
// with usdcat(argv).

import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { usdcat } from '../../usdcat.ts'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

let dir = ''
let cwd = ''
afterEach(() => {
  if (cwd !== '') process.chdir(cwd)
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
  cwd = ''
  dir = ''
})

interface Run { exitCode: number, stdout: string, stderr: string }

// One registration: COMMAND `usdcat <args>` in a copy of TESTENV.
async function run(testenv: string | undefined, args: string[]): Promise<Run> {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdCat'))
  if (testenv !== undefined) cpSync(path.join(FIXTURES, testenv), dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)
  // Each registration is its own process, with its own layer registry.
  _resetResolverForTest()
  let stdout = ''
  let stderr = ''
  const exitCode = await usdcat(args, { stdout: t => { stdout += t }, stderr: t => { stderr += t } })
  return { exitCode, stdout, stderr }
}

// DIFF_COMPARE <file>: the file the command wrote equals baseline/<file>.
function diffCompare(file: string): void {
  expect(readFileSync(path.join(dir, file), 'utf8'))
    .toBe(readFileSync(path.join(dir, 'baseline', file), 'utf8'))
}

describe('usdcat', () => {
  // CMakeLists.txt:12-17
  it('testUsdCatOutToFile', async () => {
    const r = await run('testCatToFile', ['input.usda', '--out', 'output.usda'])
    expect(r.exitCode, r.stderr).toBe(0)
    diffCompare('output.usda')
  })

  // CMakeLists.txt:19-23
  it('testUsdCatVariadicCatting', async () => {
    const r = await run('testVariadicCatting', ['a.usd', 'b.usd', 'c.usd'])
    expect(r.exitCode, r.stderr).toBe(0)
  })

  // CMakeLists.txt:25-29
  it('testUsdCatMissingOrInvalidFiles1', async () => {
    const r = await run('testMissingOrInvalidFiles', ['hello.txt'])
    expect(r.exitCode).toBe(1)
  })

  // CMakeLists.txt:31-35
  it('testUsdCatMissingOrInvalidFiles2', async () => {
    const r = await run('testMissingOrInvalidFiles', ['foo.usda'])
    expect(r.exitCode).toBe(1)
  })

  // CMakeLists.txt:37-40
  it('testUsdCatMissingOrInvalidFiles3', async () => {
    const r = await run(undefined, ['--flattenLayerStack', 'missingFile.usda'])
    expect(r.exitCode).toBe(1)
  })

  // CMakeLists.txt:42-47
  it('testUsdCatMask', async () => {
    const r = await run('testUsdCatMask',
      ['--mask', '/InsideMask', '--flatten', '--skipSourceFileComment', 'input.usda', '-o', 'output.usda'])
    expect(r.exitCode, r.stderr).toBe(0)
    diffCompare('output.usda')
  })

  // CMakeLists.txt:49-52
  it('testUsdCatMask2', async () => {
    const r = await run(undefined, ['--mask', '/InsideMask', 'input.usda', '-o', 'output.usda'])
    expect(r.exitCode).toBe(1)
  })

  // CMakeLists.txt:54-58
  it('testUsdCatLoadOnly', async () => {
    const r = await run('testLoadOnly', ['--loadOnly', 'input.usda'])
    expect(r.exitCode, r.stdout + r.stderr).toBe(0)
  })

  // CMakeLists.txt:60-65
  it('testUsdCatLayerMetadata', async () => {
    const r = await run('testUsdCatLayerMetadata', ['--layerMetadata', 'input.usda', '-o', 'output.usda'])
    expect(r.exitCode, r.stderr).toBe(0)
    diffCompare('output.usda')
  })

  // CMakeLists.txt:67-72
  it('testUsdCatFlattenLayerStack', async () => {
    const r = await run('testUsdCatFlattenLayerStack', ['--flattenLayerStack', 'input.usda', '--out', 'output.usda'])
    expect(r.exitCode, r.stderr).toBe(0)
    diffCompare('output.usda')
  })
})
