// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdBufferSpec.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/testenv/testHdBufferSpec.cpp (OpenUSD 26.11.1).

import { describe, expect, it } from 'vitest'
import { HdBufferSpec, HdBufferSpecEquals, HdBufferSpecLess } from '../../src/bufferSpec.ts'
import { HdTokens } from '../../src/tokens.ts'
import { HdType } from '../../src/types.ts'

const spec = (name: string, type: HdType): HdBufferSpec => ({ name, tupleType: { type, count: 1 } })

describe('testHdBufferSpec', () => {
  it('comparison operators (testHdBufferSpec.cpp:17-53)', () => {
    const pts3 = spec(HdTokens.points, HdType.HdTypeFloatVec3)
    expect(HdBufferSpecEquals(pts3, spec(HdTokens.points, HdType.HdTypeFloatVec3))).toBe(true)
    expect(HdBufferSpecEquals(pts3, spec(HdTokens.points, HdType.HdTypeFloatVec4))).toBe(false)
    expect(HdBufferSpecEquals(pts3, spec(HdTokens.normals, HdType.HdTypeFloatVec3))).toBe(false)
    expect(HdBufferSpecEquals(pts3, spec(HdTokens.points, HdType.HdTypeDoubleVec3))).toBe(false)
    expect(HdBufferSpecLess(pts3, spec(HdTokens.points, HdType.HdTypeFloatVec3))).toBe(false)
    expect(HdBufferSpecLess(spec(HdTokens.normals, HdType.HdTypeFloatVec3), pts3)).toBe(true)
    expect(HdBufferSpecLess(pts3, spec(HdTokens.points, HdType.HdTypeDoubleVec3))).toBe(true)
    expect(HdBufferSpecLess(pts3, spec(HdTokens.points, HdType.HdTypeFloatVec4))).toBe(true)
  })

  it('set operations (testHdBufferSpec.cpp:55-78)', () => {
    const spec1 = [spec(HdTokens.points, HdType.HdTypeFloatVec3),
                   spec(HdTokens.displayColor, HdType.HdTypeFloatVec3)]
    const spec2 = [spec(HdTokens.points, HdType.HdTypeFloatVec3)]
    expect(HdBufferSpec.isSubset(spec2, spec1)).toBe(true)
    expect(HdBufferSpec.isSubset(spec1, spec2)).toBe(false)
    spec2.push(spec(HdTokens.normals, HdType.HdTypeFloatVec4))
    expect(HdBufferSpec.isSubset(spec2, spec1)).toBe(false)
    expect(HdBufferSpec.isSubset(spec1, spec2)).toBe(false)
    const spec3 = HdBufferSpec.computeUnion(spec1, spec2)
    expect(HdBufferSpec.isSubset(spec1, spec3)).toBe(true)
    expect(HdBufferSpec.isSubset(spec2, spec3)).toBe(true)
  })
})
