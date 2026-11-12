// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdSkel/testenv/testUsdSkelAnimMapper.py,
//  pxr/usd/usdSkel/testenv/testUsdSkelTopology.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Registered v26.05 executions: testUsdSkelAnimMapper, testUsdSkelTopology,
// testUsdSkelUtils. P10a numeric suites — ports testUsdSkelTopology semantics and verifies
// concat/LBS math against Pixar 26.05 python reference values (generated
// with UsdSkel.Topology / ConcatJointTransforms / SkinPointsLBS on the same
// fixtures; values inlined below).

import { describe, expect, it } from 'vitest'
import {
  Topology as UsdSkelTopology,
  AnimMapper as UsdSkelAnimMapper,
  makeTransform,
  concatJointTransforms,
  skinPointsLBS,
  skinPointsDQS,
  skinNormals,
  computeJointLocalTransforms,
  normalizeWeights,
  sortInfluences,
  resizeInfluences,
  expandConstantInfluencesToVarying,
} from '../../src/index.ts'
import type { Matrix4 } from 'typescript-usd/gf'

const H = Math.SQRT1_2

describe('UsdSkelTopology', () => {
  it('parents come from the closest ancestor PRESENT in the array', () => {
    // Pixar 26.05: UsdSkel.Topology(['A','A/B','A/B/C','D','A/X/Y']) → [-1,0,1,-1,0]
    const topo = new UsdSkelTopology(['A', 'A/B', 'A/B/C', 'D', 'A/X/Y'])
    expect([...topo.getParentIndices()]).toEqual([-1, 0, 1, -1, 0])
  })

  it('accepts explicit parent indices', () => {
    const topo = new UsdSkelTopology([-1, 0, 0, 2])
    expect(topo.getParent(3)).toBe(2)
    expect(topo.isRoot(0)).toBe(true)
    expect(topo.size).toBe(4)
  })

  it('validate rejects self-parenting and mis-ordered parents', () => {
    expect(new UsdSkelTopology([-1, 0]).validate().valid).toBe(true)
    expect(new UsdSkelTopology([0]).validate().valid).toBe(false)        // self
    const misordered = new UsdSkelTopology([1, -1]).validate()           // parent after child
    expect(misordered.valid).toBe(false)
    expect(misordered.reason).toContain('mis-ordered')
  })
})

describe('UsdSkelAnimMapper', () => {
  const remapNum = (m: UsdSkelAnimMapper, src: number[], tgt?: number[] | null, es = 1, dflt = 0) =>
    m.remap<number>(src, tgt ?? null, es, dflt)

  it('identity when orders match', () => {
    const m = new UsdSkelAnimMapper(['a', 'b', 'c'], ['a', 'b', 'c'])
    expect(m.isIdentity()).toBe(true)
    expect(m.isSparse()).toBe(false)
    expect(remapNum(m, [1, 2, 3])).toEqual([1, 2, 3])
  })

  it('ordered map with offset (source is a contiguous run in target)', () => {
    const m = new UsdSkelAnimMapper(['b', 'c'], ['a', 'b', 'c', 'd'])
    expect(m.isIdentity()).toBe(false)
    expect(m.isSparse()).toBe(true)
    expect(remapNum(m, [20, 30], null, 1, 0)).toEqual([0, 20, 30, 0])
  })

  it('indexed map for reordered sources', () => {
    const m = new UsdSkelAnimMapper(['c', 'a'], ['a', 'b', 'c'])
    expect(remapNum(m, [30, 10], null, 1, 0)).toEqual([10, 0, 30])
  })

  it('sparse remap preserves existing target values (rest pose overlay)', () => {
    const m = new UsdSkelAnimMapper(['c'], ['a', 'b', 'c'])
    expect(m.isSparse()).toBe(true)
    expect(remapNum(m, [99], [1, 2, 3])).toEqual([1, 2, 99])
  })

  it('elementSize remaps runs of values', () => {
    const m = new UsdSkelAnimMapper(['b'], ['a', 'b'])
    expect(remapNum(m, [7, 8, 9], null, 3, 0)).toEqual([0, 0, 0, 7, 8, 9])
  })

  it('indexed map when no source elements match', () => {
    // animMapper.cpp:114-117: an indexed map with no mapped source elements
    // is flagged _SomeSourceValuesMapToTarget, so it is not a null map.
    const m = new UsdSkelAnimMapper(['x'], ['a', 'b'])
    expect(m.isNull()).toBe(false)
    expect(remapNum(m, [5], null, 1, -1)).toEqual([-1, -1])
  })
})

