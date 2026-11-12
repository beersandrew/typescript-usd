// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdMedia/testenv/testUsdMediaAssetPreviewsAPI.py
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdMedia/testenv/testUsdMediaAssetPreviewsAPI.py
//
// UsdMediaAssetPreviewsAPI::GetAssetDefaultPreviews is asynchronous here
// (layer loading is asynchronous). The Python test exports the layer to the
// working directory and reopens it by file name; this port exports to a
// temporary directory.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AssetPath, Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { Xform } from 'typescript-usd/usdGeom'
import { AssetPreviewsAPI } from 'typescript-usd/usdMedia'

describe('TestUsdMediaAssetPreviews', () => {
  it('test_DefaultThumbnails', async () => {
    // BUild up a layer on a stage, testing negative cases as we go
    // until we get something good
    const layer = Layer.createAnonymous()
    const stage = await Stage.open(layer)
    const xform = Xform.define(stage, '/Model')

    const thumbnails = new AssetPreviewsAPI.Thumbnails(new AssetPath('foo.jpg'))

    let apAPI = new AssetPreviewsAPI(xform.prim)
    expect(apAPI.getDefaultThumbnails()).toBeUndefined()

    apAPI.setDefaultThumbnails(thumbnails)
    // Still should fail because schema has not been applied
    expect(apAPI.isValid()).toBe(false)
    expect(apAPI.getDefaultThumbnails()).toBeUndefined()

    apAPI = AssetPreviewsAPI.apply(xform.prim)
    expect(apAPI.isValid()).toBe(true)
    const retrievedThumbnails = apAPI.getDefaultThumbnails()
    expect(retrievedThumbnails).toBeDefined()
    expect(retrievedThumbnails!.defaultImage.equals(thumbnails.defaultImage)).toBe(true)

    // no defaultPrim metadata, so this should fail
    expect((await AssetPreviewsAPI.getAssetDefaultPreviews(layer)).isValid()).toBe(false)

    stage.setDefaultPrim(xform.prim)
    const apAPI1 = await AssetPreviewsAPI.getAssetDefaultPreviews(layer)
    expect(apAPI1.isValid()).toBe(true)
    const retrievedThumbnails1 = apAPI1.getDefaultThumbnails()
    expect(retrievedThumbnails1).toBeDefined()
    expect(retrievedThumbnails1!.defaultImage.equals(thumbnails.defaultImage)).toBe(true)

    // Finally, write out the layer, and repeat the last part from
    // string asset-path rather than layer
    const dir = mkdtempSync(join(tmpdir(), 'usdMediaAssetPreviews-'))
    try {
      const fn = join(dir, 'assetPreviews.usda')
      await layer.export(fn)
      const apAPI2 = await AssetPreviewsAPI.getAssetDefaultPreviews(fn)
      expect(apAPI2.isValid()).toBe(true)
      const retrievedThumbnails2 = apAPI2.getDefaultThumbnails()
      expect(retrievedThumbnails2).toBeDefined()
      expect(retrievedThumbnails2!.defaultImage.equals(thumbnails.defaultImage)).toBe(true)
      // test clearing, and that when there is no data, we should get None
      apAPI2.clearDefaultThumbnails()
      expect(apAPI2.getDefaultThumbnails()).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
