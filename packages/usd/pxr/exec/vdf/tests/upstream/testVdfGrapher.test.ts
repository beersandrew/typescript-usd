// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfGrapher.cpp,
//  pxr/exec/vdf/testenv/testVdfGrapher/normalizeDotFiles.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfGrapher.cpp
//
// The registered test (pxr/exec/vdf/CMakeLists.txt:457-471) runs the
// program in testenv/testVdfGrapher, normalizes test.dot with
// normalizeDotFiles.py and DIFF_COMPAREs test.out, traverse.out and seven
// .dot files with testenv/testVdfGrapher/baseline (copied verbatim to
// tests/fixtures/testVdfGrapher/baseline). Here the program runs in a fresh
// temporary directory; main() is the first it() and each DIFF_COMPARE is an
// it() of its own.
//
// graph[name] is graph.Get(name), `a >> b.In(...)` is a.ShiftRight(b.In(...))
// and `*graph[name]` is graph.Get(name).GetVdfNode() (VdfTestUtils port).
// `.Out<int>(name)` is `.Out(VtValueTypes.int, name)`.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { TfStringStartsWith, Token as TfToken } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import type { VdfContext } from '../../src/context.ts'
import { VdfGrapher } from '../../src/grapher.ts'
import { VdfGrapherOptions } from '../../src/grapherOptions.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import { VdfTraverseTopologicalSourceNodes } from '../../src/networkUtil.ts'
import type { VdfNode } from '../../src/node.ts'
import { VdfRequest } from '../../src/request.ts'
import { VdfSchedule } from '../../src/schedule.ts'
import { VdfScheduler } from '../../src/scheduler.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'
import { _NormalizeDotFile } from '../../../execUsd/tests/testHelpers.ts'

const intType = VtValueTypes.int

// TF_DEFINE_PRIVATE_TOKENS (testVdfGrapher.cpp:25-33).
const _tokens = {
  axis: TfToken('axis'),
  moves: TfToken('moves'),
  out: TfToken('out'),
  out1: TfToken('out1'),
  out2: TfToken('out2'),
}

// testVdfGrapher.cpp:35-38
function CallbackFunction(_context: VdfContext): void {
}

// testVdfGrapher.cpp:40-103
function BuildTestNetwork(graph: VdfTestUtils.Network, schedule: VdfSchedule): VdfNode {
  const bigMask = VdfMask.allOnes(100)
  const littleMask = new VdfMask(2)
  littleMask.setIndex(1)

  // We're going to build a network like this:
  //
  //          GN1  GN2
  //          |\   /|
  //          | MON |
  //          | / \ |
  //          TN1  TN2
  //           \   /
  //            TN3
  //

  const generatorType = new VdfTestUtils.CallbackNodeType(CallbackFunction)
  generatorType
    .out(intType, _tokens.out)

  const multipleOutputType = new VdfTestUtils.CallbackNodeType(CallbackFunction)
  multipleOutputType
    .Read(intType, _tokens.axis)
    .Read(intType, _tokens.moves)
    .out(intType, _tokens.out1)
    .out(intType, _tokens.out2)

  const translateType = new VdfTestUtils.CallbackNodeType(CallbackFunction)
  translateType
    .Read(intType, _tokens.axis)
    .readWrite(intType, _tokens.moves, _tokens.out)

  graph.add('gn1', generatorType)
  graph.add('gn2', generatorType)
  graph.add('mon', multipleOutputType)
  graph.add('tn1', translateType)
  graph.add('tn2', translateType)
  graph.add('tn3', translateType)

  graph.Get('gn1').shiftRight(graph.Get('mon').in(_tokens.axis, littleMask))
  graph.Get('gn1').shiftRight(graph.Get('tn1').in(_tokens.axis, littleMask))

  graph.Get('gn2').shiftRight(graph.Get('mon').in(_tokens.moves, bigMask))
  graph.Get('gn2').shiftRight(graph.Get('tn2').in(_tokens.moves, bigMask))

  graph.Get('mon').Output(_tokens.out1).shiftRight(
    graph.Get('tn1').in(_tokens.moves, littleMask))
  graph.Get('mon').Output(_tokens.out2).shiftRight(
    graph.Get('tn2').in(_tokens.axis, littleMask))

  graph.Get('tn1').shiftRight(graph.Get('tn3').in(_tokens.axis, bigMask))
  graph.Get('tn2').shiftRight(graph.Get('tn3').in(_tokens.moves, bigMask))

  const request = new VdfRequest(
    new VdfMaskedOutput(graph.Get('tn3').getVdfNode().GetOutput()!, bigMask))
  VdfScheduler.schedule(request, schedule, true /* topologicalSort */)

  return graph.Get('tn3').getVdfNode()
}

