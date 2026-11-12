// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/sdf/testenv/testSdfFileVersion.cpp, pxr/usd/sdf/crateFile.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { serializeUsdc } from '../../src/crateFile.ts'
import { parseCrate } from '../../src/crateFile.ts'
import nativeVersions from '../fixtures/crateVersion/expected.json' with { type: 'json' }

// Ported from OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfFileVersion.cpp.
//
// SCOPE NOTE: The upstream testenv exercises the `SdfFileVersion` value class
// (FromString / AsString / AsFullString / AsInt / CanRead / CanWrite / relops /
// the uint8_t[8] "BootVersion" constructor). typescript-usd has no standalone
// SdfFileVersion class — crate (.usdc) version handling is inlined in
// usdc's parser (`parseCrate`, the "PXR-USDC" bootstrap header read) and writer
// (`serializeUsdc`, which emits the DEFAULT_NEW_VERSION header). So this suite
// ports the slice of the capability that the EXISTING public/internal surface
// actually implements: reading the crate bootstrap version bytes, the supported
// version range gate, and the writer's emitted version. The full SdfFileVersion
// arithmetic value-class is NEEDS-SRC (see the agent report).
//
// All golden version bytes are captured from the Pixar build (usd-2605):
//   Usd.Stage.CreateNew('x.usdc'); DefinePrim('/hello','Xform'); Save()
//   → header magic b'PXR-USDC', version bytes [0, 8, 0, 0, 0, 0, 0, 0]
// i.e. crate version 0.8.0 — upstream's Sdf_CrateFile DEFAULT_NEW_VERSION.

// A real .usdc authored by the Pixar build (usd-2605) for the layer above.
// Its 8-byte bootstrap version is [0, 8, 0, 0, 0, 0, 0, 0] (= 0.8.0).
const PIXAR_USDC_0_8_0_B64 =
  'UFhSLVVTREMACAAAAAAAAIMBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAwAAAAcAAAAAAAAAMQAAAAAAAAA0AAAAAAAAAADwIjstKQAAcHJpbUNoaWxkcmVuAGhlbGxvAHNwZWNpZmllcgB0eXBlTmFtZQBYZm9ybQAAAAAAAAAAAAMAAAAAAAAACAAAAAAAAAAAYAIAAAAQARgAAAAAAAAAACBYAAEAECkFANAAAAAqQAYAAAAAAAtABQAAAAAAAAAMAAAAAAAAAACgAgAAAEUBAP8B/QIAAAAAAAAAAgAAAAAAAAAIAAAAAAAAAABgAQAAAAEACAAAAAAAAAAAYAIAAAABAQcAAAAAAAAAAFD/////AAIAAAAAAAAACAAAAAAAAAAAYAEAAAABAAgAAAAAAAAAAGACAAAAAQAIAAAAAAAAAABgBwAAAAT/BgAAAAAAAABUT0tFTlMAAAAAAAAAAAAAZAAAAAAAAABMAAAAAAAAAFNUUklOR1MAAAAAAAAAAACwAAAAAAAAAAgAAAAAAAAARklFTERTAAAAAAAAAAAAALgAAAAAAAAAOAAAAAAAAABGSUVMRFNFVFMAAAAAAAAA8AAAAAAAAAAcAAAAAAAAAFBBVEhTAAAAAAAAAAAAAAAMAQAAAAAAAD8AAAAAAAAAU1BFQ1MAAAAAAAAAAAAAAEsBAAAAAAAAOAAAAAAAAAA='

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let bits = 0, nbits = 0, oi = 0
  for (const ch of clean) {
    const v = B64_ALPHABET.indexOf(ch)
    if (v < 0) continue
    bits = (bits << 6) | v
    nbits += 6
    if (nbits >= 8) { nbits -= 8; out[oi++] = (bits >> nbits) & 0xff }
  }
  return out
}

