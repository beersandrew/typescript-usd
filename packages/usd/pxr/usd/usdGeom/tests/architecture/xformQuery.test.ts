// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/xformCache.cpp,
//  pxr/usd/usdGeom/xformable.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdGeomXformable::XformQuery (xformable.h:353-435) resolves the ordered ops
// once; UsdGeomXformCache keeps one per entry across SetTime
// (xformCache.cpp:84-99, 213-225). Its matrices must be the ones the
// uncached evaluation gives for the same prim and time.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Xform, XformCache, XformOp, XformQuery, evaluateXformOps } from 'typescript-usd/usdGeom'

function scene() {
  const stage = Stage.createNew()
  const root = Xform.define(stage, '/Root')
  const t = root.addTranslateOp()
  t.set([0, 0, 0], 0)
  t.set([10, 20, 30], 10)
  root.addRotateXYZOp().set([10, 20, 30])
  const pivot = root.addTranslateOp(XformOp.PrecisionDouble, 'pivot')
  pivot.set([1, 2, 3])
  root.prim.attr('xformOpOrder').set([
    'xformOp:translate', 'xformOp:translate:pivot', 'xformOp:rotateXYZ', '!invert!xformOp:translate:pivot',
  ])
  const child = Xform.define(stage, '/Root/Child')
  child.addScaleOp().set([2, 2, 2])
  const s = child.addOrientOp()
  s.set([1, 0, 0, 0], 0)
  s.set([0, 0, 1, 0], 10)
  const reset = Xform.define(stage, '/Root/Child/Reset')
  reset.addTranslateOp().set([5, 0, 0])
  reset.addScaleOp().set([3, 3, 3])
  reset.addRotateZOp(XformOp.PrecisionFloat, 'before').set(45)
  reset.prim.attr('xformOpOrder').set([
    'xformOp:rotateZ:before', '!resetXformStack!', 'xformOp:translate', 'xformOp:scale',
  ])
  const missing = Xform.define(stage, '/Root/Missing')
  missing.prim.attr('xformOpOrder').set(['xformOp:translate:absent', 'xformOp:translate'])
  // xformOpOrder already names the op, so AddTranslateOp would refuse it
  // (xformable.cpp:167-175): author the op attribute directly.
  missing.prim.createAttribute('xformOp:translate', 'double3', false).set([7, 8, 9])
  return stage
}

describe('XformQuery', () => {
  it('gives the matrices of the uncached evaluation at every time', () => {
    const stage = scene()
    for (const path of ['/Root', '/Root/Child', '/Root/Child/Reset', '/Root/Missing']) {
      const prim = stage.getPrim(path)!
      const query = new XformQuery(prim)
      for (const time of [undefined, -1, 0, 2.5, 10, 11]) {
        const expected = evaluateXformOps(prim, time)
        expect(query.getLocalTransformation(time)).toEqual(expected.matrix)
        expect(query.getResetXformStack()).toBe(expected.resetsXformStack)
      }
    }
  })

  it('answers the op queries of XformQuery', () => {
    const stage = scene()
    const root = new XformQuery(stage.getPrim('/Root')!)
    expect(root.hasNonEmptyXformOpOrder()).toBe(true)
    expect(root.transformMightBeTimeVarying()).toBe(true)
    expect(root.getTimeSamples()).toEqual([0, 10])
    expect(root.isAttributeIncludedInLocalTransform('xformOp:translate:pivot')).toBe(true)
    expect(root.isAttributeIncludedInLocalTransform('xformOp:scale')).toBe(false)
    const reset = new XformQuery(stage.getPrim('/Root/Child/Reset')!)
    expect(reset.getResetXformStack()).toBe(true)
    expect(reset.isAttributeIncludedInLocalTransform('xformOp:translate')).toBe(true)
    expect(reset.isAttributeIncludedInLocalTransform('xformOp:rotateZ:before')).toBe(false)
    expect(reset.transformMightBeTimeVarying()).toBe(false)
    const empty = new XformQuery()
    expect(empty.hasNonEmptyXformOpOrder()).toBe(false)
    expect(empty.transformMightHaveEffect()).toBe(false)
  })

  it('keeps the cache\'s world transforms equal to a fresh cache\'s across setTime', () => {
    const stage = scene()
    const cache = new XformCache(stage, 0)
    for (const time of [0, 2.5, 10, 4]) {
      cache.setTime(time)
      const fresh = new XformCache(stage, time)
      for (const path of ['/Root', '/Root/Child', '/Root/Child/Reset', '/Root/Missing']) {
        expect(cache.getLocalToWorldTransform(path)).toEqual(fresh.getLocalToWorldTransform(path))
        expect(cache.getLocalTransformation(path)).toEqual(fresh.getLocalTransformation(path))
      }
    }
  })

  it('reads edited op values after setTime without being rebuilt', () => {
    const stage = scene()
    const cache = new XformCache(stage, 0)
    cache.getLocalToWorldTransform('/Root/Child')
    stage.getPrim('/Root/Child')!.getAttr('xformOp:scale')!.set([4, 4, 4])
    stage.getPrim('/Root')!.getAttr('xformOp:translate')!.setTimeSample(10, [1, 1, 1])
    cache.setTime(5)
    expect(cache.getLocalToWorldTransform('/Root/Child'))
      .toEqual(new XformCache(stage, 5).getLocalToWorldTransform('/Root/Child'))
  })
})
