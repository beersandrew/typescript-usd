// Ported from OpenUSD 26.11.1: pxr/base/gf/colorSpace.cpp,
//  pxr/base/gf/colorSpace.h, pxr/base/gf/colorSpace_data.h,
//  pxr/base/gf/nc/nanocolor.c, pxr/base/gf/nc/nanocolor.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — GfColorSpace value type (managed color spaces).
//
// Mirrors OpenUSD pxr/base/gf/colorSpace.{h,cpp} and the colorSpace_data.h
// table. In OpenUSD the actual color math lives in the bundled C library
// "nanocolor" (pxr/base/gf/nc/nanocolor.{h,c}); GfColorSpace is a thin
// std::shared_ptr<_Data> wrapper around an NcColorSpace. This TS port inlines
// the nanocolor logic VERBATIM (same operation order, same constants) so the
// computed primary matrices, transfer-function params, and conversions match
// the Pixar oracle. See nanocolor.c for the reference of every routine here.
//
import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { GfVec2f } from './vec.ts'
import { GfMatrix3f } from './matrixData.ts'

/** A 3x3 matrix in row-major order, matching nanocolor's NcM33f.m[9]. */
export type NcM33f = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
]

interface Chromaticity {
  x: number
  y: number
}

// Internal computed color-space data — the TS analogue of nanocolor's
// `struct NcColorSpace { NcColorSpaceDescriptor desc; float K0, phi; NcM33f rgbToXYZ; }`.
interface NcColorSpace {
  descriptiveName: string
  shortName: string
  redPrimary: Chromaticity
  greenPrimary: Chromaticity
  bluePrimary: Chromaticity
  whitePoint: Chromaticity
  gamma: number
  linearBias: number
  K0: number
  phi: number
  rgbToXYZ: number[] // length 9, row-major
}

// ----------------------------------------------------------------------------
// nanocolor transfer functions (_FromLinear / _ToLinear)
// ----------------------------------------------------------------------------

function _FromLinear(cs: NcColorSpace, t: number): number {
  if (t < cs.K0 / cs.phi) return t * cs.phi
  const a = cs.linearBias
  return (1.0 + a) * Math.pow(t, 1.0 / cs.gamma) - a
}

function _ToLinear(cs: NcColorSpace, t: number): number {
  if (t < cs.K0) return t / cs.phi
  const a = cs.linearBias
  return Math.pow((t + a) / (1.0 + a), cs.gamma)
}

// ----------------------------------------------------------------------------
// 3x3 matrix helpers (nanocolor _M3ffInvert / _M33fMultiply), row-major
// ----------------------------------------------------------------------------

function _M33fInvert(m: number[]): number[] {
  // Index map mirrors nanocolor's transposed access pattern verbatim.
  const M0 = 0, M1 = 3, M2 = 6, M3 = 1, M4 = 4, M5 = 7, M6 = 2, M7 = 5, M8 = 8
  const det =
    m[M0]! * (m[M4]! * m[M8]! - m[M5]! * m[M7]!) -
    m[M1]! * (m[M3]! * m[M8]! - m[M5]! * m[M6]!) +
    m[M2]! * (m[M3]! * m[M7]! - m[M4]! * m[M6]!)
  const invdet = 1.0 / det
  const inv = new Array<number>(9)
  inv[M0] = (m[M4]! * m[M8]! - m[M5]! * m[M7]!) * invdet
  inv[M1] = (m[M2]! * m[M7]! - m[M1]! * m[M8]!) * invdet
  inv[M2] = (m[M1]! * m[M5]! - m[M2]! * m[M4]!) * invdet
  inv[M3] = (m[M5]! * m[M6]! - m[M3]! * m[M8]!) * invdet
  inv[M4] = (m[M0]! * m[M8]! - m[M2]! * m[M6]!) * invdet
  inv[M5] = (m[M2]! * m[M3]! - m[M0]! * m[M5]!) * invdet
  inv[M6] = (m[M3]! * m[M7]! - m[M4]! * m[M6]!) * invdet
  inv[M7] = (m[M1]! * m[M6]! - m[M0]! * m[M7]!) * invdet
  inv[M8] = (m[M0]! * m[M4]! - m[M1]! * m[M3]!) * invdet
  return inv
}

