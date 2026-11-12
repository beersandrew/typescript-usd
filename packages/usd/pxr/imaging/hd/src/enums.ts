// Ported from OpenUSD 26.11.1: pxr/imaging/hd/enums.cpp,
//  pxr/imaging/hd/enums.h
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/enums.{h,cpp} (OpenUSD 26.11.1).
//
// HdCullStyle, HdInvertCullStyle and HdMeshGeomStyle were first ported into
// displayStyle.ts; they are re-exported here, where upstream declares them,
// so both import paths name the same enum.

export { HdCullStyle, HdInvertCullStyle, HdMeshGeomStyle } from './displayStyle.ts'

/** enums.h:19-31 */
export enum HdCompareFunction {
  HdCmpFuncNever,
  HdCmpFuncLess,
  HdCmpFuncEqual,
  HdCmpFuncLEqual,
  HdCmpFuncGreater,
  HdCmpFuncNotEqual,
  HdCmpFuncGEqual,
  HdCmpFuncAlways,

  HdCmpFuncLast,
}

/** enums.h:37-49 */
export enum HdStencilOp {
  HdStencilOpKeep,
  HdStencilOpZero,
  HdStencilOpReplace,
  HdStencilOpIncrement,
  HdStencilOpIncrementWrap,
  HdStencilOpDecrement,
  HdStencilOpDecrementWrap,
  HdStencilOpInvert,

  HdStencilOpLast,
}

/** enums.h:55-64 */
export enum HdBlendOp {
  HdBlendOpAdd,
  HdBlendOpSubtract,
  HdBlendOpReverseSubtract,
  HdBlendOpMin,
  HdBlendOpMax,

  HdBlendOpLast,
}

/** enums.h:70-93 */
export enum HdBlendFactor {
  HdBlendFactorZero,
  HdBlendFactorOne,
  HdBlendFactorSrcColor,
  HdBlendFactorOneMinusSrcColor,
  HdBlendFactorDstColor,
  HdBlendFactorOneMinusDstColor,
  HdBlendFactorSrcAlpha,
  HdBlendFactorOneMinusSrcAlpha,
  HdBlendFactorDstAlpha,
  HdBlendFactorOneMinusDstAlpha,
  HdBlendFactorConstantColor,
  HdBlendFactorOneMinusConstantColor,
  HdBlendFactorConstantAlpha,
  HdBlendFactorOneMinusConstantAlpha,
  HdBlendFactorSrcAlphaSaturate,
  HdBlendFactorSrc1Color,
  HdBlendFactorOneMinusSrc1Color,
  HdBlendFactorSrc1Alpha,
  HdBlendFactorOneMinusSrc1Alpha,

  HdBlendFactorLast,
}

/** enums.h:120-124 */
export enum HdPolygonMode {
  HdPolygonModeFill,
  HdPolygonModeLine,
}

/** enums.h:141-146 */
export enum HdBasisCurvesGeomStyle {
  HdBasisCurvesGeomStyleInvalid,
  HdBasisCurvesGeomStyleWire,
  HdBasisCurvesGeomStylePatch,
  HdBasisCurvesGeomStylePoints,
}

/** enums.h:148-151 */
export enum HdPointsGeomStyle {
  HdPointsGeomStyleInvalid,
  HdPointsGeomStylePoints,
}

/** enums.h:153-159 */
export enum HdImplicitSurfaceGeomStyle {
  HdImplicitSurfaceGeomStyleInvalid,
  HdImplicitSurfaceGeomStyleSurf,
  HdImplicitSurfaceGeomStyleRingsOnly,
  HdImplicitSurfaceGeomStyleRingsOnSurf,
  HdImplicitSurfaceGeomStylePoints,
}

/** enums.h:185-195 */
export enum HdInterpolation {
  HdInterpolationConstant = 0,
  HdInterpolationUniform,
  HdInterpolationVarying,
  HdInterpolationVertex,
  HdInterpolationFaceVarying,
  HdInterpolationInstance,

  HdInterpolationCount,
}

/** enums.h:205-211 */
export enum HdDepthPriority {
  HdDepthPriorityNearest = 0,
  HdDepthPriorityFarthest,

  HdDepthPriorityCount,
}
