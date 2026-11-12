// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdReferences.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usd/testenv/testUsdReferences.py
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArResolver, ArResolvedPath, ArAsset, ArInMemoryAsset } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => { _setResolverForTest(new FixtureResolver()) })

// A reference targets the layer STACK rooted at the target layer — the
// target plus all its sublayers, recursive, strongest-first, with
// subLayerOffsets applied (PcpLayerStack). Logged from a consumer needs queue:
// a target whose prim arrives purely via sublayers composed nothing.
// Every expectation below is verified against Pixar 26.05
// `usdcat --flatten` on the identical layers.
describe('references to layer stacks', () => {
  const LEAF = `#usda 1.0
def Mesh "Thing" {
    float width = 2.5
    float width.timeSamples = { 0: 1.0, 10: 3.0 }
    def Cube "Child" {
        double size = 4
    }
}
`

  it('composes a prim that arrives purely via the target layer\'s sublayer', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Holder" (
    prepend references = @./middle.usda@</Thing>
) {}
`,
      'middle.usda': `#usda 1.0
(
    subLayers = [@./leaf.usda@]
)
`,
      'leaf.usda': LEAF,
    }
    const stage = (await Stage.open('root.usda'))!
    const holder = stage.getPrim('/Holder')!
    expect(holder.typeName).toBe('Mesh')
    expect(holder.getAttr('width')?.getValue()).toBe(2.5)
    // children compose through the stack too
    expect(stage.getPrim('/Holder/Child')?.typeName).toBe('Cube')
    expect(stage.getPrim('/Holder/Child')?.getAttr('size')?.getValue()).toBe(4)
  })

  it('target-stack strength: the target layer\'s own over beats its sublayer\'s def', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Holder" (
    prepend references = @./middle.usda@</Thing>
) {}
`,
      'middle.usda': `#usda 1.0
(
    subLayers = [@./leaf.usda@]
)
over "Thing" {
    float width = 9
}
`,
      'leaf.usda': LEAF,
    }
    const stage = (await Stage.open('root.usda'))!
    const holder = stage.getPrim('/Holder')!
    expect(holder.typeName).toBe('Mesh')
    expect(holder.getAttr('width')?.getValue()).toBe(9)
  })

  it('applies subLayerOffsets inside the referenced stack to time samples', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Holder" (
    prepend references = @./middle.usda@</Thing>
) {}
`,
      'middle.usda': `#usda 1.0
(
    subLayers = [@./leaf.usda@ (offset = 5)]
)
`,
      'leaf.usda': LEAF,
    }
    const stage = (await Stage.open('root.usda'))!
    const width = stage.getPrim('/Holder')!.getAttr('width')!
    // Pixar: samples shift 0→5, 10→15
    expect(width.getTimeSampleKeys()).toEqual([5, 15])
    expect(width.getValueAtTime(5)).toBe(1)
    expect(width.getValueAtTime(15)).toBe(3)
  })

  it('composes through nested sublayers (two levels deep)', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Holder" (
    prepend references = @./middle.usda@</Thing>
) {}
`,
      'middle.usda': `#usda 1.0
(
    subLayers = [@./leaf.usda@]
)
`,
      'leaf.usda': `#usda 1.0
(
    subLayers = [@./inner.usda@]
)
`,
      'inner.usda': `#usda 1.0
def Mesh "Thing" {
    float width = 7.5
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const holder = stage.getPrim('/Holder')!
    expect(holder.typeName).toBe('Mesh')
    expect(holder.getAttr('width')?.getValue()).toBe(7.5)
  })
})

// An asset layer referenced by the cases below. `Asset` is the defaultPrim;
// it carries a referenced `radius` so we can watch it both arrive across the
// arc and be overridden by a stronger local opinion. A child `Seat` lets us
// confirm whole subtrees compose. Verified against Pixar 26.05 usdcat.
const ASSET = `#usda 1.0
(
    defaultPrim = "Asset"
)
def Sphere "Asset" {
    double radius = 2
    def Cube "Seat" {
        double size = 4
    }
}
`

describe('UsdReferences', () => {
  describe('AddReference', () => {
    it('AddReference on a prim resolves the referenced layer and composes its prims', async () => {
      // The thin mutate API (UsdReferences.addReference) resolves the asset
      // against the edit target and recomposes live.
      files = { 'asset.usda': ASSET, 'scene.usda': `#usda 1.0
