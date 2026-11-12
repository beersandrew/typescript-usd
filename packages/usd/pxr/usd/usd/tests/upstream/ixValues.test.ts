// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdValueClips.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Value resolution and Stage.flatten() against captures from OpenUSD
// v26.11.1 (FIXTURES.md): array edits composed over typed arrays,
// time samples and clips, value clips and path expressions. Expected layer
// text is UsdStage::Flatten(addSourceFileComment=False).ExportToString() and
// expected values are UsdAttribute::Get, with the fixture directory rewritten
// to the in-memory prefix /fx.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { AssetPath as SdfAssetPath, PathExpression as SdfPathExpression } from 'typescript-usd/sdf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver, _setResolverForTest } from 'typescript-usd/usd/_internal'
import { Array as VtArray, ArrayEdit as VtArrayEdit } from 'typescript-usd/vt'
import { Duration as GfDuration, TimeCode as GfTimeCode } from 'typescript-usd/gf'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

// Test-only extension metadata, copied from OpenUSD v26.11.1
// pxr/usd/usdGeom/plugInfo.json (SdfMetadata), so the flatten captures,
// which ran with every schema plugin registered, keep their primvar and
// stage metadata without loading a domain schema library into the Core
// package.
PlugRegistry.GetInstance().RegisterPlugins({
  Plugins: [{ Type: 'resource', Name: 'ixValuesMetadata', Info: {
    SdfMetadata: {
      elementSize: { appliesTo: ['attributes'], default: 1, displayGroup: 'Primvars', type: 'int' },
      interpolation: { appliesTo: ['attributes'], default: 'constant', displayGroup: 'Primvars', type: 'token' },
      metersPerUnit: { appliesTo: ['layers'], default: 0.01, displayGroup: 'Stage', type: 'double' },
      upAxis: { appliesTo: ['layers'], default: 'Y', displayGroup: 'Stage', type: 'token' },
    },
  } }],
})

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')
const ORACLE = readOracleFixture(path.join(FIXTURES, 'ixValues/oracle.json')) as
  Record<string, { flatten: string; values: Record<string, unknown> }>

const CASE_ROOTS: Record<string, string> = {
  arrayedit_string_fill: 'ixValues/arrayedit_string_fill.usda',
  pathexpr_array_empty: 'ixValues/pathexpr_array_empty.usda',
  arrayedit_asset_flatten: 'ixValues/arrayedit_asset_flatten.usda',
  '227_arrayEdits': 'ixValues/227_arrayEdits.usda',
  arrayedit_over_timesamples: 'ixValues/arrayedit_over_timesamples.usda',
  clips_manifest: 'testUsdValueClips/manifest/root.usda',
  legacy_typename_interp: 'ixValues/legacy_typename_interp.usda',
  clips_template_int3: 'testUsdValueClips/template/int3/result_int_3.usda',
  clips_template_subint1: 'testUsdValueClips/template/subint1/result_subint_1.usda',
  clips_template_sparse_overrides: 'testUsdValueClips/sparseOverrides/template_root.usda',
  clips_array_edits: 'testUsdValueClips/arrayEdits/root.usda',
  clips_asset_paths: 'testUsdValueClips/assetPathValues/root.usda',
  tcps_zero: 'ixValues/tcps_zero.usda',
  clips_single_spline: 'testUsdValueClips/singleclip/root.usda',
  clips_spline_timing: 'testUsdValueClips/timingSpline/root.usda',
  clips_layer_offsets: 'testUsdValueClips/layerOffsets/root.usda',
  clips_layer_offsets_sublayer: 'testUsdValueClips/layerOffsets/root_sublayer.usda',
  clips_timecode_timing: 'testUsdValueClips/timeCodeTiming/root.usda',
  clips_data_format: 'testUsdValueClips/dataFormat/root.usda',
}

function fixtureAssets(): Record<string, Uint8Array> {
  const assets: Record<string, Uint8Array> = {}
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else {
        const rel = path.relative(FIXTURES, full).split(path.sep).join('/')
        assets[`/fx/${rel}`] = new Uint8Array(readFileSync(full))
      }
    }
  }
  for (const dir of ['ixValues', 'testUsdValueClips']) walk(path.join(FIXTURES, dir))
  return assets
}

// Get() results as the capture serializes them: arrays and Gf vectors as
// lists, asset paths as authored paths, path expressions as their text, time
// codes and durations as their value.
function jsonable(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (value instanceof SdfAssetPath) return value.getAuthoredPath()
  if (value instanceof SdfPathExpression) return value.getText()
  if (value instanceof GfTimeCode || value instanceof GfDuration) return value.GetValue()
  if (value instanceof VtArray) return value.toArray().map(jsonable)
  if (Array.isArray(value)) return value.map(jsonable)
  // An uncomposed array edit; its text is checked through flatten.
  if (value instanceof VtArrayEdit) return '<array edit>'
  if (typeof value === 'object' && 'data' in value) {
    return Array.from((value as { data: ArrayLike<number> }).data)
  }
  return value
}

describe('value resolution and flatten against OpenUSD v26.11.1 captures', () => {
  beforeEach(() => {
    _setResolverForTest(new ArInMemoryResolver(fixtureAssets()))
  })

  for (const [name, root] of Object.entries(CASE_ROOTS)) {
    const expected = ORACLE[name]!
    it(`${name}: Get matches UsdAttribute::Get`, async () => {
      const stage = (await Stage.open(`/fx/${root}`))!
      for (const [key, value] of Object.entries(expected.values)) {
        const [attrPath, time] = key.split('@') as [string, string]
        const attr = stage.getAttributeAtPath(attrPath)!
        const actual = time === 'timeSamples' ? attr.getTimeSampleKeys()
          : time === 'default' ? attr.getValue() : attr.getValueAtTime(Number(time))
        expect(jsonable(actual), key).toEqual(value)
      }
    })
    it(`${name}: flatten(false) matches UsdStage::Flatten`, async () => {
      const stage = (await Stage.open(`/fx/${root}`))!
      expect(stage.flatten(false).exportToString()).toBe(expected.flatten)
    })
  }
})
