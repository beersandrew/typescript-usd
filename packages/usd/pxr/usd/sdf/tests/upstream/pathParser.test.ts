// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfPathParser.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfPathParser.cpp (OpenUSD 26.11.1).
// The good and bad path strings are copied verbatim from :52-150 and
// :152-209 (the two tab cases are written as \t). testPaths
// (:18-46): a good path parses to a non-empty path whose GetAsString (pathString) equals
// the input with spaces removed; a bad path parses to the empty path (posting
// errors, trapped here). Sdf_PathGetDebuggerPathText, a debugger helper, has
// no counterpart; GetAsString is checked once.
import { describe, expect, it } from 'vitest'
import { TfDiagnosticTrap } from 'typescript-usd/tf'
import { SdfPath } from '../../src/path.ts'

const good = [
  ".",
  "/",
  "Foo",
  "/Foo",
  ".bar",
  "/Foo/Bar.baz",
  "/Foo/Bar.baz:argle:bargle",
  "/_Foo/_Bar._baz",
  "/_Foo/_Bar._baz:_argle:_bargle",
  "Foo/Bar",
  "Foo.bar",
  "Foo.bar:baz",
  "Foo/Bar.bar",
  "Foo/Bar.bar:baz",
  "/Some/Kinda/Long/Path/Just/To/Make/Sure",
  "Some/Kinda/Long/Path/Just/To/Make/Sure.property",
  "Some/Kinda/Long/Path/Just/To/Make/Sure.property:bar:baz",
  "../Some/Kinda/Long/Path/Just/To/Make/Sure",
  "../../Some/Kinda/Long/Path/Just/To/Make/Sure.property",
  "../../Some/Kinda/Long/Path/Just/To/Make/Sure.property:bar:baz",
  "/Foo/Bar.baz[targ].boom",
  "/Foo/Bar.baz:argle[targ].boom:bargle",
  "Foo.bar[targ].boom",
  "Foo.bar:argle[targ].boom:bargle",
  ".bar[targ].boom",
  ".bar:argle[targ].boom:bargle",
  "Foo.bar[targ.attr].boom",
  "Foo.bar:argle[targ.attr:baz].boom:bargle",
  "/a.rel[/b.rel[/c.rel[/d.rel[/e.a1].a2].a3].a4]",
  "/a.rel[/b.rel[/c.rel[/d.a1].a2].a3]",
  "/a.rel[/b.rel[/c.a2].a3]",
  "/a.rel[/b.rel[/c.rel[/d.rel[/e.a1].a2].a3].a4].a0",
  "/a.rel[/b.rel[/c.rel[/d.a1].a2].a3].a0",
  "/a.rel[/b.rel[/c.a2].a3].a0",
  "../../.radius",
  "../../.radius:bar:baz",
  "../..",
  "foo{a=x}",
  "/foo{a=x}",
  "../foo{a=x}",
  "foo{a=x}.prop",
  "foo{a=x}.prop:bar:baz",
  "foo{a=1}",
  "foo{ a = x }",
  "foo{a=x}{b=y}",
  "foo {a=x} {b=y} ",
  "foo { a = x} { b = y } ",
  "foo{a=x}{b=y}.prop",
  "foo{a=x}{b=y}.prop:bar:baz",
  "foo{ a = x }{b=y}",
  "foo{a=x}{ b = y }",
  "foo{ a = x }{ b = y }",
  "foo{a=x}{b=y}{c=z}",
  "foo{a=x}{b=y}{c=z}.prop",
  "foo{a=x}{b=y}{c=z}.prop:bar:baz",
  "foo{a=x}bar",
  "/foo{a=x}bar",
  "../foo{a=x}bar",
  "foo{a=x}bar.prop",
  "foo{a=x}bar.prop:bar:baz",
  "foo{a=x}bar{b=y}",
  "foo{a=x}bar{b=y}.prop",
  "foo{a=x}bar{b=y}.prop:bar:baz",
  "foo{a=x}{b=y}bar{c=z}{d=w}",
  "foo{a=x}bar{b=y}blah{c=z}",
  "foo{a=x}bar{b=y}blah{c=z}.prop",
  "foo{a=x}bar{b=y}blah{c=z}.prop:bar:baz",
  "foo{a=x}bar/blah",
  "foo{a=x}bar/blah.prop",
  "foo{a=x}bar/blah.prop:bar:baz",
  "foo{a=x}bar/blah{c=z}",
  "foo{a=x}bar/blah{c=z}.prop",
  "foo{a=x}bar/blah{c=z}.prop:bar:baz",
  "foo{a=x}bar/blah/baz{c=z}",
  "foo{a=x}bar/blah{c=z}baz/Burma/Shave",
  "foo{a=x}bar/blah{c=z}baz/Burma.Shave",
  "foo{a=x}bar/blah{c=z}baz/Burma.Shave:argle:bargle",
  "foo{a=.x}",
  "foo{a=1}",
  "foo{a=|}",
  "foo{a=-}",
  "foo{a=_}",
  "foo{a=.1}",
  "foo{a=.|}",
  "foo{a=.-}",
  "foo{a=._}",
  "foo{a=|-_|-_}",
  "foo{a=.|-_|-_}",
  "foo.expression",
  "foo.expression.expression",
  "foo.expression.mapper[/A.b]",
  "foo.mapper",
  "foo.mapper.expression",
  "foo.mapper.mapper[/A.b]",
  "/root_utf8_umlaute_\u00df_3",
]

