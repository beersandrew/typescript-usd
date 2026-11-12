// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdReadOutOfBounds.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Ported from pxr/usd/usd/testenv/testUsdReadOutOfBounds.py
//
// Upstream opens a deliberately malformed crate (.usd with PXR-USDC content)
// whose internal section sizes point past the end of the byte mapping, and
// asserts that opening it raises Tf.ErrorException (i.e. the crate reader fails
// GRACEFULLY — a catchable error — instead of crashing or reading out of
// bounds). The fixture, corrupt.usd, declares "61000 bytes at offset 128 in a
// mapping of length 606".
//
// Pixar oracle (usd-2605) on the exact fixture bytes (26.11.1 also raises;
// fixtures/securityRegressions/expected.json):
//   Tf.ErrorException: Error in '..._ReadStructuralSections' ...
//   'Encountered: Read out-of-bounds: 61000 bytes at offset 128 in a mapping
//    of length 606, while reading @corrupt.usd@'
//
// In typescript-usd the observable analog is that the crate parser / Stage.open REJECTS
// the buffer with a thrown Error (a catchable JS error: RangeError on an
// out-of-bounds DataView read, or an explicit parser Error) rather than
// returning a bogus stage or crashing the process with a non-Error throw.

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
const FIXTURE = 'testUsdReadOutOfBounds/corrupt.usd'
const native = oraclePayload(securityFixture).cases.find(c => c.file === FIXTURE)!
function fixtureBytes(): Uint8Array {
  const url = new URL(`./fixtures/securityRegressions/${FIXTURE}`, import.meta.url)
  if (!existsSync(url)) {
    throw new Error(`required upstream fixture ${FIXTURE} is missing; see fixtures/securityRegressions/README.md`)
  }
  return new Uint8Array(readFileSync(url))
}

// "PXR-USDC" magic, version 0.8.0, then 5 unused header bytes.
function crateHeader(): Uint8Array {
  const h = new Uint8Array(16)
  h.set(new TextEncoder().encode('PXR-USDC'), 0)
  h[8] = 0 // major
  h[9] = 8 // minor
  h[10] = 0 // patch
  return h
}

describe('Usd.Stage.Open on a malformed crate — readOutOfBounds', () => {
  afterEach(() => {
    _setResolverForTest(new ArInMemoryResolver({}))
  })

  // --- Synthetic buffers (self-contained, always available) ---

  it('rejects a buffer that is too short to even hold a crate header', async () => {
    const tooShort = new Uint8Array([0x50, 0x58, 0x52, 0x2d, 0x55]) // "PXR-U"
    // The open yields no stage and posts errors (Tf.ErrorException natively).
    const { result: stage, errors } = await postedErrors(() => Stage.open('short.usd', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'short.usd': tooShort })) }))
    expect(stage).toBeUndefined()
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects PXR-USDC magic with an unsupported version', () => {
    const buf = crateHeader()
    buf[9] = 99 // minor far beyond the supported range
    expect(() => Layer.fromBytes(buf, 'corrupt.usdc')).toThrow(/Sdf crate file version mismatch/)
  })

  it('rejects PXR-USDC magic with a TOC offset pointing past the buffer end', () => {
    // Header valid, but the table-of-contents offset (u64 at byte 16) points
    // well past the 24-byte buffer — the structural read must fault, not
    // silently produce a stage.
    const buf = new Uint8Array(24)
    buf.set(crateHeader(), 0)
    new DataView(buf.buffer).setUint32(16, 0xffff, true) // tocOffset = 65535
    expect(() => Layer.fromBytes(buf, 'corrupt.usdc')).toThrow()
  })

  it('the thrown rejection is a real Error subclass (catchable, not a crash)', () => {
    const buf = new Uint8Array(24)
    buf.set(crateHeader(), 0)
    new DataView(buf.buffer).setUint32(16, 0xffff, true)
    let caught: unknown
    try {
      Layer.fromBytes(buf, 'corrupt.usdc')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
  })

  // --- The exact upstream fixture (graceful failure, matching the oracle) ---

  describe('upstream corrupt.usd fixture', () => {
    // Native 26.11.1 Usd.Stage.Open raises on this file (expected.json).
    it('native OpenUSD rejects the fixture', () => {
      expect(native.opened).toBe(false)
    })

    it('the fixture is a well-formed crate header with bogus section sizes', () => {
      const bytes = fixtureBytes()
      expect(new TextDecoder('latin1').decode(bytes.slice(0, 8))).toBe(native.magic)
      expect(bytes.length).toBe(native.size)
    })

    it('SdfLayer rejects the out-of-bounds fixture with a catchable Error', () => {
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
      const { result: stage, errors } = await postedErrors(() => Stage.open('corrupt.usd', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'corrupt.usd': bytes })) }))
      expect(stage).toBeUndefined()
      expect(errors.length).toBeGreaterThan(0)
    })
  })
})
