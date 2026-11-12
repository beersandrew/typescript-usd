// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfTraversal.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfTraversal.cpp
//
// Upstream compares the program's stdout with the committed baseline
// pxr/exec/vdf/testenv/testVdfTraversal/baseline/testVdfTraversal-Run1-stdout.txt
// (copied verbatim to tests/fixtures/testVdfTraversal/). Each test function
// is an it() that writes what upstream prints to std::cout into a buffer;
// the buffer must equal that function's section of the baseline (each
// section starts with the "\n\nTesting traversal" banner it prints).
//
// graph[name] is graph.Get(name) and `a >> b.In(...)` is
// a.ShiftRight(b.In(...)) (VdfTestUtils port). `std::cout << mask` is
// VdfMask.toString().

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { Token as TfToken } from 'typescript-usd/tf'
import { Vec2d as GfVec2d, Vec3d as GfVec3d } from 'typescript-usd/gf'
import { TF_VERIFY } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import type { VdfConnection } from '../../src/connection.ts'
import type { VdfContext } from '../../src/context.ts'
import { VdfExecutionTypeRegistry } from '../../src/executionTypeRegistry.ts'
import type { VdfInput } from '../../src/input.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import type { VdfMaskedOutputVector } from '../../src/maskedOutputVector.ts'
import type { VdfNode } from '../../src/node.ts'
import type { VdfObjectPtrVector } from '../../src/object.ts'
import type { VdfOutput } from '../../src/output.ts'
import { VdfReadWriteIterator } from '../../src/readWriteIterator.ts'
import { VdfSparseInputTraverser } from '../../src/sparseInputTraverser.ts'
import { VdfSparseOutputTraverser } from '../../src/sparseOutputTraverser.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'
import { TfCompressedBits } from 'typescript-usd/tf'

const GfVec3dType = VtValueTypes.GfVec3d
const GfVec2dType = VtValueTypes.GfVec2d

// The upstream baseline, split into the sections each test function prints.
const _baseline = readFileSync(new URL(
  '../fixtures/testVdfTraversal/testVdfTraversal-Run1-stdout.txt', import.meta.url), 'utf8')
const _banner = '\n\nTesting traversal'
const _sections = _baseline.split(_banner).slice(1).map(s => _banner + s)

// std::cout.
let cout = ''

// TF_DEFINE_PRIVATE_TOKENS (testVdfTraversal.cpp:26-38).
const _tokens = {
  axis: TfToken('axis'),
  pool: TfToken('.pool'),
  input: TfToken('input'),
  input1: TfToken('input1'),
  input2: TfToken('input2'),
  output: TfToken('output'),
  output1: TfToken('output1'),
  output2: TfToken('output2'),
}

// TF_REGISTRY_FUNCTION(VdfExecutionTypeRegistry) (testVdfTraversal.cpp:40-43).
VdfExecutionTypeRegistry.define(GfVec3dType, new GfVec3d(0))

// TranslatePoints (testVdfTraversal.cpp:45-54).
function TranslatePoints(context: VdfContext): void {
  const axis = context.getInputValue<GfVec3d>(GfVec3dType, _tokens.axis)
  const iter = new VdfReadWriteIterator<GfVec3d>(GfVec3dType, context, _tokens.pool)
  for (; !iter.isAtEnd(); iter.increment()) {
    iter.derefAssign(new GfVec3d(iter.deref()).add(axis))
  }
}

