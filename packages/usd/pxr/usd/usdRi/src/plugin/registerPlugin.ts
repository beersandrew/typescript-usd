// Ported from OpenUSD 26.11.1: pxr/usd/usdRi/generatedSchema.usda,
//  pxr/usd/usdRi/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdRi/plugInfo.json and generatedSchema.usda: link-time
// schema registration. usdRi's schemas build on the libraries imported here
// (usdRi/CMakeLists.txt LIBRARIES: usdShade, usdGeom).
import 'typescript-usd/usdShade'
import 'typescript-usd/usdGeom'
import {Registry as PlugRegistry} from 'typescript-usd/plug'
import {plugInfo,generatedSchemaUsda} from './plugData.ts'
PlugRegistry.GetInstance().RegisterPlugins(plugInfo,{usdRi:{'generatedSchema.usda':generatedSchemaUsda}})
