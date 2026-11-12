// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/testenv/testUsdSkelAnimQuery.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelAnimQuery.py
// (registered as testUsdSkelAnimQuery).
//
// The upstream test draws its joint transforms and blend shape weights from
// Python's `random` seeded with 0; the fixtures/testUsdSkelAnimQuery capture
// replays that sequence against the 26.11.1 build and records it with the
// native query results, which this port also compares against.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Matrix4 } from 'typescript-usd/gf'
import { Stage } from 'typescript-usd/usd'
import { Animation, Cache } from '../../src/index.ts'

const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/testUsdSkelAnimQuery/expected.json', import.meta.url), 'utf8')).payload as {
  xformsPerFrame: Matrix4[][], weightsPerFrame: number[][],
  jointTransformTimeSamples: number[], computedXforms: Matrix4[][],
  animXforms: Matrix4[][], computedWeights: number[][],
}

// Gf.IsClose: every component within epsilon.
const isClose = (a: number | readonly number[], b: number | readonly number[], epsilon: number) =>
  typeof a === 'number'
    ? Math.abs(a - (b as number)) <= epsilon
    : a.length === (b as number[]).length &&
      a.every((x, i) => Math.abs(x - (b as number[])[i]!) <= epsilon)

function assertArrayIsClose<T extends number | readonly number[]>(
  a: readonly T[], b: readonly T[], epsilon = 1e-5): void {
  expect(a.length).toBe(b.length)
  expect(a.every((ca, i) => isClose(ca, b[i]!, epsilon))).toBe(true)
}

describe('TestUsdSkelAnimQuery', () => {
  // Tests anim query implementation for SkelAnimation.
  it('test_SkelAnimation', () => {
    const numFrames = 10

    const stage = Stage.createNew()

    const anim = Animation.define(stage, '/Anim')

    const joints = ['/A', '/B', '/C']
    const blendshapes = ['shapeA', 'shapeB', 'shapeC']

    anim.getJointsAttr().set(joints)
    anim.getBlendShapesAttr().set(blendshapes)

    const xformsPerFrame = fixture.xformsPerFrame
    expect(xformsPerFrame.length).toBe(numFrames)

    xformsPerFrame.forEach((xforms, frame) => {
      anim.setTransforms(xforms, frame)
    })

    const weightsPerFrame = fixture.weightsPerFrame

    weightsPerFrame.forEach((weights, frame) => {
      anim.getBlendShapeWeightsAttr().setTimeSample(frame, weights)
    })

    // Now try reading that all back via computations...

    const cache = new Cache()

    const query = cache.getAnimQuery(anim)!

    expect(query.getPrim().path).toBe(anim.prim.path)
    expect(query.getJointOrder()).toEqual(joints)
    expect(query.getBlendShapeOrder()).toEqual(blendshapes)
    expect(query.jointTransformsMightBeTimeVarying()).toBe(true)
    expect(query.getJointTransformTimeSamples()).toEqual(
      Array.from({ length: numFrames }, (_, i) => i))
    expect(query.getJointTransformTimeSamples()).toEqual(fixture.jointTransformTimeSamples)

    xformsPerFrame.forEach((xforms, frame) => {
      let computedXforms = query.computeJointLocalTransforms(frame)
      assertArrayIsClose(computedXforms, xforms)
      assertArrayIsClose(computedXforms, fixture.computedXforms[frame]!)

      computedXforms = anim.getTransforms(frame)!
      assertArrayIsClose(computedXforms, xforms)
      assertArrayIsClose(computedXforms, fixture.animXforms[frame]!)
    })

    weightsPerFrame.forEach((weights, frame) => {
      const computedWeights = query.computeBlendShapeWeights(frame)
      assertArrayIsClose(computedWeights, weights)
      assertArrayIsClose(computedWeights, fixture.computedWeights[frame]!)
    })
  })
})
