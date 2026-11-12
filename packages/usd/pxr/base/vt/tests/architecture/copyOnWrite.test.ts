// Ported from OpenUSD 26.11.1: pxr/base/vt/array.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// VtArray and VtDictionary are copy-on-write, as upstream's are: a copy shares
// the source's storage until either side is written (pxr/base/vt/array.h
// _DetachIfNotUnique, array.h:403). A frozen array or dictionary is the
// `const` one: its mutating methods throw and Clone()/a copy gives a
// writable one.
import { describe, expect, it } from 'vitest'
import { Type as TfType } from 'typescript-usd/tf'
import { Vec3f } from 'typescript-usd/gf'
import { Array as VtArray, Dictionary as VtDictionary, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'

const floatType = TfType.declare('float')
const vec3fType = TfType.declare('GfVec3f')
const stringType = TfType.declare('string')

describe('VtArray copy-on-write', () => {
  it('shares storage between copies until one is written', () => {
    const a = new VtArray([1, 2, 3], floatType)
    const b = a.Clone()
    expect(b.isIdentical(a)).toBe(true)
    b.set(0, 9)
    expect(b.isIdentical(a)).toBe(false)
    expect(a.toArray()).toEqual([1, 2, 3])
    expect(b.toArray()).toEqual([9, 2, 3])
    // The source detaches too: its copy still shares the old storage.
    const c = a.Clone()
    a.push_back(4)
    expect(c.toArray()).toEqual([1, 2, 3])
    expect(a.toArray()).toEqual([1, 2, 3, 4])
  })

  it('makes a frozen array read-only', () => {
    const a = Object.freeze(new VtArray([new Vec3f(1, 2, 3)], vec3fType))
    expect(() => a.set(0, new Vec3f(0, 0, 0))).toThrow(TypeError)
    expect(() => a.push_back(new Vec3f(0, 0, 0))).toThrow(TypeError)
    expect(() => a.resize(0)).toThrow(TypeError)
    expect(() => a.clear()).toThrow(TypeError)
    expect(() => a.erase(0)).toThrow(TypeError)
    expect(() => a.insert(0, new Vec3f(0, 0, 0))).toThrow(TypeError)
    expect(() => a.assign([])).toThrow(TypeError)
    expect(() => a.data()).toThrow(TypeError)
    expect(() => a.makeUnique()).toThrow(TypeError)
    expect(() => a.swap(new VtArray<Vec3f>([], vec3fType))).toThrow(TypeError)
    // The non-const accessors read.
    expect(a.get(0)).toEqual(new Vec3f(1, 2, 3))
    expect([...a.begin()]).toEqual([new Vec3f(1, 2, 3)])
    // A copy is writable and leaves the frozen array as it was.
    const copy = a.Clone()
    copy.set(0, new Vec3f(4, 5, 6))
    expect(a.get(0)).toEqual(new Vec3f(1, 2, 3))
    expect(copy.get(0)).toEqual(new Vec3f(4, 5, 6))
    expect(Object.isFrozen(a.slice())).toBe(false)
  })

  it('hands out shared element storage frozen', () => {
    const a = new VtArray(['x', 'y'], stringType)
    const b = Object.freeze(a.Clone())
    const storage = b.cdata() as string[]
    expect(() => { storage[0] = 'z' }).toThrow(TypeError)
    expect(a.toArray()).toEqual(['x', 'y'])
    // The writable side detaches before its next write.
    a.set(0, 'z')
    expect(a.toArray()).toEqual(['z', 'y'])
    expect(b.toArray()).toEqual(['x', 'y'])
  })

  it('types typed storage read-only', () => {
    const a = Object.freeze(new VtArray([1, 2], floatType))
    const storage = a.cdata()
    // @ts-expect-error cdata() is the const storage: no element writes.
    storage[0] = 5
    // The compiler check is the protection: a typed array cannot be made
    // read-only at run time without a Proxy (array.ts). Restore it.
    ;(storage as unknown as Float32Array)[0] = 1
    expect(a.toArray()).toEqual([1, 2])
  })
})

describe('VtDictionary copy-on-write', () => {
  it('shares the map until a copy is accessed for writing', () => {
    const a = new VtDictionary([['k', VtValue.create(1, VtValueTypes.int)]])
    const b = new VtDictionary(a)
    b.set('k', VtValue.create(2, VtValueTypes.int))
    b.set('j', VtValue.create(3, VtValueTypes.int))
    expect(a.get('k')!.Get()).toBe(1)
    expect(a.has('j')).toBe(false)
    expect(b.get('k')!.Get()).toBe(2)
    a.delete('k')
    expect(a.size).toBe(0)
    expect(b.size).toBe(2)
  })

  it('makes a frozen dictionary read-only', () => {
    const a = Object.freeze(new VtDictionary([['k', VtValue.create(1, VtValueTypes.int)]]))
    expect(() => a.set('k', VtValue.create(2, VtValueTypes.int))).toThrow(TypeError)
    expect(() => a.delete('k')).toThrow(TypeError)
    expect(() => a.clear()).toThrow(TypeError)
    expect(a.get('k')!.Get()).toBe(1)
    const copy = new VtDictionary(a)
    copy.set('k', VtValue.create(2, VtValueTypes.int))
    expect(a.get('k')!.Get()).toBe(1)
    expect(copy.get('k')!.Get()).toBe(2)
  })
})
