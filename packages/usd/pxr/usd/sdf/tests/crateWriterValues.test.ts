// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateFile.cpp,
//  pxr/usd/sdf/fileIO_Common.cpp, pxr/usd/sdf/schema.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fixtures/crateWriterValues (FIXTURES.md).
// Strings are std::string bytes: the crate stores them unchanged in its
// token table and the text writer escapes the bytes that are not UTF-8
// (fileIO_Common.cpp:1090-1104). displayUnit holds a TfEnum
// (schema.cpp:768-769), which the crate cannot pack: the export posts a
// coding error and stores an invalid value rep (crateFile.cpp:4303-4307),
// and reading that rep posts another (crateFile.cpp:4361-4368).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { TfErrorMark } from 'typescript-usd/tf'
import expectedFixture from './fixtures/crateWriterValues/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../testing/oracleFixture.ts'

const expected = oraclePayload(expectedFixture)
const fixture = (name: string) => readFileSync(new URL(`./fixtures/crateWriterValues/${name}`, import.meta.url))
const usda = (name: string) => Layer.createInMemory(name, fixture(name).toString('utf8'))

// TfError.GetErrorCodeAsString names TfDiagnosticType members.
const CODE_NAMES: Record<string, string> = { CodingError: 'TF_DIAGNOSTIC_CODING_ERROR_TYPE' }

function errorsOf(call: () => void): { commentary: string, code: string }[] {
  const mark = new TfErrorMark()
  call()
  const errors = mark.getErrors().map(e => ({
    commentary: e.getCommentary(), code: CODE_NAMES[e.getErrorCodeAsString()] ?? e.getErrorCodeAsString(),
  }))
  mark.clear()
  return errors
}

describe('Non-UTF-8 string bytes in USDC', () => {
  it('a native USDC file reads as OpenUSD reads it', () => {
    const layer = Layer.fromBytes(new Uint8Array(fixture('strings.usdc')), 'strings.usdc')
    expect(layer.exportToString()).toBe(expected.stringsReopened)
  })

  it('a typescript-usd-written USDC file keeps the bytes', () => {
    const written = Layer.fromBytes(usda('strings.usda').toUsdc(), 'written.usdc')
    expect(written.exportToString()).toBe(expected.stringsReopened)
  })
})

describe('displayUnit in USDC', () => {
  it('writing it posts the coding error OpenUSD posts', () => {
    const layer = usda('writer.usda')
    let bytes: Uint8Array = new Uint8Array()
    expect(errorsOf(() => { bytes = layer.toUsdc() })).toEqual(expected.exportErrors)

    const reopened = Layer.fromBytes(bytes, 'writer.usdc')
    expect(reopened.listFields('/P.u').sort()).toEqual(expected.reopenedFields)
    expect(errorsOf(() => reopened.getField('/P.u', 'displayUnit'))).toEqual(expected.displayUnitReadErrors)
  })
})
