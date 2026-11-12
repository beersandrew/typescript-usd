// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdUsdzBugGHSA01.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Ported from pxr/usd/usd/testenv/testUsdUsdzBugGHSA01.cpp
//
// Security-regression suite for GitHub advisory GHSA-4j7j-gm3f-m63w. Upstream
// feeds a deliberately MALFORMED usdz (root.usdz, 3515 bytes) — a well-formed
// zip whose inner scene.usdc is corrupt — to UsdStage::Open and asserts the
// reader fails GRACEFULLY rather than crashing or reading out of bounds. The
// C++ test only runs its assertions under PXR_PREFER_SAFETY_OVER_SPEED, and
// checks for two posted runtime errors:
//   - "Invalid spec type -32702198"
//   - "Corrupt asset <...root.usdz[scene.usdc]>: exception thrown unpacking a
//      value, returning an empty VtValue"
//
// Pixar oracle (usd-2605) on the exact fixture bytes (26.11.1 also raises;
// fixtures/securityRegressions/expected.json):
//   Tf.ErrorException:
//     ...CrateFile::_UnpackValue... 'Corrupt asset
//     </...root.usdz[scene.usdc]>: exception thrown unpacking a value...'
//
// In typescript-usd the observable analog is that opening the malformed package REJECTS
// with a thrown, catchable Error (here a RangeError raised by a bounds-checked
// DataView read while unpacking the corrupt inner crate) rather than crashing
// or reading out of bounds. RangeError-on-OOB-read is exactly the graceful
// failure shape the crate reader is expected to produce (cf.
// readOutOfBounds.test.ts). The EXACT commentary differs from the oracle; the
// SECURITY-RELEVANT behavior (catchable failure, no OOB read / crash) is what
// these tests pin.

import { existsSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { postedErrors } from '../../../../testing/postedErrors.ts'
import securityFixture from './fixtures/securityRegressions/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../../testing/oracleFixture.ts'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { UsdZipFile, createUsdzPackage } from 'typescript-usd/sdf'

// The upstream input, vendored unmodified (fixtures/securityRegressions/
// README.md). A missing file fails the tests that need it rather than
// skipping them.
const FIXTURE = 'testUsdUsdzBugGHSA01.testenv/root.usdz'
const native = oraclePayload(securityFixture).cases.find(c => c.file === FIXTURE)!
function fixtureBytes(): Uint8Array {
  const url = new URL(`./fixtures/securityRegressions/${FIXTURE}`, import.meta.url)
  if (!existsSync(url)) {
    throw new Error(`required upstream fixture ${FIXTURE} is missing; see fixtures/securityRegressions/README.md`)
  }
  return new Uint8Array(readFileSync(url))
}

// A PXR-USDC crate header (version 0.8.0) whose TOC offset points past the end
// of the buffer — a corrupt inner layer.
function corruptCrate(): Uint8Array {
  const buf = new Uint8Array(64)
  buf.set(new TextEncoder().encode('PXR-USDC'), 0)
  buf[8] = 0
  buf[9] = 8
  buf[10] = 0
  new DataView(buf.buffer).setUint32(16, 0xffffff, true) // bogus TOC offset
  return buf
}

describe('Usd usdz reader on a malformed package — GHSA-4j7j-gm3f-m63w', () => {
  afterEach(() => {
    _setResolverForTest(new ArInMemoryResolver({}))
  })

  // --- Synthetic packages / zips (self-contained, always available) ---

  it('isZip rejects bytes that are not a zip archive', () => {
    expect(UsdZipFile.isZip(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false)
  })

  it('rejects a zip-magic buffer with no end-of-central-directory record', () => {
    // "PK\x03\x04" local-header magic but no EOCD — the directory scan must
    // fault with a catchable Error rather than read out of bounds.
    const buf = new Uint8Array(64)
    buf[0] = 0x50
    buf[1] = 0x4b
    buf[2] = 0x03
    buf[3] = 0x04
    expect(() => UsdZipFile.fromBytes(buf)).toThrow()
  })

  it('rejects a zip whose central-directory offset points past the buffer', () => {
    // Well-formed EOCD claiming one entry, but the central-directory offset is
    // out of bounds — the read must fault (catchable Error), not crash.
    const buf = new Uint8Array(64)
    buf[0] = 0x50
    buf[1] = 0x4b
    buf[2] = 0x03
    buf[3] = 0x04
    const eocd = 64 - 22
    const view = new DataView(buf.buffer)
    view.setUint32(eocd, 0x06054b50, true) // EOCD signature
    view.setUint16(eocd + 10, 1, true) // total entry count = 1
    view.setUint32(eocd + 16, 0xffffff, true) // central-dir offset (OOB)
    let caught: unknown
    try {
      UsdZipFile.fromBytes(buf)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
  })

  it('Stage.open fails on a well-formed usdz wrapping a corrupt inner crate', async () => {
    // The GHSA-4j7j shape: a valid zip whose first .usdc layer is corrupt.
    const usdz = createUsdzPackage([{ name: 'scene.usdc', data: corruptCrate() }])
    expect(UsdZipFile.isZip(usdz)).toBe(true)
    // The open yields no stage and posts errors (Tf.ErrorException natively).
    const { result: stage, errors } = await postedErrors(() => Stage.open('synthetic.usdz', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'synthetic.usdz': usdz })) }))
    expect(stage).toBeUndefined()
    expect(errors.length).toBeGreaterThan(0)
  })

  // --- The exact upstream fixture (graceful failure, matching the oracle) ---

  describe('upstream root.usdz fixture', () => {
    // Native 26.11.1 Usd.Stage.Open raises on this file (expected.json).
    it('native OpenUSD rejects the fixture', () => {
      expect(native.opened).toBe(false)
    })

    it('the fixture is a zip package (PK magic, 3515 bytes)', () => {
      const bytes = fixtureBytes()
      expect(UsdZipFile.isZip(bytes)).toBe(true)
      expect(bytes.length).toBe(native.size)
    })

    it('the package exposes a corrupt scene.usdc inner layer', () => {
      const bytes = fixtureBytes()
      const zip = UsdZipFile.fromBytes(bytes)
      expect(zip.entryNames).toContain('scene.usdc')
    })

    it('Stage.open on the corrupt package fails with posted errors (matches Tf.ErrorException)', async () => {
      const bytes = fixtureBytes()
      // The open yields no stage and posts errors (Tf.ErrorException natively).
      const { result: stage, errors } = await postedErrors(() => Stage.open('root.usdz', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'root.usdz': bytes })) }))
      expect(stage).toBeUndefined()
      expect(errors.length).toBeGreaterThan(0)
    })
  })
})
