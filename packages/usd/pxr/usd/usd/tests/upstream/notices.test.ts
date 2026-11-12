// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdNotices.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/usd/testenv/testUsdNotices.py (registered
// as testUsdNotices), with its testUsdNotices.testenv fixtures. The
// usda/usdc format loop runs once: typescript-usd in-memory stages are usda.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Notice as TfNotice, type NoticeKey } from 'typescript-usd/tf'
import { Knot as TsKnot, Spline as TsSpline } from 'typescript-usd/ts'
import { Notice as UsdNotice, Stage, StagePopulationMask } from 'typescript-usd/usd'

const TESTENV = path.join(
  fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdNotices.testenv')

type Callback = (notice: UsdNotice.ObjectsChanged, sender: object | undefined) => void

// ExpectedNotice: register for the stage's ObjectsChanged notices while fn
// runs and require at least one.
async function expectedNotice(
  stage: Stage, callback: Callback, fn: () => unknown,
): Promise<void> {
  let received = false
  const key = TfNotice.Register(UsdNotice.ObjectsChanged, (notice, sender) => {
    expect(notice.getStage()).toBe(stage)
    callback(notice, sender)
    received = true
  }, stage)
  await fn()
  key.revoke()
  expect(received, 'Did not receive notice').toBe(true)
}

const paths = (range: Iterable<string>): string[] => [...range]

// Stage.Open(layer).
const openLayer = (layer: Layer): Promise<Stage> =>
  Stage.openMasked(layer, StagePopulationMask.all())

describe('testUsdNotices', () => {
  let changeCount = 0
  let contentsCount = 0
  let objectsCount = 0
  let editTargetsCount = 0
  let layerMutingCount = 0
  const resetCounters = (): void => {
    changeCount = 0
    contentsCount = 0
    objectsCount = 0
    editTargetsCount = 0
    layerMutingCount = 0
  }
  beforeEach(resetCounters)

  it('test_Basics', async () => {
    const keys: NoticeKey[] = [
      TfNotice.registerGlobally(UsdNotice.StageContentsChanged, () => {
        changeCount++
        contentsCount++
      }),
      TfNotice.registerGlobally(UsdNotice.ObjectsChanged, () => {
        changeCount++
        objectsCount++
      }),
      TfNotice.registerGlobally(UsdNotice.StageEditTargetChanged, () => {
        changeCount++
        editTargetsCount++
      }),
      TfNotice.registerGlobally(UsdNotice.LayerMutingChanged, () => {
        changeCount++
        layerMutingCount++
      }),
    ]

    resetCounters()
    const s = Stage.createNew()
    s.definePrim('/Foo')
    expect(changeCount).toBe(2)
    expect(contentsCount).toBe(1)
    expect(objectsCount).toBe(1)
    expect(editTargetsCount).toBe(0)

    resetCounters()
    s.setEditTarget(s.getSessionLayer())
    expect(changeCount).toBe(1)
    expect(contentsCount).toBe(0)
    expect(objectsCount).toBe(0)
    expect(editTargetsCount).toBe(1)

    resetCounters()
    s.getPrim('/Foo')!.setMetadata('comment', '')
    expect(changeCount).toBe(4)
    expect(contentsCount).toBe(2) // Why 2? I expected 1.
    expect(objectsCount).toBe(2) // We get an additional object resync notice
    // when we first drop an over, in addition to the info-only change notice.
    expect(editTargetsCount).toBe(0)

    resetCounters()
    s.getPrim('/Foo')!.setMetadata('comment', 'x')
    // Now that the over(s) have been established, setting a value behaves as
    // expected.
    expect(changeCount).toBe(2)
    expect(contentsCount).toBe(1)
    expect(objectsCount).toBe(1)
    expect(editTargetsCount).toBe(0)

    resetCounters()
    await s.muteAndUnmuteLayers([s.getSessionLayer().identifier], [s.getRootLayer().identifier])
    expect(changeCount).toBe(3)
    expect(objectsCount).toBe(1)
    expect(contentsCount).toBe(1)
    expect(layerMutingCount).toBe(1)

    // no notice should be called
    resetCounters()
    await expect(s.muteAndUnmuteLayers(
      [s.getRootLayer().identifier], [s.getRootLayer().identifier])).rejects.toThrow()
    expect(changeCount).toBe(0)
    expect(objectsCount).toBe(0)
    expect(contentsCount).toBe(0)
    expect(layerMutingCount).toBe(0)

    // testing for payload specific updates previously, load/unload calls
    // didn't trigger notices
    resetCounters()
    expect(objectsCount).toBe(0)
    const payloadBasedStage = (await Stage.open(path.join(TESTENV, 'payload_base.usda')))!

    // the payload will be already loaded since we didn't supply the
    // additional parameter to the stage constructor
    await payloadBasedStage.unload('/Foo')
    expect(objectsCount).toBe(1)
    await payloadBasedStage.load('/Foo')
    expect(objectsCount).toBe(2)

    for (const key of keys) key.revoke()
  })

  it('test_ObjectsChangedNotice', async () => {
    const onResync: Callback = (notice, stage) => {
      const s = stage as Stage
      expect(notice.getStage()).toBe(stage)
      expect(paths(notice.getResyncedPaths())).toEqual(['/Foo'])
      expect(paths(notice.getResolvedAssetPathsResyncedPaths())).toEqual([])
      expect(paths(notice.getChangedInfoOnlyPaths())).toEqual([])
      expect(notice.affectedObject(s.getPrim('/Foo')!)).toBe(true)
      expect(notice.resyncedObject(s.getPrim('/Foo')!)).toBe(true)
      expect(notice.resolvedAssetPathsResynced(s.getPrim('/Foo')!)).toBe(false)
      expect(notice.changedInfoOnly(s.getPrim('/Foo')!)).toBe(false)
    }

    const onUpdate: Callback = (notice, stage) => {
      const s = stage as Stage
      expect(notice.getStage()).toBe(stage)
      expect(paths(notice.getResyncedPaths())).toEqual([])
      expect(paths(notice.getResolvedAssetPathsResyncedPaths())).toEqual([])
      expect(paths(notice.getChangedInfoOnlyPaths())).toEqual(['/Foo'])
      expect(notice.affectedObject(s.getPrim('/Foo')!)).toBe(true)
      expect(notice.affectedObject(s.getPrim('/Foo/Bar')!)).toBe(false)
      expect(notice.resyncedObject(s.getPrim('/Foo')!)).toBe(false)
      expect(notice.resyncedObject(s.getPrim('/Foo/Bar')!)).toBe(false)
      expect(notice.resolvedAssetPathsResynced(s.getPrim('/Foo')!)).toBe(false)
      expect(notice.resolvedAssetPathsResynced(s.getPrim('/Foo/Bar')!)).toBe(false)
      expect(notice.changedInfoOnly(s.getPrim('/Foo')!)).toBe(true)
      expect(notice.changedInfoOnly(s.getPrim('/Foo/Bar')!)).toBe(false)
    }

    const onAssetPathResync: Callback = (notice, stage) => {
      const s = stage as Stage
      expect(notice.getStage()).toBe(stage)
      expect(paths(notice.getResyncedPaths())).toEqual([])
      expect(paths(notice.getResolvedAssetPathsResyncedPaths())).toEqual(['/'])
      expect(paths(notice.getChangedInfoOnlyPaths())).toEqual(['/'])
      expect(notice.affectedObject(s.getPrim('/Foo')!)).toBe(true)
      expect(notice.affectedObject(s.getPrim('/Foo/Bar')!)).toBe(true)
      expect(notice.resyncedObject(s.getPrim('/Foo')!)).toBe(false)
      expect(notice.resyncedObject(s.getPrim('/Foo/Bar')!)).toBe(false)
      expect(notice.resolvedAssetPathsResynced(s.getPrim('/Foo')!)).toBe(true)
      expect(notice.resolvedAssetPathsResynced(s.getPrim('/Foo/Bar')!)).toBe(true)
      expect(notice.changedInfoOnly(s.getPrim('/Foo')!)).toBe(false)
      expect(notice.changedInfoOnly(s.getPrim('/Foo/Bar')!)).toBe(false)
    }

    const s = Stage.createNew()

    let objectsChanged = TfNotice.Register(UsdNotice.ObjectsChanged, onResync, s)
    s.definePrim('/Foo')

    objectsChanged.revoke()
    s.definePrim('/Foo/Bar')

    objectsChanged = TfNotice.Register(UsdNotice.ObjectsChanged, onUpdate, s)
    s.getPrim('/Foo')!.setMetadata('comment', '')

    objectsChanged.revoke()
    objectsChanged = TfNotice.Register(UsdNotice.ObjectsChanged, onAssetPathResync, s)
    s.setMetadata('expressionVariables', { X: 'Y' })

    objectsChanged.revoke()
  })

  it('test_ObjectsChangedNoticeForAttributes', async () => {
    const s = Stage.createNew()
    const prim = s.definePrim('/Foo')

    const onAttributeCreation: Callback = (notice, stage) => {
      const attr = (stage as Stage).getPrim('/Foo')!.getAttr('attr')!
      expect(paths(notice.getResyncedPaths())).toEqual([attr.getPath()])
      expect(paths(notice.getChangedInfoOnlyPaths())).toEqual([])
      expect(notice.affectedObject(attr)).toBe(true)
      expect(notice.resyncedObject(attr)).toBe(true)
      expect(notice.changedInfoOnly(attr)).toBe(false)
    }

    let attr!: ReturnType<typeof prim.createAttribute>
    await expectedNotice(s, onAttributeCreation, () => {
      attr = prim.createAttribute('attr', 'double')
    })

    const onAttributeValueChange = (field: string): Callback => (notice, stage) => {
      const attr = (stage as Stage).getPrim('/Foo')!.getAttr('attr')!
      expect(paths(notice.getResyncedPaths())).toEqual([])
      expect(paths(notice.getChangedInfoOnlyPaths())).toEqual([attr.getPath()])
      expect(notice.affectedObject(attr)).toBe(true)
      expect(notice.resyncedObject(attr)).toBe(false)
      expect(notice.changedInfoOnly(attr)).toBe(true)
      expect(notice.hasChangedFields(attr)).toBe(true)
      expect(notice.getChangedFields(attr)).toEqual([field])
    }

    await expectedNotice(s, onAttributeValueChange('default'), () => {
      attr.set(42)
    })

    await expectedNotice(s, onAttributeValueChange('timeSamples'), () => {
      attr.setTimeSample(1, 42)
    })

    await expectedNotice(s, onAttributeValueChange('spline'), () => {
      const spline = new TsSpline('double')
      spline.setKnot(new TsKnot({ time: 1, value: 42 }))
      attr.setSpline(spline)
    })
  })

  it('test_ObjectsChangedNoticeForRelationships', async () => {
    const s = Stage.createNew()
    const prim = s.definePrim('/Foo')

    const onRelationshipCreation: Callback = (notice, stage) => {
      expect(notice.getStage()).toBe(stage)
      expect(paths(notice.getResyncedPaths())).toEqual(['/Foo.rel'])
      expect(paths(notice.getChangedInfoOnlyPaths())).toEqual([])
      expect(notice.affectedObject('/Foo.rel')).toBe(true)
      expect(notice.resyncedObject('/Foo.rel')).toBe(true)
      expect(notice.changedInfoOnly('/Foo.rel')).toBe(false)
    }

    let objectsChanged = TfNotice.Register(UsdNotice.ObjectsChanged, onRelationshipCreation, s)
    const rel = prim.createRelationship('rel')
    objectsChanged.revoke()

    const onRelationshipTargetChange: Callback = (notice, stage) => {
      expect(notice.getStage()).toBe(stage)
      expect(paths(notice.getResyncedPaths())).toEqual([])
      expect(paths(notice.getChangedInfoOnlyPaths())).toEqual(['/Foo.rel'])
      expect(notice.affectedObject('/Foo.rel')).toBe(true)
      expect(notice.resyncedObject('/Foo.rel')).toBe(false)
      expect(notice.changedInfoOnly('/Foo.rel')).toBe(true)
    }

    objectsChanged = TfNotice.Register(UsdNotice.ObjectsChanged, onRelationshipTargetChange, s)
    rel.addTarget('/Bar')
    objectsChanged.revoke()
  })

  it('test_LayerMutingChange', async () => {
    let expectedResult: { muted: string[]; unmuted: string[] } = { muted: [], unmuted: [] }
    let received = 0
    const s = Stage.createNew()
    const onLayerMutingChange = (notice: UsdNotice.LayerMutingChanged, stage: object | undefined) => {
      received++
      expect(notice.getStage()).toBe(stage)
      expect(notice.getMutedLayers()).toEqual(expectedResult.muted)
      expect(notice.getUnmutedLayers()).toEqual(expectedResult.unmuted)
    }

    // mute session layer and try unmute root layer
    // note that root layer cannot be muted or unmuted
    expectedResult = { muted: [s.getSessionLayer().identifier], unmuted: [] }
    const layerMutingChanged = TfNotice.Register(
      UsdNotice.LayerMutingChanged, onLayerMutingChange, s)
    await s.muteAndUnmuteLayers([s.getSessionLayer().identifier], [s.getRootLayer().identifier])
    expect(received).toBe(1)

    // undo session layer muting and try to mute root layer
    expectedResult = { muted: [], unmuted: [s.getSessionLayer().identifier] }
    await expect(s.muteAndUnmuteLayers(
      [s.getRootLayer().identifier], [s.getSessionLayer().identifier])).rejects.toThrow()

    // test to make sure callback is still called for muting of layers not
    // part of the stage
    const layer1 = Layer.createAnonymous('nonStageLayer.usda')
    expectedResult = { muted: [layer1.identifier], unmuted: [] }
    await s.muteAndUnmuteLayers([layer1.identifier], [])
    expect(received).toBe(2)

    layerMutingChanged.revoke()
  })

  it('test_Reload', async () => {
    const s = Stage.createNew()
    s.definePrim('/Root')

    let received = false
    const onReload: Callback = (notice, sender) => {
      received = true
      expect(notice.getStage()).toBe(s)
      expect(sender).toBe(s)
      expect(paths(notice.getResyncedPaths())).toEqual(['/Root'])
      expect(notice.hasChangedFields('/Root')).toBe(false)
      expect(notice.getChangedFields('/Root')).toEqual([])

      // XXX: The pseudo-root is marked as having info changed because of the
      // didReloadContent bit in the layer changelist. This doesn't seem
      // correct.
      expect(paths(notice.getChangedInfoOnlyPaths())).toEqual(['/'])
      expect(notice.hasChangedFields('/')).toBe(false)
      expect(notice.getChangedFields('/')).toEqual([])
    }

    const key = TfNotice.Register(UsdNotice.ObjectsChanged, onReload, s)
    await s.reload()
    key.revoke()
    expect(received).toBe(true)
  })

  describe('test_InvalidLayerReloadChange', () => {
    let dir: string
    beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'testUsdNotices-')) })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    it('test_InvalidLayerReloadChange', async () => {
      // Create a prim with a reference to a non-existent layer. This should
      // result in a composition error.
      const rootPath = path.join(dir, 'LayerReloadChange.usda')
      writeFileSync(rootPath, '#usda 1.0\n\ndef "ModelReference" (\n' +
        '    prepend references = @./Model.usda@</Model>\n)\n{\n}\n')
      const s = (await Stage.open(rootPath))!

      // Create a new layer at the referenced path and reload the referencing
      // stage. This should cause the layer to be opened and a resync for the
      // referencing prim.
      writeFileSync(path.join(dir, 'Model.usda'), '#usda 1.0\n\nover "Model"\n{\n}\n')

      let receivedNotice = false
      const key = TfNotice.Register(UsdNotice.ObjectsChanged, (notice) => {
        receivedNotice = true
        expect(notice.getStage()).toBe(s)
        expect(paths(notice.getResyncedPaths())).toEqual(['/ModelReference'])
        expect(notice.hasChangedFields('/ModelReference')).toBe(false)
        expect(notice.getChangedFields('/ModelReference')).toEqual([])
        expect(paths(notice.getChangedInfoOnlyPaths())).toEqual([])
      }, s)
      await s.reload()
      key.revoke()

      // Should have received a resync notice and composed the referenced
      // /Model prim into /ModelReference.
      expect(receivedNotice).toBe(true)
      const primStack = s.getPrimStack('/ModelReference')
      expect(primStack[1]?.layerIdentifier).toBe(path.join(dir, 'Model.usda'))
      expect(primStack[1]?.specPath).toBe('/Model')
    })
  })

  it('test_StageVariableExpressionChange', async () => {
    const refLayer = Layer.createAnonymous('.usda')
    refLayer.transferContent(Layer.createInMemory('ref.usda', `#usda 1.0
(
    expressionVariables = {
        string REF = "A"
    }
)

def "Ref"
{
    asset attr = @\`"\${REF}.jpg"\`@
}`))

    const rootLayer = Layer.createAnonymous('.usda')
    rootLayer.transferContent(Layer.createInMemory('root.usda', `#usda 1.0
(
    expressionVariables = {
        string ROOT = "A"
    }
)

def "Test"
{
    asset attr = @\`"\${A}.jpg"\`@
}

def "Ref1" (
    references = @${refLayer.identifier}@</Ref>
)
{
}

def "Ref2" (
    references = @${refLayer.identifier}@</Ref>
)
{
}`))

    const s = await openLayer(rootLayer)

    // Author a change to the expression variables in the root layer stack.
    // This should not send a resync for any objects, but it should send a
    // resolved asset path resync covering the entire stage since there may
    // be asset-valued attributes (that we may have never pulled a value
    // from) that depend on those variables.
    await expectedNotice(s, (notice) => {
      expect(paths(notice.getResyncedPaths())).toEqual([])
      expect(paths(notice.getResolvedAssetPathsResyncedPaths())).toEqual(['/'])
      expect(paths(notice.getChangedInfoOnlyPaths())).toEqual(['/'])
      expect(notice.getChangedFields('/')).toEqual(['expressionVariables'])
    }, () => {
      rootLayer.setField('/', 'expressionVariables', { ROOT: 'B' })
    })

    // Author a change to the expression variables in a referenced layer
    // stack. This should not send a resync for the prim(s) that are
    // referencing that layer, but it should send a resolved asset path resync
    // covering those two prims.
    await expectedNotice(s, (notice) => {
      expect(paths(notice.getResyncedPaths())).toEqual([])
      expect(paths(notice.getResolvedAssetPathsResyncedPaths())).toEqual(['/Ref1', '/Ref2'])

      // XXX:
      // 'expressionVariables' should not show up as changed fields on /Ref1
      // and /Ref2 since that field was actually authored on the pseudo-root
      // of the referenced layer. This is a pre-existing bug involving layer
      // metadata fields that cause resyncs for referencing prims.
      // 'defaultPrim' is another example of such a field.
      expect(paths(notice.getChangedInfoOnlyPaths())).toEqual(['/Ref1', '/Ref2'])
      expect(notice.getChangedFields('/Ref1')).toEqual(['expressionVariables'])
      expect(notice.getChangedFields('/Ref2')).toEqual(['expressionVariables'])
    }, () => {
      refLayer.setField('/', 'expressionVariables', { REF: 'B' })
    })
  })
})
