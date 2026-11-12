// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/hash.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/base/tf/testenv/hash.cpp (Test_TfHash),
// plus a replay of fixtures/hash/expected.json, captured
// by linking the real 26.11.1 libusd_tf. Test_TfHash prints its hash
// codes rather than asserting them; the capture records the deterministic ones
// so they are asserted here. The bit-flip statistics (_TestStatsOne/Two) only
// print and are not ported.
import { describe, expect, it } from 'vitest'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import {
  Hash as TfHash, HashAsCStr, HashCombine, HashCString, TfCompressedBits,
  type Tf_HashState,
} from '../../src/index.ts'

const fixture = readOracleFixture(
  new URL('./fixtures/hash/expected.json', import.meta.url)) as {
  cases: { label: string; code: string }[]
}
const code = (label: string): bigint => {
  const entry = fixture.cases.find(c => c.label === label)
  if (!entry) throw new Error(`no fixture case ${label}`)
  return BigInt(`0x${entry.code}`)
}

const f32 = (...values: number[]) => new Float32Array(values)

// testenv/hash.cpp:23-33
class Two {
  constructor(readonly x: number, readonly y: number) {}
  TfHashAppend(h: Tf_HashState): void { h.append(BigInt(this.x), BigInt(this.y)) }
}

// testenv/hash.cpp:190-208
class MultipleThings {
  ival = 123n
  fval = f32(1.23)
  sval = '123'
  vints = new Int32Array([1, 2, 3])
  sfloats = f32(1.2, 2.3, 3.4)
  TfHashAppend(h: Tf_HashState): void {
    h.append(this.ival, this.fval, this.sval, this.vints)
    h.appendRange(this.sfloats)
  }
}

const bits = (pattern: string) => {
  const b = new TfCompressedBits(pattern.length)
  for (let i = 0; i < pattern.length; ++i) if (pattern[i] === '1') b.Set(i)
  return b
}

const intfloat = [1n, f32(2.34)]
const vint = new Int32Array([1, 2, 3, 4, 5])
const vp = [intfloat, intfloat, intfloat]

