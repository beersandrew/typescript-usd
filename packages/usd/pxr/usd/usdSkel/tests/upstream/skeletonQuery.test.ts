// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdSkel/testenv/testUsdSkelSkeletonQuery.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelSkeletonQuery.py
// (registered as testUsdSkelSkeletonQuery).
//
// The upstream test draws its rest, root and animation transforms from
// Python's `random` seeded with 0; the fixtures/testUsdSkelSkeletonQuery
// capture replays that sequence against the 26.11.1 build and records it
// with the native query results, which this port also compares against.
//
// API mapping: SkelRoot.MakeMatrixXform() on the fresh prim is
// addTransformOp(); skelRoot.GetLocalTransformation(time) is
// XformCache(time).getLocalTransformation(prim).matrix; hash(query)
// equality is the cache returning the same query object.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Matrix4, mul4, invertMatrix4 } from 'typescript-usd/gf'
import { Stage } from 'typescript-usd/usd'
import { XformCache } from 'typescript-usd/usdGeom'
import {
  Root, Animation, Skeleton, BindingAPI, Topology, Cache, concatJointTransforms,
} from '../../src/index.ts'

const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/testUsdSkelSkeletonQuery/expected.json', import.meta.url), 'utf8')).payload as {
  restXforms: Matrix4[], bindWorldXforms: Matrix4[], rootXforms: Matrix4[],
  animXforms: Matrix4[][],
  frames: {
    local: Matrix4[], skel: Matrix4[], world: Matrix4[], restRelative: Matrix4[],
    restSkel: Matrix4[], restWorld: Matrix4[],
  }[],
}

// Gf.IsClose: every component within epsilon.
const isClose = (a: readonly number[], b: readonly number[], epsilon: number) =>
  a.length === b.length && a.every((x, i) => Math.abs(x - b[i]!) <= epsilon)

function assertArrayIsClose(a: readonly Matrix4[], b: readonly Matrix4[], epsilon = 1e-4): void {
  expect(a.length).toBe(b.length)
  expect(a.every((ca, i) => isClose(ca, b[i]!, epsilon))).toBe(true)
}

