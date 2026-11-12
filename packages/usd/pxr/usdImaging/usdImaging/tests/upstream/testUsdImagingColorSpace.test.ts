// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingColorSpace.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingColorSpace.cpp
// (OpenUSD 26.11.1), registered in pxr/usdImaging/usdImaging/CMakeLists.txt:385-389.
// Scenes: fixtures/colorSpace/{basic,primvars}.usda, copied unchanged from
// testenv/testUsdImagingColorSpace/. Expected color spaces are the ones the
// upstream test asserts. Each Check* call is an expect() on its message
// (empty when the upstream check returns true); main()'s TfErrorMark is
// checked per case.
//
// Hd_UnitTestNullRenderDelegate / HdRenderIndex: upstream creates them in
// OpenStage but does not use them.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MaterialSchema as HdMaterialSchema,
  PrimvarsSchema as HdPrimvarsSchema,
} from 'typescript-usd/hd'
import { TfErrorMark } from 'typescript-usd/tf'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import { Value as VtValue } from 'typescript-usd/vt'
import { UsdImagingCreateSceneIndices, type UsdImagingStageSceneIndex } from 'typescript-usd/usdImaging'

const fixtures = new URL('./fixtures/colorSpace/', import.meta.url)

/** The token a color space data source's GetValue(0) holds. Upstream
 *  compares VtValues; in this port HdTypedSampledDataSource::GetValue
 *  returns the typed value itself (pxr/imaging/hd/src/dataSource.ts), while
 *  some data sources return a VtValue, so both are read as the held token. */
function _HeldValue(value: unknown): unknown {
  return value instanceof VtValue ? value.UncheckedGet() : value
}

// testUsdImagingColorSpace.cpp:32-46
const _tokens = {
  // materials
  Surface: 'Surface',
  diffuseColor: 'diffuseColor',
  specularColor: 'specularColor',
  file: 'file',
  // lights
  Light: 'Light',
  color: 'color',
  textureFile: 'texture:file',
  // primvars
  displayColor: 'displayColor',
  customColor: 'customColor',
} as const

/** testUsdImagingColorSpace.cpp:82-101 */
async function OpenStage(usdFileName: string): Promise<UsdImagingStageSceneIndex> {
  const stage = (await UsdStage.open(fileURLToPath(new URL(usdFileName, fixtures))))!
  const frame = new UsdTimeCode(0)

  const sceneIndices = UsdImagingCreateSceneIndices({ stage })
  const stageSceneIndex = sceneIndices.stageSceneIndex
  stageSceneIndex.SetTime(frame)

  return stageSceneIndex
}

/** testUsdImagingColorSpace.cpp:103-141. Returns '' where upstream returns
 *  true, else the message upstream prints. */
function CheckParamColorSpace(
  stageSceneIndex: UsdImagingStageSceneIndex,
  materialPath: string,
  nodeNameToken: string,
  paramNameToken: string,
  colorSpaceValue: string,
): string {
  const prim = stageSceneIndex.getPrim(materialPath)
  if (prim.primType === '') {
    return ` - no material prim <${materialPath}>.`
  }

  const matSchema = HdMaterialSchema.getFromParent(prim.dataSource)
  const netSchema = matSchema.getMaterialNetwork('')
  const nodeSchema = netSchema.getNodes().Get(nodeNameToken)
  if (!nodeSchema.isDefined()) {
    return ` - no node schema for '${nodeNameToken}' node`
  }
  const paramSchema = nodeSchema.getParameters().Get(paramNameToken)
  if (!paramSchema.isDefined()) {
    return ` - no param schema for '${paramNameToken}' param.`
  }

  const paramColorSpace = _HeldValue(paramSchema.getColorSpace()?.GetValue(0))
  if (paramColorSpace !== colorSpaceValue) {
    return ` - color space does not match expected value (${colorSpaceValue}) ${materialPath}/` +
      `${nodeNameToken}.${paramNameToken}color space = ${String(paramColorSpace)}`
  }
  return ''
}

