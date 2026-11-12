// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdExtCompDependencySort.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/testenv/testHdExtCompDependencySort.cpp —
// HdExtComputationUtils::DependencySort topological ordering.
//
// Three cases, ported faithfully: a linear chain (asserts the exact expected
// order), a tree chain (asserts OccursBefore relationships, since multiple
// valid orderings exist), and a cycle (asserts the sort fails).

import { describe, expect, it } from 'vitest'
import { HdExtComputation } from '../../src/extComputation.ts'
import {
  HdExtComputationUtils,
  type ComputationDependencyMap,
  type HdExtComputationConstPtrVector,
} from '../../src/extComputationUtils.ts'

function occursBefore(
  comps: HdExtComputationConstPtrVector,
  comp1: HdExtComputation,
  comp2: HdExtComputation,
): boolean {
  const it1 = comps.indexOf(comp1)
  const it2 = comps.indexOf(comp2)
  return it1 < it2
}

describe('HdExtComputationUtils.DependencySort', () => {
  it('orders a simple linear chain', () => {
    // Simple linear chain of computations:
    // A <-- B <-- C
    // Read as A depends on B, B depends on C, C does not depend on anything.
    const compA = new HdExtComputation('A')
    const compB = new HdExtComputation('B')
    const compC = new HdExtComputation('C')
    const cdm: ComputationDependencyMap = new Map()
    cdm.set(compA, [compB])
    cdm.set(compB, [compC])
    cdm.set(compC, [])

    const expectedOrder: HdExtComputationConstPtrVector = [compC, compB, compA]

    const sortedComps: HdExtComputationConstPtrVector = []
    const success = HdExtComputationUtils.dependencySort(cdm, sortedComps)

    expect(success).toBe(true)
    expect(sortedComps).toEqual(expectedOrder)
  })

  it('orders a tree chain respecting dependencies', () => {
    // Tree chain of computations:
    // A <-- B <-- C
    // ^     ^
    // |     '-- D <-- E
    // '-- F
    // Read as A depends on B and F, B depends on C and D, D depends on E,
    //         C, E and F do not depend on anything.
    const compA = new HdExtComputation('A')
    const compB = new HdExtComputation('B')
    const compC = new HdExtComputation('C')
    const compD = new HdExtComputation('D')
    const compE = new HdExtComputation('E')
    const compF = new HdExtComputation('F')
    const cdm: ComputationDependencyMap = new Map()
    cdm.set(compA, [compB, compF])
    cdm.set(compB, [compC, compD])
    cdm.set(compD, [compE])
    cdm.set(compC, [])
    cdm.set(compE, [])
    cdm.set(compF, [])

    const sortedComps: HdExtComputationConstPtrVector = []
    const success = HdExtComputationUtils.dependencySort(cdm, sortedComps)

    // We can't compare with an "expected ordering" since it isn't a simple
    // linear chain. Just ensure dependencies are handled.
    expect(success).toBe(true)
    expect(occursBefore(sortedComps, compF, compA)).toBe(true)
    expect(occursBefore(sortedComps, compC, compB)).toBe(true)
    expect(occursBefore(sortedComps, compE, compB)).toBe(true)
    // Upstream repeats the compC-before-compB check here (a harmless typo); we
    // mirror it faithfully.
    expect(occursBefore(sortedComps, compC, compB)).toBe(true)
  })

  it('fails on a cyclic dependency graph', () => {
    // Chain of computations with a cycle:
    // A <-- B  -->  C
    // ^     ^       |
    // |     '       v
    //       '------ D  <-- E
    // '-- F
    // Read as A depends on B and F, B depends on D, C depends on B,
    //         D depends on C and E, E and F do not depend on anything.
    const compA = new HdExtComputation('A')
    const compB = new HdExtComputation('B')
    const compC = new HdExtComputation('C')
    const compD = new HdExtComputation('D')
    const compE = new HdExtComputation('E')
    const compF = new HdExtComputation('F')
    const cdm: ComputationDependencyMap = new Map()
    cdm.set(compA, [compB, compF])
    cdm.set(compB, [compD])
    cdm.set(compC, [compB])
    cdm.set(compD, [compC, compE])
    cdm.set(compE, [])
    cdm.set(compF, [])

    const sortedComps: HdExtComputationConstPtrVector = []
    const success = HdExtComputationUtils.dependencySort(cdm, sortedComps)

    // We expect the dependency sort to fail.
    expect(success).toBe(false)
  })
})
