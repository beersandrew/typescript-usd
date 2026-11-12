// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdModel.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from OpenUSD testenv/testUsdModel.py.
//
// Golden kind tokens / USDA encoding verified against the Pixar 26.05 build
// (Kind.Tokens + UsdModelAPI.SetKind ExportToString): kind authors as
// `kind = "component"` etc.
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, ModelAPI } from 'typescript-usd/usd'
import { ArResolver, ArResolvedPath, ArAsset, ArInMemoryAsset } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => { _setResolverForTest(new FixtureResolver()) })

// Read the composed `kind` token off a prim via the opinion-provenance surface
// (the winning spec's metadata). Mirrors UsdModelAPI.GetKind()'s storage read.
function kindOf(stage: Stage, primPath: string): string | undefined {
  const stack = stage.getPrimStack(primPath)
  for (const entry of stack) {
    const k = entry.metadata['kind']
    if (typeof k === 'string') return k
  }
  return undefined
}

// -------------------------------------------------------------------------
// kind metadata round-trips (UsdModelAPI.SetKind/GetKind storage)
// -------------------------------------------------------------------------
describe('model kind metadata', () => {
  it('a prim with no authored kind reports no kind token', async () => {
    files = {
      'root.usda': `#usda 1.0
def Xform "World"
{
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/World')).toBeDefined()
    expect(kindOf(stage, '/World')).toBeUndefined()
  })

  it('round-trips component / group / assembly / subcomponent', async () => {
    files = {
      'root.usda': `#usda 1.0
def Xform "C" (
    kind = "component"
)
{
}
def Xform "G" (
    kind = "group"
)
{
}
def Xform "A" (
    kind = "assembly"
)
{
}
def Xform "S" (
    kind = "subcomponent"
)
{
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(kindOf(stage, '/C')).toBe('component')
    expect(kindOf(stage, '/G')).toBe('group')
    expect(kindOf(stage, '/A')).toBe('assembly')
    expect(kindOf(stage, '/S')).toBe('subcomponent')
  })

  it('kind composes through a reference (strongest opinion wins)', async () => {
    files = {
      'asset.usda': `#usda 1.0
( defaultPrim = "Asset" )
def Xform "Asset" (
    kind = "component"
)
{
}
`,
      'root.usda': `#usda 1.0
def Xform "Ref" (
    references = @./asset.usda@
)
{
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    // The referenced component kind composes onto the referencing prim.
    expect(kindOf(stage, '/Ref')).toBe('component')
  })

  it('kind is preserved on each prim in a nested hierarchy', async () => {
    files = {
      'root.usda': `#usda 1.0
def Scope "X" (
    kind = "assembly"
)
{
    def Scope "Y" (
        kind = "component"
    )
    {
        def Scope "Z" (
            kind = "subcomponent"
        )
        {
        }
    }
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(kindOf(stage, '/X')).toBe('assembly')
    expect(kindOf(stage, '/X/Y')).toBe('component')
    expect(kindOf(stage, '/X/Y/Z')).toBe('subcomponent')
  })
})

// -------------------------------------------------------------------------
// Classification queries — depend on absent UsdModelAPI logic (it.fails).
// -------------------------------------------------------------------------
describe('model classification', () => {
  // test_ModelKind: component/assembly are models; assembly is also a group;
  // subcomponent is neither. Requires IsModel()/IsGroup() — not ported.
  it('IsModel()/IsGroup() classify component/group/assembly/subcomponent', async () => {
    files = {
      'root.usda': `#usda 1.0
def Xform "C" ( kind = "component" ) {}
def Xform "G" ( kind = "group" ) {}
def Xform "A" ( kind = "assembly" ) {}
def Xform "S" ( kind = "subcomponent" ) {}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const c = stage.getPrim('/C')!
    const a = stage.getPrim('/A')!
    const s = stage.getPrim('/S')!
    expect(c.isModel()).toBe(true)
    expect(a.isModel()).toBe(true)
    expect(a.isGroup()).toBe(true)
    expect(s.isModel()).toBe(false)
  })

  // test_ModelHierarchy: a prim is only a model if its parent is a model group;
  // KindValidation can bypass the hierarchy check. Requires the model-hierarchy
  // walk + KindValidation enum — not ported.
  it('model-hierarchy rule: a component under a non-group parent is not a model', async () => {
    files = {
      'root.usda': `#usda 1.0
def Xform "NotAGroup" ( kind = "subcomponent" )
{
    def Xform "Child" ( kind = "component" ) {}
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/NotAGroup/Child')!.isModel()).toBe(false)
  })

  it('IsKind() with/without KindValidationNone', async () => {
    files = {
      'root.usda': `#usda 1.0
def Xform "C" ( kind = "component" ) {}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const c = stage.getPrim('/C')!
    expect(c.isKind('component')).toBe(true)
    expect(c.isKind('group', 'KindValidationNone')).toBe(false)
  })

  // test_AssetInfo: UsdModelAPI asset-info accessors (Get/SetAssetName, version,
  // identifier, payloadAssetDependencies). No UsdModelAPI asset-info surface.
  it('UsdModelAPI assetInfo accessors (name/version/identifier/payloadDeps)', async () => {
    // assetInfo:name is a string (UsdModelAPI::SetAssetName); authored as
    // an asset value, the 26.11.1 build reads it as Sdf.AssetPath and
    // GetAssetName returns ''.
    files = {
      'root.usda': `#usda 1.0
def Xform "Asset" (
    kind = "component"
    assetInfo = {
        string name = "MyAsset"
        string version = "1.0"
        asset identifier = @./root.usda@
    }
)
{
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const model = ModelAPI.get(stage, '/Asset')
    expect(model.getAssetName()).toBe('MyAsset')
    expect(model.getAssetVersion()).toBe('1.0')
  })
})

describe('UsdModelAPI authoring', () => {
  it('authors kind and assetInfo through the schema API', () => {
    const stage = Stage.createNew()
    const model = new ModelAPI(stage.definePrim('/Asset', 'Xform'), stage)

    expect(model.getKind()).toBe('')
    expect(model.setKind('assembly')).toBe(true)
    expect(model.getKind()).toBe('assembly')
    expect(model.isModel()).toBe(true)
    expect(model.isGroup()).toBe(true)

    model.setAssetName('PaperCup')
    model.setAssetVersion('10a')
    model.setAssetIdentifier('PaperCup/usd/PaperCup.usd')
    model.setPayloadAssetDependencies(['Paper/usd/Paper.usd', 'Cup/usd/Cup.usd'])

    expect(model.getAssetInfo()).toEqual({
      name: 'PaperCup',
      version: '10a',
      identifier: 'PaperCup/usd/PaperCup.usd',
      payloadAssetDependencies: ['Paper/usd/Paper.usd', 'Cup/usd/Cup.usd'],
    })
  })
})
