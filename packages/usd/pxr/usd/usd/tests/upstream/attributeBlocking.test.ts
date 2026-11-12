// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdAttributeBlocking.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Complete applicable port of the registered
// testUsdAttributeBlocking.py and testUsdAttributeBlockingCpp testenvs.
// The matching v26.05 C++ binary passes both registered .usda and .usdc runs.
//
// Upstream covers four blocking mechanisms:
//   * Sdf.ValueBlock() authored as a DEFAULT opinion (`attr = None`) — a
//     stronger block suppresses weaker default opinions so Get() returns no
//     value (and GetResolveInfo().ValueIsBlocked() is true).
//   * Sdf.ValueBlock() authored on an individual TIME SAMPLE (`{ t: None }`) —
//     Get(t) at that sample returns no value while ValueIsBlocked() stays false
//     (time-sample blocking is not whole-value blocking).
//   * Attribute.Block() — the time-sample-wiping API that drops all samples and marks
//     the resolved value blocked.
//   * Attribute.BlockAnimation() / `= AnimationBlock` — blocks only the time-varying
//     value, letting a weaker default shine through.
//
// Goldens captured from: PYTHONPATH=<OpenUSD v26.05 build>/lib/python python3.9.

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, AttributeQuery as UsdAttributeQuery, ResolveInfoSource as UsdResolveInfoSource } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver, SdfValueBlock } from 'typescript-usd/usd/_internal'
import { ExtrapMode as TsExtrapMode, Extrapolation as TsExtrapolation, Spline as TsSpline } from 'typescript-usd/ts'

const startTime = 101
const endTime = 120

