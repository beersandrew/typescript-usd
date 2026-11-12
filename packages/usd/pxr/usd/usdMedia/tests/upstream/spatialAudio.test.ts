// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdMedia/testenv/testUsdMediaSpatialAudio.py
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdMedia/testenv/testUsdMediaSpatialAudio.py
//
// timecode attribute values are numbers in this library (parserHelpers.ts),
// so Gf.TimeCode(t) compares as t.
//
// UsdReferences.addReference here takes no layer offset, so the reference
// (the prim's only one) is authored with setReferences, which carries one.
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { SpatialAudio } from 'typescript-usd/usdMedia'

describe('TestUsdMediaSpatialAudio', () => {
  it('test_TimeAttrs', async () => {
    // Create layer and stage with a SpatialAudio prim that we will reference
    const refLayer = Layer.createAnonymous()
    const refStage = await Stage.open(refLayer)
    const refAudio = SpatialAudio.define(refStage, '/RefAudio')

    // Create a new and SpatialAudio prim that references the above prim.
    // The reference has a layer offset of scale=2.0, offset=10.0
    const stage = Stage.createNew()
    const audio = SpatialAudio.define(stage, '/Audio')
    const refs = audio.prim.getReferences()
    await refs.setReferences([{
      assetPath: refLayer.identifier, primPath: '/RefAudio',
      layerOffset: { scale: 2.0, offset: 10.0 },
    }])

    expect(refAudio.getStartTimeAttr().getValue()).toBe(0)
    expect(refAudio.getEndTimeAttr().getValue()).toBe(0)
    expect(refAudio.getMediaOffsetAttr().getValue()).toBe(0.0)
    expect(audio.getStartTimeAttr().getValue()).toBe(0)
    expect(audio.getEndTimeAttr().getValue()).toBe(0)
    expect(audio.getMediaOffsetAttr().getValue()).toBe(0)

    refAudio.createStartTimeAttr().set(10.0)
    refAudio.createEndTimeAttr().set(200.0)
    refAudio.createMediaOffsetAttr().set(5.0)
    await stage.flushChanges()
    expect(refAudio.getStartTimeAttr().getValue()).toBe(10)
    expect(refAudio.getEndTimeAttr().getValue()).toBe(200)
    expect(refAudio.getMediaOffsetAttr().getValue()).toBe(5.0)
    expect(audio.getStartTimeAttr().getValue()).toBe(30)
    expect(audio.getEndTimeAttr().getValue()).toBe(410)
    expect(audio.getMediaOffsetAttr().getValue()).toBe(5.0)
  })
})
