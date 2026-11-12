// Ported from OpenUSD 26.11.1: pxr/base/trace/aggregateTreeBuilder.cpp,
//  pxr/base/trace/aggregateTreeBuilder.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/trace/aggregateTreeBuilder.h:27.
import { AggregateTree } from './aggregateTree.ts'
import { Collection } from './collection.ts'

export class Trace_AggregateTreeBuilder {
  build(collection: Collection): AggregateTree {
    const result = new AggregateTree()
    result.add(collection)
    return result
  }
}
