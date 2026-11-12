// Ported from OpenUSD 26.11.1: pxr/usd/ar/testenv/testArResolvedPath.py
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Faithful 1:1 port of pxr/usd/ar/testenv/testArResolvedPath.py
//
// Python exercises ArResolvedPath via operator overloads (==, <, >, bool(),
// str(), repr(), hash()). Our value type exposes the same semantics through
// methods (equals/lt/gt/…), the `valid` getter, toString()/repr()/hash —
// each comparison is checked against both another ArResolvedPath and a raw
// string, exactly as upstream does (the C++/Python operators are defined for
// both).

import { describe, expect, it } from 'vitest'
import { ArResolvedPath } from '../../src/resolvedPath.ts'

describe('ArResolvedPath', () => {
  it('test_Basic', () => {
    // bool(Ar.ResolvedPath()) is false; empty paths compare equal and equal "".
    expect(new ArResolvedPath().valid).toBe(false)
    expect(new ArResolvedPath().equals(new ArResolvedPath(''))).toBe(true)
    expect(new ArResolvedPath().equals('')).toBe(true)

    expect(new ArResolvedPath('/foo').valid).toBe(true)
    expect(new ArResolvedPath('/foo').equals(new ArResolvedPath('/foo'))).toBe(true)
    expect(new ArResolvedPath('/foo').notEquals(new ArResolvedPath('/bar'))).toBe(true)

    // Ordering against another ArResolvedPath.
    expect(new ArResolvedPath('/foo').gt(new ArResolvedPath('/bar'))).toBe(true)
    expect(new ArResolvedPath('/foo').ge(new ArResolvedPath('/bar'))).toBe(true)
    expect(new ArResolvedPath('/foo').lt(new ArResolvedPath('/bar'))).toBe(false)
    expect(new ArResolvedPath('/foo').le(new ArResolvedPath('/bar'))).toBe(false)

    // The same comparisons against a raw string rhs.
    expect(new ArResolvedPath('/foo').equals('/foo')).toBe(true)
    expect(new ArResolvedPath('/foo').notEquals('/bar')).toBe(true)
    expect(new ArResolvedPath('/foo').gt('/bar')).toBe(true)
    expect(new ArResolvedPath('/foo').ge('/bar')).toBe(true)
    expect(new ArResolvedPath('/foo').lt('/bar')).toBe(false)
    expect(new ArResolvedPath('/foo').le('/bar')).toBe(false)

    // And with the string on the left (symmetry): "/bar" < Ar.ResolvedPath("/foo").
    expect(new ArResolvedPath('/foo').equals('/foo')).toBe(true)
    expect(new ArResolvedPath('/foo').notEquals('/bar')).toBe(true)
    // "/bar" > rp("/foo") is false  <=>  rp("/foo") >= "/bar" is true.
    expect(new ArResolvedPath('/foo').ge('/bar')).toBe(true)
    // "/bar" < rp("/foo") is true  <=>  rp("/foo") > "/bar" is true.
    expect(new ArResolvedPath('/foo').gt('/bar')).toBe(true)
  })

  it('test_GetPathString', () => {
    expect(new ArResolvedPath().getPathString()).toBe('')
    expect(new ArResolvedPath('/foo').getPathString()).toBe('/foo')
  })

  it('test_Repr', () => {
    expect(new ArResolvedPath().repr()).toBe('Ar.ResolvedPath()')
    expect(new ArResolvedPath('/foo').repr()).toBe("Ar.ResolvedPath('/foo')")
  })

  it('test_Str', () => {
    expect(new ArResolvedPath().toString()).toBe('')
    expect(new ArResolvedPath('/foo').toString()).toBe('/foo')
    expect(String(new ArResolvedPath('/foo'))).toBe('/foo')
  })

  it('test_Hash', () => {
    // Upstream only asserts these are hashable; equal paths hash equal.
    expect(new ArResolvedPath().hash).toBe(new ArResolvedPath('').hash)
    expect(new ArResolvedPath('/foo').hash).toBe(new ArResolvedPath('/foo').hash)
  })
})
