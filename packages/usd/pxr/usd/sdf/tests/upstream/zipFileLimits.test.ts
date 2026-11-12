// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfZipFileLimits.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfZipFileLimits.py, registered with
// SDF_MAX_ZIPFILE_SIZE=195 and SDF_MAX_ZIPFILE_ENTRY_SIZE=64
// (sdf/CMakeLists.txt:745-752). The layer files and every expected size and
// error are native captures in ./fixtures/zipFileLimits (FIXTURES.md).
// SdfZipFileWriter's AddFile/Save sequence is one createUsdzPackage call, so
// a failing AddFile fails the call instead of leaving a writer to Discard.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUsdzPackage } from 'typescript-usd/sdf'
import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'

const enc = new TextEncoder()

describe('testSdfZipFileLimits', () => {
  const expected = JSON.parse(readFileSync(
    new URL('./fixtures/zipFileLimits/expected.json', import.meta.url), 'utf8',
  )).payload as {
    env: Record<string, string>
    archiveOnlyEnv: Record<string, string>
    maxZipFileEntrySize: number
    maxZipFileSize: number
    files: Record<string, string>
    validSize: number
    tooManyFilesAddErrors: string[]
    archiveTooBigSaveErrors: string[]
    fileTooBigAddErrors: string[]
    tooManyFilesArchiveOnlyAddErrors: string[]
  }
  const file = (name: string) => ({ name, data: enc.encode(expected.files[name]!) })
  const stubEnv = (env: Record<string, string>) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  }
  const runtimeErrors = (action: () => unknown): string[] => {
    try {
      action()
      return []
    } catch (error) {
      expect(error).toBeInstanceOf(TfError)
      expect((error as TfError).getDiagnosticCode()).toBe(TfDiagnosticType.RuntimeError)
      return [(error as TfError).getCommentary()]
    }
  }
  afterEach(() => { vi.unstubAllEnvs() })

  it('test_maxArchiveSize', () => {
    stubEnv(expected.env)
    expect(enc.encode(expected.files['0.usda']!).length).toBeLessThan(expected.maxZipFileSize)
    expect(enc.encode(expected.files['1.usda']!).length).toBeLessThan(expected.maxZipFileSize)
    expect(enc.encode(expected.files['11.usda']!).length).toBeGreaterThan(expected.maxZipFileSize)

    // Baseline sanity check: exactly MAX_ZIPFILE_SIZE bytes.
    expect(createUsdzPackage([file('1.usda')]).length).toBe(expected.validSize)

    // Failure case 1: adding 11.usda after 1.usda.
    expect(runtimeErrors(() => createUsdzPackage([file('1.usda'), file('11.usda')])))
      .toEqual(expected.tooManyFilesAddErrors)

    // Failure case 2: the central directory exceeds the limit on Save.
    expect(runtimeErrors(() => createUsdzPackage([file('0.usda'), file('1.usda')])))
      .toEqual(expected.archiveTooBigSaveErrors)
  })

  it('test_maxArchiveSize with only the archive limit set', () => {
    stubEnv(expected.archiveOnlyEnv)
    expect(runtimeErrors(() => createUsdzPackage([file('1.usda'), file('11.usda')])))
      .toEqual(expected.tooManyFilesArchiveOnlyAddErrors)
  })

  it('test_maxEntrySize', () => {
    stubEnv(expected.env)
    expect(enc.encode(expected.files['5.usda']!).length)
      .toBeGreaterThan(expected.maxZipFileEntrySize)
    expect(runtimeErrors(() => createUsdzPackage([file('5.usda')])))
      .toEqual(expected.fileTooBigAddErrors)
  })
})
