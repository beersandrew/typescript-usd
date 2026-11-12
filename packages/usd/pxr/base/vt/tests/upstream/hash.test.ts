// Ported from OpenUSD 26.11.1: pxr/base/vt/array.h, pxr/base/vt/dictionary.h,
//  pxr/base/vt/testenv/testVtCpp.cpp, pxr/base/vt/value.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Replays fixtures/hash/expected.json, captured (FIXTURES.md)
// by linking the real OpenUSD 26.11.1 libusd_vt: VtValue::GetHash
// (value.cpp:440-447) for held scalars, Gf values and VtArrays (TfHashAppend,
// array.h:1105-1117), and hash_value(VtDictionary) (dictionary.h:303-309).
// testVtCpp.cpp:2040-2060 only asserts that hashing is repeatable; these are
// the native codes.
import { describe, expect, it } from 'vitest'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import {
  Matrix2d, Matrix4d, Quatd, Quatf, Quath, Vec2i, Vec3d, Vec3f, Vec3h, Vec4i,
} from 'typescript-usd/gf'
import {
  Array as VtArray, Dictionary as VtDictionary, DictionaryHash as VtDictionaryHash,
  Value as VtValue, ValueTypes as T,
} from '../../src/index.ts'

const fixture = readOracleFixture(
  new URL('./fixtures/hash/expected.json', import.meta.url)) as {
  cases: { label: string; code: string }[]
}

type TypeName = keyof typeof T
const scalar = (value: unknown, type: TypeName) => VtValue.create(value, T[type]).getHash()
const array = (values: unknown[], type: TypeName) =>
  VtValue.createArray(new VtArray(values, T[type])).getHash()
const dict = () => {
  const d = new VtDictionary()
  d.set('b', VtValue.create(2, T.int))
  d.set('a', VtValue.create('x', T.string))
  return d
}

const values: Record<string, () => bigint> = {
  'empty': () => VtValue.getEmpty().getHash(),
  'bool:true': () => scalar(true, 'bool'),
  'uchar:200': () => scalar(200, 'uchar'),
  'int:42': () => scalar(42, 'int'),
  'int:-7': () => scalar(-7, 'int'),
  'uint:4000000000': () => scalar(4000000000, 'uint'),
  'int64:-5': () => scalar(-5n, 'int64'),
  'uint64:9007199254740993': () => scalar(9007199254740993n, 'uint64'),
  'half:1.5': () => scalar(1.5, 'half'),
  'float:1.23': () => scalar(1.23, 'float'),
  'double:1.5': () => scalar(1.5, 'double'),
  'double:-0': () => scalar(-0, 'double'),
  'string:abc': () => scalar('abc', 'string'),
  'GfVec2i:1,-2': () => scalar(new Vec2i(1, -2), 'GfVec2i'),
  'GfVec3d:1,2,3': () => scalar(new Vec3d(1, 2, 3), 'GfVec3d'),
  'GfVec3f:1,2,3': () => scalar(new Vec3f(1, 2, 3), 'GfVec3f'),
  'GfVec3h:1,2,3': () => scalar(new Vec3h(1, 2, 3), 'GfVec3h'),
  'GfVec4i:1,2,3,4': () => scalar(new Vec4i(1, 2, 3, 4), 'GfVec4i'),
  'GfMatrix2d:1,2,3,4': () => scalar(new Matrix2d(1, 2, 3, 4), 'GfMatrix2d'),
  'GfMatrix4d:identity': () => scalar(new Matrix4d(1), 'GfMatrix4d'),
  'GfQuatd:0.5,1,2,3': () => scalar(new Quatd(0.5, 1, 2, 3), 'GfQuatd'),
  'GfQuatf:0.5,1,2,3': () => scalar(new Quatf(0.5, 1, 2, 3), 'GfQuatf'),
  'GfQuath:0.5,1,2,3': () => scalar(new Quath(0.5, 1, 2, 3), 'GfQuath'),
  'int[]:': () => array([], 'int'),
  'int[]:1,2,3': () => array([1, 2, 3], 'int'),
  'bool[]:1,0,1': () => array([true, false, true], 'bool'),
  'uchar[]:1,2,3': () => array([1, 2, 3], 'uchar'),
  'int64[]:-1,2': () => array([-1n, 2n], 'int64'),
  'float[]:1.5,-0': () => array([1.5, -0], 'float'),
  'double[]:1,2,3': () => array([1, 2, 3], 'double'),
  'half[]:1,2': () => array([1, 2], 'half'),
  'string[]:a,bc': () => array(['a', 'bc'], 'string'),
  'GfVec3f[]:1,2,3;4,5,6': () => array([new Vec3f(1, 2, 3), new Vec3f(4, 5, 6)], 'GfVec3f'),
  'GfVec2i[]:1,2;3,4': () => array([new Vec2i(1, 2), new Vec2i(3, 4)], 'GfVec2i'),
  'GfMatrix4d[]:identity': () => array([new Matrix4d(1)], 'GfMatrix4d'),
  'GfQuatf[]:0.5,1,2,3': () => array([new Quatf(0.5, 1, 2, 3)], 'GfQuatf'),
  'dictionary:': () => new VtDictionaryHash().call(new VtDictionary()),
  'dictionary:b=int 2,a=string x': () => new VtDictionaryHash().call(dict()),
  'VtValue(dictionary):b=int 2,a=string x': () => scalar(dict(), 'dictionary'),
}

describe('Vt hashing (native 26.11.1 capture)', () => {
  for (const c of fixture.cases) {
    it(c.label, () => {
      const compute = values[c.label]
      expect(compute, `unmapped fixture case ${c.label}`).toBeDefined()
      expect(compute!().toString(16).padStart(16, '0')).toBe(c.code)
    })
  }
})
