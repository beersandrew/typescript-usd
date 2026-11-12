// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfSubrangeView.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfSubrangeView.cpp
//
// TestReadIteratorSubrange builds read nodes over plain and boxed integer
// inputs in various combinations and counts the subranges a
// VdfSubrangeView<VdfReadIteratorRange<int>> visits. VerifyField's
// TF_VERIFY is an expect(); the callback's TF_VERIFY(x == 1) is collected
// and checked with the results. The Result struct is a TS class named with
// TfType.

import { describe, expect, it } from 'vitest'
import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import { Vdf_BoxedContainer } from '../../src/boxedContainer.ts'
import { VdfInputSpecs, VdfOutputSpecs } from '../../src/connectorSpecs.ts'
import type { VdfContext } from '../../src/context.ts'
import { VdfInputVector } from '../../src/inputVector.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import { VdfNetwork } from '../../src/network.ts'
import type { VdfNode } from '../../src/node.ts'
import { VdfRequest } from '../../src/request.ts'
import { VdfSchedule } from '../../src/schedule.ts'
import { VdfScheduler } from '../../src/scheduler.ts'
import { VdfSimpleExecutor } from '../../src/simpleExecutor.ts'
import { VdfSubrangeView } from '../../src/subrangeView.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'

const intType = VtValueTypes.int

// testVdfSubrangeView.cpp:27-31
const _tokens = {
  in: TfToken('in'),
  out: TfToken('out'),
}

// testVdfSubrangeView.cpp:33-40
class Result {
  constructor(
    public numRanges: number,
    public numEmpty: number,
    public numNonEmpty: number,
    public numElements: number) {}
}
const ResultType = TfType.define('Result')

// Values the callbacks' TF_VERIFY(x == 1) saw that were not 1.
const _unexpectedElements: number[] = []

// testVdfSubrangeView.cpp:44-66
function ReadCallback(context: VdfContext): void {
  const result = new Result(0, 0, 0, 0)

  const subranges = new VdfSubrangeView<number>(intType, context, _tokens.in)
  for (const range of subranges) {
    ++result.numRanges

    if (range.IsEmpty()) {
      ++result.numEmpty
    } else {
      ++result.numNonEmpty
    }

    for (const x of range) {
      ++result.numElements
      if (x !== 1) {
        _unexpectedElements.push(x)
      }
    }
  }

  context.setOutput(result)
}

// testVdfSubrangeView.cpp:68-83
function CreateReadNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readConnector(intType, _tokens.in)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(ResultType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, ReadCallback)
}

// testVdfSubrangeView.cpp:85-93
function CreateInputNode(net: VdfNetwork, num: number, value: number): VdfInputVector<number> {
  const inp = new VdfInputVector<number>(intType, net, num)
  for (let i = 0; i < num; ++i) {
    inp.setValue(i, value)
  }
  return inp
}

// testVdfSubrangeView.cpp:95-107
function BoxedInputCallbackA(context: VdfContext): void {
  const ten = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
  const zero: number[] = []

  const result = new Vdf_BoxedContainer<number>(intType)
  result.appendRange(zero)
  result.appendRange(ten)
  result.appendRange(zero)

  context.setOutput(result)
}

// testVdfSubrangeView.cpp:109-122
function BoxedInputCallbackB(context: VdfContext): void {
  const ten = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
  const zero: number[] = []

  const result = new Vdf_BoxedContainer<number>(intType)
  result.appendRange(ten)
  result.appendRange(zero)
  result.appendRange(ten)
  result.appendRange(ten)

  context.setOutput(result)
}

// testVdfSubrangeView.cpp:124-129
function BoxedInputCallback0(context: VdfContext): void {
  const result = new Vdf_BoxedContainer<number>(intType, 0)
  context.setOutput(result)
}

// testVdfSubrangeView.cpp:131-144
function CreateBoxedInputNode(net: VdfNetwork, callback: (context: VdfContext) => void): VdfNode {
  const inspec = new VdfInputSpecs()

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, callback)
}

// testVdfSubrangeView.cpp:146-149
function DoNothing(_context: VdfContext): void {}

// testVdfSubrangeView.cpp:151-159
function CreateEmptyInputNode(net: VdfNetwork): VdfNode {
  return new VdfTestUtils.CallbackNode(
    net,
    new VdfInputSpecs(),
    new VdfOutputSpecs().connector(intType, _tokens.out),
    DoNothing)
}

