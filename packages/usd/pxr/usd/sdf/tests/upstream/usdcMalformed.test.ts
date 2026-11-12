// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateFile.cpp,
//  pxr/usd/sdf/testenv/testSdfUsdcMalformed.cpp
// Copyright 2016, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfUsdcMalformed.cpp, registered three
// times in pxr/usd/sdf/CMakeLists.txt:794-812: testSdfUsdcMalformed (default
// mmap read path), testSdfUsdcMalformed_PREAD (USDC_USE_PREAD=1) and
// testSdfUsdcMalformed_ASSET (USDC_USE_ASSET=1).
//
// Inputs: fixtures/testSdfUsdcMalformed/*.usdc, copied byte-for-byte unmodified
// from pxr/usd/sdf/testenv/testSdfUsdcMalformed/ (OpenUSD 26.11.1; Pixar,
// licensed under the terms in OpenUSD's LICENSE.txt, https://openusd.org/license).
//
// Read paths: upstream's three registrations select how CrateFile reaches the
// bytes (mmap, pread, or ArAsset::Read). typescript-usd's crate reader always
// parses one in-memory Uint8Array, so the variants collapse onto one reader;
// each registration is still run over a distinct TS entry point:
//   testSdfUsdcMalformed        Layer.findOrOpen(filesystem path)
//                               (ArDefaultResolver -> ArFilesystemAsset)
//   testSdfUsdcMalformed_PREAD  Layer.fromBytes(bytes read from the file);
//                               fromBytes throws the error a failed
//                               FindOrOpen posts, which this opener posts
//   testSdfUsdcMalformed_ASSET  Layer.findOrOpen through an ArInMemoryResolver
//                               (a non-filesystem ArAsset)
//
// The four oversize cases are compiled in upstream only under
// PXR_PREFER_SAFETY_OVER_SPEED (testSdfUsdcMalformed.cpp:107-119). The
// 26.11.1 reference build has those checks on: each of the four defaults
// posts an error there (crateFile.cpp:694 zero-copy out-of-bounds,
// crateFile.cpp:4382 corrupt asset). typescript-usd's crate reader is always
// safety-checked (crateFile.ts, "for a web-facing reader the safety check is
// always on"), so all four run.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// Importing typescript-usd/usd registers the crate (.usdc) file format.
import 'typescript-usd/usd'
import { Layer } from 'typescript-usd/sdf'
import { _sdfFindOrOpenLayer } from 'typescript-usd/sdf/_internal'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Error as TfError, TfDiagnosticMgr, TfErrorMark } from 'typescript-usd/tf'
import obsoleteVersionFixture from '../fixtures/usdcObsoleteVersion/expected.json' with { type: 'json' }

const obsoleteVersion = obsoleteVersionFixture.payload['bad_obsolete_version.usdc'] as { raised: boolean, errors: string[] }

const TESTENV = path.join(
  fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testSdfUsdcMalformed')
const bytesOf = (name: string): Uint8Array => new Uint8Array(readFileSync(path.join(TESTENV, name)))

type Opener = (name: string) => Promise<Layer | undefined>

const readPaths: Array<[string, Opener]> = [
  ['testSdfUsdcMalformed', name => Layer.findOrOpen(path.join(TESTENV, name))],
  ['testSdfUsdcMalformed_PREAD', async name => {
    try {
      return Layer.fromBytes(bytesOf(name), path.join(TESTENV, name))
    } catch (error) {
      if (!(error instanceof TfError)) throw error
      TfDiagnosticMgr.GetInstance().postError(error)
      return undefined
    }
  }],
  ['testSdfUsdcMalformed_ASSET', name =>
    _sdfFindOrOpenLayer(name, new ArInMemoryResolver({ [name]: bytesOf(name) }))],
]

// Collect the TfErrors posted while running `action`. A thrown exception is
// not a posted error: it propagates (the upstream test would crash).
async function postedErrors<T>(action: () => Promise<T> | T): Promise<{ result: T, errors: string[] }> {
  const mark = new TfErrorMark()
  try {
    const result = await action()
    const errors = mark.getErrors().map(e => e.getCommentary())
    mark.clear()
    return { result, errors }
  } finally {
    mark.dispose()
  }
}

for (const [registration, open] of readPaths) {
  describe(registration, () => {
    // _Test (testSdfUsdcMalformed.cpp:40-66): FindOrOpen succeeds, the spec
    // exists, and reading its default posts errors exactly when expected.
    async function test(layerPath: string, attrPath: string, expectError: boolean) {
      const layer = await open(layerPath)
      expect(layer, `failed to open ${layerPath}`).toBeTruthy()
      const attr = layer!.getAttributeAtPath(attrPath)
      expect(attr, `no spec at ${attrPath} in ${layerPath}`).toBeTruthy()
      const { errors } = await postedErrors(() => attr!.getDefaultValue())
      if (expectError) expect(errors.length).toBeGreaterThan(0)
      else expect(errors).toEqual([])
    }

    it('baseline.usdc reads /Root.zcPoints without errors', async () => {
      await test('baseline.usdc', '/Root.zcPoints', false)
    })

    // _TestObsolete (testSdfUsdcMalformed.cpp:68-92): the open fails with
    // exactly one error, the obsolete version error, and no layer. The
    // native error is captured from the 26.11.1 build in
    // fixtures/usdcObsoleteVersion (the Python surface raises the posted
    // error as Tf.ErrorException).
    it('bad_obsolete_version.usdc fails to open with only an obsolete version error', async () => {
      const { result: layer, errors } = await postedErrors(() => open('bad_obsolete_version.usdc'))
      expect(layer).toBeUndefined()
      expect(obsoleteVersion.raised).toBe(true)
      expect(errors.map(e => e.replace(/@[^@]*@/, '@<asset>@'))).toEqual(obsoleteVersion.errors)
      expect(errors[0]).toContain('obsolete version')
    })

    it('bad_oversize_zerocopy.usdc posts an error reading /Root.zcPoints', async () => {
      await test('bad_oversize_zerocopy.usdc', '/Root.zcPoints', true)
    })

    it('bad_overflow_size.usdc posts an error reading /Root.zcPoints', async () => {
      await test('bad_overflow_size.usdc', '/Root.zcPoints', true)
    })

    it('bad_moderate_oversize.usdc posts an error reading /Root.zcPoints', async () => {
      await test('bad_moderate_oversize.usdc', '/Root.zcPoints', true)
    })

    it('bad_str_oversize.usdc posts an error reading /Root.strs', async () => {
      await test('bad_str_oversize.usdc', '/Root.strs', true)
    })
  })
}
