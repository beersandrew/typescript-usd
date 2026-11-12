// Ported from OpenUSD 26.11.1: pxr/usd/sdf/listOp.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Local value-shape robustness for OpenUSD v26.08 pxr/usd/sdf/listOp.h.
import { describe, expect, it } from 'vitest'
import {
  sdfApplyListOpOperations, sdfApplyListOpToVector, sdfApplyListOrdering,
  sdfComposeListOpsStrongToWeak, sdfNormalizeListOp,
} from '../../src/listOp.ts'

describe('Sdf list-op vector robustness', () => {
  it('normalizes arrays, scalars, and structured operations', () => {
    expect(sdfNormalizeListOp<number>([1, 2])).toMatchObject({ isExplicit: true, explicitItems: [1, 2] })
    expect(sdfNormalizeListOp<string>('one')).toMatchObject({ isExplicit: true, explicitItems: ['one'] })
    expect(sdfNormalizeListOp<number>({ prependedItems: [1] })).toMatchObject({
      isExplicit: false, prependedItems: [1], appendedItems: [], deletedItems: [], orderedItems: [],
    })
  })

  it('deletes and moves prepend/append items with authored order', () => {
    expect(sdfApplyListOpToVector([1, 2, 3], {
      deletedItems: [2], prependedItems: [3, 4], appendedItems: [1, 5],
    })).toEqual([3, 4, 1, 5])
  })

  it('applies ordering without moving untouched leading items', () => {
    expect(sdfApplyListOrdering(['a', 'b', 'c', 'd', 'e'], ['d', 'b']))
      .toEqual(['a', 'd', 'e', 'b', 'c'])
  })

  it('evaluates strongest-first chains weak-to-strong', () => {
    expect(sdfComposeListOpsStrongToWeak([
      { prependedItems: ['strong'], appendedItems: ['tail'] },
      { explicitItems: ['weak'], isExplicit: true },
    ])).toEqual(['strong', 'weak', 'tail'])
  })

  it('uses semantic keys instead of JavaScript object identity', () => {
    type Ref = { asset: string; prim: string; offset: number }
    const key = (ref: Ref): string => `${ref.asset}|${ref.prim}|${ref.offset}`
    const weak = { asset: 'model.usd', prim: '/Root', offset: 0 }
    expect(sdfApplyListOpToVector([weak], { deletedItems: [{ ...weak }] }, { key })).toEqual([])
  })

  it('uses semantic equality while composing list operations', () => {
    type Ref = { asset: string; prim: string }
    const equals = (left: Ref, right: Ref): boolean =>
      left.asset === right.asset && left.prim === right.prim
    const weak = { asset: 'model.usd', prim: '/Root' }
    expect(sdfApplyListOpOperations<Ref>(
      { deletedItems: [{ ...weak }] },
      { isExplicit: true, explicitItems: [weak] },
      { equals },
    )).toMatchObject({ isExplicit: true, explicitItems: [] })
  })
})
