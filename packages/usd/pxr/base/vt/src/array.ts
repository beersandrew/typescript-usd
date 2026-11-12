// Ported from OpenUSD 26.11.1: pxr/base/vt/array.cpp, pxr/base/vt/array.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// VtArray — faithful-but-idiomatic port of pxr/base/vt/array.h.
//
// Upstream VtArray<T> is a copy-on-write, ref-counted, shared array — the
// array-valued storage for attribute values (and the per-output store in Vdf).
// Copies share storage and detach before mutable access, and the array carries
// its element TfType so an array-valued VtValue can report the type identity
// that JavaScript erases.
//
// Storage follows upstream's memory layout. Numeric and Gf element types live
// in one contiguous typed array (a VtArray<GfVec3f> of n elements is a
// Float32Array of 3n floats; quaternions keep GfQuat's imaginary-then-real
// layout), and elements are Gf values built on read. Other element types
// (strings, tokens, dictionaries, ...) are held in a plain JS array.
//
// FromBuffer views memory the array does not own, as upstream's foreign data
// source does (array.h:39-55, used for memory-mapped crate arrays): the first
// mutable access copies it.
//
// Read-only arrays. C++ hands out `const VtArray&` where a caller may read
// but not write; the const-ness is checked by the compiler. Here a frozen
// array (Object.freeze) is the const array: every mutating method throws a
// TypeError, the non-const accessors behave as their const counterparts, and
// Clone() gives a writable copy that shares the storage until either side is
// written. Scene-description reads hand out frozen arrays (Sdf stores its
// values immutably). cdata() is the shared storage: plain element storage is
// frozen once it is shared, so a write into it throws; typed storage is
// typed read-only (Vt_ReadonlyTypedBuffer), which the compiler checks. A
// typed array cannot be made read-only at run time without either a Proxy
// (no longer an ArrayBufferView: WebGPU writeBuffer, TypedArray.set and
// structured clone reject it or take a slow path, and every element access
// pays a trap) or an immutable ArrayBuffer (ArrayBuffer.prototype.
// transferToImmutable, not available in Node 24).

import { Tf_HashState, type Type as TfType } from 'typescript-usd/tf'
import {
  Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2h as GfVec2h, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3f as GfVec3f, Vec3h as GfVec3h, Vec3i as GfVec3i,
  Vec4d as GfVec4d, Vec4f as GfVec4f, Vec4h as GfVec4h, Vec4i as GfVec4i,
  Matrix2d as GfMatrix2d, Matrix3d as GfMatrix3d, Matrix4d as GfMatrix4d,
  Quatd as GfQuatd, Quatf as GfQuatf, Quath as GfQuath,
  _floatToHalfBits, _halfBitsToFloat,
} from 'typescript-usd/gf'
import { VtZero } from './types.ts'

/** The contiguous storage of a VtArray with a numeric or Gf element type. */
export type Vt_TypedBuffer =
  | Float32Array | Float64Array | Int32Array | Uint32Array | Uint8Array | Uint16Array
  | BigInt64Array | BigUint64Array

// The methods that write into a typed array, or hand out a writable view of
// its memory.
type Vt_TypedBufferWriters = 'set' | 'fill' | 'copyWithin' | 'reverse' | 'sort' | 'subarray'

/** A typed array whose elements the compiler does not let a caller write:
 * the const view of a VtArray's typed storage (cdata()). */
export type Vt_ReadonlyTyped<A extends Vt_TypedBuffer> =
  Omit<A, Vt_TypedBufferWriters | number> & { readonly [index: number]: A[number] }

/** The read-only storage cdata() hands out for numeric and Gf element types. */
export type Vt_ReadonlyTypedBuffer =
  | Vt_ReadonlyTyped<Float32Array> | Vt_ReadonlyTyped<Float64Array>
  | Vt_ReadonlyTyped<Int32Array> | Vt_ReadonlyTyped<Uint32Array>
  | Vt_ReadonlyTyped<Uint8Array> | Vt_ReadonlyTyped<Uint16Array>
  | Vt_ReadonlyTyped<BigInt64Array> | Vt_ReadonlyTyped<BigUint64Array>

/** Whether `storage` (from cdata()) is typed storage rather than an element
 * array. */
export function Vt_IsTypedStorage(storage: readonly unknown[] | Vt_ReadonlyTypedBuffer):
  storage is Vt_ReadonlyTypedBuffer {
  return ArrayBuffer.isView(storage)
}

interface ElementTraits<T> {
  /** Scalars per element. */
  readonly width: number
  alloc(scalars: number): Vt_TypedBuffer
  read(buf: Vt_TypedBuffer, index: number): T
  write(buf: Vt_TypedBuffer, index: number, value: T): void
}

type Components = { readonly data: readonly number[] } | readonly number[]
const componentsOf = (value: Components): readonly number[] =>
  Array.isArray(value) ? value as readonly number[] : (value as { data: readonly number[] }).data