describe('TestUsdSkelSkeletonQuery', () => {
  it('test_SkeletonQuery', () => {
    const numFrames = 10

    const stage = Stage.createNew()

    const skelRoot = Root.define(stage, '/SkelRoot')

    const anim = Animation.define(stage, '/SkelRoot/Anim')
    const skel = Skeleton.define(stage, '/SkelRoot/Skel')

    const binding = BindingAPI.apply(skelRoot.prim)
    binding.createSkeletonRel().setTargets([skel.path])
    binding.createAnimationSourceRel().setTargets([anim.path])

    const skelOrder = ['/A', '/A/B', '/A/B/C', '/D', '/D/E/F']
    const [A, AB, ABC, D, DEF] = [0, 1, 2, 3, 4] as const

    // Configure the skel.
    skel.getJointsAttr().set(skelOrder)
    const restXforms = fixture.restXforms

    const topology = new Topology(skelOrder)

    const bindWorldXforms = concatJointTransforms(topology, restXforms)
    assertArrayIsClose(bindWorldXforms, fixture.bindWorldXforms)

    skel.getBindTransformsAttr().set(bindWorldXforms)
    skel.getRestTransformsAttr().set(restXforms)

    // Configure root xforms.
    const rootXforms = fixture.rootXforms
    const rootXfAttr = skelRoot.addTransformOp()
    rootXforms.forEach((xf, frame) => rootXfAttr.set(xf, frame))

    // Configure anim.
    // Leave last element off of anim (tests remapping)
    const animOrder = skelOrder.slice(0, -1)
    anim.getJointsAttr().set(animOrder)

    // Apply joint animations.
    const animXforms = fixture.animXforms
    animXforms.forEach((xforms, frame) => anim.setTransforms(xforms, frame))

    //
    // Constuct query and start testing
    //

    const skelCache = new Cache()

    let query = skelCache.getSkelQuery(skel)!
    expect(query).toBeTruthy()

    expect(skelCache.getSkelQuery(skel)).toBe(query)

    // Validate joint rest xform computations.

    let xforms = query.computeJointLocalTransforms(0, true)
    let expectedXforms = restXforms
    assertArrayIsClose(xforms, expectedXforms)

    const xfCache = new XformCache()

    // Validate joint xforms computations.
    for (let t = 0; t < numFrames; t++) {
      const frameXforms = animXforms[t]!
      const captured = fixture.frames[t]!

      xfCache.setTime(t)

      // Joint local xforms.
      let expectedLocalXforms = [...frameXforms, restXforms[restXforms.length - 1]!]
      let computedLocalXforms = query.computeJointLocalTransforms(t)
      assertArrayIsClose(computedLocalXforms, expectedLocalXforms)
      assertArrayIsClose(computedLocalXforms, captured.local)

      // Joint skel-space xforms.
      let expectedSkelXforms = [
        frameXforms[A]!,
        mul4(frameXforms[AB]!, frameXforms[A]!),
        mul4(mul4(frameXforms[ABC]!, frameXforms[AB]!), frameXforms[A]!),
        frameXforms[D]!,
        mul4(restXforms[DEF]!, frameXforms[D]!),
      ]
      let computedSkelXforms = query.computeJointSkelTransforms(t)
      assertArrayIsClose(computedSkelXforms, expectedSkelXforms)
      assertArrayIsClose(computedSkelXforms, captured.skel)

      // Joint world space xforms.
      let expectedWorldXforms = expectedSkelXforms.map(x => mul4(x, rootXforms[t]!))
      let computedWorldXforms = query.computeJointWorldTransforms(xfCache)
      assertArrayIsClose(computedWorldXforms, expectedWorldXforms)
      assertArrayIsClose(computedWorldXforms, captured.world)

      // Joint rest-relative xforms.
      const expectedRestRelXforms = expectedLocalXforms.map((localXf, i) =>
        mul4(localXf, invertMatrix4(restXforms[i]!)))
      const computedRestRelXforms = query.computeJointRestRelativeTransforms(t)
      assertArrayIsClose(computedRestRelXforms, expectedRestRelXforms)
      assertArrayIsClose(computedRestRelXforms, captured.restRelative)

      //
      // Rest xforms
      //

      // Joint local rest xforms.
      expectedLocalXforms = restXforms
      computedLocalXforms = query.computeJointLocalTransforms(t, true)
      assertArrayIsClose(computedLocalXforms, expectedLocalXforms)

      // Joint skel-space rest xforms.
      expectedSkelXforms = [
        restXforms[A]!,
        mul4(restXforms[AB]!, restXforms[A]!),
        mul4(mul4(restXforms[ABC]!, restXforms[AB]!), restXforms[A]!),
        restXforms[D]!,
        mul4(restXforms[DEF]!, restXforms[D]!),
      ]
      computedSkelXforms = query.computeJointSkelTransforms(0, true)
      assertArrayIsClose(computedSkelXforms, expectedSkelXforms)
      assertArrayIsClose(computedSkelXforms, captured.restSkel)

      // Joint world space rest xforms.
      expectedWorldXforms = expectedSkelXforms.map(x => mul4(x, rootXforms[t]!))
      computedWorldXforms = query.computeJointWorldTransforms(xfCache, true)
      assertArrayIsClose(computedWorldXforms, expectedWorldXforms)
      assertArrayIsClose(computedWorldXforms, captured.restWorld)
    }

    // Validate skel instance transforms.
    rootXforms.forEach((expectedXf, frame) => {
      const rootXf = new XformCache(frame).getLocalTransformation(skelRoot.prim).matrix
      expect(isClose(rootXf, expectedXf, 1e-5)).toBe(true)
    })

    //
    // Test that inactivate animation sources have no effect.
    //

    anim.prim.setActive(false)

    skelCache.clear()

    query = skelCache.getSkelQuery(skel)!

    expectedXforms = restXforms
    let computedXforms = query.computeJointLocalTransforms(10)
    assertArrayIsClose(computedXforms, expectedXforms)

    anim.prim.setActive(true)

    //
    // Test that blocking transform components of the animation source
    // causes the animation source to be ignored.
    //

    anim.getTranslationsAttr().block()

    skelCache.clear()

    query = skelCache.getSkelQuery(skel)!

    expectedXforms = restXforms
    computedXforms = query.computeJointLocalTransforms(5)
    assertArrayIsClose(computedXforms, expectedXforms)
  })
})
