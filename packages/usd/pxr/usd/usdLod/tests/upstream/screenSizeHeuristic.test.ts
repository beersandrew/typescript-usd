// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdLod/testenv/testUsdLodScreenSizeHeuristic.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdLod/testenv/testUsdLodScreenSizeHeuristic.py
//
// As upstream, expected screen sizes and LODs are computed in the test from
// the stage contents with Gf math (the Python helpers _expectedScreenSizes
// and _expectedLODs).
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, type Prim } from 'typescript-usd/usd'
import { Cube, Cylinder, Scope, Sphere, Xform, XformCache } from 'typescript-usd/usdGeom'
import {
  HeuristicQuery, ScreenSizeHeuristic, ScreenSizeHeuristicQuery,
} from 'typescript-usd/usdLod'
import {
  BBox3d, Frustum, GfProject, Matrix4d, Range3d, Vec3d, Vec4d,
} from 'typescript-usd/gf'

const CUBE_SIZE = 3.0
const THRESHOLDS = [0.25, 0.10]
const BLENDS = [0.20, 0.05]

type Queryable = ScreenSizeHeuristic | ScreenSizeHeuristicQuery
type Point2 = [number, number]

// Gf.IsClose(a, b, epsilon) on scalars: |a - b| < epsilon (gf/math.h).
function GfIsCloseScalar(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) < epsilon
}

// Gf.Lerp(alpha, Gf.Vec4d, Gf.Vec4d): (1-alpha)*a + alpha*b.
function lerp4d(alpha: number, a: Vec4d, b: Vec4d): Vec4d {
  return a.getScaled(1 - alpha).add(b.getScaled(alpha))
}

