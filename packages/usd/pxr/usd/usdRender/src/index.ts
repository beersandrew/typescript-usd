// Portions ported from OpenUSD 26.11.1, including: pxr/usd/usdRender/spec.h,
//  pxr/usd/usdRender/spec.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
// OpenUSD v26.11.1 pxr/usd/usdRender: generated schema classes
// (generatedSchema.classes.txt) and tokens.
export { Pass } from './pass.ts'
export { Product } from './product.ts'
export { Settings } from './settings.ts'
export { SettingsBase } from './settingsBase.ts'
export { Var } from './var.ts'
export { UsdRenderTokens as Tokens } from './tokens.ts'
// Hand-written upstream API: spec.{h,cpp}.
export { computeSpec, computeNamespacedSettings } from './spec.ts'
export type { Spec, SpecProduct, SpecRenderVar, SpecDictionary } from './spec.ts'
