// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdShade/testenv/testUsdShadeConnectability.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdShade/testenv/testUsdShadeConnectability.py
// Also covers the registration testUsdShadeConnectability_OldEncoding: in
// OpenUSD 26.11.1 pxr/usd/usdShade/CMakeLists.txt:182-186 registers it with the
// same command, arguments and environment as testUsdShadeConnectability
// (CMakeLists.txt:171-175), so the same assertions apply unchanged.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import {
  Shader, Material, NodeGraph,
  getInputNames, getOutputNames, parseSourcePath,
  isContainer, canConnect,
} from '../../src/index.ts'

// Type-only declaration for the host-provided global; the compiled lib
// (ES2022, no DOM/Node types) does not include it. No runtime emit.
describe('testUsdShadeConnectability / testUsdShadeConnectability_OldEncoding', () => {
  it('createInput authors inputs:NAME with the given type', () => {
    const stage = Stage.createNew()
    const shader = Shader.define(stage, '/S')
    shader.createInput('diffuseColor', 'color3f').set([1, 0, 0])

    const prim = stage.getPrim('/S')!
    expect(prim.getAttr('inputs:diffuseColor')!.getValue()).toEqual([1, 0, 0])
    expect(getInputNames(prim)).toEqual(['diffuseColor'])
  })

  it('createOutput authors outputs:NAME', () => {
    const stage = Stage.createNew()
    const shader = Shader.define(stage, '/S')
    shader.createOutput('surface')
    expect(getOutputNames(stage.getPrim('/S')!)).toEqual(['surface'])
  })

  it('connectToSource wires an input to a shader output', () => {
    const stage = Stage.createNew()
    // /Mat is a container so the two sibling shaders are encapsulated.
    Material.define(stage, '/Mat')
    const tex = Shader.define(stage, '/Mat/Tex')
    const rgb = tex.createOutput('rgb', 'float3')
    const surf = Shader.define(stage, '/Mat/Surf')
    const input = surf.createInput('diffuseColor', 'color3f')

    expect(input.connectToSource(rgb)).toBe(true)

    const source = surf.getInput('diffuseColor').getConnectedSource()
    expect(source).toEqual({ primPath: '/Mat/Tex', name: 'rgb', sourceType: 'output' })
  })

  it('hasConnectedSource and disconnectSource', () => {
    const stage = Stage.createNew()
    Material.define(stage, '/Mat')
    const a = Shader.define(stage, '/Mat/A')
    const b = Shader.define(stage, '/Mat/B')
    const input = a.createInput('in', 'float')
    expect(input.hasConnectedSource()).toBe(false)

    input.connectToSource(b.createOutput('out', 'float'))
    expect(input.hasConnectedSource()).toBe(true)

    input.disconnectSource()
    expect(input.hasConnectedSource()).toBe(false)
  })

  it('shader id round-trips via info:id', () => {
    const stage = Stage.createNew()
    const shader = Shader.define(stage, '/S')
    shader.setShaderId('UsdPreviewSurface')
    expect(Shader.getShaderId(stage.getPrim('/S')!)).toBe('UsdPreviewSurface')
  })

  it('parseSourcePath splits prim path, name, and source type', () => {
    expect(parseSourcePath('/Mat/Tex.outputs:rgb'))
      .toEqual({ primPath: '/Mat/Tex', name: 'rgb', sourceType: 'output' })
    expect(parseSourcePath('/Mat.inputs:scale'))
      .toEqual({ primPath: '/Mat', name: 'scale', sourceType: 'input' })
  })

  // ---- CanConnect / IsContainer / encapsulation gate ----
  // Ported from testUsdShadeConnectability.py test_Basic. Topology:
  //   /Material            (Material, container)
  //   /Material/Shader     (Shader, not a container)
  //   /Material/NodeGraph  (NodeGraph, container)
  //   /Material/NodeGraph/NestedShader (nested Shader)
  function basicScene() {
    const stage = Stage.createNew()
    const material = Material.define(stage, '/Material')
    const shader = Shader.define(stage, '/Material/Shader')
    const nodeGraph = NodeGraph.define(stage, '/Material/NodeGraph')
    const nestedShader = Shader.define(stage, '/Material/NodeGraph/NestedShader')
    return { stage, material, shader, nodeGraph, nestedShader }
  }

  const inP = (prim: string, name: string) => `${prim}.inputs:${name}`
  const outSrc = (prim: string, name: string) =>
    ({ primPath: prim, name, sourceType: 'output' as const })
  const inSrc = (prim: string, name: string) =>
    ({ primPath: prim, name, sourceType: 'input' as const })

  it('IsContainer reflects the per-type connectable behavior', () => {
    const { stage } = basicScene()
    expect(isContainer(stage, '/Material')).toBe(true)
    expect(isContainer(stage, '/Material/NodeGraph')).toBe(true)
    expect(isContainer(stage, '/Material/Shader')).toBe(false)
  })

  it('input defaults to full connectability', () => {
    const { material } = basicScene()
    const fIn = material.createInput('floatInput', 'float')
    expect(fIn.getConnectability()).toBe('full')
  })

  it('shader input (full) connects to its container interface input', () => {
    const { stage, material, shader } = basicScene()
    material.createInput('colorInput', 'color3f')
    shader.createInput('shaderColor', 'color3f')
    // /Material/Shader.inputs:shaderColor <- /Material.inputs:colorInput
    expect(canConnect(stage, inP('/Material/Shader', 'shaderColor'),
      inSrc('/Material', 'colorInput')).canConnect).toBe(true)
  })

  it('shader outputs are not connectable to ANYTHING', () => {
    const { stage, material, shader, nodeGraph } = basicScene()
    material.createInput('floatInput', 'float')
    shader.createOutput('fOut', 'float')
    nodeGraph.createInput('ngFloat', 'float')
    // Trying to connect TO a shader output is refused regardless of the source.
    expect(canConnect(stage, '/Material/Shader.outputs:fOut',
      inSrc('/Material', 'floatInput')).canConnect).toBe(false)
    expect(canConnect(stage, '/Material/Shader.outputs:fOut',
      inSrc('/Material/NodeGraph', 'ngFloat')).canConnect).toBe(false)
  })

  it('material interface input (full) can be driven by a shader output', () => {
    const { stage, material, shader } = basicScene()
    material.createInput('floatInput', 'float')
    shader.createOutput('fOut', 'float')
    // /Material.inputs:floatInput <- /Material/Shader.outputs:fOut
    expect(canConnect(stage, inP('/Material', 'floatInput'),
      outSrc('/Material/Shader', 'fOut')).canConnect).toBe(true)
  })

  it('input-input connection requires source to be the immediate container', () => {
    const { stage, material, nodeGraph } = basicScene()
    material.createInput('floatInput', 'float')
    nodeGraph.createInput('ngFloat', 'float')
    // /Material/NodeGraph.inputs:ngFloat <- /Material.inputs:floatInput  (ok)
    expect(canConnect(stage, inP('/Material/NodeGraph', 'ngFloat'),
      inSrc('/Material', 'floatInput')).canConnect).toBe(true)
  })

  it('interfaceOnly input cannot be driven by an output', () => {
    const { stage, material, nodeGraph } = basicScene()
    material.createOutput('colorOut', 'color3f')
    const ngColor = nodeGraph.createInput('ngColor', 'color3f')
    ngColor.setConnectability('interfaceOnly')
    expect(ngColor.getConnectability()).toBe('interfaceOnly')
    // shader output and material output are both refused
    material.createInput('x', 'color3f')
    const shaderOut = Shader.define(stage, '/Material/S2').createOutput('cOut', 'color3f')
    expect(shaderOut).toBeTruthy()
    expect(canConnect(stage, inP('/Material/NodeGraph', 'ngColor'),
      outSrc('/Material/S2', 'cOut')).canConnect).toBe(false)
    expect(canConnect(stage, inP('/Material/NodeGraph', 'ngColor'),
      outSrc('/Material', 'colorOut')).canConnect).toBe(false)
  })

  it("interfaceOnly input cannot be driven by a 'full' input", () => {
    const { stage, material, shader, nodeGraph } = basicScene()
    const ngColor = nodeGraph.createInput('ngColor', 'color3f')
    ngColor.setConnectability('interfaceOnly')
    const shaderColor = shader.createInput('shaderColor', 'color3f') // full by default
    expect(shaderColor.getConnectability()).toBe('full')
    // even though shader input shares no container path, connectability fails first
    expect(canConnect(stage, inP('/Material/NodeGraph', 'ngColor'),
      inSrc('/Material/Shader', 'shaderColor')).canConnect).toBe(false)
    expect(material).toBeTruthy()
  })

  it('interfaceOnly→interfaceOnly is allowed only when encapsulated', () => {
    const { stage, material, nodeGraph } = basicScene()
    const matIn = material.createInput('floatInput', 'float')
    matIn.setConnectability('interfaceOnly')
    const ngIn = nodeGraph.createInput('ngFloat', 'float')
    ngIn.setConnectability('interfaceOnly')
    // /Material/NodeGraph.inputs:ngFloat <- /Material.inputs:floatInput
    // source (/Material) is the immediate container of /Material/NodeGraph -> ok
    expect(canConnect(stage, inP('/Material/NodeGraph', 'ngFloat'),
      inSrc('/Material', 'floatInput')).canConnect).toBe(true)
  })

  it('nested shader input cannot reach a non-immediate ancestor interface', () => {
    const { stage, material, nestedShader } = basicScene()
    const matIn = material.createInput('floatInput', 'float')
    matIn.setConnectability('full')
    const nestedIn = nestedShader.createInput('nf', 'float')
    nestedIn.setConnectability('interfaceOnly')
    // /Material/NodeGraph/NestedShader.inputs:nf <- /Material.inputs:floatInput
    // /Material is NOT the immediate container of the nested shader -> refused.
    expect(canConnect(stage, inP('/Material/NodeGraph/NestedShader', 'nf'),
      inSrc('/Material', 'floatInput')).canConnect).toBe(false)
  })

  it('nodegraph input cannot connect to its descendant shader output (unlike material)', () => {
    const { stage, nodeGraph, nestedShader } = basicScene()
    const ngIn = nodeGraph.createInput('ngFloat', 'float')
    nestedShader.createOutput('fOut', 'float')
    // /Material/NodeGraph.inputs:ngFloat <- /Material/NodeGraph/NestedShader.outputs:fOut
    // For a NodeGraph (basic node) the input and source must share the SAME
    // container; the source here is a descendant, so it's refused.
    expect(ngIn.getConnectability()).toBe('full')
    expect(canConnect(stage, inP('/Material/NodeGraph', 'ngFloat'),
      outSrc('/Material/NodeGraph/NestedShader', 'fOut')).canConnect).toBe(false)
  })

  it('connections survive a USDA round-trip', async () => {
    const stage = Stage.createNew()
    const mat = Material.define(stage, '/Looks/Red')
    const surf = Shader.define(stage, '/Looks/Red/PS')
    surf.setShaderId('UsdPreviewSurface')
    surf.createInput('diffuseColor', 'color3f').set([1, 0, 0])
    mat.createSurfaceOutput().connectToSource(surf.createOutput('surface'))

    const { Stage: StageCls } = await import('typescript-usd/usd')
    const { ArInMemoryResolver } = await import('typescript-usd/usd/_internal')
    const { _resolverContextForResolver } = await import('typescript-usd/usd/_internal')
    const usda = stage.exportToUsda()
    const resolver = new ArInMemoryResolver({ 'rt.usda': new TextEncoder().encode(usda) })
    const reopened = (await StageCls.open('rt.usda', {
      resolverContext: _resolverContextForResolver(resolver),
    }))!

    const out = reopened.getPrim('/Looks/Red')!.getAttr('outputs:surface')!
    expect(out.getConnections()).toEqual(['/Looks/Red/PS.outputs:surface'])
    expect(Shader.getShaderId(reopened.getPrim('/Looks/Red/PS')!)).toBe('UsdPreviewSurface')
  })
})
