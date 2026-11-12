// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdFlatten.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver, _setResolverForTest } from 'typescript-usd/usd/_internal'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

// ---------------------------------------------------------------------------
// Ported from upstream testenv/testUsdFlatten.py (test_FlattenTimeSamples
// AndDefaults, test_FlattenAssetPaths, test_FlattenStageMetadata) over the
// upstream fixture directories, plus a `debts` fixture covering prim,
// property and pseudo-root metadata fidelity. Expected layer text in
// fixtures/testUsdFlatten/oracle.json is UsdStage::Flatten().ExportToString()
// from OpenUSD v26.11.1 (FIXTURES.md), with the fixture directory
// rewritten to the in-memory prefix /fx.
// ---------------------------------------------------------------------------
// Test-only extension metadata, copied from OpenUSD v26.08
// pxr/usd/usdGeom/plugInfo.json:41-64. Preserve the native flatten goldens
// without loading a domain schema library into the Core package.
PlugRegistry.GetInstance().RegisterPlugins({
  Plugins: [{ Type: 'resource', Name: 'testUsdFlattenMetadata', Info: {
    SdfMetadata: {
      metersPerUnit: { appliesTo: ['layers'], default: 0.01, displayGroup: 'Stage', type: 'double' },
      upAxis: { appliesTo: ['layers'], default: 'Y', displayGroup: 'Stage', type: 'token' },
    },
  } }],
})

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdFlatten')
const ORACLE = readOracleFixture(path.join(TESTENV, 'oracle.json')) as Record<string, string>

function fixtureAssets(): Record<string, Uint8Array> {
  const assets: Record<string, Uint8Array> = {}
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.usda')) {
        const rel = path.relative(TESTENV, full).split(path.sep).join('/')
        assets[`/fx/${rel}`] = new Uint8Array(readFileSync(full))
      }
    }
  }
  walk(TESTENV)
  return assets
}

