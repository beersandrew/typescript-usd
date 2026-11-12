// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdSpecializes.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from OpenUSD testenv/testUsdSpecializes.py (specializes arc).
//
// AUTHORING-API GAP: typescript-usd Prim is thin — there is no GetSpecializes()/
// AddSpecialize()/SetSpecializes() authoring surface (the upstream suite is
// almost entirely list-op authoring + path-mapping-on-author assertions, which
// have no observable analog here). We instead author specializes arcs in USDA
// TEXT and assert the COMPOSED result, which exercises the same engine
// capability the upstream suite ultimately protects: that specializes is the
// WEAKEST composition arc, that the specialized prim inherits the base prim's
// opinions and children (test_SpecializedPrim), and that specializes target
// paths are namespace-mapped across an (internal) reference
// (test_SpecializesPathMapping{,Variants}).
//
// Golden composed values captured from the Pixar build usd-2605
// (an OpenUSD v26.05 build, Usd.Stage.Open on the identical layers).
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArResolver, ArResolvedPath, ArAsset, ArInMemoryAsset } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => { _setResolverForTest(new FixtureResolver()) })

describe('specializes', () => {
  it('specialized prim pulls the base prim opinions and children (test_SpecializedPrim)', async () => {
    // def "Derived" ( specializes = </Base> ) with no local opinions composes
    // the Base prim's attrs + namespace children.
    files = {
      'base.usda': `#usda 1.0
def "Base"
{
    double x = 1
    double onlyBase = 100
    def "BaseChild" {}
}
def "Derived" (
    specializes = </Base>
)
{
}
`,
    }
    const stage = (await Stage.open('base.usda'))!
    const derived = stage.getPrim('/Derived')!
    // Pixar usd-2605: x=1, onlyBase=100, children=['BaseChild']
    expect(derived.getAttr('x')?.getValue()).toBe(1)
    expect(derived.getAttr('onlyBase')?.getValue()).toBe(100)
    const kids = stage.getChildPrimPaths('/Derived').map(p => p.split('/').pop()!)
    expect(kids).toContain('BaseChild')
  })

  it('a local opinion on the specializing prim wins over the specialized base', async () => {
    files = {
      'base.usda': `#usda 1.0
def "Base"
{
    double x = 1
    double onlyBase = 100
}
def "DerivedLocal" (
    specializes = </Base>
)
{
    double x = 5
}
`,
    }
    const stage = (await Stage.open('base.usda'))!
    const d = stage.getPrim('/DerivedLocal')!
    // Pixar usd-2605: local x=5 wins, onlyBase=100 still pulled from base
    expect(d.getAttr('x')?.getValue()).toBe(5)
    expect(d.getAttr('onlyBase')?.getValue()).toBe(100)
  })

  it('specializes is the WEAKEST arc: the specialized prim opinion wins even when a stronger layer overrides the base across a reference', async () => {
    // The hallmark of specializes (vs inherits): an opinion authored DIRECTLY on
    // the more-specialized prim (in the weak referenced layer) stays stronger
    // than an opinion broadcast onto the base prim from the stronger root layer.
    files = {
      'model_spec.usda': `#usda 1.0
( defaultPrim = "Asset" )
def "Asset"
{
    def "Fancy"
    {
        double roughness = 0.5
    }
    def "PreciousMetal" (
        specializes = </Asset/Fancy>
    )
    {
        double roughness = 0.1
    }
}
`,
      'root_spec.usda': `#usda 1.0
def "M" (
    references = @./model_spec.usda@
)
{
    over "Fancy"
    {
        double roughness = 0.9
    }
}
`,
    }
    const stage = (await Stage.open('root_spec.usda'))!
    // Pixar usd-2605: PreciousMetal.roughness=0.1 (its own local opinion wins
    // over the root's 0.9 broadcast onto the base), Fancy.roughness=0.9.
    expect(stage.getPrim('/M/PreciousMetal')!.getAttr('roughness')?.getValue()).toBe(0.1)
    expect(stage.getPrim('/M/Fancy')!.getAttr('roughness')?.getValue()).toBe(0.9)
  })

  it('contrast: with INHERITS the stronger base override broadcasts and wins (proving the specializes ordering above is real)', async () => {
    files = {
      'model_inh.usda': `#usda 1.0
( defaultPrim = "Asset" )
def "Asset"
{
    class "Fancy"
    {
        double roughness = 0.5
    }
    def "PreciousMetal" (
        inherits = </Asset/Fancy>
    )
    {
        double roughness = 0.1
    }
}
`,
      'root_inh.usda': `#usda 1.0
def "M" (
    references = @./model_inh.usda@
)
{
    over "Fancy"
    {
        double roughness = 0.9
    }
}
`,
    }
    const stage = (await Stage.open('root_inh.usda'))!
    // Pixar usd-2605: PreciousMetal.roughness=0.9 (root's class override
    // broadcasts strongly via inherits), Fancy.roughness=0.9.
    expect(stage.getPrim('/M/PreciousMetal')!.getAttr('roughness')?.getValue()).toBe(0.9)
    expect(stage.getPrim('/M/Fancy')!.getAttr('roughness')?.getValue()).toBe(0.9)
  })
})
