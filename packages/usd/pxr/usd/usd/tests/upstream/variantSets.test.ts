// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/variantSets.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usd/testenv/testUsdVariantSets.py
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArResolver, ArResolvedPath, ArAsset, ArInMemoryAsset } from 'typescript-usd/usd/_internal'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => { _setResolverForTest(new FixtureResolver()) })

const PLAIN = `#usda 1.0
def Xform "World" {
  def Sphere "Ball" {
    double radius = 1
  }
}
`

const WITH_VARIANTS = `#usda 1.0
def Xform "World" {
  def Sphere "Ball" (
    prepend variantSets = ["shading"]
    variants = { string shading = "red" }
  )
  {
    double radius = 1
    variantSet "shading" = {
      "red" {
        color3f[] primvars:displayColor = [(1, 0, 0)]
      }
      "blue" {
        color3f[] primvars:displayColor = [(0, 0, 1)]
      }
    }
  }
}
`

const color = (stage: Stage) =>
  stage.getPrim('/World/Ball')?.getAttr('primvars:displayColor')?.getValue()

// A variant set whose variants each define a different child prim, so we can
// observe which prims the selected variant composes into the stage.
const VARIANT_CHILDREN = `#usda 1.0
def Xform "P" (
    variants = { string v = "a" }
    prepend variantSets = "v"
)
{
    variantSet "v" = {
        "a" {
            def Sphere "InA" {}
        }
        "b" {
            def Cube "InB" {}
        }
    }
}
`

// A variant set nested inside another: the inner set (and its prim) only exists
// when the outer "x" variant is selected; the "y" variant has no inner set.
const NESTED_VARIANTS = `#usda 1.0
def Xform "P" (
    variants = { string outer = "x" }
    prepend variantSets = "outer"
)
{
    variantSet "outer" = {
        "x" (
            variants = { string inner = "p" }
            prepend variantSets = "inner"
        )
        {
            def Sphere "InX" {}
            variantSet "inner" = {
                "p" {
                    def Cube "InP" {}
                }
                "q" {
                    def Cone "InQ" {}
                }
            }
        }
        "y" {
            def Sphere "InY" {}
        }
    }
}
`

const kids = (stage: Stage, path: string) =>
  stage.getChildPrimPaths(path).map(p => p.split('/').pop()!).sort()

