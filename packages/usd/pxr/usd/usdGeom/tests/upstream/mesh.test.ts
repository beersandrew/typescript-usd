// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomMesh.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Tests for Mesh topology — faithful equivalent of testUsdGeomMesh.py.
// Covers attribute authoring/reading, subdivision scheme defaults, and type predicates.

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Mesh, Xform } from 'typescript-usd/usdGeom'

// ---- Test helpers ----

let tmpDir: string | null = null

function makeTmpDir(): string {
  if (!tmpDir) tmpDir = mkdtempSync(path.join(tmpdir(), 'usd-mesh-test-'))
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

// ---- Topology: faceVertexCounts / faceVertexIndices ----

describe('Mesh topology authoring and read-back', () => {
  it('Mesh.define then getFaceVertexCountsAttr round-trips authored value', () => {
    const stage = Stage.createNew()
    const mesh = Mesh.define(stage, '/Cube')
    mesh.getFaceVertexCountsAttr().set([4, 4, 4, 4, 4, 4])
    // Read back via the attr handle
    const val = mesh.getFaceVertexCountsAttr().get()
    expect(val).toEqual([4, 4, 4, 4, 4, 4])
  })

  it('Mesh.define then getFaceVertexIndicesAttr round-trips authored value', () => {
    const stage = Stage.createNew()
    const mesh = Mesh.define(stage, '/Tri')
    mesh.getFaceVertexIndicesAttr().set([0, 1, 2])
    expect(mesh.getFaceVertexIndicesAttr().get()).toEqual([0, 1, 2])
  })

  it('reads faceVertexCounts from USDA as Int32Array via static Mesh.getFaceVertexCounts', async () => {
    const p = writeUsda('mesh_counts.usda', `
def Mesh "Quad" {
  point3f[] points = [(0,0,0), (1,0,0), (1,1,0), (0,1,0)]
  int[] faceVertexCounts = [4]
  int[] faceVertexIndices = [0, 1, 2, 3]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Quad')!
    const counts = Mesh.getFaceVertexCounts(prim)
    expect(counts).toBeInstanceOf(Int32Array)
    expect(counts.length).toBe(1)
    expect(counts[0]).toBe(4)
  })

  it('reads faceVertexCounts from a multi-face mesh', async () => {
    const p = writeUsda('mesh_multiface.usda', `
def Mesh "Cube" {
  point3f[] points = [(0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1)]
  int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]
  int[] faceVertexIndices = [0,1,2,3, 4,5,6,7, 0,1,5,4, 2,3,7,6, 0,3,7,4, 1,2,6,5]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Cube')!
    const counts = Mesh.getFaceVertexCounts(prim)
    expect(counts.length).toBe(6)
    expect(Array.from(counts)).toEqual([4, 4, 4, 4, 4, 4])
  })
})

// ---- Subdivision scheme ----

describe('Mesh subdivision scheme', () => {
  it('GetSubdivisionSchemeAttr returns authored "none" value', async () => {
    const p = writeUsda('mesh_subdiv_none.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0)]
  int[] faceVertexCounts = [1]
  int[] faceVertexIndices = [0]
  token subdivisionScheme = "none"
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    // Read subdivisionScheme via the composed Prim attr API
    const val = prim.getAttr('subdivisionScheme')?.getValue()
    expect(val).toBe('none')
  })

  it('GetSubdivisionSchemeAttr returns authored "catmullClark" value', async () => {
    const p = writeUsda('mesh_subdiv_cc.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0)]
  int[] faceVertexCounts = [1]
  int[] faceVertexIndices = [0]
  token subdivisionScheme = "catmullClark"
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    const val = prim.getAttr('subdivisionScheme')?.getValue()
    expect(val).toBe('catmullClark')
  })

  it('Mesh.define sets "none" subdivisionScheme via attr authoring', () => {
    const stage = Stage.createNew()
    const mesh = Mesh.define(stage, '/M')
    mesh.getSubdivisionSchemeAttr().set('none')
    const val = mesh.getSubdivisionSchemeAttr().get()
    expect(val).toBe('none')
  })
})

// ---- Subdivision tags: token defaults + crease/corner/hole ----

describe('Mesh subdivision tag readers', () => {
  it('token readers fall back to the UsdGeomMesh schema defaults', async () => {
    // A mesh authoring none of the subdivision tags — every reader returns the
    // spec fallback (catmullClark / edgeAndCorner / cornersPlus1 / catmullClark).
    const p = writeUsda('mesh_subdiv_defaults.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0)]
  int[] faceVertexCounts = [1]
  int[] faceVertexIndices = [0]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    expect(Mesh.getSubdivisionScheme(prim)).toBe('catmullClark')
    expect(Mesh.getInterpolateBoundary(prim)).toBe('edgeAndCorner')
    expect(Mesh.getFaceVaryingLinearInterpolation(prim)).toBe('cornersPlus1')
    expect(Mesh.getTriangleSubdivisionRule(prim)).toBe('catmullClark')
  })

  it('token readers return authored values', async () => {
    const p = writeUsda('mesh_subdiv_tags.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0)]
  int[] faceVertexCounts = [1]
  int[] faceVertexIndices = [0]
  uniform token subdivisionScheme = "loop"
  uniform token interpolateBoundary = "edgeOnly"
  uniform token faceVaryingLinearInterpolation = "all"
  uniform token triangleSubdivisionRule = "smooth"
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    expect(Mesh.getSubdivisionScheme(prim)).toBe('loop')
    expect(Mesh.getInterpolateBoundary(prim)).toBe('edgeOnly')
    expect(Mesh.getFaceVaryingLinearInterpolation(prim)).toBe('all')
    expect(Mesh.getTriangleSubdivisionRule(prim)).toBe('smooth')
  })

  it('crease/corner/hole readers round-trip authored arrays', async () => {
    const p = writeUsda('mesh_subdiv_creases.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1)]
  int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]
  int[] faceVertexIndices = [0,1,2,3, 4,5,6,7, 0,1,5,4, 2,3,7,6, 0,3,7,4, 1,2,6,5]
  int[] creaseIndices = [0, 1, 2, 3]
  int[] creaseLengths = [4]
  float[] creaseSharpnesses = [2.0]
  int[] cornerIndices = [5]
  float[] cornerSharpnesses = [10.0]
  int[] holeIndices = [7]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    expect(Array.from(Mesh.getCreaseIndices(prim))).toEqual([0, 1, 2, 3])
    expect(Array.from(Mesh.getCreaseLengths(prim))).toEqual([4])
    expect(Array.from(Mesh.getCreaseSharpnesses(prim))).toEqual([2.0])
    expect(Array.from(Mesh.getCornerIndices(prim))).toEqual([5])
    expect(Array.from(Mesh.getCornerSharpnesses(prim))).toEqual([10.0])
    expect(Array.from(Mesh.getHoleIndices(prim))).toEqual([7])
  })

  it('crease/corner/hole readers return empty arrays when unauthored', async () => {
    const p = writeUsda('mesh_no_creases.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0)]
  int[] faceVertexCounts = [1]
  int[] faceVertexIndices = [0]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    expect(Mesh.getCreaseIndices(prim).length).toBe(0)
    expect(Mesh.getCreaseLengths(prim).length).toBe(0)
    expect(Mesh.getCreaseSharpnesses(prim).length).toBe(0)
    expect(Mesh.getCornerIndices(prim).length).toBe(0)
    expect(Mesh.getCornerSharpnesses(prim).length).toBe(0)
    expect(Mesh.getHoleIndices(prim).length).toBe(0)
  })
})

// ---- Mesh.is type predicate ----

describe('Mesh.is() type predicate', () => {
  it('returns true for a prim defined as Mesh', async () => {
    const p = writeUsda('mesh_is_true.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0)]
  int[] faceVertexCounts = [1]
  int[] faceVertexIndices = [0]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    expect(Mesh.is(prim)).toBe(true)
  })

  it('returns false for a prim defined as Xform', async () => {
    const p = writeUsda('mesh_is_xform.usda', `
def Xform "World" {}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/World')!
    expect(Mesh.is(prim)).toBe(false)
  })

  it('returns false for a plain def with no type', async () => {
    const p = writeUsda('mesh_is_def.usda', `
def "Plain" {}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Plain')!
    expect(Mesh.is(prim)).toBe(false)
  })

  it('Xform.is() returns false for a Mesh prim', async () => {
    const p = writeUsda('mesh_xform_is.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0)]
  int[] faceVertexCounts = [1]
  int[] faceVertexIndices = [0]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    expect(Xform.is(prim)).toBe(false)
  })
})

// ---- getDoubleSidedAttr ----

describe('Mesh.getDoubleSidedAttr', () => {
  it('round-trips doubleSided = true', () => {
    const stage = Stage.createNew()
    const mesh = Mesh.define(stage, '/M')
    mesh.getDoubleSidedAttr().set(true)
    expect(mesh.getDoubleSidedAttr().get()).toBe(true)
  })

  it('round-trips doubleSided = false', () => {
    const stage = Stage.createNew()
    const mesh = Mesh.define(stage, '/M')
    mesh.getDoubleSidedAttr().set(false)
    expect(mesh.getDoubleSidedAttr().get()).toBe(false)
  })
})