// BuildTestNetwork (testVdfTraversal.cpp:56-123). The pointsNode out
// parameter is the second element of the result.
function BuildTestNetwork(graph: VdfTestUtils.Network): [VdfNode, VdfNode] {
  //           points (2 points)
  //             |
  //             | [10]   axis1
  //             |       /
  //            translate1
  //             |
  //             | [01]  axis2
  //             |      /
  //            translate2
  //             |

  graph.addInputVector(GfVec3dType, 'points', 2)
  graph.Get('points')
    .setValue(0, new GfVec3d(1, 0, 0))
    .setValue(1, new GfVec3d(0, 1, 0))

  graph.addInputVector(GfVec3dType, 'axis1')
  graph.Get('axis1')
    .setValue(0, new GfVec3d(1, 0, 0))

  graph.addInputVector(GfVec3dType, 'axis2')
  graph.Get('axis2')
    .setValue(0, new GfVec3d(0, 1, 0))

  graph.addInputVector(GfVec3dType, 'disconnectedOutput')
  graph.Get('disconnectedOutput')
    .setValue(0, new GfVec3d(0, 1, 0))

  const point1Mask = new VdfMask(2)
  const point2Mask = new VdfMask(2)
  point1Mask.setIndex(0)
  point2Mask.setIndex(1)

  const oneOneMask = VdfMask.allOnes(1)
  const twoOnesMask = VdfMask.allOnes(2)

  const translateNodeType = new VdfTestUtils.CallbackNodeType(TranslatePoints)
  translateNodeType
    .readWrite(GfVec3dType, _tokens.pool, _tokens.pool)
    .Read(GfVec3dType, _tokens.axis)

  graph.add('translate1', translateNodeType)
  graph.add('translate2', translateNodeType)

  graph.Get('points').shiftRight(graph.Get('translate1').in(_tokens.pool, twoOnesMask))
  graph.Get('translate1').getVdfNode().GetOutput()!.setAffectsMask(point1Mask)
  graph.Get('axis1').shiftRight(graph.Get('translate1').in(_tokens.axis, oneOneMask))

  graph.Get('translate1').shiftRight(graph.Get('translate2').in(_tokens.pool, twoOnesMask))
  graph.Get('translate2').getVdfNode().GetOutput()!.setAffectsMask(point2Mask)
  graph.Get('axis2').shiftRight(graph.Get('translate2').in(_tokens.axis, oneOneMask))

  // Add connection to be disconnected on the source output side.
  graph.Get('disconnectedOutput').shiftRight(
    graph.Get('translate2').in(_tokens.axis, oneOneMask))

  return [graph.Get('translate2').getVdfNode(), graph.Get('points').getVdfNode()]
}

// DoNothingNodeCallback (testVdfTraversal.cpp:125-129).
function DoNothingNodeCallback(_context: VdfContext): void {}

// CommonNodeComputeInputDependencyMaskCallback (testVdfTraversal.cpp:131-148).
function CommonNodeComputeInputDependencyMaskCallback(
  maskedOutput: VdfMaskedOutput,
  inputConnection: VdfConnection): TfCompressedBits {
  // output1 depends on input1, but not on input2
  // output2 depends on input2, but not on input1
  const bits = new TfCompressedBits(1)
  if ((maskedOutput.GetOutput()!.getName() === _tokens.output1 &&
    inputConnection.getTargetInput().getName() === _tokens.input1) ||
    (maskedOutput.GetOutput()!.getName() === _tokens.output2 &&
      inputConnection.getTargetInput().getName() === _tokens.input2)) {
    bits.setAll()
  }
  return bits
}

