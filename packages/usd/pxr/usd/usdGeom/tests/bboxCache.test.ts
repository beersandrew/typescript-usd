// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomBBoxCache.py,
//  pxr/usd/usdGeom/testenv/testUsdGeomPointInstancer.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd checks of UsdGeomBBoxCache surfaces testUsdGeomBBoxCache.py does
// not reach: point-instance bounds (the scenario of
// testUsdGeomPointInstancer.py test_BBoxCache, with the referenced CubeModel
// authored inline), bounds with overrides, base time, Clear and copying.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import {
  BBox3d as GfBBox3d, Matrix4d as GfMatrix4d, Range3d as GfRange3d, makeRotation,
  Vec3d as GfVec3d,
} from 'typescript-usd/gf'
import { BBoxCache, Imageable, Mesh, PointInstancer, Xform, XformCache } from 'typescript-usd/usdGeom'

const UNIT_CUBE_POINTS = [
  [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
  [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5],
]

// testUsdGeomPointInstancer/CubeModel.usda: a component Xform holding a unit
// cube mesh with an authored extent.
function addCubeModel(stage: Stage, path: string): Xform {
  const model = Xform.define(stage, path)
  model.prim.setKind('component')
  Xform.define(stage, `${path}/Geom`)
  const cube = Mesh.define(stage, `${path}/Geom/Cube`)
  cube.getExtentAttr().set([[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]])
  cube.getPointsAttr().set(UNIT_CUBE_POINTS)
  return model
}

function translate(x: number, y: number, z: number): GfMatrix4d {
  return new GfMatrix4d().setTranslate(new GfVec3d(x, y, z))
}

function expectBBoxClose(actual: GfBBox3d, expected: GfBBox3d): void {
  const a = actual.getRange(), e = expected.getRange()
  for (let i = 0; i < 3; i++) {
    expect(a.getMin().data[i]!).toBeCloseTo(e.getMin().data[i]!, 9)
    expect(a.getMax().data[i]!).toBeCloseTo(e.getMax().data[i]!, 9)
  }
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      expect(actual.getMatrix().getElement(i, j)).toBeCloseTo(expected.getMatrix().getElement(i, j), 9)
    }
  }
}

describe('UsdGeomBBoxCache point-instance bounds', () => {
  it('bounds each instance of each prototype in world, relative, local and untransformed space', () => {
    const stage = Stage.createNew()
    const world = Xform.define(stage, '/World')
    const parent = Xform.define(stage, '/World/parent')
    const instancer = PointInstancer.define(stage, '/World/parent/MyPointInstancer')
    const prototypesPath = '/World/parent/MyPointInstancer/prototypes'

    const originCube = addCubeModel(stage, `${prototypesPath}/OriginCube`)
    const originScaledCube = addCubeModel(stage, `${prototypesPath}/OriginScaledCube`)
    originScaledCube.addScaleOp().set([5, 5, 5])
    const translatedCube = addCubeModel(stage, `${prototypesPath}/TranslatedCube`)
    translatedCube.addTranslateOp().set([3, 6, 9])
    const rotatedCube = addCubeModel(stage, `${prototypesPath}/RotatedCube`)
    rotatedCube.addRotateZOp().set(45)
    instancer.prim.createRel('prototypes', [
      originCube.path, originScaledCube.path, translatedCube.path, rotatedCube.path,
    ])

    world.addTranslateOp().set([2, 2, 2])
    parent.addTranslateOp().set([7, 7, 7])
    instancer.addTranslateOp().set([11, 11, 11])
    instancer.getPositionsAttr().set([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]])
    instancer.getProtoIndicesAttr().set([0, 1, 2, 3])

    const bboxCache = new BBoxCache(undefined, ['default'])
    const unitBox = new GfRange3d(new GfVec3d(-0.5, -0.5, -0.5), new GfVec3d(0.5, 0.5, 0.5))
    const worldxf = translate(2, 2, 2)
    const parentxf = translate(7, 7, 7)
    const instancerxf = translate(11, 11, 11)
    const cases: GfMatrix4d[] = [
      new GfMatrix4d(1),
      new GfMatrix4d().setScale(5),
      translate(3, 6, 9),
      new GfMatrix4d().setRotate(makeRotation([0, 0, 1], 45)),
    ]

    cases.forEach((cubexf, iid) => {
      expectBBoxClose(bboxCache.computePointInstanceWorldBound(instancer, iid),
        new GfBBox3d(unitBox, cubexf.getMultiply(instancerxf).getMultiply(parentxf).getMultiply(worldxf)))
      expectBBoxClose(bboxCache.computePointInstanceRelativeBound(instancer, iid, world.prim),
        new GfBBox3d(unitBox, cubexf.getMultiply(instancerxf).getMultiply(parentxf)))
      expectBBoxClose(bboxCache.computePointInstanceLocalBound(instancer, iid),
        new GfBBox3d(unitBox, cubexf.getMultiply(instancerxf)))
      expectBBoxClose(bboxCache.computePointInstanceUntransformedBound(instancer, iid),
        new GfBBox3d(unitBox, cubexf))
    })

    const ids = [0, 1, 2, 3]
    bboxCache.computePointInstanceWorldBounds(instancer, ids)!.forEach((box, i) => expectBBoxClose(box,
      new GfBBox3d(unitBox, cases[i]!.getMultiply(instancerxf).getMultiply(parentxf).getMultiply(worldxf))))
    bboxCache.computePointInstanceRelativeBounds(instancer, ids, world.prim)!.forEach((box, i) =>
      expectBBoxClose(box, new GfBBox3d(unitBox, cases[i]!.getMultiply(instancerxf).getMultiply(parentxf))))
    bboxCache.computePointInstanceLocalBounds(instancer, ids)!.forEach((box, i) =>
      expectBBoxClose(box, new GfBBox3d(unitBox, cases[i]!.getMultiply(instancerxf))))
    bboxCache.computePointInstanceUntransformedBounds(instancer, ids)!.forEach((box, i) =>
      expectBBoxClose(box, new GfBBox3d(unitBox, cases[i]!)))
  })
})

