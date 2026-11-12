// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfReadWriteAccessor.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfReadWriteAccessor.cpp
//
// The upstream callbacks check with TF_VERIFY, which posts a coding error on
// failure; the native test (testVdfReadWriteAccessor, OpenUSD 26.11.1)
// posts none, which the error mark checks. `a[i] += x` is
// `a.Set(i, a.Get(i) + x)`.

import { describe, expect, it } from 'vitest'
import {
  TF_VERIFY,
  TfCompressedBits,
  TfErrorMark,
  Token as TfToken,
} from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { WorkParallelForN } from 'typescript-usd/work'

import { VdfInputSpecs, VdfOutputSpecs } from '../../src/connectorSpecs.ts'
import type { VdfContext } from '../../src/context.ts'
import { VDF_FATAL_ERROR } from '../../src/error.ts'
import { VdfInputVector } from '../../src/inputVector.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import type { VdfMaskedOutputVector } from '../../src/maskedOutputVector.ts'
import { VdfNetwork } from '../../src/network.ts'
import type { VdfNode } from '../../src/node.ts'
import { VdfReadIterator } from '../../src/readIterator.ts'
import { VdfReadWriteAccessor } from '../../src/readWriteAccessor.ts'
import { VdfReadWriteIterator } from '../../src/readWriteIterator.ts'
import { VdfRequest } from '../../src/request.ts'
import { VdfSchedule } from '../../src/schedule.ts'
import { VdfScheduler } from '../../src/scheduler.ts'
import { VdfSimpleExecutor } from '../../src/simpleExecutor.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'

const intType = VtValueTypes.int

// testVdfReadWriteAccessor.cpp:29-33
const _tokens = {
  in: TfToken('in'),
  out: TfToken('out'),
}

// testVdfReadWriteAccessor.cpp:35
const N = 1000

// testVdfReadWriteAccessor.cpp:37-92
function ReadCallback(context: VdfContext): void {
  const rit = new VdfReadIterator<number>(intType, context, _tokens.in)
  TF_VERIFY(!rit.isAtEnd(), '!rit.IsAtEnd()')

  // There shouldn't be any data at the output at this point.
  const empty = new VdfReadWriteAccessor<number>(intType, context)
  TF_VERIFY(empty.IsEmpty(), 'empty.IsEmpty()')
  TF_VERIFY(empty.getSize() === 0, 'empty.GetSize() == 0')

  // Allocate a boxed value with a named output.
  const it = VdfReadWriteIterator.allocate<number>(intType, context, _tokens.out, N)
  TF_VERIFY(!it.isAtEnd(), '!it.IsAtEnd()')

  // Fill with values.
  for (let i = 0; !it.isAtEnd(); ++i, it.increment()) {
    it.derefAssign(i)
  }
  TF_VERIFY(it.isAtEnd(), 'it.IsAtEnd()')

  // Read back the values with the accessor.
  const a = new VdfReadWriteAccessor<number>(intType, context, _tokens.out)
  TF_VERIFY(a.getSize() === N, 'a.GetSize() == N')
  TF_VERIFY(!a.IsEmpty(), '!a.IsEmpty()')
  for (let i = 0; i < N; ++i) {
    TF_VERIFY(a.Get(i) === i, 'a[i] == static_cast<int>(i)')
  }

  // Write different output values with the same accessor.
  TF_VERIFY(a.getSize() === N, 'a.GetSize() == N')
  TF_VERIFY(!a.IsEmpty(), '!a.IsEmpty()')
  for (let i = N - 1; i >= 0; --i) {
    TF_VERIFY(a.Get(i) === i, 'a[i] == i')
    a.Set(i, 2)
  }

  // Create a const accessor and read back.
  const b = new VdfReadWriteAccessor<number>(intType, context, _tokens.out)
  TF_VERIFY(b.getSize() === N, 'b.GetSize() == N')
  TF_VERIFY(!b.IsEmpty(), '!b.IsEmpty()')
  for (let i = 0; i < N; ++i) {
    TF_VERIFY(b.Get(i) === 2, 'b[i] == 2')
  }

  // Create a different accessor, which should read the same values. Fill
  // with new values.
  const c = new VdfReadWriteAccessor<number>(intType, context)
  TF_VERIFY(c.getSize() === a.getSize(), 'c.GetSize() == a.GetSize()')
  TF_VERIFY(a.IsEmpty() === c.IsEmpty(), 'a.IsEmpty() == c.IsEmpty()')
  for (let i = 0; i < N && !rit.isAtEnd(); ++i, rit.increment()) {
    TF_VERIFY(a.Get(i) === 2, 'a[i] == 2')
    a.Set(i, a.Get(i) + rit.deref())
  }
}

// testVdfReadWriteAccessor.cpp:94-109
function CreateReadNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readConnector(intType, _tokens.in)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, ReadCallback)
}

