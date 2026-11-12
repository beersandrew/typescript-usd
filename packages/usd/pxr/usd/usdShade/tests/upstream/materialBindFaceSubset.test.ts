// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeMaterialBindFaceSubset.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdShade/testenv/testUsdShadeMaterialBindFaceSubset.py
//
// The .py creates a "materialBind" family of face GeomSubsets on a 16-face
// sphere mesh, drives the family-type transitions (nonOverlapping ->
// partition) and ValidateFamily results, then binds a material to each subset
// prim. The export-baseline diff in the .py is a serialization snapshot, not a
// capability assertion — we assert the behavioral facts instead (subset
// creation, element type, family-type transitions, ValidateFamily, binding).
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Subset as GeomSubset } from 'typescript-usd/usdGeom'
import { Material } from '../../src/index.ts'
// Use the source under test directly (the barrel may be edited concurrently).
import { MaterialBindingAPI } from '../../src/materialBindingAPI.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'materialBindFaceSubset')

describe('UsdShadeMaterialBindFaceSubset', () => {
  it('test_Basic', async () => {
    const stage = (await Stage.open(join(FIXTURES, 'Sphere.usda')))!
    expect(stage).toBeTruthy()

    const meshPath = '/Sphere/Mesh'
    const sphere = stage.definePrim(meshPath)

    // The three materials exist and are UsdShadeMaterials.
    const mat1 = '/Sphere/Materials/initialShadingGroup'
    const mat2 = '/Sphere/Materials/lambert2SG'
    const mat3 = '/Sphere/Materials/lambert3SG'
    for (const m of [mat1, mat2, mat3]) {
      const prim = stage.getPrim(m)
      expect(prim).toBeDefined()
      expect(Material.is(prim!)).toBe(true)
    }

    // The sphere mesh does not have an existing material face-set.
    expect(new MaterialBindingAPI(sphere, stage).getMaterialBindSubsets().length).toBe(0)

    const faceIndices1 = [0, 1, 2, 3]
    const faceIndices2 = [4, 5, 6, 7, 8, 9, 10, 11]
    const faceIndices3 = [12, 13, 14, 15]

    // Create the "materialBind" family.
    const subset1 = new MaterialBindingAPI(sphere, stage)
      .createMaterialBindSubset('subset1', faceIndices1, 'face')
    // Default elementType is 'face'.
    const subset2 = new MaterialBindingAPI(sphere, stage)
      .createMaterialBindSubset('subset2', faceIndices2)
    await stage.flushChanges()
    expect(GeomSubset.getElementType(stage.getPrim(subset2.path)!)).toBe('face')

    // ValidateFamily(face, materialBind) is valid (nonOverlapping after creation).
    expect(GeomSubset.validateFamily(stage, meshPath, 'face', 'materialBind').valid).toBe(true)

    // CreateMaterialBindSubset set the family type to nonOverlapping.
    expect(new MaterialBindingAPI(sphere, stage).getMaterialBindSubsetsFamilyType())
      .toBe('nonOverlapping')

    // Switch to a partition — now the family is INVALID (faces 12..15 uncovered).
    expect(new MaterialBindingAPI(sphere, stage).setMaterialBindSubsetsFamilyType('partition'))
      .toBe(true)
    await stage.flushChanges()
    expect(GeomSubset.validateFamily(stage, meshPath, 'face', 'materialBind').valid).toBe(false)

    // Add the subset that completes the partition over all 16 faces.
    const subset3 = new MaterialBindingAPI(sphere, stage)
      .createMaterialBindSubset('subset3', faceIndices3)
    await stage.flushChanges()
    expect(GeomSubset.validateFamily(stage, meshPath, 'face', 'materialBind').valid).toBe(true)

    // setMaterialBindSubsetsFamilyType refuses 'unrestricted'.
    expect(new MaterialBindingAPI(sphere, stage).setMaterialBindSubsetsFamilyType('unrestricted'))
      .toBe(false)

    // Bind a material to each subset prim.
    MaterialBindingAPI.apply(subset1.prim).bind(mat1)
    MaterialBindingAPI.apply(subset2.prim).bind(mat2)
    MaterialBindingAPI.apply(subset3.prim).bind(mat3)
    await stage.flushChanges()

    // Three material-bind subsets, each resolving to its bound material.
    const subsets = new MaterialBindingAPI(sphere, stage).getMaterialBindSubsets()
    expect(subsets.map(s => s.path).sort())
      .toEqual([`${meshPath}/subset1`, `${meshPath}/subset2`, `${meshPath}/subset3`])

    expect(MaterialBindingAPI.computeBoundMaterial(stage, subset1.path)?.materialPath).toBe(mat1)
    expect(MaterialBindingAPI.computeBoundMaterial(stage, subset2.path)?.materialPath).toBe(mat2)
    expect(MaterialBindingAPI.computeBoundMaterial(stage, subset3.path)?.materialPath).toBe(mat3)
  })
})
