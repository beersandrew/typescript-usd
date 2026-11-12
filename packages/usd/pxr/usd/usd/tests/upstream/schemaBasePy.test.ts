// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdSchemaBasePy.py
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/usd/testenv/testUsdSchemaBasePy.py (26.11.1),
// registered as testUsdSchemaBasePy (pxr/usd/usd/CMakeLists.txt).
//
// TypeScript encoding: a default-constructed UsdSchemaBase is
// `new SchemaBase(undefined)`; the invalid UsdPrim it holds is `undefined`
// (the convention Stage.getPrim uses for an invalid prim), so the Python
// RuntimeError from invalidPrim.IsActive() has no separate analog here.

import { describe, expect, it } from 'vitest'
import { CollectionAPI, SchemaBase } from 'typescript-usd/usd'

describe('testUsdSchemaBasePy', () => {
  // testUsdSchemaBasePy.py:13-28 test_InvalidSchemaBase
  it('test_InvalidSchemaBase', () => {
    const sb = new SchemaBase(undefined)
    // Conversion to bool should return False.
    expect(sb.isValid()).toBe(false)
    // It should still be safe to get the prim, but the prim will be invalid.
    expect(sb.prim).toBeUndefined()
    // It should still be safe to get the path, but the path will be empty.
    expect(sb.path).toBe('')
    // A CollectionAPI made from it is a suitably invalid CollectionAPI object.
    const coll = new CollectionAPI(sb.prim, sb.stage, 'newcollection')
    expect(coll.isValid()).toBe(false)
    expect(() => coll.createExpansionRuleAttr()).toThrow()
  })
})
