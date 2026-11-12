// Ported from OpenUSD 26.11.1: pxr/usd/ar/defaultResolver.cpp,
//  pxr/usd/ar/testenv/testArDefaultResolver.cpp,
//  pxr/usd/ar/testenv/testArDefaultResolver.py
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Applicable port of the registered testArDefaultResolver testenv.
// Governing algorithms: OpenUSD pxr/usd/ar/defaultResolver.cpp:35-230 and
// testenv/testArDefaultResolver.py:192-426 at v26.05.

import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  DefaultResolver as ArDefaultResolver,
  DefaultResolverContext as ArDefaultResolverContext,
  ResolverContext as ArResolverContext,
  ResolverContextBinder as ArResolverContextBinder,
  ResolverScopedCache as ArResolverScopedCache,
  ResolvedPath as ArResolvedPath,
} from '../../src/index.ts'

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'typescript-usd-ar-default-'))
}

function touch(path: string): string {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '')
  return resolve(path)
}

afterEach(() => ArDefaultResolver.setDefaultSearchPath([]))

describe('ArDefaultResolver', () => {
  it('creates normalized identifiers with look-here-first search semantics', () => {
    const root = tempRoot()
    try {
      const resolver = new ArDefaultResolver()
      const anchor = new ArResolvedPath(join(root, 'dir', 'anchor.usda'))
      const existing = touch(join(root, 'dir', 'subdir', 'exists.txt'))
      expect(resolver.createIdentifier('')).toBe('')
      expect(resolver.createIdentifier('/dir/.//asset.usda')).toBe('/dir/asset.usda')
      expect(resolver.createIdentifier('./subdir/file.usda')).toBe('subdir/file.usda')
      expect(resolver.createIdentifier('subdir/exists.txt', anchor)).toBe(existing)
      expect(resolver.createIdentifier('subdir/missing.txt', anchor))
        .toBe('subdir/missing.txt')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // Expected values from OpenUSD v26.08 Ar.GetResolver().CreateIdentifier;
  // package-relative paths dispatch on their outer package path
  // (resolver.cpp:560-580).
  it('creates identifiers for package-relative paths from the outer package path', () => {
    const root = tempRoot()
    try {
      const resolver = new ArDefaultResolver()
      const anchor = new ArResolvedPath(join(root, 'layer.usda'))
      const pkg = touch(join(root, 'pkg.usdz'))
      expect(resolver.createIdentifier('pkg.usdz[nonexistent.exr]', anchor)).toBe(`${pkg}[nonexistent.exr]`)
      expect(resolver.createIdentifier('missing.usdz[x.exr]', anchor)).toBe('missing.usdz[x.exr]')
      expect(resolver.createIdentifier('./pkg.usdz[a/b.exr]', anchor)).toBe(`${pkg}[a/b.exr]`)
      expect(resolver.createIdentifier('other.usda', new ArResolvedPath(`${pkg}[inner/x.usda]`)))
        .toBe('other.usda')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('resolves only existing assets to absolute paths from the current directory', async () => {
    const name = `.typescript-usd-ar-default-${Date.now()}-${Math.random()}.txt`
    const existing = touch(join(process.cwd(), name))
    try {
      const resolver = new ArDefaultResolver()
      expect((await resolver.resolve(name)).toString()).toBe(existing)
      expect((await resolver.resolve(`${name}.missing`)).valid).toBe(false)
    } finally {
      rmSync(existing, { force: true })
    }
  })

  it('searches bound context paths before default search paths', async () => {
    const root = tempRoot()
    try {
      const boundAsset = touch(join(root, 'bound', 'asset.txt'))
      touch(join(root, 'fallback', 'asset.txt'))
      const resolver = new ArDefaultResolver()
      ArDefaultResolver.setDefaultSearchPath([join(root, 'fallback')])
      const context = new ArResolverContext(
        new ArDefaultResolverContext([join(root, 'bound')]),
      )
      await new ArResolverContextBinder(context, resolver).run(async () => {
        expect((await resolver.resolve('asset.txt')).toString()).toBe(boundAsset)
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('searches the configured default paths in order', async () => {
    const root = tempRoot()
    try {
      const expected = touch(join(root, 'second', 'nested', 'asset.txt'))
      const resolver = new ArDefaultResolver()
      ArDefaultResolver.setDefaultSearchPath([
        join(root, 'first'),
        join(root, 'second'),
      ])
      expect((await resolver.resolve('nested/asset.txt')).toString()).toBe(expected)
      expect((await resolver.resolve('asset.txt')).valid).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('creates absolute default-context search paths for an asset', () => {
    const resolver = new ArDefaultResolver()
    const context = resolver.createDefaultContextForAsset('dir/root.usda')
    expect(context.get(ArDefaultResolverContext)?.searchPath).toEqual([
      join(process.cwd(), 'dir'),
    ])
  })

  it('creates default-resolver contexts from path-list strings', () => {
    const root = tempRoot()
    try {
      const resolver = new ArDefaultResolver()
      const context = resolver.createContextFromString([
        join(root, 'first'),
        join(root, 'second'),
      ].join(':'))
      expect(context.get(ArDefaultResolverContext)?.searchPath).toEqual([
        join(root, 'first'),
        join(root, 'second'),
      ])
      expect(resolver.createContextFromStrings([['', join(root, 'first')]]).equals(
        new ArResolverContext(new ArDefaultResolverContext([join(root, 'first')])),
      )).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('uses an updated default search path for subsequent resolution', async () => {
    const root = tempRoot()
    try {
      const first = touch(join(root, 'first', 'asset.txt'))
      const second = touch(join(root, 'second', 'asset.txt'))
      const resolver = new ArDefaultResolver()
      ArDefaultResolver.setDefaultSearchPath([join(root, 'first')])
      expect((await resolver.resolve('asset.txt')).toString()).toBe(first)
      ArDefaultResolver.setDefaultSearchPath([join(root, 'second')])
      expect((await resolver.resolve('asset.txt')).toString()).toBe(second)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('creates absolute identifiers and resolved paths for new assets', async () => {
    const root = tempRoot()
    try {
      const resolver = new ArDefaultResolver()
      const relative = `.typescript-usd-ar-new-${Date.now()}/asset.usda`
      const expected = join(process.cwd(), relative)
      expect(resolver.createIdentifierForNewAsset(relative)).toBe(expected)
      expect((await resolver.resolveForNewAsset(relative)).toString()).toBe(expected)
      expect((await resolver.resolveForNewAsset('')).valid).toBe(false)

      const anchored = resolver.createIdentifierForNewAsset(
        'sibling.usda',
        new ArResolvedPath(join(root, 'dir', 'anchor.usda')),
      )
      expect(anchored).toBe(join(root, 'dir', 'sibling.usda'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('retains resolution results within a scoped cache', async () => {
    const root = tempRoot()
    try {
      const first = touch(join(root, 'first', 'asset.txt'))
      const second = touch(join(root, 'second', 'asset.txt'))
      const resolver = new ArDefaultResolver()
      const context = new ArResolverContext(new ArDefaultResolverContext([
        join(root, 'first'),
        join(root, 'second'),
      ]))
      await new ArResolverContextBinder(context, resolver).run(async () => {
        await new ArResolverScopedCache(undefined, resolver).run(async () => {
          expect((await resolver.resolve('asset.txt')).toString()).toBe(first)
          rmSync(first)
          expect((await resolver.resolve('asset.txt')).toString()).toBe(first)
        })
        expect((await resolver.resolve('asset.txt')).toString()).toBe(second)
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('isolates overlapping bound contexts and scoped caches', async () => {
    const root = tempRoot()
    try {
      const resolver = new ArDefaultResolver()
      const pathA = touch(join(root, 'a', 'asset.txt'))
      const pathB = touch(join(root, 'b', 'asset.txt'))
      let releaseA!: () => void
      let releaseB!: () => void
      let readyA!: () => void
      let readyB!: () => void
      const pauseA = new Promise<void>(resolve => { releaseA = resolve })
      const pauseB = new Promise<void>(resolve => { releaseB = resolve })
      const startedA = new Promise<void>(resolve => { readyA = resolve })
      const startedB = new Promise<void>(resolve => { readyB = resolve })

      const run = (name: string, pause: Promise<void>, ready: () => void) => {
        const context = new ArResolverContext(
          new ArDefaultResolverContext([join(root, name)]),
        )
        return new ArResolverContextBinder(context, resolver).run(async () =>
          new ArResolverScopedCache(undefined, resolver).run(async () => {
            const first = await resolver.resolve('asset.txt')
            ready()
            await pause
            const current = resolver.getCurrentContext()
              .get(ArDefaultResolverContext)?.searchPath[0]
            const second = await resolver.resolve('asset.txt')
            return { current, first: first.toString(), second: second.toString() }
          }))
      }

      const a = run('a', pauseA, readyA)
      await startedA
      const b = run('b', pauseB, readyB)
      await startedB
      rmSync(pathA)
      rmSync(pathB)
      releaseA()
      expect(await a).toEqual({ current: join(root, 'a'), first: pathA, second: pathA })
      releaseB()
      expect(await b).toEqual({ current: join(root, 'b'), first: pathB, second: pathB })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
