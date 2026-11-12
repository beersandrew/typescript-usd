// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdLod/testenv/testUsdLodDistanceHeuristic.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdLod/testenv/testUsdLodDistanceHeuristic.py
//
// As upstream, expected distances and LODs are computed in the test from the
// stage contents with Gf math (the Python helpers _expectedDistance0/1 and
// _expectedLOD0/1).
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, type Prim } from 'typescript-usd/usd'
import { Cube, Cylinder, Scope, Sphere, Xform, XformCache } from 'typescript-usd/usdGeom'
import {
  DistanceHeuristic, DistanceHeuristicQuery, HeuristicQuery,
} from 'typescript-usd/usdLod'
import { GfClamp, Matrix4d, Range3d, Vec3d, Vec3f } from 'typescript-usd/gf'

const LOD0_CENTER = new Vec3d(1.0, 0.0, 0.0)
const TRANSLATE_X = 3.0

type Queryable = DistanceHeuristic | DistanceHeuristicQuery

describe('TestUsdLodCoreApis', () => {
  let stage: Stage
  let lodRootPrim: Prim
  let distance_0: DistanceHeuristic
  let distance_1: DistanceHeuristic

  // Run before each test.
  beforeEach(() => {
    stage = Stage.createNew()
    Xform.define(stage, '/World')

    const lodRoot = Xform.define(stage, '/World/lodRoot')
    lodRootPrim = lodRoot.prim
    lodRoot.addTranslateXOp().set(TRANSLATE_X)

    const lodItems = [
      Sphere.define(stage, '/World/lodRoot/lodItem_0'),
      Cylinder.define(stage, '/World/lodRoot/lodItem_1'),
      Cube.define(stage, '/World/lodRoot/lodItem_2'),
    ]

    // UsdGeomImageable::CreateVisibilityAttr (uniform token visibility).
    const visValues = ['invisible', 'inherited', 'invisible']
    lodItems.forEach((lodItem, i) => {
      lodItem.prim.createAttribute('visibility', 'token', false, 'uniform').set(visValues[i])
    })

    Scope.define(stage, '/World/heuristics')

    // Create a couple of heuristics
    distance_0 = DistanceHeuristic.define(stage, '/World/heuristics/distance_0')
    distance_1 = DistanceHeuristic.define(stage, '/World/heuristics/distance_1')

    // Setup one for the proprietary "SomeRenderer" domain with a center, no
    // bounds relationship, and threshold values at 5 and 20 units.
    const domain0 = 'SomeRenderer'
    distance_0.createLodDomainAttr(domain0)
    distance_0.createCenterAttr(new Vec3f(LOD0_CENTER))
    distance_0.createThresholdsAttr([5.0, 20.0])

    // Setup one for the generic "imaging" domain with a bounds relationship
    // targeting the cube, a center value (that should be ignored due to the
    // bounds relationship), and blendThresholds for blending.
    const domain1 = 'imaging'
    distance_1.createLodDomainAttr(domain1)
    distance_1.createCenterAttr(new Vec3f(999.0, 0.0, 0.0))
    const boundsRel = distance_1.createBoundingVolumeRel()
    boundsRel.addTarget(lodItems[2]!.path)
    distance_1.createThresholdsAttr([5.0, 20.0])
    distance_1.createBlendThresholdsAttr([8.0, 25.0])
  })

  function _DoOneDistanceTest(
    title: string, queryable: Queryable, viewpoint: Vec3d, transform: Matrix4d,
    expectedDist: number, expectedLod: number,
  ): void {
    // Verify that we can compute distances and LODs with various call
    // signatures and with and without hysteresis.
    const hyst = 0.3

    const a0 = queryable.computeDistance(viewpoint, transform)
    const a1 = a0 + 0.25
    const a2 = a0 + 0.50

    const b0 = queryable.computeDistance(viewpoint, transform, a1, 0.0)
    const b1 = queryable.computeDistance(viewpoint, transform, a1, hyst)
    const b2 = queryable.computeDistance(viewpoint, transform, a2, hyst)
    const c0 = queryable.computeLOD(b0)
    const c1 = queryable.computeLOD(b1)
    const c2 = queryable.computeLOD(b2)

    const d = queryable.computeLOD(viewpoint, transform)

    const e0 = queryable.computeLOD(viewpoint, transform, a1, 0.0)
    const e1 = queryable.computeLOD(viewpoint, transform, a1, hyst)
    const e2 = queryable.computeLOD(viewpoint, transform, a2, hyst)

    // Use assertAlmostEqual to 6 places for comparisons between C++ and
    // Python computed values. Comparisons between C++ computed values are
    // exact.

    // Verify distances
    expect(a0, title).toBeCloseTo(expectedDist, 6)
    expect(b0, title).toBe(a0)
    expect(b1, title).toBe(a1)
    expect(b2, title).toBe(a0 + hyst) // trail a0 by hysteresis amt

    // Verify LODs
    expect(c0, title).toBeCloseTo(expectedLod, 6)
    expect(d, title).toBe(c0)
    expect(e0, title).toEqual([c0, b0])
    expect(e1, title).toEqual([c1, b1])
    expect(e2, title).toEqual([c2, b2])
  }

  it('test_DistanceHeuristic', () => {
    function _expectedDistance0(z: number): number {
      return Math.hypot(z, TRANSLATE_X + LOD0_CENTER.get(0))
    }

    function _expectedDistance1(z: number): number {
      // Distance is computed by the heuristic by transforming the viewpoint
      // into object space, finding the closest point on the extent volume,
      // then transforming both back to world coordinates and measuring the
      // distance.

      // These values need to match the contents of the stage created in
      // the setUp method.
      const extent = new Range3d(new Vec3d(-1), new Vec3d(1))
      const xform = new Matrix4d().setTranslate(new Vec3d(TRANSLATE_X, 0.0, 0.0))

      const viewpoint = new Vec3d(0.0, 0.0, z)

      // Transform the viewpoint into object space
      const invViewpoint = xform.getInverse().Transform(viewpoint) as Vec3d

      // Get the extent bounds
      const extMin = extent.getMin()
      const extMax = extent.getMax()

      // The closest point in the extent is simply the viewpoint clamped
      // to the bounds of the extent.
      const closest = new Vec3d(
        GfClamp(invViewpoint.get(0), extMin.get(0), extMax.get(0)),
        GfClamp(invViewpoint.get(1), extMin.get(1), extMax.get(1)),
        GfClamp(invViewpoint.get(2), extMin.get(2), extMax.get(2)))

      const worldClosest = xform.Transform(closest) as Vec3d

      return worldClosest.subtract(viewpoint).GetLength()
    }

    function _expectedLOD0(z: number, thresholds: number[]): number {
      const distance = _expectedDistance0(z)
      for (let i = 0; i < thresholds.length; i++) {
        if (distance < thresholds[i]!) return i
      }
      return thresholds.length
    }

    function _expectedLOD1(z: number, thresholds: number[], blendThresholds: number[]): number {
      const distance = _expectedDistance1(z)
      for (let i = 0; i < thresholds.length; i++) {
        const minDist = thresholds[i]!
        const maxDist = blendThresholds[i]!

        if (distance < minDist) return i
        if (distance < maxDist) return i + (distance - minDist) / (maxDist - minDist)
      }
      return thresholds.length
    }

    const cache = new XformCache()
    const rootToWorld = new Matrix4d(...cache.getLocalToWorldTransform(lodRootPrim))

    // Test the UsdLodDistanceHeuristicQuery
    const distQuery0 = distance_0.createDistanceHeuristicQuery()
    expect(distQuery0).toBeInstanceOf(HeuristicQuery)
    expect(distQuery0).toBeInstanceOf(DistanceHeuristicQuery)

    const distQuery1 = distance_1.createDistanceHeuristicQuery()
    expect(distQuery1).toBeInstanceOf(HeuristicQuery)
    expect(distQuery1).toBeInstanceOf(DistanceHeuristicQuery)

    for (let z = 0; z < 30; z++) {
      const viewpoint = new Vec3d(0.0, 0.0, z)

      const expDist0 = _expectedDistance0(z)
      const expLod0 = _expectedLOD0(z, [5.0, 20.0])

      const expDist1 = _expectedDistance1(z)
      const expLod1 = _expectedLOD1(z, [5.0, 20.0], [8.0, 25.0])

      _DoOneDistanceTest(`distance_0 z=${z}`, distance_0,
        viewpoint, rootToWorld, expDist0, expLod0)

      _DoOneDistanceTest(`distance_0 query z=${z}`, distQuery0,
        viewpoint, rootToWorld, expDist0, expLod0)

      _DoOneDistanceTest(`distance_1 z=${z}`, distance_1,
        viewpoint, rootToWorld, expDist1, expLod1)

      _DoOneDistanceTest(`distance_1 query z=${z}`, distQuery1,
        viewpoint, rootToWorld, expDist1, expLod1)
    }
  })
})
