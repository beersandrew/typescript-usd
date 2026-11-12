// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/package.cpp,
//  pxr/imaging/hdSt/package.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/package.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: PLUG_THIS_PLUGIN (package.cpp:20,30) is the hdSt plugin
// registered by HdSt_RegisterShaderResources (./shaderResources.ts), which
// attaches Storm's shader files as plugin resources; the paths resolve
// through PlugFindPluginResource as upstream.

import { Token as TfToken, TfStringCatPaths } from 'typescript-usd/tf'
import {
  Registry as PlugRegistry,
  PlugFindPluginResource,
  type Plugin as PlugPlugin,
} from 'typescript-usd/plug'
import { HdSt_RegisterShaderResources } from './shaderResources.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** PLUG_THIS_PLUGIN for hdSt. */
function _ThisPlugin(): PlugPlugin | null {
  HdSt_RegisterShaderResources()
  return PlugRegistry.GetInstance().GetPluginWithName('hdSt')
}

/** package.cpp:17-25 */
function _GetShaderPath(shader: string): TfToken {
  const plugin = _ThisPlugin()
  const path =
    PlugFindPluginResource(plugin, TfStringCatPaths('shaders', shader))
  TF_VERIFY(path.length !== 0, `Could not find shader: ${shader}\n`)
  return TfToken(path)
}

/** package.cpp:27-35 */
function _GetTexturePath(texture: string): TfToken {
  const plugin = _ThisPlugin()
  const path =
    PlugFindPluginResource(plugin, TfStringCatPaths('textures', texture))
  TF_VERIFY(path.length !== 0, `Could not find texture: ${texture}\n`)
  return TfToken(path)
}

function _Static(f: () => TfToken): () => TfToken {
  let s: TfToken | null = null
  return () => (s ??= f())
}

/** package.cpp:37-42 */
export const HdStPackageComputeShader = _Static(() => _GetShaderPath('compute.glslfx'))

/** package.cpp:44-49 */
export const HdStPackageDomeLightShader = _Static(() => _GetShaderPath('domeLight.glslfx'))

/** package.cpp:51-56 */
export const HdStPackageFallbackDomeLightTexture =
  _Static(() => _GetTexturePath('fallbackBlackDomeLight.png'))

/** package.cpp:58-63 */
export const HdStPackagePtexTextureShader = _Static(() => _GetShaderPath('ptexTexture.glslfx'))

/** package.cpp:65-70 */
export const HdStPackageRenderPassShader = _Static(() => _GetShaderPath('renderPassShader.glslfx'))

/** package.cpp:72-77 */
export const HdStPackageFallbackLightingShader =
  _Static(() => _GetShaderPath('fallbackLightingShader.glslfx'))

/** package.cpp:79-84 */
export const HdStPackageFallbackMaterialNetworkShader =
  _Static(() => _GetShaderPath('fallbackMaterialNetwork.glslfx'))

/** package.cpp:86-91 */
export const HdStPackageInvalidMaterialNetworkShader =
  _Static(() => _GetShaderPath('invalidMaterialNetwork.glslfx'))

/** package.cpp:93-98 */
export const HdStPackageFallbackVolumeShader = _Static(() => _GetShaderPath('fallbackVolume.glslfx'))

/** package.cpp:100-105 */
export const HdStPackageImageShader = _Static(() => _GetShaderPath('imageShader.glslfx'))

/** package.cpp:107-112 */
export const HdStPackageSimpleLightingShader =
  _Static(() => _GetShaderPath('simpleLightingShader.glslfx'))

/** package.cpp:114-119 */
export const HdStPackageOverlayShader = _Static(() => _GetShaderPath('overlayShader.glslfx'))
