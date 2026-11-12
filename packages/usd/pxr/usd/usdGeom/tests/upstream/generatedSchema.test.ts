// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomSchemata.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports of pxr/usd/usdGeom/testenv/testUsdGeomSchemata.py test_Schema
// (CreateXXXAttr authoring, py:284-309), test_Typed, test_Concrete,
// test_Apply and test_HasAPI (py:640-727), plus typescript-usd's check that
// every usdGeom schema class carries the members usdGenSchema generates for
// it (schemaClass.h/.cpp templates: Get/Create<Name>Attr for every schema
// attribute, Apply/CanApply for applied API schemas).
//
// The Apply-on-the-null-prim cases of test_Apply (py:676-680) are not
// ported: typescript-usd has no invalid Usd.Prim() handle to pass.

import { describe, expect, it } from 'vitest'
import {
  APISchemaBase, AttributeQuery, SchemaRegistry, Stage, Typed,
} from 'typescript-usd/usd'
import * as UsdGeom from 'typescript-usd/usdGeom'

describe('testUsdGeomSchemata', () => {
  it('test_Schema: CreateXXXAttr sparse and dense authoring', () => {
    const stage = Stage.createNew()
    const mesh = UsdGeom.Mesh.define(stage, '/Mesh')
    // Number 1: Sparse and non-sparse authoring on def'd prim
    mesh.createDoubleSidedAttr(false, true)
    expect(mesh.getDoubleSidedAttr().hasAuthoredValue()).toBe(false)
    mesh.createDoubleSidedAttr(false, false)
    expect(mesh.getDoubleSidedAttr().hasAuthoredValue()).toBe(true)

    // Number 2: Sparse authoring demotes to dense for non-defed prim
    const overMesh = new UsdGeom.Mesh(stage.overridePrim('/overMesh'))
    overMesh.createDoubleSidedAttr(false, true)
    expect(overMesh.getDoubleSidedAttr().hasAuthoredValue()).toBe(true)
    expect(overMesh.getDoubleSidedAttr().get()).toBe(false)
    overMesh.createDoubleSidedAttr(true, true)
    expect(overMesh.getDoubleSidedAttr().get()).toBe(true)
    // make it a defined mesh, and sanity check it still evals the same
    UsdGeom.Mesh.define(stage, '/overMesh')
    expect(overMesh.getDoubleSidedAttr().get()).toBe(true)

    // Check querying of fallback values.
    const sphere = UsdGeom.Sphere.define(stage, '/Sphere')
    const radius = sphere.getRadiusAttr()
    expect(radius.hasFallbackValue()).toBe(true)
    const radiusQuery = new AttributeQuery(radius)
    expect(radiusQuery.hasFallbackValue()).toBe(true)
  })

  it('test_Typed and test_Concrete', () => {
    expect(SchemaRegistry.isTyped(UsdGeom.Xform.typeName)).toBe(true)
    expect(SchemaRegistry.isTyped(UsdGeom.Imageable.typeName)).toBe(true)
    expect(SchemaRegistry.isTyped(UsdGeom.ModelAPI.typeName)).toBe(false)
    expect(SchemaRegistry.isConcrete(UsdGeom.Xform.typeName)).toBe(true)
    expect(SchemaRegistry.isConcrete(UsdGeom.Imageable.typeName)).toBe(false)
    expect(SchemaRegistry.isConcrete(UsdGeom.ModelAPI.typeName)).toBe(false)
  })

  it('test_Apply', () => {
    const s = Stage.createNew()
    const root = s.definePrim('/hello')
    expect(root.getAppliedSchemas()).toEqual([])

    // Check duplicates
    UsdGeom.MotionAPI.apply(root)
    expect(root.getAppliedSchemas()).toEqual(['MotionAPI'])
    UsdGeom.MotionAPI.apply(root)
    expect(root.getAppliedSchemas()).toEqual(['MotionAPI'])

    // Ensure duplicates aren't picked up
    UsdGeom.ModelAPI.apply(root)
    expect(root.getAppliedSchemas()).toEqual(['MotionAPI', 'GeomModelAPI'])
  })

  it('test_HasAPI', () => {
    const s = Stage.createNew()
    const prim = s.definePrim('/prim')
    const types = [UsdGeom.MotionAPI.typeName, UsdGeom.ModelAPI.typeName]

    // Check that no APIs have yet been applied
    for (const t of types) expect(prim.hasAPI(t)).toBe(false)

    // Apply our schemas to this prim
    expect(UsdGeom.ModelAPI.apply(prim).isValid()).toBe(true)
    expect(UsdGeom.MotionAPI.apply(prim).isValid()).toBe(true)

    // Check that all our applied schemas show up
    for (const t of types) expect(prim.hasAPI(t)).toBe(true)
  })
})

