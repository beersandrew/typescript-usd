// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/testenv/testUsdStage.py
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// E4: session layers + edit targets on opened stages — UsdStage parity:
// the session layer is the strongest layer in the local stack and is never
// saved with the asset; the default edit target is the ROOT layer; apps opt
// into non-destructive editing via setEditTarget(getSessionLayer()).

import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

const reference = readOracleFixture(fileURLToPath(
  new URL('../fixtures/sessionTranslationNotice/reference.json', import.meta.url)))

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

const ROOT = `#usda 1.0
def Xform "World"
{
    def Sphere "Ball"
    {
        double radius = 5
    }
}
`

function setScene() { files = { 'root.usda': ROOT } }

describe('testUsdStage — edit targets on opened stages', () => {
  it('opened stages are writable; default edit target is the root layer', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getEditTarget().getLayer()).toBe(stage.getRootLayer())
    // authoring works and lands in the root layer
    stage.definePrim('/World/Ball').attr('radius').set(9)
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(9)
    expect(stage.getEditTarget().getLayer()!.getField('/World/Ball.radius', 'default')).toBe(9)
    // the session layer stays empty
    expect(stage.getSessionLayer().getField('/World/Ball.radius', 'default')).toBeUndefined()
  })

  it('session-layer edits win over root opinions and never touch the file layer', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const session = stage.getSessionLayer()
    stage.setEditTarget(session)

    stage.definePrim('/World/Ball').attr('radius').set(42)

    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(42)
    expect(session.getField('/World/Ball.radius', 'default')).toBe(42)
    // the opened root layer is untouched
    const root = (await Stage.open('root.usda'))!
    expect(root.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(5)
  })

  it('session opinions survive recomposition as the strongest local layer', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    stage.setEditTarget(stage.getSessionLayer())
    stage.definePrim('/World/Ball').attr('radius').set(42)

    // Force a full recompose (muting machinery) — the session opinion,
    // being part of the local layer stack, must persist and stay strongest
    await stage.muteLayer('./unrelated.usda')
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(42)
  })

  it('retracting a session opinion restores the file value on recompose', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const session = stage.getSessionLayer()
    stage.setEditTarget(session)
    stage.definePrim('/World/Ball').attr('radius').set(42)
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(42)

    // Undo = opinion retraction: clear the session field, recompose
    session.setField('/World/Ball.radius', 'default', undefined)
    await stage.muteAndUnmuteLayers(['./x.usda'], [])   // trigger recompose
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(5)
  })

  it('setEditTarget rejects layers outside the local layer stack', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    const { Layer } = await import('typescript-usd/usd/_internal')
    expect(() => stage.setEditTarget(Layer.createAnonymous())).toThrow(/local layer stack/)
  })

  it('authoring emits ObjectsChanged notices (live-app loop without recompose)', async () => {
    setScene()
    const stage = (await Stage.open('root.usda'))!
    stage.setEditTarget(stage.getSessionLayer())
    const notices: ObjectsChangedSummary[] = []
    onObjectsChanged(stage, n => notices.push(n))

    stage.definePrim('/World/Ball').attr('radius').set(7)
    stage.definePrim('/World/New', 'Sphere')
    // Change processing is synchronous: each edit sends its notices before
    // returning. Fresh v26.11.1 capture: fixtures/sessionTranslationNotice
    // (editTargetNotices; FIXTURES.md). A new property spec resyncs even when
    // it overrides a composed property (usd/stage.cpp:4622-4632); its value
    // is a separate info-only change.
    expect(notices.map(n => ({
      resyncedPaths: n.resyncedPaths, changedInfoOnlyPaths: n.changedInfoOnlyPaths,
    }))).toEqual(reference.editTargetNotices)
  })
})

// E7: edit targets over the full local layer stack (UsdStage::GetLayerStack
// + SetEditTarget on sublayers), with strength-correct value resolution —
// authoring to a weak layer must not clobber a stronger layer's opinion.
const LAYERED_ROOT = `#usda 1.0
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
    double radius = 10
  }
}
`
const LAYER_B = `#usda 1.0
over "World" {
  over "Ball" {
    double radius = 5
  }
}
`

function setLayeredScene() {
  files = { 'root.usda': LAYERED_ROOT, 'a.usda': LAYER_A, 'b.usda': LAYER_B }
}

const names = (layers: { filePath: string }[]) =>
  layers.map(l => l.filePath.split('/').pop() ?? l.filePath)