describe('makeTransform + concatJointTransforms (vs Pixar 26.05)', () => {
  it('a 2-joint chain composes child = local · parentSkel', () => {
    // Root rotated 90° about Z; child offset +2 in local x.
    // Pixar: child skel row3 = [0,2,0,1]; row0 = [0,1,0,0]
    const rootLocal = makeTransform([0, 0, 0], [H, 0, 0, H], [1, 1, 1])
    const childLocal = makeTransform([2, 0, 0], [1, 0, 0, 0], [1, 1, 1])
    const topo = new UsdSkelTopology([-1, 0])
    const xforms = concatJointTransforms(topo, [rootLocal, childLocal])

    const child = xforms[1]!
    expect(child[12]).toBeCloseTo(0, 5)
    expect(child[13]).toBeCloseTo(2, 5)
    expect(child[14]).toBeCloseTo(0, 5)
    expect(child[0]).toBeCloseTo(0, 5)
    expect(child[1]).toBeCloseTo(1, 5)
  })

  it('makeTransform applies scale before rotation, translation last', () => {
    // scale x by 2, rotate 90° about Z: (1,0,0) → (2,0,0) → (0,2,0), then +T
    const m = makeTransform([5, 0, 0], [H, 0, 0, H], [2, 1, 1])
    const p = [
      1 * m[0]! + m[12]!,
      1 * m[1]! + m[13]!,
      1 * m[2]! + m[14]!,
    ]
    expect(p[0]).toBeCloseTo(5, 5)
    expect(p[1]).toBeCloseTo(2, 5)
    expect(p[2]).toBeCloseTo(0, 5)
  })

  it('preserves non-unit quaternion magnitude like GfMatrix4d', () => {
    // OpenUSD v26.08 GfMatrix4d::_SetRotateFromQuat consumes the authored
    // components directly; it does not silently normalize near-unit quats.
    const q = Math.fround(0.7071)
    const m = makeTransform([0, 0, 0], [q, q, 0, 0], [1, 1, 1])
    expect(m[5]).toBeCloseTo(0.000019252300262451172, 8)
    expect(m[6]).toBeCloseTo(0.9999807476997375, 8)
  })

  it('round-trips skel-space transforms to joint-local transforms', () => {
    const topology = new UsdSkelTopology([-1, 0])
    const local = [
      makeTransform([3, 0, 0], [1, 0, 0, 0], [1, 1, 1]),
      makeTransform([0, 2, 0], [1, 0, 0, 0], [1, 1, 1]),
    ]
    const skel = concatJointTransforms(topology, local)
    const result = computeJointLocalTransforms(topology, skel)
    expect(result[0]).toEqual(local[0])
    expect(result[1]![12]).toBeCloseTo(0)
    expect(result[1]![13]).toBeCloseTo(2)
  })
})

describe('registered influence utilities', () => {
  it('normalizes each component independently and preserves zero groups', () => {
    const weights = [3,1,1,0, 4,3,2,1, 0,0,0,0]
    expect(normalizeWeights(weights, 4)).toBe(true)
    expect(weights).toEqual([0.6,0.2,0.2,0, 0.4,0.3,0.2,0.1, 0,0,0,0])
    expect(normalizeWeights([1], 4)).toBe(false)
  })

  it('sorts indices and weights together by descending weight', () => {
    const indices = [1,2,3,4, 5,6,7,8]
    const weights = [3,1,4,2, 1,2,3,4]
    expect(sortInfluences(indices, weights, 4)).toBe(true)
    expect(indices).toEqual([3,1,4,2, 8,7,6,5])
    expect(weights).toEqual([4,3,2,1, 4,3,2,1])
  })

  it('resizes influences and normalizes truncated weight groups', () => {
    const indices = [1,2,3,4,5,6,7,8]
    expect(resizeInfluences(indices, 4, 2)).toBe(true)
    expect(indices).toEqual([1,2,5,6])
    const weights = [3,1,1,5,6, 1,1,3,7,8, 1,3,1,9,10]
    expect(resizeInfluences(weights, 5, 3, true)).toBe(true)
    expect(weights).toEqual([0.6,0.2,0.2, 0.2,0.2,0.6, 0.2,0.6,0.2])
  })

  it('expands constant influences to the requested component count', () => {
    const values = [1,2,3]
    expect(expandConstantInfluencesToVarying(values, 3)).toBe(true)
    expect(values).toEqual([1,2,3,1,2,3,1,2,3])
  })
})

