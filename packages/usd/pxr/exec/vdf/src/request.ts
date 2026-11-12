// Ported from OpenUSD 26.11.1: pxr/exec/vdf/request.cpp,
//  pxr/exec/vdf/request.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/request.h and request.cpp.
//
// A VdfRequest is a sorted, uniqued, shared vector of masked outputs plus a
// bit set selecting a subset of it. An empty bit set is the sentinel for
// "all elements" (request.h:281-286). Copies share the vector
// (std::shared_ptr) and copy the bit set (Clone).

import { HashCombine as TfHashCombine, TF_VERIFY } from 'typescript-usd/tf'

// Relative import: TfBits is not in the tf barrel yet.
import { TfBits } from 'typescript-usd/tf'

import { VdfMaskedOutput } from './maskedOutput.ts'
import { VdfSortAndUniqueMaskedOutputVector } from './maskedOutputVector.ts'
import type { VdfNetwork } from './network.ts'

/**
 * VdfRequest::const_iterator (request.h:88-149). The position is an index
 * into the request's vector.
 */
export class VdfRequest_const_iterator {
  /** const_iterator() (request.cpp:48-54) is the null iterator. */
  constructor(
    private _mo: number = 0,
    private readonly _first: readonly VdfMaskedOutput[] | null = null,
    private readonly _bits: TfBits | null = null) {}

  /** operator* (request.h:100). */
  deref(): VdfMaskedOutput {
    return this._first![this._mo]!
  }

  /** operator++ (request.h:103-112). */
  increment(): this {
    this._increment()
    return this
  }

  /** operator== (request.h:114). */
  Equals(rhs: VdfRequest_const_iterator): boolean {
    return this._first === rhs._first && this._mo === rhs._mo
  }

  /** operator!= (request.h:118). */
  notEquals(rhs: VdfRequest_const_iterator): boolean {
    return !this.Equals(rhs)
  }

  /** Whether this iterator is at end(). */
  isAtEnd(): boolean {
    return !this._first || this._mo >= this._first.length
  }

  /** Copy. */
  Clone(): VdfRequest_const_iterator {
    return new VdfRequest_const_iterator(this._mo, this._first, this._bits)
  }

  /** _firstMo (request.h:147): the vector this iterator points into. */
  _getFirst(): readonly VdfMaskedOutput[] | null {
    return this._first
  }

  // _Increment (request.cpp:67-77).
  private _increment(): void {
    if (!this._bits) {
      ++this._mo
    } else {
      const index = this._computeIndex()
      const distance = this._bits.findNextSet(index + 1) - index
      this._mo += distance
    }
  }

  /** _ComputeIndex (request.cpp:79-83). */
  _computeIndex(): number {
    return this._mo
  }
}

/** VdfRequest::IndexedView (request.h:165-190). */
export class VdfRequest_IndexedView {
  constructor(private readonly _r: VdfRequest) {}

  /** GetSize (request.h:174). */
  getSize(): number {
    return this._r._getVector().length
  }

  /** Get (request.h:182): null if the element is removed from the request. */
  Get(i: number): VdfMaskedOutput | null {
    const bits = this._r._getBits()
    return !bits.getSize() || bits.isSet(i)
      ? this._r._getVector()[i]!
      : null
  }
}

export class VdfRequest implements Iterable<VdfMaskedOutput> {
  /** VdfRequest::const_iterator. */
  static readonly const_iterator = VdfRequest_const_iterator

  /** VdfRequest::IndexedView. */
  static readonly IndexedView = VdfRequest_IndexedView

  // _request (request.h:279): sorted and uniqued, shared between copies.
  private _request: readonly VdfMaskedOutput[]

  // _bits (request.h:286).
  private _bits: TfBits = new TfBits()

  /**
   * VdfRequest() (request.cpp:15), VdfRequest(maskedOutput) (request.cpp:21)
   * and VdfRequest(vector) (request.cpp:27-41). The vector is copied, sorted
   * and uniqued; the sort does not distinguish masked outputs with the same
   * output.
   */
  constructor(arg?: VdfMaskedOutput | readonly VdfMaskedOutput[]) {
    if (arg === undefined) {
      this._request = []
    } else if (arg instanceof VdfMaskedOutput) {
      this._request = [arg]
    } else {
      const request = [...arg]
      VdfSortAndUniqueMaskedOutputVector(request)
      this._request = request
    }
  }

  /**
   * VdfRequest(VdfMaskedOutputVector &&) (request.cpp:35-41): takes the
   * contents of vector, leaving it empty as a moved-from std::vector.
   */
  static fromMovedVector(vector: VdfMaskedOutput[]): VdfRequest {
    const r = new VdfRequest()
    const request = vector.splice(0, vector.length)
    VdfSortAndUniqueMaskedOutputVector(request)
    r._request = request
    return r
  }

  /** Copy constructor: shares the vector and copies the bits. */
  Clone(): VdfRequest {
    const r = new VdfRequest()
    r._request = this._request
    r._bits = new TfBits(this._bits)
    return r
  }

