// Ported from OpenUSD 26.11.1: pxr/usd/usdLux/lightDefParser.cpp,
//  pxr/usd/usdLux/lightDefParser.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdLux/lightDefParser.{h,cpp}
// (UsdLux_LightDefParserPlugin, a private class of usdLux).
import { Stage } from 'typescript-usd/usd'
import { Layer, sdfCopySpec } from 'typescript-usd/sdf'
import {
  RegisterParserPlugin as SdrRegisterParserPlugin,
  ShaderNode as SdrShaderNode,
  type Metadata as SdrMetadata,
  type NodeDiscoveryResult as SdrShaderNodeDiscoveryResult,
  type ParserPlugin as SdrParserPlugin,
} from 'typescript-usd/sdr'
import { ShaderDefUtils as UsdShadeShaderDefUtils } from 'typescript-usd/usdShade'
import { generatedSchemaUsda } from './plugin/plugData.ts'

// lightDefParser.cpp:23-36.
const _tokens = {
  /* NOTE: shadingSystem will change to 'abstract' in a future release */
  shadingSystem: 'USD',
  discoveryType: 'usd-schema-gen',
  MeshLight: 'MeshLight',
  MeshLightAPI: 'MeshLightAPI',
  LightAPI: 'LightAPI',
  ShadowAPI: 'ShadowAPI',
  ShapingAPI: 'ShapingAPI',
  VolumeLight: 'VolumeLight',
  VolumeLightAPI: 'VolumeLightAPI',
} as const

// _GetSdrMetadata (lightDefParser.cpp:64-86). The connectable prim is given
// by its stage and path.
function _GetSdrMetadata(
  stage: Stage, primPath: string, discoveryResultMetadata: SdrMetadata,
): SdrMetadata {
  const metadata: SdrMetadata = { ...discoveryResultMetadata }
  metadata['help'] = `Fallback shader node generated from the USD ${
    stage.getPrim(primPath)?.typeName ?? ''} schema`
  const primvarsStr = UsdShadeShaderDefUtils.getPrimvarNamesMetadataString(
    metadata['primvars'] ?? '', stage, primPath)
  if (primvarsStr !== '') {
    metadata['primvars'] = primvarsStr
  }
  metadata['subdomain'] = 'lighting'
  metadata['context'] = 'light'
  return metadata
}

// _GetGeneratedSchema (lightDefParser.cpp:88-96): the plugin's
// generatedSchema.usda opened as an anonymous layer. The resource is read
// from the plugin data this library registers with Plug.
function _GetGeneratedSchema(): Layer | undefined {
  const layer = Layer.createAnonymous('generatedSchema.usda')
  return layer.importFromString(generatedSchemaUsda) ? layer : undefined
}

// _CopyPropertiesFromSchema (lightDefParser.cpp:98-130).
function _CopyPropertiesFromSchema(
  schemaLayer: Layer, schemaName: string, destLayer: Layer, destPath: string,
): boolean {
  // The path of schema prim in the generated schema layer is its schema name.
  const schemaSpec = schemaLayer.getPrimAtPath(`/${schemaName}`)
  if (!schemaSpec) {
    // TF_CODING_ERROR: the generatedSchema has no prim spec for schemaName.
    return false
  }

  // Copy all the schema's properties to the destination.
  for (const propSpec of schemaSpec.getProperties()) {
    if (!sdfCopySpec(schemaLayer, propSpec.getPath(),
      destLayer, `${destPath}.${propSpec.getPath().name}`)) {
      // TF_CODING_ERROR: could not copy the property spec.
      return false
    }
  }
  return true
}

export class UsdLux_LightDefParserPlugin implements SdrParserPlugin {
  // lightDefParser.cpp:39-62.
  static _getShadingSystem(): string { return _tokens.shadingSystem }
  static _getDiscoveryType(): string { return _tokens.discoveryType }
  // Mapping of shaderId to Typenames for API schemas which we want to have a
  // sdr representation like concrete UsdLux light types.
  static _getShaderIdToAPITypeNameMap(): ReadonlyMap<string, string> {
    return _shaderIdToAPITypeNameMap
  }

