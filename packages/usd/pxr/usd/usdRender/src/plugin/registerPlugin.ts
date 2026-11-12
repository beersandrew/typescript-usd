// Ported from OpenUSD 26.11.1: pxr/usd/usdRender/generatedSchema.usda,
//  pxr/usd/usdRender/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdRender/plugInfo.json and generatedSchema.usda: link-time
// schema registration. usdRender's schemas build on the libraries imported here
// (usdRender/CMakeLists.txt LIBRARIES: usdGeom, usdShade).
import 'typescript-usd/usdGeom'
import 'typescript-usd/usdShade'
import {Registry as PlugRegistry} from 'typescript-usd/plug'
import {plugInfo,generatedSchemaUsda} from './plugData.ts'
PlugRegistry.GetInstance().RegisterPlugins(plugInfo,{usdRender:{'generatedSchema.usda':generatedSchemaUsda}})
