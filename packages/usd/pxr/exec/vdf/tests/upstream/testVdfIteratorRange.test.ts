// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfIteratorRange.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfIteratorRange.cpp
//
// The STL algorithms the upstream callbacks run over iterator ranges
// (std::vector range construction, std::copy, std::count, std::find,
// std::fill, std::transform) are spelled out by the helpers below over the
// iterators' Clone/Equals/Increment/Deref API. `std::pair<int, int>` values
// are [number, number] tuples of a TfType named after the C++ type. The native
// test (testVdfIteratorRange, OpenUSD 26.11.1) posts no diagnostics.

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TfErrorMark, Token as TfToken, Type as TfType } from 'typescript-usd/tf'
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
import { VdfReadIteratorRange } from '../../src/readIteratorRange.ts'
import { VdfReadWriteIterator } from '../../src/readWriteIterator.ts'
import { VdfReadWriteIteratorRange } from '../../src/readWriteIteratorRange.ts'
import { VdfRequest } from '../../src/request.ts'
import { VdfSchedule } from '../../src/schedule.ts'
import { VdfScheduler } from '../../src/scheduler.ts'
import { VdfSimpleExecutor } from '../../src/simpleExecutor.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'

const intType = VtValueTypes.int
const pairIntIntType = TfType.define('std::pair<int, int>')
type PairIntInt = [number, number]

// testVdfIteratorRange.cpp:30-34
const _tokens = {
  in: TfToken('in'),
  out: TfToken('out'),
}

interface _Iterator<V> {
  Clone(): _Iterator<V>
  Equals(rhs: never): boolean
  increment(): unknown
  deref(): V
}

function _Equals<V>(lhs: _Iterator<V>, rhs: _Iterator<V>): boolean {
  return (lhs.Equals as (rhs: _Iterator<V>) => boolean)(rhs)
}

// std::vector<T>(first, last)
function _Collect<V>(first: _Iterator<V>, last: _Iterator<V>): V[] {
  const result: V[] = []
  for (const i = first.Clone(); !_Equals(i, last); i.increment()) {
    result.push(i.deref())
  }
  return result
}

// std::count(first, last, value)
function _Count<V>(first: _Iterator<V>, last: _Iterator<V>, value: V): number {
  return _Collect(first, last).filter((v) => v === value).length
}

// std::find(first, last, value)
function _Find<V>(first: _Iterator<V>, last: _Iterator<V>, value: V): _Iterator<V> {
  const i = first.Clone()
  for (; !_Equals(i, last); i.increment()) {
    if (i.deref() === value) {
      break
    }
  }
  return i
}

// std::fill(first, last, value)
function _Fill<V>(first: VdfReadWriteIterator<V>, last: VdfReadWriteIterator<V>, value: V): void {
  for (const i = first.Clone(); !i.Equals(last); i.increment()) {
    i.derefAssign(value)
  }
}

// std::transform(first, last, dest, fn)
function _Transform<V>(
  first: VdfReadWriteIterator<V>,
  last: VdfReadWriteIterator<V>,
  dest: VdfReadWriteIterator<V>,
  fn: (v: V) => V,
): void {
  const d = dest.Clone()
  for (const i = first.Clone(); !i.Equals(last); i.increment(), d.increment()) {
    d.derefAssign(fn(i.deref()))
  }
}

// std::copy(first, last, dest) from an array
function _CopyFromArray<V>(values: readonly V[], dest: VdfReadWriteIterator<V>): void {
  const d = dest.Clone()
  for (const v of values) {
    d.derefAssign(v)
    d.increment()
  }
}

