// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfPoolChainIndexer.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfPoolChainIndexer.cpp
//
// main() is one it(); TF_AXIOM(cond) becomes expect(). VdfPoolChainIndex's
// operators are LessThan/NotEquals.

import { describe, expect, it } from 'vitest'
import { Token as TfToken } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import type { VdfContext } from '../../src/context.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'

// TF_DEFINE_PRIVATE_TOKENS (testVdfPoolChainIndexer.cpp:16-21).
const _tokens = {
  childPoints: TfToken('childPoints'),
  pool: TfToken('pool'),
}

function TF_AXIOM(cond: boolean): void {
  expect(cond).toBe(true)
}

// CallbackFunction (testVdfPoolChainIndexer.cpp:24-27).
function CallbackFunction(_context: VdfContext): void {}

// BuildNetwork (testVdfPoolChainIndexer.cpp:29-122).
function BuildNetwork(graph: VdfTestUtils.Network): void {
  // Callback node types resembling movers and parallel movers.
  const moverType = new VdfTestUtils.CallbackNodeType(CallbackFunction)
  moverType
    .readWrite(VtValueTypes.int, _tokens.pool, _tokens.pool)

  const parallelMoverType = new VdfTestUtils.CallbackNodeType(CallbackFunction)
  parallelMoverType
    .readWrite(VtValueTypes.int, _tokens.pool, _tokens.pool)
    .Read(VtValueTypes.int, _tokens.childPoints)

  // Masks are not considered beyond affects masks.
  const mask = VdfMask.allOnes(2)

  //     Mover1
  //         |
  //     Mover2
  //        /|\
  //       / | \
  //  Mover3 |  \
  //    /    |  |
  //   | Mover4 |
  //   |     |  |
  //    \   /   |
  //     \ /   /
  //  ParallelMover
  //          |
  //      Mover5

  // Movers are not created in pool chain order.
  graph.add('Mover5', moverType)
  const mover5 = graph.Get('Mover5')
  mover5.getVdfNode().GetOutput()!.setAffectsMask(mask)

  graph.add('Mover4', moverType)
  const mover4 = graph.Get('Mover4')
  mover4.getVdfNode().GetOutput()!.setAffectsMask(mask)

  // No affects masks for some movers.
  graph.add('Mover3', moverType)
  const mover3 = graph.Get('Mover3')

  graph.add('Mover2', moverType)
  const mover2 = graph.Get('Mover2')

  graph.add('Mover1', moverType)
  const mover1 = graph.Get('Mover1')
  mover1.getVdfNode().GetOutput()!.setAffectsMask(mask)

  graph.add('ParallelMover', parallelMoverType)
  const parallelMover = graph.Get('ParallelMover')
  parallelMover.getVdfNode().GetOutput()!.setAffectsMask(mask)

  mover1.Output(_tokens.pool).shiftRight(mover2.in(_tokens.pool, mask))

  mover2.Output(_tokens.pool).shiftRight(mover3.in(_tokens.pool, mask))
  mover2.Output(_tokens.pool).shiftRight(mover4.in(_tokens.pool, mask))
  mover2.Output(_tokens.pool).shiftRight(parallelMover.in(_tokens.pool, mask))

  mover3.Output(_tokens.pool).shiftRight(parallelMover.in(_tokens.childPoints, mask))
  mover4.Output(_tokens.pool).shiftRight(parallelMover.in(_tokens.childPoints, mask))

  parallelMover.Output(_tokens.pool).shiftRight(mover5.in(_tokens.pool, mask))
}

describe('testVdfPoolChainIndexer', () => {
  it('main', () => {
    const graph = new VdfTestUtils.Network()
    BuildNetwork(graph)

    const network = graph.getNetwork()

    const mover1Index = network.getPoolChainIndex(graph.Get('Mover1').GetOutput()!)
    const mover2Index = network.getPoolChainIndex(graph.Get('Mover2').GetOutput()!)
    const mover3Index = network.getPoolChainIndex(graph.Get('Mover3').GetOutput()!)
    const mover4Index = network.getPoolChainIndex(graph.Get('Mover4').GetOutput()!)
    const mover5Index = network.getPoolChainIndex(graph.Get('Mover5').GetOutput()!)

    const parallelMoverIndex =
      network.getPoolChainIndex(graph.Get('ParallelMover').GetOutput()!)

    TF_AXIOM(mover1Index.lessThan(mover2Index))

    TF_AXIOM(mover2Index.lessThan(mover3Index))
    TF_AXIOM(mover2Index.lessThan(mover4Index))
    TF_AXIOM(mover2Index.lessThan(parallelMoverIndex))

    TF_AXIOM(mover3Index.lessThan(parallelMoverIndex))
    TF_AXIOM(mover4Index.lessThan(parallelMoverIndex))
    TF_AXIOM(mover3Index.notEquals(mover4Index))

    TF_AXIOM(parallelMoverIndex.lessThan(mover5Index))
  })
})
