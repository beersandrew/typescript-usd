// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfPath2Construct.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfPath2Construct.py (OpenUSD 26.11.1).
// goodPaths (:11-158, insertion order) and badPathStrings (:161-210) are
// copied verbatim. test_GoodPaths' repr round trip (exec of Sdf.Path's
// __repr__, :221-228) is Python-only and has no counterpart.
import { describe, expect, it } from 'vitest'
import { TfDiagnosticTrap } from 'typescript-usd/tf'
import { SdfPath } from '../../src/path.ts'

const P = (s: string): SdfPath => SdfPath.fromString(s)

// Sdf._PathElemsToPrefixes (pxr/usd/sdf/__init__.py:30-74).
function pathElemsToPrefixes(absolute: boolean, elements: readonly string[]): SdfPath[] {
  const prefixes: SdfPath[] = []
  let string = absolute ? '/' : ''
  let lastElemWasDotDot = false
  let didFirst = false
  for (const elem of elements) {
    if (elem === SdfPath.parentPathElement) {
      if (didFirst) string += '/'
      else didFirst = true
      string += elem
      prefixes.push(P(string))
      lastElemWasDotDot = true
    } else if (elem[0] === '.') {
      if (lastElemWasDotDot) string += '/'
      string += elem
      prefixes.push(P(string))
      lastElemWasDotDot = false
    } else if (elem[0] === '[') {
      string += elem
      prefixes.push(P(string))
      lastElemWasDotDot = false
    } else {
      if (didFirst) string += '/'
      else didFirst = true
      string += elem
      prefixes.push(P(string))
      lastElemWasDotDot = false
    }
  }
  return string ? prefixes : []
}