  /** Copy assignment. */
  assign(rhs: VdfRequest): this {
    this._request = rhs._request
    this._bits = new TfBits(rhs._bits)
    return this
  }

  /** IsEmpty (request.cpp:188-193). */
  IsEmpty(): boolean {
    return this._request.length === 0 ||
      (this._bits.areAllUnset() && this._bits.getSize() === this._request.length)
  }

  /** GetSize (request.cpp:195-199). */
  getSize(): number {
    return this._bits.getSize() === 0 ? this._request.length : this._bits.getNumSet()
  }

  /** GetNetwork (request.cpp:201-207): the first output's network, or null. */
  getNetwork(): VdfNetwork | null {
    return !this.IsEmpty()
      ? this._request[0]!.GetOutput()!.getNode().getNetwork()
      : null
  }

  /** begin (request.cpp:85-98). */
  begin(): VdfRequest_const_iterator {
    if (this.IsEmpty()) return this.end()

    const isSubset = !this._bits.IsEmpty()
    const index = isSubset ? this._bits.getFirstSet() : 0
    return new VdfRequest_const_iterator(
      index, this._request, isSubset ? this._bits : null)
  }

  /** end (request.cpp:100-109). */
  end(): VdfRequest_const_iterator {
    const isSubset = !this._bits.IsEmpty()
    return new VdfRequest_const_iterator(
      this._request.length, this._request, isSubset ? this._bits : null)
  }

  /** begin()/end() iteration. */
  *[Symbol.iterator](): Iterator<VdfMaskedOutput> {
    for (const it = this.begin(); !it.isAtEnd(); it.increment()) {
      yield it.deref()
    }
  }

  /** Add (request.cpp:132-140): marks the iterator's element as added. */
  add(iterator: VdfRequest_const_iterator): void {
    if (!TF_VERIFY(iterator._getFirst() === this._request,
      'iterator._firstMo == _request->data()')) {
      return
    }
    this._add(iterator._computeIndex())
  }

  /** Remove (request.cpp:160-168): marks the iterator's element as removed. */
  remove(iterator: VdfRequest_const_iterator): void {
    if (!TF_VERIFY(iterator._getFirst() === this._request,
      'iterator._firstMo == _request->data()')) {
      return
    }
    this._remove(iterator._computeIndex())
  }

  /** AddAll (request.cpp:170-176). */
  addAll(): void {
    if (this._bits.getSize() !== 0) this._bits.resize(0)
  }

  /** RemoveAll (request.cpp:178-186). */
  removeAll(): void {
    if (this._bits.getSize() === 0) this._bits.resize(this._request.length)
    this._bits.clearAll()
  }

  /** operator== (request.h:224-229). */
  Equals(rhs: VdfRequest): boolean {
    return (this._request === rhs._request ||
      _VectorEquals(this._request, rhs._request)) &&
      this._bits.Equals(rhs._bits)
  }

  /** operator!= (request.h:234). */
  notEquals(rhs: VdfRequest): boolean {
    return !this.Equals(rhs)
  }

  /**
   * VdfRequest::Hash (request.h:239-262): the bits hash combined with up to
   * three leading outputs and the last output.
   */
  static Hash(request: VdfRequest): number {
    const combine = (a: number, b: number): number =>
      Number(BigInt.asUintN(53, TfHashCombine(a, b)))
    let hash = request._bits.getHash()

    const num = Math.min(request.getSize(), 3)
    const outputs = request._request
    for (let i = 0; i < num; i++) {
      hash = combine(hash, VdfMaskedOutput.Hash(outputs[i]!))
    }

    if (request.getSize() > 3) {
      hash = combine(hash, VdfMaskedOutput.Hash(outputs[outputs.length - 1]!))
    }

    return hash
  }

  /** The shared vector, for IndexedView (a friend upstream). */
  _getVector(): readonly VdfMaskedOutput[] {
    return this._request
  }

  /** The subset bits, for IndexedView (a friend upstream). */
  _getBits(): TfBits {
    return this._bits
  }

  // _Add (request.cpp:111-130).
  private _add(index: number): void {
    if (this._bits.getSize() === 0) return

    if (!TF_VERIFY(index < this._request.length, 'index < _request->size()')) return

    this._bits.Set(index)

    // If they are all set, set to the sentinel empty bits.
    if (this._bits.areAllSet()) this._bits.resize(0)
  }

  // _Remove (request.cpp:142-158).
  private _remove(index: number): void {
    if (!TF_VERIFY(index < this._request.length, 'index < _request->size()')) return

    if (this._bits.getSize() === 0) {
      this._bits.resize(this._request.length)
      this._bits.setAll()
    }

    this._bits.clear(index)
  }
}

// std::vector<VdfMaskedOutput>::operator==.
function _VectorEquals(
  a: readonly VdfMaskedOutput[], b: readonly VdfMaskedOutput[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; ++i) {
    if (a[i]!.notEquals(b[i]!)) return false
  }
  return true
}

export declare namespace VdfRequest {
  /** VdfRequest::const_iterator. */
  type const_iterator = VdfRequest_const_iterator
  /** VdfRequest::IndexedView. */
  type IndexedView = VdfRequest_IndexedView
}