const bad = [
  "DD/DDD.&ddf$",
  "DD[]/DDD",
  "DD[]/DDD.bar",
  "foo.prop/bar",
  "/foo.prop/bar.blah",
  "/foo.prop/bar.blah",
  "/foo//bar",
  "/foo/.bar",
  "/foo..bar",
  "/foo.bar.baz",
  "/.foo",
  "/Foo.:bar",
  "/Foo.bar:",
  "/Foo.:bar:",
  "/Foo.:bar:baz",
  "/Foo.bar:baz:",
  "/Foo.:bar:baz:",
  "/Foo.bar::baz",
  "/Foo.bar:0",
  "</foo.bar",
  "</Foo/Bar/>",
  "/Foo:Bar",
  "/Foo/Bar/",
  "/Foo.bar[targ]/Bar",
  "/Foo.bar[targ].foo.foo",
  "/Foo.bar[targ].foo[targ].foo",
  "../../",
  ".rel[targ][targ].attr",
  ".attr[1, 2, 3].attr",
  "/TestScene/sphere0.fakepoints[&1 &2 &3]",
  "/  Foo",
  "/\tFoo",
  "  Foo",
  "\tFoo",
  "/foo.b ar",
  "/foo. bar",
  "Foo.bar[targ].attr[//..]",
  "foo{}",
  "foo{,}",
  "foo{a=x,}",
  "foo{a=x}{}",
  "foo{1=x}",
  "foo{,a=x}",
  "foo{}{a=x}",
  "foo{,a=x,}",
  "foo{}{a=x}{}",
  "foo{a=x}/bar",
  "foo{a=x}.prop/bar",
  "foo{a=x}.prop{b=y}",
  "foo{a=x.}",
  "foo{a=.x.}",
  "foo{a=:}",
  "foo{a=x:}",
  "Foo.attr.mapper[/Bar].arg:baz",
  "/foo\ud83d\ude00",
  "/foo/bar/_\u2202baz",
]

function parse(text: string): SdfPath {
  const trap = new TfDiagnosticTrap()
  try {
    return SdfPath.fromString(text)
  } finally {
    trap.clear()
  }
}

describe('testSdfPathParser', () => {
  it('parses the good paths', () => {
    for (const text of good) {
      const resultPath = parse(text)
      expect(resultPath.isEmpty(), `Expected <${text}> to parse`).toBe(false)
      expect(resultPath.pathString, `mismatch: ${text}`).toBe(text.replaceAll(' ', ''))
    }
  })

  it('rejects the bad paths', () => {
    for (const text of bad) {
      expect(parse(text).isEmpty(), `Expected <${text}> not to parse`).toBe(true)
    }
  })
})
