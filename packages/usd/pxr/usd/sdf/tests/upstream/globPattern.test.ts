// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfGlobPattern.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfGlobPattern.cpp (OpenUSD 26.11.1).
// Every TEST(pattern, string, expected) case is listed with its upstream line
// number; the cases built in code (:183-242) are built the same way below.
// The C string literals' UTF-8 byte escapes are written as the code points
// they encode. _Test (:20-44): a pattern that fails to compile counts as
// "no match" (a failure only if a match was expected).
import { describe, expect, it } from 'vitest'
import { Sdf_GlobPattern } from '../../src/globPattern.ts'

function test(pattern: string, str: string, expected: boolean, line: number) {
  const pat = Sdf_GlobPattern.compile(pattern)
  if (!pat.isValid()) {
    expect(expected, `[:${line}] pattern '${pattern}' failed to compile`).toBe(false)
    return
  }
  expect(pat.match(str), `[:${line}] Match('${pattern}', '${str}')`).toBe(expected)
}

const cases: [number, string, string, boolean][] = [
  [48, "*", "", true],
  [49, "*", "anything", true],
  [50, "*", "Foo", true],
  [51, "", "", true],
  [52, "", "x", false],
  [55, "Foo*", "Foo", true],
  [56, "Foo*", "FooBar", true],
  [57, "Foo*", "Fo", false],
  [58, "Foo*", "xFoo", false],
  [59, "Foo*", "", false],
  [62, "*Foo", "Foo", true],
  [63, "*Foo", "BarFoo", true],
  [64, "*Foo", "FooBar", false],
  [65, "*Foo", "", false],
  [66, "*Foo", "Fo", false],
  [69, "Foo*Bar", "FooBar", true],
  [70, "Foo*Bar", "FooXBar", true],
  [71, "Foo*Bar", "FooXYZBar", true],
  [72, "Foo*Bar", "Foo", false],
  [73, "Foo*Bar", "Bar", false],
  [74, "Foo*Bar", "FooXBa", false],
  [77, "*Foo*", "Foo", true],
  [78, "*Foo*", "xFooy", true],
  [79, "*Foo*", "xBarx", false],
  [80, "*Foo*Bar*", "FooBar", true],
  [81, "*Foo*Bar*", "xFooyBarz", true],
  [82, "*Foo*Bar*", "xBaryFooz", false],
  [83, "*X*Y*Z*", "aXbYcZd", true],
  [84, "*X*Y*Z*", "aXbZcYd", false],
  [87, "Foo", "Foo", true],
  [88, "Foo", "FooBar", false],
  [89, "Foo", "Fo", false],
  [90, "Foo", "", false],
  [91, "abc", "abc", true],
  [92, "abc", "ab", false],
  [93, "abc", "abcd", false],
  [96, "?", "x", true],
  [97, "?", "ab", false],
  [98, "?", "", false],
  [99, "F?o", "Foo", true],
  [100, "F?o", "Fao", true],
  [101, "F?o", "Fo", false],
  [102, "F?o", "Food", false],
  [103, "???", "abc", true],
  [104, "???", "ab", false],
  [105, "???", "abcd", false],
  [106, "?oo*", "Foo", true],
  [107, "?oo*", "FooBar", true],
  [108, "?oo*", "oo", false],
  [109, "*?oo", "Foo", true],
  [110, "*?oo", "xFoo", true],
  [111, "*?oo", "oo", false],
  [114, "[Ff]oo", "Foo", true],
  [115, "[Ff]oo", "foo", true],
  [116, "[Ff]oo", "goo", false],
  [117, "[Ff]oo*", "FooBar", true],
  [118, "[Ff]oo*", "fooBar", true],
  [119, "[Ff]oo*", "gooBar", false],
  [120, "[a-z]", "a", true],
  [121, "[a-z]", "m", true],
  [122, "[a-z]", "z", true],
  [123, "[a-z]", "A", false],
  [124, "[a-z]", "0", false],
  [125, "[a-zA-Z0-9_]", "x", true],
  [126, "[a-zA-Z0-9_]", "X", true],
  [127, "[a-zA-Z0-9_]", "5", true],
  [128, "[a-zA-Z0-9_]", "_", true],
  [129, "[a-zA-Z0-9_]", " ", false],
  [132, "[!a-z]", "A", true],
  [133, "[!a-z]", "0", true],
  [134, "[!a-z]", "a", false],
  [135, "[^A-Z]x", "ax", true],
  [136, "[^A-Z]x", "Ax", false],
  [139, "[]]", "]", true],
  [140, "[]]", "x", false],
  [141, "[-abc]", "-", true],
  [142, "[-abc]", "a", true],
  [143, "[abc-]", "-", true],
  [144, "[abc-]", "c", true],
  [145, "[abc-]", "d", false],
  [148, "\\*", "*", true],
  [149, "\\*", "x", false],
  [150, "\\?", "?", true],
  [151, "\\?", "x", false],
  [152, "\\[", "[", true],
  [153, "\\[", "x", false],
  [154, "\\\\", "\\", true],
  [155, "Foo\\*Bar", "Foo*Bar", true],
  [156, "Foo\\*Bar", "FooXBar", false],
  [160, "?", "\u00e9", true],
  [161, "??", "\u00e9x", true],
  [162, "??", "\u00e9", false],
  [164, "?", "\u2603", true],
  [165, "*?", "\u2603", true],
  [166, "?*", "\u2603", true],
  [168, "?", "\ud83d\ude00", true],
  [169, "??", "\ud83d\ude00\ud83d\ude00", true],
  [173, "[\u00e0-\u00ff]", "\u00e9", true],
  [174, "[\u00e0-\u00ff]", "a", false],
  [177, "**", "anything", true],
  [178, "Foo**Bar", "FooBar", true],
  [179, "Foo**Bar", "FooXBar", true],
  [206, "\\", "", false],
  [207, "\\", "x", false],
  [208, "[abc", "abc", false],
  [209, "[", "x", false],
  [210, "a[b", "ab", false],
  [245, "*a*b*c*d*e*f*g*", "1a2b3c4d5e6f7g8", true],
  [246, "*a*b*c*d*e*f*g*", "abcdefg", true],
  [247, "*a*b*c*d*e*f*g*", "1a2b3c4d5e6f7", false],
  [248, "*a*b*c*d*e*f*g*", "abcedfg", false],
  [252, "*?", "a\ud83d\ude00", true],
  [253, "?*", "\ud83d\ude00", true],
  [255, "\u00e9*", "\u00e9 anything", true],
  [256, "\u00e9*", "x\u00e9", false],
  [257, "*\u00e9", "anything \u00e9", true],
  [258, "*\u00e9", "\u00e9x", false],
  [261, "*\u2603*", "abc\u2603def", true],
  [262, "*\u2603*", "abcdef", false],
  [265, "a", "", false],
  [266, "?", "", false],
  [267, "[a]", "", false],
  [268, "*?*", "", false],
  [269, "**", "", true],
  [272, "***", "anything", true],
  [273, "****", "", true],
  [278, "*Foo*", "xFooy", true],
  [279, "*Foo*", "Foo", true],
  [280, "*Foo*", "xx", false],
  [281, "*?Foo*", "xFooy", true],
  [282, "*?Foo*", "Foo", false],
  [283, "*[A-Z]oo*", "xMoox", true],
  [284, "*[A-Z]oo*", "xmoox", false],
  [285, "*Foo?*", "xFood", true],
  [286, "*Foo?*", "xFoo", false],
]