describe('UsdVariantSets', () => {
  describe('Authoring', () => {
    it('AddVariantSet creates a named variant set on the prim', async () => {
      files = { 'root.usda': PLAIN }
      const stage = (await Stage.open('root.usda'))!
      const vsets = stage.getVariantSets('/World/Ball')
      await vsets.addVariantSet('size')
      expect(vsets.getNames()).toContain('size')
      expect(vsets.hasVariantSet('size')).toBe(true)
    })

    it('GetVariantSet returns the named variant set', async () => {
      files = { 'root.usda': PLAIN }
      const stage = (await Stage.open('root.usda'))!
      await stage.getVariantSets('/World/Ball').addVariantSet('size')
      const vset = stage.getVariantSets('/World/Ball').getVariantSet('size')
      expect(vset.name).toBe('size')
      expect(vset.getVariantNames()).toEqual([])
    })

    it('GetVariantSets returns all variant sets defined on a prim', async () => {
      files = { 'root.usda': WITH_VARIANTS }
      const stage = (await Stage.open('root.usda'))!
      const vsets = stage.getVariantSets('/World/Ball')
      await vsets.addVariantSet('size')
      expect(vsets.getNames().sort()).toEqual(['shading', 'size'])
    })

    it('AddVariant adds a named variant inside the variant set', async () => {
      files = { 'root.usda': PLAIN }
      const stage = (await Stage.open('root.usda'))!
      const vset = await stage.getVariantSets('/World/Ball').addVariantSet('size')
      await vset.addVariant('small')
      await vset.addVariant('large')
      // UsdVariantSet::GetVariantNames returns a sorted set
      // (variantSets.cpp:54-65).
      expect(vset.getVariantNames()).toEqual(['large', 'small'])
    })

    it('authored variant sets serialize and round-trip through USDA', async () => {
      files = { 'root.usda': PLAIN }
      const stage = (await Stage.open('root.usda'))!
      const vset = await stage.getVariantSets('/World/Ball').addVariantSet('size')
      await vset.addVariant('small')

      const text = stage.getRootLayer().toUsda()
      // UsdVariantSets::AddVariantSet prepends the name
      // (variantSets.cpp:206-207, UsdListPositionBackOfPrependList).
      expect(text).toContain('prepend variantSets = "size"')
      expect(text).toContain('variantSet "size" = {')

      files = { 'reopened.usda': text }
      const reopened = (await Stage.open('reopened.usda'))!
      expect(reopened.getVariantSets('/World/Ball').getNames()).toContain('size')
      expect(
        reopened.getVariantSets('/World/Ball').getVariantSet('size').getVariantNames(),
      ).toEqual(['small'])
    })
  })

  describe('Selection', () => {
    it('SetVariantSelection switches which variant is active', async () => {
      files = { 'root.usda': WITH_VARIANTS }
      const stage = (await Stage.open('root.usda'))!
      expect(color(stage)).toEqual([[1, 0, 0]])
      await stage.getVariantSets('/World/Ball').getVariantSet('shading').setVariantSelection('blue')
      expect(color(stage)).toEqual([[0, 0, 1]])
    })

    it('GetVariantSelection returns the currently selected variant name', async () => {
      files = { 'root.usda': WITH_VARIANTS }
      const stage = (await Stage.open('root.usda'))!
      const vset = stage.getVariantSets('/World/Ball').getVariantSet('shading')
      expect(vset.getVariantSelection()).toBe('red')
      await vset.setVariantSelection('blue')
      expect(vset.getVariantSelection()).toBe('blue')
    })

    it('ClearVariantSelection removes the selection, reverting to no selection', async () => {
      files = { 'root.usda': WITH_VARIANTS }
      const stage = (await Stage.open('root.usda'))!
      const vset = stage.getVariantSets('/World/Ball').getVariantSet('shading')
      await vset.setVariantSelection('blue')
      expect(color(stage)).toEqual([[0, 0, 1]])
      await vset.setVariantSelection('')
      // Clearing the root-layer selection: no variant applies
      expect(vset.getVariantSelection()).toBe('')
      expect(color(stage)).toBeUndefined()
    })

    it('GetVariantNames returns all authored variant names, sorted', async () => {
      files = { 'root.usda': WITH_VARIANTS }
      const stage = (await Stage.open('root.usda'))!
      // variantSets.cpp:54-65 collects the names in a std::set.
      expect(
        stage.getVariantSets('/World/Ball').getVariantSet('shading').getVariantNames(),
      ).toEqual(['blue', 'red'])
    })
  })

  describe('Composition', () => {
    it('prims inside the selected variant are composed into the stage', async () => {
      files = { 'root.usda': VARIANT_CHILDREN }
      const stage = (await Stage.open('root.usda'))!
      // Default selection "a" composes /P/InA.
      expect(kids(stage, '/P')).toEqual(['InA'])
      expect(stage.has('/P/InA')).toBe(true)
    })

    it('prims inside non-selected variants are excluded from the stage', async () => {
      files = { 'root.usda': VARIANT_CHILDREN }
      const stage = (await Stage.open('root.usda'))!
      // "b" is not selected: its child must not compose in.
      expect(stage.has('/P/InB')).toBe(false)
      expect(kids(stage, '/P')).not.toContain('InB')

      // Switching the selection swaps the composed child.
      await stage.getVariantSets('/P').getVariantSet('v').setVariantSelection('b')
      expect(kids(stage, '/P')).toEqual(['InB'])
      expect(stage.has('/P/InA')).toBe(false)
      expect(stage.has('/P/InB')).toBe(true)
    })

    it('attributes inside the selected variant are visible on the prim', async () => {
      files = { 'root.usda': WITH_VARIANTS }
      const stage = (await Stage.open('root.usda'))!
      expect(color(stage)).toEqual([[1, 0, 0]])
      expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(1)
    })

    it('resolves a property authored only inside the selected variant', async () => {
      files = { 'root.usda': `#usda 1.0
def "foo" {
    def "bar" (
        variants = { string commonName = "c" }
        prepend variantSets = "commonName"
    ) {
        variantSet "commonName" = {
            "c" {
                int value = 7
            }
        }
    }
}
` }
      const stage = (await Stage.open('root.usda'))!
      expect(stage.get('/foo/bar.value')?.getValue()).toBe(7)
      expect(stage.getPropertyStack('/foo/bar.value').map(entry => entry.specPath))
        .toEqual(['/foo/bar{commonName=c}.value'])
    })

    it('switching variant selection updates the composed prim immediately', async () => {
      files = { 'root.usda': WITH_VARIANTS }
      const stage = (await Stage.open('root.usda'))!
      let notices = 0
      onObjectsChanged(stage, () => { notices += 1 })
      await stage.getVariantSets('/World/Ball').getVariantSet('shading').setVariantSelection('blue')
      expect(color(stage)).toEqual([[0, 0, 1]])
      expect(notices).toBe(1)
    })
  })

  describe('Nesting', () => {
    it('nested variant sets compose correctly when both selections are set', async () => {
      files = { 'root.usda': NESTED_VARIANTS }
      const stage = (await Stage.open('root.usda'))!

      // outer="x" exposes the inner set; default inner="p".
      expect(stage.getVariantSets('/P').getNames().sort()).toEqual(['inner', 'outer'])
      expect(stage.getVariantSets('/P').getVariantSet('inner').getVariantSelection()).toBe('p')
      // outer's own prim InX plus the inner "p" prim InP compose together.
      expect(kids(stage, '/P')).toEqual(['InP', 'InX'])

      // Switching the inner selection swaps the inner prim, outer prim stays.
      await stage.getVariantSets('/P').getVariantSet('inner').setVariantSelection('q')
      expect(kids(stage, '/P')).toEqual(['InQ', 'InX'])
    })

    it('inner variant set is only available when outer variant is selected', async () => {
      files = { 'root.usda': NESTED_VARIANTS }
      const stage = (await Stage.open('root.usda'))!

      // Select outer="y", which carries no inner set.
      await stage.getVariantSets('/P').getVariantSet('outer').setVariantSelection('y')
      expect(stage.getVariantSets('/P').getNames()).toEqual(['outer'])
      expect(stage.getVariantSets('/P').getVariantSet('inner').getVariantSelection()).toBe('')
      // Only the "y" prim composes; nothing from the (now-absent) inner set.
      expect(kids(stage, '/P')).toEqual(['InY'])
      expect(stage.has('/P/InP')).toBe(false)
      expect(stage.has('/P/InQ')).toBe(false)
    })
  })
})
