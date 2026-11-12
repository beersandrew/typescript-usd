// Ported from OpenUSD 26.11.1: pxr/usd/usdProc/generatedSchema.usda,
//  pxr/usd/usdProc/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdProc/plugInfo.json and generatedSchema.usda: link-time
// schema registration. usdProc's schemas build on the libraries imported here
// (usdProc/CMakeLists.txt LIBRARIES: usdGeom).
import 'typescript-usd/usdGeom'
import {Registry as PlugRegistry} from 'typescript-usd/plug'
import {plugInfo,generatedSchemaUsda} from './plugData.ts'
PlugRegistry.GetInstance().RegisterPlugins(plugInfo,{usdProc:{'generatedSchema.usda':generatedSchemaUsda}})
