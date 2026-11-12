// Ported from OpenUSD 26.11.1: pxr/usd/sdf/parserHelpers.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

/**
 * Typed value coercion at the USDA parse boundary.
 *
 * OpenUSD v26.08 pxr/usd/sdf/parserHelpers.cpp coerces each parsed literal
 * into the declared Sdf value type. These tests assert the TypeScript parser
 * produces the same values the USDC crate reader emits (sdf/src/crateFile.ts):
 * vecN -> GfVecN, matrixNd -> GfMatrixNd, quat -> GfQuat, int64 -> bigint,
 * arrays -> VtArray of the element type.
 */

import { describe, expect, it } from 'vitest'
import { Matrix4d, Quatd, Quatf, Vec3f } from 'typescript-usd/gf'
import { Array as VtArray } from 'typescript-usd/vt'
import { parseUsda } from '../../src/textFileFormatParser.ts'

type FieldScene = Record<string, Record<string, { value: unknown }>>

function parse(body: string): FieldScene {
  return parseUsda(`#usda 1.0\n\ndef Prim "root" {\n${body}\n}\n`) as unknown as FieldScene
}

function def(scene: FieldScene, prop = 'p'): unknown {
  return scene[`/root.${prop}`]!['default']!.value
}

describe('usda coercion / scalar', () => {
  it('coerces int to a JS number', () => {
    expect(def(parse('  int p = 42'))).toBe(42)
  })

  it('coerces bool to a JS boolean', () => {
    expect(def(parse('  bool p = true'))).toBe(true)
    expect(def(parse('  bool p = false'))).toBe(false)
  })

  it('coerces int64 to a JS bigint', () => {
    const v = def(parse('  int64 p = 123456789'))
    expect(typeof v).toBe('bigint')
    expect(v).toBe(123456789n)
  })

  it('coerces an int64 literal above 2^53 to the EXACT bigint', () => {
    // The lexer retains the raw decimal text for integer literals, so coercion
    // does BigInt(raw) — no lossy double in the middle. 9223372036854775807 is
    // int64 max; as a JS double it would round to 9223372036854776000.
    const v = def(parse('  int64 p = 9223372036854775807'))
    expect(typeof v).toBe('bigint')
    expect(v).toBe(9223372036854775807n)
    // Sanity: this is genuinely beyond the double-safe range — a double round of
    // the same digits would not survive back to the exact bigint.
    expect(BigInt(Number('9223372036854775807'))).not.toBe(9223372036854775807n)
  })

  it('coerces a uint64 literal above 2^53 to the EXACT bigint', () => {
    const v = def(parse('  uint64 p = 18446744073709551615'))
    expect(v).toBe(18446744073709551615n)
  })

  it('coerces int64[] above 2^53 element-wise to exact bigints', () => {
    const v = def(parse('  int64[] p = [1, 9007199254740993, 9223372036854775807]')) as bigint[]
    expect(v).toEqual([1n, 9007199254740993n, 9223372036854775807n])
  })

  it('keeps token / asset as strings', () => {
    expect(def(parse('  token p = "hi"'))).toBe('hi')
    expect(def(parse('  asset p = @./tex.png@'))).toBe('./tex.png')
  })
})

describe('usda coercion / array', () => {
  it('coerces float[] to a float VtArray', () => {
    const v = def(parse('  float[] p = [1.5, 2.5, 3.5]')) as VtArray<number>
    expect(v.getElementType().getTypeName()).toBe('float')
    expect(v.cdata()).toEqual(new Float32Array([1.5, 2.5, 3.5]))
  })

  it('coerces int[] entries to numbers', () => {
    const v = def(parse('  int[] p = [1, 2, 3]')) as VtArray<number>
    expect(v.cdata()).toEqual(new Int32Array([1, 2, 3]))
    expect(v.toArray().every(n => typeof n === 'number')).toBe(true)
  })

  it('coerces token[] to a token VtArray', () => {
    const v = def(parse('  token[] p = ["a", "b"]')) as VtArray<string>
    expect(v.getElementType().getTypeName()).toBe('token')
    expect(v.toArray()).toEqual(['a', 'b'])
  })
})

describe('usda coercion / vector', () => {
  it('coerces float3 to a GfVec3f', () => {
    const v = def(parse('  float3 p = (1, 2, 3)'))
    expect(v).toBeInstanceOf(Vec3f)
    expect(v).toEqual(new Vec3f(1, 2, 3))
  })

  it('coerces role-typed point3f to a GfVec3f', () => {
    expect(def(parse('  point3f p = (4, 5, 6)'))).toEqual(new Vec3f(4, 5, 6))
  })

  it('coerces float3[] to a GfVec3f VtArray', () => {
    const v = def(parse('  float3[] p = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]')) as VtArray<Vec3f>
    expect(v.getElementType().getTypeName()).toBe('GfVec3f')
    expect(v.cdata()).toEqual(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
  })
})

describe('usda coercion / matrix', () => {
  it('coerces matrix4d to a row-major GfMatrix4d', () => {
    const v = def(parse(
      '  matrix4d p = ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (3, 4, 5, 1) )',
    ))
    // translation lives in the last row (row-vector convention)
    expect(v).toEqual(new Matrix4d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1))
  })

  it('reshapes a flat 16-value matrix4d literal row-major', () => {
    const v = def(parse(
      '  matrix4d p = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1)',
    ))
    expect(v).toEqual(new Matrix4d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 8, 9, 1))
  })
})

describe('usda coercion / quaternion', () => {
  it('coerces quatf to a GfQuatf (USDA writes the real part first)', () => {
    expect(def(parse('  quatf p = (1, 0, 0, 0)'))).toEqual(new Quatf(1, 0, 0, 0))
  })

  it('preserves a non-identity quatd component order', () => {
    expect(def(parse('  quatd p = (0.7071, 0.0, 0.7071, 0.0)'))).toEqual(new Quatd(0.7071, 0, 0.7071, 0))
  })
})
