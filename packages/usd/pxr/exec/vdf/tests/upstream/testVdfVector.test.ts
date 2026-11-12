// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfVector.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfVector.cpp
//
// TF_AXIOM and ASSERT_EQ are expect() calls; WithExpectedErrors and
// WithNoExpectedErrors use a TfErrorMark as upstream. C++ types are named
// with TfType: std::string is VtValueTypes.string, int VtValueTypes.int,
// double VtValueTypes.double, bool VtValueTypes.bool; the test's own structs
// are TS classes defined with TfType by their C++ names.
//
// Element addresses: `&accessor[i]` is the (storage array, storage index)
// pair the accessor reads element i from (_Address below), the TS form of
// "stored at the same location".
//
// Out of scope (no TS counterpart):
// - TestSize asserts sizeof(VdfVector) == 40, a C++ layout fact; it has no
//   it() here.
// - TestEstimateSize's std::vector, TfSmallVector and std::shared_ptr
//   overloads of VdfEstimateSize estimate C++ containers; those cases are
//   omitted.
// - The constructor/copy/move/destructor call counts of TestStruct, A and
//   _TestMoveStruct (TestSharedVector, TestMoving,
//   TestVectorCtorDtorCalling) count C++ object lifecycle events, and the
//   moved-from state of `test1.str` (TestMoving) is a C++ move effect; those
//   asserts are omitted. The value checks of those tests are ported.

import { describe, expect, it } from 'vitest'
import { TfErrorMark, TF_FATAL_ERROR, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vdf_BoxedContainer } from '../../src/boxedContainer.ts'
import { Vdf_SetSizeof, VdfRegisterEstimateSize } from '../../src/estimateSize.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfTypedVector } from '../../src/typedVector.ts'
import { VdfVector, type VdfVectorReadAccessor, type VdfVectorReadWriteAccessor } from '../../src/vector.ts'
import { Vdf_VectorData } from '../../src/vectorData.ts'

const stringType = VtValueTypes.string
const intType = VtValueTypes.int
const doubleType = VtValueTypes.double
const boolType = VtValueTypes.bool

// Helpers for WithExpectedErrors / WithNoExpectedErrors.
function WithExpectedErrors(fn: () => void): void {
  const mark = new TfErrorMark()
  fn()
  if (mark.isClean()) {
    TF_FATAL_ERROR('Expected TfErrors but none issued')
  }
  mark.clear()
}

function WithNoExpectedErrors(fn: () => void): void {
  const mark = new TfErrorMark()
  fn()
  if (!mark.isClean()) {
    TF_FATAL_ERROR('Unexpected TfErrors issued')
  }
}

// `&accessor[i]`: the storage array and index element i is read from.
function _Address<T>(
  accessor: VdfVectorReadAccessor<T> | VdfVectorReadWriteAccessor<T>,
  i: number): [readonly T[], number] {
  return [accessor._accessor._data, accessor._accessor._storageIndex(i)]
}

function _SameAddress<T>(a: [readonly T[], number], b: [readonly T[], number]): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

function SetFromVector<T>(type: TfType, v: VdfVector, s: readonly T[], m?: VdfMask): void {
  if (!m) {
    v.resize<T>(type, s.length)
    const a = v.getReadWriteAccessor<T>(type)
    for (let i = 0; i < s.length; ++i) {
      a.Set(i, s[i]!)
    }
    return
  }
  v.resize<T>(type, m.getBits())
  const a = v.getReadWriteAccessor<T>(type)
  for (const it = m.begin(); !it.isAtEnd(); it.increment()) {
    const i = it.deref()
    a.Set(i, s[i]!)
  }
}

