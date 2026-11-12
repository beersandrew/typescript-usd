// Ported from OpenUSD 26.11.1: pxr/exec/vdf/poolChainIndexer.cpp,
//  pxr/exec/vdf/poolChainIndexer.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/poolChainIndexer.h and
// poolChainIndexer.cpp.
//
// Indexes the pool outputs of a network such that outputs further
// downstream in the pool chain have higher indices. With parallel movers the
// pool outputs form a tree (poolChainIndexer.cpp:39-69); child branches get
// no relative order guarantee, only that they come after the branching
// output and before the parallel mover.

import { TF_VERIFY } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import { VdfDynamicTopologicalSorter } from './dynamicTopologicalSorter.ts'
import { VdfOutput } from './output.ts'
import { VdfPoolChainIndex, Vdf_IsPoolOutput } from './poolChainIndex.ts'

type _PoolOutputSorter = VdfDynamicTopologicalSorter<VdfOutput>

// _PoolConnectedOutputs (poolChainIndexer.cpp:71-97).
interface _PoolConnectedOutputs {
  source: VdfOutput | null
  target: VdfOutput | null
}

// _MakePoolConnectedOutput (poolChainIndexer.cpp:99-126): the (source, target)
// pool outputs if the connection leaves a pool output and the target node
// has a pool output.
function _MakePoolConnectedOutput(connection: VdfConnection): _PoolConnectedOutputs {
  const source = connection.getSourceOutput()
  if (!Vdf_IsPoolOutput(source)) {
    return { source: null, target: null }
  }

  const targetNode = connection.getTargetInput().getNode()
  for (const [, output] of targetNode.getOutputsIterator()) {
    if (Vdf_IsPoolOutput(output)) {
      return { source, target: output }
    }
  }

  return { source: null, target: null }
}

export class VdfPoolChainIndexer {
  // _sorter (poolChainIndexer.h:85-86).
  private readonly _sorter: _PoolOutputSorter = new VdfDynamicTopologicalSorter<VdfOutput>()

  /** GetIndex (poolChainIndexer.cpp:21-36). */
  getIndex(output: VdfOutput): VdfPoolChainIndex {
    const priority = this._sorter.getPriority(output)
    if (priority !== VdfDynamicTopologicalSorter.InvalidPriority) {
      return new VdfPoolChainIndex(priority, 0)
    }

    // GetIndex should only be called for a pool output.
    if (!TF_VERIFY(Vdf_IsPoolOutput(output), 'Vdf_IsPoolOutput(output)')) {
      return new VdfPoolChainIndex(VdfDynamicTopologicalSorter.InvalidPriority, 0)
    }

    const outputIndex = VdfOutput.getIndexFromId(output.getId())
    return new VdfPoolChainIndex(VdfDynamicTopologicalSorter.LastPriority, outputIndex)
  }

  /** Insert (poolChainIndexer.cpp:128-148): non-pool connections are ignored. */
  insert(connection: VdfConnection): void {
    const poolOutputs = _MakePoolConnectedOutput(connection)
    if (!poolOutputs.source || !poolOutputs.target) return
    this._sorter.addEdge(poolOutputs.source, poolOutputs.target)
  }

  /** Remove (poolChainIndexer.cpp:150-162): non-pool connections are ignored. */
  remove(connection: VdfConnection): void {
    const poolOutputs = _MakePoolConnectedOutput(connection)
    if (!poolOutputs.source || !poolOutputs.target) return
    this._sorter.removeEdge(poolOutputs.source, poolOutputs.target)
  }

  /** Clear (poolChainIndexer.cpp:164-170). */
  clear(): void {
    this._sorter.clear()
  }
}
