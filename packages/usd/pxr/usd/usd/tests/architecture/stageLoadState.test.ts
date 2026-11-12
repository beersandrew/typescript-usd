import { _setResolverForTest } from 'typescript-usd/usd/_internal'
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, StageLoadRules } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}

class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> {
    const name = assetPath.split('/').pop() ?? assetPath
    return new ArResolvedPath(files[name] === undefined ? '' : assetPath)
  }

  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    const name = path.toString().split('/').pop() ?? path.toString()
    const text = files[name]
    return text === undefined
      ? undefined
      : new ArInMemoryAsset(new TextEncoder().encode(text))
  }
}

beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
  files = {
    'scene.usda': `#usda 1.0
def Scope "A" (payload = @./one.usda@</A>) {}
`,
    'one.usda': `#usda 1.0
def Scope "A"
{
    def Scope "Child" (payload = @./two.usda@</Child>) {}
}
`,
    'two.usda': `#usda 1.0
def Scope "Child" { def Scope "Deep" {}
}
`,
  }
})

describe('Stage retained payload load state', () => {
  it('reports Pcp-discovered and included payload paths', async () => {
    const stage = (await Stage.open('scene.usda', { loadPayloads: false }))!
    expect(stage.getLoadSet()).toEqual([])
    expect(stage.findLoadable()).toEqual(['/A'])

    await stage.load('/A', 'withoutDescendants')
    expect(stage.getLoadSet()).toEqual(['/A'])
    expect(stage.findLoadable()).toEqual(['/A', '/A/Child'])
    expect(stage.getPrim('/A/Child')).toBeDefined()
    expect(stage.getPrim('/A/Child/Deep')).toBeUndefined()

    await stage.loadAndUnload(['/A/Child'], [], 'withDescendants')
    expect(stage.getLoadSet()).toEqual(['/A', '/A/Child'])
    expect(stage.getPrim('/A/Child/Deep')).toBeDefined()
  })

  it('round-trips copied rules and recomposes from setLoadRules', async () => {
    const stage = (await Stage.open('scene.usda'))!
    const none = StageLoadRules.loadNone()
    await stage.setLoadRules(none)
    expect(stage.getPrim('/A/Child')).toBeUndefined()
    expect(stage.getLoadRules().equals(none)).toBe(true)

    const returned = stage.getLoadRules()
    returned.loadWithDescendants('/A')
    expect(stage.getLoadRules().equals(none)).toBe(true)
  })
})
