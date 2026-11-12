// Ported from OpenUSD 26.11.1: pxr/exec/ef/testenv/testEfDependencyCache.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/ef/testenv/testEfDependencyCache.cpp
//
// main() calls testBasic with updateIncrementally false and true, then the
// threading tests with a concurrency limit of 1 and with the maximum
// concurrency; each call is an it(). Without threads every run takes
// WorkParallelForN's serial path (loops.h:171-191). TF_AXIOM(cond) and
// ASSERT_EQ become expect(); TF_FATAL_ERROR on a missing node or output
// becomes a failed expectation. The printed progress messages and the trace
// report of main() are not ported.

import { describe, expect, it } from 'vitest'
import { Token as TfToken } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  WorkParallelForN,
  WorkSetConcurrencyLimit,
  WorkSetMaximumConcurrencyLimit,
} from 'typescript-usd/work'

import type { VdfConnection } from 'typescript-usd/vdf'
import { VdfMask } from 'typescript-usd/vdf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfMaskedOutputVector } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'
import { VdfTestUtils } from 'typescript-usd/vdf'
import type { VdfOutputToMaskMap } from 'typescript-usd/vdf'
import { EfDependencyCache } from '../../src/dependencyCache.ts'
import { Std_mt19937, Std_Shuffle, Std_UniformInt } from '../stdRandom.ts'

// TF_DEFINE_PRIVATE_TOKENS(_tokens, (input) (output)) (testEfDependencyCache.cpp:22-27).
const _tokens = {
  input: TfToken('input'),
  output: TfToken('output'),
}

function TF_AXIOM(cond: boolean): void {
  expect(cond).toBe(true)
}

// graph[lhs] >> graph[rhs].In(name, mask) (vdf/testUtils.h:337-355).
function _Connect(
  graph: VdfTestUtils.Network,
  source: string,
  target: string,
  inputName: TfToken,
  mask: VdfMask,
): void {
  graph.Get(source).shiftRight(graph.Get(target).in(inputName, mask))
}

// Build a network of "mover" nodes connected in a chain, one "source" node
// for each mover that provides an input, and one "sink" node for each mover
// that pulls on its output (testEfDependencyCache.cpp:29-106).
function _BuildNetwork(
  graph: VdfTestUtils.Network,
  numNodes: number,
  sourceNodes: VdfNode[] | null = null,
  moverNodes: VdfNode[] | null = null,
  sinkNodes: VdfNode[] | null = null,
  sourceConnections: (VdfConnection | null)[] | null = null,
  sinkConnections: (VdfConnection | null)[] | null = null,
): void {
  const moverType = new VdfTestUtils.CallbackNodeType(() => {})
  moverType
    .Read(VtValueTypes.int, _tokens.input)
    .out(VtValueTypes.int, _tokens.output)

  const sourceType = new VdfTestUtils.CallbackNodeType(() => {})
  sourceType
    .out(VtValueTypes.int, _tokens.output)

  const sinkType = new VdfTestUtils.CallbackNodeType(() => {})
  sinkType
    .Read(VtValueTypes.int, _tokens.input)
    .out(VtValueTypes.int, _tokens.output)

  const oneOneMask = VdfMask.allOnes(1)

  for (let i = 0; i < numNodes; ++i) {
    const sourceName = `source${i}`
    graph.add(sourceName, sourceType)
    if (sourceNodes) {
      sourceNodes.push(graph.Get(sourceName).getVdfNode()!)
    }

    const moverName = `mover${i}`
    graph.add(moverName, moverType)
    if (moverNodes) {
      moverNodes.push(graph.Get(moverName).getVdfNode()!)
    }

    const sinkName = `sink${i}`
    graph.add(sinkName, sinkType)
    if (sinkNodes) {
      sinkNodes.push(graph.Get(sinkName).getVdfNode()!)
    }

    // Connect the source node to the mover node.
    _Connect(graph, sourceName, moverName, _tokens.input, oneOneMask)

    if (sourceConnections) {
      const connection = graph.getConnection(
        `${sourceName}:output -> ${moverName}:input`)
      TF_AXIOM(!!connection)
      sourceConnections.push(connection!)
    }

    // Connect the movers in a chain.
    if (i > 0) {
      _Connect(graph, `mover${i - 1}`, moverName, _tokens.input, oneOneMask)
    }

    // Connect the mover node to the sink node.
    _Connect(graph, moverName, sinkName, _tokens.input, oneOneMask)

    if (sinkConnections) {
      const connection = graph.getConnection(
        `${moverName}:output -> ${sinkName}:input`)
      TF_AXIOM(!!connection)
      sinkConnections.push(connection!)
    }
  }
}

