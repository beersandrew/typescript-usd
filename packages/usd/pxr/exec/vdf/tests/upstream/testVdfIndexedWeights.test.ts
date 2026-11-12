// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfIndexedWeights.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfIndexedWeights.cpp
//
// CMake (pxr/exec/vdf/CMakeLists.txt:478-484) registers only
// `testVdfIndexedWeights -c` with STDOUT_REDIRECT test.out and DIFF_COMPARE
// test.out. The baseline is copied verbatim to
// ../fixtures/testVdfIndexedWeights/test.out from OpenUSD v26.11.1
// pxr/exec/vdf/testenv/testVdfIndexedWeights/baseline/test.out (Pixar,
// LICENSE.txt at https://openusd.org/license).
//
// main() calls TestWeightedIterator once per TestCases value; each call is an
// it() named after the function and the case, and checks the function's
// return value and its stdout against the baseline section that main()
// introduces with "> <case name>". The it('main') reproduces the whole `-c`
// program and compares its complete stdout to the baseline file
// (DIFF_COMPARE), and its result to EXPECTED_RETURN_CODE 0.
//
// Not ported: the perf mode (`-p`; its registration
// testVdfIndexedWeights_Perf is commented out at CMakeLists.txt:574-580), so
// TfStopwatch timing, perfstats.raw and the TraceReporter report are absent;
// `perf` stays false and `watch` is always null, as in `-c`. TRACE_FUNCTION
// and TRACE_SCOPE are dropped (openexec-x1.md 4.1 "Dropped"). std::cerr
// messages of RunIteratorTest are not part of test.out; they are collected
// and shown in the failure message.
//
// Output formatting: printf "%f" is toFixed(6) and "%d" is the decimal
// integer (no printf helper exists in typescript-usd/tf; TfStringify and
// TfStreamDouble are the iostream "%g"-like formats, not "%f").

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, Token as TfToken } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import { VdfInputSpecs, VdfOutputSpecs } from '../../src/connectorSpecs.ts'
import type { VdfContext } from '../../src/context.ts'
import { VdfIndexedWeights, VdfIndexedWeightsType } from '../../src/indexedWeights.ts'
import { VdfInputVector } from '../../src/inputVector.ts'
import { Vdf_GetIteratorIndex } from '../../src/iterator.ts'
import {
  VdfMaskedReadIterator,
  VdfWeightedMaskedReadIterator,
  VdfWeightedReadIterator,
  VdfWeightedReadWriteIterator,
} from '../../src/iterators.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedIteratorMode } from '../../src/maskedIterator.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import { VdfNetwork } from '../../src/network.ts'
import { VdfNode } from '../../src/node.ts'
import { VdfRequest } from '../../src/request.ts'
import { VdfSchedule } from '../../src/schedule.ts'
import { VdfScheduler } from '../../src/scheduler.ts'
import { VdfSimpleExecutor } from '../../src/simpleExecutor.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'

const _baseline = readFileSync(
  new URL('../fixtures/testVdfIndexedWeights/test.out', import.meta.url), 'utf8')

// enum TestCases (testVdfIndexedWeights.cpp:28-37).
enum TestCases {
  SkipNotExplicitlySetWeights,
  SkipExplicitlySetWeights,

  SkipNotExplicitlySetWeightsVectorCtor,
  SkipExplicitlySetWeightsVectorCtor,

  NumTestCases,
}

// testVdfIndexedWeights.cpp:39-45.
const TestCaseNames: readonly string[] = [
  'SkipNotExplicitlySetWeights',
  'SkipExplicitlySetWeights',
  'SkipNotExplicitlySetWeightsVectorCtor',
  'SkipExplicitlySetWeightsVectorCtor',
]

// TF_DEFINE_PRIVATE_TOKENS (testVdfIndexedWeights.cpp:47-56).
const _tokens = {
  inout: TfToken('inout'),
  w1: TfToken('w1'),
  w2: TfToken('w2'),
  w3: TfToken('w3'),
  w4: TfToken('w4'),
  out: TfToken('out'),
}

// testVdfIndexedWeights.cpp:58.
const perf = false

