// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateFile.cpp,
//  pxr/usd/sdf/testenv/testSdfParsing.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// A relationship default holding a single SdfPath has no crate type: the
// usdc writer posts a coding error and packs an invalid value
// (crateFile.cpp:4285-4307); reading it back posts the unpack coding error
// and yields no value (crateFile.cpp:4360-4368), so the read-back layer
// writes no default. Expected values are native captures from
// ./fixtures/crateRelationshipDefault (FIXTURES.md); the 127_varyingRelationship
// case reads testSdfParsing's input of that name.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// Importing typescript-usd/usd registers the crate (.usdc) file format.
import 'typescript-usd/usd'
import { Layer } from 'typescript-usd/sdf'
import { TfErrorMark, TfDiagnosticType } from 'typescript-usd/tf'

interface Case {
  text: string
  relationship: string
  exportErrors: string[]
  infoKeys: string[]
  getDefaultErrors: string[]
  readBackExportErrors: string[]
  readBackUsda: string
}

const cases = (JSON.parse(readFileSync(
  new URL('./fixtures/crateRelationshipDefault/expected.json', import.meta.url), 'utf8',
)).payload as { cases: Record<string, Case> }).cases

function codingErrors<T>(action: () => T): { result: T, errors: string[] } {
  const mark = new TfErrorMark()
  try {
    const result = action()
    const errors = mark.getErrors().map(error => {
      expect(error.getDiagnosticCode()).toBe(TfDiagnosticType.CodingError)
      return error.getCommentary()
    })
    mark.clear()
    return { result, errors }
  } finally {
    mark.dispose()
  }
}

describe('crate relationship default holding an SdfPath', () => {
  for (const [name, c] of Object.entries(cases)) {
    it(name, () => {
      const layer = Layer.createInMemory(`${name}.usda`, c.text)
      const usdc = codingErrors(() => layer.toUsdc())
      expect(usdc.errors).toEqual(c.exportErrors)

      const crate = Layer.fromBytes(usdc.result, `${name}.usdc`)
      expect(crate.getFieldNames(c.relationship)).toContain('default')
      const value = codingErrors(() => crate.getField(c.relationship, 'default'))
      expect(value.result).toBeUndefined()
      expect(value.errors).toEqual(c.getDefaultErrors)

      const usda = codingErrors(() => crate.toUsda())
      expect(usda.result).toBe(c.readBackUsda)
    })
  }

  // Sdf_CrateData unpacks the value on every read, so writing the read-back
  // layer posts the unpack error again; our crate data caches the first read.
  it('posts the unpack error again when the read-back layer is written', () => {
    const c = cases.plain!
    const layer = Layer.createInMemory('plain.usda', c.text)
    const crate = Layer.fromBytes(codingErrors(() => layer.toUsdc()).result, 'plain.usdc')
    codingErrors(() => crate.getField(c.relationship, 'default'))
    expect(codingErrors(() => crate.toUsda()).errors).toEqual(c.readBackExportErrors)
  })
})
