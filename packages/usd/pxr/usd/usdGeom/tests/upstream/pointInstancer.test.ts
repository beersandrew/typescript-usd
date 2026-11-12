// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomPointInstancer.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdGeom/testenv/testUsdGeomPointInstancer.py (OpenUSD
// v26.11.1). Every expected value is the upstream test's own assertion; each
// case cites the .py lines it ports. The stages come from the testenv's
// testUsdGeomPointInstancer/ directory (instancer.usda, CubeModel.usda), copied
// unmodified into fixtures/testUsdGeomPointInstancer/ (Pixar, TOST 1.0
// license, https://openusd.org/license).
//
// The Python test references "CubeModel.usda" relative to its working
// directory (the testenv); this port references the copied fixture by its
// absolute path. UsdTimeCode.Default() maps to an undefined time and
// UsdTimeCode.EarliestTime() to its numeric value.
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, TimeCode as UsdTimeCode, type Prim } from 'typescript-usd/usd'
import {
  BBox3d as GfBBox3d, IsClose as GfIsClose, Matrix4d as GfMatrix4d, Range3d as GfRange3d,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec4d as GfVec4d, makeRotation,
} from 'typescript-usd/gf'
import { BBoxCache, PointInstancer, Xform, Xformable } from 'typescript-usd/usdGeom'

const fixture = (name: string): string => fileURLToPath(new URL(
  `./fixtures/testUsdGeomPointInstancer/${name}`, import.meta.url))

type V3 = [number, number, number]

// _AddCubeModel (py:14-18).
async function addCubeModel(stage: Stage, primPath: string): Promise<Prim> {
  const cubeRefPrim = stage.definePrim(primPath)
  await cubeRefPrim.getReferences().addReference(fixture('CubeModel.usda'))
  return cubeRefPrim
}

// _SetTransformComponentsAndIndices (py:20-32).
function setTransformComponentsAndIndices(instancer: PointInstancer, opts: {
  positions?: V3[]; scales?: V3[]; orientations?: number[][]; indices?: number[]
}): void {
  expect(opts.positions !== undefined).toBe(true)
  expect(opts.indices !== undefined).toBe(true)
  instancer.createPositionsAttr(opts.positions)
  instancer.createProtoIndicesAttr(opts.indices)
  if (opts.scales !== undefined) instancer.createScalesAttr(opts.scales)
  if (opts.orientations !== undefined) instancer.createOrientationsAttr(opts.orientations)
}

// _ValidateExtent (py:34-46).
function validateExtent(instancer: PointInstancer, expectedExtent: V3[]): void {
  expect(expectedExtent).toHaveLength(2)
  const extent = instancer.computeExtentAtTime(undefined, undefined)
  expect(extent).not.toBeNull()
  expect(extent!).toHaveLength(2)
  expect(GfIsClose(new GfVec3f(...extent![0]), new GfVec3f(...expectedExtent[0]!), 1e-6),
    `${extent![0]} vs ${expectedExtent[0]}`).toBe(true)
  expect(GfIsClose(new GfVec3f(...extent![1]), new GfVec3f(...expectedExtent[1]!), 1e-6),
    `${extent![1]} vs ${expectedExtent[1]}`).toBe(true)
}

function rows(m: GfMatrix4d): GfVec4d[] {
  return [0, 1, 2, 3].map(i => new GfVec4d(...[0, 1, 2, 3].map(j => m.getElement(i, j)) as
    [number, number, number, number]))
}

// _ValidateInstanceTransforms (py:48-62).
function validateInstanceTransforms(instancer: PointInstancer, expectedXforms: GfMatrix4d[]): void {
  const xforms = instancer.computeInstanceTransformsAtTime(undefined, undefined)
  expect(xforms).toHaveLength(expectedXforms.length)
  for (let i = 0; i < xforms.length; i++) {
    const xf = rows(xforms[i]!)
    const ex = rows(expectedXforms[i]!)
    for (let r = 0; r < 4; r++) {
      expect(GfIsClose(xf[r]!, ex[r]!, 1e-5), `xform ${i} row ${r}`).toBe(true)
    }
  }
}

const m4 = (...v: number[]): GfMatrix4d => new GfMatrix4d(...v)

