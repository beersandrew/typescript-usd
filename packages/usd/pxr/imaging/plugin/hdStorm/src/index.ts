// Ported from OpenUSD 26.11.1: pxr/imaging/plugin/hdStorm/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/hdStorm — pxr/imaging/plugin/hdStorm (OpenUSD 26.11.1): the
// HdRendererPlugin that creates Storm's HdStRenderDelegate.
//
// Upstream the plugin's TF_REGISTRY_FUNCTION(TfType) block runs when hdStorm
// is loaded and pxr/imaging/plugin/hdStorm/plugInfo.json supplies the
// plugin's displayName ("GL") and priority (0); importing this module plays
// that part.

import { HdStormRendererPlugin_Register } from './rendererPlugin.ts'
HdStormRendererPlugin_Register()

export {
  HdStormRendererPlugin as RendererPlugin,
  HdStormRendererPluginId as RendererPluginId,
  HdStormRendererPluginInfo as RendererPluginInfo,
  HdStormRendererPlugin_Register as _RegisterRendererPlugin,
} from './rendererPlugin.ts'