// Virtual filesystem keyed by basename (matches layerMuting.test.ts).
let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> {
    const name = path.split('/').pop() ?? path
    return new ArResolvedPath(files[name] === undefined ? '' : path)
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

// ---------------------------------------------------------------------------
// Baseline (no blocking) — mirrors CreateTestAssets: a default-valued attr and
// a time-sampled attr. Establishes the unblocked resolution we then block.
// ---------------------------------------------------------------------------
describe('attribute blocking / unblocked baseline (CreateTestAssets)', () => {
  function buildBaseline() {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Sphere', 'Xform')
    prim.attr('size').set(1.0) // default-valued attribute
    const pts = prim.attr('points') // time-sampled attribute
    for (let s = startTime; s < endTime; s++) pts.setTimeSample(s, s)
    return stage
  }

  it('resolves the authored default value', () => {
    const stage = buildBaseline()
    expect(stage.get('/Sphere.size')?.getValue()).toBe(1.0) // golden: 1.0
  })

  it('resolves authored time samples', () => {
    const stage = buildBaseline()
    const pts = stage.get('/Sphere.points')!
    expect(pts.getTimeSampleKeys()).toHaveLength(endTime - startTime) // golden: 19
    expect(pts.getValueAtTime(101)).toBe(101) // golden
    expect(pts.getValueAtTime(110)).toBe(110) // golden
    expect(pts.getValueAtTime(119)).toBe(119) // golden
  })
})

// ---------------------------------------------------------------------------
// Default value blocking, single layer (TestDefaultValueBlocking analog).
// Authoring `= None` (here: set(null)) leaves no resolved default value. With
// nothing weaker to fall back to this observably matches Pixar's block (Get()
// is None). NOTE: this is NOT full block semantics — see the cross-layer todo.
// ---------------------------------------------------------------------------
describe('attribute blocking / default block, single layer', () => {
  it('authored default present before blocking', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Sphere', 'Xform')
    prim.attr('size').set(1.0)
    expect(stage.get('/Sphere.size')?.getValue()).toBe(1.0)
  })

  it('a None default opinion resolves to no value', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Sphere', 'Xform')
    prim.attr('size').set(1.0)
    prim.attr('size').set(null) // the Sdf.ValueBlock() / `= None` analog
    // golden: defAttr.Get() is None  ->  no value resolved
    expect(stage.get('/Sphere.size')?.getValue() ?? undefined).toBeUndefined()
  })

  it('a None default parsed from USDA resolves to no value', async () => {
    files = {
      'root.usda': `#usda 1.0
def Xform "Sphere" {
  double size = None
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.get('/Sphere.size')?.getValue() ?? undefined).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Individual time-sample blocking across layers (TestIndividualTimeSampleBlocking
// analog). The strongest layer's timeSamples win as a whole, and a None-valued
// sample within them resolves to no value at that exact time, while other
// samples shine through. Goldens: Get(0)=1.0, Get(5)=None, keys=[0,5].
// ---------------------------------------------------------------------------
describe('attribute blocking / individual time-sample block (cross-layer)', () => {
  const ROOT = `#usda 1.0
(
    subLayers = [@./strong.usda@, @./weak.usda@]
)
`
  const STRONG = `#usda 1.0
def Xform "Sphere" {
  double points.timeSamples = { 0: 1.0, 5: None }
}
`
  const WEAK = `#usda 1.0
over "Sphere" {
  double points = 7.0
  double points.timeSamples = { 0: 1.0, 5: 5.0 }
}
`

  it('the strongest layer\'s samples win, with a blocked sample resolving to no value', async () => {
    files = { 'root.usda': ROOT, 'strong.usda': STRONG, 'weak.usda': WEAK }
    const stage = (await Stage.open('root.usda'))!
    const pts = stage.get('/Sphere.points')!
    // golden: GetNumTimeSamples()==2, keys==[0,5]
    expect(pts.getTimeSampleKeys()).toEqual([0, 5])
    // golden: Get(0)==1.0 (sample shines through)
    expect(pts.getValueAtTime(0)).toBe(1.0)
    // golden: Get(5) is None (blocked sample -> no value)
    expect(pts.getValueAtTime(5) ?? undefined).toBeUndefined()
  })

  it('holds up to a blocked sample and blocks from it to the next value', () => {
    const stage = Stage.createNew()
    const attr = stage.definePrim('/A').attr('x')
    attr.setTimeSample(0, 1)
    attr.setTimeSample(5, new SdfValueBlock())
    attr.setTimeSample(10, 9)

    // Live usd-2605 oracle: Get(2)=1, Get(5)=None, Get(6)=None, Get(10)=9.
    const composed = stage.get('/A.x')!
    expect(composed.getValueAtTime(2)).toBe(1)
    expect(composed.getValueAtTime(5) ?? undefined).toBeUndefined()
    expect(composed.getValueAtTime(6) ?? undefined).toBeUndefined()
    expect(composed.getValueAtTime(10)).toBe(9)
  })

  it('retains sample enumeration and bracketing when samples become blocked', () => {
    const stage = Stage.createNew()
    const writable = stage.definePrim('/A').attr('x')
    stage.declareProperty('/A', 'x', 'double')
    for (let time = startTime; time < endTime; time++) writable.setTimeSample(time, time)
    const attr = stage.get('/A.x')!
    const before = attr.getBracketingTimeSamples(110)

    writable.setTimeSample(110, new SdfValueBlock())
    const query = new UsdAttributeQuery(attr)
    expect(attr.getTimeSampleKeys()).toEqual(
      Array.from({ length: endTime - startTime }, (_, index) => startTime + index))
    expect(query.getTimeSamples()).toEqual(attr.getTimeSampleKeys())
    expect(attr.getBracketingTimeSamples(110)).toEqual(before)
    expect(query.getBracketingTimeSamples(110)).toEqual(before)
    expect(attr.getValueAtTime(110)).toBeUndefined()
    expect(query.get(110)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Composed block, resolve-info, animation-block, and spline-block behavior.
// ---------------------------------------------------------------------------
describe('attribute blocking / composed resolution', () => {
  it('cross-layer default block suppresses a weaker default opinion (Get() == None)', async () => {
    files = {
      'root.usda': `#usda 1.0
(
    subLayers = [@./strong.usda@, @./weak.usda@]
)
`,
      'strong.usda': `#usda 1.0
def Xform "Sphere" {
  double size = None
}
`,
      'weak.usda': `#usda 1.0
over "Sphere" {
  double size = 2.0
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    // golden: the strong layer's None block suppresses the weak default.
    expect(stage.get('/Sphere.size')?.getValue() ?? undefined).toBeUndefined()
  })

  it('Sdf.ValueBlock() sentinel distinguishes a block from a null value', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Sphere', 'Xform')
    const a = prim.attr('points')
    a.setTimeSample(0, new SdfValueBlock())
    const samples = stage.getRootLayer().getField(
      '/Sphere.points', 'timeSamples') as [number, unknown][]
    expect(samples[0]?.[1]).toBeInstanceOf(SdfValueBlock)
    expect(samples[0]?.[1]).not.toBeNull()
  })

  it('Attribute.Block() wipes all time samples and blocks the value', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Sphere', 'Xform')
    const a = prim.attr('points')
    for (let s = startTime; s < endTime; s++) a.setTimeSample(s, s)
    const blockable = a as unknown as { block(): void }
    blockable.block()
    const attr = stage.get('/Sphere.points')!
    expect(attr.getTimeSampleKeys()).toHaveLength(0)
    expect(new UsdAttributeQuery(attr).getNumTimeSamples()).toBe(0)
  })

  it('GetResolveInfo().ValueIsBlocked() reports whether the default is blocked', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Sphere', 'Xform')
    prim.attr('size').set(1.0)
    prim.attr('size').set(null)
    const attr = stage.get('/Sphere.size') as unknown as {
      getResolveInfo(): { valueIsBlocked(): boolean }
    }
    expect(attr.getResolveInfo().valueIsBlocked()).toBe(true)
  })

  it('a block reports fallback as its source when a schema fallback exists', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Collection')
    prim.applyAPI('CollectionAPI:test')
    prim.attr('collection:test:expansionRule').block()
    const attr = stage.get('/Collection.collection:test:expansionRule')!

    // Live usd-2605: Get() is None while HasValue() remains true because the
    // schema fallback is a potential value source underneath the block.
    expect(attr.getValue() ?? undefined).toBeUndefined()
    expect(attr.hasValue()).toBe(true)
    expect(attr.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.Fallback)
    expect(attr.getResolveInfo().valueIsBlocked()).toBe(true)
  })

  it('AnimationBlock / BlockAnimation() blocks animation but lets a weaker default through', async () => {
    files = {
      'root.usda': `#usda 1.0
(subLayers = [@weak.usda@])
def Xform "Sphere" { double size.timeSamples = { 0: 5 } ; }`,
      'weak.usda': `#usda 1.0
over "Sphere" { double size = 1 ; }`,
    }
    const stage = (await Stage.open('root.usda'))!
    stage.definePrim('/Sphere').attr('size').blockAnimation()
    const attr = stage.get('/Sphere.size')!
    // Animation blocked -> falls through to the weaker default (1.0).
    expect(attr.getValueAtTime(0)).toBe(1.0)
  })

  it('matches the registered C++ animation-block precedence matrix', async () => {
    files = {
      'root.usda': `#usda 1.0
(subLayers = [@strong.usda@, @weak.usda@, @weaker.usda@])
over "Human" { int c = AnimationBlock ; }`,
      'strong.usda': `#usda 1.0
def Xform "Human" {
  double b = AnimationBlock
  double b.spline = { 1: 10; post held, 2: 20; post held, }
  double d = AnimationBlock
  double e = AnimationBlock
}`,
      'weak.usda': `#usda 1.0
over "Human" {
  int a = AnimationBlock
  int a.timeSamples = { 1: 5, 2: 18 }
  double b.spline = { 1: 5; post held, 2: 18; post held, }
  int c.timeSamples = { 0: 456, 1: 789 }
  double d.spline = { 1: 5; post held, 2: 18; post held, }
}`,
      'weaker.usda': `#usda 1.0
over "Human" {
  int c = 1
  double d = 2
}`,
    }
    const stage = (await Stage.open('root.usda'))!
    const verify = (
      name: string, source: UsdResolveInfoSource,
      defaultValue: unknown, timeValue: unknown,
    ) => {
      const attr = stage.get(`/Human.${name}`)!
      const query = new UsdAttributeQuery(attr)
      expect(attr.getResolveInfo().getSource()).toBe(source)
      expect(attr.getValue()).toBe(defaultValue)
      expect(query.get()).toBe(defaultValue)
      expect(attr.getValueAtTime(1)).toBe(timeValue)
      expect(query.get(1)).toBe(timeValue)
    }

    verify('a', UsdResolveInfoSource.TimeSamples, undefined, 5)
    verify('b', UsdResolveInfoSource.Spline, undefined, 10)
    verify('c', UsdResolveInfoSource.Default, 1, 1)
    verify('d', UsdResolveInfoSource.Default, 2, 2)
    verify('e', UsdResolveInfoSource.None, undefined, undefined)
  })

  it('enumerates from no-specific-time resolve info, not a time-zero value query', async () => {
    const weak = `#usda 1.0
def "A" {
  double x = 3
  double x.timeSamples = { 0: 1, 10: 2 }
}`
    files = {
      'value.usda': `#usda 1.0
(subLayers = [@weak.usda@])
over "A" { double x = None ; }`,
      'animation.usda': `#usda 1.0
(subLayers = [@weak.usda@])
over "A" { double x = AnimationBlock ; }`,
      'weak.usda': weak,
    }

    const valueAttr = ((await Stage.open('value.usda'))!).get('/A.x')!
    expect(valueAttr.getTimeSampleKeys()).toEqual([])
    expect(valueAttr.hasAuthoredValue()).toBe(false)
    expect(valueAttr.hasAuthoredValueOpinion()).toBe(true)

    const animationAttr = ((await Stage.open('animation.usda'))!).get('/A.x')!
    expect(animationAttr.getTimeSampleKeys()).toEqual([])
    expect(animationAttr.hasAuthoredValue()).toBe(true)
    expect(animationAttr.getResolveInfo().getSource()).toBe(UsdResolveInfoSource.Default)
  })

  it('spline value blocking (Ts.InterpValueBlock / ExtrapValueBlock)', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Sphere', 'Xform')
    const spline = new TsSpline()
    spline.setPreExtrapolation(new TsExtrapolation(TsExtrapMode.ValueBlock))
    spline.setPostExtrapolation(new TsExtrapolation(TsExtrapMode.ValueBlock))
    stage.declareProperty('/Sphere', 'size', 'double')
    prim.attr('size').setSpline(spline)
    expect(stage.get('/Sphere.size')?.getValueAtTime(0) ?? undefined).toBeUndefined()
  })
})