describe('UsdGeomBBoxCache state', () => {
  it('defaults to no extents hint and honored visibility, as the C++ constructor does', () => {
    const cache = new BBoxCache(undefined, ['default'])
    expect(cache.getUseExtentsHint()).toBe(false)
    expect(cache.getIgnoreVisibility()).toBe(false)
    expect(cache.getTime().isDefault()).toBe(true)
  })

  it('base time falls back to the cache time until set, and clears back', () => {
    const cache = new BBoxCache(4, ['default'])
    expect(cache.hasBaseTime()).toBe(false)
    expect(cache.getBaseTime().GetValue()).toBe(4)
    cache.setBaseTime(2)
    expect(cache.hasBaseTime()).toBe(true)
    expect(cache.getBaseTime().GetValue()).toBe(2)
    cache.setTime(8)
    expect(cache.getBaseTime().GetValue()).toBe(2)
    cache.clearBaseTime()
    expect(cache.hasBaseTime()).toBe(false)
    expect(cache.getBaseTime().GetValue()).toBe(8)
  })

  it('clear() drops cached bounds so authored changes are picked up', () => {
    const stage = Stage.createNew()
    const mesh = addCubeModel(stage, '/M')
    const cache = new BBoxCache(undefined, ['default'])
    const before = cache.computeWorldBound(mesh.prim).ComputeAlignedRange()
    expect(before.getMax().data).toEqual([0.5, 0.5, 0.5])
    mesh.addScaleOp().set([2, 2, 2])
    // Unvarying entries stay cached until cleared.
    expect(cache.computeWorldBound(mesh.prim).getRange().getMax().data).toEqual([0.5, 0.5, 0.5])
    cache.clear()
    expect(cache.computeWorldBound(mesh.prim).ComputeAlignedRange().getMax().data).toEqual([1, 1, 1])
  })

  it('a copy keeps the cached entries and settings independently', () => {
    const stage = Stage.createNew()
    const model = addCubeModel(stage, '/M')
    const cache = new BBoxCache(undefined, ['default'], true, true)
    const bound = cache.computeWorldBound(model.prim)
    const copy = new BBoxCache(cache)
    expect(copy.getUseExtentsHint()).toBe(true)
    expect(copy.getIgnoreVisibility()).toBe(true)
    expect(copy.computeWorldBound(model.prim).equals(bound)).toBe(true)
    copy.setIncludedPurposes(['guide'])
    expect(cache.getIncludedPurposes()).toEqual(['default'])
    expect(copy.computeWorldBound(model.prim).getRange().IsEmpty()).toBe(true)
  })

  it('extentsHint is consulted only on models, one (min, max) pair per purpose', () => {
    const stage = Stage.createNew()
    const root = Xform.define(stage, '/Root')
    root.prim.createAttr('extentsHint', [[-2, -2, -2], [2, 2, 2], [-3, -3, -3], [3, 3, 3]])
    addCubeModel(stage, '/Root/Cube')
    const hinted = new BBoxCache(undefined, ['default'], true)
    // Not a model: the hint is ignored.
    expect(hinted.computeWorldBound(root.prim).ComputeAlignedRange().getMax().data).toEqual([0.5, 0.5, 0.5])

    root.prim.setKind('component')
    hinted.clear()
    expect(hinted.computeWorldBound(root.prim).ComputeAlignedRange().getMax().data).toEqual([2, 2, 2])
    hinted.setIncludedPurposes(['render'])
    expect(hinted.computeWorldBound(root.prim).ComputeAlignedRange().getMax().data).toEqual([3, 3, 3])
    hinted.setIncludedPurposes(['proxy'])
    expect(hinted.computeWorldBound(root.prim).getRange().IsEmpty()).toBe(true)

    const unhinted = new BBoxCache(undefined, ['default'])
    expect(unhinted.computeWorldBound(root.prim).ComputeAlignedRange().getMax().data).toEqual([0.5, 0.5, 0.5])
  })

  it('computed purpose partitions bounds so included purposes are combined at query time', () => {
    const stage = Stage.createNew()
    Xform.define(stage, '/Root')
    addCubeModel(stage, '/Root/A')
    const guide = Xform.define(stage, '/Root/G')
    guide.getPurposeAttr().set('guide')
    addCubeModel(stage, '/Root/G/Inherits').addTranslateOp().set([10, 0, 0])
    const root = stage.getPrim('/Root')!
    const cache = new BBoxCache(undefined, ['default'])
    expect(cache.computeWorldBound(root).ComputeAlignedRange().getMax().data).toEqual([0.5, 0.5, 0.5])
    cache.setIncludedPurposes(['default', 'guide'])
    expect(cache.computeWorldBound(root).ComputeAlignedRange().getMax().data).toEqual([10.5, 0.5, 0.5])
    cache.setIncludedPurposes(['guide'])
    expect(cache.computeWorldBound(root).ComputeAlignedRange().getMin().data).toEqual([9.5, -0.5, -0.5])
  })

  it('UsdGeomImageable bound queries require a purpose', () => {
    const stage = Stage.createNew()
    const model = addCubeModel(stage, '/M')
    expect(() => new Imageable(model.prim, stage).computeWorldBound(undefined)).toThrow()
  })
})

