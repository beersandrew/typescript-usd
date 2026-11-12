// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfReadWriteIterator.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfReadWriteIterator.cpp
//
// The upstream callbacks check with TF_VERIFY, which posts a coding error on
// failure; the native test (testVdfReadWriteIterator, OpenUSD 26.11.1)
// posts none, which the error mark checks. `*it = v` is `it.DerefAssign(v)`;
// std::fill and std::transform are spelled out by the helpers below.

import { describe, expect, it } from 'vitest'
import {
  TF_VERIFY,
  TfCompressedBits,
  TfErrorMark,
  Token as TfToken,
} from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import { VdfInputSpecs, VdfOutputSpecs } from '../../src/connectorSpecs.ts'
import type { VdfContext } from '../../src/context.ts'
import { VdfInputVector } from '../../src/inputVector.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import type { VdfMaskedOutputVector } from '../../src/maskedOutputVector.ts'
import { VdfNetwork } from '../../src/network.ts'
import type { VdfNode } from '../../src/node.ts'
import { VdfReadIterator } from '../../src/readIterator.ts'
import { VdfReadWriteIterator } from '../../src/readWriteIterator.ts'
import { VdfReadWriteIteratorRange } from '../../src/readWriteIteratorRange.ts'
import { VdfRequest } from '../../src/request.ts'
import { VdfSchedule } from '../../src/schedule.ts'
import { VdfScheduler } from '../../src/scheduler.ts'
import { VdfSimpleExecutor } from '../../src/simpleExecutor.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'

const intType = VtValueTypes.int

// testVdfReadWriteIterator.cpp:28-32
const _tokens = {
  in: TfToken('in'),
  out: TfToken('out'),
}

// testVdfReadWriteIterator.cpp:34
const N = 1000

// std::fill(first, last, value)
function _Fill(first: VdfReadWriteIterator<number>, last: VdfReadWriteIterator<number>,
  value: number): void {
  for (const i = first.Clone(); !i.Equals(last); i.increment()) {
    i.derefAssign(value)
  }
}

// testVdfReadWriteIterator.cpp:36-91
function ReadCallback(context: VdfContext): void {
  const rit = new VdfReadIterator<number>(intType, context, _tokens.in)
  TF_VERIFY(!rit.isAtEnd(), '!rit.IsAtEnd()')

  // Allocate a boxed value with a named output.
  let it = VdfReadWriteIterator.allocate<number>(intType, context, _tokens.out, N)
  let range = new VdfReadWriteIteratorRange<number>(it)
  _Fill(range.begin(), range.end(), 1)
  TF_VERIFY(!it.isAtEnd(), '!it.IsAtEnd()')

  // Store something.
  for (; !it.isAtEnd(); it.increment()) {
    TF_VERIFY(it.deref() === 1, '*it == 1')
    it.derefAssign(2)
  }

  // Allocate another boxed value. This should replace the existing value.
  it = VdfReadWriteIterator.allocate<number>(intType, context, N)
  range = new VdfReadWriteIteratorRange<number>(it)
  _Fill(range.begin(), range.end(), 0)
  TF_VERIFY(!it.isAtEnd(), '!it.IsAtEnd()')

  // Iterate and increment input values.
  for (; !it.isAtEnd() && !rit.isAtEnd(); it.increment(), rit.increment()) {
    TF_VERIFY(it.deref() === 0, '*it == 0')
    it.derefAssign(rit.deref() + 1)
  }

  // Verify that both iterators are at end.
  TF_VERIFY(it.isAtEnd(), 'it.IsAtEnd()')
  TF_VERIFY(rit.isAtEnd(), 'rit.IsAtEnd()')

  // Create another read/write iterator.
  const jt = new VdfReadWriteIterator<number>(intType, context)
  TF_VERIFY(!jt.isAtEnd(), '!jt.IsAtEnd()')

  // Increment once more.
  for (; !jt.isAtEnd(); jt.increment()) {
    jt.derefAssign(jt.deref() + 1)
  }

  // At end?
  TF_VERIFY(it.isAtEnd(), 'it.IsAtEnd()')
  TF_VERIFY(jt.isAtEnd(), 'jt.IsAtEnd()')

  // Both should compare equal.
  TF_VERIFY(it.Equals(jt), 'it == jt')

  // Create another read/write iterator, advance it to-end and compare.
  const kt = new VdfReadWriteIterator<number>(intType, context)
  kt.advanceToEnd()
  TF_VERIFY(jt.Equals(kt), 'jt == kt')
}

