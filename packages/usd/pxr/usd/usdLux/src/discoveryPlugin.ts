// Ported from OpenUSD 26.11.1: pxr/usd/usdLux/discoveryPlugin.cpp,
//  pxr/usd/usdLux/discoveryPlugin.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdLux/discoveryPlugin.{h,cpp}
// (UsdLux_DiscoveryPlugin, a private class of usdLux).
import './plugin/registerPlugin.ts'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { Type as TfType } from 'typescript-usd/tf'
import { SchemaRegistry as UsdSchemaRegistry } from 'typescript-usd/usd'
import {
  RegisterDiscoveryPlugin as SdrRegisterDiscoveryPlugin,
  Version as SdrVersion,
  type DiscoveryPlugin as SdrDiscoveryPlugin,
  type NodeDiscoveryResult as SdrShaderNodeDiscoveryResult,
} from 'typescript-usd/sdr'
import { UsdLux_LightDefParserPlugin } from './lightDefParser.ts'

export class UsdLux_DiscoveryPlugin implements SdrDiscoveryPlugin {
  // UsdLux_DiscoveryPlugin::GetSearchURIs (discoveryPlugin.cpp:21-26).
  getSearchURIs(): string[] {
    return []
  }

  // UsdLux_DiscoveryPlugin::DiscoverShaderNodes (discoveryPlugin.cpp:28-95).
  discoverShaderNodes(): SdrShaderNodeDiscoveryResult[] {
    const result: SdrShaderNodeDiscoveryResult[] = []

    // We want to discover nodes for all concrete schema types that derive from
    // UsdLuxBoundableLightBase and UsdLuxNonboundableLightBase. We'll filter
    // out types that aren't defined in UsdLux as we process them.
    const boundableLightType = TfType.findByName('UsdLuxBoundableLightBase')
    const nonboundableLightType = TfType.findByName('UsdLuxNonboundableLightBase')

    const types = new Set<TfType>()
    for (const type of PlugRegistry.getAllDerivedTypes(boundableLightType)) types.add(type)
    for (const type of PlugRegistry.getAllDerivedTypes(nonboundableLightType)) types.add(type)

    // We include certain API schema types in the discovery results.
    // - MeshLightAPI
    // - VolumeLightAPI
    // Current UsdLux OM specified MeshLightAPI and VolumeLightAPI as basically
    // the types for MeshLight and VolumeLight, also notice shaderId defined for
    // these API types is MeshLight and VolumeLight respectively.
    const shaderIdToAPITypeNameMap =
      UsdLux_LightDefParserPlugin._getShaderIdToAPITypeNameMap()

    // Collect all typenames for which we need to associate discovered nodes.
    const typeNames: string[] = []
    // PLUG_THIS_PLUGIN.
    const thisPlugin = PlugRegistry.GetInstance().GetPluginWithName('usdLux')
    for (const type of types) {
      // Filter out types that weren't declared in the UsdLux library itself.
      if (!thisPlugin?.declaresType(type)) {
        continue
      }

      const name = UsdSchemaRegistry.getConcreteSchemaTypeName(type)
      // The type name from the schema registry will be empty if the type is
      // not concrete (i.e. abstract); we skip abstract types.
      if (name !== '') {
        // The schema type name is the name and identifier.
        typeNames.push(name)
      }
    }
    for (const shaderId of shaderIdToAPITypeNameMap.keys()) {
      typeNames.push(shaderId)
    }

    for (const typeName of typeNames) {
      // The URIs are left empty as these nodes can be populated from the
      // schema registry prim definitions.
      result.push({
        identifier: typeName,
        version: new SdrVersion().getAsDefault(),
        name: typeName,
        function: '',
        discoveryType: UsdLux_LightDefParserPlugin._getDiscoveryType(),
        sourceType: UsdLux_LightDefParserPlugin._getShadingSystem(),
        uri: '',
        resolvedUri: '',
      })
    }
    return result
  }
}

// discoveryPlugin.cpp:97: SDR_REGISTER_DISCOVERY_PLUGIN(UsdLux_DiscoveryPlugin).
// usdLux/plugInfo.json declares the type, so SdrRegistry finds it through Plug.
SdrRegisterDiscoveryPlugin('UsdLux_DiscoveryPlugin', UsdLux_DiscoveryPlugin)
