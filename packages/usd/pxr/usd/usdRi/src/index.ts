// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usdRi/rmanUtilities.h, pxr/usd/usdRi/rmanUtilities.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
// OpenUSD v26.11.1 pxr/usd/usdRi: generated schema classes
// (generatedSchema.classes.txt) and tokens.
export { MaterialAPI } from './materialAPI.ts'
export { SplineAPI } from './splineAPI.ts'
export { StatementsAPI } from './statementsAPI.ts'
export { UsdRiTokens as Tokens } from './tokens.ts'
// Hand-written upstream API: rmanUtilities.{h,cpp} (typeUtils is private).
export {
  convertToRManInterpolateBoundary,
  convertFromRManInterpolateBoundary,
  convertToRManFaceVaryingLinearInterpolation,
  convertFromRManFaceVaryingLinearInterpolation,
  convertToRManTriangleSubdivisionRule,
  convertFromRManTriangleSubdivisionRule,
  convertRManSetSpecificationToListOp,
  doesAttributeUseSetSpecification,
} from './rmanUtilities.ts'
