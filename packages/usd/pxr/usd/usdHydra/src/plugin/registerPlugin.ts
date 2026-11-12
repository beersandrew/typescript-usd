// Ported from OpenUSD 26.11.1: pxr/usd/usdHydra/generatedSchema.usda,
//  pxr/usd/usdHydra/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdHydra/plugInfo.json and generatedSchema.usda: link-time
// schema registration. usdHydra's schemas build on the libraries imported here
// (usdHydra/CMakeLists.txt LIBRARIES: usdShade).
//
// The plugin's resources are attached here: generatedSchema.usda and the
// shader files of ../../shaders (shaders.generated.ts), which
// UsdHydraDiscoveryPlugin finds with PlugFindPluginResource. ResourcePath is
// the virtual directory they live under, mirroring the installed
// lib/usd/usdHydra/resources (the value the build substitutes for
// plugInfo.json's @PLUG_INFO_RESOURCE_PATH@), as hdSt's
// (imaging/hdSt/src/shaderResources.ts): Ar finds and opens the files there
// (ar/src/platformFilesystem.ts).
import 'typescript-usd/usdShade'
import {Registry as PlugRegistry} from 'typescript-usd/plug'
import {plugInfo,generatedSchemaUsda} from './plugData.ts'
import {UsdHydra_ShaderResourceFiles} from '../shaders.generated.ts'

/** The usdHydra plugin's ResourcePath; see above. */
export const UsdHydra_ResourcePath = '/usd/usdHydra/resources'

PlugRegistry.GetInstance().RegisterPlugins(
  {Plugins: (plugInfo.Plugins ?? []).map(plugin => ({...plugin, ResourcePath: UsdHydra_ResourcePath}))},
  {usdHydra: {'generatedSchema.usda': generatedSchemaUsda, ...UsdHydra_ShaderResourceFiles}})
