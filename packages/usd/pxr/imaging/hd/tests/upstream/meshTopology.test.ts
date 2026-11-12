// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hd/meshTopology.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdMeshTopology against a native capture
// (fixtures/unitTestDelegate, "meshTopology"). Node test.
import { describe, expect, it } from 'vitest'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import { HdMeshTopology } from '../../src/meshTopology.ts'

const expected = readOracleFixture(new URL('./fixtures/unitTestDelegate/expected.json', import.meta.url)).meshTopology

const cases: Array<[string, string, number[], number[], number[], number]> = [
  ['none', 'rightHanded', [], [], [], 0],
  ['catmullClark', 'leftHanded', [4, 3], [0, 1, 2, 3, 3, 2, 7], [1], 2],
  ['loop', 'rightHanded', [3], [5, 1, 2], [], 1],
]

describe('HdMeshTopology (native capture)', () => {
  cases.forEach(([scheme, orientation, counts, indices, holes, refine], i) => {
    it(`matches case ${i}`, () => {
      const t = new HdMeshTopology(scheme, orientation, counts, indices, holes, refine)
      expect({
        scheme: t.getScheme(), orientation: t.getOrientation(), counts: t.getFaceVertexCounts(),
        indices: t.getFaceVertexIndices(), holes: t.getHoleIndices(), refineLevel: t.getRefineLevel(),
        numPoints: t.getNumPoints(), numFaces: t.getNumFaces(), numFaceVaryings: t.getNumFaceVaryings(),
        stream: t.getPxOsdMeshTopology().ToString(),
        computeNumPoints: HdMeshTopology.computeNumPoints(indices),
      }).toEqual(expected[i])
    })
  })

  it('copies with a new refine level and compares by value (meshTopology.cpp:33-45, 176-186)', () => {
    const [, , counts, indices, holes] = cases[1]!
    const a = new HdMeshTopology('catmullClark', 'leftHanded', counts, indices, holes, 2)
    const b = new HdMeshTopology(a, 0)
    expect(b.getRefineLevel()).toBe(0)
    expect(b.getNumPoints()).toBe(a.getNumPoints())
    expect(b.Equals(a)).toBe(false)
    expect(new HdMeshTopology(a, 2).Equals(a)).toBe(true)
    expect(new HdMeshTopology(a, 2).computeHash()).toBe(a.computeHash())
    // Topological visibility is not hashed (meshTopology.cpp:239-241).
    const c = new HdMeshTopology(a, 2)
    c.setInvisibleFaces([0])
    expect(c.computeHash()).toBe(a.computeHash())
    expect(c.Equals(a)).toBe(false)
  })

  it('keeps the existing (scheme, orientation, counts, indices, holes) constructor', () => {
    const t = new HdMeshTopology('none', 'rightHanded', [3], [0, 1, 2], [0])
    expect(t.getHoleIndices()).toEqual([0])
    expect(t.getRefineLevel()).toBe(0)
  })
})
