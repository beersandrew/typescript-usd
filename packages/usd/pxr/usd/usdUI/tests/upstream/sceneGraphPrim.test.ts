// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUI/testenv/testUsdUISceneGraphPrim.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdUI/testenv/testUsdUISceneGraphPrim.py
//
// The upstream test saves sceneGraph.usda; its testenv ships the expected
// file as baseline/sceneGraph.usda (copied verbatim to
// fixtures/testUsdUISceneGraphPrim/baseline/). Upstream registers no diff
// against it; this port compares the exported layer to it in place of Save().
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { SceneGraphPrimAPI } from 'typescript-usd/usdUI'

const BASELINE = join(dirname(fileURLToPath(import.meta.url)),
  'fixtures', 'testUsdUISceneGraphPrim', 'baseline', 'sceneGraph.usda')

describe('TestUsdUISceneGraphPrim', () => {
  it('test_Basic', () => {
    const stage = Stage.createNew()

    // Create this prim first, since it's the "entrypoint" to the layer, and
    // we want it to appear at the top
    const rootPrim = stage.definePrim('/ANode')

    // Test Node
    const sceneGraphPrim = SceneGraphPrimAPI.apply(rootPrim)
    expect(sceneGraphPrim.isValid()).toBe(true)

    // Test displayName
    let displayNameAttr = sceneGraphPrim.getDisplayNameAttr()
    expect(displayNameAttr.isValid()).toBe(true)
    displayNameAttr = sceneGraphPrim.createDisplayNameAttr()
    expect(displayNameAttr.isValid(), 'Failed creating display attribute').toBe(true)
    expect(displayNameAttr.typeName).toBe('token')
    displayNameAttr.set('foo')

    // Test Display Color
    let displayGroupAttr = sceneGraphPrim.getDisplayGroupAttr()
    expect(displayGroupAttr.isValid()).toBe(true)
    displayGroupAttr = sceneGraphPrim.createDisplayGroupAttr()
    expect(displayGroupAttr.isValid(), 'Failed creating display color attribute').toBe(true)
    expect(displayGroupAttr.typeName).toBe('token')
    displayGroupAttr.set('bar')

    // stage.GetRootLayer().Save()
    expect(stage.getRootLayer().exportToString()).toBe(readFileSync(BASELINE, 'utf8'))
  })
})
