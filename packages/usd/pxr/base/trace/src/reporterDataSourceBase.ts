// Ported from OpenUSD 26.11.1: pxr/base/trace/reporterDataSourceBase.cpp,
//  pxr/base/trace/reporterDataSourceBase.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/reporterDataSourceBase.h:27-55.
import { Collection } from './collection.ts'

export abstract class TraceReporterDataSourceBase {
  abstract consumeData(): Collection[]
  abstract clear(): void
}
