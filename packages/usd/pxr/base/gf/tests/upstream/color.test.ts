// Ported from OpenUSD 26.11.1: pxr/base/gf/testenv/testGfColorCpp.cpp,
//  pxr/base/gf/testenv/testGfColorPy.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// 1:1 port of OpenUSD pxr/base/gf/testenv/testGfColorPy.py
// (testGfColorPy), plus the observable color/value matrix from
// testGfColorCpp.cpp (testGfColorCpp).
//
// One describe() per upstream test method, every assert mirrored. This file is
// the CONFORMANCE oracle for the "Color" capability (GfColor + GfColorSpace).
//
// The upstream suite is built from round-trips and equality checks; it has no
// literal numeric goldens beyond the input vectors (0.5, 0.25, 0.125) and
// black. To validate our verbatim nanocolor port against the real Pixar build,
// the final "oracle-captured" describe block checks the concrete converted RGB
// tuples and color-space matrices/params, captured from the OpenUSD 26.11.1
// build (FIXTURES.md) into fixtures/color.json — never hand-derived
// (AGENTS.md numeric-fixture rule). Recapture it (FIXTURES.md) if upstream moves.
//
// Mapping of GfColor/GfColorSpace's C++ surface onto typescript-usd/gf:
//   Gf.Color()/(cs)/(rgb,cs)/(color,cs)/(color)  -> new GfColor(...)
//   c.GetRGB() / c.GetColorSpace()               -> .GetRGB() / .GetColorSpace()
//   c1 == c2 (operator==)                        -> .equals(c2)
//   Gf.ColorSpace(name) / IsValid                -> new GfColorSpace(name) / .IsValid
//   cs1 == cs2 (operator==)                      -> .equals(cs2)
//   Gf.IsClose(color, color, tol)                -> GfColorIsClose / GfIsClose(rgb,rgb)
//   repr(x) eval round-trip (Python-only)        -> reconstruct-and-compare (see note)
import { describe, it, expect } from 'vitest'
import { GfVec3f } from '../../src/vec.ts'
import { GfIsClose } from '../../src/vec.ts'
import { GfColor, GfColorIsClose } from '../../src/color.ts'
import { GfColorSpace, GfColorSpaceNames } from '../../src/colorSpace.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type Rgb = [number, number, number]
interface SpaceParams {
  gamma: number
  linearBias: number
  K0Phi: [number, number]
  rgbToXYZ: number[]
}
interface ColorFixture {
  eotf: Record<'mauveLinear' | 'c1_srgb' | 'c2_back_to_linear' | 'c3_srgb', Rgb>
  rec2020: Record<'r1_rec2020' | 'r2_back_to_linear', Rgb>
  conversionChain: Record<
    'mauveGamma' | 'colG22Rec709' | 'colLinRec709' | 'colSRGB_2' | 'colAp0' |
    'colSRGB_3' | 'col_SRGBP3' | 'colLinRec709_2', Rgb>
  spaceParams: Record<
    'lin_rec709' | 'srgb_rec709' | 'g22_rec709' | 'lin_ap0' | 'lin_rec2020' |
    'srgb_p3d65', SpaceParams>
}
// Captured from the OpenUSD 26.11.1 build (FIXTURES.md).
const G = readOracleFixture<ColorFixture>(new URL('./fixtures/color.json', import.meta.url))

// Mirrors the module-level colorApproxEq helper in testGfColorPy.py.
function colorApproxEq(c1: GfColor, c2: GfColor): boolean {
  return GfIsClose(c1.getRGB(), c2.getRGB(), 1e-5)
}

// --- setUp() shared fixtures ---
function fixtures() {
  const csSRGB = new GfColorSpace(GfColorSpaceNames.SRGBRec709)
  const csLinearSRGB = new GfColorSpace(GfColorSpaceNames.LinearRec709)
  const csLinearRec709 = new GfColorSpace(GfColorSpaceNames.LinearRec709)
  const csG22Rec709 = new GfColorSpace(GfColorSpaceNames.G22Rec709)
  const csAp0 = new GfColorSpace(GfColorSpaceNames.LinearAP0)
  const csSRGBP3 = new GfColorSpace(GfColorSpaceNames.SRGBP3D65)
  const csLinearRec2020 = new GfColorSpace(GfColorSpaceNames.LinearRec2020)
  const csIdentity = new GfColorSpace(GfColorSpaceNames.Data)

  const mauveLinear = new GfColor(new GfVec3f(0.5, 0.25, 0.125), csLinearRec709)
  const mauveGamma = new GfColor(mauveLinear, csG22Rec709)

  return {
    csSRGB, csLinearSRGB, csLinearRec709, csG22Rec709, csAp0, csSRGBP3,
    csLinearRec2020, csIdentity, mauveLinear, mauveGamma,
  }
}

