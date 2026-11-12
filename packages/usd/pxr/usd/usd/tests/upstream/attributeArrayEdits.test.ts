// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdAttributeArrayEdits.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Ported from OpenUSD pxr/usd/usd/testenv/testUsdAttributeArrayEdits.cpp
//
// The upstream suite exercises array-valued attributes and VtArrayEdit delta
// operations that compose over weaker resolved arrays, including default and
// time-sampled edits and interpolation with ordinary dense arrays.

import { describe, expect, it } from 'vitest'
import { Stage, AttributeQuery as UsdAttributeQuery, ResolveInfoSource as UsdResolveInfoSource } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { ArrayEditBuilder as VtArrayEditBuilder } from 'typescript-usd/vt'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

async function stageWithRootArray(): Promise<Stage> {
  return (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
    'root.usda': enc(`#usda 1.0
def "TestBasics" {
    int[] attr = [3, 2, 1]
}
`),
  })) }))!
}

async function stageWithSessionBasics(): Promise<Stage> {
  const stage = await stageWithRootArray()
  stage.setEditTarget(stage.getSessionLayer())
  const attr = stage.definePrim('/TestBasics', '').attr('attr')
  attr.set(new VtArrayEditBuilder<number>().prepend(0).append(9).finalizeAndReset())
  attr.setTimeSample(
    3, new VtArrayEditBuilder<number>().prepend(3).append(3).finalizeAndReset())
  attr.setTimeSample(
    6, new VtArrayEditBuilder<number>().prepend(6).append(7).finalizeAndReset())
  return stage
}

describe('testUsdAttributeArrayEditsCpp / TestBasics', () => {
  it('authors and resolves a plain int-array default value', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasics', '')

    // Before authoring, no value resolves (C++: !attr.Get(&iarray)).
    const a = prim.attr('attr')
    expect(a.get()).toBeUndefined()

    // Author the array default and read it back (C++: Set/Get == {3,2,1}).
    a.set([3, 2, 1])
    expect(a.get()).toEqual([3, 2, 1])
    expect(stage.getPrim('/TestBasics')?.getAttr('attr')?.getValue()).toEqual([3, 2, 1])
  })

  it('a plain array default has zero time samples', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasics', '')
    prim.attr('attr').set([3, 2, 1])

    // C++: GetNumTimeSamples() == 0, !ValueMightBeTimeVarying().
    const attr = stage.getPrim('/TestBasics')!.getAttr('attr')!
    expect(attr.getTimeSampleKeys().length).toBe(0)
  })

  it('composes a VtArrayEdit (Prepend/Append) over the weaker default value', async () => {
    const stage = await stageWithRootArray()
    stage.setEditTarget(stage.getSessionLayer())
    const a = stage.definePrim('/TestBasics', '').attr('attr')
    a.set(new VtArrayEditBuilder<number>().prepend(0).append(9).finalizeAndReset())
    expect(a.get()).toEqual([0, 3, 2, 1, 9])
    expect(new UsdAttributeQuery(stage.get('/TestBasics.attr')).get())
      .toEqual([0, 3, 2, 1, 9])
  })

  it('session-layer array-edit samples hide the session default and compose over the root default', async () => {
    const stage = await stageWithSessionBasics()
    const attr = stage.get('/TestBasics.attr')!
    expect(attr.getValueAtTime(0)).toEqual([3, 3, 2, 1, 3])
    expect(attr.getValueAtTime(3)).toEqual([3, 3, 2, 1, 3])
    expect(attr.getValueAtTime(5)).toEqual([3, 3, 2, 1, 3])
    expect(attr.getValueAtTime(6)).toEqual([6, 3, 2, 1, 7])
    expect(attr.getValueAtTime(7)).toEqual([6, 3, 2, 1, 7])
    expect(attr.getValue()).toEqual([0, 3, 2, 1, 9])
    const query = new UsdAttributeQuery(attr)
    expect(query.get(5)).toEqual([3, 3, 2, 1, 3])
    expect(query.get(7)).toEqual([6, 3, 2, 1, 7])
    expect(query.get()).toEqual([0, 3, 2, 1, 9])
  })

  it('root-layer array-edit samples compose under session-layer samples', async () => {
    const stage = await stageWithSessionBasics()
    stage.setEditTarget(stage.getRootLayer())
    const attr = stage.definePrim('/TestBasics', '').attr('attr')
    attr.setTimeSample(
      1, new VtArrayEditBuilder<number>().prepend(-1).append(-1).finalizeAndReset())
    attr.setTimeSample(
      5, new VtArrayEditBuilder<number>().prepend(-5).append(-5).finalizeAndReset())
    attr.setTimeSample(
      9, new VtArrayEditBuilder<number>().prepend(-9).append(-9).finalizeAndReset())
    const composed = stage.get('/TestBasics.attr')!
    expect(composed.getValueAtTime(0)).toEqual([3, -1, -1, 3])
    expect(composed.getValueAtTime(4)).toEqual([3, -1, -1, 3])
    expect(composed.getValueAtTime(5)).toEqual([3, -5, -5, 3])
    expect(composed.getValueAtTime(6)).toEqual([6, -5, -5, 7])
    expect(composed.getValueAtTime(9)).toEqual([6, -9, -9, 7])
    expect(composed.getValue()).toEqual([0, 3, 2, 1, 9])
    const query = new UsdAttributeQuery(composed)
    expect(query.get(7)).toEqual([6, -5, -5, 7])
    expect(query.get(10)).toEqual([6, -9, -9, 7])
  })

  it('GetResolveInfo at default reports both default sources (HasNextWeakerInfo)', async () => {
    const stage = await stageWithRootArray()
    stage.setEditTarget(stage.getSessionLayer())
    stage.definePrim('/TestBasics', '').attr('attr')
      .set(new VtArrayEditBuilder<number>().prepend(0).append(9).finalizeAndReset())
    const attr = stage.get('/TestBasics.attr') as unknown as {
      getResolveInfo(): {
        getSource(): UsdResolveInfoSource
        hasNextWeakerInfo(): boolean
        getNextWeakerInfo(): {
          getSource(): UsdResolveInfoSource
          hasNextWeakerInfo(): boolean
        } | undefined
      }
    }
    const info = attr.getResolveInfo()
    expect(info.getSource()).toBe(UsdResolveInfoSource.Default)
    expect(info.hasNextWeakerInfo()).toBe(true)
    expect(info.getNextWeakerInfo()?.getSource()).toBe(UsdResolveInfoSource.Default)
    expect(info.getNextWeakerInfo()?.hasNextWeakerInfo()).toBe(false)
  })

  it('GetBracketingTimeSamples returns the surrounding sample times', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestBasics', '')
    const a = prim.attr('attr')
    a.setTimeSample(1.0, [0, 0, 0, 0])
    a.setTimeSample(3.0, [2, 4, 6, 8])
    const attr = stage.get('/TestBasics.attr') as unknown as {
      getBracketingTimeSamples(t: number): [number, number]
    }
    expect(attr.getBracketingTimeSamples(2.0)).toEqual([1.0, 3.0])
  })
})

