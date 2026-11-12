// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/testenv/testUsdSkelImagingNiAggregationNonDescendantPaths.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdSkelImaging/testenv/
// testUsdSkelImagingNiAggregationNonDescendantPaths.cpp (OpenUSD 26.11.1),
// registered in pxr/usdImaging/usdSkelImaging/CMakeLists.txt:116-124. The
// testenv scenes are copied unchanged into
// fixtures/testUsdSkelImagingNiAggregationNonDescendantPaths. The expected
// instancer counts are the upstream test's.
//
// USD-12324 regression test: runs the full UsdImagingCreateSceneIndices
// pipeline (with the usdSkelImaging scene index plugin, so that skelBinding
// participates in native instance aggregation) and counts the native
// instance instancers of the aggregated scene index.
import { describe, expect, it } from 'vitest'
import {
  PrimTypeTokens as HdPrimTypeTokens, SceneIndexPrimView as HdSceneIndexPrimView,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UsdImagingCreateSceneIndices } from 'typescript-usd/usdImaging'
import 'typescript-usd/usdSkelImaging'

const fixtures = new URL('fixtures/testUsdSkelImagingNiAggregationNonDescendantPaths/', import.meta.url)

/** testUsdSkelImagingNiAggregationNonDescendantPaths.cpp:34-46 */
async function _LoadFinalSceneIndex(usdFile: string): Promise<HdSceneIndexBase | undefined> {
  const stage = await UsdStage.open(new URL(usdFile, fixtures).pathname)
  if (!stage) {
    return undefined
  }
  return UsdImagingCreateSceneIndices({ stage }).finalSceneIndex
}

/** testUsdSkelImagingNiAggregationNonDescendantPaths.cpp:48-70: count
 *  instancer prims in the aggregated scene index. The test scenes contain no
 *  PointInstancers, so every instancer prim is a native-instance instancer. */
function _CountInstancers(si: HdSceneIndexBase | undefined): number {
  if (!si) {
    return -1
  }
  let count = 0
  for (const primPath of new HdSceneIndexPrimView(si)) {
    if (si.getPrim(primPath).primType === HdPrimTypeTokens.instancer) {
      ++count
    }
  }
  return count
}

describe('testUsdSkelImagingNiAggregationNonDescendantPaths', () => {
  /** testUsdSkelImagingNiAggregationNonDescendantPaths.cpp:86-93: two
   *  Models whose inherited skel:skeleton binds into a sibling native
   *  instance (Rig) aggregate into a single instancer. One ModelProto
   *  instancer + one RigProto instancer = 2. */
  it('TestSkelSiblingAggregates', async () => {
    expect(_CountInstancers(await _LoadFinalSceneIndex('skelSibling.usda'))).toBe(2)
  })

  /** testUsdSkelImagingNiAggregationNonDescendantPaths.cpp:95-103: when the
   *  sibling Rigs are different prototypes, the two Models bind to distinct
   *  prototype-relative skeleton paths and must stay split. Two Model
   *  instancers + two distinct Rig instancers = 4. */
  it('TestSkelSiblingNegative', async () => {
    expect(_CountInstancers(await _LoadFinalSceneIndex('skelSiblingNegative.usda'))).toBe(4)
  })

  /** testUsdSkelImagingNiAggregationNonDescendantPaths.cpp:105-112:
   *  model:modelPath relocation. Two identical-asset placements whose only
   *  differing hashed field would be the inherited ancestor model:modelPath
   *  aggregate once that field is relocated to a primvar. */
  it('TestModelPathAggregates', async () => {
    expect(_CountInstancers(await _LoadFinalSceneIndex('modelPath.usda'))).toBe(1)
  })
})
