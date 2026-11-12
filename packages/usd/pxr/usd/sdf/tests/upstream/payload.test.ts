// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfPayload.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfPayload.py.

import { describe, expect, it } from 'vitest'
import { Hash as TfHash } from 'typescript-usd/tf'
import { AssetPath, Payload, type LayerOffset } from '../../src/index.ts'
import { SdfPath } from '../../src/path.ts'

// SdfPayload::operator< (payload.cpp); the remaining comparisons follow from
// it as boost::totally_ordered derives them.
type OrderedPayload = Payload & { lessThan(rhs: Payload): boolean }
const lt = (a: Payload, b: Payload): boolean => (a as OrderedPayload).lessThan(b)

// Sdf.LayerOffset(offset, scale).
const layerOffset = (offset = 0, scale = 1): LayerOffset => ({ offset, scale })

describe('testSdfPayload', () => {
  it('test_Basic', () => {
    const emptyPayload = new Payload()

    // Generate a bunch of unique payloads
    const args: [string, unknown[]][] = [
      ['assetPath', ['', '//test/layer.usda']],
      ['primPath', ['', '/rootPrim', '/rootPrim/child']],
      ['layerOffset', [layerOffset(), layerOffset(48, -2)]],
    ]
    const getters: Record<string, (p: Payload) => unknown> = {
      assetPath: p => p.getAssetPath(),
      primPath: p => p.getPrimPath().pathString,
      layerOffset: p => p.getLayerOffset(),
    }
    const payloads: Payload[] = []
    // itertools.product(*[a[1] for a in args])
    for (const assetPath of args[0]![1]) {
      for (const primPath of args[1]![1]) {
        for (const offset of args[2]![1]) {
          const values = [assetPath, primPath, offset]
          const argvalues = args.map(([arg], i) => [arg, values[i]] as const)
          // Python passes only truthy values as keywords; an identity
          // Sdf.LayerOffset() is falsy.
          const kw: Record<string, unknown> = {}
          for (const [arg, value] of argvalues) {
            const isTruthy = arg === 'layerOffset'
              ? !((value as LayerOffset).offset === 0 && (value as LayerOffset).scale === 1)
              : value !== ''
            if (isTruthy) kw[arg] = value
          }

          const payload = new Payload(
            (kw['assetPath'] as string | undefined) ?? '',
            (kw['primPath'] as string | undefined) ?? '',
            (kw['layerOffset'] as LayerOffset | undefined) ?? layerOffset())

          payloads.push(payload)

          // Test property access. (Upstream iterates an already-consumed zip
          // here; these are the assertions the loop states.)
          for (const [arg, value] of argvalues) {
            if (arg in kw) {
              expect(getters[arg]!(payload)).toEqual(value)
            } else {
              expect(getters[arg]!(payload)).toEqual(getters[arg]!(emptyPayload))
            }
          }
        }
      }
    }

    // Sort using <
    payloads.sort((a, b) => (lt(a, b) ? -1 : lt(b, a) ? 1 : 0))

    // Test comparison operators
    for (let i = 0; i < payloads.length; i++) {
      const a = payloads[i]!
      for (let j = i; j < payloads.length; j++) {
        const b = payloads[j]!

        expect(a.equals(b)).toBe(i === j)
        expect(!a.equals(b)).toBe(i !== j)
        expect(!lt(b, a)).toBe(i <= j)
        expect(!lt(a, b)).toBe(i >= j)
        expect(lt(a, b)).toBe(i < j)
        expect(lt(b, a)).toBe(i > j)
      }
    }

    // Test repr. eval(repr(payload)) round-trips through the Python wrapper's
    // __repr__ (wrapPayload.cpp); the round trip reconstructs the payload from
    // its fields.
    for (const payload of payloads) {
      expect(payload.equals(new Payload(
        payload.getAssetPath(), payload.getPrimPath(), payload.getLayerOffset()))).toBe(true)
    }

    // Test invalid asset paths.
    expect(() => new Payload('\x01\x02\x03')).toThrow()

    expect(() => {
      new AssetPath('\x01\x02\x03')
      new AssetPath('foobar', '\x01\x02\x03')
    }).toThrow()
  })

  it('test_Hash', () => {
    expect(TfHash(new Payload())).toBe(TfHash(new Payload('', SdfPath.emptyPath, layerOffset())))
    const payload = new Payload(
      '/path/to/asset',
      SdfPath.fromString('/path/to/prim'),
      layerOffset(10.0, 1.5),
    )
    // Sdf.Payload(payload) copy-constructs.
    expect(TfHash(payload)).toBe(TfHash(new Payload(
      payload.getAssetPath(), payload.getPrimPath(), payload.getLayerOffset())))
  })

  it('test_attributes_cant_be_set', () => {
    // The Python wrapper exposes these as read-only properties
    // (wrapPayload.cpp), so assignment raises AttributeError.
    const payload = new Payload() as unknown as Record<string, unknown>
    expect(() => { payload['assetPath'] = '/path/to/asset' }).toThrow()
    expect(() => { payload['primPath'] = SdfPath.fromString('/path/to/prim') }).toThrow()
    expect(() => { payload['layerOffset'] = layerOffset(10.0, 1.5) }).toThrow()
  })
})
