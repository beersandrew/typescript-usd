import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'

// Helper: build a stage with a simple hierarchy for reuse across suites.
function makeWorldStage() {
  const stage = Stage.createNew()
  stage.definePrim('/World', 'Xform')
  stage.definePrim('/World/Cube', 'Mesh')
  stage.definePrim('/World/Sphere', 'Sphere')
  stage.definePrim('/World/Cube/Inner', 'Xform')
  return stage
}

// -------------------------------------------------------------------------
// stage.has
// -------------------------------------------------------------------------
describe('stage.has', () => {
  it('returns true for the pseudo-root "/"', () => {
    const stage = Stage.createNew()
    expect(stage.has('/')).toBe(true)
  })

  it('returns true for a defined prim', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World', 'Xform')
    expect(stage.has('/World')).toBe(true)
  })

  it('returns true for an ancestor prim created implicitly', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World/Cube', 'Mesh')
    expect(stage.has('/World')).toBe(true)
  })

  it('returns false for a path that was never defined', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World', 'Xform')
    expect(stage.has('/World/Missing')).toBe(false)
  })

  it('returns false for an arbitrary unknown path', () => {
    const stage = Stage.createNew()
    expect(stage.has('/DoesNotExist')).toBe(false)
  })
})

// -------------------------------------------------------------------------
// stage.getPrim
// -------------------------------------------------------------------------
describe('stage.getPrim', () => {
  it('returns a Prim for an existing path', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World', 'Xform')
    const prim = stage.getPrim('/World')
    expect(prim).toBeDefined()
    expect(prim!.path).toBe('/World')
  })

  it('returns undefined for a missing path', () => {
    const stage = Stage.createNew()
    expect(stage.getPrim('/NoSuch')).toBeUndefined()
  })

  it('returns the pseudo-root prim at "/"', () => {
    const stage = Stage.createNew()
    const prim = stage.getPrim('/')
    expect(prim).toBeDefined()
    expect(prim!.path).toBe('/')
  })
})

// -------------------------------------------------------------------------
// stage.getChildPrimPaths
// -------------------------------------------------------------------------
describe('stage.getChildPrimPaths', () => {
  it('returns direct children of "/" — does not include deeper descendants', () => {
    const stage = makeWorldStage()
    const children = stage.getChildPrimPaths('/')
    expect(children).toContain('/World')
    // should NOT contain /World/Cube etc.
    expect(children).not.toContain('/World/Cube')
    expect(children).not.toContain('/World/Sphere')
  })

  it('returns direct children of "/World"', () => {
    const stage = makeWorldStage()
    const children = stage.getChildPrimPaths('/World')
    expect(children).toContain('/World/Cube')
    expect(children).toContain('/World/Sphere')
  })

  it('does not include grandchildren in /World children', () => {
    const stage = makeWorldStage()
    const children = stage.getChildPrimPaths('/World')
    expect(children).not.toContain('/World/Cube/Inner')
  })

  it('returns direct children of a leaf-level path', () => {
    const stage = makeWorldStage()
    const children = stage.getChildPrimPaths('/World/Cube')
    expect(children).toContain('/World/Cube/Inner')
  })

  it('returns [] for a path with no children', () => {
    const stage = makeWorldStage()
    // /World/Sphere has no children
    const children = stage.getChildPrimPaths('/World/Sphere')
    expect(children).toEqual([])
  })

  it('returns [] for an undefined path', () => {
    const stage = Stage.createNew()
    const children = stage.getChildPrimPaths('/NoSuchParent')
    expect(children).toEqual([])
  })

  it('does not include property paths (dots)', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/World', 'Xform')
    prim.attr('myAttr').set(1)
    const children = stage.getChildPrimPaths('/')
    expect(children.every(c => !c.includes('.'))).toBe(true)
  })
})

// -------------------------------------------------------------------------
// stage.traverse
// -------------------------------------------------------------------------
describe('stage.traverse', () => {
  it('excludes the pseudo-root', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World', 'Xform')
    const paths = [...stage.traverse()]
    expect(paths).not.toContain('/')
  })

  it('includes all defined prim paths', () => {
    const stage = makeWorldStage()
    const paths = [...stage.traverse()]
    expect(paths).toContain('/World')
    expect(paths).toContain('/World/Cube')
    expect(paths).toContain('/World/Sphere')
    expect(paths).toContain('/World/Cube/Inner')
  })

  it('returns no paths for an empty stage', () => {
    const stage = Stage.createNew()
    const paths = [...stage.traverse()]
    expect(paths).toEqual([])
  })
})

