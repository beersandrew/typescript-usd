// Ported from OpenUSD 26.11.1: pxr/usd/usdProfiles/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 usdProfiles/plugInfo.json: link-time schema registration.
import 'typescript-usd/usd'
import { Registry } from 'typescript-usd/plug'
import { generatedSchemaUsda, plugInfo } from './plugData.ts'
Registry.GetInstance().RegisterPlugins(plugInfo, {
  UsdProfiles: { 'generatedSchema.usda': generatedSchemaUsda },
})