describe('testGfColorCpp static color-space name tokens', () => {
  it('matches every named token asserted by testGfColorCpp.cpp', () => {
    expect(GfColorSpaceNames.LinearAP1).toBe('lin_ap1_scene')
    expect(GfColorSpaceNames.LinearAP0).toBe('lin_ap0_scene')
    expect(GfColorSpaceNames.LinearRec709).toBe('lin_rec709_scene')
    expect(GfColorSpaceNames.LinearP3D65).toBe('lin_p3d65_scene')
    expect(GfColorSpaceNames.LinearRec2020).toBe('lin_rec2020_scene')
    expect(GfColorSpaceNames.LinearAdobeRGB).toBe('lin_adobergb_scene')
    expect(GfColorSpaceNames.LinearCIEXYZD65).toBe('lin_ciexyzd65_scene')
    expect(GfColorSpaceNames.SRGBRec709).toBe('srgb_rec709_scene')
    expect(GfColorSpaceNames.G22Rec709).toBe('g22_rec709_scene')
    expect(GfColorSpaceNames.G18Rec709).toBe('g18_rec709_scene')
    expect(GfColorSpaceNames.SRGBAP1).toBe('srgb_ap1_scene')
    expect(GfColorSpaceNames.G22AP1).toBe('g22_ap1_scene')
    expect(GfColorSpaceNames.SRGBP3D65).toBe('srgb_p3d65_scene')
    expect(GfColorSpaceNames.G22AdobeRGB).toBe('g22_adobergb_scene')
    expect(GfColorSpaceNames.Identity).toBe('identity')
    expect(GfColorSpaceNames.Data).toBe('data')
    expect(GfColorSpaceNames.Unknown).toBe('unknown')
    expect(GfColorSpaceNames.CIEXYZ).toBe('lin_ciexyzd65_scene')
    expect(GfColorSpaceNames.LinearDisplayP3).toBe('lin_p3d65_scene')
  })

  it('exposes every declared token through allTokens and each is valid', () => {
    expect(GfColorSpaceNames.allTokens).toEqual([
      'lin_ap1_scene',
      'lin_ap0_scene',
      'lin_rec709_scene',
      'lin_p3d65_scene',
      'lin_rec2020_scene',
      'lin_adobergb_scene',
      'lin_ciexyzd65_scene',
      'srgb_rec709_scene',
      'g22_rec709_scene',
      'g18_rec709_scene',
      'srgb_ap1_scene',
      'g22_ap1_scene',
      'srgb_p3d65_scene',
      'g22_adobergb_scene',
      'identity',
      'data',
      'raw',
      'unknown',
      'lin_ciexyzd65_scene',
      'lin_p3d65_scene',
    ])
    for (const token of GfColorSpaceNames.allTokens) {
      expect(GfColorSpace.isValid(token)).toBe(true)
    }
  })
})

describe('test_Repr', () => {
  // Python tests `self.assertEqual(c, eval(repr(c)))`. TS has no eval(repr())
  // round-trip; the faithful equivalent is that reconstructing the same value
  // yields an equal object (the property repr/eval is meant to guarantee).
  it('default color reconstructs equal', () => {
    const c = new GfColor()
    expect(c.equals(new GfColor())).toBe(true)
  })
  it('identity color space reconstructs equal', () => {
    const cs = new GfColorSpace('identity')
    expect(cs.equals(new GfColorSpace('identity'))).toBe(true)
  })
})

describe('test_DefaultConstruction', () => {
  it('default is black in lin_rec709', () => {
    const { csLinearRec709 } = fixtures()
    const c = new GfColor()
    expect(c.getColorSpace().equals(csLinearRec709)).toBe(true)
    expect(c.getRGB().equals(new GfVec3f(0, 0, 0))).toBe(true)
  })
})

describe('test_ConstructionWithColorSpace', () => {
  it('black in a given color space', () => {
    const { csSRGB } = fixtures()
    const c = new GfColor(csSRGB)
    expect(c.getColorSpace().equals(csSRGB)).toBe(true)
    expect(c.getRGB().equals(new GfVec3f(0, 0, 0))).toBe(true)
  })
})

describe('test_ConstructionWithColorSpaceAndRgb', () => {
  it('rgb + color space', () => {
    const { csSRGB } = fixtures()
    const c = new GfColor(new GfVec3f(0.5, 0.5, 0.5), csSRGB)
    expect(c.getColorSpace().equals(csSRGB)).toBe(true)
    expect(c.getRGB().equals(new GfVec3f(0.5, 0.5, 0.5))).toBe(true)
  })
})

