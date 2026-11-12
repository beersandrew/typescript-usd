// Ported from OpenUSD 26.11.1: pxr/usd/usd/attributeQuery.cpp,
//  pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Time-sample reads resolve to the source layer and read samples from it on
// demand (OpenUSD v26.08 stage.cpp _GetValueFromResolveInfoImpl,
// attributeQuery.cpp): reads bracket the live samples instead of copying the
// whole map, and an attribute query sees later value edits on its source.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage, AttributeQuery, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { ArInMemoryResolver, _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { Array as VtArray, ArrayEditBuilder as VtArrayEditBuilder } from 'typescript-usd/vt'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

async function referencedStage(): Promise<Stage> {
  const resolver = new ArInMemoryResolver({
    'root.usda': enc(`#usda 1.0
def "Root" (
    references = @asset.usda@</Asset> (offset = 10; scale = 2)
)
{
}
`),
    'asset.usda': enc(`#usda 1.0
def "Asset"
{
    double weight.timeSamples = { 0: 0, 1: 10, 2: 20, 3: 30, 4: None, 5: 50 }
    token mode.timeSamples = { 0: "a", 1: "b", 2: "c" }
}
`),
  })
  return (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
}

describe('time-sample reads through a layer offset', () => {
  // Asset times 0..5 land at stage times 10, 12, 14, 16, 18, 20.
  it('lists and brackets sample times in stage time', async () => {
    const attr = (await referencedStage()).getPrim('/Root')!.getAttr('weight')!
    expect(attr.getTimeSampleKeys()).toEqual([10, 12, 14, 16, 18, 20])
    expect(attr.getBracketingTimeSamples(5)).toEqual([10, 10])
    expect(attr.getBracketingTimeSamples(12)).toEqual([12, 12])
    expect(attr.getBracketingTimeSamples(13)).toEqual([12, 14])
    expect(attr.getBracketingTimeSamples(99)).toEqual([20, 20])
  })

  it('interpolates between the bracketing samples', async () => {
    const attr = (await referencedStage()).getPrim('/Root')!.getAttr('weight')!
    expect(attr.getValueAtTime(0)).toBe(0)
    expect(attr.getValueAtTime(11)).toBe(5)
    expect(attr.getValueAtTime(12)).toBe(10)
    expect(attr.getValueAtTime(15.5)).toBe(27.5)
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(12))).toBe(10)
    expect(attr.getValueAtTime(100)).toBe(50)
  })

  it('honors blocks at either end of an interval', async () => {
    const attr = (await referencedStage()).getPrim('/Root')!.getAttr('weight')!
    expect(attr.getValueAtTime(17)).toBe(30)        // upper block: held lower value
    expect(attr.getValueAtTime(18)).toBeUndefined()  // on the block
    expect(attr.getValueAtTime(19)).toBeUndefined()  // lower block blocks the interval
    expect(attr.getValueAtTime(20)).toBe(50)
  })

  it('holds values that cannot interpolate, including at pre-time', async () => {
    const attr = (await referencedStage()).getPrim('/Root')!.getAttr('mode')!
    expect(attr.getValueAtTime(11)).toBe('a')
    expect(attr.getValueAtTime(12)).toBe('b')
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(12))).toBe('a')
    expect(attr.getValueAtTime(UsdTimeCode.PreTime(14))).toBe('b')
  })
})

describe('attribute queries', () => {
  it('read value edits made on their source layer after the query was built', async () => {
    const stage = Stage.createNew()
    stage.definePrim('/Anim', 'Xform')
    stage.getRootLayer().setField('/Anim.weight', 'typeName', 'double')
    const attr = stage.getPrim('/Anim')!.attr('weight')
    attr.setTimeSample(0, 0)
    attr.setTimeSample(10, 100)
    await stage.flushChanges()

    const query = new AttributeQuery(stage.getPrim('/Anim')!.getAttr('weight')!)
    expect(query.get(5)).toBe(50)
    attr.setTimeSample(10, 200)
    attr.setTimeSample(20, 300)
    expect(query.get(5)).toBe(100)
    expect(query.getTimeSamples()).toEqual([0, 10, 20])
  })
})

