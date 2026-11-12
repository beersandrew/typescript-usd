// Ported from OpenUSD 26.11.1: pxr/base/tf/hash.cpp, pxr/base/tf/hash.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfHash, ported from OpenUSD v26.11.1 pxr/base/tf/hash.h:30-514 and
// hash.cpp:20-37: Tf_HashState's integral append and lattice-point combiner,
// contiguous bytes through ArchHash64 seeded with the running state, and the
// final Knuth multiply plus byte swap. Results are bit-identical to the native
// build for the overloads mapped below (tests/upstream/fixtures/hash).
//
// size_t is 64 bits on every platform upstream supports here; the public
// result is that value as an unsigned 64-bit bigint. Internally the state is
// two uint32 halves so that no per-append BigInt arithmetic is needed.
//
// JavaScript value kinds map onto the upstream overloads as follows:
//   bigint            -> a 64-bit integral (two's complement modulo 2^64), _Append(T i)
//   boolean           -> bool, an integral (0 / 1)
//   number            -> double (hash.h:54-66; +/-0 hash alike)
//   string            -> std::string, AppendContiguous of its UTF-8 bytes (hash.h:127-133)
//   integer typed arrays (Int8..BigUint64, Uint8Clamped) -> std::vector<integral>,
//                        AppendContiguous of the raw little-endian bytes (hash.h:88-97, 287-293)
//   Float32Array / Float64Array -> std::vector<float/double>, element-wise (hash.h:295-302)
//   Array             -> std::vector<T> of non-integral T, std::pair or std::tuple:
//                        element-wise Append (hash.h:68-97, 295-302)
//   Set / Map         -> std::set / std::map: AppendRange over the elements, Map
//                        entries as (key, value) pairs (hash.h:107-125)
//   null / undefined  -> a null pointer, i.e. integral 0 (hash.h:135-141)
//   obj.TfHashAppend(h) -> a TfHashAppend overload (hash.h:205-211), tried first
//   obj.hash_value()  -> hash_value (hash.h:197-203); its result is appended as an
//                        integral when it is a bigint or a safe integer
//
// PLATFORM-DIVERGENCE(tf-hash-js-values): JavaScript numbers carry no C++ width,
// so a JS number always hashes as a double even where upstream hashes an
// integral (size_t, int); callers needing integral semantics pass a bigint or
// use Tf_HashState._AppendU64. Set/Map elements are visited in std::set/
// std::map order only when every key is a number, bigint or string (strings
// compared by UTF-16 code unit, which differs from std::string's byte order
// only for supplementary-plane vs U+E000..U+FFFF characters); otherwise in
// insertion order. Objects without TfHashAppend/hash_value, symbols and
// functions have no upstream overload (upstream rejects them at compile time,
// or hashes a pointer, hash.h:135-141): they hash structurally (sorted own
// enumerable entries) or by name. The end-state is per-type TfHashAppend
// customizations on every hashed class.

import { Arch_SpookyHash128, Arch_spookyOut } from 'typescript-usd/arch/_internal'

// Scratch views for float bit patterns and the bigint result.
const F64 = new Float64Array(1)
const F64_U32 = new Uint32Array(F64.buffer)
const F32 = new Float32Array(1)
const F32_U32 = new Uint32Array(F32.buffer)
const OUT = new DataView(new ArrayBuffer(8))

// Little-endian host check: typed-array storage is host-endian, and upstream
// SpookyHash reads little-endian words (arch/hash.cpp:26-30).
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

// 32x32 -> high 32 bits of the 64-bit product, exactly, in doubles.
function mulHi32(a: number, b: number): number {
  const a0 = a & 0xffff, a1 = a >>> 16
  const b0 = b & 0xffff, b1 = b >>> 16
  const t = a1 * b0 + ((a0 * b0) >>> 16)
  const w = (t % 0x10000) + a0 * b1
  return (a1 * b1 + Math.floor(t / 0x10000) + Math.floor(w / 0x10000)) >>> 0
}