// testVdfIteratorRange.cpp:36-106 (template < int N >)
function ReadCallback(N: number): (context: VdfContext) => void {
  return (context: VdfContext): void => {
    const range = new VdfReadIteratorRange<number>(intType, context, _tokens.in)

    // If this is an empty range ...
    if (N === 0) {
      TF_AXIOM(range.IsEmpty(), 'range.IsEmpty()')
      TF_AXIOM(range.begin().Equals(range.end()), 'range.begin() == range.end()')
      TF_AXIOM(range.begin().isAtEnd(), 'range.begin().IsAtEnd()')
      TF_AXIOM(range.end().isAtEnd(), 'range.end().IsAtEnd()')
      context.setOutput(N)
      return
    }

    // Range size must match N
    TF_AXIOM(range.begin().computeSize() === N, 'range.begin().ComputeSize() == N')

    // Ranges should match up with VdfReadIterator
    const it = new VdfReadIterator<number>(intType, context, _tokens.in)

    // Begin should not be at end at this point.
    const begin = range.begin()
    TF_AXIOM(!begin.isAtEnd(), '!begin.IsAtEnd()')
    TF_AXIOM(begin.Equals(it), 'begin == it')

    // End should always be at end.
    const end = range.end()
    TF_AXIOM(end.isAtEnd(), 'end.IsAtEnd()')

    // Iterate and compare.
    for (; begin.notEquals(end); begin.increment(), it.increment()) {
      TF_AXIOM(begin.Equals(it), 'begin == it')
      TF_AXIOM(begin.deref() === it.deref(), '*begin == *it')
    }

    TF_AXIOM(begin.isAtEnd(), 'begin.IsAtEnd()')
    TF_AXIOM(it.isAtEnd(), 'it.IsAtEnd()')
    TF_AXIOM(it.Equals(begin) && it.Equals(end), 'it == begin && it == end')

    // Range-based for loops should work on iterator ranges.
    let i = 0
    for (const x of range) {
      TF_AXIOM(x === i, 'x == i')
      ++i
    }
    TF_AXIOM(i === N, 'i == N')

    // Vector insertion should work on iterator ranges.
    const v1 = _Collect(range.begin(), range.end())
    for (let i = 0; i < v1.length; ++i) {
      TF_AXIOM(v1[i] === i, 'v1[i] == static_cast<int>(i)')
    }

    // Copy should work on iterator ranges.
    const v2 = new Array<number>(range.begin().computeSize()).fill(0)
    _Collect(range.begin(), range.end()).forEach((v, j) => { v2[j] = v })
    for (let i = 0; i < v2.length; ++i) {
      TF_AXIOM(v2[i] === i, 'v2[i] == static_cast<int>(i)')
    }

    // Count should work on iterator ranges.
    TF_AXIOM(_Count(range.begin(), range.end(), 0) === 1,
      'std::count(range.begin(), range.end(), 0) == 1')

    // Find should work on iterator ranges.
    TF_AXIOM(_Equals(_Find(range.begin(), range.end(), 0), range.begin()),
      'std::find(range.begin(), range.end(), 0) == range.begin()')
    TF_AXIOM(_Equals(_Find(range.begin(), range.end(), N + 1), range.end()),
      'std::find(range.begin(), range.end(), N + 1) == range.end()')

    context.setOutput(N)
  }
}

// testVdfIteratorRange.cpp:108-124
function CreateReadNode(N: number, net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readConnector(intType, _tokens.in)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, ReadCallback(N))
}

// testVdfIteratorRange.cpp:126-134
function CreateInputNode(net: VdfNetwork, num: number, offset: number): VdfInputVector<number> {
  const input = new VdfInputVector<number>(intType, net, num)
  for (let i = 0; i < num; ++i) {
    input.setValue(i, i + offset)
  }
  return input
}

// testVdfIteratorRange.cpp:136-179
function BoxedInputCallback(context: VdfContext): void {
  const numAndOffset = context.getInputValue<PairIntInt>(pairIntIntType, _tokens.in)
  const num = numAndOffset[0]
  const offset = numAndOffset[1]

  // Create a new boxed value of size num.
  VdfReadWriteIterator.allocate<number>(intType, context, num)

  // Filling a range should work.
  const range = new VdfReadWriteIteratorRange<number>(intType, context)
  _Fill(range.begin(), range.end(), 1)

  // Counting on a range should work.
  TF_AXIOM(_Count(range.begin(), range.end(), 1) === num,
    'std::count(range.begin(), range.end(), 1) == num')

  // Find should work.
  TF_AXIOM(_Equals(_Find(range.begin(), range.end(), 1), range.begin()),
    'std::find(range.begin(), range.end(), 1) == range.begin()')
  TF_AXIOM(_Equals(_Find(range.begin(), range.end(), num + 1), range.end()),
    'std::find(range.begin(), range.end(), num + 1) == range.end()')

  // Copying from a vector should work.
  const v = new Array<number>(num).fill(2)
  _CopyFromArray(v, range.begin())

  // Transforming should work.
  _Transform(range.begin(), range.end(), range.begin(), (v) => v + 1)

  // Range-based for loop should work.
  for (const v of range) {
    TF_AXIOM(v === 3, 'v == 3')
  }

  // Fill the output value with values different for each element.
  const rwit = new VdfReadWriteIterator<number>(intType, context)
  for (let i = 0; !rwit.isAtEnd(); ++i, rwit.increment()) {
    rwit.derefAssign(i + offset)
  }
}