// Upstream reads interpolating samples by value (interpolators.cpp:160-188
// through SdfData::QueryTimeSample, sdf/data.cpp:446-459), so a value
// returned for a held or exact sample is the caller's own copy.
describe('returned sample values', () => {
  const layerText = `#usda 1.0
def "P"
{
    double3 v.timeSamples = { 0: (1, 2, 3), 1: (4, 5, 6) }
    float[] f.timeSamples = { 0: [1, 2] }
    string[] s.timeSamples = { 0: ["a"] }
}
`
  const stageFor = (): Promise<Stage> => Stage.open(Layer.createInMemory('samples.usda', layerText))
  const show = (value: unknown): unknown => {
    const v = value as { toArray?(): unknown[], data?: unknown[] }
    return v?.toArray ? v.toArray() : v?.data ? [...v.data] : value
  }
  // Writes in place to a value a read handed out.
  const mutate = (value: unknown): void => {
    const v = value as { set?(i: number, x: unknown): void, data?: unknown[] }
    if (typeof v.set === 'function') v.set(0, typeof (value as { get(i: number): unknown }).get(0) === 'string' ? 'z' : 99)
    else if (v.data) v.data[0] = 99
  }
  // An edit of a copy: VtArray Clone(), or a Gf copy.
  const mutateCopy = (value: unknown): unknown => {
    const copy = value instanceof VtArray ? value.Clone()
      : new (value as { constructor: new (v: unknown) => unknown }).constructor(value)
    mutate(copy)
    return copy
  }

  // Returned values are read-only and shared, as UsdAttribute::Get's
  // VtValue shares the layer's (sdf data.cpp:204-210): an edit in place
  // throws, and an edited copy leaves the stored sample unchanged.
  for (const [name, time, expected] of [
    ['v', 0, [1, 2, 3]], ['v', 1, [4, 5, 6]], ['v', 7, [4, 5, 6]],
    ['f', 0, [1, 2]], ['s', 0, ['a']],
  ] as const) {
    it(`does not let a caller edit the stored sample (${name} at ${time})`, async () => {
      const stage = await stageFor()
      const attr = stage.getPrim('/P')!.getAttr(name)!
      expect(() => mutate(attr.getValueAtTime(time))).toThrow(TypeError)
      expect(() => mutate(new AttributeQuery(attr).get(time))).toThrow(TypeError)
      expect(show(mutateCopy(attr.getValueAtTime(time)))).not.toEqual(expected)
      expect(show(attr.getValueAtTime(time))).toEqual(expected)
      const stored = stage.getRootLayer().queryTimeSample(`/P.${name}`, Math.min(time, 1))
      expect(() => mutate(stored)).toThrow(TypeError)
      expect(show(stored)).toEqual(expected)
    })
  }
})

// A layer summarizes which kinds of value its samples hold so a read can skip
// the composability pass; editing a sample in place must refresh it.
describe('sample edits after a read', () => {
  const author = (stage: Stage, withEdit: boolean): void => {
    stage.definePrim('/P', '').attr('attr').setTimeSample(0, [1, 2, 3])
    stage.setEditTarget(stage.getSessionLayer())
    const strong = stage.definePrim('/P', '').attr('attr')
    strong.setTimeSample(0, [7, 8, 9])
    strong.setTimeSample(4, [7, 8, 9])
    if (withEdit) strong.setTimeSample(2, new VtArrayEditBuilder<number>().append(5).finalizeAndReset())
  }
  const read = (stage: Stage): unknown[] =>
    [0, 1, 2, 3, 4].map(time => stage.getPrim('/P')!.getAttr('attr')!.getValueAtTime(time))

  it('composes an array edit authored into samples that were already read', async () => {
    const fresh = Stage.createNew()
    author(fresh, true)
    await fresh.flushChanges()

    const edited = Stage.createNew()
    author(edited, false)
    await edited.flushChanges()
    read(edited)
    edited.definePrim('/P', '').attr('attr').setTimeSample(
      2, new VtArrayEditBuilder<number>().append(5).finalizeAndReset())
    await edited.flushChanges()

    expect(read(edited)).toEqual(read(fresh))
  })
})

