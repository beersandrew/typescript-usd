// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdTemplatedIO.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usd/testenv/testUsdTemplatedIO.cpp
// (registered as testUsdTemplatedIO). Upstream exercises the templated
// (typed) and VtValue overloads of Get/Set and GetMetadata/SetMetadata; values
// here are untyped, so each pair of overloads is one call. The wrong-type
// Get<int> checks have no counterpart (there is no typed extraction to
// fail), nor does the Py_IsInitialized() axiom. The layer exports printed for
// debugging are not compared upstream and are not here.

import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Vec3d } from 'typescript-usd/gf'
import { Stage, AttributeQuery as UsdAttributeQuery } from 'typescript-usd/usd'

const first = (value: unknown) => [...(value as Iterable<Vec3d>)][0]

describe('testUsdTemplatedIO', () => {
  it('TestTemplates', async () => {
    // This test operates on /RootPrim.foo and /RootPrim.foo:hidden
    const primPath = '/RootPrim'
    const prop = 'foo'
    const metaField = 'hidden'

    // Author scene and compose the Stage
    const layer = Layer.createAnonymous()
    const stage = await Stage.open(layer)
    expect(stage.overridePrim(primPath).isValid()).toBe(true)
    const prim = stage.getPrim(primPath)!
    expect(prim).toBeTruthy()

    // Grab the attribute we will be testing with.
    const attr = prim.createAttribute(prop, 'double3[]')
    expect(attr.isValid()).toBe(true)

    // TEST READING METADATA: GetMetadata & SetMetadata (VtValue and bool).
    expect(attr.setMetadata(metaField, true)).toBe(true)
    expect(attr.getMetadata(metaField)).toBe(true)
    expect(attr.setMetadata(metaField, true)).toBe(true)
    expect(attr.getMetadata(metaField)).toBe(true)

    // TEST READING VALUES: Get & Set the value (VtValue and VtArray).
    for (const v of [new Vec3d(9, 8, 7), new Vec3d(6, 5, 4)]) {
      const vtVecOut = [v]
      attr.set(vtVecOut)
      expect(first(attr.getValue())).toEqual(vtVecOut[0])
      // Verify the result using a UsdAttributeQuery.
      expect(first(new UsdAttributeQuery(attr).get())).toEqual(vtVecOut[0])
    }

    // Get & Set the value as a VtDictionary (Dictionary composition semantics
    // are exercised in testUsdMetadata).
    const inDict = { '$Side': 'R' }
    expect(prim.hasAuthoredMetadata('prefixSubstitutions')).toBe(false)
    expect(prim.setMetadata('prefixSubstitutions', inDict)).toBe(true)
    expect(prim.hasAuthoredMetadata('prefixSubstitutions')).toBe(true)
    // Bug 97783 - GetMetadata succeeds when Usd was able to retrieve/compose
    // a VtDictionary.
    expect(prim.getMetadata('prefixSubstitutions')).toEqual(inDict)
  })
})