describe('test_EotfCurveLinear', () => {
  it('linear -> sRGB -> linear round-trips', () => {
    const { mauveLinear, csSRGB, csLinearSRGB } = fixtures()
    const c1 = new GfColor(mauveLinear, csSRGB) // convert linear to SRGB
    const c2 = new GfColor(c1, csLinearSRGB)
    expect(GfColorIsClose(mauveLinear, c2, 1e-5)).toBe(true)
    const c3 = new GfColor(c2, csSRGB)
    expect(GfColorIsClose(c1, c3, 1e-5)).toBe(true)
  })
})

describe('test_RoundTrippingToRec2020', () => {
  it('linear -> Rec2020 -> linear round-trips', () => {
    const { mauveLinear, csLinearRec2020, csLinearSRGB } = fixtures()
    const c1 = new GfColor(mauveLinear, csLinearRec2020)
    const c2 = new GfColor(c1, csLinearSRGB)
    expect(GfColorIsClose(mauveLinear, c2, 1e-5)).toBe(true)
  })
})

describe('test_ConstructionWithConversion', () => {
  it('long conversion chain returns to the start', () => {
    const {
      mauveLinear, mauveGamma, csG22Rec709, csLinearRec709, csSRGB, csAp0,
      csSRGBP3,
    } = fixtures()

    const colG22Rec709 = new GfColor(mauveLinear, csG22Rec709)
    expect(GfColorIsClose(colG22Rec709, mauveGamma, 1e-5)).toBe(true)
    const colLinRec709 = new GfColor(colG22Rec709, csLinearRec709)
    expect(GfColorIsClose(colLinRec709, mauveLinear, 1e-5)).toBe(true)

    expect(colG22Rec709.getColorSpace().equals(csG22Rec709)).toBe(true)
    expect(colLinRec709.getColorSpace().equals(csLinearRec709)).toBe(true)

    const colSRGB_2 = new GfColor(colLinRec709, csSRGB)
    const colAp0 = new GfColor(colSRGB_2, csAp0)
    const colSRGB_3 = new GfColor(colAp0, csSRGB)
    const col_SRGBP3 = new GfColor(colSRGB_3, csSRGBP3)
    const colLinRec709_2 = new GfColor(col_SRGBP3, csLinearRec709)
    expect(GfColorIsClose(colLinRec709_2, colLinRec709, 1e-5)).toBe(true)
  })
})

describe('test_MoveConstructor', () => {
  // Python has no move semantics; this tests copying.
  it('copy preserves color space and rgb', () => {
    const { csAp0 } = fixtures()
    const c1 = new GfColor(new GfVec3f(0.5, 0.25, 0.125), csAp0)
    const c2 = new GfColor(c1)
    expect(c2.getColorSpace().equals(csAp0)).toBe(true)
    expect(GfIsClose(c2.getRGB(), new GfVec3f(0.5, 0.25, 0.125), 1e-5)).toBe(true)
  })
})

describe('test_CopyAssignment', () => {
  it('assignment shares color space and rgb', () => {
    const { csAp0 } = fixtures()
    const c1 = new GfColor(new GfVec3f(0.5, 0.25, 0.125), csAp0)
    let c2 = new GfColor()
    c2 = c1
    expect(c2.getColorSpace().equals(csAp0)).toBe(true)
    expect(GfIsClose(c2.getRGB(), new GfVec3f(0.5, 0.25, 0.125), 1e-5)).toBe(true)
  })
})

describe('test_Comparison', () => {
  it('equal colors compare close and share color space', () => {
    const { csAp0 } = fixtures()
    const c1 = new GfColor(new GfVec3f(0.5, 0.25, 0.125), csAp0)
    const c2 = new GfColor(new GfVec3f(0.5, 0.25, 0.125), csAp0)
    expect(GfColorIsClose(c1, c2, 1e-5)).toBe(true)
    expect(c1.getColorSpace().equals(c2.getColorSpace())).toBe(true)
    expect(colorApproxEq(c1, c2)).toBe(true)
  })
})

