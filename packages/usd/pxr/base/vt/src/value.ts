// Ported from OpenUSD 26.11.1: pxr/base/vt/value.cpp, pxr/base/vt/value.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// VtValue — faithful-but-idiomatic port of pxr/base/vt/value.h.
//
// A type-erased value holder. Upstream VtValue type-erases a statically-typed
// C++ value and carries its type via typeid (-> TfType). TS is already
// dynamically typed, BUT the JS runtime erases the USD type DISTINCTIONS that
// matter: int/float/double/half are all `number`, string/token are both
// `string`. So a faithful VtValue pairs the JS value with an explicit TfType
// tag (value.GetType()), which is exactly what the JS value alone cannot carry.
//
// Tagging by TfType (not a bare type-name string) matches upstream's GetType()
// and makes VtValue the first real consumer of typescript-usd/tf's TfType registry.
//
// The C++ proxy/erased-proxy holds and small-object inline storage optimization
// are private representation mechanics. Public hold/extract/type/array,
// numeric cast, and dictionary semantics are represented here.

import { Tf_HashState, Type as TfType } from 'typescript-usd/tf'
import { VtArray, Vt_HashAppendHeld } from './array.ts'
import { VtArrayEdit } from './arrayEdit.ts'
import { VtValueTypes } from './types.ts'
import { VtDictionary } from './dictionary.ts'
import { VtValueRef } from './valueRef.ts'
import { VtValueTypeCanComposeOver } from './valueComposeOver.ts'
import { _VtValueTypeCanTransform } from './valueTransform.ts'
import { _MatrixBase as GfMatrixBase, _QuatBase as GfQuatBase, _VecBase as GfVecBase } from 'typescript-usd/gf'
import {
  Vt_GetTypeInfo, Vt_NotArray, Vt_ObjectEqual, Vt_SetGenericTypeInfos, Vt_SetTypeInfo, type Vt_TypeInfo,
} from './typeInfo.ts'

const simpleCasts = new Map<TfType, Map<TfType, (value: unknown) => unknown>>()
const valueCasts = new Map<TfType, Map<TfType, (value: VtValue) => VtValue>>()

// ---- Per-type operations (value.h _TypeInfo; see typeInfo.ts) ----------

const notArray = Vt_NotArray
const objectEqual = Vt_ObjectEqual

function sameValue(left: unknown, right: unknown): boolean { return left === right }

function copyListElement(element: unknown): unknown {
  return element instanceof VtValue ? _copyVtValue(element) : copyHeldValue(element)
}

// Any other object: its Clone(), else its copy constructor, else itself.
function copyObject(value: unknown): unknown {
  const clone = (value as { Clone?: () => unknown }).Clone
  if (typeof clone === 'function') return clone.call(value)
  const ctor = (value as {
    constructor?: new (source: unknown) => unknown
  }).constructor
  if (typeof ctor === 'function') {
    try {
      return new ctor(value)
    } catch {
      // Unknown extension value types may not expose their C++ copy constructor
      // in JavaScript. Their registration adapter owns that value-copy seam.
    }
  }
  return value
}

const primitiveInfo: Vt_TypeInfo = { kind: 'primitive', copy: value => value, equal: sameValue, ...notArray }
const objectInfo: Vt_TypeInfo = { kind: 'object', copy: copyObject, equal: objectEqual, ...notArray }
Vt_SetGenericTypeInfos({
  primitive: primitiveInfo,
  object: objectInfo,
  list: {
    kind: 'list', copy: value => (value as unknown[]).map(copyListElement), equal: objectEqual, ...notArray,
  },
  // `new Object(o)` returns `o` itself, so copy plain records by entry.
  record: {
    kind: 'record',
    copy: value => Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, copyHeldValue(v)])),
    equal: objectEqual,
    ...notArray,
  },
})
Vt_SetTypeInfo(VtArray.prototype, {
  kind: 'array',
  copy: value => (value as VtArray<unknown>).Clone(),
  equal: objectEqual,
  isArray: true,
  arraySize: value => (value as VtArray<unknown>).size,
  elementType: value => (value as VtArray<unknown>).getElementType(),
})
Vt_SetTypeInfo(VtArrayEdit.prototype, {
  kind: 'arrayEdit',
  copy: value => new VtArrayEdit((value as VtArrayEdit<unknown>)._serialization()),
  equal: objectEqual,
  ...notArray,
})
const gfInfo: Vt_TypeInfo = { ...objectInfo, kind: 'gf' }
for (const base of [GfVecBase, GfMatrixBase, GfQuatBase]) Vt_SetTypeInfo(base.prototype, gfInfo)

