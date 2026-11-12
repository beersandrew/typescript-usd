// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdCreateProperties.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// E3: opinion provenance — Stage.getPropertyStack mirrors
// UsdProperty::GetPropertyStack: every authored opinion for a property,
// strongest first, with its source layer and composition arc. This is what
// usdview's composition tab shows.

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

const ROOT = `#usda 1.0
(
    subLayers = [@./mid.usda@, @./weak.usda@]
)
def Xform "World" {
  def Sphere "Ball" {
    double radius = 100
  }
}
`

const MID = `#usda 1.0
over "World" {
  over "Ball" {
    double radius = 50
    string midOnly = "mid"
  }
}
`

const WEAK = `#usda 1.0
over "World" {
  over "Ball" {
    double radius = 1
    double radius.timeSamples = { 0: 1, 10: 11 }
  }
}
`

function setScene() {
  files = { 'root.usda': ROOT, 'mid.usda': MID, 'weak.usda': WEAK }
}

describe('Stage.getPropertyStack', () => {
  it('returns all contributing opinions strongest-first; [0] is the winner', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const stack = stage.getPropertyStack('/World/Ball.radius')

    expect(stack).toHaveLength(3)
    expect(stack.map(e => e.value)).toEqual([100, 50, 1])
    expect(stack[0]!.layerIdentifier).toContain('root.usda')
    expect(stack[1]!.layerIdentifier).toContain('mid.usda')
    expect(stack[2]!.layerIdentifier).toContain('weak.usda')
    // The winner matches composed value resolution
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(stack[0]!.value)
  })

  it('all sublayer opinions report the local arc', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    for (const entry of stage.getPropertyStack('/World/Ball.radius')) {
      expect(entry.arc).toBe('local')
    }
  })

  it('opinions include time samples when authored', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const stack = stage.getPropertyStack('/World/Ball.radius')
    const weak = stack[2]!
    expect(weak.timeSamples).toEqual([[0, 1], [10, 11]])
    expect(stack[0]!.timeSamples).toBeUndefined()
  })

  it('a property authored in one layer yields a single-entry stack', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const stack = stage.getPropertyStack('/World/Ball.midOnly')
    expect(stack).toHaveLength(1)
    expect(stack[0]!.value).toBe('mid')
    expect(stack[0]!.layerIdentifier).toContain('mid.usda')
  })

  it('unknown property or prim yields an empty stack', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPropertyStack('/World/Ball.nope')).toEqual([])
    expect(stage.getPropertyStack('/Nope.radius')).toEqual([])
    expect(stage.getPropertyStack('/World/Ball')).toEqual([])
  })

  it('the stack tracks live sublayer edits (reorder changes the winner)', async () => {
    files = {
      'root.usda': `#usda 1.0
(
    subLayers = [@./mid.usda@, @./weak.usda@]
)
def Xform "World" {
  def Sphere "Ball" {
  }
}
`,
      'mid.usda': MID, 'weak.usda': WEAK,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPropertyStack('/World/Ball.radius').map(e => e.value)).toEqual([50, 1])

    await stage.setSubLayerPaths(['./weak.usda', './mid.usda'])
    expect(stage.getPropertyStack('/World/Ball.radius').map(e => e.value)).toEqual([1, 50])
  })

  it('muted layers drop out of the stack', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    await stage.muteLayer('./mid.usda')

    const stack = stage.getPropertyStack('/World/Ball.radius')
    expect(stack.map(e => e.value)).toEqual([100, 1])
    expect(stack.some(e => e.layerIdentifier.includes('mid.usda'))).toBe(false)
  })

  it('specPath reports where the opinion lives inside its layer', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const stack = stage.getPropertyStack('/World/Ball.radius')
    expect(stack[0]!.specPath).toBe('/World/Ball.radius')
  })
})

