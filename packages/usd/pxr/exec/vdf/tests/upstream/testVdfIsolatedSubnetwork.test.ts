// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfIsolatedSubnetwork.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfIsolatedSubnetwork.cpp
//
// Each upstream test function returns 1 on failure and TF_AXIOMs abort; here
// both become vitest expectations. Upstream's printf/std::cout progress output
// is dropped. std::unique_ptr<VdfIsolatedSubnetwork> destruction (scope exit
// and reassignment) is an explicit _Destruct() call at the same point.
// The program's working directory, where Snapshot writes its .dot files with
// VdfGrapher::GraphToFile, is a fresh temporary directory; the registered
// test (pxr/exec/vdf/CMakeLists.txt) compares none of them.

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { Vec3d as GfVec3d } from 'typescript-usd/gf'
import { TfErrorMark, Token as TfToken } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import type { VdfContext } from '../../src/context.ts'
import { VdfExecutionTypeRegistry } from '../../src/executionTypeRegistry.ts'
import { VdfGrapher } from '../../src/grapher.ts'
import { VdfGrapherOptions } from '../../src/grapherOptions.ts'
import { VdfIsolatedSubnetwork } from '../../src/isolatedSubnetwork.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import { VdfNetwork } from '../../src/network.ts'
import type { VdfNode } from '../../src/node.ts'
import { VdfRawValueAccessor } from '../../src/rawValueAccessor.ts'
import { VdfReadIterator } from '../../src/readIterator.ts'
import { VdfReadWriteIterator } from '../../src/readWriteIterator.ts'
import { VdfRequest } from '../../src/request.ts'
import { VdfSchedule } from '../../src/schedule.ts'
import { VdfScheduler } from '../../src/scheduler.ts'
import { VdfSimpleExecutor } from '../../src/simpleExecutor.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'
import { VdfTypedVector } from '../../src/typedVector.ts'

const GfVec3dType = VtValueTypes.GfVec3d

// The program's working directory (see the file header).
const _testDirectory = mkdtempSync(join(tmpdir(), 'testVdfIsolatedSubnetwork-'))
const doubleType = VtValueTypes.double

// testVdfIsolatedSubnetwork.cpp:31-40
const _tokens = {
  axis: TfToken('axis'),
  moves: TfToken('moves'),
  in: TfToken('in'),
  input1: TfToken('input1'),
  input2: TfToken('input2'),
  out: TfToken('out'),
}

// testVdfIsolatedSubnetwork.cpp:42-45
VdfExecutionTypeRegistry.define(GfVec3dType, new GfVec3d(0))

// testVdfIsolatedSubnetwork.cpp:47
const NUM_POINTS = 10

// testVdfIsolatedSubnetwork.cpp:49-67
function GeneratePoints(context: VdfContext): void {
  const size = NUM_POINTS
  const result = new VdfTypedVector<GfVec3d>(GfVec3dType)
  result.resize<GfVec3d>(GfVec3dType, size)

  const a = result.getReadWriteAccessor<GfVec3d>(GfVec3dType)
  for (let i = 0; i < size; ++i) {
    a.Set(i, new GfVec3d(0, 0, 0))
  }

  const rawValueAccessor = new VdfRawValueAccessor(context)
  rawValueAccessor.setOutputVector(
    new VdfTestUtils.OutputAccessor(context).GetOutput()!,
    VdfMask.allOnes(size),
    result)
}

// testVdfIsolatedSubnetwork.cpp:70-86
function TranslatePoints(context: VdfContext): void {
  // We only expect one value for the "axis" input -- so we use the
  // GetInputValue API, which is very simple.
  const axis = context.getInputValue<GfVec3d>(GfVec3dType, _tokens.axis)

  // We don't know how many inputs we will have for the "moves" input, so
  // we will use an iterator, that we'll also use to output our data into.
  const iter = new VdfReadWriteIterator<GfVec3d>(GfVec3dType, context, _tokens.moves)

  // Now loop over all of our inputs and translate the points.
  for (; !iter.isAtEnd(); iter.increment()) {
    // *iter += axis
    iter.derefAssign(iter.deref().add(axis))
  }
}