describe('edit targets on the full local layer stack (E7)', () => {
  it('getLayerStack returns session, root, then sublayers strongest-first', async () => {
    setLayeredScene()
    const stage = (await Stage.open('root.usda'))!
    const stack = stage.getLayerStack()
    expect(stack[0]).toBe(stage.getSessionLayer())
    expect(stack[1]).toBe(stage.getRootLayer())
    expect(names(stack).slice(1)).toEqual(['root.usda', 'a.usda', 'b.usda'])
    expect(stage.getLayerStack(false)).not.toContain(stage.getSessionLayer())
  })

  it('a sublayer can be the edit target; writes land in that layer only', async () => {
    setLayeredScene()
    const stage = (await Stage.open('root.usda'))!
    const b = stage.getLayerStack()[3]!
    stage.setEditTarget(b)
    stage.definePrim('/World/Ball').attr('radius').set(1)
    expect(b.getField('/World/Ball.radius', 'default')).toBe(1)
    expect(stage.getRootLayer().getField('/World/Ball.radius', 'default')).toBeUndefined()
  })

  it('authoring to a weak layer does not clobber a stronger opinion', async () => {
    setLayeredScene()
    const stage = (await Stage.open('root.usda'))!
    const [, , a, b] = stage.getLayerStack()
    stage.setEditTarget(b!)
    stage.definePrim('/World/Ball').attr('radius').set(1)
    // a.usda's radius=10 still wins the composed value
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(10)
    // ...but the weak opinion is in the property stack, in strength order
    const stack = stage.getPropertyStack('/World/Ball.radius')
    expect(names(stack.map(e => ({ filePath: e.layerIdentifier })))).toEqual(['a.usda', 'b.usda'])
    // authoring to the strong layer changes the resolved value
    stage.setEditTarget(a!)
    stage.definePrim('/World/Ball').attr('radius').set(20)
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(20)
  })

  it('root-layer authoring does not clobber a session opinion', async () => {
    setLayeredScene()
    const stage = (await Stage.open('root.usda'))!
    stage.setEditTarget(stage.getSessionLayer())
    stage.definePrim('/World/Ball').attr('radius').set(42)
    stage.setEditTarget(stage.getRootLayer())
    stage.definePrim('/World/Ball').attr('radius').set(7)
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(42)
  })

  it('a new property authored to a weak layer resolves and shows provenance', async () => {
    setLayeredScene()
    const stage = (await Stage.open('root.usda'))!
    const b = stage.getLayerStack()[3]!
    stage.setEditTarget(b)
    stage.definePrim('/World/Ball').createAttr('myAttr', 3.5)
    expect(stage.getPrim('/World/Ball')?.getAttr('myAttr')?.getValue()).toBe(3.5)
    const stack = stage.getPropertyStack('/World/Ball.myAttr')
    expect(stack).toHaveLength(1)
    expect(stack[0]?.layerIdentifier).toBe('b.usda')
  })

  it('a new prim authored to a sublayer composes immediately', async () => {
    setLayeredScene()
    const stage = (await Stage.open('root.usda'))!
    const b = stage.getLayerStack()[3]!
    stage.setEditTarget(b)
    stage.definePrim('/World/Extra', 'Scope')
    expect(stage.getPrim('/World/Extra')?.typeName).toBe('Scope')
    expect(stage.getChildPrimPaths('/World')).toContain('/World/Extra')
  })

  it('authored opinions carry the declared attribute type (UsdAttribute::Set)', async () => {
    setLayeredScene()
    const stage = (await Stage.open('root.usda'))!
    const b = stage.getLayerStack()[3]!
    stage.setEditTarget(b)
    // 99 is integral, but radius is declared `double` in a.usda — the spec
    // must say double or real usdchecker flags AttributeTypeMismatch.
    stage.definePrim('/World/Ball').attr('radius').set(99)
    expect(b.getField('/World/Ball.radius', 'typeName')).toBe('double')
    expect(b.toUsda()).toContain('double radius = 99')
  })

  it('layer identity and edits survive recomposition (per-stage registry)', async () => {
    setLayeredScene()
    const stage = (await Stage.open('root.usda'))!
    const a = stage.getLayerStack()[2]!
    stage.setEditTarget(a)
    stage.definePrim('/World/Ball').attr('radius').set(20)

    // Recompose twice (mute + unmute an unrelated layer)
    await stage.muteLayer('./b.usda')
    await stage.unmuteLayer('./b.usda')

    // Same Layer object, edit preserved, value still resolved from it
    expect(stage.getLayerStack()[2]).toBe(a)
    expect(stage.getEditTarget().getLayer()).toBe(a)
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(20)
  })
})
