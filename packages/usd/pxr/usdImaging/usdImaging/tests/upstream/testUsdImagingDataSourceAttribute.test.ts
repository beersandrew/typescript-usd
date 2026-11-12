// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingDataSourceAttribute.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingDataSourceAttribute.cpp
// (OpenUSD 26.11.1), registered in pxr/usdImaging/usdImaging/CMakeLists.txt:353-356.
// Each TF_VERIFY is an expect(); the TfErrorMark of main()
// (testUsdImagingDataSourceAttribute.cpp:184-195) is checked per case.
//
// HdBoolDataSource::Cast is GetTypedValue on the returned data source (the
// TS data sources are not typed by their value type).
import { describe, expect, it } from 'vitest'
import { DataSourceLocator as HdDataSourceLocator, DataSourceLocatorSet as HdDataSourceLocatorSet } from 'typescript-usd/hd'
import { AssetPath as SdfAssetPath, Layer as SdfLayer, ValueTypeNames as SdfValueTypeNames } from 'typescript-usd/sdf'
import { TfErrorMark } from 'typescript-usd/tf'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  UsdImagingDataSourceAttributeNew,
  UsdImagingDataSourceRelationship,
  UsdImagingDataSourceStageGlobals,
} from 'typescript-usd/usdImaging'

/** testUsdImagingDataSourceAttribute.cpp:26-58 */
class TestStageGlobals extends UsdImagingDataSourceStageGlobals {
  private readonly _time = 0
  private readonly _timeVarying = new Map<string, HdDataSourceLocator[]>()
  private readonly _assetPathDependent = new Set<string>()

  getTime(): UsdTimeCode { return new UsdTimeCode(this._time) }

  flagAsTimeVarying(hydraPath: string, locator: HdDataSourceLocator): void {
    const set = this._timeVarying.get(hydraPath) ?? []
    set.push(locator)
    this._timeVarying.set(hydraPath, set)
  }

  flagAsAssetPathDependent(usdPath: string): void {
    this._assetPathDependent.add(usdPath)
  }

  getTimeVaryingLocators(hydraPath: string): HdDataSourceLocatorSet {
    return new HdDataSourceLocatorSet(this._timeVarying.get(hydraPath) ?? [])
  }

  getAssetPathDependents(): Set<string> {
    return this._assetPathDependent
  }
}

async function _OpenStage(): Promise<UsdStage> {
  const sessionLayer = SdfLayer.createAnonymous('.usda')
  const rootLayer = SdfLayer.createAnonymous('.usda')
  return UsdStage.open(rootLayer, { sessionLayer })
}