let mulLo = 0
let mulHi = 0
// (ah:al) * (bh:bl) modulo 2^64, into mulHi:mulLo.
function mul64(ah: number, al: number, bh: number, bl: number): void {
  mulLo = Math.imul(al, bl) >>> 0
  mulHi = (mulHi32(al, bl) + Math.imul(al, bh) + Math.imul(ah, bl)) >>> 0
}

function bswap32(v: number): number {
  return (((v & 0xff) << 24) | ((v & 0xff00) << 8) |
    ((v >>> 8) & 0xff00) | (v >>> 24)) >>> 0
}

// 11400714819323198549 (hash.h:324)
const KNUTH_HI = 0x9e3779b9
const KNUTH_LO = 0x7f4a7c55

const encoder = new TextEncoder()
let utf8 = new Uint8Array(256)

// UTF-8 bytes of `s` into the shared scratch buffer; returns the byte count.
function encodeUtf8(s: string): number {
  const n = s.length
  if (utf8.length < n * 3) utf8 = new Uint8Array(Math.max(n * 3, utf8.length * 2))
  for (let i = 0; i < n; ++i) {
    const c = s.charCodeAt(i)
    if (c >= 0x80) return i + encoder.encodeInto(s.slice(i), utf8.subarray(i)).written
    utf8[i] = c
  }
  return n
}

function compareKeys(a: unknown, b: unknown): number {
  return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0
}

function orderable(values: readonly unknown[]): boolean {
  if (values.length === 0) return true
  const kind = typeof values[0]
  if (kind === 'string') return values.every(v => typeof v === 'string')
  if (kind === 'number' || kind === 'bigint') {
    return values.every(v => (typeof v === 'number' && !Number.isNaN(v)) || typeof v === 'bigint')
  }
  return false
}

function stableObjectEntries(value: object): [string, unknown][] {
  return Object.entries(value).sort(([a], [b]) => compareKeys(a, b))
}

type HashAppendable = { TfHashAppend(h: Tf_HashState): void }
type HashValued = { hash_value(): unknown }

/**
 * Tf_HashState (hash.h:213-379): the hash state passed to TfHashAppend
 * customizations. Append dispatches on the JavaScript value kind as described
 * at the top of this file.
 */
export class Tf_HashState {
  // size_t _state, as two uint32 halves; bool _didOne.
  #lo = 0
  #hi = 0
  #didOne = false
  #seen: Set<object> | undefined

  /** Tf_HashStateAPI::Append (hash.h:219-223). */
  append(...args: unknown[]): void {
    for (const arg of args) this.#append(arg)
  }

