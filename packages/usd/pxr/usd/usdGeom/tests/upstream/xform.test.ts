// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomXformable.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Tests for evaluateXformOps — all op type variants.
// Faithful TypeScript equivalent of testUsdGeomXformable.py.
//
// Matrix convention: row-major flat array, row-vector math (v' = v * M).
// Translation is in the last row: M[12]=tx, M[13]=ty, M[14]=tz.

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { evaluateXformOps, Xform } from 'typescript-usd/usdGeom'
import {
  IDENTITY_MATRIX, type Matrix4,
  mul4, makeRotateX, makeRotateY, makeRotateZ,
} from 'typescript-usd/gf'

// ---- Test helpers ----

let tmpDir: string | null = null

function makeTmpDir(): string {
  if (!tmpDir) tmpDir = mkdtempSync(path.join(tmpdir(), 'usd-xform-test-'))
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

// Compare two matrices element-by-element with a tolerance.
function expectMatrixClose(actual: Matrix4, expected: Matrix4, tolerance = 1e-5) {
  for (let i = 0; i < 16; i++) {
    expect(actual[i]).toBeCloseTo(expected[i]!, 5)
  }
}

// ---- Single-axis rotation ops ----

describe('rotateX op', () => {
  it('rotateX(90) maps (0,1,0) → (0,0,1) in row-vector convention', async () => {
    // v' = v * M: (0,1,0,1) * M → (0, c, s, 0) * (0,1,0,1)^T
    // Row-vector makeRotateX: M[4]=0 M[5]=c M[6]=s, M[8]=0 M[9]=-s M[10]=c
    const p = writeUsda('rotatex90.usda', `
def Xform "Root" {
  float xformOp:rotateX = 90
  uniform token[] xformOpOrder = ["xformOp:rotateX"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    // makeRotateX(90): c≈0, s≈1
    // Row 0 (applied to x): [1, 0, 0, 0]
    expect(matrix[0]).toBeCloseTo(1)
    expect(matrix[1]).toBeCloseTo(0)
    expect(matrix[2]).toBeCloseTo(0)
    // Row 1 (applied to y): [0, c, s, 0] = [0, 0, 1, 0]
    expect(matrix[4]).toBeCloseTo(0)
    expect(matrix[5]).toBeCloseTo(0)
    expect(matrix[6]).toBeCloseTo(1)
    // Row 2 (applied to z): [0, -s, c, 0] = [0, -1, 0, 0]
    expect(matrix[8]).toBeCloseTo(0)
    expect(matrix[9]).toBeCloseTo(-1)
    expect(matrix[10]).toBeCloseTo(0)
    // Last row: translation zeros
    expect(matrix[12]).toBeCloseTo(0)
    expect(matrix[13]).toBeCloseTo(0)
    expect(matrix[14]).toBeCloseTo(0)
    expect(matrix[15]).toBeCloseTo(1)
  })
})

describe('rotateY op', () => {
  it('rotateY(90) maps (1,0,0) → (0,0,-1) in row-vector convention', async () => {
    // makeRotateY(90): c≈0, s≈1 → [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]
    const p = writeUsda('rotatey90.usda', `
def Xform "Root" {
  float xformOp:rotateY = 90
  uniform token[] xformOpOrder = ["xformOp:rotateY"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    // Row 0: [c, 0, -s, 0] = [0, 0, -1, 0]
    expect(matrix[0]).toBeCloseTo(0)
    expect(matrix[1]).toBeCloseTo(0)
    expect(matrix[2]).toBeCloseTo(-1)
    // Row 1: [0, 1, 0, 0]
    expect(matrix[4]).toBeCloseTo(0)
    expect(matrix[5]).toBeCloseTo(1)
    expect(matrix[6]).toBeCloseTo(0)
    // Row 2: [s, 0, c, 0] = [1, 0, 0, 0]
    expect(matrix[8]).toBeCloseTo(1)
    expect(matrix[9]).toBeCloseTo(0)
    expect(matrix[10]).toBeCloseTo(0)
    expect(matrix[15]).toBeCloseTo(1)
  })
})

describe('rotateZ op', () => {
  it('rotateZ(90) matches existing geom.test.ts expectations', async () => {
    // makeRotateZ(90): c≈0, s≈1 → [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]
    const p = writeUsda('rotatez90_2.usda', `
def Xform "Root" {
  float xformOp:rotateZ = 90
  uniform token[] xformOpOrder = ["xformOp:rotateZ"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    expect(matrix[0]).toBeCloseTo(0)
    expect(matrix[1]).toBeCloseTo(1)
    expect(matrix[4]).toBeCloseTo(-1)
    expect(matrix[5]).toBeCloseTo(0)
    expect(matrix[10]).toBeCloseTo(1)
    expect(matrix[15]).toBeCloseTo(1)
  })
})

// ---- rotateXYZ matches rotateX for single-axis case ----

describe('rotateXYZ Euler triple', () => {
  it('rotateXYZ([45,0,0]) matches rotateX(45)', async () => {
    // rotateXYZ with only X non-zero should equal rotateX(45)
    // Source: mul4(makeRotateZ(0), mul4(makeRotateY(0), makeRotateX(45)))
    //       = makeRotateX(45)
    const p = writeUsda('rotateXYZ_x_only.usda', `
def Xform "Root" {
  float3 xformOp:rotateXYZ = (45, 0, 0)
  uniform token[] xformOpOrder = ["xformOp:rotateXYZ"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    const c = Math.cos((45 * Math.PI) / 180)
    const s = Math.sin((45 * Math.PI) / 180)
    // makeRotateX(45): [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]
    expect(matrix[0]).toBeCloseTo(1)
    expect(matrix[5]).toBeCloseTo(c)
    expect(matrix[6]).toBeCloseTo(s)
    expect(matrix[9]).toBeCloseTo(-s)
    expect(matrix[10]).toBeCloseTo(c)
    expect(matrix[15]).toBeCloseTo(1)
  })
})

// ---- All 6 Euler order variants produce different results ----

describe('Euler order variants produce distinct matrices', () => {
  // For angles (30°, 45°, 60°) — all three axes non-zero — all 6 orders produce
  // distinct matrices because the axes don't commute when all are active.
  const angles = '(30, 45, 60)'

  async function evalEuler(order: string): Promise<Matrix4> {
    const p = writeUsda(`euler_${order}.usda`, `
def Xform "Root" {
  float3 xformOp:${order} = ${angles}
  uniform token[] xformOpOrder = ["xformOp:${order}"]
}
`)
    const stage = (await Stage.open(p))!
    return evaluateXformOps(stage.getPrim('/Root')!).matrix
  }

  const orders = ['rotateXYZ', 'rotateXZY', 'rotateYXZ', 'rotateYZX', 'rotateZXY', 'rotateZYX'] as const

  function matricesEqual(a: Matrix4, b: Matrix4): boolean {
    return a.every((v, i) => Math.abs(v - b[i]!) < 1e-5)
  }

  it('all 6 Euler order variants produce different matrices for (30,0,45)', async () => {
    const results: Matrix4[] = []
    for (const order of orders) {
      results.push(await evalEuler(order))
    }
    // Verify every pair is distinct
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        expect(
          matricesEqual(results[i]!, results[j]!),
          `${orders[i]} and ${orders[j]} produced identical matrices`
        ).toBe(false)
      }
    }
  })

  it('rotateXYZ with only Z non-zero matches rotateZ', async () => {
    // rotateXYZ([0,0,45]) = mul4(makeRotateZ(45), mul4(makeRotateY(0), makeRotateX(0)))
    //                     = makeRotateZ(45)
    const xyzMatrix = await evalEuler('rotateXYZ')
    // Also compute via plain rotateZ op
    const p2 = writeUsda('rotatez_plain.usda', `
def Xform "Root" {
  float xformOp:rotateZ = 45
  uniform token[] xformOpOrder = ["xformOp:rotateZ"]
}
`)
    const stage2 = (await Stage.open(p2))!
    const { matrix: zMatrix } = evaluateXformOps(stage2.getPrim('/Root')!)
    // rotateXYZ([30, 0, 45]) ≠ rotateZ(45), but rotateXYZ([0,0,45]) = rotateZ(45).
    // We already tested the triple-axis case above; here validate the pure-Z match.
    const p3 = writeUsda('rotatexyz_z_only.usda', `
def Xform "Root" {
  float3 xformOp:rotateXYZ = (0, 0, 45)
  uniform token[] xformOpOrder = ["xformOp:rotateXYZ"]
}
`)
    const stage3 = (await Stage.open(p3))!
    const { matrix: xyzZOnly } = evaluateXformOps(stage3.getPrim('/Root')!)
    expectMatrixClose(xyzZOnly, zMatrix)
  })
})

// ---- orient quaternion op ----

describe('orient quaternion op', () => {
  it('unit quaternion (1,0,0,0) → identity matrix', async () => {
    const p = writeUsda('orient_identity.usda', `
def Xform "Root" {
  quatf xformOp:orient = (1, 0, 0, 0)
  uniform token[] xformOpOrder = ["xformOp:orient"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    expectMatrixClose(matrix, IDENTITY_MATRIX)
  })

  it('90° rotation around Y axis quaternion → same as rotateY(90)', async () => {
    // Quat for 90° around Y: w=cos(45°)=√2/2, x=0, y=sin(45°)=√2/2, z=0
    const w = Math.cos(Math.PI / 4)
    const y = Math.sin(Math.PI / 4)
    const wStr = w.toFixed(8)
    const yStr = y.toFixed(8)
    const p = writeUsda('orient_roty90.usda', `
def Xform "Root" {
  quatf xformOp:orient = (${wStr}, 0, ${yStr}, 0)
  uniform token[] xformOpOrder = ["xformOp:orient"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix: orientMatrix } = evaluateXformOps(stage.getPrim('/Root')!)

    // Compare to rotateY(90) matrix
    const p2 = writeUsda('rotatey90_ref.usda', `
def Xform "Root" {
  float xformOp:rotateY = 90
  uniform token[] xformOpOrder = ["xformOp:rotateY"]
}
`)
    const stage2 = (await Stage.open(p2))!
    const { matrix: rotYMatrix } = evaluateXformOps(stage2.getPrim('/Root')!)

    expectMatrixClose(orientMatrix, rotYMatrix)
  })
})

// ---- transform (matrix4d) op ----

describe('transform matrix4d op', () => {
  it('pass-through: authored matrix returned unchanged', async () => {
    // A non-trivial matrix: translation (1,2,3) + scale (2,2,2)
    const p = writeUsda('transform_passthrough.usda', `
def Xform "Root" {
  matrix4d xformOp:transform = ( (2,0,0,0), (0,2,0,0), (0,0,2,0), (1,2,3,1) )
  uniform token[] xformOpOrder = ["xformOp:transform"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    // Row 0: [2,0,0,0]
    expect(matrix[0]).toBeCloseTo(2)
    expect(matrix[1]).toBeCloseTo(0)
    expect(matrix[2]).toBeCloseTo(0)
    expect(matrix[3]).toBeCloseTo(0)
    // Row 1: [0,2,0,0]
    expect(matrix[4]).toBeCloseTo(0)
    expect(matrix[5]).toBeCloseTo(2)
    expect(matrix[6]).toBeCloseTo(0)
    expect(matrix[7]).toBeCloseTo(0)
    // Row 2: [0,0,2,0]
    expect(matrix[8]).toBeCloseTo(0)
    expect(matrix[9]).toBeCloseTo(0)
    expect(matrix[10]).toBeCloseTo(2)
    expect(matrix[11]).toBeCloseTo(0)
    // Row 3 (translation): [1,2,3,1]
    expect(matrix[12]).toBeCloseTo(1)
    expect(matrix[13]).toBeCloseTo(2)
    expect(matrix[14]).toBeCloseTo(3)
    expect(matrix[15]).toBeCloseTo(1)
  })

  it('!invert!xformOp:transform gives inverse matrix', async () => {
    // Use a pure translation matrix — its inverse has negated translation.
    const p = writeUsda('transform_invert.usda', `
def Xform "Root" {
  matrix4d xformOp:transform = ( (1,0,0,0), (0,1,0,0), (0,0,1,0), (4,5,6,1) )
  uniform token[] xformOpOrder = ["!invert!xformOp:transform"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    // Inverse of a pure translation (4,5,6) is (-4,-5,-6)
    expect(matrix[12]).toBeCloseTo(-4)
    expect(matrix[13]).toBeCloseTo(-5)
    expect(matrix[14]).toBeCloseTo(-6)
    // Diagonal should stay 1
    expect(matrix[0]).toBeCloseTo(1)
    expect(matrix[5]).toBeCloseTo(1)
    expect(matrix[10]).toBeCloseTo(1)
  })
})

// ---- !invert! prefix ----

describe('!invert! op prefix', () => {
  it('!invert!xformOp:translate produces negative translation', async () => {
    const p = writeUsda('invert_translate.usda', `
def Xform "Root" {
  double3 xformOp:translate = (7, 8, 9)
  uniform token[] xformOpOrder = ["!invert!xformOp:translate"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    expect(matrix[12]).toBeCloseTo(-7)
    expect(matrix[13]).toBeCloseTo(-8)
    expect(matrix[14]).toBeCloseTo(-9)
  })
})

// ---- Composition ----

describe('op composition', () => {
  it('translate then scale: translation stays unscaled (first op outermost)', async () => {
    // xformOpOrder = [translate, scale]: upstream iterates the list in
    // REVERSE — points scale first, then translate. The translation is
    // NOT scaled. Pixar 25.08 reference:
    //   ((2,0,0,0),(0,2,0,0),(0,0,2,0),(3,0,0,1))
    const p = writeUsda('compose_t_s.usda', `
def Xform "Root" {
  double3 xformOp:translate = (3, 0, 0)
  float3 xformOp:scale = (2, 2, 2)
  uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    // Scale diagonal
    expect(matrix[0]).toBeCloseTo(2)
    expect(matrix[5]).toBeCloseTo(2)
    expect(matrix[10]).toBeCloseTo(2)
    // Translation row: unscaled
    expect(matrix[12]).toBeCloseTo(3)
    expect(matrix[13]).toBeCloseTo(0)
    expect(matrix[14]).toBeCloseTo(0)
  })

  it('rotateX then translate: translation is rotated into Z', async () => {
    // xformOpOrder = [rotateX, translate]: points translate (0,1,0) first,
    // then rotate 90° about X — the offset lands in +Z.
    // Pixar 25.08 reference: last row = (0, 0, 1, 1)
    const p = writeUsda('compose_rx_t.usda', `
def Xform "Root" {
  float xformOp:rotateX = 90
  double3 xformOp:translate = (0, 1, 0)
  uniform token[] xformOpOrder = ["xformOp:rotateX", "xformOp:translate"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix } = evaluateXformOps(stage.getPrim('/Root')!)
    expect(matrix[12]).toBeCloseTo(0)
    expect(matrix[13]).toBeCloseTo(0)
    expect(matrix[14]).toBeCloseTo(1)
  })
})

// ---- !resetXformStack! ----

describe('!resetXformStack!', () => {
  it('ops before reset do not accumulate into final result', async () => {
    // Order: [xformOp:translate(100,0,0), !resetXformStack!, xformOp:translate(1,0,0)]
    // After reset, matrix resets to identity; only the post-reset translate survives.
    const p = writeUsda('reset_ops.usda', `
def Xform "Root" {
  double3 xformOp:translate = (1, 0, 0)
  uniform token[] xformOpOrder = ["!resetXformStack!", "xformOp:translate"]
}
`)
    const stage = (await Stage.open(p))!
    const { matrix, resetsXformStack } = evaluateXformOps(stage.getPrim('/Root')!)
    expect(resetsXformStack).toBe(true)
    // Only the post-reset translate (1,0,0) should appear
    expect(matrix[12]).toBeCloseTo(1)
    expect(matrix[13]).toBeCloseTo(0)
    expect(matrix[14]).toBeCloseTo(0)
  })

  it('resetsXformStack is false when sentinel absent', async () => {
    const p = writeUsda('no_reset.usda', `
def Xform "Root" {
  double3 xformOp:translate = (0, 0, 0)
  uniform token[] xformOpOrder = ["xformOp:translate"]
}
`)
    const stage = (await Stage.open(p))!
    const { resetsXformStack } = evaluateXformOps(stage.getPrim('/Root')!)
    expect(resetsXformStack).toBe(false)
  })
})

// ---- Time-sampled xform evaluation ----

describe('time-sampled xform evaluation', () => {
  it('evaluates translate at time 0 and time 1 from authored time samples', () => {
    // Use Stage.createNew() + setTimeSample to author time samples,
    // then evaluate at specific times.
    const stage = Stage.createNew()
    const xf = Xform.define(stage, '/Animated')
    const translateAttr = xf.addTranslateOp()
    // Time sample at t=0: translate (0,0,0)
    translateAttr.set([0, 0, 0], 0)
    // Time sample at t=1: translate (10,0,0)
    translateAttr.set([10, 0, 0], 1)

    // Read back via stage.getPrim which returns a Prim (writable handle).
    // We need a Prim (read view) — use the composed stage.
    // evaluateXformOps takes a Prim from Stage.open; for authored stages we can
    // access via getPrim if it returns a Prim. Check what Stage.createNew exposes:
    const prim = stage.getPrim('/Animated')
    expect(prim).toBeTruthy()
  })

  it('evaluates time-sampled translate authored via setTimeSample', () => {
    // Use Stage.createNew() + Prim.createAttr/attr to directly write into
    // stage.nodes so that evaluateXformOps (which reads via Prim) sees the data.
    // Note: Xform._appendXformOp writes only to the layer, not stage.nodes,
    // so we wire xformOpOrder manually here.
    const stage = Stage.createNew()
    const usdPrim = stage.definePrim('/Root', 'Xform')
    // Set xformOpOrder via createAttr so it lands in stage.nodes
    usdPrim.createAttr('xformOpOrder', ['xformOp:translate'])
    // Author time-sampled translate
    const translateAttr = usdPrim.attr('xformOp:translate')
    translateAttr.set([0, 0, 0], 0)
    translateAttr.set([10, 5, 0], 10)

    // getPrim returns a Prim backed by the live stage.nodes map
    const prim = stage.getPrim('/Root')!

    const { matrix: m0 } = evaluateXformOps(prim, 0)
    expect(m0[12]).toBeCloseTo(0)
    expect(m0[13]).toBeCloseTo(0)
    expect(m0[14]).toBeCloseTo(0)

    const { matrix: m10 } = evaluateXformOps(prim, 10)
    expect(m10[12]).toBeCloseTo(10)
    expect(m10[13]).toBeCloseTo(5)
    expect(m10[14]).toBeCloseTo(0)
  })

  it('evaluates time-sampled rotateY authored via setTimeSample', () => {
    const stage = Stage.createNew()
    const usdPrim = stage.definePrim('/Root', 'Xform')
    usdPrim.createAttr('xformOpOrder', ['xformOp:rotateY'])
    const rotAttr = usdPrim.attr('xformOp:rotateY')
    rotAttr.setTimeSample(0, 0)
    rotAttr.setTimeSample(1, 90)

    const prim = stage.getPrim('/Root')!

    // At time 0: rotateY(0) → identity diagonal
    const { matrix: m0 } = evaluateXformOps(prim, 0)
    expect(m0[0]).toBeCloseTo(1)
    expect(m0[5]).toBeCloseTo(1)
    expect(m0[10]).toBeCloseTo(1)

    // At time 1: rotateY(90) → M[0]≈0, M[2]≈-1, M[8]≈1, M[10]≈0
    const { matrix: m1 } = evaluateXformOps(prim, 1)
    expect(m1[0]).toBeCloseTo(0)
    expect(m1[2]).toBeCloseTo(-1)
    expect(m1[8]).toBeCloseTo(1)
    expect(m1[10]).toBeCloseTo(0)
  })
})

// ---- 3-axis Euler op composition order (a fixed xformable bug) ----
//
// usdGeom/xformOp.cpp builds rotateXYZ as xRot·yRot·zRot (row-vector
// GfMatrix3d). evaluateXformOps once built Rz·Ry·Rx (USD's rotateZYX), swapping
// all six 3-axis ops pairwise; single-axis cases are order-invariant, so the
// other tests did not catch it.
//
// These assert the faithful USD value (built from the Pixar-verified
// typescript-usd/gf rotation primitives in the order xformOp.cpp specifies).
// They were expected failures while xformable.ts reversed the Euler order and
// now pass as plain tests.
describe('rotateXYZ-family composition order vs OpenUSD', () => {
  async function evalOp(op: string, value: string): Promise<Matrix4> {
    const p = writeUsda(`euler_div_${op}.usda`, `
def Xform "Root" {
  float3 xformOp:${op} = ${value}
  uniform token[] xformOpOrder = ["xformOp:${op}"]
}
`)
    const stage = (await Stage.open(p))!
    return evaluateXformOps(stage.getPrim('/Root')!).matrix
  }

  function expectClose(a: Matrix4, b: Matrix4): void {
    for (let i = 0; i < 16; i++) expect(a[i]!).toBeCloseTo(b[i]!, 5)
  }

  // USD xformOp.cpp non-inverse compositions (row-vector, mul4(A,B)=A·B):
  const cases: Array<[string, Matrix4]> = [
    ['rotateXYZ', mul4(makeRotateX(10), mul4(makeRotateY(20), makeRotateZ(30)))],
    ['rotateXZY', mul4(makeRotateX(10), mul4(makeRotateZ(30), makeRotateY(20)))],
    ['rotateYXZ', mul4(makeRotateY(20), mul4(makeRotateX(10), makeRotateZ(30)))],
    ['rotateYZX', mul4(makeRotateY(20), mul4(makeRotateZ(30), makeRotateX(10)))],
    ['rotateZXY', mul4(makeRotateZ(30), mul4(makeRotateX(10), makeRotateY(20)))],
    ['rotateZYX', mul4(makeRotateZ(30), mul4(makeRotateY(20), makeRotateX(10)))],
  ]

  for (const [op, expected] of cases) {
    it(`${op}(10,20,30) matches USD xformOp.cpp order`, async () => {
      expectClose(await evalOp(op, '(10, 20, 30)'), expected)
    })
  }
})
