// Ported from OpenUSD 26.11.1: pxr/base/vt/testenv/testVtCpp.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the VtDictionary, dictionary key-path, and recursive-over sections
// of registered pxr/base/vt/testenv/testVtCpp.cpp (testVtCpp).

import { describe, expect, it } from 'vitest'
import {
  Dictionary as VtDictionary,
  DictionaryOver as VtDictionaryOver,
  DictionaryOverRecursive as VtDictionaryOverRecursive,
  EraseValueAtPath as VtEraseValueAtPath,
  GetValueAtPath as VtGetValueAtPath,
  SetValueAtPath as VtSetValueAtPath,
  Value as VtValue,
  ValueTypes as VtValueTypes,
} from '../../src/index.ts'

const int = (value: number) => VtValue.create(value, VtValueTypes.int)
const string = (value: string) => VtValue.create(value, VtValueTypes.string)

describe('testVtCpp VtDictionary', () => {
  it('copies independently and compares by key/value', () => {
    const nested = new VtDictionary([['one', int(1)]])
    const source = new VtDictionary([
      ['one', int(1)],
      ['nested', VtValue.createDictionary(nested)],
    ])
    const copy = new VtDictionary(source)
    source.set('two', int(2))
    nested.set('two', int(2))
    expect(source.get('nested')!.Get<VtDictionary>().has('two')).toBe(false)
    expect(copy.has('two')).toBe(false)
    expect(copy.get('nested')!.Get<VtDictionary>().has('two')).toBe(false)

    const copyNested = copy.get('nested')!.Get<VtDictionary>()
    copyNested.set('three', int(3))
    expect(source.get('nested')!.Get<VtDictionary>().has('three')).toBe(false)
  })

  it('sets, gets, and erases colon-delimited key paths', () => {
    const dictionary = new VtDictionary()
    VtSetValueAtPath(dictionary, '', int(99))
    expect(dictionary.empty()).toBe(true)
    VtSetValueAtPath(dictionary, 'foo:bar:baz',
      VtValue.create(1.234, VtValueTypes.double))
    expect(dictionary.empty()).toBe(false)
    expect(dictionary.size).toBe(1)
    expect(VtGetValueAtPath(dictionary, 'foo:bar:baz')?.Get<number>()).toBe(1.234)
    expect(VtGetValueAtPath(dictionary, 'foo:bar')!
      .Get<unknown>()).toBeInstanceOf(VtDictionary)
    expect(VtGetValueAtPath(dictionary, 'foo:missing')).toBeUndefined()
    expect(VtEraseValueAtPath(dictionary, 'foo:bar:baz')).toBe(true)
    expect(VtGetValueAtPath(dictionary, 'foo:bar:baz')).toBeUndefined()
    expect(VtGetValueAtPath(dictionary, 'foo:bar')).toBeUndefined()
    expect(VtGetValueAtPath(dictionary, 'foo')).toBeUndefined()
  })

  it('prunes only ancestors emptied by the erased key path', () => {
    const dictionary = new VtDictionary()
    VtSetValueAtPath(dictionary, 'foo:bar:baz', int(1))
    VtSetValueAtPath(dictionary, 'foo:bar:qux', int(2))
    VtEraseValueAtPath(dictionary, 'foo:bar:baz')
    expect(VtGetValueAtPath(dictionary, 'foo:bar')!
      .Get<VtDictionary>().size).toBe(1)
    VtEraseValueAtPath(dictionary, 'foo:bar:qux')
    expect(VtGetValueAtPath(dictionary, 'foo:bar')).toBeUndefined()

    VtSetValueAtPath(dictionary, 'foo:bar:baz', int(1))
    VtSetValueAtPath(dictionary, 'foo:bar:qux', int(2))
    VtEraseValueAtPath(dictionary, 'foo:bar')
    expect(VtGetValueAtPath(dictionary, 'foo:bar:baz')).toBeUndefined()
    expect(VtGetValueAtPath(dictionary, 'foo:bar:qux')).toBeUndefined()
  })

  it('composes shallow and recursive dictionary opinions', () => {
    const weakSub = new VtDictionary([['weak', int(1)], ['shared', string('weak')]])
    const strongSub = new VtDictionary([['strong', int(2)], ['shared', string('strong')]])
    const weak = new VtDictionary([
      ['weakOnly', int(1)], ['sub', VtValue.createDictionary(weakSub)],
    ])
    const strong = new VtDictionary([
      ['strongOnly', int(2)], ['sub', VtValue.createDictionary(strongSub)],
    ])
    const shallowSub = VtDictionaryOver(strong, weak).get('sub')!.Get<VtDictionary>()
    expect(shallowSub.has('weak')).toBe(false)
    const recursiveSub = VtDictionaryOverRecursive(strong, weak)
      .get('sub')!.Get<VtDictionary>()
    expect(recursiveSub.get('weak')?.Get<number>()).toBe(1)
    expect(recursiveSub.get('strong')?.Get<number>()).toBe(2)
    expect(recursiveSub.get('shared')?.Get<string>()).toBe('strong')
  })
})
