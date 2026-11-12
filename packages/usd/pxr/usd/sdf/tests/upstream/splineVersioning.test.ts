// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfSplineVersioning.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/sdf/testenv/testSdfSplineVersioning.py
//
// Upstream verifies that authoring Ts spline data into a layer version-gates the
// written crate (.usdc) and USDA file formats:
//   - spline-free layer:           usd 0.8.0,  usda 1.0,  usdc 0.8.0
//   - + a spline:                  usd 0.12.0, usda 1.0,  usdc 0.12.0
//   - + a tangent-algorithm knot:  usd 0.13.0, usda 1.1,  usdc 0.13.0
//
// This older capture covers the spline-free baseline. Fresh native 26.11.1
// spline-bearing USDA version and semantic checks live in splineTextVersions.test.ts.
// Crate content-driven version gating is a separate contract.
//
// Golden versions captured from the Pixar reference build (usd-2605,
// Python 3.9.21) by replicating setUp()/_CheckVersions() with no spline:
//   Sdf.CrateInfo.Open(usd).GetFileVersion()  -> '0.8.0'
//   usda header                               -> '1.0'
//   Sdf.CrateInfo.Open(usdc).GetFileVersion() -> '0.8.0'
//   usdc header bytes                         -> [..PXR-USDC.., 0, 8, 0]

import { describe, expect, it } from 'vitest'
// Importing typescript-usd/usd transitively registers the crate (.usdc) file format plugin
// so Layer.toUsdc() is available.
import 'typescript-usd/usd'
import { Layer } from 'typescript-usd/sdf'

// Mirror upstream setUp(): a layer with /Prim and a Double attribute /Prim.value,
// and no spline authored.
const SPLINE_FREE_LAYER = `#usda 1.0
def "Prim"
{
    double value
}
`

// Read the major.minor.patch from a crate (.usdc) bootstrap header, the value
// Sdf.CrateInfo.GetFileVersion() reports.
function crateFileVersion(bytes: Uint8Array): string {
  const magic = String.fromCharCode(...bytes.slice(0, 8))
  expect(magic).toBe('PXR-USDC')
  return `${bytes[8]}.${bytes[9]}.${bytes[10]}`
}

describe('SdfSplineVersioning (spline-free baseline)', () => {
  it('writes the 0.8.0 crate version for a spline-free layer', () => {
    const layer = Layer.createInMemory('testSdfCrateSplines.usdc', SPLINE_FREE_LAYER)
    const usdc = layer.toUsdc()
    // Golden from Pixar build: usdcVersion == '0.8.0'
    expect(crateFileVersion(usdc)).toBe('0.8.0')
  })

  it('writes the 1.0 usda version for a spline-free layer', () => {
    const layer = Layer.createInMemory('testSdfCrateSplines.usda', SPLINE_FREE_LAYER)
    const usda = layer.toUsda()
    const header = usda.split('\n', 1)[0] ?? ''
    // Golden from Pixar build: usdaVersion == '1.0'
    const match = /^#usda\s+([0-9.]+)\s*$/.exec(header)
    expect(match, `failed to find usda version in header: ${header}`).not.toBeNull()
    expect(match![1]).toBe('1.0')
  })

  it('round-trips the double attribute through crate without bumping the version', () => {
    // Re-reading the crate must still report 0.8.0 (no content forces a bump).
    const layer = Layer.createInMemory('testSdfCrateSplines.usdc', SPLINE_FREE_LAYER)
    const usdc = layer.toUsdc()
    const reread = Layer.createInMemory('roundtrip.usdc', usdc)
    expect(crateFileVersion(reread.toUsdc())).toBe('0.8.0')
    // The double attribute survives the round-trip.
    expect(reread.getFieldNames('/Prim.value')).toContain('typeName')
  })
})
