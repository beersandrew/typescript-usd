// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdTimeOffsets.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usd/testenv/testUsdTimeOffsets.py
//
// The upstream suite verifies SdfLayerOffset (offset + scale) composition
// through references, payloads and sublayers: the offset shifts and the scale
// multiplies the time-sample KEYS of a composed attribute, while the VALUES at
// those keys are unchanged. Nested arcs compose their offsets (offset adds,
// scale multiplies); a sublayer offset further composes with a reference
// offset underneath it.
//
// Every numeric expectation is the GetTimeSamples()/Get(t) output of the
// identical scene built against the Pixar 26.05 reference build.
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, EditTarget as UsdEditTarget } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

// The shared source layer: /Foo.attr has float samples at 1, 2, 10 whose
// values equal their keys (1->1, 2->2, 10->10). This lets us check that the
// VALUES survive while the KEYS are remapped.
const LEAF = `#usda 1.0
def "Foo" {
    float attr = 0
    float attr.timeSamples = { 1: 1, 2: 2, 10: 10 }
    timecode tc = 1
}
`

describe('UsdTimeOffsets', () => {
  // -------------------------------------------------------------------- //
  // Flat reference offsets — test_ReferenceOffsets cases.
  // offset shifts keys, scale multiplies keys, values are unchanged.
  // -------------------------------------------------------------------- //
  describe('reference offsets remap time-sample keys', () => {
    // [name, offset, scale, expected keys] — keys = scale*t + offset for
    // t in {1,2,10}; values stay {1,2,10}.
    const cases: ReadonlyArray<[string, number, number, number[]]> = [
      ['Identity', 0.0, 1.0, [1, 2, 10]],
      ['Offset_1', 1.0, 1.0, [2, 3, 11]],
      ['Offset_neg1', -1.0, 1.0, [0, 1, 9]],
      ['Offset_7', 7.0, 1.0, [8, 9, 17]],
      ['Offset_neg7', -7.0, 1.0, [-6, -5, 3]],
      ['Scale_2', 0.0, 2.0, [2, 4, 20]],
      ['Scale_1p5', 0.0, 1.5, [1.5, 3, 15]],
      ['Scale_half', 0.0, 0.5, [0.5, 1, 5]],
      ['Scale_half_Offset_1', 1.0, 0.5, [1.5, 2, 6]],
      ['Scale_half_Offset_neg1', -1.0, 0.5, [-0.5, 0, 4]],
    ]

    for (const [name, offset, scale, keys] of cases) {
      it(`${name} (offset=${offset}, scale=${scale}) remaps keys to ${JSON.stringify(keys)}`, async () => {
        files = {
          'leaf.usda': LEAF,
          'root.usda': `#usda 1.0
def "P" (
    references = @./leaf.usda@</Foo> (offset = ${offset}; scale = ${scale})
) {}
`,
        }
        const stage = (await Stage.open('root.usda'))!
        const attr = stage.getPrim('/P')!.getAttr('attr')!
        expect(attr.getTimeSampleKeys()).toEqual(keys)
        // The VALUE at each remapped key is the original sample value:
        // value(scale*t + offset) === t. (VerifyOffset's Get assertions.)
        const orig = [1, 2, 10]
        keys.forEach((k, i) => {
          expect(attr.getValueAtTime(k)).toBe(orig[i])
        })
      })
    }
  })

  // -------------------------------------------------------------------- //
  // Nested reference offsets — test_ReferenceOffsets nested pass.
  // An outer reference's offset composes with the inner reference's offset:
  // offsets add, scales multiply (key = outerScale*(innerKey) + outerOffset).
  // -------------------------------------------------------------------- //
  describe('nested reference offsets compose', () => {
    it('inner offset=1 then outer offset=1 -> keys add (3, 4, 12)', async () => {
      files = {
        'leaf.usda': LEAF,
        'middle.usda': `#usda 1.0
def "Mid" (
    references = @./leaf.usda@</Foo> (offset = 1; scale = 1)
) {}
`,
        'root.usda': `#usda 1.0
def "P" (
    references = @./middle.usda@</Mid> (offset = 1; scale = 1)
) {}
`,
      }
      const stage = (await Stage.open('root.usda'))!
      const attr = stage.getPrim('/P')!.getAttr('attr')!
      expect(attr.getTimeSampleKeys()).toEqual([3, 4, 12])
      expect(attr.getValueAtTime(3)).toBe(1)
      expect(attr.getValueAtTime(4)).toBe(2)
      expect(attr.getValueAtTime(12)).toBe(10)
    })

    it('inner offset=1 then outer scale=2 -> outer scale applies to shifted keys (4, 6, 22)', async () => {
      files = {
        'leaf.usda': LEAF,
        'middle.usda': `#usda 1.0
def "Mid" (
    references = @./leaf.usda@</Foo> (offset = 1; scale = 1)
) {}
`,
        'root.usda': `#usda 1.0
def "P" (
    references = @./middle.usda@</Mid> (offset = 0; scale = 2)
) {}
`,
      }
      const stage = (await Stage.open('root.usda'))!
      const attr = stage.getPrim('/P')!.getAttr('attr')!
      // inner: t+1 -> {2,3,11}; outer scale 2 -> {4,6,22}
      expect(attr.getTimeSampleKeys()).toEqual([4, 6, 22])
      expect(attr.getValueAtTime(4)).toBe(1)
      expect(attr.getValueAtTime(6)).toBe(2)
      expect(attr.getValueAtTime(22)).toBe(10)
    })
  })

  // -------------------------------------------------------------------- //
  // Sublayer offsets — the upstream TODO (TestSublayerOffsets) exercised
  // through USDA subLayerOffsets, which typescript-usd composes.
  // -------------------------------------------------------------------- //
  describe('sublayer offsets remap time-sample keys', () => {
    it('subLayer (offset=5, scale=2) remaps keys to (7, 9, 25)', async () => {
      files = {
        'sub.usda': LEAF,
        'root.usda': `#usda 1.0
(
    subLayers = [@./sub.usda@ (offset = 5; scale = 2)]
)
`,
      }
      const stage = (await Stage.open('root.usda'))!
      const attr = stage.getPrim('/Foo')!.getAttr('attr')!
      // key = scale*t + offset = 2*{1,2,10}+5 = {7,9,25}
      expect(attr.getTimeSampleKeys()).toEqual([7, 9, 25])
      expect(attr.getValueAtTime(7)).toBe(1)
      expect(attr.getValueAtTime(9)).toBe(2)
      expect(attr.getValueAtTime(25)).toBe(10)
    })
  })

  // -------------------------------------------------------------------- //
  // Sublayer AND reference offsets — the upstream TODO
  // (TestSublayerAndReferenceOffsets). A sublayer offset composes with a
  // reference offset declared inside that sublayer.
  // -------------------------------------------------------------------- //
  describe('sublayer + reference offsets compose', () => {
    it('subLayer offset=5 over a reference offset=1 -> keys (7, 8, 16)', async () => {
      files = {
        'leaf.usda': LEAF,
        // This layer is sublayered into root; it references leaf with offset 1.
        'midref.usda': `#usda 1.0
def "P" (
    references = @./leaf.usda@</Foo> (offset = 1; scale = 1)
) {}
`,
        'root.usda': `#usda 1.0
(
    subLayers = [@./midref.usda@ (offset = 5; scale = 1)]
)
`,
      }
      const stage = (await Stage.open('root.usda'))!
      const attr = stage.getPrim('/P')!.getAttr('attr')!
      // ref offset 1: {2,3,11}; sublayer offset 5: {7,8,16}
      expect(attr.getTimeSampleKeys()).toEqual([7, 8, 16])
      expect(attr.getValueAtTime(7)).toBe(1)
      expect(attr.getValueAtTime(8)).toBe(2)
      expect(attr.getValueAtTime(16)).toBe(10)
    })
  })

  it('authoring across an offset applies the inverse offset to the authored key', async () => {
    files = {
      'leaf.usda': LEAF,
      'root.usda': `#usda 1.0
def "P" (
    references = @./leaf.usda@</Foo> (offset = 10; scale = 1)
) {}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const leaf = stage.getUsedLayers().find(layer => layer.filePath.endsWith('leaf.usda'))!
    const node = [...stage.getPrimIndex('/P')!.getNodeRange()].find(candidate =>
      !candidate.isRootNode() && candidate.layerStack.layers.some(entry => entry.layer === leaf))!
    const editTarget = new UsdEditTarget(leaf, node)
    expect(editTarget.mapToSpecPath('/P.attr')).toBe('/Foo.attr')
    stage.setEditTarget(editTarget)
    const writable = stage.definePrim('/P')
    writable.attr('attr').setTimeSample(12, 12)
    expect(leaf.getField('/Foo.attr', 'timeSamples')).toContainEqual([2, 12])
    writable.attr('tc').set(12)
    writable.attr('tc').setTimeSample(12, 12)
    expect(leaf.getField('/Foo.tc', 'default')).toBe(2)
    expect(leaf.getField('/Foo.tc', 'timeSamples')).toContainEqual([2, 2])
    await stage.flushChanges()
    const attr = stage.getPrim('/P')!.getAttr('attr')!
    expect(attr.getTimeSampleKeys()).toContain(12)
    expect(attr.getValueAtTime(12)).toBe(12)
    const tc = stage.getPrim('/P')!.getAttr('tc')!
    expect(tc.getValue()).toBe(12)
    expect(tc.getValueAtTime(12)).toBe(12)
  })

  it('authoring through a local-sublayer edit target applies its inverse offset', async () => {
    files = {
      'leaf.usda': LEAF,
      'root.usda': `#usda 1.0
(
    subLayers = [@./leaf.usda@ (offset = 4; scale = 3)]
)
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const leaf = stage.getLayerStack().find(layer => layer.filePath.endsWith('leaf.usda'))!
    stage.setEditTarget(stage.getEditTargetForLocalLayer(leaf))
    const writable = stage.definePrim('/Foo')
    writable.attr('attr').setTimeSample(13, 13)
    writable.attr('tc').setTimeSample(13, 13)
    expect(leaf.getField('/Foo.attr', 'timeSamples')).toContainEqual([3, 13])
    expect(leaf.getField('/Foo.tc', 'timeSamples')).toContainEqual([3, 3])
    await stage.flushChanges()
    expect(stage.get('/Foo.attr')!.getValueAtTime(13)).toBe(13)
    expect(stage.get('/Foo.tc')!.getValueAtTime(13)).toBe(13)
  })

  it('layer offsets remap timecode-typed attribute values', async () => {
    files = {
      'leaf.usda': `#usda 1.0
def "Foo" {
    timecode attr = 5
}
`,
      'root.usda': `#usda 1.0
def "P" (
    references = @./leaf.usda@</Foo> (offset = 10; scale = 1)
) {}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.getPrim('/P')!.getAttr('attr')!
    // Upstream: a timecode-VALUED attribute is itself a time, so composing it
    // through a reference with offset=10 remaps the VALUE too: 5 -> 15.
    expect(attr.getValue()).toBe(15)
  })
})
