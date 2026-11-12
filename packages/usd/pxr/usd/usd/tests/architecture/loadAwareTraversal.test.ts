// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/primData.h, pxr/usd/usd/primFlags.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Load-aware default traversal — gate expansion for the Live Composition
// Fidelity Gate.
//
// Upstream UsdStage::Traverse() (stage.cpp:4174-4178) is
// UsdPrimRange::Stage(this), which filters by UsdPrimDefaultPredicate:
//
//   UsdPrimIsActive && UsdPrimIsDefined && UsdPrimIsLoaded && !UsdPrimIsAbstract
//     (primFlags.cpp:13-15; documented at primFlags.h:496-508)
//
// A prim whose payload is not in the stage's load set fails the
// UsdPrimIsLoaded term (Usd_PrimData::IsLoaded, primData.h:99), so default
// traversal PRUNES it — while TraverseAll() (stage.cpp:4187-4191,
// UsdPrimAllPrimsPredicate) and any custom predicate without the IsLoaded
// term still yield it.
//
// The gate covers all three corresponding public observations together:
// Stage.traverse() uses the default predicate, Stage.traverseAll() uses
// UsdPrimAllPrimsPredicate, and Prim.isLoaded exposes Usd_PrimData::IsLoaded.
//
// Live 26.05 capture (reference build, this exact fixture):
//
//   LoadNone:
//     Traverse()    : ['/Plain', '/Plain/Child']
//     TraverseAll() : ['/Sad', '/Plain', '/Plain/Child', '/Grumpy']
//     PrimRange(Active & Defined & ~Abstract, i.e. default minus IsLoaded):
//                     ['/Sad', '/Plain', '/Plain/Child', '/Grumpy']
//     IsLoaded      : /Sad False, /Plain True, /Plain/Child True, /Grumpy False
//     GetLoadSet    : []
//   LoadNone + Load('/Sad'):
//     Traverse()    : ['/Sad', '/Sad/Panda', '/Plain', '/Plain/Child']
//     TraverseAll() : ['/Sad', '/Sad/Panda', '/Plain', '/Plain/Child', '/Grumpy']
//     IsLoaded      : all True except /Grumpy False
//     GetLoadSet    : ['/Sad']
//   LoadAll:
//     Traverse() == TraverseAll() : all six prims
//     IsLoaded      : all True
//
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
  // Two payloaded prims and one plain prim:
  //
  //   scene.usda
  //     /Sad    ---(P)---> /Sad    (payload1.usda: child /Sad/Panda)
  //     /Plain             plain def, child /Plain/Child
  //     /Grumpy ---(P)---> /Grumpy (payload2.usda: child /Grumpy/Mole)
  files = {
    'payload1.usda': `#usda 1.0
def Scope "Sad"
{
    def Scope "Panda" {}
}
`,
    'payload2.usda': `#usda 1.0
def Scope "Grumpy"
{
    def Scope "Mole" {}
}
`,
    'scene.usda': `#usda 1.0
def Scope "Sad" (
    payload = @./payload1.usda@</Sad>
) {}
def Scope "Plain"
{
    def Scope "Child" {}
}
def Scope "Grumpy" (
    payload = @./payload2.usda@</Grumpy>
) {}
`,
  }
})

// Membership view of the default traversal: the pseudo-root and ordering are
// primRange.test.ts's concern — this file isolates the IsLoaded term.
function traversePaths(stage: Stage): string[] {
  return [...stage.traverse()].filter(p => p !== '/').sort()
}

function traverseAllPaths(stage: Stage): string[] {
  return [...stage.traverseAll()]
}

function isLoaded(stage: Stage, path: string): boolean | undefined {
  return stage.getPrim(path)?.isLoaded
}

