// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomPrimvar.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Tests for primvar authoring on Mesh prims.
// Faithful equivalent of testUsdGeomPrimvar.py.
// Covers normals (primvars:normals) and displayColor round-trips via createAttr/getAttr.

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { Array as VtArray } from 'typescript-usd/vt'
import { Vec3f } from 'typescript-usd/gf'
import { Stage } from 'typescript-usd/usd'
import { Mesh } from 'typescript-usd/usdGeom'

// ---- Test helpers ----

let tmpDir: string | null = null

function makeTmpDir(): string {
  if (!tmpDir) tmpDir = mkdtempSync(path.join(tmpdir(), 'usd-primvar-test-'))
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

// ---- primvars:normals ----

describe('primvars:normals authoring', () => {
  it('createAttr primvars:normals round-trips value through getAttr', () => {
    const stage = Stage.createNew()
    const meshPrim = stage.definePrim('/M', 'Mesh')
    const normals = [[0, 1, 0], [0, 1, 0], [0, 1, 0]]
    meshPrim.createAttr('primvars:normals', normals)
    const readBack = meshPrim.attr('primvars:normals').get()
    expect(readBack).toEqual(normals)
  })

  it('normals authored via Mesh.define + getNormalsAttr are readable', () => {
    const stage = Stage.createNew()
    const mesh = Mesh.define(stage, '/M')
    const normals = [[0, 1, 0], [0, 1, 0], [0, 1, 0]]
    mesh.getNormalsAttr().set(normals)
    // Read back via the attr handle
    expect(mesh.getNormalsAttr().get()).toEqual(normals)
  })

  it('primvars:normals from USDA are read via Mesh.getNormals', async () => {
    const p = writeUsda('primvars_normals.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0), (1,0,0), (0,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
  normal3f[] primvars:normals = [(0,1,0), (0,1,0), (0,1,0)]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    const normals = Mesh.getNormals(prim)
    expect(normals).not.toBeNull()
    expect(normals).toBeInstanceOf(Float32Array)
    // 3 normals * 3 components = 9 floats
    expect(normals!.length).toBe(9)
    // First normal is (0,1,0)
    expect(normals![0]).toBeCloseTo(0)
    expect(normals![1]).toBeCloseTo(1)
    expect(normals![2]).toBeCloseTo(0)
  })

  it('primvars:normals takes precedence over normals when both authored', async () => {
    // USD spec: primvars:normals takes precedence over legacy normals
    const p = writeUsda('normals_precedence.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0), (1,0,0), (0,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
  normal3f[] normals = [(1,0,0), (1,0,0), (1,0,0)]
  normal3f[] primvars:normals = [(0,1,0), (0,1,0), (0,1,0)]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    const normals = Mesh.getNormals(prim)
    expect(normals).not.toBeNull()
    // Should get primvars:normals = (0,1,0), NOT legacy normals = (1,0,0)
    expect(normals![1]).toBeCloseTo(1)  // y component of first normal = 1
    expect(normals![0]).toBeCloseTo(0)  // x component of first normal = 0
  })
})

// ---- displayColor primvar ----

describe('displayColor primvar authoring', () => {
  it('createAttr primvars:displayColor round-trips value', () => {
    const stage = Stage.createNew()
    const meshPrim = stage.definePrim('/M', 'Mesh')
    const color = [[0.8, 0.2, 0.1]]
    meshPrim.createAttr('primvars:displayColor', color)
    const readBack = meshPrim.attr('primvars:displayColor').get()
    // The authored spec takes the schema type color3f[] (UsdStage::
    // _CreateNewSpecFromSchemaAttribute), so values are stored as floats.
    expect(readBack).toEqual(color.map(c => c.map(Math.fround)))
  })

  it('createAttr primvars:displayColor with multiple colors round-trips', () => {
    const stage = Stage.createNew()
    const meshPrim = stage.definePrim('/M', 'Mesh')
    const colors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    meshPrim.createAttr('primvars:displayColor', colors)
    const readBack = meshPrim.attr('primvars:displayColor').get()
    expect(readBack).toEqual(colors)
  })

  it('displayColor authored in USDA round-trips via getAttr', async () => {
    const p = writeUsda('displaycolor.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0), (1,0,0), (0,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
  color3f[] primvars:displayColor = [(0.8, 0.2, 0.1)]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    const attr = prim.getAttr('primvars:displayColor')
    expect(attr).toBeDefined()
    const val = attr!.getValue()
    expect(val).toBeInstanceOf(VtArray)
    const arr = val as VtArray<Vec3f>
    expect(arr.size).toBe(1)
    expect(arr.get(0)).toEqual(new Vec3f(0.8, 0.2, 0.1))
  })
})

// ---- primvars:st (UV) ----

describe('primvars:st UV authoring', () => {
  it('createAttr primvars:st round-trips UV value', () => {
    const stage = Stage.createNew()
    const meshPrim = stage.definePrim('/M', 'Mesh')
    const uvs = [[0, 0], [1, 0], [0, 1], [1, 1]]
    meshPrim.createAttr('primvars:st', uvs)
    const readBack = meshPrim.attr('primvars:st').get()
    expect(readBack).toEqual(uvs)
  })

  it('reads primvars:st from USDA as UVPrimvar via Mesh.getUVs', async () => {
    const p = writeUsda('uvs.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0), (1,0,0), (0,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
  texCoord2f[] primvars:st = [(0,0), (1,0), (0,1)]
  uniform token primvars:st:interpolation = "vertex"
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    const uvs = Mesh.getUVs(prim)
    expect(uvs).not.toBeNull()
    expect(uvs!.data).toBeInstanceOf(Float32Array)
    // 3 UV pairs * 2 components = 6 floats
    expect(uvs!.data.length).toBe(6)
    expect(uvs!.data[0]).toBeCloseTo(0)
    expect(uvs!.data[1]).toBeCloseTo(0)
    expect(uvs!.data[2]).toBeCloseTo(1)
    expect(uvs!.data[3]).toBeCloseTo(0)
    expect(uvs!.interpolation).toBe('vertex')
    expect(uvs!.indices).toBeNull()
  })

  it('reads interpolation from attribute METADATA (the standard USD form)', async () => {
    // Real USD assets author primvar interpolation as attribute metadata
    // `(interpolation = "...")`, not the sibling-attr form. The parser must
    // surface it through getField/Mesh.getUVs identically.
    const p = writeUsda('uvs_meta.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0), (1,0,0), (0,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
  texCoord2f[] primvars:st = [(0,0), (1,0), (0,1)] (
    interpolation = "faceVarying"
  )
  color3f[] primvars:displayColor = [(1,0,0), (0,1,0), (0,0,1)] (
    interpolation = "vertex"
  )
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    expect(prim.getAttr('primvars:st')?.getField('interpolation')).toBe('faceVarying')
    expect(prim.getAttr('primvars:displayColor')?.getField('interpolation')).toBe('vertex')
    expect(Mesh.getUVs(prim)!.interpolation).toBe('faceVarying')
  })

  it('returns null for UVs when primvars:st is not authored', async () => {
    const p = writeUsda('no_uvs.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0), (1,0,0), (0,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    expect(Mesh.getUVs(prim)).toBeNull()
  })

  it('reads faceVarying UVs with indices', async () => {
    const p = writeUsda('uvs_indexed.usda', `
def Mesh "M" {
  point3f[] points = [(0,0,0), (1,0,0), (0,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
  texCoord2f[] primvars:st = [(0,0), (1,0), (0,1)]
  int[] primvars:st:indices = [0, 1, 2]
  uniform token primvars:st:interpolation = "faceVarying"
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/M')!
    const uvs = Mesh.getUVs(prim)
    expect(uvs).not.toBeNull()
    expect(uvs!.interpolation).toBe('faceVarying')
    expect(uvs!.indices).not.toBeNull()
    expect(uvs!.indices).toBeInstanceOf(Int32Array)
    expect(Array.from(uvs!.indices!)).toEqual([0, 1, 2])
  })
})

// ---- Stage.definePrim + createAttr vs attr() ----

describe('Prim.createAttr vs attr() for primvars', () => {
  it('createAttr with value sets default immediately', () => {
    const stage = Stage.createNew()
    const meshPrim = stage.definePrim('/M', 'Mesh')
    meshPrim.createAttr('primvars:normals', [[0, 1, 0]])
    expect(meshPrim.attr('primvars:normals').get()).toEqual([[0, 1, 0]])
  })

  it('createAttr without value then set via attr() handle', () => {
    const stage = Stage.createNew()
    const meshPrim = stage.definePrim('/M', 'Mesh')
    meshPrim.createAttr('primvars:displayColor')
    meshPrim.attr('primvars:displayColor').set([[0.5, 0.5, 0.5]])
    expect(meshPrim.attr('primvars:displayColor').get()).toEqual([[0.5, 0.5, 0.5]])
  })
})