describe('TestUsdLodCoreApis', () => {
  let stage: Stage
  let lodRootPrim: Prim
  let heuristics: ScreenSizeHeuristic[]

  // Run before each test.
  beforeEach(() => {
    stage = Stage.createNew()
    Xform.define(stage, '/World')

    const lodRoot = Xform.define(stage, '/World/lodRoot')
    lodRootPrim = lodRoot.prim

    // Translate it so that one corner of the cube would be at the origin
    // extending back in -Z.
    lodRoot.addTranslateOp().set(new Vec3d(CUBE_SIZE / 2.0, CUBE_SIZE / 2.0, -CUBE_SIZE / 2.0))

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

    // UsdGeomCube::CreateSizeAttr (double size).
    const cube = lodItems[2]!
    cube.prim.createAttribute('size', 'double', false).set(CUBE_SIZE)

    Scope.define(stage, '/World/heuristics')

    // Create two size heuristics, one using projected sphere and one
    // using projected extent
    const methods = ['projectedSphere', 'projectedExtent']
    heuristics = []
    for (let i = 0; i < 2; i++) {
      const heuristic = ScreenSizeHeuristic.define(stage, `/World/heuristics/screenSize_${i}`)
      heuristic.createProjectionMethodAttr(methods[i])

      // Setup for the generic "imaging" domain with a bounds relationship
      // targeting the cube, and blendThresholds for blending.
      heuristic.createLodDomainAttr('imaging')
      const boundsRel = heuristic.createBoundingVolumeRel()
      boundsRel.addTarget(lodItems[2]!.path)
      heuristic.createExtentAttr()
      heuristic.createThresholdsAttr([0.25, 0.10])
      heuristic.createBlendThresholdsAttr([0.20, 0.05])

      heuristics.push(heuristic)
    }
  })

  function _DoOneScreenSizeTest(
    title: string, queryable: Queryable, frustum: Frustum, transform: Matrix4d,
    expectedSize: number, expectedLod: number,
  ): void {
    // Verify that we can compute screenSizes and LODs with various call
    // signatures and with and without hysteresis.
    const hyst = 0.1

    const a0 = queryable.computeScreenSize(frustum, transform)
    const a1 = a0 + 0.05
    const a2 = a0 + 0.25

    const b0 = queryable.computeScreenSize(frustum, transform, a1, 0.0)
    const b1 = queryable.computeScreenSize(frustum, transform, a1, hyst)
    const b2 = queryable.computeScreenSize(frustum, transform, a2, hyst)
    const c0 = queryable.computeLOD(b0)
    const c1 = queryable.computeLOD(b1)
    const c2 = queryable.computeLOD(b2)

    const d = queryable.computeLOD(frustum, transform)

    const e0 = queryable.computeLOD(frustum, transform, a1, 0.0)
    const e1 = queryable.computeLOD(frustum, transform, a1, hyst)
    const e2 = queryable.computeLOD(frustum, transform, a2, hyst)

    // Verify screenSizes
    expect(a0, `${title} frustum.position = ${frustum.position}`).toBeCloseTo(expectedSize, 6)
    expect(b0, title).toBe(a0)
    expect(b1, title).toBe(a1)
    expect(b2, title).toBe(a0 + hyst)

    // Verify LODs
    expect(c0, title).toBeCloseTo(expectedLod, 6)
    expect(d, title).toBe(c0)
    expect(e0, title).toEqual([c0, b0])
    expect(e1, title).toEqual([c1, b1])
    expect(e2, title).toEqual([c2, b2])
  }

  it('test_ScreenSizeHeuristic', () => {
    function _expectedScreenSizes(z: number): [number, number] {
      // Return a pair of sizes (sphereSize, extentSize).
      //
      // The default view frustum has a viewpoint at the origin, a window of
      // -1 .. +1, and a near plane at 1.0. The cube extends from the origin
      // to (3.0, 3.0, -3.0).
      const extent = new Range3d(new Vec3d(-1.5), new Vec3d(1.5))
      const xform = new Matrix4d().setTranslate(
        new Vec3d(CUBE_SIZE / 2, CUBE_SIZE / 2, -CUBE_SIZE / 2))

      const frustum = new Frustum()
      frustum.position = new Vec3d(0.0, 0.0, z)

      const planes = frustum.computePlanes()

      // Compute sphere size
      const worldMin = xform.Transform(extent.getMin()) as Vec3d
      const worldMax = xform.Transform(extent.getMax()) as Vec3d

      const worldCenter = worldMax.add(worldMin).getDivided(2)
      const worldRadius = worldMax.subtract(worldMin).GetLength() / 2

      // Check for trivial rejection
      let clipped = false
      let sphereSize = 0.0
      for (const plane of planes) {
        if (plane.getDistance(worldCenter) < -worldRadius) {
          clipped = true
          sphereSize = 0.0
          break
        }
      }

      if (!clipped) {
        const worldDistance = worldCenter.subtract(new Vec3d(0, 0, z)).GetLength()

        const radius = worldRadius / worldDistance
        const area = Math.PI * radius ** 2

        // The area of a perspective frustum window is 4
        sphereSize = area / 4
      }

      // Compute projected extent size

      // Trivial reject
      const bbox = new BBox3d(extent, xform)
      clipped = !frustum.intersects(bbox)

      if (clipped) {
        return [sphereSize, 0.0]
      }

      // At least part of the extent is visible.
      const ndcTransform = xform
        .getMultiply(frustum.computeViewMatrix())
        .getMultiply(frustum.computeProjectionMatrix())

      const clipCorners: Vec4d[] = []
      for (let i = 0; i < 8; i++) {
        const c = extent.getCorner(i) as Vec3d
        clipCorners.push(ndcTransform.multVecMatrix(new Vec4d(c.get(0), c.get(1), c.get(2), 1)) as Vec4d)
      }

      const edgeIndices: Array<[number, number]> = [
        [0, 1], [2, 3], [4, 5], [6, 7], // parallel to x-axis
        [0, 2], [1, 3], [4, 6], [5, 7], // parallel to y-axis
        [0, 4], [1, 5], [2, 6], [3, 7], // parallel to z-axis
      ]

      // If nearPlane * point < 0, the point is clipped by nearPlane
      const nearPlane = new Vec4d(0, 0, 1, 1)

      // Clip against the near plane.
      const outputPoints: Point2[] = []
      for (const [i, j] of edgeIndices) {
        const p0 = clipCorners[i]!
        const p1 = clipCorners[j]!

        let tMin = 0.0
        let tMax = 1.0

        const d0 = nearPlane.dot(p0)
        const d1 = nearPlane.dot(p1)

        if (d0 < 0 && d1 < 0) {
          continue
        } else if (d0 < 0 || d1 < 0) {
          const t = d0 / (d0 - d1)

          if (d0 < 0) tMin = Math.max(tMin, t)
          else tMax = Math.min(tMax, t)
        }

        const ndc0 = GfProject(lerp4d(tMin, p0, p1))
        const ndc1 = GfProject(lerp4d(tMax, p0, p1))

        // Store 2-tuples
        outputPoints.push([ndc0.get(0), ndc0.get(1)])
        outputPoints.push([ndc1.get(0), ndc1.get(1)])
      }

      // Sort the points (Python tuple ordering)
      outputPoints.sort((a, b) => (a[0] !== b[0] ? (a[0] < b[0] ? -1 : 1) : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))

      // Remove duplicates
      let i = 1
      while (i < outputPoints.length) {
        if (GfIsCloseScalar(outputPoints[i - 1]![0], outputPoints[i]![0], 1e-6) &&
            GfIsCloseScalar(outputPoints[i - 1]![1], outputPoints[i]![1], 1e-6)) {
          outputPoints.splice(i, 1)
        } else {
          i += 1
        }
      }

      // Project the shape and find its area
      // Compute the 2d cross product of (b - a) x (c - a)
      const cross = (a: Point2, b: Point2, c: Point2): number =>
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

      const lower: Point2[] = []
      for (const p of outputPoints) {
        while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
          lower.pop()
        }
        lower.push(p)
      }

      const upper: Point2[] = []
      for (const p of [...outputPoints].reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
          upper.pop()
        }
        upper.push(p)
      }

      // The first point of lower is repeated as the last point of upper.
      const hull = [...lower, ...upper.slice(1)]

      let area2 = 0
      for (let k = 0; k < hull.length - 1; k++) {
        area2 += hull[k]![0] * hull[k + 1]![1] - hull[k]![1] * hull[k + 1]![0]
      }

      // The area of the NDC space window is 4 and area2 is twice the area
      // so divide by 8 to get the covered fraction.
      const extentSize = area2 / 8

      return [sphereSize, extentSize]
    }

    function _expectedLODs(sizes: number[], thresholds: number[], blends: number[]): number[] {
      // Return a pair of LOD indices, one for each size in the sizes list.
      const lods: number[] = []
      for (const size of sizes) {
        let found = false
        for (let j = 0; j < thresholds.length; j++) {
          const threshold = thresholds[j]!
          const blend = j < blends.length ? blends[j] : undefined

          if (size > threshold) {
            lods.push(j)
            found = true
            break
          } else if (blend !== undefined && size > blend) {
            lods.push(j + (threshold - size) / (threshold - blend))
            found = true
            break
          }
        }
        if (!found) lods.push(thresholds.length)
      }
      return lods
    }

    const cache = new XformCache()
    const rootToWorld = new Matrix4d(...cache.getLocalToWorldTransform(lodRootPrim))

    // Test the UsdLodScreenSizeHeuristicQuery
    const queries: ScreenSizeHeuristicQuery[] = []
    for (const heuristic of heuristics) {
      const query = heuristic.createScreenSizeHeuristicQuery()
      expect(query).toBeInstanceOf(HeuristicQuery)
      expect(query).toBeInstanceOf(ScreenSizeHeuristicQuery)
      queries.push(query)
    }

    for (let z = 0; z < 30; z++) {
      const frustum = new Frustum()
      frustum.position = new Vec3d(0.0, 0.0, z)

      const expSizes = _expectedScreenSizes(z)
      const expLods = _expectedLODs(expSizes, THRESHOLDS, BLENDS)

      const projections = ['sphere', 'extent']

      for (let i = 0; i < 2; i++) {
        _DoOneScreenSizeTest(
          `screenSize_${i} (${projections[i]}) z=${z}`, heuristics[i]!,
          frustum, rootToWorld, expSizes[i]!, expLods[i]!)

        _DoOneScreenSizeTest(
          `screenSize_${i} query (${projections[i]}) z=${z}`, queries[i]!,
          frustum, rootToWorld, expSizes[i]!, expLods[i]!)
      }
    }
  })
})
