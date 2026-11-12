// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdExecImaging/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// pxr/usdImaging/usdExecImaging/plugInfo.json (OpenUSD 26.11.1), verbatim,
// registered with typescript-usd/plug when this module loads: the TS analog
// of upstream discovering the plugInfo.json installed with the
// usdExecImaging library. The Types entry declares
// UsdExecImaging_StageSceneIndex (base UsdImagingStageSceneIndexInterface) to
// the plugin system; stageSceneIndex.ts defines it and sets its factory.
//
// The plugin is registered without a plugInfo URL, so PlugPlugin treats it as
// part of this build, already loaded (plug/src/plugin.ts): the library's
// code is this module graph, which is loaded by importing
// typescript-usd/usdExecImaging.

import 'typescript-usd/usdImaging'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'

/** plugInfo.json:1-20 */
export const UsdExecImaging_PlugInfo: PlugInfo = {
  Plugins: [
    {
      Info: {
        Types: {
          UsdExecImaging_StageSceneIndex: {
            bases: [
              'UsdImagingStageSceneIndexInterface',
            ],
          },
        },
      },
      LibraryPath: '@PLUG_INFO_LIBRARY_PATH@',
      Name: 'usdExecImaging',
      ResourcePath: '@PLUG_INFO_RESOURCE_PATH@',
      Root: '@PLUG_INFO_ROOT@',
      Type: 'library',
    },
  ],
}

PlugRegistry.GetInstance().RegisterPlugins(UsdExecImaging_PlugInfo)
