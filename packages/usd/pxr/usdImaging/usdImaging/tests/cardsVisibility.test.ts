// Ported from OpenUSD 26.11.1: pxr/imaging/hd/retainedDataSource.cpp,
//  pxr/usdImaging/usdImaging/drawModeStandin.cpp,
//  pxr/usdImaging/usdImaging/flattenedGeomModelDataSourceProvider.cpp,
//  pxr/usdImaging/usdImaging/niInstanceAggregationSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/niPrototypePropagatingSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/sceneIndices.cpp
// Copyright 2021, 2022, 2023 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The final scene index of UsdImagingCreateSceneIndices
// (pxr/usdImaging/usdImaging/sceneIndices.cpp, with the draw mode scene
// index) for upstream's testUsdImagingGLCards_SceneIndex_visibility input,
// checked against fixtures/cardsVisibility/scene.json, captured from the
// OpenUSD 26.11.1 reference build (FIXTURES.md; same line format, sorted:
// the children of a cards standin follow an std::unordered_map upstream; the
// USD prototype number is masked, as in the capture).
//
// /World/Group2 pins how model:cardVisibility = simple on a point instancer
// reaches the cards inside the native-instance prototype its prototype Foo
// references: Foo's flattened geomModel is copied with HdMakeStaticCopy
// (niInstanceAggregationSceneIndex.cpp:837-859, retainedDataSource.cpp:
// 419-424) onto the instance binding scope, applied to the propagated
// prototype root (niPrototypePropagatingSceneIndex.cpp:503-519), flattened
// to the cards prims (flattenedGeomModelDataSourceProvider.cpp:95-104), and
// the standins drop their up-axis faces (drawModeStandin.cpp:1289-1305).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  SceneIndexPrimView as HdSceneIndexPrimView,
  type SampledDataSource as HdSampledDataSource,
} from 'typescript-usd/hd'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingGeomModelSchema } from '../src/geomModelSchema.ts'
import { UsdImagingCreateSceneIndices } from '../src/sceneIndices.ts'

const fixtures = new URL('./fixtures/cardsVisibility/', import.meta.url)

/** The native capture's _Token: the token value of a data source, or "-". */
function _Token(ds: { getTypedValue(t: number): unknown } | undefined): string {
  return ds ? String(ds.getTypedValue(0.0)) : '-'
}

/** One line of the native capture's output for the prim at path. */
function _Line(sceneIndex: ReturnType<typeof UsdImagingCreateSceneIndices>['finalSceneIndex'],
  path: string): string {
  const prim = sceneIndex.getPrim(path)
  let line = `${path} [${prim.primType ?? ''}]`
  const schema = UsdImagingGeomModelSchema.getFromParent(prim.dataSource)
  if (schema.isDefined()) {
    const apply = schema.getApplyDrawMode()
    line += ` drawMode=${_Token(schema.getDrawMode())}` +
      ` cardVis=${_Token(schema.getCardVisibility())}` +
      ` apply=${apply ? (apply.getTypedValue(0.0) ? '1' : '0') : '-'}`
  }
  if (prim.primType === 'mesh') {
    const counts = (prim.dataSource?.Get('mesh') as { Get(n: string): unknown } | undefined)
    const topology = counts?.Get('topology') as { Get(n: string): unknown } | undefined
    const fvc = topology?.Get('faceVertexCounts') as HdSampledDataSource | undefined
    if (fvc) {
      line += ` faces=${(fvc.GetValue(0.0) as ArrayLike<number>).length}`
    }
  }
  const visibility = prim.dataSource?.Get('visibility') as { Get(n: string): unknown } | undefined
  const vis = visibility?.Get('visibility') as { getTypedValue(t: number): boolean } | undefined
  if (vis) {
    line += ` vis=${vis.getTypedValue(0.0) ? 1 : 0}`
  }
  return line
}

describe('UsdImagingCreateSceneIndices: testCardsVisibility.usda', () => {
  it('matches the native scene, including cardVisibility through the native-instance prototype', async () => {
    const expected = JSON.parse(readFileSync(new URL('scene.json', fixtures), 'utf8')).payload as string[]

    const stage = await UsdStage.open(new URL('testCardsVisibility.usda', fixtures).pathname)
    expect(stage).toBeTruthy()
    const sceneIndex = UsdImagingCreateSceneIndices({ stage: stage!, addDrawModeSceneIndex: true }).finalSceneIndex

    const lines: string[] = []
    for (const path of new HdSceneIndexPrimView(sceneIndex)) {
      lines.push(_Line(sceneIndex, path).replace(/\/__Prototype_\d+/g, '/__Prototype_<n>'))
    }
    expect(lines.sort()).toEqual(expected)
  })
})
