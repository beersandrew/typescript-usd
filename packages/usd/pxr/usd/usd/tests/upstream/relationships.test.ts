// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/relationship.cpp, pxr/usd/usd/testenv/testUsdRelationships.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Relationship + attribute-connection authoring, composed reads, and
// USDA round-trip. Foundation for UsdShade (material:binding, shader wiring).

import { afterEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

afterEach(() => {
  _setResolverForTest(new ArInMemoryResolver({}))
})

async function reopen(stage: Stage): Promise<Stage> {
  const usda = stage.exportToUsda()
  return (await Stage.open('roundtrip.usda', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'roundtrip.usda': new TextEncoder().encode(usda) })) }))!
}

describe('testUsdRelationships — relationships', () => {
  it('createRel authors targets readable via composed stage', () => {
    const stage = Stage.createNew()
    stage.definePrim('/Mat', 'Material')
    const prim = stage.definePrim('/M', 'Mesh')
    prim.createRel('material:binding', ['/Mat'])

    const attr = stage.getPrim('/M')!.getAttr('material:binding')!
    expect(attr.isRelationship).toBe(true)
    expect(attr.getTargets()).toEqual(['/Mat'])
  })

  it('addTarget moves an existing target to the back of the prepend list', () => {
    // UsdRelationship::AddTarget is Usd_InsertListItem at
    // ListPositionBackOfPrependList (relationship.cpp:85-111). Native
    // OpenUSD 26.11.1 (CreateInMemory, CreateRelationship, AddTarget /A, /B,
    // /A): GetTargets() == [/B, /A].
    const stage = Stage.createNew()
    const prim = stage.definePrim('/M', 'Mesh')
    const rel = prim.createRelationship('proxyPrim')
    rel.addTarget('/A')
    rel.addTarget('/B')
    rel.addTarget('/A')
    expect(rel.getTargets()).toEqual(['/B', '/A'])
  })

  it('rel targets round-trip through USDA export and re-parse', async () => {
    const stage = Stage.createNew()
    stage.definePrim('/Mat', 'Material')
    stage.definePrim('/M', 'Mesh').createRel('material:binding', ['/Mat'])

    const reopened = await reopen(stage)
    const attr = reopened.getPrim('/M')!.getAttr('material:binding')!
    expect(attr.isRelationship).toBe(true)
    expect(attr.getTargets()).toEqual(['/Mat'])
  })

  it('multi-target rels round-trip', async () => {
    const stage = Stage.createNew()
    stage.definePrim('/M', 'Mesh').createRel('skel:targets', ['/A', '/B'])
    const reopened = await reopen(stage)
    expect(reopened.getPrim('/M')!.getAttr('skel:targets')!.getTargets()).toEqual(['/A', '/B'])
  })
})

describe('relative target authoring', () => {
  // UsdRelationship::_GetTargetForAuthoring / UsdAttribute::
  // _GetPathForAuthoring anchor relative paths at the owning prim; expected
  // values from OpenUSD v26.08.
  it('anchors relative targets and connections at the owning prim', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/World/Model')
    const rel = prim.createRel('rel')
    rel.setTargets(['Child', '../Sibling', '.'])
    expect(rel.getTargets()).toEqual(['/World/Model/Child', '/World/Sibling', '/World/Model'])
    const attr = prim.createAttr('a', 'float')
    attr.setConnections(['Child.out', '../Other.x'])
    expect(attr.getConnections()).toEqual(['/World/Model/Child.out', '/World/Other.x'])
  })
})

describe('attribute connections', () => {
  it('connect authors a connection readable via composed stage', () => {
    const stage = Stage.createNew()
    const shader = stage.definePrim('/Mat/Surf', 'Shader')
    shader.createAttr('inputs:diffuseColor', [0.5, 0.5, 0.5])
    shader.attr('inputs:diffuseColor').connect('/Mat/Tex.outputs:rgb')

    const attr = stage.getPrim('/Mat/Surf')!.getAttr('inputs:diffuseColor')!
    expect(attr.getConnections()).toEqual(['/Mat/Tex.outputs:rgb'])
    // The default value is preserved alongside the connection
    expect(attr.getValue()).toEqual([0.5, 0.5, 0.5])
  })

  it('connections round-trip through USDA export and re-parse', async () => {
    const stage = Stage.createNew()
    const mat = stage.definePrim('/Mat', 'Material')
    mat.createAttr('outputs:surface')
    mat.attr('outputs:surface').connect('/Mat/Surf.outputs:surface')

    const reopened = await reopen(stage)
    const attr = reopened.getPrim('/Mat')!.getAttr('outputs:surface')!
    expect(attr.getConnections()).toEqual(['/Mat/Surf.outputs:surface'])
  })

  it('parses rel and connect from hand-written USDA', async () => {
    const usda = `#usda 1.0

def Mesh "M"
{
    rel material:binding = </Looks/Red>
}

def Material "Looks"
{
    token outputs:surface.connect = </Looks/S.outputs:surface>
}
`
    const stage = (await Stage.open('inline.usda', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'inline.usda': new TextEncoder().encode(usda) })) }))!
    expect(stage.getPrim('/M')!.getAttr('material:binding')!.getTargets()).toEqual(['/Looks/Red'])
    expect(stage.getPrim('/Looks')!.getAttr('outputs:surface')!.getConnections()).toEqual(['/Looks/S.outputs:surface'])
  })
})
