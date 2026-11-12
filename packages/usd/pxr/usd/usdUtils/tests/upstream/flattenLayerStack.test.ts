// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsFlattenLayerStack.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsFlattenLayerStack.py
// (registered as testUsdUtilsFlattenLayerStack with TESTENV
// testUsdUtilsFlattenLayerStack). The testenv directory is copied unmodified
// into fixtures/testUsdUtilsFlattenLayerStack (Copyright 2017 Pixar, Modified
// Apache 2.0, https://openusd.org/license). Upstream runs in a copy of that
// directory, so each test copies the fixtures into a temporary directory and
// opens its files there.
//
// API mapping:
//   - UsdUtils.FlattenLayerStack(stage, resolveAssetPathFn=, tag=) is
//     UsdUtilsFlattenLayerStack(stage, { resolveAssetPathFn, tag }).
//   - Usd.Stage.Open(path | layer) is Stage.open(...); prim.GetAttribute is
//     getAttr; attr.Get() / Get(t) are getValue() / getValueAtTime(t);
//     GetTimeSamples() is getTimeSampleKeys(); rel.GetTargets() returns path
//     strings; Usd.ResolveInfoSource* are ResolveInfoSource members.
//   - An SdfAssetPath value's .path is getAssetPath(); Sdf.AssetPath() and
//     Sdf.AssetPath('foo') compare by asset path. Asset values inside the
//     clips dictionary are held as their authored strings.
//   - Sdf list ops are read with ListOp.fromValue; prim spec GetInfo('clips')
//     is getInfo('clips'), whose Vt.Vec2dArray values are compared by
//     their elements.
//   - The flattened layer's ExportToString() is only printed upstream.
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AssetPath as SdfAssetPath, ListOp } from 'typescript-usd/sdf'
import { ResolveInfoSource, Stage } from 'typescript-usd/usd'
import { UsdUtilsFlattenLayerStack } from 'typescript-usd/usdUtils'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdUtilsFlattenLayerStack')

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsFlattenLayerStack'))
  cpSync(TESTENV, dir, { recursive: true })
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const open = async (file: string): Promise<Stage> => (await Stage.open(path.join(dir, file)))!

// Elements of a Gf vector or an iterable (VtArray) value.
const values = (v: unknown): unknown[] => v && typeof v === 'object' && 'get' in v && 'dimension' in v
  ? Array.from({ length: (v as { dimension: number }).dimension }, (_, i) => (v as { get(i: number): number }).get(i))
  : [...(v as Iterable<unknown>)]
// An SdfAssetPath value's asset path (Python AssetPath.path). Asset values
// inside a dictionary (the clips metadata) are the authored strings
// typescript-usd stores (usd/src/flattenUtils.ts header).
const assetPath = (v: unknown): string => typeof v === 'string' ? v : (v as SdfAssetPath).getAssetPath()