/** A value copy of a held value, as VtValue's copy constructor makes. */
export function copyHeldValue(value: unknown): unknown {
  return Vt_GetTypeInfo(value).copy(value)
}

const integralRanges = new Map<string, readonly [number, number]>([
  ['uchar', [0, 255]],
  ['short', [-32768, 32767]],
  ['ushort', [0, 65535]],
  ['int', [-2147483648, 2147483647]],
  ['uint', [0, 4294967295]],
  ['int64', [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]],
  ['uint64', [0, Number.MAX_SAFE_INTEGER]],
])

const numericTypes = new Set([
  ...integralRanges.keys(), 'half', 'float', 'double',
])

// What the built-in casts need to know of a type, found once per TfType
// rather than by comparing type names on every cast.
interface Vt_CastTypeInfo {
  readonly name: string
  readonly numeric: boolean
  readonly textual: boolean // token or string
  readonly range: readonly [number, number] | undefined
}
const castTypeInfos = new Map<TfType, Vt_CastTypeInfo>()
function castTypeInfo(type: TfType): Vt_CastTypeInfo {
  let info = castTypeInfos.get(type)
  if (info === undefined) {
    const name = type.getTypeName()
    info = {
      name, numeric: numericTypes.has(name), textual: name === 'token' || name === 'string',
      range: integralRanges.get(name),
    }
    castTypeInfos.set(type, info)
  }
  return info
}

function castValue(value: unknown, source: TfType, target: TfType): unknown {
  if (source === target) return value
  const registered = simpleCasts.get(source)?.get(target)
  if (registered) return registered(value)
  const from = castTypeInfo(source), to = castTypeInfo(target)
  if (from.textual && to.textual && from.name !== to.name) return value
  if (!from.numeric || !to.numeric || typeof value !== 'number') {
    return undefined
  }
  if (to.name === 'double') return value
  if (to.name === 'float') return Math.fround(value)
  if (to.name === 'half') {
    // GfHalf overflow behavior is infinity. The actual half representation is
    // private to the substrate; the held JS number preserves its value role.
    if (value > 65504) return Infinity
    if (value < -65504) return -Infinity
    return value
  }
  const range = to.range!
  if (!Number.isFinite(value)) return undefined
  const truncated = Math.trunc(value)
  return truncated >= range[0] && truncated <= range[1] ? truncated : undefined
}

// The count of VtValues sharing one held object (value.h:98-123 _Counted<T>).
// JavaScript cannot see a copy's destruction, so a count only falls when a
// sharer detaches, is removed or is destroyed explicitly; a count above one
// may therefore overstate sharing, which costs a copy but never correctness.
//
// Upstream hands out the held object as const (Get) and copies a shared one
// before handing it out mutable (_GetMutableObj). JavaScript cannot hand out
// a const reference, so every accessor here is the mutable kind: it detaches
// a shared object first and marks the object escaped, and a VtValue whose
// object has escaped is copied eagerly, as the caller may still edit it.
interface Vt_SharedCount { count: number }

let shareVtValue: (source: VtValue) => VtValue

export class VtValue {
  #value: unknown
  // The held value's per-type operations (value.h:1521 _info), looked up
  // whenever #value is given a value of another kind.
  #info: Vt_TypeInfo
  #type: TfType
  #elementType: TfType | undefined
  #shared: Vt_SharedCount | undefined
  #escaped = false

