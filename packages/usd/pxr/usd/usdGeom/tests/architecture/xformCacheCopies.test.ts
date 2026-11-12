// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/xformCache.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdGeomXformCache returns transforms by value (xformCache.h), so mutating a
// returned matrix must not change what the cache returns next.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Xform, XformCache } from 'typescript-usd/usdGeom'

describe('UsdGeomXformCache results', () => {
  it('are copies the caller can mutate', () => {
    const stage = Stage.createNew()
    Xform.define(stage, '/Root').addTranslateOp().set([1, 2, 3])
    Xform.define(stage, '/Root/Child')
    const cache = new XformCache(stage)
    cache.getLocalToWorldTransform('/Root/Child')[12] = 99
    cache.getParentToWorldTransform('/Root/Child')[13] = 99
    expect(cache.getLocalToWorldTransform('/Root/Child').slice(12, 15)).toEqual([1, 2, 3])
    expect(cache.getLocalToWorldTransform('/Root').slice(12, 15)).toEqual([1, 2, 3])
  })
})
