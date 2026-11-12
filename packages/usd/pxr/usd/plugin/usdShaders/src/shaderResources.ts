// Ported from OpenUSD 26.11.1: pxr/usd/plugin/usdShaders/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The usdShaders plugin registration that makes its shader files available
// as plugin resources: pxr/usd/plugin/usdShaders/plugInfo.json's
// "ShaderResources": "shaders" (plugInfo.json:9-11), with the files of
// ../shaders (OpenUSD 26.11.1; see ../shaders/PROVENANCE.md) attached as
// inline strings, as hdSt does (pxr/imaging/hdSt/src/shaderResources.ts).
//
// ResourcePath is the virtual directory the resources live under, mirroring
// the installed lib/usd/usdShaders/resources (as hdSt's, imaging/hdSt/src/
// shaderResources.ts): the shader files are '<ResourcePath>/shaders/<file>',
// the plugin resource files Ar finds, opens and reports as existing
// (ar/src/platformFilesystem.ts), so UsdShadeShaderDefUtils' existence check
// of the sourceAsset paths passes as upstream's on the installed files does.
// The directory is fixed, not derived from the module's URL: in a bundle
// every plugin's module shares one directory, and two plugins sharing a
// resource directory would have each other's shaderDefs.usda.
//
// The "Types" entry (UsdShadersDiscoveryPlugin, plugInfo.json:4-8) is the
// SdrDiscoveryPlugin type SdrRegistry finds through Plug
// (discoveryPlugin.ts).

import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { UsdShaders_ShaderResourceFiles } from './shaders.generated.ts'

/** The usdShaders plugin's ResourcePath (PlugPlugin::GetResourcePath). */
export function UsdShaders_GetResourcePath(): string {
  return '/usd/usdShaders/resources'
}

/** usdShaders/plugInfo.json; see above. */
export function UsdShaders_PlugInfo(): PlugInfo {
  return {
    Plugins: [
      {
        Info: {
          Types: {
            UsdShadersDiscoveryPlugin: {
              bases: ['SdrDiscoveryPlugin'],
              displayName: 'USD-based shader definition discovery plugin.',
            },
          },
          ShaderResources: 'shaders',
        },
        LibraryPath: '@PLUG_INFO_LIBRARY_PATH@',
        Name: 'usdShaders',
        ResourcePath: UsdShaders_GetResourcePath(),
        Root: '@PLUG_INFO_ROOT@',
        Type: 'library',
      },
    ],
  }
}

/** Register the usdShaders plugin with its shader resources. Idempotent. */
export function UsdShaders_RegisterShaderResources(): void {
  PlugRegistry.GetInstance().RegisterPlugins(UsdShaders_PlugInfo(),
    { usdShaders: UsdShaders_ShaderResourceFiles })
}
