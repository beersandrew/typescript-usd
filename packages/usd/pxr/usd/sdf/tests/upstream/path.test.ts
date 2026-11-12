// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfPath.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/sdf/testenv/testSdfPath.py.
//
// Python-only checks (repr round-trips, str/path equality, __hash__,
// Sdf._PathGetDebuggerPathText, Sdf._DumpPathStats) have no counterpart here;
// path hashing is covered by keying a Map on pathString. Tf.ErrorException
// (a TF_CODING_ERROR raised into Python) is checked as a posted error.

import { describe, expect, it } from 'vitest'
import { TfDiagnosticTrap } from 'typescript-usd/tf'
import {
  SdfPath, sdfPathFindLongestPrefix, sdfPathFindLongestStrictPrefix, sdfPathFindPrefixedRange,
} from '../../src/path.ts'

const P = (s: string): SdfPath => SdfPath.fromString(s)
const empty = SdfPath.emptyPath

// Runs `fn` with diagnostics trapped; reports what it posted.
function trapped<T>(fn: () => T): { result: T; errors: number; warnings: number } {
  const trap = new TfDiagnosticTrap()
  try {
    const result = fn()
    return { result, errors: trap.getErrors().length, warnings: trap.getWarnings().length }
  } finally {
    trap.clear()
    trap.dismiss()
  }
}

