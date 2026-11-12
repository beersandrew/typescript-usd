// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdGeom/testenv/testUsdGeomCreateAttribute.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomCreateAttribute.cpp.
import { describe, expect, it } from 'vitest'
import { Array as VtArray } from 'typescript-usd/vt'
import { Stage } from 'typescript-usd/usd'
import { Mesh, Xform, XformOp } from 'typescript-usd/usdGeom'

// Author → check USDA text + edit target layer.
// Full USDA parse round-trip is covered in format-usda tests.
function author(fn: (stage: ReturnType<typeof Stage.createNew>) => void) {
  const stage = Stage.createNew()
  fn(stage)
  const usda = stage.exportToUsda()
  const layer = stage.getEditTarget().getLayer()!
  return { usda, layer, stage }
}

// ---- Mesh authoring ----

describe('Mesh.define', () => {
  it('creates a prim with typeName Mesh', () => {
    const stage = Stage.createNew()
    const mesh = Mesh.define(stage, '/World/Cube')
    expect(stage.getPrim('/World/Cube')?.typeName).toBe('Mesh')
    expect(mesh.path).toBe('/World/Cube')
  })

  it('getPointsAttr sets point3f[] type in USDA', () => {
    const { usda } = author(s => {
      Mesh.define(s, '/P').getPointsAttr().set([[0,0,0],[1,0,0]])
    })
    expect(usda).toContain('point3f[]')
  })

  it('getFaceVertexCountsAttr sets int[] type', () => {
    const { usda } = author(s => {
      Mesh.define(s, '/P').getFaceVertexCountsAttr().set([4, 4])
    })
    expect(usda).toContain('int[] faceVertexCounts')
  })

  it('getFaceVertexIndicesAttr sets int[] type', () => {
    const { usda } = author(s => {
      Mesh.define(s, '/P').getFaceVertexIndicesAttr().set([0, 1, 2, 3])
    })
    expect(usda).toContain('int[] faceVertexIndices')
  })

  it('getNormalsAttr sets normal3f[] type', () => {
    const { usda } = author(s => {
      Mesh.define(s, '/P').getNormalsAttr().set([[0,1,0],[0,1,0]])
    })
    expect(usda).toContain('normal3f[]')
  })

  it('getExtentAttr sets float3[] type', () => {
    const { usda } = author(s => {
      Mesh.define(s, '/P').getExtentAttr().set([[-1,-1,-1],[1,1,1]])
    })
    expect(usda).toContain('float3[]')
  })

  it('getSubdivisionSchemeAttr emits token type', () => {
    const { usda } = author(s => {
      Mesh.define(s, '/P').getSubdivisionSchemeAttr().set('none')
    })
    expect(usda).toContain('token subdivisionScheme')
  })

  it('values round-trip correctly through USDA', () => {
    const pts = [[0,0,0],[1,0,0],[1,1,0],[0,1,0]]
    const counts = [4]
    const indices = [0,1,2,3]

    const { layer } = author(s => {
      const mesh = Mesh.define(s, '/Cube')
      mesh.getPointsAttr().set(pts)
      mesh.getFaceVertexCountsAttr().set(counts)
      mesh.getFaceVertexIndicesAttr().set(indices)
    })

    expect(layer.getField('/Cube.points', 'default')).toEqual(pts)
    expect(layer.getField('/Cube.faceVertexCounts', 'default')).toEqual(counts)
    expect(layer.getField('/Cube.faceVertexIndices', 'default')).toEqual(indices)
  })

  it('Mesh.is() still works on a read prim', () => {
    const { stage } = author(s => Mesh.define(s, '/M'))
    // Re-open the authored stage nodes
    const prim = stage.getPrim('/M')!
    expect(Mesh.is(prim)).toBe(true)
  })
})

// ---- Xform authoring ----

