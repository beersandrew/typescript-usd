// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdDataSourceLocator.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Faithful TypeScript equivalent of OpenUSD's testHdDataSourceLocator.cpp
// Tests HdDataSourceLocator and HdDataSourceLocatorSet

import { describe, it, expect } from 'vitest'
import { DataSourceLocator as HdDataSourceLocator, DataSourceLocatorSet as HdDataSourceLocatorSet } from '../../src/index.ts'

// ---- HdDataSourceLocator ----

describe('HdDataSourceLocator construction', () => {
  it('creates an empty locator with 0 elements', () => {
    const loc = new HdDataSourceLocator()
    expect(loc.getElementCount()).toBe(0)
    expect(loc.GetString()).toBe('')
  })

  it('creates a locator with 1 element', () => {
    const loc = new HdDataSourceLocator('mesh')
    expect(loc.getElementCount()).toBe(1)
    expect(loc.getFirstElement()).toBe('mesh')
    expect(loc.getLastElement()).toBe('mesh')
    expect(loc.GetString()).toBe('mesh')
  })

  it('creates a locator with 2 elements', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology')
    expect(loc.getElementCount()).toBe(2)
    expect(loc.getFirstElement()).toBe('mesh')
    expect(loc.getLastElement()).toBe('topology')
    expect(loc.GetString()).toBe('mesh/topology')
  })

  it('creates a locator with 3 elements', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology', 'faceVertexCounts')
    expect(loc.getElementCount()).toBe(3)
    expect(loc.getElement(0)).toBe('mesh')
    expect(loc.getElement(1)).toBe('topology')
    expect(loc.getElement(2)).toBe('faceVertexCounts')
    expect(loc.GetString()).toBe('mesh/topology/faceVertexCounts')
  })

  it('EmptyLocator is empty', () => {
    expect(HdDataSourceLocator.EmptyLocator.getElementCount()).toBe(0)
    expect(HdDataSourceLocator.EmptyLocator.GetString()).toBe('')
  })
})

describe('HdDataSourceLocator.GetElement', () => {
  it('returns empty string for out-of-bounds index', () => {
    const loc = new HdDataSourceLocator('mesh')
    expect(loc.getElement(99)).toBe('')
  })
})

describe('HdDataSourceLocator.GetString', () => {
  it('joins elements with /', () => {
    expect(new HdDataSourceLocator('a', 'b', 'c').GetString()).toBe('a/b/c')
  })

  it('returns empty string for empty locator', () => {
    expect(new HdDataSourceLocator().GetString()).toBe('')
  })
})

describe('HdDataSourceLocator.Equals', () => {
  it('returns true for locators with same elements', () => {
    const a = new HdDataSourceLocator('mesh', 'topology')
    const b = new HdDataSourceLocator('mesh', 'topology')
    expect(a.Equals(b)).toBe(true)
  })

  it('returns false for locators with different elements', () => {
    const a = new HdDataSourceLocator('mesh', 'topology')
    const b = new HdDataSourceLocator('mesh', 'points')
    expect(a.Equals(b)).toBe(false)
  })

  it('returns false for locators with different lengths', () => {
    const a = new HdDataSourceLocator('mesh')
    const b = new HdDataSourceLocator('mesh', 'topology')
    expect(a.Equals(b)).toBe(false)
  })

  it('two empty locators are equal', () => {
    expect(new HdDataSourceLocator().Equals(new HdDataSourceLocator())).toBe(true)
  })
})

describe('HdDataSourceLocator.Append', () => {
  it('returns new locator with element appended', () => {
    const loc = new HdDataSourceLocator('mesh')
    const appended = loc.append('topology')
    expect(appended.GetString()).toBe('mesh/topology')
    expect(appended.getElementCount()).toBe(2)
  })

  it('does not modify the original locator', () => {
    const loc = new HdDataSourceLocator('mesh')
    loc.append('topology')
    expect(loc.getElementCount()).toBe(1)
  })

  it('can append multiple elements at once', () => {
    const loc = new HdDataSourceLocator('mesh')
    const appended = loc.append('topology', 'faceVertexCounts')
    expect(appended.GetString()).toBe('mesh/topology/faceVertexCounts')
  })

  it('appending to empty locator produces single-element locator', () => {
    const loc = new HdDataSourceLocator()
    const appended = loc.append('mesh')
    expect(appended.GetString()).toBe('mesh')
    expect(appended.getElementCount()).toBe(1)
  })
})