  /**
   * Tf_HashStateAPI::AppendContiguous (hash.h:225-229, 287-302): integer
   * typed arrays hash their bytes; anything else appends element-wise.
   */
  appendContiguous(elems: ArrayLike<unknown> | ArrayBufferView, numElems?: number): void {
    if (ArrayBuffer.isView(elems) && !(elems instanceof Float32Array) &&
        !(elems instanceof Float64Array)) {
      const width = 'BYTES_PER_ELEMENT' in elems
        ? (elems as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT : 1
      const count = numElems ?? elems.byteLength / width
      this.#appendBytes(new Uint8Array(elems.buffer, elems.byteOffset, count * width))
      return
    }
    const list = elems as ArrayLike<unknown>
    const count = numElems ?? list.length
    for (let i = 0; i < count; ++i) this.#append(list[i])
  }

  /**
   * Tf_HashStateAPI::AppendRange (hash.h:231-235, 304-310): each element is
   * appended by its own overload, so typed-array elements keep their element
   * type (float, or integral rather than contiguous bytes).
   */
  appendRange(range: Iterable<unknown>): void {
    if (range instanceof Float32Array) {
      for (let i = 0; i < range.length; ++i) this.#appendFloat(range[i]!)
    } else if (range instanceof BigInt64Array || range instanceof BigUint64Array) {
      for (let i = 0; i < range.length; ++i) this.#appendBigInt(range[i]!)
    } else if (ArrayBuffer.isView(range) && !(range instanceof Float64Array)) {
      // Integral elements (hash.h:274-285); signed values sign-extend.
      for (const item of range as Iterable<number>) {
        this._appendU64(item < 0 ? 0xffffffff : 0, item >>> 0)
      }
    } else {
      for (const item of range) this.#append(item)
    }
  }

  /** Tf_HashState::_GetCode (hash.h:315-340), as an unsigned 64-bit bigint. */
  getCode(): bigint {
    mul64(this.#hi, this.#lo, KNUTH_HI, KNUTH_LO)
    OUT.setUint32(0, bswap32(mulHi), true)
    OUT.setUint32(4, bswap32(mulLo), true)
    return OUT.getBigUint64(0, true)
  }

  /**
   * Tf_HashState::_Append for an integral (hash.h:274-285), given as its
   * 64-bit two's complement halves.
   */
  _appendU64(hi: number, lo: number): void {
    if (!this.#didOne) {
      this.#hi = hi >>> 0
      this.#lo = lo >>> 0
      this.#didOne = true
      return
    }
    // _Combine (hash.h:342-375): x += y; return y + x * (x + 1) / 2, all
    // size_t arithmetic, so the product wraps before the division.
    const yl = lo >>> 0, yh = hi >>> 0
    let s = this.#lo + yl
    const xl = s >>> 0
    const xh = (this.#hi + yh + (s > 0xffffffff ? 1 : 0)) >>> 0
    s = xl + 1
    const x1l = s >>> 0
    const x1h = (xh + (s > 0xffffffff ? 1 : 0)) >>> 0
    mul64(xh, xl, x1h, x1l)
    const hl = ((mulLo >>> 1) | (mulHi << 31)) >>> 0
    const hh = mulHi >>> 1
    s = yl + hl
    this.#lo = s >>> 0
    this.#hi = (yh + hh + (s > 0xffffffff ? 1 : 0)) >>> 0
  }

  /** _Append of a float (hash.h:54-66 with sizeof(T) == 4). */
  _appendFloat(value: number): void {
    this.#appendFloat(value)
  }

  /**
   * _Append of the size_t that `inner.GetCode()` returns, without a bigint
   * round trip: the shape of a hash_value that returns TfHash::Combine(...).
   */
  _appendCodeOf(inner: Tf_HashState): void {
    mul64(inner.#hi, inner.#lo, KNUTH_HI, KNUTH_LO)
    this._appendU64(bswap32(mulLo), bswap32(mulHi))
  }

  /** Tf_HashState::_AppendBytes (hash.cpp:20-25). */
  #appendBytes(bytes: Uint8Array, length = bytes.length): void {
    if (!LITTLE_ENDIAN) throw new Error('TfHash requires a little-endian host')
    Arch_SpookyHash128(bytes, 0, length, this.#hi, this.#lo, this.#hi, this.#lo)
    this.#lo = Arch_spookyOut[0]!
    this.#hi = Arch_spookyOut[1]!
    this.#didOne = true
  }

  #appendDouble(value: number): void {
    // hash.h:54-66: +/-0 hash as all-zero bits.
    if (value === 0) { this._appendU64(0, 0); return }
    F64[0] = value
    this._appendU64(F64_U32[1]!, F64_U32[0]!)
  }

  #appendFloat(value: number): void {
    if (value === 0) { this._appendU64(0, 0); return }
    F32[0] = value
    this._appendU64(0, F32_U32[0]!)
  }

  #appendBigInt(value: bigint): void {
    const v = BigInt.asUintN(64, value)
    this._appendU64(Number(v >> 32n), Number(v & 0xffff_ffffn))
  }

  #appendString(value: string): void {
    const length = encodeUtf8(value) // may reallocate utf8
    this.#appendBytes(utf8, length)
  }

