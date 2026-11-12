// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/tokens.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdGeomTokens (pxr/usd/usdGeom/tokens.h), exported from typescript-usd/usdGeom
// as Tokens, as the generated schema libraries export theirs (usdLux,
// usdPhysics). Expected: every UsdGeom.Tokens member as native OpenUSD
// 26.11.1 exposes it, captured into fixtures/tokens/ (FIXTURES.md).
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { Tokens } from 'typescript-usd/usdGeom'

const native = JSON.parse(readFileSync(
  new URL('./fixtures/tokens/tokens.json', import.meta.url), 'utf8')).payload as Record<string, string>

it('UsdGeom.Tokens has every native token with its value', () => {
  expect({ ...Tokens }).toEqual(native)
})

it('UsdGeom.Tokens is frozen', () => {
  expect(Object.isFrozen(Tokens)).toBe(true)
})