// The program's stdout (printf) and stderr (std::cerr).
let _stdout = ''
let _stderr = ''

// printf "%f".
function _F(v: number): string {
  return v.toFixed(6)
}

function printf(text: string): void {
  _stdout += text
}

// `*i += x` on a VdfWeightedReadWriteIterator<double>: upstream's operator*
// returns the reference of the underlying VdfReadWriteIterator
// (weightedIterator.h:207-209). The TS VdfWeightedIterator must forward
// assignment (DerefAssign, as readWriteIterator.ts has); fail loudly if it
// does not.
function _DerefAddAssign(i: VdfWeightedReadWriteIterator<number>, x: number): void {
  const derefAssign = (i as unknown as { derefAssign?: (v: number) => void }).derefAssign
  if (typeof derefAssign !== 'function') {
    throw new Error(
      'VdfWeightedIterator has no DerefAssign: `*i += x` through ' +
      'weightedIterator.h:207-209 operator* reference is not expressible ' +
      '(pxr/exec/vdf/src/weightedIterator.ts Deref returns a value)')
  }
  derefAssign.call(i, i.deref() + x)
}

// WeightPerfCallbackNode (testVdfIndexedWeights.cpp:60-71).
class WeightPerfCallbackNode extends VdfNode {
  constructor(network: VdfNetwork, inputSpecs: VdfInputSpecs, outputSpecs: VdfOutputSpecs) {
    super(network, inputSpecs, outputSpecs)
  }

  // testVdfIndexedWeights.cpp:73-87.
  compute(context: VdfContext): void {
    // All this callback does is reads the input and produces a vector
    // with all the inputs read.

    // Use constructor that doesn't take a std::vector
    for (const i = new VdfWeightedReadWriteIterator<number>(
      VtValueTypes.double,
      context, [_tokens.w1, _tokens.w2, _tokens.w3, _tokens.w4],
      _tokens.inout); !i.isAtEnd(); i.increment()) {

      _DerefAddAssign(i,
        i.getWeight(0) + i.getWeight(1) + i.getWeight(2) + i.getWeight(3))
    }
  }
}

// WeightCorrectnessCallbackNode (testVdfIndexedWeights.cpp:89-104).
class WeightCorrectnessCallbackNode extends WeightPerfCallbackNode {
  readonly _requestWidth: number

  constructor(
    network: VdfNetwork,
    inputSpecs: VdfInputSpecs,
    outputSpecs: VdfOutputSpecs,
    requestWidth: number) {
    super(network, inputSpecs, outputSpecs)
    this._requestWidth = requestWidth
  }

  // testVdfIndexedWeights.cpp:106-158.
  override compute(context: VdfContext): void {
    // Also call the perf callback so we check its result for correctness.
    super.compute(context)

    const requestWidth = this._requestWidth

    for (const i = new VdfWeightedReadIterator<number>(
      VtValueTypes.double,
      context, [_tokens.w1, _tokens.w2, _tokens.w3, _tokens.w4],
      _tokens.inout); !i.isAtEnd(); i.increment()) {

      printf(`${Vdf_GetIteratorIndex(i)}: ${_F(i.getWeight(0))} ${_F(i.getWeight(1))} ` +
        `${_F(i.getWeight(2))} ${_F(i.getWeight(3))} - *iter ${_F(i.deref())}\n`)
    }

    const visitMask = new VdfMask(requestWidth)
    for (let i = 0; i < requestWidth; i += 2) {
      visitMask.setIndex(i)
    }

    for (const i = new VdfMaskedReadIterator<number>(
      VtValueTypes.double, VdfMaskedIteratorMode.VisitSet,
      context, visitMask, _tokens.inout); !i.isAtEnd(); i.increment()) {

      printf(`${Vdf_GetIteratorIndex(i)}: - *iter ${_F(i.deref())}\n`)
    }

    for (const i = new VdfWeightedMaskedReadIterator<number>(
      VtValueTypes.double, VdfMaskedIteratorMode.VisitSet,
      context, [_tokens.w1, _tokens.w2, _tokens.w3, _tokens.w4],
      visitMask, _tokens.inout); !i.isAtEnd(); i.increment()) {

      printf(`${Vdf_GetIteratorIndex(i)}: ${_F(i.getWeight(0))} ${_F(i.getWeight(1))} ` +
        `${_F(i.getWeight(2))} ${_F(i.getWeight(3))} - *iter ${_F(i.deref())}\n`)
    }

    for (const i = new VdfMaskedReadIterator<number>(
      VtValueTypes.double, VdfMaskedIteratorMode.VisitUnset,
      context, visitMask, _tokens.inout); !i.isAtEnd(); i.increment()) {

      printf(`${Vdf_GetIteratorIndex(i)}: - *iter ${_F(i.deref())}\n`)
    }

    for (const i = new VdfWeightedMaskedReadIterator<number>(
      VtValueTypes.double, VdfMaskedIteratorMode.VisitUnset,
      context, [_tokens.w1, _tokens.w2, _tokens.w3, _tokens.w4],
      visitMask, _tokens.inout); !i.isAtEnd(); i.increment()) {

      printf(`${Vdf_GetIteratorIndex(i)}: ${_F(i.getWeight(0))} ${_F(i.getWeight(1))} ` +
        `${_F(i.getWeight(2))} ${_F(i.getWeight(3))} - *iter ${_F(i.deref())}\n`)
    }
  }
}

