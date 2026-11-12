// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomSubset.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of test_SubsetRetrievalAndValidity in
// pxr/usd/usdGeom/testenv/testUsdGeomSubset.py (OpenUSD v26.11.1, lines
// 16-189). Every expected value is the upstream test's own assertion. The
// stage is the testenv's testUsdGeomSubset/Sphere.usda, copied unmodified into
// fixtures/testUsdGeomSubset/ (Pixar, TOST 1.0 license,
// https://openusd.org/license).
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Subset as GeomSubset, type ElementType } from 'typescript-usd/usdGeom'

const fixture = (name: string): string => fileURLToPath(new URL(
  `./fixtures/testUsdGeomSubset/${name}`, import.meta.url))

let stage: Stage

beforeAll(async () => {
  stage = (await Stage.open(fixture('Sphere.usda')))!
  expect(stage).toBeDefined()
})

// testUsdGeomSubset.py:16-30 (_ValidateFamily).
function _validateFamily(geom: string, elementType: string, familyName: string,
  expectedIsValid: boolean, expectedReasons: readonly string[] = []): void {
  const { valid, reason } = GeomSubset.validateFamily(stage, geom, elementType as ElementType, familyName)
  if (expectedIsValid) {
    expect(valid, `Subset family '${familyName}' was found to be invalid: ${reason}`).toBe(true)
    expect(reason.length).toBe(0)
  } else {
    expect(valid, `Subset family '${familyName}' should be invalid`).toBe(false)
    expect(reason.length).toBeGreaterThan(0)
    for (const expectedReason of expectedReasons) expect(reason, familyName).toContain(expectedReason)
  }
}

// testUsdGeomSubset.py:32-99 (_TestSubsetValidity).
function _testSubsetValidity(geom: string, varyingGeom: string, nullGeom: string, elementType: string): void {
  const prefix = elementType + '_'
  for (const familyName of ['validPartition', 'validNonOverlapping', 'validUnrestricted', 'emptyIndicesSomeTimes']) {
    _validateFamily(geom, elementType, prefix + familyName, true)
  }

  let invalidFamilies: [string, string[]][]
  if (elementType === 'edge') {
    invalidFamilies = [
      ['invalidIndices', ['does not exist on the parent prim',
        'Indices attribute has an odd number of elements',
        'Found one or more indices that are less than 0']],
      ['badPartition1', ['does not match the element count', 'does not exist on the parent prim']],
      ['badPartition2', ['does not match the element count']],
      ['badPartition3', ['Found duplicate edge']],
      ['invalidNonOverlapping', ['Found duplicate edge']],
      ['invalidUnrestricted', ['does not exist on the parent prim',
        'Found one or more indices that are less than 0']],
      ['onlyNegativeIndices', ['Found one or more indices that are less than 0',
        'does not exist on the parent prim']],
      ['emptyIndicesAtAllTimes', ['No indices in family at any time']]]
  } else if (elementType === 'segment') {
    invalidFamilies = [
      ['invalidIndices', ['greater than the curve vertex count', 'greater than the segment count',
        'Indices attribute has an odd number of elements',
        'Found one or more indices that are less than 0']],
      ['badPartition1', ['Found one or more indices that are greater than the curve vertex count']],
      ['badPartition2', ['does not match the element count']],
      ['badPartition3', ['Found duplicate segment']],
      ['invalidNonOverlapping', ['Found duplicate segment']],
      ['invalidUnrestricted', ['Found one or more indices that are greater than the segment count',
        'Found one or more indices that are less than 0']],
      ['onlyNegativeIndices', ['Found one or more indices that are less than 0']],
      ['emptyIndicesAtAllTimes', ['No indices in family at any time']]]
  } else {
    invalidFamilies = [
      ['invalidIndices', ['Found one or more indices that are greater than the element count',
        'Found one or more indices that are less than 0']],
      ['badPartition1', ['does not match the element count',
        'Found one or more indices that are greater than the element count']],
      ['badPartition2', ['does not match the element count']],
      ['badPartition3', ['Found duplicate index']],
      ['invalidNonOverlapping', ['Found duplicate index']],
      ['invalidUnrestricted', ['Found one or more indices that are greater than the element count',
        'Found one or more indices that are less than 0']],
      ['onlyNegativeIndices', ['Found one or more indices that are less than 0']],
      ['emptyIndicesAtAllTimes', ['No indices in family at any time']]]
  }
  for (const [familyName, reasons] of invalidFamilies) _validateFamily(geom, elementType, prefix + familyName, false, reasons)

  _validateFamily(varyingGeom, elementType, prefix + 'validPartition', true)
  _validateFamily(varyingGeom, elementType, prefix + 'invalidNoDefaultTimeElements', false, ['has no elements'])

  _validateFamily(nullGeom, elementType, prefix + 'emptyIndicesAtAllTimes', false, ['No indices in family at any time'])
  _validateFamily(nullGeom, elementType, prefix + 'invalidPartition', false,
    ['Unable to determine element count at earliest time'])
}

