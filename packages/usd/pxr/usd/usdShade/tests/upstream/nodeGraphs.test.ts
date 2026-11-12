// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeNodeGraphs.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdShade/testenv/testUsdShadeNodeGraphs.py
// NodeGraph pass-through resolution: outputs and interface inputs forward
// through graph boundaries to the effective source.

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Material, NodeGraph, Shader, computeEffectiveSource } from '../../src/index.ts'

describe('UsdShade NodeGraphs', () => {
  it('material surface output resolves through a NodeGraph to the inner shader', () => {
    const stage = Stage.createNew()
    const mat = Material.define(stage, '/Mat')
    const graph = NodeGraph.define(stage, '/Mat/Graph')
    const inner = Shader.define(stage, '/Mat/Graph/PS')
    inner.setShaderId('UsdPreviewSurface')

    // inner shader → graph output → material output
    graph.createOutput('surface').connectToSource(inner.createOutput('surface'))
    mat.createSurfaceOutput().connectToSource(graph.getOutput('surface'))

    const source = Material.computeSurfaceSource(stage, '/Mat')
    expect(source).toEqual({ primPath: '/Mat/Graph/PS', name: 'surface', sourceType: 'output' })
  })

  it('shader input connected to a NodeGraph interface input resolves to the outer source', () => {
    const stage = Stage.createNew()
    // /Mat is the container so /Mat/Graph and /Mat/Tex are encapsulated
    // siblings (required for the interface-input connection to validate).
    Material.define(stage, '/Mat')
    const graph = NodeGraph.define(stage, '/Mat/Graph')
    const graphIn = graph.createInput('baseColor', 'color3f')
    const outerTex = Shader.define(stage, '/Mat/Tex')
    graphIn.connectToSource(outerTex.createOutput('rgb', 'float3'))

    const inner = Shader.define(stage, '/Mat/Graph/PS')
    inner.createInput('diffuseColor', 'color3f').connectToSource(graphIn)

    const source = computeEffectiveSource(stage, '/Mat/Graph/PS.inputs:diffuseColor')
    expect(source).toEqual({ primPath: '/Mat/Tex', name: 'rgb', sourceType: 'output' })
  })

  it('unconnected property resolves to null', () => {
    const stage = Stage.createNew()
    Shader.define(stage, '/S').createInput('x', 'float').set(1)
    expect(computeEffectiveSource(stage, '/S.inputs:x')).toBeNull()
  })

  it('direct connection (no pass-through) resolves in one hop', () => {
    const stage = Stage.createNew()
    const mat = Material.define(stage, '/Mat')
    const ps = Shader.define(stage, '/Mat/PS')
    mat.createSurfaceOutput().connectToSource(ps.createOutput('surface'))

    expect(Material.computeSurfaceSource(stage, '/Mat'))
      .toEqual({ primPath: '/Mat/PS', name: 'surface', sourceType: 'output' })
  })
})
