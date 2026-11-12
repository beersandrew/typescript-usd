// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usdLux/blackbody.h,
//  pxr/usd/usdLux/blackbody.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
// OpenUSD v26.11.1 pxr/usd/usdLux: generated schema classes
// (generatedSchema.classes.txt) and tokens.
export { BoundableLightBase } from './boundableLightBase.ts'
export { CylinderLight } from './cylinderLight.ts'
export { DiskLight } from './diskLight.ts'
export { DistantLight } from './distantLight.ts'
export { DomeLight } from './domeLight.ts'
export { DomeLight_1 } from './domeLight_1.ts'
export { GeometryLight } from './geometryLight.ts'
export { LightAPI } from './lightAPI.ts'
export { LightFilter } from './lightFilter.ts'
export { LightListAPI } from './lightListAPI.ts'
export { ListAPI } from './listAPI.ts'
export { MeshLightAPI } from './meshLightAPI.ts'
export { NonboundableLightBase } from './nonboundableLightBase.ts'
export { PluginLight } from './pluginLight.ts'
export { PluginLightFilter } from './pluginLightFilter.ts'
export { PortalLight } from './portalLight.ts'
export { RectLight } from './rectLight.ts'
export { ShadowAPI } from './shadowAPI.ts'
export { ShapingAPI } from './shapingAPI.ts'
export { SphereLight } from './sphereLight.ts'
export { VolumeLightAPI } from './volumeLightAPI.ts'
export { UsdLuxTokens as Tokens } from './tokens.ts'
// Hand-written upstream files: blackbody.{h,cpp} (PUBLIC_CLASSES), and the
// private Sdr discovery/parser plugins discoveryPlugin and lightDefParser,
// which register with the SdrRegistry when imported.
export { BlackbodyTemperatureAsRgb } from './blackbody.ts'
import './lightDefParser.ts'
import './discoveryPlugin.ts'
