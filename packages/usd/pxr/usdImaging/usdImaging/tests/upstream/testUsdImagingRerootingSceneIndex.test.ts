// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingRerootingSceneIndex.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingRerootingSceneIndex.cpp
// (OpenUSD 26.11.1), registered in pxr/usdImaging/usdImaging/CMakeLists.txt:402-404
// (no baseline; the test asserts the values below, which are copied from the
// upstream test source).
import { describe, expect, it } from 'vitest'
import {
  ContainerDataSource as HdContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSceneIndex as HdRetainedSceneIndex,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SampledDataSource as HdSampledDataSource,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { UsdImagingRerootingSceneIndex } from '../../src/rerootingSceneIndex.ts'

/** testUsdImagingRerootingSceneIndex.cpp:34-39 (SdfPath operator< on prim paths). */
function _Sorted(v: string[]): string[] {
  const elements = (p: string) => p === '/' ? [] : p.slice(1).split('/')
  return [...v].sort((a, b) => {
    const ea = elements(a), eb = elements(b)
    for (let i = 0; i < Math.min(ea.length, eb.length); i++) {
      if (ea[i] !== eb[i]) return ea[i]! < eb[i]! ? -1 : 1
    }
    return ea.length - eb.length
  })
}

/** testUsdImagingRerootingSceneIndex.cpp:114-140 */
function _GetTypedValueFromScene(sceneIndex: HdSceneIndexBase, primPath: string, name: string): unknown {
  const prim = sceneIndex.getPrim(primPath)
  const ds = prim.dataSource instanceof HdContainerDataSource ? prim.dataSource.Get(name) : undefined
  return ds instanceof HdSampledDataSource ? ds.GetValue(0) : undefined
}

describe('testUsdImagingRerootingSceneIndex', () => {
  /** testUsdImagingRerootingSceneIndex.cpp:145-275 TestRerootingSceneIndex */
  it('TestRerootingSceneIndex', () => {
    // /A/foo
    // /path/B/bar
    // /path/B/X/baz
    const sceneIndex = HdRetainedSceneIndex.new()
    sceneIndex.addPrims([{ primPath: '/A', primType: 'huh', dataSource: undefined }])
    sceneIndex.addPrims([{ primPath: '/path', primType: 'huh', dataSource: undefined }])
    sceneIndex.addPrims([{ primPath: '/path/B', primType: 'huh', dataSource: undefined }])

    sceneIndex.addPrims([{
      primPath: '/A/foo', primType: 'huh',
      dataSource: HdRetainedContainerDataSource.new(
        ['pathToA', 'pathToB', 'pathArray', 'relPathToB'],
        [
          HdRetainedTypedSampledDataSource.new('/A'),
          HdRetainedTypedSampledDataSource.new('/path/B'),
          HdRetainedTypedSampledDataSource.new(['/A', '/path/B']),
          HdRetainedTypedSampledDataSource.new('../../path/B'),
        ]),
    }])

    const rerootAToB = UsdImagingRerootingSceneIndex.new(sceneIndex, '/A', '/path/B')
    const rerootAToRoot = UsdImagingRerootingSceneIndex.new(sceneIndex, '/A', '/')
    const prefixViaReroot = UsdImagingRerootingSceneIndex.new(sceneIndex, '/', '/Some/Prefix')

    // Make sure that we replace everything at toPath.  This means /B/bar will
    // be gone.  Also, the fromPath (/A) is removed.
    // TESTING TO_PATH REPLACED
    expect(_Sorted(rerootAToB.getChildPrimPaths('/path/B'))).toEqual(_Sorted(['/path/B/foo']))
    // TESTING ALL OTHER PATHS REMOVED
    expect(_Sorted(rerootAToB.getChildPrimPaths('/'))).toEqual(_Sorted(['/path']))

    // The instancing code is relying on this behavior for material
    // bindings (which target prims outside of the "src").
    // COMPARING PATH TO NON REROOTED
    expect(_GetTypedValueFromScene(rerootAToB, '/path/B/foo', 'pathToB')).toBe('/path/B')
    // COMPARING PATH ARRAY
    expect(_GetTypedValueFromScene(rerootAToB, '/path/B/foo', 'pathArray')).toEqual(['/path/B', '/path/B'])

    // Make sure that if we move to /, it replaces everything
    // TESTING MOVING TO /
    expect(_Sorted(rerootAToRoot.getChildPrimPaths('/'))).toEqual(_Sorted(['/foo']))

    // Make sure that this can work as a prefixer
    // TESTING USING AS PREFIX (children of /)
    expect(_Sorted(prefixViaReroot.getChildPrimPaths('/'))).toEqual(_Sorted(['/Some']))
    // TESTING USING AS PREFIX (children of /Some)  (upstream queries '/' here too)
    expect(_Sorted(prefixViaReroot.getChildPrimPaths('/'))).toEqual(_Sorted(['/Some']))
    // TESTING USING AS PREFIX (children of /Some/Prefix)
    expect(_Sorted(prefixViaReroot.getChildPrimPaths('/Some/Prefix')))
      .toEqual(_Sorted(['/Some/Prefix/A', '/Some/Prefix/path']))
  })
})