describe('testUsdGeomPointInstancer', () => {
  let stage: Stage
  let instancer: PointInstancer

  // setUp (py:64-97).
  beforeEach(async () => {
    stage = Stage.createNew()
    instancer = PointInstancer.define(stage, '/MyPointInstancer')
    const prototypesPrim = stage.definePrim(`${instancer.path}/prototypes`)
    const prototypesPrimPath = prototypesPrim.path

    // A cube at the origin that is of length 1 in each dimension.
    const originCube = await addCubeModel(stage, `${prototypesPrimPath}/OriginCube`)

    // A cube at the origin with a scale xformOp that makes it of length 5 in
    // each dimension.
    const originScaledCube = await addCubeModel(stage, `${prototypesPrimPath}/OriginScaledCube`)
    new Xformable(originScaledCube).addScaleOp().set(new GfVec3f(5.0, 5.0, 5.0))

    // A cube with a translate xformOp that is of length 1 in each dimension.
    const translatedCube = await addCubeModel(stage, `${prototypesPrimPath}/TranslatedCube`)
    new Xformable(translatedCube).addTranslateOp().set(new GfVec3d(3.0, 6.0, 9.0))

    // A cube with a rotateZ xformOp that is of length 1 in each dimension.
    const rotatedCube = await addCubeModel(stage, `${prototypesPrimPath}/RotatedCube`)
    new Xformable(rotatedCube).addRotateZOp().set(45.0)

    instancer.createPrototypesRel().setTargets([
      originCube.path, originScaledCube.path, translatedCube.path, rotatedCube.path,
    ])
  })

  // test_ExtentOneOriginCubeInstance (py:99-112).
  it('test_ExtentOneOriginCubeInstance', () => {
    setTransformComponentsAndIndices(instancer, { positions: [[10.0, 15.0, 20.0]], indices: [0] })
    validateExtent(instancer, [[9.5, 14.5, 19.5], [10.5, 15.5, 20.5]])
  })

  // test_ExtentOneOriginScaledCubeInstance (py:114-128).
  it('test_ExtentOneOriginScaledCubeInstance', () => {
    setTransformComponentsAndIndices(instancer, { positions: [[20.0, 30.0, 40.0]], indices: [1] })
    validateExtent(instancer, [[17.5, 27.5, 37.5], [22.5, 32.5, 42.5]])
  })

  // test_ExtentOneTranslatedCubeInstance (py:130-144).
  it('test_ExtentOneTranslatedCubeInstance', () => {
    setTransformComponentsAndIndices(instancer, { positions: [[-2.0, -4.0, -6.0]], indices: [2] })
    validateExtent(instancer, [[0.5, 1.5, 2.5], [1.5, 2.5, 3.5]])
  })

  // test_ExtentOneRotatedCubeInstance (py:146-160).
  it('test_ExtentOneRotatedCubeInstance', () => {
    setTransformComponentsAndIndices(instancer, { positions: [[100.0, 100.0, 100.0]], indices: [3] })
    validateExtent(instancer, [[99.29289, 99.29289, 99.5], [100.70711, 100.70711, 100.5]])
  })

  // test_ExtentMultipleCubeInstances (py:162-185).
  it('test_ExtentMultipleCubeInstances', () => {
    setTransformComponentsAndIndices(instancer, {
      positions: [[-33.0, -33.0, 0.0], [0.0, 0.0, -44.0], [0.0, 222.0, 555.0], [66.0, 111.0, 11.0]],
      indices: [0, 1, 0, 1],
    })
    validateExtent(instancer, [[-33.5, -33.5, -46.5], [68.5, 222.5, 555.5]])
  })

  // test_InstanceTransformsAndExtentWithMaskedInstances (py:187-249).
  it('test_InstanceTransformsAndExtentWithMaskedInstances', () => {
    setTransformComponentsAndIndices(instancer, {
      positions: [[-2.5, -2.5, -2.5], [0.0, 0.0, 0.0], [2.5, 2.5, 2.5]],
      scales: [[1.0, 1.0, 1.0], [20.0, 20.0, 20.0], [1.0, 1.0, 1.0]],
      indices: [1, 0, 1],
    })

    let expectedXforms = [
      m4(5.0, 0.0, 0.0, 0.0,
        0.0, 5.0, 0.0, 0.0,
        0.0, 0.0, 5.0, 0.0,
        -2.5, -2.5, -2.5, 1.0),
      new GfMatrix4d().setScale(20.0),
      m4(5.0, 0.0, 0.0, 0.0,
        0.0, 5.0, 0.0, 0.0,
        0.0, 0.0, 5.0, 0.0,
        2.5, 2.5, 2.5, 1.0),
    ]
    validateInstanceTransforms(instancer, expectedXforms)
    validateExtent(instancer, [[-10.0, -10.0, -10.0], [10.0, 10.0, 10.0]])

    // Now de-activate some instances.
    instancer.deactivateId(1)

    expectedXforms = [
      m4(5.0, 0.0, 0.0, 0.0,
        0.0, 5.0, 0.0, 0.0,
        0.0, 0.0, 5.0, 0.0,
        -2.5, -2.5, -2.5, 1.0),
      m4(5.0, 0.0, 0.0, 0.0,
        0.0, 5.0, 0.0, 0.0,
        0.0, 0.0, 5.0, 0.0,
        2.5, 2.5, 2.5, 1.0),
    ]
    validateInstanceTransforms(instancer, expectedXforms)
    validateExtent(instancer, [[-5.0, -5.0, -5.0], [5.0, 5.0, 5.0]])
  })

  // test_BBoxCache (py:251-359).
  it('test_BBoxCache', async () => {
    const stage2 = Stage.createNew()

    const world = Xform.define(stage2, '/World')
    const parent = Xform.define(stage2, `${world.path}/parent`)
    const instancer2 = PointInstancer.define(stage2, `${parent.path}/MyPointInstancer`)
    // As py:263, the prototypes scope is defined on the setUp stage.
    const prototypesPrim = stage.definePrim(`${instancer2.path}/prototypes`)
    const prototypesPrimPath = prototypesPrim.path

    // A unit cube at the origin.
    const originCube = await addCubeModel(stage2, `${prototypesPrimPath}/OriginCube`)

    // A cube at the origin with a scale xformOp that makes it of length 5 in
    // each dimension.
    const originScaledCube = await addCubeModel(stage2, `${prototypesPrimPath}/OriginScaledCube`)
    new Xformable(originScaledCube).addScaleOp().set(new GfVec3f(5.0, 5.0, 5.0))

    // A unit cube with a translate xformOp.
    const translatedCube = await addCubeModel(stage2, `${prototypesPrimPath}/TranslatedCube`)
    new Xformable(translatedCube).addTranslateOp().set(new GfVec3d(3.0, 6.0, 9.0))

    // A unit cube with a rotateZ xformOp.
    const rotatedCube = await addCubeModel(stage2, `${prototypesPrimPath}/RotatedCube`)
    new Xformable(rotatedCube).addRotateZOp().set(45.0)

    instancer2.createPrototypesRel().setTargets([
      originCube.path, originScaledCube.path, translatedCube.path, rotatedCube.path,
    ])

    // Add transformations on the parent and the instancer itself.
    new Xformable(world.prim).addTranslateOp().set(new GfVec3d(2, 2, 2))
    new Xformable(parent.prim).addTranslateOp().set(new GfVec3d(7, 7, 7))
    new Xformable(instancer2.prim).addTranslateOp().set(new GfVec3d(11, 11, 11))

    const positions: V3[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]
    const indices = [0, 1, 2, 3]
    setTransformComponentsAndIndices(instancer2, { positions, indices })

    const bboxCache = new BBoxCache(UsdTimeCode.Default(), ['default'])

    const unitBox = new GfRange3d(new GfVec3d(-0.5, -0.5, -0.5), new GfVec3d(0.5, 0.5, 0.5))

    const worldxf = new GfMatrix4d().setTranslate(new GfVec3d(2, 2, 2))
    const parentxf = new GfMatrix4d().setTranslate(new GfVec3d(7, 7, 7))
    const instancerxf = new GfMatrix4d().setTranslate(new GfVec3d(11, 11, 11))

    const cubescale = new GfMatrix4d().setScale(new GfVec3d(5, 5, 5))
    const cubexlat = new GfMatrix4d().setTranslate(new GfVec3d(3, 6, 9))
    const cuberot = new GfMatrix4d().setRotate(makeRotation([0, 0, 1], 45))

    const cases: [number, GfMatrix4d][] = [
      [0, new GfMatrix4d(1)], // originCube
      [1, cubescale],         // originScaledCube
      [2, cubexlat],          // translatedCube
      [3, cuberot],           // rotatedCube
    ]

    const bbox = (m: GfMatrix4d): GfBBox3d => new GfBBox3d(unitBox, m)
    const expectBBox = (actual: GfBBox3d, expected: GfBBox3d, msg: string): void => {
      expect(actual.equals(expected), `${msg}: ${actual} != ${expected}`).toBe(true)
    }

    // scalar
    for (const [iid, cubexf] of cases) {
      expectBBox(bboxCache.computePointInstanceWorldBound(instancer2, iid),
        bbox(cubexf.getMultiply(instancerxf).getMultiply(parentxf).getMultiply(worldxf)), `world ${iid}`)
      expectBBox(bboxCache.computePointInstanceRelativeBound(instancer2, iid, world.prim),
        bbox(cubexf.getMultiply(instancerxf).getMultiply(parentxf)), `relative ${iid}`)
      expectBBox(bboxCache.computePointInstanceLocalBound(instancer2, iid),
        bbox(cubexf.getMultiply(instancerxf)), `local ${iid}`)
      expectBBox(bboxCache.computePointInstanceUntransformedBound(instancer2, iid),
        bbox(cubexf), `untransformed ${iid}`)
    }

    // vectorized
    bboxCache.computePointInstanceWorldBounds(instancer2, [0, 1, 2, 3])!.forEach((wbox, i) =>
      expectBBox(wbox, bbox(cases[i]![1].getMultiply(instancerxf).getMultiply(parentxf)
        .getMultiply(worldxf)), `world[] ${i}`))
    bboxCache.computePointInstanceRelativeBounds(instancer2, [0, 1, 2, 3], world.prim)!
      .forEach((wbox, i) => expectBBox(wbox, bbox(cases[i]![1].getMultiply(instancerxf)
        .getMultiply(parentxf)), `relative[] ${i}`))
    bboxCache.computePointInstanceLocalBounds(instancer2, [0, 1, 2, 3])!.forEach((wbox, i) =>
      expectBBox(wbox, bbox(cases[i]![1].getMultiply(instancerxf)), `local[] ${i}`))
    bboxCache.computePointInstanceUntransformedBounds(instancer2, [0, 1, 2, 3])!.forEach((wbox, i) =>
      expectBBox(wbox, bbox(cases[i]![1]), `untransformed[] ${i}`))
  })

  // test_ComputeInstancerCount (py:361-395).
  it('test_ComputeInstancerCount', async () => {
    const stage2 = (await Stage.open(fixture('instancer.usda')))!
    const unset = PointInstancer.get(stage2, '/UnsetIndices')
    const blocked = PointInstancer.get(stage2, '/BlockedIndices')
    const empty = PointInstancer.get(stage2, '/EmptyIndices')
    const timeSampled = PointInstancer.get(stage2, '/TimeSampledIndices')
    const timeSampledAndDefault = PointInstancer.get(stage2, '/TimeSampledAndDefaultIndices')

    const earliest = UsdTimeCode.EarliestTime().GetValue()
    const testTimeSamples: [PointInstancer, number, number][] = [
      [unset, earliest, 0],
      [blocked, earliest, 0],
      [empty, earliest, 0],
      [timeSampled, earliest, 3],
      [timeSampledAndDefault, earliest, 5]]
    const testDefaults: [PointInstancer, number][] = [
      [unset, 0],
      [blocked, 0],
      [empty, 0],
      [timeSampled, 0],
      [timeSampledAndDefault, 4]]

    for (const [schema, timeCode, expected] of testTimeSamples) {
      expect(schema.isValid()).toBe(true)
      expect(schema.getInstanceCount(timeCode), schema.path).toBe(expected)
    }
    for (const [schema, expected] of testDefaults) {
      expect(schema.isValid()).toBe(true)
      expect(schema.getInstanceCount(), schema.path).toBe(expected)
    }

    // PointInstancer(Usd.Prim()) is invalid and raises (py:389-395).
    const invalid = new PointInstancer(undefined)
    expect(invalid.isValid()).toBe(false)
    expect(() => invalid.getInstanceCount()).toThrow()
    expect(() => invalid.getInstanceCount(earliest)).toThrow()
  })

  // test_InstancerInVis (py:397-402).
  it('test_InstancerInVis', () => {
    const stage2 = Stage.createNew()
    const instancer2 = PointInstancer.define(stage2, '/Instance')
    instancer2.invisId(1, undefined)
    const spec = stage2.getRootLayer().getAttributeAtPath('/Instance.invisibleIds')!
    expect([...(spec.getDefaultValue() as Iterable<unknown>)].map(Number)).toEqual([1])
  })
})
