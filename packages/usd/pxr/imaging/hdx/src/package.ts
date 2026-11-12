// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/package.cpp,
//  pxr/imaging/hdx/package.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/package.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - PLUG_THIS_PLUGIN (package.cpp:23,34) is the hdx plugin registered by
//   Hdx_RegisterShaderResources (./shaderResources.ts), which attaches hdx's
//   shader files as plugin resources; shader paths resolve through
//   PlugFindPluginResource as upstream.
// - HdxPackageDefaultDomeLightTexture (package.cpp:157-169): the .tex reader
//   is not available, so the packaged Radiance file is used, as upstream does
//   when HioImageRegistry does not support .tex. Textures are not plugin
//   resources here; the path is the packaged file's URL.

import { Token as TfToken, TfStringCatPaths } from 'typescript-usd/tf'
import {
  Registry as PlugRegistry,
  PlugFindPluginResource,
  type Plugin as PlugPlugin,
} from 'typescript-usd/plug'
import { Hdx_RegisterShaderResources } from './shaderResources.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** PLUG_THIS_PLUGIN for hdx. */
function _ThisPlugin(): PlugPlugin | null {
  Hdx_RegisterShaderResources()
  return PlugRegistry.GetInstance().GetPluginWithName('hdx')
}

/** package.cpp:20-29 */
function _GetShaderPath(shader: string): TfToken {
  const plugin = _ThisPlugin()
  const path = PlugFindPluginResource(plugin, TfStringCatPaths('shaders', shader))
  TF_VERIFY(path.length !== 0, `Could not find shader: ${shader}\n`)
  return TfToken(path)
}

function _Static(f: () => TfToken): () => TfToken {
  let s: TfToken | null = null
  return () => (s ??= f())
}

/** package.cpp:42-47 */
export const HdxPackageFullscreenShader = _Static(() => _GetShaderPath('fullscreen.glslfx'))
/** package.cpp:49-54 */
export const HdxPackageRenderPassColorShader = _Static(() => _GetShaderPath('renderPassColorShader.glslfx'))
/** package.cpp:56-62 */
export const HdxPackageRenderPassColorAndSelectionShader =
  _Static(() => _GetShaderPath('renderPassColorAndSelectionShader.glslfx'))
/** package.cpp:64-70 */
export const HdxPackageRenderPassColorWithOccludedSelectionShader =
  _Static(() => _GetShaderPath('renderPassColorWithOccludedSelectionShader.glslfx'))
/** package.cpp:72-77 */
export const HdxPackageRenderPassPickingShader = _Static(() => _GetShaderPath('renderPassPickingShader.glslfx'))
/** package.cpp:79-84 */
export const HdxPackageRenderPassShadowShader = _Static(() => _GetShaderPath('renderPassShadowShader.glslfx'))
/** package.cpp:86-91 */
export const HdxPackageColorChannelShader = _Static(() => _GetShaderPath('colorChannel.glslfx'))
/** package.cpp:93-98 */
export const HdxPackageColorCorrectionShader = _Static(() => _GetShaderPath('colorCorrection.glslfx'))
/** package.cpp:100-105 */
export const HdxPackageVisualizeAovShader = _Static(() => _GetShaderPath('visualize.glslfx'))
/** package.cpp:107-112 */
export const HdxPackageRenderPassOitShader = _Static(() => _GetShaderPath('renderPassOitShader.glslfx'))
/** package.cpp:114-119 */
export const HdxPackageRenderPassOitOpaqueShader = _Static(() => _GetShaderPath('renderPassOitOpaqueShader.glslfx'))
/** package.cpp:121-126 */
export const HdxPackageRenderPassOitVolumeShader = _Static(() => _GetShaderPath('renderPassOitVolumeShader.glslfx'))
/** package.cpp:128-133 */
export const HdxPackageOitResolveImageShader = _Static(() => _GetShaderPath('oitResolveImageShader.glslfx'))
/** package.cpp:135-140 */
export const HdxPackageOutlineShader = _Static(() => _GetShaderPath('outline.glslfx'))
/** package.cpp:142-147 */
export const HdxPackageSkydomeShader = _Static(() => _GetShaderPath('skydome.glslfx'))
/** package.cpp:149-154 */
export const HdxPackageBoundingBoxShader = _Static(() => _GetShaderPath('boundingBox.glslfx'))

/** package.cpp:156-167 (see the header note). */
export function HdxPackageDefaultDomeLightTexture(): string {
  const url = new URL('../textures/StinsonBeach.hdr', import.meta.url)
  return url.protocol === 'file:' ? decodeURIComponent(url.pathname) : url.href
}
