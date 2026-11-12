// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdTimeValueAuthoring.cpp,
//  pxr/usd/usd/testenv/testUsdTimeValueAuthoring.py
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdTimeValueAuthoring.cpp
// (registered as testUsdTimeValueAuthoringCpp with testenv
// testUsdTimeValueAuthoring). The testenv files are
// fixtures/testUsdTimeValueAuthoring/{plugInfo.json,timeCodes/*.usda},
// copied byte-for-byte from pxr/usd/usd/testenv/testUsdTimeValueAuthoring/
// (Pixar, OpenUSD license). timeValueAuthoring.test.ts holds the older
// testUsdTimeValueAuthoring.py checks.
//
// API mapping:
//   - PlugRegistry::RegisterPlugins(testDir) is RegisterPlugins on the
//     parsed plugInfo.json (no directory scan here).
//   - Values are compared through norm(): GfTimeCode is a number here,
//     GfDuration a GfDuration ({ duration: n } after norm), Vt*Array a
//     VtArray (an array after norm), SdfTimeSampleMap the sorted
//     [time, value] pairs whether read as composed metadata (an object keyed
//     by time) or from the layer (pairs); SetMetadata('timeSamples') is
//     given the [time, value] pairs.
//   - SetMetadataByDictKey of a GfTimeCode passes valueType 'timecode', the
//     type a VtValue(GfTimeCode) carries; GfDuration values carry their type.
//   - _VerifyAuthoredValue's GetSpecForScenePath + spec->HasField is the
//     edit target's layer field at MapToSpecPath(objPath).
//   - Composed reads follow stage.flushChanges() after each edit.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { Duration as GfDuration } from 'typescript-usd/gf'
import { Layer } from 'typescript-usd/sdf'
import { RangeType } from 'typescript-usd/pcp'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { AttributeQuery, EditTarget, Stage, type Attribute, type Prim } from 'typescript-usd/usd'