function makeSimpleLayer(): Layer {
  const layer = Layer.createAnonymous()
  layer.definePrimSpec('/hello', 'Xform')
  return layer
}

describe('crate file version — bootstrap header (read)', () => {
  it('parses a real Pixar-authored 0.8.0 crate', () => {
    const bytes = b64ToBytes(PIXAR_USDC_0_8_0_B64)
    // Golden: the Pixar header magic + version bytes.
    expect(String.fromCharCode(...bytes.slice(0, 8))).toBe('PXR-USDC')
    expect([...bytes.slice(8, 16)]).toEqual([0, 8, 0, 0, 0, 0, 0, 0])
    // typescript-usd accepts and reads it.
    const scene = parseCrate(bytes) as unknown as Record<string, unknown>
    expect(scene['/hello']).toBeDefined()
  })

  it('rejects an unsupported major version', () => {
    const bytes = b64ToBytes(PIXAR_USDC_0_8_0_B64).slice()
    bytes[8] = 1 // 1.8.0
    expect(() => parseCrate(bytes)).toThrow(/Sdf crate file version mismatch -- file is 1\.8\.0, software supports 0\.16\.0/)
  })

  it('accepts a readable pre-0.7 minor version (0.6.0)', () => {
    const bytes = b64ToBytes(PIXAR_USDC_0_8_0_B64).slice()
    bytes[9] = 6
    expect(() => parseCrate(bytes)).not.toThrow()
  })

  // OpenUSD 26.11.1 crateFile.cpp:393-420 adds Duration in version0.16.
  // Capture the actual reader boundary rather than retaining the v26.08 ceiling.
  it('rejects the native too-new minor version', () => {
    for (const {minor, readable} of nativeVersions.payload.rows) {
      if (readable) continue
      const bytes = b64ToBytes(PIXAR_USDC_0_8_0_B64).slice()
      bytes[9] = minor
      expect(() => parseCrate(bytes)).toThrow(`Sdf crate file version mismatch -- file is 0.${minor}.0`)
    }
  })

  it('accepts every native-readable structurally compatible minor version', () => {
    for (const {minor, readable} of nativeVersions.payload.rows) {
      if (!readable) continue
      const bytes = b64ToBytes(PIXAR_USDC_0_8_0_B64).slice()
      bytes[9] = minor
      expect(() => parseCrate(bytes), `0.${minor}.0`).not.toThrow()
    }
  })

  it('rejects a non-crate magic', () => {
    const bytes = b64ToBytes(PIXAR_USDC_0_8_0_B64).slice()
    bytes[0] = 'x'.charCodeAt(0)
    expect(() => parseCrate(bytes)).toThrow(/Not a USDC file/)
  })
})

describe('crate file version — bootstrap header (write)', () => {
  it('emits the PXR-USDC magic + DEFAULT_NEW_VERSION 0.8.0', () => {
    const bytes = serializeUsdc(makeSimpleLayer())
    // Golden from the Pixar build: magic "PXR-USDC", version bytes 0.8.0.
    expect(String.fromCharCode(...bytes.slice(0, 8))).toBe('PXR-USDC')
    expect(bytes[8]).toBe(0) // major
    expect(bytes[9]).toBe(8) // minor
    expect(bytes[10]).toBe(0) // patch
  })

  it('zero-pads the remaining 5 version bytes (bytes 11..16)', () => {
    const bytes = serializeUsdc(makeSimpleLayer())
    // Pixar header is [0, 8, 0, 0, 0, 0, 0, 0]; bytes 11..16 are zero padding.
    expect([...bytes.slice(11, 16)]).toEqual([0, 0, 0, 0, 0])
  })

  it('writes a header typescript-usd can read back (round-trip)', () => {
    const bytes = serializeUsdc(makeSimpleLayer())
    const scene = parseCrate(bytes) as unknown as Record<string, unknown>
    expect(scene['/hello']).toBeDefined()
  })
})
