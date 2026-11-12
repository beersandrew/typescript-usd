// Ported from OpenUSD 26.11.1: pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdStage composes prim indexes with PcpCache::ComputePrimIndexesInParallel
// (stage.cpp:5330-5392, cache.cpp:1687-1733), so the layers different prims
// reference open concurrently. The composed stage does not depend on the
// order in which those layers arrive.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver, _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import type { Asset as ArAsset, ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'

const PROPS = 12

// /World holds PROPS referenced props (each referencing a geometry layer),
// two instances of one asset and a reference to a missing layer.
function files(): Record<string, string> {
  const out: Record<string, string> = {}
  const props = Array.from({ length: PROPS }, (_, i) => `
    def "Prop${i}" (references = @./prop${i}.usda@) {}`).join('')
  out['root.usda'] = `#usda 1.0
def Xform "World" {${props}
    def "I1" (instanceable = true
        references = @./asset.usda@) {}
    def "I2" (instanceable = true
        references = @./asset.usda@) {}
    def "Missing" (references = @./missing.usda@) {}
}
`
  for (let i = 0; i < PROPS; i++) {
    out[`prop${i}.usda`] = `#usda 1.0
(defaultPrim = "Prop")
def Xform "Prop" (references = @./geom${i}.usda@</Geom>) {
    int index = ${i}
}
`
    out[`geom${i}.usda`] = `#usda 1.0
def Mesh "Geom" {
    int[] faceVertexCounts = [${i + 3}]
}
`
  }
  out['asset.usda'] = `#usda 1.0
(defaultPrim = "Asset")
def Xform "Asset" {
    def Sphere "Ball" {}
}
`
  return out
}

// Opens each asset after `delay(path)` ms and records how many opens overlap.
class SlowResolver extends ArInMemoryResolver {
  inFlight = 0
  maxInFlight = 0
  readonly opened: string[] = []
  constructor(assets: Record<string, Uint8Array>, private readonly delay: (path: string) => number) { super(assets) }
  override async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    this.opened.push(path.toString())
    this.maxInFlight = Math.max(this.maxInFlight, ++this.inFlight)
    try {
      await new Promise(resolve => setTimeout(resolve, this.delay(path.toString())))
      return await super.openAsset(path)
    } finally { this.inFlight-- }
  }
}

async function open(delay: (path: string) => number) {
  const encoded = Object.fromEntries(Object.entries(files()).map(([name, text]) => [name, new TextEncoder().encode(text)]))
  const resolver = new SlowResolver(encoded, delay)
  const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
  return { stage, resolver }
}

const summary = (stage: Stage) => ({
  layer: stage.flatten(false).exportToString(),
  prims: [...stage.traverseAll()].map(path => path),
  prototypes: stage.getPrototypes().map(prototype => [prototype.path,
    stage.getPrim('/World/I1')!.getPrototype()!.path, stage.getPrim('/World/I2')!.getPrototype()!.path]),
  errors: stage.getCompositionErrors().map(error => String(error)),
})

describe('parallel layer loads during composition', () => {
  it('opens the layers of different prims concurrently, each once', async () => {
    const { stage, resolver } = await open(() => 5)
    expect(stage.get('/World/Prop7.faceVertexCounts')?.getDefaultValue()).toEqual([10])
    expect(resolver.maxInFlight).toBeGreaterThan(4)
    expect(new Set(resolver.opened).size).toBe(resolver.opened.length)
  })

  it('composes the same stage whatever order the layers arrive in', async () => {
    const forward = await open(path => path.includes('prop') || path.includes('geom') ? 1 + Number(/\d+/.exec(path)![0]) : 1)
    const backward = await open(path => path.includes('prop') || path.includes('geom') ? PROPS + 1 - Number(/\d+/.exec(path)![0]) : 1)
    const immediate = await open(() => 0)
    expect(summary(backward.stage)).toEqual(summary(forward.stage))
    expect(summary(immediate.stage)).toEqual(summary(forward.stage))
    const { prims, prototypes, errors } = summary(forward.stage)
    // Depth-first namespace order and the first instance as prototype source.
    expect(prims.slice(0, 4)).toEqual(['/World', '/World/Prop0', '/World/Prop1', '/World/Prop2'])
    expect(prototypes).toEqual([['/__Prototype_1', '/__Prototype_1', '/__Prototype_1']])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/missing\.usda/)
  })
})
