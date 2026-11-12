// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfDynamicTopologicalSorter.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfDynamicTopologicalSorter.cpp
//
// One it() per upstream test function. TF_AXIOM(cond) and TF_VERIFY(cond)
// become expect().

import { describe, expect, it } from 'vitest'

import { VdfDynamicTopologicalSorter } from '../../src/dynamicTopologicalSorter.ts'

// IntVertexSorter (testVdfDynamicTopologicalSorter.cpp:14).
const IntVertexSorter = VdfDynamicTopologicalSorter
type IntVertexSorter = VdfDynamicTopologicalSorter<number>

function TF_AXIOM(cond: boolean): void {
  expect(cond).toBe(true)
}

describe('testVdfDynamicTopologicalSorter', () => {
  it('testEmptyGraph', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    TF_AXIOM(sorter.getPriority(0) === IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(1) === IntVertexSorter.InvalidPriority)

    // Try removing an edge that's not in the sorter.
    sorter.removeEdge(0, 1)
    TF_AXIOM(sorter.getPriority(0) === IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(1) === IntVertexSorter.InvalidPriority)

    // Try to remove a trivial loop that's not in the sorter.
    sorter.removeEdge(1, 1)
    TF_AXIOM(sorter.getPriority(0) === IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(1) === IntVertexSorter.InvalidPriority)

    // Clear an empty sorter.
    sorter.clear()
  })

  it('testSingleEdgeGraph', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    sorter.addEdge(0, 1)
    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))

    sorter.removeEdge(0, 1)
    TF_AXIOM(sorter.getPriority(0) === IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(1) === IntVertexSorter.InvalidPriority)
  })

  it('testTree', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    sorter.addEdge(0, 1)
    sorter.addEdge(0, 2)

    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))
    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(2))

    TF_AXIOM(sorter.getPriority(1) !== sorter.getPriority(2))
  })

  it('testTwoRoots', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    sorter.addEdge(0, 2)
    sorter.addEdge(1, 2)

    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(2))
    TF_AXIOM(sorter.getPriority(1) < sorter.getPriority(2))

    TF_AXIOM(sorter.getPriority(0) !== sorter.getPriority(1))
  })

  it('testAcyclicDiamond', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    sorter.addEdge(0, 1)
    sorter.addEdge(0, 2)
    sorter.addEdge(1, 3)
    sorter.addEdge(2, 3)

    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))
    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(2))

    TF_AXIOM(sorter.getPriority(1) !== sorter.getPriority(2))

    TF_AXIOM(sorter.getPriority(1) < sorter.getPriority(3))
    TF_AXIOM(sorter.getPriority(2) < sorter.getPriority(3))
  })

  it('testCycle', () => {
    // No reasonable order is expected for cycles, just no crash.
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    sorter.addEdge(0, 1)
    sorter.addEdge(1, 0)

    sorter.getPriority(0)
    sorter.getPriority(1)
  })

  it('testReorder', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    sorter.addEdge(0, 1)
    sorter.addEdge(2, 0)

    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))
    TF_AXIOM(sorter.getPriority(2) < sorter.getPriority(0))
  })

  it('testRemoveAndReorder', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    sorter.addEdge(0, 1)
    sorter.addEdge(1, 2)
    sorter.addEdge(2, 3)

    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))
    TF_AXIOM(sorter.getPriority(1) < sorter.getPriority(2))
    TF_AXIOM(sorter.getPriority(2) < sorter.getPriority(3))

    sorter.removeEdge(1, 2)

    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))
    TF_AXIOM(sorter.getPriority(1) !== sorter.getPriority(2))
    TF_AXIOM(sorter.getPriority(2) < sorter.getPriority(3))

    sorter.addEdge(3, 0)

    TF_AXIOM(sorter.getPriority(2) < sorter.getPriority(3))
    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))
    TF_AXIOM(sorter.getPriority(3) < sorter.getPriority(0))
  })

  it('testClear', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    sorter.addEdge(0, 1)
    sorter.addEdge(0, 2)

    TF_AXIOM(sorter.getPriority(0) !== IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(1) !== IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(2) !== IntVertexSorter.InvalidPriority)

    sorter.clear()

    TF_AXIOM(sorter.getPriority(0) === IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(1) === IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(2) === IntVertexSorter.InvalidPriority)
  })

  it('testInsertDuplicateEdges', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    sorter.addEdge(0, 1)
    sorter.addEdge(0, 1)
    sorter.addEdge(0, 1)

    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))

    sorter.removeEdge(0, 1)
    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))

    sorter.removeEdge(0, 1)
    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))

    sorter.removeEdge(0, 1)
    TF_AXIOM(sorter.getPriority(0) === IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(1) === IntVertexSorter.InvalidPriority)
  })

  it('testRemoveInverseEdge', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    sorter.addEdge(0, 1)
    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))

    sorter.removeEdge(1, 0)
    TF_AXIOM(sorter.getPriority(0) !== IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(1) !== IntVertexSorter.InvalidPriority)
    TF_AXIOM(sorter.getPriority(0) < sorter.getPriority(1))
  })

  it('testDenseGraph', () => {
    const sorter: IntVertexSorter = new IntVertexSorter<number>()

    const N = 9

    for (let i = 1; i < N; ++i) {
      for (let j = 1; j < N; ++j) {
        sorter.addEdge(-i, j)
      }
    }

    for (let i = 1; i < N; ++i) {
      for (let j = 1; j < N; ++j) {
        const pi = sorter.getPriority(-i)
        const pj = sorter.getPriority(j)

        TF_AXIOM(pi !== IntVertexSorter.InvalidPriority)
        TF_AXIOM(pj !== IntVertexSorter.InvalidPriority)

        // TF_VERIFY(pi < pj, "Vertices (%d, %d) failed: %d < %d", ...)
        expect(pi < pj, `Vertices (${-i}, ${j}) failed: ${pi} < ${pj}`).toBe(true)
      }
    }
  })
})