// testVdfReadWriteIterator.cpp:93-108
function CreateReadNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readConnector(intType, _tokens.in)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, ReadCallback)
}

// testVdfReadWriteIterator.cpp:110-146
function ReadWriteCallback(context: VdfContext): void {
  // Create two read/write iterators.
  const it = new VdfReadWriteIterator<number>(intType, context, _tokens.in)
  TF_VERIFY(!it.isAtEnd(), '!it.IsAtEnd()')

  const jt = new VdfReadWriteIterator<number>(intType, context, _tokens.out)
  TF_VERIFY(!jt.isAtEnd(), '!jt.IsAtEnd()')

  // Increment input values with the first iterator.
  for (; !it.isAtEnd(); it.increment()) {
    it.derefAssign(it.deref() + 1)
  }

  // Should be at end now.
  TF_VERIFY(it.isAtEnd(), 'it.IsAtEnd()')
  TF_VERIFY(!jt.isAtEnd(), '!jt.IsAtEnd()')

  // Increment values once again with the second iterator. It should be able
  // to observe the results from the first round of iteration.
  for (; !jt.isAtEnd(); jt.increment()) {
    jt.derefAssign(jt.deref() + 1)
  }

  // Both at end?
  TF_VERIFY(it.isAtEnd(), 'it.IsAtEnd()')
  TF_VERIFY(jt.isAtEnd(), 'jt.IsAtEnd()')

  // Increment once more via std::transform.
  const begin = new VdfReadWriteIterator<number>(intType, context)
  const end = begin.Clone()
  end.advanceToEnd()
  const dest = begin.Clone()
  for (const i = begin.Clone(); !i.Equals(end); i.increment(), dest.increment()) {
    dest.derefAssign(i.deref() + 1)
  }
}

// testVdfReadWriteIterator.cpp:148-163
function CreateReadWriteNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readWriteConnector(intType, _tokens.in, _tokens.out)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, ReadWriteCallback)
}

// testVdfReadWriteIterator.cpp:165-173
function CreateInputNode(net: VdfNetwork, num: number, _offset: number): VdfInputVector<number> {
  const input = new VdfInputVector<number>(intType, net, num)
  for (let i = 0; i < num; ++i) {
    input.setValue(i, 0)
  }
  return input
}

// testVdfReadWriteIterator.cpp:175-185
function BoxedInputCallback(context: VdfContext): void {
  const num = context.getInputValue<number>(intType, _tokens.in)
  const range = new VdfReadWriteIteratorRange<number>(
    VdfReadWriteIterator.allocate<number>(intType, context, num))
  _Fill(range.begin(), range.end(), 0)
}

// testVdfReadWriteIterator.cpp:187-202
function CreateBoxedInputNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readConnector(intType, _tokens.in)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, BoxedInputCallback)
}

// testVdfReadWriteIterator.cpp:204-223
function VerifyResults(
  exec: VdfSimpleExecutor,
  mo: VdfMaskedOutput,
  begin: number,
  end: number,
  expected: number,
): void {
  const v = exec.getOutputValue(mo.GetOutput()!, mo.GetMask())!
  const a = v.getReadAccessor<number>(intType)
  for (let i = begin; i < end; ++i) {
    if (a.Get(i) !== expected) {
      console.log(`   a[${i}] = ${a.Get(i)}, expected = ${expected}`)
      TF_VERIFY(a.Get(i) === expected, 'a[i] == expected')
    }
  }
}