  static {
    // VtValue copy construction shares a remotely stored object
    // (value.h:743-770 _RemoteTypeInfo); the first mutable access of a shared
    // object copies it (_GetMutableObj, value.h:757-762).
    shareVtValue = source => {
      if (source.#escaped) {
        return new VtValue(source.#info.copy(source.#value), source.#type, source.#elementType)
      }
      const copy = new VtValue(source.#value, source.#type, source.#elementType)
      if (source.#value !== null && typeof source.#value === 'object') {
        source.#shared ??= { count: 1 }
        source.#shared.count++
        copy.#shared = source.#shared
      }
      return copy
    }
  }

  #makeMutable(): void {
    const shared = this.#shared
    if (!shared) return
    this.#shared = undefined
    if (shared.count > 1) {
      shared.count--
      this.#value = this.#info.copy(this.#value)
    }
  }

  // The held object for a caller, who may edit it.
  #handOut<T>(): T {
    this.#makeMutable()
    this.#escaped = true
    return this.#value as T
  }

  #release(): void {
    if (this.#shared) this.#shared.count--
    this.#shared = undefined
  }

  private constructor(value: unknown, type: TfType, elementType?: TfType) {
    this.#value = value
    this.#info = Vt_GetTypeInfo(value)
    this.#type = type
    this.#elementType = elementType
  }

  // ---- Construction ---------------------------------------------------------

  /** An empty (typeless) value. Mirrors a default-constructed VtValue. */
  static getEmpty(): VtValue {
    return new VtValue(undefined, TfType.getUnknownType())
  }

  /** Hold `value` tagged with USD type `type` (e.g. VtValueTypes.double). */
  static create(value: unknown, type: TfType): VtValue {
    return new VtValue(copyHeldValue(value), type)
  }

  /**
   * Hold a VtArray (array-valued). The value's type is the synthesized
   * `<element>[]` TfType; GetElementType() reports the element type.
   */
  static createArray<T>(array: VtArray<T>): VtValue {
    const elem = array.getElementType()
    const arrayType = TfType.declare(`${elem.getTypeName()}[]`)
    return new VtValue(array.Clone(), arrayType, elem)
  }

  /** Type-explicit counterpart of constructing VtValue(VtArrayEdit<T>). */
  static createArrayEdit<T>(edit: VtArrayEdit<T>, elementType: TfType): VtValue {
    const editType = TfType.declare(`${elementType.getTypeName()}ArrayEdit`)
    return new VtValue(
      new VtArrayEdit(edit._serialization()), editType, elementType,
    )
  }

  static createDictionary(dictionary: VtDictionary): VtValue {
    return new VtValue(new VtDictionary(dictionary), VtValueTypes.dictionary)
  }

