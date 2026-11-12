// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/tokens.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdMtlxTokens (pxr/usd/usdMtlx/tokens.h), exported from typescript-usd/usdMtlx
// as Tokens, as the generated schema libraries export theirs (usdGeom,
// usdLux). Expected: every UsdMtlx.Tokens member as native OpenUSD 26.11.1
// exposes it, captured into fixtures/tokens/ (FIXTURES.md).
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { Tokens } from 'typescript-usd/usdMtlx'

const native = JSON.parse(readFileSync(
  new URL('./fixtures/tokens/tokens.json', import.meta.url), 'utf8')).payload as Record<string, string>

it('UsdMtlx.Tokens has every native token with its value', () => {
  expect({ ...Tokens }).toEqual(native)
})

it('UsdMtlx.Tokens is frozen', () => {
  expect(Object.isFrozen(Tokens)).toBe(true)
})