describe('Xform.define', () => {
  it('creates a prim with typeName Xform', () => {
    const stage = Stage.createNew()
    Xform.define(stage, '/World')
    expect(stage.getPrim('/World')?.typeName).toBe('Xform')
  })

  it('addTranslateOp appends to xformOpOrder', () => {
    const stage = Stage.createNew()
    const xf = Xform.define(stage, '/W')
    xf.addTranslateOp().set([1, 2, 3])
    const layer = stage.getEditTarget().getLayer()!
    const order = layer.getField('/W.xformOpOrder', 'default') as string[]
    expect(order).toContain('xformOp:translate')
  })

  it('addTranslateOp emits double3 type', () => {
    const { usda } = author(s => {
      Xform.define(s, '/W').addTranslateOp().set([0, 5, 0])
    })
    expect(usda).toContain('double3 xformOp:translate')
  })

  it('addScaleOp emits float3 type', () => {
    const { usda } = author(s => {
      Xform.define(s, '/W').addScaleOp().set([2, 2, 2])
    })
    expect(usda).toContain('float3 xformOp:scale')
  })

  it('addRotateXYZOp emits float3 type', () => {
    const { usda } = author(s => {
      Xform.define(s, '/W').addRotateXYZOp().set([0, 45, 0])
    })
    expect(usda).toContain('float3 xformOp:rotateXYZ')
  })

  it('authors every OpenUSD v26.08 axis and rotation xformOp type', () => {
    const stage = Stage.createNew()
    const xform = Xform.define(stage, '/W')
    xform.addTranslateXOp().set(1)
    xform.addTranslateYOp().set(2)
    xform.addTranslateZOp().set(3)
    xform.addScaleXOp().set(1.1)
    xform.addScaleYOp().set(1.2)
    xform.addScaleZOp().set(1.3)
    xform.addRotateXOp().set(1)
    xform.addRotateYOp().set(2)
    xform.addRotateZOp().set(3)
    xform.addRotateXYZOp().set([1, 2, 3])
    xform.addRotateXZYOp().set([1, 2, 3])
    xform.addRotateYXZOp().set([1, 2, 3])
    xform.addRotateYZXOp().set([1, 2, 3])
    xform.addRotateZXYOp().set([1, 2, 3])
    xform.addRotateZYXOp().set([1, 2, 3])
    expect(stage.getPrim('/W')!.getAttr('xformOpOrder')?.getValue()).toEqual([
      'xformOp:translateX', 'xformOp:translateY', 'xformOp:translateZ',
      'xformOp:scaleX', 'xformOp:scaleY', 'xformOp:scaleZ',
      'xformOp:rotateX', 'xformOp:rotateY', 'xformOp:rotateZ',
      'xformOp:rotateXYZ', 'xformOp:rotateXZY', 'xformOp:rotateYXZ',
      'xformOp:rotateYZX', 'xformOp:rotateZXY', 'xformOp:rotateZYX',
    ])
  })

  it('multiple ops accumulate in xformOpOrder', () => {
    const stage = Stage.createNew()
    const xf = Xform.define(stage, '/W')
    xf.addTranslateOp().set([1, 0, 0])
    xf.addScaleOp().set([2, 2, 2])
    const order = stage.getEditTarget().getLayer()!.getField('/W.xformOpOrder', 'default') as string[]
    expect(order).toEqual(['xformOp:translate', 'xformOp:scale'])
  })

  it('same op name added twice is not duplicated in order', () => {
    const stage = Stage.createNew()
    const xf = Xform.define(stage, '/W')
    xf.addTranslateOp().set([1, 0, 0])
    xf.addTranslateOp().set([2, 0, 0])  // second call — same name, no duplicate
    const order = stage.getEditTarget().getLayer()!.getField('/W.xformOpOrder', 'default') as VtArray<string>
    expect(order.toArray().filter(o => o === 'xformOp:translate')).toHaveLength(1)
  })

  it('suffix creates distinct op names', () => {
    const stage = Stage.createNew()
    const xf = Xform.define(stage, '/W')
    xf.addTranslateOp(XformOp.PrecisionDouble, 'pivot').set([0.5, 0.5, 0])
    xf.addTranslateOp().set([1, 0, 0])
    const order = stage.getEditTarget().getLayer()!.getField('/W.xformOpOrder', 'default') as string[]
    expect(order).toContain('xformOp:translate:pivot')
    expect(order).toContain('xformOp:translate')
  })

  it('Xform.is() still works on a read prim', () => {
    const stage = Stage.createNew()
    Xform.define(stage, '/W')
    expect(Xform.is(stage.getPrim('/W')!)).toBe(true)
  })
})

// ---- Full scene round-trip (usdview milestone) ----

describe('full geometry scene', () => {
  it('authors a cube with a parent xform and round-trips USDA', () => {
    const pts = [
      [0,0,0],[1,0,0],[1,1,0],[0,1,0],
      [0,0,1],[1,0,1],[1,1,1],[0,1,1],
    ]
    const counts  = [4,4,4,4,4,4]
    const indices = [0,3,2,1, 4,5,6,7, 0,1,5,4, 2,3,7,6, 0,4,7,3, 1,2,6,5]

    const { usda, layer } = author(s => {
      const world = Xform.define(s, '/World')
      world.addTranslateOp().set([0, 0, 0])

      const mesh = Mesh.define(s, '/World/Cube')
      mesh.getPointsAttr().set(pts)
      mesh.getFaceVertexCountsAttr().set(counts)
      mesh.getFaceVertexIndicesAttr().set(indices)
      mesh.getExtentAttr().set([[0,0,0],[1,1,1]])
      mesh.getSubdivisionSchemeAttr().set('none')
    })

    // Correct USD type names present
    expect(usda).toContain('point3f[] points')
    expect(usda).toContain('int[] faceVertexCounts')
    expect(usda).toContain('int[] faceVertexIndices')
    expect(usda).toContain('token subdivisionScheme = "none"')
    expect(usda).toContain('double3 xformOp:translate')

    // Values survive the round-trip
    expect(layer.getField('/World/Cube.points', 'default')).toEqual(pts)
    expect(layer.getField('/World/Cube.faceVertexCounts', 'default')).toEqual(counts)
    expect(layer.getField('/World/Cube.faceVertexIndices', 'default')).toEqual(indices)
  })
})
