// Ported from OpenUSD 26.11.1: pxr/base/gf/color.cpp, pxr/base/gf/color.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfColor value type (a color in a named color space).
//
// Mirrors OpenUSD pxr/base/gf/color.{h,cpp}. A GfColor stores an RGB tuple
// (GfVec3f) together with the GfColorSpace it is expressed in. Conversions go
// through the nanocolor routines wired up in colorSpace.ts (NcTransformColor,
// NcRGBToXYZ/NcXYZToYxy for chromaticity, NcKelvinToYxy/NcYxyToRGB for the
// Planckian locus) so results match the Pixar oracle bit-for-bit modulo
// float/double rounding. The values are colorimetric, not photometric (there
// is no normalizing luminance factor).

import { GfVec3f, GfVec2f } from './vec.ts'
import { GfColorSpace, GfColorSpaceNames, _nc } from './colorSpace.ts'

/**
 * Represents a color in a specific color space. Mirrors GfColor.
 *
 * Constructor overloads (mirroring the C++ constructors):
 *   new GfColor()                       // black, in lin_rec709
 *   new GfColor(colorSpace)             // black, in colorSpace
 *   new GfColor(rgb, colorSpace)        // rgb interpreted in colorSpace
 *   new GfColor(color, dstColorSpace)   // convert `color` into dstColorSpace
 */
export class GfColor {
  private _colorSpace: GfColorSpace
  private _rgb: GfVec3f

  constructor()
  constructor(colorSpace: GfColorSpace)
  constructor(color: GfColor)
  constructor(rgb: GfVec3f, colorSpace: GfColorSpace)
  constructor(color: GfColor, dstColorSpace: GfColorSpace)
  constructor(
    a?: GfColorSpace | GfVec3f | GfColor,
    b?: GfColorSpace,
  ) {
    if (a === undefined) {
      // Default: black in lin_rec709.
      this._colorSpace = new GfColorSpace(GfColorSpaceNames.LinearRec709)
      this._rgb = new GfVec3f(0, 0, 0)
      return
    }

    if (a instanceof GfColorSpace) {
      // Black in the given color space.
      this._colorSpace = a
      this._rgb = new GfVec3f(0, 0, 0)
      return
    }

    if (a instanceof GfColor) {
      if (b === undefined) {
        // Copy constructor (Python `Gf.Color(c1)` / C++ implicit copy).
        this._colorSpace = a._colorSpace
        this._rgb = new GfVec3f(a._rgb)
        return
      }
      // Convert the source color into the destination color space.
      const dst = b
      this._colorSpace = dst
      const src = a._colorSpace
      const srcRGB = {
        r: a._rgb.get(0),
        g: a._rgb.get(1),
        b: a._rgb.get(2),
      }
      const dstRGB = _nc.ncTransformColor(dst._nc, src._nc, srcRGB)
      this._rgb = new GfVec3f(dstRGB.r, dstRGB.g, dstRGB.b)
      return
    }

    // (rgb, colorSpace)
    this._colorSpace = b as GfColorSpace
    this._rgb = new GfVec3f(a)
  }

  /** Mirrors GfColor::GetRGB. */
  getRGB(): GfVec3f {
    return this._rgb
  }

  /** Mirrors GfColor::GetColorSpace. */
  getColorSpace(): GfColorSpace {
    return this._colorSpace
  }

  /**
   * Set the color from the Planckian locus (blackbody radiation) temperature
   * in Kelvin, in the existing color space. Mirrors
   * GfColor::SetFromPlanckianLocus.
   */
  setFromPlanckianLocus(kelvin: number, luminance: number): void {
    const c = _nc.ncKelvinToYxy(kelvin, luminance)
    const rgb = _nc.ncYxyToRGB(this._colorSpace._nc, c)
    this._rgb = new GfVec3f(rgb.r, rgb.g, rgb.b)
  }

  /** operator== — mirrors GfColor::operator==. */
  equals(rh: GfColor): boolean {
    return this._rgb.equals(rh._rgb) && this._colorSpace.equals(rh._colorSpace)
  }

  /** operator!= */
  notEquals(rh: GfColor): boolean {
    return !this.equals(rh)
  }

  /**
   * Get the CIEXY coordinate of the color in the chromaticity chart.
   * Mirrors the protected GfColor::_GetChromaticity (for testing).
   */
  _getChromaticity(): GfVec2f {
    const src = { r: this._rgb.get(0), g: this._rgb.get(1), b: this._rgb.get(2) }
    const xyz = _nc.ncRGBToXYZ(this._colorSpace._nc, src)
    const chroma = _nc.ncXYZToYxy(xyz)
    return new GfVec2f(chroma.x, chroma.y)
  }

  /**
   * Set the color from a CIEXY coordinate in the chromaticity chart.
   * Mirrors the protected GfColor::_SetFromChromaticity (for testing).
   */
  _setFromChromaticity(xy: GfVec2f): void {
    const c = { Y: 1.0, x: xy.get(0), y: xy.get(1) }
    const rgb = _nc.ncYxyToRGB(this._colorSpace._nc, c)
    this._rgb = new GfVec3f(rgb.r, rgb.g, rgb.b)
  }
}

/**
 * Tests for equality of the RGB tuple of two colors with a given tolerance
 * (length of the difference vector <= tolerance). Does NOT adapt the colors to
 * a common color space first, and is not perceptual. Mirrors the GfIsClose
 * overload for GfColor in color.h.
 */
export function GfColorIsClose(
  c1: GfColor,
  c2: GfColor,
  tolerance: number,
): boolean {
  const a = c1.getRGB().data
  const b = c2.getRGB().data
  let s = 0
  for (let i = 0; i < 3; i++) s += (a[i]! - b[i]!) ** 2
  return s <= tolerance * tolerance
}
