// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpExpressionVariablesSource.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of testPcpExpressionVariablesSource.py.
//
// PcpExpressionVariablesSource identifies where composed expression variables
// come from — the root layer stack (default) or a specific layer stack id, with
// a source whose id equals the root id normalizing back to the root source.
import { describe, expect, it } from 'vitest'
import {
  ExpressionVariablesSource as PcpExpressionVariablesSource,
  LayerHandle as PcpLayerHandle,
  LayerStackIdentifier as PcpLayerStackIdentifier,
  pcpLayerStackIdentifier,
} from '../../src/index.ts'

const handle = (filePath: string): PcpLayerHandle => ({ filePath })

describe('PcpExpressionVariablesSource', () => {
  it('basic: root vs referenced source, normalization, resolution', () => {
    const defaultSource = new PcpExpressionVariablesSource()
    expect(defaultSource.equals(defaultSource)).toBe(true)
    expect(defaultSource.isRootLayerStack()).toBe(true)
    expect(defaultSource.getLayerStackIdentifier()).toBeNull()

    const rootId: PcpLayerStackIdentifier = pcpLayerStackIdentifier(handle('root'))
    // A source whose layer stack id equals the root id IS the root source.
    const rootSource = new PcpExpressionVariablesSource(rootId, rootId)
    expect(rootSource.equals(defaultSource)).toBe(true)
    expect(rootSource.isRootLayerStack()).toBe(true)
    expect(rootSource.getLayerStackIdentifier()).toBeNull()
    expect(rootSource.resolveLayerStackIdentifier(rootId)).toEqual(rootId)

    const refId: PcpLayerStackIdentifier = pcpLayerStackIdentifier(handle('ref'))
    const refSource = new PcpExpressionVariablesSource(refId, rootId)
    expect(refSource.equals(defaultSource)).toBe(false)
    expect(refSource.isRootLayerStack()).toBe(false)
    expect(refSource.getLayerStackIdentifier()).toEqual(refId)
    // Not the root source → resolves to its own id, not the root id.
    expect(refSource.resolveLayerStackIdentifier(rootId)).toEqual(refId)
  })
})
