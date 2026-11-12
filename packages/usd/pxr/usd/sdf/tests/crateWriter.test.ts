import { _resolverContextForResolver } from 'typescript-usd/ar/_internal'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Matrix4d, Quatf, Vec3d, Vec3f } from 'typescript-usd/gf'
import { Array as VtArray } from 'typescript-usd/vt'
import { serializeUsdc } from '../src/crateFile.ts'
import { parseCrate } from '../src/crateFile.ts'

// Build a layer + attr helper that mirrors what Mesh/Xform do via setField.
function makeLayer() {
  const layer = Layer.createAnonymous()
  function defPrim(path: string, typeName: string) {
    layer.definePrimSpec(path, typeName)
  }
  function defAttr(primPath: string, name: string, typeName: string, value: unknown) {
    const attrPath = `${primPath}.${name}`
    layer.setField(attrPath, 'typeName', typeName)
    layer.setAttrDefault(primPath, name, value)
  }
  return { layer, defPrim, defAttr }
}

// Loosely-typed scene view for assertions: spec[field] → { value }
type TestScene = Record<string, Record<string, { value: unknown }>>

function roundTrip(fn: (ctx: ReturnType<typeof makeLayer>) => void) {
  const ctx = makeLayer()
  fn(ctx)
  const bytes = serializeUsdc(ctx.layer)
  const scene = parseCrate(bytes) as unknown as TestScene
  return { scene, bytes }
}