  /** Whether this value can be converted to `target` by Vt's registered casts. */
  canCast(target: TfType): boolean {
    if (this.IsEmpty()) return false
    return valueCasts.get(this.#type)?.has(target) === true ||
      castValue(this.#value, this.#type, target) !== undefined
  }

  /**
   * Convert to `target`, returning an empty value on failure.
   * Ports VtValue::CastToTypeid's observable result without exposing RTTI.
   */
  castToType(target: TfType): VtValue {
    if (this.IsEmpty()) return VtValue.getEmpty()
    const registered = valueCasts.get(this.#type)?.get(target)
    if (registered) return registered(_copyVtValue(this))
    const cast = castValue(this.#value, this.#type, target)
    return cast === undefined ? VtValue.getEmpty() : VtValue.create(cast, target)
  }

  /** Convert `value` to the type held by `typeSource`. */
  static castToTypeOf(value: VtValue, typeSource: VtValue): VtValue {
    return typeSource.IsEmpty() ? VtValue.getEmpty() :
      value.castToType(typeSource.getType())
  }

  static canCastFromTypeidToTypeid(source: TfType, target: TfType): boolean {
    if (source === target || simpleCasts.get(source)?.has(target) ||
        valueCasts.get(source)?.has(target)) return true
    const from = castTypeInfo(source), to = castTypeInfo(target)
    return from.numeric && to.numeric || from.textual && to.textual && from.name !== to.name
  }
  canCastToTypeid(target: TfType): boolean { return this.canCast(target) }
  canCastToTypeOf(typeSource: VtValue): boolean {
    return !typeSource.IsEmpty() && this.canCast(typeSource.getType())
  }
  castToTypeid(target: TfType): VtValue { return this.castToType(target) }
  cast(target: TfType): VtValue { return this.castToType(target) }
  static cast(value: VtValue, target: TfType): VtValue {
    return value.castToType(target)
  }
  static registerSimpleCast(
    source: TfType, target: TfType, cast: (value: unknown) => unknown,
  ): void {
    const targets = simpleCasts.get(source) ?? new Map()
    targets.set(target, cast)
    simpleCasts.set(source, targets)
  }
  static registerCast(
    source: TfType,
    target: TfType,
    cast: (value: VtValue) => VtValue,
  ): void {
    const targets = valueCasts.get(source) ?? new Map()
    targets.set(target, cast)
    valueCasts.set(source, targets)
  }
  static registerSimpleBidirectionalCast(
    a: TfType,
    b: TfType,
    aToB: (value: unknown) => unknown,
    bToA: (value: unknown) => unknown,
  ): void {
    VtValue.registerSimpleCast(a, b, aToB)
    VtValue.registerSimpleCast(b, a, bToA)
  }

  // ---- Type queries ---------------------------------------------------------

  IsEmpty(): boolean {
    return this.#type.isUnknown()
  }

  /** The held value's TfType (unknown when empty). Mirrors VtValue::GetType. */
  getType(): TfType {
    return this.#type
  }

  getTypeid(): TfType { return this.getType() }

  getTypeName(): string {
    return this.#type.getTypeName()
  }

  /** True iff holding exactly `type`. Mirrors VtValue::IsHolding<T>(). */
  IsHolding(type: TfType): boolean {
    return this.#type === type
  }

  isArrayValued(): boolean {
    return this.#info.isArray
  }

  /** Number of elements when array-valued; 0 otherwise (matches upstream). */
  getArraySize(): number {
    return this.#info.arraySize(this.#value)
  }

  /** The element TfType when array-valued, else the unknown type. */
  getElementType(): TfType {
    return this.#info.elementType(this.#value) ??
      (this.#info.kind === 'arrayEdit' && this.#elementType ? this.#elementType :
        TfType.getUnknownType())
  }

  getElementTypeid(): TfType { return this.getElementType() }
  GetKnownValueTypeIndex(): number {
    return Object.values(VtValueTypes).indexOf(this.#type)
  }
  isArrayEditValued(): boolean { return this.#info.kind === 'arrayEdit' }

  // ---- Extraction -----------------------------------------------------------

  /** Extract the held value as T (caller asserts the type). */
  Get<T>(): T {
    if (this.IsEmpty()) throw new TypeError('cannot extract an empty VtValue')
    return this.#handOut<T>()
  }

  UncheckedGet<T>(): T { return this.#handOut<T>() }
  mutate<T>(): T { return this.Get<T>() }
  uncheckedMutate<T>(): T { return this.#handOut<T>() }
  remove<T>(): T {
    const value = this.Get<T>()
    this.#value = undefined
    this.#info = Vt_GetTypeInfo(undefined)
    this.#type = TfType.getUnknownType()
    this.#elementType = undefined
    this.#escaped = false
    return value
  }
  uncheckedRemove<T>(): T {
    const value = this.#handOut<T>()
    this.#value = undefined
    this.#info = Vt_GetTypeInfo(undefined)
    this.#type = TfType.getUnknownType()
    this.#elementType = undefined
    this.#escaped = false
    return value
  }
  static take<T>(value: T, type: TfType): VtValue {
    // The caller keeps its reference to the adopted object.
    const taken = new VtValue(value, type)
    taken.#escaped = true
    return taken
  }

  /** Extract as T, or `def` when empty. Mirrors VtValue::GetWithDefault. */
  getWithDefault<T>(def: T): T {
    return this.IsEmpty() ? def : this.#handOut<T>()
  }

  // ---- Misc -----------------------------------------------------------------

  /** Swap contents with another VtValue. Mirrors VtValue::Swap. */
  swap(other: VtValue): void {
    const v = this.#value, t = this.#type, i = this.#info
    const e = this.#elementType, s = this.#shared, x = this.#escaped
    this.#value = other.#value
    this.#info = other.#info
    this.#type = other.#type
    this.#elementType = other.#elementType
    this.#shared = other.#shared
    this.#escaped = other.#escaped
    other.#value = v
    other.#info = i
    other.#type = t
    other.#elementType = e
    other.#shared = s
    other.#escaped = x
  }

  uncheckedSwap(other: VtValue): void { this.swap(other) }

  Ref(): VtValueRef { return new VtValueRef(this) }

  canHash(): boolean { return !this.IsEmpty() }
  // value.cpp:440-447: empty hashes as 0; otherwise TfHash()(held value).
  getHash(): bigint {
    if (this.IsEmpty()) return 0n
    const h = new Tf_HashState()
    Vt_HashAppendHeld(h, this.getTypeName(), this.#value)
    return h.getCode()
  }

  /** hash_value(VtValue) (value.h:1310-1312). */
  hash_value(): bigint { return this.getHash() }
  canComposeOver(): boolean {
    return this.IsEmpty() || VtValueTypeCanComposeOver(this.#type)
  }
  canTransform(): boolean {
    const type = this.isArrayValued() || this.isArrayEditValued()
      ? this.getElementType() : this.#type
    return !this.IsEmpty() && _VtValueTypeCanTransform(type)
  }

  /** Value equality: same type and equal contents (element-wise for arrays). */
  equals(other: VtValue): boolean {
    if (this.#type !== other.#type) return false
    // VtArray.equals compares elements by value, including Gf types.
    return this.#info.equal(this.#value, other.#value)
  }

  ['~VtValue'](): void {
    this.#release()
    this.#escaped = false
    this.#value = undefined
    this.#info = Vt_GetTypeInfo(undefined)
    this.#type = TfType.getUnknownType()
    this.#elementType = undefined
  }
}

/**
 * Package-private value copy used by VtDictionary's eager adaptation of
 * value.h:208-223 copy construction. Kept out of the typescript-usd/vt barrel.
 */
export function _copyVtValue(source: VtValue): VtValue {
  if (source.IsEmpty()) return VtValue.getEmpty()
  return shareVtValue(source)
}

/** Value-proxy seams from OpenUSD v26.08 pxr/base/vt/traits.h:41-132. */
export class VtTypedValueProxyBase {}
export class VtErasedValueProxyBase {}

export function VtGetProxiedObject<T>(proxy: T): unknown {
  const getter = (proxy as { GetProxiedObject?: () => unknown })?.GetProxiedObject
  return typeof getter === 'function' ? getter.call(proxy) : proxy
}
export function VtGetErasedProxiedVtValue(proxy: unknown): VtValue {
  const getter = (proxy as { getProxiedVtValue?: () => VtValue })?.getProxiedVtValue
  if (typeof getter !== 'function') throw new TypeError('erased proxy has no VtValue')
  return getter.call(proxy)
}
export function VtGetErasedProxiedTfType(proxy: unknown): TfType {
  return VtGetErasedProxiedVtValue(proxy).getType()
}
export function VtErasedProxyHoldsType(proxy: unknown, type: TfType): boolean {
  return VtGetErasedProxiedVtValue(proxy).IsHolding(type)
}

export class Vt_ValueShapeDataAccess {
  static _getNumElements(value: VtValue): number { return value.getArraySize() }
  static _getShapeData(value: VtValue): unknown {
    return value.isArrayValued() ? value.Get<VtArray<unknown>>()._getShapeData() : undefined
  }
}
export class Vt_ValueTestAccess {}
