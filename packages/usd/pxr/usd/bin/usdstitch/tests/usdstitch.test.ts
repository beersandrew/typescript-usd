// Checks of usdstitch (pxr/usd/bin/usdstitch/usdstitch.ts). OpenUSD 26.11.1
// registers no test for usdstitch (pxr/usd/bin/usdstitch/CMakeLists.txt), so
// these check the tool against the library call it wraps: its output is
// UsdUtilsStitchLayers folded over its inputs, strongest first
// (usdstitch.py:35-53). The inputs are usdcat's testVariadicCatting testenv
// files (pxr/usd/bin/usdcat/tests/upstream/fixtures).

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { UsdUtilsStitchLayers } from 'typescript-usd/usdUtils'
import { usdstitch } from '../usdstitch.ts'

const INPUTS = path.join(fileURLToPath(new URL('.', import.meta.url)),
  '../../usdcat/tests/upstream/fixtures/testVariadicCatting')

let dir = ''
let cwd = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdStitch'))
  cpSync(INPUTS, dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)
  _resetResolverForTest()
})
afterEach(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
})

async function run(args: string[]) {
  let stdout = ''
  let stderr = ''
  const exitCode = await usdstitch(args, { stdout: t => { stdout += t }, stderr: t => { stderr += t } })
  return { exitCode, stdout, stderr }
}

describe('usdstitch', () => {
  it('writes the inputs stitched strongest first', async () => {
    const r = await run(['a.usd', 'b.usd', 'c.usd', '-o', 'out.usda'])
    expect(r.exitCode, r.stderr).toBe(0)

    const expected = Layer.createAnonymous('.usda')
    for (const name of ['a.usd', 'b.usd', 'c.usd']) {
      UsdUtilsStitchLayers(expected, (await Layer.findOrOpen(path.join(dir, name)))!)
    }
    _resetResolverForTest()
    const written = await Layer.findOrOpen(path.join(dir, 'out.usda'))
    expect(expected.exportToString()).toContain('def "refSphere"')
    expect(written!.exportToString()).toBe(expected.exportToString())
  })

  it('warns when overwriting an existing file', async () => {
    writeFileSync('out.usda', '#usda 1.0\n')
    const r = await run(['a.usd', '--out', 'out.usda'])
    expect(r.exitCode, r.stderr).toBe(0)
    expect(r.stdout).toContain('Warning: overwriting pre-existing file')
  })

  it('asserts an output file is given', async () => {
    const r = await run(['a.usd'])
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('must specify output file')
  })

  it('asserts every input opens', async () => {
    const r = await run(['a.usd', 'missing.usd', '-o', 'out.usda'])
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toContain('unable to open file(s) missing.usd')
  })

  it('requires at least one input file', async () => {
    const r = await run(['-o', 'out.usda'])
    expect(r.exitCode).toBe(2)
    expect(existsSync('out.usda')).toBe(false)
  })
})
