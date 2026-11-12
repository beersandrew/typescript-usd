// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usdGeom/generatedSchema.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Registers the usdGeom schema plugin (vendored upstream artifacts) with
// typescript-usd/plug at import time — the TS analog of upstream's link-time plugin
// registration. Importing typescript-usd/usd first guarantees the core plugin
// (UsdSchemaBase/UsdTyped/UsdAPISchemaBase) is registered before this
// domain's types declare bases into the graph.

import 'typescript-usd/usd'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { generatedSchemaUsda, plugInfo } from './plugData.ts'

PlugRegistry.GetInstance().RegisterPlugins(plugInfo, {
  usdGeom: { 'generatedSchema.usda': generatedSchemaUsda },
})