// testVdfIsolatedSubnetwork.cpp:88-120
function AddPoints(context: VdfContext): void {
  let numPoints = 0
  const it = new VdfReadIterator<GfVec3d>(GfVec3dType, context, _tokens.input1)
  for (; !it.isAtEnd(); it.increment()) {
    ++numPoints
  }

  const result = new VdfTypedVector<GfVec3d>(GfVec3dType)
  result.resize<GfVec3d>(GfVec3dType, numPoints)
  const a = result.getReadWriteAccessor<GfVec3d>(GfVec3dType)

  const iter = new VdfReadIterator<GfVec3d>(GfVec3dType, context, _tokens.input1)
  if (context.hasInputValue(_tokens.input2)) {
    const iter2 = new VdfReadIterator<GfVec3d>(GfVec3dType, context, _tokens.input2)

    let i = 0
    for (; !iter.isAtEnd(); iter.increment(), iter2.increment(), ++i) {
      a.Set(i, iter.deref().add(iter2.deref()))
    }
  } else {
    let i = 0
    for (; !iter.isAtEnd(); iter.increment(), ++i) {
      a.Set(i, iter.deref())
    }
  }

  const rawValueAccessor = new VdfRawValueAccessor(context)
  rawValueAccessor.setOutputVector(
    new VdfTestUtils.OutputAccessor(context).GetOutput()!,
    VdfMask.allOnes(numPoints),
    result)
}

// testVdfIsolatedSubnetwork.cpp:122-143
function MakeTranslateChain(
  graph: VdfTestUtils.Network,
  translateNode: VdfTestUtils.CallbackNodeType,
  first: string, axis: string,
  axisMask: VdfMask, num: number): string {
  const allOnes = VdfMask.allOnes(NUM_POINTS)

  let prev = first
  let current = ''
  for (let i = 0; i < num; ++i) {
    current = first + '_' + String(i)
    graph.add(current, translateNode)

    graph.Get(axis).shiftRight(graph.Get(current).in(_tokens.axis, axisMask))
    graph.Get(prev).shiftRight(graph.Get(current).in(_tokens.moves, allOnes))

    prev = current
  }
  return prev
}

// testVdfIsolatedSubnetwork.cpp:145-249
function BuildTestNetwork1(graph: VdfTestUtils.Network): VdfNode {
  // We're going to build a network like this:
  //
  //        Axis1 InputPoints1  Axis2  InputPoints2  Axis3  IP3  Axis4  IP4
  //           \   /               \   /              \      /     \     /
  //          Translate1       Translate2                T3           T4
  //              \                /                      \          /
  //                  AddPoints1                           AddPoints2
  //                        \                                 /
  //                                   AddPointsFinal

  graph.addInputVector(GfVec3dType, 'axisInputs', 4)
  graph.Get('axisInputs')
    .setValue(0, new GfVec3d(1, 0, 0))
    .setValue(1, new GfVec3d(0, 1, 0))
    .setValue(2, new GfVec3d(1, 0, 0))
    .setValue(3, new GfVec3d(0, 1, 0))

  const axis1Mask = new VdfMask(4)
  const axis2Mask = new VdfMask(4)
  const axis3Mask = new VdfMask(4)
  const axis4Mask = new VdfMask(4)
  axis1Mask.setIndex(0)
  axis2Mask.setIndex(1)
  axis3Mask.setIndex(2)
  axis4Mask.setIndex(3)

  const generatePoints = new VdfTestUtils.CallbackNodeType(GeneratePoints)
  generatePoints
    .out(GfVec3dType, _tokens.out)

  graph.add('inputPoints1', generatePoints)
  graph.add('inputPoints2', generatePoints)
  graph.add('inputPoints3', generatePoints)
  graph.add('inputPoints4', generatePoints)

  const translatePoints = new VdfTestUtils.CallbackNodeType(TranslatePoints)
  translatePoints
    .Read(GfVec3dType, _tokens.axis)
    .readWrite(GfVec3dType, _tokens.moves, _tokens.out)

  graph.add('Translate1', translatePoints)
  graph.add('Translate2', translatePoints)
  graph.add('Translate3', translatePoints)
  graph.add('Translate4', translatePoints)

  const addPoints = new VdfTestUtils.CallbackNodeType(AddPoints)

  addPoints
    .Read(GfVec3dType, _tokens.input1)
    .Read(GfVec3dType, _tokens.input2)
    .out(GfVec3dType, _tokens.out)

  graph.add('AddPoints1', addPoints)
  graph.add('AddPoints2', addPoints)
  graph.add('AddPointsFinal', addPoints)

  const allOnes = VdfMask.allOnes(NUM_POINTS)

  const numTranslates = 1

  graph.Get('axisInputs').shiftRight(graph.Get('Translate1').in(_tokens.axis, axis1Mask))
  graph.Get('inputPoints1').shiftRight(graph.Get('Translate1').in(_tokens.moves, allOnes))

  const lastChain1 = MakeTranslateChain(graph, translatePoints,
    'Translate1', 'axisInputs', axis1Mask, numTranslates)

  graph.Get('axisInputs').shiftRight(graph.Get('Translate2').in(_tokens.axis, axis2Mask))
  graph.Get('inputPoints2').shiftRight(graph.Get('Translate2').in(_tokens.moves, allOnes))

  const lastChain2 = MakeTranslateChain(graph, translatePoints,
    'Translate2', 'axisInputs', axis2Mask, numTranslates)

  graph.Get('axisInputs').shiftRight(graph.Get('Translate3').in(_tokens.axis, axis3Mask))
  graph.Get('inputPoints3').shiftRight(graph.Get('Translate3').in(_tokens.moves, allOnes))

  const lastChain3 = MakeTranslateChain(graph, translatePoints,
    'Translate3', 'axisInputs', axis3Mask, numTranslates)

  graph.Get('axisInputs').shiftRight(graph.Get('Translate4').in(_tokens.axis, axis4Mask))
  graph.Get('inputPoints4').shiftRight(graph.Get('Translate4').in(_tokens.moves, allOnes))

  const lastChain4 = MakeTranslateChain(graph, translatePoints,
    'Translate4', 'axisInputs', axis4Mask, numTranslates)

  graph.Get(lastChain1).shiftRight(graph.Get('AddPoints1').in(_tokens.input1, allOnes))
  graph.Get(lastChain2).shiftRight(graph.Get('AddPoints1').in(_tokens.input2, allOnes))
  graph.Get(lastChain3).shiftRight(graph.Get('AddPoints2').in(_tokens.input1, allOnes))
  graph.Get(lastChain4).shiftRight(graph.Get('AddPoints2').in(_tokens.input2, allOnes))

  graph.Get('AddPoints1').shiftRight(graph.Get('AddPointsFinal').in(_tokens.input1, allOnes))
  graph.Get('AddPoints2').shiftRight(graph.Get('AddPointsFinal').in(_tokens.input2, allOnes))

  return graph.Get('AddPointsFinal').getVdfNode()
}