const goodPaths: [string, boolean, string[]][] = [
  [".", false, []],
  ["/", true, []],
  ["/Foo", true, ["Foo"]],
  ["/Foo/Bar", true, ["Foo", "Bar"]],
  ["Foo", false, ["Foo"]],
  ["Foo/Bar", false, ["Foo", "Bar"]],
  ["..", false, [".."]],
  ["../..", false, ["..", ".."]],
  ["../../..", false, ["..", "..", ".."]],
  ["../Foo", false, ["..", "Foo"]],
  ["../../Foo", false, ["..", "..", "Foo"]],
  ["../../../Foo", false, ["..", "..", "..", "Foo"]],
  ["../Foo/Foo", false, ["..", "Foo", "Foo"]],
  ["../../Foo/Foo", false, ["..", "..", "Foo", "Foo"]],
  ["../../../Foo/Foo", false, ["..", "..", "..", "Foo", "Foo"]],
  ["/Foo.prop", true, ["Foo", ".prop"]],
  ["/Foo/Bar.prop", true, ["Foo", "Bar", ".prop"]],
  [".prop", false, [".prop"]],
  ["Foo.prop", false, ["Foo", ".prop"]],
  ["Foo/Bar.prop", false, ["Foo", "Bar", ".prop"]],
  ["/Foo.prop:with:a:lot:of:namespaces", true, ["Foo", ".prop:with:a:lot:of:namespaces"]],
  ["/Foo/Bar.prop:with:a:lot:of:namespaces", true, ["Foo", "Bar", ".prop:with:a:lot:of:namespaces"]],
  [".prop:with:a:lot:of:namespaces", false, [".prop:with:a:lot:of:namespaces"]],
  ["Foo.prop:with:a:lot:of:namespaces", false, ["Foo", ".prop:with:a:lot:of:namespaces"]],
  ["Foo/Bar.prop:with:a:lot:of:namespaces", false, ["Foo", "Bar", ".prop:with:a:lot:of:namespaces"]],
  ["/Foo.prop[/Target]", true, ["Foo", ".prop", "[/Target]"]],
  ["/Foo/Bar.prop[/Target]", true, ["Foo", "Bar", ".prop", "[/Target]"]],
  [".prop[/Target]", false, [".prop", "[/Target]"]],
  ["Foo.prop[/Target]", false, ["Foo", ".prop", "[/Target]"]],
  ["Foo/Bar.prop[/Target]", false, ["Foo", "Bar", ".prop", "[/Target]"]],
  ["/Foo.prop:baz[/Target]", true, ["Foo", ".prop:baz", "[/Target]"]],
  ["/Foo/Bar.prop:baz[/Target]", true, ["Foo", "Bar", ".prop:baz", "[/Target]"]],
  [".prop:baz[/Target]", false, [".prop:baz", "[/Target]"]],
  ["Foo.prop:baz[/Target]", false, ["Foo", ".prop:baz", "[/Target]"]],
  ["Foo/Bar.prop:baz[/Target]", false, ["Foo", "Bar", ".prop:baz", "[/Target]"]],
  ["/Foo.attr.mapper[/ConnTarget]", true, ["Foo", ".attr", ".mapper[/ConnTarget]"]],
  ["/Foo/Bar.attr.mapper[/ConnTarget]", true, ["Foo", "Bar", ".attr", ".mapper[/ConnTarget]"]],
  [".attr.mapper[/ConnTarget]", false, [".attr", ".mapper[/ConnTarget]"]],
  ["Foo.attr.mapper[/ConnTarget]", false, ["Foo", ".attr", ".mapper[/ConnTarget]"]],
  ["Foo/Bar.attr.mapper[/ConnTarget]", false, ["Foo", "Bar", ".attr", ".mapper[/ConnTarget]"]],
  ["/Foo.attr.mapper[/ConnTarget].arg", true, ["Foo", ".attr", ".mapper[/ConnTarget]", ".arg"]],
  ["/Foo/Bar.attr.mapper[/ConnTarget].arg", true, ["Foo", "Bar", ".attr", ".mapper[/ConnTarget]", ".arg"]],
  [".attr.mapper[/ConnTarget].arg", false, [".attr", ".mapper[/ConnTarget]", ".arg"]],
  ["Foo.attr.mapper[/ConnTarget].arg", false, ["Foo", ".attr", ".mapper[/ConnTarget]", ".arg"]],
  ["Foo/Bar.attr.mapper[/ConnTarget].arg", false, ["Foo", "Bar", ".attr", ".mapper[/ConnTarget]", ".arg"]],
  ["/Foo.attr:baz.mapper[/ConnTarget].arg", true, ["Foo", ".attr:baz", ".mapper[/ConnTarget]", ".arg"]],
  ["/Foo/Bar.attr:baz.mapper[/ConnTarget].arg", true, ["Foo", "Bar", ".attr:baz", ".mapper[/ConnTarget]", ".arg"]],
  [".attr:baz.mapper[/ConnTarget].arg", false, [".attr:baz", ".mapper[/ConnTarget]", ".arg"]],
  ["Foo.attr:baz.mapper[/ConnTarget].arg", false, ["Foo", ".attr:baz", ".mapper[/ConnTarget]", ".arg"]],
  ["Foo/Bar.attr:baz.mapper[/ConnTarget].arg", false, ["Foo", "Bar", ".attr:baz", ".mapper[/ConnTarget]", ".arg"]],
  ["/Foo.attr.expression", true, ["Foo", ".attr", ".expression"]],
  ["/Foo/Bar.attr.expression", true, ["Foo", "Bar", ".attr", ".expression"]],
  [".attr.expression", false, [".attr", ".expression"]],
  ["Foo.attr.expression", false, ["Foo", ".attr", ".expression"]],
  ["Foo/Bar.attr.expression", false, ["Foo", "Bar", ".attr", ".expression"]],
  ["/Foo.attr:baz.expression", true, ["Foo", ".attr:baz", ".expression"]],
  ["/Foo/Bar.attr:baz.expression", true, ["Foo", "Bar", ".attr:baz", ".expression"]],
  [".attr:baz.expression", false, [".attr:baz", ".expression"]],
  ["Foo.attr:baz.expression", false, ["Foo", ".attr:baz", ".expression"]],
  ["Foo/Bar.attr:baz.expression", false, ["Foo", "Bar", ".attr:baz", ".expression"]],
  ["/Foo.rel[/Target].attr", true, ["Foo", ".rel", "[/Target]", ".attr"]],
  ["/Foo/Bar.rel[/Target].attr", true, ["Foo", "Bar", ".rel", "[/Target]", ".attr"]],
  [".rel[/Target].attr", false, [".rel", "[/Target]", ".attr"]],
  ["Foo.rel[/Target].attr", false, ["Foo", ".rel", "[/Target]", ".attr"]],
  ["Foo/Bar.rel[/Target].attr", false, ["Foo", "Bar", ".rel", "[/Target]", ".attr"]],
  ["/Foo.rel[/Target.rel2[/Target2.rel3[/Target3].attr3].attr2].attr", true, ["Foo", ".rel", "[/Target.rel2[/Target2.rel3[/Target3].attr3].attr2]", ".attr"]],
  ["/Foo/Bar.rel[/Target.rel2[/Target2.rel3[/Target3].attr3].attr2].attr", true, ["Foo", "Bar", ".rel", "[/Target.rel2[/Target2.rel3[/Target3].attr3].attr2]", ".attr"]],
  [".rel[/Target.rel2[/Target2.rel3[/Target3].attr3].attr2].attr", false, [".rel", "[/Target.rel2[/Target2.rel3[/Target3].attr3].attr2]", ".attr"]],
  ["Foo.rel[/Target.rel2[/Target2.rel3[/Target3].attr3].attr2].attr", false, ["Foo", ".rel", "[/Target.rel2[/Target2.rel3[/Target3].attr3].attr2]", ".attr"]],
  ["Foo/Bar.rel[/Target.rel2[/Target2.rel3[/Target3].attr3].attr2].attr", false, ["Foo", "Bar", ".rel", "[/Target.rel2[/Target2.rel3[/Target3].attr3].attr2]", ".attr"]],
  ["/Foo.rel:baz[/Target.rel2:baz[/Target2.rel3:baz[/Target3].attr3:baz].attr2:baz].attr:baz", true, ["Foo", ".rel:baz", "[/Target.rel2:baz[/Target2.rel3:baz[/Target3].attr3:baz].attr2:baz]", ".attr:baz"]],
  ["/Foo/Bar.rel:baz[/Target.rel2:baz[/Target2.rel3:baz[/Target3].attr3:baz].attr2:baz].attr:baz", true, ["Foo", "Bar", ".rel:baz", "[/Target.rel2:baz[/Target2.rel3:baz[/Target3].attr3:baz].attr2:baz]", ".attr:baz"]],
  [".rel:baz[/Target.rel2:baz[/Target2.rel3:baz[/Target3].attr3:baz].attr2:baz].attr:baz", false, [".rel:baz", "[/Target.rel2:baz[/Target2.rel3:baz[/Target3].attr3:baz].attr2:baz]", ".attr:baz"]],
  ["Foo.rel:baz[/Target.rel2:baz[/Target2.rel3:baz[/Target3].attr3:baz].attr2:baz].attr:baz", false, ["Foo", ".rel:baz", "[/Target.rel2:baz[/Target2.rel3:baz[/Target3].attr3:baz].attr2:baz]", ".attr:baz"]],
  ["Foo/Bar.rel:baz[/Target.rel2:baz[/Target2.rel3:baz[/Target3].attr3:baz].attr2:baz].attr:baz", false, ["Foo", "Bar", ".rel:baz", "[/Target.rel2:baz[/Target2.rel3:baz[/Target3].attr3:baz].attr2:baz]", ".attr:baz"]],
  ["/Foo.rel[/Target].attr[/ConnTarget]", true, ["Foo", ".rel", "[/Target]", ".attr", "[/ConnTarget]"]],
  ["/Foo/Bar.rel[/Target].attr[/ConnTarget]", true, ["Foo", "Bar", ".rel", "[/Target]", ".attr", "[/ConnTarget]"]],
  [".rel[/Target].attr[/ConnTarget]", false, [".rel", "[/Target]", ".attr", "[/ConnTarget]"]],
  ["Foo.rel[/Target].attr[/ConnTarget]", false, ["Foo", ".rel", "[/Target]", ".attr", "[/ConnTarget]"]],
  ["Foo/Bar.rel[/Target].attr[/ConnTarget]", false, ["Foo", "Bar", ".rel", "[/Target]", ".attr", "[/ConnTarget]"]],
  ["/Foo.rel[/Target].attr:baz[/ConnTarget]", true, ["Foo", ".rel", "[/Target]", ".attr:baz", "[/ConnTarget]"]],
  ["/Foo/Bar.rel[/Target].attr:baz[/ConnTarget]", true, ["Foo", "Bar", ".rel", "[/Target]", ".attr:baz", "[/ConnTarget]"]],
  [".rel[/Target].attr:baz[/ConnTarget]", false, [".rel", "[/Target]", ".attr:baz", "[/ConnTarget]"]],
  ["Foo.rel[/Target].attr:baz[/ConnTarget]", false, ["Foo", ".rel", "[/Target]", ".attr:baz", "[/ConnTarget]"]],
  ["Foo/Bar.rel[/Target].attr:baz[/ConnTarget]", false, ["Foo", "Bar", ".rel", "[/Target]", ".attr:baz", "[/ConnTarget]"]],
  ["/Foo.rel[/Target].attr.mapper[/ConnTarget]", true, ["Foo", ".rel", "[/Target]", ".attr", ".mapper[/ConnTarget]"]],
  ["/Foo/Bar.rel[/Target].attr.mapper[/ConnTarget]", true, ["Foo", "Bar", ".rel", "[/Target]", ".attr", ".mapper[/ConnTarget]"]],
  [".rel[/Target].attr.mapper[/ConnTarget]", false, [".rel", "[/Target]", ".attr", ".mapper[/ConnTarget]"]],
  ["Foo.rel[/Target].attr.mapper[/ConnTarget]", false, ["Foo", ".rel", "[/Target]", ".attr", ".mapper[/ConnTarget]"]],
  ["Foo/Bar.rel[/Target].attr.mapper[/ConnTarget]", false, ["Foo", "Bar", ".rel", "[/Target]", ".attr", ".mapper[/ConnTarget]"]],
  ["/Foo.rel[/Target].attr:baz.mapper[/ConnTarget]", true, ["Foo", ".rel", "[/Target]", ".attr:baz", ".mapper[/ConnTarget]"]],
  ["/Foo/Bar.rel[/Target].attr:baz.mapper[/ConnTarget]", true, ["Foo", "Bar", ".rel", "[/Target]", ".attr:baz", ".mapper[/ConnTarget]"]],
  [".rel[/Target].attr:baz.mapper[/ConnTarget]", false, [".rel", "[/Target]", ".attr:baz", ".mapper[/ConnTarget]"]],
  ["Foo.rel[/Target].attr:baz.mapper[/ConnTarget]", false, ["Foo", ".rel", "[/Target]", ".attr:baz", ".mapper[/ConnTarget]"]],
  ["Foo/Bar.rel[/Target].attr:baz.mapper[/ConnTarget]", false, ["Foo", "Bar", ".rel", "[/Target]", ".attr:baz", ".mapper[/ConnTarget]"]],
  ["/Foo.rel[/Target].attr.mapper[/ConnTarget].arg", true, ["Foo", ".rel", "[/Target]", ".attr", ".mapper[/ConnTarget]", ".arg"]],
  ["/Foo/Bar.rel[/Target].attr.mapper[/ConnTarget].arg", true, ["Foo", "Bar", ".rel", "[/Target]", ".attr", ".mapper[/ConnTarget]", ".arg"]],
  [".rel[/Target].attr.mapper[/ConnTarget].arg", false, [".rel", "[/Target]", ".attr", ".mapper[/ConnTarget]", ".arg"]],
  ["Foo.rel[/Target].attr.mapper[/ConnTarget].arg", false, ["Foo", ".rel", "[/Target]", ".attr", ".mapper[/ConnTarget]", ".arg"]],
  ["Foo/Bar.rel[/Target].attr.mapper[/ConnTarget].arg", false, ["Foo", "Bar", ".rel", "[/Target]", ".attr", ".mapper[/ConnTarget]", ".arg"]],
  ["/Foo.rel[/Target].attr:baz.mapper[/ConnTarget].arg", true, ["Foo", ".rel", "[/Target]", ".attr:baz", ".mapper[/ConnTarget]", ".arg"]],
  ["/Foo/Bar.rel[/Target].attr:baz.mapper[/ConnTarget].arg", true, ["Foo", "Bar", ".rel", "[/Target]", ".attr:baz", ".mapper[/ConnTarget]", ".arg"]],
  [".rel[/Target].attr:baz.mapper[/ConnTarget].arg", false, [".rel", "[/Target]", ".attr:baz", ".mapper[/ConnTarget]", ".arg"]],
  ["Foo.rel[/Target].attr:baz.mapper[/ConnTarget].arg", false, ["Foo", ".rel", "[/Target]", ".attr:baz", ".mapper[/ConnTarget]", ".arg"]],
  ["Foo/Bar.rel[/Target].attr:baz.mapper[/ConnTarget].arg", false, ["Foo", "Bar", ".rel", "[/Target]", ".attr:baz", ".mapper[/ConnTarget]", ".arg"]],
  ["/Foo.rel[/Target].attr.expression", true, ["Foo", ".rel", "[/Target]", ".attr", ".expression"]],
  ["/Foo/Bar.rel[/Target].attr.expression", true, ["Foo", "Bar", ".rel", "[/Target]", ".attr", ".expression"]],
  [".rel[/Target].attr.expression", false, [".rel", "[/Target]", ".attr", ".expression"]],
  ["Foo.rel[/Target].attr.expression", false, ["Foo", ".rel", "[/Target]", ".attr", ".expression"]],
  ["Foo/Bar.rel[/Target].attr.expression", false, ["Foo", "Bar", ".rel", "[/Target]", ".attr", ".expression"]],
  ["/Foo.rel[/Target].attr:baz.expression", true, ["Foo", ".rel", "[/Target]", ".attr:baz", ".expression"]],
  ["/Foo/Bar.rel[/Target].attr:baz.expression", true, ["Foo", "Bar", ".rel", "[/Target]", ".attr:baz", ".expression"]],
  [".rel[/Target].attr:baz.expression", false, [".rel", "[/Target]", ".attr:baz", ".expression"]],
  ["Foo.rel[/Target].attr:baz.expression", false, ["Foo", ".rel", "[/Target]", ".attr:baz", ".expression"]],
  ["Foo/Bar.rel[/Target].attr:baz.expression", false, ["Foo", "Bar", ".rel", "[/Target]", ".attr:baz", ".expression"]],
]

