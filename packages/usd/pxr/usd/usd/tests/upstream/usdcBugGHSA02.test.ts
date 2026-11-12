// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdUsdcBugGHSA02.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Ported from pxr/usd/usd/testenv/testUsdUsdcBugGHSA02.cpp
//
// Security-regression suite for GitHub advisory GHSA-58p5-r2f6-g2cj. Upstream
// feeds a deliberately MALFORMED crate (root.usdc, 432498 bytes) to
// UsdStage::Open and asserts the reader fails GRACEFULLY rather than crashing
// or reading out of bounds. The C++ test only runs its assertions when
// PXR_PREFER_SAFETY_OVER_SPEED is enabled, and checks for two posted runtime
// errors:
//   - "Failed to decompress data, possibly corrupt? LZ4 error code: -596"
//   - "Corrupt path index in crate file (0 repeated)"
//
// Pixar oracle (usd-2605) on the exact fixture bytes (26.11.1 also raises;
// fixtures/securityRegressions/expected.json):
//   Tf.ErrorException:
//     ...TfFastCompression::DecompressFromBuffer... 'Failed to decompress
//     data, possibly corrupt? LZ4 error code: -596'
//
// In typescript-usd the observable analog is that the crate parser / Stage.open REJECTS
// the buffer with a thrown, catchable Error rather than returning a bogus stage
// or crashing the process with a non-Error throw. typescript-usd trips a different
// (but equally graceful) guard first — it rejects a corrupt child identifier in
// the same fixture — so the EXACT commentary string differs from the oracle;
// the SECURITY-RELEVANT behavior (catchable failure, no OOB read / crash) is
// what these tests pin.

import { existsSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { postedErrors } from '../../../../testing/postedErrors.ts'
import securityFixture from './fixtures/securityRegressions/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../../testing/oracleFixture.ts'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { Layer } from 'typescript-usd/sdf'

// The upstream input, vendored unmodified (fixtures/securityRegressions/
// README.md). A missing file fails the tests that need it rather than
// skipping them.
const FIXTURE = 'testUsdUsdcBugGHSA02.testenv/root.usdc'
const native = oraclePayload(securityFixture).cases.find(c => c.file === FIXTURE)!
function fixtureBytes(): Uint8Array {
  const url = new URL(`./fixtures/securityRegressions/${FIXTURE}`, import.meta.url)
  if (!existsSync(url)) {
    throw new Error(`required upstream fixture ${FIXTURE} is missing; see fixtures/securityRegressions/README.md`)
  }
  return new Uint8Array(readFileSync(url))
}

// "PXR-USDC" magic, version 0.8.0, then unused header bytes.
function crateHeader(): Uint8Array {
  const h = new Uint8Array(16)
  h.set(new TextEncoder().encode('PXR-USDC'), 0)
  h[8] = 0 // major
  h[9] = 8 // minor
  h[10] = 0 // patch
  return h
}

describe('Usd crate reader on a malformed .usdc — GHSA-58p5-r2f6-g2cj', () => {
  afterEach(() => {
    _setResolverForTest(new ArInMemoryResolver({}))
  })

  // --- Synthetic buffers (self-contained, always available) ---

  it('rejects non-crate bytes that are not even a crate file', () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(() => Layer.fromBytes(garbage, 'corrupt.usdc')).toThrow()
  })

  it('rejects a valid PXR-USDC header whose TOC offset points past the buffer', () => {
    // Header is well-formed but the table-of-contents u64 at byte 16 points far
    // beyond the 24-byte buffer; the structural read must fault rather than
    // silently produce a stage (this is the OOB-read class GHSA-58p5 covers).
    const buf = new Uint8Array(24)
    buf.set(crateHeader(), 0)
    new DataView(buf.buffer).setUint32(16, 0xffffff, true)
    expect(() => Layer.fromBytes(buf, 'corrupt.usdc')).toThrow()
  })

  it('the thrown rejection is a real Error subclass (catchable, not a crash)', () => {
    const buf = new Uint8Array(24)
    buf.set(crateHeader(), 0)
    new DataView(buf.buffer).setUint32(16, 0xffffff, true)
    let caught: unknown
    try {
      Layer.fromBytes(buf, 'corrupt.usdc')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
  })

  // --- The exact upstream fixture (graceful failure, matching the oracle) ---

  describe('upstream root.usdc fixture', () => {
    // Native 26.11.1 Usd.Stage.Open raises on this file (expected.json).
    it('native OpenUSD rejects the fixture', () => {
      expect(native.opened).toBe(false)
    })

    it('the fixture is a crate file (PXR-USDC magic, 432498 bytes)', () => {
      const bytes = fixtureBytes()
      expect(new TextDecoder('latin1').decode(bytes.slice(0, 8))).toBe(native.magic)
      expect(bytes.length).toBe(native.size)
    })

    it('SdfLayer rejects the corrupt fixture with a catchable Error', () => {
      const bytes = fixtureBytes()
      let caught: unknown
      try {
        Layer.fromBytes(bytes, 'corrupt.usdc')
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(Error)
    })

    it('Stage.open on the corrupt fixture fails with posted errors (matches Tf.ErrorException)', async () => {
      const bytes = fixtureBytes()
      // The open yields no stage and posts errors (Tf.ErrorException natively).
      const { result: stage, errors } = await postedErrors(() => Stage.open('root.usdc', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'root.usdc': bytes })) }))
      expect(stage).toBeUndefined()
      expect(errors.length).toBeGreaterThan(0)
    })
  })
})
