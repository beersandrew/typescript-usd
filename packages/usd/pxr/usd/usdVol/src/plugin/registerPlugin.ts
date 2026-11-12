// Ported from OpenUSD 26.11.1: pxr/usd/usdVol/generatedSchema.usda,
//  pxr/usd/usdVol/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdVol/plugInfo.json and generatedSchema.usda: link-time
// schema registration. usdVol's schemas derive from UsdGeomGprim and
// UsdGeomXformable (usdVol/CMakeLists.txt LIBRARIES: tf, usd, usdGeom).
import 'typescript-usd/usdGeom'
import {Registry as PlugRegistry} from 'typescript-usd/plug'
import {plugInfo,generatedSchemaUsda} from './plugData.ts'
PlugRegistry.GetInstance().RegisterPlugins(plugInfo,{usdVol:{'generatedSchema.usda':generatedSchemaUsda}})
