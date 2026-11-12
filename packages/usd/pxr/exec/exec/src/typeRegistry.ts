// Ported from OpenUSD 26.11.1: pxr/exec/exec/typeRegistry.cpp,
//  pxr/exec/exec/typeRegistry.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/typeRegistry.h and typeRegistry.cpp.
//
// C++ dispatches on the value type at compile time (RegisterType<T>,
// CheckForRegistration<T>, _CreateVector<T>, _MakeExtractorFunction<T>); here
// the type is a TfType argument (port convention 4.1). An array value type
// VtArray<T> is the `<T>[]` TfType VtValue.CreateArray gives it
// (base/vt/src/value.ts), and its elements are of type T.

import {
  TF_CODING_ERROR, TF_FATAL_ERROR, TF_VERIFY, TfRegistryManager, TfSingleton,
  Type as TfType, type TfCompressedBits,
} from 'typescript-usd/tf'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  Duration as GfDuration, Matrix2d as GfMatrix2d, Matrix3d as GfMatrix3d,
  Matrix4d as GfMatrix4d, Quatd as GfQuatd, Quatf as GfQuatf, Quath as GfQuath,
  Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2h as GfVec2h, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3h as GfVec3h, Vec3i as GfVec3i,
  Vec4d as GfVec4d, Vec4f as GfVec4f, Vec4h as GfVec4h, Vec4i as GfVec4i,
} from 'typescript-usd/gf'
import {
  AssetPath as SdfAssetPath, OpaqueValue as SdfOpaqueValue,
  PathExpression as SdfPathExpression,
} from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { EfTime, EfTimeType } from 'typescript-usd/ef'
import { Vdf_BoxedContainer } from 'typescript-usd/vdf'
import { VdfExecutionTypeRegistry } from 'typescript-usd/vdf'
import { VdfTypedVector } from 'typescript-usd/vdf'
import type { VdfVector } from 'typescript-usd/vdf'
import { Exec_ValueExtractor } from './valueExtractor.ts'
import type { Exec_ValueExtractorFunction } from './valueExtractorFunction.ts'

/**
 * The TfType of SdfPath (port convention 4.1). Defining by name is
 * idempotent; pxr/usd/sdf/src/path.ts does not yet export SdfPathType.
 */
export const SdfPathType: TfType = TfType.define('SdfPath')

/**
 * The array TfType VtValue.CreateArray gives VtArray<elementType>, defined
 * as TfType::Find<VtArray<T>>() is for the VtArray types Vt instantiates
 * (VtValue.CreateArray only declares it).
 */
function _ArrayType(elementType: TfType): TfType {
  return TfType.define(`${elementType.getTypeName()}[]`)
}

/** VtIsArray<T>: whether `type` is an array value type; its element type. */
function _ArrayElementType(type: TfType): TfType | null {
  const name = type.getTypeName()
  return name.endsWith('[]') ? TfType.findByName(name.slice(0, -2)) : null
}

const _vtKnownScalarTypes = new Set<TfType>(Object.values(VtValueTypes))

/**
 * VtIsKnownValueType<T>() (vt/types.h:209-262): the builtin Vt value types
 * and their arrays.
 */
function _IsVtKnownValueType(type: TfType): boolean {
  if (_vtKnownScalarTypes.has(type)) return true
  const elementType = _ArrayElementType(type)
  return elementType !== null && _vtKnownScalarTypes.has(elementType)
}

// Sdf's TfTypes for the value types that are not builtin Vt types, as
// pxr/usd/sdf/src/parserHelpers.ts names them (SDF_TF_TYPES); Define is
// idempotent by name.
const _SdfTimeCodeType = TfType.define('SdfTimeCode')
const _SdfAssetPathType = TfType.define('SdfAssetPath')
const _SdfOpaqueValueType = TfType.define('SdfOpaqueValue')
const _SdfPathExpressionType = TfType.define('SdfPathExpression')

/**
 * SDF_VALUE_TYPES (sdf/types.h:341-379) with the default value of each
 * type's SdfValueTypeName (schema.cpp:464-532,
 * SdfSchema::FindType(type).GetDefaultValue()). The TS SdfValueTypeName does
 * not carry default values, so they are constructed here as schema.cpp
 * constructs them, in Sdf's TS value representations.
 */