// testEfDependencyCache.cpp:120-142.
function _VerifyExpectedNodes(
  resultNodes: readonly VdfNode[],
  expectedNodes: readonly string[],
): void {
  expect(resultNodes.length).toBe(expectedNodes.length)
  for (const expectedNode of expectedNodes) {
    let found = false
    for (const resultNode of resultNodes) {
      if (resultNode.getDebugName() === expectedNode) {
        found = true
        break
      }
    }

    expect(found, `Failed to find expected node ${expectedNode}`).toBe(true)
  }
}

// testEfDependencyCache.cpp:144-166.
function _VerifyExpectedOutputs(
  resultOutputsMap: VdfOutputToMaskMap,
  expectedOutputs: readonly string[],
): void {
  expect(resultOutputsMap.size).toBe(expectedOutputs.length)
  for (const expectedOutput of expectedOutputs) {
    let found = false
    for (const [output] of resultOutputsMap) {
      if (output.getDebugName() === expectedOutput) {
        found = true
        break
      }
    }

    expect(found, `Failed to find expected output ${expectedOutput}`).toBe(true)
  }
}

// testEfDependencyCache.cpp:168-190.
function _FindSinkNodes(
  node: VdfNode,
  outputDeps: VdfOutputToMaskMap,
  nodeDeps: VdfNode[],
): boolean {
  const foundSink = node.getDebugName().includes('sink')
  if (foundSink) {
    nodeDeps.push(node)

    const input = node.getInput(_tokens.input)
    expect(!!input).toBe(true)
    if (input) {
      const connection = input.getConnections()[0]!
      // std::unordered_map::emplace does not replace an existing entry.
      if (!outputDeps.has(connection.getSourceOutput())) {
        outputDeps.set(connection.getSourceOutput(), connection.GetMask())
      }
    }
    return false
  }
  return true
}

// std::unordered_map<const VdfOutput *, VdfMask> operator==.
function _OutputsMapEquals(lhs: VdfOutputToMaskMap, rhs: VdfOutputToMaskMap): boolean {
  if (lhs.size !== rhs.size) {
    return false
  }
  for (const [output, mask] of lhs) {
    const rhsMask = rhs.get(output)
    if (rhsMask === undefined || !rhsMask.Equals(mask)) {
      return false
    }
  }
  return true
}

// std::vector<const VdfNode *> operator==.
function _NodesEqual(lhs: readonly VdfNode[], rhs: readonly VdfNode[]): boolean {
  return lhs.length === rhs.length && lhs.every((node, i) => node === rhs[i])
}

