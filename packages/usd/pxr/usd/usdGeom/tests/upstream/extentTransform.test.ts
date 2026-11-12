// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomExtentTransform.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomExtentTransform.py.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Boundable, Capsule, Cone, Cube, Cylinder, Sphere, type Extent } from 'typescript-usd/usdGeom'
import type { Matrix4 } from 'typescript-usd/gf'

// Captured from the live OpenUSD v26.05 Python oracle. Row-vector matrix:
// rotation around (1,1,1), translation (1,2,3), then Z scale 0.5.
const transform: Matrix4 = [
  0.8047378541243649, 0.5058793634016806, -0.15530860876302277, 0,
  -0.31061721752604554, 0.8047378541243649, 0.2529396817008403, 0,
  0.5058793634016806, -0.31061721752604554, 0.40236892706218247, 0,
  1, 2, 1.5, 1,
]

function closeExtent(actual: Extent | null, expected: Extent) {
  expect(actual).not.toBeNull()
  for (let bound = 0; bound < 2; bound++) {
    for (let axis = 0; axis < 3; axis++) {
      expect(actual![bound]![axis]).toBeCloseTo(expected[bound]![axis]!, 5)
    }
  }
}

describe('UsdGeomExtentTransform', () => {
  it('transforms sphere and cube plugin extents', () => {
    const stage = Stage.createNew()
    Sphere.define(stage, '/Sphere').getRadiusAttr().set(2)
    Cube.define(stage, '/Cube').getSizeAttr().set(4)
    const expected: Extent = [
      [-2.24246883392334, -1.2424688339233398, -0.12123443186283112],
      [4.24246883392334, 5.24246883392334, 3.12123441696167],
    ]
    closeExtent(Boundable.computeExtentFromPlugins(stage.getPrim('/Sphere')!, undefined, transform), expected)
    closeExtent(Boundable.computeExtentFromPlugins(stage.getPrim('/Cube')!, undefined, transform), expected)
  })

  it('transforms axial cylinder and cone plugin extents', () => {
    const stage = Stage.createNew()
    const cylinder = Cylinder.define(stage, '/Cylinder')
    const cone = Cone.define(stage, '/Cone')
    for (const shape of [cylinder, cone]) {
      shape.getHeightAttr().set(6)
      shape.getRadiusAttr().set(2)
      shape.getAxisAttr().set('X')
    }
    const expected: Extent = [
      [-3.0472066402435303, -1.7483482360839844, -0.2765430510044098],
      [5.047206878662109, 5.748348236083984, 3.276543140411377],
    ]
    closeExtent(Boundable.computeExtentFromPlugins(stage.getPrim('/Cylinder')!, undefined, transform), expected)
    closeExtent(Boundable.computeExtentFromPlugins(stage.getPrim('/Cone')!, undefined, transform), expected)
  })

  it('transforms capsule plugin extents', () => {
    const stage = Stage.createNew()
    const capsule = Capsule.define(stage, '/Capsule')
    capsule.getHeightAttr().set(6)
    capsule.getRadiusAttr().set(2)
    capsule.getAxisAttr().set('X')
    closeExtent(Boundable.computeExtentFromPlugins(stage.getPrim('/Capsule')!, undefined, transform), [
      [-4.65668249130249, -2.7601070404052734, -0.5871602892875671],
      [6.65668249130249, 6.760107040405273, 3.587160348892212],
    ])
  })
})