// ----------------------------------------------------------------------------
// Supplemental: oracle-captured conversion values & color-space parameters.
// These are NOT in the upstream Python suite; they pin the verbatim nanocolor
// port to the native build's concrete numbers (fixtures/color.json). The TS port
// computes in double precision where the C build uses float32, so we compare
// with a 1e-4 tolerance rather than exact equality.
// ----------------------------------------------------------------------------
describe('oracle-captured conversion values', () => {
  const TOL = 1e-4
  function closeVec(actual: GfVec3f, expected: readonly number[]): void {
    for (let i = 0; i < 3; i++) {
      expect(actual.get(i)).toBeCloseTo(expected[i]!, 4)
    }
  }

  it('test_EotfCurveLinear concrete RGB', () => {
    const { mauveLinear, csSRGB, csLinearSRGB } = fixtures()
    const c1 = new GfColor(mauveLinear, csSRGB)
    closeVec(c1.getRGB(), G.eotf.c1_srgb)
    const c2 = new GfColor(c1, csLinearSRGB)
    closeVec(c2.getRGB(), G.eotf.c2_back_to_linear)
    const c3 = new GfColor(c2, csSRGB)
    closeVec(c3.getRGB(), G.eotf.c3_srgb)
  })

  it('test_RoundTrippingToRec2020 concrete RGB', () => {
    const { mauveLinear, csLinearRec2020, csLinearSRGB } = fixtures()
    const r1 = new GfColor(mauveLinear, csLinearRec2020)
    closeVec(r1.getRGB(), G.rec2020.r1_rec2020)
    const r2 = new GfColor(r1, csLinearSRGB)
    closeVec(r2.getRGB(), G.rec2020.r2_back_to_linear)
  })

  it('test_ConstructionWithConversion concrete RGB chain', () => {
    const { mauveLinear, csG22Rec709, csLinearRec709, csSRGB, csAp0, csSRGBP3 } = fixtures()
    const colG22Rec709 = new GfColor(mauveLinear, csG22Rec709)
    closeVec(colG22Rec709.getRGB(), G.conversionChain.colG22Rec709)
    const colLinRec709 = new GfColor(colG22Rec709, csLinearRec709)
    closeVec(colLinRec709.getRGB(), G.conversionChain.colLinRec709)
    const colSRGB_2 = new GfColor(colLinRec709, csSRGB)
    closeVec(colSRGB_2.getRGB(), G.conversionChain.colSRGB_2)
    const colAp0 = new GfColor(colSRGB_2, csAp0)
    closeVec(colAp0.getRGB(), G.conversionChain.colAp0)
    const colSRGB_3 = new GfColor(colAp0, csSRGB)
    closeVec(colSRGB_3.getRGB(), G.conversionChain.colSRGB_3)
    const col_SRGBP3 = new GfColor(colSRGB_3, csSRGBP3)
    closeVec(col_SRGBP3.getRGB(), G.conversionChain.col_SRGBP3)
    const colLinRec709_2 = new GfColor(col_SRGBP3, csLinearRec709)
    closeVec(colLinRec709_2.getRGB(), G.conversionChain.colLinRec709_2)
  })

  it('color-space transfer-function params & rgbToXYZ matrices', () => {
    const lin709 = new GfColorSpace(GfColorSpaceNames.LinearRec709)
    const pLin709 = G.spaceParams.lin_rec709
    expect(lin709.getGamma()).toBeCloseTo(pLin709.gamma, 5)
    expect(lin709.getLinearBias()).toBeCloseTo(pLin709.linearBias, 5)
    let [k0, phi] = lin709.getTransferFunctionParams()
    expect(k0).toBeCloseTo(pLin709.K0Phi[0], 0)
    expect(phi).toBeCloseTo(pLin709.K0Phi[1], 5)

    const srgb = new GfColorSpace(GfColorSpaceNames.SRGBRec709)
    const pSrgb = G.spaceParams.srgb_rec709
    expect(srgb.getGamma()).toBeCloseTo(pSrgb.gamma, 5)
    expect(srgb.getLinearBias()).toBeCloseTo(pSrgb.linearBias, 5)
    ;[k0, phi] = srgb.getTransferFunctionParams()
    expect(k0).toBeCloseTo(pSrgb.K0Phi[0], 6)
    expect(phi).toBeCloseTo(pSrgb.K0Phi[1], 4)

    // lin_rec709 RGB->XYZ (row-major), captured from the build.
    const expectedLin709 = G.spaceParams.lin_rec709.rgbToXYZ
    const m = lin709.getRGBToXYZ()
    for (let i = 0; i < 9; i++) {
      expect(m.GetArray()[i]!).toBeCloseTo(expectedLin709[i]!, 4)
    }

    // lin_rec2020 RGB->XYZ.
    const rec2020 = new GfColorSpace(GfColorSpaceNames.LinearRec2020)
    const expectedRec2020 = G.spaceParams.lin_rec2020.rgbToXYZ
    const m2 = rec2020.getRGBToXYZ()
    for (let i = 0; i < 9; i++) {
      expect(m2.GetArray()[i]!).toBeCloseTo(expectedRec2020[i]!, 4)
    }
    void TOL
  })

  it('IsValid recognizes named spaces and rejects junk', () => {
    expect(GfColorSpace.isValid('lin_rec709_scene')).toBe(true)
    expect(GfColorSpace.isValid('identity')).toBe(true)
    expect(GfColorSpace.isValid('not_a_color_space')).toBe(false)
  })
})