// testEfDependencyCache.cpp:192-326.
function testBasic(updateIncrementally: boolean): void {
  // Create the network
  const graph = new VdfTestUtils.Network()
  const sourceNodes: VdfNode[] = []
  const moverNodes: VdfNode[] = []
  const sinkNodes: VdfNode[] = []
  _BuildNetwork(graph, 4, sourceNodes, moverNodes, sinkNodes)
  const network = graph.getNetwork()

  const cache = new EfDependencyCache(_FindSinkNodes)

  const oneOneMask = VdfMask.allOnes(1)

  // These expected results are used for the initial and final state of the
  // network.
  const expectedNodes: readonly (readonly string[])[] = [
    ['VdfTestUtils::DependencyCallbackNode sink0',
      'VdfTestUtils::DependencyCallbackNode sink1',
      'VdfTestUtils::DependencyCallbackNode sink2',
      'VdfTestUtils::DependencyCallbackNode sink3'],
    ['VdfTestUtils::DependencyCallbackNode sink1',
      'VdfTestUtils::DependencyCallbackNode sink2',
      'VdfTestUtils::DependencyCallbackNode sink3'],
    ['VdfTestUtils::DependencyCallbackNode sink2',
      'VdfTestUtils::DependencyCallbackNode sink3'],
    ['VdfTestUtils::DependencyCallbackNode sink3']]
  const expectedOutputs: readonly (readonly string[])[] = [
    ['VdfTestUtils::DependencyCallbackNode mover0[output]',
      'VdfTestUtils::DependencyCallbackNode mover1[output]',
      'VdfTestUtils::DependencyCallbackNode mover2[output]',
      'VdfTestUtils::DependencyCallbackNode mover3[output]'],
    ['VdfTestUtils::DependencyCallbackNode mover1[output]',
      'VdfTestUtils::DependencyCallbackNode mover2[output]',
      'VdfTestUtils::DependencyCallbackNode mover3[output]'],
    ['VdfTestUtils::DependencyCallbackNode mover2[output]',
      'VdfTestUtils::DependencyCallbackNode mover3[output]'],
    ['VdfTestUtils::DependencyCallbackNode mover3[output]']]

  TF_AXIOM(sourceNodes.length === expectedNodes.length)

  {
    // Test network traversals
    for (let i = 0; i < sourceNodes.length; ++i) {
      const node = sourceNodes[i]!
      const outputs: VdfMaskedOutputVector = []
      outputs.push(new VdfMaskedOutput(node.GetOutput(), oneOneMask))

      const resultNodes = cache.findNodes(outputs, updateIncrementally)
      const resultOutputsMap = cache.findOutputs(outputs, updateIncrementally)

      _VerifyExpectedNodes(resultNodes, expectedNodes[i]!)
      _VerifyExpectedOutputs(resultOutputsMap, expectedOutputs[i]!)
    }
  }

  const connectionToDeleteAndReAdd = 'mover0:output -> sink0:input'

  {
    // Test network traversals after deleting a connection.
    const connection = graph.getConnection(connectionToDeleteAndReAdd)
    TF_AXIOM(!!connection)
    cache.willDeleteConnection(connection!)
    network.disconnect(connection!)

    const expectedNodes: readonly (readonly string[])[] = [
      ['VdfTestUtils::DependencyCallbackNode sink1',
        'VdfTestUtils::DependencyCallbackNode sink2',
        'VdfTestUtils::DependencyCallbackNode sink3'],
      ['VdfTestUtils::DependencyCallbackNode sink1',
        'VdfTestUtils::DependencyCallbackNode sink2',
        'VdfTestUtils::DependencyCallbackNode sink3'],
      ['VdfTestUtils::DependencyCallbackNode sink2',
        'VdfTestUtils::DependencyCallbackNode sink3'],
      ['VdfTestUtils::DependencyCallbackNode sink3']]
    const expectedOutputs: readonly (readonly string[])[] = [
      ['VdfTestUtils::DependencyCallbackNode mover1[output]',
        'VdfTestUtils::DependencyCallbackNode mover2[output]',
        'VdfTestUtils::DependencyCallbackNode mover3[output]'],
      ['VdfTestUtils::DependencyCallbackNode mover1[output]',
        'VdfTestUtils::DependencyCallbackNode mover2[output]',
        'VdfTestUtils::DependencyCallbackNode mover3[output]'],
      ['VdfTestUtils::DependencyCallbackNode mover2[output]',
        'VdfTestUtils::DependencyCallbackNode mover3[output]'],
      ['VdfTestUtils::DependencyCallbackNode mover3[output]']]

    for (let i = 0; i < sourceNodes.length; ++i) {
      const node = sourceNodes[i]!
      const outputs: VdfMaskedOutputVector = [
        new VdfMaskedOutput(node.GetOutput(), oneOneMask)]

      const resultNodes = cache.findNodes(outputs, updateIncrementally)
      const resultOutputsMap = cache.findOutputs(outputs, updateIncrementally)

      _VerifyExpectedNodes(resultNodes, expectedNodes[i]!)
      _VerifyExpectedOutputs(resultOutputsMap, expectedOutputs[i]!)
    }
  }

  {
    // Test network traversals after creating a connection.

    // Re-create the connection we deleted
    _Connect(graph, 'mover0', 'sink0', _tokens.input, oneOneMask)
    const connection = graph.getConnection(connectionToDeleteAndReAdd)
    TF_AXIOM(!!connection)
    cache.didConnect(connection!)

    for (let i = 0; i < sourceNodes.length; ++i) {
      const node = sourceNodes[i]!
      const outputs: VdfMaskedOutputVector = []
      outputs.push(new VdfMaskedOutput(node.GetOutput(), oneOneMask))

      const resultNodes = cache.findNodes(outputs, updateIncrementally)
      const resultOutputsMap = cache.findOutputs(outputs, updateIncrementally)

      _VerifyExpectedNodes(resultNodes, expectedNodes[i]!)
      _VerifyExpectedOutputs(resultOutputsMap, expectedOutputs[i]!)
    }
  }
}

