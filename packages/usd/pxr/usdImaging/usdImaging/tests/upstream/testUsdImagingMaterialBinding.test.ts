// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingMaterialBinding.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingMaterialBinding.cpp
// (OpenUSD 26.11.1) and its two registrations in
// pxr/usdImaging/usdImaging/CMakeLists.txt:373-384:
//   testUsdImagingMaterialBinding  -stage model.usda
//       -validateBindingsFor /Model/Geom/Parent/mesh
//   testUsdImagingMaterialBindingNI -stage ni-collection-material-binding.usda
//       -validateBindingsFor /not_instanced/geo/cube /instanced/geo/cube
// The scenes are the upstream testenv/testUsdImagingMaterialBinding files.
// TF_VERIFYs are expect()s; main()'s TfErrorMark check is kept.
//
// The prim adapters the scenes need are registered by plugInfo.ts.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  InstanceProxyViewSceneIndex as HdInstanceProxyViewSceneIndex,
  MaterialBindingsSchema as HdMaterialBindingsSchema,
  MaterialBindingsSchemaTokens as HdMaterialBindingsSchemaTokens,
  PrimTypeTokens as HdPrimTypeTokens,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { SdfPath } from 'typescript-usd/sdf/path'
import { TfErrorMark } from 'typescript-usd/tf'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { MaterialBindingAPI as UsdShadeMaterialBindingAPI } from 'typescript-usd/usdShade'
import { UsdImagingCreateSceneIndices } from 'typescript-usd/usdImaging'

const fixtures = new URL('./fixtures/materialBinding/', import.meta.url)

/** testUsdImagingMaterialBinding.cpp:25-32 */
function _ComputeUsdShadeBoundMaterial(stage: UsdStage, geomPath: string): string {
  // first, compute the binding that we would get from UsdShade.
  return UsdShadeMaterialBindingAPI.computeBoundMaterial(stage, geomPath)?.materialPath ?? ''
}

/** testUsdImagingMaterialBinding.cpp:34-51 */
function _ComputeHydraBoundMaterial(sceneIndex: HdSceneIndexBase, geomPath: string): string {
  const prim = sceneIndex.getPrim(geomPath)
  const materialBindings = HdMaterialBindingsSchema.getFromParent(prim.dataSource)

  // The scenes used in this test don't have any purpose-specific bindings ...
  const binding = materialBindings.getMaterialBinding(HdMaterialBindingsSchemaTokens.allPurpose)
  const pathDS = binding.getPath()
  expect(pathDS).toBeDefined() // TF_VERIFY(pathDS)
  return pathDS ? String(pathDS.getTypedValue(0.0)) : ''
}

/** testUsdImagingMaterialBinding.cpp:53-108 */
async function TestMaterialBindings(usdaFile: string, paths: string[]): Promise<string> {
  const stage = (await UsdStage.open(fileURLToPath(new URL(usdaFile, fixtures))))!

  // Create the UsdImaging scene index graph. Also wire up an instance proxy
  // view scene index to allow querying of instance proxy scene index prims.
  const sceneIndices = UsdImagingCreateSceneIndices({ stage })
  const proxyViewSceneIndex = HdInstanceProxyViewSceneIndex.new(sceneIndices.finalSceneIndex)
  sceneIndices.stageSceneIndex.SetTime(new UsdTimeCode(0))

  let out = ''
  for (const path of paths) {
    // Compute the binding that we would get from UsdShade.
    const usdShadeBoundPath = _ComputeUsdShadeBoundMaterial(stage, path)

    const isInstanceProxy = stage.getPrim(path)!.isInstanceProxy()

    const sceneIndexToQuery = isInstanceProxy
      ? proxyViewSceneIndex
      : sceneIndices.finalSceneIndex

    // Compute what we're computing from UsdImaging/Hydra.
    const hydraBoundMaterialPath = _ComputeHydraBoundMaterial(sceneIndexToQuery, path)

    out += `Geom: ${path}, UsdShade bound material: ${usdShadeBoundPath}, ` +
      `Hydra bound material: ${hydraBoundMaterialPath}\n`

    // Safe to compare the paths if instancing isn't involved.
    if (!isInstanceProxy) {
      expect(hydraBoundMaterialPath).toBe(usdShadeBoundPath)
    } else {
      // Compare just the leaf name because of the namespace mangling
      // from instance aggregation and prototype propagation, but also
      // confirm that a material prim exists at the resolved path.
      expect(SdfPath.fromString(hydraBoundMaterialPath).name)
        .toBe(SdfPath.fromString(usdShadeBoundPath).name)
      const hdPrim = sceneIndices.finalSceneIndex.getPrim(hydraBoundMaterialPath)
      expect(hdPrim.dataSource).toBeDefined()
      expect(hdPrim.primType).toBe(HdPrimTypeTokens.material)
    }
  }
  return out
}

/** testUsdImagingMaterialBinding.cpp:110-143 */
async function main(stageFile: string, paths: string[]): Promise<string> {
  const mark = new TfErrorMark()
  let out = await TestMaterialBindings(stageFile, paths)
  expect(mark.isClean()).toBe(true)
  out += mark.isClean() ? 'OK\n' : 'FAILED\n'
  return out
}

describe('testUsdImagingMaterialBinding', () => {
  it('testUsdImagingMaterialBinding', async () => {
    await main('model.usda', ['/Model/Geom/Parent/mesh'])
  })

  it('testUsdImagingMaterialBindingNI', async () => {
    await main('ni-collection-material-binding.usda', ['/not_instanced/geo/cube', '/instanced/geo/cube'])
  })
})