describe('testUsdFlatten fixtures — Stage.flatten() against OpenUSD v26.11.1', () => {
  beforeEach(() => {
    _setResolverForTest(new ArInMemoryResolver(fixtureAssets()))
  })
  const open = (testCase: string): Promise<Stage> => Stage.open(`/fx/${testCase}/root.usda`).then(value => value!)

  for (const testCase of ['assetPaths', 'time_samples', 'stage_metadata', 'debts']) {
    it(`${testCase}: Flatten(addSourceFileComment=False) matches the oracle text`, async () => {
      const stage = await open(testCase)
      expect(stage.flatten(false).exportToString()).toBe(ORACLE[testCase])
    })

    it(`${testCase}: Flatten() appends the source file comment`, async () => {
      const stage = await open(testCase)
      expect(stage.flatten().exportToString()).toBe(ORACLE[`${testCase}:comment`])
    })
  }

  it('test_FlattenTimeSamplesAndDefaults', async () => {
    const stage = await open('time_samples')
    const resultLayer = stage.flatten()

    // The flattened result for /StrongerDefault should only have a default
    // value, since a default value in a stronger layer will override all
    // time samples in a weaker layer.
    let resultAttrSpec = resultLayer.getAttributeAtPath('/StrongerDefault.attr')!
    expect(resultAttrSpec.getInfo('default')).toBe(1.0)
    expect(resultLayer.listTimeSamplesForPath('/StrongerDefault.attr')).toEqual([])

    // The flattened result for /StrongerTimeSamples should have both time
    // samples and a default value even though the default is set in a weaker
    // sublayer, since value resolution uses that when requesting the value
    // at the default time.
    resultAttrSpec = resultLayer.getAttributeAtPath('/StrongerTimeSamples.attr')!
    expect(resultAttrSpec.getInfo('default')).toBe(1.0)
    expect(resultLayer.listTimeSamplesForPath('/StrongerTimeSamples.attr')).toEqual([0.0, 1.0])
    expect(resultLayer.queryTimeSample('/StrongerTimeSamples.attr', 0.0)).toBe(100.0)
    expect(resultLayer.queryTimeSample('/StrongerTimeSamples.attr', 1.0)).toBe(101.0)
  })

  it('test_FlattenStageMetadata', async () => {
    const stage = await open('stage_metadata')

    // Sanity check that the stage we opened has a sublayer with layer
    // metadata that we don't expect to show up in the flattened layer and
    // that it has a TCPS of 48.
    const sublayer = stage.getUsedLayers().find(l => l.identifier === '/fx/stage_metadata/sub.usda')
    expect(sublayer).toBeDefined()
    expect(sublayer!.getPseudoRoot().listInfoKeys().sort()).toEqual(
      ['defaultPrim', 'endTimeCode', 'startTimeCode', 'timeCodesPerSecond'])
    expect(sublayer!.getPseudoRoot().getInfo('timeCodesPerSecond')).toBe(48)

    // Flatten the layer.
    const resultLayer = stage.flatten()

    // Verify that the flattened layer only contains layer metadata from the
    // root layer (and documentation written by the flatten operation itself).
    const resultPseudoRoot = resultLayer.getPseudoRoot()
    expect(resultPseudoRoot.listInfoKeys().sort()).toEqual(
      ['documentation', 'endTimeCode', 'startTimeCode'])
    expect(resultPseudoRoot.getInfo('startTimeCode')).toBe(0)
    expect(resultPseudoRoot.getInfo('endTimeCode')).toBe(24)

    // In particular verify that the timeCodesPerSecond from the sublayer was
    // not transferred over to the flattened layer.
    expect(resultPseudoRoot.hasInfo('timeCodesPerSecond')).toBe(false)
    expect(resultPseudoRoot.getInfo('timeCodesPerSecond')).toBe(24)

    // Verify the time samples from the root layer were transferred to the
    // flattened layer as is, no time mapping.
    expect(resultLayer.listTimeSamplesForPath('/TimeSamples.rootAttr')).toEqual([0.0, 24.0])
    expect(resultLayer.queryTimeSample('/TimeSamples.rootAttr', 0.0)).toBe(100.0)
    expect(resultLayer.queryTimeSample('/TimeSamples.rootAttr', 24.0)).toBe(101.0)

    // Verify the time samples from the sublayer were transferred to the
    // flattened layer and were mapped from the sublayer's 48 TCPS to the
    // root's 24 TCPS.
    expect(resultLayer.listTimeSamplesForPath('/TimeSamples.subAttr')).toEqual([12.0, 24.0])
    expect(resultLayer.queryTimeSample('/TimeSamples.subAttr', 12.0)).toBe(200.0)
    expect(resultLayer.queryTimeSample('/TimeSamples.subAttr', 24.0)).toBe(201.0)
  })

  it('test_FlattenAssetPaths: every asset path is anchored', async () => {
    // All asset paths in the flattened result should be anchored, even
    // though the asset being referred to does not exist.
    const text = (await open('assetPaths')).flatten(false).exportToString()
    expect(text).not.toContain('@./asset.usda@')
    expect(text.match(/@\/fx\/assetPaths\/asset\.usda@/g)?.length).toBe(8)
  })

  // Debt-specific checks on the `debts` fixture; the oracle-text test above
  // covers the same output in full.
  it('copies all non-private pseudo-root metadata from the root layer', async () => {
    const resultPseudoRoot = (await open('debts')).flatten(false).getPseudoRoot()
    expect(resultPseudoRoot.listInfoKeys().sort()).toEqual([
      'colorConfiguration', 'colorManagementSystem', 'customLayerData', 'defaultPrim',
      'documentation', 'expressionVariables', 'framesPerSecond', 'metersPerUnit',
      'timeCodesPerSecond', 'upAxis',
    ])
    expect(resultPseudoRoot.getInfo('documentation')).toBe('root doc')
    expect(resultPseudoRoot.getInfo('timeCodesPerSecond')).toBe(30)
  })

  it('anchors prim metadata asset paths to the layer of each opinion', async () => {
    const text = (await open('debts')).flatten(false).exportToString()
    expect(text).toContain('asset identifier = @/fx/debts/model.usd@')
    expect(text).toContain('asset a = @/fx/debts/a.usd@')
    expect(text).toContain('asset b = @/fx/debts/sub/b.usd@')
    expect(text).toContain('asset q = @/fx/debts/sub/q.usd@')
  })

  it('authors complete property specs (custom, variability, typed values)', async () => {
    const resultLayer = (await open('debts')).flatten(false)
    expect(resultLayer.getField('/World.xformOpOrder', 'custom')).toBeFalsy()
    expect(resultLayer.getField('/World.xformOpOrder', 'variability')).toBe('uniform')
    expect(resultLayer.getField('/World.myCustom', 'custom')).toBe(true)
    expect(resultLayer.getField('/World.customRel', 'custom')).toBe(true)
    expect(resultLayer.getField('/World.myRel', 'custom')).toBeFalsy()
    expect(resultLayer.getField('/World.expr', 'typeName')).toBe('pathExpression')
    expect(resultLayer.exportToString()).toContain(
      'pathExpression expr = "/World/** - /World/B"')
  })

  it('keeps SdfValueBlock time samples and blocked defaults', async () => {
    const resultLayer = (await open('debts')).flatten(false)
    expect(resultLayer.listTimeSamplesForPath('/World.blocked')).toEqual([0, 1, 2])
    expect(resultLayer.listTimeSamplesForPath('/World.subSamples')).toEqual([30, 60])
    const text = resultLayer.exportToString()
    expect(text).toContain('        1: None,\n        2: 3,')
    expect(text).toContain('        60: None,')
    expect(text).toContain('double blockedDefault = None')
  })
})