// Utility class to run, stat and graph a network multiple times.
// testVdfIsolatedSubnetwork.cpp:251-337
class Runner {
  private readonly _allOnes: VdfMask
  private readonly _net: VdfNetwork
  private readonly _out: VdfNode | null
  private readonly _schedule = new VdfSchedule()
  private readonly _exec = new VdfSimpleExecutor()
  private readonly _options = new VdfGrapherOptions()

  constructor(net: VdfNetwork, out: VdfNode | null) {
    this._allOnes = new VdfMask(NUM_POINTS)
    this._net = net
    this._out = out
    this._allOnes.setAll()

    this._options.setUniqueIds(false)
    this._options.setDrawMasks(true)
    this._options.setPrintSingleOutputs(true)
  }

  snapshot(purpose: string, run = true): GfVec3d {
    //
    // Graph network
    //

    const filename = purpose + '.dot'
    VdfGrapher.graphToFile(this._net, join(_testDirectory, filename), this._options)

    if (!run) return new GfVec3d(0)

    //
    // Stat network
    //
    this._net.dumpStats({ write: (s: string) => process.stderr.write(s) })

    //
    // Run network
    //

    const request = new VdfRequest(new VdfMaskedOutput(this._out!.GetOutput(), this._allOnes))

    VdfScheduler.schedule(request, this._schedule, true /* topologicalSort */)

    this._exec.run(this._schedule)

    const res = this._exec.getOutputValue(
      this._out!.GetOutput(_tokens.out)!, this._allOnes)!
      .getReadAccessor<GfVec3d>(GfVec3dType).Get(0)

    return res
  }

  invalidate(node: VdfNode): void {
    const outputs: VdfMaskedOutput[] = []

    for (const [, output] of node.getOutputsIterator()) {
      let mask: VdfMask

      const affectsMask = output.getAffectsMask()
      if (affectsMask) {
        mask = affectsMask
      } else {
        mask = VdfMask.allOnes(output.getNumDataEntries())
      }

      outputs.push(new VdfMaskedOutput(output, mask))
    }

    this._exec.invalidateValues(outputs)
  }
}

// testVdfIsolatedSubnetwork.cpp:339-344 (prints "> asking: <name>" upstream)
const Filter = (_node: VdfNode): boolean => true

// Filter that never allows anything to be deleted.
// testVdfIsolatedSubnetwork.cpp:346-351
const FilterNever = (_node: VdfNode): boolean => false

