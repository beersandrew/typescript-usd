// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/testenv/testUsdSkelUtils.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelUtils.py
// (registered as testUsdSkelUtils).
//
// test_TransformCompositionAndDecomposition draws its components from
// Python's `random` seeded with 0; the fixtures/testUsdSkelUtils capture
// replays those helpers against the 26.11.1 build and records the
// components with the native MakeTransforms/DecomposeTransforms results.
//
// API mapping: the Python VtArray overloads are the same functions on
// VtArray arguments (mutated in place); a failed DecomposeTransform(s)
// (Tf.ErrorException in Python, raised by the wrapper) returns undefined.
// Python's TODO-only test methods (test_ComputeJointLocalTransforms,
// test_ConcatJointTransforms, test_ComputeJointsExtent, test_PosePointsLBS)
// have no assertions and are not ported.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Matrix4 } from 'typescript-usd/gf'
import { Array as VtArray, ValueTypes } from 'typescript-usd/vt'
import {
  makeTransform, makeTransforms, decomposeTransform, decomposeTransforms,
  normalizeWeights, sortInfluences, resizeInfluences, expandConstantInfluencesToVarying,
} from '../../src/index.ts'

const fixture = JSON.parse(readFileSync(new URL(
  './fixtures/testUsdSkelUtils/expected.json', import.meta.url), 'utf8')).payload as {
  translations: number[][], rotations: number[][], scales: number[][], xforms: number[][],
  decomposedTranslations: number[][],
}

const IntArray = (values: number[] = []) => new VtArray<number>(values, ValueTypes.int)
const FloatArray = (values: number[] = []) => new VtArray<number>(values, ValueTypes.float)

// Gf.IsClose over vectors/matrices: every component within epsilon.
const isClose = (a: readonly number[], b: readonly number[], epsilon: number) =>
  a.length === b.length && a.every((x, i) => Math.abs(x - b[i]!) <= epsilon)

function assertArrayIsClose(a: readonly (readonly number[])[], b: readonly (readonly number[])[],
  epsilon = 1e-4): void {
  expect(a.length).toBe(b.length)
  expect(a.every((ca, i) => isClose(ca, b[i]!, epsilon))).toBe(true)
}

function expectVtEqual(actual: VtArray<number>, expected: VtArray<number>): void {
  expect(actual.toArray()).toEqual(expected.toArray())
}

