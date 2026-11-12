// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfIterators.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfIterators.cpp
//
// Each upstream test function returns false on failure; the it() expects
// true. The callbacks' TF_AXIOMs throw, failing the run. The native test
// (testVdfIterators, OpenUSD 26.11.1) posts no diagnostics, which the
// error marks check.

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TF_CODING_ERROR, TfErrorMark, Token as TfToken } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import { VdfInputSpecs, VdfOutputSpecs } from '../../src/connectorSpecs.ts'
import type { VdfContext } from '../../src/context.ts'
import { VdfInputVector } from '../../src/inputVector.ts'
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

const doubleType = VtValueTypes.double

// testVdfIterators.cpp:31-40
const _tokens = {
  in: TfToken('in'),
  input1: TfToken('input1'),
  readwrite: TfToken('readwrite'),
  data: TfToken('data'),
  out: TfToken('out'),
  weights: TfToken('weights'),
}

// testVdfIterators.cpp:42-74
function OneReadCallback(context: VdfContext): void {
  // All this callback does is reads the input and produces a vector with all
  // the inputs read.
  let size = 0
  const it = new VdfReadIterator<number>(doubleType, context, _tokens.input1)
  for (; !it.isAtEnd(); it.increment()) {
    ++size
  }

  const output = new VdfTypedVector<number>(doubleType)
  output.resize<number>(doubleType, size)
  const a = output.getReadWriteAccessor<number>(doubleType)

  let i = 0
  const inIter = new VdfReadIterator<number>(doubleType, context, _tokens.input1)
  for (; !inIter.isAtEnd(); inIter.increment(), ++i) {
    a.Set(i, inIter.deref())
  }

  // Increment past the end to trigger code coverage and ensure that we're
  // still at the end.
  inIter.increment()
  TF_AXIOM(inIter.isAtEnd(), 'inIter.IsAtEnd()')

  const rawValueAccessor = new VdfRawValueAccessor(context)
  rawValueAccessor.setOutputVector(
    new VdfTestUtils.OutputAccessor(context).GetOutput()!,
    VdfMask.allOnes(size),
    output)
}

// testVdfIterators.cpp:76-92
function CreateOneReadNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readConnector(doubleType, _tokens.input1)
    .readWriteConnector(doubleType, _tokens.readwrite, _tokens.out)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(doubleType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, OneReadCallback)
}

// testVdfIterators.cpp:94-121
function OneReadWriteCallback(context: VdfContext): void {
  // All this callback does is reads the input and produces a vector with all
  // the inputs read.
  let size = 0
  const it = new VdfReadWriteIterator<number>(doubleType, context, _tokens.readwrite)
  for (; !it.isAtEnd(); it.increment()) {
    ++size
  }

  const output = new VdfTypedVector<number>(doubleType)
  output.resize<number>(doubleType, size)
  const a = output.getReadWriteAccessor<number>(doubleType)

  let i = 0
  const inIter = new VdfReadWriteIterator<number>(doubleType, context, _tokens.readwrite)
  for (; !inIter.isAtEnd(); inIter.increment(), ++i) {
    a.Set(i, inIter.deref())
  }

  const rawValueAccessor = new VdfRawValueAccessor(context)
  rawValueAccessor.setOutputVector(
    new VdfTestUtils.OutputAccessor(context).GetOutput()!,
    VdfMask.allOnes(size),
    output)
}

// testVdfIterators.cpp:123-138
function CreateOneReadWriteNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readWriteConnector(doubleType, _tokens.readwrite, _tokens.out)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(doubleType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, OneReadWriteCallback)
}

// testVdfIterators.cpp:141-169
function RunReadIteratorTest(node: VdfNode, mask: VdfMask, expected: readonly number[]): boolean {
  const request = new VdfRequest(new VdfMaskedOutput(node.GetOutput(), mask))
  const schedule = new VdfSchedule()
  VdfScheduler.schedule(request, schedule, true /* topologicalSort */)
  const exec = new VdfSimpleExecutor()
  exec.run(schedule)

  const result = exec.getOutputValue(node.GetOutput()!, mask)!.getReadAccessor<number>(doubleType)

  if (result.getNumValues() !== expected.length) {
    TF_CODING_ERROR(
      `Expected vector of size ${expected.length}, got size ${result.getNumValues()}`)
    return false
  }

  for (let i = 0; i < expected.length; ++i) {
    if (result.Get(i) !== expected[i]) {
      TF_CODING_ERROR(`At index ${i} expected ${expected[i]} got ${result.Get(i)}`)
      return false
    }
  }

  return true
}