function _SdfValueTypesAndDefaults(): Array<[TfType, () => unknown]> {
  const T = VtValueTypes
  return [
    // _SDF_SCALAR_VALUE_TYPES (types.h:341-357)
    [T.bool, () => false],
    [T.uchar, () => 0],
    [T.int, () => 0],
    [T.uint, () => 0],
    [T.int64, () => 0],
    [T.uint64, () => 0],
    [T.half, () => 0],
    [T.float, () => 0],
    [T.double, () => 0],
    [_SdfTimeCodeType, () => 0],
    [T.GfDuration, () => new GfDuration()],
    [T.string, () => ''],
    [T.token, () => ''],
    [_SdfAssetPathType, () => new SdfAssetPath()],
    [_SdfOpaqueValueType, () => new SdfOpaqueValue()],
    [_SdfPathExpressionType, () => new SdfPathExpression()],
    // _SDF_DIMENSIONED_VALUE_TYPES (types.h:359-377)
    [T.GfMatrix2d, () => new GfMatrix2d(1)],
    [T.GfMatrix3d, () => new GfMatrix3d(1)],
    [T.GfMatrix4d, () => new GfMatrix4d(1)],
    [T.GfQuath, () => new GfQuath(1)],
    [T.GfQuatf, () => new GfQuatf(1)],
    [T.GfQuatd, () => new GfQuatd(1)],
    [T.GfVec2i, () => new GfVec2i(0)],
    [T.GfVec2h, () => new GfVec2h(0)],
    [T.GfVec2f, () => new GfVec2f(0)],
    [T.GfVec2d, () => new GfVec2d(0)],
    [T.GfVec3i, () => new GfVec3i(0)],
    [T.GfVec3h, () => new GfVec3h(0)],
    [T.GfVec3f, () => new GfVec3f(0)],
    [T.GfVec3d, () => new GfVec3d(0)],
    [T.GfVec4i, () => new GfVec4i(0)],
    [T.GfVec4h, () => new GfVec4h(0)],
    [T.GfVec4f, () => new GfVec4f(0)],
    [T.GfVec4d, () => new GfVec4d(0)],
  ]
}

const _singleton = new TfSingleton<ExecTypeRegistry>(
  () => new ExecTypeRegistry(_constructionToken))
const _constructionToken = Symbol('ExecTypeRegistry')

/**
 * Singleton used to register and access value types used by exec
 * computations (typeRegistry.h:35-269).
 *
 * Value types that are used for exec computation input and output values
 * must be registered with this registry. The registry is initialized with all
 * value types that Sdf suports for attribute and metadata values.
 */
export class ExecTypeRegistry {
  // VdfTypeDispatchTable<_CreateVector> (typeRegistry.h:247): the
  // registered value types that are not known to Vt.
  readonly #createVector = new Set<TfType>()

  // Type-erased conversions from VdfVector to VtValue (typeRegistry.h:249-264).
  // The key is the type held in the resulting VtValue; there are separate
  // extractors for T and VtArray<T> but both accept VdfVectors holding T.
  readonly #extractors = new Map<TfType, Exec_ValueExtractor>()

  /** typeRegistry.cpp:46-77. Only TfSingleton can create instances. */
  constructor(token: symbol) {
    if (token !== _constructionToken) {
      throw new TypeError('ExecTypeRegistry is a singleton; use GetInstance()')
    }

    // Ensure that USD value types are registered before subscribing to our
    // registry function so that plugin type registration cannot override the
    // schema fallback value.
    //
    // _EXEC_REGISTER_VALUE_TYPE (typeRegistry.cpp:57-68): the schema default
    // value, and an empty VtArray of the type.
    for (const [type, makeDefault] of _SdfValueTypesAndDefaults()) {
      const def = VtValue.create(makeDefault(), type)
      if (TF_VERIFY(def.IsHolding(type), 'def.IsHolding<ValueType>()')) {
        const value = def.UncheckedGet<unknown>()
        this._registerType(type, value)
        this._registerType(_ArrayType(type), new VtArray<unknown>([], type))
      }
    }

    this._registerType(EfTimeType, new EfTime())
    this._registerType(SdfPathType, SdfPath.emptyPath)
    this._registerType(_ArrayType(SdfPathType), new VtArray<SdfPath>([], SdfPathType))

    _singleton.setInstanceConstructed(this)
    TfRegistryManager.GetInstance().subscribeTo('ExecTypeRegistry')
  }

  /**
   * Provides access to the singleton instance, first ensuring it is
   * constructed (typeRegistry.cpp:34-38).
   */
  static GetInstance(): ExecTypeRegistry {
    return _singleton.GetInstance()
  }

  /** Provides access for registration of types only (typeRegistry.cpp:40-44). */
  static _getInstanceForRegistration(): ExecTypeRegistry {
    return _singleton.GetInstance()
  }

  /**
   * Registers `type` as a type that exec computations can use for input and
   * output values, with the fallback value `fallback`
   * (typeRegistry.h:267-293).
   *
   * In any circumstance that requires an arbitrary value of type `type`,
   * `fallback` will be used. All types that can be used to author attribute
   * and metadata values in USD are available by default; user-defined types
   * must be registered using this function. If a type is registered more
   * than once, all calls must specify the same fallback.
   *
   * Upstream rejects VtArray types at compile time (static_assert,
   * typeRegistry.h:288-290); here that is a coding error.
   */
  static registerType(type: TfType, fallback: unknown): void {
    if (_ArrayElementType(type) !== null) {
      TF_CODING_ERROR('VtArray is not a supported execution value type.')
      return
    }
    ExecTypeRegistry._getInstanceForRegistration()._registerType(type, fallback)
  }

