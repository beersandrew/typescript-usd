// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdPrimGetDescendants.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from OpenUSD pxr/usd/usd/testenv/testUsdPrimGetDescendants.cpp (v26.05).
//
// The C++ suite exercises UsdPrim::GetChildren / GetAllChildren /
// GetDescendants / GetAllDescendants / GetFilteredDescendants(predicate),
// plus instance-proxy traversal (UsdTraverseInstanceProxies).
// All path-list goldens below were captured from the live Pixar 26.05 build
// (an OpenUSD v26.05 build) over the same scenes (GetAllChildren + a pre-order
// GetAllChildren recursion for the descendant lists; GetFilteredChildren with
// Usd.TraverseInstanceProxies(Usd.PrimAllPrimsPredicate) for the proxy lists).
import { describe, expect, it } from 'vitest'
import {
  PrimDefaultPredicate, PrimIsAbstract, PrimIsDefined, PrimIsModel, Stage,
} from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

function vfs(files: Record<string, string>) {
  _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)]))))
}

// Pre-order recursive descendant walk — the all-prims analog of
// UsdPrim::GetAllDescendants (no predicate).
function descendants(stage: Stage, root: string, instanceProxies = false): string[] {
  const out: string[] = []
  const walk = (p: string) => {
    for (const c of stage.getChildPrimPaths(p, { instanceProxies })) {
      out.push(c)
      walk(c)
    }
  }
  walk(root)
  return out
}

// Scene mirroring testUsdPrimGetDescendants.cpp's test.usda hierarchy for the
// all-prims descendant ordering matrix.
function makeDescendantsStage(): Stage {
  const stage = Stage.createNew()
  for (const p of [
    '/GlobalClass',
    '/GlobalClass/AbstractSubscope',
    '/GlobalClass/AbstractOver',
    '/PureOver',
    '/PureOver/UndefinedSubscope',
    '/Group',
    '/Group/ModelChild',
    '/Group/LocalChild',
    '/Group/UndefinedModelChild',
    '/Group/DeactivatedScope',
    '/Group/DeactivatedModel',
    '/Group/DeactivatedOver',
    '/PropertyOrder',
  ]) {
    stage.definePrim(p, 'Scope')
  }
  return stage
}

// -------------------------------------------------------------------------
// GetChildren / GetAllChildren — direct children only (getChildPrimPaths).
// -------------------------------------------------------------------------
describe('getChildPrimPaths — direct children (GetAllChildren)', () => {
  it('root children, in authored order', () => {
    const stage = makeDescendantsStage()
    // Pixar 26.05: root.GetAllChildren()
    expect(stage.getChildPrimPaths('/')).toEqual([
      '/GlobalClass', '/PureOver', '/Group', '/PropertyOrder',
    ])
  })

  it('/Group children, in authored order', () => {
    const stage = makeDescendantsStage()
    // Pixar 26.05: group.GetAllChildren()
    expect(stage.getChildPrimPaths('/Group')).toEqual([
      '/Group/ModelChild',
      '/Group/LocalChild',
      '/Group/UndefinedModelChild',
      '/Group/DeactivatedScope',
      '/Group/DeactivatedModel',
      '/Group/DeactivatedOver',
    ])
  })

  it('does not include grandchildren among direct children', () => {
    const stage = makeDescendantsStage()
    const children = stage.getChildPrimPaths('/')
    expect(children).not.toContain('/GlobalClass/AbstractSubscope')
    expect(children).not.toContain('/Group/ModelChild')
  })

  it('a leaf prim has no children', () => {
    const stage = makeDescendantsStage()
    expect(stage.getChildPrimPaths('/PropertyOrder')).toEqual([])
    expect(stage.getChildPrimPaths('/Group/LocalChild')).toEqual([])
  })
})

