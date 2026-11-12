// Ported from OpenUSD 26.11.1: pxr/usd/sdf/fileIO.h,
//  pxr/usd/sdf/testenv/testSdfTextFile.cpp, pxr/usd/sdf/usdaFileFormat.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Shared body of the ports of pxr/usd/sdf/testenv/testSdfTextFile.cpp
// (textFile.test.ts registers testSdfTextFile, textFile_1_1.test.ts registers
// testSdfTextFile_1_1, which runs the same executable with
// USD_WRITE_NEW_USDA_FILES_AS_VERSION=1.1; pxr/usd/sdf/CMakeLists.txt:725-734).
//
// Upstream drives the private Sdf_StringOutput (fileIO.h) directly. Its public
// analog is SdfUsdaFileFormat::WriteToString (usdaFileFormat.cpp:618-629),
// which writes the header with SdfFileVersion() -- "no explicit version" -- and
// lets the body raise it through RequestWriteVersionUpgrade. That is
// Layer.exportToString here, so the two "no explicit version" cases run
// through it. The cases that pass an explicit SdfFileVersion to WriteHeader,
// or call RequestWriteVersionUpgrade on an explicitly versioned output, have
// no TS counterpart: typescript-usd has no Sdf_StringOutput /
// Sdf_TextOutput::WriteHeader(cookie, version) /
// Sdf_TextOutput::RequestWriteVersionUpgrade and no SdfFileVersion class, so
// they are not ported.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FileFormat as SdfFileFormat, Layer } from 'typescript-usd/sdf'

// The USDA text testSdfParsing uses for its 1.1 spline tangent-algorithm case,
// pxr/usd/sdf/testenv/testSdfParsing.testenv/226_version_1.1.usda (vendored
// unmodified in fixtures/testSdfParsing.testenv). Writing its
// "post curve (2, 0, autoEase)" knot requests a 1.1 upgrade
// (fileIO_Common.cpp:750-754), the analog of testSdfTextFile.cpp's
// out.RequestWriteVersionUpgrade(ver110, ...).
const VERSION_1_1_LAYER = new URL(
  './fixtures/testSdfParsing.testenv/226_version_1.1.usda', import.meta.url)

export function defineTextFileTests(registration: string, defaultVersionSetting: string | undefined): void {
  describe(registration, () => {
    // InitDefVersion (testSdfTextFile.cpp:23-38): the default version is the
    // USD_WRITE_NEW_USDA_FILES_AS_VERSION setting, default "1.0"
    // (usdaFileFormat.cpp:49-54), normalized through SdfFileVersion. Both
    // registered values ("1.0", "1.1") are already in AsString form.
    const defVersionString = defaultVersionSetting ?? '1.0'

    // testSdfTextFile.cpp:44 and :117 look the format up by its bare
    // extension, which upstream accepts (fileFormat.cpp:416-424 returns the
    // string itself when it has no extension).
    it('FindByExtension("usda") finds the usda file format', () => {
      expect(SdfFileFormat.findByExtension('usda')?.formatId).toBe('usda')
    })
    // So the header cases below are not hidden behind that lookup, they fall
    // back to a path with the extension.
    const usdaFormat = SdfFileFormat.findByExtension('usda') ?? SdfFileFormat.findByExtension('x.usda')
    // SdfFileFormat::GetFileCookie (fileFormat.cpp:78, "#" + formatId).
    // typescript-usd has no GetFileCookie; the cookie is formed from the
    // usda format's id the same way.
    const cookie = `#${usdaFormat?.formatId}`

    const headerOf = (text: string): string => text.slice(0, text.indexOf('\n') + 1)

    // TestHeader, "Test with no explicit version" (testSdfTextFile.cpp:48-61).
    it('TestHeader: no explicit version writes the default version', () => {
      const out = Layer.createAnonymous().exportToString()
      const expected = cookie + ' ' + defVersionString + '\n'
      expect(headerOf(out)).toBe(expected)
    })
    // TestHeader "explicit default version", "version 1.0", "version 1.1"
    // (testSdfTextFile.cpp:63-107): not ported -- no
    // Sdf_TextOutput::WriteHeader(cookie, SdfFileVersion).

    // TestUpdate, "Test with no explicit version" (testSdfTextFile.cpp:122-139):
    // a 1.1 upgrade request after the header rewrites it to 1.1.
    it('TestUpdate: no explicit version is upgraded to 1.1', () => {
      const ver110String = '1.1'
      const layer = Layer.createAnonymous()
      expect(layer.importFromString(readFileSync(VERSION_1_1_LAYER, 'utf8'))).toBe(true)
      const out = layer.exportToString()
      const expected = cookie + ' ' + ver110String + '\n'
      expect(headerOf(out)).toBe(expected)
    })
    // TestUpdate "explicit default version", "version 1.0", "version 1.1"
    // (testSdfTextFile.cpp:141-192): not ported -- no
    // Sdf_TextOutput::WriteHeader(cookie, SdfFileVersion) /
    // RequestWriteVersionUpgrade.
  })
}
