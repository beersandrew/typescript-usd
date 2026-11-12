// Ported from OpenUSD 26.11.1: pxr/usd/sdf/textFileFormatParser.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Grammar conformance: the recursive-descent parser now REJECTS malformed
// USDA with a positioned parse error instead of silently swallow-and-advancing
// past it. Upstream's PEGTL grammar (textFileFormatParser.h) rejects malformed
// input with a located error; we mirror the accept/reject direction for the
// common failure shapes. (Full PEGTL accept/reject parity is not yet proven —
// see the sdf faithfulness report's grammar-conformance row.)

import { describe, expect, it } from 'vitest'
import { parseUsda } from '../src/textFileFormatParser.ts'

const HEADER = '#usda 1.0\n'

describe('USDA parser — rejects malformed input with a positioned error', () => {
  it('throws on a missing #usda header', () => {
    expect(() => parseUsda('def "X" {\n}\n')).toThrow(/#usda/)
  })

  it('throws on an unterminated prim block', () => {
    expect(() => parseUsda(`${HEADER}def "X" {\n`)).toThrow()
  })

  it('throws on a bad token where a prim/attr is expected', () => {
    // '%%%' is neither a prim keyword, relation, reorder, comment, nor a
    // type-name + property declaration.
    expect(() => parseUsda(`${HEADER}def "X" {\n    %%% garbage\n}\n`)).toThrow()
  })

  it('throws on a type name with no following property name', () => {
    expect(() => parseUsda(`${HEADER}def "X" {\n    double = 3\n}\n`)).toThrow()
  })

  it('throws on a top-level statement that is not def/over/class/reorder', () => {
    expect(() => parseUsda(`${HEADER}wibble "X" {\n}\n`)).toThrow()
  })

  it('throws on reorder targeting an unknown bucket', () => {
    expect(() => parseUsda(`${HEADER}reorder bogus = ["a"]\n`)).toThrow(/rootPrims/)
  })

  it('throws on reorder nameChildren/properties with a wrong target', () => {
    expect(() => parseUsda(`${HEADER}def "X" {\n    reorder bogus = ["a"]\n}\n`))
      .toThrow(/nameChildren or properties/)
  })

  it('throws on an unterminated metadata block', () => {
    expect(() => parseUsda(`${HEADER}def "X" (\n    kind = "component"\n{\n}\n`)).toThrow()
  })

  it('rejects a scalar operand for a generic metadata list edit', () => {
    const source = `${HEADER}\nover "refSphere2" (\n    add reeferences = @HelloWorld.usda@\n)\n{\n}\n`
    expect(() => parseUsda(source, 'invalidSyntax.usda')).toThrow(
      "invalidSyntax.usda:4:23: Expected None or [ at '@HelloWorld.usda@' in </refSphere2>",
    )
  })

  it('still accepts a well-formed file (sanity)', () => {
    const scene = parseUsda(`${HEADER}def Scope "X" {\n    double a = 1\n}\n`)
    expect(scene['/X']).toBeDefined()
  })
})
