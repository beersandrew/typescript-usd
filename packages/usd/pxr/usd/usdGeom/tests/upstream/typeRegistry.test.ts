// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomIsA.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomIsA.cpp — the schema
// type-name registry: concrete typed schemas, abstract typed schemas, and
// applied API schemas are distinguishable by their registered type name/alias.
//
// Upstream queries Usd.SchemaRegistry (TfType <-> schema-type-name aliasing)
// while the library is unloaded. F1-C: the schema registry is REAL now — the
// vendored usdGeom plugin registers at barrel import and the registry-backed
// kind/type queries below are upstream's own assertions; the typed-schema
// class surface (typeName alias, define) is kept as the TS-side complement.

import { describe, expect, it } from 'vitest'
import { Stage, SchemaRegistry as UsdSchemaRegistry } from 'typescript-usd/usd'
import { Mesh, Sphere, Boundable, Imageable } from 'typescript-usd/usdGeom'

describe('UsdGeomTypeRegistry', () => {
  it('concrete typed schemas: alias is the prim type a Define produces', () => {
    const stage = Stage.createNew()
    expect(Mesh.typeName).toBe('Mesh')
    expect(Sphere.typeName).toBe('Sphere')
    // Registry-backed: the schema type names resolve to registered CONCRETE
    // schemas (upstream Usd.SchemaRegistry.GetConcreteSchemaTypeName round trip).
    expect(UsdSchemaRegistry.isConcrete('Mesh')).toBe(true)
    expect(UsdSchemaRegistry.isConcrete('Sphere')).toBe(true)
    expect(UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName('Mesh').isUnknown()).toBe(false)
    expect(Mesh.define(stage, '/m').prim.typeName).toBe('Mesh')
    expect(Sphere.define(stage, '/s').prim.typeName).toBe('Sphere')
    expect(Mesh.is(stage.getPrim('/m')!)).toBe(true)
    expect(Sphere.is(stage.getPrim('/s')!)).toBe(true)
  })

  it('abstract typed schemas register no concrete type alias (cannot Define)', () => {
    // Boundable and Imageable are abstract bases — no `define`, so no prim is
    // ever of concrete type "Boundable"/"Imageable". As every generated schema
    // class, each carries its schema type name (usdGenSchema's
    // _GetStaticTfType counterpart), which names no concrete type.
    expect(UsdSchemaRegistry.isConcrete(Boundable.typeName)).toBe(false)
    expect('define' in Boundable).toBe(false)
    expect(UsdSchemaRegistry.isConcrete(Imageable.typeName)).toBe(false)
    expect('define' in Imageable).toBe(false)
    // Registry-backed: registered as ABSTRACT typed schemas, never concrete.
    expect(UsdSchemaRegistry.isAbstract('Boundable')).toBe(true)
    expect(UsdSchemaRegistry.isAbstract('Imageable')).toBe(true)
    expect(UsdSchemaRegistry.isConcrete('Boundable')).toBe(false)
    expect(UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName('Imageable').isUnknown()).toBe(true)
  })

  it('applied API schemas register a name on the prim, never a concrete type', () => {
    // F1-C: GetAppliedSchemas is the COMPOSED prim definition's list, in
    // which only APPLIED API schemas appear — PrimvarsAPI is a NON-applied
    // API schema (schemaKind nonAppliedAPI), so upstream never lists it;
    // the previous assertion gated the authored-listOp stand-in. MotionAPI
    // (single-apply) is the real applied-API case.
    expect(UsdSchemaRegistry.getSchemaKind('PrimvarsAPI')).toBe('nonAppliedAPI')
    expect(UsdSchemaRegistry.isAppliedAPISchema('PrimvarsAPI')).toBe(false)
    expect(UsdSchemaRegistry.isAppliedAPISchema('MotionAPI')).toBe(true)
    expect(UsdSchemaRegistry.isConcrete('MotionAPI')).toBe(false)

    const stage = Stage.createNew()
    const prim = stage.definePrim('/p', 'Mesh')
    // The concrete type is the typed schema; the API schema is applied on top.
    expect(prim.typeName).toBe('Mesh')
    prim.applyAPI('MotionAPI')
    expect(prim.getAppliedSchemas()).toContain('MotionAPI')
    // Applying an API schema does not change the concrete prim type.
    expect(prim.typeName).toBe('Mesh')
  })
})