function _M33fMultiply(lh: number[], rh: number[]): number[] {
  const m = new Array<number>(9)
  m[0] = lh[0]! * rh[0]! + lh[1]! * rh[3]! + lh[2]! * rh[6]!
  m[1] = lh[0]! * rh[1]! + lh[1]! * rh[4]! + lh[2]! * rh[7]!
  m[2] = lh[0]! * rh[2]! + lh[1]! * rh[5]! + lh[2]! * rh[8]!
  m[3] = lh[3]! * rh[0]! + lh[4]! * rh[3]! + lh[5]! * rh[6]!
  m[4] = lh[3]! * rh[1]! + lh[4]! * rh[4]! + lh[5]! * rh[7]!
  m[5] = lh[3]! * rh[2]! + lh[4]! * rh[5]! + lh[5]! * rh[8]!
  m[6] = lh[6]! * rh[0]! + lh[7]! * rh[3]! + lh[8]! * rh[6]!
  m[7] = lh[6]! * rh[1]! + lh[7]! * rh[4]! + lh[8]! * rh[7]!
  m[8] = lh[6]! * rh[2]! + lh[7]! * rh[5]! + lh[8]! * rh[8]!
  return m
}

// ----------------------------------------------------------------------------
// _InitColorSpace — computes K0/phi and (when given primaries) the rgbToXYZ
// matrix, mirroring nanocolor's _InitColorSpace verbatim (SMPTE RP 177-1993).
// ----------------------------------------------------------------------------

function _InitColorSpace(cs: NcColorSpace): void {
  if (cs.rgbToXYZ[8] !== 0.0) return

  const a = cs.linearBias
  const gamma = cs.gamma

  if (gamma === 1.0) {
    cs.K0 = 1.0e9
    cs.phi = 1.0
  } else {
    if (a <= 0.0) {
      cs.K0 = 0.0
      cs.phi = 1.0
    } else {
      cs.K0 = a / (gamma - 1.0)
      cs.phi =
        a /
        Math.exp(
          Math.log((gamma * a) / (gamma + gamma * a - 1.0 - a)) * gamma,
        ) /
        (gamma - 1.0)
    }
  }

  // If the primaries are zero, the color space was defined by the 3x3 matrix.
  if (cs.whitePoint.x === 0.0) return

  const red = [
    cs.redPrimary.x,
    cs.redPrimary.y,
    1.0 - cs.redPrimary.x - cs.redPrimary.y,
  ]
  const green = [
    cs.greenPrimary.x,
    cs.greenPrimary.y,
    1.0 - cs.greenPrimary.x - cs.greenPrimary.y,
  ]
  const blue = [
    cs.bluePrimary.x,
    cs.bluePrimary.y,
    1.0 - cs.bluePrimary.x - cs.bluePrimary.y,
  ]
  const white = [
    cs.whitePoint.x,
    cs.whitePoint.y,
    1.0 - cs.whitePoint.x - cs.whitePoint.y,
  ]

  // Build the P matrix by column binding red, green, blue.
  const m = new Array<number>(9)
  m[0] = red[0]!
  m[1] = green[0]!
  m[2] = blue[0]!
  m[3] = red[1]!
  m[4] = green[1]!
  m[5] = blue[1]!
  m[6] = red[2]!
  m[7] = green[2]!
  m[8] = blue[2]!

  // White has luminance factor of 1.0, ie Y = 1.
  const W = [white[0]! / white[1]!, white[1]! / white[1]!, white[2]! / white[1]!]

  const mInv = _M33fInvert(m)
  const C = [
    mInv[0]! * W[0]! + mInv[1]! * W[1]! + mInv[2]! * W[2]!,
    mInv[3]! * W[0]! + mInv[4]! * W[1]! + mInv[5]! * W[2]!,
    mInv[6]! * W[0]! + mInv[7]! * W[1]! + mInv[8]! * W[2]!,
  ]

  m[0]! *= C[0]!
  m[1]! *= C[1]!
  m[2]! *= C[2]!
  m[3]! *= C[0]!
  m[4]! *= C[1]!
  m[5]! *= C[2]!
  m[6]! *= C[0]!
  m[7]! *= C[1]!
  m[8]! *= C[2]!

  cs.rgbToXYZ = m
}

