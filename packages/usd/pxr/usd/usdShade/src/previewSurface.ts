// Ported from OpenUSD 26.11.1:
//  pxr/usd/plugin/usdShaders/shaders/shaderDefs.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdPreviewSurface — input names, types, and fallback values per the spec.
// Reference: pxr/usd/plugin/usdShaders/shaders/shaderDefs.usda

export const PREVIEW_SURFACE_ID = 'UsdPreviewSurface'
export const UV_TEXTURE_ID = 'UsdUVTexture'
export const PRIMVAR_READER_FLOAT2_ID = 'UsdPrimvarReader_float2'
export const TRANSFORM_2D_ID = 'UsdTransform2d'

export interface PreviewSurfaceParams {
  diffuseColor: [number, number, number]
  emissiveColor: [number, number, number]
  useSpecularWorkflow: number
  specularColor: [number, number, number]
  metallic: number
  roughness: number
  clearcoat: number
  clearcoatRoughness: number
  opacity: number
  opacityThreshold: number
  ior: number
  occlusion: number
}

export const PREVIEW_SURFACE_DEFAULTS: PreviewSurfaceParams = {
  diffuseColor: [0.18, 0.18, 0.18],
  emissiveColor: [0, 0, 0],
  useSpecularWorkflow: 0,
  specularColor: [0, 0, 0],
  metallic: 0,
  roughness: 0.5,
  clearcoat: 0,
  clearcoatRoughness: 0.01,
  opacity: 1,
  opacityThreshold: 0,
  ior: 1.5,
  occlusion: 1,
}

// USD value types for each input, used when authoring.
export const PREVIEW_SURFACE_INPUT_TYPES: Record<string, string> = {
  diffuseColor: 'color3f',
  emissiveColor: 'color3f',
  useSpecularWorkflow: 'int',
  specularColor: 'color3f',
  metallic: 'float',
  roughness: 'float',
  clearcoat: 'float',
  clearcoatRoughness: 'float',
  opacity: 'float',
  opacityMode: 'token',
  opacityThreshold: 'float',
  ior: 'float',
  normal: 'normal3f',
  displacement: 'float',
  occlusion: 'float',
}
