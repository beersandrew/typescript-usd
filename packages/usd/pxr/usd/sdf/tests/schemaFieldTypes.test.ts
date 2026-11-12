// Ported from OpenUSD 26.11.1: pxr/usd/sdf/schema.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd check: every SdfSchema field's typed fallback
// (SdfFieldDefinition.getTypedFallbackValue, the VtValue of
// SdfSchemaBase::FieldDefinition::GetFallbackValue, schema.cpp:88-92) holds
// the TfType the native build's fallback holds
// (fixtures/schemaFieldTypes/expected.json, FIXTURES.md). Native names are
// compared after the naming rule schema.ts's standardFieldValueTypes states:
// libc++'s inline namespace and default template arguments (allocator,
// less) are dropped, and a top-level type typescript-usd already names keeps
// that name (TfToken is token, long long is int64, VtArray<T> is '<T>[]').
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Schema as SdfSchema } from 'typescript-usd/sdf'

const native = (JSON.parse(readFileSync(new URL(
  './fixtures/schemaFieldTypes/expected.json', import.meta.url), 'utf8')) as {
  payload: { fields: Record<string, string | null>, VtValue: string }
}).payload

// Splits `a, b<c, d>, e` at its top-level commas.
function splitArgs(args: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '<') depth++
    else if (args[i] === '>') depth--
    else if (args[i] === ',' && depth === 0) {
      out.push(args.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(args.slice(start).trim())
  return out
}

function dropDefaults(name: string): string {
  const open = name.indexOf('<')
  if (open < 0) return name
  const args = splitArgs(name.slice(open + 1, name.lastIndexOf('>')))
    .filter(arg => !/^(allocator|less)</.test(arg))
    .map(dropDefaults)
  return `${name.slice(0, open)}<${args.join(', ')}>`
}

function topLevel(name: string): string {
  if (name === 'TfToken') return 'token'
  if (name === 'long long') return 'int64'
  const array = /^VtArray<(.*)>$/.exec(name)
  if (array) return `${topLevel(array[1]!)}[]`
  return name
}

const normalize = (name: string): string =>
  topLevel(dropDefaults(name.replaceAll('__1::', '')))

describe('SdfSchema typed field fallbacks', () => {
  const schema = SdfSchema.getInstance()
  const fields = Object.entries(native.fields)
    .filter(([name]) => schema.getFieldDefinition(name) !== undefined)

  it('covers the 26.11.1 standard fields', () => {
    for (const name of ['active', 'documentation', 'kind', 'specifier', 'timeSamples']) {
      expect(fields.map(([n]) => n)).toContain(name)
    }
  })

  for (const [name, type] of fields) {
    it(name, () => {
      const fallback = schema.getFieldDefinition(name)!.getTypedFallbackValue()
      if (type === null) {
        expect(fallback.IsEmpty()).toBe(true)
      } else {
        expect(fallback.getType().getTypeName()).toBe(normalize(type))
      }
    })
  }
})
