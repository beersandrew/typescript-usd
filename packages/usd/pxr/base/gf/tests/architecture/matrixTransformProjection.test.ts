// Ported from OpenUSD 26.11.1: pxr/base/gf/homogeneous.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GfMatrix4::Transform projects through GfProject, which scales by 1/w and
// leaves the point unprojected when w is 0 (pxr/base/gf/homogeneous.h:55-58).
import { describe, expect, it } from 'vitest'
import { Matrix4d, Vec3d } from '../../src/index.ts'

describe('GfMatrix4d.Transform', () => {
  it('returns the unprojected point when w is 0', () => {
    const m = new Matrix4d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0)
    expect(Array.from(m.Transform(new Vec3d(1, 2, 3)).data)).toEqual([1, 2, 3])
  })

  it('divides by w otherwise', () => {
    const m = new Matrix4d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2)
    expect(Array.from(m.Transform(new Vec3d(2, 4, 6)).data)).toEqual([1, 2, 3])
  })
})