// -------------------------------------------------------------------------
// GetDescendants / GetAllDescendants — pre-order subtree (recursive walk).
// -------------------------------------------------------------------------
describe('descendants — pre-order subtree (GetAllDescendants)', () => {
  it('root descendants, full pre-order list', () => {
    const stage = makeDescendantsStage()
    // Pixar 26.05: root.GetAllDescendants() (all-prims), this all-`def` scene.
    expect(descendants(stage, '/')).toEqual([
      '/GlobalClass',
      '/GlobalClass/AbstractSubscope',
      '/GlobalClass/AbstractOver',
      '/PureOver',
      '/PureOver/UndefinedSubscope',
      '/Group',
      '/Group/ModelChild',
      '/Group/LocalChild',
      '/Group/UndefinedModelChild',
      '/Group/DeactivatedScope',
      '/Group/DeactivatedModel',
      '/Group/DeactivatedOver',
      '/PropertyOrder',
    ])
  })

  it('/Group descendants (no grandchildren in this scene == its children)', () => {
    const stage = makeDescendantsStage()
    expect(descendants(stage, '/Group')).toEqual([
      '/Group/ModelChild',
      '/Group/LocalChild',
      '/Group/UndefinedModelChild',
      '/Group/DeactivatedScope',
      '/Group/DeactivatedModel',
      '/Group/DeactivatedOver',
    ])
  })

  it('/GlobalClass descendants', () => {
    const stage = makeDescendantsStage()
    expect(descendants(stage, '/GlobalClass')).toEqual([
      '/GlobalClass/AbstractSubscope',
      '/GlobalClass/AbstractOver',
    ])
  })

  it('a leaf prim has no descendants', () => {
    const stage = makeDescendantsStage()
    expect(descendants(stage, '/PropertyOrder')).toEqual([])
  })

  it('root descendants equal traverse() minus the pseudo-root', () => {
    const stage = makeDescendantsStage()
    const fromTraverse = [...stage.traverse()].filter(p => p !== '/')
    // Same set of prims; descendants() is pre-order, traverse() is pre-order too.
    expect(descendants(stage, '/').slice().sort()).toEqual(fromTraverse.slice().sort())
  })
})

// -------------------------------------------------------------------------
// Instance proxies (TestGetDescendantsAsInstanceProxies).
// Nested instancing: World/sets/{Set_1,Set_2} each instance a Set whose
// {Prop_1,Prop_2} themselves instance a Prop with {geom,anim}. With
// instanceProxies:true the recursive walk descends through the instances,
// matching upstream GetFilteredDescendants(UsdTraverseInstanceProxies()).
// -------------------------------------------------------------------------
describe('descendants — instance proxies (UsdTraverseInstanceProxies)', () => {
  function makeNestedInstanceStage(): Promise<Stage> {
    vfs({
      'prop.usda': `#usda 1.0
def "Prop" {
    def "geom" {}
    def "anim" {}
}
`,
      'set.usda': `#usda 1.0
def "Set" {
    def "Prop_1" (
        instanceable = true
        references = @./prop.usda@</Prop>
    ) {}
    def "Prop_2" (
        instanceable = true
        references = @./prop.usda@</Prop>
    ) {}
}
`,
      'root.usda': `#usda 1.0
def "World" {
    def "sets" {
        def "Set_1" (
            instanceable = true
            references = @./set.usda@</Set>
        ) {}
        def "Set_2" (
            instanceable = true
            references = @./set.usda@</Set>
        ) {}
    }
}
`,
    })
    return Stage.open('root.usda').then(value => value!)
  }

  it('all proxy descendants from the pseudo-root', async () => {
    const stage = await makeNestedInstanceStage()
    // Pixar 26.05: Prim("/").GetFilteredDescendants(UsdTraverseInstanceProxies())
    expect(descendants(stage, '/', true)).toEqual([
      '/World',
      '/World/sets',
      '/World/sets/Set_1',
      '/World/sets/Set_1/Prop_1',
      '/World/sets/Set_1/Prop_1/geom',
      '/World/sets/Set_1/Prop_1/anim',
      '/World/sets/Set_1/Prop_2',
      '/World/sets/Set_1/Prop_2/geom',
      '/World/sets/Set_1/Prop_2/anim',
      '/World/sets/Set_2',
      '/World/sets/Set_2/Prop_1',
      '/World/sets/Set_2/Prop_1/geom',
      '/World/sets/Set_2/Prop_1/anim',
      '/World/sets/Set_2/Prop_2',
      '/World/sets/Set_2/Prop_2/geom',
      '/World/sets/Set_2/Prop_2/anim',
    ])
  })

  it('proxy descendants under an instanced Set', async () => {
    const stage = await makeNestedInstanceStage()
    expect(descendants(stage, '/World/sets/Set_1', true)).toEqual([
      '/World/sets/Set_1/Prop_1',
      '/World/sets/Set_1/Prop_1/geom',
      '/World/sets/Set_1/Prop_1/anim',
      '/World/sets/Set_1/Prop_2',
      '/World/sets/Set_1/Prop_2/geom',
      '/World/sets/Set_1/Prop_2/anim',
    ])
  })

  it('proxy children of a nested instance proxy', async () => {
    const stage = await makeNestedInstanceStage()
    expect(stage.getChildPrimPaths('/World/sets/Set_1/Prop_1', { instanceProxies: true }))
      .toEqual([
        '/World/sets/Set_1/Prop_1/geom',
        '/World/sets/Set_1/Prop_1/anim',
      ])
  })

  it('without instanceProxies, an instance contributes no children', async () => {
    const stage = await makeNestedInstanceStage()
    // The instance roots themselves expose no composed children by default.
    expect(stage.getChildPrimPaths('/World/sets/Set_1')).toEqual([])
  })
})

