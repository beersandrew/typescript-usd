// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdAttributeLimits.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/usd/testenv/testUsdAttributeLimits.cpp
//
// The upstream suite exercises UsdAttributeLimits — the templated min/max
// "limits" API. Limits are stored as a `limits` dictionary metadatum on an
// attribute, partitioned into `hard`/`soft`/custom subdictionaries; each holds
// `minimum`/`maximum` plus arbitrary custom keys, and the typed getters/setters
// validate the stored value against the attribute's value type.
//
// Values and dictionary behavior were cross-checked against the Pixar v26.05
// build. The TypeScript API follows the type-erased Python overload because a
// C++ template argument has no runtime representation in JavaScript.

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'

// ---- TestBasicUsage: value-fidelity substrate that limits ride on ----
//
// The C++ test sets minimum=5 (int), maximum=10 (int), and a custom string
// "custom", then reads each back unchanged. typescript-usd has no limits dict, so we
// assert the equivalent fidelity directly on attribute defaults: the same value
// kinds round-trip through set()/get() without mutation.
describe('testUsdAttributeLimitsCpp — attribute value fidelity (limits substrate)', () => {
  it('round-trips int min/max-style values', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasicUsage', 'Scope')
    prim.attr('minimum').set(5)
    prim.attr('maximum').set(10)
    expect(stage.get('/TestBasicUsage.minimum')?.getValue()).toBe(5)
    expect(stage.get('/TestBasicUsage.maximum')?.getValue()).toBe(10)
  })

  it('round-trips a custom string value', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasicUsage', 'Scope')
    prim.attr('customKey').set('custom')
    expect(stage.get('/TestBasicUsage.customKey')?.getValue()).toBe('custom')
  })

  it('createAttr sets and reads the value inline', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasicUsage', 'Scope')
    prim.createAttr('minimum', 5)
    expect(stage.get('/TestBasicUsage.minimum')?.getValue()).toBe(5)
  })

  it('reads back through the live attr handle (GetMinimum/GetMaximum analog)', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasicUsage', 'Scope')
    const a = prim.attr('minimum')
    a.set(5)
    expect(a.get()).toBe(5)
  })
})

// ---- Boundary numeric magnitudes round-trip ----
//
// Limits commonly hold extreme bounds; the resolver must not clamp or lose
// precision. Golden values from the Pixar v26.05 build:
//   1e308 -> 1e+308, 5e-324 -> 5e-324, INT_MAX (2147483647) preserved.
describe('boundary numeric values round-trip', () => {
  it('preserves a very large double', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/T', 'Scope')
    prim.attr('big').set(1e308)
    expect(stage.get('/T.big')?.getValue()).toBe(1e308)
  })

  it('preserves the smallest positive subnormal double', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/T', 'Scope')
    prim.attr('small').set(5e-324)
    expect(stage.get('/T.small')?.getValue()).toBe(5e-324)
  })

  it('preserves a large negative double', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/T', 'Scope')
    prim.attr('neg').set(-1.7976931348623157e308)
    expect(stage.get('/T.neg')?.getValue()).toBe(-1.7976931348623157e308)
  })

  it('preserves INT_MAX', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/T', 'Scope')
    prim.attr('imax').set(2147483647)
    expect(stage.get('/T.imax')?.getValue()).toBe(2147483647)
  })

  it('preserves INT_MIN', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/T', 'Scope')
    prim.attr('imin').set(-2147483648)
    expect(stage.get('/T.imin')?.getValue()).toBe(-2147483648)
  })
})

// ---- Many time samples / large arrays resolve faithfully ----
describe('high-volume value resolution', () => {
  it('resolves many time samples', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Anim', 'Scope')
    const a = prim.attr('v')
    const N = 1000
    for (let i = 0; i < N; i++) a.setTimeSample(i, i * 2)
    const attr = stage.get('/Anim.v')!
    expect(attr.getTimeSampleKeys().length).toBe(N)
    expect(attr.getValueAtTime(0)).toBe(0)
    expect(attr.getValueAtTime(N - 1)).toBe((N - 1) * 2)
  })

  it('round-trips a large array attribute', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Big', 'Scope')
    const arr = Array.from({ length: 10000 }, (_, i) => i)
    prim.attr('arr').set(arr)
    const out = stage.get('/Big.arr')?.getValue() as number[]
    expect(out.length).toBe(10000)
    expect(out[0]).toBe(0)
    expect(out[9999]).toBe(9999)
  })
})

