// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingDrawModeAggregationScope.cpp,
//  pxr/usdImaging/usdImaging/sceneIndices.cpp
// Copyright 2023, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingDrawModeAggregationScope.cpp
// (OpenUSD 26.11.1; the test source and its testenv aggregationScope.usda are
// in the release but not registered in pxr/usdImaging/usdImaging/CMakeLists.txt).
// The expected standin paths are the reference build's output of the
// upstream test, captured into ../fixtures/drawModeSceneIndex/
// aggregationScope.txt (FIXTURES.md). The instance binding scope name of the
// propagated prototype (UsdNiPropagatedPrototypes/<scope>) embeds data source
// hashes, so it is compared up to that path element.
//
// The test drives UsdImagingCreateSceneIndices (sceneIndices.cpp), which is
// loaded at run time: the test fails until sceneIndices.ts exists.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SceneIndexPrimView as HdSceneIndexPrimView, type SceneIndexBase as HdSceneIndexBase } from 'typescript-usd/hd'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingDrawModeSceneIndex } from '../../src/drawModeSceneIndex.ts'
import { UsdImagingTokens } from '../../src/tokens.ts'

const fixtures = new URL('../fixtures/drawModeSceneIndex/', import.meta.url)

/** testUsdImagingDrawModeAggregationScope.cpp:26-37: the prim names
 *  UsdImaging_DrawModeStandin inserts for each draw mode. */
function _IsDrawModeStandin(name: string): boolean {
  return name === 'cardsMesh' || name === 'boundsCurves' || name === 'originCurves'
}

function _Name(path: string): string { return path.slice(path.lastIndexOf('/') + 1) }
function _Parent(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}

/** testUsdImagingDrawModeAggregationScope.cpp:39-47: a standin on the
 *  binding scope replaces the scope's whole subtree, including the
 *  instancer, so its rprim is an immediate child of the scope prim. Prims
 *  deeper than that -- notably the propagated prototype -- are carded
 *  normally. */
function _IsOnInstanceBindingScope(path: string): boolean {
  return _Name(_Parent(_Parent(path))) === UsdImagingTokens.niPropagatedPrototypesScope
}

/** The binding scope element of a propagated prototype path. */
function _MaskScope(path: string): string {
  return path.replace(
    new RegExp(`^/${UsdImagingTokens.niPropagatedPrototypesScope}/[^/]+/`),
    `/${UsdImagingTokens.niPropagatedPrototypesScope}/<scope>/`)
}

describe('testUsdImagingDrawModeAggregationScope', () => {
  /** testUsdImagingDrawModeAggregationScope.cpp:51-128 */
  it('creates draw mode standins, none on an instance binding scope', async () => {
    const captured = readFileSync(new URL('aggregationScope.txt', fixtures), 'utf8').split('\n')
    expect(captured[0]).toBe('exit 0')
    const expectedStandins = captured.slice(2).map(l => l.trim()).filter(l => l !== '')

    const stage = await UsdStage.open(new URL('aggregationScope.usda', fixtures).pathname)
    expect(stage).toBeTruthy()

    // Reproduce the ordering Presto uses: no draw mode inside prototype
    // propagation, and one draw mode scene index downstream of the whole
    // graph.
    const sceneIndicesModule = './../../src/sceneIndices.ts'
    const { UsdImagingCreateSceneIndices } = await import(/* @vite-ignore */ sceneIndicesModule) as {
      UsdImagingCreateSceneIndices: (info: Record<string, unknown>) => { finalSceneIndex: HdSceneIndexBase }
    }
    const sceneIndices = UsdImagingCreateSceneIndices({ stage, addDrawModeSceneIndex: false })

    const sceneIndex = UsdImagingDrawModeSceneIndex.new(
      sceneIndices.finalSceneIndex, /* inputArgs = */ undefined)

    const standinsOnBindingScope: string[] = []
    const otherStandins: string[] = []

    for (const path of new HdSceneIndexPrimView(sceneIndex)) {
      if (!_IsDrawModeStandin(_Name(path))) {
        continue
      }
      if (_IsOnInstanceBindingScope(path)) {
        standinsOnBindingScope.push(path)
      } else {
        otherStandins.push(path)
      }
    }

    // Instance aggregation copies the instance's geomModel onto its binding
    // scope, so a draw mode scene index running downstream of propagation used
    // to create a draw mode standin for the scope.  That standin was not
    // instanced and drew once at the origin. Verify here this standin is no
    // longer created
    expect(standinsOnBindingScope).toEqual([])

    // Guards against excluding too much: the propagated prototype must still
    // be carded, since that is what the instancer draws.
    expect(otherStandins.length).toBeGreaterThan(0)

    expect(otherStandins.map(_MaskScope).sort()).toEqual(expectedStandins.map(_MaskScope).sort())
  })
})
