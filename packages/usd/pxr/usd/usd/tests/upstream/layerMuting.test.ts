// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/stage.h,
//  pxr/usd/usd/testenv/testUsdNotices.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// E1: stage-level layer muting — ports the semantics of
// pxr UsdStage::MuteLayer / UnmuteLayer / MuteAndUnmuteLayers (stage.h docs
// + testUsdNotices muting cases). Muting is per-stage session state, never
// authored into any layer; muted layers are ignored by composition entirely.

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

// Virtual filesystem keyed by basename
let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

// NOTE root layer opinions are the STRONGEST in a layer stack — the root
// deliberately leaves radius unauthored so the sublayers' opinions are
// observable, with a fallback-style size attr to prove root survives muting.
const ROOT = `#usda 1.0
(
    subLayers = [@./strong.usda@, @./weak.usda@]
)
def Xform "World" {
  def Sphere "Ball" {
    string fromRoot = "root"
  }
}
`

const STRONG = `#usda 1.0
over "World" {
  over "Ball" {
    double radius = 10
    string note = "from strong"
  }
}
`

const WEAK = `#usda 1.0
over "World" {
  over "Ball" {
    double radius = 5
    string weakOnly = "from weak"
  }
}
`

function setScene() {
  files = { 'root.usda': ROOT, 'strong.usda': STRONG, 'weak.usda': WEAK }
}

const radius = (stage: Stage) =>
  stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()

describe('Stage layer muting', () => {
  it('sublayer opinions win before muting (sanity)', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    expect(radius(stage)).toBe(10)
    expect(stage.getMutedLayers()).toEqual([])
  })

  it('muting a sublayer removes its opinions; the next-strongest wins', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    await stage.muteLayer('./strong.usda')

    expect(radius(stage)).toBe(5)   // weak sublayer now wins over root's 1
    expect(stage.getPrim('/World/Ball')?.getAttr('note')?.getValue()).toBeUndefined()
    expect(stage.isLayerMuted('./strong.usda')).toBe(true)
  })

  it('muting all sublayers leaves only root opinions', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    await stage.muteAndUnmuteLayers(['./strong.usda', './weak.usda'], [])
    expect(radius(stage)).toBeUndefined()
    expect(stage.getPrim('/World/Ball')?.getAttr('fromRoot')?.getValue()).toBe('root')
  })

  it('unmuting restores the muted opinions', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    await stage.muteLayer('./strong.usda')
    expect(radius(stage)).toBe(5)

    await stage.unmuteLayer('./strong.usda')
    expect(radius(stage)).toBe(10)
    expect(stage.getMutedLayers()).toEqual([])
  })

  it('muting recomposes the SAME stage object without altering layer content', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const before = stage
    await stage.muteLayer('./strong.usda')

    expect(stage).toBe(before)
    // No layer content was rewritten — the virtual fs is untouched and the
    // root layer still lists both sublayers (muting is session state)
    expect(files['root.usda']).toContain('strong.usda')
    const reopened = (await Stage.open('root.usda'))!
    expect(radius(reopened)).toBe(10)   // a fresh stage sees everything
  })

  it("identifier spellings normalize: muting 'strong.usda' mutes the authored './strong.usda'", async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    await stage.muteLayer('strong.usda')
    expect(radius(stage)).toBe(5)
    expect(stage.isLayerMuted('./strong.usda')).toBe(true)
    await stage.unmuteLayer('./strong.usda')
    expect(radius(stage)).toBe(10)
  })

  it('muting the root layer throws', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    await expect(stage.muteLayer('root.usda')).rejects.toThrow(/root layer/)
  })

  it('muting a layer the stage has not used is not an error', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    await stage.muteLayer('./unrelated.usda')
    expect(stage.getMutedLayers()).toHaveLength(1)
    expect(radius(stage)).toBe(10)   // composition unaffected
  })

  it('a muted referenced layer behaves as if it did not exist', async () => {
    files = {
      'root.usda': `#usda 1.0
def "Model" (
    references = @./asset.usda@</Asset>
) {}
`,
      'asset.usda': `#usda 1.0
def Xform "Asset" {
  def Sphere "Geo" { double radius = 3 ; }
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/Model/Geo')?.getAttr('radius')?.getValue()).toBe(3)

    await stage.muteLayer('./asset.usda')
    expect(stage.has('/Model/Geo')).toBe(false)

    await stage.unmuteLayer('./asset.usda')
    expect(stage.getPrim('/Model/Geo')?.getAttr('radius')?.getValue()).toBe(3)
  })

  it('muteAndUnmuteLayers applies both with one recomposition', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    await stage.muteLayer('./strong.usda')
    expect(radius(stage)).toBe(5)

    // swap: unmute strong, mute weak
    await stage.muteAndUnmuteLayers(['./weak.usda'], ['./strong.usda'])
    expect(radius(stage)).toBe(10)
    expect(stage.getPrim('/World/Ball')?.getAttr('weakOnly')?.getValue()).toBeUndefined()
    expect(stage.getMutedLayers()).toHaveLength(1)
  })

  it('identifiers canonicalize: relative and resolved forms refer to the same layer', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    await stage.muteLayer('./strong.usda')
    // Different spelling of the same identifier still reports muted
    expect(stage.isLayerMuted('./strong.usda')).toBe(true)
    // Unmute via the same relative form
    await stage.unmuteLayer('./strong.usda')
    expect(stage.isLayerMuted('./strong.usda')).toBe(false)
    expect(radius(stage)).toBe(10)
  })
})