type Alloc = (n: number) => Vt_TypedBuffer
const F32: Alloc = n => new Float32Array(n)
const F64: Alloc = n => new Float64Array(n)
const I32: Alloc = n => new Int32Array(n)
const U32: Alloc = n => new Uint32Array(n)
const U16: Alloc = n => new Uint16Array(n)
const U8: Alloc = n => new Uint8Array(n)

function scalarTraits(alloc: Alloc): ElementTraits<number> {
  return {
    width: 1, alloc,
    read: (buf, i) => (buf as Float64Array)[i]!,
    write: (buf, i, value) => { (buf as Float64Array)[i] = Number(value) },
  }
}

function vecTraits<V>(width: number, alloc: Alloc, half: boolean,
  make: (c: readonly number[]) => V): ElementTraits<V> {
  const scratch = new Array<number>(width)
  return {
    width, alloc,
    read: (buf, i) => {
      const b = buf as Float64Array, o = i * width
      for (let k = 0; k < width; k++) scratch[k] = half ? _halfBitsToFloat(b[o + k]!) : b[o + k]!
      return make(scratch)
    },
    write: (buf, i, value) => {
      const b = buf as Float64Array, o = i * width
      const c = componentsOf(value as Components)
      for (let k = 0; k < width; k++) b[o + k] = half ? _floatToHalfBits(c[k]!) : c[k]!
    },
  }
}

function matrixTraits<M extends { GetArray(): readonly number[] }>(
  n: number, make: (c: readonly number[]) => M,
): ElementTraits<M> {
  const width = n * n
  return {
    width, alloc: F64,
    read: (buf, i) => make(Array.prototype.slice.call(buf, i * width, i * width + width) as number[]),
    write: (buf, i, value) => {
      // A matrix element may be given as a GfMatrix or as rows of numbers.
      const flat = Array.isArray(value) ? (value as unknown[]).flat(2) as number[] : value.GetArray()
      ;(buf as Float64Array).set(flat, i * width)
    },
  }
}

type AnyQuat = { GetReal(): number, GetImaginary(): { readonly data: readonly number[] } }
// GfQuat stores its imaginary part, then its real part (quatf.h); a quaternion
// given as numbers is real-first, as text files write it.
function quatTraits<Q extends AnyQuat>(alloc: Alloc, half: boolean,
  make: (r: number, i: number, j: number, k: number) => Q): ElementTraits<Q> {
  const enc = half ? _floatToHalfBits : (x: number) => x
  const dec = half ? _halfBitsToFloat : (x: number) => x
  return {
    width: 4, alloc,
    read: (buf, i) => {
      const b = buf as Float64Array, o = i * 4
      return make(dec(b[o + 3]!), dec(b[o]!), dec(b[o + 1]!), dec(b[o + 2]!))
    },
    write: (buf, i, value) => {
      const b = buf as Float64Array, o = i * 4
      if (Array.isArray(value)) {
        const [r, x, y, z] = value as number[]
        b[o] = enc(x!); b[o + 1] = enc(y!); b[o + 2] = enc(z!); b[o + 3] = enc(r!)
      } else {
        const im = value.GetImaginary().data
        b[o] = enc(im[0]!); b[o + 1] = enc(im[1]!); b[o + 2] = enc(im[2]!); b[o + 3] = enc(value.GetReal())
      }
    },
  }
}

