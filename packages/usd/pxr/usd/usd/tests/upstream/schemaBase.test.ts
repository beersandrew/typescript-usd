// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdSchemaBase.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/usd/testenv/testUsdSchemaBase.cpp.
//
// Upstream's UsdSchemaBase is the common base for typed/API schema wrappers:
// it holds a Prim, exposes GetPrim()/GetPath()/GetStage() and a validity
// bool, and the registry-backed IsConcrete()/IsTyped()/IsAppliedAPISchema()
// queries. The cpp suite has two parts:
//   * TestEnsureParentCtorForCopying — exercises C++ object-slicing of a
//     derived schema assigned to its base; not meaningful in TypeScript (no
//     slicing), so we port the spirit: a derived schema preserves the prim
//     handle of the SchemaBase it was constructed from.
//   * TestPrimQueries — applies/removes UsdCollectionAPI through the Prim
//     API and queries HasAPI / HasAPIInFamily / FindSchemaInfo.
//
// The registry-backed classification methods describe the schema wrapper's
// compiled-in type, not the type of the wrapped prim. The live v26.05 oracle
// reports false/false/false for UsdSchemaBase itself.

import { readFileSync } from 'node:fs'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { describe, expect, it } from 'vitest'
import { Stage, SchemaBase, Typed, APISchemaBase } from 'typescript-usd/usd'

describe('SchemaBase construction over a prim (UsdSchemaBase(prim))', () => {
  it('wraps a prim and exposes prim / path / stage', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/p', 'Xform')

    const schema = new SchemaBase(prim, stage)
    expect(schema.prim).toBe(prim)
    expect(schema.path).toBe('/p')
    expect(schema.stage).toBe(stage)
    // GetPath() mirrors the wrapped prim's path.
    expect(schema.path).toBe(prim.path)
  })

  it('a derived schema preserves the base prim handle', () => {
    // Spirit of TestEnsureParentCtorForCopying: constructing a derived schema
    // from a SchemaBase keeps pointing at the same prim (no slicing/loss).
    class TestDerived extends SchemaBase {}

    const stage = Stage.createNew()
    const prim = stage.definePrim('/d', 'Xform')

    const base = new SchemaBase(prim, stage)
    const derived = new TestDerived(base.prim, base.stage)
    expect(derived.prim).toBe(base.prim)
    expect(derived.path).toBe(base.path)
    expect(derived.stage).toBe(base.stage)
  })

  it('exposes the protected typed-attr/rel authoring helpers to subclasses', () => {
    // The pattern every concrete schema uses: _attr registers a typed attr and
    // returns a handle; _rel returns a relationship handle.
    class GeomLike extends SchemaBase {
      createSize(value: number) {
        const a = this['_attr']('size', 'double')
        a.set(value)
        return a
      }
      createTargets() {
        return this['_rel']('proxyPrim')
      }
    }

    const stage = Stage.createNew()
    const prim = stage.definePrim('/g', 'Xform')
    const schema = new GeomLike(prim, stage)

    schema.createSize(2.0)
    expect(stage.get('/g.size')?.getValue()).toBeCloseTo(2.0)

    schema.createTargets().setTargets(['/g/Render'])
    expect(stage.getPrim('/g')).toBeDefined()
  })
})

describe('Applied API schema queries through the prim (TestPrimQueries)', () => {
  it('applies, queries, removes, and re-applies an instance-named API schema', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/p', 'Xform')

    // No schemas applied yet.
    expect(prim.getAppliedSchemas()).toEqual([])
    expect(prim.hasAPI('CollectionAPI:testColl')).toBe(false)

    // Apply UsdCollectionAPI with instance name "testColl". Upstream's registry
    // composes the full applied-schema name "CollectionAPI:testColl"; typescript-usd
    // takes that composed name directly. (Pixar usd-2605: GetAppliedSchemas() ->
    // ['CollectionAPI:testColl'].)
    prim.applyAPI('CollectionAPI:testColl')
    expect(prim.getAppliedSchemas()).toEqual(['CollectionAPI:testColl'])
    expect(prim.hasAPI('CollectionAPI:testColl')).toBe(true)

    // A different (non-existent) instance is not applied.
    expect(prim.hasAPI('CollectionAPI:nonExistentColl')).toBe(false)

    // Remove it.
    prim.removeAPI('CollectionAPI:testColl')
    expect(prim.getAppliedSchemas()).toEqual([])
    expect(prim.hasAPI('CollectionAPI:testColl')).toBe(false)

    // Re-apply through ApplyAPI.
    prim.applyAPI('CollectionAPI:testColl')
    expect(prim.getAppliedSchemas()).toEqual(['CollectionAPI:testColl'])
    expect(prim.hasAPI('CollectionAPI:testColl')).toBe(true)
  })

  it('apiSchemas apply in APPLY order (appended to the end of the prepends) and are idempotent', () => {
    // F1-C: this case previously gated the divergent newest-first order (and
    // used usdGeom/usdShade schema names, which this package cannot register).
    // Upstream AddAppliedSchema appends to the END of the prepend list
    // (prim.cpp:1115-1126), so applying A then B composes [A, B]; spelled
    // with core CollectionAPI instances, which the auto-registered usd core
    // plugin provides.
    const stage = Stage.createNew()
    const prim = stage.definePrim('/p', 'Xform')

    prim.applyAPI('CollectionAPI:a')
    expect(prim.getAppliedSchemas()).toEqual(['CollectionAPI:a'])

    // Idempotent.
    prim.applyAPI('CollectionAPI:a')
    expect(prim.getAppliedSchemas()).toEqual(['CollectionAPI:a'])

    // Appended to the end of the prepends — compose order is apply order.
    prim.applyAPI('CollectionAPI:b')
    expect(prim.getAppliedSchemas()).toEqual(['CollectionAPI:a', 'CollectionAPI:b'])
  })

  it('addAppliedSchema is an alias for applyAPI', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/p', 'Xform')
    prim.addAppliedSchema('CollectionAPI:testColl')
    expect(prim.hasAPI('CollectionAPI:testColl')).toBe(true)
  })
})

