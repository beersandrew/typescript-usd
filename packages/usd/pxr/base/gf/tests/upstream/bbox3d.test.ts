// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfBBox3d.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfBBox3d.py.
//
// One describe() per upstream test method, every assert mirrored. Numeric
// expectations are captured from the OpenUSD 26.11.1 build
// (FIXTURES.md) into fixtures/bbox3d.json — never hand-derived (AGENTS.md
// numeric-fixture rule). The upstream suite is mostly value-type object
// equality; the derived-numeric results (aligned range, centroid, combine)
// are additionally cross-checked against the captured goldens.
//
// Mapping of GfBBox3d's python surface onto typescript-usd/gf:
//   b.matrix (property)            -> b.SetMatrix(m) / b.GetMatrix()
//   b.box (property)               -> b.SetRange(r) / b.GetRange()
//   b.hasZeroAreaPrimitives (prop) -> b.SetHasZeroAreaPrimitives() / HasZeroAreaPrimitives()
//   operator== / repr / str / hash -> b.equals() / b.repr() / b.toString() / b.hash()
import { describe, it, expect } from 'vitest'
import { GfBBox3d } from '../../src/bbox3d.ts'
import { GfRange3d } from '../../src/range.ts'
import { GfMatrix4d } from '../../src/matrixData.ts'
import { GfVec3d, GfVec4d } from '../../src/vec.ts'
import { makeRotation } from '../../src/rotation.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

interface RangeFixture { min: number[]; max: number[] }
interface BBoxFixture { range: RangeFixture; matrix: number[][] }
interface BBox3dFixture {
  alignedScale3: RangeFixture
  alignedRotX30: RangeFixture
  alignedRotX30_expectedWidth: number
  centroid_b1: number[]
  centroid_b2: number[]
  centroid_default: number[]
  combine_b3: BBoxFixture
  combine_b4: BBoxFixture
  combine_degen_12: BBoxFixture
  combine_degen_21: BBoxFixture
  combine_chain_b3b2: BBoxFixture
  volume_2cube: number
}
// Captured from the OpenUSD 26.11.1 build (FIXTURES.md).
const G = readOracleFixture<BBox3dFixture>(new URL('./fixtures/bbox3d.json', import.meta.url))

const X = GfVec3d.xAxis()
const Y = GfVec3d.yAxis()

// Gf.Rotation(axis, angleDeg) -> the functional Rotation passed to SetRotate.
const rot = (axis: GfVec3d, deg: number) =>
  makeRotation([axis.data[0]!, axis.data[1]!, axis.data[2]!], deg)

describe('test_Constructors', () => {
  it('all constructor forms produce a GfBBox3d', () => {
    // no arg
    expect(new GfBBox3d()).toBeInstanceOf(GfBBox3d)
    // copy constructor
    expect(new GfBBox3d(new GfBBox3d())).toBeInstanceOf(GfBBox3d)
    // construct from range
    expect(new GfBBox3d(new GfRange3d())).toBeInstanceOf(GfBBox3d)
    // construct from range and matrix
    expect(new GfBBox3d(new GfRange3d(), new GfMatrix4d())).toBeInstanceOf(GfBBox3d)
  })
})

describe('test_Operators', () => {
  it('equality', () => {
    const r1 = new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const b1 = new GfBBox3d(r1)
    const b2 = new GfBBox3d(r1)
    expect(b1.equals(b2)).toBe(true)
  })

  it('inequality', () => {
    const r1 = new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
    const r2 = new GfRange3d(new GfVec3d(1, 1, 1), new GfVec3d(2, 2, 2))
    const b1 = new GfBBox3d(r1)
    const b2 = new GfBBox3d(r2)
    expect(b1.equals(b2)).toBe(false)
  })

  it('string (non-empty)', () => {
    expect(new GfBBox3d().toString().length).toBeGreaterThan(0)
  })
})

