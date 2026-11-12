// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdTimeValueAuthoring.py,
//  pxr/usd/usd/testenv/testUsdTimeValueAuthoring.cpp
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Port of the four registered v26.05 testenv/testUsdTimeValueAuthoring.py
// methods. The matching Python and C++ test executables were run live against
// the reference build before this port.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Stage, AttributeQuery as UsdAttributeQuery, EditTarget as UsdEditTarget, type Attribute } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { Registry as PlugRegistry } from 'typescript-usd/plug'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

const REF_SUB = `#usda 1.0
def "TimeCodeTest" (
    customData = {
        timecode timeCode = 10
        timecode[] timeCodeArray = [10, 20]
        double doubleVal = 10
        dictionary subDict = {
            timecode timeCode = 10
            timecode[] timeCodeArray = [10, 20]
            double doubleVal = 10
        }
    }
    doubleTest = 10
    timeCodeTest = 10
    timeCodeArrayTest = [10, 20]
) {
    timecode TimeCode = 10
    timecode TimeCode.timeSamples = { 0: 10, 1: 20 }
    timecode[] TimeCodeArray = [10, 20]
    timecode[] TimeCodeArray.timeSamples = { 0: [10, 30], 1: [20, 40] }
    double Double = 10
    double Double.timeSamples = { 0: 10, 1: 20 }
}`

const FILES: Record<string, string> = {
  'ref_sub.usda': REF_SUB,
  'ref.usda': `#usda 1.0
(subLayers = [@./ref_sub.usda@ (offset = 3)])`,
  'root_sub.usda': `#usda 1.0
(timeCodesPerSecond = 48)
def "TimeCodeTest" (
    references = @./ref.usda@</TimeCodeTest> (offset = -6; scale = 2)
) {}`,
  'root.usda': `#usda 1.0
(
    subLayers = [@./root_sub.usda@]
    customLayerData = {
        timecode timeCode = 10
        timecode[] timeCodeArray = [10, 20]
        dictionary subDict = {
            timecode timeCode = 10
            timecode[] timeCodeArray = [10, 20]
        }
    }
)`,
}

beforeAll(() => {
  // The native testenv is discovered through PXR_PLUGINPATH_NAME. The browser
  // adaptation passes the same plugInfo document to PlugRegistry explicitly.
  PlugRegistry.GetInstance().RegisterPlugins({
    Plugins: [{
      Type: 'resource',
      Name: 'testUsdTimeValueAuthoring',
      Info: {
        SdfMetadata: {
          doubleTest: { type: 'double' },
          timeCodeTest: { type: 'timecode' },
          timeCodeArrayTest: { type: 'timecode[]' },
        },
      },
    }],
  })
})

beforeEach(() => {
  _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(
    Object.entries(FILES).map(([path, text]) => [path, enc(text)]),
  )))
})

function expectBaseMetadata(prim: ReturnType<Stage['getPrim']>): void {
  expect(prim!.getMetadata('timeCodeTest')).toBe(10)
  expect(prim!.getMetadata('timeCodeArrayTest')).toEqual([10, 20])
  expect(prim!.getMetadata('doubleTest')).toBe(10)
  expect(prim!.getMetadata('customData')).toEqual({
    timeCode: 10,
    timeCodeArray: [10, 20],
    doubleVal: 10,
    subDict: { timeCode: 10, timeCodeArray: [10, 20], doubleVal: 10 },
  })
}

function findLayer(stage: Stage, suffix: string) {
  return stage.getUsedLayers().find(layer => layer.filePath.endsWith(suffix))!
}

function editTargets(stage: Stage): Array<[UsdEditTarget, string, number, number]> {
  const root = stage.getRootLayer()
  const rootSub = findLayer(stage, 'root_sub.usda')
  const ref = findLayer(stage, 'ref.usda')
  const refSub = findLayer(stage, 'ref_sub.usda')
  const refNode = [...stage.getPrimIndex('/TimeCodeTest')!.getNodeRange()]
    .find(node => !node.isRootNode() && node.layerStack.layers.some(entry => entry.layer === ref))!
  return [
    [new UsdEditTarget(refSub, refNode), '/TimeCodeTest', 4.5, 8],
    [new UsdEditTarget(ref, refNode), '/TimeCodeTest', 7.5, 11],
    [stage.getEditTargetForLocalLayer(rootSub), '/TimeCodeTest', 24, 38],
    [new UsdEditTarget(root), '/TimeCodeTest', 12, 19],
  ]
}

