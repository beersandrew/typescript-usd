// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfEdit.cpp,
//  pxr/exec/vdf/testenv/testVdfEdit/sortDotFiles.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfEdit.cpp
//
// main() runs TestNodeIds and TestEdits; each is an it(). Each upstream test
// function returns false on failure; the it() expects true. TF_AXIOM throws,
// failing the run. The "*** Test failed" messages are printed as upstream
// does; the progress printf/cout output is not ported.
//
// The program's working directory, where Runner::Snapshot writes its .dot
// files with VdfGrapher::GraphToFile, is a fresh temporary directory. The
// CMake registration (pxr/exec/vdf/CMakeLists.txt:530-559) sorts the written
// files with sortDotFiles.py and diffs them against
// testenv/testVdfEdit/baseline/*.dot.out (copied verbatim to
// tests/fixtures/testVdfEdit/baseline); that comparison is the last it().

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { Vec3d as GfVec3d } from 'typescript-usd/gf'
import { TF_AXIOM, TF_HAS_ERRORS, TfErrorMark, Token as TfToken } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import type { VdfConnection } from '../../src/connection.ts'
import type { VdfContext } from '../../src/context.ts'
import { VdfGrapher } from '../../src/grapher.ts'
import { VdfGrapherOptions } from '../../src/grapherOptions.ts'
import { VdfIsolatedSubnetwork } from '../../src/isolatedSubnetwork.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import type { VdfMaskedOutputVector } from '../../src/maskedOutputVector.ts'
import { VdfNetwork, VdfNetwork_EditMonitor } from '../../src/network.ts'
import { VdfNode } from '../../src/node.ts'
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
const doubleType = VtValueTypes.double

// TF_DEFINE_PRIVATE_TOKENS (testVdfEdit.cpp:33-41).
const _tokens = {
  axis: TfToken('axis'),
  moves: TfToken('moves'),
  input1: TfToken('input1'),
  input2: TfToken('input2'),
  out: TfToken('out'),
}

// testVdfEdit.cpp:43
const NUM_POINTS = 10

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

// testVdfEdit.cpp:45-50
function GenerateDouble(context: VdfContext): void {
  const result = 1.0
  context.setOutput(result)
}

// testVdfEdit.cpp:52-70
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

// testVdfEdit.cpp:73-92
function TranslatePoints(context: VdfContext): void {
  // We only expect one value for the "axis" input -- so we use the
  // GetInputValue API, which is very simple.
  const axis = context.getInputValue<GfVec3d>(GfVec3dType, _tokens.axis)

  // We don't know how many inputs we will have for the "moves" input, so
  // we will use an iterator, that we'll also use to output our data into.
  const iter = new VdfReadWriteIterator<GfVec3d>(GfVec3dType, context, _tokens.moves)

  // Now loop over all of our inputs and translate the points.
  // `*iter += axis`: GfVec3d is a value type, so assign the sum.
  for (; !iter.isAtEnd(); iter.increment()) {
    iter.derefAssign(iter.deref().add(axis))
  }
}

// testVdfEdit.cpp:94-126
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

// testVdfEdit.cpp:128-150
function MakeTranslateChain(
  graph: VdfTestUtils.Network,
  translateNode: VdfTestUtils.CallbackNodeType,
  first: string,
  axis: string,
  axisMask: VdfMask,
  num: number,
): string {
  const allOnes = VdfMask.allOnes(NUM_POINTS)

  let prev = first
  let current = ''
  for (let i = 0; i < num; ++i) {
    current = first + '_' + String(i)
    graph.add(current, translateNode)

    _Connect(graph, axis, current, _tokens.axis, axisMask)
    _Connect(graph, prev, current, _tokens.moves, allOnes)

    prev = current
  }
  return prev
}