// testVdfSubrangeView.cpp:178-191
function VerifyResult(exec: VdfSimpleExecutor, mo: VdfMaskedOutput, expected: Result): void {
  const v = exec.getOutputValue(mo.GetOutput()!, mo.GetMask())
  expect(v).not.toBeNull()
  const a = v!.getReadAccessor<Result>(ResultType)
  expect(a.Get(0).numRanges, 'numRanges').toBe(expected.numRanges)
  expect(a.Get(0).numEmpty, 'numEmpty').toBe(expected.numEmpty)
  expect(a.Get(0).numNonEmpty, 'numNonEmpty').toBe(expected.numNonEmpty)
  expect(a.Get(0).numElements, 'numElements').toBe(expected.numElements)
}

describe('testVdfSubrangeView', () => {
  it('TestReadIteratorSubrange', () => {
    _unexpectedElements.length = 0

    const net = new VdfNetwork()

    // Create a bunch of input nodes to supply arrays of integers
    const in0 = CreateInputNode(net, 0, 1)
    const in10A = CreateInputNode(net, 10, 1)
    const in10B = CreateInputNode(net, 10, 1)

    // Create a bunch of input nodes to supply boxed integer values
    const boxedIn10A = CreateBoxedInputNode(net, BoxedInputCallbackA)
    const boxedIn10B = CreateBoxedInputNode(net, BoxedInputCallbackB)
    const boxedIn0 = CreateBoxedInputNode(net, BoxedInputCallback0)
    const empty = CreateEmptyInputNode(net)

    // Create a bunch of nodes that read the array and boxed inputs in
    // various combinations.
    const readA = CreateReadNode(net)
    net.connect(in0.GetOutput(), readA, _tokens.in, VdfMask.allOnes(0))

    const readB = CreateReadNode(net)
    net.connect(boxedIn0.GetOutput(), readB, _tokens.in, VdfMask.allOnes(1))
    net.connect(in10A.GetOutput(), readB, _tokens.in, VdfMask.allOnes(10))

    const readC = CreateReadNode(net)
    net.connect(boxedIn0.GetOutput(), readC, _tokens.in, VdfMask.allOnes(1))
    net.connect(in10A.GetOutput(), readC, _tokens.in, VdfMask.allOnes(10))
    net.connect(boxedIn0.GetOutput(), readC, _tokens.in, VdfMask.allOnes(1))

    const readD = CreateReadNode(net)
    net.connect(boxedIn0.GetOutput(), readD, _tokens.in, VdfMask.allOnes(1))
    net.connect(in10A.GetOutput(), readD, _tokens.in, VdfMask.allOnes(10))
    net.connect(in10B.GetOutput(), readD, _tokens.in, VdfMask.allOnes(0))
    net.connect(boxedIn0.GetOutput(), readD, _tokens.in, VdfMask.allOnes(1))

    const readE = CreateReadNode(net)
    net.connect(boxedIn0.GetOutput(), readE, _tokens.in, VdfMask.allOnes(1))
    net.connect(in10A.GetOutput(), readE, _tokens.in, VdfMask.allOnes(10))
    net.connect(boxedIn0.GetOutput(), readE, _tokens.in, VdfMask.allOnes(1))
    net.connect(in10B.GetOutput(), readE, _tokens.in, VdfMask.allOnes(10))

    const readF = CreateReadNode(net)
    net.connect(in10A.GetOutput(), readF, _tokens.in, VdfMask.allOnes(10))
    net.connect(boxedIn0.GetOutput(), readF, _tokens.in, VdfMask.allOnes(1))
    net.connect(boxedIn10A.GetOutput(), readF, _tokens.in, VdfMask.allOnes(1))

    const readG = CreateReadNode(net)
    net.connect(in10A.GetOutput(), readG, _tokens.in, VdfMask.allOnes(10))
    net.connect(boxedIn10A.GetOutput(), readG, _tokens.in, VdfMask.allOnes(1))
    net.connect(in10A.GetOutput(), readG, _tokens.in, VdfMask.allOnes(10))

    const readH = CreateReadNode(net)
    net.connect(in10A.GetOutput(), readH, _tokens.in, VdfMask.allOnes(10))
    net.connect(boxedIn10A.GetOutput(), readH, _tokens.in, VdfMask.allOnes(1))
    net.connect(in10A.GetOutput(), readH, _tokens.in, VdfMask.allOnes(10))
    net.connect(boxedIn10B.GetOutput(), readH, _tokens.in, VdfMask.allOnes(1))
    net.connect(in10B.GetOutput(), readH, _tokens.in, VdfMask.allOnes(10))

    const readI = CreateReadNode(net)
    net.connect(in10A.GetOutput(), readI, _tokens.in, VdfMask.allOnes(10))
    net.connect(boxedIn10A.GetOutput(), readI, _tokens.in, VdfMask.allOnes(1))
    net.connect(empty.GetOutput(), readI, _tokens.in, VdfMask.allOnes(1))

    const readJ = CreateReadNode(net)
    net.connect(in10A.GetOutput(), readJ, _tokens.in, VdfMask.allOnes(10))
    net.connect(empty.GetOutput(), readJ, _tokens.in, VdfMask.allOnes(1))
    net.connect(boxedIn10A.GetOutput(), readJ, _tokens.in, VdfMask.allOnes(1))

    const readK = CreateReadNode(net)
    net.connect(empty.GetOutput(), readK, _tokens.in, VdfMask.allOnes(1))
    net.connect(boxedIn10A.GetOutput(), readK, _tokens.in, VdfMask.allOnes(1))
    net.connect(in10A.GetOutput(), readK, _tokens.in, VdfMask.allOnes(10))

    // Create a request with all these read nodes in it
    const mos: VdfMaskedOutput[] = []
    mos.push(new VdfMaskedOutput(readA.GetOutput(), VdfMask.allOnes(1)))
    mos.push(new VdfMaskedOutput(readB.GetOutput(), VdfMask.allOnes(1)))
    mos.push(new VdfMaskedOutput(readC.GetOutput(), VdfMask.allOnes(1)))
    mos.push(new VdfMaskedOutput(readD.GetOutput(), VdfMask.allOnes(1)))
    mos.push(new VdfMaskedOutput(readE.GetOutput(), VdfMask.allOnes(1)))
    mos.push(new VdfMaskedOutput(readF.GetOutput(), VdfMask.allOnes(1)))
    mos.push(new VdfMaskedOutput(readG.GetOutput(), VdfMask.allOnes(1)))
    mos.push(new VdfMaskedOutput(readH.GetOutput(), VdfMask.allOnes(1)))
    mos.push(new VdfMaskedOutput(readI.GetOutput(), VdfMask.allOnes(1)))
    mos.push(new VdfMaskedOutput(readJ.GetOutput(), VdfMask.allOnes(1)))
    mos.push(new VdfMaskedOutput(readK.GetOutput(), VdfMask.allOnes(1)))

    // Schedule the request
    const request = new VdfRequest(mos)
    const schedule = new VdfSchedule()
    VdfScheduler.schedule(request, schedule, true /* topologicalSort */)

    // Run the request on a simple executor.
    const exec = new VdfSimpleExecutor()
    exec.run(schedule)

    // Verify results: numRanges, numEmpty, numNonEmpty, numElements
    VerifyResult(exec, mos[0]!, new Result(0, 0, 0, 0))
    VerifyResult(exec, mos[1]!, new Result(2, 1, 1, 10))
    VerifyResult(exec, mos[2]!, new Result(3, 2, 1, 10))
    VerifyResult(exec, mos[3]!, new Result(3, 2, 1, 10))
    VerifyResult(exec, mos[4]!, new Result(4, 2, 2, 20))
    VerifyResult(exec, mos[5]!, new Result(5, 3, 2, 20))
    VerifyResult(exec, mos[6]!, new Result(5, 2, 3, 30))
    VerifyResult(exec, mos[7]!, new Result(10, 3, 7, 70))
    VerifyResult(exec, mos[8]!, new Result(5, 3, 2, 20))
    VerifyResult(exec, mos[9]!, new Result(5, 3, 2, 20))
    VerifyResult(exec, mos[10]!, new Result(5, 3, 2, 20))

    // ReadCallback's TF_VERIFY(x == 1).
    expect(_unexpectedElements).toEqual([])
  })
})
