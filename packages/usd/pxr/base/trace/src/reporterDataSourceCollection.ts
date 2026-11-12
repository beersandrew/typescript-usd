// Ported from OpenUSD 26.11.1:
//  pxr/base/trace/reporterDataSourceCollection.cpp,
//  pxr/base/trace/reporterDataSourceCollection.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/reporterDataSourceCollection.h:28.
import { Collection } from './collection.ts'
import { TraceReporterDataSourceBase } from './reporterDataSourceBase.ts'

export class TraceReporterDataSourceCollection extends TraceReporterDataSourceBase {
  private collections: Collection[]
  constructor(collections: Collection | Collection[]) {
    super()
    this.collections = Array.isArray(collections) ? [...collections] : [collections]
  }
  static new(collections: Collection | Collection[]): TraceReporterDataSourceCollection {
    return new TraceReporterDataSourceCollection(collections)
  }
  consumeData(): Collection[] {
    const result = this.collections
    this.collections = []
    return result
  }
  override clear(): void { this.collections = [] }
}
