// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfHardToReach.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfHardToReach.cpp
//
// The upstream functions exercise error conditions without checking the
// diagnostics they post. The coding errors the native test
// (testVdfHardToReach, OpenUSD 26.11.1) prints are checked here with
// error marks, by their message text:
//   Output connector 'naganafindit' does not exist.
//   GetOutput() called on node with no outputs.
//   GetOutput() can only be called on nodes with a single output.
//   No output available to write to.

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TfErrorMark, Token as TfToken } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import { VdfInputSpecs, VdfOutputSpecs } from '../../src/connectorSpecs.ts'
import { VdfContext } from '../../src/context.ts'
import { VdfEvaluationState } from '../../src/evaluationState.ts'
import { VdfWeightedReadIterator } from '../../src/iterators.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfNetwork } from '../../src/network.ts'
import type { VdfNode } from '../../src/node.ts'
import { VdfReadWriteIterator } from '../../src/readWriteIterator.ts'
import { VdfSchedule } from '../../src/schedule.ts'
import { VdfSimpleExecutor } from '../../src/simpleExecutor.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'
import { VdfTokens } from '../../src/tokens.ts'

const intType = VtValueTypes.int

// testVdfHardToReach.cpp:28-34
const _tokens = {
  input: TfToken('input'),
  out1: TfToken('out1'),
  out2: TfToken('out2'),
}

// testVdfHardToReach.cpp:36-39
function CallbackFunction(_context: VdfContext): void {
}

function _Messages(mark: TfErrorMark): string[] {
  return mark.getErrors().map((e) => e.getCommentary())
}

// testVdfHardToReach.cpp:41-70
function TestVdfNodeGetOutputErrorConditions(): void {
  // This function exercises error conditions in VdfNode::GetOutput().
  const net = new VdfNetwork()

  const emptyOutputSpec = new VdfOutputSpecs()
  const multipleOutputsSpec = new VdfOutputSpecs()
  multipleOutputsSpec
    .connector(intType, VdfTokens.out as TfToken)
    .connector(intType, _tokens.out1)
    .connector(intType, _tokens.out2)

  const node1: VdfNode = new VdfTestUtils.CallbackNode(
    net, new VdfInputSpecs(), emptyOutputSpec, CallbackFunction)

  const node2: VdfNode = new VdfTestUtils.CallbackNode(
    net, new VdfInputSpecs(), multipleOutputsSpec, CallbackFunction)

  // Pull on an invalid output.
  node1.GetOutput(TfToken('naganafindit'))

  // Pull on an invalid output
  node1.GetOutput()

  // Call the single output method on a node with multiple outputs.
  node2.GetOutput()
}

// testVdfHardToReach.cpp:72-92
function TestVdfContextErrorConditions(): void {
  const net = new VdfNetwork()
  const emptyNode = new VdfTestUtils.CallbackNode(
    net,
    new VdfInputSpecs(),
    new VdfOutputSpecs(),
    CallbackFunction)

  const executor = new VdfSimpleExecutor()
  new VdfMask()

  const schedule = new VdfSchedule()
  const state = new VdfEvaluationState(executor, schedule, null)
  const context = new VdfContext(state, emptyNode)

  new VdfWeightedReadIterator<number>(intType, context, [], TfToken('nagana'))

  // Error condition, invalid input name specified.
  new VdfReadWriteIterator<number>(intType, context, TfToken('nagana'))
}

// testVdfHardToReach.cpp:94-107
function TestVdfConnectorSpecErrorConditions(): void {
  const inspecs = new VdfInputSpecs()
  inspecs
    .readConnector(intType, _tokens.input)

  const spec = inspecs.getInputSpec(0)!

  // Call GetAssociatedOutputName on an input connector. It is incorrect to do
  // so and an error will be issued.
  TF_AXIOM(spec.getAssociatedOutputName() === TfToken(''),
    'spec->GetAssociatedOutputName() == TfToken("")')
}

// testVdfHardToReach.cpp:109-153
function TestVdfNodeDebugNameCallback(): void {
  const net = new VdfNetwork()
  const emptyNode = new VdfTestUtils.CallbackNode(
    net,
    new VdfInputSpecs(),
    new VdfOutputSpecs(),
    CallbackFunction)

  // Test that setting an invalid debug name callable triggers an error and
  // does not crash when the debug name is retrieved.
  {
    const m = new TfErrorMark()
    emptyNode.setDebugNameCallback(null)
    TF_AXIOM(!m.isClean(), '!m.IsClean()')
    m.clear()

    const debugName = emptyNode.getDebugName()
    TF_AXIOM(debugName === 'VdfTestUtils::CallbackNode',
      'debugName == "VdfTestUtils::CallbackNode"')
  }

  // The same test as above but with an l-value callback.
  {
    const m = new TfErrorMark()
    const callback = null
    emptyNode.setDebugNameCallback(callback)
    TF_AXIOM(!m.isClean(), '!m.IsClean()')
    m.clear()

    const debugName = emptyNode.getDebugName()
    TF_AXIOM(debugName === 'VdfTestUtils::CallbackNode',
      'debugName == "VdfTestUtils::CallbackNode"')
  }

  // Test setting a debug name lambda callback.
  {
    const m = new TfErrorMark()
    emptyNode.setDebugNameCallback(() => {
      return 'callback'
    })
    TF_AXIOM(m.isClean(), 'm.IsClean()')

    const debugName = emptyNode.getDebugName()
    TF_AXIOM(debugName === 'VdfTestUtils::CallbackNode callback',
      'debugName == "VdfTestUtils::CallbackNode callback"')
  }
}

describe('testVdfHardToReach', () => {
  it('TestVdfNodeGetOutputErrorConditions', () => {
    const mark = new TfErrorMark()
    TestVdfNodeGetOutputErrorConditions()
    expect(_Messages(mark)).toEqual([
      "Output connector 'naganafindit' does not exist.",
      'GetOutput() called on node with no outputs.',
      'GetOutput() can only be called on nodes with a single output.',
    ])
    mark.clear()
  })

  it('TestVdfContextErrorConditions', () => {
    const mark = new TfErrorMark()
    TestVdfContextErrorConditions()
    expect(_Messages(mark)).toEqual([
      'No output available to write to.',
    ])
    mark.clear()
  })

  it('TestVdfConnectorSpecErrorConditions', () => {
    const mark = new TfErrorMark()
    TestVdfConnectorSpecErrorConditions()
    expect(mark.isClean()).toBe(true)
  })

  it('TestVdfNodeDebugNameCallback', () => {
    const mark = new TfErrorMark()
    TestVdfNodeDebugNameCallback()
    expect(mark.isClean()).toBe(true)
  })
})
