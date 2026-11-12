import { _setResolverForTest } from 'typescript-usd/usd/_internal'
/**
 * Tests for Stage.open() using a mock file reader so we don't need real
 * files on disk. The USDA content is encoded as Uint8Array and served by
 * the injected file reader.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

// Minimal USDA with a /World Xform and /World/Cube Mesh child.
const SIMPLE_USDA = `#usda 1.0

def Xform "World"
{
    def Mesh "Cube"
    {
    }
}
`

// USDA with an attribute authored on the prim.
const USDA_WITH_ATTR = `#usda 1.0

def Mesh "Box"
{
    float width = 2.5
}
`

function makeResolver(content: string, path = 'test.usda'): ArInMemoryResolver {
  return new ArInMemoryResolver({ [path]: new TextEncoder().encode(content) })
}

describe('Stage.open with injected file reader', () => {
  afterEach(() => {
    _setResolverForTest(new ArInMemoryResolver({}))
  })

  it('opens a stage and has the top-level prim', async () => {
    _setResolverForTest(makeResolver(SIMPLE_USDA))
    const stage = (await Stage.open('test.usda'))!
    expect(stage.has('/World')).toBe(true)
  })

  it('has the nested prim', async () => {
    _setResolverForTest(makeResolver(SIMPLE_USDA))
    const stage = (await Stage.open('test.usda'))!
    expect(stage.has('/World/Cube')).toBe(true)
  })

  it('getPrim returns the right typeName for /World', async () => {
    _setResolverForTest(makeResolver(SIMPLE_USDA))
    const stage = (await Stage.open('test.usda'))!
    const world = stage.getPrim('/World')
    expect(world).toBeDefined()
    expect(world!.typeName).toBe('Xform')
  })

  it('getPrim returns the right typeName for /World/Cube', async () => {
    _setResolverForTest(makeResolver(SIMPLE_USDA))
    const stage = (await Stage.open('test.usda'))!
    const cube = stage.getPrim('/World/Cube')
    expect(cube).toBeDefined()
    expect(cube!.typeName).toBe('Mesh')
  })

  it('getChildPrimPaths("/") returns top-level prims only', async () => {
    _setResolverForTest(makeResolver(SIMPLE_USDA))
    const stage = (await Stage.open('test.usda'))!
    const rootChildren = stage.getChildPrimPaths('/')
    expect(rootChildren).toContain('/World')
    expect(rootChildren).not.toContain('/World/Cube')
  })

  it('getChildPrimPaths("/World") returns /World/Cube', async () => {
    _setResolverForTest(makeResolver(SIMPLE_USDA))
    const stage = (await Stage.open('test.usda'))!
    const worldChildren = stage.getChildPrimPaths('/World')
    expect(worldChildren).toContain('/World/Cube')
  })

  it('traverse includes all prim paths', async () => {
    _setResolverForTest(makeResolver(SIMPLE_USDA))
    const stage = (await Stage.open('test.usda'))!
    const paths = [...stage.traverse()]
    expect(paths).not.toContain('/')
    expect(paths).toContain('/World')
    expect(paths).toContain('/World/Cube')
  })

  it('returns undefined for a path not in the file', async () => {
    _setResolverForTest(makeResolver(SIMPLE_USDA))
    const stage = (await Stage.open('test.usda'))!
    expect(stage.getPrim('/NoSuch')).toBeUndefined()
  })
})

describe('Stage.open — authored attribute round-trip', () => {
  afterEach(() => {
    _setResolverForTest(new ArInMemoryResolver({}))
  })

  it('reads a float attribute default value from USDA', async () => {
    _setResolverForTest(makeResolver(USDA_WITH_ATTR, 'attr.usda'))
    const stage = (await Stage.open('attr.usda'))!
    expect(stage.has('/Box')).toBe(true)
    const prim = stage.getPrim('/Box')
    expect(prim).toBeDefined()
    expect(prim!.typeName).toBe('Mesh')
    const attr = prim!.getAttr('width')
    expect(attr).toBeDefined()
    expect(attr!.getValue()).toBeCloseTo(2.5)
  })
})
