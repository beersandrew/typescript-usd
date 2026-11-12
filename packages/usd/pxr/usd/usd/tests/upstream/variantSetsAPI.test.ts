// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/variantSets.cpp, pxr/usd/usd/testenv/testUsdVariants.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// E5: UsdVariantSets / UsdVariantSet — read variant structure from the
// composed stage, author selections through the edit target (recompose +
// notify), per upstream UsdVariantSets semantics (usdview's variant combo
// boxes are built on exactly this API).

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

const ROOT = `#usda 1.0
def Xform "Rig" (
    variants = {
        string look = "red"
    }
    prepend variantSets = "look"
)
{
    variantSet "look" = {
        "red" {
            double tint = 1

            def Sphere "RedGeo"
            {
                double radius = 10
            }
        }
        "blue" {
            double tint = 2

            def Cube "BlueGeo"
            {
                double size = 20
            }
        }
    }
}
`

function setScene() { files = { 'root.usda': ROOT } }

describe('testUsdVariants — UsdVariantSets', () => {
  it('reads set names, variant names, and the current selection', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const vsets = stage.getVariantSets('/Rig')
    expect(vsets.getNames()).toEqual(['look'])
    expect(vsets.hasVariantSet('look')).toBe(true)

    const look = vsets.getVariantSet('look')
    // Sorted, as variantSets.cpp:54-65 collects the names in a std::set.
    expect(look.getVariantNames()).toEqual(['blue', 'red'])
    expect(look.getVariantSelection()).toBe('red')
    expect(vsets.getAllVariantSelections()).toEqual({ look: 'red' })
  })

  it('setVariantSelection switches the composed scene', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const look = stage.getVariantSets('/Rig').getVariantSet('look')

    await look.setVariantSelection('blue')

    expect(look.getVariantSelection()).toBe('blue')
    expect(stage.getPrim('/Rig')?.getAttr('tint')?.getValue()).toBe(2)
    expect(stage.has('/Rig/BlueGeo')).toBe(true)
    expect(stage.has('/Rig/RedGeo')).toBe(false)
  })

  it('selection authored to the SESSION layer leaves the file layer pristine', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    stage.setEditTarget(stage.getSessionLayer())

    await stage.getVariantSets('/Rig').getVariantSet('look').setVariantSelection('blue')

    expect(stage.getPrim('/Rig')?.getAttr('tint')?.getValue()).toBe(2)
    // session carries the opinion; the root layer still says "red"
    expect(stage.getSessionLayer().getField('/Rig', 'variantSelection')).toEqual({ look: 'blue' })
    expect(stage.getRootLayer().getField('/Rig', 'variantSelection')).toEqual({ look: 'red' })
  })

  it('the variant switch emits resync notices for the changed subtree', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const notices: ObjectsChangedSummary[] = []
    onObjectsChanged(stage, n => notices.push(n))

    await stage.getVariantSets('/Rig').getVariantSet('look').setVariantSelection('blue')

    const all = notices.flatMap(n => [...n.resyncedPaths, ...n.changedInfoOnlyPaths])
    expect(all.some(p => p.startsWith('/Rig'))).toBe(true)
  })

  it('an empty selection clears the variant (no variant composes)', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    stage.setEditTarget(stage.getSessionLayer())
    const look = stage.getVariantSets('/Rig').getVariantSet('look')

    // Session must override the root's "red" — author the clear there...
    await look.setVariantSelection('blue')
    expect(stage.has('/Rig/BlueGeo')).toBe(true)
    // ...then clear the session opinion: the root's "red" wins again
    await look.setVariantSelection('')
    expect(look.getVariantSelection()).toBe('red')
    expect(stage.has('/Rig/RedGeo')).toBe(true)
  })

  it('prims without variant sets return empty results', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getVariantSets('/Rig/RedGeo').getNames()).toEqual([])
    expect(stage.getVariantSets('/Nope').getNames()).toEqual([])
  })
})
