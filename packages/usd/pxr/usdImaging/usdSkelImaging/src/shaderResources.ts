// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdSkelImaging/package.cpp,
//  pxr/usdImaging/usdSkelImaging/shaders/skinning.glslfx
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The usdSkelImaging plugin registration that makes its glslfx shader file
// available as a plugin resource, as pxr/imaging/hdSt/src/shaderResources.ts
// does for hdSt. Upstream, native usdSkelImaging/CMakeLists.txt installs
// shaders/skinning.glslfx under the plugin's resource path and
// package.cpp:17-26 finds it with PlugFindPluginResource; here the plugin is
// registered with its resource attached as an inline string
// (./shaders.generated.ts). ResourcePath is the virtual directory mirroring
// the installed lib/usd/usdSkelImaging/resources.
//
// The "Types" entries of usdSkelImaging/plugInfo.json (plugInfo.json:4-48,
// adapters and the scene index plugin) are registered from code by
// ./plugInfo.ts and ./resolvingSceneIndexPlugin.ts, as usdImaging does.

import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { UsdSkelImaging_ShaderResourceFiles } from './shaders.generated.ts'

/** usdSkelImaging/plugInfo.json (plugInfo.json:1-57) minus its Types. */
export const UsdSkelImaging_PlugInfo: PlugInfo = {
  Plugins: [
    {
      Info: {},
      LibraryPath: '@PLUG_INFO_LIBRARY_PATH@',
      Name: 'usdSkelImaging',
      ResourcePath: '/usd/usdSkelImaging/resources',
      Root: '@PLUG_INFO_ROOT@',
      Type: 'library',
    },
  ],
}

/** Register the usdSkelImaging plugin with its shader resource. Idempotent:
 *  PlugRegistry ignores a second registration of the same plugin name. */
export function UsdSkelImaging_RegisterShaderResources(): void {
  PlugRegistry.GetInstance().RegisterPlugins(
    UsdSkelImaging_PlugInfo, { usdSkelImaging: UsdSkelImaging_ShaderResourceFiles })
}
