// Ported from OpenUSD 26.11.1: pxr/base/vt/testenv/testVtArrayEdit.cpp,
//  pxr/base/vt/testenv/testVtCpp.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Additional runtime-surface cases from the registered OpenUSD v26.08
// pxr/base/vt/testenv/testVtCpp.cpp (testVtCpp) and
// testVtArrayEdit.cpp (testVtArrayEditCpp). The native v26.08 executables are
// the live oracle; both print "Test SUCCEEDED" for this configured tranche.
import { describe, expect, it } from 'vitest'
import { Type as TfType } from 'typescript-usd/tf'
import {
  Array as VtArray,
  ArrayEdit as VtArrayEdit,
  ArrayEditBuilder as VtArrayEditBuilder,
  Background as VtBackground,
  Default as VtDefault,
  Dictionary as VtDictionary,
  DictionaryHash as VtDictionaryHash,
  ErasedProxyHoldsType as VtErasedProxyHoldsType,
  GetKnownValueTypeIndex as VtGetKnownValueTypeIndex,
  GetNumKnownValueTypes as VtGetNumKnownValueTypes,
  GetProxiedObject as VtGetProxiedObject,
  HashValue as VtHashValue,
  MutableValueRef as VtMutableValueRef,
  RegisterTransform as VtRegisterTransform,
  RegisterTransformNoArrays as VtRegisterTransformNoArrays,
  Value as VtValue,
  ValueCanTransform as VtValueCanTransform,
  ValueTryTransform as VtValueTryTransform,
  ValueTypes as VtValueTypes,
  VisitValueWithExtTypes as VtVisitValueWithExtTypes,
  Zero as VtZero,
  _ArrayEditOps as Vt_ArrayEditOps,
  _ArrayEditOpsBuilder as Vt_ArrayEditOpsBuilder,
  _ShapeData as Vt_ShapeData,
} from '../../src/index.ts'

describe('testVtCpp value-type runtime surface', () => {
  it('exposes known-type indexing and value initialization', () => {
    expect(VtGetNumKnownValueTypes()).toBe(Object.keys(VtValueTypes).length)
    expect(VtGetKnownValueTypeIndex(VtValueTypes.int)).toBeGreaterThanOrEqual(0)
    expect(VtZero(VtValueTypes.bool)).toBe(false)
    expect(VtZero(VtValueTypes.string)).toBe('')
  })

  it('provides vector-compatible array capacity, views, shape, and swap', () => {
    const lhs = new VtArray([1, 2, 3], VtValueTypes.int)
    const rhs = new VtArray([9], VtValueTypes.int)
    lhs.reserve(16)
    expect(lhs.capacity()).toBe(16)
    expect(lhs.asConst()).toBe(lhs)
    const copy = new VtArray(lhs)
    expect(lhs.isIdentical(copy)).toBe(true)
    expect(copy.makeUnique()).toBe(true)
    expect(lhs.isIdentical(copy)).toBe(false)
    expect(copy.makeUnique()).toBe(false)
    expect(copy.equals(lhs)).toBe(true)
    expect([...lhs.rbegin()]).toEqual([3, 2, 1])
    expect(lhs._getShapeData().getRank()).toBe(1)
    lhs.swap(rhs)
    expect(lhs.equals([9])).toBe(true)
    expect(rhs.equals([1, 2, 3])).toBe(true)
  })

  it('provides map-compatible dictionary operations and member key paths', () => {
    const dictionary = new VtDictionary()
    const one = VtValue.create(1, VtValueTypes.int)
    expect(dictionary.insert(['one', one])).toEqual(['one', true])
    expect(dictionary.insert(['one', one])).toEqual(['one', false])
    expect(dictionary.count('one')).toBe(1)
    dictionary.SetValueAtPath('nested:value', one)
    expect(dictionary.GetValueAtPath('nested:value')?.Get()).toBe(1)
    expect(dictionary.EraseValueAtPath('nested:value')).toBe(true)
    const dictionaryHash = new VtDictionaryHash()
    expect(dictionaryHash.call(dictionary)).toBe(dictionaryHash.call(dictionary))
    expect(VtDefault.hold(7).val).toBe(7)
  })

  it('supports casts, ownership transfer, mutable refs, and proxy access', () => {
    VtValue.registerSimpleBidirectionalCast(
      VtValueTypes.int, VtValueTypes.string, String, Number,
    )
    const value = VtValue.create(42, VtValueTypes.int)
    expect(value.canCastToTypeid(VtValueTypes.string)).toBe(true)
    expect(value.castToTypeid(VtValueTypes.string).Get()).toBe('42')
    VtValue.registerCast(VtValueTypes.int, VtValueTypes.bool, source =>
      VtValue.create(source.Get<number>() !== 0, VtValueTypes.bool))
    expect(value.castToTypeid(VtValueTypes.bool).Get()).toBe(true)
    expect(value.getHash()).toBe(VtHashValue(value))
    const ref = new VtMutableValueRef(value)
    expect(ref.getTypeid()).toBe(VtValueTypes.int)
    expect(ref.GetKnownValueTypeIndex()).toBe(VtGetKnownValueTypeIndex(VtValueTypes.int))
    ref.uncheckedAssign(VtValue.create(9, VtValueTypes.int))
    expect(ref.UncheckedGet<number>()).toBe(9)
    expect(VtGetProxiedObject({ GetProxiedObject: () => 11 })).toBe(11)
    const erased = { getProxiedVtValue: () => value }
    expect(VtErasedProxyHoldsType(erased, VtValueTypes.int)).toBe(true)
    expect(VtValue.take('owned', VtValueTypes.string).remove<string>()).toBe('owned')
  })
})