describe('load-aware default traversal (UsdPrimDefaultPredicate IsLoaded term)', () => {
  it('control: under LoadAll, traversal yields all prims (native Traverse == TraverseAll)', async () => {
    const stage = (await Stage.open('scene.usda'))!
    // Live 26.05 capture: Traverse() and TraverseAll() agree when everything
    // is loaded — all six prims.
    expect(traversePaths(stage)).toEqual([
      '/Grumpy', '/Grumpy/Mole', '/Plain', '/Plain/Child', '/Sad', '/Sad/Panda',
    ])
    expect([...stage.traverse()]).toEqual([
      '/Sad', '/Sad/Panda', '/Plain', '/Plain/Child', '/Grumpy', '/Grumpy/Mole',
    ])
    expect([...stage.traverseAll()]).toEqual([...stage.traverse()])
  })

  it('under LoadNone, default traversal prunes unloaded payload prims (Live 26.05 capture; primFlags.cpp:13-15)', async () => {
    const stage = (await Stage.open('scene.usda', { loadPayloads: false }))!
    expect(stage.getLoadSet()).toEqual([]) // Live 26.05 capture: []
    // Live 26.05 capture: stage.Traverse() under LoadNone yields ONLY
    // ['/Plain', '/Plain/Child'] — /Sad and /Grumpy exist on the stage but
    // fail UsdPrimIsLoaded and are pruned from default traversal.
    expect(traversePaths(stage)).toEqual(['/Plain', '/Plain/Child'])
  })

  it('a partial load admits exactly the loaded payload subtree to default traversal (Live 26.05 capture)', async () => {
    const stage = (await Stage.open('scene.usda', { loadPayloads: false }))!
    await stage.load('/Sad')
    expect(stage.getLoadSet()).toEqual(['/Sad']) // Live 26.05 capture
    // Composed-content precondition (green either way): the load actually
    // brought in the payload child, and /Grumpy's payload stayed out.
    expect(stage.getPrim('/Sad/Panda')).toBeDefined()
    expect(stage.getPrim('/Grumpy/Mole')).toBeUndefined()
    // Live 26.05 capture: Traverse() == ['/Sad', '/Sad/Panda', '/Plain',
    // '/Plain/Child'] — /Grumpy alone still fails IsLoaded and stays pruned.
    expect(traversePaths(stage)).toEqual(['/Plain', '/Plain/Child', '/Sad', '/Sad/Panda'])
  })

  it('control: the plain (payload-free) prim is visible in every load state', async () => {
    // A prim with no payload anywhere on its ancestor chain always passes
    // UsdPrimIsLoaded (primData.h:99) — visible natively AND in typescript-usd.
    const none = (await Stage.open('scene.usda', { loadPayloads: false }))!
    expect(traversePaths(none)).toContain('/Plain')
    expect(traversePaths(none)).toContain('/Plain/Child')
    const all = (await Stage.open('scene.usda'))!
    expect(traversePaths(all)).toContain('/Plain')
    expect(traversePaths(all)).toContain('/Plain/Child')
  })

  it('control: unloaded payload prims still EXIST and match the native TraverseAll membership (Live 26.05 capture; stage.cpp:4187-4191)', async () => {
    const stage = (await Stage.open('scene.usda', { loadPayloads: false }))!
    // Live 26.05 capture: TraverseAll() under LoadNone == ['/Sad', '/Plain',
    // '/Plain/Child', '/Grumpy'] — unloaded payload prims are present without
    // payload content even though default Traverse() omits them.
    expect(traverseAllPaths(stage).sort()).toEqual([
      '/Grumpy', '/Plain', '/Plain/Child', '/Sad',
    ])
    expect(stage.getPrim('/Sad')).toBeDefined()
    expect(stage.getPrim('/Sad/Panda')).toBeUndefined()
    expect(stage.getPrim('/Grumpy')).toBeDefined()
    expect(stage.getPrim('/Grumpy/Mole')).toBeUndefined()
  })

  it('Prim.isLoaded follows the retained stage load state (primData.h:99)', async () => {
    const stage = (await Stage.open('scene.usda', { loadPayloads: false }))!
    expect(isLoaded(stage, '/Sad')).toBe(false)
    expect(isLoaded(stage, '/Grumpy')).toBe(false)
    expect(isLoaded(stage, '/Plain')).toBe(true)
    expect(isLoaded(stage, '/Plain/Child')).toBe(true)

    await stage.load('/Sad')
    expect(isLoaded(stage, '/Sad')).toBe(true)
    expect(isLoaded(stage, '/Sad/Panda')).toBe(true)
    expect(isLoaded(stage, '/Grumpy')).toBe(false)
  })
})
