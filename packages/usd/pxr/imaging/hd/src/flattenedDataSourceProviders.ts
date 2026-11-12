// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/flattenedDataSourceProviders.cpp,
//  pxr/imaging/hd/flattenedDataSourceProviders.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/flattenedDataSourceProviders.{h,cpp}
// (OpenUSD 26.11.1).

import { HdCoordSysBindingSchema } from './coordSysBindingSchema.ts'
import { HdRetainedContainerDataSource, type HdContainerDataSource } from './dataSource.ts'
import { HdMakeDataSourceContainingFlattenedDataSourceProvider } from './flattenedDataSourceProvider.ts'
import { HdFlattenedOverlayDataSourceProvider } from './flattenedOverlayDataSourceProvider.ts'
import { HdFlattenedPrimvarsDataSourceProvider } from './flattenedPrimvarsDataSourceProvider.ts'
import { HdFlattenedPurposeDataSourceProvider } from './flattenedPurposeDataSourceProvider.ts'
import { HdFlattenedVisibilityDataSourceProvider } from './flattenedVisibilityDataSourceProvider.ts'
import { HdFlattenedXformDataSourceProvider } from './flattenedXformDataSourceProvider.ts'
import { HdPrimvarsSchema } from './primvarsSchema.ts'
import { HdPurposeSchema } from './purposeSchema.ts'
import { HdVisibilitySchema } from './visibilitySchema.ts'
import { HdXformSchema } from './xformSchema.ts'

let _result: HdContainerDataSource | undefined

/** flattenedDataSourceProviders.cpp:21-44: the data source providers for the
 *  flattening scene index (coordSysBinding, primvars, purpose, visibility,
 *  xform). */
export function HdFlattenedDataSourceProviders(): HdContainerDataSource {
  const Make = HdMakeDataSourceContainingFlattenedDataSourceProvider.Make
  return _result ??= HdRetainedContainerDataSource.new(
    [
      HdCoordSysBindingSchema.getSchemaToken(),
      HdPrimvarsSchema.getSchemaToken(),
      HdPurposeSchema.getSchemaToken(),
      HdVisibilitySchema.getSchemaToken(),
      HdXformSchema.getSchemaToken(),
    ],
    [
      Make(HdFlattenedOverlayDataSourceProvider),
      Make(HdFlattenedPrimvarsDataSourceProvider),
      Make(HdFlattenedPurposeDataSourceProvider),
      Make(HdFlattenedVisibilityDataSourceProvider),
      Make(HdFlattenedXformDataSourceProvider),
    ])
}