  // UsdLux_LightDefParserPlugin::ParseShaderNode (lightDefParser.cpp:131-226).
  // SdrParserPlugin::GetInvalidShaderNode is a node with no properties.
  parseShaderNode(discoveryResult: SdrShaderNodeDiscoveryResult): SdrShaderNode {
    const shaderIdToAPITypeNameMap = _shaderIdToAPITypeNameMap

    // If discoveryResult identifier is a shaderId corresponding to one of the
    // API schemas for which we are generating sdr representation, then go and
    // fetch the name of the API schema which will then be used to extract
    // properties from the generatedSchema
    const primTypeName =
      shaderIdToAPITypeNameMap.get(discoveryResult.identifier) ?? discoveryResult.identifier

    // This parser wants to pull all the shader properties from the schema
    // defined properties of the base UsdLux light type as well as the shader
    // properties that can be included via applying the Shadow and Shaping APIs.
    // However, it does NOT want to pull in any shader properties that could
    // possibly come in from other plugins that may define API schemas that
    // would auto apply to any of these lights (or to the LightAPI itself).

    // Find and open the generated schema layer.
    const schemaLayer = _GetGeneratedSchema()
    if (!schemaLayer) {
      return _GetInvalidShaderNode(discoveryResult)
    }

    // Since we're composing the prim ourselves create a new layer and prim
    // spec where we'll add all the properties.
    // Divergence: upstream creates an anonymous layer and then opens a stage
    // on it with UsdStage::Open (lightDefParser.cpp:171-174, 197-200). Stage
    // opening is asynchronous here and parsing is synchronous, so the prim is
    // composed in the root layer of a new in-memory stage instead.
    const stage = Stage.createNew()
    const layer = stage.getRootLayer()
    const primPath = `/${primTypeName}`
    stage.definePrim(primPath)

    // All of the UsdLux intrinsic lights will directly include LightAPI so it
    // will have all the properties from LightAPI as well as any it defines
    // itself. We also need to include the ShadowAPI and ShapingAPI properties
    // as these can be optionally applied to any light. We copy the properties
    // from each of the schema type prim specs over to the composed prim spec.
    // Note, that the order we copy is important as the light type itself may
    // have properties that override properties that come from the LightAPI.
    const schemas = [
      _tokens.LightAPI,
      primTypeName,
      _tokens.ShadowAPI,
      _tokens.ShapingAPI,
    ]
    for (const schemaName of schemas) {
      // It's important that we copy just the properties. Prim fields like
      // the typeName, apiSchemas, and the property children can affect what
      // properties are included when we open this prim on a USD stage.
      if (!_CopyPropertiesFromSchema(schemaLayer, schemaName, layer, primPath)) {
        return _GetInvalidShaderNode(discoveryResult)
      }
    }

    if (!stage.getPrim(primPath)) {
      return _GetInvalidShaderNode(discoveryResult)
    }

    // Note that we don't check the "conformance" of this prim to the
    // connectable API because the prim is untyped and will not conform. But
    // conformance isn't necessary for using UsdShadeConnectableAPI in order
    // to get input and output properties from a prim as is require in the
    // functions called below.
    const metadata = _GetSdrMetadata(stage, primPath, discoveryResult.metadata ?? {})
    return new SdrShaderNode(
      discoveryResult.identifier,
      discoveryResult.version,
      discoveryResult.name,
      discoveryResult.function,
      // SdrShaderNode's constructor takes its context from the metadata
      // (sdr/shaderNode.h:62-86).
      metadata['context']!,
      _tokens.shadingSystem,
      /*nodeUriAssetPath=*/ '',
      /*resolvedImplementationUri=*/ '',
      UsdShadeShaderDefUtils.getProperties(stage, primPath),
      metadata,
      discoveryResult.sourceCode ?? '',
    )
  }

  // lightDefParser.cpp:228-233.
  getDiscoveryTypes(): string[] {
    return [UsdLux_LightDefParserPlugin._getDiscoveryType()]
  }

  // lightDefParser.cpp:235-239.
  getShadingSystem(): string {
    return UsdLux_LightDefParserPlugin._getShadingSystem()
  }
}

// lightDefParser.cpp:53-62.
const _shaderIdToAPITypeNameMap: ReadonlyMap<string, string> = new Map([
  [_tokens.MeshLight, _tokens.MeshLightAPI],
  [_tokens.VolumeLight, _tokens.VolumeLightAPI],
])

// SdrParserPlugin::GetInvalidShaderNode (sdr/parserPlugin.cpp:64-83): a node
// with the discovery result's identity and no properties, so it is not valid.
function _GetInvalidShaderNode(discoveryResult: SdrShaderNodeDiscoveryResult): SdrShaderNode {
  return new SdrShaderNode(
    discoveryResult.identifier,
    discoveryResult.version,
    discoveryResult.name,
    discoveryResult.function,
    'unknown discovery type',
    'unknown shading system',
    discoveryResult.resolvedUri,
    discoveryResult.resolvedUri,
  )
}

// lightDefParser.cpp:241: SDR_REGISTER_PARSER_PLUGIN(UsdLux_LightDefParserPlugin).
// usdLux/plugInfo.json declares the type, so SdrRegistry finds it through Plug.
SdrRegisterParserPlugin('UsdLux_LightDefParserPlugin', UsdLux_LightDefParserPlugin)
