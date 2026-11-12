// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdVariantFallbacks.py,
//  pxr/usd/usd/variantSets.cpp, pxr/usd/usd/stage.h
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usd/testenv/testUsdVariantFallbacks.py
//
// The upstream suite exercises GLOBAL variant fallbacks: a prim's variant set
// (/Sarah's "displayColor") carries NO authored selection, so the composed
// selection comes from the process-global fallback registry — seeded from a
// plugInfo.json ("green") and overridable at runtime via
// Usd.Stage.SetGlobalVariantFallbacks({'displayColor': ['red']}). An explicitly
// authored selection (SetVariantSelection('blue')) then wins over the fallback.
//
// The full surface is now supported (2026-07-07):
// Stage.{get,set}GlobalVariantFallbacks mirror UsdStage's statics — the map is
// lazily seeded from plugin metadata ("UsdVariantFallbacks") on first access,
// captured per-stage at creation (later set calls don't affect existing
// stages), and threaded to PcpCache.setVariantFallbacks, whose live
// EvalNodeVariantFallback task slots (ported with the 2026-07 pcp ordering
// campaign, b712671) select the first configured fallback naming an existing
// option when no selection is authored. getVariantSelection() scans the
// composed prim index (UsdVariantSet::GetVariantSelection), so it reflects
// fallback-driven selections too.
//
// Test order matters, as in upstream's single test_Basic: the plugInfo test
// runs FIRST because the global map seeds from plugin metadata on FIRST
// ACCESS (upstream TF_MAKE_STATIC_DATA) — plugins registered after that are
// not re-scanned. Goldens verified against the Pixar v26.05 build (usd-2605):
//   plugInfo green: selection 'green', color (0,1,0)
//   SetGlobalVariantFallbacks({'displayColor':['red']}) -> 'red', (1,0,0)
//   SetVariantSelection('blue')                          -> 'blue', (0,0,1)
//   no fallback: selection '', color None, children ['EmptyPrim']
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'
import { Registry as PlugRegistry } from 'typescript-usd/plug'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> {
    const name = assetPath.split('/').pop() ?? assetPath
    return new ArResolvedPath(files[name] === undefined ? '' : assetPath)
  }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    const name = path.toString().split('/').pop() ?? path.toString()
    const text = files[name]
    return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text))
  }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

// The upstream testAPI_var.usda fixture: /Sarah declares the "displayColor"
// variant set (red/green/blue, each authoring `color`) but authors NO selection.
const NO_SELECTION = `#usda 1.0
def "Sarah" (
    add variantSets = "displayColor"
)
{
    def Scope "EmptyPrim" {}

    variantSet "displayColor" = {
        "red" { custom color3d color = (1, 0, 0) ; }
        "green" { custom color3d color = (0, 1, 0) ; }
        "blue" { custom color3d color = (0, 0, 1) ; }
    }
}
`

// Same fixture but with the default selection authored on the prim — the
// `variants = {}` opinion a global fallback would otherwise stand in for.
const DEFAULT_SELECTION = `#usda 1.0
def "Sarah" (
    variants = { string displayColor = "red" }
    add variantSets = "displayColor"
)
{
    def Scope "EmptyPrim" {}

    variantSet "displayColor" = {
        "red" { custom color3d color = (1, 0, 0) ; }
        "green" { custom color3d color = (0, 1, 0) ; }
        "blue" { custom color3d color = (0, 0, 1) ; }
    }
}
`

const color = (stage: Stage) =>
  stage.getPrim('/Sarah')?.getAttr('color')?.getValue()