/** testUsdImagingColorSpace.cpp:143-179 */
function CheckLightParamColorSpace(
  stageSceneIndex: UsdImagingStageSceneIndex,
  lightPath: string,
  paramNameToken: string,
  colorSpaceValue: string,
): string {
  const prim = stageSceneIndex.getPrim(lightPath)
  if (prim.primType === '') {
    return ` - no light prim <${lightPath}>.`
  }

  const matSchema = HdMaterialSchema.getFromParent(prim.dataSource)
  const netSchema = matSchema.getMaterialNetwork('')
  const nodeSchema = netSchema.getNodes().Get(lightPath)
  if (!nodeSchema.isDefined()) {
    return ` - no node schema for '${lightPath}' node`
  }
  const paramSchema = nodeSchema.getParameters().Get(paramNameToken)
  if (!paramSchema.isDefined()) {
    return ` - no param schema for '${paramNameToken}' param.`
  }

  const paramColorSpace = _HeldValue(paramSchema.getColorSpace()?.GetValue(0))
  if (paramColorSpace !== colorSpaceValue) {
    return ` - color space does not match expected value (${colorSpaceValue}) ${lightPath}.` +
      `${paramNameToken} has color space = ${String(paramColorSpace)}`
  }
  return ''
}

/** testUsdImagingColorSpace.cpp:181-211 */
function CheckPrimvarColorSpace(
  stageSceneIndex: UsdImagingStageSceneIndex,
  primPath: string,
  primvarNameToken: string,
  colorSpaceValue: string,
): string {
  const prim = stageSceneIndex.getPrim(primPath)
  if (prim.primType === '') {
    return ` - no prim <${primPath}>.`
  }

  const primvarsSchema = HdPrimvarsSchema.getFromParent(prim.dataSource)
  const primvarSchema = primvarsSchema.getPrimvar(primvarNameToken)
  if (!primvarSchema.isDefined()) {
    return ` - no primvar schema for '${primvarNameToken}'.`
  }

  const paramColorSpace = _HeldValue(primvarSchema.getColorSpace()?.GetValue(0))
  if (paramColorSpace !== colorSpaceValue) {
    return ` - color space does not match expected value (${colorSpaceValue}) ${primPath}/` +
      `.${primvarNameToken}color space = ${String(paramColorSpace)}`
  }
  return ''
}

