// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdDataSourceLocator.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the HdDataSourceLocatorSet parts of OpenUSD 26.11.1
// pxr/imaging/hd/testenv/testHdDataSourceLocator.cpp: TestLocatorSet
// (323-418), TestLocatorSetContains (613-756), TestLocatorSetReplaces
// (758-968) and TestLocatorSetIntersection (970-1140).

import { describe, it, expect } from 'vitest'
import {
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
} from '../../src/index.ts'

/** testHdDataSourceLocator.cpp:62-74 */
function _Parse(inputStr: string): HdDataSourceLocator {
  return new HdDataSourceLocator(...inputStr.split('/').filter(s => s !== ''))
}

function _Set(...paths: string[]): HdDataSourceLocatorSet {
  return new HdDataSourceLocatorSet(paths.map(_Parse))
}

function _Strs(set: Iterable<HdDataSourceLocator>): string[] {
  return [...set].map(l => l.GetString())
}

describe('testHdDataSourceLocator TestLocatorSet', () => {
  it('Insert exclusion (non-intersecting)', () => {
    const locators = new HdDataSourceLocatorSet()
    locators.insert(_Parse('a/b'))
    locators.insert(_Parse('c/b'))
    expect(locators.Equals(_Set('a/b', 'c/b'))).toBe(true)
  })
  it('Insert exclusion (intersecting, single)', () => {
    const locators = new HdDataSourceLocatorSet()
    for (const p of ['a/b', 'c/d', 'a/b/c', 'f', 'a/b/d']) locators.insert(_Parse(p))
    const baseline = new HdDataSourceLocatorSet()
    for (const p of ['a/b', 'c/d', 'f']) baseline.insert(_Parse(p))
    expect(locators.Equals(baseline)).toBe(true)
  })
  it('Insert exclusion (intersecting, set)', () => {
    const locators = _Set('a/b', 'c/d', 'a/b/c')
    locators.insert(_Set('f', 'a/b/d'))
    const baseline = new HdDataSourceLocatorSet()
    for (const p of ['a/b', 'c/d', 'f']) baseline.insert(_Parse(p))
    expect(locators.Equals(baseline)).toBe(true)
  })
  it('Insert exclusion (empty locator)', () => {
    const locators = new HdDataSourceLocatorSet()
    locators.insert(_Parse('a/b'))
    locators.insert(_Parse('a/b/c'))
    locators.insert(_Parse('q/e/d'))
    locators.insert(new HdDataSourceLocator())
    const baseline = new HdDataSourceLocatorSet()
    baseline.insert(new HdDataSourceLocator())
    expect(locators.Equals(baseline)).toBe(true)
  })
  it('intersection 1', () => {
    const locators = new HdDataSourceLocatorSet()
    locators.insert(_Parse('a/b'))
    locators.insert(_Parse('c'))
    expect(locators.intersects(_Parse('c/d'))).toBe(true)
    expect(locators.intersects(_Parse('e/f'))).toBe(false)
  })
})

describe('testHdDataSourceLocator TestLocatorSetContains', () => {
  it('Empty set contains nothing', () => {
    const locators = new HdDataSourceLocatorSet()
    expect(locators.contains(_Parse(''))).toBe(false)
    expect(locators.contains(_Parse('c'))).toBe(false)
    expect(locators.contains(_Parse('c/d'))).toBe(false)
  })
  it('Universal set contains everything', () => {
    const locators = _Set('')
    expect(locators.contains(_Parse(''))).toBe(true)
    expect(locators.contains(_Parse('c'))).toBe(true)
    expect(locators.contains(_Parse('c/d'))).toBe(true)
  })
  const membership: [string, boolean][] = [
    ['', false], ['b', false], ['b/c', false], ['c', true], ['c/d', true],
    ['d', false], ['f', false], ['f/g', true], ['f/g/h', true], ['g', false],
  ]
  it('Membership tests (small set)', () => {
    const locators = _Set('c', 'f/g')
    for (const [p, expected] of membership) expect(locators.contains(_Parse(p)), p).toBe(expected)
  })
  it('Membership tests (large set)', () => {
    const locators = _Set('c', 'e/a', 'e/b', 'e/c', 'e/d', 'e/e', 'e/f', 'e/g', 'e/h',
      'e/i', 'e/j', 'e/k', 'e/l', 'f/g')
    for (const [p, expected] of membership) expect(locators.contains(_Parse(p)), p).toBe(expected)
  })
})

