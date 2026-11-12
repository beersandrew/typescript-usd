// Ported from OpenUSD 26.11.1:
//  pxr/usd/usd/testenv/testUsdObjectsChangedNoticesSublayerOps.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08
// pxr/usd/usd/testenv/testUsdObjectsChangedNoticesSublayerOps.py (registered
// as testUsdObjectsChangedNoticesSublayerOps), with its testenv package.usdz.
// The test runs with the testenv as the working directory, so relative
// identifiers name the fixture.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Notice as TfNotice, type NoticeKey } from 'typescript-usd/tf'
import { Notice as UsdNotice, Stage, StagePopulationMask } from 'typescript-usd/usd'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testUsdObjectsChangedNoticesSublayerOps')

type NoticeDict = Partial<Record<
  'Resynced' | 'ChangedInfoOnly' | 'ResolvedAssetPathsResynced', Record<string, string[]>>>

// Stage.Open(layer).
const openLayer = (layer: Layer): Promise<Stage> =>
  Stage.openMasked(layer, StagePopulationMask.all())

// Sdf.Layer.CreateAnonymous(tag) + ImportFromString(text).
function anonymousLayer(tag: string, text?: string): Layer {
  const layer = Layer.createAnonymous(tag)
  if (text !== undefined) layer.importFromString(text)
  return layer
}