describe('testVtArrayEditCpp serialization and operation stream', () => {
  it('round-trips edit serialization and preserves composition', () => {
    const edit = new VtArrayEditBuilder<number>().prepend(1).append(3)
      .finalizeAndReset()
    const data = VtArrayEditBuilder.getSerializationData(edit)
    const restored = VtArrayEditBuilder.createFromSerializationData<number>(data)
    expect(restored.composeOver([2])).toEqual([1, 2, 3])
    expect(restored.getLiterals()).toEqual([1, 3])
    expect(restored.streamCustom()).toContain('insert')
  })

  it('validates and walks the compact operation representation', () => {
    const builder = new Vt_ArrayEditOpsBuilder()
    builder.addOp(4, 2)
    const ops = new Vt_ArrayEditOps(builder.instructions)
    const visited: number[] = []
    ops.forEach((op) => visited.push(op))
    expect(visited).toEqual([4])
    expect(Vt_ArrayEditOps.isValidOp(9)).toBe(true)
    expect(Vt_ArrayEditOps.isValidOp(10)).toBe(false)
    expect(new Vt_ShapeData(6, [2]).getRank()).toBe(2)
  })

  it('dispatches transforms and extended visitors', () => {
    const scaleType = TfType.define('VtSurfaceScaleTransform')
    VtRegisterTransform(VtValueTypes.int, scaleType, (held, scale) =>
      Number(held) * Number(scale))
    const value = VtValue.create(3, VtValueTypes.int)
    expect(value.canTransform()).toBe(true)
    const transformed = VtValueTryTransform(value, scaleType, 4)!
    expect(transformed.Get()).toBe(12)
    expect(transformed.getType()).toBe(VtValueTypes.int)

    const arrayValue = VtValue.createArray(
      new VtArray([1, 2], VtValueTypes.int),
    )
    const transformedArray = VtValueTryTransform(arrayValue, scaleType, 4)!
    expect(transformedArray.Get<VtArray<number>>().toArray()).toEqual([4, 8])
    expect(transformedArray.getType()).toBe(arrayValue.getType())

    const edit = new VtArrayEditBuilder<number>().append(2).finalizeAndReset()
    const editValue = VtValue.createArrayEdit(edit, VtValueTypes.int)
    const transformedEdit = VtValueTryTransform(editValue, scaleType, 4)!
    expect(transformedEdit.Get<VtArrayEdit<number>>().getLiterals()).toEqual([8])
    expect(transformedEdit.getType()).toBe(editValue.getType())

    const offsetType = TfType.define('VtSurfaceOffsetTransform')
    VtRegisterTransformNoArrays(VtValueTypes.int, offsetType, (held, offset) =>
      Number(held) + Number(offset))
    expect(VtValueCanTransform(value, offsetType)).toBe(true)
    expect(VtValueCanTransform(arrayValue, offsetType)).toBe(false)
    expect(VtVisitValueWithExtTypes.VisitValue(value, held => held)).toBe(3)
    expect(VtBackground).toBeDefined()
  })
})
