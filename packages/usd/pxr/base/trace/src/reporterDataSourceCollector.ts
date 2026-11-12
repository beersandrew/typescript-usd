// Ported from OpenUSD 26.11.1: pxr/base/trace/reporterDataSourceCollector.cpp,
//  pxr/base/trace/reporterDataSourceCollector.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/reporterDataSourceCollector.h:34.
import { Collection } from './collection.ts'
import { Collector } from './collector.ts'
import { TraceReporterDataSourceBase } from './reporterDataSourceBase.ts'

export class TraceReporterDataSourceCollector extends TraceReporterDataSourceBase {
  constructor(readonly collector = Collector.GetInstance()) { super() }
  static new(): TraceReporterDataSourceCollector {
    return new TraceReporterDataSourceCollector()
  }
  consumeData(): Collection[] {
    const collection = this.collector.createCollection()
    return collection.empty ? [] : [collection]
  }
  override clear(): void { this.collector.clear() }
}
