// Ported from OpenUSD 26.11.1: pxr/usd/sdr/testenv/testSdrShownIfConversion.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/usd/sdr/testenv/testSdrShownIfConversion.py
// (registration testSdrShownIfConversion) with its testenv
// (fixtures/testSdrShownIfConversion.testenv, copied unmodified).
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ShaderDefParserPlugin, ShaderDefUtils } from 'typescript-usd/usdShade'

const TESTENV = path.join(import.meta.dirname, 'fixtures/testSdrShownIfConversion.testenv')

describe('testSdrShownIfConversion', () => {
  // testSdrShownIfConversion.py:15-52.
  it('test_SdrShownIfConversion', async () => {
    const expectedNodes: Record<string, Record<string, string>> = {
      TestConversion: {
        input1: 'numOps >= 1',
        input2: 'numOps >= 2 && input1 < 10',
      },
      TestPassThrough: {
        input1: '(numOps >= 1)',
        input2: '((numOps >= 2) && (input1 < 10))',
      },
    }
    for (const [nodeName, inputs] of Object.entries(expectedNodes)) {
      const file = path.join(TESTENV, `${nodeName}.usda`)
      const stage = (await Stage.open(file))!
      const discoveredShaders = ShaderDefUtils.getDiscoveryResults(stage, `/${nodeName}`, file)
      const node = new ShaderDefParserPlugin(stage).parseShaderNode(discoveredShaders[0]!)
      expect(node).toBeDefined()
      for (const [inputName, expected] of Object.entries(inputs)) {
        const input = node.getShaderInput(inputName)
        expect(input, `${nodeName}.${inputName}`).toBeDefined()
        expect(input!.getShownIf(), `${nodeName}.${inputName}`).toBe(expected)
      }
    }
  })
})