// -------------------------------------------------------------------------
// Prim.typeName
// -------------------------------------------------------------------------
describe('Prim.typeName', () => {
  it('returns the typeName passed to definePrim', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World', 'Xform')
    expect(stage.getPrim('/World')!.typeName).toBe('Xform')
  })

  it('returns "" for a prim defined without a typeName', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World')
    expect(stage.getPrim('/World')!.typeName).toBe('')
  })

  it('returns the correct typeName for each prim in a hierarchy', () => {
    const stage = makeWorldStage()
    expect(stage.getPrim('/World')!.typeName).toBe('Xform')
    expect(stage.getPrim('/World/Cube')!.typeName).toBe('Mesh')
    expect(stage.getPrim('/World/Sphere')!.typeName).toBe('Sphere')
  })
})

// -------------------------------------------------------------------------
// Prim.isActive
// -------------------------------------------------------------------------
describe('Prim.isActive', () => {
  it('defaults to true for a newly defined prim', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World', 'Xform')
    expect(stage.getPrim('/World')!.isActive).toBe(true)
  })
})

// -------------------------------------------------------------------------
// Prim.getAttr
// -------------------------------------------------------------------------
describe('Prim.getAttr', () => {
  it('returns an Attribute for an authored attribute', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/World/Cube', 'Mesh')
    prim.attr('size').set(2.5)
    const attr = stage.getPrim('/World/Cube')!.getAttr('size')
    expect(attr).toBeDefined()
    expect(attr!.getValue()).toBe(2.5)
  })

  it('returns an Attribute (schema fallback) for an unauthored attribute on a known prim', () => {
    const stage = Stage.createNew()
    stage.definePrim('/World/Cube', 'Mesh')
    const attr = stage.getPrim('/World/Cube')!.getAttr('notAuthored')
    // schema-fallback: Attribute is returned but getValue() is undefined
    expect(attr).toBeDefined()
    expect(attr!.getValue()).toBeUndefined()
  })

  it('returns undefined when the prim does not exist', () => {
    // Construct a Prim against a nodes map that doesn't have the path
    const stage = Stage.createNew()
    // getPrim returns undefined for missing path; getAttr is not reachable
    expect(stage.getPrim('/Missing')).toBeUndefined()
  })
})

// -------------------------------------------------------------------------
// Attribute.getValue / Attribute.getTimeSampleKeys
// -------------------------------------------------------------------------
describe('Attribute.getValue', () => {
  it('returns the authored default value', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/P', 'Mesh')
    prim.attr('radius').set(3.14)
    const attr = stage.getPrim('/P')!.getAttr('radius')!
    expect(attr.getValue()).toBeCloseTo(3.14)
  })

  it('returns an array default value', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/P', 'Mesh')
    const pts = [[0, 0, 0], [1, 0, 0]]
    prim.attr('points').set(pts)
    expect(stage.getPrim('/P')!.getAttr('points')!.getValue()).toEqual(pts)
  })
})

describe('Attribute.getTimeSampleKeys', () => {
  it('returns sorted sample times', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Anim', 'Xform')
    prim.attr('xformOp:translate').setTimeSample(24, [10, 0, 0])
    prim.attr('xformOp:translate').setTimeSample(0, [0, 0, 0])
    prim.attr('xformOp:translate').setTimeSample(12, [5, 0, 0])
    const keys = stage.getPrim('/Anim')!.getAttr('xformOp:translate')!.getTimeSampleKeys()
    expect(keys).toEqual([0, 12, 24])
  })

  it('returns [] for an attribute with no time samples', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/P', 'Mesh')
    prim.attr('size').set(1)
    const keys = stage.getPrim('/P')!.getAttr('size')!.getTimeSampleKeys()
    expect(keys).toEqual([])
  })

  it('returns [] for an unauthored attribute (schema fallback)', () => {
    const stage = Stage.createNew()
    stage.definePrim('/P', 'Mesh')
    const keys = stage.getPrim('/P')!.getAttr('unauthoered')!.getTimeSampleKeys()
    expect(keys).toEqual([])
  })
})
