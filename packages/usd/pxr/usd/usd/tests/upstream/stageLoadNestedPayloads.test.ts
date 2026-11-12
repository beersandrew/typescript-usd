// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/testenv/testUsdStageLoadUnload.py, pxr/usd/usd/prim.h
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Port of pxr/usd/usd/testenv/testUsdStageLoadUnload.py — the nested-payload
// deep-load lane: loading a descendant beneath UNLOADED payload ancestors.
// Extends stageLoadUnload.test.ts (loads from at/above the payload prim);
// does not repeat its coverage.
//
// Upstream UsdStage::LoadAndUnload walks every load path up through its
// unloaded ancestors to the most-ancestral unloaded prim and recomposes
// THERE (pxr/usd/usd/stage.cpp:2586-2612): loading /Foo/Baz/Garply from
// LoadNone implicitly loads /Foo/Baz, and after instance-path mapping and
// descendant pruning (stage.cpp:2618-2628) the ObjectsChanged resync is
// reported at /Foo/Baz — not at the requested path. typescript-usd derives its
// recompose roots from the load/unload arguments alone (stage.ts
// loadAndUnload, roots loop) with no ancestor walk. The COMPOSED content
// still comes out right — PcpCache.computePrimIndex consults the load-rules
// payload predicate live while composing the requested subtree's ancestors,
// so _recomposeSubtrees grafts a consistent namespace (verified: traverse,
// child lists, and the load set all match native) — but the ObjectsChanged
// resync is emitted at the requested descendant instead of the
// most-ancestral implicitly loaded prim, so the notice assertions are the
// reds that isolate the missing ancestor walk.
//
// Ported 1:1 where the testenv asserts the case:
//   - deep load from all-unloaded:   testUsdStageLoadUnload.py:566-576
//   - per-load resync notices:       test_LoadResyncNotice, :966-978
// Assertions beyond the testenv are marked "Live 26.05 capture:" (captured
// on the reference build against an in-memory PayloadedScene).
//
// Deviations from the python testenv:
//   - fixtures are USDA served by an in-memory ArResolver rather than
//     Stage.CreateInMemory + DefinePrim/AddPayload;
//   - stages start unloaded via the LoadNone open option (loadPayloads:false)
//     instead of LoadAll-then-Unload(); the resulting load rules are
//     identical ([</> NoneRule], verified on the live build);
//   - prim.Load()/Unload() are expressed as stage.load()/unload() of the
//     prim's path — UsdPrim::Load is a direct stage forward
//     (pxr/usd/usd/prim.h:1953).
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> { const name = assetPath.split('/').pop() ?? assetPath; return new ArResolvedPath(files[name] === undefined ? '' : assetPath) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

// PayloadedScene (testUsdStageLoadUnload.py:15-61):
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

function trackResyncs(stage: Stage): { notices: string[][] } {
  const record: { notices: string[][] } = { notices: [] }
  onObjectsChanged(stage, notice => {
    record.notices.push([...notice.resyncedPaths].sort())
  })
  return record
}

describe('testUsdStageLoadUnload (deep load beneath unloaded payload ancestors)', () => {
  it('deep LoadAndUnload from all-unloaded composes the unloaded ancestor chain (testUsdStageLoadUnload.py:566-576)', async () => {
    setPayloadedScene()
    const stage = (await Stage.open('scene.usda', { loadPayloads: false }))!

    // Everything is unloaded (testenv :430-440 precondition). Live 26.05
    // capture: the payload prims EXIST unloaded; their payload content does
    // not compose. (Native Traverse() additionally hides unloaded prims via
    // UsdPrimDefaultPredicate's IsLoaded term — a separate traversal-
    // predicate divergence, deliberately not asserted here.)
    expect(stage.getPrim('/Sad')).toBeDefined()
    expect(stage.getPrim('/Sad/Panda')).toBeUndefined()
    expect(stage.getPrim('/Foo/Baz')).toBeDefined()
    expect(stage.getPrim('/Foo/Baz/Garply')).toBeUndefined()
    expect(stage.getLoadSet()).toEqual([])
    expect(stage.findLoadable().sort()).toEqual(['/Foo/Baz', '/Sad'])

    // Load only /Foo/Baz/Garply, which will load /Foo/Baz, but not
    // /Sad/Panda. (testenv :566-576)
    await stage.loadAndUnload(['/Foo/Baz/Garply'], [])
    expect(stage.getPrim('/Sad/Panda')).toBeUndefined()
    expect(stage.getPrim('/Foo/Baz')).toBeDefined()
    expect(stage.getPrim('/Foo/Baz/Garply')).toBeDefined()
    // testenv asserts len(GetLoadSet()) == 2; the membership is the live
    // 26.05 capture — the implicitly loaded ancestor payload is IN the set.
    expect(stage.getLoadSet().sort()).toEqual(['/Foo/Baz', '/Foo/Baz/Garply'])

    // Live 26.05 capture: the AllRule at /Foo/Baz/Garply also pulls in
    // Garply's OWN nested payload, and the newly composed Garply becomes
    // loadable.
    expect(stage.getPrim('/Foo/Baz/Garply/Qux')).toBeDefined()
    expect(stage.findLoadable().sort()).toEqual(['/Foo/Baz', '/Foo/Baz/Garply', '/Sad'])
  })

  it('deep stage.load resyncs at the most-ancestral implicitly loaded prim (Live 26.05 capture; stage.cpp:2586-2628)', async () => {
    setPayloadedScene()
    const stage = (await Stage.open('scene.usda', { loadPayloads: false }))!
    const record = trackResyncs(stage)

    await stage.load('/Foo/Baz/Garply')
    // Composed content first, so a notice-only divergence is unambiguous.
    expect(stage.getPrim('/Foo/Baz/Garply')).toBeDefined()
    expect(stage.getPrim('/Foo/Baz/Garply/Qux')).toBeDefined()
    // Live 26.05 capture: exactly ONE ObjectsChanged notice, resynced at
    // /Foo/Baz — the ancestor walk inserts the most-ancestral unloaded prim
    // into the load set (stage.cpp:2597-2612) and RemoveDescendentPaths
    // drops the requested descendant (stage.cpp:2628), so the notice never
    // mentions /Foo/Baz/Garply.
    expect(record.notices).toEqual([['/Foo/Baz']])
  })

  it('test_LoadResyncNotice: each load resyncs exactly the newly loaded payload prim; a redundant deep load is silent (testUsdStageLoadUnload.py:966-978)', async () => {
    setPayloadedScene()
    const stage = (await Stage.open('scene.usda', { loadPayloads: false }))!
    const record = trackResyncs(stage)

    await stage.load('/Sad')
    expect(record.notices).toEqual([['/Sad']])

    record.notices.length = 0
    await stage.load('/Foo/Baz')
    expect(record.notices).toEqual([['/Foo/Baz']])

    // Should have been loaded already in previous step: no notice at all.
    record.notices.length = 0
    await stage.load('/Foo/Baz/Garply')
    expect(record.notices).toEqual([])

    // Live 26.05 capture of the final state.
    expect(stage.getLoadSet().sort()).toEqual(['/Foo/Baz', '/Foo/Baz/Garply', '/Sad'])
    expect(stage.getPrim('/Sad/Panda')).toBeDefined()
    expect(stage.getPrim('/Foo/Baz/Garply/Qux')).toBeDefined()
  })

  it('unloading only the deep payload prim resyncs just that prim and strips only its subtree (Live 26.05 capture — control direction)', async () => {
    setPayloadedScene()
    const stage = (await Stage.open('scene.usda'))!
    expect(stage.getPrim('/Foo/Baz/Garply/Qux')).toBeDefined()
    const record = trackResyncs(stage)

    await stage.unload('/Foo/Baz/Garply')
    // Unload needs no ancestor walk — the recompose root IS the argument.
    expect(record.notices).toEqual([['/Foo/Baz/Garply']])
    // Garply itself remains composed (it lives in /Foo/Baz's still-loaded
    // payload); only Garply's own payload content is gone.
    expect(stage.getPrim('/Foo/Baz/Garply')).toBeDefined()
    expect(stage.getPrim('/Foo/Baz/Garply/Qux')).toBeUndefined()
    expect(stage.getPrim('/Sad/Panda')).toBeDefined()
    expect(stage.getLoadSet().sort()).toEqual(['/Foo/Baz', '/Sad'])
    expect(stage.findLoadable().sort()).toEqual(['/Foo/Baz', '/Foo/Baz/Garply', '/Sad'])
  })

  it('loading a payload-less descendant beneath an unloaded payload implicitly loads the ancestor payload (Live 26.05 capture; stage.cpp:2408-2434, 2597-2612)', async () => {
    setPayloadedScene()
    const stage = (await Stage.open('scene.usda', { loadPayloads: false }))!
    expect(stage.getPrim('/Sad/Panda')).toBeUndefined()
    const record = trackResyncs(stage)

    // /Sad/Panda does not exist on the stage yet (it lives inside /Sad's
    // unloaded payload) and carries no payload of its own. Upstream
    // _IsValidForLoad walks up to the existing ancestor /Sad and accepts
    // the path (stage.cpp:2408-2434) — no error is raised.
    await stage.load('/Sad/Panda')

    // Live 26.05 capture: /Sad is the only included payload; /Sad/Panda is
    // now composed; the sibling payload chain stays untouched.
    expect(stage.getPrim('/Sad/Panda')).toBeDefined()
    expect(stage.getLoadSet()).toEqual(['/Sad'])
    expect(stage.getPrim('/Foo/Baz/Garply')).toBeUndefined()
    // Live 26.05 capture: one notice, resynced at the implicitly loaded
    // ancestor /Sad — not at the requested payload-less descendant.
    expect(record.notices).toEqual([['/Sad']])
  })
})