// BuildTestNetworkWithInputDependencyCallback (testVdfTraversal.cpp:150-235).
function BuildTestNetworkWithInputDependencyCallback(graph: VdfTestUtils.Network): VdfNode {
  //           input1        input2
  //                |        /
  //                commonNode
  // (depends on      /    |     (depends on
  //  input1 only)   /      |     input2 only)
  //           nodeA         nodeB
  //                 |     /
  //               outputNode

  graph.addInputVector(GfVec2dType, 'input1')
  graph.Get('input1')
    .setValue(0, new GfVec2d(1, 0))

  graph.addInputVector(GfVec2dType, 'input2')
  graph.Get('input2')
    .setValue(0, new GfVec2d(0, 1))

  const commonNodeType = new VdfTestUtils.CallbackNodeType(DoNothingNodeCallback)
  commonNodeType
    .Read(GfVec2dType, _tokens.input1)
    .Read(GfVec2dType, _tokens.input2)
    .out(GfVec2dType, _tokens.output1)
    .out(GfVec2dType, _tokens.output2)
    .computeInputDependencyMaskCallback(CommonNodeComputeInputDependencyMaskCallback)

  graph.add('commonNode', commonNodeType)

  const passThroughNodeType = new VdfTestUtils.CallbackNodeType(DoNothingNodeCallback)
  passThroughNodeType
    .readWrite(GfVec2dType, _tokens.input, _tokens.output)

  graph.add('nodeA', passThroughNodeType)
  graph.add('nodeB', passThroughNodeType)

  const outputNodeType = new VdfTestUtils.CallbackNodeType(DoNothingNodeCallback)
  outputNodeType
    .Read(GfVec2dType, _tokens.input1)
    .Read(GfVec2dType, _tokens.input2)
    .out(GfVec2dType, _tokens.output)

  graph.add('outputNode', outputNodeType)

  graph.Get('input1').shiftRight(graph.Get('commonNode')
    .in(_tokens.input1, VdfMask.allOnes(1)))
  graph.Get('input2').shiftRight(graph.Get('commonNode')
    .in(_tokens.input2, VdfMask.allOnes(1)))

  graph.Get('commonNode').Output(_tokens.output1).shiftRight(graph.Get('nodeA')
    .in(_tokens.input, VdfMask.allOnes(1)))
  graph.Get('commonNode').Output(_tokens.output2).shiftRight(graph.Get('nodeB')
    .in(_tokens.input, VdfMask.allOnes(1)))

  graph.Get('nodeA').shiftRight(graph.Get('outputNode')
    .in(_tokens.input1, VdfMask.allOnes(1)))
  graph.Get('nodeB').shiftRight(graph.Get('outputNode')
    .in(_tokens.input2, VdfMask.allOnes(1)))

  return graph.Get('outputNode').getVdfNode()
}

// nodeCallback (testVdfTraversal.cpp:239-243).
function nodeCallback(node: VdfNode): void {
  cout += 'node:   ' + node.getDebugName() + '\n'
}

// outputCallback (testVdfTraversal.cpp:245-254).
function outputCallback(output: VdfOutput, mask: VdfMask, prevInput: VdfInput | null): boolean {
  cout += 'output: ' + output.getDebugName() + ' with mask ' +
    mask.toString() + ' reached via input: ' +
    (prevInput ? prevInput.getDebugName() : 'NULL') + '\n'
  return true
}

// nodePathCallback (testVdfTraversal.cpp:295-312).
function nodePathCallback(node: VdfNode, path: VdfObjectPtrVector): boolean {
  cout += '\n'
  cout += 'node: ' + node.getDebugName() + '\n'
  cout += 'path: ' + '\n'
  for (let k = path.length - 1; k >= 0; --k) {
    const connection = path[k]!.getIfConnection()
    TF_VERIFY(connection, 'connection')
    cout += '    ' + connection!.getDebugName() + '\n'
  }
  return true
}

// nodeCallbackForInputTraversal (testVdfTraversal.cpp:314-319).
function nodeCallbackForInputTraversal(node: VdfNode): boolean {
  cout += 'node:   ' + node.getDebugName() + '\n'
  return true
}

