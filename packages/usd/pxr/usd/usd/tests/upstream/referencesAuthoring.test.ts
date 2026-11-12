// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdReferences.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// E8: reference/payload authoring + SetActive — the UsdReferences /
// UsdPayloads / UsdPrim::SetActive analogs (testUsdReferences authoring
// cases). Read-side reference composition is covered by references.test.ts.
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

const SCENE = `#usda 1.0
(
    defaultPrim = "World"
)
def Xform "World" {
}
`

const ASSET = `#usda 1.0
(
    defaultPrim = "Chair"
)
def Xform "Chair" {
  def Sphere "Seat" {
    double radius = 2
  }
}
`

function setScene() {
  files = { 'scene.usda': SCENE, 'chair.usda': ASSET }
}

describe('reference authoring (UsdReferences)', () => {
  it('addReference composes the asset defaultPrim under the prim, live', async () => {
    setScene()
    const stage = (await Stage.open('scene.usda'))!
    let notices = 0
    onObjectsChanged(stage, () => { notices += 1 })

    const prim = stage.definePrim('/World/Chair1', 'Xform')
    await prim.getReferences().addReference('./chair.usda')

    expect(stage.getPrim('/World/Chair1/Seat')?.typeName).toBe('Sphere')
    expect(stage.getPrim('/World/Chair1/Seat')?.getAttr('radius')?.getValue()).toBe(2)
    expect(notices).toBeGreaterThan(0)
    // arc visible in provenance
    expect(stage.getPropertyStack('/World/Chair1/Seat.radius')[0]?.arc).toBe('reference')
  })

  it('an explicit primPath targets a prim inside the asset', async () => {
    setScene()
    const stage = (await Stage.open('scene.usda'))!
    stage.definePrim('/World/JustSeat', 'Xform')
    await stage.definePrim('/World/JustSeat').getReferences().addReference('./chair.usda', '/Chair/Seat')
    expect(stage.getPrim('/World/JustSeat')?.getAttr('radius')?.getValue()).toBe(2)
  })

  it('two prims can reference the same asset independently', async () => {
    setScene()
    const stage = (await Stage.open('scene.usda'))!
    for (const name of ['A', 'B']) {
      stage.definePrim(`/World/${name}`, 'Xform')
      await stage.definePrim(`/World/${name}`).getReferences().addReference('./chair.usda')
    }
    expect(stage.getPrim('/World/A/Seat')).toBeDefined()
    expect(stage.getPrim('/World/B/Seat')).toBeDefined()
  })

  it('clear() removes authored references', async () => {
    setScene()
    const stage = (await Stage.open('scene.usda'))!
    stage.definePrim('/World/Chair1', 'Xform')
    const refs = stage.definePrim('/World/Chair1').getReferences()
    await refs.addReference('./chair.usda')
    expect(stage.getPrim('/World/Chair1/Seat')).toBeDefined()
    await refs.clear()
    expect(stage.getPrim('/World/Chair1/Seat')).toBeUndefined()
  })

  it('authored references serialize and round-trip through USDA', async () => {
    setScene()
    const stage = (await Stage.open('scene.usda'))!
    stage.definePrim('/World/Chair1', 'Xform')
    await stage.definePrim('/World/Chair1').getReferences().addReference('./chair.usda')

    const text = stage.getRootLayer().toUsda()
    expect(text).toContain('prepend references = @./chair.usda@')

    files['reopened.usda'] = text
    const reopened = (await Stage.open('reopened.usda'))!
    expect(reopened.getPrim('/World/Chair1/Seat')?.getAttr('radius')?.getValue()).toBe(2)
  })

  it('payloads author through the same list-op shape', async () => {
    setScene()
    const stage = (await Stage.open('scene.usda'))!
    stage.definePrim('/World/Chair1', 'Xform')
    await stage.definePrim('/World/Chair1').getPayloads().addReference('./chair.usda')
    expect(stage.getPrim('/World/Chair1/Seat')?.typeName).toBe('Sphere')
    expect(stage.getRootLayer().toUsda()).toContain('prepend payload = @./chair.usda@')
  })
})

describe('SetActive (UsdPrim::SetActive)', () => {
  it('deactivating removes the prim and its subtree; reactivating restores', async () => {
    setScene()
    const stage = (await Stage.open('scene.usda'))!
    stage.definePrim('/World/Chair1', 'Xform')
    await stage.definePrim('/World/Chair1').getReferences().addReference('./chair.usda')

    await stage.definePrim('/World/Chair1').setActive(false)
    expect(stage.getPrim('/World/Chair1')?.isActive).toBe(false)
    expect(stage.getPrim('/World/Chair1/Seat')).toBeUndefined()

    await stage.definePrim('/World/Chair1').setActive(true)
    expect(stage.getPrim('/World/Chair1')?.isActive).toBe(true)
    expect(stage.getPrim('/World/Chair1/Seat')).toBeDefined()
  })
})