// testVdfIterators.cpp:173-277
function TestReadIterator(): boolean {
  // Setup a situation where we read input from an iterator with an unusual
  // mask setup on connections.

  new VdfSimpleExecutor()
  const net = new VdfNetwork()

  const in1 = new VdfInputVector<number>(doubleType, net, 3)

  in1.setValue(0, 1.0)
  in1.setValue(1, 2.0)
  in1.setValue(2, 3.0)

  // Test basic case. All ones, we should get 1, 2, 3 respectively.
  {
    const last = CreateOneReadNode(net)
    const mask3 = VdfMask.allOnes(3)

    net.connect(in1.GetOutput(), last, _tokens.input1, mask3)

    const expected = [1.0, 2.0, 3.0]
    if (!RunReadIteratorTest(last, mask3, expected)) {
      return false
    }
  }

  // Test the case where the input vector is wired in 3 times with the masks
  // such that we should expect to get the results backwards.
  {
    const last = CreateOneReadNode(net)
    const mask1 = new VdfMask(3)
    const mask2 = new VdfMask(3)
    const mask3 = new VdfMask(3)
    const allOnes = new VdfMask(3)
    mask1.setIndex(0)
    mask2.setIndex(1)
    mask3.setIndex(2)
    allOnes.setAll()

    net.connect(in1.GetOutput(), last, _tokens.input1, mask3)
    net.connect(in1.GetOutput(), last, _tokens.input1, mask2)
    net.connect(in1.GetOutput(), last, _tokens.input1, mask1)

    const expected = [3.0, 2.0, 1.0]
    if (!RunReadIteratorTest(last, allOnes, expected)) {
      return false
    }
  }

  // Test a case where the first node has an empty mask.
  {
    const last = CreateOneReadNode(net)

    const emptyMask = new VdfMask(3)
    const mask3 = new VdfMask(3)
    const allOnes = VdfMask.allOnes(3)

    mask3.setIndex(2)

    net.connect(in1.GetOutput(), last, _tokens.input1, emptyMask)
    net.connect(in1.GetOutput(), last, _tokens.input1, mask3)
    net.connect(in1.GetOutput(), last, _tokens.input1, emptyMask)

    const expected = [3.0]
    if (!RunReadIteratorTest(last, allOnes, expected)) {
      return false
    }
  }

  // Test an error condition where the input vector and the mask don't have
  // the same size.
  {
    const last = CreateOneReadNode(net)

    const emptyMask = new VdfMask(0)
    const allOnes = VdfMask.allOnes(3)

    net.connect(in1.GetOutput(), last, _tokens.input1, emptyMask)
    const expected: number[] = []
    if (!RunReadIteratorTest(last, allOnes, expected)) {
      return false
    }
  }

  return true
}

// testVdfIterators.cpp:280-329
function TestSparseIteration(): boolean {
  // Setup a situation where we read input from an iterator with an unusual
  // mask setup on connections.

  new VdfSimpleExecutor()
  const net = new VdfNetwork()

  const in1 = new VdfInputVector<number>(doubleType, net, 3)
  in1.setDebugName('InputVector')

  in1.setValue(0, 1.0)
  in1.setValue(1, 2.0)
  in1.setValue(2, 3.0)

  // Test case where the connection has all set, but the request mask only
  // asks for the 2nd value.
  {
    const last = CreateOneReadWriteNode(net)
    last.setDebugName('OneReadWriteNode')

    const mask3 = VdfMask.allOnes(3)
    const requestMask = new VdfMask(3)
    requestMask.setIndex(1)

    net.connect(in1.GetOutput(), last, _tokens.readwrite, mask3)

    let expected = [2.0]
    if (!RunReadIteratorTest(last, requestMask, expected)) {
      return false
    }

    // Do another pull for sanity this time with a full request mask.
    requestMask.setAll()
    expected = [1.0, 2.0, 3.0]
    if (!RunReadIteratorTest(last, requestMask, expected)) {
      return false
    }
  }

  return true
}

describe('testVdfIterators', () => {
  it('TestReadIterator', () => {
    const mark = new TfErrorMark()
    expect(TestReadIterator()).toBe(true)
    expect(mark.isClean()).toBe(true)
  })

  it('TestSparseIteration', () => {
    const mark = new TfErrorMark()
    expect(TestSparseIteration()).toBe(true)
    expect(mark.isClean()).toBe(true)
  })
})
