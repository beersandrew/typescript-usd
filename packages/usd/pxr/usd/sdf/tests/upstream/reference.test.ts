// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfReference.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfReference.py.

import { describe, expect, it } from 'vitest'
import { Hash as TfHash } from 'typescript-usd/tf'
import { AssetPath, Reference, type LayerOffset } from '../../src/index.ts'

// SdfReference::operator< (reference.cpp); the remaining comparisons follow
// from it as boost::totally_ordered derives them.
type OrderedReference = Reference & { lessThan(rhs: Reference): boolean }
const lt = (a: Reference, b: Reference): boolean => (a as OrderedReference).lessThan(b)

// Sdf.LayerOffset(offset, scale).
const layerOffset = (offset = 0, scale = 1): LayerOffset => ({ offset, scale })

// Sdf.Reference(**kw).
function makeReference(kw: Record<string, unknown>): Reference {
  return new Reference(
    (kw['assetPath'] as string | undefined) ?? '',
    (kw['primPath'] as string | undefined) ?? '',
    (kw['layerOffset'] as LayerOffset | undefined) ?? layerOffset(),
    (kw['customData'] as Record<string, unknown> | undefined) ?? {})
}

// eval('ref.' + arg)
function getAttr(ref: Reference, arg: string): unknown {
  switch (arg) {
    case 'assetPath': return ref.getAssetPath()
    case 'primPath': return ref.getPrimPath().pathString
    case 'layerOffset': return ref.getLayerOffset()
    case 'customData': return ref.getCustomData()
    default: throw new Error(arg)
  }
}

describe('testSdfReference', () => {
  it('test_Basic', () => {
    // Test all combinations of the following keyword arguments.
    const args: [string, unknown][] = [
      ['assetPath', '//unit/layer.usda'],
      ['primPath', '/rootPrim'],
      ['layerOffset', layerOffset(48, -2)],
      ['customData', { key: 42, other: 'yes' }],
    ]

    for (let n = 0; n < (1 << args.length); n++) {
      const kw: Record<string, unknown> = {}
      for (let i = 0; i < args.length; i++) {
        if ((1 << i) & n) kw[args[i]![0]] = args[i]![1]
      }

      const ref = makeReference(kw)

      // ref == eval(repr(ref)): the Python wrapper's __repr__
      // (wrapReference.cpp) round-trips the reference through its fields.
      expect(ref.equals(new Reference(
        ref.getAssetPath(), ref.getPrimPath(), ref.getLayerOffset(), ref.getCustomData()))).toBe(true)
      for (const [arg, value] of args) {
        if (arg in kw) {
          expect(getAttr(ref, arg)).toEqual(value)
        } else {
          expect(getAttr(ref, arg)).toEqual(getAttr(new Reference(), arg))
        }
      }
    }

    // Testing Sdf.Reference immutability.

    // There is no proxy for the Reference yet (we don't have a good
    // way to support nested proxies).  Make sure the user can't modify
    // temporary Reference objects. The Python wrapper exposes these as
    // read-only properties (wrapReference.cpp, wrapLayerOffset.cpp), so
    // assignment raises AttributeError.
    const mutable = (o: unknown): Record<string, unknown> => o as Record<string, unknown>
    expect(() => { mutable(new Reference())['assetPath'] = '//unit/blah.usda' }).toThrow()

    expect(() => { mutable(new Reference())['primPath'] = '/root' }).toThrow()

    expect(() => { mutable(new Reference())['layerOffset'] = layerOffset() }).toThrow()

    expect(() => { mutable(new Reference().getLayerOffset())['offset'] = 24 }).toThrow()

    expect(() => { mutable(new Reference().getLayerOffset())['scale'] = 2 }).toThrow()

    expect(() => {
      mutable(new Reference())['customData'] = { refCustomData: { refFloat: 1.0 } }
    }).toThrow()

    // Code coverage.
    const ref0 = new Reference('', '', layerOffset(), { a: 0 })
    const ref1 = new Reference('', '', layerOffset(), { a: 0, b: 1 })
    expect(ref0.equals(ref0)).toBe(true)
    expect(!ref0.equals(ref1)).toBe(true)
    expect(lt(ref0, ref1)).toBe(true)
    expect(lt(ref0, ref1)).toBe(true) // ref1 > ref0
    expect(!lt(ref1, ref0)).toBe(true) // ref0 <= ref1
    expect(!lt(ref1, ref0)).toBe(true) // ref1 >= ref0

    // Regression test for bug USD-5000 where less than operator was not
    // fully anti-symmetric
    const r1 = new Reference()
    const r2 = new Reference('//test/layer.usda', '', layerOffset(48, -2))
    expect(lt(r1, r2)).toBe(true)
    expect(lt(r2, r1)).toBe(false)

    // Test IsInternal()

    // r2 can not be an internal reference since it's assetPath is not empty
    expect(r2.isInternal()).toBe(false)

    // ref0 is an internal referennce because it has an empty assetPath
    expect(ref0.isInternal()).toBe(true)

    // Test invalid asset paths.
    expect(() => new Reference('\x01\x02\x03')).toThrow()

    expect(() => {
      new AssetPath('\x01\x02\x03')
      new AssetPath('foobar', '\x01\x02\x03')
    }).toThrow()
  })

  it('test_Hash', () => {
    const reference = new Reference(
      '//path/to/asset',
      '/path/to/prim',
      layerOffset(1.5, 2.8),
      { key: 'value' },
    )
    expect(TfHash(reference)).toBe(TfHash(reference))
    // Sdf.Reference(reference) copy-constructs.
    expect(TfHash(reference)).toBe(TfHash(new Reference(
      reference.getAssetPath(), reference.getPrimPath(), reference.getLayerOffset(),
      reference.getCustomData())))
  })
})
