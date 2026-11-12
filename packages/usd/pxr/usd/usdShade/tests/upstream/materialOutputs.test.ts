// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeMaterialOutputs.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdShade/testenv/testUsdShadeMaterialOutputs.py
// (registered as testUsdShadeMaterialOutputs).
//
// API mapping: a falsy UsdShadeOutput is one whose attribute is not
// defined (output.attr.isValid() === false); UsdShadeOutput::GetBaseName is
// ShadeOutput.name; UsdShadeMaterial::Compute*Source(renderContext) is the
// static Material.compute*Source(stage, path, renderContext), whose
// primPath is the source shader's path.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { Material, NodeGraph, Shader } from '../../src/index.ts'

describe('testUsdShadeMaterialOutputs', () => {
  it('test_MaterialOutputs', async () => {
    const stage = await Stage.open(Layer.createAnonymous())
    const mat = Material.define(stage, '/Material')

    const univSurfaceOutput = mat.getSurfaceOutput('')
    const univDisplacementOutput = mat.getDisplacementOutput()
    const univVolumeOutput = mat.getVolumeOutput()

    expect(univSurfaceOutput.attr.isValid()).toBe(true)
    expect(univDisplacementOutput.attr.isValid()).toBe(true)
    expect(univVolumeOutput.attr.isValid()).toBe(true)

    let riSurfOutput = mat.getSurfaceOutput('ri')
    let riDispOutput = mat.getDisplacementOutput('ri')
    let riVolOutput = mat.getVolumeOutput('ri')

    expect(riSurfOutput.attr.isValid()).toBe(false)
    expect(riDispOutput.attr.isValid()).toBe(false)
    expect(riVolOutput.attr.isValid()).toBe(false)

    riSurfOutput = mat.createSurfaceOutput('ri')
    riDispOutput = mat.createDisplacementOutput('ri')
    riVolOutput = mat.createVolumeOutput('ri')

    expect(riSurfOutput.attr.isValid()).toBe(true)
    expect(riDispOutput.attr.isValid()).toBe(true)
    expect(riVolOutput.attr.isValid()).toBe(true)

    const surfShader = Shader.define(stage, '/Material/Surf')
    const surfOutput = surfShader.createOutput('out', 'token')

    const dispShader = Shader.define(stage, '/Material/Disp')
    const dispOutput = dispShader.createOutput('out', 'token')

    const volShader = Shader.define(stage, '/Material/Vol')
    const volOutput = volShader.createOutput('out', 'token')

    const ng = NodeGraph.define(stage, '/Material/NodeGraph')
    const ngSurfOutput = ng.createOutput('ngSurfOutput', 'token')
    const ngDispOutput = ng.createOutput('ngDispOutput', 'token')
    const ngVolOutput = ng.createOutput('ngVolOutput', 'token')

    const ngSurfShader = Shader.define(stage, '/Material/NodeGraph/NGSurf')
    const ngSurfShaderOutput = ngSurfShader.createOutput('out', 'token')
    const ngDispShader = Shader.define(stage, '/Material/NodeGraph/NGDisp')
    const ngDispShaderOutput = ngDispShader.createOutput('out', 'token')
    const ngVolShader = Shader.define(stage, '/Material/NodeGraph/NGVol')
    const ngVolShaderOutput = ngVolShader.createOutput('out', 'token')

    // Author universal output connections.
    univSurfaceOutput.connectToSource(surfOutput)
    univDisplacementOutput.connectToSource(dispOutput)
    univVolumeOutput.connectToSource(volOutput)

    const source = (terminal: 'Surface' | 'Displacement' | 'Volume', context = '') =>
      Material[`compute${terminal}Source`](stage, '/Material', context)?.primPath

    expect(source('Surface')).toBe(surfShader.path)
    expect(source('Displacement')).toBe(dispShader.path)
    expect(source('Volume')).toBe(volShader.path)

    expect(source('Surface', 'ri')).toBe(surfShader.path)
    expect(source('Displacement', 'ri')).toBe(dispShader.path)
    expect(source('Volume', 'ri')).toBe(volShader.path)

    ngSurfOutput.connectToSource(ngSurfShaderOutput)
    ngDispOutput.connectToSource(ngDispShaderOutput)
    ngVolOutput.connectToSource(ngVolShaderOutput)

    // Author render-context specific output connections.
    riSurfOutput.connectToSource(ngSurfOutput)
    riDispOutput.connectToSource(ngDispOutput)
    // connect to shader inside the node-graph directly.
    riVolOutput.connectToSource(ngVolShaderOutput)

    expect(source('Surface')).toBe(surfShader.path)
    expect(source('Displacement')).toBe(dispShader.path)
    expect(source('Volume')).toBe(volShader.path)

    expect(source('Surface', 'ri')).toBe(ngSurfShader.path)
    expect(source('Displacement', 'ri')).toBe(ngDispShader.path)
    expect(source('Volume', 'ri')).toBe(ngVolShader.path)

    // Create a few more outputs to exercise the multi-renderContext
    // terminal output getters.

    // A deeply namespaced "surface" output.
    mat.createSurfaceOutput(['deep', 'context'].join(':'))

    // A deeply namespaced, float3-typed "displacement" output.
    mat.createOutput(['deep', 'context', 'float', 'displacement'].join(':'), 'float3')

    // A color-typed "volume" output.
    mat.createOutput(['colorRenderContext', 'volume'].join(':'), 'color3d')

    // Arbitrary outputs that the getters should *not* return.
    mat.createOutput('bogusOutput', 'token')
    mat.createOutput(['bogusContext', 'randomOutput'].join(':'), 'token')

    expect(mat.getSurfaceOutputs().map(o => o.name)).toEqual(
      ['surface', 'deep:context:surface', 'ri:surface'])

    expect(mat.getDisplacementOutputs().map(o => o.name)).toEqual(
      ['displacement', 'deep:context:float:displacement', 'ri:displacement'])

    expect(mat.getVolumeOutputs().map(o => o.name)).toEqual(
      ['volume', 'colorRenderContext:volume', 'ri:volume'])
  })
})