// The live read brackets the layer's samples in place and converts only the
// values it interpolates; its answers are those of interpolating over every
// sample in stage time.
describe('in-place sample interpolation', () => {
  it('matches interpolation over all samples for each value type', async () => {
    const { usdInterpolateSamples } = await import('../../src/interpolators.ts')
    const resolver = new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def "Root" (
    references = @asset.usda@</Asset> (offset = 10; scale = 2)
)
{
}
`),
      'asset.usda': enc(`#usda 1.0
def "Asset"
{
    double3 v.timeSamples = { 0: (0, 0, 0), 1: (1, 2, 3), 2: (4, 8, 16), 3: None, 4: (1, 1, 1), 6: (2, 2, 2) }
    quatf q.timeSamples = { 0: (1, 0, 0, 0), 1: (0, 1, 0, 0), 2: (0, 0, 0.7071068, 0.7071068), 5: (0.5, 0.5, 0.5, 0.5) }
    float[] a.timeSamples = { 0: [0, 1, 2], 1: [2, 4, 8], 2: [1, 1], 3: [3, 3] }
    half h.timeSamples = { 0: 0.1, 1: 0.7, 2: 1.3 }
    token t.timeSamples = { 0: "a", 1: "b", 2: "c" }
}
`),
    })
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const layer = stage.getUsedLayers().find(l => l.identifier.endsWith('asset.usda'))!
    const prim = stage.getPrim('/Root')!
    const times = [0, 9.5, 10, 10.5, 11, 12, 12.25, 13, 14, 15, 16, 17, 18, 19.999, 20, 21, 22, 30]
    for (const name of ['v', 'q', 'a', 'h', 't']) {
      const attr = prim.getAttr(name)!
      const query = new AttributeQuery(attr)
      const specPath = `/Asset.${name}`
      const all: [number, unknown][] = layer.listTimeSamplesForPath(specPath)
        .map(time => [time * 2 + 10, layer.queryTimeSample(specPath, time)])
      for (const time of times) {
        for (const pre of [false, true]) {
          const code = pre ? UsdTimeCode.PreTime(time) : time
          const raw = usdInterpolateSamples(all, time, 'linear', pre, attr.typeName)
          const expected = raw instanceof Object && raw.constructor.name === 'SdfValueBlock' ? undefined : raw
          expect(attr.getValueAtTime(code), `${name} @ ${time}${pre ? ' pre' : ''}`).toEqual(expected)
          expect(query.get(code), `${name} query @ ${time}${pre ? ' pre' : ''}`).toEqual(expected)
        }
      }
    }
  })
})

// Quaternion arrays are slerped over their storage; each element is the
// slerp of the matching scalar samples.
describe('quaternion array interpolation', () => {
  it('gives each element the scalar slerp', async () => {
    const elements = [
      ['(1, 0, 0, 0)', '(0, 1, 0, 0)'],
      ['(0.7071068, 0, 0.7071068, 0)', '(-0.5, 0.5, -0.5, 0.5)'],
      ['(0.9999999, 0.0001, 0, 0)', '(1, 0, 0, 0)'],
      ['(0.1, 0.2, 0.3, 0.9273618)', '(-0.1, -0.2, -0.3, -0.9273618)'],
    ]
    let text = '#usda 1.0\ndef "P"\n{\n'
    for (const type of ['quatf', 'quath', 'quatd']) {
      text += `    ${type}[] a_${type}.timeSamples = { 0: [${elements.map(e => e[0]).join(', ')}], 2: [${elements.map(e => e[1]).join(', ')}] }\n`
      elements.forEach(([lo, hi], i) => { text += `    ${type} s_${type}_${i}.timeSamples = { 0: ${lo}, 2: ${hi} }\n` })
    }
    text += '}\n'
    const resolver = new ArInMemoryResolver({ 'q.usda': enc(text) })
    const stage = (await Stage.open('q.usda', { resolverContext: _resolverContextForResolver(resolver) }))!
    const prim = stage.getPrim('/P')!
    for (const type of ['quatf', 'quath', 'quatd']) {
      for (const time of [0.25, 0.5, 1, 1.75]) {
        const array = prim.getAttr(`a_${type}`)!.getValueAtTime(time) as { size: number, get(i: number): unknown, getElementType(): unknown }
        const scalars = elements.map((_, i) => prim.getAttr(`s_${type}_${i}`)!.getValueAtTime(time))
        expect(array.size).toBe(elements.length)
        expect(array.getElementType()).toBe(prim.getAttr(`a_${type}`)!.getValueAtTime(0) && (prim.getAttr(`a_${type}`)!.getValueAtTime(0) as typeof array).getElementType())
        for (let i = 0; i < elements.length; i++) expect(array.get(i), `${type}[${i}] @ ${time}`).toEqual(scalars[i])
      }
    }
  })
})
