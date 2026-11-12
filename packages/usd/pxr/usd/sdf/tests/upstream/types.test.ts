// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfTypes.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfTypes.py (OpenUSD 26.11.1).
//
// Not ported, for want of a typescript-usd API:
// - Sdf.ValueHasValidType and Sdf.GetValueTypeNameForValue (test_TypeValidity
//   and the corresponding assertions of test_ValueValidity / test_AliasedTypes).
// - Sdf.ConvertToValidMetadataDictionary (test_ConvertToValidMetadataDictionary).
// - hash() of an Sdf.ValueTypeName (test_Hash and the hash assertions of
//   test_ValueTypeNameBackwardsCompatibility): SdfValueTypeName has no hash.
// SdfUnregisteredValue exists in typescript-usd (types.ts) but is not exported
// from the package barrel; it is imported from source. Its constructor also
// takes the lexical type; the parser's plain unregistered text uses
// 'unregistered' (textFileFormatParser.ts), used here for
// Sdf.UnregisteredValue(str).

import { isDeepStrictEqual } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  Matrix4d, Quatd, Quatf, Quath,
  Vec2d, Vec2f, Vec2h, Vec2i, Vec3d, Vec3f, Vec3h, Vec3i, Vec4d, Vec4f, Vec4h, Vec4i,
} from 'typescript-usd/gf'
import { Type as TfType, TfErrorMark } from 'typescript-usd/tf'
import { Array as VtArray } from 'typescript-usd/vt'
import {
  AttributeSpec, Layer, ValueTypeNames, findValueTypeName, sdfCreatePrimInLayer,
  type ValueTypeName as SdfValueTypeName,
} from 'typescript-usd/sdf'
import { SdfUnregisteredValue } from '../../src/types.ts'

// Python assertEqual on Sdf/Gf/Vt values: the value type's operator==.
// Python ints compare by value; typescript-usd holds 64-bit integer attribute
// values as bigint, so a number and a bigint compare numerically.
function valuesEqual(a: unknown, b: unknown): boolean {
  if ((typeof a === 'bigint' || typeof b === 'bigint') &&
    (typeof a === 'number' || typeof a === 'bigint') && (typeof b === 'number' || typeof b === 'bigint')) {
    return Number.isInteger(Number(a)) && Number.isInteger(Number(b)) && BigInt(a) === BigInt(b)
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    if (a.constructor !== b.constructor) return false
    const equals = (a as { equals?: (other: unknown) => boolean }).equals
    if (typeof equals === 'function') return equals.call(a, b)
  }
  return isDeepStrictEqual(a, b)
}

const emptyArray = (elementType: string) => new VtArray<unknown>([], TfType.findByName(elementType))

// _TestRoundTrippingValue (testSdfTypes.py:19-32).
function testRoundTrippingValue(typeName: string, value: unknown): void {
  let layer = Layer.createAnonymous()
  const prim = sdfCreatePrimInLayer(layer, '/test')
  const attrSpec = AttributeSpec.new(prim, 'testAttr', findValueTypeName(typeName)!)!
  attrSpec.setDefaultValue(value)
  const layerAsString = layer.exportToString()
  // Now create a new layer and import it.
  layer = Layer.createAnonymous()
  layer.importFromString(layerAsString)
  const read = layer.getAttributeAtPath('/test.testAttr')!.getDefaultValue()
  expect(valuesEqual(read, value), `${typeName}: ${String(read)} != ${String(value)}`).toBe(true)
}