// Performs multiple queries on the given cache, using a fixed number of
// randomly chosen outputs in each request. Verifies that the query results
// match those from a freshly computed cache (testEfDependencyCache.cpp:328-385).
function _QueryCache(
  updateIncrementally: boolean,
  numQueries: number,
  numNodes: number,
  sourceNodes: readonly VdfNode[],
  cache: EfDependencyCache,
): void {
  let numNodesFound = 0
  let numOutputsFound = 0

  for (let i = 0; i < numQueries; ++i) {
    const rng = new Std_mt19937(i)

    const outputs: VdfMaskedOutputVector = []
    const requestSize = 10
    for (let j = 0; j < requestSize; ++j) {
      const sourceI = Std_UniformInt(rng, 0, numNodes - 1)

      const node = sourceNodes[sourceI]!
      outputs.push(new VdfMaskedOutput(node.GetOutput(), VdfMask.allOnes(1)))
    }

    const resultNodes = cache.findNodes(outputs, updateIncrementally)
    const resultOutputsMap = cache.findOutputs(outputs, updateIncrementally)

    // Re-compute the query results using a fresh cache.
    const referenceCache = new EfDependencyCache(_FindSinkNodes)
    const referenceNodes =
      referenceCache.findNodes(outputs, /* updateIncrementally */ false)
    const referenceOutputsMap =
      referenceCache.findOutputs(outputs, /* updateIncrementally */ false)

    // Make sure the traversal query results match.
    const resultNodeSet = new Set(resultNodes)
    TF_AXIOM(_NodesEqual(resultNodes, referenceNodes))
    TF_AXIOM(_OutputsMapEquals(resultOutputsMap, referenceOutputsMap))

    numNodesFound += resultNodeSet.size
    numOutputsFound += resultOutputsMap.size
  }

  // As a hedge against a test case that leaves us with empty query results,
  // make sure *some* traversals found some non-empty results.
  TF_AXIOM(numNodesFound > 0)
  TF_AXIOM(numOutputsFound > 0)
}

// testEfDependencyCache.cpp:387-480.
function testThreadingDeleteConnections(updateIncrementally: boolean): void {
  const numNodes = 1000

  const graph = new VdfTestUtils.Network()
  const sourceNodes: VdfNode[] = []
  // Sized numNodes with null entries, then appended to by _BuildNetwork, as
  // upstream's std::vector(numNodes) and push_back do: the shuffled indices
  // below also select some of the null entries, which are skipped.
  const sourceConnections: (VdfConnection | null)[] =
    new Array<VdfConnection | null>(numNodes).fill(null)
  const sinkConnections: (VdfConnection | null)[] =
    new Array<VdfConnection | null>(numNodes).fill(null)
  {
    // Build network
    _BuildNetwork(
      graph,
      numNodes,
      sourceNodes,
      /* moverNodes */ null,
      /* sinkNodes */ null,
      sourceConnections,
      sinkConnections)
  }
  const network = graph.getNetwork()

  const cache = new EfDependencyCache(_FindSinkNodes)
  const numQueries = 100
  {
    // Query network
    _QueryCache(updateIncrementally, numQueries, numNodes, sourceNodes, cache)
  }

  {
    // Delete connections
    const rng = new Std_mt19937(0)

    // Connections are doled out such that no two deleted connections share
    // a common input or output.
    const sourceConnectionIndices = Array.from(
      { length: sourceConnections.length }, (_, i) => i)
    Std_Shuffle(sourceConnectionIndices, rng)

    const sinkConnectionIndices = Array.from(
      { length: sinkConnections.length }, (_, i) => i)
    Std_Shuffle(sinkConnectionIndices, rng)

    WorkParallelForN(numNodes, (b, e) => {
      const rng = new Std_mt19937(0)
      rng.discard(b)

      // 0 : delete source-to-mover connection
      // 1 : delete mover-to-sink connection
      for (let i = b; i !== e; ++i) {
        const connection =
          Std_UniformInt(rng, 0, 1) === 0
            ? sourceConnections[sourceConnectionIndices[i]!]
            : sinkConnections[sinkConnectionIndices[i]!]
        if (connection) {
          cache.willDeleteConnection(connection)
          network.disconnect(connection)
        }
      }
    })
  }

  {
    // Query network after deleting connections
    const cache = new EfDependencyCache(_FindSinkNodes)
    _QueryCache(updateIncrementally, numQueries, numNodes, sourceNodes, cache)
  }
}