describe('testSdfGlobPattern', () => {
  it('literal TEST cases', () => {
    for (const [line, pattern, str, expected] of cases) test(pattern, str, expected, line)
  })

  // Long literal runs (:181-202): literal-run elements cap at 251 bytes per
  // op upstream, so these exercise its chunk-splitting path.
  it('long literal runs', () => {
    const a = (n: number) => 'a'.repeat(n)
    test(a(250), a(250), true, 185)
    test(a(251), a(251), true, 187)
    test(a(252), a(252), true, 189)
    test(a(500), a(500), true, 191)
    const longPlusX = a(252) + 'X'
    test(longPlusX, longPlusX, true, 194)
    test(longPlusX, a(252), false, 196)
    const starThenLong = '*' + 'b'.repeat(300)
    test(starThenLong, 'xy' + 'b'.repeat(300), true, 199)
    test(starThenLong, 'xy' + 'b'.repeat(299), false, 201)
  })

  // Many ?'s (:213-231).
  it("many ?'s", () => {
    const manyQ = '?'.repeat(50)
    test(manyQ, 'x'.repeat(50), true, 216)
    test(manyQ, 'x'.repeat(49), false, 218)
    test(manyQ, 'x'.repeat(51), false, 220)
    const mid = '*' + '?'.repeat(20) + 'X*'
    test(mid, 'ab' + 'y'.repeat(20) + 'Xcd', true, 225)
    test(mid, 'X', false, 227)
    test(mid, 'y'.repeat(19), false, 228)
    test(mid, 'y'.repeat(19) + 'X', false, 229)
    test(mid, 'y'.repeat(20) + 'X', true, 230)
  })

  // Class with many ranges (:233-242).
  it('class with many ranges', () => {
    let cls = '['
    for (let c = 'a'.charCodeAt(0); c !== 'z'.charCodeAt(0); ++c) {
      const ch = String.fromCharCode(c)
      cls += ch + '-' + ch
    }
    cls += ']*'
    test(cls, 'abc', true, 240)
    test(cls, 'Abc', false, 241)
  })
})