describe('HdDataSourceLocator.Prepend', () => {
  it('returns new locator with elements prepended', () => {
    const loc = new HdDataSourceLocator('topology')
    const prepended = loc.prepend('mesh')
    expect(prepended.GetString()).toBe('mesh/topology')
  })
})

describe('HdDataSourceLocator.ReplaceLastElement', () => {
  it('replaces the last element', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology')
    const replaced = loc.replaceLastElement('points')
    expect(replaced.GetString()).toBe('mesh/points')
  })
})

describe('HdDataSourceLocator.RemoveFirstElement', () => {
  it('removes the first element', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology', 'faceVertexCounts')
    const removed = loc.removeFirstElement()
    expect(removed.GetString()).toBe('topology/faceVertexCounts')
    expect(removed.getElementCount()).toBe(2)
  })
})

describe('HdDataSourceLocator.RemoveLastElement', () => {
  it('removes the last element', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology', 'faceVertexCounts')
    const removed = loc.removeLastElement()
    expect(removed.GetString()).toBe('mesh/topology')
    expect(removed.getElementCount()).toBe(2)
  })
})

describe('HdDataSourceLocator.HasPrefix', () => {
  it('returns true when other is a proper prefix', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology', 'faceVertexCounts')
    const prefix = new HdDataSourceLocator('mesh', 'topology')
    expect(loc.hasPrefix(prefix)).toBe(true)
  })

  it('returns true for equal locators (self is prefix of self)', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology')
    expect(loc.hasPrefix(loc)).toBe(true)
  })

  it('returns true when other is the empty locator', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology')
    expect(loc.hasPrefix(new HdDataSourceLocator())).toBe(true)
  })

  it('returns false when other is longer than self', () => {
    const loc = new HdDataSourceLocator('mesh')
    const longer = new HdDataSourceLocator('mesh', 'topology')
    expect(loc.hasPrefix(longer)).toBe(false)
  })

  it('returns false when elements do not match', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology')
    const other = new HdDataSourceLocator('xform')
    expect(loc.hasPrefix(other)).toBe(false)
  })

  it('returns false when prefix tokens differ', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology')
    const other = new HdDataSourceLocator('xform', 'topology')
    expect(loc.hasPrefix(other)).toBe(false)
  })
})

describe('HdDataSourceLocator.Intersects', () => {
  it('returns true when self is a prefix of other', () => {
    const parent = new HdDataSourceLocator('mesh')
    const child = new HdDataSourceLocator('mesh', 'topology')
    expect(parent.intersects(child)).toBe(true)
  })

  it('returns true when other is a prefix of self', () => {
    const parent = new HdDataSourceLocator('mesh')
    const child = new HdDataSourceLocator('mesh', 'topology')
    expect(child.intersects(parent)).toBe(true)
  })

  it('returns true for equal locators', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology')
    expect(loc.intersects(loc)).toBe(true)
  })

  it('returns false for completely unrelated locators', () => {
    const a = new HdDataSourceLocator('mesh', 'topology')
    const b = new HdDataSourceLocator('xform', 'matrix')
    expect(a.intersects(b)).toBe(false)
  })

  it('is symmetric', () => {
    const a = new HdDataSourceLocator('mesh')
    const b = new HdDataSourceLocator('mesh', 'topology', 'faceVertexCounts')
    expect(a.intersects(b)).toBe(b.intersects(a))
  })
})

// ---- HdDataSourceLocatorSet ----

