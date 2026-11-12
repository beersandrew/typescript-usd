// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpExpressionVariables.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD v26.08
// pxr/usd/pcp/testenv/testPcpExpressionVariables.py.

import { describe, expect, it } from 'vitest'
import {
  ExpressionVariables as PcpExpressionVariables,
  ExpressionVariablesSource as PcpExpressionVariablesSource,
  type Layer as PcpLayer,
  type LayerStackIdentifier as PcpLayerStackIdentifier,
  pcpLayerStackIdentifier,
} from '../../src/index.ts'

function layer(filePath: string): PcpLayer & {
  expressionVariables: Record<string, unknown>
} {
  return {
    filePath,
    expressionVariables: {},
    hasSpec: () => false,
    getSpecType: () => 'unknown',
    getSpecPaths: () => [],
    getFieldNames: () => [],
    getField(specPath, fieldName) {
      return specPath === '/' && fieldName === 'expressionVariables'
        ? this.expressionVariables
        : undefined
    },
    resolveAsset: assetPath => assetPath,
  }
}

describe('testPcpExpressionVariables', () => {
  it('test_Basic', () => {
    const empty = new PcpExpressionVariables()
    expect(empty.getSource().equals(new PcpExpressionVariablesSource())).toBe(true)
    expect(empty.getVariables()).toEqual({})

    const variables = new PcpExpressionVariables(
      new PcpExpressionVariablesSource(), { A: 'B' },
    )
    expect(variables.getSource().equals(new PcpExpressionVariablesSource())).toBe(true)
    expect(variables.getVariables()).toEqual({ A: 'B' })
    expect(variables.equals(variables)).toBe(true)
    expect(variables.equals(empty)).toBe(false)
  })

  it('test_Compute_Basic', () => {
    const rootLayer = layer('root')
    const rootId = pcpLayerStackIdentifier(rootLayer)
    expect(PcpExpressionVariables.compute(rootId, rootId).equals(
      new PcpExpressionVariables(new PcpExpressionVariablesSource(), {}),
    )).toBe(true)

    rootLayer.expressionVariables = { A: 'B' }
    expect(PcpExpressionVariables.compute(rootId, rootId).getVariables())
      .toEqual({ A: 'B' })
  })

  it('test_Compute_SessionLayer', () => {
    const rootLayer = layer('root')
    const sessionLayer = layer('session')
    const rootId = pcpLayerStackIdentifier(rootLayer, sessionLayer)
    expect(PcpExpressionVariables.compute(rootId, rootId).getVariables()).toEqual({})

    rootLayer.expressionVariables = { A: 'B', X: 'Y' }
    sessionLayer.expressionVariables = { A: 'C' }
    expect(PcpExpressionVariables.compute(rootId, rootId).getVariables())
      .toEqual({ A: 'C', X: 'Y' })
  })

  it('test_Compute_Chained', () => {
    const rootLayer = layer('root')
    const rootId = pcpLayerStackIdentifier(rootLayer)

    const ref1Layer = layer('ref1')
    const ref1Id: PcpLayerStackIdentifier = pcpLayerStackIdentifier(
      ref1Layer, undefined, new PcpExpressionVariablesSource(rootId, rootId),
    )
    const ref2Layer = layer('ref2')
    const ref2Id: PcpLayerStackIdentifier = pcpLayerStackIdentifier(
      ref2Layer, undefined, new PcpExpressionVariablesSource(ref1Id, rootId),
    )

    expect(PcpExpressionVariables.compute(rootId, rootId).getVariables()).toEqual({})
    expect(PcpExpressionVariables.compute(ref1Id, rootId).getVariables()).toEqual({})
    expect(PcpExpressionVariables.compute(ref2Id, rootId).getVariables()).toEqual({})

    ref2Layer.expressionVariables = { A: 'B', X: 'Z', I: 'J' }
    ref1Layer.expressionVariables = { A: 'B', X: 'Y' }
    rootLayer.expressionVariables = { A: 'C' }

    const rootVariables = PcpExpressionVariables.compute(rootId, rootId)
    const ref1Variables = PcpExpressionVariables.compute(ref1Id, rootId)
    const ref2Variables = PcpExpressionVariables.compute(ref2Id, rootId)
    expect(rootVariables.getVariables()).toEqual({ A: 'C' })
    expect(ref1Variables.getVariables()).toEqual({ A: 'C', X: 'Y' })
    expect(ref2Variables.getVariables()).toEqual({ A: 'C', X: 'Y', I: 'J' })

    expect(PcpExpressionVariables.compute(rootId, rootId, rootVariables)
      .equals(rootVariables)).toBe(true)
    expect(PcpExpressionVariables.compute(ref1Id, rootId, rootVariables)
      .equals(ref1Variables)).toBe(true)
    expect(PcpExpressionVariables.compute(ref2Id, rootId, ref1Variables)
      .equals(ref2Variables)).toBe(true)
  })
})