// usdGenSchema's members for every usdGeom schema class (schemaClass.h).
const schemaClasses = Object.entries(UsdGeom).filter(([, v]) =>
  typeof v === 'function' && (v.prototype instanceof Typed || v.prototype instanceof APISchemaBase),
) as [string, typeof Typed & { getSchemaAttributeNames(i?: boolean): string[] }][]

// The apiName overrides of pxr/usd/usdGeom/schema.usda (lines 610, 621,
// 2668, 2686).
const API_NAMES: Record<string, string> = {
  'primvars:displayColor': 'displayColor',
  'primvars:displayOpacity': 'displayOpacity',
  'motion:velocityScale': 'velocityScale',
  'motion:nonlinearSampleCount': 'nonlinearSampleCount',
}

// _ProperCase of an attribute's apiName (usdGenSchema.py:261); multiple-apply
// templates drop their __INSTANCE_NAME__ namespace (BackPlateAPI).
function accessorName(attrName: string): string {
  const base = API_NAMES[attrName] ?? attrName.replace(/^backPlate:__INSTANCE_NAME__:/, '')
  return base.split(/[^A-Za-z0-9_]+/).map(p => p[0]!.toUpperCase() + p.slice(1)).join('')
}

describe('usdGeom generated schema members', () => {
  it('covers every usdGeom schema class', () => {
    expect(schemaClasses.map(([name]) => name).sort()).toEqual([
      'BackPlateAPI', 'BasisCurves', 'Boundable', 'Camera', 'Capsule', 'Capsule_1', 'Cone',
      'Cube', 'Curves', 'Cylinder', 'Cylinder_1', 'Gprim', 'HermiteCurves', 'Imageable', 'Mesh',
      'ModelAPI', 'MotionAPI', 'NurbsCurves', 'NurbsPatch', 'Plane', 'PointBased',
      'PointInstancer', 'Points', 'PrimvarsAPI', 'Scope', 'Sphere', 'Subset', 'TetMesh',
      'VisibilityAPI', 'Xform', 'XformCommonAPI', 'Xformable',
    ])
  })

  it.each(schemaClasses)('%s has Get/Create<Name>Attr for each schema attribute', (_name, cls) => {
    for (const attr of cls.getSchemaAttributeNames(false)) {
      const proper = accessorName(attr)
      expect(typeof (cls.prototype as unknown as Record<string, unknown>)[`get${proper}Attr`], attr).toBe('function')
      expect(typeof (cls.prototype as unknown as Record<string, unknown>)[`create${proper}Attr`], attr).toBe('function')
    }
  })

  it('applied API schemas have Apply and CanApply; non-applied ones do not', () => {
    for (const cls of [UsdGeom.ModelAPI, UsdGeom.MotionAPI, UsdGeom.VisibilityAPI, UsdGeom.BackPlateAPI]) {
      expect(cls.prototype).toBeInstanceOf(APISchemaBase)
      expect(typeof cls.apply).toBe('function')
      expect(typeof cls.canApply).toBe('function')
    }
    for (const cls of [UsdGeom.PrimvarsAPI, UsdGeom.XformCommonAPI]) {
      expect(cls.prototype).toBeInstanceOf(APISchemaBase)
      // Only Function.prototype.apply: no generated static Apply.
      expect(cls.apply).toBe(Function.prototype.apply)
      expect('canApply' in cls).toBe(false)
    }
  })

  it('Camera: Create<Name>Attr authors the schema attribute', () => {
    const stage = Stage.createNew()
    const camera = UsdGeom.Camera.define(stage, '/camera')
    camera.createFocalLengthAttr(28)
    camera.createHorizontalApertureAttr(5.1)
    camera.createClippingRangeAttr([5, 15])
    camera.createProjectionAttr('orthographic')
    expect(camera.getFocalLengthAttr().get()).toBe(28)
    expect(camera.getHorizontalApertureAttr().get()).toBeCloseTo(5.1, 5)
    expect(camera.getProjectionAttr().get()).toBe('orthographic')
    expect(camera.getClippingRangeAttr().hasAuthoredValue()).toBe(true)
    expect(camera.getFocalLengthAttr().typeName).toBe('float')
  })

  it('ModelAPI: Create<Name>Attr for every model attribute', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Model')
    const model = UsdGeom.ModelAPI.apply(prim)
    model.createModelCardGeometryAttr('box')
    model.createModelDrawModeColorAttr([1, 0, 0])
    model.createModelCardTextureXPosAttr('tex.png')
    expect(model.getModelCardGeometryAttr().get()).toBe('box')
    expect(model.getModelCardGeometryAttr().getVariability()).toBe('uniform')
    expect(model.getModelCardTextureXPosAttr().typeName).toBe('asset')
  })
})