// Sdf._PathElemsToPrefixes (pxr/usd/sdf/__init__.py:30-74).
function pathElemsToPrefixes(absolute: boolean, elements: readonly string[], numPrefixes = 0): SdfPath[] {
  const prefixes: SdfPath[] = []
  let string = absolute ? '/' : ''
  let lastElemWasDotDot = false
  let didFirst = false
  for (const elem of elements) {
    if (elem === '..') {
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
  if (!string) return []
  return numPrefixes === 0 ? prefixes : prefixes.slice(-numPrefixes)
}

const strs = (paths: Iterable<SdfPath>): string[] => [...paths].map(p => p.pathString)

describe('testSdfPath', () => {
  it('test_Basic: bad paths', () => {
    const badPaths = `
      DD/DDD.&ddf$
      DD[]/DDD
      DD[]/DDD.bar
      foo.prop/bar
      /foo.prop/bar.blah
      /foo.prop/bar.blah
      /foo//bar
      /foo/.bar
      /foo..bar
      /foo.bar.baz
      /.foo
      </foo.bar
      </Foo/Bar/>
      /Foo/Bar/
      /Foo.bar[targ]/Bar
      /Foo.bar[targ].foo.foo
      123
      123test
      /Foo:Bar
      /Foo.bar.mapper[/Targ.attr].arg:name:space
      `.split(/\s+/).filter(s => s !== '')
    for (const badPath of badPaths) {
      const { result, warnings } = trapped(() => P(badPath))
      expect(result.isEmpty(), badPath).toBe(true)
      expect(result.equals(empty)).toBe(true)
      expect(warnings, badPath).toBe(1)
      expect(SdfPath.isValidPathString(badPath), badPath).toBe(false)
    }
  })

  it('test_Basic: ordering', () => {
    expect(SdfPath.compare(P('aaa'), P('aab'))).toBeLessThan(0)
    expect(SdfPath.compare(P('aaa'), empty) < 0).toBe(false)
    expect(SdfPath.compare(P('/'), P('/a'))).toBeLessThan(0)
    expect(SdfPath.compare(P('aab'), P('aaa'))).toBeGreaterThan(0)
    expect(SdfPath.compare(P('/a'), empty)).toBeGreaterThan(0)
    expect(SdfPath.compare(P('aaa'), P('aab'))).toBeLessThanOrEqual(0)
    expect(SdfPath.compare(P('aaa'), P('aaa'))).toBeLessThanOrEqual(0)
    expect(SdfPath.compare(empty, P('/a'))).toBeLessThanOrEqual(0)
    expect(SdfPath.compare(P('aab'), P('aaa'))).toBeGreaterThanOrEqual(0)
    expect(SdfPath.compare(P('aaa'), P('aaa'))).toBeGreaterThanOrEqual(0)
    expect(SdfPath.compare(P('/a'), empty)).toBeGreaterThanOrEqual(0)
  })

  it('test_Basic: scenepath queries', () => {
    const testPathStrings = [
      '/Foo/Bar.baz',
      'Foo',
      'Foo/Bar',
      'Foo.bar',
      'Foo/Bar.bar',
      '.bar',
      '/Some/Kinda/Long/Path/Just/To/Make/Sure',
      'Some/Kinda/Long/Path/Just/To/Make/Sure.property',
      '../Some/Kinda/Long/Path/Just/To/Make/Sure',
      '../../Some/Kinda/Long/Path/Just/To/Make/Sure.property',
      '/Foo/Bar.baz[targ].boom',
      'Foo.bar[targ].boom',
      '.bar[targ].boom',
      'Foo.bar[targ.attr].boom',
      '/A/B/C.rel3[/Blah].attr3',
      'A/B.rel2[/A/B/C.rel3[/Blah].attr3].attr2',
      '/A.rel1[/A/B.rel2[/A/B/C.rel3[/Blah].attr3].attr2].attr1',
      '/root_utf8_umlaute_ß_3',
      'Süßigkeiten.bar',
      '/ß34/情報/información',
      '情報._جيد',
    ]
    const testAbsolute = [true, false, false, false, false, false, true, false, false, false, true, false, false, false, true, false, true, true, false, true, false]
    const testProperty = [true, false, false, true, true, true, false, true, false, true, true, true, true, true, true, true, true, false, true, false, true]
    const testElements = [
      ['Foo', 'Bar', '.baz'],
      ['Foo'],
      ['Foo', 'Bar'],
      ['Foo', '.bar'],
      ['Foo', 'Bar', '.bar'],
      ['.bar'],
      ['Some', 'Kinda', 'Long', 'Path', 'Just', 'To', 'Make', 'Sure'],
      ['Some', 'Kinda', 'Long', 'Path', 'Just', 'To', 'Make', 'Sure', '.property'],
      ['..', 'Some', 'Kinda', 'Long', 'Path', 'Just', 'To', 'Make', 'Sure'],
      ['..', '..', 'Some', 'Kinda', 'Long', 'Path', 'Just', 'To', 'Make', 'Sure', '.property'],
      ['Foo', 'Bar', '.baz', '[targ]', '.boom'],
      ['Foo', '.bar', '[targ]', '.boom'],
      ['.bar', '[targ]', '.boom'],
      ['Foo', '.bar', '[targ.attr]', '.boom'],
      ['A', 'B', 'C', '.rel3', '[/Blah]', '.attr3'],
      ['A', 'B', '.rel2', '[/A/B/C.rel3[/Blah].attr3]', '.attr2'],
      ['A', '.rel1', '[/A/B.rel2[/A/B/C.rel3[/Blah].attr3].attr2]', '.attr1'],
      ['root_utf8_umlaute_ß_3'],
      ['Süßigkeiten', '.bar'],
      ['ß34', '情報', 'información'],
      ['情報', '._جيد'],
    ]
    const basicTest = (path: SdfPath, elements: string[], testIndex: number): void => {
      expect(path.isAbsolutePath()).toBe(testAbsolute[testIndex])
      expect(path.isPropertyPath()).toBe(testProperty[testIndex])
      expect(strs(path.getPrefixes())).toEqual(strs(pathElemsToPrefixes(path.isAbsolutePath(), elements)))
      for (let i = 0; i < path.pathElementCount; i++) {
        expect(strs(path.getPrefixes(i)))
          .toEqual(strs(pathElemsToPrefixes(path.isAbsolutePath(), elements, i)))
      }
      expect(P(path.pathString).equals(path)).toBe(true)
      expect(SdfPath.isValidPathString(path.pathString)).toBe(true)
    }
    const testPaths: SdfPath[] = []
    for (let testIndex = 0; testIndex < testPathStrings.length; testIndex++) {
      const string = testPathStrings[testIndex]!
      expect(P(string).pathString).toBe(string)
      testPaths.push(P(string))
      basicTest(testPaths[testPaths.length - 1]!, testElements[testIndex]!, testIndex)
      // If path is a property then try it with a namespaced name.
      if (testProperty[testIndex]) {
        testPaths.push(P(string + ':this:has:namespaces'))
        const elements = [...testElements[testIndex]!]
        elements[elements.length - 1] += ':this:has:namespaces'
        basicTest(testPaths[testPaths.length - 1]!, elements, testIndex)
      }
    }
    // SdfPath hashing.
    const dict = new Map<string, number>()
    testPaths.forEach((p, i) => dict.set(p.pathString, i))
    testPaths.forEach((p, i) => expect(dict.get(p.pathString)).toBe(i))
  })

  it('test_Basic: bool conversion', () => {
    expect(P('/foo.bar[baz]').isEmpty()).toBe(false)
    expect(P('/foo.bar').isEmpty()).toBe(false)
    expect(P('/').isEmpty()).toBe(false)
    expect(P('.').isEmpty()).toBe(false)
    expect(empty.isEmpty()).toBe(true)
    expect(trapped(() => P('')).result.isEmpty()).toBe(true)
  })

  it('test_Basic: relative to absolute', () => {
    const anchor = P('/A/B/E/F/G')
    let relPath = P('../../../C/D')
    expect(relPath.makeAbsolutePath(anchor).pathString).toBe('/A/B/C/D')
    // Try too many ".."s for the base path
    expect(relPath.makeAbsolutePath(P('/A')).isEmpty()).toBe(true)
    relPath = P('../../../..')
    expect(relPath.makeAbsolutePath(anchor).pathString).toBe('/A')
    relPath = P('../../.radius')
    expect(relPath.makeAbsolutePath(anchor).pathString).toBe('/A/B/E.radius')
    relPath = P('..')
    expect(trapped(() => relPath.makeAbsolutePath(P('../../A/B'))).result.isEmpty()).toBe(true)
    // test passing a property path as the anchor
    expect(trapped(() => relPath.makeAbsolutePath(P('/A/B.radius'))).result.isEmpty()).toBe(true)
    // test on an absolute path
    expect(anchor.makeAbsolutePath(anchor).equals(anchor)).toBe(true)
  })

  it('test_Basic: absolute to relative', () => {
    let anchor = P('/A/B/E/F/G')
    let absPath = P('/A/B/C/D')
    expect(absPath.makeRelativePath(anchor).pathString).toBe('../../../C/D')
    absPath = P('/H/I/J')
    expect(absPath.makeRelativePath(anchor).pathString).toBe('../../../../../H/I/J')
    absPath = P('/A/B/E/F/G/H/I/J.radius')
    expect(absPath.makeRelativePath(anchor).pathString).toBe('H/I/J.radius')
    anchor = P('/A/B')
    absPath = P('/A.radius')
    expect(absPath.makeRelativePath(anchor).pathString).toBe('../.radius')
    expect(trapped(() => absPath.makeRelativePath(P('H/I'))).result.pathString).toBe('')
    // test passing a property path as the anchor
    expect(trapped(() => absPath.makeRelativePath(P('/A/B.radius'))).result.pathString).toBe('')
  })

  it('test_Basic: sub-optimal relative paths to optimal relative paths', () => {
    const anchor = P('/A/B/C')
    expect(P('../../B/C/D').makeRelativePath(anchor).pathString).toBe('D')
    expect(P('../../../A').makeRelativePath(anchor).pathString).toBe('../..')
  })

  it('test_Basic: GetPrimPath', () => {
    const cases: [string, string][] = [
      ['/A/B/C', '/A/B/C'],
      ['/A/B/C{set=sel}', '/A/B/C'],
      ['/A/B{set=sel}C', '/A/B{set=sel}C'],
      ['/A/B/C.foo', '/A/B/C'],
      ['/A/B/C.foo:bar:baz', '/A/B/C'],
      ['/A/B/C.foo[target].bar', '/A/B/C'],
      ['/A/B/C.foo[target].bar:baz', '/A/B/C'],
      ['A/B/C.foo[target].bar', 'A/B/C'],
      ['A/B/C.foo[target].bar:baz', 'A/B/C'],
      ['../C.foo', '../C'],
      ['../C.foo:bar:baz', '../C'],
      ['../.foo[target].bar', '..'],
      ['../.foo[target].bar:baz', '..'],
    ]
    for (const [path, expected] of cases) {
      expect(P(path).getPrimPath().equals(P(expected)), path).toBe(true)
    }
  })

  it('test_Basic: GetPrimOrPrimVariantSelectionPath', () => {
    const cases: [string, string][] = [
      ['/A/B/C{set=sel}', '/A/B/C{set=sel}'],
      ['/A/B/C{set=sel}.foo', '/A/B/C{set=sel}'],
      ['/A/B/C{set=sel}.foo:bar:baz', '/A/B/C{set=sel}'],
      ['/A/B/C{set=sel}.foo[target].bar', '/A/B/C{set=sel}'],
      ['/A/B/C{set=sel}.foo[target].bar:baz', '/A/B/C{set=sel}'],
      ['A/B/C{set=sel}.foo[target].bar', 'A/B/C{set=sel}'],
      ['A/B/C{set=sel}.foo[target].bar:baz', 'A/B/C{set=sel}'],
      ['../C{set=sel}.foo', '../C{set=sel}'],
      ['../C{set=sel}.foo:bar:baz', '../C{set=sel}'],
    ]
    for (const [path, expected] of cases) {
      expect(P(path).getPrimOrPrimVariantSelectionPath().equals(P(expected)), path).toBe(true)
    }
  })

  it('test_Basic: HasPrefix and ReplacePrefix', () => {
    expect(empty.hasPrefix(P('A'))).toBe(false)
    expect(P('A').hasPrefix(empty)).toBe(false)
    const aPath = P('/Chars/Buzz_1/LArm.FB')
    expect(aPath.hasPrefix(P('/Chars/Buzz_1'))).toBe(true)
    expect(aPath.hasPrefix(P('Buzz_1'))).toBe(false)
    // Replace aPath's prefix and get a new path
    const bPath = aPath.replacePrefix(P('/Chars/Buzz_1'), P('/Chars/Buzz_2'))
    expect(bPath.pathString).toBe('/Chars/Buzz_2/LArm.FB')
    // Specify a bogus prefix to replace and get an empty path
    const cPath = bPath.replacePrefix(P('/BadPrefix/Buzz_2'), P('/ReleasedChars/Buzz_2'))
    expect(cPath.equals(bPath)).toBe(true)
    // This formerly crashed due to a reference counting bug.
    let p = P('/A/B.a[/C/D.a[/E/F.a]].a')
    for (let i = 0; i < 4; i++) p.replacePrefix(P('/E/F'), P('/X'))
    // This formerly failed to replace due to an early out if the element
    // count was not longer than the element count of the prefix path.
    p = P('/A.a[/B/C/D/E]')
    expect(p.replacePrefix(P('/B/C/D/E'), P('/B/C/D/F')).pathString).toBe('/A.a[/B/C/D/F]')
    // Test replacing target paths.
    p = P('/A/B.a[/C/D.a[/A/F.a]].a')
    expect(p.replacePrefix(P('/A'), P('/_'), false).pathString).toBe('/_/B.a[/C/D.a[/A/F.a]].a')
    expect(p.replacePrefix(P('/A'), P('/_'), true).pathString).toBe('/_/B.a[/C/D.a[/_/F.a]].a')
    expect(P('/Model/Sym/B.r[/Model/Sym/B.x]')
      .replacePrefix(P('/Model/Sym/B.x'), P('/Model/Sym/B.x2')).pathString)
      .toBe('/Model/Sym/B.r[/Model/Sym/B.x2]')
    // ReplacePrefix with an empty old or new prefix returns an empty path.
    expect(P('/A/B').replacePrefix(empty, P('/C')).isEmpty()).toBe(true)
    expect(P('/A/B').replacePrefix(P('/A'), empty).isEmpty()).toBe(true)
    expect(empty.replacePrefix(empty, P('/C')).isEmpty()).toBe(true)
    expect(empty.replacePrefix(P('/A'), empty).isEmpty()).toBe(true)
    expect(empty.replacePrefix(P('/A'), P('/B')).isEmpty()).toBe(true)
  })

  it('test_Basic: RemoveCommonSuffix', () => {
    // [aPath, bPath, r1, r2, r1 (stopAtRootPrim), r2 (stopAtRootPrim)]
    const cases: [string, string, string, string, string, string][] = [
      ['/A/B/C', '/X/Y/Z', '/A/B/C', '/X/Y/Z', '/A/B/C', '/X/Y/Z'],
      ['A/B/C', 'X/Y/Z', 'A/B/C', 'X/Y/Z', 'A/B/C', 'X/Y/Z'],
      ['/A/B/C', '/X/Y/C', '/A/B', '/X/Y', '/A/B', '/X/Y'],
      ['A/B/C', 'X/Y/C', 'A/B', 'X/Y', 'A/B', 'X/Y'],
      ['A/B/C', '/X/Y/C', 'A/B', '/X/Y', 'A/B', '/X/Y'],
      ['/A/B/C', '/X/B/C', '/A', '/X', '/A', '/X'],
      ['A/B/C', 'X/B/C', 'A', 'X', 'A', 'X'],
      ['A/B/C', '/X/B/C', 'A', '/X', 'A', '/X'],
      ['/A/B/C', '/A/B/C', '/', '/', '/A', '/A'],
      ['A/B/C', 'A/B/C', '.', '.', 'A', 'A'],
      ['A/B/C', '/A/B/C', '.', '/', 'A', '/A'],
      ['/A/B/C', '/X/C', '/A/B', '/X', '/A/B', '/X'],
      ['A/B/C', 'X/C', 'A/B', 'X', 'A/B', 'X'],
      ['/A/B/C', '/B/C', '/A', '/', '/A/B', '/B'],
      ['A/B/C', 'B/C', 'A', '.', 'A/B', 'B'],
      ['/A/B/C', '/C', '/A/B', '/', '/A/B/C', '/C'],
      ['A/B/C', 'C', 'A/B', '.', 'A/B/C', 'C'],
      ['A/B/C', '/C', 'A/B', '/', 'A/B/C', '/C'],
      ['/Lights/Lkey.shinesOn[/Chars/Buzz/Helmet].intensity', '/Lights/Lkey.shinesOn[/Chars/Buzz].intensity', '/Lights/Lkey.shinesOn[/Chars/Buzz/Helmet]', '/Lights/Lkey.shinesOn[/Chars/Buzz]', '/Lights/Lkey.shinesOn[/Chars/Buzz/Helmet]', '/Lights/Lkey.shinesOn[/Chars/Buzz]'],
      ['Lights/Lkey.shinesOn[/Chars/Buzz/Helmet].intensity', 'Lights/Lkey.shinesOn[/Chars/Buzz].intensity', 'Lights/Lkey.shinesOn[/Chars/Buzz/Helmet]', 'Lights/Lkey.shinesOn[/Chars/Buzz]', 'Lights/Lkey.shinesOn[/Chars/Buzz/Helmet]', 'Lights/Lkey.shinesOn[/Chars/Buzz]'],
      ['/Lights/Lkey.shinesOn[/Chars/Buzz/Helmet].intensity', '/Lights2/Lkey.shinesOn[/Chars/Buzz/Helmet].intensity', '/Lights', '/Lights2', '/Lights', '/Lights2'],
      ['Lights/Lkey.shinesOn[/Chars/Buzz/Helmet].intensity', 'Lights2/Lkey.shinesOn[/Chars/Buzz/Helmet].intensity', 'Lights', 'Lights2', 'Lights', 'Lights2'],
    ]
    for (const [a, b, r1, r2, s1, s2] of cases) {
      expect(strs(P(a).removeCommonSuffix(P(b))), `${a} ${b}`).toEqual([r1, r2])
      expect(strs(P(a).removeCommonSuffix(P(b), true)), `${a} ${b} stopAtRootPrim`).toEqual([s1, s2])
    }
  })

  it('test_Basic: targetPath', () => {
    expect(P('/Lights/Lkey.shinesOn[/Chars/Buzz/Helmet].intensity').getTargetPath().pathString)
      .toBe('/Chars/Buzz/Helmet')
    expect(P('/Lights/Lkey.shinesOn[../../Buzz/Helmet].intensity').getTargetPath().pathString)
      .toBe('../../Buzz/Helmet')
    expect(P('/Lights/Lkey.shinesOn[/Chars/Buzz/Helmet].intensity').getTargetPath().pathString)
      .toBe('/Chars/Buzz/Helmet')
    expect(P('/Lights/Lkey.shinesOn[/Chars/Buzz/Helmet.blah].intensity').getTargetPath().pathString)
      .toBe('/Chars/Buzz/Helmet.blah')
    // No target
    expect(empty.getTargetPath().isEmpty()).toBe(true)
  })

  it('test_Basic: GetAllTargetPathsRecursively', () => {
    expect(strs(P('/Lights/Lkey.shinesOn[/Chars/Buzz/Helmet].intensity').getAllTargetPathsRecursively()))
      .toEqual(['/Chars/Buzz/Helmet'])
    expect(strs(P('/Lights/Lkey.shinesOn[../../Buzz/Helmet].intensity').getAllTargetPathsRecursively()))
      .toEqual(['../../Buzz/Helmet'])
    expect(strs(P('/Lights/Lkey.shinesOn[/Chars/Buzz/Helmet.blah].intensity').getAllTargetPathsRecursively()))
      .toEqual(['/Chars/Buzz/Helmet.blah'])
    expect(strs(P('/A/B.a[/C/D.a[/E/F.a]].a').getAllTargetPathsRecursively()))
      .toEqual(['/C/D.a[/E/F.a]', '/E/F.a'])
    expect(strs(P('/A/B.a[/C/D.a[/E/F.a]].a[/A/B.a[/C/D.a]]').getAllTargetPathsRecursively()))
      .toEqual(['/A/B.a[/C/D.a]', '/C/D.a', '/C/D.a[/E/F.a]', '/E/F.a'])
    expect(P('/No/Target/Paths').getAllTargetPathsRecursively()).toEqual([])
  })

  it('test_Basic: AppendChild / AppendProperty', () => {
    expect(P('/foo').appendChild('bar').pathString).toBe('/foo/bar')
    expect(P('foo').appendChild('bar').pathString).toBe('foo/bar')
    expect(trapped(() => P('/foo.prop').appendChild('bar')).result.isEmpty()).toBe(true)
    expect(P('/foo').appendProperty('prop').pathString).toBe('/foo.prop')
    expect(P('/foo').appendProperty('prop:foo:bar').pathString).toBe('/foo.prop:foo:bar')
    expect(trapped(() => P('/foo.prop').appendProperty('prop2')).result.isEmpty()).toBe(true)
    expect(trapped(() => P('/foo.prop').appendProperty('prop2:foo:bar')).result.isEmpty()).toBe(true)
  })

  it('test_Basic: AppendPath', () => {
    // append to empty path -> empty path
    expect(trapped(() => empty.appendPath(empty)).errors).toBe(1)
    expect(trapped(() => empty.appendPath(P('A'))).errors).toBe(1)
    // append to root/prim path
    expect(P('/').appendPath(P('A')).pathString).toBe('/A')
    expect(P('/A').appendPath(P('B')).pathString).toBe('/A/B')
    // append empty to root/prim path -> no change
    expect(trapped(() => P('/').appendPath(empty)).errors).toBe(1)
    expect(trapped(() => P('/A').appendPath(empty)).errors).toBe(1)
  })

  it('test_Basic: AppendTarget / AppendRelationalAttribute', () => {
    expect(P('/foo.rel').appendTarget(P('/Bar/Baz')).pathString).toBe('/foo.rel[/Bar/Baz]')
    expect(trapped(() => P('/foo').appendTarget(P('/Bar/Baz'))).result.isEmpty()).toBe(true)
    const aPath = P('/foo.rel[/Bar/Baz]')
    expect(aPath.appendRelationalAttribute('attr').pathString).toBe('/foo.rel[/Bar/Baz].attr')
    expect(aPath.appendRelationalAttribute('attr:foo:bar').pathString).toBe('/foo.rel[/Bar/Baz].attr:foo:bar')
    expect(trapped(() => P('/foo').appendRelationalAttribute('attr')).result.isEmpty()).toBe(true)
    expect(trapped(() => P('/foo').appendRelationalAttribute('attr:foo:bar')).result.isEmpty()).toBe(true)
  })

  it('test_Basic: parentPath, name, and replaceName', () => {
    const parents: [string, string][] = [
      ['/foo/bar/baz', '/foo/bar'],
      ['/foo', '/'],
      ['/foo/bar/baz.prop', '/foo/bar/baz'],
      ['/foo/bar/baz.rel[/targ].attr', '/foo/bar/baz.rel[/targ]'],
      ['/foo/bar/baz.rel[/targ]', '/foo/bar/baz.rel'],
      ['../../..', '../../../..'],
      ['..', '../..'],
      ['../../../.prop', '../../..'],
      ['../../../.rel[/targ]', '../../../.rel'],
      ['../../../.rel[/targ].attr', '../../../.rel[/targ]'],
      ['foo/bar/baz', 'foo/bar'],
      ['foo', '.'],
      ['foo/bar/baz.prop', 'foo/bar/baz'],
      ['foo/bar/baz.rel[/targ]', 'foo/bar/baz.rel'],
      ['foo/bar/baz.rel[/targ].attr', 'foo/bar/baz.rel[/targ]'],
    ]
    for (const [path, parent] of parents) expect(P(path).getParentPath().pathString, path).toBe(parent)
    expect(empty.getParentPath().isEmpty()).toBe(true)

    const names: [string, string][] = [
      ['/foo/bar/baz', 'baz'],
      ['/foo', 'foo'],
      ['/foo/bar/baz.prop', 'prop'],
      ['/foo/bar/baz.prop:argle:bargle', 'prop:argle:bargle'],
      ['/foo/bar/baz.rel[/targ].attr', 'attr'],
      ['/foo/bar/baz.rel[/targ].attr:argle:bargle', 'attr:argle:bargle'],
      ['../../..', '..'],
      ['../../.prop', 'prop'],
      ['../../.prop:argle:bargle', 'prop:argle:bargle'],
      ['../../.rel[/targ].attr', 'attr'],
      ['../../.rel[/targ].attr:argle:bargle', 'attr:argle:bargle'],
      ['foo/bar/baz', 'baz'],
      ['foo', 'foo'],
      ['foo/bar/baz.prop', 'prop'],
      ['foo/bar/baz.prop:argle:bargle', 'prop:argle:bargle'],
      ['foo/bar/baz.rel[/targ].attr', 'attr'],
      ['foo/bar/baz.rel[/targ].attr:argle:bargle', 'attr:argle:bargle'],
    ]
    for (const [path, name] of names) expect(P(path).name, path).toBe(name)
    expect(empty.name).toBe('')

    const replaced: [string, string, string][] = [
      ['/foo/bar/baz', 'foo', '/foo/bar/foo'],
      ['/foo', 'bar', '/bar'],
      ['/foo/bar/baz.prop', 'attr', '/foo/bar/baz.attr'],
      ['/foo/bar/baz.prop', 'attr:argle:bargle', '/foo/bar/baz.attr:argle:bargle'],
      ['/foo/bar/baz.prop:argle:bargle', 'attr', '/foo/bar/baz.attr'],
      ['/foo/bar/baz.prop:argle:bargle', 'attr:foo:fa:raw', '/foo/bar/baz.attr:foo:fa:raw'],
      ['/foo/bar/baz.rel[/targ].attr', 'prop', '/foo/bar/baz.rel[/targ].prop'],
      ['/foo/bar/baz.rel[/targ].attr', 'prop:argle:bargle', '/foo/bar/baz.rel[/targ].prop:argle:bargle'],
      ['/foo/bar/baz.rel[/targ].attr:argle:bargle', 'prop', '/foo/bar/baz.rel[/targ].prop'],
      ['/foo/bar/baz.rel[/targ].attr:argle:bargle', 'prop:foo:fa:raw', '/foo/bar/baz.rel[/targ].prop:foo:fa:raw'],
      ['../../..', 'foo', '../../../../foo'],
      ['..', 'foo', '../../foo'],
      ['../../../.prop', 'attr', '../../../.attr'],
      ['../../../.prop', 'attr:argle:bargle', '../../../.attr:argle:bargle'],
      ['../../../.rel[/targ].attr', 'prop', '../../../.rel[/targ].prop'],
      ['../../../.rel[/targ].attr', 'prop:argle:bargle', '../../../.rel[/targ].prop:argle:bargle'],
      ['foo/bar/baz', 'foo', 'foo/bar/foo'],
      ['foo', 'bar', 'bar'],
      ['foo/bar/baz.prop', 'attr', 'foo/bar/baz.attr'],
      ['foo/bar/baz.prop', 'attr:argle:bargle', 'foo/bar/baz.attr:argle:bargle'],
      ['foo/bar/baz.rel[/targ].attr', 'prop', 'foo/bar/baz.rel[/targ].prop'],
      ['foo/bar/baz.rel[/targ].attr', 'prop:argle:bargle', 'foo/bar/baz.rel[/targ].prop:argle:bargle'],
    ]
    for (const [path, newName, expected] of replaced) {
      expect(P(path).replaceName(newName).pathString, `${path} ${newName}`).toBe(expected)
    }
    expect(trapped(() => P('/foo/bar[target]').replaceName('xxx')).errors).toBe(1)
  })

  it('test_Basic: GetConciseRelativePaths', () => {
    const aPath = P('/foo/bar')
    const bPath = P('/foo/baz')
    const cPath = P('/foo')
    // a typical assortment of paths
    expect(strs(SdfPath.getConciseRelativePaths([aPath, bPath, cPath]))).toEqual(['bar', 'baz', '/foo'])
    // test some property paths
    expect(strs(SdfPath.getConciseRelativePaths([P('/foo/bar.a'), P('/foo/bar.b')]))).toEqual(['bar.a', 'bar.b'])
    expect(strs(SdfPath.getConciseRelativePaths([aPath, P('/baz/bar')]))).toEqual(['/foo/bar', '/baz/bar'])
    // now give it two identical paths
    expect(strs(SdfPath.getConciseRelativePaths([aPath, aPath]))).toEqual(['bar', 'bar'])
    // give it root paths
    expect(strs(SdfPath.getConciseRelativePaths([cPath, P('/bar')]))).toEqual(['/foo', '/bar'])
    // now give it a relative path as an argument
    expect(strs(trapped(() => SdfPath.getConciseRelativePaths([P('a')])).result)).toEqual(['a'])
  })

  it('test_Basic: RemoveDescendentPaths / RemoveAncestorPaths', () => {
    const input = ['/a/b/c', '/q', '/a/b/c/d/e/f/g', '/r/s/t', '/a/b', '/q/r/s/t', '/x/y', '/a/b/d']
    let result = strs(SdfPath.removeDescendentPaths(input.map(P)))
    expect(result.length).toBe(new Set(result).size)
    expect(new Set(result)).toEqual(new Set(['/a/b', '/q', '/x/y', '/r/s/t']))
    result = strs(SdfPath.removeAncestorPaths(input.map(P)))
    expect(result.length).toBe(new Set(result).size)
    expect(new Set(result)).toEqual(new Set(['/a/b/c/d/e/f/g', '/a/b/d', '/q/r/s/t', '/r/s/t', '/x/y']))
  })

  it('test_Basic: FindPrefixedRange and FindLongestPrefix', () => {
    // A seeded generator stands in for Python's time-seeded random.Random.
    let seed = 20260808
    const rand = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const randint = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1))
    const letters = ['a', 'b', 'c', 'd']
    const maxLen = 8
    const randomPaths = (): SdfPath[] => {
      const out: SdfPath[] = []
      for (let i = 0; i < 300; i++) {
        const elems = Array.from({ length: randint(1, maxLen) }, () => letters[randint(0, 3)]!)
        out.push(P('/' + elems.join('/')))
      }
      out.push(P('/'))
      return out.sort(SdfPath.compare)
    }
    const paths = randomPaths()
    const tests = randomPaths()
    const bruteLongest = (p: SdfPath): SdfPath => {
      let longest = P('/')
      for (const x of paths) {
        if (p.hasPrefix(x) && x.pathElementCount > longest.pathElementCount) longest = x
      }
      return longest
    }
    for (const p of tests) {
      const [begin, end] = sdfPathFindPrefixedRange(paths, p)
      expect(paths.slice(begin, end).every(path => path.hasPrefix(p))).toBe(true)
      const others = [...paths.slice(0, begin), ...paths.slice(end)]
      expect(others.slice(begin, end).some(path => path.hasPrefix(p))).toBe(false)

      // should always have some prefix since '/' is in paths.
      const lp = paths[sdfPathFindLongestPrefix(paths, p)]!
      expect(p.hasPrefix(lp)).toBe(true)
      expect(lp.pathString).toBe(bruteLongest(p).pathString)

      // should always have some prefix unless p is '/'.
      if (!p.isAbsoluteRootPath()) {
        const lsp = paths[sdfPathFindLongestStrictPrefix(paths, p)]!
        expect(p.hasPrefix(lsp)).toBe(true)
        expect(lsp.pathString).toBe(bruteLongest(p.getParentPath()).pathString)
      }
    }

    // Do a few simple cases directly.
    const simple = ['/a', '/a/b/c/d', '/b/a', '/b/c/d/e'].map(P)
    const flp = (path: string): string | null => {
      const i = sdfPathFindLongestPrefix(simple, P(path))
      return i === simple.length ? null : simple[i]!.pathString
    }
    expect(flp('/x')).toBe(null)
    expect(flp('/a')).toBe('/a')
    expect(flp('/a/a/a')).toBe('/a')
    expect(flp('/a/c/d/e/f')).toBe('/a')
    expect(flp('/a/b/c/d')).toBe('/a/b/c/d')
    expect(flp('/a/b/c/d/a/b/c/d')).toBe('/a/b/c/d')
    expect(flp('/a/b/c/e/f/g')).toBe('/a')
    expect(flp('/b')).toBe(null)
    expect(flp('/b/a/b/c/d/e')).toBe('/b/a')
    expect(flp('/b/c/d/e/f/g')).toBe('/b/c/d/e')
    expect(flp('/b/c/d/e')).toBe('/b/c/d/e')
    expect(flp('/b/c/x/y/z')).toBe(null)
  })

  it('test_AncestorPathRange', () => {
    const cases: [string, string[]][] = [
      // Absolute paths
      ['/foo', ['/foo']],
      ['/foo/bar', ['/foo/bar', '/foo']],
      ['/foo/bar.prop', ['/foo/bar.prop', '/foo/bar', '/foo']],
      ['/foo/bar.rel[/targ].attr',
        ['/foo/bar.rel[/targ].attr', '/foo/bar.rel[/targ]', '/foo/bar.rel', '/foo/bar', '/foo']],
      // Relative paths
      ['foo', ['foo']],
      ['foo/bar', ['foo/bar', 'foo']],
      ['foo/bar.prop', ['foo/bar.prop', 'foo/bar', 'foo']],
      ['foo/bar.rel[/targ].attr',
        ['foo/bar.rel[/targ].attr', 'foo/bar.rel[/targ]', 'foo/bar.rel', 'foo/bar', 'foo']],
      // Paths beginning with '..'
      ['..', ['..']],
      ['../bar', ['../bar', '..']],
      ['../bar.prop', ['../bar.prop', '../bar', '..']],
      ['../bar.rel[/targ].attr',
        ['../bar.rel[/targ].attr', '../bar.rel[/targ]', '../bar.rel', '../bar', '..']],
    ]
    for (const [path, expected] of cases) expect(strs(P(path).getAncestorsRange()), path).toEqual(expected)
  })
})