const TRAITS = new Map<string, ElementTraits<unknown>>(Object.entries({
  bool: {
    width: 1, alloc: U8,
    read: (buf, i) => (buf as Uint8Array)[i] !== 0,
    write: (buf, i, value) => { (buf as Uint8Array)[i] = value ? 1 : 0 },
  } satisfies ElementTraits<boolean>,
  uchar: scalarTraits(U8),
  int: scalarTraits(I32),
  uint: scalarTraits(U32),
  int64: {
    width: 1, alloc: n => new BigInt64Array(n),
    read: (buf, i) => (buf as BigInt64Array)[i]!,
    write: (buf, i, value) => { (buf as BigInt64Array)[i] = BigInt.asIntN(64, BigInt(value)) },
  } satisfies ElementTraits<bigint>,
  uint64: {
    width: 1, alloc: n => new BigUint64Array(n),
    read: (buf, i) => (buf as BigUint64Array)[i]!,
    write: (buf, i, value) => { (buf as BigUint64Array)[i] = BigInt.asUintN(64, BigInt(value)) },
  } satisfies ElementTraits<bigint>,
  half: {
    width: 1, alloc: U16,
    read: (buf, i) => _halfBitsToFloat((buf as Uint16Array)[i]!),
    write: (buf, i, value) => { (buf as Uint16Array)[i] = _floatToHalfBits(Number(value)) },
  } satisfies ElementTraits<number>,
  float: scalarTraits(F32),
  double: scalarTraits(F64),
  GfVec2d: vecTraits(2, F64, false, c => new GfVec2d(c[0]!, c[1]!)),
  GfVec2f: vecTraits(2, F32, false, c => new GfVec2f(c[0]!, c[1]!)),
  GfVec2h: vecTraits(2, U16, true, c => new GfVec2h(c[0]!, c[1]!)),
  GfVec2i: vecTraits(2, I32, false, c => new GfVec2i(c[0]!, c[1]!)),
  GfVec3d: vecTraits(3, F64, false, c => new GfVec3d(c[0]!, c[1]!, c[2]!)),
  GfVec3f: vecTraits(3, F32, false, c => new GfVec3f(c[0]!, c[1]!, c[2]!)),
  GfVec3h: vecTraits(3, U16, true, c => new GfVec3h(c[0]!, c[1]!, c[2]!)),
  GfVec3i: vecTraits(3, I32, false, c => new GfVec3i(c[0]!, c[1]!, c[2]!)),
  GfVec4d: vecTraits(4, F64, false, c => new GfVec4d(c[0]!, c[1]!, c[2]!, c[3]!)),
  GfVec4f: vecTraits(4, F32, false, c => new GfVec4f(c[0]!, c[1]!, c[2]!, c[3]!)),
  GfVec4h: vecTraits(4, U16, true, c => new GfVec4h(c[0]!, c[1]!, c[2]!, c[3]!)),
  GfVec4i: vecTraits(4, I32, false, c => new GfVec4i(c[0]!, c[1]!, c[2]!, c[3]!)),
  GfMatrix2d: matrixTraits(2, c => new GfMatrix2d(...c)),
  GfMatrix3d: matrixTraits(3, c => new GfMatrix3d(...c)),
  GfMatrix4d: matrixTraits(4, c => new GfMatrix4d(...c)),
  GfQuatd: quatTraits(F64, false, (r, i, j, k) => new GfQuatd(r, i, j, k)),
  GfQuatf: quatTraits(F32, false, (r, i, j, k) => new GfQuatf(r, i, j, k)),
  GfQuath: quatTraits(U16, true, (r, i, j, k) => new GfQuath(r, i, j, k)),
}) as Array<[string, ElementTraits<unknown>]>)

function traitsFor<T>(elementType: TfType): ElementTraits<T> | undefined {
  return TRAITS.get(elementType.getTypeName()) as ElementTraits<T> | undefined
}

function copyElement<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  // Value-copy plain arrays and records element by element: their
  // constructors are not copy constructors (`new Array(a)` wraps `a`, and
  // `new Object(o)` returns `o` itself).
  if (Array.isArray(value)) return value.map(copyElement) as T
  if (Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyElement(v)])) as T
  }
  const clone = (value as { Clone?: () => T }).Clone
  if (typeof clone === 'function') return clone.call(value)
  const ctor = (value as unknown as {
    constructor?: new (source: T) => T
  }).constructor
  if (typeof ctor === 'function') {
    try {
      return new ctor(value)
    } catch {
      // A C++ VtArray element is value-copyable. Unknown JS objects may not
      // expose a copy constructor; retain the value rather than inventing a
      // serialization boundary for them.
    }
  }
  return value
}

export class VtArray<T> {
  // Exactly one of #plain / #buf holds the elements.
  #plain: T[] | undefined
  #buf: Vt_TypedBuffer | undefined
  #size = 0
  readonly #traits: ElementTraits<T> | undefined
  #shared: { count: number }
  // The storage is foreign memory (FromBuffer); mutable access copies it.
  #foreign = false
  readonly #elementType: TfType
  #reserved = 0

