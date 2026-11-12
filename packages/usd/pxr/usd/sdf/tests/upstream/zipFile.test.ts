// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfZipFile.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfZipFile.py (OpenUSD 26.11.1).
// Inputs: fixtures/testSdfZipFile.testenv/, copied byte-for-byte unmodified
// from pxr/usd/sdf/testenv/testSdfZipFile.testenv/ (Pixar, licensed under the
// terms in OpenUSD's LICENSE.txt, https://openusd.org/license).
//
// Mapping: Sdf.ZipFile.Open(path) reads a file; here the archive's bytes are
// read with node:fs and given to UsdZipFile.fromBytes. SdfZipFileWriter's
// CreateNew / AddFile / Save sequence is one createUsdzPackage call, whose
// bytes are the saved archive; a writer that is never saved (Discard) is a
// call never made, so test_WriterDiscard's "no file is written until Save"
// checks have no counterpart. The checks that Python's zipfile module reads
// the written archives (third-party reader validation) are out of scope: no
// zip reader other than UsdZipFile is available without a new dependency.
import { readFileSync } from 'node:fs'
import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { UsdZipFile, createUsdzPackage } from 'typescript-usd/sdf'

const TESTENV = new URL('./fixtures/testSdfZipFile.testenv/', import.meta.url)
const read = (name: string) => new Uint8Array(readFileSync(new URL(name, TESTENV)))
const enc = new TextEncoder()

const open = (bytes: Uint8Array) => UsdZipFile.fromBytes(bytes)

// AddFile(srcFile, destFile) (zipFile.h): the source file's bytes under
// destFile, or under srcFile when no destination is given.
const addFile = (srcFile: string, destFile = srcFile) => ({ name: destFile, data: read(srcFile) })

// _ValidateSourceAndZippedFile (testSdfZipFile.py:14-26).
function validateSourceAndZippedFile(
  srcFile: string, zipFile: UsdZipFile, fileInZip: string, fixLineEndings = false,
) {
  let srcData = read(srcFile)
  if (fixLineEndings) {
    srcData = enc.encode(new TextDecoder().decode(srcData).replaceAll('\r\n', '\n'))
  }
  expect(zipFile.getFile(fileInZip)).toEqual(srcData)
}

