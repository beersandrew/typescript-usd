// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdBug141491.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Port of pxr/usd/usd/testenv/testUsdBug141491.py
//
// Regression: deactivating an ancestor of an instance prim (which removes
// the instance from the stage) and then making a scene-description edit that
// would have affected that instance must not crash. The scene is the upstream
// testenv root.usda verbatim. Expectations pinned against Pixar 26.05 python
// on the identical layer.
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

const ROOT = `#usda 1.0

def "Class"
{
}

def "Set"
{
}

def "World"
{
    def "sets"
    {
        def "Set_1" (
            instanceable = True
            references = </Set>
        )
        {
        }
    }
}
`

describe('bug 141491: deactivating an instance ancestor then editing', () => {
  it('the referencing prim composes as an instance', async () => {
    files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda'))!
    const instancePrim = stage.getPrim('/World/sets/Set_1')
    expect(instancePrim).toBeDefined()
    // Pixar: /World/sets/Set_1 IsInstance() -> True
    expect(instancePrim!.isInstance()).toBe(true)
  })

  it('deactivating the ancestor removes the instance from the stage; later edits do not crash', async () => {
    files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/World/sets/Set_1')!.isInstance()).toBe(true)

    // Deactivate the ancestor group containing the instance. Pixar: this
    // removes /World/sets/Set_1 from the stage (the prim becomes invalid).
    const ancestor = stage.definePrim('/World/sets')
    expect(stage.getPrim('/World/sets')!.isActive).toBe(true)
    await ancestor.setActive(false)
    await stage.flushChanges()

    expect(stage.getPrim('/World/sets')!.isActive).toBe(false)
    // The instance below the now-deactivated ancestor is gone.
    expect(stage.getPrim('/World/sets/Set_1')).toBeUndefined()
    // The deactivated ancestor exposes no children either.
    expect(stage.getChildPrimPaths('/World/sets')).toEqual([])
  })

  // The upstream test then authors `stage.GetPrim('/Set').GetInherits()
  // .AddInherit('/Class')`, which (prior to the fix) registered a prototype
  // that was never instantiated because the instance's parent was
  // deactivated, crashing at stage teardown.
  it('adding an inherit to /Set after deactivation does not crash', async () => {
    files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda'))!
    await stage.definePrim('/World/sets').setActive(false)
    await stage.flushChanges()
    const setPrim = stage.getPrim('/Set')!
    expect(setPrim.getInherits().addInherit('/Class')).toBe(true)
    expect(stage.getPrim('/World/sets/Set_1')).toBeUndefined()
  })
})
