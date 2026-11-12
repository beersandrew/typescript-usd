// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdInherits.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Implied inherits across intermediate layer stacks: a class override
// authored in a layer stack BETWEEN the inherit's authoring layer and the
// root composes too. Expectations pinned against Pixar 26.05
// `usdcat --flatten` on the identical layers.
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArResolver, ArResolvedPath, ArAsset, ArInMemoryAsset } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => { _setResolverForTest(new FixtureResolver()) })

describe('testUsdInherits — implied inherits', () => {
  it('class opinions compose from every stack the reference chain crosses, root strongest', async () => {
    files = {
      'prop.usda': `#usda 1.0
( defaultPrim = "Prop" )
class "_C"
{
    double a = 1
    double onlyProp = 10
    def "FromPropClass" {
    }
}
def Xform "Prop" (
    inherits = </_C>
)
{
}
`,
      'mid.usda': `#usda 1.0
( defaultPrim = "Mid" )
class "_C"
{
    double a = 2
    double onlyMid = 20
    def "FromMidClass" {
    }
}
def Xform "Mid"
{
    def "Item" (
        references = @./prop.usda@
    )
    {
    }
}
`,
      'root.usda': `#usda 1.0
class "_C"
{
    double a = 3
    double onlyRoot = 30
    def "FromRootClass" {
    }
}
def "M" (
    references = @./mid.usda@
)
{
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const item = stage.getPrim('/M/Item')!
    // Pixar: a = 3 (root class strongest), all three exclusive attrs present
    expect(item.getAttr('a')?.getValue()).toBe(3)
    expect(item.getAttr('onlyRoot')?.getValue()).toBe(30)
    expect(item.getAttr('onlyMid')?.getValue()).toBe(20)
    expect(item.getAttr('onlyProp')?.getValue()).toBe(10)
    // and children arrive from every class site
    const kids = stage.getAllChildPrimPaths('/M/Item').map(p => p.split('/').pop()!)
    expect(kids).toContain('FromRootClass')
    expect(kids).toContain('FromMidClass')
    expect(kids).toContain('FromPropClass')
  })
})