describe('TestUsdUtilsFlattenLayerStack', () => {
  // testUsdUtilsFlattenLayerStack.py:14-109
  it('test_Basic', async () => {
    const srcStage = await open('root.usda')
    const layer = UsdUtilsFlattenLayerStack(srcStage, { tag: 'test.usda' })
    const resultStage = await Stage.open(layer)

    // Confirm that the tag makde it into the display name.
    expect(layer.getDisplayName()).toContain('test.usda')

    // Run the same set of queries against the src and dest stages.
    // They should yield the same results.
    for (const stage of [srcStage, resultStage]) {
      let p = stage.getPrim('/Sphere')!

      // Composition arcs remain intact
      expect(p.hasAuthoredReferences()).toBe(true)
      expect(p.hasAuthoredInherits()).toBe(true)
      expect(p.hasAuthoredPayloads()).toBe(true)
      expect(p.hasVariantSets()).toBe(true)

      // Classes continue to exist
      expect(stage.getPrim('/_class_Sphere')).toBeTruthy()

      // Default in a strong layer wins over timeSamples in weak.
      let a = p.getAttr('defaultOverTimeSamples')!
      expect(a.getResolveInfo().getSource()).toBe(ResolveInfoSource.Default)
      a = p.getAttr('timeSamplesOverDefault')!
      expect(a.getResolveInfo().getSource()).toBe(ResolveInfoSource.TimeSamples)
      expect(a.getValue()).toBe(123) // default
      expect(a.getValueAtTime(1)).toBe(1) // time sample

      // Layer offsets affect time samples
      a = p.getAttr('timeSamplesAcrossLayerOffset')!
      expect(a.getTimeSampleKeys()).toEqual([-9.0, 0.0])

      // Layer offsets get folded into reference arcs
      p = stage.getPrim('/Sphere/RootReloChildFromReference')!
      a = p.getAttr('timeSamplesAcrossRef')!
      expect(a.getTimeSampleKeys()).toEqual([-9.0, 0.0])

      // Confirm result of list-editing.
      p = stage.getPrim('/ListOpTest')!
      const r = p.rel('foo')
      expect(r.getTargets()).toEqual(['/Pre_root', '/Pre_sub', '/App_sub', '/App_root'])

      // Confirm children from across various kinds of arcs.
      for (const childPath of [
        '/Sphere/SubReloChildFromPayload',
        '/Sphere/RootReloChildFromReference',
        '/Sphere/RootReloChildFromNestedVariant']) {
        expect(stage.getPrim(childPath)).toBeTruthy()
      }

      // Confirm time samples coming from (offset) clips.
      p = stage.getPrim('/SphereUsingClip')!
      a = p.getAttr('xformOp:translate')!
      expect(a.getResolveInfo(5).getSource()).toBe(ResolveInfoSource.ValueClips)
    }

    // Confirm relative asset path handling in the output stage.
    const p = resultStage.getPrim('/Sphere')!
    let a = p.getAttr('relativePath')!
    // It should have become an absolute path.
    expect(path.isAbsolute(assetPath(a.getValue()))).toBe(true)
    // Check arrays of paths.
    a = p.getAttr('relativePathVec')!
    for (const item of values(a.getValue())) {
      expect(path.isAbsolute(assetPath(item))).toBe(true)
    }

    // Confirm Sdf-level result of list-editing.
    const targets = ListOp.fromValue<string>(layer.getField('/ListOpTest.foo', 'targetPaths'), String)
    expect(targets.getPrependedItems()).toEqual(['/Pre_root', '/Pre_sub'])
    expect(targets.getAppendedItems()).toEqual(['/App_sub', '/App_root'])
    expect(targets.getDeletedItems()).toEqual(['/Del_sub', '/Del_root'])

    // Confirm offsets have been folded into value clips.
    const clips = layer.getPrimAtPath('/SphereUsingClip')!.getInfo('clips') as
      Record<string, Record<string, unknown>>
    expect(values(clips.default!.active).map(values)).toEqual([[-9.0, 0]])
    expect(values(clips.default!.times).map(values)).toEqual([[-9.0, 1], [0.0, 10]])

    // Confirm nested variant sets still exist
    expect(layer.getObjectAtPath('/Sphere{vset_1=default}{vset_2=default}ChildFromNestedVariant')).toBeTruthy()
  })

  // testUsdUtilsFlattenLayerStack.py:111-132
  it('test_ClipAssetPaths', async () => {
    const srcStage = await open('root.usda')

    const replaceWithFoo = () => 'foo'
    const layer = UsdUtilsFlattenLayerStack(srcStage, { resolveAssetPathFn: replaceWithFoo })
    await Stage.open(layer)

    // Confirm offsets have been folded into value clips.
    const clips = layer.getPrimAtPath('/SphereUsingClip')!.getInfo('clips') as
      Record<string, Record<string, unknown>>
    expect(values(clips.default!.active).map(values)).toEqual([[-9.0, 0]])
    expect(values(clips.default!.times).map(values)).toEqual([[-9.0, 1], [0.0, 10]])

    // And confirm clip asset paths have been updated.
    expect(assetPath(clips.default!.manifestAssetPath)).toBe('foo')
    expect(values(clips.default!.assetPaths).map(assetPath)).toEqual(['foo'])
  })

  // testUsdUtilsFlattenLayerStack.py:134-155
  it('test_EmptyAssetPaths', async () => {
    const srcStage = await open('emptyAssetPaths.usda')
    const layer = UsdUtilsFlattenLayerStack(srcStage, { tag: 'emptyAssetPaths' })
    const resultStage = await Stage.open(layer)

    // Verify that empty asset paths do not trigger coding errors during
    // flattening.

    const prim = resultStage.getPrim('/Test')!
    expect(prim.hasAuthoredReferences()).toBe(true)

    const primSpec = layer.getPrimAtPath('/Test')!
    const refs = ListOp.fromValue(primSpec.getInfo('references'))
    expect(refs.isExplicit()).toBe(true)
    expect(refs.getExplicitItems()).toEqual([{ assetPath: '', primPath: '/Ref', layerOffset: { offset: 0, scale: 1 } }])

    const assetAttr = prim.getAttr('a')!
    expect(assetPath(assetAttr.getValue())).toBe('')

    const assetArrayAttr = prim.getAttr('b')!
    expect(values(assetArrayAttr.getValue()).map(assetPath)).toEqual(['', ''])
  })

  // testUsdUtilsFlattenLayerStack.py:157-174
  it('test_ResolveAssetPathFn', async () => {
    const srcStage = await open('emptyAssetPaths.usda')
    const replaceWithFoo = () => 'foo'
    const layer = UsdUtilsFlattenLayerStack(srcStage, {
      resolveAssetPathFn: replaceWithFoo, tag: 'resolveAssetPathFn',
    })
    const resultStage = await Stage.open(layer)

    // verify that we replaced asset paths with "foo"

    const prim = resultStage.getPrim('/Test')!
    const assetAttr = prim.getAttr('a')!
    expect(assetPath(assetAttr.getValue())).toBe('foo')

    const assetArrayAttr = prim.getAttr('b')!
    expect(values(assetArrayAttr.getValue()).map(assetPath)).toEqual(['foo', 'foo'])
  })

  // testUsdUtilsFlattenLayerStack.py:176-198
  it('test_TimeSampledAssets', async () => {
    const srcStage = await open('time_sampled_assets.usda')
    const layer = UsdUtilsFlattenLayerStack(srcStage)
    const resultStage = await Stage.open(layer)

    let prim = resultStage.getPrim('/materials/usdpreviewsurface1/usduvtexture1')!
    // We do not use inputs:file here because it has type asset,
    // not asset[].
    let attr = prim.getAttr('testAssetArrayAttr')!
    let timeSamples = attr.getTimeSampleKeys()
    for (const timeSample of timeSamples) {
      const timeSampleArrayValue = attr.getValueAtTime(timeSample)
      for (const timeSampleValue of values(timeSampleArrayValue)) {
        expect(path.isAbsolute(assetPath(timeSampleValue))).toBe(true)
      }
    }

    prim = resultStage.getPrim('/volume/density')!
    attr = prim.getAttr('filePath')!
    timeSamples = attr.getTimeSampleKeys()
    for (const timeSample of timeSamples) {
      const timeSampleValue = attr.getValueAtTime(timeSample)
      expect(path.isAbsolute(assetPath(timeSampleValue))).toBe(true)
    }
  })
})
