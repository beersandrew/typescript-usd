// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfInputValuesPointer.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfInputValuesPointer.cpp
//
// `ptr.GetData()[i]` is `ptr.GetData()!.Get(i)`. The TfSpan conversion
// (`const TfSpan<const int> span = ptr`) is AsTfSpan(), which fails loudly
// (openexec-tfspan): this test is a known gap until TfSpan is ported.
// `std::pair<int, int>` values are [number, number] tuples of a TfType named
// after the C++ type. The native test
// (testVdfInputValuesPointer, OpenUSD 26.11.1) posts no diagnostics.

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TfErrorMark, Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import { VdfInputSpecs, VdfOutputSpecs } from '../../src/connectorSpecs.ts'
import type { VdfContext } from '../../src/context.ts'
import { VdfExecutionTypeRegistry } from '../../src/executionTypeRegistry.ts'
import { VdfInputValuesPointer } from '../../src/inputValuesPointer.ts'
import { VdfEmptyInputVector, VdfInputVector } from '../../src/inputVector.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import type { VdfMaskedOutputVector } from '../../src/maskedOutputVector.ts'
import { VdfNetwork } from '../../src/network.ts'
import type { VdfNode } from '../../src/node.ts'
import { VdfReadWriteIterator } from '../../src/readWriteIterator.ts'
import { VdfRequest } from '../../src/request.ts'
import { VdfSchedule } from '../../src/schedule.ts'
import { VdfScheduler } from '../../src/scheduler.ts'
import { VdfSimpleExecutor } from '../../src/simpleExecutor.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'

const intType = VtValueTypes.int
const pairIntIntType = TfType.define('std::pair<int, int>')
type PairIntInt = [number, number]

// testVdfInputValuesPointer.cpp:30-34
const _tokens = {
  in: TfToken('in'),
  out: TfToken('out'),
}

// testVdfInputValuesPointer.cpp:36-65
function ReadCallback(context: VdfContext): void {
  const ptr = new VdfInputValuesPointer<number>(intType, context, _tokens.in)

  TF_AXIOM(
    ptr.getSize() === 100 || (ptr.getSize() === 0 && !ptr.getData()),
    'ptr.GetSize() == 100 || (ptr.GetSize() == 0 && !ptr.GetData())')

  // Make sure HasInputValue agrees here, including in cases where we have
  // empty data, including boxed data.
  if (ptr.getSize() === 100) {
    TF_AXIOM(context.hasInputValue(_tokens.in), 'context.HasInputValue(_tokens->in)')
  } else {
    TF_AXIOM(!context.hasInputValue(_tokens.in), '!context.HasInputValue(_tokens->in)')
  }

  for (let i = 0; i < ptr.getSize(); ++i) {
    TF_AXIOM(ptr.getData()!.Get(i) === i, 'ptr.GetData()[i] == static_cast<int>(i)')
  }

  // Test the TfSpan type conversion. This won't compile without it.
  const span: { data(): unknown, size(): number } = ptr.asTfSpan()
  TF_AXIOM(span.data() === ptr.getData(), 'span.data() == ptr.GetData()')
  TF_AXIOM(span.size() === ptr.getSize(), 'span.size() == ptr.GetSize()')

  context.setOutput(1)
}

// testVdfInputValuesPointer.cpp:67-82
function CreateReadNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readConnector(intType, _tokens.in)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, ReadCallback)
}

// testVdfInputValuesPointer.cpp:84-92
function CreateInputNode(net: VdfNetwork, num: number, offset: number): VdfInputVector<number> {
  const input = new VdfInputVector<number>(intType, net, num)
  for (let i = 0; i < num; ++i) {
    input.setValue(i, i + offset)
  }
  return input
}

// testVdfInputValuesPointer.cpp:94-100
function CreateEmptyInputNode(net: VdfNetwork): VdfEmptyInputVector {
  return new VdfEmptyInputVector(net, intType)
}

// testVdfInputValuesPointer.cpp:102-115
function BoxedInputCallback(context: VdfContext): void {
  const numAndOffset = context.getInputValue<PairIntInt>(pairIntIntType, _tokens.in)

  const rwit = VdfReadWriteIterator.allocate<number>(intType, context, numAndOffset[0])
  for (let i = 0; !rwit.isAtEnd(); ++i, rwit.increment()) {
    rwit.derefAssign(i + numAndOffset[1])
  }
}

// testVdfInputValuesPointer.cpp:117-132
function CreateBoxedInputNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readConnector(pairIntIntType, _tokens.in)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, BoxedInputCallback)
}

