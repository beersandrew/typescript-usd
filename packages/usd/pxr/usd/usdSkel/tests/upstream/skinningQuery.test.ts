// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdSkel/testenv/testUsdSkelSkinningQuery.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelSkinningQuery.py
// (registered as testUsdSkelSkinningQuery). The testenv input
// testUsdSkelSkinningQuery/jointInfluences.usda is copied unmodified into
// fixtures/testUsdSkelSkinningQuery (Copyright 2017 Pixar, TOST 1.0
// , https://openusd.org/license).
//
// API mapping: UsdSkelCache::Populate(root, UsdPrimDefaultPredicate) is
// cache.populate(root); Compute(Varying)JointInfluences returns
// [indices, weights] or undefined for a falsy result; a falsy
// GetSkinningMethodAttr() is undefined.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Cache, Root } from '../../src/index.ts'

const TEST_FILE = fileURLToPath(new URL(
  './fixtures/testUsdSkelSkinningQuery/jointInfluences.usda', import.meta.url))

describe('testUsdSkelSkinningQuery', () => {
  // Tests interpretation of joint influences.
  it('test_JointInfluences', async () => {
    const stage = (await Stage.open(TEST_FILE))!

    const rootPath = '/JointInfluences'

    const cache = new Cache()

    const root = new Root(stage.getPrim(rootPath)!, stage)
    expect(cache.populate(root)).toBe(true)

    const getSkinningQuery = (path: string) => cache.getSkinningQuery(stage.getPrim(path)!)!

    expect(getSkinningQuery(rootPath + '/ErrorCases/MismatchedInterpolation')
      .hasJointInfluences()).toBe(false)
    expect(getSkinningQuery(rootPath + '/ErrorCases/InvalidInterpolation1')
      .hasJointInfluences()).toBe(false)
    expect(getSkinningQuery(rootPath + '/ErrorCases/InvalidInterpolation2')
      .hasJointInfluences()).toBe(false)
    expect(getSkinningQuery(rootPath + '/ErrorCases/MismatchedElementSize')
      .hasJointInfluences()).toBe(false)
    expect(getSkinningQuery(rootPath + '/ErrorCases/InvalidElementSize')
      .hasJointInfluences()).toBe(false)

    //
    // Validate error cases during ComputeJointInfluences()
    //
    let query = getSkinningQuery(rootPath + '/ErrorCases/InvalidArraySize1')
    expect(query.prim).toBeTruthy()
    expect(query).toBeTruthy()
    expect(query.computeJointInfluences()).toBeUndefined()
    expect(query.computeVaryingJointInfluences(10)).toBeUndefined()

    query = getSkinningQuery(rootPath + '/ErrorCases/InvalidArraySize2')
    expect(query).toBeTruthy()
    expect(query.computeJointInfluences()).toBeUndefined()
    expect(query.computeVaryingJointInfluences(10)).toBeUndefined()

    //
    // The remaining cases should all be valid.
    //

    query = getSkinningQuery(rootPath + '/RigidWeights')
    expect(query).toBeTruthy()
    expect(query.isRigidlyDeformed()).toBe(true)
    expect(query.getNumInfluencesPerComponent()).toBe(3)
    let influences = query.computeJointInfluences()
    expect(influences).toBeDefined()
    let [indices, weights] = influences!
    expect(indices).toEqual([1, 2, 3])
    expect(weights).toEqual([5, 6, 7])
    let skinningMethodAttr = query.getSkinningMethodAttr()
    expect(skinningMethodAttr).toBeUndefined()

    influences = query.computeVaryingJointInfluences(3)
    expect(influences).toBeDefined()
    ;[indices, weights] = influences!
    expect(indices).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3])
    expect(weights).toEqual([5, 6, 7, 5, 6, 7, 5, 6, 7])

    query = getSkinningQuery(rootPath + '/NonRigidWeights')
    expect(query).toBeTruthy()
    expect(query.isRigidlyDeformed()).toBe(false)
    expect(query.getNumInfluencesPerComponent()).toBe(2)
    influences = query.computeJointInfluences()
    expect(influences).toBeDefined()
    ;[indices, weights] = influences!
    expect(indices).toEqual([1, 2, 3, 4])
    expect(weights).toEqual([5, 6, 7, 8])
    skinningMethodAttr = query.getSkinningMethodAttr()
    expect(skinningMethodAttr).toBeDefined()
    expect(skinningMethodAttr!.getValue()).toBe('classicLinear')

    const varyingInfluences = query.computeVaryingJointInfluences(2)
    expect(influences).toEqual(varyingInfluences)

    query = getSkinningQuery(rootPath + '/NonRigidWeightsDQ')
    expect(query).toBeTruthy()
    expect(query.isRigidlyDeformed()).toBe(false)
    expect(query.getNumInfluencesPerComponent()).toBe(2)
    influences = query.computeJointInfluences()
    expect(influences).toBeDefined()
    ;[indices, weights] = influences!
    expect(indices).toEqual([1, 2, 3, 4])
    expect(weights).toEqual([5, 6, 7, 8])
    skinningMethodAttr = query.getSkinningMethodAttr()
    expect(skinningMethodAttr).toBeDefined()
    expect(skinningMethodAttr!.getValue()).toBe('dualQuaternion')
  })
})