  /**
   * Confirms that `type` has been registered (typeRegistry.h:110-122).
   *
   * If it has been registered with the ExecTypeRegistry, the type is
   * returned. If it has not been registered, a fatal error is emitted.
   */
  checkForRegistration(type: TfType): TfType {
    return VdfExecutionTypeRegistry.checkForRegistration(type,
      'Use ExecTypeRegistry::RegisterType<T>() to register execution ' +
      'value types.')
  }

  /**
   * Construct a VdfVector whose value is copied from `value`
   * (typeRegistry.cpp:81-100).
   */
  createVector(value: VtValue): VdfVector {
    // VtVisitValue: Vt's known value types are handled directly; any other
    // type goes through the type dispatch table, which is a fatal error for
    // types that were never registered (typeDispatchTable.cpp:47-60).
    const type = value.getType()
    if (!_IsVtKnownValueType(type) && !this.#createVector.has(type)) {
      TF_FATAL_ERROR('Unsupported type: ' + type.getTypeName())
    }
    return ExecTypeRegistry._createVector(type, value.UncheckedGet<unknown>())
  }

  /**
   * Returns an extractor that produces a VtValue from values held in
   * execution (typeRegistry.cpp:102-119).
   *
   * Note that `type` is the type that should be held in the VtValue
   * extraction result. This is distinct from the execution data-flow type.
   */
  getExtractor(type: TfType): Exec_ValueExtractor {
    const it = this.#extractors.get(type)
    if (it !== undefined) {
      return it
    }

    // We could check for an unknown type before looking up in extractors but
    // finding a known type is the expected case so we always do that first.
    if (!type.isUnknown()) {
      TF_CODING_ERROR(`No extractor found for type '${type.getTypeName()}'`)
    } else {
      TF_CODING_ERROR('No extractor found for unknown type')
    }
    return new Exec_ValueExtractor()
  }

  /** typeRegistry.h:296-308 */
  _registerType(type: TfType, fallback: unknown): void {
    const definedType = VdfExecutionTypeRegistry.define(type, fallback)

    // CreateVector has internal handling for value types known to Vt so we do
    // not need to register them here.
    if (!_IsVtKnownValueType(type)) {
      this.#createVector.add(type)
    }

    this._registerExtractor(definedType, ExecTypeRegistry._makeExtractorFunction(type))
  }

  /**
   * Typed implementation of CreateVector (typeRegistry.h:310-329,
   * _CreateVector<T>::Create). A VtArray<T> value becomes a boxed VdfVector
   * of T elements.
   */
  static _createVector(type: TfType, value: unknown): VdfVector {
    const elementType = _ArrayElementType(type)
    if (elementType === null) {
      const v = new VdfTypedVector<unknown>(type)
      v.Set(value)
      return v
    }

    const array = value as VtArray<unknown>
    const size = array.size
    const execValue = new Vdf_BoxedContainer<unknown>(elementType, size)
    for (let i = 0; i < size; ++i) {
      execValue.Set(i, array.get(i))
    }
    const v = new VdfTypedVector<unknown>(elementType)
    v.Set(execValue)
    return v
  }

  /**
   * Returns the appropriate value extractor for `type`
   * (typeRegistry.h:331-366). When `type` is a VtArray type, the returned
   * extractor expects a VdfVector holding its elements as its input.
   */
  static _makeExtractorFunction(type: TfType): Exec_ValueExtractorFunction {
    const elementType = _ArrayElementType(type)
    if (elementType === null) {
      return (v: VdfVector, mask: TfCompressedBits): VtValue => {
        const access = v.getReadAccessor<unknown>(type)
        if (access.IsEmpty()) {
          return VtValue.getEmpty()
        }
        if (!TF_VERIFY(mask.getNumSet() === 1, 'mask.GetNumSet() == 1')) {
          return VtValue.getEmpty()
        }
        const offset = mask.getFirstSet()
        return VtValue.create(access.Get(offset), type)
      }
    }

    return (v: VdfVector, mask: TfCompressedBits): VtValue => {
      if (!TF_VERIFY(mask.areContiguouslySet(), 'mask.AreContiguouslySet()')) {
        return VtValue.getEmpty()
      }
      const access = v.getReadAccessor<unknown>(elementType)
      const offset = mask.getFirstSet()
      const numValues = access.isBoxed()
        ? access.getNumValues()
        : mask.getNumSet()
      return VtValue.createArray(v.extractAsVtArray<unknown>(elementType, numValues, offset))
    }
  }

  /**
   * Specify that values of `type` should be extracted using `extractor`
   * (typeRegistry.cpp:121-126). Like tbb::concurrent_unordered_map::emplace,
   * the first registration wins.
   */
  _registerExtractor(type: TfType, extractor: Exec_ValueExtractorFunction): void {
    if (!this.#extractors.has(type)) {
      this.#extractors.set(type, new Exec_ValueExtractor(extractor))
    }
  }
}