describe('TestUsdSkelUtils', () => {
  // Tests UsdSkelMakeTransform(), UsdSkelDecomposeTransform()
  // and their array forms.
  it('test_TransformCompositionAndDecomposition', () => {
    const count = 100

    // Make some random transforms.
    const { translations, rotations, scales } = fixture
    expect(translations.length).toBe(count)

    const xforms = makeTransforms(translations, rotations, scales)!
    expect(xforms).toBeTruthy()
    // The native MakeTransforms result for the same components.
    assertArrayIsClose(xforms, fixture.xforms)

    const xformsBuiltIndividually = Array.from({ length: count }, (_, i) =>
      makeTransform(translations[i]!, rotations[i]!, scales[i]!))

    assertArrayIsClose(xforms, xformsBuiltIndividually)

    // Decompose back into components.
    const decomposedComponents = decomposeTransforms(xforms)!
    expect(decomposedComponents).toBeTruthy()

    const decomposedTranslations = decomposedComponents.translations

    assertArrayIsClose(translations, decomposedTranslations)
    assertArrayIsClose(fixture.decomposedTranslations, decomposedTranslations)

    // Make sure the non-array decomposition matches.
    xforms.forEach((xf, i) => {
      const t = decomposeTransform(xf)!.translate
      expect(isClose(t, translations[i]!, 1e-5)).toBe(true)
    })

    // We can't really directly compare the decomposed rotations and scales
    // against the original components used to build our matrices:
    // Decomposition might produce different scales and rotations, but
    // which still give the same composed matrix result.
    // Instead, we rebuild xforms and validate that they give us the
    // xforms that the components were decomposed from.
    let rebuiltXforms = makeTransforms(decomposedComponents.translations,
      decomposedComponents.rotations, decomposedComponents.scales)!
    expect(rebuiltXforms).toBeTruthy()

    assertArrayIsClose(xforms, rebuiltXforms)

    // And rebuilding each matrix individually...
    rebuiltXforms = xforms.map(xf => {
      const { translate, rotate, scale } = decomposeTransform(xf)!
      return makeTransform(translate, rotate, scale)
    })

    assertArrayIsClose(xforms, rebuiltXforms)

    // Decomposing singular matrices should fail!
    const zero = new Array(16).fill(0) as Matrix4
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as Matrix4
    expect(decomposeTransform(zero)).toBeUndefined()
    expect(decomposeTransforms([identity, zero])).toBeUndefined()
  })

  // Test weight normalization.
  it('test_NormalizeWeights', () => {
    // Basic weight normalization.
    const weights = FloatArray([3, 1, 1, 0, 4, 3, 2, 1, 40, 30, 20, 10, 0, 0, 0, 0])

    expect(normalizeWeights(weights, 4)).toBe(true)

    expectVtEqual(weights, FloatArray([0.6, 0.2, 0.2, 0.0,
      0.4, 0.3, 0.2, 0.1,
      0.4, 0.3, 0.2, 0.1,
      0, 0, 0, 0]))

    // Should be okay to normalize an empty array.
    expect(normalizeWeights(FloatArray(), 4)).toBe(true)

    // Failure cases.
    expect(normalizeWeights(FloatArray([1]), 4)).toBe(false)
    expect(normalizeWeights(FloatArray([1]), 0)).toBe(false)
  })

  // Test influence sorting.
  it('test_SortInfluences', () => {
    let indices = IntArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    let weights = FloatArray([3, 1, 4, 2, 1, 2, 3, 4, 4, 3, 2, 1])

    const expectedIndices = IntArray([3, 1, 4, 2, 8, 7, 6, 5, 9, 10, 11, 12])
    const expectedWeights = FloatArray([4, 3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1])

    expect(sortInfluences(indices, weights, 4)).toBe(true)

    expectVtEqual(indices, expectedIndices)
    expectVtEqual(weights, expectedWeights)

    // Check case of numInfluencesPerComponent=1
    indices = IntArray([1, 2, 3, 4])
    weights = FloatArray([3, 1, 4, 2])

    expect(sortInfluences(indices, weights, 1)).toBe(true)

    expectVtEqual(indices, IntArray([1, 2, 3, 4]))
    expectVtEqual(weights, FloatArray([3, 1, 4, 2]))
  })

  // Test influence resizing.
  it('test_ResizeInfluences', () => {
    const origIndices = IntArray([1, 2, 3, 4, 5, 6, 7, 8])

    // truncation
    let indices = new VtArray(origIndices)
    expect(resizeInfluences(indices, 4, 2)).toBe(true)
    expectVtEqual(indices, IntArray([1, 2, 5, 6]))

    // expansion
    indices = new VtArray(origIndices)
    expect(resizeInfluences(indices, 2, 4)).toBe(true)
    expectVtEqual(indices, IntArray([1, 2, 0, 0, 3, 4, 0, 0,
      5, 6, 0, 0, 7, 8, 0, 0]))

    // Weight truncation. Weights should be renormalized.
    let weights = FloatArray([3, 1, 1, 5, 6, 1, 1, 3, 7, 8, 1, 3, 1, 9, 10])
    expect(resizeInfluences(weights, 5, 3)).toBe(true)
    expectVtEqual(weights, FloatArray([0.6, 0.2, 0.2,
      0.2, 0.2, 0.6,
      0.2, 0.6, 0.2]))

    // Weight expansion. Holes must be zero-filled.
    weights = FloatArray([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(resizeInfluences(weights, 3, 5)).toBe(true)
    expectVtEqual(weights, FloatArray([1, 2, 3, 0, 0,
      4, 5, 6, 0, 0,
      7, 8, 9, 0, 0]))

    // Should be okay to resize an empty array.
    let array = IntArray()
    expect(resizeInfluences(array, 10, 4)).toBe(true)
    expect(resizeInfluences(array, 4, 10)).toBe(true)
    array = FloatArray()
    expect(resizeInfluences(array, 10, 4)).toBe(true)
    expect(resizeInfluences(array, 4, 10)).toBe(true)

    // Failure cases
    array = FloatArray([1])
    expect(resizeInfluences(array, 3, 2)).toBe(false)
    expect(resizeInfluences(array, 3, 0)).toBe(false)
  })

  // Test expansion of constant influences into varying influences.
  it('test_ExpandConstantInfluencesToVarying', () => {
    const vals = [1, 2, 3, 4, 5]

    for (const vtType of [IntArray, FloatArray]) {
      let array = vtType(vals)
      expect(expandConstantInfluencesToVarying(array, 3)).toBe(true)
      expectVtEqual(array, vtType([...vals, ...vals, ...vals]))

      array = vtType(vals)
      expect(expandConstantInfluencesToVarying(array, 0)).toBe(true)
      expectVtEqual(array, vtType())

      // Empty array case.
      array = vtType()
      expect(expandConstantInfluencesToVarying(array, 3)).toBe(true)
      expectVtEqual(array, vtType())
    }
  })
})
