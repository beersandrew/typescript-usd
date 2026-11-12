// PxOsdMeshTopology / PxOsdSubdivTags / PxOsdMeshTopologyValidation against a
// native capture (hd/tests/upstream/fixtures/unitTestDelegate,
// "validation"): upstream pxOsd has no testenv. Node test, no browser.
import { describe, expect, it } from 'vitest'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import { PxOsdMeshTopology } from '../../src/meshTopology.ts'
import { PxOsdSubdivTags } from '../../src/subdivTags.ts'
import { PxOsdOpenSubdivTokens } from '../../src/tokens.ts'
import { PxOsdMeshTopologyValidationCodeGetName } from '../../src/meshTopologyValidation.ts'

const expected = readOracleFixture(new URL(
  '../../../hd/tests/upstream/fixtures/unitTestDelegate/expected.json', import.meta.url)).validation

// The topologies of the capture's "validation" block, in order.
function topologies(): PxOsdMeshTopology[] {
  const badTags = new PxOsdSubdivTags('bogusVtx', 'bogusFvar', 'bogusCrease', 'bogusTri',
    [0, 9, 1], [1, 3], [-1.0], [7], [-2.0, 1.0])
  return [
    new PxOsdMeshTopology(PxOsdOpenSubdivTokens.catmullClark, PxOsdOpenSubdivTokens.rightHanded, [4], [0, 1, 2, 3]),
    new PxOsdMeshTopology('catmark', 'up', [2, 4], [0, -1, 2], [-1, 5], badTags),
    new PxOsdMeshTopology(PxOsdOpenSubdivTokens.loop, PxOsdOpenSubdivTokens.leftHanded, [3, 3], [0, 1, 2, 2, 1, 3],
      new PxOsdSubdivTags('', '', '', '', [0, 1, 2], [3], [1.0], [3], [1.0])),
  ]
}

describe('PxOsdMeshTopology (native capture)', () => {
  topologies().forEach((topology, i) => {
    it(`validates case ${i} as OpenUSD does`, () => {
      const validation = topology.validate()
      expect(validation.isValid()).toBe(expected[i].valid)
      expect([...validation].map(e => ({
        code: PxOsdMeshTopologyValidationCodeGetName(e.code), message: e.message,
      }))).toEqual(expected[i].invalidations)
    })

    it(`streams case ${i} as operator<< does`, () => {
      expect(topology.ToString()).toBe(expected[i].stream)
      expect(topology.getSubdivTags().ToString()).toBe(expected[i].tags)
    })
  })

  it('caches a successful validation and keeps value semantics in the With* copies', () => {
    const [valid] = topologies()
    expect(valid!.validate().isValid()).toBe(true)
    expect(valid!.validate().isValid()).toBe(true)
    const copy = valid!.withScheme(PxOsdOpenSubdivTokens.loop)
    expect(copy.getScheme()).toBe('loop')
    expect(copy.getFaceVertexIndices()).toEqual(valid!.getFaceVertexIndices())
    expect(copy.Equals(valid!)).toBe(false)
    expect(copy.withScheme('catmullClark').Equals(valid!)).toBe(true)
    expect(copy.withScheme('catmullClark').computeHash()).toBe(valid!.computeHash())
  })
})
