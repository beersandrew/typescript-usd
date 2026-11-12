// Ported from OpenUSD 26.11.1: pxr/base/vt/array.h, pxr/base/vt/value.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// VtArray and VtValue hold values: copying one copies its elements, and
// equality compares element values (pxr/base/vt/array.h, value.h).
import { describe, expect, it } from 'vitest'
import { Vec3d, Vec3f } from 'typescript-usd/gf'
import { Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, Dictionary as VtDictionary, Value as VtValue, ValueTypes as VtValueTypes } from '../../src/index.ts'

describe('VtArray element copies', () => {
  it('stores Gf elements contiguously and returns them as values', () => {
    const source = [new Vec3d(1, 2, 3), new Vec3d(4, 5, 6)]
    const array = new VtArray(source, VtValueTypes.GfVec3d)
    expect(array.cdata()).toEqual(new Float64Array([1, 2, 3, 4, 5, 6]))
    expect(array.get(1)).toEqual(new Vec3d(4, 5, 6))
    array.get(0).setComponent(0, 9)
    expect(array.get(0)).toEqual(new Vec3d(1, 2, 3))
  })

  it('rounds elements to the element type', () => {
    const array = new VtArray([new Vec3f(0.1, 0.2, 0.3)], VtValueTypes.GfVec3f)
    expect(array.cdata()).toBeInstanceOf(Float32Array)
    expect(array.get(0)).toEqual(new Vec3f(0.1, 0.2, 0.3))
  })

  it('views a buffer without copying until the first mutable access', () => {
    const buffer = new Float32Array([1, 2, 3, 4, 5, 6])
    const array = VtArray.fromBuffer<Vec3f>(VtValueTypes.GfVec3f, buffer)
    expect(array.size).toBe(2)
    expect((array.cdata() as Float32Array).buffer).toBe(buffer.buffer)
    array.set(0, new Vec3f(7, 8, 9))
    expect(buffer[0]).toBe(1)
    expect(array.get(0)).toEqual(new Vec3f(7, 8, 9))
  })

  it('copies record elements rather than aliasing them', () => {
    const record = { a: 1 }
    const array = new VtArray([record], VtValueTypes.dictionary)
    record.a = 2
    expect(array.cdata()[0]).toEqual({ a: 1 })
  })
})

describe('VtValue equality', () => {
  it('compares arrays of Gf values by value', () => {
    const make = () => VtValue.take(new VtArray([new Vec3d(1, 2, 3)], VtValueTypes.GfVec3d), VtValueTypes.GfVec3d)
    expect(make().equals(make())).toBe(true)
    const other = VtValue.take(new VtArray([new Vec3d(1, 2, 4)], VtValueTypes.GfVec3d), VtValueTypes.GfVec3d)
    expect(make().equals(other)).toBe(false)
  })
})

// A VtValue copy shares its held object until either side accesses it
// mutably (value.h:743-770); every JavaScript accessor is the mutable kind,
// so an edit through any accessor never reaches another copy.
describe('VtValue copy-on-write', () => {
  const strings = () => VtValue.create(['a', 'b'], TfType.declare('string[]'))
  const copyOf = (value: VtValue): VtValue => new VtDictionary([['k', value]]).get('k')!

  it('keeps a copy independent of edits made through the original', () => {
    const original = strings()
    const copy = copyOf(original)
    original.Get<string[]>()[0] = 'z'
    expect(copy.Get<string[]>()).toEqual(['a', 'b'])
    expect(original.Get<string[]>()).toEqual(['z', 'b'])
  })

  it('keeps the original independent of edits made through a copy', () => {
    const original = strings()
    const copy = copyOf(original)
    copy.mutate<string[]>()[0] = 'z'
    copyOf(copy).UncheckedGet<string[]>()[1] = 'y'
    expect(original.Get<string[]>()).toEqual(['a', 'b'])
    expect(copy.Get<string[]>()).toEqual(['z', 'b'])
  })

  it('copies a value whose object a caller still holds', () => {
    const held = ['a', 'b']
    const taken = VtValue.take(held, TfType.declare('string[]'))
    const copy = copyOf(taken)
    held[0] = 'z'
    expect(copy.Get<string[]>()).toEqual(['a', 'b'])

    const read = strings()
    const escaped = read.Get<string[]>()
    const later = copyOf(read)
    escaped[0] = 'z'
    expect(later.Get<string[]>()).toEqual(['a', 'b'])
  })

  it('keeps nested dictionaries independent across dictionary copies', () => {
    const source = new VtDictionary([
      ['nested', VtValue.createDictionary(new VtDictionary([['one', VtValue.create(1, VtValueTypes.int)]]))],
    ])
    const copy = new VtDictionary(source)
    const again = new VtDictionary(copy)
    copy.get('nested')!.Get<VtDictionary>().set('two', VtValue.create(2, VtValueTypes.int))
    expect(source.get('nested')!.Get<VtDictionary>().has('two')).toBe(false)
    expect(again.get('nested')!.Get<VtDictionary>().has('two')).toBe(false)
    expect(copy.get('nested')!.Get<VtDictionary>().has('two')).toBe(true)
  })

  it('carries sharing through Swap and Remove', () => {
    const original = strings()
    const copy = copyOf(original)
    const other = VtValue.create(1, VtValueTypes.int)
    other.swap(copy)
    other.remove<string[]>()[0] = 'z'
    expect(original.Get<string[]>()).toEqual(['a', 'b'])
    expect(copy.Get<number>()).toBe(1)
  })
})