// ----------------------------------------------------------------------------
// XYZ <-> RGB / Yxy conversions (nanocolor).
// ----------------------------------------------------------------------------

function NcGetRGBToXYZMatrix(cs: NcColorSpace): number[] {
  return cs.rgbToXYZ
}

function NcGetXYZToRGBMatrix(cs: NcColorSpace): number[] {
  return _M33fInvert(cs.rgbToXYZ)
}

function NcGetRGBToRGBMatrix(src: NcColorSpace, dst: NcColorSpace): number[] {
  const toXYZ = NcGetRGBToXYZMatrix(src)
  const fromXYZ = NcGetXYZToRGBMatrix(dst)
  return _M33fMultiply(fromXYZ, toXYZ)
}

interface RGB { r: number; g: number; b: number }
interface XYZ { x: number; y: number; z: number }
interface Yxy { Y: number; x: number; y: number }

function NcTransformColor(dst: NcColorSpace, src: NcColorSpace, rgb: RGB): RGB {
  const tx = NcGetRGBToRGBMatrix(src, dst)

  // If the source color space indicates a curve, remove it.
  const r = _ToLinear(src, rgb.r)
  const g = _ToLinear(src, rgb.g)
  const b = _ToLinear(src, rgb.b)

  let or = tx[0]! * r + tx[1]! * g + tx[2]! * b
  let og = tx[3]! * r + tx[4]! * g + tx[5]! * b
  let ob = tx[6]! * r + tx[7]! * g + tx[8]! * b

  // If the destination color space indicates a curve, apply it.
  or = _FromLinear(dst, or)
  og = _FromLinear(dst, og)
  ob = _FromLinear(dst, ob)
  return { r: or, g: og, b: ob }
}

function NcRGBToXYZ(cs: NcColorSpace, rgb: RGB): XYZ {
  const r = _ToLinear(cs, rgb.r)
  const g = _ToLinear(cs, rgb.g)
  const b = _ToLinear(cs, rgb.b)
  const m = NcGetRGBToXYZMatrix(cs)
  return {
    x: m[0]! * r + m[1]! * g + m[2]! * b,
    y: m[3]! * r + m[4]! * g + m[5]! * b,
    z: m[6]! * r + m[7]! * g + m[8]! * b,
  }
}

function NcXYZToRGB(cs: NcColorSpace, xyz: XYZ): RGB {
  const m = NcGetXYZToRGBMatrix(cs)
  const rgb: RGB = {
    r: m[0]! * xyz.x + m[1]! * xyz.y + m[2]! * xyz.z,
    g: m[3]! * xyz.x + m[4]! * xyz.y + m[5]! * xyz.z,
    b: m[6]! * xyz.x + m[7]! * xyz.y + m[8]! * xyz.z,
  }
  rgb.r = _FromLinear(cs, rgb.r)
  rgb.g = _FromLinear(cs, rgb.g)
  rgb.b = _FromLinear(cs, rgb.b)
  return rgb
}

function NcXYZToYxy(xyz: XYZ): Yxy {
  const sum = xyz.x + xyz.y + xyz.z
  if (sum === 0.0) return { Y: 0, x: 0, y: xyz.y }
  return { Y: xyz.y, x: xyz.x / sum, y: xyz.y / sum }
}

function _NormalizeYxy(c: Yxy): Yxy {
  return {
    Y: c.Y,
    x: (c.Y * c.x) / c.y,
    y: (c.Y * (1.0 - c.x - c.y)) / c.y,
  }
}

function _SignOf(x: number): number {
  return x > 0 ? 1.0 : x < 0 ? -1.0 : 0.0
}