describe('testUsdAttributeArrayEditsCpp / TestInterpolation', () => {
  it('linearly interpolates between equal-size plain float-array samples', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestInterpolation', '')
    const a = prim.attr('attr')

    // C++ writes size4 (an edit resolving to {0,0,0,0}) at t=1 and cheer
    // {2,4,6,8} at t=3; we author the resolved plain arrays directly.
    a.setTimeSample(1.0, [0, 0, 0, 0])
    a.setTimeSample(3.0, [2, 4, 6, 8])

    const attr = stage.getPrim('/TestInterpolation')!.getAttr('attr')!
    // Held before first / after last sample; linear lerp between (goldens
    // captured from usd-2605).
    expect(attr.getValueAtTime(0.0)).toEqual([0, 0, 0, 0])
    expect(attr.getValueAtTime(1.0)).toEqual([0, 0, 0, 0])
    expect(attr.getValueAtTime(2.0)).toEqual([1, 2, 3, 4])
    expect(attr.getValueAtTime(3.0)).toEqual([2, 4, 6, 8])
    expect(attr.getValueAtTime(4.0)).toEqual([2, 4, 6, 8])
  })

  it('records the authored sample times', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestInterpolation', '')
    const a = prim.attr('attr')
    a.setTimeSample(1.0, [0, 0, 0, 0])
    a.setTimeSample(3.0, [2, 4, 6, 8])

    expect(stage.getPrim('/TestInterpolation')!.getAttr('attr')!.getTimeSampleKeys()).toEqual([1.0, 3.0])
  })

  it('a session-layer Write-index array edit composes over the interpolated samples', async () => {
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def "TestInterpolation" {
    float[] attr.timeSamples = { 3: [2, 4, 6, 8] }
}
`),
    })) }))!
    stage.setEditTarget(stage.getRootLayer())
    const rootAttr = stage.definePrim('/TestInterpolation', '').attr('attr')
    rootAttr.setTimeSample(
      1, new VtArrayEditBuilder<number>().setSize(4).finalizeAndReset())
    stage.setEditTarget(stage.getSessionLayer())
    stage.definePrim('/TestInterpolation', '').attr('attr').setTimeSample(
      2, new VtArrayEditBuilder<number>().write(8, 1).finalizeAndReset())
    const attr = stage.get('/TestInterpolation.attr')!
    expect(attr.getValueAtTime(0)).toEqual([0, 8, 0, 0])
    expect(attr.getValueAtTime(1)).toEqual([0, 8, 0, 0])
    expect(attr.getValueAtTime(2)).toEqual([0, 8, 0, 0])
    expect(attr.getValueAtTime(2.5)).toEqual([1, 8, 3, 4])
    expect(attr.getValueAtTime(3)).toEqual([2, 8, 6, 8])
    expect(attr.getValueAtTime(4)).toEqual([2, 8, 6, 8])
  })
})