def Xform "World" {}
` }
      const stage = (await Stage.open('scene.usda'))!
      const prim = stage.definePrim('/World/Chair', 'Xform')
      await prim.getReferences().addReference('./asset.usda')
      // The whole subtree composes across the arc.
      expect(stage.getPrim('/World/Chair/Seat')?.typeName).toBe('Cube')
      expect(stage.getPrim('/World/Chair/Seat')?.getAttr('size')?.getValue()).toBe(4)
    })

    it('referenced prim typeName is inherited by the referencing prim', async () => {
      files = { 'asset.usda': ASSET, 'root.usda': `#usda 1.0
def "Ref" (
    prepend references = @./asset.usda@</Asset>
) {}
` }
      const stage = (await Stage.open('root.usda'))!
      // Pixar: typeless local def picks up Sphere from the referenced prim.
      expect(stage.getPrim('/Ref')?.typeName).toBe('Sphere')
    })

    it('referenced attributes are visible on the referencing prim', async () => {
      files = { 'asset.usda': ASSET, 'root.usda': `#usda 1.0
def "Ref" (
    prepend references = @./asset.usda@</Asset>
) {}
` }
      const stage = (await Stage.open('root.usda'))!
      // Pixar: radius = 2 arrives purely across the reference.
      expect(stage.getPrim('/Ref')?.getAttr('radius')?.getValue()).toBe(2)
    })

    it('local opinions on the referencing prim are stronger than referenced opinions', async () => {
      files = { 'asset.usda': ASSET, 'root.usda': `#usda 1.0
def "Ref" (
    prepend references = @./asset.usda@</Asset>
) {
    double radius = 9
}
` }
      const stage = (await Stage.open('root.usda'))!
      // Pixar: local radius = 9 wins over the referenced radius = 2.
      expect(stage.getPrim('/Ref')?.getAttr('radius')?.getValue()).toBe(9)
    })
  })

  describe('Internal references', () => {
    it('an internal reference (references = </Path>) composes from another path on the same stage', async () => {
      files = { 'root.usda': `#usda 1.0
def Sphere "Target" {
    double radius = 3
}
def "RefIn" (
    references = </Target>
) {}
` }
      const stage = (await Stage.open('root.usda'))!
      // Pixar: /RefIn composes Sphere + radius = 3 from /Target.
      expect(stage.getPrim('/RefIn')?.typeName).toBe('Sphere')
      expect(stage.getPrim('/RefIn')?.getAttr('radius')?.getValue()).toBe(3)
    })

    it('an internal reference with a layer offset applies the offset to time samples', async () => {
      files = { 'root.usda': `#usda 1.0
def "Target" {
    double w = 0
    double w.timeSamples = { 0: 1, 10: 3 }
}
def "RefIn" (
    references = </Target> (offset = 5)
) {}
` }
      const stage = (await Stage.open('root.usda'))!
      const w = stage.getPrim('/RefIn')!.getAttr('w')!
      // Pixar: samples shift 0→5, 10→15.
      expect(w.getTimeSampleKeys()).toEqual([5, 15])
      expect(w.getValueAtTime(5)).toBe(1)
      expect(w.getValueAtTime(15)).toBe(3)
    })
  })

  describe('Reference list ops', () => {
    it('ClearReferences removes all references', async () => {
      files = { 'asset.usda': ASSET, 'scene.usda': `#usda 1.0