// C++ rand(): any non-negative int.
function rand(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

// TfStringify((double)i) for the integral doubles used below.
function TfStringifyDouble(d: number): string {
  return String(d)
}

class _SizeEstimatedStruct {
  static readonly FakeSize = 100
}
const _SizeEstimatedStructType = TfType.define('_SizeEstimatedStruct')
VdfRegisterEstimateSize(_SizeEstimatedStructType, (_v: _SizeEstimatedStruct) => _SizeEstimatedStruct.FakeSize)

class _CustomStruct {
  a = 1
  b = 2
}
const _CustomStructType = TfType.define('_CustomStruct')
// sizeof(_CustomStruct): two doubles.
Vdf_SetSizeof(_CustomStructType, 16)

class TestStruct {
  _m: number
  constructor(a = 0, b = 0) { this._m = a * b }
  Clone(): TestStruct { const c = new TestStruct(); c._m = this._m; return c }
}
const TestStructType = TfType.define('TestStruct')

class _TestMoveStruct {
  str: string | null
  constructor(cstr: string | null = null) { this.str = cstr }
}
const _TestMoveStructType = TfType.define('_TestMoveStruct')

class A {
  _m: number
  constructor(a = 0, b = 0) { this._m = a * b }
  Clone(): A { const c = new A(); c._m = this._m; return c }
  toString(): string { return String(this._m) }
}
const AType = TfType.define('A')

class _UserDefinedType {}
const _UserDefinedTypeType = TfType.define('_UserDefinedType')

const vectorOfIntType = TfType.define('std::vector<int>')

describe('testVdfVector', () => {
  it('TestEstimateSize', () => {
    const d = 13.0
    const vd = new VdfTypedVector<number>(doubleType, d)
    expect(vd.getNumStoredElements()).toBe(1)
    // sizeof(double) in the native build.
    expect(vd.estimateElementMemory()).toBe(8)

    const cs = new _CustomStruct()
    const vcs = new VdfTypedVector<_CustomStruct>(_CustomStructType, cs)
    expect(vcs.getNumStoredElements()).toBe(1)
    // sizeof(_CustomStruct) in the native build.
    expect(vcs.estimateElementMemory()).toBe(16)

    const ses = new _SizeEstimatedStruct()
    const vses = new VdfTypedVector<_SizeEstimatedStruct>(_SizeEstimatedStructType, ses)
    expect(vses.getNumStoredElements()).toBe(1)
    expect(vses.estimateElementMemory()).toBe(_SizeEstimatedStruct.FakeSize)
  })

  it('TestSingleElement', () => {
    const v = new VdfTypedVector<string>(stringType)

    expect(v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(0)
    expect(v.getNumStoredElements()).toBe(0)

    const a = 'a'
    const b = 'b'

    v.Set(a)
    expect(!v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(1)
    expect(v.getNumStoredElements()).toBe(1)
    expect(v.getReadAccessor<string>(stringType).Get(0)).toBe(a)

    v.Set(b)
    expect(!v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(1)
    expect(v.getNumStoredElements()).toBe(1)
    expect(v.getReadAccessor<string>(stringType).Get(0) !== a).toBe(true)
    expect(v.getReadAccessor<string>(stringType).Get(0)).toBe(b)

    const it = v.getIterator<string>(stringType)
    expect(!it.isAtEnd()).toBe(true)
    expect(it.deref()).toBe(b)
    it.increment()
    expect(it.isAtEnd()).toBe(true)
  })

  it('TestDenseVector', () => {
    const v = new VdfTypedVector<string>(stringType)

    expect(v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(0)

    const vec = ['a', 'b', 'c']

    SetFromVector(stringType, v, vec)
    expect(!v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(3)
    expect(v.getSize()).toBe(vec.length)
    expect(v.getNumStoredElements()).toBe(3)

    // Also test low level access via GetReadAccessor().
    expect(v.getSize()).toBe(v.getReadAccessor<string>(stringType).getNumValues())
    expect(v.IsEmpty()).toBe(v.getReadAccessor<string>(stringType).IsEmpty())

    for (let i = 0; i < v.getSize(); i++) {
      expect(v.getReadAccessor<string>(stringType).Get(i)).toBe(vec[i])
    }

    const access = v.getReadAccessor<string>(stringType)

    for (let i = 0; i < access.getNumValues(); i++) {
      expect(access.Get(i)).toBe(vec[i])
    }

    // Test vector iteration
    const it = v.getIterator<string>(stringType)
    for (let i = 0; i < vec.length; it.increment(), ++i) {
      expect(!it.isAtEnd()).toBe(true)
      expect(it.deref()).toBe(vec[i])
    }
    expect(it.isAtEnd()).toBe(true)
  })

  it('TestSparseVector', () => {
    const v = new VdfTypedVector<string>(stringType)

    expect(v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(0)

    const vec = ['a', 'b', 'c']

    const mask = new VdfMask(vec.length)
    mask.setIndex(1)

    SetFromVector(stringType, v, vec, mask)
    expect(!v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(3)
    expect(v.getSize()).toBe(vec.length)
    expect(v.getNumStoredElements()).toBe(1)

    // Also test low level access via GetReadAccessor().
    expect(v.getSize()).toBe(v.getReadAccessor<string>(stringType).getNumValues())
    expect(v.IsEmpty()).toBe(v.getReadAccessor<string>(stringType).IsEmpty())

    const access = v.getReadAccessor<string>(stringType)

    for (let i = 0; i < access.getNumValues(); i++) {
      if (i === 1) {
        expect(access.Get(i)).toBe(vec[i])
      }
    }

    // Test vector iteration
    const it = v.getIterator<string>(stringType)
    expect(!it.isAtEnd()).toBe(true)
    expect(it.deref()).toBe(vec[1])
    it.increment()
    expect(it.isAtEnd()).toBe(true)
  })

  it('TestCompressedVector', () => {
    const v = new VdfTypedVector<string>(stringType)

    expect(v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(0)
    expect(v.getNumStoredElements()).toBe(0)

    // Create a large, very sparse vector and mask to be sure to trip the
    // heuristic that decides when to use compressed vectors.
    const numElements = 1500
    const vec: string[] = []
    for (let i = 0; i < numElements; i++) {
      vec.push(TfStringifyDouble(i))
    }

    const mask = new VdfMask(vec.length)
    mask.setIndex(1)
    mask.setIndex(3)
    mask.setIndex(4)
    mask.setIndex(1499)

    const w = new VdfTypedVector<string>(stringType)
    SetFromVector(stringType, w, vec, mask)
    v.copy(w, mask)

    // Also test low level access via GetReadAccessor().
    expect(v.getSize()).toBe(numElements)
    expect(v.getNumStoredElements()).toBe(4)
    expect(!v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(v.getReadAccessor<string>(stringType).getNumValues())
    expect(v.IsEmpty()).toBe(v.getReadAccessor<string>(stringType).IsEmpty())

    const access = v.getReadAccessor<string>(stringType)

    expect(access.Get(1)).toBe(vec[1])
    expect(access.Get(3)).toBe(vec[3])
    expect(access.Get(4)).toBe(vec[4])
    expect(access.Get(1499)).toBe(vec[1499])

    // Test extracting an array from a compressed impl
    const array = v.extractAsVtArray<string>(stringType, 2, 3)
    expect(array.size).toBe(2)
    expect(array.get(0)).toBe('3')
    expect(array.get(1)).toBe('4')

    // Test vector iteration
    {
      const it = v.getIterator<string>(stringType)
      for (const s of ['1', '3', '4', '1499']) {
        expect(!it.isAtEnd()).toBe(true)
        expect(it.deref()).toBe(s)
        it.increment()
      }
      expect(it.isAtEnd()).toBe(true)
    }

    // Test AdvanceTo
    {
      const it = v.getIterator<string>(stringType)
      expect(!it.advanceTo(2)).toBe(true)
      expect(it.deref()).toBe('3')
      expect(it.advanceTo(1499)).toBe(true)
      expect(it.deref()).toBe('1499')
      expect(!it.advanceTo(1500)).toBe(true)
      expect(it.isAtEnd()).toBe(true)
    }
  })

  it('TestBoxedVector', () => {
    const emptyBoxedVec = new VdfTypedVector<number>(intType)
    emptyBoxedVec.Set(new Vdf_BoxedContainer<number>(intType))

    // A boxed vector is never empty because emptiness is based on the size,
    // which is always 1.
    expect(!emptyBoxedVec.IsEmpty()).toBe(true)
    expect(emptyBoxedVec.getSize()).toBe(1)
    expect(emptyBoxedVec.getNumStoredElements()).toBe(0)

    const boxedVec = new VdfTypedVector<number>(intType)
    const size = 10
    const source = new Vdf_BoxedContainer<number>(intType, size)
    for (let i = 0; i < size; ++i) {
      source.Set(i, i)
    }
    boxedVec.Set(source)

    expect(!boxedVec.IsEmpty()).toBe(true)
    expect(boxedVec.getSize()).toBe(1)
    expect(boxedVec.getNumStoredElements()).toBe(1)
    for (let i = 0; i < size; ++i) {
      expect(boxedVec.getReadAccessor<number>(intType).Get(i)).toBe(i)
    }
  })

  it('TestSharedVector', () => {
    // Tests for basic shared vector usage
    {
      // Non-sharable vector.
      {
        const vec = new VdfTypedVector<number>(intType)

        expect(vec.IsEmpty()).toBe(true)
        expect(vec.getSize()).toBe(0)

        const v = [1, 2, 3]

        SetFromVector(intType, vec, v)
        expect(!vec.IsEmpty()).toBe(true)
        expect(vec.getSize()).toBe(3)
        expect(vec.getSize()).toBe(v.length)
        expect(vec.getNumStoredElements()).toBe(3)

        const success = vec.share()

        expect(!success).toBe(true)

        // Nothing should change
        expect(!vec.IsEmpty()).toBe(true)
        expect(vec.getSize()).toBe(3)
        expect(vec.getSize()).toBe(v.length)
        expect(vec.getNumStoredElements()).toBe(3)

        const access0 = vec.getReadAccessor<number>(intType)
        for (let i = 0; i < access0.getNumValues(); i++) {
          expect(access0.Get(i)).toBe(v[i])
        }
      }

      // Sharable vector.
      {
        // Big enough to trip metric.
        const size = 50001
        const vec = new VdfTypedVector<number>(intType)

        const v: number[] = new Array(size)
        for (let i = 0; i < size; ++i) {
          v[i] = i
        }

        SetFromVector(intType, vec, v)
        const success = vec.share()

        expect(success).toBe(true)
        expect(vec.getSize()).toBe(v.length)

        const access0 = vec.getReadAccessor<number>(intType)
        for (let i = 0; i < access0.getNumValues(); i++) {
          expect(access0.Get(i)).toBe(v[i])
        }

        // Test Extraction
        const array = vec.extractAsVtArray<number>(intType, size, 0)

        expect(array.size).toBe(vec.getSize())
        for (let i = 0; i < access0.getNumValues(); i++) {
          expect(access0.Get(i)).toBe(array.get(i))
        }

        // Make a copy
        const copyVec = new VdfVector(vec)

        // Test read-only access of copy
        const access1 = copyVec.getReadAccessor<number>(intType)

        for (let i = 0; i < access1.getNumValues(); i++) {
          expect(access1.Get(i)).toBe(v[i])
        }

        // We expect the actual objects for shared vectors to be the same, so
        // make sure they are stored at the same locations.
        for (let i = 0; i < access0.getNumValues(); i++) {
          expect(_SameAddress(_Address(access0, i), _Address(access1, i))).toBe(true)
        }

        // Detach a copy
        const access2 = vec.getReadWriteAccessor<number>(intType)

        // Write to the detached copy and make sure shared values don't change.
        access2.Set(0, -1)
        expect(access0.Get(0)).toBe(v[0])
        expect(access1.Get(0)).toBe(v[0])
        expect(access2.Get(0) !== v[0]).toBe(true)

        // A detached vector object should not be at the same location as a
        // shared one.
        for (let i = 0; i < access1.getNumValues(); i++) {
          expect(!_SameAddress(_Address(access1, i), _Address(access2, i))).toBe(true)
        }
      }
    }

    // Test that no copying occurs when copying and extracting. (The
    // constructor/copy/destructor counts are out of scope; see the header.)
    {
      const v = new VdfTypedVector<TestStruct>(TestStructType)
      expect(v.IsEmpty()).toBe(true)
      expect(v.getSize()).toBe(0)

      SetFromVector(TestStructType, v,
        Array.from({ length: 50000 }, () => new TestStruct(2, 7)))
      expect(v.getSize()).toBe(50000)
      expect(!v.IsEmpty()).toBe(true)

      // Do the share.
      expect(v.share()).toBe(true)

      {
        // Make a copy
        const vCopy = new VdfVector(v)

        // Detach vCopy.
        vCopy.getReadWriteAccessor<TestStruct>(TestStructType)
        expect(vCopy.isShared()).toBe(false)
      }

      {
        // Make a copy
        const vCopy = new VdfVector(v)
        expect(vCopy.isShared()).toBe(true)
      }

      // Extract v.
      const array = v.extractAsVtArray<TestStruct>(TestStructType, 50000, 0)
      expect(array.size).toBe(50000)
    }

    // Tests that taking ownership over the last instance of a shared vector,
    // and then dropping that last instance, destroys the shared data.
    {
      const v = new VdfTypedVector<TestStruct>(TestStructType)
      expect(v.IsEmpty()).toBe(true)
      expect(v.getSize()).toBe(0)

      SetFromVector(TestStructType, v,
        Array.from({ length: 50000 }, () => new TestStruct(2, 7)))
      expect(v.getSize()).toBe(50000)
      expect(!v.IsEmpty()).toBe(true)

      expect(v.share()).toBe(true)
      expect(v.isShared()).toBe(true)

      // Make a copy of the shared vector. This should not make a copy of the
      // shared data.
      {
        const vCopy = new VdfVector(v)
        expect(vCopy.isShared()).toBe(true)
      }

      // When the copy of the shared vector goes out of scope, the shared data
      // should not be destructed.
      expect(v.isShared()).toBe(true)

      // Detach the last remaining instance of the shared vector by
      // constructing a read/write accessor to the data.
      v.getReadWriteAccessor<TestStruct>(TestStructType)

      // Detaching the last remaining instance above should have taken
      // ownership of the shared data, meaning it is now no longer shared.
      expect(!v.isShared()).toBe(true)
    }

    // Tests for shared vector boxed iteration
    {
      const size = 50000

      const vec = new VdfTypedVector<number>(intType)

      const source = new Vdf_BoxedContainer<number>(intType, size)
      for (let i = 0; i < size; ++i) {
        source.Set(i, i)
      }

      vec.Set(source)
      expect(vec.share()).toBe(true)

      // Direct iteration.
      {
        const accessor = vec.getReadAccessor<number>(intType)
        expect(accessor.getNumValues()).toBe(size)
        expect(accessor.isBoxed()).toBe(true)

        for (let i = 0; i < accessor.getNumValues(); ++i) {
          expect(accessor.Get(i)).toBe(source.Get(i))
        }
      }

      // Pull out TYPE* and use it as a basic array.
      {
        const accessor = vec.getReadAccessor<number>(intType)
        expect(accessor.getNumValues()).toBe(size)
        expect(accessor.isBoxed()).toBe(true)

        const [data, base] = _Address(accessor, 0)

        for (let i = 0; i < accessor.getNumValues(); ++i) {
          expect(data[base + i]).toBe(source.Get(i))
        }
      }
    }

    // Tests for shared to non-shared vector copying
    {
      const denseVector = new VdfTypedVector<number>(doubleType)
      const rawVector: number[] = []
      const numElements = 50002

      for (let i = 0; i < numElements; ++i) {
        rawVector.push(i)
      }

      SetFromVector(doubleType, denseVector, rawVector)
      denseVector.share()

      const sparseVector = new VdfTypedVector<number>(doubleType)
      const sparseMask = new VdfMask(numElements)

      // Copy a subset of the elements from a shared denseVector
      for (let i = 1; i < numElements - 1; i++) {
        sparseMask.setIndex(i)
      }
      sparseVector.copy(denseVector, sparseMask)

      expect(sparseVector.getNumStoredElements()).toBe(numElements - 2)
      expect(sparseVector.getSize()).toBe(denseVector.getSize())

      for (const it = sparseMask.begin(); !it.isAtEnd(); it.increment()) {
        const accessor = sparseVector.getReadAccessor<number>(doubleType)
        expect(accessor.Get(it.deref())).toBe(it.deref())
      }

      expect(denseVector.isShared()).toBe(true)
      expect(!sparseVector.isShared()).toBe(true)

      // Copy a single element from a shared sparse vector.
      sparseVector.share()

      const sparserVector = new VdfTypedVector<number>(doubleType)
      const singleEntryMask = new VdfMask(numElements)
      singleEntryMask.setIndex(33)

      sparserVector.copy(sparseVector, singleEntryMask)
      expect(sparserVector.getNumStoredElements()).toBe(1)
      expect(sparserVector.getSize()).toBe(sparseVector.getSize())

      // Test expected value
      {
        const accessor = sparserVector.getReadAccessor<number>(doubleType)
        expect(accessor.Get(33)).toBe(33)
      }

      expect(sparseVector.isShared()).toBe(true)
      expect(!sparserVector.isShared()).toBe(true)

      // Copy nothing from the shared denseVector
      const emptySparseVector = new VdfTypedVector<number>(doubleType)
      const emptyMask = new VdfMask(numElements)
      emptySparseVector.copy(denseVector, emptyMask)
      expect(emptySparseVector.getNumStoredElements()).toBe(0)
      expect(emptySparseVector.getSize()).toBe(denseVector.getSize())

      expect(denseVector.isShared()).toBe(true)
      expect(!emptySparseVector.isShared()).toBe(true)

      // Copy nothing from a shared sparse Vector
      emptySparseVector.copy(sparseVector, emptyMask)
      expect(emptySparseVector.getNumStoredElements()).toBe(0)
      expect(emptySparseVector.getSize()).toBe(sparseVector.getSize())
      expect(emptySparseVector.getSize()).toBe(denseVector.getSize())

      expect(sparseVector.isShared()).toBe(true)
      expect(!emptySparseVector.isShared()).toBe(true)

      // Copy discontiguous chunks from a shared dense vector to a compressed
      // sparse vector.
      const compressedVector = new VdfTypedVector<number>(doubleType)
      const discontiguousMask = new VdfMask(numElements)
      // Set three groups of ten.
      for (let i = 0; i < 10; ++i) discontiguousMask.setIndex(i)
      for (let i = 750; i < 760; ++i) discontiguousMask.setIndex(i)
      for (let i = 1400; i < 1500; ++i) discontiguousMask.setIndex(i)

      compressedVector.copy(denseVector, discontiguousMask)
      expect(compressedVector.getSize()).toBe(discontiguousMask.getSize())
      expect(compressedVector.getNumStoredElements() ===
        discontiguousMask.getNumSet()).toBe(true)

      // Test expected values
      for (const it = discontiguousMask.begin(); !it.isAtEnd(); it.increment()) {
        const accessor = compressedVector.getReadAccessor<number>(doubleType)
        expect(accessor.Get(it.deref())).toBe(it.deref())
      }

      expect(denseVector.isShared()).toBe(true)
      expect(!compressedVector.isShared()).toBe(true)
    }

    // Tests for non-shared to shared vector copying
    {
      const denseVector = new VdfTypedVector<number>(doubleType)
      const rawVector: number[] = []
      const numElements = 50000

      for (let i = 0; i < numElements; ++i) {
        rawVector.push(i)
      }

      SetFromVector(doubleType, denseVector, rawVector)

      const sparseVector = new VdfTypedVector<number>(doubleType)
      sparseVector.share()
      const sparseMask = new VdfMask(numElements)

      // Copy a subset of the elements from a denseVector
      for (let i = 1; i < numElements - 1; i++) {
        sparseMask.setIndex(i)
      }
      sparseVector.copy(denseVector, sparseMask)

      expect(sparseVector.getNumStoredElements()).toBe(numElements - 2)
      expect(sparseVector.getSize()).toBe(denseVector.getSize())

      for (const it = sparseMask.begin(); !it.isAtEnd(); it.increment()) {
        const accessor = sparseVector.getReadAccessor<number>(doubleType)
        expect(accessor.Get(it.deref())).toBe(it.deref())
      }

      expect(!denseVector.isShared()).toBe(true)
      expect(!sparseVector.isShared()).toBe(true)
    }

    // Tests for shared to shared vector copying
    {
      const denseVector = new VdfTypedVector<number>(doubleType)
      const rawVector: number[] = []
      const numElements = 50000

      for (let i = 0; i < numElements; ++i) {
        rawVector.push(i)
      }

      SetFromVector(doubleType, denseVector, rawVector)
      denseVector.share()

      const sparseVector = new VdfTypedVector<number>(doubleType)
      sparseVector.share()
      const sparseMask = new VdfMask(numElements)

      // Copy a subset of the elements from a denseVector
      for (let i = 1; i < numElements - 1; i++) {
        sparseMask.setIndex(i)
      }
      sparseVector.copy(denseVector, sparseMask)

      expect(sparseVector.getNumStoredElements()).toBe(numElements - 2)
      expect(sparseVector.getSize()).toBe(denseVector.getSize())

      for (const it = sparseMask.begin(); !it.isAtEnd(); it.increment()) {
        const accessor = sparseVector.getReadAccessor<number>(doubleType)
        expect(accessor.Get(it.deref())).toBe(it.deref())
      }

      expect(denseVector.isShared()).toBe(true)
      expect(!sparseVector.isShared()).toBe(true)
    }

    // Tests for shared vector merge
    {
      // Create the source vector and fill it with ints 0 - 49999
      const source = new VdfTypedVector<number>(intType)
      const sourceData: number[] = []
      for (let i = 0; i <= 49999; ++i) {
        sourceData.push(i)
      }

      // Create the destination vector and fill it with ints 50000-99999
      const dest = new VdfTypedVector<number>(intType)
      const destData: number[] = []
      for (let i = 50000; i <= 99999; ++i) {
        destData.push(i)
      }

      const mask = new VdfMask(50000)
      for (let i = 0; i < 50000; ++i) {
        mask.setIndex(i)
      }

      // source vector shared, dest vector is not
      {
        SetFromVector(intType, source, sourceData)
        SetFromVector(intType, dest, destData)
        source.share()

        dest.merge(source, mask)

        expect(source.isShared()).toBe(true)
        expect(!dest.isShared()).toBe(true)
      }

      // dest vector shared, source vector is not
      {
        SetFromVector(intType, source, sourceData)
        SetFromVector(intType, dest, destData)
        dest.share()

        dest.merge(source, mask)

        expect(!source.isShared()).toBe(true)
        expect(!dest.isShared()).toBe(true)
      }

      // source and dest vectors are shared
      {
        SetFromVector(intType, source, sourceData)
        SetFromVector(intType, dest, destData)
        source.share()
        dest.share()

        dest.merge(source, mask)

        expect(source.isShared()).toBe(true)
        expect(!dest.isShared()).toBe(true)
      }
    }
  })

  it('TestAssignmentOperator', () => {
    const v = new VdfTypedVector<string>(stringType)

    expect(v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(0)

    const vec = ['a', 'b', 'c']

    const mask = new VdfMask(vec.length)
    mask.setAll()

    SetFromVector(stringType, v, vec, mask)
    expect(!v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(3)
    expect(v.getSize()).toBe(vec.length)
    expect(v.getNumStoredElements()).toBe(3)

    const copyVec = new VdfTypedVector<string>(stringType)

    copyVec.assign(v)

    const access0 = v.getReadAccessor<string>(stringType)
    const access1 = copyVec.getReadAccessor<string>(stringType)

    expect(access0.getNumValues()).toBe(access1.getNumValues())

    // Make sure elements are the same, but copied.
    for (let i = 0; i < access0.getNumValues(); i++) {
      expect(access0.Get(i)).toBe(access1.Get(i))
      expect(access0.Get(i)).toBe(vec[i])

      // We expect the actual objects to be different instances, so make sure
      // they are stored at different locations.
      expect(!_SameAddress(_Address(access0, i), _Address(access1, i))).toBe(true)
    }
  })

  it('TestTyping', () => {
    // Test Holds() API
    const stringVec = new VdfTypedVector<string>(stringType)
    expect(stringVec.holds(stringType)).toBe(true)
    expect(!stringVec.holds(doubleType)).toBe(true)

    // Test boxed container cross-typing: Setting values.
    const doubleVec = new VdfTypedVector<number>(doubleType)
    doubleVec.Set(1.0)
    expect(doubleVec.holds(doubleType)).toBe(true)

    const boxed = new Vdf_BoxedContainer<number>(doubleType, 2)
    doubleVec.Set(boxed)
    expect(doubleVec.holds(doubleType)).toBe(true)

    doubleVec.Set(1.0)
    expect(doubleVec.holds(doubleType)).toBe(true)

    // Test boxed container cross-typing: Moving values.
    doubleVec.Set(boxed.moveOut())
    expect(doubleVec.holds(doubleType)).toBe(true)

    // Test boxed container cross-typing: Resizing.
    doubleVec.resize<number>(doubleType, 0)
    expect(doubleVec.holds(doubleType)).toBe(true)

    // Test boxed container cross-typing: Copying.
    const otherDoubleVec1 = new VdfTypedVector<number>(doubleType)
    otherDoubleVec1.Set(1.0)
    doubleVec.copy(otherDoubleVec1, VdfMask.allOnes(1))
    expect(doubleVec.holds(doubleType)).toBe(true)

    // Test boxed container cross-typing: Merging.
    const otherDoubleVec2 = new VdfTypedVector<number>(doubleType)
    otherDoubleVec2.Set(new Vdf_BoxedContainer<number>(doubleType, 2))
    doubleVec.merge(otherDoubleVec2, VdfMask.allOnes(1))
    expect(doubleVec.holds(doubleType)).toBe(true)

    // Test boxed container cross-typing: Assignment.
    doubleVec.assign(otherDoubleVec1)
    expect(doubleVec.holds(doubleType)).toBe(true)

    doubleVec.assign(otherDoubleVec2)
    expect(doubleVec.holds(doubleType)).toBe(true)
  })

  it('TestBoxedIteration', () => {
    // Iterate over a Vdf_BoxedContainer containing trivially copyable data.
    {
      const size = 1000

      const vec = new VdfTypedVector<number>(intType)

      const source = new Vdf_BoxedContainer<number>(intType, size)
      for (let i = 0; i < size; ++i) {
        source.Set(i, i)
      }

      vec.Set(source)

      // Direct iteration.
      {
        const accessor = vec.getReadAccessor<number>(intType)
        expect(accessor.getNumValues()).toBe(size)
        expect(accessor.isBoxed()).toBe(true)

        for (let i = 0; i < accessor.getNumValues(); ++i) {
          expect(source.Get(i)).toBe(accessor.Get(i))
        }
      }

      // Pull out TYPE* and use it as a basic array.
      {
        const accessor = vec.getReadAccessor<number>(intType)
        expect(accessor.getNumValues()).toBe(size)
        expect(accessor.isBoxed()).toBe(true)

        const [data, base] = _Address(accessor, 0)

        for (let i = 0; i < accessor.getNumValues(); ++i) {
          expect(data[base + i]).toBe(source.Get(i))
        }
      }

      // When backed by TfSmallVector<TYPE, 1>, make sure the size == 1 case
      // works.
      {
        const source = new Vdf_BoxedContainer<number>(intType, 1)
        source.Set(0, 9999)

        vec.Set(source)

        // Basic iteration
        {
          const accessor = vec.getReadAccessor<number>(intType)
          expect(accessor.getNumValues()).toBe(source.size())
          expect(accessor.isBoxed()).toBe(true)

          for (let i = 0; i < accessor.getNumValues(); ++i) {
            expect(source.Get(i)).toBe(accessor.Get(i))
          }
        }

        // Pull out TYPE* and use it as a basic array.
        {
          const accessor = vec.getReadAccessor<number>(intType)
          expect(accessor.getNumValues()).toBe(source.size())
          expect(accessor.isBoxed()).toBe(true)

          const [data, base] = _Address(accessor, 0)

          for (let i = 0; i < accessor.getNumValues(); ++i) {
            expect(data[base + i]).toBe(source.Get(i))
          }
        }
      }
    }

    // Iterating over Vdf_BoxedContainer<bool>
    {
      const vec = new VdfTypedVector<boolean>(boolType)

      const source = new Vdf_BoxedContainer<boolean>(boolType, 10)
      for (let i = 0; i < 10; ++i) {
        source.Set(i, Boolean(i))
      }

      vec.Set(source)

      // Iterate directly.
      {
        const accessor = vec.getReadAccessor<boolean>(boolType)

        expect(accessor.getNumValues()).toBe(10)
        expect(accessor.isBoxed()).toBe(true)

        for (let i = 0; i < source.size(); ++i) {
          expect(accessor.Get(i)).toBe(source.Get(i))
        }
      }
    }

    // Vectors holding vectors
    {
      const size = 1000
      const a0: number[] = new Array(1000)
      const a1: number[] = new Array(1000)
      const a2: number[] = new Array(1000)
      const a3: number[] = new Array(1000)
      const a4: number[] = new Array(1000)

      const b0 = new Vdf_BoxedContainer<number>(intType, 1000)
      const b1 = new Vdf_BoxedContainer<number>(intType, 1000)
      const b2 = new Vdf_BoxedContainer<number>(intType, 1000)
      const b3 = new Vdf_BoxedContainer<number>(intType, 1000)
      const b4 = new Vdf_BoxedContainer<number>(intType, 1000)

      for (let i = 0; i < size; ++i) {
        const val = rand()
        a0[i] = val
        a1[i] = val
        a2[i] = val
        a3[i] = val
        a4[i] = val

        const val2 = rand()
        b0.Set(i, val2)
        b1.Set(i, val2)
        b2.Set(i, val2)
        b3.Set(i, val2)
        b4.Set(i, val2)
      }

      // Vdf_BoxedContainer of std::vector
      {
        const source = new Vdf_BoxedContainer<number[]>(vectorOfIntType, 5)
        source.Set(0, a0)
        source.Set(1, a1)
        source.Set(2, a2)
        source.Set(3, a3)
        source.Set(4, a4)

        const vec = new VdfTypedVector<number[]>(vectorOfIntType)
        vec.Set(source)

        // 7a: Iterate directly
        {
          const accessor = vec.getReadAccessor<number[]>(vectorOfIntType)

          expect(accessor.getNumValues()).toBe(source.size())
          expect(accessor.isBoxed()).toBe(true)

          for (let i = 0; i < source.size(); ++i) {
            expect(accessor.Get(i).length).toBe(size)

            for (let j = 0; j < accessor.Get(i).length; ++j) {
              expect(accessor.Get(i)[j]).toBe(a0[j])
            }
          }
        }

        {
          const accessor = vec.getReadAccessor<number[]>(vectorOfIntType)

          expect(accessor.getNumValues()).toBe(source.size())
          expect(accessor.isBoxed()).toBe(true)

          const [data, base] = _Address(accessor, 0)

          for (let i = 0; i < source.size(); ++i) {
            expect(data[base + i]!.length).toBe(size)

            for (let j = 0; j < data[base + i]!.length; ++j) {
              expect(data[base + i]![j]).toBe(a0[j])
            }
          }
        }
      }
    }
  })

  it('TestCopying', () => {
    // Here we test copying from various kinds of vectors in light of subset
    // copying.
    const denseVector = new VdfTypedVector<number>(doubleType)
    const rawVector: number[] = []
    const numElements = 1500

    for (let i = 0; i < numElements; ++i) {
      rawVector.push(i)
    }

    SetFromVector(doubleType, denseVector, rawVector)

    const sparseVector = new VdfTypedVector<number>(doubleType)
    const sparseMask = new VdfMask(numElements)

    // Copy every element except the first and last.
    for (let i = 1; i < numElements - 1; i++) {
      sparseMask.setIndex(i)
    }
    sparseVector.copy(denseVector, sparseMask)

    expect(sparseVector.getNumStoredElements()).toBe(numElements - 2)
    expect(sparseVector.getSize()).toBe(denseVector.getSize())

    for (const it = sparseMask.begin(); !it.isAtEnd(); it.increment()) {
      const accessor = sparseVector.getReadAccessor<number>(doubleType)
      expect(accessor.Get(it.deref())).toBe(it.deref())
    }

    // Copy a single element from a sparse vector.
    const sparserVector = new VdfTypedVector<number>(doubleType)
    const singleEntryMask = new VdfMask(numElements)
    singleEntryMask.setIndex(33)

    sparserVector.copy(sparseVector, singleEntryMask)
    expect(sparserVector.getNumStoredElements()).toBe(1)
    expect(sparserVector.getSize()).toBe(sparseVector.getSize())

    // Test expected value
    {
      const accessor = sparserVector.getReadAccessor<number>(doubleType)
      expect(accessor.Get(33)).toBe(33)
    }

    // Copy an empty vector
    const emptyVector = new VdfTypedVector<number>(doubleType)
    const anotherEmptyVector = new VdfTypedVector<number>(doubleType)
    anotherEmptyVector.copy(emptyVector, new VdfMask(0))
    expect(anotherEmptyVector.getNumStoredElements()).toBe(0)
    expect(anotherEmptyVector.getSize()).toBe(emptyVector.getSize())

    // Copy nothing from the denseVector
    const emptySparseVector = new VdfTypedVector<number>(doubleType)
    const emptyMask = new VdfMask(numElements)
    emptySparseVector.copy(denseVector, emptyMask)
    expect(emptySparseVector.getNumStoredElements()).toBe(0)
    expect(emptySparseVector.getSize()).toBe(denseVector.getSize())

    // Copy nothing from a sparse Vector
    emptySparseVector.copy(sparseVector, emptyMask)
    expect(emptySparseVector.getNumStoredElements()).toBe(0)
    expect(emptySparseVector.getSize()).toBe(sparseVector.getSize())
    expect(emptySparseVector.getSize()).toBe(denseVector.getSize())

    // Copy discontiguous chunks from a dense vector to a compressed sparse
    // vector.
    const compressedVector = new VdfTypedVector<number>(doubleType)
    let discontiguousMask = new VdfMask(numElements)
    // Set three groups of ten.
    for (let i = 0; i < 10; ++i) discontiguousMask.setIndex(i)
    for (let i = 750; i < 760; ++i) discontiguousMask.setIndex(i)
    for (let i = 1400; i < 1500; ++i) discontiguousMask.setIndex(i)

    compressedVector.copy(denseVector, discontiguousMask)
    expect(compressedVector.getSize()).toBe(discontiguousMask.getSize())
    expect(compressedVector.getNumStoredElements() === discontiguousMask.getNumSet()).toBe(true)

    // Test expected values
    for (const it = discontiguousMask.begin(); !it.isAtEnd(); it.increment()) {
      const accessor = compressedVector.getReadAccessor<number>(doubleType)
      expect(accessor.Get(it.deref())).toBe(it.deref())
    }

    // Copy discontiguous chunks from a sparse vector to a compressed sparse
    // vector.
    discontiguousMask = new VdfMask(numElements)
    discontiguousMask.setIndex(1)
    discontiguousMask.setIndex(20)
    discontiguousMask.setIndex(40)
    discontiguousMask.setIndex(60)
    discontiguousMask.setIndex(70)
    discontiguousMask.setIndex(80)
    discontiguousMask.setIndex(1498)
    compressedVector.copy(sparseVector, discontiguousMask)
    expect(compressedVector.getSize()).toBe(discontiguousMask.getSize())
    expect(compressedVector.getNumStoredElements() === discontiguousMask.getNumSet()).toBe(true)
    // Test expected values
    for (const it = discontiguousMask.begin(); !it.isAtEnd(); it.increment()) {
      const accessor = compressedVector.getReadAccessor<number>(doubleType)
      expect(accessor.Get(it.deref())).toBe(it.deref())
    }

    // Now copy a subset of the discontiguous chunks from a compressed sparse
    // vector to another sparse vector, making sure the result is compact.
    const anotherCompressedVector = new VdfTypedVector<number>(doubleType)
    discontiguousMask = new VdfMask(numElements)
    discontiguousMask.setIndex(20)
    discontiguousMask.setIndex(40)
    discontiguousMask.setIndex(60)
    discontiguousMask.setIndex(1498)
    anotherCompressedVector.copy(compressedVector, discontiguousMask)
    expect(anotherCompressedVector.getSize()).toBe(discontiguousMask.getSize())
    expect(anotherCompressedVector.getNumStoredElements() ===
      discontiguousMask.getNumSet()).toBe(true)

    // Test expected values
    for (const it = discontiguousMask.begin(); !it.isAtEnd(); it.increment()) {
      const accessor = anotherCompressedVector.getReadAccessor<number>(doubleType)
      expect(accessor.Get(it.deref())).toBe(it.deref())
    }
  })

  it('TestMoving', () => {
    const v1 = new VdfTypedVector<_TestMoveStruct>(_TestMoveStructType)

    expect(v1.IsEmpty()).toBe(true)
    expect(v1.getSize()).toBe(0)

    const test1 = new _TestMoveStruct('TestMoving 1')
    v1.Set(test1)

    expect(!v1.IsEmpty()).toBe(true)
    expect(v1.getSize()).toBe(1)

    const a1 = v1.getReadAccessor<_TestMoveStruct>(_TestMoveStructType)
    expect(a1.Get(0).str).toBeTruthy()
    expect(a1.Get(0).str).toBe('TestMoving 1')

    const test2 = new _TestMoveStruct('TestMoving 2')

    v1.Set(test2)

    expect(!v1.IsEmpty()).toBe(true)
    expect(v1.getSize()).toBe(1)

    const a2 = v1.getReadAccessor<_TestMoveStruct>(_TestMoveStructType)
    expect(a2.Get(0).str).toBeTruthy()
    expect(a2.Get(0).str).toBe('TestMoving 2')

    const test3 = new Vdf_BoxedContainer<number>(intType, 100)
    for (let i = 0; i < test3.size(); ++i) {
      test3.Set(i, 1)
    }
    expect(test3.size()).toBe(100)

    const v2 = new VdfTypedVector<number>(intType)
    v2.Set(test3.moveOut())

    expect(!v2.IsEmpty()).toBe(true)
    expect(v2.getSize()).toBe(1)

    const a3 = v2.getReadAccessor<number>(intType)
    expect(a3.getNumValues()).toBe(100)
    for (let i = 0; i < a3.getNumValues(); ++i) {
      expect(a3.Get(i)).toBe(1)
    }

    expect(test3.size()).toBe(0)
  })

  it('TestSet', () => {
    const empty: number[] = []
    const zeroMask = new VdfMask(0)
    const emptyVector = new VdfTypedVector<number>(doubleType)
    SetFromVector(doubleType, emptyVector, empty, zeroMask)

    expect(emptyVector.getSize()).toBe(0)

    const numElements = 10
    const allOnes = VdfMask.allOnes(numElements)
    const allZeros = new VdfMask(numElements)

    const full = new Array<number>(numElements).fill(0.1)
    const fullVector = new VdfTypedVector<number>(doubleType)
    SetFromVector(doubleType, fullVector, full, allOnes)

    expect(fullVector.getSize()).toBe(numElements)

    SetFromVector(doubleType, fullVector, full, allZeros)
    expect(fullVector.getSize()).toBe(numElements)
  })

  it('TestVectorCtorDtorCalling', () => {
    // Dense vector
    {
      const v = new VdfTypedVector<A>(AType)

      expect(v.IsEmpty()).toBe(true)
      expect(v.getSize()).toBe(0)

      SetFromVector(AType, v, Array.from({ length: 3 }, () => new A(2, 7)))
      expect(v.getSize()).toBe(3)
      expect(!v.IsEmpty()).toBe(true)

      for (let i = 0; i < v.getSize(); i++) {
        expect(v.getReadAccessor<A>(AType).Get(i)._m).toBe(14)
      }
    }

    // Sparse vector
    {
      const v = new VdfTypedVector<A>(AType)

      expect(v.IsEmpty()).toBe(true)
      expect(v.getSize()).toBe(0)

      const mask = new VdfMask(3)
      mask.setIndex(1)

      SetFromVector(AType, v, Array.from({ length: 3 }, () => new A(2, 7)), mask)
      expect(v.getSize()).toBe(3)
      expect(!v.IsEmpty()).toBe(true)

      for (let i = 0; i < v.getSize(); i++) {
        if (mask.getBits().isSet(i)) {
          expect(v.getReadAccessor<A>(AType).Get(i)._m).toBe(14)
        }
      }
    }
  })

  it('TestVectorResize', () => {
    const v = new VdfTypedVector<string>(stringType)

    expect(v.IsEmpty()).toBe(true)
    expect(v.getSize()).toBe(0)

    v.resize<string>(stringType, VdfMask.allOnes(10).getBits())
    expect(v.getSize()).toBe(10)
    expect(!v.IsEmpty()).toBe(true)

    for (let i = 0; i < v.getSize(); i++) {
      expect(v.getReadAccessor<string>(stringType).Get(i)).toBe('')
    }

    const mask = new VdfMask(10)
    mask.setIndex(2)
    mask.setIndex(7)

    v.resize<string>(stringType, mask.getBits())
    expect(v.getSize()).toBe(10)
    // The resulting vector is sparse, rather than compressed!
    expect(v.getNumStoredElements()).toBe(6)
    expect(!v.IsEmpty()).toBe(true)

    for (let i = 0; i < v.getSize(); i++) {
      if (mask.getBits().isSet(i)) {
        expect(v.getReadAccessor<string>(stringType).Get(i)).toBe('')
      }
    }

    // Test resize works when using boxed containers.

    const vec = new VdfTypedVector<number>(intType)
    expect(vec.IsEmpty()).toBe(true)
    expect(vec.getSize()).toBe(0)
    expect(vec.getReadAccessor<number>(intType).getNumValues()).toBe(0)
    vec.Set(new Vdf_BoxedContainer<number>(intType))
    expect(!vec.IsEmpty()).toBe(true)
    expect(vec.getSize()).toBe(1)
    expect(vec.getReadAccessor<number>(intType).getNumValues()).toBe(0)
    WithNoExpectedErrors(() => { vec.resize<number>(intType, 10) })
    expect(!vec.IsEmpty()).toBe(true)
    expect(vec.getSize()).toBe(10)
    expect(vec.getReadAccessor<number>(intType).getNumValues()).toBe(10)

    const vec2 = new VdfTypedVector<number>(intType)
    vec2.Set(new Vdf_BoxedContainer<number>(intType))
    WithNoExpectedErrors(() => {
      vec.resize<number>(intType, VdfMask.allOnes(10).getBits())
    })
    expect(!vec.IsEmpty()).toBe(true)
    expect(vec.getSize()).toBe(10)
    expect(vec.getReadAccessor<number>(intType).getNumValues()).toBe(10)
  })

  it('TestVectorMerge', () => {
    // Create the source vector and fill it with integer data 0 - 9
    const source = new VdfTypedVector<number>(intType)
    const sourceData: number[] = []
    for (let i = 0; i <= 9; ++i) {
      sourceData.push(i)
    }
    SetFromVector(intType, source, sourceData)

    // Create the destination vector and fill it with integer data 10 - 19
    const dest = new VdfTypedVector<number>(intType)
    const destData: number[] = []
    for (let i = 10; i <= 19; ++i) {
      destData.push(i)
    }
    SetFromVector(intType, dest, destData)

    // Now, merge some source data into the destination data
    // Mask contains: 0-2-4-6-8
    const mask = new VdfMask(10)
    for (let i = 0; i < 10; i += 2) {
      mask.setIndex(i)
    }
    dest.merge(source, mask)

    // Verify the new contents of dest
    for (let i = 0; i < 10; ++i) {
      if (mask.isSet(i)) {
        expect(dest.getReadAccessor<number>(intType).Get(i)).toBe(i)
      } else {
        expect(dest.getReadAccessor<number>(intType).Get(i)).toBe(i + 10)
      }
    }

    // Invert the mask
    const invMask = new VdfMask(mask)
    invMask.xorAssign(VdfMask.allOnes(10))

    // Merge the rest of the data
    dest.merge(source, invMask)

    // Verify
    for (let i = 0; i < 10; ++i) {
      expect(dest.getReadAccessor<number>(intType).Get(i)).toBe(i)
    }

    // Create a source and destination vector containing a single element and
    // attempt to merge them.
    const singleSource = new VdfTypedVector<number>(intType)
    singleSource.Set(1)

    const singleDest = new VdfTypedVector<number>(intType)
    singleDest.Set(2)

    // Merge nothing
    singleDest.merge(singleSource, new VdfMask(1))

    // Verify
    expect(singleDest.getReadAccessor<number>(intType).Get(0)).toBe(2)

    // Merge
    singleDest.merge(singleSource, VdfMask.allOnes(1))
    expect(singleDest.getReadAccessor<number>(intType).Get(0)).toBe(1)

    // Self-merging should be handled gracefully (nothing to do)
    WithExpectedErrors(() => {
      singleDest.merge(singleDest, VdfMask.allOnes(1))
    })
    expect(singleDest.getReadAccessor<number>(intType).Get(0)).toBe(1)

    // Create an empty source and destination vector and attempt to merge
    // them. This should be handled gracefully.
    const emptySource = new VdfTypedVector<number>(intType)
    const emptyDest = new VdfTypedVector<number>(intType)
    emptyDest.merge(emptySource, new VdfMask(0))

    // Try merging into a sparse vector
    const sparseSource = new VdfTypedVector<number>(intType)
    let sparseMask = new VdfMask(10)
    sparseMask.setIndex(2)
    sparseMask.setIndex(3)
    sparseMask.setIndex(4)

    const sourceRand = rand()
    const sparseSourceData: number[] = []
    sparseSourceData.push(rand())
    sparseSourceData.push(rand())
    sparseSourceData.push(sourceRand + 0)
    sparseSourceData.push(sourceRand + 1)
    sparseSourceData.push(sourceRand + 2)
    sparseSourceData.push(rand())
    sparseSourceData.push(rand())
    sparseSourceData.push(rand())
    sparseSourceData.push(rand())
    sparseSourceData.push(rand())
    SetFromVector(intType, sparseSource, sparseSourceData, sparseMask)
    expect(sparseSource.getSize() > sparseSource.getNumStoredElements()).toBe(true)

    const sparseDest = new VdfTypedVector<number>(intType)
    const invSparseMask = new VdfMask(10)
    invSparseMask.setIndex(6)
    invSparseMask.setIndex(7)
    invSparseMask.setIndex(8)

    const destRand = rand()
    const sparseDestData: number[] = []
    sparseDestData.push(rand())
    sparseDestData.push(rand())
    sparseDestData.push(rand())
    sparseDestData.push(rand())
    sparseDestData.push(rand())
    sparseDestData.push(rand())
    sparseDestData.push(destRand + 0)
    sparseDestData.push(destRand + 1)
    sparseDestData.push(destRand + 2)
    sparseDestData.push(rand())
    SetFromVector(intType, sparseDest, sparseDestData, invSparseMask)
    expect(sparseDest.getSize() > sparseDest.getNumStoredElements()).toBe(true)

    // This operation will force an expansion of the data storage provided by
    // the sparse destination vector.
    sparseDest.merge(sparseSource, sparseMask)

    // Verify
    let sourceI = 0
    let destI = 0
    expect(sparseDest.getNumStoredElements()).toBe(7)
    expect(sparseDest.getSize()).toBe(10)
    for (let i = 0; i < sparseMask.getSize(); ++i) {
      if (sparseMask.isSet(i)) {
        expect(sparseDest.getReadAccessor<number>(intType).Get(i) ===
          (sourceRand + sourceI)).toBe(true)
        ++sourceI
      } else if (invSparseMask.isSet(i)) {
        expect(sparseDest.getReadAccessor<number>(intType).Get(i) ===
          (destRand + destI)).toBe(true)
        ++destI
      }
    }

    // Try merging a subset into a bigger sparse vector. No re-allocation
    // will be required.
    sparseMask = new VdfMask(6)
    sparseMask.setIndex(0)
    sparseMask.setIndex(1)
    sparseMask.setIndex(2)
    SetFromVector(intType, sparseSource, new Array<number>(6).fill(1), sparseMask)
    expect(sparseSource.getSize() > sparseSource.getNumStoredElements()).toBe(true)

    const sparseDest2 = new VdfTypedVector<number>(intType)
    const sparseMask2 = new VdfMask(6)
    sparseMask2.setIndex(0)
    sparseMask2.setIndex(1)
    sparseMask2.setIndex(2)
    sparseMask2.setIndex(3)
    SetFromVector(intType, sparseDest2, new Array<number>(6).fill(3), sparseMask2)
    expect(sparseDest2.getSize() > sparseDest2.getNumStoredElements()).toBe(true)

    // Merge
    sparseDest2.merge(sparseSource, sparseMask)

    // Verify
    expect(sparseDest2.getNumStoredElements()).toBe(4)
    expect(sparseDest2.getNumStoredElements()).toBe(sparseMask2.getNumSet())
    expect(sparseDest2.getSize()).toBe(6)
    for (let i = 0; i < sparseMask2.getNumSet(); ++i) {
      if (sparseMask.isSet(i)) {
        expect(sparseDest2.getReadAccessor<number>(intType).Get(i)).toBe(1)
      } else {
        expect(sparseDest2.getReadAccessor<number>(intType).Get(i)).toBe(3)
      }
    }

    // Make the destination vector dense
    SetFromVector(intType, sparseDest, new Array<number>(6).fill(2))

    // Test merging from a sparse source
    sparseDest.merge(sparseSource, sparseMask)

    // Verify
    for (let i = 0; i < 6; ++i) {
      if (sparseMask.isSet(i)) {
        expect(sparseDest.getReadAccessor<number>(intType).Get(i)).toBe(1)
      } else {
        expect(sparseDest.getReadAccessor<number>(intType).Get(i)).toBe(2)
      }
    }

    // Try merging into a compressed vector. This will promote the compressed
    // vector to a sparse vector.
    const numElements = 1500
    const compressedSource = new VdfTypedVector<number>(intType)
    const compressedSourceMask = new VdfMask(numElements)
    compressedSourceMask.setIndex(1)
    compressedSourceMask.setIndex(1499)
    SetFromVector(intType, compressedSource,
      new Array<number>(numElements).fill(1), compressedSourceMask)
    expect(compressedSource.getSize() > compressedSource.getNumStoredElements()).toBe(true)
    expect(Vdf_VectorData.shouldStoreCompressed(
      compressedSourceMask.getBits(), /* sizeof(int) */ 4)).toBe(true)

    const compressedDest = new VdfTypedVector<number>(intType)
    const compressedDestMask = new VdfMask(numElements)
    compressedDestMask.setIndex(2)
    compressedDestMask.setIndex(1498)
    SetFromVector(intType, compressedDest,
      new Array<number>(numElements).fill(2), compressedDestMask)
    expect(compressedDest.getSize() > compressedDest.getNumStoredElements()).toBe(true)
    expect(Vdf_VectorData.shouldStoreCompressed(
      compressedDestMask.getBits(), /* sizeof(int) */ 4)).toBe(true)

    // Merge
    compressedDest.merge(compressedSource, compressedSourceMask)

    // Verify
    expect(compressedDest.getNumStoredElements()).toBe(1499)
    expect(compressedDest.getSize()).toBe(1500)
    for (const it = compressedSourceMask.begin(); !it.isAtEnd(); it.increment()) {
      expect(compressedDest.getReadAccessor<number>(intType).Get(it.deref())).toBe(1)
    }
    for (const it = compressedDestMask.begin(); !it.isAtEnd(); it.increment()) {
      expect(compressedDest.getReadAccessor<number>(intType).Get(it.deref())).toBe(2)
    }

    // Make the destination vector dense
    SetFromVector(intType, compressedDest, new Array<number>(numElements).fill(2))

    // Test merging from a compressed source
    compressedDest.merge(compressedSource, compressedSourceMask)

    // Verify
    for (let i = 0; i < 6; ++i) {
      if (compressedSourceMask.isSet(i)) {
        expect(compressedDest.getReadAccessor<number>(intType).Get(i)).toBe(1)
      } else {
        expect(compressedDest.getReadAccessor<number>(intType).Get(i)).toBe(2)
      }
    }
  })

  it('TestDebugPrint', () => {
    const empty = new VdfTypedVector<number>(intType)

    expect(String(empty.getDebugPrintable(new VdfMask()))).toBe('')

    const single = new VdfTypedVector<number>(intType, 13)

    expect(String(single.getDebugPrintable(VdfMask.allOnes(1)))).toBe('0: 13\n')

    // Upstream streams this case without checking the result.
    String(single.getDebugPrintable(VdfMask.allZeros(1)))

    const data = [0, 1, 2, 3, 4, 5]
    const dense = new VdfTypedVector<number>(intType)
    SetFromVector(intType, dense, data, VdfMask.allOnes(data.length))

    expect(String(dense.getDebugPrintable(VdfMask.allOnes(data.length))))
      .toBe('0: 0\n1: 1\n2: 2\n3: 3\n4: 4\n5: 5\n')

    expect(String(dense.getDebugPrintable(VdfMask.allZeros(data.length)))).toBe('')

    {
      const mask = new VdfMask(data.length)
      mask.setIndex(1)
      mask.setIndex(4)

      expect(String(dense.getDebugPrintable(mask))).toBe('1: 1\n4: 4\n')
    }

    const sparseMask = new VdfMask(data.length)
    sparseMask.setIndex(1)
    sparseMask.setIndex(2)
    sparseMask.setIndex(3)
    sparseMask.setIndex(4)

    const sparse = new VdfTypedVector<number>(intType)
    SetFromVector(intType, sparse, data, sparseMask)

    expect(String(sparse.getDebugPrintable(sparseMask))).toBe('1: 1\n2: 2\n3: 3\n4: 4\n')

    expect(String(sparse.getDebugPrintable(VdfMask.allZeros(data.length)))).toBe('')

    {
      sparseMask.clearIndex(1)
      sparseMask.clearIndex(4)

      expect(String(sparse.getDebugPrintable(sparseMask))).toBe('2: 2\n3: 3\n')
    }

    {
      const instance = new _UserDefinedType()
      const vec = new VdfTypedVector<_UserDefinedType>(_UserDefinedTypeType, instance)

      expect(String(vec.getDebugPrintable(VdfMask.allOnes(1)))).toBe('(_UserDefinedType)\n')
    }
  })

  it('TestConstructWithSize', () => {
    {
      const empty = VdfTypedVector.createWithSize<number>(intType, 0)
      expect(empty.holds(intType)).toBe(true)
      expect(empty.IsEmpty()).toBe(true)
    }

    {
      const single = VdfTypedVector.createWithSize<number>(intType, 1)
      expect(single.holds(intType)).toBe(true)
      expect(single.getSize()).toBe(1)
    }

    {
      const many = VdfTypedVector.createWithSize<number>(intType, 3)
      expect(many.holds(intType)).toBe(true)
      expect(many.getSize()).toBe(3)
    }
  })

  it('TestClear', () => {
    {
      const empty = VdfTypedVector.createWithSize<number>(intType, 0)
      empty.clear()
      expect(empty.holds(intType)).toBe(true)
      expect(empty.IsEmpty()).toBe(true)
    }

    {
      const single = VdfTypedVector.createWithSize<number>(intType, 1)
      single.clear()
      expect(single.holds(intType)).toBe(true)
      expect(single.getSize()).toBe(0)
    }

    {
      const many = VdfTypedVector.createWithSize<number>(intType, 3)
      many.clear()
      expect(many.holds(intType)).toBe(true)
      expect(many.getSize()).toBe(0)
    }
  })
})