describe('testVdfTraversal', () => {
  it('testOutputTraversal', () => {
    cout = ''
    cout += '\n\n' + 'Testing traversal in input-to-output direction...' + '\n'

    const graph = new VdfTestUtils.Network()
    const [, node] = BuildTestNetwork(graph)

    const point1Mask = new VdfMask(2)
    const point2Mask = new VdfMask(2)
    point1Mask.setIndex(0)
    point2Mask.setIndex(1)

    {
      cout += '\n' + 'Traversing with mask ' + point1Mask.toString() + '\n'
      const request: VdfMaskedOutputVector = [new VdfMaskedOutput(node.GetOutput(), point1Mask)]
      VdfSparseOutputTraverser.traverse(request, outputCallback, nodeCallback)
    }

    {
      cout += '\n' + 'Traversing with mask ' + point2Mask.toString() + '\n'
      const request: VdfMaskedOutputVector = [new VdfMaskedOutput(node.GetOutput(), point2Mask)]
      VdfSparseOutputTraverser.traverse(request, outputCallback, nodeCallback)
    }

    expect(cout).toBe(_sections[0])
  })

  it('testInputTraversal', () => {
    cout = ''
    cout += '\n\n' + 'Testing traversal in output-to-input direction...' + '\n'

    const graph = new VdfTestUtils.Network()
    const [node] = BuildTestNetwork(graph)

    const point1Mask = new VdfMask(2)
    const point2Mask = new VdfMask(2)
    point1Mask.setIndex(0)
    point2Mask.setIndex(1)

    {
      cout += '\n' + 'Traversing with mask ' + point1Mask.toString() + '\n'
      const request: VdfMaskedOutputVector = [new VdfMaskedOutput(node.GetOutput(), point1Mask)]
      VdfSparseInputTraverser.traverseWithPath(request, nodePathCallback, null)
    }

    {
      cout += '\n' + 'Traversing with mask ' + point2Mask.toString() + '\n'
      const request: VdfMaskedOutputVector = [new VdfMaskedOutput(node.GetOutput(), point2Mask)]
      VdfSparseInputTraverser.traverseWithPath(request, nodePathCallback, null)
    }

    {
      cout += '\n' + 'Traversing with CallbackMode set to ' +
        'CallbackModeTerminalNodes and with mask ' + point1Mask.toString() + '\n'
      const request: VdfMaskedOutputVector = [new VdfMaskedOutput(node.GetOutput(), point1Mask)]
      VdfSparseInputTraverser.traverse(
        request, nodeCallbackForInputTraversal,
        VdfSparseInputTraverser.CallbackModeTerminalNodes)
    }

    {
      cout += '\n' + 'Traversing with CallbackMode set to ' +
        'CallbackModeTerminalNodes and with mask ' + point2Mask.toString() + '\n'
      const request: VdfMaskedOutputVector = [new VdfMaskedOutput(node.GetOutput(), point2Mask)]
      VdfSparseInputTraverser.traverse(
        request, nodeCallbackForInputTraversal,
        VdfSparseInputTraverser.CallbackModeTerminalNodes)
    }

    expect(cout).toBe(_sections[1])
  })

  it('testInputTraversalWithInputDependencyCallback', () => {
    cout = ''
    cout += '\n\n' + 'Testing traversal in output-to-input direction, ' +
      'with input depdenceny callback...' + '\n'

    const graph = new VdfTestUtils.Network()
    const node = BuildTestNetworkWithInputDependencyCallback(graph)

    const outputMask = VdfMask.allOnes(1)

    {
      cout += '\n' + 'Traversing with mask ' + outputMask.toString() + '\n'
      const request: VdfMaskedOutputVector = [new VdfMaskedOutput(node.GetOutput(), outputMask)]
      VdfSparseInputTraverser.traverseWithPath(request, nodePathCallback, null)
    }

    {
      cout += '\n' + 'Traversing with CallbackMode set to ' +
        'CallbackModeTerminalNodes and with mask ' + outputMask.toString() + '\n'
      const request: VdfMaskedOutputVector = [new VdfMaskedOutput(node.GetOutput(), outputMask)]
      VdfSparseInputTraverser.traverse(
        request, nodeCallbackForInputTraversal,
        VdfSparseInputTraverser.CallbackModeTerminalNodes)
    }

    expect(cout).toBe(_sections[2])
  })
})
