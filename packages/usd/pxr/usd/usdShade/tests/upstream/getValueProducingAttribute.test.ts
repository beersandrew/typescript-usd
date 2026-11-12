// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeGetValueProducingAttribute.py,
//  pxr/usd/usdShade/utils.cpp
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1
// pxr/usd/usdShade/testenv/testUsdShadeGetValueProducingAttribute.py
// (registered as testUsdShadeGetValueProducingAttribute). The testenv input
// testUsdShadeGetValueProducingAttribute/test.usda is copied unmodified into
// fixtures/testUsdShadeGetValueProducingAttribute (Copyright 2019 Pixar,
// TOST 1.0, https://openusd.org/license).
//
// API mapping: UsdShadeUtils::GetType(name) is the inputs:/outputs: prefix
// of the attribute name (utils.cpp GetBaseNameAndType); UsdShade.Input.IsInput
// / Output.IsOutput are the same prefix checks on an attribute.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage, type Attribute } from 'typescript-usd/usd'
import { ConnectableAPI, getValueProducingAttributes } from '../../src/index.ts'

const TEST_USDA = fileURLToPath(new URL(
  './fixtures/testUsdShadeGetValueProducingAttribute/test.usda', import.meta.url))

type AttrType = 'Input' | 'Output' | 'Invalid'
const Input: AttrType = 'Input'
const Output: AttrType = 'Output'

const getType = (attr: Attribute): AttrType =>
  attr.name.startsWith('inputs:') ? Input : attr.name.startsWith('outputs:') ? Output : 'Invalid'