// testVdfEdit.cpp:152-252
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

  _Connect(graph, 'axisInputs', 'Translate1', _tokens.axis, axis1Mask)
  _Connect(graph, 'inputPoints1', 'Translate1', _tokens.moves, allOnes)

  const lastChain1 = MakeTranslateChain(graph, translatePoints,
    'Translate1', 'axisInputs', axis1Mask, numTranslates)

  _Connect(graph, 'axisInputs', 'Translate2', _tokens.axis, axis2Mask)
  _Connect(graph, 'inputPoints2', 'Translate2', _tokens.moves, allOnes)

  const lastChain2 = MakeTranslateChain(graph, translatePoints,
    'Translate2', 'axisInputs', axis2Mask, numTranslates)

  _Connect(graph, 'axisInputs', 'Translate3', _tokens.axis, axis3Mask)
  _Connect(graph, 'inputPoints3', 'Translate3', _tokens.moves, allOnes)

  const lastChain3 = MakeTranslateChain(graph, translatePoints,
    'Translate3', 'axisInputs', axis3Mask, numTranslates)

  _Connect(graph, 'axisInputs', 'Translate4', _tokens.axis, axis4Mask)
  _Connect(graph, 'inputPoints4', 'Translate4', _tokens.moves, allOnes)

  const lastChain4 = MakeTranslateChain(graph, translatePoints,
    'Translate4', 'axisInputs', axis4Mask, numTranslates)

  _Connect(graph, lastChain1, 'AddPoints1', _tokens.input1, allOnes)
  _Connect(graph, lastChain2, 'AddPoints1', _tokens.input2, allOnes)
  _Connect(graph, lastChain3, 'AddPoints2', _tokens.input1, allOnes)
  _Connect(graph, lastChain4, 'AddPoints2', _tokens.input2, allOnes)

  _Connect(graph, 'AddPoints1', 'AddPointsFinal', _tokens.input1, allOnes)
  _Connect(graph, 'AddPoints2', 'AddPointsFinal', _tokens.input2, allOnes)

  return graph.Get('AddPointsFinal').getVdfNode()
}

// The program's working directory (see the file header).
const _testDirectory = mkdtempSync(join(tmpdir(), 'testVdfEdit-'))

// testenv/testVdfEdit/sortDotFiles.py: sorts the lines of a .dot file,
// comparing them without their line endings.
function _SortDotFile(contents: string): string {
  const lines = contents.split(/(?<=\n)/)
  const key = (line: string): string => line.replace(/[\r\n]+$/, '')
  lines.sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  return lines.join('')
}

// Utility class to run, stat and graph a network multiple times
// (testVdfEdit.cpp:254-345).
class Runner {
  private readonly _allOnes: VdfMask
  private readonly _net: VdfNetwork
  private readonly _out: VdfNode
  private readonly _schedule = new VdfSchedule()
  private readonly _exec = new VdfSimpleExecutor()

  private readonly _options = new VdfGrapherOptions()

  // testVdfEdit.cpp:262-273
  constructor(net: VdfNetwork, out: VdfNode) {
    this._allOnes = new VdfMask(NUM_POINTS)
    this._net = net
    this._out = out
    this._allOnes.setAll()

    this._options.setUniqueIds(false)
    this._options.setDrawMasks(true)
    this._options.setPrintSingleOutputs(true)
  }

  // testVdfEdit.cpp:275-312. The printf progress output is not ported.
  snapshot(purpose: string, run = true): GfVec3d {
    //
    // Graph network
    //

    const filename = purpose + '.dot'
    VdfGrapher.graphToFile(this._net, join(_testDirectory, filename), this._options)

    if (!run) {
      return new GfVec3d(0)
    }

    //
    // Stat network
    //
    // Upstream writes to std::cerr; the output is not checked.
    let stats = ''
    this._net.dumpStats({ write: (s: string) => { stats += s } })
    void stats

    //
    // Run network
    //

    const request = new VdfRequest(new VdfMaskedOutput(this._out.GetOutput(), this._allOnes))

    VdfScheduler.schedule(request, this._schedule, true /* topologicalSort */)

    this._exec.run(this._schedule)

    const res = this._exec.getOutputValue(
      this._out.GetOutput(_tokens.out)!, this._allOnes)!
      .getReadAccessor<GfVec3d>(GfVec3dType).Get(0)

    return res
  }

