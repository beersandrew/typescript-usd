// Expected arrays captured by tools/oracle/faceUniform.cpp against pinned3.7.0.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TopologyRefinerFactory, PrimvarRefiner } from '../../src/far/index.ts'
import { SchemeType, Options, VtxBoundaryInterpolation } from '../../src/sdc/index.ts'
const fixture = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/faceUniform.json'), 'utf8'))
describe('native face ancestry and uniform interpolation', () => {
  for (const sample of fixture.cases) it(sample.name, () => {
    const options = new Options(); options.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.EDGE_AND_CORNER)
    const refiner = TopologyRefinerFactory.create({numVertices:sample.points.length / 3, vertsPerFace:sample.counts, vertIndicesPerFace:sample.indices, holeIndices:sample.holes}, {schemeType:SchemeType.CATMARK, schemeOptions:options})
    refiner.refineUniform({refinementLevel:2})
    const primvars = new PrimvarRefiner(refiner)
    let src: ArrayLike<number> = sample.uniform
    for (let level=1; level<=2; level++) {
      const topology = refiner.GetLevel(level), expected = sample.levels[level-1]
      expect(Array.from({length:topology.getNumFaces()},(_,f)=>topology.getFaceParentFace(f))).toEqual(expected.parents)
      expect(Array.from({length:topology.getNumFaces()},(_,f)=>topology.isFaceHole(f))).toEqual(expected.holes)
      const dst = new Float32Array(topology.getNumFaces()*3)
      primvars.interpolateFaceUniform(level,3,src,dst)
      Array.from(dst).forEach((v,i)=>expect(v).toBeCloseTo(expected.uniform[i],7))
      src=dst
    }
  })
})
