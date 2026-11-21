// Ported from OpenUSD 26.11.1:
//  pxr/bin/usdfixbrokenpixarschemas/CMakeLists.txt
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1's usdfixbrokenpixarschemas test registrations
// (pxr/bin/usdfixbrokenpixarschemas/CMakeLists.txt:16-59). The testenv
// directories are copied unmodified into fixtures/ (Copyright Pixar, TOST
// 1.0, https://openusd.org/license). Each registration runs its COMMAND in a
// copy of its TESTENV (an empty directory when it names none), then its
// POST_COMMANDs, checks EXPECTED_RETURN_CODE and DIFF_COMPAREs the named
// files with those in baseline/; each case here does the same in a
// temporary copy that is the working directory, running the tool in
// process. testRenderSettingsTerminalsAPI (CMakeLists.txt:61-71) is
// registered only with PXR_BUILD_PRMAN_PLUGIN, whose RenderMan schemas are
// out of scope, so it is not ported.
//
// `usddiff --noeffect --brief a.usdz b.usdz` (the usdz registration's
// POST_COMMANDs) is usdDiffUsdz below: usddiff.py's _diffUsdz
// (pxr/usd/bin/usddiff/usddiff.py:264-341), which compares the two archives'
// file lists and, for each common file whose CRC or size differs, recurses
// into a nested usdz or diffs the two files' usdcat text.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { UsdZipFile as SdfZipFile } from 'typescript-usd/sdf'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { usdcat } from '../../../../usd/bin/usdcat/usdcat.ts'
import { usdfixbrokenpixarschemas } from '../../usdfixbrokenpixarschemas.ts'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

let dir = ''
let cwd = ''
afterEach(() => {
  if (cwd !== '') process.chdir(cwd)
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
  cwd = ''
  dir = ''
})

// One registration: COMMAND `usdfixbrokenpixarschemas <args>` in a copy of
// TESTENV.
async function run(testenv: string | undefined, args: string[]) {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdFixBrokenPixarSchemas'))
  if (testenv !== undefined) cpSync(path.join(FIXTURES, testenv), dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)
  // Each registration is its own process, with its own layer registry.
  _resetResolverForTest()
  let stdout = ''
  let stderr = ''
  const exitCode = await usdfixbrokenpixarschemas(args, {
    stdout: t => { stdout += t }, stderr: t => { stderr += t },
  })
  return { exitCode, stdout, stderr }
}

// DIFF_COMPARE <file>: the file equals baseline/<file>.
function diffCompare(file: string): void {
  expect(readFileSync(path.join(dir, file), 'utf8'), file)
    .toBe(readFileSync(path.join(dir, 'baseline', file), 'utf8'))
}

// usdcat <file> (non-flattened), as usddiff converts each file to diff.
async function catText(file: string): Promise<string> {
  _resetResolverForTest()
  let out = ''
  let err = ''
  const exitCode = await usdcat([file], { stdout: t => { out += t }, stderr: t => { err += t } })
  expect(exitCode, err).toBe(0)
  return out
}

// usddiff.py's _diffUsdz (usddiff.py:264-341): the differing files, by
// package-relative name; empty when the archives match.
async function usdDiffUsdz(base: Uint8Array, comp: Uint8Array, prefix = ''): Promise<string[]> {
  const baseZip = SdfZipFile.fromBytes(base)
  const compZip = SdfZipFile.fromBytes(comp)
  const baseFiles = new Set(baseZip.getFileNames())
  const compFiles = new Set(compZip.getFileNames())
  const differences: string[] = []
  for (const b of baseFiles) if (!compFiles.has(b)) differences.push(`Only in baseline: ${prefix}${b}`)
  for (const c of compFiles) if (!baseFiles.has(c)) differences.push(`Not in baseline: ${prefix}${c}`)
  for (const commonFile of [...baseFiles].filter(f => compFiles.has(f)).sort()) {
    const baseInfo = baseZip.getFileInfo(commonFile)!
    const compInfo = compZip.getFileInfo(commonFile)!
    if (baseInfo.crc === compInfo.crc && baseInfo.uncompressedSize === compInfo.uncompressedSize) continue
    const ext = path.extname(commonFile).slice(1).toLowerCase()
    const baseBytes = baseZip.getFile(commonFile)!
    const compBytes = compZip.getFile(commonFile)!
    if (ext === 'usdz') {
      differences.push(...await usdDiffUsdz(baseBytes, compBytes, `${prefix}${commonFile}/`))
      continue
    }
    // Extract both to temporary files and diff their usdcat text.
    const tmp = mkdtempSync(path.join(tmpdir(), 'usddiff'))
    try {
      const basePath = path.join(tmp, `base__.${ext}`)
      const compPath = path.join(tmp, `comp__.${ext}`)
      writeFileSync(basePath, baseBytes)
      writeFileSync(compPath, compBytes)
      if (await catText(basePath) !== await catText(compPath)) differences.push(`${prefix}${commonFile}`)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  return differences
}

describe('usdfixbrokenpixarschemas', () => {
  // CMakeLists.txt:16-24
  it('testUsdzMaterialBindingAPI', async () => {
    const r = await run('testUsdzMaterialBindingAPI', ['nested_anchored_refs_sub.usdz', '--backup', 'backup.usdz'])
    expect(r.exitCode, r.stderr).toBe(0)
    // POST_COMMAND usddiff --noeffect --brief, twice.
    for (const file of ['nested_anchored_refs_sub.usdz', 'backup.usdz']) {
      expect(await usdDiffUsdz(readFileSync(path.join(dir, file)), readFileSync(path.join(dir, 'baseline', file))),
        file).toEqual([])
    }
  })

  // CMakeLists.txt:27-31
  it('testInvocationErrorInvalidFile', async () => {
    const r = await run(undefined, ['invalid.usda'])
    expect(r.exitCode).toBe(1)
  })

  // CMakeLists.txt:33-38
  it('testInvocationErrorInvalidExtension', async () => {
    const r = await run('testInvocationErrors', ['file.txt'])
    expect(r.exitCode).toBe(1)
  })

  // CMakeLists.txt:40-49
  it('testMultipleFixer', async () => {
    const r = await run('testMultipleFixer', ['test.usda', '--backup', 'backup.usda'])
    expect(r.exitCode, r.stderr).toBe(0)
    // POST_COMMAND cmake -E copy test.usda test_Yup.usda.
    cpSync(path.join(dir, 'test.usda'), path.join(dir, 'test_Yup.usda'))
    diffCompare('test_Yup.usda')
    diffCompare('backup.usda')
  })

  // CMakeLists.txt:51-59
  it('testVariantMaterialBindingAPI', async () => {
    const r = await run('testVariantMaterialBindingAPI', ['test.usda', '--backup', 'backup.usda'])
    expect(r.exitCode, r.stderr).toBe(0)
    diffCompare('test.usda')
    diffCompare('backup.usda')
  })
})
