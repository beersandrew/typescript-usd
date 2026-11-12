import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { UsdaWriter, serializeUsda } from 'typescript-usd/sdf'
import { parseUsda } from '../src/textFileFormatParser.ts'

// Loose view of the parsed scene for assertions: spec path → field → { value }
type FieldScene = Record<string, Record<string, { value: unknown }>>

// Round-trip helper: author → serialize → parse → read back
function roundTrip(fn: (stage: ReturnType<typeof Stage.createNew>) => void) {
  const stage = Stage.createNew()
  fn(stage)
  const usda = stage.exportToUsda()
  return { usda, scene: parseUsda(usda) as unknown as FieldScene }
}

describe('usda writer / header', () => {
  it('emits #usda 1.0 header', () => {
    const stage = Stage.createNew()
    const out = stage.exportToUsda()
    expect(out.startsWith('#usda 1.0')).toBe(true)
  })

  it('emits layer metadata when set', () => {
    const stage = Stage.createNew()
    stage.getEditTarget().getLayer()!.setField('/', 'defaultPrim', 'World')
    stage.getEditTarget().getLayer()!.setField('/', 'upAxis', 'Y')
    const out = stage.exportToUsda()
    expect(out).toContain('defaultPrim = "World"')
    expect(out).toContain('upAxis = "Y"')
  })
})

describe('usda writer / prim structure', () => {
  it('emits a single def prim', () => {
    const { usda, scene } = roundTrip(s => s.definePrim('/World', 'Xform'))
    expect(usda).toContain('def Xform "World"')
    expect(scene['/World']).toBeDefined()
  })

  it('emits nested prims', () => {
    const { usda, scene } = roundTrip(s => {
      s.definePrim('/World', 'Xform')
      s.definePrim('/World/Cube', 'Mesh')
    })
    expect(scene['/World']).toBeDefined()
    expect(scene['/World/Cube']).toBeDefined()
    expect(usda).toContain('def Xform "World"')
    expect(usda).toContain('def Mesh "Cube"')
  })

  it('emits prim with no typeName', () => {
    const { usda, scene } = roundTrip(s => s.definePrim('/Anon'))
    expect(usda).toContain('def "Anon"')
    expect(scene['/Anon']).toBeDefined()
  })

  it('emits multiple top-level prims', () => {
    const { scene } = roundTrip(s => {
      s.definePrim('/A', 'Xform')
      s.definePrim('/B', 'Xform')
    })
    expect(scene['/A']).toBeDefined()
    expect(scene['/B']).toBeDefined()
  })
})

describe('usda writer / scalar attributes', () => {
  it('round-trips bool', () => {
    const { scene } = roundTrip(s => {
      s.definePrim('/P').attr('flag').set(true)
    })
    expect(scene['/P.flag']!['default']!.value).toBe(true)
  })

  it('round-trips int', () => {
    const { scene } = roundTrip(s => {
      s.definePrim('/P').attr('count').set(42)
    })
    expect(scene['/P.count']!['default']!.value).toBe(42)
  })

  it('round-trips float', () => {
    const { scene } = roundTrip(s => {
      s.definePrim('/P').attr('scale').set(1.5)
    })
    expect(scene['/P.scale']!['default']!.value).toBeCloseTo(1.5)
  })

  it('round-trips string', () => {
    const { scene } = roundTrip(s => {
      s.definePrim('/P').attr('label').set('hello world')
    })
    expect(scene['/P.label']!['default']!.value).toBe('hello world')
  })

  it('escapes special chars in strings', () => {
    const { scene } = roundTrip(s => {
      s.definePrim('/P').attr('path').set('a/b"c')
    })
    expect(scene['/P.path']!['default']!.value).toBe('a/b"c')
  })
})

