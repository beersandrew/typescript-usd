// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfBasic.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfBasic.cpp
//
// main() (testVdfBasic.cpp:476-501) runs four test functions; each is an
// it(). TF_AXIOM(cond) becomes expect(). The CMake registration
// (pxr/exec/vdf/CMakeLists.txt:437-440) only checks the return code, so the
// printed messages ("Result is ...", "... PASSED") are not compared. Not
// ported in runSimpleTest: the TraceCollector/TraceReporter report
// (testVdfBasic.cpp:240-253), which is only printed, and DumpStats writes to
// a discarding stream (upstream std::cerr), which only checks that it does
// not crash.

import { describe, expect, it } from 'vitest'
import { Vec3d as GfVec3d } from 'typescript-usd/gf'
import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import type { VdfContext } from '../../src/context.ts'
import { VdfInputVector } from '../../src/inputVector.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
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

// TF_DEFINE_PRIVATE_TOKENS (testVdfBasic.cpp:30-38).
const _tokens = {
  axis: TfToken('axis'),
  moves: TfToken('moves'),
  input1: TfToken('input1'),
  input2: TfToken('input2'),
  out: TfToken('out'),
}

const GfVec3dType = VtValueTypes.GfVec3d
const intType = VtValueTypes.int
const stringType = VtValueTypes.string

function TF_AXIOM(cond: boolean): void {
  expect(cond).toBe(true)
}

// testVdfBasic.cpp:40
const NUM_POINTS = 10000

// testVdfBasic.cpp:42-60
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

// testVdfBasic.cpp:63-79
function TranslatePoints(context: VdfContext): void {
  // We only expect one value for the "axis" input.
  const axis = context.getInputValue<GfVec3d>(GfVec3dType, _tokens.axis)

  // We don't know how many inputs we will have for the "moves" input, so we
  // will use an iterator, that we'll also use to output our data into.
  const iter = new VdfReadWriteIterator<GfVec3d>(GfVec3dType, context, _tokens.moves)

  // Now loop over all of our inputs and translate the points.
  for (; !iter.isAtEnd(); iter.increment()) {
    iter.derefAssign(iter.deref().add(axis))
  }
}

// testVdfBasic.cpp:81-91
function AddPoints(context: VdfContext): void {
  const iter = new VdfReadWriteIterator<GfVec3d>(GfVec3dType, context, _tokens.input1)

  const iter2 = new VdfReadIterator<GfVec3d>(GfVec3dType, context, _tokens.input2)

  for (; !iter.isAtEnd(); iter.increment(), iter2.increment()) {
    iter.derefAssign(iter.deref().add(iter2.deref()))
  }
}

// testVdfBasic.cpp:93-114
function MakeTranslateChain(
  graph: VdfTestUtils.Network,
  translateNodeType: VdfTestUtils.CallbackNodeType,
  first: string, axis: string,
  axisMask: VdfMask, num: number): string {
  const allOnes = VdfMask.allOnes(NUM_POINTS)

  let prev = first
  let current = ''
  for (let i = 0; i < num; ++i) {
    current = first + '_' + String(i)
    graph.add(current, translateNodeType)

    graph.Get(axis).shiftRight(graph.Get(current).in(_tokens.axis, axisMask))
    graph.Get(prev).shiftRight(graph.Get(current).in(_tokens.moves, allOnes))

    prev = current
  }
  return prev
}