// testVdfIndexedWeights.cpp:161-185.
function WeightedCallbackVectorCtor(context: VdfContext): void {
  // All this callback does is reads the input and produces a vector
  // with all the inputs read.

  const weightNames: TfToken[] = []
  weightNames.push(_tokens.w1)
  weightNames.push(_tokens.w2)
  weightNames.push(_tokens.w3)
  weightNames.push(_tokens.w4)

  // Use constructor that takes a std::vector.
  const iter = new VdfWeightedReadWriteIterator<number>(
    VtValueTypes.double, context, weightNames, _tokens.inout)

  for (; !iter.isAtEnd(); iter.increment()) {

    _DerefAddAssign(iter, iter.getWeight(0) + iter.getWeight(1)
      + iter.getWeight(2) + iter.getWeight(3))
  }
}

// testVdfIndexedWeights.cpp:187-221.
function CreateWeightedNode(net: VdfNetwork, useVectorCtor: boolean, requestWidth: number): VdfNode {
  const inspec = new VdfInputSpecs()
  inspec
    .readWriteConnector(VtValueTypes.double, _tokens.inout, _tokens.out)
    .readConnector(VdfIndexedWeightsType, _tokens.w1)
    .readConnector(VdfIndexedWeightsType, _tokens.w2)
    .readConnector(VdfIndexedWeightsType, _tokens.w3)
    .readConnector(VdfIndexedWeightsType, _tokens.w4)

  const outspec = new VdfOutputSpecs()
  outspec
    .connector(VtValueTypes.double, _tokens.out)

  // DIfferent weightedIterator constructor used in two callbacks
  if (useVectorCtor) {
    return new VdfTestUtils.CallbackNode(
      net, inspec, outspec, WeightedCallbackVectorCtor)
  }

  if (perf) {
    return new WeightPerfCallbackNode(
      net, inspec, outspec)
  } else {
    return new WeightCorrectnessCallbackNode(
      net, inspec, outspec, requestWidth)
  }
}

// testVdfIndexedWeights.cpp:223-264. `watch` is always null in `-c` mode.
function RunIteratorTest(node: VdfNode, mask: VdfMask, expected: readonly number[]): boolean {
  const request = new VdfRequest(new VdfMaskedOutput(node.GetOutput(), mask))

  const schedule = new VdfSchedule()
  VdfScheduler.schedule(request, schedule, true /* topologicalSort */)
  const exec = new VdfSimpleExecutor()

  exec.run(schedule)

  const result = exec.getOutputValue(node.GetOutput()!, mask)!
    .getReadAccessor<number>(VtValueTypes.double)

  if (result.getNumValues() !== expected.length) {
    _stderr += `\tERROR: Expected vector of size ${expected.length}` +
      `, got size ${result.getNumValues()}\n`
    return false
  }

  for (let i = 0; i < expected.length; ++i) {
    if (result.Get(i) !== expected[i]) {
      _stderr += `\tERROR: At index ${i} expected ${expected[i]} got ${result.Get(i)}\n`
      return false
    }
  }

  return true
}

