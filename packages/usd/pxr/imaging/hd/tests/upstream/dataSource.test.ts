// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdDataSource.cpp
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Faithful TypeScript equivalent of OpenUSD's testHdDataSource.cpp
// Tests HdDataSourceBase hierarchy and retained containers

import { describe, it, expect } from 'vitest'
import {
  HdDataSourceBase,
  HdContainerDataSource,
  HdSampledDataSource,
  HdTypedSampledDataSource,
  HdRetainedTypedSampledDataSource,
  HdRetainedContainerDataSource,
} from '../../src/dataSource.ts'
import { HdDataSourceLocator } from '../../src/dataSourceLocator.ts'


describe('HdRetainedTypedSampledDataSource', () => {
  it('stores a boolean value and returns it via GetTypedValue', () => {
    const ds = new HdRetainedTypedSampledDataSource(true)
    expect(ds.getTypedValue(0)).toBe(true)
  })

  it('stores a number value', () => {
    const ds = new HdRetainedTypedSampledDataSource(42)
    expect(ds.getTypedValue(0)).toBe(42)
  })

  it('stores a string value', () => {
    const ds = new HdRetainedTypedSampledDataSource('rightHanded')
    expect(ds.getTypedValue(0)).toBe('rightHanded')
  })

  it('stores an array value', () => {
    const ds = new HdRetainedTypedSampledDataSource([4, 4, 4, 4])
    expect(ds.getTypedValue(0)).toEqual([4, 4, 4, 4])
  })

  it('GetValue returns the same value as GetTypedValue', () => {
    const ds = new HdRetainedTypedSampledDataSource(99)
    expect(ds.GetValue(0)).toBe(ds.getTypedValue(0))
  })

  it('GetContributingSampleTimesForInterval returns false (no time variance)', () => {
    const ds = new HdRetainedTypedSampledDataSource(1.0)
    const times: number[] = []
    expect(ds.GetContributingSampleTimesForInterval(0, 1, times)).toBe(false)
  })

  it('is an instance of HdDataSourceBase', () => {
    const ds = new HdRetainedTypedSampledDataSource(0)
    expect(ds).toBeInstanceOf(HdDataSourceBase)
  })

  it('is an instance of HdSampledDataSource', () => {
    const ds = new HdRetainedTypedSampledDataSource(0)
    expect(ds).toBeInstanceOf(HdSampledDataSource)
  })

  it('is an instance of HdTypedSampledDataSource', () => {
    const ds = new HdRetainedTypedSampledDataSource(0)
    expect(ds).toBeInstanceOf(HdTypedSampledDataSource)
  })

  it('.New static factory creates the data source', () => {
    const ds = HdRetainedTypedSampledDataSource.new('catmullClark')
    expect(ds.getTypedValue(0)).toBe('catmullClark')
  })
})

// ---- HdRetainedContainerDataSource ----

describe('HdRetainedContainerDataSource.New', () => {
  it('creates a container with expected names', () => {
    const ds = HdRetainedContainerDataSource.new(
      ['a', 'b'],
      [new HdRetainedTypedSampledDataSource(1), new HdRetainedTypedSampledDataSource(2)],
    )
    const names = ds.getNames()
    expect(names).toContain('a')
    expect(names).toContain('b')
  })

  it('Get returns the correct child for a given name', () => {
    const child = new HdRetainedTypedSampledDataSource('hello')
    const ds = HdRetainedContainerDataSource.new(['greeting'], [child])
    expect(ds.Get('greeting')).toBe(child)
  })

  it('Get returns undefined for an unknown name', () => {
    const ds = HdRetainedContainerDataSource.new(['a'], [new HdRetainedTypedSampledDataSource(1)])
    expect(ds.Get('z')).toBeUndefined()
  })

  it('creates an empty container', () => {
    const ds = HdRetainedContainerDataSource.new([], [])
    expect(ds.getNames()).toHaveLength(0)
  })

  it('is an instance of HdContainerDataSource', () => {
    const ds = HdRetainedContainerDataSource.new([], [])
    expect(ds).toBeInstanceOf(HdContainerDataSource)
  })
})

// ---- HdContainerDataSource.Get (static, locator-based) ----

describe('HdContainerDataSource.Get (static locator traversal)', () => {
  // Build a two-level container: { mesh: { topology: <leaf> } }
  function buildNestedContainer() {
    const leaf = new HdRetainedTypedSampledDataSource('topology-leaf')
    const inner = HdRetainedContainerDataSource.new(['topology'], [leaf])
    const outer = HdRetainedContainerDataSource.new(['mesh'], [inner])
    return { outer, inner, leaf }
  }

  it('returns the top-level container for a 1-element locator', () => {
    const { outer, inner } = buildNestedContainer()
    const loc = new HdDataSourceLocator('mesh')
    expect(HdContainerDataSource.Get(outer, loc)).toBe(inner)
  })

  it('returns a deeply nested value for a 2-element locator', () => {
    const { outer, leaf } = buildNestedContainer()
    const loc = new HdDataSourceLocator('mesh', 'topology')
    expect(HdContainerDataSource.Get(outer, loc)).toBe(leaf)
  })

  it('returns undefined when path does not exist', () => {
    const { outer } = buildNestedContainer()
    const loc = new HdDataSourceLocator('mesh', 'nonexistent')
    expect(HdContainerDataSource.Get(outer, loc)).toBeUndefined()
  })

  it('returns undefined when intermediate node is not a container', () => {
    const { outer } = buildNestedContainer()
    // 'topology' under 'mesh' is a leaf (sampled ds), not a container
    const loc = new HdDataSourceLocator('mesh', 'topology', 'deeper')
    expect(HdContainerDataSource.Get(outer, loc)).toBeUndefined()
  })

  it('returns the root container for an empty locator', () => {
    const { outer } = buildNestedContainer()
    const loc = new HdDataSourceLocator()
    // 0 loop iterations — returns outer unchanged
    expect(HdContainerDataSource.Get(outer, loc)).toBe(outer)
  })

  it('returns undefined when container is undefined', () => {
    const loc = new HdDataSourceLocator('mesh')
    expect(HdContainerDataSource.Get(undefined, loc)).toBeUndefined()
  })
})
