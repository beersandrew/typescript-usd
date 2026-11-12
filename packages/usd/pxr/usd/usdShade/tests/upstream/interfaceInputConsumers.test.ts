// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeInterfaceInputConsumers.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdShade/testenv/testUsdShadeInterfaceInputConsumers.py
// Material.ComputeInterfaceInputConsumersMap — which descendant inputs consume
// each interface input, non-transitively and transitively through nested
// node-graphs.

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Material, NodeGraph, Shader } from '../../src/index.ts'

// Consumer base-name sets, compared order-independently (the upstream test
// compares Python sets).
function consumerNames(map: Map<string, { name: string }[]>, input: string): Set<string> {
  return new Set((map.get(input) ?? []).map(c => c.name))
}

describe('UsdShade InterfaceInputConsumers', () => {
  function setupStage(): Stage {
    const stage = Stage.createNew()

    const material = Material.define(stage, '/Material')
    const nodeGraph1 = NodeGraph.define(stage, '/Material/NodeGraph1')
    const nodeGraph2 = NodeGraph.define(stage, '/Material/NodeGraph2')
    const shader1 = Shader.define(stage, '/Material/Shader1')
    const shader2 = Shader.define(stage, '/Material/Shader2')
    const nestedShader1 = Shader.define(stage, '/Material/NodeGraph1/NestedShader1')
    const nestedShader2 = Shader.define(stage, '/Material/NodeGraph1/NestedShader2')
    const nestedShader3 = Shader.define(stage, '/Material/NodeGraph2/NestedShader3')
    const nestedNodeGraph = NodeGraph.define(stage, '/Material/NodeGraph1/NestedNodeGraph')

    // Interface inputs on the material.
    const floatInput = material.createInput('floatInput', 'float')
    const colorInput = material.createInput('colorInput', 'color3f')

    const shader1Input1 = shader1.createInput('shader1Input1', 'float')
    const shader1Input2 = shader1.createInput('shader1Input2', 'color3f')
    const shader2Input1 = shader2.createInput('shader2Input1', 'color3f')
    const shader2Input2 = shader2.createInput('shader2Input2', 'float')

    const nodeGraph1FloatInput = nodeGraph1.createInput('nodeGraph1FloatInput', 'float')
    const nodeGraph1ColorInput = nodeGraph1.createInput('nodeGraph1ColorInput', 'color3f')
    const nodeGraph2FloatInput = nodeGraph2.createInput('nodeGraph2FloatInput', 'float')
    const nodeGraph2ColorInput = nodeGraph2.createInput('nodeGraph2ColorInput', 'color3f')

    const nestedShader1Input1 = nestedShader1.createInput('nestedShader1Input1', 'color3f')
    const nestedShader1Input2 = nestedShader1.createInput('nestedShader1Input2', 'float')
    const nestedShader2Input1 = nestedShader2.createInput('nestedShader2Input1', 'float')
    const nestedShader2Input2 = nestedShader2.createInput('nestedShader2Input2', 'color3f')
    const nestedShader3Input1 = nestedShader3.createInput('nestedShader3Input1', 'color3f')
    const nestedShader3Input2 = nestedShader3.createInput('nestedShader3Input2', 'float')
    const nestedNodeGraphInput1 = nestedNodeGraph.createInput('nestedNodeGraphInput1', 'float')
    const nestedNodeGraphInput2 = nestedNodeGraph.createInput('nestedNodeGraphInput2', 'color3f')

    // Wire up the connections (all interface-input pass-downs).
    expect(shader1Input1.connectToSource(floatInput)).toBe(true)
    expect(shader1Input2.connectToSource(colorInput)).toBe(true)
    expect(shader2Input1.connectToSource(colorInput)).toBe(true)
    expect(shader2Input2.connectToSource(floatInput)).toBe(true)

    expect(nodeGraph1ColorInput.connectToSource(colorInput)).toBe(true)
    expect(nodeGraph1FloatInput.connectToSource(floatInput)).toBe(true)
    expect(nodeGraph2ColorInput.connectToSource(colorInput)).toBe(true)
    expect(nodeGraph2FloatInput.connectToSource(floatInput)).toBe(true)

    expect(nestedShader1Input1.connectToSource(nodeGraph1ColorInput)).toBe(true)
    expect(nestedShader1Input2.connectToSource(nodeGraph1FloatInput)).toBe(true)
    expect(nestedShader2Input1.connectToSource(nodeGraph1FloatInput)).toBe(true)
    expect(nestedShader2Input2.connectToSource(nodeGraph1ColorInput)).toBe(true)
    expect(nestedShader3Input1.connectToSource(nodeGraph2ColorInput)).toBe(true)
    expect(nestedShader3Input2.connectToSource(nodeGraph2FloatInput)).toBe(true)
    expect(nestedNodeGraphInput1.connectToSource(nodeGraph1FloatInput)).toBe(true)
    expect(nestedNodeGraphInput2.connectToSource(nodeGraph1ColorInput)).toBe(true)

    return stage
  }

  it('computes non-transitive interface input consumers', () => {
    const stage = setupStage()
    const material = Material.define(stage, '/Material')

    const map = material.computeInterfaceInputConsumersMap()
    expect(map.size).toBe(2)

    expect(consumerNames(map, 'floatInput')).toEqual(
      new Set(['nodeGraph1FloatInput', 'nodeGraph2FloatInput', 'shader1Input1', 'shader2Input2']))
    expect(consumerNames(map, 'colorInput')).toEqual(
      new Set(['nodeGraph1ColorInput', 'nodeGraph2ColorInput', 'shader2Input1', 'shader1Input2']))
  })

  it('computes transitive interface input consumers through nested node-graphs', () => {
    const stage = setupStage()
    const material = Material.define(stage, '/Material')

    const map = material.computeInterfaceInputConsumersMap(true)
    expect(map.size).toBe(2)

    expect(consumerNames(map, 'floatInput')).toEqual(new Set([
      'nestedShader1Input2', 'nestedShader2Input1', 'shader1Input1', 'shader2Input2',
      'nestedShader3Input2', 'nestedNodeGraphInput1']))
    expect(consumerNames(map, 'colorInput')).toEqual(new Set([
      'nestedShader1Input1', 'nestedShader2Input2', 'shader1Input2', 'shader2Input1',
      'nestedShader3Input1', 'nestedNodeGraphInput2']))
  })
})
