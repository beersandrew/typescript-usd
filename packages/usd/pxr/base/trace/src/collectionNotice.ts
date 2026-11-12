// Ported from OpenUSD 26.11.1: pxr/base/trace/collectionNotice.cpp,
//  pxr/base/trace/collectionNotice.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11 pxr/base/trace/collectionNotice.h:20-46: a
// TfNotice sent when the TraceCollector creates a TraceCollection.
import { Notice as TfNotice } from 'typescript-usd/tf'
import { Collection } from './collection.ts'

export class TraceCollectionAvailable extends TfNotice {
  constructor(readonly collection: Collection) { super() }
  getCollection(): Collection { return this.collection }
}