// testVdfReadWriteAccessor.cpp:111-139
function ReadWriteCallback(context: VdfContext): void {
  // Create a read/write accessor with the associated input.
  const a = new VdfReadWriteAccessor<number>(intType, context, _tokens.in)
  TF_VERIFY(!a.IsEmpty(), '!a.IsEmpty()')

  // Increment input values.
  for (let i = 0; i < a.getSize(); ++i) {
    a.Set(i, a.Get(i) + 1)
  }

  // Create a read/write accessor with the associated output.
  const b = new VdfReadWriteAccessor<number>(intType, context, _tokens.out)
  TF_VERIFY(!b.IsEmpty(), '!b.IsEmpty()')
  TF_VERIFY(a.getSize() === b.getSize(), 'a.GetSize() == b.GetSize()')

  // Increment input values.
  for (let i = 0; i < b.getSize(); ++i) {
    a.Set(i, a.Get(i) + 1)
  }

  // Parallel increment by re-using the first accessor.
  WorkParallelForN(a.getSize(), (b: number, e: number) => {
    for (let i = b; i !== e; ++i) {
      a.Set(i, a.Get(i) + 1)
    }
  })
}

// testVdfReadWriteAccessor.cpp:141-156
function CreateReadWriteNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readWriteConnector(intType, _tokens.in, _tokens.out)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, ReadWriteCallback)
}

// testVdfReadWriteAccessor.cpp:158-166
function CreateInputNode(net: VdfNetwork, num: number, _offset: number): VdfInputVector<number> {
  const input = new VdfInputVector<number>(intType, net, num)
  for (let i = 0; i < num; ++i) {
    input.setValue(i, 0)
  }
  return input
}

// testVdfReadWriteAccessor.cpp:168-180
function BoxedInputCallback(context: VdfContext): void {
  const num = context.getInputValue<number>(intType, _tokens.in)
  const it = VdfReadWriteIterator.allocate<number>(intType, context, num)
  for (; !it.isAtEnd(); it.increment()) {
    it.derefAssign(0)
  }
}

// testVdfReadWriteAccessor.cpp:182-197
function CreateBoxedInputNode(net: VdfNetwork): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readConnector(intType, _tokens.in)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(intType, _tokens.out)

  return new VdfTestUtils.CallbackNode(net, inspec, outspec, BoxedInputCallback)
}

// testVdfReadWriteAccessor.cpp:199-223
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
      if (a.Get(i) !== expected) {
        VDF_FATAL_ERROR(mo.GetOutput()!.getNode(), 'error')
      }
      TF_VERIFY(a.Get(i) === expected, 'a[i] == expected')
    }
  }
}

// testVdfReadWriteAccessor.cpp:225-339
function TestReadWriteAccessor(): void {
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

  // All-ones mask:
  const readWriteVec0 = CreateReadWriteNode(net)
  readWriteVec0.GetOutput()!.setAffectsMask(VdfMask.allOnes(N))
  net.connect(inVec.GetOutput(), readWriteVec0, _tokens.in, VdfMask.allOnes(N))

  // Contiguous mask:
  const bits1 = new TfCompressedBits(N, 0, (N / 2) - 1)
  const readWriteVec1 = CreateReadWriteNode(net)
  readWriteVec1.GetOutput()!.setAffectsMask(new VdfMask(bits1))
  net.connect(readWriteVec0.GetOutput(), readWriteVec1, _tokens.in, VdfMask.allOnes(N))

  // Non-contiguous mask:
  const bits2 = new TfCompressedBits()
  bits2.append(N / 2, true)
  bits2.append(N / 4, false)
  bits2.append(N / 4, true)
  const readWriteVec2 = CreateReadWriteNode(net)
  readWriteVec2.GetOutput()!.setAffectsMask(new VdfMask(bits2))
  net.connect(readWriteVec1.GetOutput(), readWriteVec2, _tokens.in, VdfMask.allOnes(N))

  // Contiguous mask with offset:
  const bits3 = new TfCompressedBits()
  bits3.append(N / 4, false)
  bits3.append(N / 4, true)
  bits3.append(N / 2, false)
  const readWriteVec3 = CreateReadWriteNode(net)
  readWriteVec3.GetOutput()!.setAffectsMask(new VdfMask(bits3))
  net.connect(readWriteVec2.GetOutput(), readWriteVec3, _tokens.in, VdfMask.allOnes(N))

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
  mos.push(new VdfMaskedOutput(readWriteVec3.GetOutput(), VdfMask.allOnes(N)))
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
  VerifyResults(exec, mos[2]!, 0, N / 4, 9)
  VerifyResults(exec, mos[2]!, N / 4, N / 2, 12)
  VerifyResults(exec, mos[2]!, N / 2, (N / 4) * 3, 3)
  VerifyResults(exec, mos[2]!, (N / 4) * 3, N, 6)

  // Verify read/write with boxed data.
  VerifyResults(exec, mos[3]!, 0, N, 6)
}

describe('testVdfReadWriteAccessor', () => {
  it('TestReadWriteAccessor', () => {
    const mark = new TfErrorMark()
    TestReadWriteAccessor()
    expect(mark.isClean()).toBe(true)
  })
})
