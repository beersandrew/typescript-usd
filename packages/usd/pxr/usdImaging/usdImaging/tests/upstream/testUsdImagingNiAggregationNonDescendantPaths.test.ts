// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingNiAggregationNonDescendantPaths.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingNiAggregationNonDescendantPaths.cpp
// (OpenUSD 26.11.1), registered in pxr/usdImaging/usdImaging/CMakeLists.txt:406-410
// (no baseline; the expected instancer counts are those asserted by the
// upstream test source).
import { describe, expect, it } from 'vitest'
import {
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type ContainerDataSource as HdContainerDataSource,
  type DataSourceBase as HdDataSourceBase,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { UsdImaging_NiInstanceAggregationSceneIndex } from '../../src/niInstanceAggregationSceneIndex.ts'
import { UsdImagingUsdPrimInfoSchema } from '../../src/usdPrimInfoSchema.ts'

// Regression test for USD-12324

/** testUsdImagingNiAggregationNonDescendantPaths.cpp:27-49.
 *  Build a prim data source with __usdPrimInfo.niPrototypePath set, and
 *  optionally a second data source field keyed by bindingName. */
function _MakeInstancePrimSource(
  protoPath: string, bindingName = '', bindingValue?: HdDataSourceBase,
): HdContainerDataSource {
  const primInfo = new UsdImagingUsdPrimInfoSchema.Builder()
    .setNiPrototypePath(HdRetainedTypedSampledDataSource.new(protoPath))
    .build()
  if (!bindingName) {
    return HdRetainedContainerDataSource.new([UsdImagingUsdPrimInfoSchema.getSchemaToken()], [primInfo])
  }
  return HdRetainedContainerDataSource.new(
    [UsdImagingUsdPrimInfoSchema.getSchemaToken(), bindingName], [primInfo, bindingValue!])
}

/** testUsdImagingNiAggregationNonDescendantPaths.cpp:51-71.
 *  Traverse the output scene and count instancer prims for the given prototype.
 *  Instancer paths have the form:
 *  /UsdNiPropagatedPrototypes/<bindingScope>/<prototypeName>/UsdNiInstancer */
function _CountInstancers(si: HdSceneIndexBase, prototypeName: string): number {
  let count = 0
  const visit = (p: string): void => {
    if (UsdImaging_NiInstanceAggregationSceneIndex.getPrototypeNameFromInstancerPath(p) === prototypeName) {
      ++count
    }
    for (const child of si.getChildPrimPaths(p)) {
      visit(child)
    }
  }
  visit('/')
  return count
}

const _Empty = () => HdRetainedContainerDataSource.new([], [])

describe('testUsdImagingNiAggregationNonDescendantPaths', () => {
  /** .cpp:73-112. Case 2: DevCrowd holds a siblingRef to the sibling Rig
   *  native instance. Two instances (/A/DevCrowd, /B/DevCrowd) with
   *  different absolute Rig paths should aggregate to a single instancer once
   *  both paths are normalized to the same canonical prototype root. */
  it('TestSiblingNativeInstance', () => {
    const bindingName = 'siblingRef'
    const retained = HdRetainedSceneIndex.new()
    retained.addPrims([
      { primPath: '/A/DevCrowd', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_DevCrowd', bindingName, HdRetainedTypedSampledDataSource.new('/A/Rig')) },
      { primPath: '/A/Rig', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_Rig') },
      { primPath: '/B/DevCrowd', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_DevCrowd', bindingName, HdRetainedTypedSampledDataSource.new('/B/Rig')) },
      { primPath: '/B/Rig', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_Rig') },
    ])
    const si = UsdImaging_NiInstanceAggregationSceneIndex.new(retained, /*forNativePrototype=*/ false, [bindingName])
    expect(_CountInstancers(si, '__Proto_DevCrowd')).toBe(1)
  })

  /** .cpp:114-160. Case 2 Sub-path: siblingRef points to a child of the
   *  sibling Rig native instance (e.g. /A/Rig/skeleton). */
  it('TestChildOfSiblingNativeInstance', () => {
    const bindingName = 'siblingRef'
    const retained = HdRetainedSceneIndex.new()
    retained.addPrims([
      { primPath: '/A/DevCrowd', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_DevCrowd', bindingName, HdRetainedTypedSampledDataSource.new('/A/Rig/skeleton')) },
      { primPath: '/A/Rig', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_Rig') },
      { primPath: '/A/Rig/skeleton', primType: '', dataSource: _Empty() },
      { primPath: '/B/DevCrowd', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_DevCrowd', bindingName, HdRetainedTypedSampledDataSource.new('/B/Rig/skeleton')) },
      { primPath: '/B/Rig', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_Rig') },
      { primPath: '/B/Rig/skeleton', primType: '', dataSource: _Empty() },
    ])
    const si = UsdImaging_NiInstanceAggregationSceneIndex.new(retained, false, [bindingName])
    expect(_CountInstancers(si, '__Proto_DevCrowd')).toBe(1)
  })

  /** .cpp:162-202. Case 1 Ni: Rig's modelRef points to its parent, which is
   *  a native instance. */
  it('TestAncestorNativeInstance', () => {
    const bindingName = 'modelRef'
    const retained = HdRetainedSceneIndex.new()
    retained.addPrims([
      { primPath: '/A', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_ParentModel') },
      { primPath: '/A/Rig', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_Rig', bindingName, HdRetainedTypedSampledDataSource.new('/A')) },
      { primPath: '/B', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_ParentModel') },
      { primPath: '/B/Rig', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_Rig', bindingName, HdRetainedTypedSampledDataSource.new('/B')) },
    ])
    const si = UsdImaging_NiInstanceAggregationSceneIndex.new(retained, false, [bindingName])
    expect(_CountInstancers(si, '__Proto_Rig')).toBe(1)
  })

  /** .cpp:204-245. Negative case: two DevCrowd instances reference siblings
   *  with DIFFERENT prototype names -> 2 separate instancers. */
  it('TestDifferentSiblingPrototypes', () => {
    const bindingName = 'siblingRef'
    const retained = HdRetainedSceneIndex.new()
    retained.addPrims([
      { primPath: '/A/DevCrowd', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_DevCrowd', bindingName, HdRetainedTypedSampledDataSource.new('/A/RigTypeA')) },
      { primPath: '/A/RigTypeA', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_RigA') },
      { primPath: '/B/DevCrowd', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_DevCrowd', bindingName, HdRetainedTypedSampledDataSource.new('/B/RigTypeB')) },
      { primPath: '/B/RigTypeB', primType: '', dataSource: _MakeInstancePrimSource('/__Proto_RigB') },
    ])
    const si = UsdImaging_NiInstanceAggregationSceneIndex.new(retained, false, [bindingName])
    expect(_CountInstancers(si, '__Proto_DevCrowd')).toBe(2)
  })
})