describe('testSdfTypes', () => {
  // test_TypeValidity: not ported (Sdf.ValueHasValidType).

  describe('test_ValueValidity round trip', () => {
    const validValues: Array<[unknown, string]> = [
      ['hello', 'string'],
      [true, 'bool'],
      [1, 'uchar'],
      [1, 'int'],
      [1, 'uint'],
      [1, 'int64'],
      [1, 'uint64'],
      [1.0, 'half'],
      [1.0, 'float'],
      [1.0, 'double'],
      [new Vec2d(1, 2), 'double2'],
      [new Vec2f(1, 2), 'float2'],
      [new Vec2h(1, 2), 'half2'],
      [new Vec2i(1, 2), 'int2'],
      [new Vec3d(1, 2, 3), 'double3'],
      [new Vec3f(1, 2, 3), 'float3'],
      [new Vec3h(1, 2, 3), 'half3'],
      [new Vec3i(1, 2, 3), 'int3'],
      [new Vec4d(1, 2, 3, 4), 'double4'],
      [new Vec4f(1, 2, 3, 4), 'float4'],
      [new Vec4h(1, 2, 3, 4), 'half4'],
      [new Vec4i(1, 2, 3, 4), 'int4'],
      [new Matrix4d(3), 'matrix4d'],
      [new Quatd(1), 'quatd'],
      [new Quatf(2), 'quatf'],
      [new Quath(2), 'quath'],
      [emptyArray('string'), 'string[]'],
      [emptyArray('GfVec2d'), 'double2[]'],
      [emptyArray('GfVec2f'), 'float2[]'],
      [emptyArray('GfVec2h'), 'half2[]'],
      [emptyArray('GfVec2i'), 'int2[]'],
    ]
    // Sdf.ValueHasValidType / Sdf.GetValueTypeNameForValue assertions
    // (testSdfTypes.py:71-80): not ported.
    for (const [value, typeName] of validValues) {
      it(typeName, () => testRoundTrippingValue(typeName, value))
    }
  })

  // test_ConvertToValidMetadataDictionary: not ported
  // (Sdf.ConvertToValidMetadataDictionary).

  describe('test_AliasedTypes round trip', () => {
    const validAliasValues: Array<[unknown, string, string]> = [
      // Color types
      [new Vec3d(1, 2, 3), 'color3d', 'double3'],
      [new Vec3f(1, 2, 3), 'color3f', 'float3'],
      [new Vec3h(1, 2, 3), 'color3h', 'half3'],
      [new Vec4d(1, 2, 3, 4), 'color4d', 'double4'],
      [new Vec4f(1, 2, 3, 4), 'color4f', 'float4'],
      [new Vec4h(1, 2, 3, 4), 'color4h', 'half4'],
      [emptyArray('GfVec3d'), 'color3d[]', 'double3[]'],
      [emptyArray('GfVec3f'), 'color3f[]', 'float3[]'],
      [emptyArray('GfVec3h'), 'color3h[]', 'half3[]'],
      [emptyArray('GfVec4d'), 'color4d[]', 'double4[]'],
      [emptyArray('GfVec4f'), 'color4f[]', 'float4[]'],
      [emptyArray('GfVec4h'), 'color4h[]', 'half4[]'],

      // Point types
      [new Vec3d(1, 2, 3), 'point3d', 'double3'],
      [new Vec3f(1, 2, 3), 'point3f', 'float3'],
      [new Vec3h(1, 2, 3), 'point3h', 'half3'],
      [emptyArray('GfVec3d'), 'point3d[]', 'double3[]'],
      [emptyArray('GfVec3f'), 'point3f[]', 'float3[]'],
      [emptyArray('GfVec3h'), 'point3h[]', 'half3[]'],

      // Normal types
      [new Vec3d(1, 2, 3), 'normal3d', 'double3'],
      [new Vec3f(1, 2, 3), 'normal3f', 'float3'],
      [new Vec3h(1, 2, 3), 'normal3h', 'half3'],
      [emptyArray('GfVec3d'), 'normal3d[]', 'double3[]'],
      [emptyArray('GfVec3f'), 'normal3f[]', 'float3[]'],
      [emptyArray('GfVec3h'), 'normal3h[]', 'half3[]'],

      // Vector types
      [new Vec3d(1, 2, 3), 'vector3d', 'double3'],
      [new Vec3f(1, 2, 3), 'vector3f', 'float3'],
      [new Vec3h(1, 2, 3), 'vector3h', 'half3'],
      [emptyArray('GfVec3d'), 'vector3d[]', 'double3[]'],
      [emptyArray('GfVec3f'), 'vector3f[]', 'float3[]'],
      [emptyArray('GfVec3h'), 'vector3h[]', 'half3[]'],

      // Frame type
      [new Matrix4d(3), 'frame4d', 'matrix4d'],

      // Texture Coordinate type
      [new Vec2d(1, 2), 'texCoord2d', 'double2'],
      [new Vec2f(1, 2), 'texCoord2f', 'float2'],
      [new Vec2h(1, 2), 'texCoord2h', 'half2'],
      [new Vec3d(1, 2, 3), 'texCoord3d', 'double3'],
      [new Vec3f(1, 2, 3), 'texCoord3f', 'float3'],
      [new Vec3h(1, 2, 3), 'texCoord3h', 'half3'],
      [emptyArray('GfVec2d'), 'texCoord2d[]', 'double2[]'],
      [emptyArray('GfVec2f'), 'texCoord2f[]', 'float2[]'],
      [emptyArray('GfVec2h'), 'texCoord2h[]', 'half2[]'],
      [emptyArray('GfVec3d'), 'texCoord3d[]', 'double3[]'],
      [emptyArray('GfVec3f'), 'texCoord3f[]', 'float3[]'],
      [emptyArray('GfVec3h'), 'texCoord3h[]', 'half3[]'],
    ]
    // Sdf.ValueHasValidType / Sdf.GetValueTypeNameForValue(value) ==
    // baseTypeName (testSdfTypes.py:207-209): not ported.
    for (const [value, typeName] of validAliasValues) {
      it(typeName, () => testRoundTrippingValue(typeName, value))
    }
  })

  // test_OutOfRangeIntSettingAndParsing (testSdfTypes.py:214-273).
  describe('test_OutOfRangeIntSettingAndParsing', () => {
    const types = [
      { name: 'uchar', min: 0n, max: 255n },
      { name: 'int', min: -(2n ** 31n), max: 2n ** 31n - 1n },
      { name: 'uint', min: 0n, max: 2n ** 32n - 1n },
      { name: 'int64', min: -(2n ** 63n), max: 2n ** 63n - 1n },
      { name: 'uint64', min: 0n, max: 2n ** 64n - 1n },
    ]

    // Python's layer.ImportFromString raises when the read posts errors.
    function importRaises(layer: Layer, text: string): boolean {
      const mark = new TfErrorMark()
      try {
        let ok: boolean
        try {
          ok = layer.importFromString(text)
        } catch {
          return true
        }
        const posted = !mark.isClean()
        mark.clear()
        return !ok || posted
      } finally {
        mark.dispose()
      }
    }

    // Python's `b.default = v` raises (Tf.ErrorException or OverflowError)
    // when the value cannot be cast to the attribute's type.
    function setDefaultRaises(attr: AttributeSpec, value: number | bigint): boolean {
      const mark = new TfErrorMark()
      try {
        let ok: boolean
        try {
          ok = attr.setDefaultValue(value)
        } catch {
          return true
        }
        const posted = !mark.isClean()
        mark.clear()
        return !ok || posted
      } finally {
        mark.dispose()
      }
    }

    for (const t of types) {
      // Written through SetInfo with SdfUnregisteredValue text
      // (testSdfTypes.py:222-247). Upstream relies on the unregistered value
      // being written as its text; each step checks that before judging the
      // parse, so a writer gap cannot make the rejection cases pass.
      function authorUnregistered(text: string): { layer: Layer, exported: string } {
        const layer = Layer.createAnonymous()
        const p = sdfCreatePrimInLayer(layer, '/p')
        const a = AttributeSpec.new(p, 'attr', ValueTypeNames.Int)!
        a.setInfo('typeName', t.name)
        a.setInfo('default', new SdfUnregisteredValue(text, 'unregistered'))
        const exported = layer.exportToString()
        expect(exported).toContain(`${t.name} attr = ${text}\n`)
        return { layer, exported }
      }

      it(`${t.name}: parsing accepts min and max`, () => {
        // Min and max values should come through okay.
        for (const v of [t.min, t.max]) {
          const { layer, exported } = authorUnregistered(String(v))
          expect(importRaises(layer, exported)).toBe(false)
        }
      })

      it(`${t.name}: parsing rejects min-1 and max+1`, () => {
        // One more than the max and one less than the min should fail.
        for (const v of [t.min - 1n, t.max + 1n]) {
          const { layer, exported } = authorUnregistered(String(v))
          expect(importRaises(layer, exported)).toBe(true)
        }
      })

      // The same parse checks without the SetInfo/export backdoor: upstream
      // notes the alternative of parsing a template string (testSdfTypes.py:
      // 228-232). The text is what upstream's writer emits for the backdoor.
      const template = (text: string) =>
        `#usda 1.0\n\nover "p"\n{\n    ${t.name} attr = ${text}\n}\n\n`
      it(`${t.name}: parsing text accepts min and max`, () => {
        for (const v of [t.min, t.max]) {
          expect(importRaises(Layer.createAnonymous(), template(String(v))), String(v)).toBe(false)
        }
      })
      it(`${t.name}: parsing text rejects min-1 and max+1`, () => {
        for (const v of [t.min - 1n, t.max + 1n]) {
          expect(importRaises(Layer.createAnonymous(), template(String(v))), String(v)).toBe(true)
        }
      })

      // Setting attribute values (testSdfTypes.py:249-262). Python ints are
      // arbitrary precision; a JS number is exact up to 2^53, beyond which
      // the value is a bigint.
      const asJs = (v: bigint): number | bigint =>
        v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v

      it(`${t.name}: setting min/max defaults round-trips`, () => {
        const l = Layer.createAnonymous()
        const q = sdfCreatePrimInLayer(l, '/q')
        const b = AttributeSpec.new(q, 'attr', findValueTypeName(t.name)!)!
        b.setDefaultValue(asJs(t.min))
        expect(BigInt(b.getDefaultValue() as number | bigint)).toBe(t.min)
        b.setDefaultValue(asJs(t.max))
        expect(BigInt(b.getDefaultValue() as number | bigint)).toBe(t.max)
      })

      it(`${t.name}: setting out-of-range defaults fails`, () => {
        const l = Layer.createAnonymous()
        const q = sdfCreatePrimInLayer(l, '/q')
        const b = AttributeSpec.new(q, 'attr', findValueTypeName(t.name)!)!
        expect(setDefaultRaises(b, asJs(t.min - 1n))).toBe(true)
        expect(setDefaultRaises(b, asJs(t.max + 1n))).toBe(true)
      })
    }

    // testSdfTypes.py:264-273: floating point values written as large integers.
    it('reads floating point values written as large integers', () => {
      const layer = Layer.createAnonymous()
      layer.importFromString(
        `#usda 1.0
    over "Prim" {
        float attrf = 18446744073709551616
        double attrd = 340282366920938463463374607431768211456
    }
    `)
      const attrf = layer.getAttributeAtPath('/Prim.attrf')!
      const attrd = layer.getAttributeAtPath('/Prim.attrd')!
      expect(attrf.getDefaultValue()).toBe(1.8446744073709552e+19)
      expect(attrd.getDefaultValue()).toBe(3.402823669209385e+38)
    })
  })

  // test_ValueTypeNameBackwardsCompatibility (testSdfTypes.py:277-347). The
  // hash() assertions are not ported (no SdfValueTypeName hash).
  describe('test_ValueTypeNameBackwardsCompatibility', () => {
    const layer = Layer.createAnonymous()
    layer.importFromString(
      `#usda 1.0

    def "OldAttrTest"
    {
        Vec2i a1
        Vec2h a2
        Vec2f a3
        Vec2d a4
        Vec3i a5
        Vec3h a6
        Vec3f a7
        Vec3d a8
        Vec4i a9
        Vec4h a10
        Vec4f a11
        Vec4d a12
        Point a13
        PointFloat a14
        Normal a15
        NormalFloat a16
        Vector a17
        VectorFloat a18
        Color a19
        ColorFloat a20
        Quath a21
        Quatf a22
        Quatd a23
        Matrix2d a24
        Matrix3d a25
        Matrix4d a26
        Frame a27
    }
    `)

    const cases: Array<[string, SdfValueTypeName]> = [
      ['/OldAttrTest.a1', ValueTypeNames.Int2],
      ['/OldAttrTest.a2', ValueTypeNames.Half2],
      ['/OldAttrTest.a3', ValueTypeNames.Float2],
      ['/OldAttrTest.a4', ValueTypeNames.Double2],
      ['/OldAttrTest.a5', ValueTypeNames.Int3],
      ['/OldAttrTest.a6', ValueTypeNames.Half3],
      ['/OldAttrTest.a7', ValueTypeNames.Float3],
      ['/OldAttrTest.a8', ValueTypeNames.Double3],
      ['/OldAttrTest.a9', ValueTypeNames.Int4],
      ['/OldAttrTest.a10', ValueTypeNames.Half4],
      ['/OldAttrTest.a11', ValueTypeNames.Float4],
      ['/OldAttrTest.a12', ValueTypeNames.Double4],
      ['/OldAttrTest.a13', ValueTypeNames.Point3d],
      ['/OldAttrTest.a14', ValueTypeNames.Point3f],
      ['/OldAttrTest.a15', ValueTypeNames.Normal3d],
      ['/OldAttrTest.a16', ValueTypeNames.Normal3f],
      ['/OldAttrTest.a17', ValueTypeNames.Vector3d],
      ['/OldAttrTest.a18', ValueTypeNames.Vector3f],
      ['/OldAttrTest.a19', ValueTypeNames.Color3d],
      ['/OldAttrTest.a20', ValueTypeNames.Color3f],
      ['/OldAttrTest.a21', ValueTypeNames.Quath],
      ['/OldAttrTest.a22', ValueTypeNames.Quatf],
      ['/OldAttrTest.a23', ValueTypeNames.Quatd],
      ['/OldAttrTest.a24', ValueTypeNames.Matrix2d],
      ['/OldAttrTest.a25', ValueTypeNames.Matrix3d],
      ['/OldAttrTest.a26', ValueTypeNames.Matrix4d],
      ['/OldAttrTest.a27', ValueTypeNames.Frame4d],
    ]
    for (const [attrPath, expectedValueTypeName] of cases) {
      it(attrPath, () => {
        const attr = layer.getAttributeAtPath(attrPath)!
        expect(attr.getTypeName()).toBe(expectedValueTypeName)
      })
    }
  })

  // test_Hash: not ported (no SdfValueTypeName hash).

  // test_UnregisteredValueEquality (testSdfTypes.py:352-356).
  it('test_UnregisteredValueEquality', () => {
    expect(valuesEqual(new SdfUnregisteredValue(String(5), 'unregistered'),
      new SdfUnregisteredValue(String(5), 'unregistered'))).toBe(true)
    expect(valuesEqual(new SdfUnregisteredValue(String(5), 'unregistered'),
      new SdfUnregisteredValue(String(6), 'unregistered'))).toBe(false)
  })
})
