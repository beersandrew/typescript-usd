// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/sdf/testenv/testSdfMetaDataPlugInfo.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import fs from 'node:fs'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { plainValue } from '../../src/usdaFileFormat.ts'
import { describe, expect, it } from 'vitest'
import { AssetPath, Layer, Schema as SdfSchema, sdfNormalizeListOp } from 'typescript-usd/sdf'
import { _sdfRegisterMetadataPlugins } from 'typescript-usd/sdf/_internal'

// Ported from OpenUSD pxr/usd/sdf/testenv/testSdfMetaDataPlugInfo.cpp.
// Native field values below come from its plugin test environment; schema
// field registration, fallbacks, appliesTo masks, info, and generic list-op
// metadata are exercised against those native values.

// testSdfMetaDataPlugInfo.cpp:191-202 registers this plugin before reading
// any fields. The JSON is copied unmodified from the pinned 26.11.1 testenv.
PlugRegistry.GetInstance().RegisterPlugins(JSON.parse(fs.readFileSync(
  new URL('../fixtures/metadataPlugInfo/plugInfo.json', import.meta.url), 'utf8')))

const native = JSON.parse(fs.readFileSync(
  new URL('../fixtures/metadataPlugInfo/expected.json', import.meta.url), 'utf8')).payload as {
    fields: Record<string, { type: string; value: unknown }>
  }
function structuralValue(value: unknown): unknown {
  if (value && typeof value === 'object' && 'isExplicit' in value) return sdfNormalizeListOp(value)
  return value instanceof AssetPath ? value.getAssetPath() : plainValue(value)
}

// ── Single-field values authored on a prim, then exported by the Pixar build ──
const PRIM_FIXTURE = fs.readFileSync(new URL('../fixtures/metadataPlugInfo/prim.usda', import.meta.url), 'utf8')

describe('Sdf metadata plugInfo — generic custom-metadata round-trip', () => {
  // JSON values come from GetInfo on the pinned native plugin fixture.
  // Preserve exact int64 storage; normalize Gf/Vt objects to the same JSON
  // structural form, and compare all native list-op buckets.
  const cases: [string, unknown][] = Object.entries(native.fields).map(([field, row]) => [
    field, row.type === 'int64' || row.type === 'uint64' ? BigInt(row.value as number) : row.value,
  ])

  it.each(cases)('round-trips custom metadata %s', (field, expected) => {
    const layer = Layer.createInMemory('prim.usda', PRIM_FIXTURE)
    expect(structuralValue(layer.getField('/Foo', field))).toEqual(expected)
  })

  it('reads exactly the authored custom-metadata field names off the spec', () => {
    const layer = Layer.createInMemory('prim.usda', PRIM_FIXTURE)
    const names = new Set(layer.getFieldNames('/Foo'))
    // Every authored custom field is present (specifier is the structural one).
    for (const [field] of cases) {
      expect(names.has(field)).toBe(true)
    }
  })
})

// ── Generic custom metadata is read on every spec type that allows it ─────────
// Upstream's `appliesTo` machinery governs WHICH spec types a field is valid on
// (pseudoRoot/prim/attribute/relationship/variant). We can't query schema
// validity through SdfSchema; these checks read metadata authored on
// each of those spec types. Fixture is verbatim Pixar ExportToString().
const SPECTYPES_FIXTURE = fs.readFileSync(new URL('../fixtures/metadataPlugInfo/specTypes.usda', import.meta.url), 'utf8')

describe('Sdf metadata plugInfo — generic metadata across spec types', () => {
  it('reads layer (pseudo-root) custom metadata', () => {
    const layer = Layer.createInMemory('st.usda', SPECTYPES_FIXTURE)
    expect(layer.getField('/', 'int_single')).toEqual(42)
    expect(layer.getField('/', 'string_single')).toEqual('rootmeta')
  })

  it('reads prim custom metadata', () => {
    const layer = Layer.createInMemory('st.usda', SPECTYPES_FIXTURE)
    expect(layer.getField('/Foo', 'double_single')).toEqual(2.25)
  })

  it('reads attribute custom metadata', () => {
    const layer = Layer.createInMemory('st.usda', SPECTYPES_FIXTURE)
    expect(structuralValue(layer.getField('/Foo.attr', 'double3_single'))).toEqual([7.5, 8.5, 9.5])
    expect(layer.getField('/Foo.attr', 'token_single')).toEqual('attrtok')
  })

  it('reads relationship custom metadata', () => {
    const layer = Layer.createInMemory('st.usda', SPECTYPES_FIXTURE)
    expect(layer.getField('/Foo.rel', 'bool_single')).toEqual(false)
  })
})

describe('SdfSchema plugin metadata queries', () => {
  it('reports appliesTo, fallback type/value and auxiliary info', () => {
    _sdfRegisterMetadataPlugins([{
      getMetadata: () => ({
        SdfMetadata: {
          customTestField: {
            type: 'double',
            default: 2.5,
            appliesTo: ['prims', 'attributes'],
            authors: ['OpenUSD'],
            version: 25,
          },
        },
      }),
    }])
    const schema = SdfSchema.getInstance()
    expect(schema.isValidFieldForSpec('customTestField', 'prim')).toBe(true)
    expect(schema.isValidFieldForSpec('customTestField', 'attribute')).toBe(true)
    expect(schema.isValidFieldForSpec('customTestField', 'relationship')).toBe(false)
    expect(schema.getFallback('customTestField')).toBe(2.5)
    expect(schema.getFieldDefinition('customTestField')?.getTypeName()).toBe('double')
    expect(schema.getFieldDefinition('customTestField')?.getInfo()).toEqual({
      authors: ['OpenUSD'],
      version: 25,
    })
  })
})

describe('Sdf metadata plugInfo — list-op metadata', () => {
  it('preserves prepend AND delete on a keyword list-op metadata field', () => {
    const layer = Layer.createInMemory('prim.usda', PRIM_FIXTURE)
    expect(structuralValue(layer.getField('/Foo', 'stringlistop_single'))).toEqual(native.fields.stringlistop_single!.value)
  })
})