describe('testVdfIsolatedSubnetwork', () => {
  // testVdfIsolatedSubnetwork.cpp:353-421
  it('TestIsolateBranch', () => {
    const graph = new VdfTestUtils.Network()

    const out = BuildTestNetwork1(graph)
    const net = graph.getNetwork()

    const runner = new Runner(net, out)
    let res: GfVec3d

    res = runner.snapshot('original')

    expect(res.equals(new GfVec3d(4, 4, 0)),
      `*** Test failed, unexpected result: ${res}`).toBe(true)

    ////////////////////////////////////////////////////////////////////////

    // Applying edit operation...

    const connection = graph.getConnection(
      'Translate2_0:out -> AddPoints1:input2')

    expect(connection).toBeTruthy()

    const sourceNode = connection!.getSourceNode()

    // Invalidate from connection downwards.
    runner.invalidate(connection!.getTargetNode())

    // Testing that isolating a single connection with a never filter will
    // remove the single connection regardless.

    const never = FilterNever
    let branch = VdfIsolatedSubnetwork.isolateBranch(connection, never)

    expect(branch).toBeTruthy()

    // Testing that the connection got isolated.
    expect(branch!.getIsolatedConnections().size === 1).toBe(true)

    // Testing that isolating a node works.

    const always = Filter
    // unique_ptr reassignment destroys the previous branch.
    const previous = branch
    branch = VdfIsolatedSubnetwork.isolateBranch(sourceNode, always)
    previous!._destruct()

    // Testing that we isolated the right number of nodes and connections.
    expect(branch!.getIsolatedNodes().length === 3).toBe(true)

    // Testing that the network got reduced in size.
    expect(net.getNumOwnedNodes() === 13).toBe(true)

    // Testing that the network computes a new correct result.
    res = runner.snapshot('removed_branch')
    expect(res.equals(new GfVec3d(4, 2, 0)),
      `*** Test failed, unexpected result: ${res}`).toBe(true)

    branch!._destruct()
  })

  // testVdfIsolatedSubnetwork.cpp:461-519
  function TestAddIsolatedBranch(explicitlyRemoveIsolatedObjects: boolean): void {
    const graph = new VdfTestUtils.Network()
    const out = BuildTestNetwork2(graph)
    const net = graph.getNetwork()
    const runner = new Runner(net, /* out */ null)

    runner.snapshot('isolate_multi_original', /* run */ false)

    const always = Filter

    // Applying edit operation...

    expect(net.getNumOwnedNodes() === 7).toBe(true)

    {
      const subnet = VdfIsolatedSubnetwork.new(net)
      for (let it = 2; it !== out.length; ++it) {
        subnet!.addIsolatedBranch(out[it]!, always)
      }
      expect(subnet).toBeTruthy()
      expect(subnet!.getIsolatedNodes().length === 3).toBe(true)
      expect(subnet!.getIsolatedConnections().size === 3).toBe(true)

      if (explicitlyRemoveIsolatedObjects) {
        subnet!.removeIsolatedObjectsFromNetwork()
      }
      // ~std::unique_ptr at scope exit.
      subnet!._destruct()
    }

    runner.snapshot('isolate_multi_after', /* run */ false)

    // Testing that the network got reduced in size.
    expect(net.getNumOwnedNodes() === 4).toBe(true)

    {
      const subnet = VdfIsolatedSubnetwork.new(net)
      for (let it = 0; it !== 2; ++it) {
        subnet!.addIsolatedBranch(out[it]!, always)
      }
      expect(subnet).toBeTruthy()
      expect(subnet!.getIsolatedNodes().length === 4).toBe(true)
      expect(subnet!.getIsolatedConnections().size === 3).toBe(true)

      if (explicitlyRemoveIsolatedObjects) {
        subnet!.removeIsolatedObjectsFromNetwork()
      }
      // ~std::unique_ptr at scope exit.
      subnet!._destruct()
    }

    // Testing that all nodes were removed from the network.
    expect(net.getNumOwnedNodes() === 0).toBe(true)
  }

  // main (testVdfIsolatedSubnetwork.cpp:605-616) runs TestAddIsolatedBranch
  // with true, then false.
  it('TestAddIsolatedBranch', () => {
    TestAddIsolatedBranch(/* explicitlyRemoveIsolatedObjects */ true)
    TestAddIsolatedBranch(/* explicitlyRemoveIsolatedObjects */ false)
  })

  // testVdfIsolatedSubnetwork.cpp:521-603
  it('TestErrorCases', () => {
    const mark = new TfErrorMark()
    const neverFilter = (_node: VdfNode): boolean => true

    // Test null arguments

    VdfIsolatedSubnetwork.isolateBranch(null, neverFilter)
    expect(!mark.isClean()).toBe(true)
    mark.clear()

    // (VdfNode*)nullptr: the TS overloads share one nullable parameter.
    VdfIsolatedSubnetwork.isolateBranch(null, neverFilter)
    expect(!mark.isClean()).toBe(true)
    mark.clear()

    VdfIsolatedSubnetwork.new(/* network */ null)
    expect(!mark.isClean()).toBe(true)
    mark.clear()

    const network = new VdfNetwork()
    const subnetwork = VdfIsolatedSubnetwork.new(network)
    expect(mark.isClean()).toBe(true)
    expect(subnetwork).toBeTruthy()

    subnetwork!.addIsolatedBranch(null, neverFilter)
    expect(!mark.isClean()).toBe(true)
    mark.clear()

    // (VdfNode*)nullptr: the TS overloads share one nullable parameter.
    subnetwork!.addIsolatedBranch(null, neverFilter)
    expect(!mark.isClean()).toBe(true)
    mark.clear()

    // Attempt to add an isolated branch with a node from a different network.

    const graph = new VdfTestUtils.Network()
    const out = BuildTestNetwork1(graph)
    expect(out).toBeTruthy()

    subnetwork!.addIsolatedBranch(out, neverFilter)
    expect(!mark.isClean()).toBe(true)
    mark.clear()

    // Attempt to add an isolated branch with a connection from a different
    // network.

    const connection = graph.getConnection(
      'Translate2_0:out -> AddPoints1:input2')
    expect(connection).toBeTruthy()

    subnetwork!.addIsolatedBranch(connection, neverFilter)
    expect(!mark.isClean()).toBe(true)
    mark.clear()

    // Attempt to add a branch after isolated objects have been removed from
    // the network.

    const node = graph.Get('Translate2_0').getVdfNode()
    expect(node).toBeTruthy()

    subnetwork!.removeIsolatedObjectsFromNetwork()
    expect(mark.isClean()).toBe(true)
    subnetwork!.addIsolatedBranch(node, neverFilter)
    expect(!mark.isClean()).toBe(true)
    mark.clear()

    // Attempt to add a node that has output connections.
    //
    // No error is emitted, but no nodes are isolated.

    const network2 = graph.getNetwork()
    const subnetwork2 = VdfIsolatedSubnetwork.new(network2)
    expect(subnetwork2).toBeTruthy()

    const result = subnetwork2!.addIsolatedBranch(node, neverFilter)
    expect(!result).toBe(true)
    expect(mark.isClean()).toBe(true)
    expect(subnetwork2!.getIsolatedNodes().length === 0).toBe(true)

    // ~std::unique_ptr in reverse declaration order.
    subnetwork2!._destruct()
    subnetwork!._destruct()
  })
})

