// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/plugin/usdShaders/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/usdShaders — pxr/usd/plugin/usdShaders (OpenUSD 26.11.1):
// the UsdPreviewSurface, UsdUVTexture, UsdPrimvarReader_* and UsdTransform2d
// shader definitions and their glslfx implementations, made known to
// SdrRegistry.

// The sdrGlslfx parser plugin, which parses the "glslfx" implementations
// of these shaders' nodes; SdrRegistry finds it through Plug.
import 'typescript-usd/sdrGlslfx'
import { UsdShaders_LoadDiscoveryPluginAsync } from './discoveryPlugin.ts'
import { UsdShaders_RegisterShaderResources } from './shaderResources.ts'

export { UsdShadersDiscoveryPlugin } from './discoveryPlugin.ts'
export {
  UsdShaders_GetResourcePath,
  UsdShaders_PlugInfo,
  UsdShaders_RegisterShaderResources,
} from './shaderResources.ts'

let _registration: Promise<void> | undefined

/** Loads the usdShaders plugin: registers its plugInfo.json with the
 *  shader resources, then opens the definitions stage and registers the
 *  UsdShadersDiscoveryPlugin type, which SdrRegistry then finds through Plug
 *  and parses with the UsdShadeShaderDefParserPlugin (discovery type
 *  "usda"); the glslfx implementations parse with the sdrGlslfx parser
 *  plugin. Asynchronous because the definitions stage opens asynchronously
 *  (FAITHFULNESS-DEBT sdr-shaderdefs-stage-open, discoveryPlugin.ts);
 *  idempotent. After it resolves, SdrRegistry finds the usdShaders nodes
 *  synchronously, e.g. GetShaderNodeByIdentifierAndType('UsdUVTexture',
 *  'glslfx'). */
export function UsdShaders_RegisterShaderNodesAsync(): Promise<void> {
  _registration ??= (async () => {
    UsdShaders_RegisterShaderResources()
    await UsdShaders_LoadDiscoveryPluginAsync()
  })()
  return _registration
}
