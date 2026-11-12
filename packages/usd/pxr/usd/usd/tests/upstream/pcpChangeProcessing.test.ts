// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/testenv/testUsdChangeProcessing.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// OpenUSD pxr/usd/usd/stage.cpp change processing: a composition pass observes
// one stable PcpPrimIndex namespace even when authored layer notices arrive
// while asynchronous asset opens are completing.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

const ROOT = `#usda 1.0
def Xform "World" { def Xform "Set" {}
}
`
const PERFORMANCE = `#usda 1.0
(defaultPrim = "Troupe")
def Xform "Troupe" {
  def Xform "Macbeth" (references = @./player.usda@) {}
  def Xform "Seyton" (references = @./player.usda@) {}
  def Xform "Messenger" (references = @./player.usda@) {}
}
`
const PLAYER = `#usda 1.0
(defaultPrim = "Player")
def Xform "Player" { def Mesh "Body" { point3f[] points = [] ; }
}
`
describe('testUsdChangeProcessing — Pcp stage change processing', () => {
  it('does not discover an unindexed child when a layer changes during an async prim-index pass', async () => {
    let releaseAsset!: () => void
    let assetOpenStarted!: () => void
    const release = new Promise<void>(resolve => { releaseAsset = resolve })
    const started = new Promise<void>(resolve => { assetOpenStarted = resolve })
    const files: Record<string, string> = { 'root.usda': ROOT, 'performance.usda': PERFORMANCE, 'player.usda': PLAYER }
    class DelayedResolver extends ArResolver {
      async resolve(path: string): Promise<ArResolvedPath> { return new ArResolvedPath(files[path.split('/').pop()!] === undefined ? '' : path) }
      async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
        const name = path.toString().split('/').pop()!
        if (name === 'performance.usda') { assetOpenStarted(); await release }
        const source = files[name]
        return source === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(source))
      }
    }

    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(new DelayedResolver()) }))!
    const adding = stage.definePrim('/World/Troupe', 'Xform').getReferences().addReference('./performance.usda')
    await started
    // The root index has already supplied its child list and composition is
    // awaiting the referenced child's layer. This layer edit must schedule the
    // next pass, not alter the namespace being flattened by the current pass.
    stage.definePrim('/World/LateArrival', 'Xform')
    releaseAsset()
    await adding
    await stage.flushChanges()

    expect(stage.getPrim('/World/Troupe/Macbeth/Body')).toBeDefined()
    expect(stage.getPrim('/World/LateArrival')).toBeDefined()
  })

})
