// Ported from OpenUSD 26.11.1: pxr/imaging/hd/selectionSchema.cpp,
//  pxr/imaging/hd/selectionSchema.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/selectionSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import {
  HdBoolDataSource, HdContainerDataSource, HdDataSourceBase, HdVectorDataSource,
} from './dataSource.ts'
import { HdSchema, _HdBuildRetained } from './schema.ts'

export const HdSelectionSchemaTokens = TfMakeTokens({
  fullySelected: 'fullySelected',
  nestedInstanceIndices: 'nestedInstanceIndices',
})

export class HdSelectionSchema extends HdSchema {
  static Builder = class {
    _fullySelected: HdDataSourceBase | undefined
    _nestedInstanceIndices: HdDataSourceBase | undefined
    setFullySelected(value?: HdDataSourceBase): this {
      this._fullySelected = value
      return this
    }
    setNestedInstanceIndices(value?: HdDataSourceBase): this {
      this._nestedInstanceIndices = value
      return this
    }
    build(): HdContainerDataSource {
      return HdSelectionSchema.buildRetained(
        this._fullySelected, this._nestedInstanceIndices)
    }
  }
  // The typed data source is checked by kind (schema.ts header): the
  // retained bool the selection scene index builds
  // (HdRetainedTypedSampledDataSource<bool>) is not an HdBoolDataSource
  // subclass here.
  getFullySelected(): HdBoolDataSource | undefined {
    return this._getTypedDataSource<HdBoolDataSource>(HdSelectionSchemaTokens.fullySelected)
  }
  getNestedInstanceIndices(): HdVectorDataSource | undefined {
    return this._getVectorDataSource(HdSelectionSchemaTokens.nestedInstanceIndices)
  }
  static buildRetained(
    fullySelected?: HdDataSourceBase,
    nestedInstanceIndices?: HdDataSourceBase,
  ): HdContainerDataSource {
    return _HdBuildRetained({ fullySelected, nestedInstanceIndices })
  }
}