  constructor(data: readonly T[] | VtArray<T>, elementType?: TfType) {
    if (data instanceof VtArray) {
      this.#plain = data.#plain
      this.#buf = data.#buf
      this.#size = data.#size
      this.#foreign = data.#foreign
      this.#shared = data.#shared
      this.#shared.count++
      this.#reserved = data.#reserved
      this.#elementType = elementType ?? data.getElementType()
      this.#traits = traitsFor(this.#elementType)
      if (this.#traits === undefined && this.#buf !== undefined) {
        throw new TypeError(`VtArray element type ${this.#elementType.getTypeName()} cannot hold numeric storage`)
      }
      return
    }
    if (elementType === undefined) {
      throw new TypeError('VtArray element type is required')
    }
    this.#elementType = elementType
    this.#traits = traitsFor(elementType)
    this.#shared = { count: 1 }
    if (this.#traits) {
      const traits = this.#traits
      this.#buf = traits.alloc(data.length * traits.width)
      for (let i = 0; i < data.length; i++) traits.write(this.#buf, i, data[i]!)
      this.#size = data.length
    } else {
      this.#plain = data.map(copyElement)
    }
  }

  /**
   * An array over `buffer`, the contiguous storage of `size` elements of
   * `elementType` (by default, all of it), without copying. Like upstream's
   * foreign data source, the array does not own the memory: the first mutable
   * access copies it.
   */
  static fromBuffer<U>(elementType: TfType, buffer: Vt_TypedBuffer, size?: number): VtArray<U> {
    const traits = traitsFor<U>(elementType)
    if (!traits || traits.alloc(0).constructor !== buffer.constructor) {
      throw new TypeError(`VtArray of ${elementType.getTypeName()} cannot use a ${buffer.constructor.name}`)
    }
    const n = size ?? buffer.length / traits.width
    if (!Number.isSafeInteger(n) || n < 0 || n * traits.width > buffer.length) {
      throw new RangeError(`invalid VtArray buffer size ${n}`)
    }
    const array = new VtArray<U>([], elementType)
    array.#buf = buffer
    array.#size = n
    array.#foreign = true
    return array
  }

  /**
   * An array that takes ownership of `buffer` (no copy, no foreign source):
   * the storage-building constructor used by readers that fill a fresh buffer.
   */
  static _adopt<U>(elementType: TfType, buffer: Vt_TypedBuffer): VtArray<U> {
    const array = VtArray.fromBuffer<U>(elementType, buffer)
    array.#foreign = false
    return array
  }

  // Before a write: a read-only (frozen) array refuses it; a shared one
  // detaches (array.h _DetachIfNotUnique).
  #write(): boolean {
    if (Object.isFrozen(this)) {
      throw new TypeError(
        `VtArray<${this.#elementType.getTypeName()}> is read-only; Clone() it to edit a copy`)
    }
    return this.#detach()
  }

