// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/shaders/pointId.glslfx,
//  pxr/imaging/hio/glslfx.cpp
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The hdx plugin registration that makes hdx's glslfx shader files available
// as plugin resources: a port of pxr/imaging/hdx/plugInfo.json (OpenUSD
// 26.11.1, plugInfo.json:1-15), with the vendored files of
// pxr/imaging/hdx/shaders/ attached at registration.
//
// Upstream discovers hdx/plugInfo.json on disk and Storm's shaders import
// $TOOLS/hdx/shaders/selection.glslfx (hdSt/shaders/pointId.glslfx) through it
// (hio/glslfx.cpp:64-149). Here the plugin is registered with its resources
// attached as inline strings and HioGlslfx reads them through PlugRegistry
// (pxr/imaging/hio/src/glslfx.ts). ResourcePath is the virtual directory the
// resources live under, mirroring the installed lib/usd/hdx/resources.

import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { Hdx_ShaderResourceFiles } from './shaders.generated.ts'

/** hdx/plugInfo.json (plugInfo.json:1-15). */
export const Hdx_PlugInfo: PlugInfo = {
  Plugins: [
    {
      Info: {
        ShaderResources: 'shaders',
      },
      LibraryPath: '@PLUG_INFO_LIBRARY_PATH@',
      Name: 'hdx',
      ResourcePath: '/usd/hdx/resources',
      Root: '@PLUG_INFO_ROOT@',
      Type: 'library',
    },
  ],
}

/**
 * Register the hdx plugin with its shader resources. Idempotent: PlugRegistry
 * ignores a second registration of the same plugin name.
 */
export function Hdx_RegisterShaderResources(): void {
  PlugRegistry.GetInstance().RegisterPlugins(Hdx_PlugInfo, { hdx: Hdx_ShaderResourceFiles })
}
