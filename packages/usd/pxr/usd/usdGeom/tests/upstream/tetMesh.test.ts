// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/testenv/testUsdGeomTetMesh.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdGeom/testenv/testUsdGeomTetMesh.py
//
// Covers surface-face extraction (rightHanded + leftHanded) and
// inverted-element detection across orientation/winding cases.

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { TetMesh } from '../../src/tetMesh.ts'

describe('UsdGeomTetMesh', () => {
  // Time-varying topology + surface computation, rightHanded orientation.
  it('computes surface faces for a rightHanded tetmesh', () => {
    const stage = Stage.createNew()
    const tetMesh = TetMesh.define(stage, '/tetMesh')

    const pointsAttr = tetMesh.getPointsAttr()
    pointsAttr.setTimeSample(0.0, [
      [0.0, 0.0, 0.0],
      [2.0, 0.0, 0.0],
      [0.0, 2.0, 0.0],
      [0.0, 0.0, 2.0],
      [0.0, 0.0, -2.0],
    ])
    pointsAttr.setTimeSample(10.0, [
      [0.0, 0.0, 3.0],
      [2.0, 0.0, 3.0],
      [0.0, 2.0, 3.0],
      [0.0, 0.0, 5.0],
      [0.0, 0.0, -3.0],
      [2.0, 0.0, -3.0],
      [0.0, 2.0, -3.0],
      [0.0, 0.0, -5.0],
    ])

    const tetVertexIndicesAttr = tetMesh.getTetVertexIndicesAttr()
    tetVertexIndicesAttr.setTimeSample(0.0, [
      [0, 1, 2, 3],
      [0, 2, 1, 4],
    ])
    tetVertexIndicesAttr.setTimeSample(10.0, [
      [0, 1, 2, 3],
      [4, 6, 5, 7],
    ])

    // No inverted elements at either time.
    expect(TetMesh.findInvertedElements(tetMesh, 0.0).length).toBe(0)
    expect(TetMesh.findInvertedElements(tetMesh, 10.0).length).toBe(0)

    // Joined tets -> 6 surface faces.
    expect(TetMesh.computeSurfaceFaces(tetMesh, 0.0).length).toBe(6)
    // Separated tets -> 8 surface faces.
    expect(TetMesh.computeSurfaceFaces(tetMesh, 10.0).length).toBe(8)
  })

  // Same, but with leftHanded orientation (mirrored points + orientation attr).
  it('computes surface faces for a leftHanded tetmesh', () => {
    const stage = Stage.createNew()
    const tetMesh = TetMesh.define(stage, '/tetMesh')
    tetMesh.getOrientationAttr().set('leftHanded')

    const pointsAttr = tetMesh.getPointsAttr()
    pointsAttr.setTimeSample(0.0, [
      [0.0, 0.0, 0.0],
      [-2.0, 0.0, 0.0],
      [0.0, 2.0, 0.0],
      [0.0, 0.0, 2.0],
      [0.0, 0.0, -2.0],
    ])
    pointsAttr.setTimeSample(10.0, [
      [0.0, 0.0, 3.0],
      [-2.0, 0.0, 3.0],
      [0.0, 2.0, 3.0],
      [0.0, 0.0, 5.0],
      [0.0, 0.0, -3.0],
      [-2.0, 0.0, -3.0],
      [0.0, 2.0, -3.0],
      [0.0, 0.0, -5.0],
    ])

    const tetVertexIndicesAttr = tetMesh.getTetVertexIndicesAttr()
    tetVertexIndicesAttr.setTimeSample(0.0, [
      [0, 1, 2, 3],
      [0, 2, 1, 4],
    ])
    tetVertexIndicesAttr.setTimeSample(10.0, [
      [0, 1, 2, 3],
      [4, 6, 5, 7],
    ])

    expect(TetMesh.findInvertedElements(tetMesh, 0.0).length).toBe(0)
    expect(TetMesh.findInvertedElements(tetMesh, 10.0).length).toBe(0)

    expect(TetMesh.computeSurfaceFaces(tetMesh, 0.0).length).toBe(6)
    expect(TetMesh.computeSurfaceFaces(tetMesh, 10.0).length).toBe(8)
  })

  // Inverted-element detection across orientation/winding combinations.
  it('finds inverted elements per orientation and winding', () => {
    const stage = Stage.createNew()
    const tetMesh = TetMesh.define(stage, '/tetMesh')
    const pointsAttr = tetMesh.getPointsAttr()
    const tetVertexIndicesAttr = tetMesh.getTetVertexIndicesAttr()
    const orientationAttr = tetMesh.getOrientationAttr()

    // rightHanded element, default (rightHanded) orientation -> no inversion.
    pointsAttr.setTimeSample(0.0, [
      [0.0, 0.0, 0.0],
      [0.0, 0.0, 1.0],
      [-1.0, 0.0, 0.0],
      [0.0, -1.0, 0.0],
    ])
    tetVertexIndicesAttr.setTimeSample(0.0, [[0, 1, 2, 3]])
    expect(TetMesh.findInvertedElements(tetMesh, 0.0).length).toBe(0)

    // Same element, leftHanded orientation -> inverted.
    orientationAttr.set('leftHanded')
    expect(TetMesh.findInvertedElements(tetMesh, 0.0).length).toBe(1)

    // rightHanded orientation with an inverted (leftHanded) element -> inverted.
    orientationAttr.set('rightHanded')
    pointsAttr.setTimeSample(0.0, [
      [0.0, 0.0, 0.0],
      [0.0, 0.0, 1.0],
      [1.0, 0.0, 0.0],
      [0.0, -1.0, 0.0],
    ])
    expect(TetMesh.findInvertedElements(tetMesh, 0.0).length).toBe(1)

    // leftHanded orientation wrt. a leftHanded element -> no inversion.
    orientationAttr.set('leftHanded')
    pointsAttr.setTimeSample(0.0, [
      [0.0, 0.0, 0.0],
      [0.0, 0.0, 1.0],
      [1.0, 0.0, 0.0],
      [0.0, -1.0, 0.0],
    ])
    expect(TetMesh.findInvertedElements(tetMesh, 0.0).length).toBe(0)

    // leftHanded element with rightHanded orientation attr -> inverted.
    orientationAttr.set('rightHanded')
    expect(TetMesh.findInvertedElements(tetMesh, 0.0).length).toBe(1)

    // Inverted element with leftHanded orientation attr -> inverted.
    orientationAttr.set('leftHanded')
    pointsAttr.setTimeSample(0.0, [
      [0.0, 0.0, 0.0],
      [0.0, 0.0, 1.0],
      [1.0, 0.0, 0.0],
      [0.0, 1.0, 0.0],
    ])
    expect(TetMesh.findInvertedElements(tetMesh, 0.0).length).toBe(1)
  })
})
