// Ported from OpenUSD 26.11.1: pxr/exec/exec/pluginData.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Registers the execIr schema plugin (OpenUSD 26.11.1 pxr/exec/execIr
// plugInfo.json and generatedSchema.usda, vendored by scripts/usdGenSchema.mjs
// into plugData.ts) with typescript-usd/plug at import time: the TS analog of
// upstream's link-time plugin registration, as in
// pxr/usd/usdGeom/src/plugin/registerPlugin.ts. Importing typescript-usd/usd
// first guarantees the core plugin (UsdSchemaBase/UsdTyped) is registered
// before execIr's types declare their bases into the TfType graph.
//
// The registered plugInfo keeps upstream's Info.Exec block (the
// "allowsPluginComputations" schema entries) and Info.SdfMetadata block
// (irRole, irIsInvertible) verbatim; exec reads Info.Exec through
// PlugPlugin.GetMetadata() (exec/pluginData.cpp).

import 'typescript-usd/usd'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { generatedSchemaUsda, plugInfo } from './plugData.ts'

PlugRegistry.GetInstance().RegisterPlugins(plugInfo, {
  execIr: { 'generatedSchema.usda': generatedSchemaUsda },
})
