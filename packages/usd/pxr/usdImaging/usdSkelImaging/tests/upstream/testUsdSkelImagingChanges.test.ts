// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/testenv/testUsdSkelImagingChanges.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdSkelImaging/testenv/testUsdSkelImagingChanges.cpp
// (OpenUSD 26.11.1), registered in
// pxr/usdImaging/usdSkelImaging/CMakeLists.txt:99-105. The testenv scenes are
// copied unchanged into fixtures/testUsdSkelImagingChanges.
//
// The upstream test drives UsdImagingDelegate and inspects render index
// dirty bits. This port runs the same edits against the scene index chain
// (UsdImagingCreateSceneIndices with the usdSkelImaging plugin), which is the
// only imaging path of this port: where the test calls
// delegate->SyncAll(true) every data source of every prim of the final scene
// index is pulled, and where it inspects dirty bits the notices the final
// scene index sends for the prim are counted. The expected observations are
// the reference build's for the same scene index chain, captured into
// ../fixtures/changes/changes.txt (FIXTURES.md). (The delegate's two errors
// after the animation is removed, testUsdSkelImagingChanges.cpp:128-134, come
// from UsdImagingDelegate's skeleton adapter; the scene index chain posts
// none.)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ContainerDataSource as HdContainerDataSource, SampledDataSource as HdSampledDataSource,
  SceneIndexPrimView as HdSceneIndexPrimView, VectorDataSource as HdVectorDataSource,
  type DataSourceBase as HdDataSourceBase, type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexObserver as HdSceneIndexObserver,
} from 'typescript-usd/hd'
import { TfErrorMark } from 'typescript-usd/tf'
import { EditContext as UsdEditContext, Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingCreateSceneIndices, type UsdImagingSceneIndices } from 'typescript-usd/usdImaging'
import { Animation as UsdSkelAnimation } from 'typescript-usd/usdSkel'
import 'typescript-usd/usdSkelImaging'