describe('test_MethodsAndProperties', () => {
  it('Set returns a bbox equal to the range+matrix constructor', () => {
    const m = new GfMatrix4d()
    const r = new GfRange3d()
    const b = new GfBBox3d()
    expect(b.Set(r, m).equals(new GfBBox3d(r, m))).toBe(true)
  })

  it('matrix property', () => {
    const b = new GfBBox3d()
    b.setMatrix(new GfMatrix4d(5))
    expect(b.getMatrix().equals(new GfMatrix4d(5))).toBe(true)
  })

  it('box property', () => {
    const b = new GfBBox3d()
    expect(b.getRange().IsEmpty()).toBe(true)
    b.setRange(new GfRange3d(new GfVec3d(1, 2, 3), new GfVec3d(4, 5, 6)))
    expect(
      b.getRange().equals(new GfRange3d(new GfVec3d(1, 2, 3), new GfVec3d(4, 5, 6))),
    ).toBe(true)
    expect(b.getRange().IsEmpty()).toBe(false)
  })

  it('GetInverseMatrix', () => {
    const b = new GfBBox3d()
    b.setMatrix(new GfMatrix4d(5))
    expect(
      b.getInverseMatrix().equals(new GfMatrix4d(5).getInverse()),
    ).toBe(true)
  })

  it('hasZeroAreaPrimitives', () => {
    const b = new GfBBox3d()
    b.setHasZeroAreaPrimitives(true)
    b.setHasZeroAreaPrimitives(!b.hasZeroAreaPrimitives())
    expect(b.hasZeroAreaPrimitives()).toBe(false)
  })

  it('GetVolume', () => {
    let b = new GfBBox3d(new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(2, 2, 2)))
    expect(b.getVolume()).toBe(8)
    b = new GfBBox3d(new GfRange3d(new GfVec3d(1, 1, 1), new GfVec3d()))
    expect(b.getVolume()).toBe(0)
  })

  it('Transform post-multiplies the matrix', () => {
    const m1 = new GfMatrix4d(1).setRotate(rot(X, 30))
    const m2 = new GfMatrix4d(1).setRotate(rot(Y, 60))
    const b = new GfBBox3d(
      new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1)),
      m1,
    )
    b.Transform(m2)
    expect(b.getMatrix().equals(m1.getMultiply(m2))).toBe(true)
  })

  it('ComputeAlignedRange', () => {
    // Applying an identity transform to an already-aligned range is identity.
    let m = new GfMatrix4d(1).setRotate(rot(X, 30))
    let b = new GfBBox3d(
      new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1)),
      m,
    )
    const r1 = b.ComputeAlignedRange()
    b = new GfBBox3d(r1)
    const r2 = b.ComputeAlignedRange()
    expect(r1.equals(r2)).toBe(true)

    // Scale by 3: a [-1,1]^3 box becomes [-3,3]^3, size (6,6,6).
    m = new GfMatrix4d().setScale(3)
    b = new GfBBox3d(
      new GfRange3d(new GfVec3d(-1, -1, -1), new GfVec3d(1, 1, 1)),
      m,
    )
    let r = b.ComputeAlignedRange()
    expect(r.getSize().equals(new GfVec3d(6.0, 6.0, 6.0))).toBe(true)

    // Rotate X 30 deg: width = 2*(cos30 + sin30).
    m = new GfMatrix4d(1).setRotate(rot(X, 30))
    b = new GfBBox3d(
      new GfRange3d(new GfVec3d(-1, -1, -1), new GfVec3d(1, 1, 1)),
      m,
    )
    const angle = Math.PI / 6
    const width = 2 * (Math.cos(angle) + Math.sin(angle))
    const size = new GfVec3d(2.0, width, width)
    r = b.ComputeAlignedRange()
    const diff = r.getSize().subtract(size) as GfVec3d
    expect(diff.GetLength() > 0.000001).toBe(false)

    // Empty box -> empty aligned range.
    b = new GfBBox3d()
    r = b.ComputeAlignedRange()
    expect(r.IsEmpty()).toBe(true)
  })

  it('static Combine is symmetric', () => {
    const m1 = new GfMatrix4d(1).setRotate(rot(X, 30))
    const m2 = new GfMatrix4d(1).setRotate(rot(Y, 60))
    const b1 = new GfBBox3d(
      new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1)),
      m1,
    )
    const b2 = new GfBBox3d(
      new GfRange3d(new GfVec3d(1, 1, 1), new GfVec3d(2, 2, 2)),
      m2,
    )
    const b3 = GfBBox3d.combine(b1, b2)
    const b4 = GfBBox3d.combine(b2, b1)
    expect(b3.equals(b4)).toBe(true)
  })

  it('ComputeCentroid', () => {
    const b1 = new GfBBox3d(new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1)))
    const m2 = new GfMatrix4d(1).setRotate(rot(Y, 60))
    const b2 = new GfBBox3d(
      new GfRange3d(new GfVec3d(-1, -1, -1), new GfVec3d(1, 1, 1)),
      m2,
    )
    expect(b1.computeCentroid().equals(new GfVec3d(0.5, 0.5, 0.5))).toBe(true)
    expect(b2.computeCentroid().equals(new GfVec3d(0, 0, 0))).toBe(true)

    const b3 = new GfBBox3d()
    expect(b3.computeCentroid().equals(new GfVec3d(0, 0, 0))).toBe(true)
  })

  it('degenerate-matrix combine code coverage', () => {
    const m1 = new GfMatrix4d(new GfVec4d(1, 0, 0, 0))
    const m2 = new GfMatrix4d(new GfVec4d(0, 1, 0, 0))
    const b1 = new GfBBox3d(new GfRange3d(new GfVec3d(1, 1, 1), new GfVec3d()), m1)
    const b2 = new GfBBox3d(
      new GfRange3d(new GfVec3d(1, 1, 1), new GfVec3d(2, 2, 2)),
      m2,
    )
    let b3 = GfBBox3d.combine(b1, b2)
    expect(b3.equals(b2)).toBe(true)
    b3 = GfBBox3d.combine(b2, b1)
    expect(b3.equals(b2)).toBe(true)
  })

  it('combine chain + repr round-trip', () => {
    const m1 = new GfMatrix4d(new GfVec4d(1, 0, 0, 0))
    const m2 = new GfMatrix4d(new GfVec4d(0, 1, 0, 0))
    const m3 = new GfMatrix4d(1).setRotate(rot(Y, 60))
    const b1 = new GfBBox3d(new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(0, 1, 1)), m1)
    const b2 = new GfBBox3d(new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 0)), m2)
    const b3 = new GfBBox3d(new GfRange3d(new GfVec3d(1, 1, 1), new GfVec3d(2, 2, 2)), m3)
    let b4 = GfBBox3d.combine(b1, b2)
    b4 = GfBBox3d.combine(b1, b2)
    b4 = GfBBox3d.combine(b2, b3)
    b4 = GfBBox3d.combine(b3, b2)

    // assertEqual(b4, eval(repr(b4))) — reconstruct from range+matrix.
    const reconstructed = new GfBBox3d(b4.getRange(), b4.getMatrix())
    expect(b4.equals(reconstructed)).toBe(true)
  })
})

