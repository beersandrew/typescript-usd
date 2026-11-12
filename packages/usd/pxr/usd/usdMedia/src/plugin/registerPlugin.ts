// Ported from OpenUSD 26.11.1: pxr/usd/usdMedia/generatedSchema.usda,
//  pxr/usd/usdMedia/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdMedia/plugInfo.json and generatedSchema.usda: link-time
// schema registration. usdMedia's schemas build on the libraries imported here
// (usdMedia/CMakeLists.txt LIBRARIES: usdGeom).
import 'typescript-usd/usdGeom'
import {Registry as PlugRegistry} from 'typescript-usd/plug'
import {plugInfo,generatedSchemaUsda} from './plugData.ts'
PlugRegistry.GetInstance().RegisterPlugins(plugInfo,{usdMedia:{'generatedSchema.usda':generatedSchemaUsda}})