// testVdfIndexedWeights.cpp:268-427. `watch` is always null in `-c` mode.
function TestWeightedIterator(testCase: TestCases): boolean {
  let useVectorCtor = false
  if (testCase === TestCases.SkipNotExplicitlySetWeightsVectorCtor) {
    testCase = TestCases.SkipNotExplicitlySetWeights
    useVectorCtor = true
  }
  if (testCase === TestCases.SkipExplicitlySetWeightsVectorCtor) {
    testCase = TestCases.SkipExplicitlySetWeights
    useVectorCtor = true
  }

  // For correctness tests, we just use a small set.
  const requestWidth = 50

  const net = new VdfNetwork()

  const in1 = new VdfInputVector<number>(VtValueTypes.double, net, requestWidth)

  for (let i = 0; i < requestWidth; i++) {
    in1.setValue(i, i + 1.0)
  }

  // Create four indexed weights nodes
  const iwn1 = new VdfInputVector<VdfIndexedWeights>(VdfIndexedWeightsType, net, 1)
  const iwn2 = new VdfInputVector<VdfIndexedWeights>(VdfIndexedWeightsType, net, 1)
  const iwn3 = new VdfInputVector<VdfIndexedWeights>(VdfIndexedWeightsType, net, 1)
  const iwn4 = new VdfInputVector<VdfIndexedWeights>(VdfIndexedWeightsType, net, 1)

  const w1 = new VdfIndexedWeights()
  const w2 = new VdfIndexedWeights()
  const w3 = new VdfIndexedWeights()
  const w4 = new VdfIndexedWeights()

  if (testCase === TestCases.SkipExplicitlySetWeights) {
    // Fill up weight vectors with empty 0.0 weights that cause
    // _GetFirstWeightIndex(); to do a lot of work finding the first weight.

    for (let i = 0; i < requestWidth - 3; i++) {
      w1.add(i, 0.0)
      w2.add(i, 0.0)
      w3.add(i, 0.0)
      w4.add(i, 0.0)
    }
    // An axiom to exercise the operator== of VdfIndexedData.
    TF_AXIOM(w1.Equals(w2))
  }

  // But to make this case a little harder, we set the first weight explicitly.
  // This way, we also test that skipping 'holes' of unexplicit weights is
  // done quick.

  if (testCase === TestCases.SkipNotExplicitlySetWeights) {
    w1.add(0, 0.0)
    w2.add(1, 0.0)
    w3.add(2, 0.0)
    w4.add(3, 0.0)
  }

  // Create weights, so that only the last most three weights are set.
  w1.add(requestWidth - 3, 1.0)
  w2.add(requestWidth - 2, 0.5)
  w3.add(requestWidth - 3, 0.75)
  w4.add(requestWidth - 2, 0.5)

  // Test basic weight index finding in VdfIndexedWeights
  const wa = new VdfIndexedWeights()
  for (let i = 1; i < 100; ++i) {
    wa.add(i * 3, 0.0)
  }

  // Find the first weight and third weights
  TF_AXIOM(wa.getFirstDataIndex(0) === wa.getFirstDataIndex(0, 0))
  TF_AXIOM(wa.getFirstDataIndex(9) === wa.getFirstDataIndex(9, 1))
  TF_AXIOM(wa.getFirstDataIndex(9) === wa.getFirstDataIndex(9, 2))

  // Find weight index with value 99
  let testIdx = wa.getFirstDataIndex(99)
  TF_AXIOM(testIdx === wa.getFirstDataIndex(99, 0))
  TF_AXIOM(testIdx === wa.getFirstDataIndex(99, testIdx))
  TF_AXIOM(testIdx === wa.getFirstDataIndex(99, testIdx - 1))

  // Find first weight index with value 297
  testIdx = wa.getFirstDataIndex(297)
  TF_AXIOM(testIdx === wa.getFirstDataIndex(297, 0))
  TF_AXIOM(testIdx === wa.getFirstDataIndex(297, testIdx))
  TF_AXIOM(testIdx === wa.getFirstDataIndex(297, testIdx - 1))

  // Find a non-existant weight
  testIdx = wa.getFirstDataIndex(303)
  TF_AXIOM(testIdx === wa.getSize())
  TF_AXIOM(testIdx === wa.getFirstDataIndex(303, 0))
  TF_AXIOM(testIdx === wa.getFirstDataIndex(303, 101))

  iwn1.setValue(0, w1)
  iwn2.setValue(0, w2)
  iwn3.setValue(0, w3)
  iwn4.setValue(0, w4)

  const last = CreateWeightedNode(net, useVectorCtor, requestWidth)

  const maskRequestWidth = new VdfMask(requestWidth)

  if (testCase === TestCases.SkipNotExplicitlySetWeights) {
    // In this case we test seeking quickly forward to the first explicit
    // weight even when the mask specifies to iterate over all elements.
    maskRequestWidth.setAll()
  } else if (testCase === TestCases.SkipExplicitlySetWeights) {
    // In this case we test seeking quickly forward to the first element as
    // specified by the mask, even if there are a lot of explicitly set
    // weights.
    for (let i = requestWidth - 3; i < requestWidth; i++) {
      maskRequestWidth.setIndex(i)
    }
  } else {
    return false
  }

  net.connect(in1.GetOutput(), last, _tokens.inout, maskRequestWidth)

  const oneMask = new VdfMask(1)
  oneMask.setAll()

  net.connect(iwn1.GetOutput(), last, _tokens.w1, oneMask)
  net.connect(iwn2.GetOutput(), last, _tokens.w2, oneMask)
  net.connect(iwn3.GetOutput(), last, _tokens.w3, oneMask)
  net.connect(iwn4.GetOutput(), last, _tokens.w4, oneMask)

  // Our inputs look liks this:
  //
  //  [1.0, 2.0, 3.0]  with weights:
  //
  //          [1.0   -   -  ]
  //          [ -   0.5  -  ]
  //          [0.75  -   -  ]
  //          [ -   0.5  -  ]
  //
  //

  const expected: number[] = []

  for (let i = 0; i < requestWidth; i++) {
    let v = i + 1.0

    if (i === requestWidth - 3) {
      v += 1.75
    } else if (i === requestWidth - 2) {
      v += 1.00
    }

    expected.push(v)
  }

  return RunIteratorTest(last, maskRequestWidth, expected)
}