function NcYxyToRGB(cs: NcColorSpace, c: Yxy): RGB {
  const cYxy = _NormalizeYxy(c)
  const rgb = NcXYZToRGB(cs, { x: cYxy.x, y: cYxy.Y, z: cYxy.y })
  const magR = Math.abs(rgb.r)
  const magG = Math.abs(rgb.g)
  const magB = Math.abs(rgb.b)
  let maxc = magR > magG ? magR : magG
  maxc = maxc > magB ? maxc : magB
  return {
    r: (_SignOf(rgb.r) * rgb.r) / maxc,
    g: (_SignOf(rgb.g) * rgb.g) / maxc,
    b: (_SignOf(rgb.b) * rgb.b) / maxc,
  }
}

interface NcYuvPrime { Y: number; u: number; v: number }

function _NcYuv2Yxy(c: NcYuvPrime): Yxy {
  const d = 6.0 * c.u - 16.0 * c.v + 12.0
  return { Y: c.Y, x: (9.0 * c.u) / d, y: (4.0 * c.v) / d }
}

// Krystek 1985 rational Chebyshev approximation (nanocolor NcKelvinToYxy).
function NcKelvinToYxy(temperature: number, luminance: number): Yxy {
  let T = temperature
  if (T < 1000) T = 1000
  else if (T > 15000) T = 15000

  const u =
    (0.860117757 + 1.54118254e-4 * T + 1.2864121e-7 * T * T) /
    (1.0 + 8.42420235e-4 * T + 7.08145163e-7 * T * T)
  const v =
    (0.317398726 + 4.22806245e-5 * T + 4.20481691e-8 * T * T) /
    (1.0 - 2.89741816e-5 * T + 1.61456053e-7 * T * T)

  return _NcYuv2Yxy({ Y: luminance, u, v: (3.0 * v) / 2.0 })
}

// ----------------------------------------------------------------------------
// Built-in color space table — colorSpace_data.h / nanocolor.c _colorSpaces.
// Ported VERBATIM (primaries, white points, gamma, linearBias).
// ----------------------------------------------------------------------------

const WpD65: Chromaticity = { x: 0.3127, y: 0.329 }

interface ColorSpaceDef {
  descriptiveName: string
  shortName: string
  redPrimary: Chromaticity
  greenPrimary: Chromaticity
  bluePrimary: Chromaticity
  whitePoint: Chromaticity
  gamma: number
  linearBias: number
  /** Preset rgbToXYZ for the identity-style spaces (data/identity/raw/unknown). */
  identityMatrix?: boolean
}

