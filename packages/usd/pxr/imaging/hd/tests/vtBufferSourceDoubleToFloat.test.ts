// HdVtBufferSource with allowDoubles false converts double arrays to float
// (vtBufferSource.cpp:89-134). For double and GfVec{2,3,4}d arrays the port
// converts the Float64Array storage to a Float32Array directly instead of
// making a GfVec*f per element. This checks that the converted value and the
// bytes handed to the GPU are bit for bit those of the element-wise
// conversion, including -0, NaN, infinities, values that overflow float,
// subnormals and values halfway between two floats.
import { describe, expect, it } from 'vitest'
import { Vec2d as GfVec2d, Vec2f as GfVec2f, Vec3d as GfVec3d, Vec3f as GfVec3f, Vec4d as GfVec4d, Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { HdGetValueData, HdGetValueTupleType } from '../src/types.ts'
import { HdVtBufferSource } from '../src/vtBufferSource.ts'

/** Doubles that exercise float rounding. */
function _Doubles(n: number): number[] {
  const f = new Float32Array(1)
  const halfway = (x: number) => {
    // A double exactly halfway between the float x and the next float up.
    f[0] = x; const lo = f[0]!
    const bits = new Uint32Array(f.buffer); bits[0]! += 1; const hi = f[0]!
    return (lo + hi) / 2
  }
  const special = [0, -0, NaN, Infinity, -Infinity, 1, -1, 3.4028235677973366e38, 3.5e38, -3.5e38,
    1e-45, 1.401298464324817e-45, 7e-46, 1e-40, -1e-40, 5e-324, 1 / 3, Math.PI, 1e20, -1e-20,
    halfway(1), halfway(1.5), halfway(-2.25), halfway(1234.5678), halfway(1e-38), 16777217, 16777219]
  const out = [...special]
  // A fixed pseudo-random sequence, wide in magnitude.
  let seed = 12345
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  while (out.length < n) out.push((rand() - 0.5) * 10 ** Math.floor(rand() * 80 - 40))
  return out.slice(0, n)
}

/** The element-wise conversion of _setValue before the typed fast path. */
function _Reference(values: VtArray<unknown>, to: unknown, make: (v: unknown) => unknown): VtValue {
  return VtValue.createArray(new VtArray<unknown>(values.toArray().map(make), to as never))
}

function _SameBits(a: ArrayBufferView, b: ArrayBufferView): boolean {
  const x = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  const y = new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  return x.length === y.length && x.every((v, i) => v === y[i])
}

describe('HdVtBufferSource double to float conversion', () => {
  const comps = (v: unknown) => (v as { data: readonly number[] }).data
  const cases: { name: string, width: number, from: unknown, to: unknown, make: (c: number[]) => unknown, f: (v: unknown) => unknown }[] = [
    { name: 'double', width: 1, from: VtValueTypes.double, to: VtValueTypes.float, make: c => c[0], f: v => Math.fround(v as number) },
    { name: 'GfVec2d', width: 2, from: VtValueTypes.GfVec2d, to: VtValueTypes.GfVec2f, make: c => new GfVec2d(c[0]!, c[1]!), f: v => new GfVec2f(...comps(v)) },
    { name: 'GfVec3d', width: 3, from: VtValueTypes.GfVec3d, to: VtValueTypes.GfVec3f, make: c => new GfVec3d(c[0]!, c[1]!, c[2]!), f: v => new GfVec3f(...comps(v)) },
    { name: 'GfVec4d', width: 4, from: VtValueTypes.GfVec4d, to: VtValueTypes.GfVec4f, make: c => new GfVec4d(c[0]!, c[1]!, c[2]!, c[3]!), f: v => new GfVec4f(...comps(v)) },
  ]
  for (const c of cases) {
    it(`${c.name} arrays convert to the same floats`, () => {
      const doubles = _Doubles(c.width * 400)
      const elements: unknown[] = []
      for (let i = 0; i < doubles.length; i += c.width) elements.push(c.make(doubles.slice(i, i + c.width)))
      const array = new VtArray<unknown>(elements, c.from as never)
      const expected = _Reference(array, c.to, c.f)
      // The fast path's case: the doubles are in a Float64Array.
      expect(array.cdata()).toBeInstanceOf(Float64Array)

      const source = new HdVtBufferSource('points', VtValue.createArray(array), 1, false)
      expect(source.GetValue().getElementType().getTypeName()).toBe(expected.getElementType().getTypeName())
      // vtBufferSource.cpp:136-143: the element type, with count arraySize.
      expect(source.getTupleType()).toEqual({ type: HdGetValueTupleType(expected).type, count: 1 })
      expect(source.getNumElements()).toBe(elements.length)
      expect(_SameBits(source.getData(), HdGetValueData(expected)!)).toBe(true)
      // The held VtArray reads back as the same elements.
      const got = source.GetValue().UncheckedGet<VtArray<unknown>>().toArray()
      const want = expected.UncheckedGet<VtArray<unknown>>().toArray()
      expect(got.length).toBe(want.length)
      for (let i = 0; i < got.length; ++i) {
        const g = typeof got[i] === 'number' ? [got[i] as number] : comps(got[i])
        const w = typeof want[i] === 'number' ? [want[i] as number] : comps(want[i])
        for (let k = 0; k < c.width; ++k) expect(Object.is(g[k], w[k]), `${i}[${k}] ${g[k]} vs ${w[k]}`).toBe(true)
      }
    })
  }

  it('leaves the source array unchanged', () => {
    const array = new VtArray<GfVec3d>([new GfVec3d(1.1, 2.2, 3.3)], VtValueTypes.GfVec3d)
    new HdVtBufferSource('points', VtValue.createArray(array), 1, false)
    expect([...array.toArray()[0]!.data]).toEqual([1.1, 2.2, 3.3])
  })
})