// -------------------------------------------------------------------------
// Predicate-filtered variants and specifier-distinction behaviors.
// -------------------------------------------------------------------------
describe('GetFilteredDescendants(predicate)', () => {
  // root.GetFilteredDescendants(IsActive && IsLoaded && IsDefined && !IsAbstract)
  // == [/PropertyOrder] in the mixed-specifier upstream scene.
  it('default predicate (active & loaded & defined & non-abstract)', async () => {
    vfs({ 'mixed.usda': "#usda 1.0\ndef \"Defined\" {}\nover \"Over\" { def \"Child\" {} \n}\nclass \"Class\" {}\n" })
    const stage = (await Stage.open('mixed.usda'))!
    expect(stage.getPrim('/')!.getFilteredDescendants(PrimDefaultPredicate)
      .map(p => p.path)).toEqual(['/Defined'])
  })

  // root.GetFilteredDescendants(UsdPrimIsAbstract) selects class prims (e.g.
  // /GlobalClass in the mixed-specifier scene).
  it('UsdPrimIsAbstract / !UsdPrimIsAbstract', async () => {
    vfs({ 'mixed.usda': '#usda 1.0\ndef "Defined" {}\nclass "Class" {}\n' })
    const stage = (await Stage.open('mixed.usda'))!
    expect(stage.getPrim('/')!.getFilteredDescendants(PrimIsAbstract)
      .map(p => p.path)).toEqual(['/Class'])
  })

  // root.GetFilteredDescendants(UsdPrimIsDefined) skips /PureOver (and its
  // undefined descendant). typescript-usd has no def/over distinction, so
  // getChildPrimPaths always includes them.
  it('UsdPrimIsDefined / !UsdPrimIsDefined', async () => {
    vfs({ 'mixed.usda': "#usda 1.0\ndef \"Defined\" {}\nover \"Over\" { def \"Child\" {} \n}\n" })
    const stage = (await Stage.open('mixed.usda'))!
    expect(stage.getPrim('/')!.getFilteredDescendants(PrimIsDefined)
      .map(p => p.path)).toEqual(['/Defined'])
    expect(stage.getPrim('/Over')!.getFilteredDescendants(PrimIsDefined.not()))
      .toHaveLength(1)
  })

  // root.GetFilteredDescendants(UsdPrimIsModel / UsdPrimIsGroup) — needs
  // ModelAPI kind. typescript-usd has no ModelAPI / kind surface at all.
  it('UsdPrimIsModel / UsdPrimIsGroup', () => {
    const stage = Stage.createNew()
    const group = stage.definePrim('/Group', 'Xform')
    group.setKind('group')
    const model = stage.definePrim('/Group/Model', 'Xform')
    model.setKind('model')
    stage.definePrim('/Group/Other', 'Scope')
    expect(stage.getPrim('/Group')!.getFilteredDescendants(PrimIsModel)
      .map(p => p.path)).toEqual(['/Group/Model'])
  })

  // root.GetFilteredDescendants(!UsdPrimIsLoaded) — needs payload load state.
  // typescript-usd has no payload load/unload API at all.
  it('UsdPrimIsLoaded / !UsdPrimIsLoaded — needs predicate + payload load/unload', async () => {
    vfs({
      'payload.usda': `#usda 1.0
def Scope "Payload" {}
`,
      'scene.usda': `#usda 1.0
def "Foo" (
    prepend payload = @./payload.usda@</Payload>
)
{
}
`,
    })
    const stage = (await Stage.open('scene.usda'))!
    expect(typeof (stage as unknown as { unload?: unknown }).unload).toBe('function')
  })

  // testUsdPrimGetDescendants.cpp:284-307: once traversal starts on an
  // instance proxy, the default predicate continues through proxy descendants
  // without requiring UsdTraverseInstanceProxies.
  it('GetDescendants() continues through an already-proxy prim by default', async () => {
    vfs({
      'prop.usda': `#usda 1.0
def "Prop" {
    def "geom" {}
    def "anim" {}
}
`,
      'set.usda': `#usda 1.0
def "Set" {
    def "Prop_1" (
        instanceable = true
        references = @./prop.usda@</Prop>
    ) {}
}
`,
      'root.usda': `#usda 1.0
def "World" {
    def "sets" {
        def "Set_1" (
            instanceable = true
            references = @./set.usda@</Set>
        ) {}
    }
}
`,
    })
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getChildPrimPaths('/World/sets/Set_1/Prop_1')).toEqual([
      '/World/sets/Set_1/Prop_1/geom',
      '/World/sets/Set_1/Prop_1/anim',
    ])
  })
})