describe('testUsdImagingColorSpace', () => {
  /** testUsdImagingColorSpace.cpp:213-332 */
  it('TestAttributes', async () => {
    const mark = new TfErrorMark()
    const stageSceneIndex = await OpenStage('basic.usda')

    // Check Color Space on Red Surface Material
    // diffuseColor should be lin_ap0_scene - color space API defined on the
    // 'Materials' Xform
    expect(CheckParamColorSpace(stageSceneIndex, '/Materials/Red',
      _tokens.Surface, _tokens.diffuseColor, 'lin_ap0_scene')).toBe('')

    // Check Color space on Green Material Attributes
    // diffuseColor Should be sRGB - attribute metadata
    // specularColor lin_rec2020_scene - color space API defined on the
    // parent 'Green' material node
    const greenMaterialPath = '/Materials/Green'
    expect(CheckParamColorSpace(stageSceneIndex, greenMaterialPath,
      _tokens.Surface, _tokens.diffuseColor, 'sRGB')).toBe('')
    expect(CheckParamColorSpace(stageSceneIndex, greenMaterialPath,
      _tokens.Surface, _tokens.specularColor, 'lin_rec2020_scene')).toBe('')

    // Check Color Space on Blue Material Attributes
    // diffuseColor should be sRGB - attribute metadata
    // specularColor should be srgb_rec709_scene - color space API defined on
    // the 'Surface' shader node
    const blueMaterialPath = '/Materials/Blue'
    expect(CheckParamColorSpace(stageSceneIndex, blueMaterialPath,
      _tokens.Surface, _tokens.diffuseColor, 'sRGB')).toBe('')
    expect(CheckParamColorSpace(stageSceneIndex, blueMaterialPath,
      _tokens.Surface, _tokens.specularColor, 'srgb_rec709_scene')).toBe('')

    // Check ColorSpace on Textured Materials
    // Image1 file - lin_ap0_scene - color space API defined on 'TextureMaterials'
    // Image2 file - sRGB - attribute metadata
    const mat1Path = '/TextureMaterials/Mat1'
    expect(CheckParamColorSpace(stageSceneIndex, mat1Path,
      'Image1', _tokens.file, 'lin_ap0_scene')).toBe('')
    expect(CheckParamColorSpace(stageSceneIndex, mat1Path,
      'Image2', _tokens.file, 'sRGB')).toBe('')
    // Image1 file - lin_rec2020_scene - color space API defined on 'Mat2'
    // Image2 file - sRGB - color space API defined on 'Image2'
    const mat2Path = '/TextureMaterials/Mat2'
    expect(CheckParamColorSpace(stageSceneIndex, mat2Path,
      'Image1', _tokens.file, 'lin_rec2020_scene')).toBe('')
    expect(CheckParamColorSpace(stageSceneIndex, mat2Path,
      'Image2', _tokens.file, 'srgb_p3d65_scene')).toBe('')
    // Image file - raw - sourceColorSpace attribute on the texture node
    expect(CheckParamColorSpace(stageSceneIndex, '/TextureMaterials/Mat3',
      'Image', _tokens.file, 'raw')).toBe('')

    // Check Color Space on Lights
    // color - lin_ap0_scene - colorSpaceAPI defined on 'Lights'
    expect(CheckLightParamColorSpace(stageSceneIndex, '/Lights/DistLight1',
      _tokens.color, 'lin_ap0_scene')).toBe('')
    // color - lin_rec2020_scene - attribute metadata
    expect(CheckLightParamColorSpace(stageSceneIndex, '/Lights/DistLight2',
      _tokens.color, 'lin_rec2020_scene')).toBe('')
    // textureFile - lin_ap0_scene - colorSpaceAPI defined on 'Lights'
    expect(CheckLightParamColorSpace(stageSceneIndex, '/Lights/DomeLight1',
      _tokens.textureFile, 'lin_ap0_scene')).toBe('')
    // textureFile - srgb_rec709_scene - colorSpaceAPI defined on 'DomeLight2'
    expect(CheckLightParamColorSpace(stageSceneIndex, '/Lights/DomeLight2',
      _tokens.textureFile, 'srgb_rec709_scene')).toBe('')

    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingColorSpace.cpp:334-375 */
  it('TestPrimvars', async () => {
    const mark = new TfErrorMark()
    const stageSceneIndex = await OpenStage('primvars.usda')

    // Check Color Space on Sphere1
    // displayColor should be g22_rec709_scene - color space API defined on the
    // 'World' Xform
    expect(CheckPrimvarColorSpace(stageSceneIndex, '/World/Spheres/Sphere1',
      _tokens.displayColor, 'g22_rec709_scene')).toBe('')

    // Check Color Space on Sphere2
    // displayColor should be srgb_p3d65_scene - color space API defined on
    // Sphere2 itself
    expect(CheckPrimvarColorSpace(stageSceneIndex, '/World/Spheres/Sphere2',
      _tokens.displayColor, 'srgb_p3d65_scene')).toBe('')

    // Check Color Space on Sphere3
    // displayColor should be lin_rec2020_scene - color space API defined on the
    // Sphere's parent transform 'SingleSphere'
    // customColor should be in sRGB - defined as attribute metadata
    const sphere3Path = '/World/SingleSphere/Sphere3'
    expect(CheckPrimvarColorSpace(stageSceneIndex, sphere3Path,
      _tokens.displayColor, 'lin_rec2020_scene')).toBe('')
    expect(CheckPrimvarColorSpace(stageSceneIndex, sphere3Path,
      _tokens.customColor, 'sRGB')).toBe('')

    expect(mark.isClean()).toBe(true)
  })
})
