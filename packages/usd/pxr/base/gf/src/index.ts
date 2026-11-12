// Portions ported from OpenUSD 26.11.1, including: pxr/base/gf/rotation.h,
//  pxr/exec/execIr/utils.cpp
// Copyright 2016, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — Graphics Foundations (base/gf). Math value types and helpers.
//
// Mirrors OpenUSD pxr/base/gf. Currently a functional shim (see matrix.ts);
// grows toward the full Gf value-type surface as consumers require it.

export { IDENTITY_MATRIX, mul4, invertMatrix4, transformPoint, quatToMatrix, makeTranslate, makeScale, makeRotateX, makeRotateY, makeRotateZ } from "./matrix.ts";
export type { Matrix4 } from "./matrix.ts";

export { dot3, cross3, add3, sub3, scale3, length3, lengthSq3, getNormalized3, makeRotation, identityRotation, rotationToQuat, quatToRotation, rotateInto, rotationInverse, scaleRotationAngle, divideRotationAngle, rotationEqual, rotationStr, rotationRepr, rotationHash, rotateOntoProjected, composeRotations, transformDir, decomposeRotation, rotationToMatrix, transposeMatrix, matrixTransformDir, getDeterminant3, extractRotationQuat, extractRotation, setLookAt, orthogonalizeBasis, orthonormalizeMatrix, factorMatrix } from "./rotation.ts";
export type { Vec3, Quat, Rotation, MatrixFactors } from "./rotation.ts";
// GfRotation::DecomposeRotation (pxr/base/gf/rotation.h), used by execIr (pxr/exec/execIr/utils.cpp:169-181).
export { GfDecomposeRotation as DecomposeRotation } from "./rotation.ts";
export type { GfDecomposeRotationOpts as DecomposeRotationOpts } from "./rotation.ts";
export { GfVec2d as Vec2d, GfVec2f as Vec2f, GfVec2h as Vec2h, GfVec2i as Vec2i, GfVec3d as Vec3d, GfVec3f as Vec3f, GfVec3h as Vec3h, GfVec3i as Vec3i, GfVec4d as Vec4d, GfVec4f as Vec4f, GfVec4h as Vec4h, GfVec4i as Vec4i, GfGetLength as GetLength, GfNormalize as Normalize, GfGetNormalized as GetNormalized, GfGetProjection as GetProjection, GfGetComplement as GetComplement, GfIsClose as IsClose, GfCross as Cross, GfGetCross as GetCross, GfBuildOrthonormalFrame as BuildOrthonormalFrame, GfCompDiv, GfCompMult, GfDot, GfOrthogonalizeBasis } from "./vec.ts";
export { GfColorSpace as ColorSpace, GfColorSpaceNames as ColorSpaceNames } from "./colorSpace.ts";
export type { NcM33f } from "./colorSpace.ts";
export { GfColor as Color, GfColorIsClose as ColorIsClose } from "./color.ts";
export { GfInterval as Interval } from "./interval.ts";
export { GfQuatd as Quatd, GfQuatf as Quatf, GfQuath as Quath, GfQuaternion as Quaternion, GfQuatDot as QuatDot, GfSlerp } from "./quaternion.ts";
export { GfDualQuatd as DualQuatd, GfDualQuatf as DualQuatf, GfDualQuath as DualQuath, GfDualQuatDot as DualQuatDot } from "./dualQuat.ts";
export { GfMatrix2d as Matrix2d, GfMatrix2f as Matrix2f, GfMatrix3d as Matrix3d, GfMatrix3f as Matrix3f, GfMatrix4d as Matrix4d, GfMatrix4f as Matrix4f, GfIsCloseMatrix as IsCloseMatrix } from "./matrixData.ts";
export { GfRange1d as Range1d, GfRange1f as Range1f, GfRange2d as Range2d, GfRange2f as Range2f, GfRange3d as Range3d, GfRange3f as Range3f } from "./range.ts";
export { GfSize2 as Size2, GfSize3 as Size3 } from "./size.ts";
export { GfBBox3d as BBox3d } from "./bbox3d.ts";
export { GfCamera as Camera } from "./camera.ts";
export { GfFrustum as Frustum } from "./frustum.ts";
export { GfLine as Line } from "./line.ts";
export { GfLineSeg as LineSeg } from "./lineSeg.ts";
export { GfLine2d } from "./line2d.ts";
export { GfLineSeg2d } from "./lineSeg2d.ts";
export { GfMultiInterval as MultiInterval } from "./multiInterval.ts";
export { GfPlane as Plane, GfFitPlaneToPoints as FitPlaneToPoints } from "./plane.ts";
export { GfRay as Ray } from "./ray.ts";
export { GfRect2i as Rect2i } from "./rect2i.ts";
export { GfTransform as Transform } from "./transform.ts";
export { GfNumericCast as NumericCast, GfNumericCastFailure as NumericCastFailure } from "./numericCast.ts";
export type { GfNumericCastFailureType as NumericCastFailureType, GfNumericCastResult as NumericCastResult, GfNumericType as NumericType } from "./numericCast.ts";
export { GfHalf, floatToHalfBits as _floatToHalfBits, halfBitsToFloat as _halfBitsToFloat } from "./half.ts";
export { GfTimeCode as TimeCode } from "./timeCode.ts";
export { GfDuration as Duration } from "./duration.ts";
export { GfIsFloatingPointType } from "./traits.ts";
export { GfMatrixDataStorage as GfMatrixData } from "./matrixData.ts";
export {
  GfDegreesToRadians as DegreesToRadians,
  GfRadiansToDegrees as RadiansToDegrees,
  GfSmoothStep as SmoothStep,
  GfSmoothRamp as GfSmoothRamp,
  GfSqr as Sqr,
  GfSgn as Sgn,
  GfSqrt,
  GfExp,
  GfLog,
  GfFloor,
  GfCeil,
  GfAbs,
  GfRound,
  GfPow,
  GfSin,
  GfCos,
  GfSinCos,
  GfClamp,
  GfMod,
  GfLerp as Lerp,
  GfMin,
  GfMax,
} from "./math.ts";
export {
  GfGetDisplayGamma as GetDisplayGamma,
  GfApplyGamma,
  GfConvertLinearToDisplay,
  GfConvertDisplayToLinear,
} from "./gamma.ts";
export { GfGetHomogenized, GfHomogeneousCross, GfProject } from "./homogeneous.ts";
export { GfFindClosestPoints } from "./lineSeg.ts";
export {
  GfNumericCastFailure as GfNumericCastFailureValues,
  GfIntegerCompareLess,
  GfNumericCastNegOverflow,
  GfNumericCastPosOverflow,
} from "./numericCast.ts";
// Abstract bases of the Gf value classes, for value-type checks.
export { GfVec as _VecBase } from "./vec.ts";
export { GfMatrix as _MatrixBase } from "./matrixData.ts";
export { GfQuatImpl as _QuatBase } from "./quaternion.ts";
