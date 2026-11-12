// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/generatedSchema.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Registers the usd core schema plugin (vendored upstream artifacts) with
// typescript-usd/plug at import time — the TS analog of upstream's link-time plugin
// registration. Declares UsdSchemaBase/UsdTyped/UsdAPISchemaBase and the
// core API schemas (ModelAPI, CollectionAPI, ClipsAPI, …) into the TfType
// graph and hands the schematics layer to the schema registry.

import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { generatedSchemaUsda, plugInfo } from './plugData.ts'

PlugRegistry.GetInstance().RegisterPlugins(plugInfo, {
  usd: { 'generatedSchema.usda': generatedSchemaUsda },
})