def Xform "World" {}
` }
      const stage = (await Stage.open('scene.usda'))!
      const refs = stage.definePrim('/World/Chair', 'Xform').getReferences()
      await refs.addReference('./asset.usda')
      expect(stage.getPrim('/World/Chair/Seat')).toBeDefined()
      await refs.clear()
      // Clearing drops the arc; the composed subtree disappears.
      expect(stage.getPrim('/World/Chair/Seat')).toBeUndefined()
    })

    it('SetReferences replaces the full reference list', async () => {
      files = { 'asset.usda': ASSET, 'scene.usda': `#usda 1.0
def Xform "World" {}
` }
      const stage = (await Stage.open('scene.usda'))!
      const refs = stage.definePrim('/World/Chair', 'Xform').getReferences()
      await refs.addReference('./asset.usda')
      // Replace the whole list with a single different reference.
      await refs.setReferences([{ assetPath: './asset.usda', primPath: '/Asset/Seat' }])
      const authored = stage.getRootLayer().getField('/World/Chair', 'references') as {
        isExplicit: boolean
        explicitItems: { assetPath: string; primPath: string }[]
      }
      expect(authored.isExplicit).toBe(true)
      expect(authored.explicitItems).toEqual([
        expect.objectContaining({ assetPath: './asset.usda', primPath: '/Asset/Seat' }),
      ])
    })
  })

  describe('Layer offsets', () => {
    const LEAF = `#usda 1.0
def "Thing" {
    double w = 0
    double w.timeSamples = { 0: 1, 10: 3 }
}
`
    it('reference with a layer offset shifts time samples by the offset amount', async () => {
      files = { 'leaf.usda': LEAF, 'root.usda': `#usda 1.0
def "Holder" (
    references = @./leaf.usda@</Thing> (offset = 5)
) {}
` }
      const stage = (await Stage.open('root.usda'))!
      const w = stage.getPrim('/Holder')!.getAttr('w')!
      // Pixar: samples shift 0→5, 10→15.
      expect(w.getTimeSampleKeys()).toEqual([5, 15])
      expect(w.getValueAtTime(5)).toBe(1)
      expect(w.getValueAtTime(15)).toBe(3)
    })

    it('reference with a scale factor scales time sample keys', async () => {
      files = { 'leaf.usda': LEAF, 'root.usda': `#usda 1.0
def "Holder" (
    references = @./leaf.usda@</Thing> (scale = 2)
) {}
` }
      const stage = (await Stage.open('root.usda'))!
      const w = stage.getPrim('/Holder')!.getAttr('w')!
      // Pixar: keys scale 0→0, 10→20; values unchanged.
      expect(w.getTimeSampleKeys()).toEqual([0, 20])
      expect(w.getValueAtTime(0)).toBe(1)
      expect(w.getValueAtTime(20)).toBe(3)
    })
  })

  describe('Errors', () => {
    it('referencing a nonexistent file composes gracefully without the missing content', async () => {
      files = { 'root.usda': `#usda 1.0
def Sphere "Ref" (
    references = @./missing.usda@</Foo>
) {
    double radius = 5
}
` }
      // Pixar posts a composition error but still instantiates the prim with
      // its local opinions; the unresolved arc contributes nothing.
      const stage = (await Stage.open('root.usda'))!
      const prim = stage.getPrim('/Ref')!
      expect(prim).toBeDefined()
      expect(prim.typeName).toBe('Sphere')
      expect(prim.getAttr('radius')?.getValue()).toBe(5)
    })

    it('circular references are broken at the cycle, not followed infinitely', async () => {
      files = {
        'a.usda': `#usda 1.0
def "A" (
    references = @./b.usda@</B>
) {
    double x = 1
}
`,
        'b.usda': `#usda 1.0
def "B" (
    references = @./a.usda@</A>
) {
    double y = 2
}
`,
      }
      // Pixar: detects the cycle and cuts it; /A still composes its own x and
      // B's y across the single legal hop, without recursing forever.
      const stage = (await Stage.open('a.usda'))!
      const prim = stage.getPrim('/A')!
      expect(prim).toBeDefined()
      expect(prim.getAttr('x')?.getValue()).toBe(1)
      expect(prim.getAttr('y')?.getValue()).toBe(2)
    })
  })
})
