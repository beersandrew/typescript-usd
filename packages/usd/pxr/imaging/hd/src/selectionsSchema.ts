// Ported from OpenUSD 26.11.1: pxr/imaging/hd/selectionsSchema.cpp,
//  pxr/imaging/hd/selectionsSchema.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/selectionsSchema.{h,cpp}.

import { HdContainerDataSource, HdVectorDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdSelectionSchema } from './selectionSchema.ts'

export class HdSelectionsSchema {
  constructor(private readonly _vector?: HdVectorDataSource) {}
  isDefined(): boolean { return this._vector !== undefined }
  getNumElements(): number { return this._vector?.getNumElements() ?? 0 }
  getElement(index: number): HdSelectionSchema {
    const value = this._vector?.getElement(index)
    return new HdSelectionSchema(value instanceof HdContainerDataSource ? value : undefined)
  }
  static getFromParent(parent?: HdContainerDataSource): HdSelectionsSchema {
    const value = parent?.Get(this.getSchemaToken())
    return new HdSelectionsSchema(value instanceof HdVectorDataSource ? value : undefined)
  }
  static getSchemaToken(): string { return 'selections' }
  static getDefaultLocator(): HdDataSourceLocator {
    return new HdDataSourceLocator(this.getSchemaToken())
  }
}
