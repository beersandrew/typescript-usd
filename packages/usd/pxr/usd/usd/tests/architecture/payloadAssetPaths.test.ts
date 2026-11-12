// Ported from OpenUSD 26.11.1: pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Asset paths authored in layers that a payload load (or another awaited
// recomposition) brings in after open resolve like those present at open:
// UsdStage::_MakeResolvedAssetPaths (stage.cpp:804-847) resolves against the
// winning layer at Get; the browser port resolves ahead (stage.ts
// _prepareAssetPaths), so each awaited recomposition must prepare them too.
import { _setResolverForTest } from 'typescript-usd/usd/_internal'
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage, StageLoadRules } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> {
    const name = assetPath.split('/').pop() ?? assetPath
    return new ArResolvedPath(files[name] === undefined ? '' : assetPath)
  }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    const text = files[path.toString().split('/').pop() ?? path.toString()]
    return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text))
  }
}

beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
  files = {
    'scene.usda': '#usda 1.0\ndef Scope "A" (payload = @./one.usda@</A>) {}\n',
    'one.usda': '#usda 1.0\ndef Shader "A"\n{\n    asset inputs:file = @./tex.png@\n}\n',
    'tex.png': 'png',
  }
})

const resolved = (stage: Stage) =>
  (stage.getPrim('/A')!.getAttr('inputs:file')!.getValue() as { getResolvedPath(): string }).getResolvedPath()

describe('asset paths in layers loaded after open', () => {
  it('resolve the same as when loaded at open', async () => {
    const eager = (await Stage.open('scene.usda'))!
    expect(resolved(eager)).not.toBe('')
    const lazy = (await Stage.open('scene.usda', { loadPayloads: false }))!
    await lazy.loadAndUnload(['/A'], [])
    expect(resolved(lazy)).toBe(resolved(eager))
  })
  it('resolve after setLoadRules loads the payload', async () => {
    const lazy = (await Stage.open('scene.usda', { loadPayloads: false }))!
    await lazy.setLoadRules(StageLoadRules.loadAll())
    expect(resolved(lazy)).not.toBe('')
  })
})
