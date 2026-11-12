// Generated-schema vocabulary exercised against values captured from the live
// OpenUSD v26.05 Python API (UsdGeom.*.GetSchemaAttributeNames and fallbacks).

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Stage } from 'typescript-usd/usd'
import {
  BasisCurves, Boundable, Capsule_1, Curves, Cylinder_1, NurbsPatch, Points,
  VisibilityAPI, Xform,
} from 'typescript-usd/usdGeom'

describe('UsdGeomCurves registered base schema', () => {
  it('publishes curveVertexCounts, widths, and width interpolation', () => {
    const stage = Stage.createNew()
    const curves = new Curves(stage.definePrim('/C', 'BasisCurves'), stage)
    expect(curves.getCurveVertexCountsAttr().name).toBe('curveVertexCounts')
    expect(curves.getWidthsAttr().name).toBe('widths')
    expect(curves.getWidthsInterpolation()).toBe('vertex')
    expect(curves.setWidthsInterpolation('uniform')).toBe(true)
    expect(curves.getWidthsInterpolation()).toBe('uniform')
    expect(curves.setWidthsInterpolation('invalid')).toBe(false)
  })

  it('includes maximum curve width and per-point widths in plugin extents', () => {
    const stage = Stage.createNew()
    const curves = BasisCurves.define(stage, '/C')
    curves.getPointsAttr().set([[0, 0, 0], [2, 0, 0]])
    curves.getWidthsAttr().set([1, 4])
    const points = Points.define(stage, '/P')
    points.getPointsAttr().set([[0, 0, 0], [5, 0, 0]])
    points.getWidthsAttr().set([2, 4])
    expect(Boundable.computeExtent(stage.getPrim('/C')!))
      .toEqual([[-2, -2, -2], [4, 2, 2]])
    expect(Boundable.computeExtent(stage.getPrim('/P')!))
      .toEqual([[-1, -2, -2], [7, 2, 2]])
  })
})

const topWiderZ = JSON.parse(readFileSync(fileURLToPath(
  new URL('../fixtures/gprimExtents/expected.json', import.meta.url)), 'utf8'))
  .payload.gprims['/TopWiderZ'][0].extent

describe('UsdGeomCylinder_1 and UsdGeomCapsule_1', () => {
  it('matches v26.05 schema fallbacks and unequal-radius extents', () => {
    const stage = Stage.createNew()
    const cylinder = Cylinder_1.define(stage, '/Cylinder')
    const capsule = Capsule_1.define(stage, '/Capsule')
    const cylinderPrim = stage.getPrim('/Cylinder')!
    const capsulePrim = stage.getPrim('/Capsule')!
    expect(Cylinder_1.getHeight(cylinderPrim)).toBe(2)
    expect(Cylinder_1.getRadiusTop(cylinderPrim)).toBe(1)
    expect(Cylinder_1.getRadiusBottom(cylinderPrim)).toBe(1)
    expect(Capsule_1.getHeight(capsulePrim)).toBe(1)
    expect(Capsule_1.getRadiusTop(capsulePrim)).toBe(0.5)
    expect(Capsule_1.getRadiusBottom(capsulePrim)).toBe(0.5)
    cylinder.getRadiusTopAttr().set(2)
    capsule.getRadiusTopAttr().set(2)
    expect(Boundable.computeExtent(cylinderPrim)).toEqual([[-2, -2, -1], [2, 2, 1]])
    // Native: ../fixtures/gprimExtents (/TopWiderZ authors the same capsule).
    expect(Boundable.computeExtent(capsulePrim)).toEqual(topWiderZ)
  })
})

describe('UsdGeomNurbsPatch', () => {
  it('authors every v26.05 schema-specific attribute with its native type', () => {
    const stage = Stage.createNew()
    const patch = NurbsPatch.define(stage, '/Patch')
    const attrs = [
      patch.getUVertexCountAttr(), patch.getVVertexCountAttr(),
      patch.getUOrderAttr(), patch.getVOrderAttr(), patch.getUKnotsAttr(),
      patch.getVKnotsAttr(), patch.getUFormAttr(), patch.getVFormAttr(),
      patch.getURangeAttr(), patch.getVRangeAttr(), patch.getPointWeightsAttr(),
      patch.getTrimCurveCountsAttr(), patch.getTrimCurveOrdersAttr(),
      patch.getTrimCurveVertexCountsAttr(), patch.getTrimCurveKnotsAttr(),
      patch.getTrimCurveRangesAttr(), patch.getTrimCurvePointsAttr(),
    ]
    expect(attrs.map(attr => attr.name)).toEqual([
      'uVertexCount', 'vVertexCount', 'uOrder', 'vOrder', 'uKnots', 'vKnots',
      'uForm', 'vForm', 'uRange', 'vRange', 'pointWeights', 'trimCurve:counts',
      'trimCurve:orders', 'trimCurve:vertexCounts', 'trimCurve:knots',
      'trimCurve:ranges', 'trimCurve:points',
    ])
    expect(stage.getPrim('/Patch')!.getAttr('uForm')?.getValue()).toBe('open')
    expect(stage.getPrim('/Patch')!.getAttr('vForm')?.getValue()).toBe('open')
  })
})

describe('UsdGeomVisibilityAPI', () => {
  it('applies to Imageable prims and exposes the v26.05 purpose fallbacks', () => {
    const stage = Stage.createNew()
    const prim = Xform.define(stage, '/X').prim
    expect(VisibilityAPI.canApply(prim)).toBe(true)
    const visibility = VisibilityAPI.apply(prim)
    expect(visibility.isValid()).toBe(true)
    expect(visibility.getGuideVisibilityAttr().get()).toBe('invisible')
    expect(visibility.getProxyVisibilityAttr().get()).toBe('inherited')
    expect(visibility.getRenderVisibilityAttr().get()).toBe('inherited')
  })
})
