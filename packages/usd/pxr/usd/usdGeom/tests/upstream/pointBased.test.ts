// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomComputeAtTime.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usdGeom/testenv/testUsdGeomPointBased.py and
// testUsdGeomComputeAtTime.py (ComputePointsAtTime semantics).
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { Array as VtArray } from 'typescript-usd/vt'
import { Stage } from 'typescript-usd/usd'
import { PointBased, Mesh } from 'typescript-usd/usdGeom'
import { Boundable } from '../../src/boundable.ts'

let tmpDir: string | null = null

function makeTmpDir(): string {
  if (!tmpDir) tmpDir = mkdtempSync(path.join(tmpdir(), 'usd-geom-pointbased-test-'))
  return tmpDir
}

function writeUsda(filename: string, content: string): string {
  const dir = makeTmpDir()
  const p = path.join(dir, filename)
  writeFileSync(p, `#usda 1.0\n${content}`)
  return p
}

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = null
  }
})

describe('UsdGeomPointBased', () => {
  describe('Points attribute', () => {
    it('authored points round-trip through GetPointsAttr()', async () => {
      const p = writeUsda('points.usda', `
def PointInstancer "PI" {
  point3f[] points = [(1,2,3), (4,5,6)]
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/PI')!
      const points = PointBased.getPoints(prim)
      expect(points).toBeInstanceOf(Float32Array)
      expect(Array.from(points)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('points at time t return the sample at that time', async () => {
      const p = writeUsda('points_time.usda', `
def PointInstancer "PI" {
  point3f[] points.timeSamples = {
    0: [(0,0,0)],
    10: [(10,20,30)],
  }
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/PI')!
      expect(Array.from(PointBased.getPoints(prim, 0))).toEqual([0, 0, 0])
      expect(Array.from(PointBased.getPoints(prim, 10))).toEqual([10, 20, 30])
    })

    it('GetPointCount returns the length of the points array', async () => {
      const p = writeUsda('point_count.usda', `
def PointInstancer "PI" {
  point3f[] points = [(0,0,0), (1,1,1), (2,2,2)]
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/PI')!
      expect(PointBased.getPointCount(prim)).toBe(3)
    })
  })

  describe('Normals', () => {
    it('authored normals round-trip through GetNormalsAttr()', async () => {
      const p = writeUsda('normals.usda', `
def PointInstancer "PI" {
  point3f[] points = [(0,0,0)]
  normal3f[] normals = [(0,0,1)]
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/PI')!
      const normals = prim.getAttr('normals')?.getValue()
      expect(normals).toBeInstanceOf(VtArray)
      expect(normals).toEqual([[0, 0, 1]])
    })

    it('GetNormalsInterpolation returns the authored interpolation token', async () => {
      const p = writeUsda('normals_interp.usda', `
def PointInstancer "PI" {
  point3f[] points = [(0,0,0)]
  normal3f[] normals = [(0,0,1)] (
    interpolation = "vertex"
  )
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/PI')!
      const interp = PointBased.getNormalsInterpolation(prim)
      expect(interp).toBe('vertex')
    })

    it('missing normals returns an empty array, not an error', async () => {
      const p = writeUsda('no_normals.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0)]
  int[] faceVertexCounts = [1]
  int[] faceVertexIndices = [0]
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/M')!
      // typescript-usd represents "no normals" as null rather than an empty typed
      // array, but critically it does not throw.
      const normals = Mesh.getNormals(prim)
      expect(normals === null || normals.length === 0).toBe(true)
    })
  })

  describe('Velocities / Accelerations', () => {
    it('authored velocities round-trip through GetVelocitiesAttr()', async () => {
      const p = writeUsda('velocities.usda', `
def PointInstancer "PI" {
  point3f[] points = [(0,0,0)]
  vector3f[] velocities = [(5,10,20)]
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/PI')!
      const velocities = PointBased.getVelocities(prim)
      expect(velocities).toBeInstanceOf(Float32Array)
      expect(Array.from(velocities!)).toEqual([5, 10, 20])
    })

    it('authored accelerations round-trip through GetAccelerationsAttr()', async () => {
      const p = writeUsda('accelerations.usda', `
def PointInstancer "PI" {
  point3f[] points = [(0,0,0)]
  vector3f[] accelerations = [(1,2,3)]
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/PI')!
      const accel = PointBased.getAccelerations(prim)
      expect(Array.from(accel!)).toEqual([1, 2, 3])
    })
  })

  describe('ComputePointsAtTime', () => {
    it('without velocities, returns the authored points at the given time', async () => {
      const p = writeUsda('cpat_no_velocities.usda', `
def PointInstancer "PI" {
  point3f[] points.timeSamples = {
    0: [(0,0,0)],
    1: [(5,10,20)],
  }
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/PI')!
      const pts = PointBased.computePointsAtTime(prim, 1, 1)
      expect(Array.from(pts)).toEqual([5, 10, 20])
    })

    it('with velocities, extrapolates position using v*dt when no sample exists at t', async () => {
      const p = writeUsda('cpat_velocities.usda', `
def PointInstancer "PI" {
  point3f[] points.timeSamples = {
    0: [(0,0,0)],
    1: [(0,0,0)],
  }
  vector3f[] velocities.timeSamples = {
    0: [(5,10,20)],
    1: [(5,10,20)],
  }
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/PI')!
      // Upstream divides velocity by timeCodesPerSecond (24 by default);
      // at dt=1s (24 frames) the point should move by exactly v.
      const pts = PointBased.computePointsAtTime(prim, 24, 0)
      expect(Array.from(pts)).toEqual([5, 10, 20])
    })

    it('with accelerations, applies quadratic motion between samples', async () => {
      const p = writeUsda('cpat_accelerations.usda', `
def PointInstancer "PI" {
  point3f[] points.timeSamples = {
    0: [(0,0,0)],
    1: [(0,0,0)],
  }
  vector3f[] velocities.timeSamples = {
    0: [(5,10,20)],
    1: [(5,10,20)],
  }
  vector3f[] accelerations.timeSamples = {
    0: [(1,1,1)],
    1: [(1,1,1)],
  }
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/PI')!
      const pts = PointBased.computePointsAtTime(prim, 24, 0)
      // p = v*dt + 0.5*a*dt^2 (dt in seconds = 1)
      expect(pts[0]).toBeCloseTo(5.5)
    })
  })

  describe('Extent', () => {
    it('ComputeExtent returns (min, max) bounding box of the points array', async () => {
      const p = writeUsda('compute_extent.usda', `
def Mesh "M" {
  point3f[] points = [(-1,-2,-3), (4,5,6), (0,0,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/M')!
      const extent = Boundable.computeExtent(prim)
      expect(extent).toEqual([[-1, -2, -3], [4, 5, 6]])
    })

    it('authored extent attribute overrides the computed extent', async () => {
      const p = writeUsda('authored_extent.usda', `
def Mesh "M" {
  point3f[] points = [(-1,-2,-3), (4,5,6), (0,0,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
  float3[] extent = [(-100, -100, -100), (100, 100, 100)]
}
`)
      const stage = (await Stage.open(p))!
      const prim = stage.getPrim('/M')!
      const extent = Boundable.computeExtent(prim)
      expect(extent).toEqual([[-100, -100, -100], [100, 100, 100]])
    })
  })
})
