// Ported from OpenUSD 26.11.1: pxr/usd/usdShade/shaderDefParser.cpp,
//  pxr/usd/usdShade/shaderDefParser.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdShadeShaderDefParserPlugin port from OpenUSD v26.11.1
// pxr/usd/usdShade/shaderDefParser.cpp.

import { type Stage } from 'typescript-usd/usd'
import {
  RegisterParserPlugin as SdrRegisterParserPlugin,
  ShaderNode as SdrShaderNode,
  NodeDiscoveryResult as SdrShaderNodeDiscoveryResult,
  Metadata as SdrMetadata,
} from 'typescript-usd/sdr'
import { Shader } from './shader.ts'
import {
  _shaderDefResolveSourceAsset,
  _shaderDefRootLayerPath,
  ShaderDefUtils,
} from './shaderDefUtils.ts'

// SdrParserPlugin::GetInvalidShaderNode (sdr/parserPlugin.cpp:64-83): a
// node with the discovery result's identity and no properties, hence
// invalid.
function invalidShaderNode(dr: SdrShaderNodeDiscoveryResult): SdrShaderNode {
  return new SdrShaderNode(
    dr.identifier, dr.version, dr.name, dr.function, 'unknown discovery type',
    'unknown shading system', dr.resolvedUri, dr.resolvedUri, [])
}

// _GetSdrMetadata (shaderDefParser.cpp:30-56): the discovery result's
// metadata, then the shader's sdrMetadata for keys it does not already
// have, the primvars string and the discovery type as context.
function sdrMetadataFor(shaderDef: Shader, dr: SdrShaderNodeDiscoveryResult): SdrMetadata {
  const metadata: SdrMetadata = { ...(dr.metadata ?? {}) }
  for (const [key, value] of Object.entries(shaderDef.getSdrMetadata())) {
    if (!(key in metadata)) metadata[key] = value
  }
  const primvarsStr = ShaderDefUtils.getPrimvarNamesMetadataString(metadata, shaderDef.connectableAPI())
  if (primvarsStr) metadata['primvars'] = primvarsStr
  // NOTE: discoveryType as context will be replaced in a future release with
  // shader-specific terms that have correct "context" semantics.
  metadata['context'] = dr.discoveryType
  return metadata
}

export class ShaderDefParserPlugin {
  // Upstream ParseShaderNode opens the definitions stage of a discovery
  // result with SdfLayer::FindOrOpen(discoveryResult.resolvedUri) and
  // UsdStage::Open, through a stage cache (shaderDefParser.cpp:62-71); here
  // stages open asynchronously, so a parser constructed with a definitions
  // stage records it by its root layer path, and results are parsed against
  // the stage of their resolved URI (falling back to the parser's own stage).
  private static readonly _stagesByUri = new Map<string, Stage>()

  constructor(private readonly stage?: Stage) {
    if (stage) ShaderDefParserPlugin._stagesByUri.set(_shaderDefRootLayerPath(stage), stage)
  }

  // UsdShadeShaderDefParserPlugin::GetDiscoveryTypes / GetShadingSystem
  // (shaderDefParser.cpp:124-142): usda, usdc and usd; any shading system.
  getDiscoveryTypes(): string[] { return ['usda', 'usdc', 'usd'] }
  getShadingSystem(): string { return '' }

  parseShaderNode(discoveryResult: SdrShaderNodeDiscoveryResult): SdrShaderNode
  parseShaderNode(stage: Stage, discoveryResult: SdrShaderNodeDiscoveryResult): SdrShaderNode
  // UsdShadeShaderDefParserPlugin::ParseShaderNode
  // (shaderDefParser.cpp:58-122).
  parseShaderNode(stageOrResult: Stage | SdrShaderNodeDiscoveryResult, maybeResult?: SdrShaderNodeDiscoveryResult): SdrShaderNode {
    const discoveryResult = maybeResult ?? stageOrResult as SdrShaderNodeDiscoveryResult
    const rootLayerPath = discoveryResult.resolvedUri
    const stage = maybeResult ? stageOrResult as Stage
      : ShaderDefParserPlugin._stagesByUri.get(rootLayerPath) ?? this.stage
    if (!stage) return invalidShaderNode(discoveryResult)

    // Fallback to looking for the subidentifier if the identifier does not
    // produce a valid shader def prim.
    let shaderDefPrim
    for (const identifier of [discoveryResult.identifier, discoveryResult.subIdentifier ?? '']) {
      // SdfPath::AppendChild of an invalid prim name is the empty path,
      // which names no prim.
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) continue
      shaderDefPrim = stage.getPrim(`/${identifier}`)
      if (shaderDefPrim) break
    }
    if (!shaderDefPrim) return invalidShaderNode(discoveryResult)

    const shaderDef = new Shader(shaderDefPrim, stage)
    if (!shaderDef.isValid()) return invalidShaderNode(discoveryResult)

    const nodeUriAssetPath = shaderDef.getSourceAsset(discoveryResult.sourceType)
    if (nodeUriAssetPath === undefined) return invalidShaderNode(discoveryResult)

    const resolvedImplementationUri = _shaderDefResolveSourceAsset(stage, nodeUriAssetPath)
    if (!resolvedImplementationUri) {
      console.error(`Unable to resolve path @${nodeUriAssetPath}@ in shader ` +
        `definition file '${rootLayerPath}'`)
      return invalidShaderNode(discoveryResult)
    }

    const metadata = sdrMetadataFor(shaderDef, discoveryResult)
    return new SdrShaderNode(
      discoveryResult.identifier,
      discoveryResult.version,
      discoveryResult.name,
      discoveryResult.function,
      metadata['context'] ?? '',
      discoveryResult.sourceType, /* shadingSystem */
      rootLayerPath,
      resolvedImplementationUri,
      ShaderDefUtils.getProperties(shaderDef.connectableAPI()),
      metadata,
      discoveryResult.sourceCode ?? '',
    )
  }
}

// shaderDefParser.cpp:147: SDR_REGISTER_PARSER_PLUGIN(UsdShadeShaderDefParserPlugin).
// usdShade/plugInfo.json declares the type, so SdrRegistry finds it through Plug.
SdrRegisterParserPlugin('UsdShadeShaderDefParserPlugin', ShaderDefParserPlugin)