// Fixture label -> the JavaScript value whose TfHash maps that upstream value.
const values: Record<string, () => bigint> = {
  'string:': () => TfHash(''),
  'string:a': () => TfHash('a'),
  'string:hello world': () => TfHash('hello world'),
  'string:abcdefghijklmnop': () => TfHash('abcdefghijklmnop'),
  'string:/World/Geom/Mesh_0001.points': () => TfHash('/World/Geom/Mesh_0001.points'),
  'string:utf8': () => TfHash('héllo ☃'),
  'string:x*191': () => TfHash('x'.repeat(191)),
  'string:x*192': () => TfHash('x'.repeat(192)),
  'string:x*300': () => TfHash('x'.repeat(300)),
  'float:0': () => TfHash(f32(0)),
  'float:-0': () => TfHash(f32(-0)),
  'float:1.23': () => TfHash(f32(1.23)),
  'double:0': () => TfHash(0),
  'double:-0': () => TfHash(-0),
  'double:1': () => TfHash(1),
  'double:-1.5': () => TfHash(-1.5),
  'double:3.14159': () => TfHash(3.14159),
  'double:1e300': () => TfHash(1e300),
  'double:5e-324': () => TfHash(5e-324),
  'double:inf': () => TfHash(Infinity),
  'double:-inf': () => TfHash(-Infinity),
  'double:nan': () => TfHash(NaN),
  'bool:false': () => TfHash(false),
  'bool:true': () => TfHash(true),
  'vector<int>:1,2,3,4,5': () => TfHash(vint),
  'vector<int>:': () => TfHash(new Int32Array(0)),
  'vector<uint8_t>:1,2,3': () => TfHash(new Uint8Array([1, 2, 3])),
  'vector<int64_t>:-1,2': () => TfHash(new BigInt64Array([-1n, 2n])),
  'vector<double>:1,2,3': () => TfHash([1, 2, 3]),
  'vector<double>:': () => TfHash([]),
  'vector<float>:1.5,-0': () => TfHash(f32(1.5, -0)),
  'vector<string>:a,bc': () => TfHash(['a', 'bc']),
  'set<int>:1,2,3,4,5': () => TfHash(new Set([5n, 3n, 1n, 2n, 4n])),
  'map<int,uint32_t>:-1=1,2=3,-4=5': () => TfHash(new Map([[-1n, 1n], [2n, 3n], [-4n, 5n]])),
  'map<string,double>:b=2,a=1': () => TfHash(new Map([['b', 2], ['a', 1]])),
  'pair<int,float>:1,2.34': () => TfHash(intfloat),
  'tuple<int,float>:1,2.34': () => TfHash([1n, f32(2.34)]),
  'tuple<int,float,double>:1,2.34,5.678': () => TfHash([1n, f32(2.34), 5.678]),
  'vector<pair<int,float>>:x3': () => TfHash(vp),
  'MultipleThings': () => TfHash(new MultipleThings()),
  'Two:7,9': () => TfHash(new Two(7, 9)),
  'Combine:': () => HashCombine(),
  'Combine:vint,intfloat,vp': () => HashCombine(vint, intfloat, vp),
  'Combine:int32 1,int32 2': () => HashCombine(1n, 2n),
  'Combine:int32 2,int32 1': () => HashCombine(2n, 1n),
  'Combine:string a,string b': () => HashCombine('a', 'b'),
  'Combine:double 1.5,string x,bool true': () => HashCombine(1.5, 'x', true),
  'Combine:uint64 TfHash(string a),int32 3': () => HashCombine(TfHash('a'), 3n),
  'Combine:double 1,double 2,double 3': () => HashCombine(1, 2, 3),
  'CString:': () => HashCString(''),
  'CString:hello world': () => HashCString('hello world'),
}
for (const c of fixture.cases) {
  const [kind, text] = [c.label.slice(0, c.label.indexOf(':')), c.label.slice(c.label.indexOf(':') + 1)]
  if (/^u?int(8|16|32|64)$/.test(kind)) values[c.label] = () => TfHash(BigInt(text))
  if (kind === 'CompressedBits') values[c.label] = () => bits(text).getHash()
  if (kind === 'CompressedBitsFast') values[c.label] = () => bits(text).getFastHash()
}

describe('TfHash (testenv/hash.cpp)', () => {
  it('hashes equal values equally (hash.cpp:223-232, 305-313)', () => {
    expect(TfHash('hello world')).toBe(TfHash('hello world'))
    expect(TfHash(-0)).toBe(TfHash(0))
    expect(TfHash(f32(-0))).toBe(TfHash(f32(0)))
    expect(TfHash(['xyz'])).toBe(TfHash(['xyz']))
  })

  it('treats the C-string view as the bytes before the first NUL', () => {
    expect(HashAsCStr('ab\0cd')).toBe('ab')
    expect(TfHash(HashAsCStr('hello world'))).toBe(code('string:hello world'))
  })

  it('appends the hash_value customization as an integral', () => {
    const customized = { hash_value: () => 123 }
    expect(TfHash(customized)).toBe(code('int32:123'))
  })

  it('appends AppendRange elements by their own overload (hash.h:304-310)', () => {
    const range = { TfHashAppend: (h: Tf_HashState) => h.appendRange(new Int32Array([1, 2, 3, 4, 5])) }
    expect(TfHash(range)).toBe(code('set<int>:1,2,3,4,5'))
  })

  it('refuses cycles', () => {
    const cyclic: unknown[] = []
    cyclic.push(cyclic)
    expect(() => TfHash(cyclic)).toThrow(TypeError)
  })
})

describe('TfHash (native 26.11.1 capture)', () => {
  for (const c of fixture.cases) {
    it(c.label, () => {
      const compute = values[c.label]
      expect(compute, `unmapped fixture case ${c.label}`).toBeDefined()
      expect(compute!().toString(16).padStart(16, '0')).toBe(c.code)
    })
  }
})
