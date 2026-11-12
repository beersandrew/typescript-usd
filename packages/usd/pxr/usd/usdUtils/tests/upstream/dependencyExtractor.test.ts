// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsDependencyExtractor.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usdUtils/testenv/testUsdUtilsDependencyExtractor.py (registered as
// testUsdUtilsDependencyExtractor1, testUsdUtilsDependencyExtractor2,
// testUsdUtilsDependencyExtractor3, testUsdUtilsDependencyExtractor4,
// testUsdUtilsDependencyExtractor5, testUsdUtilsDependencyExtractor6 and
// testUsdUtilsDependencyExtractor7,
// pxr/usd/usdUtils/CMakeLists.txt:430-484). The testenv directory
// testUsdUtilsDependencyExtractor is copied unmodified into
// fixtures/testUsdUtilsDependencyExtractor (Copyright Pixar, TOST 1.0
// , https://openusd.org/license). Each registration runs the script with
// its COMMAND arguments in a copy of the testenv and DIFF_COMPAREs the file
// it writes with the one in baseline/; each case here does the same in a
// temporary copy that is the working directory.
//
// API mapping: UsdUtils.ExtractExternalReferences(identifier, params)
// returning (sublayers, references, payloads) is
// UsdUtilsExtractExternalReferences(identifier, sublayers, references,
// payloads, params) filling the arrays. Sdf.Layer.OpenAsAnonymous is
// Layer.openAsAnonymous; layer.SetPermissionToEdit is setPermissionToEdit.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import {
  UsdUtilsExtractExternalReferences, ExtractExternalReferencesParams,
} from 'typescript-usd/usdUtils'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdUtilsDependencyExtractor')

let dir = ''
let cwd = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsDependencyExtractor'))
  cpSync(TESTENV, dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)
  // Each registration is its own process, with its own layer registry.
  _resetResolverForTest()
})
afterEach(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
})

function presult(lines: string[], fileName: string, refType: string, refs: readonly string[]): void {
  if (refs.length > 0) {
    refs.forEach((r, i) => lines.push(`${fileName} ${refType}[${String(i + 1).padStart(3, '0')}]: ${r}`))
  } else {
    lines.push(`${fileName} no ${refType}`)
  }
}

// The script's __main__ (testUsdUtilsDependencyExtractor.py:26-61); the
// output text it writes to outfile.
async function run(infile: string, options: { openAsAnon?: boolean, resolveUdimPaths?: boolean } = {}): Promise<string> {
  expect(existsSync(infile)).toBe(true)

  // Open layer and turn off edit permission, to validate that the dependency
  // extractor does not require modifying the layer
  let identifier: string
  if (options.openAsAnon) {
    const layer = await Layer.openAsAnonymous(infile)
    layer!.setPermissionToEdit(false)
    identifier = layer!.identifier
  } else {
    const layer = await Layer.findOrOpen(infile)
    layer!.setPermissionToEdit(false)
    identifier = infile
  }

  const extractionParams = new ExtractExternalReferencesParams()
  if (options.resolveUdimPaths) extractionParams.setResolveUdimPaths(true)

  const sublayers: string[] = [], references: string[] = [], payloads: string[] = []
  await UsdUtilsExtractExternalReferences(identifier, sublayers, references, payloads, extractionParams)

  const lines: string[] = []
  presult(lines, infile, 'sublayers', sublayers)
  presult(lines, infile, 'references', references)
  presult(lines, infile, 'payloads', payloads)
  return lines.map(line => `${line}\n`).join('')
}

const baseline = (name: string): string => readFileSync(path.join(TESTENV, 'baseline', name), 'utf8')

describe('testUsdUtilsDependencyExtractor', () => {
  it('testUsdUtilsDependencyExtractor1: ascii.usda ascii-usda.txt', async () => {
    expect(await run('ascii.usda')).toBe(baseline('ascii-usda.txt'))
  })
  it('testUsdUtilsDependencyExtractor2: ascii.usd ascii-usd.txt', async () => {
    expect(await run('ascii.usd')).toBe(baseline('ascii-usd.txt'))
  })
  it('testUsdUtilsDependencyExtractor3: crate.usdc crate-usdc.txt', async () => {
    expect(await run('crate.usdc')).toBe(baseline('crate-usdc.txt'))
  })
  it('testUsdUtilsDependencyExtractor4: crate.usd crate-usd.txt', async () => {
    expect(await run('crate.usd')).toBe(baseline('crate-usd.txt'))
  })
  it('testUsdUtilsDependencyExtractor5: --open-as-anon anon.usda anon.txt', async () => {
    expect(await run('anon.usda', { openAsAnon: true })).toBe(baseline('anon.txt'))
  })
  it('testUsdUtilsDependencyExtractor6: udims/root.usda udims.txt', async () => {
    expect(await run('udims/root.usda')).toBe(baseline('udims.txt'))
  })
  it('testUsdUtilsDependencyExtractor7: --resolve-udim-paths udims/root.usda udims-resolved.txt', async () => {
    expect(await run('udims/root.usda', { resolveUdimPaths: true })).toBe(baseline('udims-resolved.txt'))
  })
})