describe('testUsdObjectsChangedNoticesSublayerOps', () => {
  let cwd: string
  beforeAll(() => {
    cwd = process.cwd()
    process.chdir(TESTENV)
  })
  afterAll(() => process.chdir(cwd))

  let objectsChangedNotices: NoticeDict[] = []
  let stageContentsChangedCount = 0
  let noticeKeys: NoticeKey[] = []

  function listenForNotices(stage: Stage): void {
    // Replacing the keys revokes the previous registrations.
    for (const key of noticeKeys) key.revoke()
    // Each ObjectsChanged notice is converted to a dictionary and appended to
    // objectsChangedNotices.
    objectsChangedNotices = []
    const objectsChangedKey = TfNotice.Register(UsdNotice.ObjectsChanged, (notice) => {
      const asDict: NoticeDict = {}
      const byPath = (range: Iterable<string>): Record<string, string[]> =>
        Object.fromEntries([...range].map(p => [p, notice.getChangedFields(p)]))
      if (!notice.getResyncedPaths().empty()) asDict.Resynced = byPath(notice.getResyncedPaths())
      if (!notice.getChangedInfoOnlyPaths().empty()) {
        asDict.ChangedInfoOnly = byPath(notice.getChangedInfoOnlyPaths())
      }
      if (!notice.getResolvedAssetPathsResyncedPaths().empty()) {
        asDict.ResolvedAssetPathsResynced = byPath(notice.getResolvedAssetPathsResyncedPaths())
      }
      objectsChangedNotices.push(asDict)
    }, stage)

    stageContentsChangedCount = 0
    const stageContentsChangedKey = TfNotice.Register(UsdNotice.StageContentsChanged, () => {
      stageContentsChangedCount += 1
    }, stage)
    noticeKeys = [objectsChangedKey, stageContentsChangedKey]
  }

  it('test_InsertPackageSublayer', async () => {
    const stage = Stage.createNew()
    listenForNotices(stage)
    stage.getRootLayer().setSubLayerPaths(['./package.usdz'])
    await stage.flushChanges()
    expect(stageContentsChangedCount).toBe(1)
    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual({ Resynced: { '/': [] } })
  })

  it('test_RemovePackageSublayer', async () => {
    const root = anonymousLayer('root.usda', `#usda 1.0
                                (
                                    subLayers = [@./package.usdz@]
                                )
                            `)
    const stage = await openLayer(root)
    listenForNotices(stage)
    stage.getRootLayer().setSubLayerPaths([])
    await stage.flushChanges()
    expect(stageContentsChangedCount).toBe(1)
    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual({ Resynced: { '/': [] } })
  })

  it('test_MutePackageSublayer', async () => {
    const root = anonymousLayer('root.usda', `#usda 1.0
                                (
                                    subLayers = [@./package.usdz@]
                                )
                            `)
    const stage = await openLayer(root)
    listenForNotices(stage)
    await stage.muteLayer('./package.usdz')
    expect(stageContentsChangedCount).toBe(1)
    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual({ Resynced: { '/': [] } })
  })

  it('test_UnmutePackageSublayer', async () => {
    const stage = Stage.createNew()
    await stage.muteLayer('./package.usdz')
    stage.getRootLayer().setSubLayerPaths(['./package.usdz'])
    await stage.flushChanges()
    listenForNotices(stage)
    await stage.unmuteLayer('./package.usdz')
    expect(stageContentsChangedCount).toBe(1)
    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual({ Resynced: { '/': [] } })
  })

  it('test_muteEmptyLayer', async () => {
    // Tests that a StageContentsChanged and an empty ObjectsChanged notice
    // are triggered when an empty layer is muted
    const stage = Stage.createNew()
    const l1 = Layer.createAnonymous()

    stage.getRootLayer().insertSubLayerPath(l1.identifier)
    await stage.flushChanges()
    listenForNotices(stage)
    await stage.muteLayer(l1.identifier)
    expect(stageContentsChangedCount).toBe(1)
    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual({})
  })

  it('test_UnmuteEmptyLayer', async () => {
    // Tests that a StageContentsChanged and an empty ObjectsChanged notice
    // are triggered when an empty layer is unmuted
    const stage = Stage.createNew()
    const l1 = Layer.createAnonymous()

    stage.getRootLayer().insertSubLayerPath(l1.identifier)
    await stage.muteLayer(l1.identifier)
    listenForNotices(stage)
    await stage.unmuteLayer(l1.identifier)
    expect(stageContentsChangedCount).toBe(1)
    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual({})
  })

  it('test_SublayerWithDef', async () => {
    // Tests that proper change notifications are generated when a sublayer
    // is added containing a def
    const root = anonymousLayer('root.usda', `#usda 1.0
                                 def "World" { }
                              `)
    const subLayerText = `#usda 1.0
                                over "World" {
                                    def "Prim" { }
                                }
                            `
    const sub = anonymousLayer('sub.usda', subLayerText)

    const stage = await openLayer(root)
    listenForNotices(stage)

    // Test sublayer insertion/removal
    root.setSubLayerPaths([sub.identifier])
    await stage.flushChanges()
    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual({
      ChangedInfoOnly: { '/': ['subLayerOffsets', 'subLayers'], '/World': [] },
      Resynced: { '/World/Prim': ['specifier'] },
    })

    root.removeSubLayerPath(0)
    await stage.flushChanges()

    expect(objectsChangedNotices.length).toBe(2)
    expect(objectsChangedNotices[1]).toEqual({
      ChangedInfoOnly: { '/': ['subLayerOffsets', 'subLayers'], '/World': [] },
      Resynced: { '/World/Prim': [] },
    })

    // Test sublayer muting/unmuting. Put our test sublayer back in
    // temporarily, then use that for testing.
    root.insertSubLayerPath(sub.identifier, 0)
    await stage.flushChanges()
    expect(objectsChangedNotices.length).toBe(3)

    await stage.muteLayer(sub.identifier)

    expect(objectsChangedNotices.length).toBe(4)
    expect(objectsChangedNotices[3]).toEqual({
      ChangedInfoOnly: { '/World': [] },
      Resynced: { '/World/Prim': [] },
    })

    await stage.unmuteLayer(sub.identifier)

    expect(objectsChangedNotices.length).toBe(5)
    expect(objectsChangedNotices[4]).toEqual({
      ChangedInfoOnly: { '/World': [] },
      Resynced: { '/World/Prim': ['specifier'] },
    })

    // Test sublayer clear / import from string
    sub.clear()
    expect(objectsChangedNotices.length).toBe(6)
    expect(objectsChangedNotices[5]).toEqual({
      ChangedInfoOnly: { '/World': [] },
      Resynced: { '/World/Prim': [] },
    })

    sub.importFromString(subLayerText)
    expect(objectsChangedNotices.length).toBe(7)
    expect(objectsChangedNotices[6]).toEqual({
      ChangedInfoOnly: { '/World': [] },
      Resynced: { '/World/Prim': ['specifier'] },
    })
  })

  it('test_SublayerWithAttr', async () => {
    // Tests that proper notifications are generated when muting a sublayer
    // which contains a prim which overrides an attribute
    const root = anonymousLayer('root.usda', `#usda 1.0
                                 def "World" {
                                   def "Sets" {
                                     def "GlassLens" {
                                     }
                                   }
                                }
                            `)
    const glowLayerText = `#usda 1.0
                                 over "World" {
                                   over "Sets" {
                                     over "GlassLens" {
                                        color3f primvars:lightBulbColor = (0, 0, 0)
                                     }
                                   }
                                }
                              `
    const glowLayer = anonymousLayer('glowLayer.usda', glowLayerText)

    root.setSubLayerPaths([glowLayer.identifier])

    const stage = await openLayer(root)
    listenForNotices(stage)

    const expectedNotices = {
      ChangedInfoOnly: { '/World': [], '/World/Sets': [], '/World/Sets/GlassLens': [] },
      Resynced: { '/World/Sets/GlassLens.primvars:lightBulbColor': [] },
    }

    // Test sublayer muting/unmuting
    await stage.muteLayer(glowLayer.identifier)
    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual(expectedNotices)

    await stage.unmuteLayer(glowLayer.identifier)
    expect(objectsChangedNotices.length).toBe(2)
    expect(objectsChangedNotices[1]).toEqual(expectedNotices)

    // Test sublayer removal/insertion
    root.removeSubLayerPath(0)
    await stage.flushChanges()
    expect(objectsChangedNotices.length).toBe(3)
    expect(objectsChangedNotices[2]).toEqual({
      ChangedInfoOnly: {
        '/': ['subLayerOffsets', 'subLayers'],
        '/World': [], '/World/Sets': [], '/World/Sets/GlassLens': [],
      },
      Resynced: { '/World/Sets/GlassLens.primvars:lightBulbColor': [] },
    })

    root.insertSubLayerPath(glowLayer.identifier, 0)
    await stage.flushChanges()
    expect(objectsChangedNotices.length).toBe(4)
    expect(objectsChangedNotices[3]).toEqual({
      ChangedInfoOnly: {
        '/': ['subLayerOffsets', 'subLayers'],
        '/World': [], '/World/Sets': [], '/World/Sets/GlassLens': [],
      },
      Resynced: { '/World/Sets/GlassLens.primvars:lightBulbColor': [] },
    })

    // Test sublayer clear / import from string
    glowLayer.clear()
    expect(objectsChangedNotices.length).toBe(5)
    expect(objectsChangedNotices[4]).toEqual({
      ChangedInfoOnly: { '/World': [], '/World/Sets': [], '/World/Sets/GlassLens': [] },
      Resynced: { '/World/Sets/GlassLens.primvars:lightBulbColor': ['default'] },
    })

    glowLayer.importFromString(glowLayerText)
    expect(objectsChangedNotices.length).toBe(6)
    expect(objectsChangedNotices[5]).toEqual({
      ChangedInfoOnly: { '/World': [], '/World/Sets': [], '/World/Sets/GlassLens': [] },
      Resynced: { '/World/Sets/GlassLens.primvars:lightBulbColor': ['default', 'typeName'] },
    })
  })

  it('test_SublayerWithSublayer', async () => {
    const root = anonymousLayer('root.usda', `#usda 1.0
                                      def "World" {
                                        def "Sets" {
                                            def "GlassLens" {
                                            }
                                        }
                                      }
                                   `)
    const over = anonymousLayer('over.usda', `#usda 1.0
                                      over "World" {
                                        over "Sets" {
                                            over "GlassLens"(
                                               active = false
                                            )
                                            {
                                            }
                                        }
                                      }
                                   `)

    const sub = anonymousLayer('sub.usda')
    sub.setSubLayerPaths([over.identifier])
    root.setSubLayerPaths([sub.identifier])
    const subLayerText = sub.exportToString()

    const stage = await openLayer(root)
    listenForNotices(stage)

    // Test sublayer removal/insertion
    root.removeSubLayerPath(0)
    await stage.flushChanges()

    const expectedChanges = {
      ChangedInfoOnly: {
        '/': ['subLayerOffsets', 'subLayers'], '/World': [], '/World/Sets': [],
      },
      Resynced: { '/World/Sets/GlassLens': ['active'] },
    }

    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual(expectedChanges)

    root.setSubLayerPaths([sub.identifier])
    await stage.flushChanges()
    expect(objectsChangedNotices.length).toBe(2)
    expect(objectsChangedNotices[1]).toEqual(expectedChanges)

    // Test sublayer muting/unmuting
    await stage.muteLayer(sub.identifier)
    expect(objectsChangedNotices.length).toBe(3)
    expect(objectsChangedNotices[2]).toEqual(expectedChanges)

    await stage.unmuteLayer(sub.identifier)
    expect(objectsChangedNotices.length).toBe(4)
    expect(objectsChangedNotices[3]).toEqual(expectedChanges)

    // Test sublayer clear / import from string
    sub.clear()
    await stage.flushChanges()
    expect(objectsChangedNotices.length).toBe(5)
    expect(objectsChangedNotices[4]).toEqual(expectedChanges)

    sub.importFromString(subLayerText)
    await stage.flushChanges()
    expect(objectsChangedNotices.length).toBe(6)
    expect(objectsChangedNotices[5]).toEqual(expectedChanges)
  })

  it('test_MutingSublayerThoughReference', async () => {
    // Tests that proper change notifications are generated when a sublayer
    // containing a def is muted or unmuted
    const root = anonymousLayer('root.usda', `#usda 1.0
                                      def "World" { }
                                   `)
    const ref = anonymousLayer('ref.usda', `#usda 1.0
                             (
                                defaultPrim="Base"
                             )
                                def "Base" {
                                    def "Refprim" {
                                    }
                                }
                            `)
    const sub = anonymousLayer('sub.usda', `#usda 1.0
                                over "Base" {
                                    def "Subprim" {
                                    }
                                }
                            `)

    ref.setSubLayerPaths([sub.identifier])
    root.setField('/World', 'references', {
      isExplicit: false, explicitItems: [], prependedItems: [],
      appendedItems: [{ assetPath: ref.identifier, primPath: '', layerOffset: { offset: 0, scale: 1 } }],
      deletedItems: [],
    })

    const stage = await openLayer(root)

    // Test Change notifications for muting
    listenForNotices(stage)
    await stage.muteLayer(sub.identifier)

    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual({
      ChangedInfoOnly: { '/World': [] },
      Resynced: { '/World/Subprim': [] },
    })

    // Test Change notifications for unmuting
    listenForNotices(stage)
    await stage.unmuteLayer(sub.identifier)

    expect(objectsChangedNotices.length).toBe(1)
    expect(objectsChangedNotices[0]).toEqual({
      ChangedInfoOnly: { '/World': [] },
      Resynced: { '/World/Subprim': ['specifier'] },
    })
  })
})
