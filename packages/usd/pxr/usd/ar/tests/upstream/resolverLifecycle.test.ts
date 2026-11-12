// Ported from OpenUSD 26.11.1: pxr/usd/ar/testenv/testArAdvancedAPI.py,
//  pxr/usd/ar/testenv/testArOptionalImplementation.py,
//  pxr/usd/ar/testenv/testArResolverContext.cpp,
//  pxr/usd/ar/testenv/testArResolverContext.py
// Copyright 2018, 2020, 2021 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ports the applicable lifecycle contracts registered as testArAdvancedAPI,
// testArNotice_CPP, testArResolverContext(_CPP), and the cache-method cases of
// testArOptionalImplementation at OpenUSD v26.05.

import { describe, expect, it } from 'vitest'
import {
  GetResolver as ArGetResolver,
  Resolver as ArResolver,
  ResolverContext as ArResolverContext,
  ResolverContextBinder as ArResolverContextBinder,
  ResolverScopedCache as ArResolverScopedCache,
  ResolvedPath as ArResolvedPath,
} from '../../src/index.ts'

class TestContext { constructor(readonly name: string) {} }

class LifecycleResolver extends ArResolver {
  readonly events: string[] = []
  async resolve(path: string, context = this.getCurrentContext()): Promise<ArResolvedPath> {
    return new ArResolvedPath(`${context.get(TestContext)?.name ?? 'default'}:${path}`)
  }
  async openAsset(): Promise<undefined> { return undefined }
  override beginCacheScope(parent?: unknown): unknown {
    const data = parent ?? {}
    this.events.push(`begin:${parent ? 'shared' : 'new'}`)
    return data
  }
  override endCacheScope(): void { this.events.push('end') }
}

const REGISTERED_PROGRAMS = [
  'testArOptionalImplementation_4',
  'testArOptionalImplementation_5',
] as const

describe(`${REGISTERED_PROGRAMS.join(' / ')} — resolver context and cache lifecycle`, () => {
  it('ArGetResolver returns one process-global resolver', () => {
    expect(ArGetResolver()).toBe(ArGetResolver())
  })

  it('binds and restores the current context', async () => {
    const resolver = new LifecycleResolver()
    const context = new ArResolverContext(new TestContext('bound'))
    expect((await resolver.resolve('asset')).toString()).toBe('default:asset')
    await new ArResolverContextBinder(context, resolver).run(async () => {
      expect(resolver.getCurrentContext()).toBe(context)
      expect((await resolver.resolve('asset')).toString()).toBe('bound:asset')
    })
    expect(resolver.getCurrentContext().empty).toBe(true)
  })

  it('keeps overlapping async operations on their captured bound contexts', async () => {
    const resolver = new LifecycleResolver()
    const open = (name: string) => new ArResolverContextBinder(
      new ArResolverContext(new TestContext(name)), resolver,
    ).run(async () => {
      const captured = resolver.getCurrentContext()
      await Promise.resolve()
      return resolver.resolve('asset', captured)
    })
    const [a, b] = await Promise.all([open('a'), open('b')])
    expect(a.toString()).toBe('a:asset')
    expect(b.toString()).toBe('b:asset')
  })

  it('keeps current contexts isolated after overlapping awaits', async () => {
    const resolver = new LifecycleResolver()
    let releaseA!: () => void
    let releaseB!: () => void
    let readyA!: () => void
    let readyB!: () => void
    const pauseA = new Promise<void>(resolve => { releaseA = resolve })
    const pauseB = new Promise<void>(resolve => { releaseB = resolve })
    const startedA = new Promise<void>(resolve => { readyA = resolve })
    const startedB = new Promise<void>(resolve => { readyB = resolve })

    const run = (name: string, pause: Promise<void>, ready: () => void) => {
      const context = new ArResolverContext(new TestContext(name))
      return new ArResolverContextBinder(context, resolver).run(async () => {
        ready()
        await pause
        return resolver.getCurrentContext().get(TestContext)?.name
      })
    }

    const a = run('a', pauseA, readyA)
    await startedA
    const b = run('b', pauseB, readyB)
    await startedB
    releaseA()
    expect(await a).toBe('a')
    releaseB()
    expect(await b).toBe('b')
  })

  it('begins and ends scoped caches and shares parent data', async () => {
    const resolver = new LifecycleResolver()
    const parent = new ArResolverScopedCache(undefined, resolver)
    const child = new ArResolverScopedCache(parent, resolver)
    await child.run(async () => Promise.resolve())
    parent.end()
    expect(resolver.events).toEqual(['begin:new', 'begin:shared', 'end', 'end'])
  })
})