// testVdfInputValuesPointer.cpp:134-278
function TestInputValuesPointer(): void {
  // Register int type needed to create empty input nodes.
  VdfExecutionTypeRegistry.define(intType, 0)

  const net = new VdfNetwork()

  // Create a bunch of input nodes to supply arrays of integers
  const in_empty = CreateEmptyInputNode(net)

  const in100 = CreateInputNode(net, 100, 0)

  const in50_1 = CreateInputNode(net, 50, 0)
  const in50_2 = CreateInputNode(net, 50, 50)

  const in20_1 = CreateInputNode(net, 20, 0)
  const in20_2 = CreateInputNode(net, 20, 20)
  const in20_3 = CreateInputNode(net, 20, 40)
  const in20_4 = CreateInputNode(net, 20, 60)
  const in20_5 = CreateInputNode(net, 20, 80)

  // Create a bunch of input nodes to supply boxed integer values

  const num0 = new VdfInputVector<PairIntInt>(pairIntIntType, net, 1)
  num0.setValue(0, [0, 0])
  const boxedIn0 = CreateBoxedInputNode(net)
  net.connect(num0.GetOutput(), boxedIn0, _tokens.in, VdfMask.allOnes(1))

  const num100 = new VdfInputVector<PairIntInt>(pairIntIntType, net, 1)
  num100.setValue(0, [100, 0])
  const boxedIn100 = CreateBoxedInputNode(net)
  net.connect(num100.GetOutput(), boxedIn100, _tokens.in, VdfMask.allOnes(1))

  const num50_1 = new VdfInputVector<PairIntInt>(pairIntIntType, net, 1)
  num50_1.setValue(0, [50, 0])
  const num50_2 = new VdfInputVector<PairIntInt>(pairIntIntType, net, 1)
  num50_2.setValue(0, [50, 50])
  const boxedIn50_1 = CreateBoxedInputNode(net)
  const boxedIn50_2 = CreateBoxedInputNode(net)
  net.connect(num50_1.GetOutput(), boxedIn50_1, _tokens.in, VdfMask.allOnes(1))
  net.connect(num50_2.GetOutput(), boxedIn50_2, _tokens.in, VdfMask.allOnes(1))

  // Create a bunch of nodes that read the array and boxed inputs in various
  // combinations, always totalling 100 elements. The elements will be read
  // using the VdfInputValuesPointer. Not all of these combinations will
  // result in contiguous memory layout in the output buffers.
  const read0 = CreateReadNode(net)

  const read0Empty = CreateReadNode(net)
  net.connect(in_empty.GetOutput(), read0Empty, _tokens.in, VdfMask.allOnes(1))

  const read100 = CreateReadNode(net)
  net.connect(in100.GetOutput(), read100, _tokens.in, VdfMask.allOnes(100))

  const read100AndEmpty = CreateReadNode(net)
  net.connect(in100.GetOutput(), read100AndEmpty, _tokens.in, VdfMask.allOnes(100))
  net.connect(in_empty.GetOutput(), read100AndEmpty, _tokens.in, VdfMask.allOnes(1))

  const read50 = CreateReadNode(net)
  net.connect(in50_1.GetOutput(), read50, _tokens.in, VdfMask.allOnes(50))
  net.connect(in50_2.GetOutput(), read50, _tokens.in, VdfMask.allOnes(50))

  const read20 = CreateReadNode(net)
  net.connect(in20_1.GetOutput(), read20, _tokens.in, VdfMask.allOnes(20))
  net.connect(in20_2.GetOutput(), read20, _tokens.in, VdfMask.allOnes(20))
  net.connect(in20_3.GetOutput(), read20, _tokens.in, VdfMask.allOnes(20))
  net.connect(in20_4.GetOutput(), read20, _tokens.in, VdfMask.allOnes(20))
  net.connect(in20_5.GetOutput(), read20, _tokens.in, VdfMask.allOnes(20))

  const readBoxed0 = CreateReadNode(net)
  net.connect(boxedIn0.GetOutput(), readBoxed0, _tokens.in, VdfMask.allOnes(1))

  const readBoxed100 = CreateReadNode(net)
  net.connect(boxedIn100.GetOutput(), readBoxed100, _tokens.in, VdfMask.allOnes(1))

  const readBoxed50 = CreateReadNode(net)
  net.connect(boxedIn50_1.GetOutput(), readBoxed50, _tokens.in, VdfMask.allOnes(1))
  net.connect(boxedIn50_2.GetOutput(), readBoxed50, _tokens.in, VdfMask.allOnes(1))

  const readBoxedMixed = CreateReadNode(net)
  net.connect(boxedIn50_1.GetOutput(), readBoxedMixed, _tokens.in, VdfMask.allOnes(1))
  net.connect(in50_2.GetOutput(), readBoxedMixed, _tokens.in, VdfMask.allOnes(50))

  // Create a request with all these read nodes in it
  const mos: VdfMaskedOutputVector = []
  mos.push(new VdfMaskedOutput(read0.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(read0Empty.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(read100.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(read100AndEmpty.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(read50.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(read20.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(readBoxed0.GetOutput(), VdfMask.allOnes(1)))
  mos.push(new VdfMaskedOutput(readBoxed100.GetOutput(), VdfMask.allOnes(1)))
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

describe('testVdfInputValuesPointer', () => {
  it('TestInputValuesPointer', () => {
    const mark = new TfErrorMark()
    TestInputValuesPointer()
    expect(mark.isClean()).toBe(true)
  })
})