const _colorSpaceDefs: ColorSpaceDef[] = [
  {
    descriptiveName: 'ACEScg', shortName: 'lin_ap1_scene',
    redPrimary: { x: 0.71319588766205, y: 0.29268891446333 },
    greenPrimary: { x: 0.15950855654178, y: 0.83878851615096 },
    bluePrimary: { x: 0.12867299528535, y: 0.043895571160528 },
    whitePoint: WpD65, gamma: 1.0, linearBias: 0.0,
  },
  {
    descriptiveName: 'ACES2065-1', shortName: 'lin_ap0_scene',
    redPrimary: { x: 0.73485524337371, y: 0.26422532524554 },
    greenPrimary: { x: -0.0061709124786224, y: 1.0113149590212864 },
    bluePrimary: { x: 0.015967559255041, y: -0.064235503128551 },
    whitePoint: WpD65, gamma: 1.0, linearBias: 0.0,
  },
  {
    descriptiveName: 'Linear Rec.709 (sRGB)', shortName: 'lin_rec709_scene',
    redPrimary: { x: 0.64, y: 0.33 },
    greenPrimary: { x: 0.3, y: 0.6 },
    bluePrimary: { x: 0.15, y: 0.06 },
    whitePoint: WpD65, gamma: 1.0, linearBias: 0.0,
  },
  {
    descriptiveName: 'Linear P3-D65', shortName: 'lin_p3d65_scene',
    redPrimary: { x: 0.68, y: 0.32 },
    greenPrimary: { x: 0.265, y: 0.69 },
    bluePrimary: { x: 0.15, y: 0.06 },
    whitePoint: WpD65, gamma: 1.0, linearBias: 0.0,
  },
  {
    descriptiveName: 'Linear Rec.2020', shortName: 'lin_rec2020_scene',
    redPrimary: { x: 0.708, y: 0.292 },
    greenPrimary: { x: 0.17, y: 0.797 },
    bluePrimary: { x: 0.131, y: 0.046 },
    whitePoint: WpD65, gamma: 1.0, linearBias: 0.0,
  },
  {
    descriptiveName: 'Linear AdobeRGB', shortName: 'lin_adobergb_scene',
    redPrimary: { x: 0.64, y: 0.33 },
    greenPrimary: { x: 0.21, y: 0.71 },
    bluePrimary: { x: 0.15, y: 0.06 },
    whitePoint: WpD65, gamma: 1.0, linearBias: 0.0,
  },
  {
    descriptiveName: 'CIE XYZ-D65 - Scene-referred', shortName: 'lin_ciexyzd65_scene',
    redPrimary: { x: 1.0, y: 0.0 },
    greenPrimary: { x: 0.0, y: 1.0 },
    bluePrimary: { x: 0.0, y: 0.0 },
    whitePoint: WpD65, gamma: 1.0, linearBias: 0.0,
  },
  {
    descriptiveName: 'sRGB Encoded Rec.709 (sRGB)', shortName: 'srgb_rec709_scene',
    redPrimary: { x: 0.64, y: 0.33 },
    greenPrimary: { x: 0.3, y: 0.6 },
    bluePrimary: { x: 0.15, y: 0.06 },
    whitePoint: WpD65, gamma: 2.4, linearBias: 0.055,
  },
  {
    descriptiveName: 'Gamma 2.2 Encoded Rec.709', shortName: 'g22_rec709_scene',
    redPrimary: { x: 0.64, y: 0.33 },
    greenPrimary: { x: 0.3, y: 0.6 },
    bluePrimary: { x: 0.15, y: 0.06 },
    whitePoint: WpD65, gamma: 2.2, linearBias: 0.0,
  },
  {
    descriptiveName: 'Gamma 1.8 Encoded Rec.709', shortName: 'g18_rec709_scene',
    redPrimary: { x: 0.64, y: 0.33 },
    greenPrimary: { x: 0.3, y: 0.6 },
    bluePrimary: { x: 0.15, y: 0.06 },
    whitePoint: WpD65, gamma: 1.8, linearBias: 0.0,
  },
  {
    descriptiveName: 'sRGB Encoded AP1', shortName: 'srgb_ap1_scene',
    redPrimary: { x: 0.71319588766205, y: 0.29268891446333 },
    greenPrimary: { x: 0.15950855654178, y: 0.83878851615096 },
    bluePrimary: { x: 0.12867299528535, y: 0.043895571160528 },
    whitePoint: WpD65, gamma: 2.4, linearBias: 0.055,
  },
  {
    descriptiveName: 'Gamma 2.2 Encoded AP1', shortName: 'g22_ap1_scene',
    redPrimary: { x: 0.71319588766205, y: 0.29268891446333 },
    greenPrimary: { x: 0.15950855654178, y: 0.83878851615096 },
    bluePrimary: { x: 0.12867299528535, y: 0.043895571160528 },
    whitePoint: WpD65, gamma: 2.2, linearBias: 0.0,
  },
  {
    descriptiveName: 'sRGB Encoded P3-D65', shortName: 'srgb_p3d65_scene',
    redPrimary: { x: 0.68, y: 0.32 },
    greenPrimary: { x: 0.265, y: 0.69 },
    bluePrimary: { x: 0.15, y: 0.06 },
    whitePoint: WpD65, gamma: 2.4, linearBias: 0.055,
  },
  {
    descriptiveName: 'Gamma 2.2 Encoded AdobeRGB', shortName: 'g22_adobergb_scene',
    redPrimary: { x: 0.64, y: 0.33 },
    greenPrimary: { x: 0.21, y: 0.71 },
    bluePrimary: { x: 0.15, y: 0.06 },
    whitePoint: WpD65, gamma: 2.2, linearBias: 0.0,
  },
  {
    descriptiveName: 'Data', shortName: 'data',
    redPrimary: { x: 1.0, y: 0.0 },
    greenPrimary: { x: 0.0, y: 1.0 },
    bluePrimary: { x: 0.0, y: 0.0 },
    whitePoint: { x: 1.0 / 3.0, y: 1.0 / 3.0 },
    gamma: 1.0, linearBias: 0.0, identityMatrix: true,
  },
  {
    descriptiveName: 'Identity', shortName: 'identity',
    redPrimary: { x: 1.0, y: 0.0 },
    greenPrimary: { x: 0.0, y: 1.0 },
    bluePrimary: { x: 0.0, y: 0.0 },
    whitePoint: { x: 1.0 / 3.0, y: 1.0 / 3.0 },
    gamma: 1.0, linearBias: 0.0, identityMatrix: true,
  },
  {
    descriptiveName: 'Raw', shortName: 'raw',
    redPrimary: { x: 1.0, y: 0.0 },
    greenPrimary: { x: 0.0, y: 1.0 },
    bluePrimary: { x: 0.0, y: 0.0 },
    whitePoint: { x: 1.0 / 3.0, y: 1.0 / 3.0 },
    gamma: 1.0, linearBias: 0.0, identityMatrix: true,
  },
  {
    descriptiveName: 'Unknown', shortName: 'unknown',
    redPrimary: { x: 1.0, y: 0.0 },
    greenPrimary: { x: 0.0, y: 1.0 },
    bluePrimary: { x: 0.0, y: 0.0 },
    whitePoint: { x: 1.0 / 3.0, y: 1.0 / 3.0 },
    gamma: 1.0, linearBias: 0.0, identityMatrix: true,
  },
]

