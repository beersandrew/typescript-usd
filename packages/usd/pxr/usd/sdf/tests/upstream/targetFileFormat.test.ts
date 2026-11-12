// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/TestSdfTargetFileFormat.cpp,
//  pxr/usd/sdf/testenv/testSdfTargetFileFormat.py
// Copyright 2022, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/sdf/testenv/testSdfTargetFileFormat.py
// (test_CanReadBigCookies) + TestSdfTargetFileFormat.cpp / _plugInfo.json.
//
// Upstream exercises the SdfFileFormat plugin/value-type surface:
//   - Sdf.FileFormat.FindByExtension(ext[, {target}])  -> a FileFormat object
//   - fileFormat.CanRead(path)                          -> reads the file's
//                                                          leading bytes and
//                                                          matches the format's
//                                                          "cookie" (magic str)
//   - target negotiation: one extension -> several formats distinguished by a
//     'target' arg (usda vs usdc; the A/B targets in the .cpp test plugin).
//
// The current SdfFileFormat surface has no CanRead, per-format cookie metadata,
// or target-arg negotiation. So the heart of test_CanReadBigCookies — discriminating
// goodCookie vs badCookie by a custom plugin cookie via CanRead — is BLOCKED.
//
// What IS faithfully testable, and is asserted green below:
//   1. The usda reader's header-cookie enforcement. The USDA parser requires
//      the `#usda` cookie and rejects foreign cookies ("missing #usda
//      header") — the typescript-usd analog of the python test's usda sanity check
//      `usda_format.CanRead(anyCookie.usda) == True` (and the implicit False
//      for a non-usda cookie).
//   2. Extension dispatch through the private test plugin seam — the analog of
//      FindByExtension(ext): a custom extension routes content to its
//      registered reader (mirrors the BigCookie format being registered for
//      the `test_cookie_format` extension).
//
// Golden/reference values captured from the Pixar build (usd-2605):
//   PYTHONPATH=<usd-build>/lib/python python3   (3.9.21)
//     usda = Sdf.FileFormat.FindByExtension("usda")
//     usda.CanRead("anyCookie.usda")  # "#usda\n..."     -> True
//     usda.CanRead("badCookie.usda")  # "#granola\n"     -> False
//     usda.CanRead("goodCookie.usda") # "#Molass...sses" -> False
//     Sdf.FileFormat.FindByExtension("test_cookie_format") -> None   (DSO
//         plugin not registered in the bare build; needs the compiled
//         TestSdfTargetFileFormat plugin)
//     Sdf.FileFormat.FindByExtension("usd", {"target":"usdc"})       -> None

import { describe, it, expect } from 'vitest'
import { Layer, FileFormat as SdfFileFormat } from 'typescript-usd/sdf'
import { _sdfRegisterFileFormat } from 'typescript-usd/sdf/_internal'

function registerFileFormat(extension: string, reader: NonNullable<SdfFileFormat['read']>): void {
  class TestFileFormat extends SdfFileFormat {
    readonly formatId = extension
    readonly extensions = [extension]
    read = reader
  }
  _sdfRegisterFileFormat(new TestFileFormat())
}

// The exact testenv fixture bodies (testSdfTargetFileFormat.testenv/).
// anyCookie carries a non-usda body after its header; upstream CanRead only
// inspects the cookie, but typescript-usd couples cookie-check with full parse, so we
// assert acceptance with the `#usda` cookie + a parseable body.
const BAD_COOKIE = '#granola\n'

describe('SdfTargetFileFormat (usda cookie + extension dispatch subset)', () => {
  // Faithful analog of the python test's usda sanity check:
  //   usda.CanRead(anyCookie.usda) == True   (cookie is `#usda`)
  it('usda reader accepts content carrying the #usda cookie', () => {
    const layer = Layer.createInMemory('anyCookie.usda', '#usda 1.0\n')
    // A real layer with the pseudo-root spec is produced (read succeeded).
    expect(layer.hasSpec('/')).toBe(true)
    expect(layer.getSpecType('/')).toBe('pseudoRoot')
  })

  // Implicit counterpart: a foreign cookie is rejected. Pixar reference:
  //   usda.CanRead(badCookie.usda /* "#granola" */) == False
  it('usda reader rejects a foreign cookie (the CanRead==False case)', () => {
    expect(() => Layer.createInMemory('badCookie.usda', BAD_COOKIE)).toThrow(
      /missing #usda header/,
    )
  })

  // Faithful analog of FindByExtension(ext): the BigCookie format in the .cpp
  // test plugin is registered for the `test_cookie_format` extension. typescript-usd
  // dispatches by extension through the SdfFileFormat registry.
  it('a custom extension dispatches to its registered reader (FindByExtension analog)', () => {
    let cookieLine = ''
    registerFileFormat('test_cookie_format', (bytes) => {
      cookieLine = new TextDecoder().decode(bytes).split('\n')[0] ?? ''
    })
    Layer.createInMemory('goodCookie.test_cookie_format', '#Molasses\nbody\n')
    expect(cookieLine).toBe('#Molasses')
  })

  // BLOCKED (documented, not asserted): the cookie DISCRIMINATION at the core
  // of test_CanReadBigCookies — goodCookie (matches the format's cookie) reads
  // while badCookie (a usda body under the cookie extension) does not — cannot
  // be expressed: typescript-usd has no per-format cookie metadata and no CanRead.
  // Likewise target negotiation (FindByExtension(ext,{target}),
  // FindByExtensionAndTarget, the A/B targets) has no typescript-usd surface.
})
