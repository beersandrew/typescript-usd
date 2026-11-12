// Ported from OpenUSD 26.11.1: pxr/imaging/hd/volumeFieldBindingSchema.cpp,
//  pxr/imaging/hd/volumeFieldBindingSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/volumeFieldBindingSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the VolumeFieldBinding entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream volumeFieldBindingSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdDataSourceBase, HdRetainedContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdPathDataSource } from './dataSourceTypeDefs.ts'
import { HdSchema } from './schema.ts'

/** volumeFieldBindingSchema.h TF_DECLARE_PUBLIC_TOKENS(HdVolumeFieldBindingSchemaTokens) */
export const HdVolumeFieldBindingSchemaTokens = TfMakeTokens({
  volumeFieldBinding: 'volumeFieldBinding',
})

export class HdVolumeFieldBindingSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** volumeFieldBindingSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdVolumeFieldBindingSchema {
    const ds = fromParentContainer?.Get(HdVolumeFieldBindingSchemaTokens.volumeFieldBinding)
    return new HdVolumeFieldBindingSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getVolumeFieldBindingNames(): TfToken[] {
    return (this._container?.getNames() ?? []) as TfToken[]
  }

  getVolumeFieldBinding(name: string): HdPathDataSource | undefined {
    return this._getTypedDataSource<HdPathDataSource>(name)
  }

  static getSchemaToken(): TfToken {
    return HdVolumeFieldBindingSchemaTokens.volumeFieldBinding
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdVolumeFieldBindingSchema._defaultLocator ??= new HdDataSourceLocator(HdVolumeFieldBindingSchema.getSchemaToken())
  }

  /** schemaClass.cpp:115-124 (the count argument is implied by the
   * array lengths, as in HdRetainedContainerDataSource.New of this port). */
  static buildRetained(
    names: readonly string[], values: readonly HdDataSourceBase[],
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new([...names], [...values])
  }
}