  // testVdfEdit.cpp:315-332
  invalidate(node: VdfNode): void {
    const outputs: VdfMaskedOutputVector = []

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

  // testVdfEdit.cpp:334-342
  findNode(network: VdfNetwork, name: string): VdfNode | null {
    const nodes = VdfGrapher.getNodesNamed(network, name)

    return nodes.length === 1 ? nodes[0]! : null
  }
}

// testVdfEdit.cpp:347-458
function TestNodeIds(): boolean {
  const testNetwork = new VdfTestUtils.Network()
  const net = testNetwork.getNetwork()

  // Build a test network.
  BuildTestNetwork1(testNetwork)

  // Verify the node indices and versions
  let nodeCapacity = net.getNodeCapacity()
  for (let i = 0; i < nodeCapacity; ++i) {
    const node = net.getNode(i)
    TF_AXIOM(node, 'node')
    TF_AXIOM(VdfNode.getVersionFromId(node!.getId()) === 0,
      'VdfNode::GetVersionFromId(node->GetId()) == 0')
    TF_AXIOM(VdfNode.getIndexFromId(node!.getId()) === i,
      'VdfNode::GetIndexFromId(node->GetId()) == i')
  }

  // Clear the network.
  net.clear()

  // Make sure all nodes have been deleted.
  TF_AXIOM(net.getNodeCapacity() === 0, 'net.GetNodeCapacity() == 0')
  for (let i = 0; i < nodeCapacity; ++i) {
    TF_AXIOM(!net.getNode(i), '!net.GetNode(i)')
  }

  // Rebuild the network.
  BuildTestNetwork1(testNetwork)

  // Make sure the versions have been incremented and that all nodes
  // are again available.
  TF_AXIOM(net.getNodeCapacity() === nodeCapacity, 'net.GetNodeCapacity() == nodeCapacity')
  for (let i = 0; i < nodeCapacity; ++i) {
    const node = net.getNode(i)
    TF_AXIOM(node, 'node')
    TF_AXIOM(VdfNode.getVersionFromId(node!.getId()) === 1,
      'VdfNode::GetVersionFromId(node->GetId()) == 1')
    TF_AXIOM(VdfNode.getIndexFromId(node!.getId()) === i,
      'VdfNode::GetIndexFromId(node->GetId()) == i')
  }

  // Add a new node.
  const generateDouble1 = new VdfTestUtils.CallbackNodeType(GenerateDouble)
  generateDouble1
    .out(doubleType, _tokens.out)
  testNetwork.add('inputDouble1', generateDouble1)

  // Verify the node has been added to the end.
  TF_AXIOM(net.getNodeCapacity() > nodeCapacity, 'net.GetNodeCapacity() > nodeCapacity')
  nodeCapacity = net.getNodeCapacity()
  const newNode1 = net.getNode(nodeCapacity - 1)!
  TF_AXIOM(VdfNode.getVersionFromId(newNode1.getId()) === 1,
    'VdfNode::GetVersionFromId(newNode1->GetId()) == 1')
  TF_AXIOM(VdfNode.getIndexFromId(newNode1.getId()) === (nodeCapacity - 1),
    'VdfNode::GetIndexFromId(newNode1->GetId()) == (nodeCapacity - 1)')

  // Add another new node.
  const generateDouble2 = new VdfTestUtils.CallbackNodeType(GenerateDouble)
  generateDouble2
    .out(doubleType, _tokens.out)
  testNetwork.add('inputDouble2', generateDouble2)

  // Verify the node has been added to the end.
  TF_AXIOM(net.getNodeCapacity() > nodeCapacity, 'net.GetNodeCapacity() > nodeCapacity')
  nodeCapacity = net.getNodeCapacity()
  const newNode2 = net.getNode(nodeCapacity - 1)!
  TF_AXIOM(VdfNode.getVersionFromId(newNode2.getId()) === 1,
    'VdfNode::GetVersionFromId(newNode2->GetId()) == 1')
  TF_AXIOM(VdfNode.getIndexFromId(newNode2.getId()) === (nodeCapacity - 1),
    'VdfNode::GetIndexFromId(newNode2->GetId()) == (nodeCapacity - 1)')

  // Delete a node (leaving a "hole" in the node array)
  net.Delete(newNode1)
  TF_AXIOM(net.getNodeCapacity() === nodeCapacity, 'net.GetNodeCapacity() == nodeCapacity')
  TF_AXIOM(!net.getNode(nodeCapacity - 2), '!net.GetNode(nodeCapacity - 2)')

  // Add a nother new node. It should alias the previously deleted node index
  // but have a different version number.
  const generateDouble3 = new VdfTestUtils.CallbackNodeType(GenerateDouble)
  generateDouble3
    .out(doubleType, _tokens.out)
  testNetwork.add('inputDouble3', generateDouble3)

  TF_AXIOM(net.getNodeCapacity() === nodeCapacity, 'net.GetNodeCapacity() == nodeCapacity')
  const newNode3 = net.getNode(nodeCapacity - 2)
  TF_AXIOM(newNode3, 'newNode3')
  TF_AXIOM(VdfNode.getVersionFromId(newNode3!.getId()) === 2,
    'VdfNode::GetVersionFromId(newNode3->GetId()) == 2')
  TF_AXIOM(VdfNode.getIndexFromId(newNode3!.getId()) === (nodeCapacity - 2),
    'VdfNode::GetIndexFromId(newNode3->GetId()) == (nodeCapacity - 2)')

  // Nothing changed about the last node.
  TF_AXIOM(VdfNode.getVersionFromId(newNode2.getId()) === 1,
    'VdfNode::GetVersionFromId(newNode2->GetId()) == 1')
  TF_AXIOM(VdfNode.getIndexFromId(newNode2.getId()) === (nodeCapacity - 1),
    'VdfNode::GetIndexFromId(newNode2->GetId()) == (nodeCapacity - 1)')

  // Delete the same node again, and add one more new node in its place.
  net.Delete(newNode3!)
  TF_AXIOM(net.getNodeCapacity() === nodeCapacity, 'net.GetNodeCapacity() == nodeCapacity')
  TF_AXIOM(!net.getNode(nodeCapacity - 2), '!net.GetNode(nodeCapacity - 2)')

  const generateDouble4 = new VdfTestUtils.CallbackNodeType(GenerateDouble)
  generateDouble4
    .out(doubleType, _tokens.out)
  testNetwork.add('inputDouble3', generateDouble4)

  // Verify that node versions will be incremented past version 1.
  const newNode4 = net.getNode(nodeCapacity - 2)
  TF_AXIOM(newNode4, 'newNode4')
  TF_AXIOM(VdfNode.getVersionFromId(newNode4!.getId()) === 3,
    'VdfNode::GetVersionFromId(newNode4->GetId()) == 3')
  TF_AXIOM(VdfNode.getIndexFromId(newNode4!.getId()) === (nodeCapacity - 2),
    'VdfNode::GetIndexFromId(newNode4->GetId()) == (nodeCapacity - 2)')

  return true
}

// The Monitor struct of TestEdits (testVdfEdit.cpp:507-526). Upstream prints
// each notice with the object's address; the lines are collected here and
// not checked.
class Monitor extends VdfNetwork_EditMonitor {
  readonly lines: string[] = []

