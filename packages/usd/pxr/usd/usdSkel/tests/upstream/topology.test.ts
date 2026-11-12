// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/testenv/testUsdSkelTopology.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdSkel/testenv/testUsdSkelTopology.py
// (registered as testUsdSkelTopology).
//
// API mapping: UsdSkel.Topology(SdfPathVector) is new Topology(SdfPath[]);
// Validate() returns { valid, reason } for Python's (valid, reason) tuple;
// bool(topology) is the joint count being non-zero (the wrapper's __len__).
import { describe, expect, it } from 'vitest'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Topology } from '../../src/index.ts'

function MakeTargets(...paths: (string | null)[]): SdfPath[] {
  return paths.map(p => p ? SdfPath.fromString(p) : SdfPath.emptyPath)
}

describe('TestUsdSkelTopology', () => {
  // Tests basics of a UsdSkelTopology
  it('test_Topology', () => {
    const targets = MakeTargets(
      // Basic parenting. Order shouldn't matter.
      'A', // 0
      'A/B/C', // 1
      'A/B', // 2
      'Nested/Without/Parent/Joint', // 2
      // The direct parent path of a joint may not
      // be included. Will use the first valid ancestor
      // path that is in the set as the parent.
      'D', // 4
      'D/E/F/G', // 5
      // Abs. vs. relative paths shouldn't matter,
      // But we won't map relative paths to abs paths, or vice versa.
      '/A/B/C', // 6
      '/A/B', // 7
      '/A', // 8
      // empty paths should be treated as roots.
      null, // 9,
      // Test invalid paths.
      '/', '..',
    )

    const expectedParentIndices = [-1, 2, 0, -1, -1, 4, 7, 8, -1, -1, -1, -1]

    const topology = new Topology(targets)

    expect(topology.getNumJoints()).toBe(targets.length)
    expect([...topology.getParentIndices()]).toEqual(expectedParentIndices)

    expectedParentIndices.forEach((parentIndex, i) => {
      expect(topology.getParent(i)).toBe(parentIndex)
      if (parentIndex < 0) {
        expect(topology.isRoot(i)).toBe(true)
      }
    })
  })

  // Test UsdSkelTopology validation
  it('test_ValidateTopology', () => {
    let topology = new Topology(MakeTargets('A', 'A/B', 'A/B/C', 'D', 'D/E'))
    expect(topology.getNumJoints() > 0).toBe(true)
    let { valid, reason } = topology.validate()
    expect(valid).toBe(true)

    // Mis-orderered topology (parents don't come before children)
    topology = new Topology(MakeTargets('A/B', 'C', 'A'))
    expect(topology.getNumJoints() > 0).toBe(true);
    ({ valid, reason } = topology.validate())
    expect(valid).toBe(false)
    expect(reason).toBeTruthy()
  })
})
