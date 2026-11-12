// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdBug119633.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Port of pxr/usd/usd/testenv/testUsdBug119633.py
//
// Regression: opening a stage whose prims carry references to assets that
// cannot be opened (the upstream fixture references an external Sardine.usd
// that is absent, and its ref.usda is itself unparseable) must not crash —
// composition posts errors for the unresolved arcs but still instantiates the
// prims from their local opinions. The upstream test wraps the whole thing in
// try/except Tf.ErrorException and only asserts the top-level prim resolves.
//
// The upstream root.usda is ~680 KB of constraint timeSamples; reproduced here
// is its essential structure (a kind/customData-bearing Xform whose child
// references a missing asset). Expectations pinned against Pixar 26.05 python
// on both the original fixture and this distilled layer.
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
(
    endFrame = 156
    startFrame = 101
)

def Xform "SardineGroup_OceanA" (
    customData = {
        bool zUp = 1
    }
    kind = "chargroup"
)
{
    uniform bool important = 0

    def "Sardine_OceanA" (
        add references = @ref.usda@</SardineGroup_OceanA__Sardine_OceanA>
    )
    {
    }
}
`

describe('bug 119633: unresolved references do not abort stage composition', () => {
  it('opens the stage despite the missing reference asset', async () => {
    // ref.usda is intentionally absent from the virtual fs, mirroring the
    // upstream fixture whose external asset could not be opened. Pixar posts a
    // warning but Stage.Open() still succeeds.
    files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda'))!
    expect(stage).toBeDefined()
  })

  it('the top-level prim resolves from its local opinions', async () => {
    files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda'))!
    // Pixar: GetPrimAtPath('/SardineGroup_OceanA') is valid even though the
    // reference under it failed to resolve.
    const prim = stage.getPrim('/SardineGroup_OceanA')
    expect(prim).toBeDefined()
    expect(prim!.typeName).toBe('Xform')
    // local opinion survives the unresolved descendant arc (Pixar: False)
    expect(prim!.getAttr('important')?.getValue()).toBe(false)
  })

  it('the child carrying the unresolved reference still appears as a prim', async () => {
    files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda'))!
    // Pixar lists ['Sardine_OceanA'] as a child of the group; the missing arc
    // contributes nothing but does not delete the locally-defined child.
    expect(stage.getChildPrimPaths('/SardineGroup_OceanA'))
      .toEqual(['/SardineGroup_OceanA/Sardine_OceanA'])
  })

  // The upstream prim also carries kind="chargroup" and customData {zUp:true}.
  // typescript-usd's composed Prim handle (returned by Stage.getPrim) has no
  // prim-level metadata read API at all (Prim.GetMetadata('kind' /
  // 'customData')) — only the separate Prim class (from definePrim) has a
  // getMetadata, and it's an unimplemented scoreboard stub (throws). Either way the call is unreachable; the
  // prim's resolution and authored attribute above cover the regression's
  // intent (composition survives the unresolved arc).
  it('prim exposes kind and customData metadata (needs Prim.GetMetadata)', async () => {
    files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda'))!
    const prim = stage.getPrim('/SardineGroup_OceanA')!
    expect((prim as unknown as { getMetadata: (f: string) => unknown }).getMetadata('kind')).toBe('chargroup')
    expect((prim as unknown as { getMetadata: (f: string) => unknown }).getMetadata('customData'))
      .toEqual({ zUp: true })
  })
})
