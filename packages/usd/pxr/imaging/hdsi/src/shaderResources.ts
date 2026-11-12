// Ported from OpenUSD 26.11.1: pxr/imaging/hdsi/backPlateSceneIndex.cpp,
//  pxr/imaging/hdsi/debuggingSceneIndexPlugin.cpp,
//  pxr/imaging/hdsi/primIdSceneIndexPlugin.cpp,
//  pxr/imaging/hdsi/shaders/unlitShader.glslfx
// Copyright 2025, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The hdsi plugin registration that makes hdsi's glslfx shader files
// available as plugin resources: a port of pxr/imaging/hdsi/plugInfo.json
// (OpenUSD 26.11.1, plugInfo.json:1-34), with the vendored files of
// pxr/imaging/hdsi/shaders/ attached at registration.
//
// Upstream discovers hdsi/plugInfo.json on disk and HdsiBackPlateSceneIndex
// names its shaders/unlitShader.glslfx with PlugFindPluginResource
// (backPlateSceneIndex.cpp:600-606). Here the plugin is registered with its
// resources attached as inline strings and HioGlslfx reads them through
// PlugRegistry (pxr/imaging/hio/src/glslfx.ts). ResourcePath is the virtual
// directory the resources live under, mirroring the installed
// lib/usd/hdsi/resources.
//
// Its "Types" entry for HdsiPrimIdSceneIndexPlugin (plugInfo.json:12-23,
// loaded with every renderer) is declared here; primIdSceneIndexPlugin.ts
// defines the type's factory and registration.
//
// FAITHFULNESS-DEBT(hdsi-scene-index-plugins): the "Types" entry of
// hdsi/plugInfo.json for HdsiDebuggingSceneIndexPlugin (plugInfo.json:6-11)
// is left out because that plugin (debuggingSceneIndexPlugin.cpp) is not
// ported; HdSceneIndexPluginRegistry would report a declared plugin without
// a factory -> port it and add its Type here.

import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { Hdsi_ShaderResourceFiles } from './shaders.generated.ts'

/** hdsi/plugInfo.json (plugInfo.json:1-34) less the debugging plugin's
 *  Type; see above. */
export const Hdsi_PlugInfo: PlugInfo = {
  Plugins: [
    {
      Info: {
        Types: {
          HdsiPrimIdSceneIndexPlugin: {
            bases: ['HdSceneIndexPlugin'],
            loadWithRenderer: '',
            priority: 0,
            displayName: 'Add prim id scene index if corresponding env var is set.',
            // Make it run as one the last scene indices.
            tags: ['hdsi:primId'],
            ordering: {
              after: ['hd:sceneAssembly', 'hd:sceneGlobals'],
              position: 'lastBefore',
            },
          },
        },
      },
      LibraryPath: '@PLUG_INFO_LIBRARY_PATH@',
      Name: 'hdsi',
      ResourcePath: '/usd/hdsi/resources',
      Root: '@PLUG_INFO_ROOT@',
      Type: 'library',
    },
  ],
}

/**
 * Register the hdsi plugin with its shader resources. Idempotent: PlugRegistry
 * ignores a second registration of the same plugin name.
 */
export function Hdsi_RegisterShaderResources(): void {
  PlugRegistry.GetInstance().RegisterPlugins(Hdsi_PlugInfo, { hdsi: Hdsi_ShaderResourceFiles })
}
