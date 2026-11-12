import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { evaluateXformOps, Mesh } from 'typescript-usd/usdGeom'
import { IDENTITY_MATRIX } from 'typescript-usd/gf'

// Helpers to build tiny in-memory USDA stages for testing
let tmpDir: string | null = null

function makeTmpDir(): string {
  if (!tmpDir) tmpDir = mkdtempSync(path.join(tmpdir(), 'usd-geom-test-'))
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

// ---- xformOp tests ----

describe('xform / evaluateXformOps', () => {
  it('returns identity for a prim with no xformOpOrder', async () => {
    const p = writeUsda('no_xform.usda', `
def Xform "Root" {}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Root')!
    const { matrix, resetsXformStack } = evaluateXformOps(prim)
    expect(matrix).toEqual(IDENTITY_MATRIX)
    expect(resetsXformStack).toBe(false)
  })

  it('applies a translate op', async () => {
    const p = writeUsda('translate.usda', `
def Xform "Root" {
  double3 xformOp:translate = (5, 10, 15)
  uniform token[] xformOpOrder = ["xformOp:translate"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    // Translation is in last row: [12]=5, [13]=10, [14]=15
    expect(matrix[12]).toBeCloseTo(5)
    expect(matrix[13]).toBeCloseTo(10)
    expect(matrix[14]).toBeCloseTo(15)
    // Diagonal should be identity-like
    expect(matrix[0]).toBeCloseTo(1)
    expect(matrix[5]).toBeCloseTo(1)
    expect(matrix[10]).toBeCloseTo(1)
  })

  it('applies a scale op', async () => {
    const p = writeUsda('scale.usda', `
def Xform "Root" {
  float3 xformOp:scale = (2, 3, 4)
  uniform token[] xformOpOrder = ["xformOp:scale"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    expect(matrix[0]).toBeCloseTo(2)
    expect(matrix[5]).toBeCloseTo(3)
    expect(matrix[10]).toBeCloseTo(4)
  })

  it('applies a rotateZ op (90°)', async () => {
    const p = writeUsda('rotatez.usda', `
def Xform "Root" {
  float xformOp:rotateZ = 90
  uniform token[] xformOpOrder = ["xformOp:rotateZ"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    // In row-vector math, (1,0,0) * M = (0,1,0) after 90° rotateZ
    // v' = [1,0,0,1] * M → v'x = M[0]=0, v'y = M[1]=1
    expect(matrix[0]).toBeCloseTo(0)   // M[0][0]
    expect(matrix[1]).toBeCloseTo(1)   // M[0][1]
    expect(matrix[4]).toBeCloseTo(-1)  // M[1][0]
    expect(matrix[5]).toBeCloseTo(0)   // M[1][1]
  })

  it('composes translate then scale (first op outermost, per upstream)', async () => {
    const p = writeUsda('compose.usda', `
def Xform "Root" {
  double3 xformOp:translate = (10, 0, 0)
  float3 xformOp:scale = (2, 2, 2)
  uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    // Upstream iterates xformOpOrder in reverse: points scale first, then
    // translate — translation stays unscaled. Pixar 25.08 reference:
    //   ((2,0,0,0),(0,2,0,0),(0,0,2,0),(10,0,0,1))
    expect(matrix[12]).toBeCloseTo(10)
    expect(matrix[0]).toBeCloseTo(2)
    expect(matrix[5]).toBeCloseTo(2)
    expect(matrix[10]).toBeCloseTo(2)
  })

  it('handles !resetXformStack! sentinel', async () => {
    const p = writeUsda('reset.usda', `
def Xform "Root" {
  double3 xformOp:translate = (5, 0, 0)
  uniform token[] xformOpOrder = ["!resetXformStack!", "xformOp:translate"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix, resetsXformStack } = evaluateXformOps(stage.getPrim('/Root')!)
    expect(resetsXformStack).toBe(true)
    // translate applied after reset
    expect(matrix[12]).toBeCloseTo(5)
  })

  it('handles !invert! prefix on a translate op', async () => {
    const p = writeUsda('invert.usda', `
def Xform "Root" {
  double3 xformOp:translate = (5, 10, 15)
  uniform token[] xformOpOrder = ["!invert!xformOp:translate"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    expect(matrix[12]).toBeCloseTo(-5)
    expect(matrix[13]).toBeCloseTo(-10)
    expect(matrix[14]).toBeCloseTo(-15)
  })

  it('applies rotateXYZ as Z-Y-X application order (Z most local)', async () => {
    const p = writeUsda('rotate_xyz.usda', `
def Xform "Root" {
  float3 xformOp:rotateXYZ = (0, 0, 90)
  uniform token[] xformOpOrder = ["xformOp:rotateXYZ"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    // Z-only rotation of 90° should match the single rotateZ op case.
    expect(matrix[0]).toBeCloseTo(0)
    expect(matrix[1]).toBeCloseTo(1)
    expect(matrix[4]).toBeCloseTo(-1)
    expect(matrix[5]).toBeCloseTo(0)
  })

  it('handles orient quaternion op', async () => {
    // 90° about Z: w=cos(45°), z=sin(45°)
    const c = Math.SQRT1_2
    const p = writeUsda('orient.usda', `
def Xform "Root" {
  quatf xformOp:orient = (${c}, 0, 0, ${c})
  uniform token[] xformOpOrder = ["xformOp:orient"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    expect(matrix[0]).toBeCloseTo(0)
    expect(matrix[1]).toBeCloseTo(1)
    expect(matrix[4]).toBeCloseTo(-1)
    expect(matrix[5]).toBeCloseTo(0)
  })

  it('handles transform (4x4 matrix) op', async () => {
    const p = writeUsda('transform_op.usda', `
def Xform "Root" {
  matrix4d xformOp:transform = ( (1,0,0,0), (0,1,0,0), (0,0,1,0), (7,8,9,1) )
  uniform token[] xformOpOrder = ["xformOp:transform"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    expect(matrix[12]).toBeCloseTo(7)
    expect(matrix[13]).toBeCloseTo(8)
    expect(matrix[14]).toBeCloseTo(9)
  })

  it('evaluates at a specific time from time-sampled op', async () => {
    const p = writeUsda('timesampled.usda', `
def Xform "Root" {
  double3 xformOp:translate.timeSamples = {
    0: (0, 0, 0),
    10: (10, 20, 30),
  }
  uniform token[] xformOpOrder = ["xformOp:translate"]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Root')!
    const at0 = evaluateXformOps(prim, 0)
    expect(at0.matrix[12]).toBeCloseTo(0)
    const at10 = evaluateXformOps(prim, 10)
    expect(at10.matrix[12]).toBeCloseTo(10)
    expect(at10.matrix[13]).toBeCloseTo(20)
    expect(at10.matrix[14]).toBeCloseTo(30)
  })
})

// ---- Mesh tests ----

describe('mesh / attribute extraction', () => {
  it('reads points as Float32Array', async () => {
    const p = writeUsda('mesh_points.usda', `
def Mesh "Plane" {
  point3f[] points = [(0,0,0), (1,0,0), (1,1,0), (0,1,0)]
  int[] faceVertexCounts = [4]
  int[] faceVertexIndices = [0, 1, 2, 3]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Plane')!
    const pts = Mesh.getPoints(prim)
    expect(pts).toBeInstanceOf(Float32Array)
    expect(pts.length).toBe(12)  // 4 points * 3 components
    expect(pts[0]).toBeCloseTo(0)
    expect(pts[3]).toBeCloseTo(1)  // second point x=1
  })

  it('reads faceVertexCounts and faceVertexIndices', async () => {
    const p = writeUsda('mesh_face.usda', `
def Mesh "Tri" {
  point3f[] points = [(0,0,0), (1,0,0), (0,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Tri')!
    const counts = Mesh.getFaceVertexCounts(prim)
    const indices = Mesh.getFaceVertexIndices(prim)
    expect(counts).toBeInstanceOf(Int32Array)
    expect(counts[0]).toBe(3)
    expect(indices).toBeInstanceOf(Int32Array)
    expect(Array.from(indices)).toEqual([0, 1, 2])
  })

  it('returns null for normals when not authored', async () => {
    const p = writeUsda('mesh_no_normals.usda', `
def Mesh "Plane" {
  point3f[] points = [(0,0,0), (1,0,0), (1,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Plane')!
    expect(Mesh.getNormals(prim)).toBeNull()
  })

  it('Mesh.is() returns true for Mesh typeName', async () => {
    const p = writeUsda('mesh_is.usda', `
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

  it('reads normals as Float32Array when authored', async () => {
    const p = writeUsda('mesh_normals.usda', `
def Mesh "Plane" {
  point3f[] points = [(0,0,0), (1,0,0), (1,1,0)]
  normal3f[] normals = [(0,0,1), (0,0,1), (0,0,1)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Plane')!
    const normals = Mesh.getNormals(prim)
    expect(normals).toBeInstanceOf(Float32Array)
    expect(normals!.length).toBe(9) // 3 normals * 3 components
    expect(normals![2]).toBeCloseTo(1)
  })

  it('reads primvars:st UVs with vertex interpolation', async () => {
    const p = writeUsda('mesh_uv_vertex.usda', `
def Mesh "Plane" {
  point3f[] points = [(0,0,0), (1,0,0), (1,1,0), (0,1,0)]
  int[] faceVertexCounts = [4]
  int[] faceVertexIndices = [0, 1, 2, 3]
  texCoord2f[] primvars:st = [(0,0), (1,0), (1,1), (0,1)] (
    interpolation = "vertex"
  )
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Plane')!
    const uvs = Mesh.getUVs(prim)
    expect(uvs).not.toBeNull()
    expect(uvs!.interpolation).toBe('vertex')
    expect(uvs!.indices).toBeNull()
    expect(Array.from(uvs!.data)).toEqual([0, 0, 1, 0, 1, 1, 0, 1])
  })

  it('reads primvars:st UVs with faceVarying interpolation and indices', async () => {
    const p = writeUsda('mesh_uv_facevarying.usda', `
def Mesh "Plane" {
  point3f[] points = [(0,0,0), (1,0,0), (1,1,0), (0,1,0)]
  int[] faceVertexCounts = [4]
  int[] faceVertexIndices = [0, 1, 2, 3]
  texCoord2f[] primvars:st = [(0,0), (1,0), (1,1), (0,1)] (
    interpolation = "faceVarying"
  )
  int[] primvars:st:indices = [0, 1, 2, 3]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Plane')!
    const uvs = Mesh.getUVs(prim)
    expect(uvs).not.toBeNull()
    expect(uvs!.interpolation).toBe('faceVarying')
    expect(uvs!.indices).toBeInstanceOf(Int32Array)
    expect(Array.from(uvs!.indices!)).toEqual([0, 1, 2, 3])
  })

  it('returns null for UVs when not authored', async () => {
    const p = writeUsda('mesh_no_uv.usda', `
def Mesh "Plane" {
  point3f[] points = [(0,0,0), (1,0,0), (1,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Plane')!
    expect(Mesh.getUVs(prim)).toBeNull()
  })

  it('reads extent as [[min],[max]] tuple', async () => {
    const p = writeUsda('mesh_extent.usda', `
def Mesh "Plane" {
  point3f[] points = [(0,0,0), (1,0,0), (1,1,0)]
  int[] faceVertexCounts = [3]
  int[] faceVertexIndices = [0, 1, 2]
  float3[] extent = [(0, 0, 0), (1, 1, 0)]
}
`)
    const stage = (await Stage.open(p))!
    const prim = stage.getPrim('/Plane')!
    const extent = Mesh.getExtent(prim)
    expect(extent).toEqual([[0, 0, 0], [1, 1, 0]])
  })
})
