// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfSpecHash.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/sdf/testenv/testSdfSpecHash.py
//
// Upstream tests that Sdf spec handles / SdfPath hash CONSISTENTLY into Python
// dicts/sets: equal specs (a spec and layer.GetObjectAtPath(spec.path)) map to
// the same dict entry, and distinct paths stay distinct. The test deliberately
// does NOT depend on the exact hash value — only on consistency.
//
// JavaScript object keys use reference identity, so Layer caches one handle per
// (layer,path), mirroring SdfLayer's identity registry. Canonical path strings
// below were captured from the live Pixar build (usd-2605).
import { describe, expect, it } from 'vitest'
import { SdfPath } from '../../src/path.ts'
import { Layer, Spec as SdfSpec } from 'typescript-usd/sdf'

describe('SdfSpecHash — path identity is a stable Map/Set key', () => {
  // Direct port of test_Basic: associate a value with a spec's path, then look it
  // up via a path re-derived from the layer 10 times and get the same value.
  // Pixar build: Sdf.PrimSpec(layer, "foo", Sdf.SpecifierOver).path.pathString == "/foo"
  it('test_Basic — dict keyed by spec path is stable across re-lookups', () => {
    const testValue = 'foo'
    const testDict = new Map<SdfSpec, string>()
    const layer = Layer.createAnonymous('spec-hash')
    layer.definePrimSpec('/foo', undefined, 'over')

    // PrimSpec(layer, "foo", over) authors a prim at "/foo".
    const primSpec = layer.getObjectAtPath('/foo')!
    expect(primSpec.getPath().pathString).toBe('/foo')

    testDict.set(primSpec, testValue)

    for (let i = 0; i < 10; i++) {
      const rederived = layer.getObjectAtPath(primSpec.getPath())!
      expect(rederived).toBe(primSpec)
      expect(testDict.get(rederived)).toBe(testValue)
    }
  })

  it('spec identity is layer plus path and resolves live fields', () => {
    const first = Layer.createAnonymous('first')
    const second = Layer.createAnonymous('second')
    first.definePrimSpec('/foo', 'Scope')
    second.definePrimSpec('/foo', 'Scope')
    const firstSpec = first.getObjectAtPath('/foo')!
    const secondSpec = second.getObjectAtPath('/foo')!

    expect(firstSpec).not.toBe(secondSpec)
    expect(firstSpec.equals(secondSpec)).toBe(false)
    firstSpec.setInfo('kind', 'component')
    expect(first.getField('/foo', 'kind')).toBe('component')
    expect(firstSpec.getInfo('kind')).toBe('component')
    // An unauthored field reads as its schema fallback (SdfSpec::GetInfo).
    expect(secondSpec.getInfo('kind')).toBe('')

    first.getRootPrims().erase('foo')
    expect(firstSpec.isDormant()).toBe(true)
    first.definePrimSpec('/foo', 'Scope')
    expect(first.getObjectAtPath('/foo')).toBe(firstSpec)
    expect(firstSpec.isDormant()).toBe(false)
  })

  // Paths built two different ways but naming the same location collapse to one
  // key — the core "equal specs hash equal" property.
  it('equal paths built different ways collapse to one entry', () => {
    const a = SdfPath.absoluteRootPath.appendChild('foo').appendChild('bar')
    const b = SdfPath.fromString('/foo/bar')
    expect(a.equals(b)).toBe(true)
    expect(a.pathString).toBe(b.pathString)

    const set = new Set<string>()
    set.add(a.pathString)
    set.add(b.pathString)
    expect(set.size).toBe(1)

    const dict = new Map<string, number>()
    dict.set(a.pathString, 1)
    dict.set(b.pathString, 2) // overwrites — same key
    expect(dict.size).toBe(1)
    expect(dict.get(a.pathString)).toBe(2)
  })

  // Distinct paths stay distinct as keys. Canonical strings captured from the
  // Pixar build (Sdf.Path(e).pathString); all 12 are distinct (12 of 12).
  it('distinct paths stay distinct as Set keys', () => {
    const examples = [
      '/foo',
      '/foo/bar',
      '/foo.attr',
      '/foo/bar.attr',
      '/foo{v=x}',
      '/foo{v=x}bar',
      '/',
      '/a',
      '/a/b',
      '/a/b/c',
      '/foo.rel[/target]',
      '.',
    ]
    // Each parses to its own canonical string (Pixar build: pathString == input).
    const keys = examples.map(e => SdfPath.fromString(e).pathString)
    for (let i = 0; i < examples.length; i++) {
      expect(keys[i]).toBe(examples[i])
    }
    const set = new Set(keys)
    expect(set.size).toBe(examples.length)

    // And as Map keys, each addresses its own slot.
    const dict = new Map<string, number>()
    keys.forEach((k, i) => dict.set(k, i))
    expect(dict.size).toBe(examples.length)
    keys.forEach((k, i) => expect(dict.get(k)).toBe(i))
  })
})