describe('testUsdTimeValueAuthoring / testUsdTimeValueAuthoringCpp', () => {
  it('gets time-valued metadata without layer offsets', async () => {
    const stage = (await Stage.open('ref_sub.usda'))!
    const prim = stage.getPrim('/TimeCodeTest')!
    const timeCode = prim.getAttr('TimeCode')!
    const timeCodeArray = prim.getAttr('TimeCodeArray')!
    const double = prim.getAttr('Double')!
    expect(timeCode.getField('timeSamples')).toEqual({ 0: 10, 1: 20 })
    expect(timeCodeArray.getField('timeSamples')).toEqual({ 0: [10, 30], 1: [20, 40] })
    expect(double.getField('timeSamples')).toEqual({ 0: 10, 1: 20 })
    expect(timeCode.getField('default')).toBe(10)
    expect(timeCodeArray.getField('default')).toEqual([10, 20])
    expect(double.getField('default')).toBe(10)
    expectBaseMetadata(prim)
  })

  it('gets time-valued metadata through composed layer offsets', async () => {
    const stage = (await Stage.open('root.usda'))!
    const prim = stage.getPrim('/TimeCodeTest')!
    const timeCode = prim.getAttr('TimeCode')!
    const timeCodeArray = prim.getAttr('TimeCodeArray')!
    const double = prim.getAttr('Double')!
    expect(timeCode.getField('timeSamples')).toEqual({ 3: 23, 5: 43 })
    expect(timeCodeArray.getField('timeSamples')).toEqual({ 3: [23, 63], 5: [43, 83] })
    expect(double.getField('timeSamples')).toEqual({ 3: 10, 5: 20 })
    expect(timeCode.getField('default')).toBe(23)
    expect(timeCodeArray.getField('default')).toEqual([23, 43])
    expect(double.getField('default')).toBe(10)
    expect(prim.getMetadata('timeCodeTest')).toBe(23)
    expect(prim.getMetadata('timeCodeArrayTest')).toEqual([23, 43])
    expect(prim.getMetadata('doubleTest')).toBe(10)
    expect(prim.getMetadata('customData')).toEqual({
      timeCode: 23,
      timeCodeArray: [23, 43],
      doubleVal: 10,
      subDict: { timeCode: 23, timeCodeArray: [23, 43], doubleVal: 10 },
    })
    expect(stage.getMetadata('customLayerData')).toEqual({
      timeCode: 10,
      timeCodeArray: [10, 20],
      subDict: { timeCode: 10, timeCodeArray: [10, 20] },
    })
  })

  it('authors time-valued metadata through each edit target inverse', async () => {
    const stage = (await Stage.open('root.usda'))!
    const prim = stage.definePrim('/TimeCodeTest')
    const expected = [11, 14, 50, 25]
    for (const [[target, specPath], authored] of editTargets(stage).map(
      (entry, index) => [entry, expected[index]!] as const)) {
      stage.setEditTarget(target)
      prim.setMetadata('timeCodeTest', 25)
      expect(target.getLayer()!.getField(specPath, 'timeCodeTest')).toBe(authored)
      await stage.flushChanges()
      expect(stage.getPrim('/TimeCodeTest')!.getMetadata('timeCodeTest')).toBe(25)
    }
    // The Python test also exercises generic attribute SetMetadata.
    const attr = stage.get('/TimeCodeTest.TimeCode')! as Attribute & {
      setMetadata(field: string, value: unknown): boolean
    }
    attr.setMetadata('default', 19)
  })

  it('authors attribute values through each edit target inverse', async () => {
    const stage = (await Stage.open('root.usda'))!
    const prim = stage.definePrim('/TimeCodeTest')
    const timeCode = prim.attr('TimeCode')
    const timeCodeArray = prim.attr('TimeCodeArray')
    const double = prim.attr('Double')
    for (const [target, specPath, localTime, localTimeValue] of editTargets(stage)) {
      stage.setEditTarget(target)
      timeCode.setTimeSample(12, 19)
      timeCodeArray.setTimeSample(12, [19, 12])
      double.setTimeSample(12, 19)
      const layer = target.getLayer()!
      expect(layer.getField(`${specPath}.TimeCode`, 'timeSamples'))
        .toContainEqual([localTime, localTimeValue])
      expect(layer.getField(`${specPath}.TimeCodeArray`, 'timeSamples'))
        .toContainEqual([localTime, [localTimeValue, localTime]])
      expect(layer.getField(`${specPath}.Double`, 'timeSamples'))
        .toContainEqual([localTime, 19])
      timeCode.set(19)
      timeCodeArray.set([19, 12])
      double.set(19)
      expect(layer.getField(`${specPath}.TimeCode`, 'default')).toBe(localTimeValue)
      expect(layer.getField(`${specPath}.TimeCodeArray`, 'default'))
        .toEqual([localTimeValue, localTime])
      expect(layer.getField(`${specPath}.Double`, 'default')).toBe(19)
      await stage.flushChanges()
      const composedTimeCode = stage.get('/TimeCodeTest.TimeCode')!
      expect(composedTimeCode.getValue()).toBe(19)
      expect(composedTimeCode.getValueAtTime(12)).toBe(19)
      expect(new UsdAttributeQuery(composedTimeCode).get(12)).toBe(19)
    }
  })
})