// testVdfBasic.cpp:116-218
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

  const generatePointsType = new VdfTestUtils.CallbackNodeType(GeneratePoints)
  generatePointsType
    .out(GfVec3dType, _tokens.out)

  graph.add('inputPoints1', generatePointsType)
  graph.add('inputPoints2', generatePointsType)
  graph.add('inputPoints3', generatePointsType)
  graph.add('inputPoints4', generatePointsType)

  const translatePointsType = new VdfTestUtils.CallbackNodeType(TranslatePoints)
  translatePointsType
    .Read(GfVec3dType, _tokens.axis)
    .readWrite(GfVec3dType, _tokens.moves, _tokens.out)

  graph.add('Translate1', translatePointsType)
  graph.add('Translate2', translatePointsType)
  graph.add('Translate3', translatePointsType)
  graph.add('Translate4', translatePointsType)

  const addPointsType = new VdfTestUtils.CallbackNodeType(AddPoints)
  addPointsType
    .readWrite(GfVec3dType, _tokens.input1, _tokens.out)
    .Read(GfVec3dType, _tokens.input2)

  graph.add('AddPoints1', addPointsType)
  graph.add('AddPoints2', addPointsType)
  graph.add('AddPointsFinal', addPointsType)

  const allOnes = VdfMask.allOnes(NUM_POINTS)

  const numTranslates = 50

  graph.Get('axisInputs').shiftRight(graph.Get('Translate1').in(_tokens.axis, axis1Mask))
  graph.Get('inputPoints1').shiftRight(graph.Get('Translate1').in(_tokens.moves, allOnes))

  const lastChain1 = MakeTranslateChain(graph, translatePointsType,
    'Translate1', 'axisInputs', axis1Mask, numTranslates)

  graph.Get('axisInputs').shiftRight(graph.Get('Translate2').in(_tokens.axis, axis2Mask))
  graph.Get('inputPoints2').shiftRight(graph.Get('Translate2').in(_tokens.moves, allOnes))

  const lastChain2 = MakeTranslateChain(graph, translatePointsType,
    'Translate2', 'axisInputs', axis2Mask, numTranslates)

  graph.Get('axisInputs').shiftRight(graph.Get('Translate3').in(_tokens.axis, axis3Mask))
  graph.Get('inputPoints3').shiftRight(graph.Get('Translate3').in(_tokens.moves, allOnes))

  const lastChain3 = MakeTranslateChain(graph, translatePointsType,
    'Translate3', 'axisInputs', axis3Mask, numTranslates)

  graph.Get('axisInputs').shiftRight(graph.Get('Translate4').in(_tokens.axis, axis4Mask))
  graph.Get('inputPoints4').shiftRight(graph.Get('Translate4').in(_tokens.moves, allOnes))

  const lastChain4 = MakeTranslateChain(graph, translatePointsType,
    'Translate4', 'axisInputs', axis4Mask, numTranslates)

  graph.Get(lastChain1).shiftRight(graph.Get('AddPoints1').in(_tokens.input1, allOnes))
  graph.Get(lastChain2).shiftRight(graph.Get('AddPoints1').in(_tokens.input2, allOnes))
  graph.Get(lastChain3).shiftRight(graph.Get('AddPoints2').in(_tokens.input1, allOnes))
  graph.Get(lastChain4).shiftRight(graph.Get('AddPoints2').in(_tokens.input2, allOnes))

  graph.Get('AddPoints1').shiftRight(graph.Get('AddPointsFinal').in(_tokens.input1, allOnes))
  graph.Get('AddPoints2').shiftRight(graph.Get('AddPointsFinal').in(_tokens.input2, allOnes))

  return graph.Get('AddPointsFinal').getVdfNode()
}

// testVdfBasic.cpp:263-273
function EmptyOutputProducer(context: VdfContext): void {
  // If we have an input value, set it on our output. Otherwise, set an empty
  // output value.
  if (context.hasInputValue(_tokens.input1)) {
    context.setOutput(context.getInputValue<number>(intType, _tokens.input1))
  } else {
    context.setEmptyOutput()
  }
}

// testVdfBasic.cpp:275-283
function EmptyOutputConsumer(context: VdfContext): void {
  if (context.hasInputValue(_tokens.input1)) {
    context.setOutput('got value')
  } else {
    context.setOutput('no value')
  }
}

// testVdfBasic.cpp:377-381
function ReferencerNode(context: VdfContext): void {
  context.setOutputToReferenceInput(_tokens.input1)
}

