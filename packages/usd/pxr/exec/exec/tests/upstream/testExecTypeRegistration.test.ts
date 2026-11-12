// Ported from OpenUSD 26.11.1:
//  pxr/exec/exec/testenv/testExecTypeRegistration.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/testenv/testExecTypeRegistration.cpp
//
// C++ value types are TfTypes defined by name (port convention 4.1); the
// test's struct types are JS classes registered under their C++ names.
// `ASSERT_EQ(a, b)` on Gf and Sdf values compares with their `equals`.
// `TfType::Find<VtArray<T>>()` is the `<T>[]` TfType VtValue.CreateArray uses.

import { describe, expect, it } from 'vitest'
import { TfErrorMark, TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec3d as GfVec3d } from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { VdfMask } from 'typescript-usd/vdf'
import { VdfTypedVector } from 'typescript-usd/vdf'
import { ExecTypeRegistry } from '../../src/typeRegistry.ts'

// A type that supports the minimum requirements to be an input value from
// external clients, a computation result type and a result value returned to
// external clients.
class TestExecTypeRegistrationValue {
  equals(other: unknown): boolean {
    return other instanceof TestExecTypeRegistrationValue
  }
}
const TestExecTypeRegistrationValueType = TfType.define('TestExecTypeRegistrationValue')

// A type that is not registered with the execution type registry.
let TestExecTypeRegistrationUnregisteredType = TfType.getUnknownType()

// TF_REGISTRY_FUNCTION(TfType)
TfRegistryManager.add('TfType', () => {
  TestExecTypeRegistrationUnregisteredType = TfType.define('TestExecTypeRegistrationUnregistered')
})
TfRegistryManager.GetInstance().subscribeTo('TfType')

const arrayType = (elementType: TfType): TfType =>
  TfType.declare(`${elementType.getTypeName()}[]`)
const SdfAssetPathType = TfType.findByName('SdfAssetPath')

