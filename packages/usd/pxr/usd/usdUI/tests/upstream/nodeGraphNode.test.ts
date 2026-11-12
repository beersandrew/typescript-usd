// Ported from OpenUSD 26.11.1: pxr/usd/usdUI/testenv/testUsdUINodeGraphNode.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdUI/testenv/testUsdUINodeGraphNode.py
//
// The upstream test saves nodeGraph.usda; its testenv ships the expected file
// as baseline/nodeGraph.usda (copied verbatim to
// fixtures/testUsdUINodeGraphNode/baseline/). Upstream registers no diff
// against it; this port compares the exported layer to it in place of Save().
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Vec2f, Vec3f } from 'typescript-usd/gf'
import { Stage } from 'typescript-usd/usd'
import { NodeGraphNodeAPI } from 'typescript-usd/usdUI'

const BASELINE = join(dirname(fileURLToPath(import.meta.url)),
  'fixtures', 'testUsdUINodeGraphNode', 'baseline', 'nodeGraph.usda')

describe('TestUsdUINodeGraphNode', () => {
  it('test_Basic', () => {
    const stage = Stage.createNew()

    // Create this prim first, since it's the "entrypoint" to the layer, and
    // we want it to appear at the top
    const rootPrim = stage.definePrim('/ANode')

    // Test Node
    const nodeGraphNode = NodeGraphNodeAPI.apply(rootPrim)
    expect(nodeGraphNode.isValid()).toBe(true)

    // Test Position
    let posAttr = nodeGraphNode.getPosAttr()
    expect(posAttr.isValid()).toBe(true)
    posAttr = nodeGraphNode.createPosAttr()
    expect(posAttr.isValid(), 'Failed creating pos attribute').toBe(true)
    expect(posAttr.typeName).toBe('float2')
    posAttr.set(new Vec2f(3, 2))

    // Test Stacking Order
    let stackingOrderAttr = nodeGraphNode.getStackingOrderAttr()
    expect(stackingOrderAttr.isValid()).toBe(true)
    stackingOrderAttr = nodeGraphNode.createStackingOrderAttr()
    expect(stackingOrderAttr.isValid(), 'Failed creating stacking order attribute').toBe(true)
    expect(stackingOrderAttr.typeName).toBe('int')
    stackingOrderAttr.set(100)

    // Test Display Color
    let displayColorAttr = nodeGraphNode.getDisplayColorAttr()
    expect(displayColorAttr.isValid()).toBe(true)
    displayColorAttr = nodeGraphNode.createDisplayColorAttr()
    expect(displayColorAttr.isValid(), 'Failed creating display color attribute').toBe(true)
    expect(displayColorAttr.typeName).toBe('color3f')
    displayColorAttr.set(new Vec3f(1, 0, 0))

    // Test Size
    let sizeAttr = nodeGraphNode.getSizeAttr()
    expect(sizeAttr.isValid()).toBe(true)
    sizeAttr = nodeGraphNode.createSizeAttr()
    expect(sizeAttr.isValid(), 'Failed creating size attribute').toBe(true)
    expect(sizeAttr.typeName).toBe('float2')
    sizeAttr.set(new Vec2f(300, 400))

    // stage.GetRootLayer().Save()
    expect(stage.getRootLayer().exportToString()).toBe(readFileSync(BASELINE, 'utf8'))
  })
})