describe('UsdVariantFallbacks', () => {
  // Register the upstream testenv's plugInfo.json (verbatim Info block)
  // BEFORE any test touches the fallback API — upstream test_Basic's
  // Plug.Registry().RegisterPlugins(testenvDir).
  beforeAll(() => {
    PlugRegistry.GetInstance().RegisterPlugins({
      Plugins: [{
        Type: 'resource',
        Name: 'testUsdVariantFallbacks',
        Info: { UsdVariantFallbacks: { displayColor: ['green'] } },
      }],
    })
  })

  // Upstream: "Because our test has plugInfo.json that specifies a fallback
  // of green, we should see green." This is the FIRST access of the global
  // map, so it seeds from the plugin registered above.
  it('GetGlobalVariantFallbacks() reflects the plugInfo (green) fallback and composes green', async () => {
    expect(Stage.getGlobalVariantFallbacks()['displayColor']).toEqual(['green'])

    files = { 'testAPI_var.usda': NO_SELECTION }
    const stage = (await Stage.open('testAPI_var.usda'))!
    const displayColor = stage.getVariantSets('/Sarah').getVariantSet('displayColor')
    expect(color(stage)).toEqual([0, 1, 0])
    expect(displayColor.getVariantSelection()).toBe('green')
  })

  // Upstream: "Now override our process global variant policy and open a new
  // stage" → red; then "Author a variant selection" → blue wins.
  it("SetGlobalVariantFallbacks({displayColor:['red']}) composes red; authored blue then wins", async () => {
    Stage.setGlobalVariantFallbacks({ displayColor: ['red'] })
    expect(Stage.getGlobalVariantFallbacks()).toEqual({ displayColor: ['red'] })

    files = { 'testAPI_var.usda': NO_SELECTION }
    const stage = (await Stage.open('testAPI_var.usda'))!
    const displayColor = stage.getVariantSets('/Sarah').getVariantSet('displayColor')
    expect(color(stage)).toEqual([1, 0, 0])
    expect(displayColor.getVariantSelection()).toBe('red')

    await displayColor.setVariantSelection('blue')
    expect(color(stage)).toEqual([0, 0, 1])
    expect(displayColor.getVariantSelection()).toBe('blue')
  })

  it('with no authored selection and no global fallback, no variant composes', async () => {
    // Upstream's no-plugin case: GetVariantSelection() == '' and color == None.
    Stage.setGlobalVariantFallbacks({})
    files = { 'testAPI_var.usda': NO_SELECTION }
    const stage = (await Stage.open('testAPI_var.usda'))!
    const displayColor = stage.getVariantSets('/Sarah').getVariantSet('displayColor')

    // Sorted, as variantSets.cpp:54-65 collects the names in a std::set.
    expect(displayColor.getVariantNames()).toEqual(['blue', 'green', 'red'])
    expect(displayColor.getVariantSelection()).toBe('')
    expect(color(stage)).toBeUndefined()
    // Only the non-variant child composes; no variant's opinions are present.
    expect(stage.getChildPrimPaths('/Sarah')).toEqual(['/Sarah/EmptyPrim'])
  })

  it('an authored default selection composes that variant (fallback analog)', async () => {
    // The authored `variants = {}` opinion is what typescript-usd resolves in place of a
    // global fallback: red selects color (1,0,0), mirroring the upstream
    // red-fallback golden.
    files = { 'testAPI_var.usda': DEFAULT_SELECTION }
    const stage = (await Stage.open('testAPI_var.usda'))!
    const displayColor = stage.getVariantSets('/Sarah').getVariantSet('displayColor')

    expect(displayColor.getVariantSelection()).toBe('red')
    expect(color(stage)).toEqual([1, 0, 0])
  })

  it('an explicit authored selection overrides the default (blue)', async () => {
    // Upstream authors 'blue' after the fallback; the stronger opinion wins.
    files = { 'testAPI_var.usda': DEFAULT_SELECTION }
    const stage = (await Stage.open('testAPI_var.usda'))!
    const displayColor = stage.getVariantSets('/Sarah').getVariantSet('displayColor')

    await displayColor.setVariantSelection('blue')
    expect(displayColor.getVariantSelection()).toBe('blue')
    expect(color(stage)).toEqual([0, 0, 1])
  })

  // Set only affects stages created AFTER the call (upstream stage.h: "This
  // does not affect existing UsdStages") — each stage captures the map at
  // creation and reapplies it on every recompose.
  it('SetGlobalVariantFallbacks does not affect existing stages, even across recompose', async () => {
    Stage.setGlobalVariantFallbacks({})
    files = { 'testAPI_var.usda': NO_SELECTION }
    const existing = (await Stage.open('testAPI_var.usda'))!
    expect(color(existing)).toBeUndefined()

    Stage.setGlobalVariantFallbacks({ displayColor: ['red'] })
    // Force the existing stage through a recompose: it must keep composing
    // with its captured (empty) fallbacks, not the new global map.
    await existing.getVariantSets('/Sarah').getVariantSet('displayColor').setVariantSelection('')
    expect(color(existing)).toBeUndefined()
    expect(existing.getVariantSets('/Sarah').getVariantSet('displayColor').getVariantSelection()).toBe('')

    // A NEW stage picks up the new map.
    const fresh = (await Stage.open('testAPI_var.usda'))!
    expect(color(fresh)).toEqual([1, 0, 0])
  })
})
