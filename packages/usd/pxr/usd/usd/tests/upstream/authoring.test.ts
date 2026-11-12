import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'

describe('Stage.createNew', () => {
  it('creates an empty stage', () => {
    const stage = Stage.createNew()
    expect(stage.has('/')).toBe(true)
    expect(stage.has('/Foo')).toBe(false)
  })

  it('has a writable edit target', () => {
    const stage = Stage.createNew()
    expect(stage.getEditTarget()).toBeDefined()
  })
})

describe('stage.definePrim', () => {
  it('defines a top-level prim', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World', 'Xform')
    expect(stage.has('/World')).toBe(true)
    expect(stage.getPrim('/World')?.typeName).toBe('Xform')
  })

  it('defines a nested prim and creates ancestor', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World/Cube', 'Mesh')
    expect(stage.has('/World')).toBe(true)
    expect(stage.has('/World/Cube')).toBe(true)
    expect(stage.getPrim('/World/Cube')?.typeName).toBe('Mesh')
  })

  it('returns a Prim handle', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/World', 'Xform')
    expect(prim.path).toBe('/World')
    expect(prim.typeName).toBe('Xform')
  })

  it('defines multiple siblings', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World/Cube', 'Mesh')
    stage.definePrim('/World/Sphere', 'Sphere')
    expect(stage.has('/World/Cube')).toBe(true)
    expect(stage.has('/World/Sphere')).toBe(true)
  })
})

describe('Prim.attr / createAttr', () => {
  it('sets a default value and reads it back', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/World/Cube', 'Mesh')
    prim.attr('myFloat').set(3.14)
    const val = stage.get('/World/Cube.myFloat')?.getValue()
    expect(val).toBeCloseTo(3.14)
  })

  it('sets an array attribute', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/World/Cube', 'Mesh')
    const counts = [4, 4, 4, 4, 4, 4]
    prim.attr('faceVertexCounts').set(counts)
    expect(stage.get('/World/Cube.faceVertexCounts')?.getValue()).toEqual(counts)
  })

  it('createAttr sets value inline', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Prim', 'Xform')
    prim.createAttr('scale', 2.0)
    expect(stage.get('/Prim.scale')?.getValue()).toBe(2.0)
  })

  it('attr().get() returns the written value', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Prim', 'Mesh')
    const a = prim.attr('points')
    a.set([[0, 0, 0], [1, 0, 0], [1, 1, 0]])
    expect(a.get()).toEqual([[0, 0, 0], [1, 0, 0], [1, 1, 0]])
  })
})

describe('Attribute.setTimeSample', () => {
  it('stores and reads back time samples', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Animated', 'Xform')
    const a = prim.attr('xformOp:translate')
    a.setTimeSample(0, [0, 0, 0])
    a.setTimeSample(24, [10, 0, 0])
    const attr = stage.get('/Animated.xformOp:translate')!
    expect(attr.getTimeSampleKeys()).toEqual([0, 24])
    expect(attr.getValueAtTime(0)).toEqual([0, 0, 0])
    expect(attr.getValueAtTime(24)).toEqual([10, 0, 0])
  })

  it('replaces an existing time sample at the same time', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Animated', 'Xform')
    prim.attr('val').setTimeSample(1, 'first')
    prim.attr('val').setTimeSample(1, 'replaced')
    const keys = stage.get('/Animated.val')!.getTimeSampleKeys()
    expect(keys).toEqual([1])
    expect(stage.get('/Animated.val')!.getValueAtTime(1)).toBe('replaced')
  })
})

describe('edit target layer scene', () => {
  it('records primChildren in the edit target', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World/Cube', 'Mesh')
    const layer = stage.getEditTarget().getLayer()!
    const children = layer.getField('/World', 'primChildren') as string[]
    expect(children).toContain('Cube')
  })

  it('records typeName in the edit target', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World/Cube', 'Mesh')
    const layer = stage.getEditTarget().getLayer()!
    expect(layer.getField('/World/Cube', 'typeName')).toBe('Mesh')
  })

  it('records attribute default in the edit target', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Prim', 'Mesh')
    prim.attr('points').set([[1, 2, 3]])
    const layer = stage.getEditTarget().getLayer()!
    expect(layer.getField('/Prim.points', 'default')).toEqual([[1, 2, 3]])
  })
})