function _makeNc(def: ColorSpaceDef): NcColorSpace {
  const cs: NcColorSpace = {
    descriptiveName: def.descriptiveName,
    shortName: def.shortName,
    redPrimary: { ...def.redPrimary },
    greenPrimary: { ...def.greenPrimary },
    bluePrimary: { ...def.bluePrimary },
    whitePoint: { ...def.whitePoint },
    gamma: def.gamma,
    linearBias: def.linearBias,
    K0: 0,
    phi: 0,
    rgbToXYZ: def.identityMatrix
      ? [1, 0, 0, 0, 1, 0, 0, 0, 1]
      : [0, 0, 0, 0, 0, 0, 0, 0, 0],
  }
  _InitColorSpace(cs)
  return cs
}

// The shared, lazily-initialised singletons (mirrors nanocolor's static table
// where NcGetNamedColorSpace hands back a pointer to the shared entry).
const _namedColorSpaces = new Map<string, NcColorSpace>()
for (const def of _colorSpaceDefs) {
  const nc = _makeNc(def)
  _namedColorSpaces.set(def.shortName, nc)
  // Also resolvable by descriptive name, like NcGetNamedColorSpace.
  if (!_namedColorSpaces.has(def.descriptiveName)) {
    _namedColorSpaces.set(def.descriptiveName, nc)
  }
}

function NcGetNamedColorSpace(name: string): NcColorSpace | undefined {
  return _namedColorSpaces.get(name)
}

// nanocolor NcColorSpaceEqual: compares the rgbToXYZ matrices (1e-5), gamma
// (1e-3) and linearBias (1e-3). (Upstream's shortName strcmp is a no-op bug —
// it compares cs1 to itself — so name does not participate; preserved here.)
function NcColorSpaceEqual(a: NcColorSpace, b: NcColorSpace): boolean {
  for (let i = 0; i < 9; i++) {
    if (Math.abs(a.rgbToXYZ[i]! - b.rgbToXYZ[i]!) > 1e-5) return false
  }
  if (Math.abs(a.gamma - b.gamma) > 1e-3) return false
  if (Math.abs(a.linearBias - b.linearBias) > 1e-3) return false
  return true
}

// ----------------------------------------------------------------------------
// GfColorSpaceNames — mirrors GF_COLORSPACE_NAME_TOKENS.
// ----------------------------------------------------------------------------