  willClear(): void {}

  didConnect(connection: VdfConnection): void {
    this.lines.push(`> Connect CONN: ${connection.getDebugName()}`)
  }

  willDelete(node: VdfNode): void
  willDelete(conn: VdfConnection): void
  willDelete(nodeOrConn: VdfNode | VdfConnection): void {
    if (nodeOrConn instanceof VdfNode) {
      this.lines.push(`> Delete NODE: ${nodeOrConn.getDebugName()}`)
    } else {
      this.lines.push(`> Delete CONN: ${nodeOrConn.getDebugName()}`)
    }
  }

  didAddNode(_node: VdfNode): void {}
}

// The Filter struct of TestEdits (testVdfEdit.cpp:682-700).
class Filter {
  readonly _runner: Runner
  _nodesAsked = 0

  constructor(runner: Runner) {
    this._runner = runner
  }

  // operator() (testVdfEdit.cpp:688-693)
  call(_node: VdfNode): boolean {
    this._nodesAsked++
    return true
  }
}

// testVdfEdit.cpp:460-742
function TestEdits(): boolean {
  const testNetwork = new VdfTestUtils.Network()

  const net = testNetwork.getNetwork()
  let prevVersion = net.getVersion()

  const out = BuildTestNetwork1(testNetwork)

  TF_AXIOM(net.getVersion() !== prevVersion, 'net.GetVersion() != prevVersion')

  const runner = new Runner(net, out)
  let res: GfVec3d

  res = runner.snapshot('original')

  if (!res.equals(new GfVec3d(4, 4, 0))) {
    console.log('*** Test failed, unexpected result: ' + String(res))
    return false
  }

  ////////////////////////////////////////////////////////////////////////

  // Applying edit operation...

  const allErrors = new TfErrorMark()
  try {
    // Test all cases where not all inputs/outputs are automatically removed
    // and thus the node is still at least partially connected when trying to
    // delete it. ~ This needs to raise a coding error.

    let editStep = 0

    for (let i = 0; i < 2; i++) {
      const m = new TfErrorMark()
      try {
        runner.invalidate(testNetwork.Get('Translate4_0').getVdfNode())

        let error: boolean

        if (i === 0) {
          // We don't expect Tralsnate4_0 to be deleted as long as it still
          // has inputs that are connected.
          prevVersion = net.getVersion()
          error = TF_HAS_ERRORS(m, () => {
            net.Delete(testNetwork.Get('Translate4_0').getVdfNode())
          })
          TF_AXIOM(net.getVersion() === prevVersion, 'net.GetVersion() == prevVersion')
        } else {
          const monitor = new Monitor()

          // Isolate a sub graph around Translate4_0.
          const names = [
            'Translate4_0:out -> AddPoints2:input2',
            'axisInputs:out -> Translate4:axis',
            'axisInputs:out -> Translate4_0:axis',
          ]

          net.registerEditMonitor(monitor)

          for (const name of names) {
            prevVersion = net.getVersion()
            net.disconnect(testNetwork.getConnection(name)!)
            TF_AXIOM(net.getVersion() !== prevVersion, 'net.GetVersion() != prevVersion')

            res = runner.snapshot('edit_step_' + String(editStep++), false)
          }

          const neverFilter = (_node: VdfNode): boolean => true

          prevVersion = net.getVersion()
          error = TF_HAS_ERRORS(m, () => {
            // The returned std::unique_ptr is a temporary, destroyed at the
            // end of the full expression (isolatedSubnetwork.cpp:158-175).
            VdfIsolatedSubnetwork.isolateBranch(
              testNetwork.Get('Translate4_0').getVdfNode(), neverFilter)?._destruct()
          })
          TF_AXIOM(net.getVersion() !== prevVersion, 'net.GetVersion() != prevVersion')

          net.unregisterEditMonitor(monitor)
        }

        const errorExpected = i === 0

        if (error !== errorExpected) {
          console.log(`*** Test failed, error ${errorExpected ? 'not ' : ' '}raised.`)
          return false
        }

        res = runner.snapshot('edit_step_' + String(editStep++), !errorExpected)
      } finally {
        m.dispose()
      }
    }

    if (!res.equals(new GfVec3d(4, 2, 0))) {
      console.log('*** Test failed, unexpected result: ' + String(res))
      return false
    }

    const numErrors = allErrors.getNumErrors()

    if (numErrors !== 1) {
      console.log('*** Test failed, expected one error.')
      return false
    }
  } finally {
    allErrors.dispose()
  }

  ////////////////////////////////////////////////////////////////////////

  const numEdits = 6
  const nodeSet = 4

  const connectionNames = [
    'Translate3:out -> Translate3_0:moves',
    'axisInputs -> Translate3:axis',
    'inputPoints3:out -> Translate3:moves',
    'axisInputs -> Translate3_0:axis',
    'Translate3_0:out -> AddPoints2:input1',
    'AddPoints2:out -> AddPointsFinal:input2',
  ]

  const nodesPresentAfterEditStep = [
    4, 4, 2, 2, 1, 0,
  ]

  const nodesToRemove = [
    'VdfTestUtils::DependencyCallbackNode inputPoints3',
    'VdfTestUtils::DependencyCallbackNode Translate3',
    'VdfTestUtils::DependencyCallbackNode Translate3_0',
    'VdfTestUtils::DependencyCallbackNode AddPoints2',
  ]

  for (let i = 0; i < numEdits; i++) {
    const connection = testNetwork.getConnection(connectionNames[i]!)

    if (!connection) {
      console.log(`*** Test failed, expected to find connection: ${connectionNames[i]}.`)
      return false
    }

    // Note: By design, the client needs to invalidate nodes before edits.
    runner.invalidate(connection.getTargetNode())

    prevVersion = net.getVersion()

    // Get pointers to source and target nodes, before connection is deleted.
    const tgtNode = connection.getTargetNode()
    const srcNode = connection.getSourceNode()

    net.disconnect(connection)

    // If target node became orphaned, delete...
    if (!tgtNode.hasInputConnections() &&
      !tgtNode.hasOutputConnections()) {
      net.Delete(tgtNode)
    }

    // If source node became orphaned, delete...
    if (!srcNode.hasInputConnections() &&
      !srcNode.hasOutputConnections()) {
      net.Delete(srcNode)
    }

    TF_AXIOM(net.getVersion() !== prevVersion, 'net.GetVersion() != prevVersion')

    if (testNetwork.getConnection(connectionNames[i]!)) {
      console.log('*** Test failed, expected connection to be removed.')
      return false
    }

    // Verify that orphaned node removal works.
    let nodesFound = 0

    for (let j = 0; j < nodeSet; j++) {
      if (runner.findNode(net, nodesToRemove[j]!)) {
        nodesFound++
      }
    }

    if (nodesFound !== nodesPresentAfterEditStep[i]) {
      console.log('*** Test failed, unexpected number of nodes after ' +
        `connection removal ${i}. Found ${nodesFound}, expected ` +
        `${nodesPresentAfterEditStep[i]}.`)
      return false
    }

    res = runner.snapshot('removed_edge_' + String(i), i + 1 === numEdits)
  }

  if (!res.equals(new GfVec3d(2, 2, 0))) {
    console.log('*** Test failed, unexpected result: ' + String(res))
    return false
  }

  //
  // Test DeleteBranch and EditFilters
  //

  const filter = new Filter(runner)

  const connection = testNetwork.getConnection(
    'Translate2_0:out -> AddPoints1:input2')

  TF_AXIOM(connection, 'connection')

  const subgraph = VdfIsolatedSubnetwork.isolateBranch(
    connection, (node: VdfNode) => filter.call(node))
  try {
    const num = subgraph!.getIsolatedNodes().length

    if (num !== 3) {
      console.log('*** Test failed, expected 3 nodes to be deleted.')
      return false
    }

    // We get asked for each node seen along each path.
    if (filter._nodesAsked !== 5) {
      console.log('*** Test failed, expected 6 nodes to be filtered.')
      return false
    }

    res = runner.snapshot('removed_branch')

    if (!res.equals(new GfVec3d(2, 0, 0))) {
      console.log('*** Test failed, unexpected result: ' + String(res))
      return false
    }

    //XXX: test that a diamond is deleted correctly by DeleteBranch

    return true
  } finally {
    // ~std::unique_ptr<VdfIsolatedSubnetwork> at the end of TestEdits.
    subgraph?._destruct()
  }
}

describe('testVdfEdit', () => {
  it('TestNodeIds', () => {
    expect(TestNodeIds()).toBe(true)
  })

  it('TestEdits', () => {
    expect(TestEdits()).toBe(true)
  })

  // pxr/exec/vdf/CMakeLists.txt:530-559: POST_COMMAND sortDotFiles.py and
  // DIFF_COMPARE of the files Runner::Snapshot writes with VdfGrapher against
  // testenv/testVdfEdit/baseline/*.dot.out.
  it('DIFF_COMPARE baseline dot files', () => {
    const dotFiles = [
      'original.dot',
      'edit_step_0.dot', 'edit_step_1.dot', 'edit_step_2.dot',
      'edit_step_3.dot', 'edit_step_4.dot',
      'removed_edge_0.dot', 'removed_edge_1.dot', 'removed_edge_2.dot',
      'removed_edge_3.dot', 'removed_edge_4.dot', 'removed_edge_5.dot',
    ]
    for (const dotFile of dotFiles) {
      const sorted = _SortDotFile(readFileSync(join(_testDirectory, dotFile), 'utf8'))
      const baseline = readFileSync(new URL(
        `../fixtures/testVdfEdit/baseline/${dotFile}.out`, import.meta.url), 'utf8')
      expect(sorted, `DIFF_COMPARE ${dotFile}.out`).toBe(baseline)
    }
  })
})
