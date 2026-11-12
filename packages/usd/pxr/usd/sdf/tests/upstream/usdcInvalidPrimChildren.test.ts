// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfUsdcInvalidPrimChildren.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfUsdcInvalidPrimChildren.cpp (OpenUSD
// 26.11.1). Inputs: fixtures/testSdfUsdcInvalidPrimChildren.testenv/*.usdc,
// copied byte-for-byte unmodified from
// pxr/usd/sdf/testenv/testSdfUsdcInvalidPrimChildren.testenv/ (Pixar, licensed
// under the terms in OpenUSD's LICENSE.txt, https://openusd.org/license).
//
// Both cases are compiled in upstream only under PXR_PREFER_SAFETY_OVER_SPEED
// (:24, :49); typescript-usd's crate reader always validates prim children
// (crateFile.ts), so both run. Each FindOrOpen fails, posting the errors the
// test looks for among the mark's errors (any_of, :31-42 and :56-67).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// Importing typescript-usd/usd registers the crate (.usdc) file format.
import 'typescript-usd/usd'
import { Layer } from 'typescript-usd/sdf'
import { TfErrorMark } from 'typescript-usd/tf'

const TESTENV = path.join(
  fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testSdfUsdcInvalidPrimChildren.testenv')

async function openWithErrors(name: string) {
  const m = new TfErrorMark()
  try {
    const layer = await Layer.findOrOpen(path.join(TESTENV, name))
    const errors = m.getErrors().map(e => e.getCommentary())
    m.clear()
    return { layer, errors }
  } finally {
    m.dispose()
  }
}

describe('testSdfUsdcInvalidPrimChildren', () => {
  it('TestInvalidPrimChildren', async () => {
    const { layer, errors } = await openWithErrors('root.usdc')
    expect(layer).toBeUndefined()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.endsWith("Invalid child identifier '' found on parent '/_materials'")),
      errors.join('\n')).toBe(true)
    expect(errors.some(e => e.endsWith("Invalid children found in primChildren field for path '/_materials'")),
      errors.join('\n')).toBe(true)
  })

  it('TestDuplicatePrimChildren', async () => {
    const { layer, errors } = await openWithErrors('duplicate_prim_children.usdc')
    expect(layer).toBeUndefined()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some(e => e.endsWith("Duplicate child identifier 'Child1' found on parent '/Root'")),
      errors.join('\n')).toBe(true)
    expect(errors.some(e => e.endsWith("Invalid children found in primChildren field for path '/Root'")),
      errors.join('\n')).toBe(true)
  })
})
