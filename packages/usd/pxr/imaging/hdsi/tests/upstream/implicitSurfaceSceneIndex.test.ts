// Ported from OpenUSD 26.11.1: pxr/imaging/hdsi/implicitSurfaceSceneIndex.cpp
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdsiImplicitSurfaceSceneIndex (OpenUSD 26.11.1
// pxr/imaging/hdsi/implicitSurfaceSceneIndex.cpp) over the retained scene
// the fixtures/implicitSurfaceSceneIndex capture builds, configured as
// Storm's HdSt_ImplicitSurfaceSceneIndexPlugin configures it (every implicit
// type toMesh), with cone/cylinder axisToTransform, and with no arguments.
// OpenUSD has no testenv test for this scene index; expected values are
// captured from the OpenUSD 26.11.1 build (FIXTURES.md). Points are compared
// exactly (both sides are binary32 values).
import { describe, expect, it } from 'vitest'
import { Matrix4d as GfMatrix4d, Vec3d as GfVec3d, type Vec3f as GfVec3f } from 'typescript-usd/gf'
import {
  CapsuleSchema as HdCapsuleSchema,
  CapsuleSchemaTokens as HdCapsuleSchemaTokens,
  ConeSchema as HdConeSchema,
  ConeSchemaTokens as HdConeSchemaTokens,
  CubeSchema as HdCubeSchema,
  CylinderSchema as HdCylinderSchema,
  CylinderSchemaTokens as HdCylinderSchemaTokens,
  DependenciesSchema as HdDependenciesSchema,
  MeshSchema as HdMeshSchema,
  PlaneSchema as HdPlaneSchema,
  PlaneSchemaTokens as HdPlaneSchemaTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SphereSchema as HdSphereSchema,
  XformSchema as HdXformSchema,
  type ContainerDataSource as HdContainerDataSource,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { Array as VtArray } from 'typescript-usd/vt'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import {
  HdsiImplicitSurfaceSceneIndex,
  HdsiImplicitSurfaceSceneIndexTokens,
} from '../../src/implicitSurfaceSceneIndex.ts'

interface _Expected {
  path: string
  primType: string
  schemas: string[]
  mesh?: {
    faceVertexCounts: number[]
    faceVertexIndices: number[]
    orientation: string
    subdivisionScheme: string
    doubleSided: boolean | null
  }
  points?: { role: string, interpolation: string, valueType: string, value: number[][] }
  matrix?: number[]
  dependencies: Record<string, {
    dependedOnPrimPath: string
    dependedOnDataSourceLocator: string | null
    affectedDataSourceLocator: string | null
  }> | null
}

const expected = readOracleFixture<Record<'toMesh' | 'axisToTransform' | 'noArgs', _Expected[]>>(
  new URL('./fixtures/implicitSurfaceSceneIndex/expected.json', import.meta.url))

const D = (v: number) => HdRetainedTypedSampledDataSource.new<number>(v)
const T = (v: string) => HdRetainedTypedSampledDataSource.new<string>(v)
const B = (v: boolean) => HdRetainedTypedSampledDataSource.new<boolean>(v)
const C = (...entries: [string, HdContainerDataSource][]) =>
  HdRetainedContainerDataSource.new(entries.map(e => e[0]), entries.map(e => e[1]))

/** The capture's _Xform */
function _Xform(): HdContainerDataSource {
  const m = new GfMatrix4d(1.0)
  m.setTranslate(new GfVec3d(1.0, 2.0, 3.0))
  return new HdXformSchema.Builder()
    .setMatrix(HdRetainedTypedSampledDataSource.new<GfMatrix4d>(m))
    .build()
}

/** The capture's _Prims */
function _Prims(): { path: string, type: string, ds: HdContainerDataSource }[] {
  return [
    { path: '/Cube', type: HdPrimTypeTokens.cube, ds: C(
      [HdCubeSchema.getSchemaToken(), new HdCubeSchema.Builder().setSize(D(2.5)).build()]) },
    { path: '/CubeDefault', type: HdPrimTypeTokens.cube, ds: C() },
    { path: '/Sphere', type: HdPrimTypeTokens.sphere, ds: C(
      [HdSphereSchema.getSchemaToken(), new HdSphereSchema.Builder().setRadius(D(0.75)).build()]) },
    { path: '/SphereDefault', type: HdPrimTypeTokens.sphere, ds: C() },
    { path: '/Cone', type: HdPrimTypeTokens.cone, ds: C(
      [HdConeSchema.getSchemaToken(), new HdConeSchema.Builder().setRadius(D(0.4)).setHeight(D(1.5))
        .setAxis(T(HdConeSchemaTokens.Y)).build()],
      [HdXformSchema.getSchemaToken(), _Xform()]) },
    { path: '/ConeDefault', type: HdPrimTypeTokens.cone, ds: C() },
    { path: '/Cylinder', type: HdPrimTypeTokens.cylinder, ds: C(
      [HdCylinderSchema.getSchemaToken(), new HdCylinderSchema.Builder().setRadiusBottom(D(0.5))
        .setRadiusTop(D(0.25)).setHeight(D(3.0))
        .setAxis(T(HdCylinderSchemaTokens.X)).build()],
      [HdXformSchema.getSchemaToken(), _Xform()]) },
    { path: '/CylinderRadius', type: HdPrimTypeTokens.cylinder, ds: C(
      [HdCylinderSchema.getSchemaToken(), new HdCylinderSchema.Builder().setRadius(D(0.6)).setHeight(D(1.0))
        .setAxis(T(HdCylinderSchemaTokens.Y)).build()]) },
    { path: '/CylinderDefault', type: HdPrimTypeTokens.cylinder, ds: C() },
    { path: '/Capsule', type: HdPrimTypeTokens.capsule, ds: C(
      [HdCapsuleSchema.getSchemaToken(), new HdCapsuleSchema.Builder().setRadius(D(0.3)).setHeight(D(1.0))
        .setAxis(T(HdCapsuleSchemaTokens.Y)).build()]) },
    { path: '/CapsuleTapered', type: HdPrimTypeTokens.capsule, ds: C(
      [HdCapsuleSchema.getSchemaToken(), new HdCapsuleSchema.Builder().setRadiusBottom(D(0.5))
        .setRadiusTop(D(0.2)).setHeight(D(2.0))
        .setAxis(T(HdCapsuleSchemaTokens.X)).build()]) },
    { path: '/CapsuleDefault', type: HdPrimTypeTokens.capsule, ds: C() },
    { path: '/Plane', type: HdPrimTypeTokens.plane, ds: C(
      [HdPlaneSchema.getSchemaToken(), new HdPlaneSchema.Builder().setWidth(D(3.0)).setLength(D(2.0))
        .setAxis(T(HdPlaneSchemaTokens.Y))
        .setDoubleSided(B(true)).build()]) },
    { path: '/PlaneDefault', type: HdPrimTypeTokens.plane, ds: C() },
    { path: '/Mesh', type: HdPrimTypeTokens.mesh, ds: C() },
  ]
}

/** The capture's _Args */
function _Args(modes: [string, string][]): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(modes.map(m => m[0]), modes.map(m => T(m[1])))
}

const toMesh = HdsiImplicitSurfaceSceneIndexTokens.toMesh
const axisToTransform = HdsiImplicitSurfaceSceneIndexTokens.axisToTransform
const args: Record<keyof typeof expected, HdContainerDataSource | undefined> = {
  toMesh: _Args([
    [HdPrimTypeTokens.cube, toMesh],
    [HdPrimTypeTokens.plane, toMesh],
    [HdPrimTypeTokens.sphere, toMesh],
    [HdPrimTypeTokens.cone, toMesh],
    [HdPrimTypeTokens.cylinder, toMesh],
    [HdPrimTypeTokens.capsule, toMesh]]),
  axisToTransform: _Args([
    [HdPrimTypeTokens.cone, axisToTransform],
    [HdPrimTypeTokens.cylinder, axisToTransform]]),
  noArgs: undefined,
}

/** The capture's _DumpPrim */
function _Dump(si: HdSceneIndexBase, path: string): _Expected {
  const prim = si.getPrim(path)
  const result: _Expected = { path, primType: prim.primType, schemas: [], dependencies: null }

  for (const name of [HdCubeSchema.getSchemaToken(), HdSphereSchema.getSchemaToken(),
    HdConeSchema.getSchemaToken(), HdCylinderSchema.getSchemaToken(),
    HdCapsuleSchema.getSchemaToken(), HdPlaneSchema.getSchemaToken()]) {
    if (prim.dataSource?.Get(name)) result.schemas.push(name)
  }

  const mesh = HdMeshSchema.getFromParent(prim.dataSource)
  if (mesh.isDefined()) {
    const topo = mesh.GetTopology()
    result.mesh = {
      faceVertexCounts: [...topo.getFaceVertexCounts()!.getTypedValue(0)],
      faceVertexIndices: [...topo.getFaceVertexIndices()!.getTypedValue(0)],
      orientation: topo.getOrientation()!.getTypedValue(0),
      subdivisionScheme: mesh.getSubdivisionScheme()!.getTypedValue(0),
      doubleSided: mesh.getDoubleSided() ? mesh.getDoubleSided()!.getTypedValue(0) : null,
    }
  }

  const points = HdPrimvarsSchema.getFromParent(prim.dataSource)
    .getPrimvar(HdPrimvarsSchemaTokens.points)
  const pointsValue = points.getPrimvarValue()
  if (points.isDefined() && pointsValue) {
    const value = pointsValue.GetValue(0) as VtArray<GfVec3f>
    expect(value).toBeInstanceOf(VtArray)
    result.points = {
      role: points.getRole()!.getTypedValue(0),
      interpolation: points.getInterpolation()!.getTypedValue(0),
      valueType: value.getElementType()?.getTypeName() === 'GfVec3f' ? 'VtArray<GfVec3f>' : String(value.getElementType()?.getTypeName()),
      value: value.toArray().map(p => [p.get(0), p.get(1), p.get(2)]),
    }
  }

  const xform = HdXformSchema.getFromParent(prim.dataSource)
  const matrix = xform.getMatrix()
  if (xform.isDefined() && matrix) {
    result.matrix = [...matrix.getTypedValue(0).GetArray()]
  }

  const deps = HdDependenciesSchema.getFromParent(prim.dataSource)
  if (deps.isDefined()) {
    result.dependencies = {}
    for (const [name, dep] of deps.getEntries()) {
      result.dependencies[name] = {
        dependedOnPrimPath: dep.getDependedOnPrimPath()!.getTypedValue(0),
        dependedOnDataSourceLocator: dep.getDependedOnDataSourceLocator()?.getTypedValue(0).GetString() ?? null,
        affectedDataSourceLocator: dep.getAffectedDataSourceLocator()?.getTypedValue(0).GetString() ?? null,
      }
    }
  }
  return result
}

describe('HdsiImplicitSurfaceSceneIndex (native capture)', () => {
  for (const mode of ['toMesh', 'axisToTransform', 'noArgs'] as const) {
    describe(mode, () => {
      const retained = HdRetainedSceneIndex.new()
      retained.addPrims(_Prims().map(p => ({ primPath: p.path, primType: p.type, dataSource: p.ds })))
      const si = HdsiImplicitSurfaceSceneIndex.new(retained, args[mode])
      for (const prim of expected[mode]) {
        it(`${prim.path} becomes what OpenUSD makes of it`, () => {
          expect(_Dump(si, prim.path)).toEqual(prim)
        })
      }
    })
  }

  it('sends added implicit prims to observers as meshes', () => {
    const retained = HdRetainedSceneIndex.new()
    const si = HdsiImplicitSurfaceSceneIndex.new(retained, args.toMesh)
    const added: [string, string][] = []
    si.addObserver({
      primsAdded: (_s, entries) => { for (const e of entries) added.push([e.primPath, e.primType]) },
      primsRemoved: () => {},
      primsDirtied: () => {},
      primsRenamed: () => {},
    })
    retained.addPrims(_Prims().map(p => ({ primPath: p.path, primType: p.type, dataSource: p.ds })))
    // implicitSurfaceSceneIndex.cpp:1633-1680: every converted type is
    // announced as a mesh.
    expect(added).toEqual(expected.toMesh.map(p => [p.path, p.primType]))
  })
})