export const GfColorSpaceNames = TfMakeTokens({
  LinearAP1: 'lin_ap1_scene',
  LinearAP0: 'lin_ap0_scene',
  LinearRec709: 'lin_rec709_scene',
  LinearP3D65: 'lin_p3d65_scene',
  LinearRec2020: 'lin_rec2020_scene',
  LinearAdobeRGB: 'lin_adobergb_scene',
  LinearCIEXYZD65: 'lin_ciexyzd65_scene',
  SRGBRec709: 'srgb_rec709_scene',
  G22Rec709: 'g22_rec709_scene',
  G18Rec709: 'g18_rec709_scene',
  SRGBAP1: 'srgb_ap1_scene',
  G22AP1: 'g22_ap1_scene',
  SRGBP3D65: 'srgb_p3d65_scene',
  G22AdobeRGB: 'g22_adobergb_scene',
  Identity: 'identity',
  Data: 'data',
  Raw: 'raw',
  Unknown: 'unknown',
  CIEXYZ: 'lin_ciexyzd65_scene',
  LinearDisplayP3: 'lin_p3d65_scene',
} as const)

// ----------------------------------------------------------------------------
// GfColorSpace
// ----------------------------------------------------------------------------

/**
 * Represents a color space. Color spaces may be created by name,
 * parameterization (primaries + white point + gamma/linearBias), or by a 3x3
 * matrix and a gamma operator. Mirrors pxr/base/gf/colorSpace.h GfColorSpace.
 */
export class GfColorSpace {
  /** @internal The computed nanocolor data. */
  readonly _nc: NcColorSpace

  /**
   * Construct a GfColorSpace. Overloads (mirroring the C++ constructors):
   *   new GfColorSpace(name)
   *   new GfColorSpace(name, redChroma, greenChroma, blueChroma, whitePoint, gamma, linearBias)
   *   new GfColorSpace(name, rgbToXYZ, gamma, linearBias)   // rgbToXYZ = NcM33f (number[9], row-major)
   */
  constructor(name: string)
  constructor(
    name: string,
    redChroma: GfVec2f,
    greenChroma: GfVec2f,
    blueChroma: GfVec2f,
    whitePoint: GfVec2f,
    gamma: number,
    linearBias: number,
  )
  constructor(name: string, rgbToXYZ: NcM33f, gamma: number, linearBias: number)
  constructor(
    name: string,
    a?: GfVec2f | NcM33f,
    b?: GfVec2f | number,
    c?: GfVec2f | number,
    whitePoint?: GfVec2f,
    gamma?: number,
    linearBias?: number,
  ) {
    if (a === undefined) {
      // --- by name ---
      const named = NcGetNamedColorSpace(name)
      if (named) {
        this._nc = named
      } else {
        // Unknown name → an identity sentinel (matrix path), like upstream.
        this._nc = GfColorSpace._makeM33(name, [1, 0, 0, 0, 1, 0, 0, 0, 1], 1.0, 0.0)
      }
      return
    }

    if (a instanceof GfVec2f) {
      // --- from primaries ---
      const redChroma = a
      const greenChroma = b as GfVec2f
      const blueChroma = c as GfVec2f
      const wp = whitePoint as GfVec2f
      const g = gamma as number
      const lb = linearBias as number
      this._nc = _makeNc({
        descriptiveName: name,
        shortName: name,
        redPrimary: { x: redChroma.get(0), y: redChroma.get(1) },
        greenPrimary: { x: greenChroma.get(0), y: greenChroma.get(1) },
        bluePrimary: { x: blueChroma.get(0), y: blueChroma.get(1) },
        whitePoint: { x: wp.get(0), y: wp.get(1) },
        gamma: g,
        linearBias: lb,
      })
      return
    }

    // --- from a 3x3 matrix ---
    const m = a
    const g = b as number
    const lb = c as number
    this._nc = GfColorSpace._makeM33(name, m, g, lb)
  }