describe('testUsdImagingDataSourceAttribute', () => {
  /** testUsdImagingDataSourceAttribute.cpp:60-102 */
  it('RelationshipTest', async () => {
    const mark = new TfErrorMark()
    const stage = await _OpenStage()

    const world = stage.definePrim('/World')
    expect(world).toBeTruthy()
    stage.definePrim('/World/foo')
    stage.definePrim('/World/bar')
    const rel = world.createRelationship('taco')
    expect(rel).toBeTruthy()

    const stageGlobals = new TestStageGlobals()

    const relDs = UsdImagingDataSourceRelationship.new(rel, stageGlobals)

    // API tests.
    const value = relDs.GetValue(0)
    expect(value.isArrayValued()).toBe(true)
    expect(value.getElementType().getTypeName()).toBe('SdfPath')
    const sampleTimes: number[] = []
    expect(relDs.GetContributingSampleTimesForInterval(-1, 1, sampleTimes)).toBe(false)
    expect(sampleTimes.length).toBe(0)

    // Variability tracking.
    expect(stageGlobals.getTimeVaryingLocators('/World').IsEmpty()).toBe(true)

    // Empty relationship.
    expect(relDs.getTypedValue(0).length).toBe(0)

    // 1 target.
    rel.addTarget('/World/foo')
    let targets = [...relDs.getTypedValue(0)]
    expect(targets.length).toBe(1)
    expect(targets[0]).toBe('/World/foo')

    // 2 targets.
    rel.addTarget('/World/bar')
    targets = [...relDs.getTypedValue(0)]
    expect(targets.length).toBe(2)
    expect(targets[0]).toBe('/World/foo')
    expect(targets[1]).toBe('/World/bar')

    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingDataSourceAttribute.cpp:104-182 */
  it('AttributeTest', async () => {
    const mark = new TfErrorMark()
    const stage = await _OpenStage()

    const world = stage.definePrim('/World')
    expect(world).toBeTruthy()
    const attrStatic = world.createAttribute('taco',
      SdfValueTypeNames.Bool.name, true, 'uniform')
    expect(attrStatic).toBeTruthy()
    attrStatic.set(true)

    const attrSampled = world.createAttribute('burrito',
      SdfValueTypeNames.Bool.name, true, 'varying')
    expect(attrSampled).toBeTruthy()
    attrSampled.setTimeSample(-0.5, true)

    const attrAssetPath = world.createAttribute('quesadilla',
      SdfValueTypeNames.Asset.name, true, 'uniform')
    expect(attrAssetPath).toBeTruthy()
    attrAssetPath.set(new SdfAssetPath('`${ASSET_PATH}`'))

    const stageGlobals = new TestStageGlobals()

    const attrStaticDs = UsdImagingDataSourceAttributeNew(attrStatic, stageGlobals,
      '/World', new HdDataSourceLocator('taco'))!
    let attrSampledDs = UsdImagingDataSourceAttributeNew(attrSampled, stageGlobals,
      '/World', new HdDataSourceLocator('burrito'))!
    const attrAssetPathDs = UsdImagingDataSourceAttributeNew(attrAssetPath, stageGlobals,
      '/World', new HdDataSourceLocator('quesadilla'))!

    // API tests.
    const sampleTimes: number[] = []

    expect((attrStaticDs.GetValue(0) as VtValue).IsHolding(VtValueTypes.bool)).toBe(true)
    expect(attrStaticDs.GetContributingSampleTimesForInterval(-1, 1, sampleTimes)).toBe(false)
    expect(sampleTimes.length).toBe(0)

    expect((attrSampledDs.GetValue(0) as VtValue).IsHolding(VtValueTypes.bool)).toBe(true)
    expect(attrSampledDs.GetContributingSampleTimesForInterval(-1, 1, sampleTimes)).toBe(false)
    expect(sampleTimes.length).toBe(0)

    expect((attrAssetPathDs.GetValue(0) as VtValue).getTypeName()).toBe('SdfAssetPath')
    expect(attrAssetPathDs.GetContributingSampleTimesForInterval(-1, 1, sampleTimes)).toBe(false)
    expect(sampleTimes.length).toBe(0)

    // Variability tracking.
    expect(stageGlobals.getTimeVaryingLocators('/World').IsEmpty()).toBe(true)

    // Asset path tracking.
    expect([...stageGlobals.getAssetPathDependents()]).toEqual(['/World.quesadilla'])

    // Add a second timesample on "burrito"
    attrSampled.setTimeSample(0.5, false)
    attrSampledDs = UsdImagingDataSourceAttributeNew(attrSampled, stageGlobals,
      '/World', new HdDataSourceLocator('burrito'))!

    expect((attrSampledDs.GetValue(0) as VtValue).IsHolding(VtValueTypes.bool)).toBe(true)
    expect(attrSampledDs.GetContributingSampleTimesForInterval(-1, 1, sampleTimes)).toBe(true)
    expect(sampleTimes).toEqual([-1, -0.5, 0.5, 1])
    const locators = stageGlobals.getTimeVaryingLocators('/World')
    const baseline = new HdDataSourceLocatorSet([new HdDataSourceLocator('burrito')])
    expect(locators.Equals(baseline)).toBe(true)

    // Value resolution
    expect((attrStaticDs.GetValue(0) as VtValue).UncheckedGet()).toBe(true)
    expect((attrSampledDs.GetValue(-0.7) as VtValue).UncheckedGet()).toBe(true)
    expect((attrSampledDs.GetValue(0) as VtValue).UncheckedGet()).toBe(true)
    expect((attrSampledDs.GetValue(0.7) as VtValue).UncheckedGet()).toBe(false)

    expect(mark.isClean()).toBe(true)
  })
})
