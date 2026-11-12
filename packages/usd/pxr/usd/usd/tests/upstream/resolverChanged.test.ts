// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdResolverChanged.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the registered testUsdResolverChanged tranche from
// pxr/usd/usd/testenv/testUsdResolverChanged.cpp. The fixture is expressed
// through the private browser host-context adapter in place of its compiled
// test resolver plugin; resync and context-affinity semantics are unchanged.

import { describe, expect, it } from 'vitest'
import { Asset as ArAsset, InMemoryAsset as ArInMemoryAsset, ResolvedPath as ArResolvedPath, Resolver as ArResolver } from 'typescript-usd/ar'
import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { Stage } from '../../src/index.ts'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

class VersionResolver extends ArResolver {
  version = 1
  private readonly root = enc(`#usda 1.0
def Xform "World" {
  def Xform "Model" (
    references = @child.usda@</Model>
  ) {}
  def Scope "Stable" {}
}
`)
  private readonly children = new Map([
    ['/v1/child.usda', enc("#usda 1.0\ndef Xform \"Model\" { def Scope \"One\" {} \n}\n")],
    ['/v2/child.usda', enc("#usda 1.0\ndef Xform \"Model\" { def Scope \"Two\" {} \n}\n")],
  ])

  async resolve(path: string): Promise<ArResolvedPath> {
    if (path === 'root.usda') return new ArResolvedPath(path)
    if (path.endsWith('child.usda')) return new ArResolvedPath(`/v${this.version}/child.usda`)
    return new ArResolvedPath()
  }

  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    const value = path.toString()
    if (value === 'root.usda') return new ArInMemoryAsset(this.root)
    const bytes = this.children.get(value)
    return bytes ? new ArInMemoryAsset(bytes) : undefined
  }
}

describe('UsdStage resolver-change lifecycle', () => {
  it('re-resolves affected Pcp layer stacks without touching another context', async () => {
    const resolver = new VersionResolver()
    const context = _resolverContextForResolver(resolver)
    const stage = (await Stage.open('root.usda', { resolverContext: context }))!

    const unrelatedResolver = new VersionResolver()
    const unrelatedContext = _resolverContextForResolver(unrelatedResolver)
    const unrelated = (await Stage.open('root.usda', { resolverContext: unrelatedContext }))!

    expect(stage.has('/World/Model/One')).toBe(true)
    expect(stage.has('/World/Model/Two')).toBe(false)

    const notices: ObjectsChangedSummary[] = []
    const unrelatedNotices: ObjectsChangedSummary[] = []
    onObjectsChanged(stage, notice => notices.push(notice))
    onObjectsChanged(unrelated, notice => unrelatedNotices.push(notice))

    resolver.version = 2
    resolver.refreshContext(context)
    await stage.flushChanges()
    await unrelated.flushChanges()

    expect(stage.has('/World/Model/One')).toBe(false)
    expect(stage.has('/World/Model/Two')).toBe(true)
    expect(stage.has('/World/Stable')).toBe(true)
    expect(unrelated.has('/World/Model/One')).toBe(true)
    expect(notices).toHaveLength(1)
    expect(notices[0]!.resyncedPaths).toEqual(['/World/Model'])
    expect(notices[0]!.resolvedAssetPathsResyncedPaths).toEqual(['/'])
    expect(unrelatedNotices).toEqual([])
  })
})