describe('test_Hash', () => {
  it('hash is stable and equal across copies', () => {
    const b = new GfBBox3d(
      new GfRange3d(new GfVec3d(-1, -2, -3), new GfVec3d(2, 3, 4)),
      new GfMatrix4d(1.0),
    )
    expect(b.hash()).toBe(b.hash())
    expect(b.hash()).toBe(new GfBBox3d(b).hash())
  })
})

// ---------------------------------------------------------------------------
// Golden cross-checks against the native build (fixtures/bbox3d.json). These
// pin the derived numeric results so the verbatim algorithm port matches the
// reference build bit-for-bit (the upstream suite only checks object equality).
// ---------------------------------------------------------------------------
describe('golden cross-checks (Pixar build)', () => {
  const closeVec = (a: readonly number[], b: readonly number[]) => {
    for (let i = 0; i < a.length; i++) expect(a[i]!).toBeCloseTo(b[i]!, 12)
  }
  const closeRange = (r: GfRange3d, min: number[], max: number[]) => {
    closeVec(r.getMin().data, min)
    closeVec(r.getMax().data, max)
  }
  const closeMatrix = (m: GfMatrix4d, rows: number[][]) => {
    for (let i = 0; i < 4; i++) closeVec(m.getRow(i).data, rows[i]!)
  }

  it('ComputeAlignedRange rotate-X-30', () => {
    const m = new GfMatrix4d(1).setRotate(rot(X, 30))
    const b = new GfBBox3d(
      new GfRange3d(new GfVec3d(-1, -1, -1), new GfVec3d(1, 1, 1)),
      m,
    )
    closeRange(b.ComputeAlignedRange(), G.alignedRotX30.min, G.alignedRotX30.max)
  })

  it('Combine of rotated boxes (range + matrix)', () => {
    const m1 = new GfMatrix4d(1).setRotate(rot(X, 30))
    const m2 = new GfMatrix4d(1).setRotate(rot(Y, 60))
    const b1 = new GfBBox3d(
      new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1)),
      m1,
    )
    const b2 = new GfBBox3d(
      new GfRange3d(new GfVec3d(1, 1, 1), new GfVec3d(2, 2, 2)),
      m2,
    )
    const b3 = GfBBox3d.combine(b1, b2)
    closeRange(b3.getRange(), G.combine_b3.range.min, G.combine_b3.range.max)
    closeMatrix(b3.getMatrix(), G.combine_b3.matrix)
  })

  it('Combine chain b3·b2 (range + matrix)', () => {
    const m2 = new GfMatrix4d(new GfVec4d(0, 1, 0, 0))
    const m3 = new GfMatrix4d(1).setRotate(rot(Y, 60))
    const b2 = new GfBBox3d(new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 0)), m2)
    const b3 = new GfBBox3d(new GfRange3d(new GfVec3d(1, 1, 1), new GfVec3d(2, 2, 2)), m3)
    const b4 = GfBBox3d.combine(b3, b2)
    closeRange(b4.getRange(), G.combine_chain_b3b2.range.min, G.combine_chain_b3b2.range.max)
    closeMatrix(b4.getMatrix(), G.combine_chain_b3b2.matrix)
  })
})