// Applicable GetPropertyStack sections from the complete registered v26.05
// testUsdCreateProperties.py, verified live against the matching Python build.
describe('testUsdCreateProperties — property stacks', () => {
  it('composes reference offsets and accepts default or numeric query times', async () => {
    files = {
      'layerA.usda': `#usda 1.0
def "root" { string test ; }
`,
      'layerB.usda': `#usda 1.0
over "root" (prepend references = @./layerA.usda@</root> (offset = 10)) {
  string test
}
`,
      'layerC.usda': `#usda 1.0
over "root" (prepend references = @./layerB.usda@</root> (scale = 2)) {
  string test
}
`,
    }
    const stage = (await Stage.open('layerC.usda'))!
    type Stack = Array<{
      layerIdentifier: string
      offset: { offset: number; scale: number }
    }>
    const getStack = (stage as unknown as {
      getPropertyStackWithLayerOffsets(path: string, time?: 'default' | number): Stack
    }).getPropertyStackWithLayerOffsets.bind(stage)
    const expected = [
      ['layerC.usda', { offset: 0, scale: 1 }],
      ['layerB.usda', { offset: 0, scale: 2 }],
      ['layerA.usda', { offset: 20, scale: 2 }],
    ] as const
    for (const time of ['default', 101] as const) {
      const stack = getStack('/root.test', time)
      expect(stack.map(entry => [
        entry.layerIdentifier.split('/').pop(), entry.offset,
      ])).toEqual(expected)
    }
    const attr = stage.get('/root.test')! as unknown as {
      getPropertyStackWithLayerOffsets(time?: 'default' | number): Stack
    }
    expect(attr.getPropertyStackWithLayerOffsets()
      .map(entry => entry.layerIdentifier.split('/').pop()))
      .toEqual(['layerC.usda', 'layerB.usda', 'layerA.usda'])
  })

  it('inserts only the active clip property before the topology spec at numeric time', async () => {
    files = {
      'root.usda': `#usda 1.0
def "root" (prepend references = @./topology.usda@</root>) {
  def "fx" {
    def "test" (
      clips = { dictionary default = {
        double2[] active = [(102, 0), (103, 1), (104, 2)]
        asset[] assetPaths = [@./clipA.usda@, @./clipB.usda@, @./clipC.usda@]
        asset manifestAssetPath = @./topology.usda@
        string primPath = "/root/fx/test"
        double2[] times = [(102, 102), (103, 103), (104, 104)]
      } }
    ) {}
  }
}
`,
      'topology.usda': `#usda 1.0
def "root" { def "fx" { def "test" { double extent ; }
}
}
`,
      'clipA.usda': `#usda 1.0
def "root" { def "fx" { def "test" { double extent.timeSamples = { 102: 102 } ; }
}
}
`,
      'clipB.usda': `#usda 1.0
def "root" { def "fx" { def "test" { double extent.timeSamples = { 103: 103 } ; }
}
}
`,
      'clipC.usda': `#usda 1.0
def "root" { def "fx" { def "test" { double extent.timeSamples = { 104: 104 } ; }
}
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const getStack = (stage as unknown as {
      getPropertyStack(path: string, time?: 'default' | number): Array<{ layerIdentifier: string }>
    }).getPropertyStack.bind(stage)
    expect(getStack('/root/fx/test.extent', 'default')
      .map(entry => entry.layerIdentifier.split('/').pop())).toEqual(['topology.usda'])
    for (const [time, clip] of [[102, 'clipA.usda'], [103, 'clipB.usda'], [104, 'clipC.usda']] as const) {
      expect(getStack('/root/fx/test.extent', time)
        .map(entry => entry.layerIdentifier.split('/').pop()))
        .toEqual([clip, 'topology.usda'])
    }
  })
})

// ---- UsdPrim::GetPrimStackWithLayerOffsets analog ----

describe('getPrimStack', () => {
  it('reports contributing specs strongest-first with layer, path, arc, offset, metadata', async () => {
    files = {
      'root.usda': `#usda 1.0
(
    subLayers = [@./anim.usda@ (offset = 5)]
)
def "Holder" (
    kind = "component"
    prepend references = @./asset.usda@</Thing>
)
{
}
`,
      'asset.usda': `#usda 1.0
def Xform "Thing" {
}
`,
      'anim.usda': `#usda 1.0
over "Holder" {
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const stack = stage.getPrimStack('/Holder')

    expect(stack.length).toBe(3)
    // strongest: the root layer's own spec, with its authored metadata
    expect(stack[0]!.layerIdentifier).toContain('root.usda')
    expect(stack[0]!.specPath).toBe('/Holder')
    expect(stack[0]!.arc).toBe('local')
    expect(stack[0]!.metadata['kind']).toBe('component')
    // the sublayer over carries its composed offset
    const anim = stack.find(e => e.layerIdentifier.includes('anim.usda'))!
    expect(anim.arc).toBe('local')
    expect(anim.offset).toEqual({ offset: 5, scale: 1 })
    // the referenced spec reports the source-layer path and the arc
    const ref = stack.find(e => e.layerIdentifier.includes('asset.usda'))!
    expect(ref.specPath).toBe('/Thing')
    expect(ref.arc).toBe('reference')
  })

  it('the pseudo-root reports the root layer stack', async () => {
    files = {
      'root.usda': `#usda 1.0
(
    subLayers = [@./sub.usda@]
)
`,
      'sub.usda': '#usda 1.0\n',
    }
    const stage = (await Stage.open('root.usda'))!
    const stack = stage.getPrimStack('/')
    const ids = stack.map(e => e.layerIdentifier)
    expect(ids.some(i => i.includes('root.usda'))).toBe(true)
    expect(ids.some(i => i.includes('sub.usda'))).toBe(true)
  })
})