// Build a linear chain of 64 nodes with an exponential number of paths
// to ensure we don't time out when graphing a large neighborhood
// (testVdfGrapher.cpp:105-162).
function BuildLinearNetwork(graph: VdfTestUtils.Network, _schedule: VdfSchedule): VdfNode {
  const bigMask = VdfMask.allOnes(100)

  // We're going to build a network like this:
  //
  //          GN1
  //          | |
  //          MO0
  //          | |
  //          MO1
  //          | |
  //          MO2
  //          | |
  //          ...
  //          MO63
  //
  // There are 2^64 paths from GN1 to MO63.
  //

  const depth = 64

  const generatorType = new VdfTestUtils.CallbackNodeType(CallbackFunction)
  generatorType
    .out(intType, _tokens.out)

  const multipleOutputType = new VdfTestUtils.CallbackNodeType(CallbackFunction)
  multipleOutputType
    .Read(intType, _tokens.axis)
    .Read(intType, _tokens.moves)
    .out(intType, _tokens.out1)
    .out(intType, _tokens.out2)

  graph.add('gn', generatorType)

  for (let i = 0; i < depth; ++i) {
    graph.add(`mo${i}`, multipleOutputType)
  }

  graph.Get('gn').shiftRight(graph.Get('mo0').in(_tokens.axis, bigMask))
  graph.Get('gn').shiftRight(graph.Get('mo0').in(_tokens.moves, bigMask))

  for (let i = 0; i < (depth - 1); ++i) {
    graph.Get(`mo${i}`).Output(_tokens.out1).shiftRight(
      graph.Get(`mo${i + 1}`).in(_tokens.axis, bigMask))
    graph.Get(`mo${i}`).Output(_tokens.out2).shiftRight(
      graph.Get(`mo${i + 1}`).in(_tokens.moves, bigMask))
  }

  return graph.Get(`mo${depth - 1}`).getVdfNode()
}

// testVdfGrapher.cpp:164-171. `os` is the std::ofstream's buffer.
function WriteToFile(node: VdfNode, os: string[]): boolean {
  os.push(node.getDebugName() + '\n')

  // Keep traversing.
  return true
}

// Test that graphing a large neighborhood doesn't take exponential time
// (testVdfGrapher.cpp:173-186).
function TestRuntime(directory: string): void {
  const graph = new VdfTestUtils.Network()
  const schedule = new VdfSchedule()
  const source = BuildLinearNetwork(graph, schedule)
  const net = graph.getNetwork()

  const opts = new VdfGrapherOptions()
  opts.setUniqueIds(false)
  opts.addNodeToGraph(source, /*maxInDepth*/64, /*maxOutDepth*/64)
  VdfGrapher.graphToFile(net, join(directory, 'linear_chain.dot'), opts)
}

