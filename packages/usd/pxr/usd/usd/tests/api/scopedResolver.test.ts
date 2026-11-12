import { _sdfFindOrOpenLayer } from 'typescript-usd/sdf/_internal'
import { _setResolverForTest } from 'typescript-usd/usd/_internal'
import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Browser-safe resolver-context adaptation: Stage.open captures an immutable
// logical context, so overlapping opens cannot contaminate one another.

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver, Layer } from 'typescript-usd/usd/_internal'

beforeEach(() => {
  _setResolverForTest(new ArInMemoryResolver({}))
})

function memoryResolver(files: Record<string, string>): ArInMemoryResolver {
  return new ArInMemoryResolver(Object.fromEntries(
    Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)])))
}

const SCENE_A = {
  'root.usda': `#usda 1.0
(
    subLayers = [@./sub.usda@]
)
def Xform "World" {
  def Sphere "Ball" {
  }
}
`,
  'sub.usda': `#usda 1.0
over "World" {
  over "Ball" {
    double radius = 11
  }
}
`,
}

const SCENE_B = {
  'root.usda': `#usda 1.0
def Xform "World" {
  def Cube "Box" {
    double size = 22
  }
}
`,
}

describe('scoped resolvers', () => {
  it('two stages with different in-memory layer sets coexist', async () => {
    const [a, b] = await Promise.all([
      Stage.open('root.usda', { resolverContext: _resolverContextForResolver(memoryResolver(SCENE_A)) }).then(value => value!),
      Stage.open('root.usda', { resolverContext: _resolverContextForResolver(memoryResolver(SCENE_B)) }).then(value => value!),
    ])

    expect(a.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(11)
    expect(a.has('/World/Box')).toBe(false)

    expect(b.getPrim('/World/Box')?.getAttr('size')?.getValue()).toBe(22)
    expect(b.has('/World/Ball')).toBe(false)
  })

  it('sublayers resolve through the stage resolver (not the global)', async () => {
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(memoryResolver(SCENE_A)) }))!
    // radius comes from sub.usda — only reachable via the scoped resolver
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(11)
  })

  it('recomposition (muting, sublayer edits) keeps using the stage resolver', async () => {
    const files = { ...SCENE_A, 'extra.usda': `#usda 1.0
over "World" {
  def Cone "New" {
    double height = 4
  }
}
` }
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(memoryResolver(files)) }))!

    await stage.muteLayer('./sub.usda')
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBeUndefined()

    await stage.unmuteLayer('./sub.usda')
    await stage.insertSubLayer('./extra.usda')
    expect(stage.getPrim('/World/New')?.getAttr('height')?.getValue()).toBe(4)
  })

  it('Layer.createInMemory parses USDA text under the given identifier', () => {
    const layer = Layer.createInMemory('mem://test.usda', `#usda 1.0
def Xform "X" {
  double a = 5
}
`)
    expect(layer.filePath).toBe('mem://test.usda')
    expect(layer.getField('/X.a', 'default')).toBe(5)
  })

  it('Layer.open accepts a per-call reader', async () => {
    const layer = (await _sdfFindOrOpenLayer('anything.usda', memoryResolver({
      'anything.usda': `#usda 1.0
def "P" {
}
`,
    })))!
    expect(layer.getField('/P', 'specifier')).toBeDefined()
  })
})