describe('serializeUsdc — basic correctness', () => {
  it('writes a valid PXR-USDC magic header', () => {
    const { bytes } = roundTrip(() => {})
    const magic = String.fromCharCode(...bytes.slice(0, 8))
    expect(magic).toBe('PXR-USDC')
  })

  it('round-trips a single prim with typeName', () => {
    const { scene } = roundTrip(({ defPrim }) => defPrim('/Cube', 'Mesh'))
    expect(scene['/Cube']).toBeDefined()
    expect(scene['/Cube']!['typeName']?.value).toBe('Mesh')
  })

  it('round-trips specifier = def (returned as integer 0 by USDC parser)', () => {
    const { scene } = roundTrip(({ defPrim }) => defPrim('/Cube', 'Mesh'))
    // USDC parser returns 0/1/2 for def/over/class; string conversion happens at Stage level
    expect(scene['/Cube']!['specifier']?.value).toBe(0)
  })

  it('round-trips primChildren list', () => {
    const { scene } = roundTrip(({ defPrim }) => {
      defPrim('/World', 'Xform')
      defPrim('/World/Cube', 'Mesh')
    })
    const children = scene['/World']!['primChildren']?.value as string[]
    expect(children).toContain('Cube')
  })

  it('round-trips properties list', () => {
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/Cube', 'Mesh')
      defAttr('/Cube', 'points', 'point3f[]', [[0,0,0]])
    })
    const props = scene['/Cube']!['properties']?.value as string[]
    expect(props).toContain('points')
  })

  it('round-trips a point3f[] attribute', () => {
    const pts = [[0,0,0],[1,0,0],[1,1,0],[0,1,0]]
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/Cube', 'Mesh')
      defAttr('/Cube', 'points', 'point3f[]', pts)
    })
    const val = scene['/Cube.points']?.['default']?.value as VtArray<Vec3f>
    expect(val.size).toBe(4)
    expect(val.get(0)).toEqual(new Vec3f(0, 0, 0))
    expect(val.get(3)).toEqual(new Vec3f(0, 1, 0))
  })

  it('round-trips arrays large enough to grow the write buffer many times', () => {
    const pts = Array.from({ length: 5000 }, (_, i) => [i, i + 0.5, -i])
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/Big', 'Mesh')
      defAttr('/Big', 'points', 'point3f[]', pts)
      defAttr('/Big', 'weights', 'double[]', pts.map(p => p[1]))
    })
    const val = scene['/Big.points']?.['default']?.value as number[][]
    expect(val).toEqual(pts)
    expect(scene['/Big.weights']?.['default']?.value).toEqual(pts.map(p => p[1]))
  })

  it('round-trips an int[] attribute', () => {
    const counts = [4, 4, 4, 4, 4, 4]
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/Cube', 'Mesh')
      defAttr('/Cube', 'faceVertexCounts', 'int[]', counts)
    })
    expect(scene['/Cube.faceVertexCounts']?.['default']?.value).toEqual(counts)
  })

  it('round-trips face vertex indices', () => {
    const indices = [0,3,2,1, 4,5,6,7, 0,1,5,4, 2,3,7,6, 0,4,7,3, 1,2,6,5]
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/Cube', 'Mesh')
      defAttr('/Cube', 'faceVertexIndices', 'int[]', indices)
    })
    expect(scene['/Cube.faceVertexIndices']?.['default']?.value).toEqual(indices)
  })

  it('round-trips a token attribute', () => {
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/Cube', 'Mesh')
      defAttr('/Cube', 'subdivisionScheme', 'token', 'none')
    })
    expect(scene['/Cube.subdivisionScheme']?.['default']?.value).toBe('none')
  })

  it('round-trips a double3 attribute', () => {
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/W', 'Xform')
      defAttr('/W', 'xformOp:translate', 'double3', [1, 2, 3])
    })
    expect(scene['/W.xformOp:translate']?.['default']?.value).toEqual(new Vec3d(1, 2, 3))
  })

  it('round-trips a float3 attribute', () => {
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/W', 'Xform')
      defAttr('/W', 'xformOp:scale', 'float3', [2, 2, 2])
    })
    expect(scene['/W.xformOp:scale']?.['default']?.value).toEqual(new Vec3f(2, 2, 2))
  })

  it('round-trips typeName field on an attr spec', () => {
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/Cube', 'Mesh')
      defAttr('/Cube', 'faceVertexCounts', 'int[]', [4,4,4,4])
    })
    // typeName stored without 'uniform ' prefix; 'int[]' stripped of array suffix handled by parser
    expect(scene['/Cube.faceVertexCounts']?.['typeName']?.value).toBeDefined()
  })

  it('full cube scene: all fields survive round-trip', () => {
    const pts = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]]
    const counts  = [4,4,4,4,4,4]
    const indices = [0,3,2,1, 4,5,6,7, 0,1,5,4, 2,3,7,6, 0,4,7,3, 1,2,6,5]

    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/World', 'Xform')
      defAttr('/World', 'xformOp:translate', 'double3', [0,0,0])
      defPrim('/World/Cube', 'Mesh')
      defAttr('/World/Cube', 'points', 'point3f[]', pts)
      defAttr('/World/Cube', 'faceVertexCounts', 'int[]', counts)
      defAttr('/World/Cube', 'faceVertexIndices', 'int[]', indices)
      defAttr('/World/Cube', 'extent', 'float3[]', [[0,0,0],[1,1,1]])
      defAttr('/World/Cube', 'subdivisionScheme', 'token', 'none')
    })

    expect(scene['/World']?.['typeName']?.value).toBe('Xform')
    expect(scene['/World/Cube']?.['typeName']?.value).toBe('Mesh')
    expect(scene['/World/Cube.faceVertexCounts']?.['default']?.value).toEqual(counts)
    expect(scene['/World/Cube.faceVertexIndices']?.['default']?.value).toEqual(indices)
    expect(scene['/World/Cube.subdivisionScheme']?.['default']?.value).toBe('none')
    const parsedPts = scene['/World/Cube.points']?.['default']?.value as VtArray<Vec3f>
    expect(parsedPts.size).toBe(8)
    expect(parsedPts.get(7)).toEqual(new Vec3f(0, 1, 1))
  })
})

describe('serializeUsdc — quat / matrix values', () => {
  it('round-trips a quatf attribute', () => {
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/W', 'Xform')
      defAttr('/W', 'xformOp:orient', 'quatf', [1, 0, 0, 0])
    })
    expect(scene['/W.xformOp:orient']?.['default']?.value).toEqual(new Quatf(1, 0, 0, 0))
  })

  it('round-trips a quatf[] attribute', () => {
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/W', 'Xform')
      defAttr('/W', 'orientations', 'quatf[]', [[1, 0, 0, 0], [0, 0, 1, 0]])
    })
    const val = scene['/W.orientations']?.['default']?.value as VtArray<Quatf>
    expect(val.size).toBe(2)
    expect(val.get(1)).toEqual(new Quatf(0, 0, 1, 0))
  })

  it('round-trips a matrix4d attribute', () => {
    const m = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[3,4,5,1]]
    const { scene } = roundTrip(({ defPrim, defAttr }) => {
      defPrim('/W', 'Xform')
      defAttr('/W', 'xformOp:transform', 'matrix4d', m)
    })
    expect(scene['/W.xformOp:transform']?.['default']?.value)
      .toEqual(new Matrix4d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1))
  })
})

