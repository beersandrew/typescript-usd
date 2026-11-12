// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfFileFormatCapabilities.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/sdf/testenv/testSdfFileFormatCapabilities.py — per-format
// SupportsReading / SupportsWriting / SupportsEditing capability flags
// (SdfFileFormat::SupportsReading/Writing/Editing and the static
// Sdf.FileFormat.FormatSupports{Reading,Writing,Editing} queries).
//
// Upstream's suite registers three C++ DSO test plugins via plugInfo.json
// (.unwritable / .unreadable / .uneditable) to exercise the negative cases.
// Those depend on the C++ plugin + plugInfo mechanism typescript-usd does not have, so
// they are NOT portable. What IS portable and shippable is the capability of
// the BUILT-IN formats — usda, usdc, usd and the usdz package format — whose
// flags are intrinsic to the implementation, not plugin metadata.
//
// Golden capability values are captured from the Pixar build (usd-2605,
// Python 3.9.21):
//   PYTHONPATH=<usd-build>/lib/python python3 -c "
//     from pxr import Sdf
//     for ext in ['.usda','.usdc','.usd','.usdz','.bogus']:
//         print(ext, Sdf.FileFormat.FormatSupportsReading(ext),
//                    Sdf.FileFormat.FormatSupportsWriting(ext),
//                    Sdf.FileFormat.FormatSupportsEditing(ext))"
//   .usda  True  True  True
//   .usdc  True  True  True
//   .usd   True  True  True
//   .usdz  True  False False   <- package format is read-only
//   .bogus False False False

import { describe, expect, it } from 'vitest'
// NOTE: these three query functions do not yet exist in typescript-usd/sdf — see the
// NEEDS-SRC note in the agent report. The file is committed red until the
// capability table + queries land in pxr/usd/sdf/src/layer.ts.
import {
  FormatSupportsReading,
  FormatSupportsWriting,
  FormatSupportsEditing,
} from 'typescript-usd/sdf'

describe('Sdf file-format capabilities (static queries)', () => {
  // sanity check for the default text format which specifies nothing special:
  // fully readable, writable, editable (upstream test_StaticDefault).
  it('test_StaticDefault — usda supports reading, writing and editing', () => {
    expect(FormatSupportsReading('.usda')).toBe(true)
    expect(FormatSupportsWriting('.usda')).toBe(true)
    expect(FormatSupportsEditing('.usda')).toBe(true)
  })

  it('usdc (crate) supports reading, writing and editing', () => {
    expect(FormatSupportsReading('.usdc')).toBe(true)
    expect(FormatSupportsWriting('.usdc')).toBe(true)
    expect(FormatSupportsEditing('.usdc')).toBe(true)
  })

  it('usd supports reading, writing and editing', () => {
    expect(FormatSupportsReading('.usd')).toBe(true)
    expect(FormatSupportsWriting('.usd')).toBe(true)
    expect(FormatSupportsEditing('.usd')).toBe(true)
  })

  // The usdz package format is intrinsically read-only — Sdf reports
  // SupportsReading=true but SupportsWriting/Editing=false. This is the
  // portable analog of upstream's .unwritable / .uneditable DSO formats.
  it('usdz is read-only — supports reading but not writing or editing', () => {
    expect(FormatSupportsReading('.usdz')).toBe(true)
    expect(FormatSupportsWriting('.usdz')).toBe(false)
    expect(FormatSupportsEditing('.usdz')).toBe(false)
  })

  // An unregistered extension supports nothing (upstream test_StaticInvalid).
  it('test_StaticInvalid — an unknown extension supports nothing', () => {
    expect(FormatSupportsReading('.bogus')).toBe(false)
    expect(FormatSupportsWriting('.bogus')).toBe(false)
    expect(FormatSupportsEditing('.bogus')).toBe(false)
  })

  // The static queries tolerate a leading dot and case, matching upstream
  // (Sdf normalizes the extension before lookup).
  it('extension lookup is case-insensitive and dot-optional', () => {
    expect(FormatSupportsReading('usda')).toBe(true)
    expect(FormatSupportsWriting('.USDA')).toBe(true)
    expect(FormatSupportsWriting('usdz')).toBe(false)
  })
})
