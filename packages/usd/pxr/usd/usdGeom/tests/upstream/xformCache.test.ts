// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomXformCache.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdGeom/testenv/testUsdGeomXformCache.cpp
// (registered as testUsdGeomXformCache). Each TF_VERIFY is an expect.
//
// API mapping: GfMatrix4d is the row-major Matrix4 (row-vector
// convention, as GfMatrix4d); GfMatrix4d::SetTranslate is makeTranslate and
// operator* is mul4. ComputeRelativeTransform's resetXformStack out-param is
// the returned resetXformStack. UsdTimeCode::Default() is undefined.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { IDENTITY_MATRIX, makeTranslate, mul4, type Matrix4 } from 'typescript-usd/gf'
import { Scope, Xform, XformCache } from '../../src/index.ts'

// --------------------------------------------------------------------- //
// This test operates on /RootPrim
// and /RootPrim/Foo
// --------------------------------------------------------------------- //
const rootPrimPath = '/RootPrim'
const scopePrimPath = '/RootPrim/Scope'
const fooPath = '/RootPrim/Scope/Foo'
const fooBarPath = '/RootPrim/Scope/Foo/Bar'
const fooBarBazPath = '/RootPrim/Scope/Foo/Bar/Baz'
const barPath = '/RootPrim/Scope/Bar'

const getXform = (): Matrix4 => makeTranslate(10.0, 20.0, 30.0)
const IDENTITY = IDENTITY_MATRIX

const rows = (m: Matrix4): number[][] =>
  [0, 1, 2, 3].map(r => [m[r * 4]!, m[r * 4 + 1]!, m[r * 4 + 2]!, m[r * 4 + 3]!])

async function createTestData(timeShift = 0): Promise<Stage> {
  // Author scene and compose the Stage
  const stage = await Stage.open(Layer.createAnonymous())

  Scope.define(stage, scopePrimPath)
  Xform.define(stage, rootPrimPath)
  Xform.define(stage, fooPath)
  Xform.define(stage, fooBarPath)
  Xform.define(stage, fooBarBazPath)
  Xform.define(stage, barPath)

  // Setup some test data
  const xform = getXform()
  const xform2 = mul4(xform, xform)
  const xform3 = mul4(xform2, xform)

  for (const path of [rootPrimPath, fooPath, fooBarPath, fooBarBazPath, barPath]) {
    const schema = new Xform(stage.getPrim(path)!, stage)
    const xformOp = schema.addTransformOp()
    if (path === fooBarPath) schema.setResetXformStack(true)
    xformOp.set(rows(xform))
    xformOp.set(rows(xform2), 1 + timeShift)
    xformOp.set(rows(xform3), 2 + timeShift)
  }
  return stage
}

