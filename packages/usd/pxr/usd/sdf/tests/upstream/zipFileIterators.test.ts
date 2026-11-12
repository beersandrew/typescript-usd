// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfZipFile.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfZipFile.cpp (OpenUSD 26.11.1;
// registration testSdfZipFile_CPP). Input: fixtures/testSdfZipFile.testenv/
// test_reader.usdz (see zipFile.test.ts). TestIterators walks
// SdfZipFile::Iterator over the archive's files in order. The C++ iterator
// operators (copy, move, pre/post increment, equality against std::next) have
// no TypeScript counterpart; the file sequence they walk is getFileNames().
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { UsdZipFile } from 'typescript-usd/sdf'

describe('testSdfZipFile_CPP', () => {
  it('TestIterators', () => {
    const zipFile = UsdZipFile.fromBytes(new Uint8Array(readFileSync(
      new URL('./fixtures/testSdfZipFile.testenv/test_reader.usdz', import.meta.url))))
    expect(zipFile).toBeTruthy()
    const names = zipFile.getFileNames()
    // std::distance(begin, end) == 4, then each file in order (:47-94).
    expect(names.length).toBe(4)
    expect(names).toEqual(['a.test', 'b.png', 'sub/c.png', 'sub/d.txt'])
  })
})