describe('UsdGeomBBoxCache bounds with overrides', () => {
  it('skips paths and applies CTM overrides in the queried prim\'s space', () => {
    const stage = Stage.createNew()
    const root = Xform.define(stage, '/Root')
    root.addTranslateOp().set([100, 0, 0])
    addCubeModel(stage, '/Root/A')
    addCubeModel(stage, '/Root/B').addTranslateOp().set([5, 0, 0])
    const cache = new BBoxCache(undefined, ['default'])

    const skipB = cache.computeUntransformedBound(root.prim, ['/Root/B'], new Map())
    expect(skipB.ComputeAlignedRange().getMax().data).toEqual([0.5, 0.5, 0.5])

    const moveB = cache.computeUntransformedBound(root.prim, [], new Map([['/Root/B', translate(0, 7, 0)]]))
    expect(moveB.ComputeAlignedRange().getMax().data).toEqual([0.5, 7.5, 0.5])

    const worldBound = cache.computeWorldBoundWithOverrides(
      root.prim, ['/Root/B'], translate(1, 0, 0), new Map())
    expect(worldBound.ComputeAlignedRange().getMax().data).toEqual([1.5, 0.5, 0.5])
  })
})

describe('UsdGeomXformCache', () => {
  it('row-vector composition: child translation happens before parent rotation', () => {
    const stage = Stage.createNew()
    const root = Xform.define(stage, '/Root')
    root.addRotateXYZOp().set([0, 0, 90])
    const child = Xform.define(stage, '/Root/C')
    child.addTranslateOp().set([10, 0, 0])

    const m = new XformCache(stage).getLocalToWorldTransform('/Root/C')
    // Local origin (0,0,0) → translated to (10,0,0) → rotated to (0,10,0)
    expect(m[12]).toBeCloseTo(0, 5)
    expect(m[13]).toBeCloseTo(10, 5)
  })

  it('getParentToWorldTransform excludes the prim\'s own ops', () => {
    const stage = Stage.createNew()
    const root = Xform.define(stage, '/Root')
    root.addTranslateOp().set([5, 0, 0])
    const child = Xform.define(stage, '/Root/C')
    child.addTranslateOp().set([100, 0, 0])

    const cache = new XformCache(stage)
    expect(cache.getParentToWorldTransform('/Root/C')[12]).toBeCloseTo(5)
    expect(cache.getLocalToWorldTransform('/Root/C')[12]).toBeCloseTo(105)
  })
})