  #append(value: unknown): void {
    switch (typeof value) {
      case 'number': this.#appendDouble(value); return
      case 'string': this.#appendString(value); return
      case 'bigint': this.#appendBigInt(value); return
      case 'boolean': this._appendU64(0, value ? 1 : 0); return
      case 'undefined': this._appendU64(0, 0); return
      case 'symbol': this.#appendString(value.description ?? ''); return
      case 'function': this.#appendString(value.name); return
    }
    if (value === null) { this._appendU64(0, 0); return }
    this.#appendObject(value as object)
  }

  #appendObject(value: object): void {
    if (ArrayBuffer.isView(value)) {
      if (value instanceof Float64Array) {
        for (let i = 0; i < value.length; ++i) this.#appendDouble(value[i]!)
      } else if (value instanceof Float32Array) {
        for (let i = 0; i < value.length; ++i) this.#appendFloat(value[i]!)
      } else {
        this.appendContiguous(value)
      }
      return
    }
    const seen = this.#seen ??= new Set()
    if (seen.has(value)) throw new TypeError('TfHash cannot hash a cycle')
    seen.add(value)
    try {
      const append = (value as Partial<HashAppendable>).TfHashAppend
      const hashValue = (value as Partial<HashValued>).hash_value
      if (typeof append === 'function') {
        append.call(value, this)
      } else if (typeof hashValue === 'function') {
        const code = hashValue.call(value)
        if (typeof code === 'number' && Number.isSafeInteger(code)) {
          this.#appendBigInt(BigInt(code))
        } else {
          this.#append(code)
        }
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; ++i) this.#append(value[i])
      } else if (value instanceof Set) {
        const items = [...value]
        if (orderable(items)) items.sort(compareKeys)
        for (const item of items) this.#append(item)
      } else if (value instanceof Map) {
        const entries = [...value]
        if (orderable(entries.map(([key]) => key))) entries.sort(([a], [b]) => compareKeys(a, b))
        for (const [key, item] of entries) {
          this.#append(key)
          this.#append(item)
        }
      } else {
        for (const [key, item] of stableObjectEntries(value)) {
          this.#appendString(key)
          this.#append(item)
        }
      }
    } finally {
      seen.delete(value)
    }
  }
}

/** TfHash()(obj) (hash.h:472-483), as an unsigned 64-bit bigint. */
export function TfHash(value: unknown): bigint {
  const h = new Tf_HashState()
  h.append(value)
  return h.getCode()
}

/** TfHash::Combine (hash.h:485-504). */
export function TfHashCombine(...values: readonly unknown[]): bigint {
  const h = new Tf_HashState()
  for (const value of values) h.append(value)
  return h.getCode()
}

/**
 * TfHashAsCStr (hash.h:154-179): the C-string view of `value`, which hashes
 * the bytes before the first NUL like std::strlen does.
 */
export function TfHashAsCStr(value: string): string {
  const nul = value.indexOf('\0')
  return nul < 0 ? value : value.slice(0, nul)
}

/**
 * TfHashCString (hash.cpp:33-37): ArchHash (32-bit) of the C string's bytes,
 * widened to size_t.
 */
export function TfHashCString(value: string | null): bigint {
  if (value === null) return 0n
  const length = encodeUtf8(TfHashAsCStr(value))
  Arch_SpookyHash128(utf8, 0, length, 0, 0, 0, 0)
  return BigInt(Arch_spookyOut[0]!)
}

/**
 * TfHashCharPtr (hash.cpp:27-31) hashes a char pointer's address.
 * PLATFORM-DIVERGENCE(tf-hash-char-ptr): JavaScript strings have no address, so
 * this hashes the string value; the faithful form needs pointer identity,
 * which JavaScript does not expose.
 */
export function TfHashCharPtr(value: string): bigint {
  return TfHash(value)
}

/** Customization point from OpenUSD v26.11.1 pxr/base/tf/hash.h:30-179. */
export function TfHashAppend(
  state: { append(value: unknown): void } | unknown[],
  value: unknown,
): void {
  if (Array.isArray(state)) state.push(value)
  else state.append(value)
}
