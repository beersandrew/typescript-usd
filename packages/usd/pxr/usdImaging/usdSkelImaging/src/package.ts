// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdSkelImaging/package.cpp,
//  pxr/usdImaging/usdSkelImaging/package.h,
//  pxr/usdImaging/usdSkelImaging/shaders/skinning.glslfx
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/package.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: PLUG_THIS_PLUGIN (package.cpp:20) is the usdSkelImaging plugin
// registered by UsdSkelImaging_RegisterShaderResources (./shaderResources.ts),
// which attaches shaders/skinning.glslfx as a plugin resource; the path
// resolves through PlugFindPluginResource as upstream.

import { Token as TfToken, TfStringCatPaths, TfDiagnosticMgr, Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import {
  Registry as PlugRegistry,
  PlugFindPluginResource,
  type Plugin as PlugPlugin,
} from 'typescript-usd/plug'
import { UsdSkelImaging_RegisterShaderResources } from './shaderResources.ts'

/** PLUG_THIS_PLUGIN for usdSkelImaging. */
function _ThisPlugin(): PlugPlugin | null {
  UsdSkelImaging_RegisterShaderResources()
  return PlugRegistry.GetInstance().GetPluginWithName('usdSkelImaging')
}

/** package.cpp:17-26 */
function _GetShaderPath(shader: string): TfToken {
  const plugin = _ThisPlugin()
  const path =
    PlugFindPluginResource(plugin, TfStringCatPaths('shaders', shader))
  if (path.length === 0) {
    // TF_VERIFY(!path.empty(), "Could not find shader: %s\n", shader)
    TfDiagnosticMgr.GetInstance().postError(new TfError(
      `Failed verification: ' !path.empty() ' -- Could not find shader: ${shader}\n`,
      TfDiagnosticType.CodingError))
  }
  return TfToken(path)
}

let _skinningShader: TfToken | undefined

/** package.cpp:28-33 */
export function UsdSkelImagingPackageSkinningShader(): TfToken {
  return _skinningShader ??= _GetShaderPath('skinning.glslfx')
}