describe('testUsdShadeGetValueProducingAttribute', () => {
  it('test_GetValueProducingAttribute', async () => {
    const stage = (await Stage.open(TEST_USDA))!
    const api = (path: string) => new ConnectableAPI(stage.getPrim(path), stage)

    const check = (attr: Attribute, expectedPath: string, expectedValue?: unknown): void => {
      expect(attr.isValid()).toBe(true)
      if (expectedPath.includes('inputs:')) expect(getType(attr)).toBe(Input)
      else expect(getType(attr)).toBe(Output)
      expect(attr.getPath()).toBe(expectedPath)
      expect(attr.getValue()).toEqual(expectedValue)
    }

    const test = (prim: ConnectableAPI, inputName: string,
      expectedType: AttrType, expectedPath: string, expectedValue?: unknown): void => {
      const attrs = prim.getInput(inputName).getValueProducingAttributes()
      expect(attrs.length, `${inputName}`).toBe(1)
      expect(getType(attrs[0]!)).toBe(expectedType)
      check(attrs[0]!, expectedPath, expectedValue)
    }

    const testInvalid = (prim: ConnectableAPI, inputName: string): void => {
      const attrs = prim.getInput(inputName).getValueProducingAttributes()
      expect(attrs.length, inputName).toBe(0)
    }

    const testMulti = (prim: ConnectableAPI, inputName: string,
      expectedTypes: AttrType[], expectedPaths: string[], expectedValues?: unknown[]): void => {
      const attrs = prim.getInput(inputName).getValueProducingAttributes()
      expect(attrs.length, inputName).toBe(expectedPaths.length)
      for (let i = 0; i < attrs.length; i++) {
        expect(getType(attrs[i]!)).toBe(expectedTypes[i])
        check(attrs[i]!, expectedPaths[i]!, expectedValues ? expectedValues[i] ?? undefined : undefined)
      }
    }

    const material = api('/Material')
    const terminal = api('/Material/Terminal')
    const nodeGraph = api('/Material/NodeGraph')
    const nested1 = api('/Material/NodeGraph/NestedNode1')
    const nested2 = api('/Material/NodeGraph/NestedNode2')
    const superNested = api('/Material/NodeGraph/NestedNodeGraph/NestedNodeGraph2/SuperNestedNode')

    // note, serval inputs resolve to the same attributes. Please see the
    // test.usda file to make sense of these connections

    // resolve top level inputs
    test(material, 'topLevelValue', Input, '/Material.inputs:topLevelValue', 'TopLevelValue')

    // resolve inputs on terminal node
    test(terminal, 'terminalInput1', Output, '/Material/NodeGraph/NestedNode1.outputs:nestedOut1')
    test(terminal, 'terminalInput2', Input, '/Material/NodeGraph.inputs:nodeGraphVal', 'NodeGraphValue')
    test(terminal, 'terminalInput3', Output, '/Material/RegularNode.outputs:nodeOutput')
    test(terminal, 'terminalInput4', Input, '/Material.inputs:topLevelValue', 'TopLevelValue')
    test(terminal, 'terminalInput5', Output,
      '/Material/NodeGraph/NestedNodeGraph/NestedNodeGraph2/SuperNestedNode.outputs:superNestedOut')
    test(terminal, 'terminalInput6', Input, '/Material.inputs:topLevelValue', 'TopLevelValue')

    // resolve inputs on node graph node
    test(nodeGraph, 'nodeGraphVal', Input, '/Material/NodeGraph.inputs:nodeGraphVal', 'NodeGraphValue')
    test(nodeGraph, 'nodeGraphIn1', Output, '/Material/RegularNode.outputs:nodeOutput')
    test(nodeGraph, 'nodeGraphIn2', Input, '/Material.inputs:topLevelValue', 'TopLevelValue')

    // resolve inputs on nested nodes
    test(nested1, 'nestedIn1', Input, '/Material/NodeGraph.inputs:nodeGraphVal', 'NodeGraphValue')
    test(nested2, 'nestedIn2', Output, '/Material/RegularNode.outputs:nodeOutput')
    test(superNested, 'superNestedIn', Input, '/Material/NodeGraph.inputs:nodeGraphVal', 'NodeGraphValue')

    // resolve invalid inputs
    testInvalid(terminal, 'terminalInput7')
    testInvalid(terminal, 'terminalInput8')

    // resolve inputs with a cycle (each issues a TF_WARN upstream)
    testInvalid(nodeGraph, 'cycleA')
    testInvalid(nodeGraph, 'deepCycleA')
    testInvalid(nodeGraph, 'selfLoop')

    // resolve multi-connection inputs
    testMulti(terminal, 'multiInput1', [Output, Output],
      ['/Material/NodeGraph/NestedNode1.outputs:nestedOut1',
        '/Material/RegularNode.outputs:nodeOutput'])
    testMulti(terminal, 'multiInput2', [Output, Output],
      ['/Material/NodeGraph/NestedNode1.outputs:nestedOut1',
        '/Material/NodeGraph/NestedNode2.outputs:nestedOut2'])
    testMulti(terminal, 'multiInput3', [Input, Output, Output, Output],
      ['/Material/NodeGraph.inputs:nodeGraphVal',
        '/Material/NodeGraph/NestedNode1.outputs:nestedOut1',
        '/Material/NodeGraph/NestedNode2.outputs:nestedOut2',
        '/Material/RegularNode.outputs:nodeOutput'],
      ['NodeGraphValue', undefined, undefined, undefined])

    // test resolution with the shaderOutputsOnly=True mode
    // Test Outputs
    // Finding the upstream attribute that is an output on a shader
    const surfaceGood = material.getOutput('surfaceGood')
    let attrs = getValueProducingAttributes(stage, surfaceGood.fullPath, true)
    expect(attrs.map(a => a.getPath())).toEqual(['/Material/Terminal.outputs:bxdfOut'])

    // Make sure it does not find upstream attributes that are not shader
    // outputs and carry values
    const surfaceBad = material.getOutput('surfaceBad')
    attrs = getValueProducingAttributes(stage, surfaceBad.fullPath, true)
    expect(attrs).toEqual([])

    // Test Inputs
    // Finding the upstream attribute that is an output of a shader
    const inputGood = terminal.getInput('terminalInput1')
    attrs = getValueProducingAttributes(stage, inputGood.fullPath, true)
    expect(attrs.map(a => a.getPath())).toEqual(
      ['/Material/NodeGraph/NestedNode1.outputs:nestedOut1'])

    // Make sure it does not find upstream attributes that are not shader
    // outputs and carry values
    const inputBad = terminal.getInput('terminalInput2')
    attrs = getValueProducingAttributes(stage, inputBad.fullPath, true)
    expect(attrs).toEqual([])
  })
})
