// Ported from OpenUSD 26.11.1: pxr/exec/ef/testenv/testEfLeafNodeCache.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/testenv/testEfLeafNodeCache.cpp
//
// main() runs testLeafNodeNetworkEdits(100000) once with a concurrency limit
// of 1 and once with the maximum concurrency; each run is an it(). Without
// threads both runs take WorkParallelForN's serial path (loops.h:171-191).
// TF_VERIFY(cond) becomes expect(cond).toBe(true). The trace collection and
// report of main() are not ported (they only print timings).

import { describe, expect, it } from 'vitest'
import { TfRegistryManager, Token as TfToken } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  WorkParallelForN,
  WorkSetConcurrencyLimit,
  WorkSetMaximumConcurrencyLimit,
} from 'typescript-usd/work'

import { VdfInputSpecs, VdfOutputSpecs } from 'typescript-usd/vdf'
import type { VdfConnection } from 'typescript-usd/vdf'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfExecutionTypeRegistry } from 'typescript-usd/vdf'
import { VdfMask } from 'typescript-usd/vdf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfMaskedOutputVector } from 'typescript-usd/vdf'
import { VdfNetwork, VdfNetwork_EditMonitor } from 'typescript-usd/vdf'
import { VdfNode } from 'typescript-usd/vdf'
import { EfLeafNode, EfLeafTokens } from '../../src/leafNode.ts'
import { EfLeafNodeCache } from '../../src/leafNodeCache.ts'
import { Std_Bernoulli, Std_mt19937, Std_UniformInt } from '../stdRandom.ts'

// TF_DEFINE_PRIVATE_TOKENS(_tokens, (input) (output)) (testEfLeafNodeCache.cpp:26-31).
const _tokens = {
  input: TfToken('input'),
  output: TfToken('output'),
}

// TF_REGISTRY_FUNCTION(VdfExecutionTypeRegistry) (testEfLeafNodeCache.cpp:33-36).
TfRegistryManager.add('VdfExecutionTypeRegistry', () => {
  VdfExecutionTypeRegistry.define(VtValueTypes.int, 0)
})

function TF_VERIFY(cond: boolean): void {
  expect(cond).toBe(true)
}

// testEfLeafNodeCache.cpp:40-51.
class _Node extends VdfNode {
  constructor(network: VdfNetwork) {
    super(network,
      new VdfInputSpecs().readConnector(VtValueTypes.int, _tokens.input),
      new VdfOutputSpecs().connector(VtValueTypes.int, _tokens.output))
  }

  override compute(_context: VdfContext): void {}
}

// The network monitor keeps the EfLeafNodeCache updated, mirroring how the
// cache is expected to be used in the system (testEfLeafNodeCache.cpp:53-83).
class _LeafNodeMonitor extends VdfNetwork_EditMonitor {
  private readonly _leafNodeCache = new EfLeafNodeCache()

  Get(): EfLeafNodeCache {
    return this._leafNodeCache
  }

  willClear(): void {
    this._leafNodeCache.clear()
  }

  didConnect(connection: VdfConnection): void {
    this._leafNodeCache.didConnect(connection)
  }

  didAddNode(_node: VdfNode): void {}

  willDelete(nodeOrConnection: VdfNode | VdfConnection): void {
    if (!(nodeOrConnection instanceof VdfNode)) {
      this._leafNodeCache.willDeleteConnection(nodeOrConnection)
    }
  }
}

// testEfLeafNodeCache.cpp:87-118.
function _BuildNetworkAndConnect(
  network: VdfNetwork,
  rootNodes: VdfNode[],
  leafNodes: EfLeafNode[],
): void {
  TF_VERIFY(rootNodes.length === leafNodes.length)

  WorkParallelForN(rootNodes.length, (b, e) => {
    for (let i = b; i !== e; ++i) {
      const root = new _Node(network)
      const middle = new _Node(network)
      network.connect(
        root.GetOutput(), middle,
        _tokens.input, VdfMask.allOnes(1))

      const leaf = new EfLeafNode(network, VtValueTypes.int)
      network.connect(
        middle.GetOutput(), leaf,
        EfLeafTokens.in, VdfMask.allOnes(1))

      rootNodes[i] = root
      leafNodes[i] = leaf
    }
  })
}

// testEfLeafNodeCache.cpp:120-147.
function _DisconnectSomeLeafNodes(
  network: VdfNetwork,
  leafNodes: readonly EfLeafNode[],
): number {
  let numDisconnected = 0

  WorkParallelForN(leafNodes.length, (b, e) => {
    const rng = new Std_mt19937(0)
    rng.discard(b)

    for (let i = b; i !== e; ++i) {
      if (Std_Bernoulli(rng)) {
        const connection =
          leafNodes[i]!.getInput(EfLeafTokens.in)!.getNonConstConnection(0)
        network.disconnect(connection)
        ++numDisconnected
      }
    }
  })

  return numDisconnected
}