  // A non-const accessor that does not write (begin(), get(), ...): it
  // detaches a writable array, as upstream's non-const overloads do, and
  // behaves as the const overload on a read-only one.
  #access(): void {
    if (!Object.isFrozen(this)) this.#detach()
  }

  #detach(): boolean {
    if (this.#shared.count === 1 && !this.#foreign &&
        (this.#plain === undefined || !Object.isFrozen(this.#plain))) return false
    this.#shared.count--
    if (this.#buf !== undefined) {
      const width = this.#traits!.width
      const copy = this.#traits!.alloc(Math.max(this.#size, this.#reserved) * width)
      copy.set(this.#buf.subarray(0, this.#size * width) as never)
      this.#buf = copy
    } else {
      this.#plain = this.#plain!.map(copyElement)
    }
    this.#shared = { count: 1 }
    this.#foreign = false
    return true
  }

  // Grow owned typed storage to hold `n` elements.
  #ensureCapacity(n: number): void {
    const width = this.#traits!.width
    if (this.#buf!.length >= n * width) return
    const capacity = Math.max(n, 2 * (this.#buf!.length / width), 4)
    const grown = this.#traits!.alloc(capacity * width)
    grown.set(this.#buf!.subarray(0, this.#size * width) as never)
    this.#buf = grown
  }

  #replace(values: readonly T[]): void {
    this.#write()
    this.#shared.count--
    this.#shared = { count: 1 }
    this.#foreign = false
    if (this.#traits) {
      const traits = this.#traits
      this.#buf = traits.alloc(values.length * traits.width)
      for (let i = 0; i < values.length; i++) traits.write(this.#buf, i, values[i]!)
      this.#size = values.length
    } else {
      this.#plain = values.map(copyElement)
    }
  }

  /**
   * A value-initialized array of `size` elements — mirrors `Vt.DoubleArray(3)`
   * yielding `[0, 0, 0]`. Numeric and Gf element storage starts zeroed; other
   * element types are filled with `fill`.
   */
  static ofSize<U>(size: number, elementType: TfType, fill: U = 0 as U): VtArray<U> {
    if (traitsFor(elementType)) {
      const array = new VtArray<U>([], elementType)
      array.resize(size, arguments.length > 2 ? fill : undefined)
      return array
    }
    return new VtArray<U>(new Array<U>(size).fill(fill), elementType)
  }

  /**
   * A value-initialized element (`ELEM{}`), as VtArray::resize(n) appends
   * (array.h resize, value-initializing new elements): zeroed numeric and Gf
   * storage, and VtZero for the other element types ('' for std::string and
   * TfToken, false for bool).
   */
  static _valueInitializedElement<U>(elementType: TfType): U {
    const traits = traitsFor<U>(elementType)
    return traits ? traits.read(traits.alloc(traits.width), 0) : VtZero(elementType) as U
  }

  /** OpenUSD v26.08 pxr/base/vt/array.h:356-358 const-view boundary. */
  asConst(): Readonly<VtArray<T>> { return this }

  /** OpenUSD v26.08 array.h:943-950 copy-on-write storage identity. */
  isIdentical(other: VtArray<T>): boolean {
    if (this.#elementType !== other.#elementType) return false
    if (this.size === 0 && other.size === 0) return true
    return this.#buf !== undefined
      ? this.#buf === other.#buf && this.#size === other.#size
      : this.#plain === other.#plain
  }

  /** OpenUSD v26.08 array.h:961-972 explicit detach boundary. */
  makeUnique(): boolean { return this.#write() }

  _getShapeData(): Vt_ShapeData {
    return new Vt_ShapeData(this.size)
  }

  /** The TfType of the array's elements (e.g. `double`). */
  getElementType(): TfType {
    return this.#elementType
  }

  get size(): number {
    return this.#buf !== undefined ? this.#size : this.#plain!.length
  }

  get length(): number {
    return this.size
  }

  capacity(): number {
    return this.#buf !== undefined
      ? Math.max(this.#reserved, this.#buf.length / this.#traits!.width)
      : Math.max(this.#reserved, this.#plain!.length)
  }
  max_size(): number { return Number.MAX_SAFE_INTEGER }
  reserve(size: number): void {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new RangeError(`invalid VtArray capacity ${size}`)
    }
    this.#write()
    this.#reserved = Math.max(this.#reserved, size)
    if (this.#buf !== undefined) this.#ensureCapacity(size)
  }

  empty(): boolean {
    return this.size === 0
  }

  /** Copy construction without exposing the private sharing strategy. */
  Clone(): VtArray<T> {
    return new VtArray(this)
  }

  // Resolve a possibly-negative index against the size, mirroring the Python
  // wrapper's negative indexing (d[-1] is the last element). Out-of-bounds —
  // including off-the-end negative indexes — raise, as Python raises IndexError.
  #resolveIndex(i: number): number {
    const n = this.size
    const idx = i < 0 ? i + n : i
    if (idx < 0 || idx >= n) {
      throw new RangeError(`VtArray index ${i} out of range for size ${n}`)
    }
    return idx
  }

  #read(i: number): T {
    return this.#buf !== undefined ? this.#traits!.read(this.#buf, i) : this.#plain![i]!
  }

  /**
   * The element at `i`. Numeric and Gf elements are returned as values, so
   * changing a returned Gf value does not change the array; use set().
   */
  get(i: number): T {
    if (this.#buf !== undefined) return this.#traits!.read(this.#buf, this.#resolveIndex(i))
    this.#access()
    return this.#plain![this.#resolveIndex(i)]!
  }

  set(i: number, value: T): void {
    this.#write()
    const idx = this.#resolveIndex(i)
    if (this.#buf !== undefined) this.#traits!.write(this.#buf, idx, value)
    else this.#plain![idx] = copyElement(value)
  }

  front(): T {
    return this.get(0)
  }

  cfront(): T { return this.#read(this.#resolveIndex(0)) }
  cback(): T { return this.#read(this.#resolveIndex(-1)) }

  /**
   * The contiguous element storage, detached for writing (array.h data()):
   * a typed array of `size * width` scalars for numeric and Gf element types,
   * else the element array.
   */
  data(): T[] | Vt_TypedBuffer {
    this.#write()
    return this.#buf !== undefined
      ? this.#buf.subarray(0, this.#size * this.#traits!.width)
      : this.#plain!
  }
  /**
   * The contiguous element storage, read-only (array.h cdata()): it may be
   * shared with other arrays. Element storage that is shared is frozen;
   * typed storage is typed read-only.
   */
  cdata(): readonly T[] | Vt_ReadonlyTypedBuffer {
    if (this.#buf !== undefined) return this.#buf.subarray(0, this.#size * this.#traits!.width)
    if ((this.#shared.count !== 1 || Object.isFrozen(this)) && !Object.isFrozen(this.#plain)) {
      Object.freeze(this.#plain)
    }
    return this.#plain!
  }
  begin(): IterableIterator<T> { this.#access(); return this[Symbol.iterator]() }
  cbegin(): IterableIterator<T> { return this[Symbol.iterator]() }
  end(): IterableIterator<T> {
    this.#access()
    return [][Symbol.iterator]() as IterableIterator<T>
  }
  cend(): IterableIterator<T> {
    return [][Symbol.iterator]() as IterableIterator<T>
  }
  rbegin(): IterableIterator<T> {
    this.#access()
    return this.#elements().reverse()[Symbol.iterator]()
  }
  crbegin(): IterableIterator<T> { return this.#elements().reverse()[Symbol.iterator]() }
  rend(): IterableIterator<T> {
    this.#access()
    return [][Symbol.iterator]() as IterableIterator<T>
  }
  crend(): IterableIterator<T> {
    return [][Symbol.iterator]() as IterableIterator<T>
  }

  back(): T {
    return this.get(-1)
  }

  clear(): void {
    this.#write()
    if (this.#buf !== undefined) this.#size = 0
    else this.#plain!.length = 0
  }

  resize(size: number, fill?: T): void {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new RangeError(`invalid VtArray size ${size}`)
    }
    this.#write()
    if (this.#buf !== undefined) {
      const old = this.#size
      this.#ensureCapacity(size)
      const width = this.#traits!.width
      if (size > old) {
        if (fill === undefined) this.#buf.fill(0 as never, old * width, size * width)
        else for (let i = old; i < size; i++) this.#traits!.write(this.#buf, i, fill)
      }
      this.#size = size
      return
    }
    const data = this.#plain!
    if (size < data.length) {
      data.length = size
    } else {
      const value = fill ?? VtArray._valueInitializedElement<T>(this.#elementType)
      while (data.length < size) data.push(copyElement(value))
    }
  }

  push_back(value: T): void {
    this.#write()
    if (this.#buf !== undefined) {
      this.#ensureCapacity(this.#size + 1)
      this.#traits!.write(this.#buf, this.#size++, value)
    } else {
      this.#plain!.push(copyElement(value))
    }
  }

  emplace_back(value: T): T {
    this.push_back(value)
    return this.#read(this.size - 1)
  }

  pop_back(): T | undefined {
    this.#write()
    if (this.#buf !== undefined) {
      if (this.#size === 0) return undefined
      return this.#traits!.read(this.#buf, --this.#size)
    }
    return this.#plain!.pop()
  }

  /**
   * Insert values before `index`; returns the insertion index.
   * This is the index-form TS adaptation of array.h's iterator overloads.
   */
  insert(index: number, value: T | readonly T[], count = 1): number {
    if (!Number.isSafeInteger(index) || index < 0 || index > this.size) {
      throw new RangeError(`VtArray insertion index ${index} out of range`)
    }
    this.#write()
    const values = Array.isArray(value) && !this.#isElementArray(value)
      ? value as readonly T[]
      : Array.from({ length: count }, () => value as T)
    if (this.#buf !== undefined) {
      const width = this.#traits!.width
      const n = values.length
      this.#ensureCapacity(this.#size + n)
      this.#buf.copyWithin((index + n) * width, index * width, this.#size * width)
      for (let i = 0; i < n; i++) this.#traits!.write(this.#buf, index + i, values[i]!)
      this.#size += n
    } else {
      this.#plain!.splice(index, 0, ...values.map(copyElement))
    }
    return index
  }

  // A plain number array given to insert() on a Gf-element array is one
  // element (e.g. [x, y, z] for a GfVec3f), not a list of elements.
  #isElementArray(value: readonly unknown[]): boolean {
    return this.#traits !== undefined && this.#traits.width > 1 &&
      value.length > 0 && typeof value[0] === 'number'
  }

  /**
   * Erase `[first, last)`; returns the index of the following element.
   * Mirrors the observable iterator position from array.h.
   */
  erase(first: number, last = first + 1): number {
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) ||
        first < 0 || last < first || last > this.size) {
      throw new RangeError(`invalid VtArray erase range [${first}, ${last})`)
    }
    this.#write()
    if (this.#buf !== undefined) {
      const width = this.#traits!.width
      this.#buf.copyWithin(first * width, last * width, this.#size * width)
      this.#size -= last - first
    } else {
      this.#plain!.splice(first, last - first)
    }
    return first
  }

  assign(values: readonly T[]): void {
    this.#replace(values)
  }

  slice(start?: number, end?: number): VtArray<T> {
    if (this.#buf === undefined) return new VtArray(this.#plain!.slice(start, end), this.#elementType)
    const n = this.#size
    const norm = (i: number | undefined, d: number) =>
      i === undefined ? d : i < 0 ? Math.max(n + i, 0) : Math.min(i, n)
    const from = norm(start, 0), to = Math.max(norm(end, n), from)
    const width = this.#traits!.width
    const array = new VtArray<T>([], this.#elementType)
    array.#buf = this.#buf.slice(from * width, to * width)
    array.#size = to - from
    return array
  }

  #elements(): T[] {
    if (this.#buf === undefined) return [...this.#plain!]
    const out = new Array<T>(this.#size)
    for (let i = 0; i < this.#size; i++) out[i] = this.#traits!.read(this.#buf, i)
    return out
  }

  /** A copy of the elements as a plain array. */
  toArray(): T[] {
    return this.#buf !== undefined ? this.#elements() : this.#plain!.map(copyElement)
  }

  /** Element-wise value equality against another VtArray or a plain array. */
  equals(other: VtArray<T> | readonly T[]): boolean {
    if (other instanceof VtArray && this.#buf !== undefined && other.#buf !== undefined &&
        this.#traits === other.#traits) {
      if (this.#size !== other.#size) return false
      const a = this.#buf, b = other.#buf, n = this.#size * this.#traits!.width
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false
      return true
    }
    const n = this.size
    const otherSize = other instanceof VtArray ? other.size : other.length
    if (n !== otherSize) return false
    for (let i = 0; i < n; i++) {
      const a = this.#read(i)
      const b = other instanceof VtArray ? other.#read(i) : other[i]
      if (a === b) continue
      if (a && typeof a === 'object' && 'equals' in a &&
          typeof a.equals === 'function' && a.equals(b)) continue
      return false
    }
    return true
  }

  swap(other: VtArray<T>): void {
    if (Object.isFrozen(this) || Object.isFrozen(other)) {
      throw new TypeError('VtArray is read-only; Clone() it to edit a copy')
    }
    if (this.#traits !== other.#traits) {
      throw new TypeError('VtArray swap requires the same element storage')
    }
    const plain = this.#plain, buf = this.#buf, size = this.#size
    const shared = this.#shared, foreign = this.#foreign, reserved = this.#reserved
    this.#plain = other.#plain
    this.#buf = other.#buf
    this.#size = other.#size
    this.#shared = other.#shared
    this.#foreign = other.#foreign
    this.#reserved = other.#reserved
    other.#plain = plain
    other.#buf = buf
    other.#size = size
    other.#shared = shared
    other.#foreign = foreign
    other.#reserved = reserved
  }

  ['~VtArray'](): void {
    if (Object.isFrozen(this)) throw new TypeError('VtArray is read-only')
    this.#shared.count--
    this.#shared = { count: 1 }
    this.#foreign = false
    if (this.#buf !== undefined) {
      this.#buf = this.#traits!.alloc(0)
      this.#size = 0
    } else {
      this.#plain = []
    }
  }

  /** `[a, b, c]` — mirrors `str(VtArray)` (empty -> `[]`). */
  toString(): string {
    return `[${this.#elements().join(', ')}]`
  }

  *[Symbol.iterator](): IterableIterator<T> {
    if (this.#buf === undefined) {
      yield* this.#plain!
      return
    }
    for (let i = 0; i < this.#size; i++) yield this.#traits!.read(this.#buf, i)
  }

  /**
   * TfHashAppend(h, VtArray) (array.h:1105-1111): the size, then
   * AppendContiguous of the elements, which hashes integral elements as raw
   * bytes and every other element type element-wise.
   */
  TfHashAppend(h: Tf_HashState): void {
    const size = this.size
    h._appendU64(Math.floor(size / 0x1_0000_0000), size >>> 0)
    const buf = this.#buf
    if (buf === undefined) {
      for (const item of this.#plain!) h.append(item)
      return
    }
    const name = this.#elementType.getTypeName()
    if (_HASH_INTEGRAL.has(name)) {
      h.appendContiguous(buf, size)
    } else if (name === 'float' || name === 'double') {
      h.appendRange(buf.subarray(0, size))
    } else if (name === 'half') {
      for (let i = 0; i < size; ++i) h._appendU64(0, buf[i] as number)
    } else {
      const layout = _gfHashLayout(name)!
      for (let i = 0; i < size; ++i) {
        _appendGfComponents(h, layout, buf as ArrayLike<number>, i * layout.width)
      }
    }
  }
}

// Integral element types: TfHashAppend's integral overload (tf/hash.h:30-36),
// and AppendContiguous of their raw bytes (tf/hash.h:287-293).
const _HASH_INTEGRAL = new Set(['bool', 'uchar', 'short', 'ushort', 'int', 'uint', 'int64', 'uint64'])

// Component layout of the Gf value types' hash_value: TfHash::Combine of the
// components (gf/vec3f.h:155-157 and siblings, gf/matrix4d.h:288-307,
// gf/matrix2d.h:209-215), and TfHash::Combine(real, imaginary) for quaternions
// (gf/quatd.h:148-150). 'i' is int, 'f' float, 'd' double, 'h' GfHalf, whose
// hash_value is its bits (gf/half.h:29-30).
interface _GfHashLayout { readonly kind: 'i' | 'f' | 'd' | 'h'; readonly width: number; readonly quat: boolean }
const _gfHashLayouts = new Map<string, _GfHashLayout | undefined>()
function _gfHashLayout(name: string): _GfHashLayout | undefined {
  if (_gfHashLayouts.has(name)) return _gfHashLayouts.get(name)
  let layout: _GfHashLayout | undefined
  let m: RegExpMatchArray | null
  if ((m = /^GfVec([234])([dfhi])$/.exec(name))) {
    layout = { kind: m[2] as _GfHashLayout['kind'], width: Number(m[1]), quat: false }
  } else if ((m = /^GfMatrix([234])d$/.exec(name))) {
    layout = { kind: 'd', width: Number(m[1]) ** 2, quat: false }
  } else if ((m = /^GfQuat([dfh])$/.exec(name))) {
    layout = { kind: m[1] as _GfHashLayout['kind'], width: 4, quat: true }
  }
  _gfHashLayouts.set(name, layout)
  return layout
}

function _appendComponent(h: Tf_HashState, kind: _GfHashLayout['kind'], value: number): void {
  if (kind === 'd') h.append(value)
  else if (kind === 'f') h._appendFloat(value)
  else h._appendU64(value < 0 ? 0xffffffff : 0, value >>> 0) // int, or half bits
}

// hash_value of one Gf element whose components (half as bits; quaternions
// imaginary-first, GfQuat's layout) start at `offset`, appended as a size_t.
function _appendGfComponents(
  h: Tf_HashState, layout: _GfHashLayout, components: ArrayLike<number>, offset: number,
): void {
  const inner = new Tf_HashState()
  if (layout.quat) {
    _appendComponent(inner, layout.kind, components[offset + 3]!)
    const imaginary = new Tf_HashState()
    for (let k = 0; k < 3; ++k) _appendComponent(imaginary, layout.kind, components[offset + k]!)
    inner._appendCodeOf(imaginary)
  } else {
    for (let k = 0; k < layout.width; ++k) _appendComponent(inner, layout.kind, components[offset + k]!)
  }
  h._appendCodeOf(inner)
}

/**
 * Append a value held with the Vt type `typeName` to `h` the way the held
 * C++ type's TfHash overload would (VtValue::GetHash, value.cpp:440-447, is
 * TfHash()(held), vt/hash.h:63-67).
 * FAITHFULNESS-DEBT(vt-hash-held): types with no layout here (tokens, paths,
 * asset paths, dictionaries' nested values, schema types) fall back to TfHash's
 * JavaScript mapping (tf/src/hash.ts), e.g. a token hashes its string rather
 * than its interned pointer (tf/token.h:359-363).
 */
export function Vt_HashAppendHeld(h: Tf_HashState, typeName: string, value: unknown): void {
  if (value instanceof VtArray) { h.append(value); return }
  if (_HASH_INTEGRAL.has(typeName)) {
    if (typeof value === 'number') { h._appendU64(value < 0 ? 0xffffffff : 0, value >>> 0); return }
    h.append(value)
    return
  }
  if (typeName === 'float') { h._appendFloat(value as number); return }
  if (typeName === 'half') { h._appendU64(0, _floatToHalfBits(value as number)); return }
  const layout = _gfHashLayout(typeName)
  if (layout === undefined) { h.append(value); return }
  let components: number[]
  if (layout.quat) {
    const q = value as { GetReal(): number, GetImaginary(): { readonly data: readonly number[] } }
    components = [...q.GetImaginary().data, q.GetReal()]
  } else if (typeName.startsWith('GfMatrix')) {
    components = [...(value as { GetArray(): readonly number[] }).GetArray()]
  } else {
    components = [...componentsOf(value as Components)]
  }
  if (layout.kind === 'h') components = components.map(_floatToHalfBits)
  _appendGfComponents(h, layout, components, 0)
}

/** OpenUSD v26.08 pxr/base/vt/types.h:344-372 legacy array shape. */
export class Vt_ShapeData {
  totalSize: number
  readonly otherDims: [number, number, number]

  constructor(totalSize = 0, otherDims: readonly number[] = []) {
    this.totalSize = totalSize
    this.otherDims = [otherDims[0] ?? 0, otherDims[1] ?? 0, otherDims[2] ?? 0]
  }

  getRank(): number {
    return this.otherDims[0] === 0 ? 1 :
      this.otherDims[1] === 0 ? 2 : this.otherDims[2] === 0 ? 3 : 4
  }

  clear(): void {
    this.totalSize = 0
    this.otherDims.fill(0)
  }
}

/** OpenUSD v26.08 pxr/base/vt/array.h:39-55 foreign-storage callback seam. */
export class Vt_ArrayForeignDataSource {
  constructor(readonly detachedFn?: (source: Vt_ArrayForeignDataSource) => void) {}
  void(): void { this.detachedFn?.(this) }
}

/** OpenUSD v26.08 pxr/base/vt/array.h:58-121 storage/shape base. */
export class Vt_ArrayBase {
  protected foreignSource: Vt_ArrayForeignDataSource | undefined
  constructor(source?: Vt_ArrayForeignDataSource) { this.foreignSource = source }
  _foreignSource(): Vt_ArrayForeignDataSource | undefined { return this.foreignSource }
}

/** OpenUSD v26.08 pxr/base/vt/array.h:775-868 element-wise arithmetic. */
export class Vt_ArrayOpHelp {
  static add(a: number, b: number): number { return a + b }
  static Sub(a: number, b: number): number { return a - b }
  static mul(a: number, b: number): number { return a * b }
  static div(a: number, b: number): number { return a / b }
  static mod(a: number, b: number): number { return a % b }
}

/** OpenUSD v26.08 pxr/base/vt/array.h:871-910 scalar/array arithmetic. */
export class Vt_ArrayOpHelpScalar {
  static mul(a: number, b: number): number { return a * b }
  static div(a: number, b: number): number { return a / b }
}
