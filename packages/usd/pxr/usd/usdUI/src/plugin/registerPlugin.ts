// Ported from OpenUSD 26.11.1: pxr/usd/usdUI/generatedSchema.usda,
//  pxr/usd/usdUI/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdUI/plugInfo.json and generatedSchema.usda: link-time
// schema registration. usdUI's schemas build on the libraries imported here
// (usdUI/CMakeLists.txt LIBRARIES: usd only).
import {Registry as PlugRegistry} from 'typescript-usd/plug'
import {plugInfo,generatedSchemaUsda} from './plugData.ts'
PlugRegistry.GetInstance().RegisterPlugins(plugInfo,{usdUI:{'generatedSchema.usda':generatedSchemaUsda}})
