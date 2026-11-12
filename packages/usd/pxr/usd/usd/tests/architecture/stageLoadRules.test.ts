import { describe, expect, it } from 'vitest'
import { StageLoadRule, StageLoadRules } from '../../src/stageLoadRules.ts'

describe('StageLoadRules upstream rule algebra', () => {
  it('represents the implicit load-all and explicit load-none defaults', () => {
    expect(StageLoadRules.loadAll().getRules()).toEqual([])
    expect(StageLoadRules.loadNone().getRules()).toEqual([['/', StageLoadRule.None]])

    const rules = StageLoadRules.loadNone()
    rules.loadWithDescendants('/')
    rules.minimize()
    expect(rules.getRules()).toEqual([])
  })

  it('loads the ancestor chain leading to a loaded descendant', () => {
    const rules = StageLoadRules.loadNone()
    rules.addRule('/Foo/Bar/Baz/Garply', StageLoadRule.All)
    for (const path of ['/', '/Foo', '/Foo/Bar', '/Foo/Bar/Baz', '/Foo/Bar/Baz/Garply']) {
      expect(rules.isLoaded(path), path).toBe(true)
    }
    expect(rules.isLoaded('/Foo/Bear')).toBe(false)
    expect(rules.getEffectiveRuleForPath('/Foo/Bar')).toBe(StageLoadRule.Only)
  })

  it('supports load-only-this-prim without loading descendants', () => {
    const rules = StageLoadRules.loadNone()
    rules.loadWithoutDescendants('/World/Model')
    expect(rules.isLoaded('/World')).toBe(true)
    expect(rules.isLoaded('/World/Model')).toBe(true)
    expect(rules.isLoaded('/World/Model/Child')).toBe(false)
    expect(rules.isLoadedWithNoDescendants('/World/Model')).toBe(true)
  })

  it('applies unloads before loads and minimizes redundant entries', () => {
    const rules = StageLoadRules.loadAll()
    rules.loadAndUnload(
      ['/Load/All', '/Another/Load/All'],
      ['/Unload/All', '/Another/Unload/All', '/Load/All/UnloadIneffective'],
      'withDescendants',
    )
    rules.minimize()
    expect(rules.getRules()).toEqual([
      ['/Another/Unload/All', StageLoadRule.None],
      ['/Unload/All', StageLoadRule.None],
    ])
  })

  it('copies rules without sharing mutable storage', () => {
    const rules = StageLoadRules.loadNone()
    rules.addRule('/Loaded', StageLoadRule.All)
    const copy = rules.clone()
    copy.unload('/Loaded')
    expect(rules.isLoaded('/Loaded')).toBe(true)
    expect(copy.isLoaded('/Loaded')).toBe(false)
  })
})
