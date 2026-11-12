// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/dataSourceVolume.cpp,
//  pxr/usdImaging/usdImaging/volumeAdapter.cpp,
//  pxr/usdImaging/usdVolImaging/dataSourceFieldAsset.cpp,
//  pxr/usdImaging/usdVolImaging/openvdbAssetAdapter.cpp
// Copyright 2018, 2020, 2022 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The stage scene index's volume and field prims for the upstream
// testUsdImagingGLVdbVolume fallback-material scene, against native OpenUSD
// 26.11.1 UsdImagingStageSceneIndex data (fixtures/, FIXTURES.md):
// UsdImagingVolumeAdapter (usdImaging/volumeAdapter.cpp,
// dataSourceVolume.cpp) and UsdImagingOpenVDBAssetAdapter
// (usdVolImaging/openvdbAssetAdapter.cpp, dataSourceFieldAsset.cpp).
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { Stage } from 'typescript-usd/usd'
import { AssetPath } from 'typescript-usd/sdf'
import {
  VolumeFieldBindingSchema, VolumeFieldSchema, ContainerDataSource,
  type DirtiedPrimEntry, type SceneIndexObserver,
} from 'typescript-usd/hd'
import 'typescript-usd/usdVolImaging'
import { UsdImagingStageSceneIndex as StageSceneIndex, UsdImagingAdapterRegistry as AdapterRegistry } from 'typescript-usd/usdImaging'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

const root = new URL('./fixtures/testUsdImagingGLVdbVolume/', import.meta.url)
interface NativeTime {
  time: number
  volume: { primType: string, volumeFieldBinding: Record<string, string> }
  field: {
    primType: string, volumeFieldNames: string[], filePath: { assetPath: string, resolvedBase: string },
    fieldName: string, fieldIndex: number, fieldDataType: string, vectorDataRoleHint: string,
  }
}
const native = readOracleFixture(new URL('expected.json', root)) as { times: NativeTime[] }

function typed(ds: unknown): unknown {
  return (ds as { getTypedValue(t: number): unknown } | undefined)?.getTypedValue(0)
}

async function openScene() {
  const stage = (await Stage.open(fileURLToPath(new URL('vdbVolumeFallbackMaterial.usda', root))))!
  const sceneIndex = StageSceneIndex.new()
  sceneIndex.SetStage(stage)
  return sceneIndex
}

describe('UsdImaging volume and OpenVDB field adapters', () => {
  it('registers the Volume, OpenVDBAsset and Field3DAsset adapters by prim type', () => {
    const registry = AdapterRegistry.GetInstance()
    for (const key of ['Volume', 'OpenVDBAsset', 'Field3DAsset']) expect(registry.hasAdapter(key)).toBe(true)
  })

  for (const expected of native.times) {
    it(`publishes native volume and field data at time ${expected.time}`, async () => {
      const sceneIndex = await openScene()
      sceneIndex.SetTime(expected.time)

      const volume = sceneIndex.getPrim('/VdbVolume')
      expect(volume.primType).toBe(expected.volume.primType)
      const binding = VolumeFieldBindingSchema.getFromParent(volume.dataSource as ContainerDataSource)
      expect(Object.fromEntries(binding.getVolumeFieldBindingNames().map(name => [name, typed(binding.getVolumeFieldBinding(name))])))
        .toEqual(expected.volume.volumeFieldBinding)

      const field = sceneIndex.getPrim('/VdbVolume/Density')
      expect(field.primType).toBe(expected.field.primType)
      const container = (field.dataSource as ContainerDataSource).Get('volumeField') as ContainerDataSource
      expect(container.getNames()).toEqual(expected.field.volumeFieldNames)
      const schema = VolumeFieldSchema.getFromParent(field.dataSource as ContainerDataSource)
      const filePath = typed(schema.getFilePath()) as AssetPath
      expect(filePath).toBeInstanceOf(AssetPath)
      expect(filePath.getAssetPath()).toBe(expected.field.filePath.assetPath)
      expect(filePath.getResolvedPath().split('/').at(-1)).toBe(expected.field.filePath.resolvedBase)
      expect(typed(schema.getFieldName())).toBe(expected.field.fieldName)
      expect(typed(container.Get('fieldIndex'))).toBe(expected.field.fieldIndex)
      expect(typed(container.Get('fieldDataType'))).toBe(expected.field.fieldDataType)
      expect(typed(container.Get('vectorDataRoleHint'))).toBe(expected.field.vectorDataRoleHint)
    })
  }

  it('dirties the field prim when the time-sampled filePath changes with time', async () => {
    const sceneIndex = await openScene()
    sceneIndex.SetTime(1)
    // Reading the field registers its time-varying inputs
    // (stageSceneIndex.cpp:1009-1047 dirties registered locators on SetTime).
    typed(VolumeFieldSchema.getFromParent(sceneIndex.getPrim('/VdbVolume/Density').dataSource as ContainerDataSource).getFilePath())
    const dirtied: string[] = []
    const observer: SceneIndexObserver = {
      primsAdded() {}, primsRemoved() {}, primsRenamed() {},
      primsDirtied(_sender, entries: DirtiedPrimEntry[]) { for (const entry of entries) dirtied.push(entry.primPath) },
    }
    sceneIndex.addObserver(observer)
    sceneIndex.SetTime(2)
    expect(dirtied).toContain('/VdbVolume/Density')
    expect((typed(VolumeFieldSchema.getFromParent(sceneIndex.getPrim('/VdbVolume/Density').dataSource as ContainerDataSource)
      .getFilePath()) as AssetPath).getAssetPath()).toBe('smoke_000002.vdb')
  })
})
