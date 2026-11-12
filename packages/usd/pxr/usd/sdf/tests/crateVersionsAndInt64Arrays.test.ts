// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateFile.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.08 pxr/usd/sdf/crateFile.cpp:1786-1789 and :2098-2100 (array
// sizes are preceded by a shape word before 0.5.0 and are uint32 before
// 0.7.0) and :2215-2235 (int64 and uint64 arrays of 16 or more elements are
// integer-compressed). The fixtures were written by OpenUSD v26.08's usdcat
// from fixtures/crateVersions/ints.usda, at its default crate version (0.8.0)
// and with USD_WRITE_NEW_USDC_FILES_AS_VERSION=0.4.0 and 0.6.0. sphere-0.0.1.usd
// is OpenUSD's own testenv file pxr/usd/bin/usddiff/testenv/
// testDiffToolVariousUsdFormats/a.usd, a crate 0.0.1 layer holding one prim
// (26.11.1 ships that file as 0.8.0).
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import { Layer } from '../src/index.ts'
import obsoleteVersion from './fixtures/usdcObsoleteVersion/expected.json' with { type: 'json' }

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/crateVersions/${name}`, import.meta.url))

const BIG = [-9223372036854775808n, -1n, 0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n,
  9007199254740993n, 9223372036854775807n, 42n, 42n, 42n]
const UBIG = [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n, 13n, 14n,
  9007199254740993n, 18446744073709551615n, 7n, 7n, 7n]
const INTS = [5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6, -7, -8, -9, -10, -11, -12]

describe.each(['0.8.0', '0.6.0', '0.4.0'])('crate %s written by OpenUSD', version => {
  it('reads int64, uint64, int and float arrays exactly', async () => {
    const layer = (await Layer.open(fixture(`ints-${version}.usdc`)))!
    expect(layer.getField('/', 'primChildren')).toEqual(['Ints'])
    expect(layer.getField('/Ints.big', 'default')).toEqual(BIG)
    expect(layer.getField('/Ints.ubig', 'default')).toEqual(UBIG)
    expect(layer.getField('/Ints.small', 'default')).toEqual([1n, 2n, 3n])
    expect(layer.getField('/Ints.ints', 'default')).toEqual(INTS)
    expect(layer.getField('/Ints.floats', 'default')).toEqual([1.5, 2.5, 3.5])
  })
})

// OpenUSD 26.11.1 no longer reads crate versions before 0.4.0
// (crateFile.cpp:161-166, 3562-3578); its own usddiff testenv a.usd was
// rewritten as 0.8.0. The native failure is captured in
// fixtures/usdcObsoleteVersion.
describe('crate 0.0.1 written by OpenUSD', () => {
  it('fails to open with the obsolete version error', async () => {
    // SdfLayer::FindOrOpen returns null with the error posted; the Python
    // surface the capture uses raises it.
    const native = obsoleteVersion.payload['sphere-0.0.1.usd']
    expect(native.raised).toBe(true)
    const mark = new TfErrorMark()
    try {
      expect(await Layer.findOrOpen(fixture('sphere-0.0.1.usd'))).toBeUndefined()
      const errors = mark.getErrors().map(e => e.getCommentary().replace(/@[^@]*@/, '@<asset>@'))
      mark.clear()
      expect(errors).toEqual(native.errors)
    } finally {
      mark.dispose()
    }
  })
})