// testEfDependencyCache.cpp:482-571.
function testThreadingCreateConnections(updateIncrementally: boolean): void {
  const numNodes = 1000

  const graph = new VdfTestUtils.Network()
  const sourceNodes: VdfNode[] = []
  const moverNodes: VdfNode[] = []
  const sinkNodes: VdfNode[] = []
  {
    // Build network
    _BuildNetwork(graph, numNodes, sourceNodes, moverNodes, sinkNodes)
  }
  const network = graph.getNetwork()

  const numQueries = 100
  const cache = new EfDependencyCache(_FindSinkNodes)
  {
    // Query network
    _QueryCache(updateIncrementally, numQueries, numNodes, sourceNodes, cache)
  }

  {
    // Create connections, such that no two created connections share a
    // common input.
    const rng = new Std_mt19937(0)

    const moverIndices = Array.from({ length: numNodes }, (_, i) => i)
    Std_Shuffle(moverIndices, rng)

    const sinkIndices = Array.from({ length: numNodes }, (_, i) => i)
    Std_Shuffle(sinkIndices, rng)

    WorkParallelForN(numNodes, (b, e) => {
      const rng = new Std_mt19937(0)
      rng.discard(b)

      // 0 : create source-to-mover connection
      // 1 : create mover-to-sink connection
      for (let i = b; i !== e; ++i) {
        let fromNode: VdfNode
        let toNode: VdfNode

        if (Std_UniformInt(rng, 0, 1) === 0) {
          fromNode = sourceNodes[Std_UniformInt(rng, 0, numNodes - 1)]!
          toNode = moverNodes[moverIndices[i]!]!
        } else {
          fromNode = moverNodes[Std_UniformInt(rng, 0, numNodes - 1)]!
          toNode = sinkNodes[sinkIndices[i]!]!
        }

        const connection = network.connect(
          fromNode.GetOutput(),
          toNode, _tokens.input,
          VdfMask.allOnes(1))
        TF_AXIOM(!!connection)
        cache.didConnect(connection!)
      }
    })
  }

  {
    // Query network after creating connections
    const cache = new EfDependencyCache(_FindSinkNodes)
    _QueryCache(updateIncrementally, numQueries, numNodes, sourceNodes, cache)
  }
}

describe('testEfDependencyCache', () => {
  it('testBasic (updateIncrementally = false)', () => {
    testBasic(/* updateIncrementally */ false)
  })

  it('testBasic (updateIncrementally = true)', () => {
    testBasic(/* updateIncrementally */ true)
  })

  describe('single threaded', () => {
    // Make sure the threading test cases work single threaded.
    const limit = () => WorkSetConcurrencyLimit(1)

    it('testThreadingDeleteConnections (updateIncrementally = false)', () => {
      limit()
      testThreadingDeleteConnections(/* updateIncrementally */ false)
    }, 120_000)

    it('testThreadingDeleteConnections (updateIncrementally = true)', () => {
      limit()
      testThreadingDeleteConnections(/* updateIncrementally */ true)
    }, 120_000)

    it('testThreadingCreateConnections (updateIncrementally = false)', () => {
      limit()
      testThreadingCreateConnections(/* updateIncrementally */ false)
    }, 120_000)

    it('testThreadingCreateConnections (updateIncrementally = true)', () => {
      limit()
      testThreadingCreateConnections(/* updateIncrementally */ true)
    }, 120_000)
  })

  describe('maximum concurrency', () => {
    const limit = () => WorkSetMaximumConcurrencyLimit()

    it('testThreadingDeleteConnections (updateIncrementally = false)', () => {
      limit()
      testThreadingDeleteConnections(/* updateIncrementally */ false)
    }, 120_000)

    it('testThreadingDeleteConnections (updateIncrementally = true)', () => {
      limit()
      testThreadingDeleteConnections(/* updateIncrementally */ true)
    }, 120_000)

    it('testThreadingCreateConnections (updateIncrementally = false)', () => {
      limit()
      testThreadingCreateConnections(/* updateIncrementally */ false)
    }, 120_000)

    it('testThreadingCreateConnections (updateIncrementally = true)', () => {
      limit()
      testThreadingCreateConnections(/* updateIncrementally */ true)
    }, 120_000)
  })
})
