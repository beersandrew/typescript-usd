// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/generatedSchema.usda,
//  pxr/usd/usdMtlx/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/usdMtlx/plugInfo.json:1 and generatedSchema.usda:1.
import 'typescript-usd/usdShade'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { generatedSchemaUsda, plugInfo } from './plugData.ts'

PlugRegistry.GetInstance().RegisterPlugins(plugInfo, {
  usdMtlx: { 'generatedSchema.usda': generatedSchemaUsda },
})

// OpenUSD v26.11.1 usdMtlx/fileFormat.cpp:55-58 registers the Sdf format.
import { _sdfRegisterFileFormat } from 'typescript-usd/sdf/_internal'
import { UsdMtlxFileFormat } from '../fileFormat.ts'
_sdfRegisterFileFormat(new UsdMtlxFileFormat())

// discovery.cpp:231 and parser.cpp:648 register the Sdr plugin types that
// plugInfo.json declares (UsdMtlxDiscoveryPlugin, UsdMtlxParserPlugin), so
// SdrRegistry finds them through Plug.
import '../discovery.ts'
import '../parser.ts'
