// Ported from OpenUSD 26.11.1: pxr/usd/usdHydra/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Loading usdHydra's discovery plugin (usdHydra/plugInfo.json
// "UsdHydraDiscoveryPlugin", a SdrDiscoveryPlugin), in the form
// usd/plugin/usdShaders/src/index.ts uses for usdShaders: the definitions
// stage opens asynchronously (FAITHFULNESS-DEBT sdr-shaderdefs-stage-open,
// discoveryPlugin.ts), so loading is asynchronous.

import { UsdHydra_LoadDiscoveryPluginAsync } from './discoveryPlugin.ts'

let _registration: Promise<void> | undefined

/** Adds UsdHydraDiscoveryPlugin's nodes (e.g. HwFieldReader_float) to
 *  SdrRegistry: opens the definitions stage, then registers the plugin type
 *  SdrRegistry finds through Plug. Idempotent. The "usda" results are parsed
 *  by the UsdShadeShaderDefParserPlugin, which finds that stage by the
 *  result's resolved URI (usdShade/src/shaderDefParser.ts). */
export function UsdHydra_RegisterShaderNodesAsync(): Promise<void> {
  _registration ??= UsdHydra_LoadDiscoveryPluginAsync()
  return _registration
}