// testVdfBasic.cpp:428-447: a struct that counts the number of copies that
// are made of any instance. TS has no copy constructor or copy assignment
// to hook; a value is copied only where the library copies it explicitly.
class CopyCounter {
  static numCopies = 0

  Equals(_rhs: CopyCounter): boolean {
    return true
  }
}
const CopyCounterType = TfType.define('CopyCounter')

describe('testVdfBasic', () => {
  // testVdfBasic.cpp:220-257
  it('runSimpleTest', () => {
    const exec = new VdfSimpleExecutor()
    const graph = new VdfTestUtils.Network()

    const node = BuildTestNetwork1(graph)

    // Print the network. This covers the code in dump stats and checks that
    // it doesn't crash.
    graph.getNetwork().dumpStats({ write: () => undefined })

    const allOnes = new VdfMask(NUM_POINTS)
    allOnes.setAll()
    const request = new VdfRequest(new VdfMaskedOutput(node.GetOutput(), allOnes))

    const schedule = new VdfSchedule()
    VdfScheduler.schedule(request, schedule, true /* topologicalSort */)

    exec.run(schedule)

    // testVdfBasic.cpp:247-250 prints the result; upstream asserts nothing
    // about it beyond the value being available.
    const result = exec.getOutputValue(node.GetOutput()!, allOnes)!
      .getReadAccessor<GfVec3d>(GfVec3dType).Get(0)
    expect(result).toBeInstanceOf(GfVec3d)
  })

  // testVdfBasic.cpp:285-371
  it('runEmptyOutputTest', () => {
    const exec = new VdfSimpleExecutor()
    const graph = new VdfTestUtils.Network()

    const allOnes = VdfMask.allOnes(2)

    // A producer node type that sets an empty value on its output if its
    // input is connected. Otherwise, it copies its input value to its output.
    const producerType = new VdfTestUtils.CallbackNodeType(EmptyOutputProducer)
    producerType
      .Read(intType, _tokens.input1)
      .out(intType, _tokens.out)

    // A consumer node type that reads its input and outputs "got value" if
    // it gets a non-empty value and "no value" otherwise.
    const consumerType = new VdfTestUtils.CallbackNodeType(EmptyOutputConsumer)
    consumerType
      .Read(intType, _tokens.input1)
      .out(stringType, _tokens.out)

    // Connect a producer that outputs an empty value to a consumer.
    graph.add('nodeWithEmptyResult', producerType)
    graph.add('nodeWithEmptyInputValue', consumerType)
    graph.Get('nodeWithEmptyResult')
      .shiftRight(graph.Get('nodeWithEmptyInputValue').in(_tokens.input1, allOnes))

    // Connect a source input to a producer, which will then output a
    // non-empty value, and connect the producer's output to a consumer.
    graph.addInputVector(intType, 'sourceInput', 2)
    graph.Get('sourceInput').setValue(0, 42)
    graph.add('nodeWithNonEmptyResult', producerType)
    graph.Get('sourceInput')
      .shiftRight(graph.Get('nodeWithNonEmptyResult').in(_tokens.input1, allOnes))
    graph.add('nodeWithNonEmptyInputValue', consumerType)
    graph.Get('nodeWithNonEmptyResult')
      .shiftRight(graph.Get('nodeWithNonEmptyInputValue').in(_tokens.input1, allOnes))

    const nodeWithEmptyResult = graph.Get('nodeWithEmptyResult').getVdfNode()
    TF_AXIOM(!!nodeWithEmptyResult)
    const nodeWithEmptyInputValue = graph.Get('nodeWithEmptyInputValue').getVdfNode()
    TF_AXIOM(!!nodeWithEmptyInputValue)
    const nodeWithNonEmptyInputValue = graph.Get('nodeWithNonEmptyInputValue').getVdfNode()
    TF_AXIOM(!!nodeWithNonEmptyInputValue)

    const request = new VdfRequest([
      new VdfMaskedOutput(nodeWithEmptyResult.GetOutput(), allOnes),
      new VdfMaskedOutput(nodeWithEmptyInputValue.GetOutput(), allOnes),
      new VdfMaskedOutput(nodeWithNonEmptyInputValue.GetOutput(), allOnes)])
    const schedule = new VdfSchedule()
    VdfScheduler.schedule(request, schedule, /* topologicalSort */ true)
    exec.run(schedule)

    // Get a result from an output that was set to an empty value.
    const emptyResult = exec.getOutputValue(
      nodeWithEmptyResult.GetOutput()!, allOnes)!.getReadAccessor<number>(intType)
    TF_AXIOM(emptyResult.getNumValues() === 0)

    // Get a result from an output that resulted from the node that read an
    // empty value.
    const emptyInputResult = exec.getOutputValue(
      nodeWithEmptyInputValue.GetOutput()!, allOnes)!.getReadAccessor<string>(stringType)
    TF_AXIOM(emptyInputResult.getNumValues() === 1)
    TF_AXIOM(emptyInputResult.Get(0) === 'no value')

    // Get a result from an output that resulted from the node that read a
    // non-empty value.
    const nonEmptyInputResult = exec.getOutputValue(
      nodeWithNonEmptyInputValue.GetOutput()!, allOnes)!.getReadAccessor<string>(stringType)
    TF_AXIOM(nonEmptyInputResult.getNumValues() === 1)
    TF_AXIOM(nonEmptyInputResult.Get(0) === 'got value')
  })

  // testVdfBasic.cpp:383-424
  it('runReferenceTest', () => {
    const exec = new VdfSimpleExecutor()
    const graph = new VdfTestUtils.Network()

    const allOnes = VdfMask.allOnes(2)
    graph.addInputVector(intType, 'refInputs', 2)
    graph.Get('refInputs')
      .setValue(0, 42)
      .setValue(1, 24)

    const referencerType = new VdfTestUtils.CallbackNodeType(ReferencerNode)
    referencerType
      .Read(intType, _tokens.input1)
      .out(intType, _tokens.out)

    graph.add('refNode', referencerType)

    graph.Get('refInputs').shiftRight(graph.Get('refNode').in(_tokens.input1, allOnes))

    const refNode = graph.Get('refNode').getVdfNode()

    const request = new VdfRequest(new VdfMaskedOutput(refNode.GetOutput(), allOnes))

    const schedule = new VdfSchedule()
    VdfScheduler.schedule(request, schedule, true /* topologicalSort */)

    exec.run(schedule)

    const result = exec.getOutputValue(
      refNode.GetOutput()!, allOnes)!.getReadAccessor<number>(intType)

    TF_AXIOM(result.getNumValues() === 2)
    TF_AXIOM(result.Get(0) === 42)
    TF_AXIOM(result.Get(1) === 24)
  })

  // testVdfBasic.cpp:451-472: make sure we move data into an input vector
  // when we expect to. Upstream's last check expects SetValue(const T&) of an
  // lvalue to copy once. JavaScript has no copy or move overloads
  // (PLATFORM-DIVERGENCE(js-no-copy-move), inputVector.ts), so here both calls
  // store the value without a copy, as the move does upstream, and the last
  // check expects 0.
  it('runInputVectorMoveDataTest', () => {
    const graph = new VdfTestUtils.Network()
    const inputVector = new VdfInputVector<CopyCounter>(
      CopyCounterType, graph.getNetwork(), /* size */ 1)

    // We start with a zero counter initially.
    TF_AXIOM(CopyCounter.numCopies === 0)

    // Ensure no copies are made when we move the value in.
    const value1 = new CopyCounter()
    inputVector.setValue(0, value1)
    TF_AXIOM(CopyCounter.numCopies === 0)

    const value2 = new CopyCounter()
    inputVector.setValue(0, value2)
    TF_AXIOM(CopyCounter.numCopies === 0)
  })
})
