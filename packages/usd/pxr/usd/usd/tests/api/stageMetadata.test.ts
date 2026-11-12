// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/prim.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Stage metadata + applied-schema authoring primitives.
// Mirrors UsdStage::{Set,Get,Has,Clear}DefaultPrim / SetMetadata and
// UsdPrim::{AddAppliedSchema,GetAppliedSchemas}.

import { describe, it, expect } from 'vitest'
import { Stage } from '../../src/index.ts'

describe('Stage.defaultPrim (UsdStage::SetDefaultPrim / GetDefaultPrim)', () => {
  it('authors, reads, and clears defaultPrim', () => {
    const stage = Stage.createNew()
    const world = stage.definePrim('/World', 'Xform')
    expect(stage.hasDefaultPrim()).toBe(false)
    expect(stage.getDefaultPrim()).toBeUndefined()

    stage.setDefaultPrim(world)
    expect(stage.hasDefaultPrim()).toBe(true)
    expect(stage.getDefaultPrim()?.path).toBe('/World')
    // Stored as a bare name on the root layer, per USD.
    expect(stage.getMetadata('defaultPrim')).toBe('World')

    stage.clearDefaultPrim()
    expect(stage.hasDefaultPrim()).toBe(false)
  })

  it('rejects a non-root-level prim', () => {
    const stage = Stage.createNew()
    const child = stage.definePrim('/World/Child', 'Xform')
    expect(() => stage.setDefaultPrim(child)).toThrow(/root-level/)
  })

  it('getDefaultPrim returns undefined when the named prim does not exist', () => {
    const stage = Stage.createNew()
    stage.setMetadata('defaultPrim', 'Ghost')
    expect(stage.getDefaultPrim()).toBeUndefined()
  })
})

describe('Stage metadata (UsdStage::{Set,Get,Has,Clear}Metadata)', () => {
  it('generic root-layer metadata round-trips and clears', () => {
    const stage = Stage.createNew()
    expect(stage.hasMetadata('comment')).toBe(false)
    stage.setMetadata('comment', 'hello')
    expect(stage.getMetadata('comment')).toBe('hello')
    expect(stage.hasMetadata('comment')).toBe(true)
    stage.clearMetadata('comment')
    expect(stage.hasMetadata('comment')).toBe(false)
  })
})

describe('Prim applied schemas (AddAppliedSchema / GetAppliedSchemas)', () => {
  it('adds a schema to apiSchemas, is idempotent, and appends in apply order', () => {
    // F1-C: GetAppliedSchemas now reports the COMPOSED prim definition's
    // applied list (prim.cpp:1362), so unregistered names never appear —
    // spelled with core CollectionAPI instances (auto-registered), and the
    // expected order is upstream's apply order (AddAppliedSchema appends to
    // the END of the prepend list, prim.cpp:1115-1126), not newest-first.
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Geom', 'Mesh')
    expect(prim.getAppliedSchemas()).toEqual([])

    prim.addAppliedSchema('CollectionAPI:render')
    expect(prim.getAppliedSchemas()).toEqual(['CollectionAPI:render'])

    // Idempotent.
    prim.addAppliedSchema('CollectionAPI:render')
    expect(prim.getAppliedSchemas()).toEqual(['CollectionAPI:render'])

    // Appended in apply order.
    prim.addAppliedSchema('CollectionAPI:proxy')
    expect(prim.getAppliedSchemas()).toEqual(['CollectionAPI:render', 'CollectionAPI:proxy'])
  })

  it('apiSchemas serialize as a prepend listOp in USDA', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/Geom', 'Mesh')
    prim.addAppliedSchema('MaterialBindingAPI')
    const usda = stage.exportToUsda()
    expect(usda).toMatch(/prepend apiSchemas = \["MaterialBindingAPI"\]/)
  })
})