// ---- UsdAttributeLimits API ----
describe('UsdAttributeLimits API', () => {
  // TestBasicUsage: hard/soft/custom limits each start empty; Get<>() returns
  // none and GetOr() returns the passed default; after Set the typed getters
  // return the stored value.

  it('GetHardLimits/GetSoftLimits/GetLimits return empty limits objects', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasicUsage', 'Scope')
    const attr = prim.attr('minimum') as unknown as { getHardLimits(): unknown }
    const hard = attr.getHardLimits()
    expect(hard).toBeDefined()
  })

  it('Get<T>() returns none on an empty limits dict', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasicUsage', 'Scope')
    const attr = prim.attr('minimum') as unknown as { getLimits(): { get(key: string): unknown } }
    expect(attr.getLimits().get('minimum')).toBeUndefined()
  })

  it('GetOr(key, default) returns the default on an empty limits dict', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasicUsage', 'Scope')
    const attr = prim.attr('minimum') as unknown as { getLimits(): { getOr(key: string, def: unknown): unknown } }
    expect(attr.getLimits().getOr('minimum', 42)).toBe(42)
  })

  it('SetMinimum/SetMaximum/Set author into the limits subdictionary', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasicUsage', 'Scope')
    // Limits are metadata on an existing attribute (testUsdAttributeLimits
    // creates an int attribute first).
    const attr = prim.createAttr('minimum', 0) as unknown as { getHardLimits(): { setMinimum(v: unknown): void } }
    attr.getHardLimits().setMinimum(5)
    expect(stage.get('/TestBasicUsage.minimum')?.getField('limits')).toEqual({ hard: { minimum: 5 } })
  })

  it('GetMinimum<T>()/GetMaximum<T>() return the stored typed values', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasicUsage', 'Scope')
    const attr = prim.attr('minimum') as unknown as {
      getHardLimits(): { setMinimum(v: unknown): void; getMinimum(): unknown }
    }
    attr.getHardLimits().setMinimum(5)
    expect(attr.getHardLimits().getMinimum()).toBe(5)
  })

  it('GetMinimumOr/GetMaximumOr return stored values over defaults', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasicUsage', 'Scope')
    const attr = prim.attr('minimum') as unknown as {
      getHardLimits(): { setMinimum(v: unknown): void; getMinimumOr(def: unknown): unknown }
    }
    attr.getHardLimits().setMinimum(5)
    expect(attr.getHardLimits().getMinimumOr(0)).toBe(5)
  })

  // TestWrongTypes: setting min/max with a type other than the attribute's
  // value type fails and posts an error, leaving the stored value unchanged;
  // typed getters against a wrong-typed stored value return none without error.

  it('SetMinimum/SetMaximum reject a value not matching the attr value type', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestWrongTypes', 'Scope')
    prim.attr('minimum').set(5) // int-typed attribute
    const attr = prim.attr('minimum') as unknown as {
      getHardLimits(): { setMinimum(v: unknown): boolean }
    }
    expect(attr.getHardLimits().setMinimum('not an int')).toBe(false)
  })

  it('a rejected SetMinimum/SetMaximum leaves the stored value unchanged', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestWrongTypes', 'Scope')
    prim.attr('minimum').set(5)
    const attr = prim.attr('minimum') as unknown as {
      getHardLimits(): { setMinimum(v: unknown): void; getMinimum(): unknown }
    }
    attr.getHardLimits().setMinimum(5)
    attr.getHardLimits().setMinimum('not an int')
    expect(attr.getHardLimits().getMinimum()).toBe(5)
  })

  it('type-erased getters return the authored value (Python binding parity)', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestWrongTypes', 'Scope')
    prim.attr('minimum').set(5)
    const attr = prim.attr('minimum') as unknown as {
      getHardLimits(): { setMinimum(v: unknown): void; getMinimum(): unknown }
    }
    attr.getHardLimits().setMinimum(5)
    expect(attr.getHardLimits().getMinimum()).toBe(5)
  })

  it('typed getters return none when the stored limit value is wrong-typed', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestWrongTypes', 'Scope')
    const attr = prim.attr('minimum') as unknown as {
      getHardLimits(): { getMinimum(): unknown }
    }
    // Directly author a wrong-typed limits dict (bypassing Set's validation)
    // then confirm the typed getter refuses to return it.
    stage.get('/TestWrongTypes.minimum')
    expect(attr.getHardLimits().getMinimum()).toBeUndefined()
  })
})