  // NcCreateColorSpaceM33: build from matrix, then back-fill chromaticities.
  private static _makeM33(
    name: string,
    rgbToXYZ: NcM33f,
    gamma: number,
    linearBias: number,
  ): NcColorSpace {
    const cs: NcColorSpace = {
      descriptiveName: name,
      shortName: name,
      redPrimary: { x: 0, y: 0 },
      greenPrimary: { x: 0, y: 0 },
      bluePrimary: { x: 0, y: 0 },
      whitePoint: { x: 0, y: 0 },
      gamma,
      linearBias,
      K0: 0,
      phi: 0,
      rgbToXYZ: [...rgbToXYZ],
    }
    _InitColorSpace(cs)

    // Fill in the assumed chromaticities from the matrix (nanocolor).
    const whiteYxy = NcXYZToYxy(NcRGBToXYZ(cs, { r: 1, g: 1, b: 1 }))
    const redYxy = NcXYZToYxy(NcRGBToXYZ(cs, { r: 1, g: 0, b: 0 }))
    const greenYxy = NcXYZToYxy(NcRGBToXYZ(cs, { r: 0, g: 1, b: 0 }))
    const blueYxy = NcXYZToYxy(NcRGBToXYZ(cs, { r: 0, g: 0, b: 1 }))
    cs.redPrimary = { x: redYxy.x, y: redYxy.y }
    cs.greenPrimary = { x: greenYxy.x, y: greenYxy.y }
    cs.bluePrimary = { x: blueYxy.x, y: blueYxy.y }
    cs.whitePoint = { x: whiteYxy.x, y: whiteYxy.y }
    return cs
  }

  /** Mirrors GfColorSpace::IsValid — is `name` a registered color space? */
  static isValid(name: string): boolean {
    return NcGetNamedColorSpace(name) !== undefined
  }

  /** Mirrors GfColorSpace::GetName. */
  getName(): string {
    return this._nc.shortName
  }

  /** operator== — mirrors GfColorSpace::operator==. */
  equals(rh: GfColorSpace): boolean {
    return NcColorSpaceEqual(this._nc, rh._nc)
  }

  /** operator!= */
  notEquals(rh: GfColorSpace): boolean {
    return !this.equals(rh)
  }

  /** Mirrors GfColorSpace::GetGamma. */
  getGamma(): number {
    return this._nc.gamma
  }

  /** Mirrors GfColorSpace::GetLinearBias. */
  getLinearBias(): number {
    return this._nc.linearBias
  }

  /** Mirrors GfColorSpace::GetTransferFunctionParams — returns [K0, phi]. */
  getTransferFunctionParams(): [number, number] {
    return [this._nc.K0, this._nc.phi]
  }

  /**
   * Mirrors GfColorSpace::GetRGBToXYZ.
   */
  getRGBToXYZ(): GfMatrix3f {
    return new GfMatrix3f(...this._nc.rgbToXYZ)
  }

  /** Mirrors GfColorSpace::GetRGBToRGB. */
  getRGBToRGB(srcColorSpace: GfColorSpace): GfMatrix3f {
    // Upstream computes B_inv * A with GfMatrix3f; here via nanocolor helpers.
    const A = srcColorSpace._nc.rgbToXYZ
    const Binv = _M33fInvert(this._nc.rgbToXYZ)
    return new GfMatrix3f(..._M33fMultiply(Binv, A))
  }

  /** Mirrors GfColorSpace::GetPrimariesAndWhitePoint — [red, green, blue, white]. */
  getPrimariesAndWhitePoint(): [GfVec2f, GfVec2f, GfVec2f, GfVec2f] {
    const nc = this._nc
    return [
      new GfVec2f(nc.redPrimary.x, nc.redPrimary.y),
      new GfVec2f(nc.greenPrimary.x, nc.greenPrimary.y),
      new GfVec2f(nc.bluePrimary.x, nc.bluePrimary.y),
      new GfVec2f(nc.whitePoint.x, nc.whitePoint.y),
    ]
  }
}

// ----------------------------------------------------------------------------
// Internal nanocolor surface exported for color.ts (not part of the public API).
// ----------------------------------------------------------------------------

export const _nc = {
  ncTransformColor: NcTransformColor,
  ncRGBToXYZ: NcRGBToXYZ,
  ncXYZToYxy: NcXYZToYxy,
  ncYxyToRGB: NcYxyToRGB,
  ncKelvinToYxy: NcKelvinToYxy,
}
export type { NcColorSpace }