const testenv = new URL('fixtures/testUsdSkelImagingChanges/', import.meta.url)
const expected = new Map(readFileSync(
  new URL('../fixtures/changes/changes.txt', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.includes('prims:'))
  .map(l => { const [k, v] = l.split('='); return [k!, v!] as [string, string] }))
const expectedPrims = readFileSync(
  new URL('../fixtures/changes/changes.txt', import.meta.url), 'utf8')
  .split('\n').find(l => l.startsWith('SkinnedMeshInvalidationTest prims:'))!
  .slice('SkinnedMeshInvalidationTest prims: '.length).split(' ')

function _Pull(ds: HdDataSourceBase | undefined): void {
  if (ds instanceof HdContainerDataSource) {
    for (const name of ds.getNames()) _Pull(ds.Get(name))
  } else if (ds instanceof HdVectorDataSource) {
    for (let i = 0; i < ds.getNumElements(); ++i) _Pull(ds.getElement(i))
  } else if (ds instanceof HdSampledDataSource) {
    ds.GetValue(0.0)
  }
}

/** The counterpart of delegate->SyncAll(true): pull every data source. */
function _PullAll(si: HdSceneIndexBase): void {
  for (const path of new HdSceneIndexPrimView(si)) _Pull(si.getPrim(path).dataSource)
}

async function _Create(file: string): Promise<[UsdStage, UsdImagingSceneIndices]> {
  const stage = (await UsdStage.open(new URL(file, testenv).pathname))!
  expect(stage).toBeTruthy()
  return [stage, UsdImagingCreateSceneIndices({ stage })]
}

/** Counts notices about `path` (removals of it or an ancestor). */
function _Counter(path: string): HdSceneIndexObserver & { count: number } {
  const counter = {
    count: 0,
    primsAdded(_s: HdSceneIndexBase, entries: { primPath: string }[]) {
      for (const e of entries) if (e.primPath === path) ++counter.count
    },
    primsRemoved(_s: HdSceneIndexBase, entries: { primPath: string }[]) {
      for (const e of entries) {
        if (path === e.primPath || path.startsWith(e.primPath === '/' ? '/' : `${e.primPath}/`)) ++counter.count
      }
    },
    primsDirtied(_s: HdSceneIndexBase, entries: { primPath: string }[]) {
      for (const e of entries) if (e.primPath === path) ++counter.count
    },
    primsRenamed() {},
  }
  return counter
}

describe('testUsdSkelImagingChanges', () => {
  /** testUsdSkelImagingChanges.cpp:26-73 */
  it('SwitchBoundMaterialTest', async () => {
    const [stage, sis] = await _Create('boundMaterial.usda')
    _PullAll(sis.finalSceneIndex)

    const counter = _Counter('/Root/Geometry/box2')
    sis.finalSceneIndex.addObserver(counter)

    // Switch the material for box1
    const box1Prim = stage.getPrim('/Root/Geometry/box1')!
    expect(box1Prim).toBeTruthy()
    box1Prim.rel('material:binding').setTargets(['/Root/Looks/green'])
    sis.stageSceneIndex.ApplyPendingUpdates()
    _PullAll(sis.finalSceneIndex)

    // Check that box2 is not invalidated.
    expect(String(counter.count)).toBe(expected.get('SwitchBoundMaterialTest box2NoticesAfterBox1Edit'))

    // Switch the material on box2
    counter.count = 0
    const box2Prim = stage.getPrim('/Root/Geometry/box2')!
    expect(box2Prim).toBeTruthy()
    box2Prim.rel('material:binding').setTargets(['/Root/Looks/green'])
    sis.stageSceneIndex.ApplyPendingUpdates()

    // Check that box2 is invalidated.
    expect(counter.count > 0 ? 'nonzero' : '0').toBe(expected.get('SwitchBoundMaterialTest box2NoticesAfterBox2Edit'))
    sis.finalSceneIndex.removeObserver(counter)
  })

  /** testUsdSkelImagingChanges.cpp:75-135 */
  it('SkelAnimUpdateTest', async () => {
    const [stage, sis] = await _Create('animation.usda')
    sis.stageSceneIndex.SetTime(0)
    _PullAll(sis.finalSceneIndex)

    const editContext = new UsdEditContext(stage, stage.getSessionLayer())
    const animationPath = '/Animation'
    const skelAnimation = UsdSkelAnimation.define(stage, animationPath)
    expect(skelAnimation.prim).toBeTruthy()

    // Update skeleton binding
    const skeletonPrim = stage.getPrim('/Root/Skeleton')!
    let errorMark = new TfErrorMark()
    skeletonPrim.rel('skel:animationSource').setTargets([animationPath])
    sis.stageSceneIndex.ApplyPendingUpdates()
    _PullAll(sis.finalSceneIndex)
    expect(String(errorMark.getNumErrors())).toBe(expected.get('SkelAnimUpdateTest errorsAfterAnimationAdded'))
    errorMark.clear()

    // Remove animation and update skelRoot's visibility
    stage.removePrim(animationPath)
    skeletonPrim.rel('skel:animationSource').clearTargets(false)
    stage.getPrim('/Root')!.attr('visibility').set('inherited')

    errorMark = new TfErrorMark()
    sis.stageSceneIndex.ApplyPendingUpdates()
    _PullAll(sis.finalSceneIndex)
    expect(String(errorMark.getNumErrors())).toBe(expected.get('SkelAnimUpdateTest errorsAfterAnimationRemoved'))
    errorMark.clear()
    editContext.close()
  })

  /** testUsdSkelImagingChanges.cpp:137-166 */
  it('SkinnedMeshInvalidationTest', async () => {
    const [stage, sis] = await _Create('skinning.usda')
    _PullAll(sis.finalSceneIndex)

    const errorMark = new TfErrorMark()
    // Deactivate and reactivate prim
    const skinningPrim = stage.getPrim('/Root/Skinning')!
    expect(skinningPrim).toBeTruthy()

    await skinningPrim.setActive(false)
    sis.stageSceneIndex.ApplyPendingUpdates()
    _PullAll(sis.finalSceneIndex)

    await skinningPrim.setActive(true)
    sis.stageSceneIndex.ApplyPendingUpdates()
    _PullAll(sis.finalSceneIndex)

    expect(String(errorMark.getNumErrors())).toBe(expected.get('SkinnedMeshInvalidationTest errors'))
    errorMark.clear()

    const prims: string[] = []
    for (const path of new HdSceneIndexPrimView(sis.finalSceneIndex)) {
      prims.push(`${path}=${sis.finalSceneIndex.getPrim(path).primType}`)
    }
    expect(prims).toEqual(expectedPrims)
  })
})