describe('serializeUsdc — time samples', () => {
  // Parser returns [time, ValueRep][] — unwrap to [time, value][]
  function unwrapTs(raw: unknown): [number, unknown][] {
    return (raw as [number, { value: unknown }][]).map(([t, vr]) => [t, vr.value])
  }

  it('round-trips double3 time samples', () => {
    const { scene } = roundTrip(({ defPrim, defAttr, layer }) => {
      defPrim('/W', 'Xform')
      defAttr('/W', 'xformOp:translate', 'double3', [0, 0, 0])
      layer.setAttrTimeSample('/W', 'xformOp:translate', 0, [0, 0, 0])
      layer.setAttrTimeSample('/W', 'xformOp:translate', 24, [10, 0, 0])
    })
    const ts = unwrapTs(scene['/W.xformOp:translate']?.['timeSamples']?.value)
    expect(ts).toHaveLength(2)
    expect(ts[0]![0]).toBe(0)
    expect(ts[1]![0]).toBe(24)
    expect(ts[1]![1]).toEqual(new Vec3d(10, 0, 0))
  })

  it('round-trips quatf time samples (orient animation)', () => {
    const { scene } = roundTrip(({ defPrim, defAttr, layer }) => {
      defPrim('/W', 'Xform')
      defAttr('/W', 'xformOp:orient', 'quatf', [1, 0, 0, 0])
      layer.setAttrTimeSample('/W', 'xformOp:orient', 0, [1, 0, 0, 0])
      layer.setAttrTimeSample('/W', 'xformOp:orient', 24, [0, 0, 1, 0])
      layer.setAttrTimeSample('/W', 'xformOp:orient', 48, [-1, 0, 0, 0])
    })
    const ts = unwrapTs(scene['/W.xformOp:orient']?.['timeSamples']?.value)
    expect(ts.map(([t]) => t)).toEqual([0, 24, 48])
    expect(ts[1]![1]).toEqual(new Quatf(0, 0, 1, 0))
    expect(ts[2]![1]).toEqual(new Quatf(-1, 0, 0, 0))
  })

  it('round-trips point3f[] time samples (deforming mesh)', () => {
    const p0 = [[0,0,0],[1,0,0],[0,1,0]]
    const p1 = [[0,0,1],[1,0,1],[0,1,1]]
    const { scene } = roundTrip(({ defPrim, defAttr, layer }) => {
      defPrim('/M', 'Mesh')
      defAttr('/M', 'points', 'point3f[]', p0)
      layer.setAttrTimeSample('/M', 'points', 0, p0)
      layer.setAttrTimeSample('/M', 'points', 12, p1)
    })
    const ts = unwrapTs(scene['/M.points']?.['timeSamples']?.value)
    expect(ts).toHaveLength(2)
    expect(ts[1]![1]).toEqual(p1)
  })

  it('time samples on an attr with no default still round-trip', () => {
    const { scene } = roundTrip(({ defPrim, layer }) => {
      defPrim('/W', 'Xform')
      layer.setField('/W.xformOp:translate', 'typeName', 'double3')
      layer.setAttrTimeSample('/W', 'xformOp:translate', 5, [1, 2, 3])
    })
    const spec = scene['/W.xformOp:translate']
    expect(spec?.['default']).toBeUndefined()
    const ts = unwrapTs(spec?.['timeSamples']?.value)
    expect(ts).toHaveLength(1)
    expect(ts[0]![1]).toEqual([1, 2, 3])
  })

  it('full stage round-trip: animated value resolves at time through Stage', async () => {
    const ctx = makeLayer()
    ctx.defPrim('/W', 'Xform')
    ctx.defAttr('/W', 'xformOp:translate', 'double3', [0, 0, 0])
    ctx.layer.setAttrTimeSample('/W', 'xformOp:translate', 0, [0, 0, 0])
    ctx.layer.setAttrTimeSample('/W', 'xformOp:translate', 24, [10, 0, 0])
    const bytes = serializeUsdc(ctx.layer)

    const { Stage } = await import('typescript-usd/usd')
    const { ArInMemoryResolver } = await import('typescript-usd/usd/_internal')
    const stage = (await Stage.open('anim_roundtrip.usdc', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'anim_roundtrip.usdc': bytes })) }))!
    const attr = stage.getPrim('/W')?.getAttr('xformOp:translate')
    expect(attr?.getTimeSampleKeys()).toEqual([0, 24])
    expect(attr?.getValueAtTime(12)).toEqual(new Vec3d(5, 0, 0))
  })
})