describe('testSdfZipFile', () => {
  // test_Reader (:28-87).
  it('test_Reader', () => {
    // Sdf.ZipFile.Open("nonexistent.usdz") returns None: no bytes to read.
    expect(() => readFileSync(new URL('nonexistent.usdz', TESTENV))).toThrow()

    const zf = open(read('test_reader.usdz'))
    expect(zf.getFileNames()).toEqual(['a.test', 'b.png', 'sub/c.png', 'sub/d.txt'])

    expect(zf.getFile('nonexistent.txt')).toBeUndefined()
    expect(zf.getFileInfo('nonexistent.txt')).toBeUndefined()

    // test_reader.usdz was created with text files with Unix-style line
    // endings.
    const fixLineEndings = true

    let fileInfo = zf.getFileInfo('a.test')!
    expect(fileInfo.dataOffset).toBe(64)
    expect(fileInfo.size).toBe(83)
    expect(fileInfo.uncompressedSize).toBe(83)
    expect(fileInfo.crc).toBe(2187659876)
    expect(fileInfo.compressionMethod).toBe(0)
    expect(fileInfo.encrypted).toBe(false)
    validateSourceAndZippedFile('src/a.test', zf, 'a.test', fixLineEndings)

    fileInfo = zf.getFileInfo('b.png')!
    expect(fileInfo.dataOffset).toBe(192)
    expect(fileInfo.size).toBe(7228)
    expect(fileInfo.uncompressedSize).toBe(7228)
    expect(fileInfo.crc).toBe(384784137)
    expect(fileInfo.compressionMethod).toBe(0)
    expect(fileInfo.encrypted).toBe(false)
    validateSourceAndZippedFile('src/b.png', zf, 'b.png')

    fileInfo = zf.getFileInfo('sub/c.png')!
    expect(fileInfo.dataOffset).toBe(7488)
    expect(fileInfo.size).toBe(6139)
    expect(fileInfo.uncompressedSize).toBe(6139)
    expect(fileInfo.crc).toBe(2488450460)
    expect(fileInfo.compressionMethod).toBe(0)
    expect(fileInfo.encrypted).toBe(false)
    validateSourceAndZippedFile('src/sub/c.png', zf, 'sub/c.png')

    fileInfo = zf.getFileInfo('sub/d.txt')!
    expect(fileInfo.dataOffset).toBe(13696)
    expect(fileInfo.size).toBe(87)
    expect(fileInfo.uncompressedSize).toBe(87)
    expect(fileInfo.crc).toBe(2546026356)
    expect(fileInfo.compressionMethod).toBe(0)
    expect(fileInfo.encrypted).toBe(false)
    validateSourceAndZippedFile('src/sub/d.txt', zf, 'sub/d.txt', fixLineEndings)
  })

  // test_Writer (:89-158).
  it('test_Writer', () => {
    const bytes = createUsdzPackage([addFile('src/a.test'), addFile('src/b.png', 'b.png')])

    // Verify that the zip file can be read by Sdf.ZipFile.
    const zf = open(bytes)
    expect(zf.getFileNames()).toEqual(['src/a.test', 'b.png'])

    const dontFixLineEndings = false
    const getFileSize = (file: string) => read(file).length
    const computeCRC = (file: string) => crc32(read(file))

    let fileInfo = zf.getFileInfo('src/a.test')!
    expect(fileInfo.dataOffset).toBe(64)
    expect(fileInfo.size).toBe(getFileSize('src/a.test'))
    expect(fileInfo.uncompressedSize).toBe(getFileSize('src/a.test'))
    expect(fileInfo.crc).toBe(computeCRC('src/a.test'))
    expect(fileInfo.compressionMethod).toBe(0)
    expect(fileInfo.encrypted).toBe(false)

    fileInfo = zf.getFileInfo('b.png')!
    expect(fileInfo.dataOffset).toBe(192)
    expect(fileInfo.size).toBe(7228)
    expect(fileInfo.uncompressedSize).toBe(7228)
    expect(fileInfo.crc).toBe(384784137)
    expect(fileInfo.compressionMethod).toBe(0)
    expect(fileInfo.encrypted).toBe(false)

    validateSourceAndZippedFile('src/a.test', zf, 'src/a.test', dontFixLineEndings)
    validateSourceAndZippedFile('src/b.png', zf, 'b.png')

    // The data offset of every file in the archive is aligned on 64 bytes.
    for (const f of zf.getFileNames()) {
      expect(zf.getFileInfo(f)!.dataOffset % 64).toBe(0)
    }
  })

  // test_WriterAlignment (:160-183).
  it('test_WriterAlignment', () => {
    const align2 = enc.encode('This is a test file')
    // The size of the first file varies from 1 byte to 64 bytes; the second
    // file's data stays aligned to 64 bytes.
    for (let i = 1; i < 65; ++i) {
      const zf = open(createUsdzPackage([
        { name: 'test_align_1.txt', data: enc.encode('a'.repeat(i)) },
        { name: 'test_align_2.txt', data: align2 },
      ]))
      expect(zf.getFileInfo('test_align_1.txt')!.dataOffset % 64).toBe(0)
      expect(zf.getFileInfo('test_align_2.txt')!.dataOffset % 64).toBe(0)
    }
  })

  // test_WriterEmptyArchive (:198-215).
  it('test_WriterEmptyArchive', () => {
    const zf = open(createUsdzPackage([]))
    expect(zf).toBeTruthy()
    expect(zf.getFileNames()).toEqual([])
  })
})