describe('HdDataSourceLocatorSet construction', () => {
  it('creates an empty set', () => {
    const set = new HdDataSourceLocatorSet()
    expect(set.IsEmpty()).toBe(true)
  })

  it('creates a set with initial locators', () => {
    const loc = new HdDataSourceLocator('mesh')
    const set = new HdDataSourceLocatorSet([loc])
    expect(set.IsEmpty()).toBe(false)
  })

  it('UniversalSet is not empty', () => {
    expect(HdDataSourceLocatorSet.UniversalSet.IsEmpty()).toBe(false)
  })
})

describe('HdDataSourceLocatorSet.Add', () => {
  it('adds a locator, making the set non-empty', () => {
    const set = new HdDataSourceLocatorSet()
    set.add(new HdDataSourceLocator('mesh'))
    expect(set.IsEmpty()).toBe(false)
  })

  it('can add multiple locators', () => {
    const set = new HdDataSourceLocatorSet()
    set.add(new HdDataSourceLocator('mesh'))
    set.add(new HdDataSourceLocator('xform'))
    set.add(new HdDataSourceLocator('primvars'))
    // Confirm all three are represented via intersection
    expect(set.intersects(new HdDataSourceLocator('mesh'))).toBe(true)
    expect(set.intersects(new HdDataSourceLocator('xform'))).toBe(true)
    expect(set.intersects(new HdDataSourceLocator('primvars'))).toBe(true)
  })
})

describe('HdDataSourceLocatorSet.Contains', () => {
  it('returns true when the exact locator is in the set', () => {
    const loc = new HdDataSourceLocator('mesh', 'topology')
    const set = new HdDataSourceLocatorSet([loc])
    expect(set.contains(loc)).toBe(true)
  })

  it('returns true when the set contains a parent of the queried locator', () => {
    const parent = new HdDataSourceLocator('mesh')
    const set = new HdDataSourceLocatorSet([parent])
    const child = new HdDataSourceLocator('mesh', 'topology')
    // parent covers child
    expect(set.contains(child)).toBe(true)
  })

  // testHdDataSourceLocator.cpp:613-756: Contains is true only when a
  // prefix of the locator is a generator of the set ("Membership test 7":
  // {c, f/g} does not contain f).
  it('returns false when the set contains only a child of the queried locator', () => {
    const child = new HdDataSourceLocator('mesh', 'topology')
    const set = new HdDataSourceLocatorSet([child])
    const parent = new HdDataSourceLocator('mesh')
    expect(set.contains(parent)).toBe(false)
  })

  it('returns false when locator is not in the set', () => {
    const set = new HdDataSourceLocatorSet([new HdDataSourceLocator('mesh')])
    expect(set.contains(new HdDataSourceLocator('xform'))).toBe(false)
  })

  it('returns false for an empty set', () => {
    const set = new HdDataSourceLocatorSet()
    expect(set.contains(new HdDataSourceLocator('mesh'))).toBe(false)
  })
})

describe('HdDataSourceLocatorSet.Intersects', () => {
  it('returns true when set contains an intersecting locator', () => {
    const set = new HdDataSourceLocatorSet([new HdDataSourceLocator('mesh', 'topology')])
    expect(set.intersects(new HdDataSourceLocator('mesh'))).toBe(true)
  })

  it('returns false when no locators intersect', () => {
    const set = new HdDataSourceLocatorSet([new HdDataSourceLocator('mesh')])
    expect(set.intersects(new HdDataSourceLocator('xform'))).toBe(false)
  })

  it('returns false for an empty set', () => {
    const set = new HdDataSourceLocatorSet()
    expect(set.intersects(new HdDataSourceLocator('mesh'))).toBe(false)
  })
})

describe('HdDataSourceLocatorSet iteration', () => {
  it('iterates over added locators', () => {
    const a = new HdDataSourceLocator('mesh')
    const b = new HdDataSourceLocator('xform')
    const set = new HdDataSourceLocatorSet([a, b])
    const collected: string[] = []
    for (const loc of set) {
      collected.push(loc.GetString())
    }
    expect(collected).toContain('mesh')
    expect(collected).toContain('xform')
  })
})
