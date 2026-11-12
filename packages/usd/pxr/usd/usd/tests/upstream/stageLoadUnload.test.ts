// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdStageLoadUnload.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from upstream testUsdStageLoadUnload.py (TestUsdLoadUnload).
//
// Upstream exercises explicit payload load-state control: Stage.Load /
// Unload / LoadAndUnload, GetLoadSet / FindLoadable, the InitialLoadSet
// (LoadAll / LoadNone) open option, and the UsdStageLoadRules object.
//
// typescript-usd has NO explicit load API today: payloads compose unconditionally
// (the LoadAll-equivalent default — see referencesAuthoring.test.ts, which
// proves payload composition). `StageOpenOptions.loadPayloads` is declared
// but not yet honored, and there is no Stage.load/unload/getLoadSet/
// findLoadable/StageLoadRules surface. So we port the OBSERVABLE default
// behavior green (payloads, including nested payloads, compose when present)
// and mark the load-state-control cases as it.fails with a note pointing at
// the missing API. Expectations cross-checked against Pixar 26.05 (LoadAll).
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> { const name = assetPath.split('/').pop() ?? assetPath; return new ArResolvedPath(files[name] === undefined ? '' : assetPath) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

// Mirrors PayloadedScene from the upstream test:
//
//   scene.usda          payload1.usda
//     /Sad  ---(P)---->   /Sad
//     |                   /Sad/Panda
//     /Foo
//     /Foo/Baz ---(P)--> /Baz (payload2.usda)
//                        /Baz/Garply ---(P)---> /Garply (payload3.usda)
//                                               /Garply/Qux
function setPayloadedScene() {
  files = {
    'payload1.usda': `#usda 1.0
def Scope "Sad"
{
    def Scope "Panda" {}
}
`,
    'payload3.usda': `#usda 1.0
def Scope "Garply"
{
    def Scope "Qux" {}
}
`,
    'payload2.usda': `#usda 1.0
def Scope "Baz"
{
    def Scope "Garply" (
        payload = @./payload3.usda@</Garply>
    ) {}
}
`,
    'scene.usda': `#usda 1.0
def Scope "Sad" (
    payload = @./payload1.usda@</Sad>
) {}
def "Foo"
{
    def Scope "Baz" (
        payload = @./payload2.usda@</Baz>
    ) {}
}
`,
  }
}

describe('payload composition (default LoadAll behavior)', () => {
  it('payloads compose by default — every payloaded prim is present', async () => {
    setPayloadedScene()
    const stage = (await Stage.open('scene.usda'))!
    // Pixar 26.05 LoadAll Traverse():
    // /Sad, /Sad/Panda, /Foo, /Foo/Baz, /Foo/Baz/Garply, /Foo/Baz/Garply/Qux
    expect(stage.getPrim('/Sad/Panda')?.typeName).toBe('Scope')
    expect(stage.getPrim('/Foo/Baz')?.typeName).toBe('Scope')
    expect(stage.getPrim('/Foo/Baz/Garply')?.typeName).toBe('Scope')
    expect(stage.getPrim('/Foo/Baz/Garply/Qux')?.typeName).toBe('Scope')
  })

  it('nested payloads chain — a payload that itself carries a payload composes', async () => {
    setPayloadedScene()
    const stage = (await Stage.open('scene.usda'))!
    // /Foo/Baz -> payload2 /Baz -> /Baz/Garply -> payload3 /Garply -> /Garply/Qux
    expect(stage.getPrim('/Foo/Baz/Garply/Qux')).toBeDefined()
  })

  it('the full composed prim set matches Pixar LoadAll', async () => {
    setPayloadedScene()
    const stage = (await Stage.open('scene.usda'))!
    const paths = [...stage.traverse()].filter(p => p !== '/').sort()
    expect(paths).toEqual([
      '/Foo',
      '/Foo/Baz',
      '/Foo/Baz/Garply',
      '/Foo/Baz/Garply/Qux',
      '/Sad',
      '/Sad/Panda',
    ])
  })

  it('an unpayloaded prim under a payloaded ancestor still composes its local children', async () => {
    setPayloadedScene()
    const stage = (await Stage.open('scene.usda'))!
    const kids = stage.getChildPrimPaths('/Foo').map(p => p.split('/').pop()!)
    expect(kids).toContain('Baz')
  })
})

describe('explicit payload load-state control (unimplemented)', () => {
  // typescript-usd has no Stage.load/unload/loadAndUnload — payloads always compose
  // (LoadAll). These need a load-state engine on the stage (the loadRules /
  // InitialLoadSet machinery) before they can be ported green.
  type LoadCapableStage = {
    load?: (path: string) => Promise<void> | void
    unload?: (path: string) => Promise<void> | void
    loadAndUnload?: (load: string[], unload: string[], policy?: unknown) => Promise<void> | void
  }

  it('test_Load: Stage.load("/Foo") pulls in only /Foo subtree payloads, leaving /Sad/Panda unloaded', async () => {
    // NOT IMPLEMENTED: no Stage.load — payloads always compose (LoadAll), so
    // /Sad/Panda is present even without ever loading /Foo.
    setPayloadedScene()
    const opened = (await Stage.open('scene.usda', { loadPayloads: false }))!
    const stage = opened as unknown as LoadCapableStage & Stage
    expect(stage.getPrim('/Sad/Panda')).toBeUndefined()
    await stage.load?.('/Foo')
  })

  it('test_Load: Stage.unload("/") removes all payloaded prims', async () => {
    // NOT IMPLEMENTED: no Stage.unload — there is no way to remove a
    // composed payloaded prim from the stage.
    setPayloadedScene()
    const stage = await Stage.open('scene.usda') as unknown as LoadCapableStage & Stage
    await stage.unload?.('/')
    expect(stage.getPrim('/Sad/Panda')).toBeUndefined()
  })

  it('test_LoadAndUnload: load/unload with LoadWithoutDescendants policy', async () => {
    // NOT IMPLEMENTED: no Stage.loadAndUnload / load policy enum.
    setPayloadedScene()
    const stage = await Stage.open('scene.usda') as unknown as LoadCapableStage & Stage
    expect(typeof stage.loadAndUnload).toBe('function')
  })

  it('test_Create / test_Open: load=LoadNone leaves all payloads uncomposed', async () => {
    // NOT IMPLEMENTED: StageOpenOptions.loadPayloads is declared but dead —
    // never read by Stage.open, so payloads compose regardless of its value.
    setPayloadedScene()
    const stage = (await Stage.open('scene.usda', { loadPayloads: false }))!
    expect(stage.getPrim('/Sad/Panda')).toBeUndefined()
  })

  it('test_RedundantLoads: redundant load/unload is a no-op, not an error', async () => {
    // NOT IMPLEMENTED: no Stage.load/unload to call redundantly.
    setPayloadedScene()
    const stage = await Stage.open('scene.usda') as unknown as LoadCapableStage & Stage
    expect(typeof stage.load).toBe('function')
    await stage.load?.('/Foo')
    await stage.load?.('/Foo')
  })

  it('test_Errors: loading a nonexistent prim raises; unloading one is allowed', async () => {
    // NOT IMPLEMENTED: no Stage.load to raise on a nonexistent path.
    setPayloadedScene()
    const stage = await Stage.open('scene.usda') as unknown as LoadCapableStage & Stage
    await expect(async () => { await stage.load?.('/NoSuchPrim') }).rejects.toThrow()
  })
})

describe('GetLoadSet / FindLoadable (unimplemented)', () => {
  // Pixar 26.05 (LoadAll): GetLoadSet() == FindLoadable() ==
  //   ['/Foo/Baz', '/Foo/Baz/Garply', '/Sad'].
  // No Stage.getLoadSet / findLoadable surface exists in typescript-usd yet.
  it('Stage.getLoadSet() reports the loaded payload prims', async () => {
    setPayloadedScene()
    const stage = await Stage.open('scene.usda') as unknown as
      Stage & { getLoadSet?: () => string[] }
    expect(stage.getLoadSet?.().sort()).toEqual(['/Foo/Baz', '/Foo/Baz/Garply', '/Sad'])
  })

  it('Stage.findLoadable() reports loadable payload prims (3 under LoadAll, 2 under LoadNone)', async () => {
    setPayloadedScene()
    const stage = await Stage.open('scene.usda') as unknown as
      Stage & { findLoadable?: () => string[] }
    expect(stage.findLoadable?.().sort()).toEqual(['/Foo/Baz', '/Foo/Baz/Garply', '/Sad'])
  })
})

describe('UsdStageLoadRules (unimplemented)', () => {
  // The StageLoadRules value type (AddRule/Minimize/GetEffectiveRuleForPath/
  // LoadAll/LoadNone, AllRule/OnlyRule/NoneRule) is not ported.
  it('StageLoadRules basics: AddRule / IsLoaded / Minimize / GetEffectiveRuleForPath', async () => {
    const mod = await import('typescript-usd/usd') as unknown as { StageLoadRules?: new () => unknown }
    expect(mod.StageLoadRules).toBeDefined()
  })

  it('Stage.getLoadRules / setLoadRules round-trip and drive composition', async () => {
    setPayloadedScene()
    const stage = await Stage.open('scene.usda') as unknown as
      Stage & { getLoadRules?: () => unknown; setLoadRules?: (r: unknown) => void }
    expect(typeof stage.getLoadRules).toBe('function')
    expect(typeof stage.setLoadRules).toBe('function')
  })
})