describe('usda writer / array attributes', () => {
  it('round-trips int[]', () => {
    const { scene } = roundTrip(s => {
      s.definePrim('/P').attr('counts').set([4, 4, 4, 4, 4, 4])
    })
    expect(scene['/P.counts']!['default']!.value).toEqual([4, 4, 4, 4, 4, 4])
  })

  it('round-trips float[]', () => {
    const { scene } = roundTrip(s => {
      s.definePrim('/P').attr('weights').set([0.5, 0.25, 0.25])
    })
    expect(scene['/P.weights']!['default']!.value).toEqual([0.5, 0.25, 0.25])
  })

  it('round-trips string[]', () => {
    const { scene } = roundTrip(s => {
      s.definePrim('/P').attr('tags').set(['a', 'b', 'c'])
    })
    expect(scene['/P.tags']!['default']!.value).toEqual(['a', 'b', 'c'])
  })

  it('round-trips vec3 array (float3[])', () => {
    const pts = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]
    const { scene } = roundTrip(s => {
      s.definePrim('/P').attr('points').set(pts)
    })
    expect(scene['/P.points']!['default']!.value).toEqual(pts)
  })

  it('emits empty array', () => {
    const { usda } = roundTrip(s => {
      s.definePrim('/P').attr('empty').set([])
    })
    expect(usda).toContain('= []')
  })
})

describe('usda writer / time samples', () => {
  it('round-trips time samples', () => {
    const { scene } = roundTrip(s => {
      const a = s.definePrim('/Anim').attr('xformOp:translate')
      a.setTimeSample(0, [0, 0, 0])
      a.setTimeSample(12, [5, 0, 0])
      a.setTimeSample(24, [10, 0, 0])
    })
    const ts = scene['/Anim.xformOp:translate']!['timeSamples']!.value as Record<string, unknown>
    expect(Object.keys(ts).map(Number).sort((a, b) => a - b)).toEqual([0, 12, 24])
  })

  it('emits timeSamples block', () => {
    const { usda } = roundTrip(s => {
      s.definePrim('/A').attr('v').setTimeSample(0, 1.0)
      s.definePrim('/A').attr('v').setTimeSample(1, 2.0)
    })
    expect(usda).toContain('.timeSamples = {')
    expect(usda).toContain('0:')
    expect(usda).toContain('1:')
  })
})

describe('usda writer / stored typeName', () => {
  it('uses stored typeName on attr spec', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/P', 'Mesh')
    prim.attr('points').set([[0, 0, 0]])
    // Override inferred type by writing to the attr spec directly
    stage.getEditTarget().getLayer()!.setField('/P.points', 'typeName', 'point3f[]')
    const usda = stage.exportToUsda()
    expect(usda).toContain('point3f[]')
  })
})

describe('usda writer / geometry round-trip', () => {
  it('serializes a minimal cube mesh', () => {
    const pts = [
      [0,0,0],[1,0,0],[1,1,0],[0,1,0],
      [0,0,1],[1,0,1],[1,1,1],[0,1,1],
    ]
    const counts = [4, 4, 4, 4, 4, 4]
    const indices = [0,1,2,3, 4,5,6,7, 0,1,5,4, 2,3,7,6, 0,3,7,4, 1,2,6,5]

    const { scene } = roundTrip(s => {
      const mesh = s.definePrim('/World/Cube', 'Mesh')
      mesh.attr('points').set(pts)
      mesh.attr('faceVertexCounts').set(counts)
      mesh.attr('faceVertexIndices').set(indices)
    })

    expect(scene['/World']).toBeDefined()
    expect(scene['/World/Cube']).toBeDefined()
    expect(scene['/World/Cube.points']!['default']!.value).toEqual(pts)
    expect(scene['/World/Cube.faceVertexCounts']!['default']!.value).toEqual(counts)
    expect(scene['/World/Cube.faceVertexIndices']!['default']!.value).toEqual(indices)
  })
})

describe('UsdaWriter class / layer.toUsda()', () => {
  it('UsdaWriter.serialize produces same output as serializeUsda', () => {
    const stage = Stage.createNew()
    stage.definePrim('/P', 'Xform')
    const layer = stage.getEditTarget().getLayer()!
    expect(UsdaWriter.serialize(layer)).toBe(serializeUsda(layer))
  })

  it('layer.toUsda() is available on the edit target', () => {
    const stage = Stage.createNew()
    stage.definePrim('/P', 'Xform')
    const usda = stage.getEditTarget().getLayer()!.toUsda()
    expect(usda).toContain('def Xform "P"')
  })
})