function verifyTransforms(stage: Stage, xfCache: XformCache, xform: Matrix4): void {
  const pseudoRoot = stage.getPrim('/')!
  const root = stage.getPrim(rootPrimPath)!
  const foo = stage.getPrim(fooPath)!
  const fooBar = stage.getPrim(fooBarPath)!
  const fooBarBaz = stage.getPrim(fooBarBazPath)!
  const bar = stage.getPrim(barPath)!
  const x2 = mul4(xform, xform)

  // --------------------------------------------------------------------- //
  // Test GetLocalToWorldTransform, TIME = DEFAULT
  // --------------------------------------------------------------------- //

  // '/' cannot have transformations, so should get IDENTITY
  expect(xfCache.getLocalToWorldTransform(pseudoRoot)).toEqual(IDENTITY)
  expect(xfCache.transformMightBeTimeVarying(pseudoRoot)).toBe(false)
  expect(xfCache.getResetXformStack(pseudoRoot)).toBe(false)

  // Should return xform
  expect(xfCache.getLocalToWorldTransform(root)).toEqual(xform)
  expect(xfCache.transformMightBeTimeVarying(root)).toBe(true)
  expect(xfCache.getResetXformStack(root)).toBe(false)

  // Should return xform * xform
  expect(xfCache.getLocalToWorldTransform(foo)).toEqual(x2)
  expect(xfCache.transformMightBeTimeVarying(foo)).toBe(true)
  expect(xfCache.getResetXformStack(foo)).toBe(false)

  // Should return xform * xform * xform
  expect(xfCache.getLocalToWorldTransform(fooBar)).toEqual(xform)
  expect(xfCache.transformMightBeTimeVarying(fooBar)).toBe(true)
  expect(xfCache.getResetXformStack(fooBar)).toBe(true)

  // Should return xform * xform * xform * xform
  expect(xfCache.getLocalToWorldTransform(fooBarBaz)).toEqual(x2)
  expect(xfCache.transformMightBeTimeVarying(fooBarBaz)).toBe(true)
  expect(xfCache.getResetXformStack(fooBarBaz)).toBe(false)

  // Should return xform * xform
  expect(xfCache.getLocalToWorldTransform(bar)).toEqual(x2)
  expect(xfCache.transformMightBeTimeVarying(bar)).toBe(true)
  expect(xfCache.getResetXformStack(bar)).toBe(false)

  // --------------------------------------------------------------------- //
  // Test GetParentToWorldTransform
  // --------------------------------------------------------------------- //

  // '/' cannot have transformations, so should get IDENTITY
  expect(xfCache.getParentToWorldTransform(pseudoRoot)).toEqual(IDENTITY)
  // Should return IDENTITY
  expect(xfCache.getParentToWorldTransform(root)).toEqual(IDENTITY)
  // Should return xform
  expect(xfCache.getParentToWorldTransform(foo)).toEqual(xform)
  // Should return xform * xform
  expect(xfCache.getParentToWorldTransform(fooBar)).toEqual(x2)
  // Should return xform * xform * xform
  expect(xfCache.getParentToWorldTransform(fooBarBaz)).toEqual(xform)
  // Should return xform
  expect(xfCache.getParentToWorldTransform(bar)).toEqual(xform)

  // --------------------------------------------------------------------- //
  // Test ComputeRelativeTransform
  // --------------------------------------------------------------------- //

  // /RootPrim relative to / : Should return xform.
  expect(xfCache.computeRelativeTransform(root, pseudoRoot).matrix).toEqual(xform)
  // /RootPrim/Scope/Foo relative to /RootPrim. Should return xform.
  expect(xfCache.computeRelativeTransform(foo, root).matrix).toEqual(xform)
  // /RootPrim/Scope/Foo/Bar relative to /RootPrim.
  // fooBar resets the xform stack, so should return xform.
  expect(xfCache.computeRelativeTransform(fooBar, root).matrix).toEqual(xform)
  // /RootPrim/Scope/Foo/Bar/Baz relative to /RootPrim/Foo/Bar.
  // fooBar resets the xform stack, so should return xform*xform.
  expect(xfCache.computeRelativeTransform(fooBarBaz, root).matrix).toEqual(x2)
  // /RootPrim/Scope/Bar relative to /RootPrim. Should return xform.
  expect(xfCache.computeRelativeTransform(bar, root).matrix).toEqual(xform)
}

describe('testUsdGeomXformCache', () => {
  it('XformCacheTest', async () => {
    const stage = await createTestData()
    let xfCache = new XformCache()
    let xform = getXform()
    const x2 = mul4(getXform(), getXform())
    const x3 = mul4(x2, getXform())

    // Verify at time implicitly = UsdTimeCode::Default()
    verifyTransforms(stage, xfCache, xform)

    // Verify at time = 1.0 (xform*xform), via SetTime(1.0)
    xfCache.setTime(1.0)
    xform = x2
    verifyTransforms(stage, xfCache, xform)

    // Verify at time = 2.0 (xform*xform*xform), via ctor(2.0)
    xfCache = new XformCache(2.0)
    xform = x3
    verifyTransforms(stage, xfCache, xform)

    // Verify at after XformCache::Clear(), time=2.0
    xfCache.clear()
    verifyTransforms(stage, xfCache, xform)

    // Verify at time explicitly = UsdTimeCode::Default (xform)
    xfCache.setTime(undefined)
    xform = getXform()
    verifyTransforms(stage, xfCache, xform)

    // Verify mixed stages
    xfCache.setTime(2.0)
    // Verify default stage(xform*xform*xform)...
    xform = x3
    verifyTransforms(stage, xfCache, xform)

    // Verify alternate stage(xform*xform)...
    // Create an alternate version of the main stage, with time shifted by 1.
    const altStage = await createTestData(1)
    // Time shift results in one lest xform multiplication at time = 2.0.
    xform = x2
    verifyTransforms(altStage, xfCache, xform)

    // Verify our original results are still sane.
    xform = x3
    verifyTransforms(stage, xfCache, xform)
  })
})