// testVdfReadWriteIterator.cpp:225-313
function TestReadWriteIterator(): void {
  const net = new VdfNetwork()

  // Create an input node that supplies a vector of integers
  const inVec = CreateInputNode(net, N, 0)

  // Create an input node that supplies a boxed vector of integers
  const num = new VdfInputVector<number>(intType, net, 1)
  num.setValue(0, N)
  const inBoxed = CreateBoxedInputNode(net)
  net.connect(num.GetOutput(), inBoxed, _tokens.in, VdfMask.allOnes(1))

  // Create a node that reads the vector of integers.
  const readVec0 = CreateReadNode(net)
  net.connect(inVec.GetOutput(), readVec0, _tokens.in, VdfMask.allOnes(N))

  // Create a small chain of nodes that read the boxed vector of integers.
  const readBoxed0 = CreateReadNode(net)
  net.connect(inBoxed.GetOutput(), readBoxed0, _tokens.in, VdfMask.allOnes(1))
  const readBoxed1 = CreateReadNode(net)
  net.connect(readBoxed0.GetOutput(), readBoxed1, _tokens.in, VdfMask.allOnes(1))

  // Create a small chain of nodes that read/write the vector of integers.
  const readWriteVec0 = CreateReadWriteNode(net)
  readWriteVec0.GetOutput()!.setAffectsMask(VdfMask.allOnes(N))
  net.connect(inVec.GetOutput(), readWriteVec0, _tokens.in, VdfMask.allOnes(N))

  const bits = new TfCompressedBits(N, 0, (N / 2) - 1)
  const readWriteVec1 = CreateReadWriteNode(net)
  readWriteVec1.GetOutput()!.setAffectsMask(new VdfMask(bits))
  net.connect(readWriteVec0.GetOutput(), readWriteVec1, _tokens.in, VdfMask.allOnes(N))

  // Create a small chain of nodes that read/write the boxed vector.
  const readWriteBoxed0 = CreateReadWriteNode(net)
  readWriteBoxed0.GetOutput()!.setAffectsMask(VdfMask.allOnes(1))
  net.connect(inBoxed.GetOutput(), readWriteBoxed0, _tokens.in, VdfMask.allOnes(1))
  const readWriteBoxed1 = CreateReadWriteNode(net)
  readWriteBoxed1.GetOutput()!.setAffectsMask(VdfMask.allOnes(1))
  net.connect(readWriteBoxed0.GetOutput(), readWriteBoxed1, _tokens.in, VdfMask.allOnes(1))

  // Create a request with all the leaf nodes in it.
  const mos: VdfMaskedOutputVector = []
  mos.push(new VdfMaskedOutput(readVec0.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(readBoxed1.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(readWriteVec1.GetOutput(), VdfMask.allOnes(N)))
  mos.push(new VdfMaskedOutput(readWriteBoxed1.GetOutput(), VdfMask.allOnes(1)))

  // Schedule the request
  const request = new VdfRequest(mos)
  const schedule = new VdfSchedule()
  VdfScheduler.schedule(request, schedule, true /* topologicalSort */)

  // Run the request on a simple executor.
  const exec = new VdfSimpleExecutor()
  exec.run(schedule)

  // Verify results for each output.
  // Verify read with vectorized data.
  VerifyResults(exec, mos[0]!, 0, N, 2)

  // Verify read with boxed data.
  VerifyResults(exec, mos[1]!, 0, N, 4)

  // Verify read/write with vectorized data.
  VerifyResults(exec, mos[2]!, 0, N / 2, 6)
  VerifyResults(exec, mos[2]!, N / 2, N, 3)

  // Verify read/write with boxed data.
  VerifyResults(exec, mos[3]!, 0, N, 6)
}

describe('testVdfReadWriteIterator', () => {
  it('TestReadWriteIterator', () => {
    const mark = new TfErrorMark()
    TestReadWriteIterator()
    expect(mark.isClean()).toBe(true)
  })
})
