// Ported from OpenUSD 26.11.1: pxr/usd/usdLod/generatedSchema.usda,
//  pxr/usd/usdLod/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdLod/plugInfo.json and generatedSchema.usda: link-time
// schema registration. usdLod's schemas build on the libraries imported here
// (usdLod/CMakeLists.txt LIBRARIES: usdGeom).
import 'typescript-usd/usdGeom'
import {Registry as PlugRegistry} from 'typescript-usd/plug'
import {plugInfo,generatedSchemaUsda} from './plugData.ts'
PlugRegistry.GetInstance().RegisterPlugins(plugInfo,{usdLod:{'generatedSchema.usda':generatedSchemaUsda}})
