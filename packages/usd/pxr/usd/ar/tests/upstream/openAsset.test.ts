// Ported from OpenUSD 26.11.1: pxr/usd/ar/filesystemAsset.cpp,
//  pxr/usd/ar/testenv/testArOpenAsset.py, pxr/usd/ar/wrapAsset.cpp
// Copyright 2021, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/usd/ar/testenv/testArOpenAsset.py
// (registration testArOpenAsset): ArDefaultResolver.OpenAsset on files in a
// temporary directory, read through ArAsset::GetSize/GetBuffer/Read.
//
// Out of scope (Python wrapper behaviour, wrapAsset.cpp:30-130, not ArAsset):
// the "Invalid read offset" ValueError and the count clamping Ar_PyAsset::Read
// applies before calling ArAsset::Read, and the context-manager release that
// makes a used asset raise "Unable to access invalid asset". The clamped read
// is exercised here through ArFilesystemAsset::Read itself, which is a pread
// returning the bytes available (filesystemAsset.cpp:90-100).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  GetResolver as ArGetResolver,
  ResolvedPath as ArResolvedPath,
  SetPreferredResolver as ArSetPreferredResolver,
} from '../../src/index.ts'
import { _resetResolverForTest } from '../../src/internal.ts'

const decoder = new TextDecoder()

// testArOpenAsset.py:36-46. Python's json.dumps default separators and
// ensure_ascii escaping.
const jsonData = {
  'name': 'example',
  'value': 1234,
  'utf-8': 'Hello, 世界! 🌍',
  'child-object': { 'key': 'value' },
}
const jsonText =
  '{"name": "example", "value": 1234, "utf-8": "Hello, \\u4e16\\u754c! \\ud83c\\udf0d", ' +
  '"child-object": {"key": "value"}}'
// testArOpenAsset.py:65.
const binaryData = new Uint8Array([0xc3, 0xc7, 0xe9, 0x82, 0x41, 0x30])

let tempDir = ''
let jsonFilePath = '', binaryFilePath = '', emptyFilePath = ''

beforeAll(() => {
  _resetResolverForTest()
  ArSetPreferredResolver('ArDefaultResolver')
})

// testArOpenAsset.py:17-71.
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'testArOpenAsset'))
  jsonFilePath = join(tempDir, 'text.json')
  binaryFilePath = join(tempDir, 'binary.bin')
  emptyFilePath = join(tempDir, 'empty.txt')
  writeFileSync(jsonFilePath, jsonText)
  writeFileSync(emptyFilePath, '')
  writeFileSync(binaryFilePath, binaryData)
})
afterEach(() => rmSync(tempDir, { recursive: true, force: true }))

const open = (path: string) => ArGetResolver().openAsset(new ArResolvedPath(path))

describe('testArOpenAsset', () => {
  it('serializes the JSON fixture as Python json.dumps does', () => {
    expect(JSON.parse(jsonText)).toEqual(jsonData)
  })

  it('test_readingNonExistingAssetResultsInInvalidAsset', async () => {
    expect(await open(join(tempDir, 'non-existing-asset.json'))).toBeUndefined()
  })

  it('test_openingDirectoryResultsInInvalidAsset', async () => {
    expect(await open(tempDir)).toBeUndefined()
  })

  it('test_arAssetHasExpectedContentSize', async () => {
    const asset = (await open(jsonFilePath))!
    expect(asset.getSize()).toBe(statSync(jsonFilePath).size)
  })

  it('test_arAssetBufferRead', async () => {
    const asset = (await open(jsonFilePath))!
    const buffer = await asset.read(asset.getSize(), 0)
    expect(decoder.decode(buffer)).toBe(jsonText)
    expect(buffer.length).toBe(asset.getSize())
  })

  it('test_ArAssetPreventReadingBeyondSourceAsset', async () => {
    const size = statSync(jsonFilePath).size
    const asset = (await open(jsonFilePath))!
    const buffer = await asset.read(999999, 10)
    expect(buffer.length).toBe(size - 10)
  })

  it('test_arAssetReadWithSpecifiedLength', async () => {
    const asset = (await open(jsonFilePath))!
    const assetSize = asset.getSize()
    let bufferSize = Math.floor(assetSize / 2)
    let buffer = await asset.read(bufferSize, 0)
    expect(decoder.decode(buffer)).toBe(jsonText.slice(0, bufferSize))
    expect(buffer.length).toBe(bufferSize)
    bufferSize = assetSize - bufferSize
    buffer = await asset.read(bufferSize, Math.floor(assetSize / 2))
    // testArOpenAsset.py:178-180 compares against json[bufferSize:], which
    // equals json[assetSize // 2:] only for an even size; this fixture's
    // serialization has an even byte count.
    expect(assetSize % 2).toBe(0)
    expect(decoder.decode(buffer)).toBe(jsonText.slice(bufferSize))
    expect(buffer.length).toBe(bufferSize)
  })

  it('test_readingAssetWithNoContentReturnsValidContext', async () => {
    expect(await open(emptyFilePath)).toBeDefined()
  })

  it('test_arAssetBufferCanBeAccessedForTextContent', async () => {
    const asset = (await open(jsonFilePath))!
    const content = await asset.getBuffer()
    expect(decoder.decode(content)).toBe(jsonText)
    expect(decoder.decode(content)).toContain('Hello, \\u4e16\\u754c! \\ud83c\\udf0d')
  })

  it('test_arAssetBufferCanBeAccessedForBinaryContent', async () => {
    const asset = (await open(binaryFilePath))!
    expect(await asset.getBuffer()).toEqual(binaryData)
  })
})