// testVdfIteratorRange.cpp:181-196
function CreateBoxedInputNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readConnector(pairIntIntType, _tokens.in)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, BoxedInputCallback)
}

// testVdfIteratorRange.cpp:198-279
function TestIteratorRange(): void {
  const net = new VdfNetwork()

  // Create a bunch of input nodes to supply arrays of integers
  const in100 = CreateInputNode(net, 100, 0)
  const in50_1 = CreateInputNode(net, 50, 0)
  const in50_2 = CreateInputNode(net, 50, 50)

  // Create a bunch of input nodes to supply boxed integer values
  const num100 = new VdfInputVector<PairIntInt>(pairIntIntType, net, 1)
  num100.setValue(0, [100, 0])
  const boxedIn100 = CreateBoxedInputNode(net)
  net.connect(num100.GetOutput(), boxedIn100, _tokens.in, VdfMask.allOnes(1))

  const num50_1 = new VdfInputVector<PairIntInt>(pairIntIntType, net, 1)
  num50_1.setValue(0, [50, 0])
  const boxedIn50_1 = CreateBoxedInputNode(net)
  net.connect(num50_1.GetOutput(), boxedIn50_1, _tokens.in, VdfMask.allOnes(1))

  // Create a bunch of nodes that read the array and boxed inputs in various
  // combinations, always totalling 100 elements. The elements will be read
  // using the VdfReadIteratorRange.
  const read0 = CreateReadNode(0, net)

  const read100 = CreateReadNode(100, net)
  net.connect(in100.GetOutput(), read100, _tokens.in, VdfMask.allOnes(100))

  const read50 = CreateReadNode(50, net)
  net.connect(in50_1.GetOutput(), read50, _tokens.in, VdfMask.allOnes(50))

  const read50_50 = CreateReadNode(100, net)
  net.connect(in50_1.GetOutput(), read50_50, _tokens.in, VdfMask.allOnes(50))
  net.connect(in50_2.GetOutput(), read50_50, _tokens.in, VdfMask.allOnes(50))

  const readBoxed50 = CreateReadNode(50, net)
  net.connect(boxedIn50_1.GetOutput(), readBoxed50, _tokens.in, VdfMask.allOnes(1))

  const readBoxedMixed = CreateReadNode(100, net)
  net.connect(boxedIn50_1.GetOutput(), readBoxedMixed, _tokens.in, VdfMask.allOnes(1))
  net.connect(in50_2.GetOutput(), readBoxedMixed, _tokens.in, VdfMask.allOnes(50))

  // Create a request with all these read nodes in it
  const mos: VdfMaskedOutputVector = []
  mos.push(new VdfMaskedOutput(read0.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(read100.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(read50.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(read50_50.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(readBoxed50.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(readBoxedMixed.GetOutput(), VdfMask.allOnes(1)))

  // Schedule the request
  const request = new VdfRequest(mos)
  const schedule = new VdfSchedule()
  VdfScheduler.schedule(request, schedule, true /* topologicalSort */)

  // Run the request on a simple executor.
  const exec = new VdfSimpleExecutor()
  exec.run(schedule)
}

describe('testVdfIteratorRange', () => {
  it('TestIteratorRange', () => {
    const mark = new TfErrorMark()
    TestIteratorRange()
    expect(mark.isClean()).toBe(true)
  })
})
