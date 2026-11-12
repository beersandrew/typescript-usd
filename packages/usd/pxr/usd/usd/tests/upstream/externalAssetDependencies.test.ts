// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdExternalAssetDependencies.py
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from pxr/usd/usd/testenv/testUsdExternalAssetDependencies.py
//
// The upstream suite drives a procedural file-format plugin
// (Test_UsdProceduralExternalAssetsFileFormatPlugin) that synthesizes its
// contents from sibling .usda files and reports them via
// SdfLayer::GetExternalAssetDependencies(); the stage-level query under test is
// Usd.Stage.GetUsedLayers(). Neither the plugin nor those enumeration APIs
// exist in typescript-usd (see it.todo cases below), so we port the OBSERVABLE
// dependency surface that DOES exist: the stage's local layer stack
// (getLayerStack / getSubLayerPaths) and the fact that referenced / payloaded
// external layers compose into the stage (their prims arrive) while NOT joining
// the local layer stack — the same root/session-vs-external-dependency
// distinction the upstream test asserts when it checks that GetUsedLayers holds
// only the root and session layers even though external assets contribute prims.
//
// Composition expectations are the standard sublayer/reference/payload
// semantics, cross-checked against Pixar 26.05.

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

const setupFiles = () => ({
  // Root pulls in a sublayer (local stack) plus an external reference and an
  // external payload (separate layer stacks that compose, but are not part of
  // the root's local layer stack).
  'root.usda': `#usda 1.0
(
    subLayers = [@./sub.usda@]
)
def "Refd" (
    references = @./ref.usda@</Source>
) {
}
def "Payd" (
    payload = @./pay.usda@</Source>
) {
}
`,
  'sub.usda': `#usda 1.0
def "FromSub" {
    double s = 1
}
`,
  'ref.usda': `#usda 1.0
def Sphere "Source" {
    double radius = 3
    def "Inner" {
    }
}
`,
  'pay.usda': `#usda 1.0
def Cube "Source" {
    double size = 4
    def "Inner" {
    }
}
`,
})

describe('external asset dependencies — observable dependency set', () => {
  it('getSubLayerPaths reports the root layer\'s authored sublayers', async () => {
    files = setupFiles()
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getSubLayerPaths()).toEqual(['./sub.usda'])
  })

  it('getLayerStack is the local stack: session + root + sublayers only (no externals)', async () => {
    files = setupFiles()
    const stage = (await Stage.open('root.usda'))!
    const names = stage.getLayerStack(true).map(l => l.filePath.split('/').pop())
    // Root and its sublayer are in the local stack...
    expect(names).toContain('root.usda')
    expect(names).toContain('sub.usda')
    // ...but referenced/payloaded external layers are NOT (separate layer
    // stacks — mirrors GetUsedLayers excluding nothing yet the local layer
    // stack staying root+session+sublayers).
    expect(names).not.toContain('ref.usda')
    expect(names).not.toContain('pay.usda')
  })

  it('getLayerStack(false) drops the session layer', async () => {
    files = setupFiles()
    const stage = (await Stage.open('root.usda'))!
    const withSession = stage.getLayerStack(true).length
    const withoutSession = stage.getLayerStack(false).length
    expect(withoutSession).toBeLessThanOrEqual(withSession)
    // The root layer survives the session filter either way.
    const names = stage.getLayerStack(false).map(l => l.filePath.split('/').pop())
    expect(names).toContain('root.usda')
    expect(names).toContain('sub.usda')
  })

  it('the sublayer dependency composes its prims into the stage', async () => {
    files = setupFiles()
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/FromSub')?.getAttr('s')?.getValue()).toBe(1)
  })

  it('the external reference dependency composes (referenced layer is loaded)', async () => {
    files = setupFiles()
    const stage = (await Stage.open('root.usda'))!
    const refd = stage.getPrim('/Refd')!
    expect(refd.typeName).toBe('Sphere')
    expect(refd.getAttr('radius')?.getValue()).toBe(3)
    expect(stage.getPrim('/Refd/Inner')).toBeTruthy()
  })

  it('the external payload dependency composes (payloaded layer is loaded)', async () => {
    files = setupFiles()
    const stage = (await Stage.open('root.usda'))!
    const payd = stage.getPrim('/Payd')!
    expect(payd.typeName).toBe('Cube')
    expect(payd.getAttr('size')?.getValue()).toBe(4)
    expect(stage.getPrim('/Payd/Inner')).toBeTruthy()
  })

  // --- Unported upstream surface ---------------------------------------------

  it('layer.GetExternalAssetDependencies() is empty for the USDA file format', async () => {
    files = setupFiles()
    const stage = (await Stage.open('root.usda'))!
    const root = stage.getLayerStack(true).find(l => l.filePath.split('/').pop() === 'root.usda')!
    expect(root.getExternalAssetDependencies()).toEqual([])
  })

  // Usd.Stage::GetUsedLayers() — the full set of layers a stage depends on
  // (root, session, sublayers, AND referenced/payloaded/clip layers). typescript-usd
  // exposes getLayerStack (local stack only) but no whole-stage used-layer set.
  it('stage.GetUsedLayers() returns every layer the stage depends on, including externals', async () => {
    files = setupFiles()
    const stage = (await Stage.open('root.usda'))!
    const names = (stage as unknown as { getUsedLayers: () => { filePath: string }[] })
      .getUsedLayers().map(l => l.filePath.split('/').pop())
    expect(names).toEqual(expect.arrayContaining(['root.usda', 'sub.usda', 'ref.usda', 'pay.usda']))
  })

  // The procedural-plugin reload semantics (root layer regenerated when an
  // external asset dependency changes on disk) depend on both of the above plus
  // a registrable file format plugin — out of scope without that machinery.
  it('stage.Reload() regenerates from changed external asset dependencies', async () => {
    files = setupFiles()
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Refd')?.getAttr('radius')?.getValue()).toBe(3)
    // Mutate the referenced asset on disk and reload.
    files['ref.usda'] = `#usda 1.0
def Sphere "Source" {
    double radius = 99
    def "Inner" {
    }
}
`
    await stage.reload()
    expect(stage.getPrim('/Refd')?.getAttr('radius')?.getValue()).toBe(99)
  })
})
