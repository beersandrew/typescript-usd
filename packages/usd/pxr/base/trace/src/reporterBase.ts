// Ported from OpenUSD 26.11.1: pxr/base/trace/reporterBase.cpp,
//  pxr/base/trace/reporterBase.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/reporterBase.h:35.
import { Collection } from './collection.ts'
import { TraceReporterDataSourceBase } from './reporterDataSourceBase.ts'
import { TraceSerialization } from './serialization.ts'

export abstract class TraceReporterBase {
  readonly #processedCollections: Collection[] = []
  constructor(private readonly dataSource: TraceReporterDataSourceBase) {}

  serializeProcessedCollections(): string {
    return JSON.stringify(this.#processedCollections.map(collection =>
      TraceSerialization.write(collection)))
  }

  protected _Clear(): void {
    this.dataSource.clear()
    this.#processedCollections.length = 0
  }

  protected _update(): void {
    for (const collection of this.dataSource.consumeData()) {
      this.#processedCollections.push(collection)
      this._processCollection(collection)
    }
  }

  protected abstract _processCollection(collection: Collection): void
}