// testVdfIsolatedSubnetwork.cpp:423-459 (BuildTestNetwork2 precedes
// TestAddIsolatedBranch upstream).
function BuildTestNetwork2(graph: VdfTestUtils.Network): VdfNode[] {
  // We're going to build a network like this:
  //
  //                                   RootNode           |
  //                                  /       \           |
  //                                Child1   Child2       |
  //                                /   \     /   \       |
  //                               GC1  GC2  GC3  GC4     |

  const node = new VdfTestUtils.CallbackNodeType((_ctx: VdfContext) => {})
  node
    .Read(doubleType, _tokens.in)
    .out(doubleType, _tokens.out)

  graph.add('RootNode', node)
  graph.add('Child1', node)
  graph.add('Child2', node)
  graph.add('Grandchild1', node)
  graph.add('Grandchild2', node)
  graph.add('Grandchild3', node)
  graph.add('Grandchild4', node)

  const oneOne = VdfMask.allOnes(1)

  graph.Get('RootNode').shiftRight(graph.Get('Child1').in(_tokens.in, oneOne))
  graph.Get('RootNode').shiftRight(graph.Get('Child2').in(_tokens.in, oneOne))
  graph.Get('Child1').shiftRight(graph.Get('Grandchild1').in(_tokens.in, oneOne))
  graph.Get('Child1').shiftRight(graph.Get('Grandchild2').in(_tokens.in, oneOne))
  graph.Get('Child2').shiftRight(graph.Get('Grandchild3').in(_tokens.in, oneOne))
  graph.Get('Child2').shiftRight(graph.Get('Grandchild4').in(_tokens.in, oneOne))

  return [graph.Get('Grandchild1').getVdfNode(), graph.Get('Grandchild2').getVdfNode(),
    graph.Get('Grandchild3').getVdfNode(), graph.Get('Grandchild4').getVdfNode()]
}