// testUsdGeomSubset.py:101-111 (_TestSubsetRetrieval).
function _testSubsetRetrieval(geom: string, elementType: string, familyName: string): void {
  const prefix = elementType + '_'
  const materialBindSubsets = GeomSubset.getGeomSubsets(stage, geom, elementType as ElementType, prefix + familyName)
  expect(materialBindSubsets.length).toBe(3)
  expect(GeomSubset.getFamilyType(stage, geom, prefix + familyName)).toBe('partition')
  _validateFamily(geom, elementType, prefix + familyName, true)
}

describe('testUsdGeomSubset', () => {
  // testUsdGeomSubset.py:113-189.
  it('test_SubsetRetrievalAndValidity', () => {
    // Do a basic check to ensure "point" is a valid element type for any
    // UsdGeomPointBased and "segment" is valid for any UsdGeomBasisCurves.
    _validateFamily('/Sphere/SimpleCurves', 'point', 'points', true)
    _validateFamily('/Sphere/SimpleCurves', 'segment', 'segments', true)

    // Test specific subset validity
    for (const path of ['/Sphere/pSphere1', '/Sphere/VaryingMesh', '/Sphere/NullMesh']) {
      expect(stage.getPrim(path)).toBeDefined()
    }
    const [geom, varyingGeom, nullGeom] = ['/Sphere/pSphere1', '/Sphere/VaryingMesh', '/Sphere/NullMesh']
    _testSubsetRetrieval(geom, 'face', 'materialBind')
    _testSubsetValidity(geom, varyingGeom, nullGeom, 'face')
    _testSubsetRetrieval(geom, 'point', 'physicsAttachment')
    _testSubsetValidity(geom, varyingGeom, nullGeom, 'point')
    _testSubsetRetrieval(geom, 'edge', 'physicsAttachment')
    _testSubsetValidity(geom, varyingGeom, nullGeom, 'edge')

    // Test an invalid case where the elementType is not valid for the geom
    _validateFamily(geom, 'tetrahedron', 'tetrahedron_invalidElementType', false, ['Invalid geom type'])

    const [tet, varyingTet, nullTet] = ['/Sphere/TetMesh', '/Sphere/VaryingTetMesh', '/Sphere/NullTetMesh']
    for (const path of [tet, varyingTet, nullTet]) expect(stage.getPrim(path)).toBeDefined()
    _testSubsetRetrieval(tet, 'tetrahedron', 'materialBind')
    _testSubsetValidity(tet, varyingTet, nullTet, 'tetrahedron')
    _testSubsetRetrieval(tet, 'face', 'materialBind')
    _testSubsetValidity(tet, varyingTet, nullTet, 'face')

    // Test an invalid case where the elementType is not valid for the geom
    _validateFamily(tet, 'segment', 'segment_invalidElementType', false, ['Invalid geom type'])

    const [curves, varyingCurves, nullCurves] =
      ['/Sphere/BasisCurves', '/Sphere/VaryingBasisCurves', '/Sphere/NullBasisCurves']
    for (const path of [curves, varyingCurves, nullCurves]) expect(stage.getPrim(path)).toBeDefined()
    _testSubsetRetrieval(curves, 'segment', 'physicsAttachment')
    _testSubsetValidity(curves, varyingCurves, nullCurves, 'segment')

    // Test an invalid case where the elementType is not valid for the geom
    _validateFamily(curves, 'face', 'face_invalidElementType', false, ['Invalid geom type'])
  })
})