// main() in `-c` mode (testVdfIndexedWeights.cpp:429-482): returns the exit
// status 0 or -1.
function main(): number {
  let failed = false

  for (let i = 0; i < TestCases.NumTestCases; i++) {
    printf(`> ${TestCaseNames[i]}\n`)

    if (!TestWeightedIterator(i as TestCases)) {
      failed = true
    }
  }

  printf(`> test ${failed ? 'failed' : 'ok'}\n`)

  return failed ? -1 : 0
}

// The baseline section main() prints for a test case: from its "> <name>"
// line up to the next "> " line.
function _BaselineSection(name: string): string {
  const header = `> ${name}\n`
  const begin = _baseline.indexOf(header)
  expect(begin).toBeGreaterThanOrEqual(0)
  const end = _baseline.indexOf('\n> ', begin + header.length - 1)
  return _baseline.slice(begin + header.length, end + 1)
}

function _Reset(): void {
  _stdout = ''
  _stderr = ''
}

describe('testVdfIndexedWeights', () => {
  for (let testCase = 0; testCase < TestCases.NumTestCases; testCase++) {
    const name = TestCaseNames[testCase]!
    it(`TestWeightedIterator(${name})`, () => {
      _Reset()
      const ok = TestWeightedIterator(testCase as TestCases)
      expect(_stdout).toBe(_BaselineSection(name))
      expect(ok, _stderr).toBe(true)
    })
  }

  it('main', () => {
    _Reset()
    const status = main()
    // DIFF_COMPARE test.out.
    expect(_stdout).toBe(_baseline)
    // EXPECTED_RETURN_CODE 0.
    expect(status, _stderr).toBe(0)
  })
})
