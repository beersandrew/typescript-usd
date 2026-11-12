import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// E2: live sublayer authoring — author the root layer's subLayers on an open
// stage, recompose in place (same Stage identity), and notify listeners with
// a diffed ObjectsChanged notice (UsdNotice::ObjectsChanged analog).

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

const ROOT = `#usda 1.0
(
    subLayers = [@./a.usda@, @./b.usda@]
)
def Xform "World" {
  def Sphere "Ball" {
  }
}
`

const LAYER_A = `#usda 1.0
over "World" {
  over "Ball" {
    double radius = 1
  }
}
`

const LAYER_B = `#usda 1.0
over "World" {
  over "Ball" {
    double radius = 2
  }
}
`

const LAYER_C = `#usda 1.0
over "World" {
  def Cube "Extra" {
    double size = 7
  }
}
`

function setScene() {
  files = { 'root.usda': ROOT, 'a.usda': LAYER_A, 'b.usda': LAYER_B, 'c.usda': LAYER_C }
}

const radius = (stage: Stage) =>
  stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()

describe('testUsdObjectsChangedSummarysSublayerOps — live sublayer authoring', () => {
  it('reordering sublayers updates composed values on the SAME stage object', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const before = stage
    expect(radius(stage)).toBe(1)   // a.usda is strongest

    await stage.setSubLayerPaths(['./b.usda', './a.usda'])

    expect(stage).toBe(before)
    expect(radius(stage)).toBe(2)   // b.usda now strongest
    expect(stage.getSubLayerPaths()).toEqual(['./b.usda', './a.usda'])
  })

  it('reordering emits a changedInfo notice for the affected property', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const notices: ObjectsChangedSummary[] = []
    onObjectsChanged(stage, n => notices.push(n))

    await stage.setSubLayerPaths(['./b.usda', './a.usda'])

    // OpenUSD v26.08 oracle: the reorder is reported as removing and
    // re-adding both sublayers, so the property specs resync and their
    // inert prim specs are info-only changes.
    expect(notices).toHaveLength(1)
    expect(notices[0]!.resyncedPaths).toEqual(['/World/Ball.radius'])
    expect(notices[0]!.changedInfoOnlyPaths).toEqual(['/', '/World', '/World/Ball'])
  })

  it('insertSubLayer adds prims and emits a resync for them', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const notices: ObjectsChangedSummary[] = []
    onObjectsChanged(stage, n => notices.push(n))

    await stage.insertSubLayer('./c.usda')

    expect(stage.getPrim('/World/Extra')?.getAttr('size')?.getValue()).toBe(7)
    expect(notices[0]!.resyncedPaths).toContain('/World/Extra')
  })

  it('removeSubLayer removes its prims and emits a resync', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    await stage.insertSubLayer('./c.usda')
    expect(stage.has('/World/Extra')).toBe(true)

    const notices: ObjectsChangedSummary[] = []
    const unsubscribe = onObjectsChanged(stage, n => notices.push(n))
    await stage.removeSubLayer(0)

    expect(stage.has('/World/Extra')).toBe(false)
    expect(notices[0]!.resyncedPaths).toContain('/World/Extra')

    unsubscribe()
    await stage.insertSubLayer('./c.usda')
    expect(notices).toHaveLength(1)   // unsubscribed — no further notices
  })

  it('sublayer offsets author and retime sublayer time samples', async () => {
    files = {
      'root.usda': `#usda 1.0
(
    subLayers = [@./anim.usda@]
)
def Xform "W" {
}
`,
      'anim.usda': `#usda 1.0
over "W" {
  double height = 0
  double height.timeSamples = { 0: 0, 10: 10 }
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const at = (t: number) => stage.getPrim('/W')?.getAttr('height')?.getValueAtTime(t)
    expect(at(10)).toBe(10)

    await stage.setSubLayerPaths(['./anim.usda'], [{ offset: 5, scale: 1 }])
    expect(at(15)).toBe(10)   // samples shifted by +5
  })

  it('muting also reports through ObjectsChanged', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const notices: ObjectsChangedSummary[] = []
    onObjectsChanged(stage, n => notices.push(n))

    await stage.muteLayer('./a.usda')

    expect(radius(stage)).toBe(2)
    // OpenUSD v26.08 oracle.
    expect(notices).toHaveLength(1)
    expect(notices[0]!.resyncedPaths).toEqual(['/World/Ball.radius'])
    expect(notices[0]!.changedInfoOnlyPaths).toEqual(['/World', '/World/Ball'])
  })
})