const badPathStrings = [
  "",
  "Foo<Bar",
  "Foo>Bar",
  "Foo[Bar",
  "Foo]Bar",
  "Foo\\Bar",
  "Foo:Bar",
  "./Foo",
  "/.prop",
  "/.attr[1]",
  "/.rel[/Foo].attr",
  "/..",
  "/../..",
  "Foo/..",
  "/Foo/..",
  "[1]",
  "[/Target]",
  "/[1]",
  "/<>",
  "//<>",
  "/Foo[1]",
  "/Foo[/Target]",
  "/Foo.prop/Bar",
  "/Foo.prop.baz",
  "/Foo.rel[/.Target].attr",
]

describe('testSdfPath2Construct', () => {
  it('test_GoodPaths', () => {
    for (const [str, absolute, elems] of goodPaths) {
      const path = P(str)
      expect(path.isAbsolutePath(), `Failed on path string ${str}`).toBe(absolute)
      const prefixes = pathElemsToPrefixes(absolute, elems)
      expect(path.getPrefixes().map(p => p.pathString), str)
        .toEqual(prefixes.map(p => p.pathString))
      expect(path.pathString).toBe(str)
    }
  })

  it('test_BadPaths', () => {
    const trap = new TfDiagnosticTrap()
    try {
      for (const str of badPathStrings) {
        expect(P(str).equals(SdfPath.emptyPath), `Failed on path str ${str}`).toBe(true)
      }
    } finally {
      trap.clear()
    }
  })
})
