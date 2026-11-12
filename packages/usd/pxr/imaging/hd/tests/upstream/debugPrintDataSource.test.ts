// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dataSource.cpp,
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp
// Copyright 2021, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdDebugPrintDataSource (pxr/imaging/hd/dataSource.cpp:113-145) value
// formatting, checked against lines of OpenUSD 26.11.1's
// pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents/
// baseline/basic.txt, which that test produces with HdDebugPrintDataSource
// (cleaned with _CleanOutputForDiff, testUsdImagingStageSceneIndexContents.cpp:
// 57-112). Each data source below holds the C++ value type that produced the
// cited baseline line (basic.usda declares the authored types).

import { describe, expect, it } from 'vitest'
import { Matrix4d as GfMatrix4d, Vec3f as GfVec3f } from 'typescript-usd/gf'
import { Value as VtValue, ValueTypes as VtValueTypes, Array as VtArray, Dictionary as VtDictionary } from 'typescript-usd/vt'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { ResolverContext as ArResolverContext } from 'typescript-usd/ar'
import {
  HdDebugPrintDataSource,
  HdRetainedContainerDataSource,
  HdRetainedTypedSampledDataSource,
  HdRetainedSmallVectorDataSource,
  type HdDataSourceBase,
} from '../../src/dataSource.ts'
import { HdRetainedSampledDataSource } from '../../src/retainedDataSource.ts'
import { HdPrimOriginSchema } from '../../src/primOriginSchema.ts'

/** _CleanOutputForDiff, testUsdImagingStageSceneIndexContents.cpp:57-112 */
function _CleanOutputForDiff(inputStr: string): string {
  const isAddressChar = (ch: string) => /[0-9a-fA-Fx]/.test(ch)
  let outputStr = ''
  let numPtrDigits = 0
  let mode: 'DEFAULT' | 'FOUND_0' | 'FOUND_AT' | 'PTR' = 'DEFAULT'
  for (const ch of inputStr) {
    switch (mode) {
      case 'DEFAULT':
        if (ch === '0') mode = 'FOUND_0'
        else if (ch === '@') mode = 'FOUND_AT'
        outputStr += ch
        break
      case 'FOUND_0':
        mode = ch === 'x' ? 'PTR' : 'DEFAULT'
        outputStr += ch
        break
      case 'FOUND_AT':
        mode = ch === ' ' ? 'PTR' : 'DEFAULT'
        outputStr += ch
        break
      case 'PTR':
        if (isAddressChar(ch)) {
          outputStr += 'X'
          numPtrDigits++
        } else {
          outputStr += 'X'.repeat(16 - numPtrDigits) + ch
          numPtrDigits = 0
          mode = 'DEFAULT'
        }
        break
    }
  }
  return outputStr
}

function _C(entries: [string, HdDataSourceBase][]) {
  return HdRetainedContainerDataSource.new(entries.map(e => e[0]), entries.map(e => e[1]))
}
const _T = <T>(v: T) => HdRetainedTypedSampledDataSource.new(v)

describe('HdDebugPrintDataSource value formatting (basic.txt)', () => {
  it('prints values as std::ostream << VtValue does', () => {
    const ds = _C([
      // basic.txt:12-15
      ['system', _C([['assetResolution', _C([['resolverContext', _T(new ArResolverContext())]])]])],
      // basic.txt:118-120 (VtIntArray)
      ['faceVertexCounts', _T(new VtArray<number>([4], VtValueTypes.int))],
      // basic.txt:122 (VtIntArray)
      ['faceVertexIndices', _T(new VtArray<number>([0, 1, 3, 2], VtValueTypes.int))],
      // basic.txt:273-275 (float inputs:input = 1.2)
      ['value', HdRetainedSampledDataSource.new(VtValue.create(1.2, VtValueTypes.float))],
      // basic.txt:413-414 (float3 xformOp:scale)
      ['scale', _T(new GfVec3f(0.5, 0.5, 0.5))],
      // basic.txt:421-422 (GfMatrix4d)
      ['matrix', _T(new GfMatrix4d(0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, -0.1, -0.1, 0, 1))],
      // basic.txt:491-492
      ['scenePath', _T(new HdPrimOriginSchema.OriginPath('.'))],
      // basic.txt:228-233
      ['glslfx:sourceAsset', _T(new SdfAssetPath('shader1.glslfx'))],
      ['sdrMetadata', _T(new VtDictionary())],
      // basic.txt:160-161 (bool)
      ['isLoaded', _T(true)],
      // basic.txt:225-226 (empty TfToken)
      ['nodeIdentifier', _T('')],
      // basic.txt:150-157 (vector data source)
      ['preview', HdRetainedSmallVectorDataSource.new([_C([['materialPath', _T('/Materials/MyMaterial')]])])],
    ])
    expect(_CleanOutputForDiff(HdDebugPrintDataSource(ds, 1))).toBe([
      '\t[faceVertexCounts]',
      '\t\t[4]',
      '\t[faceVertexIndices]',
      '\t\t[0, 1, 3, 2]',
      '\t[glslfx:sourceAsset]',
      '\t\t@shader1.glslfx@',
      '\t[isLoaded]',
      '\t\t1',
      '\t[matrix]',
      '\t\t( (0.5, 0, 0, 0), (0, 0.5, 0, 0), (0, 0, 0.5, 0), (-0.1, -0.1, 0, 1) )',
      '\t[nodeIdentifier]',
      '\t\t',
      '\t[preview]',
      '\t\t[0]',
      '\t\t\t[materialPath]',
      '\t\t\t\t/Materials/MyMaterial',
      '\t[scale]',
      '\t\t(0.5, 0.5, 0.5)',
      '\t[scenePath]',
      '\t\tHdPrimOriginSchema::OriginPath(.)',
      '\t[sdrMetadata]',
      '\t\t{}',
      '\t[system]',
      '\t\t[assetResolution]',
      '\t\t\t[resolverContext]',
      "\t\t\t\t<'ArResolverContext' @ XXXXXXXXXXXXXXXX>",
      '\t[value]',
      '\t\t1.2',
      '',
    ].join('\n'))
  })
})