describe('testExecTypeRegistration', () => {
  it('TestBasicRegistration', () => {
    const reg = ExecTypeRegistry.GetInstance()

    ExecTypeRegistry.registerType(
      TestExecTypeRegistrationValueType, new TestExecTypeRegistrationValue())
    reg.checkForRegistration(TestExecTypeRegistrationValueType)

    // Test registration of allowed pointer types.

    // using ConstRefPtr = TfRefPtr<const RefPointable>;
    const ConstRefPtrType = TfType.define('TfRefPtr<const RefPointable>')
    // using ConstSharedPtr = std::shared_ptr<const S>;
    const ConstSharedPtrType = TfType.define('std::shared_ptr<const S>')

    ExecTypeRegistry.registerType(ConstRefPtrType, null)
    ExecTypeRegistry.registerType(ConstSharedPtrType, null)
  })

  it('TestCreateVector', () => {
    const reg = ExecTypeRegistry.GetInstance()

    // GfVec3d is both a Vt known value type and an Sdf value type.
    {
      const point = new GfVec3d(1, 2, 3)
      const vec = reg.createVector(VtValue.create(point, VtValueTypes.GfVec3d))
      expect(vec.holds(VtValueTypes.GfVec3d)).toBe(true)
      const accessor = vec.getReadAccessor<GfVec3d>(VtValueTypes.GfVec3d)
      expect(accessor.getNumValues()).toBe(1)
      expect(accessor.Get(0).equals(point)).toBe(true)
    }

    // VtArray<GfVec3d> is both a Vt known value type and an Sdf value type.
    {
      const points = new VtArray<GfVec3d>([
        new GfVec3d(0., 0., 0.),
        new GfVec3d(1., 0., 0.),
        new GfVec3d(2., 0., 0.),
        new GfVec3d(3., 0., 0.),
        new GfVec3d(4., 0., 0.),
        new GfVec3d(5., 0., 0.),
      ], VtValueTypes.GfVec3d)
      const vec = reg.createVector(VtValue.createArray(points))
      expect(vec.holds(VtValueTypes.GfVec3d)).toBe(true)
      const accessor = vec.getReadAccessor<GfVec3d>(VtValueTypes.GfVec3d)
      expect(accessor.getNumValues()).toBe(6)
      for (let i = 0; i < 6; ++i) {
        expect(accessor.Get(i).equals(points.get(i))).toBe(true)
      }
    }

    // short is known to Vt but is not an Sdf value type.
    {
      const x = 3
      const vec = reg.createVector(VtValue.create(x, VtValueTypes.short))
      expect(vec.holds(VtValueTypes.short)).toBe(true)
      const accessor = vec.getReadAccessor<number>(VtValueTypes.short)
      expect(accessor.getNumValues()).toBe(1)
      expect(accessor.Get(0)).toBe(x)
    }

    // VtArray<short> is known to Vt but is not an Sdf value type.
    {
      const arr = new VtArray<number>([0, 1], VtValueTypes.short)
      const vec = reg.createVector(VtValue.createArray(arr))
      expect(vec.holds(VtValueTypes.short)).toBe(true)
      const accessor = vec.getReadAccessor<number>(VtValueTypes.short)
      expect(accessor.getNumValues()).toBe(2)
      expect(accessor.Get(0)).toBe(arr.get(0))
      expect(accessor.Get(1)).toBe(arr.get(1))
    }

    // SdfAssetPath is not known to Vt but is an Sdf value type.
    {
      const ap = new SdfAssetPath('/Some/Where')
      const vec = reg.createVector(VtValue.create(ap, SdfAssetPathType))
      expect(vec.holds(SdfAssetPathType)).toBe(true)
      const accessor = vec.getReadAccessor<SdfAssetPath>(SdfAssetPathType)
      expect(accessor.getNumValues()).toBe(1)
      expect(accessor.Get(0).equals(ap)).toBe(true)
    }

    // VtArray<SdfAssetPath> is not known to Vt but is an Sdf value type.
    {
      const aps = new VtArray<SdfAssetPath>([
        new SdfAssetPath('/Some'),
        new SdfAssetPath('/Where'),
      ], SdfAssetPathType)
      const vec = reg.createVector(VtValue.createArray(aps))
      expect(vec.holds(SdfAssetPathType)).toBe(true)
      const accessor = vec.getReadAccessor<SdfAssetPath>(SdfAssetPathType)
      expect(accessor.getNumValues()).toBe(2)
      expect(accessor.Get(0).equals(aps.get(0))).toBe(true)
      expect(accessor.Get(1).equals(aps.get(1))).toBe(true)
    }

    // TestExecTypeRegistrationValue is not known to Vt and is not an Sdf
    // value type.
    {
      const val = new TestExecTypeRegistrationValue()
      const vec = reg.createVector(VtValue.create(val, TestExecTypeRegistrationValueType))
      expect(vec.holds(TestExecTypeRegistrationValueType)).toBe(true)
      const accessor = vec.getReadAccessor<TestExecTypeRegistrationValue>(
        TestExecTypeRegistrationValueType)
      expect(accessor.getNumValues()).toBe(1)
      expect(accessor.Get(0).equals(new TestExecTypeRegistrationValue())).toBe(true)
    }
  })

  it('TestExtractValue', () => {
    const reg = ExecTypeRegistry.GetInstance()

    // Get the extractors for GfVec3d and VtArray<GfVec3d>.
    const vec3dExtractor = reg.getExtractor(VtValueTypes.GfVec3d)
    const vec3dArrayExtractor = reg.getExtractor(arrayType(VtValueTypes.GfVec3d))
    expect(vec3dExtractor.asBool()).toBe(true)
    expect(vec3dArrayExtractor.asBool()).toBe(true)

    // Construct a vector of one element and a vector of many (three)
    // elements.
    const single = new VdfTypedVector<GfVec3d>(VtValueTypes.GfVec3d, new GfVec3d(-1.))
    const many = (() => {
      const len = 3
      const vec = VdfTypedVector.createWithSize<GfVec3d>(VtValueTypes.GfVec3d, len)
      const accessor = vec.getReadWriteAccessor<GfVec3d>(VtValueTypes.GfVec3d)
      for (let i = 0; i < len; ++i) {
        accessor.Set(i, new GfVec3d(-1. * i))
      }
      return vec
    })()

    const singleMask = VdfMask.allOnes(1)
    const manyMask = VdfMask.allOnes(many.getSize())

    // Test extracting a value from a vector of length 1 into VtValue as a
    // scalar.
    {
      const val = vec3dExtractor.call(single, singleMask)
      expect(val.IsHolding(VtValueTypes.GfVec3d)).toBe(true)
      const vec = val.UncheckedGet<GfVec3d>()
      expect(vec.equals(new GfVec3d(-1.))).toBe(true)
    }

    // Test extracting a value from a vector of length 1 into VtValue as an
    // array.
    {
      const val = vec3dArrayExtractor.call(single, singleMask)
      expect(val.IsHolding(arrayType(VtValueTypes.GfVec3d))).toBe(true)
      const arr = val.UncheckedGet<VtArray<GfVec3d>>()
      expect(arr.get(0).equals(new GfVec3d(-1.))).toBe(true)
    }

    // Test extracting a value from a vector of length 3 into VtValue as an
    // array.
    {
      const val = vec3dArrayExtractor.call(many, manyMask)
      expect(val.IsHolding(arrayType(VtValueTypes.GfVec3d))).toBe(true)
      const arr = val.UncheckedGet<VtArray<GfVec3d>>()
      expect(arr.get(0).equals(new GfVec3d(-0.))).toBe(true)
      expect(arr.get(1).equals(new GfVec3d(-1.))).toBe(true)
      expect(arr.get(2).equals(new GfVec3d(-2.))).toBe(true)
    }

    // Test extracting a single value from a vector of length 3 into a VtValue
    // as a scalar.
    {
      const mask = new VdfMask(many.getSize())
      mask.setIndex(1)
      const val = vec3dExtractor.call(many, mask)
      expect(val.IsHolding(VtValueTypes.GfVec3d)).toBe(true)
      const vec = val.UncheckedGet<GfVec3d>()
      expect(vec.equals(new GfVec3d(-1.))).toBe(true)
    }

    // Test looking up an extractor for the unknown type.
    {
      const m = new TfErrorMark()
      const unknownExtractor = reg.getExtractor(TfType.getUnknownType())
      expect(m.isClean()).toBe(false)
      m.clear()
      expect(unknownExtractor.asBool()).toBe(false)
      m.dispose()
    }

    // Test looking up an extractor for a type that is known to TfType
    // but is not an execution type.
    {
      const t = TestExecTypeRegistrationUnregisteredType
      expect(t.isUnknown()).toBe(false)

      const m = new TfErrorMark()
      const invalidExtractor = reg.getExtractor(t)
      expect(m.isClean()).toBe(false)
      m.clear()
      expect(invalidExtractor.asBool()).toBe(false)
      m.dispose()
    }
  })
})
