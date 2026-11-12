// Ported from OpenUSD 26.11.1: pxr/base/vt/testenv/testVtCpp.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Applicable algorithms from OpenUSD v26.08 pxr/base/vt/testenv/testVtCpp.cpp
// (testVtCpp).
import { describe, expect, it } from 'vitest'
import { Type as TfType } from 'typescript-usd/tf'
import {
  HashValue, MutableValueRef, RegisterComposeOver, RegisterTransform,
  StreamOut, Value, ValueCanComposeOver, ValueComposeOver, ValueTryTransform,
  ValueTypeCanComposeOver, ValueTypes, ValueTryComposeOver, VisitValue,
} from '../../src/index.ts'

describe('Vt value operations', () => {
  it('hashes and streams held values', () => {
    const value = Value.create(42, ValueTypes.int)
    expect(HashValue(value)).toBe(HashValue(value))
    expect(StreamOut(value)).toBe('42')
  })
  it('dispatches compose-over by strong/weak type pair', () => {
    RegisterComposeOver(ValueTypes.int, ValueTypes.int, (stronger, weaker) =>
      Value.create(stronger.Get<number>() + weaker.Get<number>(), ValueTypes.int))
    RegisterComposeOver(ValueTypes.int, ValueTypes.string, (stronger, weaker) =>
      Value.create(
        `${stronger.Get<number>()}:${weaker.Get<string>()}`,
        ValueTypes.string,
      ))
    const one = Value.create(1, ValueTypes.int)
    const two = Value.create(2, ValueTypes.int)
    const text = Value.create('two', ValueTypes.string)
    expect(ValueTypeCanComposeOver(ValueTypes.int)).toBe(true)
    expect(one.canComposeOver()).toBe(true)
    expect(ValueCanComposeOver(one)).toBe(true)
    expect(ValueCanComposeOver(one, two)).toBe(true)
    expect(ValueCanComposeOver(one, text)).toBe(true)
    expect(ValueComposeOver(one, two).Get()).toBe(3)
    expect(ValueComposeOver(one, text).Get()).toBe('1:two')

    const unregistered = Value.create(true, ValueTypes.bool)
    expect(ValueCanComposeOver(unregistered)).toBe(false)
    expect(ValueCanComposeOver(one, unregistered)).toBe(false)
    expect(ValueTryComposeOver(one, unregistered)).toBeUndefined()
    expect(ValueComposeOver(one, unregistered).Get()).toBe(1)

    const empty = Value.getEmpty()
    expect(ValueCanComposeOver(empty)).toBe(true)
    expect(ValueCanComposeOver(empty, text)).toBe(true)
    expect(ValueTryComposeOver(empty, text)?.Get()).toBe('two')
    expect(ValueComposeOver(empty, text).Get()).toBe('two')
  })
  it('registers transform operations', () => {
    const two = Value.create(2, ValueTypes.int)
    const scaleType = TfType.define('VtTestScaleTransform')
    RegisterTransform(ValueTypes.int, scaleType, (value, scale) =>
      Number(value) * Number(scale))
    const transformed = ValueTryTransform(two, scaleType, 3)!
    expect(transformed.Get()).toBe(6)
    expect(transformed.getType()).toBe(ValueTypes.int)
  })
  it('provides value references and visitation', () => {
    const ref = new MutableValueRef(Value.create(1, ValueTypes.int))
    ref.Set(Value.create(2, ValueTypes.int))
    expect(ref.Get().Get()).toBe(2)
    expect(VisitValue(ref.Get(), held => held)).toBe(2)
  })
})