// testVdfGrapher.cpp:188-267
function main(directory: string): number {
  // Build a test network.
  const testNetwork = new VdfTestUtils.Network()
  const schedule = new VdfSchedule()
  const source = BuildTestNetwork(testNetwork, schedule)
  const net = testNetwork.getNetwork()

  {
    const options = new VdfGrapherOptions()
    options.setUniqueIds(false) // so that tests don't have node addresses.

    // Test graphing the entire netowrk.
    VdfGrapher.graphToFile(net, join(directory, 'test.dot'))

    // Test graphing the entire network, this time without unique ids.
    VdfGrapher.graphToFile(net, join(directory, 'network.dot'), options)

    // Test graphing a subset of the network.
    options.addNodeToGraph(testNetwork.Get('tn2').getVdfNode(), 1, 0)
    options.setDrawMasks(true)
    VdfGrapher.graphToFile(net, join(directory, 'subset.dot'), options)
  }

  // Test graphing a subset of the network where the graphed neighborhood of
  // the first node includes the second node.  We need to check that the
  // second node's neighborhood is fully expanded.
  {
    const opts = new VdfGrapherOptions()
    opts.setUniqueIds(false)
    opts.addNodeToGraph(testNetwork.Get('tn2').getVdfNode(), 1, 0)
    opts.addNodeToGraph(testNetwork.Get('mon').getVdfNode(), 1, 0)
    VdfGrapher.graphToFile(net, join(directory, 'overlapping_subsets.dot'), opts)
  }

  // Now we will test the various display styles
  {
    const opts = new VdfGrapherOptions()
    opts.setUniqueIds(false) // so that tests don't have node addresses.

    for (let i = 0; i < net.getNodeCapacity(); i++) {
      const node = net.getNode(i)

      if (!node) {
        continue
      }

      const color =
        TfStringStartsWith(node.getDebugName(), 'Gen') ? 'red' : 'blue'
      opts.setColor(node, color)
    }

    // Full (the default)
    opts.setDisplayStyle(VdfGrapherOptions.DisplayStyleFull)
    VdfGrapher.graphToFile(net, join(directory, 'displayFull.dot'), opts)

    // NoLabels
    opts.setDisplayStyle(VdfGrapherOptions.DisplayStyleNoLabels)
    VdfGrapher.graphToFile(net, join(directory, 'displayNoLabels.dot'), opts)

    // Summary
    opts.setDisplayStyle(VdfGrapherOptions.DisplayStyleSummary)
    VdfGrapher.graphToFile(net, join(directory, 'displaySummary.dot'), opts)
  }

  // Test the traversal API on network.
  const out: string[] = []
  VdfTraverseTopologicalSourceNodes(
    source, (node: VdfNode) => WriteToFile(node, out))
  writeFileSync(join(directory, 'traverse.out'), out.join(''))

  // Cover code by calling the dot command method.
  const dotCommand = VdfGrapher.getDotCommand('test.dot')
  void dotCommand

  // Check for exponential runtime for a large neighborhood.
  TestRuntime(directory)

  return 0
}

describe('testVdfGrapher', () => {
  const directory = mkdtempSync(join(tmpdir(), 'testVdfGrapher-'))

  // EXPECTED_RETURN_CODE 0
  it('main', () => {
    expect(main(directory)).toBe(0)
  })

  // POST_COMMAND normalizeDotFiles.py test.dot (the same script as
  // execUsd's, byte for byte: testHelpers.ts _NormalizeDotFile).
  it('DIFF_COMPARE test.out', () => {
    writeFileSync(join(directory, 'test.out'),
      _NormalizeDotFile(readFileSync(join(directory, 'test.dot'), 'utf8')))
    expect(readFileSync(join(directory, 'test.out'), 'utf8')).toBe(readFileSync(
      new URL('../fixtures/testVdfGrapher/baseline/test.out', import.meta.url), 'utf8'))
  })

  for (const name of [
    'traverse.out',
    'network.dot',
    'subset.dot',
    'overlapping_subsets.dot',
    'displayFull.dot',
    'displayNoLabels.dot',
    'displaySummary.dot',
    'linear_chain.dot',
  ]) {
    it(`DIFF_COMPARE ${name}`, () => {
      expect(readFileSync(join(directory, name), 'utf8')).toBe(readFileSync(
        new URL(`../fixtures/testVdfGrapher/baseline/${name}`, import.meta.url), 'utf8'))
    })
  }
})
