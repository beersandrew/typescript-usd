// Ported from OpenUSD 26.11.1: pxr/usd/plugin/usdShaders/discoveryPlugin.cpp,
//  pxr/usd/plugin/usdShaders/discoveryPlugin.h,
//  pxr/usd/usdShade/shaderDefParser.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/plugin/usdShaders/discoveryPlugin.{h,cpp}
// (OpenUSD 26.11.1): UsdShadersDiscoveryPlugin, which discovers the shader
// definitions of shaders/shaderDefs.usda.
//
// FAITHFULNESS-DEBT(sdr-shaderdefs-stage-open): DiscoverShaderNodes opens
// the definitions stage with UsdStage::Open (discoveryPlugin.cpp:55-67) and
// UsdShadeShaderDefParserPlugin opens it again by the result's resolved URI
// (usdShade/shaderDefParser.cpp:62-71). Stage.open is asynchronous here, so
// UsdShaders_RegisterShaderNodesAsync() (index.ts) opens the stage first,
// records it for the parser (usdShade/src/shaderDefParser.ts) and only then
// runs this plugin's SDR_REGISTER_DISCOVERY_PLUGIN (discoveryPlugin.cpp:96),
// after which SdrRegistry finds the type usdShaders/plugInfo.json declares
// through Plug -> a synchronous UsdStage open of a plugin resource layer;
// then the type registers when this module loads, DiscoverShaderNodes opens
// the stage itself and UsdShaders_RegisterShaderNodesAsync goes away.

import { Registry as PlugRegistry, PlugFindPluginResource } from 'typescript-usd/plug'
import { Stage } from 'typescript-usd/usd'
import { ShaderDefParserPlugin, ShaderDefUtils } from 'typescript-usd/usdShade'
import {
  RegisterDiscoveryPlugin as SdrRegisterDiscoveryPlugin,
  type DiscoveryPlugin as SdrDiscoveryPlugin,
  type NodeDiscoveryResult as SdrShaderNodeDiscoveryResult,
} from 'typescript-usd/sdr'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError, TfStringCatPaths } from 'typescript-usd/tf'
import { UsdShaders_RegisterShaderResources } from './shaderResources.ts'

/** TF_RUNTIME_ERROR */
function RaiseRuntimeError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.RuntimeError))
}

/** TF_VERIFY */
function TF_VERIFY(cond: unknown, message: string): boolean {
  if (!cond) {
    TfDiagnosticMgr.GetInstance().postError(new TfError(`Failed verification: ' ${message} '`, TfDiagnosticType.CodingError))
  }
  return Boolean(cond)
}

/** discoveryPlugin.cpp:28-40 _GetShaderResourcePath (PLUG_THIS_PLUGIN is
 *  the usdShaders plugin shaderResources.ts registers). */
function _GetShaderResourcePath(resourceName = ''): string {
  UsdShaders_RegisterShaderResources()
  const plugin = PlugRegistry.GetInstance().GetPluginWithName('usdShaders')
  const path = PlugFindPluginResource(plugin, TfStringCatPaths('shaders', resourceName))
  TF_VERIFY(path !== '', `Could not find shader resource: ${resourceName}\n`)
  return path
}

// The definitions stage UsdShaders_LoadDiscoveryPluginAsync opened (see
// sdr-shaderdefs-stage-open above).
let _shaderDefsStage: Stage | undefined

/** discoveryPlugin.h:23-41 */
export class UsdShadersDiscoveryPlugin implements SdrDiscoveryPlugin {
  /** discoveryPlugin.cpp:42-47 */
  getSearchURIs(): string[] {
    return [_GetShaderResourcePath()]
  }

  /** discoveryPlugin.cpp:49-91 */
  discoverShaderNodes(): SdrShaderNodeDiscoveryResult[] {
    const result: SdrShaderNodeDiscoveryResult[] = []

    const shaderDefsFile = _GetShaderResourcePath('shaderDefs.usda')
    if (!shaderDefsFile) return result
    // The stage UsdStage::Open opens (discoveryPlugin.cpp:59-67), opened
    // ahead (sdr-shaderdefs-stage-open).
    const stage = _shaderDefsStage
    if (!stage) {
      RaiseRuntimeError(`Could not open file '${shaderDefsFile}' on a USD stage.`)
      return result
    }

    for (const shaderDefPath of stage.traverse()) {
      // Root prims only (GetPseudoRoot().GetChildren()).
      if (shaderDefPath.lastIndexOf('/') !== 0) continue
      const shaderDef = stage.getPrim(shaderDefPath)
      // UsdShadeShader(shaderDef): a Shader-typed prim.
      if (!shaderDef || shaderDef.typeName !== 'Shader') {
        continue
      }

      const discoveryResults = ShaderDefUtils.getDiscoveryResults(
        stage, shaderDefPath, shaderDefsFile)

      result.push(...discoveryResults)

      if (discoveryResults.length === 0) {
        RaiseRuntimeError(`Found shader definition <${shaderDefPath}> with no valid ` +
          'discovery results. This is likely because there are no ' +
          'resolvable info:sourceAsset values.')
      }
    }

    return result
  }
}

/** @internal The asynchronous part of loading the usdShaders plugin (see
 *  sdr-shaderdefs-stage-open above): opens the definitions stage, records it
 *  for UsdShadeShaderDefParserPlugin, and registers the discovery plugin
 *  type (discoveryPlugin.cpp:96). */
export async function UsdShaders_LoadDiscoveryPluginAsync(): Promise<void> {
  const shaderDefsFile = _GetShaderResourcePath('shaderDefs.usda')
  const stage = shaderDefsFile ? await Stage.open(shaderDefsFile) : undefined
  if (stage) {
    // A parser constructed with a definitions stage records it by its root
    // layer path, for the parser SdrRegistry instantiates.
    new ShaderDefParserPlugin(stage)
  }
  _shaderDefsStage = stage
  SdrRegisterDiscoveryPlugin('UsdShadersDiscoveryPlugin', UsdShadersDiscoveryPlugin)
}
