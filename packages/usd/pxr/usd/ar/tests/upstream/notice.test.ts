// Ported from OpenUSD 26.11.1: pxr/usd/ar/testenv/testArNotice.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/usd/ar/testenv/testArNotice.cpp
// (registration testArNotice_CPP): ArNotice::ResolverChanged::AffectsContext
// for the default, context, context-object and predicate constructors.
import { describe, expect, it } from 'vitest'
import { Notice as ArNotice, ResolverContext as ArResolverContext } from '../../src/index.ts'

// TestResolverContext<DataType> (testArNotice.cpp:18-43).
class IntContext {
  constructor(readonly data = 0) {}
  lessThan(rhs: IntContext): boolean { return this.data < rhs.data }
  equals(rhs: IntContext): boolean { return this.data === rhs.data }
  hash(): number { return this.data | 0 }
}
class StringContext {
  constructor(readonly data = '') {}
  lessThan(rhs: StringContext): boolean { return this.data < rhs.data }
  equals(rhs: StringContext): boolean { return this.data === rhs.data }
  hash(): number { return this.data.length }
}

describe('testArNotice_CPP', () => {
  // testArNotice.cpp:54-123 (TestResolverChangedNotice).
  it('TestResolverChangedNotice', () => {
    {
      const affectsAllNotice = new ArNotice.ResolverChanged()
      expect(affectsAllNotice.AffectsContext(new ArResolverContext())).toBe(true)
      expect(affectsAllNotice.AffectsContext(
        new ArResolverContext(new IntContext(0), new StringContext('s')))).toBe(true)
    }
    {
      const affectsContext = new ArNotice.ResolverChanged(new IntContext(0))
      expect(affectsContext.AffectsContext(new ArResolverContext())).toBe(false)
      expect(affectsContext.AffectsContext(new ArResolverContext(new IntContext(1)))).toBe(false)
      expect(affectsContext.AffectsContext(new ArResolverContext(new IntContext(0)))).toBe(true)
      expect(affectsContext.AffectsContext(
        new ArResolverContext(new IntContext(0), new StringContext('s')))).toBe(true)
    }
    {
      const ctx = new ArResolverContext(new IntContext(0))
      const affectsContext = new ArNotice.ResolverChanged(ctx)
      expect(affectsContext.AffectsContext(new ArResolverContext())).toBe(false)
      expect(affectsContext.AffectsContext(new ArResolverContext(new IntContext(1)))).toBe(false)
      expect(affectsContext.AffectsContext(new ArResolverContext(new IntContext(0)))).toBe(true)
      expect(affectsContext.AffectsContext(
        new ArResolverContext(new IntContext(0), new StringContext('s')))).toBe(true)
    }
    {
      const affectsFn = new ArNotice.ResolverChanged((ctx: ArResolverContext) => {
        const stringCtx = ctx.get(StringContext)
        return stringCtx !== undefined && stringCtx.data.includes('needle')
      })
      expect(affectsFn.AffectsContext(new ArResolverContext())).toBe(false)
      expect(affectsFn.AffectsContext(new ArResolverContext(new IntContext(0)))).toBe(false)
      expect(affectsFn.AffectsContext(
        new ArResolverContext(new IntContext(0), new StringContext('s')))).toBe(false)
      expect(affectsFn.AffectsContext(
        new ArResolverContext(new StringContext('test-needle')))).toBe(true)
      expect(affectsFn.AffectsContext(
        new ArResolverContext(new IntContext(0), new StringContext('test-needle')))).toBe(true)
    }
  })
})