const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/testUsdTimeValueAuthoring/${name}`, import.meta.url))

beforeAll(() => {
  // testUsdTimeValueAuthoring.cpp:1022-1023
  expect(PlugRegistry.GetInstance().RegisterPlugins(
    JSON.parse(readFileSync(fixture('plugInfo.json'), 'utf8')))).not.toHaveLength(0)
})

// Value constructors for the expectations.
const tc = (v: number) => v
const dur = (v: number) => new GfDuration(v)
const tcArr = (v: number[]) => v
const durArr = (v: number[]) => v.map(dur)
const tsm = (pairs: Array<[number, unknown]>) => ({ samples: pairs })

function norm(value: unknown): unknown {
  if (value instanceof GfDuration) return { duration: value.GetValue() }
  if (value && typeof value === 'object' && 'samples' in value && Array.isArray((value as { samples: unknown }).samples)) {
    return (value as { samples: Array<[number, unknown]> }).samples.map(([t, v]) => [t, norm(v)])
  }
  if (value && typeof value === 'object' && Symbol.iterator in value) return [...(value as Iterable<unknown>)].map(norm)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => [k, norm(v)]))
  }
  return value
}

// A timeSamples field read either as composed metadata or from a layer.
function normSamples(value: unknown): unknown {
  const pairs: Array<[number, unknown]> = Array.isArray(value)
    ? (value as Array<[number, unknown]>)
    : Object.entries(value as Record<string, unknown>).map(([t, v]) => [Number(t), v])
  return pairs.slice().sort((a, b) => a[0] - b[0]).map(([t, v]) => [t, norm(v)])
}

const normField = (field: string, value: unknown) =>
  field === 'timeSamples' ? normSamples(value) : norm(value)
const normExpected = (field: string, value: unknown) =>
  field === 'timeSamples' ? norm(value) : norm(value)

type UsdObject = Prim | Attribute

// testUsdTimeValueAuthoring.cpp:42-49
function getAndVerifyMetadata(obj: UsdObject, field: string, expected: unknown): void {
  const value = obj.getMetadata(field)
  expect(value).not.toBeUndefined()
  expect(normField(field, value)).toEqual(normExpected(field, expected))
}

// testUsdTimeValueAuthoring.cpp:51-58
function getAndVerifyStageMetadata(stage: Stage, field: string, expected: unknown): void {
  const value = stage.getMetadata(field)
  expect(value).not.toBeUndefined()
  expect(norm(value)).toEqual(norm(expected))
}

// testUsdTimeValueAuthoring.cpp:60-67
function getAndVerifyMetadataByDictKey(obj: Prim, field: string, key: string, expected: unknown): void {
  const value = obj.getMetadataByDictKey(field, key)
  expect(value).not.toBeUndefined()
  expect(norm(value)).toEqual(norm(expected))
}

// testUsdTimeValueAuthoring.cpp:69-106 _GetEditTargets
function getEditTargets(prim: Prim): EditTarget[] {
  const primIndex = prim.getPrimIndex()
  const rootNode = primIndex.getRootNode()
  const refNode = [...primIndex.getNodeRange(RangeType.Reference)][0]!

  const rootLayer = Layer.find(fixture('timeCodes/root.usda'))
  const rootSubLayer = Layer.find(fixture('timeCodes/root_sub.usda'))
  const refLayer = Layer.find(fixture('timeCodes/ref.usda'))
  const refSubLayer = Layer.find(fixture('timeCodes/ref_sub.usda'))
  expect(rootLayer).toBeTruthy()
  expect(rootSubLayer).toBeTruthy()
  expect(refLayer).toBeTruthy()
  expect(refSubLayer).toBeTruthy()

  const editTargets = [
    // Composed layer offset: scale = 2, offset = +3.0
    new EditTarget(refSubLayer!, refNode),
    // Composed layer offset: scale = 2, offset = -3.0
    new EditTarget(refLayer!, refNode),
    // Composed layer offset: scale = 0.5
    new EditTarget(rootSubLayer!, rootNode),
    // No mapping
    new EditTarget(rootLayer!),
  ]
  expect(editTargets[0]!.getLayer()).toBe(refSubLayer)
  expect(editTargets[1]!.getLayer()).toBe(refLayer)
  expect(editTargets[2]!.getLayer()).toBe(rootSubLayer)
  expect(editTargets[3]!.getLayer()).toBe(rootLayer)
  return editTargets
}

// testUsdTimeValueAuthoring.cpp:113-125 _VerifyAuthoredValue
function verifyAuthoredValue(editTarget: EditTarget, objPath: string, fieldName: string, expectedValue: unknown): void {
  const specPath = editTarget.mapToSpecPath(objPath)
  const layer = editTarget.getLayer()!
  const authoredValue = layer.getField(specPath, fieldName)
  expect(authoredValue).not.toBeUndefined()
  expect(normField(fieldName, authoredValue)).toEqual(normExpected(fieldName, expectedValue))
}

const objPath = (obj: UsdObject) => 'getPath' in obj ? obj.getPath() : obj.path

// testUsdTimeValueAuthoring.cpp:128-146 _SetMetadataWithEditTarget
async function setMetadataWithEditTarget(
  stage: Stage, editTarget: EditTarget, obj: UsdObject, fieldName: string,
  resolvedValue: unknown, expectedAuthoredValue: unknown,
) {
  stage.setEditTarget(editTarget)
  obj.setMetadata(fieldName, fieldName === 'timeSamples'
    ? (resolvedValue as { samples: Array<[number, unknown]> }).samples : resolvedValue)
  await stage.flushChanges()
  getAndVerifyMetadata(obj, fieldName, resolvedValue)
  verifyAuthoredValue(editTarget, objPath(obj), fieldName, expectedAuthoredValue)
}

// testUsdTimeValueAuthoring.cpp:148-173 _SetMetadataByKeyWithEditTarget
async function setMetadataByKeyWithEditTarget(
  stage: Stage, editTarget: EditTarget, obj: Prim, fieldName: string, key: string,
  resolvedValue: unknown, expectedAuthoredValue: unknown, valueType?: string,
) {
  stage.setEditTarget(editTarget)
  obj.setMetadataByDictKey(fieldName, key, resolvedValue, valueType)
  await stage.flushChanges()
  getAndVerifyMetadataByDictKey(obj, fieldName, key, resolvedValue)
  verifyAuthoredValue(editTarget, obj.path, fieldName, expectedAuthoredValue)
}

// testUsdTimeValueAuthoring.cpp:175-191 _GetAndVerifyAttributeValue
function getAndVerifyAttributeValue(attr: Attribute, time: 'default' | number, expected: unknown): void {
  const value = time === 'default' ? attr.getValue() : attr.getValueAtTime(time)
  expect(value).not.toBeUndefined()
  expect(norm(value)).toEqual(norm(expected))
  const attrQuery = new AttributeQuery(attr)
  const queryValue = attrQuery.get(time)
  expect(queryValue).not.toBeUndefined()
  expect(norm(queryValue)).toEqual(norm(expected))
}

// testUsdTimeValueAuthoring.cpp:193-217 _SetTimeSampleWithEditTarget
async function setTimeSampleWithEditTarget(
  stage: Stage, editTarget: EditTarget, attr: Attribute, time: number,
  resolvedValue: unknown, expectedAuthoredValue: unknown,
) {
  stage.setEditTarget(editTarget)
  attr.setTimeSample(time, resolvedValue)
  await stage.flushChanges()
  getAndVerifyAttributeValue(attr, time, resolvedValue)
  verifyAuthoredValue(editTarget, attr.getPath(), 'timeSamples', expectedAuthoredValue)
}

// testUsdTimeValueAuthoring.cpp:219-242 _SetDefaultWithEditTarget
async function setDefaultWithEditTarget(
  stage: Stage, editTarget: EditTarget, attr: Attribute,
  resolvedValue: unknown, expectedAuthoredValue: unknown,
) {
  stage.setEditTarget(editTarget)
  attr.set(resolvedValue)
  await stage.flushChanges()
  getAndVerifyAttributeValue(attr, 'default', resolvedValue)
  verifyAuthoredValue(editTarget, attr.getPath(), 'default', expectedAuthoredValue)
}

// testUsdTimeValueAuthoring.cpp:244-328 _Set*WithEachEditTarget: weakest
// layer to strongest.
async function setMetadataWithEachEditTarget(
  stage: Stage, editTargets: EditTarget[], obj: UsdObject, fieldName: string,
  resolvedValue: unknown, expectedAuthoredValues: unknown[],
) {
  expect(expectedAuthoredValues).toHaveLength(editTargets.length)
  for (let i = 0; i < editTargets.length; ++i) {
    await setMetadataWithEditTarget(stage, editTargets[i]!, obj, fieldName, resolvedValue, expectedAuthoredValues[i])
  }
}
async function setMetadataByKeyWithEachEditTarget(
  stage: Stage, editTargets: EditTarget[], obj: Prim, fieldName: string, key: string,
  resolvedValue: unknown, expectedAuthoredValues: unknown[], valueType?: string,
) {
  expect(expectedAuthoredValues).toHaveLength(editTargets.length)
  for (let i = 0; i < editTargets.length; ++i) {
    await setMetadataByKeyWithEditTarget(
      stage, editTargets[i]!, obj, fieldName, key, resolvedValue, expectedAuthoredValues[i], valueType)
  }
}
async function setTimeSampleWithEachEditTarget(
  stage: Stage, editTargets: EditTarget[], attr: Attribute, time: number,
  resolvedValue: unknown, expectedAuthoredValues: unknown[],
) {
  expect(expectedAuthoredValues).toHaveLength(editTargets.length)
  for (let i = 0; i < editTargets.length; ++i) {
    await setTimeSampleWithEditTarget(stage, editTargets[i]!, attr, time, resolvedValue, expectedAuthoredValues[i])
  }
}
async function setDefaultWithEachEditTarget(
  stage: Stage, editTargets: EditTarget[], attr: Attribute,
  resolvedValue: unknown, expectedAuthoredValues: unknown[],
) {
  expect(expectedAuthoredValues).toHaveLength(editTargets.length)
  for (let i = 0; i < editTargets.length; ++i) {
    await setDefaultWithEditTarget(stage, editTargets[i]!, attr, resolvedValue, expectedAuthoredValues[i])
  }
}

async function openStage(name: string) {
  // Upstream releases each test function's stage and its layers on return,
  // so the next test reads the files fresh; layers stay registered here, so
  // any already loaded are reloaded from disk.
  for (const file of ['root', 'root_sub', 'ref', 'ref_sub']) {
    await Layer.find(fixture(`timeCodes/${file}.usda`))?.reload(true)
  }
  const s = (await Stage.open(fixture(name)))!
  expect(s).toBeTruthy()
  const prim = s.getPrim('/TimeCodeTest')!
  return {
    s, prim,
    timeAttr: prim.getAttr('TimeCode')!,
    arrayAttr: prim.getAttr('TimeCodeArray')!,
    durationAttr: prim.getAttr('Duration')!,
    durationArrayAttr: prim.getAttr('DurationArray')!,
    doubleAttr: prim.getAttr('Double')!,
  }
}

describe('testUsdTimeValueAuthoringCpp', () => {
  // testUsdTimeValueAuthoring.cpp:329-427
  it('_TestGetMetadataNoOffsets', async () => {
    const { prim, timeAttr, arrayAttr, durationAttr, durationArrayAttr, doubleAttr } =
      await openStage('timeCodes/ref_sub.usda')

    getAndVerifyMetadata(timeAttr, 'timeSamples', tsm([[0.0, tc(10.0)], [1.0, tc(20.0)]]))
    getAndVerifyMetadata(arrayAttr, 'timeSamples', tsm([[0.0, tcArr([10.0, 30.0])], [1.0, tcArr([20.0, 40.0])]]))
    getAndVerifyMetadata(durationAttr, 'timeSamples', tsm([[0.0, dur(10.0)], [1.0, dur(20.0)]]))
    getAndVerifyMetadata(durationArrayAttr, 'timeSamples', tsm([[0.0, durArr([10.0, 30.0])], [1.0, durArr([20.0, 40.0])]]))
    getAndVerifyMetadata(doubleAttr, 'timeSamples', tsm([[0.0, 10.0], [1.0, 20.0]]))

    getAndVerifyMetadata(timeAttr, 'default', tc(10.0))
    getAndVerifyMetadata(arrayAttr, 'default', tcArr([10.0, 20.0]))
    getAndVerifyMetadata(durationAttr, 'default', dur(10.0))
    getAndVerifyMetadata(durationArrayAttr, 'default', durArr([10.0, 20.0]))
    getAndVerifyMetadata(doubleAttr, 'default', 10.0)

    getAndVerifyMetadata(prim, 'timeCodeTest', tc(10.0))
    getAndVerifyMetadata(prim, 'timeCodeArrayTest', tcArr([10.0, 20.0]))
    getAndVerifyMetadata(prim, 'durationTest', dur(10.0))
    getAndVerifyMetadata(prim, 'durationArrayTest', durArr([10.0, 20.0]))
    getAndVerifyMetadata(prim, 'doubleTest', 10.0)

    const leaf = {
      timeCode: tc(10.0), timeCodeArray: tcArr([10.0, 20.0]), durationVal: dur(10.0),
      durationArray: durArr([10.0, 20.0]), doubleVal: 10.0,
    }
    getAndVerifyMetadata(prim, 'customData', { ...leaf, subDict: { ...leaf } })

    getAndVerifyMetadataByDictKey(prim, 'customData', 'timeCode', tc(10.0))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'timeCodeArray', tcArr([10.0, 20.0]))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'durationVal', dur(10.0))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'durationArray', durArr([10.0, 20.0]))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'doubleVal', 10.0)

    getAndVerifyMetadataByDictKey(prim, 'customData', 'subDict:timeCode', tc(10.0))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'subDict:timeCodeArray', tcArr([10.0, 20.0]))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'subDict:durationVal', dur(10.0))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'subDict:durationArray', durArr([10.0, 20.0]))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'subDict:doubleVal', 10.0)
  })

  // testUsdTimeValueAuthoring.cpp:429-556
  it('_TestGetMetaDataWithLayerOffsets', async () => {
    const { s, prim, timeAttr, arrayAttr, durationAttr, durationArrayAttr, doubleAttr } =
      await openStage('timeCodes/root.usda')

    getAndVerifyMetadata(timeAttr, 'timeSamples', tsm([[3.0, tc(23.0)], [5.0, tc(43.0)]]))
    getAndVerifyMetadata(arrayAttr, 'timeSamples', tsm([[3.0, tcArr([23.0, 63.0])], [5.0, tcArr([43.0, 83.0])]]))
    getAndVerifyMetadata(durationAttr, 'timeSamples', tsm([[3.0, dur(20.0)], [5.0, dur(40.0)]]))
    getAndVerifyMetadata(durationArrayAttr, 'timeSamples', tsm([[3.0, durArr([20.0, 60.0])], [5.0, durArr([40.0, 80.0])]]))
    getAndVerifyMetadata(doubleAttr, 'timeSamples', tsm([[3.0, 10.0], [5.0, 20.0]]))

    getAndVerifyMetadata(timeAttr, 'default', tc(23.0))
    getAndVerifyMetadata(arrayAttr, 'default', tcArr([23.0, 43.0]))
    getAndVerifyMetadata(durationAttr, 'default', dur(20.0))
    getAndVerifyMetadata(durationArrayAttr, 'default', durArr([20.0, 40.0]))
    getAndVerifyMetadata(doubleAttr, 'default', 10.0)

    getAndVerifyMetadata(prim, 'timeCodeTest', tc(23.0))
    getAndVerifyMetadata(prim, 'timeCodeArrayTest', tcArr([23.0, 43.0]))
    getAndVerifyMetadata(prim, 'durationTest', dur(20.0))
    getAndVerifyMetadata(prim, 'durationArrayTest', durArr([20.0, 40.0]))
    getAndVerifyMetadata(prim, 'doubleTest', 10.0)

    const leaf = {
      timeCode: tc(23.0), timeCodeArray: tcArr([23.0, 43.0]), durationVal: dur(20.0),
      durationArray: durArr([20.0, 40.0]), doubleVal: 10.0,
    }
    getAndVerifyMetadata(prim, 'customData', { ...leaf, subDict: { ...leaf } })

    getAndVerifyMetadataByDictKey(prim, 'customData', 'timeCode', tc(23.0))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'timeCodeArray', tcArr([23.0, 43.0]))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'durationVal', dur(20.0))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'durationArray', durArr([20.0, 40.0]))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'doubleVal', 10.0)

    getAndVerifyMetadataByDictKey(prim, 'customData', 'subDict:timeCode', tc(23.0))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'subDict:timeCodeArray', tcArr([23.0, 43.0]))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'subDict:durationVal', dur(20.0))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'subDict:durationArray', durArr([20.0, 40.0]))
    getAndVerifyMetadataByDictKey(prim, 'customData', 'subDict:doubleVal', 10.0)

    const layerLeaf = {
      timeCode: tc(10.0), timeCodeArray: tcArr([10.0, 20.0]), durationVal: dur(10.0),
      durationArray: durArr([10.0, 20.0]),
    }
    getAndVerifyStageMetadata(s, 'customLayerData', { ...layerLeaf, subDict: { ...layerLeaf } })
  })

  // testUsdTimeValueAuthoring.cpp:558-860
  it('_TestSetMetaDataWithEditTarget', async () => {
    const { s: stage, prim, timeAttr, arrayAttr, durationAttr, durationArrayAttr, doubleAttr } =
      await openStage('timeCodes/root.usda')
    const editTargets = getEditTargets(prim)

    await setMetadataWithEachEditTarget(stage, editTargets, prim, 'timeCodeTest', tc(25.0),
      [tc(11.0), tc(14.0), tc(50.0), tc(25.0)])
    await setMetadataWithEachEditTarget(stage, editTargets, prim, 'timeCodeArrayTest', tcArr([25.0, 45.0]),
      [tcArr([11.0, 21.0]), tcArr([14.0, 24.0]), tcArr([50.0, 90.0]), tcArr([25.0, 45.0])])

    await setMetadataWithEachEditTarget(stage, editTargets, prim, 'durationTest', dur(25.0),
      [dur(12.5), dur(12.5), dur(50.0), dur(25.0)])
    await setMetadataWithEachEditTarget(stage, editTargets, prim, 'durationArrayTest', durArr([25.0, 45.0]),
      [durArr([12.5, 22.5]), durArr([12.5, 22.5]), durArr([50.0, 90.0]), durArr([25.0, 45.0])])

    await setMetadataWithEachEditTarget(stage, editTargets, prim, 'doubleTest', 25.0,
      [25.0, 25.0, 25.0, 25.0])

    // The weakest layer has the original authored value dictionary.
    const leaf = () => ({
      timeCode: tc(10.0) as unknown, timeCodeArray: tcArr([10.0, 20.0]), durationVal: dur(10.0) as unknown,
      durationArray: durArr([10.0, 20.0]), doubleVal: 10.0,
    })
    const authoredCustomData: Record<string, unknown> & { subDict: Record<string, unknown> } =
      { ...leaf(), subDict: leaf() }

    authoredCustomData.timeCode = tc(1.5)
    await setMetadataByKeyWithEachEditTarget(stage, editTargets, prim, 'customData', 'timeCode', tc(6.0), [
      structuredCloneish(authoredCustomData),
      { timeCode: tc(4.5) },
      { timeCode: tc(12.0) },
      { timeCode: tc(6.0) },
    ], 'timecode')

    authoredCustomData.subDict.timeCode = tc(4)
    await setMetadataByKeyWithEachEditTarget(stage, editTargets, prim, 'customData', 'subDict:timeCode', tc(11.0), [
      structuredCloneish(authoredCustomData),
      { timeCode: tc(4.5), subDict: { timeCode: tc(7) } },
      { timeCode: tc(12.0), subDict: { timeCode: tc(22) } },
      { timeCode: tc(6.0), subDict: { timeCode: tc(11) } },
    ], 'timecode')

    authoredCustomData.subDict.doubleVal = 11.0
    await setMetadataByKeyWithEachEditTarget(stage, editTargets, prim, 'customData', 'subDict:doubleVal', 11.0, [
      structuredCloneish(authoredCustomData),
      { timeCode: tc(4.5), subDict: { timeCode: tc(7), doubleVal: 11.0 } },
      { timeCode: tc(12.0), subDict: { timeCode: tc(22), doubleVal: 11.0 } },
      { timeCode: tc(6.0), subDict: { timeCode: tc(11), doubleVal: 11.0 } },
    ])

    authoredCustomData.durationVal = dur(3.0)
    await setMetadataByKeyWithEachEditTarget(stage, editTargets, prim, 'customData', 'durationVal', dur(6.0), [
      structuredCloneish(authoredCustomData),
      { timeCode: tc(4.5), durationVal: dur(3.0), subDict: { timeCode: tc(7), doubleVal: 11.0 } },
      { timeCode: tc(12.0), durationVal: dur(12.0), subDict: { timeCode: tc(22), doubleVal: 11.0 } },
      { timeCode: tc(6.0), durationVal: dur(6.0), subDict: { timeCode: tc(11), doubleVal: 11.0 } },
    ])

    authoredCustomData.subDict.durationVal = dur(5.5)
    await setMetadataByKeyWithEachEditTarget(stage, editTargets, prim, 'customData', 'subDict:durationVal', dur(11.0), [
      structuredCloneish(authoredCustomData),
      { timeCode: tc(4.5), durationVal: dur(3.0), subDict: { timeCode: tc(7), doubleVal: 11.0, durationVal: dur(5.5) } },
      { timeCode: tc(12.0), durationVal: dur(12.0), subDict: { timeCode: tc(22), doubleVal: 11.0, durationVal: dur(22) } },
      { timeCode: tc(6.0), durationVal: dur(6.0), subDict: { timeCode: tc(11), doubleVal: 11.0, durationVal: dur(11) } },
    ])

    // timeSamples must be set and tested before default (stronger defaults
    // supercede weaker time samples).
    await setMetadataWithEachEditTarget(stage, editTargets, timeAttr, 'timeSamples',
      tsm([[11.0, tc(30.0)], [21.0, tc(40.0)]]), [
        tsm([[4.0, tc(13.5)], [9.0, tc(18.5)]]),
        tsm([[7.0, tc(16.5)], [12.0, tc(21.5)]]),
        tsm([[22.0, tc(60.0)], [42.0, tc(80.0)]]),
        tsm([[11.0, tc(30.0)], [21.0, tc(40.0)]]),
      ])
    await setMetadataWithEachEditTarget(stage, editTargets, arrayAttr, 'timeSamples',
      tsm([[11.0, tcArr([30.0, 50.0])], [21.0, tcArr([40.0, 60.0])]]), [
        tsm([[4.0, tcArr([13.5, 23.5])], [9.0, tcArr([18.5, 28.5])]]),
        tsm([[7.0, tcArr([16.5, 26.5])], [12.0, tcArr([21.5, 31.5])]]),
        tsm([[22.0, tcArr([60.0, 100.0])], [42.0, tcArr([80.0, 120.0])]]),
        tsm([[11.0, tcArr([30.0, 50.0])], [21.0, tcArr([40.0, 60.0])]]),
      ])

    await setMetadataWithEachEditTarget(stage, editTargets, durationAttr, 'timeSamples',
      tsm([[11.0, dur(30.0)], [21.0, dur(40.0)]]), [
        tsm([[4.0, dur(15.0)], [9.0, dur(20.0)]]),
        tsm([[7.0, dur(15.0)], [12.0, dur(20.0)]]),
        tsm([[22.0, dur(60.0)], [42.0, dur(80.0)]]),
        tsm([[11.0, dur(30.0)], [21.0, dur(40.0)]]),
      ])
    await setMetadataWithEachEditTarget(stage, editTargets, durationArrayAttr, 'timeSamples',
      tsm([[11.0, durArr([30.0, 50.0])], [21.0, durArr([40.0, 60.0])]]), [
        tsm([[4.0, durArr([15.0, 25.0])], [9.0, durArr([20.0, 30.0])]]),
        tsm([[7.0, durArr([15.0, 25.0])], [12.0, durArr([20.0, 30.0])]]),
        tsm([[22.0, durArr([60.0, 100.0])], [42.0, durArr([80.0, 120.0])]]),
        tsm([[11.0, durArr([30.0, 50.0])], [21.0, durArr([40.0, 60.0])]]),
      ])

    await setMetadataWithEachEditTarget(stage, editTargets, doubleAttr, 'timeSamples',
      tsm([[11.0, 30.0], [21.0, 40.0]]), [
        tsm([[4.0, 30.0], [9.0, 40.0]]),
        tsm([[7.0, 30.0], [12.0, 40.0]]),
        tsm([[22.0, 30.0], [42.0, 40.0]]),
        tsm([[11.0, 30.0], [21.0, 40.0]]),
      ])

    await setMetadataWithEachEditTarget(stage, editTargets, timeAttr, 'default', tc(19.0),
      [tc(8.0), tc(11.0), tc(38.0), tc(19.0)])
    await setMetadataWithEachEditTarget(stage, editTargets, arrayAttr, 'default', tcArr([19.0, -11.0]),
      [tcArr([8.0, -7.0]), tcArr([11.0, -4.0]), tcArr([38.0, -22.0]), tcArr([19.0, -11.0])])

    await setMetadataWithEachEditTarget(stage, editTargets, durationAttr, 'default', dur(19.0),
      [dur(9.5), dur(9.5), dur(38.0), dur(19.0)])
    await setMetadataWithEachEditTarget(stage, editTargets, durationArrayAttr, 'default', durArr([19.0, -11.0]),
      [durArr([9.5, -5.5]), durArr([9.5, -5.5]), durArr([38.0, -22.0]), durArr([19.0, -11.0])])

    await setMetadataWithEachEditTarget(stage, editTargets, doubleAttr, 'default', 19.0,
      [19.0, 19.0, 19.0, 19.0])
  })

  // testUsdTimeValueAuthoring.cpp:862-1019
  it('_TestSetAttrValueWithEditTarget', async () => {
    const { s: stage, prim, timeAttr, arrayAttr, durationAttr, durationArrayAttr, doubleAttr } =
      await openStage('timeCodes/root.usda')
    const editTargets = getEditTargets(prim)

    await setTimeSampleWithEachEditTarget(stage, editTargets, timeAttr, 12.0, tc(19.0), [
      tsm([[0.0, tc(10.0)], [1.0, tc(20.0)], [4.5, tc(8.0)]]),
      tsm([[7.5, tc(11.0)]]),
      tsm([[24.0, tc(38.0)]]),
      tsm([[12.0, tc(19.0)]]),
    ])
    await setDefaultWithEachEditTarget(stage, editTargets, timeAttr, tc(19.0),
      [tc(8.0), tc(11.0), tc(38.0), tc(19.0)])

    await setTimeSampleWithEachEditTarget(stage, editTargets, arrayAttr, 12.0, tcArr([19.0, 12.0]), [
      tsm([[0.0, tcArr([10.0, 30.0])], [1.0, tcArr([20.0, 40.0])], [4.5, tcArr([8.0, 4.5])]]),
      tsm([[7.5, tcArr([11.0, 7.5])]]),
      tsm([[24.0, tcArr([38.0, 24.0])]]),
      tsm([[12.0, tcArr([19.0, 12.0])]]),
    ])
    await setDefaultWithEachEditTarget(stage, editTargets, arrayAttr, tcArr([19.0, 12.0]),
      [tcArr([8.0, 4.5]), tcArr([11.0, 7.5]), tcArr([38.0, 24.0]), tcArr([19.0, 12.0])])

    await setTimeSampleWithEachEditTarget(stage, editTargets, durationAttr, 12.0, dur(19.0), [
      tsm([[0.0, dur(10.0)], [1.0, dur(20.0)], [4.5, dur(9.5)]]),
      tsm([[7.5, dur(9.5)]]),
      tsm([[24.0, dur(38.0)]]),
      tsm([[12.0, dur(19.0)]]),
    ])
    await setDefaultWithEachEditTarget(stage, editTargets, durationAttr, dur(19.0),
      [dur(9.5), dur(9.5), dur(38.0), dur(19.0)])

    await setTimeSampleWithEachEditTarget(stage, editTargets, durationArrayAttr, 12.0, durArr([19.0, 12.0]), [
      tsm([[0.0, durArr([10.0, 30.0])], [1.0, durArr([20.0, 40.0])], [4.5, durArr([9.5, 6.0])]]),
      tsm([[7.5, durArr([9.5, 6.0])]]),
      tsm([[24.0, durArr([38.0, 24.0])]]),
      tsm([[12.0, durArr([19.0, 12.0])]]),
    ])
    await setDefaultWithEachEditTarget(stage, editTargets, durationArrayAttr, durArr([19.0, 12.0]),
      [durArr([9.5, 6.0]), durArr([9.5, 6.0]), durArr([38.0, 24.0]), durArr([19.0, 12.0])])

    await setTimeSampleWithEachEditTarget(stage, editTargets, doubleAttr, 12.0, 19.0, [
      tsm([[0.0, 10.0], [1.0, 20.0], [4.5, 19.0]]),
      tsm([[7.5, 19.0]]),
      tsm([[24.0, 19.0]]),
      tsm([[12.0, 19.0]]),
    ])
    await setDefaultWithEachEditTarget(stage, editTargets, doubleAttr, 19.0, [19.0, 19.0, 19.0, 19.0])
  })
})

// A copy of the expectation dictionary as it stands at this step
// (VtDictionary is a value type upstream).
function structuredCloneish<T>(value: T): T {
  if (value instanceof GfDuration) return value
  if (Array.isArray(value)) return value.map(structuredCloneish) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, structuredCloneish(v)])) as T
  }
  return value
}