// testEfLeafNodeCache.cpp:149-179.
function _ReconnectDanglingLeafNodes(
  network: VdfNetwork,
  rootNodes: readonly VdfNode[],
  leafNodes: readonly EfLeafNode[],
): void {
  WorkParallelForN(leafNodes.length, (b, e) => {
    const rng = new Std_mt19937(0)
    rng.discard(b)

    for (let i = b; i !== e; ++i) {
      if (leafNodes[i]!.hasInputConnections()) {
        continue
      }

      const rootNode = rootNodes[Std_UniformInt(rng, 0, rootNodes.length - 1)]!
      const connection = rootNode.GetOutput()!.getConnections()[0]!
      const middleNode = connection.getTargetNode()

      network.connect(
        middleNode.GetOutput(), leafNodes[i]!,
        EfLeafTokens.in, VdfMask.allOnes(1))
    }
  })
}

// testEfLeafNodeCache.cpp:181-275.
function testLeafNodeNetworkEdits(numNodes: number): void {
  const leafNodeMonitor = new _LeafNodeMonitor()

  const network = new VdfNetwork()
  network.registerEditMonitor(leafNodeMonitor)

  const rootNodes: VdfNode[] = new Array(numNodes)
  const leafNodes: EfLeafNode[] = new Array(numNodes)

  TF_VERIFY(leafNodeMonitor.Get().getVersion() === 0)

  _BuildNetworkAndConnect(network, rootNodes, leafNodes)
  TF_VERIFY(leafNodeMonitor.Get().getVersion() !== 0)

  // Build a "request" of outputs to use for querying the cache
  const rootOutputs: VdfMaskedOutputVector = []
  for (let i = 0; i < numNodes; ++i) {
    rootOutputs.push(new VdfMaskedOutput(
      rootNodes[i]!.GetOutput(), VdfMask.allOnes(1)))
  }

  // Find all the connected leaf nodes, and verify that every newly created
  // leaf node appears in this set
  {
    const result = leafNodeMonitor.Get().findNodes(rootOutputs, true)
    TF_VERIFY(result.length === numNodes)

    const resultSet = new Set<VdfNode>(result)
    TF_VERIFY(resultSet.size === numNodes)
    for (let i = 0; i < numNodes; ++i) {
      TF_VERIFY(resultSet.has(leafNodes[i]!))
    }
  }

  // Find all the source outputs, and verify that every source output
  // connected to a newly created leaf node appears in this set
  {
    const result = leafNodeMonitor.Get().findOutputs(rootOutputs, true)
    TF_VERIFY(result.size === numNodes)

    for (let i = 0; i < numNodes; ++i) {
      const connection = leafNodes[i]!.getInput(EfLeafTokens.in)!.Get(0)
      const it = result.get(connection.getSourceOutput())
      TF_VERIFY(it !== undefined && it.Equals(VdfMask.allOnes(1)))
    }
  }

  // Randomly disconnect some leaf nodes
  let version = leafNodeMonitor.Get().getVersion()
  const numDisconnected = _DisconnectSomeLeafNodes(network, leafNodes)
  TF_VERIFY(leafNodeMonitor.Get().getVersion() !== version)

  // Find all the connected leaf nodes
  {
    const result = leafNodeMonitor.Get().findNodes(rootOutputs, true)
    TF_VERIFY(result.length === numNodes - numDisconnected)
  }

  // Find all the source outputs
  {
    const result = leafNodeMonitor.Get().findOutputs(rootOutputs, true)
    TF_VERIFY(result.size === numNodes - numDisconnected)
  }

  // Reconnect dangling leaf nodes to other random nodes
  version = leafNodeMonitor.Get().getVersion()
  _ReconnectDanglingLeafNodes(network, rootNodes, leafNodes)
  TF_VERIFY(leafNodeMonitor.Get().getVersion() !== version)

  // Find all the connected leaf nodes
  {
    const result = leafNodeMonitor.Get().findNodes(rootOutputs, true)
    TF_VERIFY(result.length === numNodes)
  }

  network.clear()
  network.unregisterEditMonitor(leafNodeMonitor)
}

describe('testEfLeafNodeCache', () => {
  const numNodes = 100000

  it('testLeafNodeNetworkEdits (single threaded)', () => {
    // Make sure the threading test cases work single threaded.
    WorkSetConcurrencyLimit(1)

    testLeafNodeNetworkEdits(numNodes)
  }, 120_000)

  it('testLeafNodeNetworkEdits (maximum concurrency)', () => {
    WorkSetMaximumConcurrencyLimit()

    testLeafNodeNetworkEdits(numNodes)
  }, 120_000)
})
