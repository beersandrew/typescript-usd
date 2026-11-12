// Ported from OpenUSD 26.11.1: pxr/usd/ar/testenv/testArResolverContext.cpp,
//  pxr/usd/ar/testenv/testArResolverContext.py
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports pxr/usd/ar/testenv/testArResolverContext.cpp (testArResolverContext_CPP)
// and the applicable construction cases of testArResolverContext.py.

import { describe, expect, it } from 'vitest'
import {
  DefaultResolverContext as ArDefaultResolverContext,
  ResolverContext as ArResolverContext,
} from '../../src/index.ts'

// TestContextObject<Data> (testArResolverContext.cpp:18-48): operator<,
// operator== and hash_value over the held data.
function stringHash(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0
  }
  return hash
}

class TestStringContextObject {
  constructor(private readonly data: string) {}
  getData(): string { return this.data }
  lessThan(rhs: TestStringContextObject): boolean { return this.data < rhs.data }
  equals(rhs: TestStringContextObject): boolean { return this.data === rhs.data }
  hash(): number { return stringHash(this.data) }
}

class TestIntContextObject {
  constructor(private readonly data: number) {}
  getData(): number { return this.data }
  lessThan(rhs: TestIntContextObject): boolean { return this.data < rhs.data }
  equals(rhs: TestIntContextObject): boolean { return this.data === rhs.data }
  hash(): number { return this.data >>> 0 }
}

describe('testArResolverContext_CPP', () => {
  it('TestDefault', () => {
    const ctx = new ArResolverContext()
    expect(ctx.isEmpty()).toBe(true)
    expect(ctx.get(TestStringContextObject)).toBeUndefined()
    expect(ctx.get(TestIntContextObject)).toBeUndefined()

    const ctx2 = new ArResolverContext()
    expect(ctx2.isEmpty()).toBe(true)
    expect(ctx2.get(TestStringContextObject)).toBeUndefined()
    expect(ctx.get(TestIntContextObject)).toBeUndefined()
    expect(ctx.equals(ctx2)).toBe(true)
    expect(ctx.lessThan(ctx2)).toBe(false)
    expect(ctx2.lessThan(ctx)).toBe(false)
  })

  it('TestSingleContextObject', () => {
    const strContextObj = new TestStringContextObject('test string')
    const ctx1 = new ArResolverContext(strContextObj)
    expect(ctx1.isEmpty()).toBe(false)

    const strObjFromCtx = ctx1.get(TestStringContextObject)
    expect(strObjFromCtx).toBeDefined()
    expect(strObjFromCtx!.getData()).toBe(strContextObj.getData())
    expect(ctx1.get(TestIntContextObject)).toBeUndefined()

    const ctx2 = new ArResolverContext(new TestStringContextObject('test string'))
    expect(ctx1.equals(ctx2)).toBe(true)
    expect(ctx1.lessThan(ctx2)).toBe(false)
    expect(ctx2.lessThan(ctx1)).toBe(false)

    expect(ctx1.equals(new ArResolverContext())).toBe(false)
    expect(ctx1.equals(new ArResolverContext(new TestStringContextObject('foo')))).toBe(false)
    expect(ctx1.equals(new ArResolverContext(new TestIntContextObject(42)))).toBe(false)
  })

  it('TestMultipleContextObjects', () => {
    const context = new ArResolverContext(
      new TestStringContextObject('test string'),
      new TestIntContextObject(42))
    expect(context.isEmpty()).toBe(false)
    expect(context.equals(new ArResolverContext())).toBe(false)

    const strObjFromContext = context.get(TestStringContextObject)
    expect(strObjFromContext?.getData()).toBe('test string')
    const intObjFromContext = context.get(TestIntContextObject)
    expect(intObjFromContext?.getData()).toBe(42)

    // The same objects in a different order, or nested in ArResolverContexts,
    // compare and hash equal.
    for (const testContext of [
      new ArResolverContext(intObjFromContext!, strObjFromContext!),
      new ArResolverContext(intObjFromContext!, new ArResolverContext(strObjFromContext!)),
      new ArResolverContext(
        new ArResolverContext(intObjFromContext!),
        new ArResolverContext(strObjFromContext!)),
    ]) {
      expect(context.equals(testContext)).toBe(true)
      expect(context.lessThan(testContext)).toBe(false)
      expect(testContext.lessThan(context)).toBe(false)
      expect(context.hash()).toBe(testContext.hash())
    }

    const intObj = new TestIntContextObject(42)
    const strObj = new TestStringContextObject('foo')
    for (const testContext of [
      new ArResolverContext(intObj),
      new ArResolverContext(strObj),
      new ArResolverContext(strObj, intObj),
      new ArResolverContext(new ArResolverContext(strObj), new ArResolverContext(intObj)),
      new ArResolverContext(strObj, new ArResolverContext(intObj)),
    ]) {
      expect(context.equals(testContext)).toBe(false)
    }
  })
})

describe('testArResolverContext', () => {
  it('test_ExplicitConstruction', () => {
    // An empty list of contexts creates an empty context.
    expect(new ArResolverContext([]).equals(new ArResolverContext())).toBe(true)

    const ctxObj = new ArDefaultResolverContext(['/test'])
    const ctx = new ArResolverContext(ctxObj)
    expect(new ArResolverContext(ctxObj).equals(ctx)).toBe(true)
    expect(new ArResolverContext([ctx]).equals(ctx)).toBe(true)
  })

  it('test_Get', () => {
    const ctxObj = new ArDefaultResolverContext(['/test'])
    const ctx = new ArResolverContext(ctxObj)
    expect(ctx.get(ArDefaultResolverContext)).toBe(ctxObj)
  })
})