// ---- Registry-backed queries (SchemaBase instance shortcuts absent; the
// static UsdSchemaRegistry itself is real, see the last case below) --------

describe('schema-type registry queries', () => {
  it('SchemaBase.IsConcrete() / IsTyped() / IsAppliedAPISchema()', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/p', 'Xform')
    const schema = new SchemaBase(prim, stage)
    expect(schema.isConcrete()).toBe(false)
    expect(schema.isTyped()).toBe(false)
    expect(schema.isAppliedAPISchema()).toBe(false)
  })

  // operator bool() reports whether the wrapped prim is valid. typescript-usd's
  // SchemaBase has no validity bool and Prim has no isValid() — a prim
  // handle is just a (stage, path) pair (Pixar usd-2605: bool(SchemaBase())
  // is False, bool over a valid prim is True).
  it('SchemaBase validity bool over an invalid/empty prim', () => {
    const stage = Stage.createNew()
    const schema = new SchemaBase(undefined, stage)
    expect(schema.isValid()).toBe(false)
  })

  // HasAPI<Schema>() without an instance name does a *family* match across
  // all instances (prim.cpp:239-260); HasAPIInFamily matches across schema
  // versions with a VersionPolicy. FLIPPED at F1-C: self-promoted once the
  // registry-backed hasAPI/hasAPIInFamily landed on Prim.
  it('Prim.HasAPI(family) / HasAPIInFamily(VersionPolicy)', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/p', 'Xform')
    prim.applyAPI('CollectionAPI:testColl')
    // A family-only match (no instance name) finds the applied
    // instance-named schema under upstream's registry semantics.
    expect(prim.hasAPI('CollectionAPI')).toBe(true)
    expect(prim.hasAPIInFamily('CollectionAPI', 0, 'all')).toBe(true)
    expect(prim.hasAPIInFamily('CollectionAPI', 0, 'all', 'testColl')).toBe(true)
    expect(prim.hasAPIInFamily('CollectionAPI', 0, 'all', 'nonExistentColl')).toBe(false)
  })

  // UsdSchemaRegistry::FindSchemaInfo<Schema>() resolves a schema type to its
  // registry SchemaInfo (TfType, identifier, version). typescript-usd DOES have this
  // (src/schemaRegistry.ts), and typescript-usd/usd auto-registers the vendored core
  // schema plugin at import time (src/plugin/registerPlugin.ts), so core API
  // schemas like CollectionAPI resolve for real — this is genuinely ported,
  // just not through a per-instance SchemaBase method (see above).
  it('UsdSchemaRegistry.findSchemaInfo() resolves a registered core schema', async () => {
    const mod = await import('typescript-usd/usd') as unknown as {
      SchemaRegistry: { findSchemaInfo: (typeName: string) => { identifier: string; kind: string } | null }
    }
    const info = mod.SchemaRegistry.findSchemaInfo('CollectionAPI')
    expect(info).not.toBeNull()
    expect(info?.identifier).toBe('CollectionAPI')
    expect(info?.kind).toBe('multipleApplyAPI')
  })
})

describe('UsdTyped / UsdAPISchemaBase generated base classes', () => {
  it('UsdTyped.Get accepts typed prims and rejects untyped or missing prims', () => {
    const stage = Stage.createNew()
    // Use the vendored upstream example plugin's concrete UsdTyped subclass.
    const fixture = (name: string) => readFileSync(new URL(
      `./fixtures/codelessPortability/usdSchemaExamples/${name}`, import.meta.url), 'utf8')
    PlugRegistry.GetInstance().RegisterPlugins(
      JSON.parse(fixture('plugInfo.json').replace(/^\s*#.*$/gm, '')),
      { usdSchemaExamples: { 'generatedSchema.usda': fixture('generatedSchema.usda') } },
    )
    stage.definePrim('/Typed', 'ComplexPrim')
    stage.definePrim('/Untyped')

    expect(Typed.get(stage, '/Typed').isValid()).toBe(true)
    expect(Typed.get(stage, '/Untyped').isValid()).toBe(false)
    expect(Typed.get(stage, '/Missing').isValid()).toBe(false)
    expect(Typed.getSchemaAttributeNames()).toEqual([])
  })

  it('APISchemaBase provides the generated empty attribute-name surface', () => {
    class TestAPI extends APISchemaBase {
      static readonly typeName = 'ColorSpaceAPI'
    }
    const stage = Stage.createNew()
    const api = new TestAPI(stage.definePrim('/p'), stage)

    expect(TestAPI.getSchemaAttributeNames()).toEqual([])
    expect(api.isConcrete()).toBe(false)
    expect(api.isTyped()).toBe(false)
    expect(api.isAppliedAPISchema()).toBe(true)
  })
})
