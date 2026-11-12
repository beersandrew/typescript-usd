// Ported from OpenUSD 26.11.1: pxr/usd/usdHydra/discoveryPlugin.cpp,
//  pxr/usd/usdHydra/discoveryPlugin.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdHydra/discoveryPlugin.{h,cpp} (OpenUSD 26.11.1):
// UsdHydraDiscoveryPlugin, which discovers the deprecated Hydra shader
// definitions of shaders/shaderDefs.usda (among them the HwFieldReader_*
// volume field readers Storm's material network recognizes by their
// "field" role).
//
// FAITHFULNESS-DEBT(sdr-shaderdefs-stage-open): as for UsdShadersDiscoveryPlugin
// (usd/plugin/usdShaders/src/discoveryPlugin.ts), DiscoverShaderNodes opens
// the definitions stage with UsdStage::Open (discoveryPlugin.cpp:59-69);
// Stage.open is asynchronous here, so UsdHydra_RegisterShaderNodesAsync()
// opens the stage first, records it for UsdShadeShaderDefParserPlugin and
// only then runs this plugin's SDR_REGISTER_DISCOVERY_PLUGIN
// (discoveryPlugin.cpp:99), after which SdrRegistry finds the type
// usdHydra/plugInfo.json declares through Plug -> a synchronous UsdStage
// open of a plugin resource layer.

import './plugin/registerPlugin.ts'
import { Registry as PlugRegistry, PlugFindPluginResource } from 'typescript-usd/plug'
import { Stage } from 'typescript-usd/usd'
import { ShaderDefParserPlugin, ShaderDefUtils } from 'typescript-usd/usdShade'
import {
  RegisterDiscoveryPlugin as SdrRegisterDiscoveryPlugin,
  type DiscoveryPlugin as SdrDiscoveryPlugin,
  type NodeDiscoveryResult as SdrShaderNodeDiscoveryResult,
} from 'typescript-usd/sdr'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError, TfStringCatPaths } from 'typescript-usd/tf'
import { UsdHydra_ResourcePath } from './plugin/registerPlugin.ts'

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

/** The usdHydra plugin's ResourcePath (PlugPlugin::GetResourcePath; see
 *  plugin/registerPlugin.ts). */
export function UsdHydra_GetResourcePath(): string {
  return UsdHydra_ResourcePath
}

/** discoveryPlugin.cpp:29-40 _GetShaderResourcePath (PLUG_THIS_PLUGIN is
 *  the usdHydra plugin). */
function _GetShaderResourcePath(resourceName = ''): string {
  const plugin = PlugRegistry.GetInstance().GetPluginWithName('usdHydra')
  const path = PlugFindPluginResource(plugin, TfStringCatPaths('shaders', resourceName))
  TF_VERIFY(path !== '', `Could not find shader resource: ${resourceName}\n`)
  return path
}

/** discoveryPlugin.h:20-31 */
// The definitions stage UsdHydra_LoadDiscoveryPluginAsync opened (see
// sdr-shaderdefs-stage-open above).
let _shaderDefsStage: Stage | undefined

export class UsdHydraDiscoveryPlugin implements SdrDiscoveryPlugin {
  /** discoveryPlugin.cpp:42-47 */
  getSearchURIs(): string[] {
    return [_GetShaderResourcePath()]
  }

  /** discoveryPlugin.cpp:49-97 */
  discoverShaderNodes(): SdrShaderNodeDiscoveryResult[] {
    const result: SdrShaderNodeDiscoveryResult[] = []

    const shaderDefsFile = _GetShaderResourcePath('shaderDefs.usda')
    if (!shaderDefsFile) return result
    // The stage UsdStage::Open opens (discoveryPlugin.cpp:59-69), opened
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

/** @internal The asynchronous part of loading the usdHydra plugin (see
 *  sdr-shaderdefs-stage-open above): opens the definitions stage, records it
 *  for UsdShadeShaderDefParserPlugin, and registers the discovery plugin
 *  type (discoveryPlugin.cpp:99). */
export async function UsdHydra_LoadDiscoveryPluginAsync(): Promise<void> {
  const shaderDefsFile = _GetShaderResourcePath('shaderDefs.usda')
  const stage = shaderDefsFile ? await Stage.open(shaderDefsFile) : undefined
  if (stage) {
    // A parser constructed with a definitions stage records it by its root
    // layer path, for the parser SdrRegistry instantiates.
    new ShaderDefParserPlugin(stage)
  }
  _shaderDefsStage = stage
  SdrRegisterDiscoveryPlugin('UsdHydraDiscoveryPlugin', UsdHydraDiscoveryPlugin)
}
