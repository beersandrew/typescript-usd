// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfPrim.py,
//  pxr/usd/sdf/testenv/testSdfVariants.py
// Copyright 2019, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfPrim.py and
// testSdfVariants.py.

import { describe, expect, it } from 'vitest'
import {
  Layer, PrimSpec, sdfCreatePrimInLayer, sdfCreateVariantInLayer, sdfJustCreatePrimInLayer,
} from '../../src/index.ts'

describe('testSdfPrim', () => {
  it('test_CreatePrimInLayer', () => {
    const layer = Layer.createAnonymous()

    expect(sdfCreatePrimInLayer(layer, 'foo')).toBeDefined()
    expect(sdfCreatePrimInLayer(layer, 'foo/bar')).toBeDefined()
    expect(sdfCreatePrimInLayer(layer, 'foo/bar/baz')).toBeDefined()
    expect(layer.getPrimAtPath('/foo')).toBeDefined()
    expect(layer.getPrimAtPath('/foo/bar')).toBeDefined()
    expect(layer.getPrimAtPath('/foo/bar/baz')).toBeDefined()
    expect(sdfCreatePrimInLayer(layer, '/boo')).toBeDefined()
    expect(sdfCreatePrimInLayer(layer, '/boo/bar')).toBeDefined()
    expect(sdfCreatePrimInLayer(layer, '/boo/bar/baz')).toBeDefined()
    expect(layer.getPrimAtPath('/boo')).toBeDefined()
    expect(layer.getPrimAtPath('/boo/bar')).toBeDefined()
    expect(layer.getPrimAtPath('/boo/bar/baz')).toBeDefined()
    expect(sdfCreatePrimInLayer(layer, '.')).toBe(layer.getPrimAtPath('/'))
    expect(() => sdfCreatePrimInLayer(layer, '..')).toThrow()
    expect(() => sdfCreatePrimInLayer(layer, '../..')).toThrow()

    expect(sdfJustCreatePrimInLayer(layer, 'goo')).toBe(true)
    expect(sdfJustCreatePrimInLayer(layer, 'goo/bar')).toBe(true)
    expect(sdfJustCreatePrimInLayer(layer, 'goo/bar/baz')).toBe(true)
    expect(layer.getPrimAtPath('/goo')).toBeDefined()
    expect(layer.getPrimAtPath('/goo/bar')).toBeDefined()
    expect(layer.getPrimAtPath('/goo/bar/baz')).toBeDefined()
    expect(sdfJustCreatePrimInLayer(layer, '/zoo')).toBe(true)
    expect(sdfJustCreatePrimInLayer(layer, '/zoo/bar')).toBe(true)
    expect(sdfJustCreatePrimInLayer(layer, '/zoo/bar/baz')).toBe(true)
    expect(layer.getPrimAtPath('/zoo')).toBeDefined()
    expect(layer.getPrimAtPath('/zoo/bar')).toBeDefined()
    expect(layer.getPrimAtPath('/zoo/bar/baz')).toBeDefined()
    expect(sdfJustCreatePrimInLayer(layer, '.')).toBe(true)
    expect(() => sdfJustCreatePrimInLayer(layer, '..')).toThrow()
    expect(() => sdfJustCreatePrimInLayer(layer, '../..')).toThrow()
  })

  it('test_NameChildrenInsert', () => {
    const layer = Layer.createAnonymous('test')
    const rootPrim = PrimSpec.new(layer, 'Root', 'def', 'Scope')!
    const groundTruthList: string[] = []
    // A deterministic stand-in for random.randint(-100, 100).
    let seed = 12345
    const randint = (lo: number, hi: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return lo + (seed % (hi - lo + 1))
    }

    for (let i = 0; i < 1000; i++) {
      const primName = `geom${i}`
      const insertIndex = randint(-100, 100)
      const primSpec = PrimSpec.new(layer, primName, 'def', 'Scope')!

      // The Python children proxy's insert(index, value) normalizes the index
      // (TfPyNormalizeIndex) before SdfChildrenProxy::_Insert, where -1 means
      // the end; list.insert has the same semantics.
      const size = rootPrim.getNameChildren().size()
      const index = insertIndex < size
        ? Math.max(0, Math.min(insertIndex < 0 ? insertIndex + size : insertIndex, Math.max(size - 1, 0)))
        : -1
      rootPrim.getNameChildren().insert(primSpec, index)
      groundTruthList.splice(insertIndex < 0 ? Math.max(groundTruthList.length + insertIndex, 0) : insertIndex,
        0, primName)
      const nameChildrenList = rootPrim.getNameChildren().values().map(x => x.getName())
      expect(nameChildrenList).toEqual(groundTruthList)
    }
  })

  it('test_InertSpecRemoval', () => {
    const layer = Layer.createAnonymous()

    // A prim hierarchy with only empty overs.
    sdfCreatePrimInLayer(layer, '/InertSubtree/Is/Inert')
    layer.getPrimAtPath('/')!.getNameChildren().erase('InertSubtree')

    // A variant set with only empty variants.
    sdfCreatePrimInLayer(layer, '/InertVariants{v=a}')
    sdfCreatePrimInLayer(layer, '/InertVariants{v=b}')
    layer.getPrimAtPath('/InertVariants')!.getVariantSets().erase('v')
  })

  it('test_Clips', () => {
    const layer = Layer.createAnonymous()
    const prim = sdfCreatePrimInLayer(layer, '/HasClips')!

    // clipSets behavior
    expect(prim.hasClipSets()).toBe(false)
    prim.getClipSetsList().append('clip1')
    expect(prim.hasClipSets()).toBe(true)
    expect(prim.getClipSetsList().getAppendedItems().toArray()).toEqual(['clip1'])
    prim.getClipSetsList().clearEdits()
    expect(prim.hasClipSets()).toBe(false)

    // clips behavior
    expect(prim.getClips().size()).toBe(0)
    prim.getClips().assign({ a: 1 })
    expect(prim.getClips().get('a')).toBe(1)
  })
})

describe('testSdfVariants', () => {
  it('test_VariantNames', () => {
    const layer = Layer.createAnonymous()
    const validVariantNames = [
      // A single leading '.' is allowed.
      '.',
      '.abc',
      // Alphanumeric characters and '_', '|', and '-' are allowed anywhere.
      '_', '_abc', 'abc_', 'ab_c', '|foo', 'foo|', 'fo|o', '-foo', 'foo-', 'fo-o', '123abc', 'abc123',
    ]
    for (const variantName of validVariantNames) {
      expect(sdfCreateVariantInLayer(layer, '/Test', 'v', variantName),
        `Expected ${variantName} to be valid variant`).toBeDefined()
    }

    const invalidVariantNames = [
      '..',
      'a.b.c',
      'foo!@#$%^^&*()',
      // Variable expressions may not be used for variant names. They can,
      // however, be used for variant selections.
      '`${VAR_EXPR}`',
    ]
    for (const variantName of invalidVariantNames) {
      expect(() => sdfCreateVariantInLayer(layer, '/Test', 'v', variantName),
        `Expected '${variantName}' to be invalid variant`).toThrow()
    }
  })

  it('test_VariantSelectionExpressions', () => {
    const layer = Layer.createAnonymous()
    const prim = sdfCreatePrimInLayer(layer, '/VariantTest')!
    prim.getVariantSelections().update({ v: '`"${VAR_NAME}"`' })
    expect(prim.getVariantSelections().get('v')).toBe('`"${VAR_NAME}"`')
  })
})
