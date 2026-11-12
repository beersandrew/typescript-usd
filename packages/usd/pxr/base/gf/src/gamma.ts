// Ported from OpenUSD 26.11.1: pxr/base/gf/gamma.cpp, pxr/base/gf/gamma.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — gamma-space color utilities.
//
// Mirrors OpenUSD pxr/base/gf/gamma.{h,cpp}. Maps colors between gamma spaces:
//   GfApplyGamma             -> raise color components to a power
//   GfGetDisplayGamma        -> the hard-coded display gamma (2.2)
//   GfConvertLinearToDisplay -> ApplyGamma(v, 1/2.2)
//   GfConvertDisplayToLinear -> ApplyGamma(v, 2.2)
//
// Per upstream gamma.cpp:
//   - Vec3 (GfVec3f/GfVec3d): every component is raised to the power gamma.
//   - Vec4 (GfVec4f/GfVec4d): the first THREE components are raised to the
//     power gamma; the fourth (alpha) is left unchanged.
//   - float: pow(v, gamma).
//   - unsigned char: (pow(v/255, gamma) * 255), truncated back to a byte.
// Float-precision ('f') vecs round each result through the GfVec*f constructor
// (Math.fround), matching the C++ `pow(float,double)->double` stored as float.
//
import {
  GfVec, GfVec3d, GfVec3f, GfVec3h, GfVec4d, GfVec4f, GfVec4h,
  type VecLike,
} from './vec.ts'

// Display colors (UI, OpenGL sRGB texture format, ...) are gamma 2.2. Hard
// coded here as the display gamma, exactly as upstream's `_DisplayGamma`.
const _DisplayGamma = 2.2

/** Return the system display gamma (2.2). Mirrors GfGetDisplayGamma(). */
export function GfGetDisplayGamma(): number {
  return _DisplayGamma
}

// Core implementation shared by the public overloads. For a Vec the first
// three components (color) are raised to the power gamma and any fourth
// component (alpha) is copied through unchanged; for a number it is pow(v, g).
function applyGamma(v: GfVec | number, gamma: number): GfVec | number {
  if (typeof v === 'number') {
    return Math.pow(v, gamma)
  }
  // For Vec3 all three indices are < 3, so all components are gammaed; for
  // Vec4 index 3 (alpha) falls through unchanged.
  const comps = v.data.map((x, i) => (i < 3 ? Math.pow(x, gamma) : x))
  const Ctor = v.constructor as new (a: VecLike) => GfVec
  return new Ctor(comps)
}

/**
 * Apply gamma to a vec or scalar. For Vec3 every component is raised to the
 * power `gamma`; for Vec4 the first three are raised and the fourth is left
 * unchanged; for a number it is `pow(v, gamma)`. Mirrors GfApplyGamma().
 */
export function GfApplyGamma(v: GfVec3f, gamma: number): GfVec3f
export function GfApplyGamma(v: GfVec3d, gamma: number): GfVec3d
export function GfApplyGamma(v: GfVec3h, gamma: number): GfVec3h
export function GfApplyGamma(v: GfVec4f, gamma: number): GfVec4f
export function GfApplyGamma(v: GfVec4d, gamma: number): GfVec4d
export function GfApplyGamma(v: GfVec4h, gamma: number): GfVec4h
export function GfApplyGamma(v: number, gamma: number): number
export function GfApplyGamma(v: GfVec | number, gamma: number): GfVec | number {
  return applyGamma(v, gamma)
}

/**
 * Apply gamma to a byte color component in [0, 255]. Mirrors the unsigned-char
 * GfApplyGamma overload: (pow(v/255, gamma) * 255) truncated to a byte.
 */
export function GfApplyGammaUChar(v: number, gamma: number): number {
  return Math.trunc(Math.pow(v / 255.0, gamma) * 255) & 0xff
}

/**
 * Given an energy-linear RGB(A) color, return it converted to the system's
 * display gamma. Mirrors GfConvertLinearToDisplay().
 */
export function GfConvertLinearToDisplay(v: GfVec3f): GfVec3f
export function GfConvertLinearToDisplay(v: GfVec3d): GfVec3d
export function GfConvertLinearToDisplay(v: GfVec3h): GfVec3h
export function GfConvertLinearToDisplay(v: GfVec4f): GfVec4f
export function GfConvertLinearToDisplay(v: GfVec4d): GfVec4d
export function GfConvertLinearToDisplay(v: GfVec4h): GfVec4h
export function GfConvertLinearToDisplay(v: number): number
export function GfConvertLinearToDisplay(v: GfVec | number): GfVec | number {
  return applyGamma(v, 1.0 / _DisplayGamma)
}

/**
 * Given an RGB(A) color in the system's display gamma space, return the
 * energy-linear color. Mirrors GfConvertDisplayToLinear().
 */
export function GfConvertDisplayToLinear(v: GfVec3f): GfVec3f
export function GfConvertDisplayToLinear(v: GfVec3d): GfVec3d
export function GfConvertDisplayToLinear(v: GfVec3h): GfVec3h
export function GfConvertDisplayToLinear(v: GfVec4f): GfVec4f
export function GfConvertDisplayToLinear(v: GfVec4d): GfVec4d
export function GfConvertDisplayToLinear(v: GfVec4h): GfVec4h
export function GfConvertDisplayToLinear(v: number): number
export function GfConvertDisplayToLinear(v: GfVec | number): GfVec | number {
  return applyGamma(v, _DisplayGamma)
}
