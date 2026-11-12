// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpNegativeOffsetScale.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD v26.08
// pxr/usd/pcp/testenv/testPcpNegativeOffsetScale.py.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/usd/_internal'
import {
  Cache as PcpCache,
  ErrorType,
  type Error as PcpError,
  type Layer as PcpLayer,
  type LayerOpener as PcpLayerOpener,
} from '../../src/index.ts'

const FIXTURES = path.join(
  fileURLToPath(new URL('.', import.meta.url)), 'fixtures/negativeOffsetScale',
)

function opener(): PcpLayerOpener {
  const retained = new Map<string, PcpLayer>()
  return async filePath => {
    const existing = retained.get(filePath)
    if (existing) return existing
    try {
      const opened = (await Layer.open(filePath))!
      retained.set(filePath, opened)
      return opened
    } catch {
      return null
    }
  }
}

describe('testPcpNegativeOffsetScale', () => {
  it('test_NegativeLayerOffsetScaleNotAllowed', async () => {
    const open = opener()
    const root = await open(path.join(FIXTURES, 'root.usda'))
    expect(root).not.toBeNull()
    const cache = await PcpCache.create(root!, open)
    const errs: PcpError[] = []
    await cache.computePrimIndex('/prim', errs)
    expect(errs).toHaveLength(2)
    // Error types and order captured from OpenUSD v26.08's
    // Pcp.Cache.ComputePrimIndex on these fixtures.
    expect(errs.map(e => e.errorType)).toEqual([
      ErrorType.InvalidReferenceOffset, ErrorType.InvalidSublayerOffset,
    ])
  })
})
