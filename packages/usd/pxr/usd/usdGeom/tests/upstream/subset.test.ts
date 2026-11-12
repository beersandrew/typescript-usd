// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomSubset.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usdGeom/testenv/testUsdGeomSubset.py
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Subset as GeomSubset, Mesh } from 'typescript-usd/usdGeom'

function makeMeshStage() {
  const stage = Stage.createNew()
  Mesh.define(stage, '/M')
  return stage
}

describe('UsdGeomSubset', () => {
  describe('Authoring', () => {
    it('CreateGeomSubset adds a child Subset prim under the mesh', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'front', 'face', [0, 1])
      const child = stage.getPrim('/M/front')
      expect(child).toBeDefined()
      expect(GeomSubset.is(child!)).toBe(true)
    })

    it('authored indices round-trip through GetIndicesAttr()', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'front', 'face', [2, 3, 5])
      expect([...GeomSubset.getIndices(stage.getPrim('/M/front')!)]).toEqual([2, 3, 5])
    })

    it('elementType defaults to "face"', () => {
      const stage = makeMeshStage()
      GeomSubset.define(stage, '/M/raw')
      expect(GeomSubset.getElementType(stage.getPrim('/M/raw')!)).toBe('face')
    })

    it('familyName round-trips through GetFamilyNameAttr()', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'front', 'face', [0], 'materialBind')
      expect(GeomSubset.getFamilyName(stage.getPrim('/M/front')!)).toBe('materialBind')
    })
  })

  describe('GetAllGeomSubsets', () => {
    it('returns all Subset children of a mesh prim', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'a', 'face', [0])
      GeomSubset.createGeomSubset(stage, '/M', 'b', 'face', [1])
      const subsets = GeomSubset.getAllGeomSubsets(stage, '/M')
      expect(subsets.map(s => s.path).sort()).toEqual(['/M/a', '/M/b'])
    })

    it('returns an empty list when no subsets exist', () => {
      const stage = makeMeshStage()
      expect(GeomSubset.getAllGeomSubsets(stage, '/M')).toEqual([])
    })

    it('filters by elementType when specified', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'faces', 'face', [0])
      GeomSubset.createGeomSubset(stage, '/M', 'pts', 'point', [0])
      const faceSubsets = GeomSubset.getAllGeomSubsets(stage, '/M', 'face')
      expect(faceSubsets.map(s => s.path)).toEqual(['/M/faces'])
    })
  })

  describe('Validation', () => {
    it('ValidateSubsets passes for non-overlapping, exhaustive partition', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'a', 'face', [0, 1])
      GeomSubset.createGeomSubset(stage, '/M', 'b', 'face', [2, 3])
      const subsets = GeomSubset.getAllGeomSubsets(stage, '/M')
      expect(GeomSubset.validateSubsets(subsets, 4, 'partition').valid).toBe(true)
    })

    it('ValidateSubsets fails when indices overlap between subsets in a partition family', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'a', 'face', [0, 1])
      GeomSubset.createGeomSubset(stage, '/M', 'b', 'face', [1, 2, 3])
      const subsets = GeomSubset.getAllGeomSubsets(stage, '/M')
      const result = GeomSubset.validateSubsets(subsets, 4, 'partition')
      expect(result.valid).toBe(false)
      // subset.cpp:806-810 (ValidateSubsets' overlap reason).
      expect(result.reason).toContain('Found overlapping index 1 in GeomSubset at path </M/b>')
    })

    it('ValidateSubsets fails when partition is non-exhaustive (missing face indices)', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'a', 'face', [0, 1])
      const subsets = GeomSubset.getAllGeomSubsets(stage, '/M')
      const result = GeomSubset.validateSubsets(subsets, 4, 'partition')
      expect(result.valid).toBe(false)
      // subset.cpp:815-819 (ValidateSubsets' partition reason).
      expect(result.reason).toContain('does not match the element count 4.')
    })

    it('unrestricted family type does not require exhaustive coverage', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'a', 'face', [0, 0, 1])  // even overlapping
      const subsets = GeomSubset.getAllGeomSubsets(stage, '/M')
      expect(GeomSubset.validateSubsets(subsets, 4, 'unrestricted').valid).toBe(true)
    })
  })

  describe('Family types', () => {
    it('"partition" family requires exhaustive, non-overlapping coverage', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'all', 'face', [0, 1, 2, 3])
      const subsets = GeomSubset.getAllGeomSubsets(stage, '/M')
      expect(GeomSubset.validateSubsets(subsets, 4, 'partition').valid).toBe(true)
      expect(GeomSubset.validateSubsets(subsets, 5, 'partition').valid).toBe(false)
    })

    it('"nonOverlapping" family requires non-overlapping but not exhaustive', () => {
      const stage = makeMeshStage()
      GeomSubset.createGeomSubset(stage, '/M', 'a', 'face', [0])
      GeomSubset.createGeomSubset(stage, '/M', 'b', 'face', [2])
      const subsets = GeomSubset.getAllGeomSubsets(stage, '/M')
      expect(GeomSubset.validateSubsets(subsets, 4, 'nonOverlapping').valid).toBe(true)
    })

    it('"unrestricted" family imposes no constraints', () => {
      expect(GeomSubset.validateSubsets([], 100, 'unrestricted').valid).toBe(true)
    })
  })
})