describe('testHdDataSourceLocator TestLocatorSetReplaces', () => {
  it('Empty locator set', () => {
    const locators = new HdDataSourceLocatorSet()
    expect(locators.replacePrefix(HdDataSourceLocator.EmptyLocator, _Parse('foo')).Equals(locators)).toBe(true)
    expect(locators.replacePrefix(_Parse('foo'), _Parse('bar')).Equals(locators)).toBe(true)
  })
  it('Universal locator set', () => {
    const locators = _Set('')
    expect(locators.replacePrefix(HdDataSourceLocator.EmptyLocator, _Parse('foo')).Equals(_Set('foo'))).toBe(true)
    expect(locators.replacePrefix(_Parse('foo'), _Parse('bar')).Equals(locators)).toBe(true)
  })
  it('small set', () => {
    const locators = _Set('a/a/c', 'a/c/d', 'a/c/e', 'a/d/e')
    expect(locators.replacePrefix(_Parse('a/b'), _Parse('a/d')).Equals(locators)).toBe(true)
    expect(locators.replacePrefix(_Parse('a/c'), _Parse('X/Y'))
      .Equals(_Set('a/a/c', 'X/Y/d', 'X/Y/e', 'a/d/e'))).toBe(true)
    expect(locators.replacePrefix(_Parse('a/c'), _Parse('a/d'))
      .Equals(_Set('a/a/c', 'a/d/d', 'a/d/e'))).toBe(true)
    expect(locators.replacePrefix(_Parse(''), _Parse('X/Y'))
      .Equals(_Set('X/Y/a/a/c', 'X/Y/a/c/d', 'X/Y/a/c/e', 'X/Y/a/d/e'))).toBe(true)
    expect(locators.replacePrefix(_Parse('a/'), _Parse(''))
      .Equals(_Set('a/c', 'c/d', 'c/e', 'd/e'))).toBe(true)
    expect(locators.replacePrefix(_Parse('a/c/d'), _Parse('b'))
      .Equals(_Set('a/a/c', 'b', 'a/c/e', 'a/d/e'))).toBe(true)
  })
  it('large set', () => {
    const locators = _Set('a/b', 'a/c/d', 'a/c/e/f', 'a/c/e/g', 'g/a', 'g/b', 'g/c/c', 'g/d/b')
    expect(locators.replacePrefix(_Parse('a/d'), _Parse('a/c')).Equals(locators)).toBe(true)
    expect(locators.replacePrefix(_Parse('a/c'), _Parse('X/Y')).Equals(
      _Set('a/b', 'X/Y/d', 'X/Y/e/f', 'X/Y/e/g', 'g/a', 'g/b', 'g/c/c', 'g/d/b'))).toBe(true)
    expect(locators.replacePrefix(_Parse('a/c'), _Parse('g/b')).Equals(
      _Set('a/b', 'g/a', 'g/b', 'g/c/c', 'g/d/b'))).toBe(true)
    expect(locators.replacePrefix(_Parse(''), _Parse('X/Y')).Equals(
      _Set('X/Y/a/b', 'X/Y/a/c/d', 'X/Y/a/c/e/f', 'X/Y/a/c/e/g', 'X/Y/g/a', 'X/Y/g/b',
        'X/Y/g/c/c', 'X/Y/g/d/b'))).toBe(true)
    expect(locators.replacePrefix(_Parse('g/'), _Parse('')).Equals(
      _Set('a', 'a/c/d', 'a/c/e/f', 'a/c/e/g', 'b', 'c/c', 'd/b'))).toBe(true)
    expect(locators.replacePrefix(_Parse('a/c/e/f'), _Parse('b')).Equals(
      _Set('a/b', 'a/c/d', 'b', 'a/c/e/g', 'g/a', 'g/b', 'g/c/c', 'g/d/b'))).toBe(true)
  })
})

describe('testHdDataSourceLocator TestLocatorSetIntersection', () => {
  const empty = new HdDataSourceLocator()
  const mesh = new HdDataSourceLocator('mesh')
  const primvars = new HdDataSourceLocator('primvars')
  const primvarsColor = primvars.append('color')
  const primvarsColorInterpolation = primvarsColor.append('interpolation')
  const primvarsOpacity = primvars.append('opacity')

  it('empty set', () => {
    const locators = new HdDataSourceLocatorSet()
    expect(_Strs(locators.intersection(empty))).toEqual([])
    expect(_Strs(locators.intersection(primvars))).toEqual([])
  })
  it('universal set', () => {
    const locators = new HdDataSourceLocatorSet(empty)
    expect(_Strs(locators.intersection(empty))).toEqual([''])
    expect(_Strs(locators.intersection(primvars))).toEqual(['primvars'])
  })
  it('A-D', () => {
    const locators = new HdDataSourceLocatorSet([mesh, primvars])
    expect(_Strs(locators.intersection(empty))).toEqual(['mesh', 'primvars'])
    expect(_Strs(locators.intersection(mesh))).toEqual(['mesh'])
    expect(_Strs(locators.intersection(primvars))).toEqual(['primvars'])
    expect(_Strs(locators.intersection(primvarsColor))).toEqual(['primvars/color'])
  })
  it('E-F', () => {
    const locators = new HdDataSourceLocatorSet([mesh, primvarsColorInterpolation, primvarsOpacity])
    expect(_Strs(locators.intersection(primvars)))
      .toEqual(['primvars/color/interpolation', 'primvars/opacity'])
    expect(_Strs(locators.intersection(primvarsColor))).toEqual(['primvars/color/interpolation'])
  })
  it('E-F binary search', () => {
    const locators = new HdDataSourceLocatorSet([mesh, primvarsColorInterpolation, primvarsOpacity,
      ...['za', 'zb', 'zc', 'zd', 'ze', 'zf', 'zg', 'zh', 'zi', 'zj'].map(t => new HdDataSourceLocator(t))])
    expect(_Strs(locators.intersection(primvars)))
      .toEqual(['primvars/color/interpolation', 'primvars/opacity'])
    expect(_Strs(locators.intersection(primvarsColor))).toEqual(['primvars/color/interpolation'])
  })
  it('IntersectionIterator last elements', () => {
    const locators = new HdDataSourceLocatorSet([mesh, primvarsColor, primvarsOpacity])
    expect([...locators.intersection(primvars)].map(l => l.getLastElement())).toEqual(['color', 'opacity'])
  })
})
