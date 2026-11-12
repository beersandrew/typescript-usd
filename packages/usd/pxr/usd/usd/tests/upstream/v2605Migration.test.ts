import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// OpenUSD v26.05 migration regression tests (tracked version; see README
// "Tracked OpenUSD version"). Locks down the behaviors confirmed during the
// v25.08 → v26.05 assessment.

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'
import { Layer } from 'typescript-usd/sdf'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> {
    const name = assetPath.split('/').pop() ?? assetPath
    return new ArResolvedPath(files[name] === undefined ? '' : assetPath)
  }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    const name = path.toString().split('/').pop() ?? path.toString()
    const text = files[name]
    return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text))
  }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

describe('M4: internal reference layer offsets (upstream fix 8232798c7)', () => {
  // 26.05 fixed Pcp double-applying the source layer-stack offset to
  // internal references. Our flattened composition never had the bug —
  // verified against Pixar 25.08 (which shows [20,25], the buggy value).
  it('internal refs apply the layer-stack offset exactly once', async () => {
    files = {
      'root.usda': `#usda 1.0
(
    subLayers = [@./sub.usda@ (offset = 10)]
)
`,
      'sub.usda': `#usda 1.0
def Xform "A"
{
    double v = 0
    double v.timeSamples = { 0: 0, 5: 5 }
}
def "B" (
    references = </A>
)
{
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/A')?.getAttr('v')?.getTimeSampleKeys()).toEqual([10, 15])
    // 26.05-correct: [10, 15]. The pre-26.05 bug would give [20, 25].
    expect(stage.getPrim('/B')?.getAttr('v')?.getTimeSampleKeys()).toEqual([10, 15])
  })

  it('external refs through an offset sublayer compose both offsets', async () => {
    files = {
      'root.usda': `#usda 1.0
(
    subLayers = [@./sub.usda@ (offset = 10)]
)
`,
      'sub.usda': `#usda 1.0
def "C" (
    references = @./ext.usda@</E> (offset = 3)
)
{
}
`,
      'ext.usda': `#usda 1.0
def Xform "E"
{
    double w = 0
    double w.timeSamples = { 0: 0, 5: 5 }
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/C')?.getAttr('w')?.getTimeSampleKeys()).toEqual([13, 18])
  })
})

describe('USDA sublayer offset clauses', () => {
  it('parses subLayers = [@file@ (offset = N; scale = M)] into subLayerOffsets', () => {
    const layer = Layer.createInMemory('offsets.usda', `#usda 1.0
(
    subLayers = [@./a.usda@ (offset = 10; scale = 2), @./b.usda@]
)
`)
    expect(layer.getField('/', 'subLayers')).toEqual(['./a.usda', './b.usda'])
    expect(layer.getField('/', 'subLayerOffsets')).toEqual([
      { offset: 10, scale: 2 },
      { offset: 0, scale: 1 },
    ])
  })

  it('plain subLayers (no offsets) store identity subLayerOffsets', () => {
    const layer = Layer.createInMemory('plain.usda', `#usda 1.0
(
    subLayers = [@./a.usda@]
)
`)
    expect(layer.getField('/', 'subLayers')).toEqual(['./a.usda'])
    // OpenUSD v26.08 stores both fields for a non-empty sublayer list
    // (pseudoRoot.ListInfoKeys() == ['subLayerOffsets', 'subLayers']).
    expect(layer.getField('/', 'subLayerOffsets')).toEqual([{ offset: 0, scale: 1 }])
  })
})

describe('M3: 26.05 array-edit syntax tolerance', () => {
  it('edit [...] attribute values are skipped without derailing the file', () => {
    const layer = Layer.createInMemory('array-edit.usda', `#usda 1.0
def Xform "P"
{
    double[] arr = edit [
        append 1.5
        prepend 2.0
        write 3.5 to [1]
    ]
    double after = 7
}
`)
    // The edit value parses as unauthored; the rest of the prim survives
    expect(layer.getField('/P.after', 'default')).toBe(7)
  })
})
