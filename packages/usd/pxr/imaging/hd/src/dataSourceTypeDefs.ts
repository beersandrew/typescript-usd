// Ported from OpenUSD 26.11.1: pxr/imaging/hd/dataSourceTypeDefs.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/dataSourceTypeDefs.h (OpenUSD 26.11.1).
//
// Upstream declares these as `using HdXDataSource = HdTypedSampledDataSource<T>`.
// In this port they are type-only aliases: a TypeScript type parameter does not
// exist at run time, so schema getters (schema.ts _GetTypedDataSource) can only
// check that a child is an HdSampledDataSource, not that it holds a T.
//
// Value types follow the conventions of this port: VtArray<int>/<float>/<double>
// and arrays of tokens/paths/strings/bools are plain JS arrays (see
// meshTopology.ts), TfToken/SdfPath/std::string are strings, and Gf values are
// the typescript-usd/gf classes. Arrays of Gf values are VtArray<Gf...>.
//
// The names that dataSource.ts declared first as abstract classes with a
// compatible shape (HdIntDataSource, HdBoolDataSource, HdTokenDataSource, ...)
// are re-exported from there so both spellings are the same type.

import type {
  Matrix3f as GfMatrix3f, Matrix4d as GfMatrix4d, Matrix4f as GfMatrix4f,
  Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3h as GfVec3h, Vec3i as GfVec3i,
  Vec4d as GfVec4d, Vec4f as GfVec4f, Vec4i as GfVec4i,
  Quatf as GfQuatf, BBox3d as GfBBox3d,
} from 'typescript-usd/gf'
import type { Array as VtArray } from 'typescript-usd/vt'
import type { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import type { SdfPathExpression } from 'typescript-usd/sdf/pathExpression'
import type { ResolverContext as ArResolverContext } from 'typescript-usd/ar'
import type { HdTypedSampledDataSource } from './dataSource.ts'
import type { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdFormat, HdTupleType } from './types.ts'

export type {
  HdIntDataSource,
  HdFloatDataSource,
  HdDoubleDataSource,
  HdBoolDataSource,
  HdTokenDataSource,
  HdPathDataSource,
  HdStringDataSource,
  HdIntArrayDataSource,
  HdFloatArrayDataSource,
  HdTokenArrayDataSource,
  HdPathArrayDataSource,
} from './dataSource.ts'

// dataSourceTypeDefs.h:33-76
export type HdSizetDataSource = HdTypedSampledDataSource<number>
export type HdDoubleArrayDataSource = HdTypedSampledDataSource<number[]>
export type HdBoolArrayDataSource = HdTypedSampledDataSource<boolean[]>
export type HdStringArrayDataSource = HdTypedSampledDataSource<string[]>
export type HdAssetPathDataSource = HdTypedSampledDataSource<SdfAssetPath>
export type HdPathExpressionDataSource = HdTypedSampledDataSource<SdfPathExpression>

// dataSourceTypeDefs.h:79-116
export type HdVec2iDataSource = HdTypedSampledDataSource<GfVec2i>
export type HdVec2iArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec2i>>
export type HdVec2fDataSource = HdTypedSampledDataSource<GfVec2f>
export type HdVec2dDataSource = HdTypedSampledDataSource<GfVec2d>
export type HdVec2fArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec2f>>
export type HdVec2dArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec2d>>
export type HdVec3iDataSource = HdTypedSampledDataSource<GfVec3i>
export type HdVec3iArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec3i>>
export type HdVec3hArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec3h>>
export type HdVec3fDataSource = HdTypedSampledDataSource<GfVec3f>
export type HdVec3fArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec3f>>
export type HdVec3dDataSource = HdTypedSampledDataSource<GfVec3d>
export type HdVec3dArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec3d>>
export type HdVec4iDataSource = HdTypedSampledDataSource<GfVec4i>
export type HdVec4iArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec4i>>
export type HdVec4fDataSource = HdTypedSampledDataSource<GfVec4f>
export type HdVec4fArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec4f>>
export type HdVec4dDataSource = HdTypedSampledDataSource<GfVec4d>
export type HdVec4dArrayDataSource = HdTypedSampledDataSource<VtArray<GfVec4d>>

// dataSourceTypeDefs.h:118-143
export type HdQuatfArrayDataSource = HdTypedSampledDataSource<VtArray<GfQuatf>>
export type HdMatrix3fDataSource = HdTypedSampledDataSource<GfMatrix3f>
export type HdMatrix3fArrayDataSource = HdTypedSampledDataSource<VtArray<GfMatrix3f>>
export type HdMatrix4fDataSource = HdTypedSampledDataSource<GfMatrix4f>
export type HdMatrix4fArrayDataSource = HdTypedSampledDataSource<VtArray<GfMatrix4f>>
export type HdMatrixDataSource = HdTypedSampledDataSource<GfMatrix4d>
export type HdMatrixArrayDataSource = HdTypedSampledDataSource<VtArray<GfMatrix4d>>
export type HdBBox3dDataSource = HdTypedSampledDataSource<GfBBox3d>
export type HdBBox3dArrayDataSource = HdTypedSampledDataSource<VtArray<GfBBox3d>>
export type HdLocatorDataSource = HdTypedSampledDataSource<HdDataSourceLocator>
export type HdFormatDataSource = HdTypedSampledDataSource<HdFormat>
export type HdTupleTypeDataSource = HdTypedSampledDataSource<HdTupleType>
export type HdResolverContextDataSource = HdTypedSampledDataSource<ArResolverContext>