describe('skinPointsLBS (vs Pixar 26.05)', () => {
  // Fixture matching the python reference: 2-joint chain, root rotated 90°
  // about Z, child at +2x; bind transforms identity and translate(2,0,0).
  function skinningXforms(): Matrix4[] {
    const rootLocal = makeTransform([0, 0, 0], [H, 0, 0, H], [1, 1, 1])
    const childLocal = makeTransform([2, 0, 0], [1, 0, 0, 0], [1, 1, 1])
    const topo = new UsdSkelTopology([-1, 0])
    const skel = concatJointTransforms(topo, [rootLocal, childLocal])
    // inv(bind) · skel — bind0 = I, bind1 = translate(2,0,0) so inv = translate(-2,0,0)
    const invBind0: Matrix4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    const invBind1: Matrix4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, -2,0,0,1]
    const mul = (a: Matrix4, b: Matrix4): Matrix4 => {
      const r = new Array<number>(16).fill(0)
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++)
        r[i*4+j] = r[i*4+j]! + a[i*4+k]! * b[k*4+j]!
      return r as Matrix4
    }
    return [mul(invBind0, skel[0]!), mul(invBind1, skel[1]!)]
  }

  const IDENTITY: Matrix4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]

  it('single-influence points rotate with their joints', () => {
    // Pixar: [[1,0,0],[3,0,0]] → [[0,1,0],[0,3,0]]
    const out = skinPointsLBS(IDENTITY, skinningXforms(), [0, 1], [1, 1], 1, [1, 0, 0, 3, 0, 0])
    expect(out[0]).toBeCloseTo(0, 4)
    expect(out[1]).toBeCloseTo(1, 4)
    expect(out[3]).toBeCloseTo(0, 4)
    expect(out[4]).toBeCloseTo(3, 4)
  })

  it('blended influences average the joint contributions', () => {
    // Pixar: point (2,0,0) with w=0.5/0.5 → (0,2,0)
    const out = skinPointsLBS(IDENTITY, skinningXforms(), [0, 1], [0.5, 0.5], 2, [2, 0, 0])
    expect(out[0]).toBeCloseTo(0, 4)
    expect(out[1]).toBeCloseTo(2, 4)
    expect(out[2]).toBeCloseTo(0, 4)
  })

  it('geomBindTransform pre-transforms points', () => {
    const gbt: Matrix4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 1,0,0,1]   // +1 x
    const out = skinPointsLBS(gbt, skinningXforms(), [0], [1], 1, [0, 0, 0])
    // (0,0,0) → gbt → (1,0,0) → joint0 rot90z → (0,1,0)
    expect(out[0]).toBeCloseTo(0, 4)
    expect(out[1]).toBeCloseTo(1, 4)
  })

  it('zero weights contribute nothing', () => {
    const out = skinPointsLBS(IDENTITY, skinningXforms(), [0, 1], [1, 0], 2, [1, 0, 0])
    expect(out[1]).toBeCloseTo(1, 4)   // pure joint-0 result
  })

  it('out-of-range joint indices throw', () => {
    expect(() =>
      skinPointsLBS(IDENTITY, skinningXforms(), [5], [1], 1, [0, 0, 0]),
    ).toThrow(/Out of range/)
  })
})

describe('dual-quaternion skinning utility oracle', () => {
  it('blends rigid rotations without the LBS volume loss', () => {
    // Live v26.05 UsdSkel.SkinPoints oracle: identity + rotateZ(90), each
    // weighted 0.5, transforms (1,0,0) to (sqrt(.5),sqrt(.5),0).
    const identity: Matrix4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    const rotateZ90 = makeTransform([0,0,0], [Math.SQRT1_2,0,0,Math.SQRT1_2], [1,1,1])
    const out = skinPointsDQS(identity, [identity, rotateZ90], [0,1], [0.5,0.5], 2, [1,0,0])
    expect(out[0]).toBeCloseTo(0.707106769, 6)
    expect(out[1]).toBeCloseTo(0.707106769, 6)
    expect(out[2]).toBeCloseTo(0, 6)
  })

  it('skins vertex and face-varying normals', () => {
    const identity: Matrix4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
    const rotateZ90 = makeTransform([0,0,0], [Math.SQRT1_2,0,0,Math.SQRT1_2], [1,1,1])
    const vertex = skinNormals(identity, [rotateZ90], [0], [1], 1, [1,0,0])
    expect(vertex[0]).toBeCloseTo(0); expect(vertex[1]).toBeCloseTo(1)
    const faceVarying = skinNormals(identity, [rotateZ90], [0,0], [1,1], 1,
      [1,0,0, 1,0,0], [1,0])
    expect(faceVarying[1]).toBeCloseTo(1); expect(faceVarying[4]).toBeCloseTo(1)
  })
})
