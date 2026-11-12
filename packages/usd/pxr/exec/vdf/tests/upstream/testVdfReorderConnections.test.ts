// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfReorderConnections.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfReorderConnections.cpp
//
// TestReorderInputConnections is one it(). ASSERT_EQ and TF_AXIOM become
// expect(). The progress output and the "Expected Error Output" banners are
// not ported. std::string values use the vt `string` type.

import { describe, expect, it } from 'vitest'
import { Token as TfToken } from 'typescript-usd/tf'
import { TfErrorMark } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import type { VdfContext } from '../../src/context.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import type { VdfNode } from '../../src/node.ts'
import { VdfReadIterator } from '../../src/readIterator.ts'
import { VdfRequest } from '../../src/request.ts'
import { VdfSchedule } from '../../src/schedule.ts'
import { VdfScheduler } from '../../src/scheduler.ts'
import { VdfSimpleExecutor } from '../../src/simpleExecutor.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'

// TF_DEFINE_PRIVATE_TOKENS (testVdfReorderConnections.cpp:27-32).
const _tokens = {
  out: TfToken('out'),
  string: TfToken('string'),
}

// BuildTestNetwork2 (testVdfReorderConnections.cpp:34-95).
function BuildTestNetwork2(graph: VdfTestUtils.Network): VdfNode {
  //        StringA StringB  StringC StringD
  //              \      /    \      /
  //              Combine1    Combine2
  //                   \       /
  //                    Combine3

  graph.addInputVector(VtValueTypes.string, 'StringA', 1)
  graph.Get('StringA').setValue(0, 'A')

  graph.addInputVector(VtValueTypes.string, 'StringB', 1)
  graph.Get('StringB').setValue(0, 'B')

  graph.addInputVector(VtValueTypes.string, 'StringC', 1)
  graph.Get('StringC').setValue(0, 'C')

  graph.addInputVector(VtValueTypes.string, 'StringD', 1)
  graph.Get('StringD').setValue(0, 'D')

  const combineStrings = new VdfTestUtils.CallbackNodeType(
    (context: VdfContext) => {
      let result = ''
      for (const i = new VdfReadIterator<string>(VtValueTypes.string, context, _tokens.string);
        !i.isAtEnd(); i.increment()) {
        if (result !== '') result += ', '
        result += i.deref()
      }
      context.setOutput(result)
    })
  combineStrings
    .Read(VtValueTypes.string, _tokens.string)
    .out(VtValueTypes.string, _tokens.out)

  graph.add('Combine1', combineStrings)
  graph.add('Combine2', combineStrings)
  graph.add('Combine3', combineStrings)
  graph.add('Combine4', combineStrings)

  const oneOne = VdfMask.allOnes(1)

  graph.Get('StringA').shiftRight(graph.Get('Combine1').in(_tokens.string, oneOne))
  graph.Get('StringB').shiftRight(graph.Get('Combine1').in(_tokens.string, oneOne))

  graph.Get('StringC').shiftRight(graph.Get('Combine2').in(_tokens.string, oneOne))
  graph.Get('StringD').shiftRight(graph.Get('Combine2').in(_tokens.string, oneOne))

  graph.Get('Combine1').shiftRight(graph.Get('Combine3').in(_tokens.string, oneOne))
  graph.Get('Combine2').shiftRight(graph.Get('Combine3').in(_tokens.string, oneOne))

  return graph.Get('Combine3').getVdfNode()
}

describe('testVdfReorderConnections', () => {
  it('TestReorderInputConnections', () => {
    const testNetwork = new VdfTestUtils.Network()

    const network = testNetwork.getNetwork()
    const prevVersion = network.getVersion()

    const out = BuildTestNetwork2(testNetwork)

    expect(network.getVersion()).not.toBe(prevVersion)

    const oneOne = VdfMask.allOnes(1)
    const request = new VdfRequest(new VdfMaskedOutput(out.GetOutput(), oneOne))

    const schedule = new VdfSchedule()
    VdfScheduler.schedule(request, schedule, /* topologicalSort */ true)

    const exec = new VdfSimpleExecutor()
    exec.run(schedule)

    let result = exec.getOutputValue(out.GetOutput(_tokens.out)!, oneOne)!
      .getReadAccessor<string>(VtValueTypes.string).Get(0)
    expect(result).toBe('A, B, C, D')

    // Apply edit operation: reorder input connections.
    const combine1Node = testNetwork.Get('Combine1').getVdfNode()
    exec.invalidateValues([new VdfMaskedOutput(combine1Node.GetOutput(), oneOne)])

    const combine1Input = combine1Node.getInput(_tokens.string)!

    network.reorderInputConnections(combine1Input, [1, 0])

    exec.run(schedule)
    result = exec.getOutputValue(out.GetOutput(_tokens.out)!, oneOne)!
      .getReadAccessor<string>(VtValueTypes.string).Get(0)
    expect(result).toBe('B, A, C, D')

    // Error cases

    // Attempt to reorder with repeated indices.
    {
      const errorMark = new TfErrorMark()
      network.reorderInputConnections(combine1Input, [0, 0])
      expect(errorMark.getNumErrors()).toBe(1)
      errorMark.clear()
      errorMark.dispose()
    }

    // Attempt to reorder with out-of-range indices.
    {
      const errorMark = new TfErrorMark()
      network.reorderInputConnections(combine1Input, [1, 2])
      expect(errorMark.getNumErrors()).toBe(1)
      errorMark.clear()
      errorMark.dispose()
    }

    // Attempt to reorder with too many indices.
    {
      const errorMark = new TfErrorMark()
      network.reorderInputConnections(combine1Input, [0, 1, 2])
      expect(errorMark.getNumErrors()).toBe(1)
      errorMark.clear()
      errorMark.dispose()
    }
  })
})
