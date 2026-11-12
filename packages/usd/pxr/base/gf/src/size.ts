// Ported from OpenUSD 26.11.1: pxr/base/gf/size2.h, pxr/base/gf/size3.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/base/gf/size2.h and pxr/base/gf/size3.h (Pixar OpenUSD).
//
// GfSize2 / GfSize3 represent pairs / triples of non-negative counts. They are
// based on the C++ datatype size_t, so all components are non-negative integers
// and every mathematical operation (including multiplication) is componentwise.
// If you need negative values, use GfVec2i / GfVec3i upstream.
//
// C++ exposes operators (operator[], ==, +, -, *, /, +=, -=, *=, /=). We expose
// them as named methods and document the C++ operator each maps to:
//   v[i]            -> Get(i) / SetIndex(i, value)   (Python-style negative
//                      indexing + IndexError, matching the pxr.Gf wrapper)
//   a == b          -> a.equals(b)
//   a + b           -> a.Add(b)            (operator+)
//   a - b           -> a.Subtract(b)       (operator-)
//   a * b           -> a.Multiply(b)       (operator*, componentwise)
//   a * s / s * a   -> a.GetMultiply(s)    (operator* by scalar)
//   a / s           -> a.GetDivide(s)      (operator/ by scalar, integer)
//   a += b          -> a.AddEq(b)          (operator+=)
//   a -= b          -> a.SubtractEq(b)     (operator-=)
//   a *= b          -> a.MultiplyEq(b)     (operator*= componentwise)
//   a *= s          -> a.MultiplyScalarEq(s)
//   a /= s          -> a.DivideScalarEq(s)
//
// Integer semantics: division truncates toward zero (C++ size_t division; all
// values are non-negative so this equals floor). No FAITHFULNESS-DEBT — this is
// a complete 1:1 port; the only adaptations are the Python-wrapper indexing
// behaviors (negative index, `in`, len), which the upstream test exercises.

// Normalize a possibly-negative index against `dim`, throwing like Python's
// IndexError (the pxr.Gf array wrapper) for out-of-range access.
function normalizeIndex(i: number, dim: number): number {
  const idx = i < 0 ? i + dim : i
  if (idx < 0 || idx >= dim) {
    throw new RangeError(`index ${i} out of range for GfSize${dim}`)
  }
  return idx
}

/// Two-dimensional array of sizes. Mirrors GfSize2.
export class GfSize2 {
  /// Number of components. Mirrors the Python wrapper's `dimension`.
  static readonly dimension = 2
  readonly dimension = 2

  private _vec: [number, number]

  /// Default constructor initializes components to zero; from components; or
  /// from a GfVec2i-like [number, number] tuple (upstream's explicit GfVec2i
  /// conversion + array constructor).
  constructor(v0?: number | readonly [number, number], v1?: number) {
    if (v0 === undefined) {
      this._vec = [0, 0]
    } else if (typeof v0 === 'number') {
      this._vec = [v0, v1 ?? 0]
    } else {
      this._vec = [v0[0], v0[1]]
    }
  }

  /// Set to values passed directly (or an array). Returns this (operator chaining).
  Set(v0: number | readonly [number, number], v1?: number): GfSize2 {
    if (typeof v0 === 'number') {
      this._vec[0] = v0
      this._vec[1] = v1 ?? 0
    } else {
      this._vec[0] = v0[0]
      this._vec[1] = v0[1]
    }
    return this
  }

  /// Array operator (const). Supports Python-style negative indexing.
  Get(i: number): number {
    return this._vec[normalizeIndex(i, 2)]!
  }

  /// Array operator (mutating). Supports Python-style negative indexing.
  setIndex(i: number, value: number): void {
    this._vec[normalizeIndex(i, 2)] = value
  }

  /// Component-wise equality (operator==).
  equals(v: GfSize2): boolean {
    return this._vec[0] === v._vec[0] && this._vec[1] === v._vec[1]
  }

  /// Component-wise addition (operator+).
  add(v: GfSize2): GfSize2 {
    return new GfSize2(this._vec[0] + v._vec[0], this._vec[1] + v._vec[1])
  }

  /// Component-wise subtraction (operator-).
  subtract(v: GfSize2): GfSize2 {
    return new GfSize2(this._vec[0] - v._vec[0], this._vec[1] - v._vec[1])
  }

  /// Component-wise multiplication (operator*).
  multiply(v: GfSize2): GfSize2 {
    return new GfSize2(this._vec[0] * v._vec[0], this._vec[1] * v._vec[1])
  }

  /// Component-wise multiplication by a scalar (operator* by int).
  getMultiply(s: number): GfSize2 {
    return new GfSize2(this._vec[0] * s, this._vec[1] * s)
  }

  /// Component-wise division by a scalar (operator/ by int; integer truncation).
  getDivide(s: number): GfSize2 {
    return new GfSize2(Math.trunc(this._vec[0] / s), Math.trunc(this._vec[1] / s))
  }

  /// In-place addition (operator+=). Returns this.
  addEq(v: GfSize2): GfSize2 {
    this._vec[0] += v._vec[0]
    this._vec[1] += v._vec[1]
    return this
  }

  /// In-place subtraction (operator-=). Returns this.
  subtractEq(v: GfSize2): GfSize2 {
    this._vec[0] -= v._vec[0]
    this._vec[1] -= v._vec[1]
    return this
  }

  /// In-place componentwise multiplication (operator*=). Returns this.
  multiplyEq(v: GfSize2): GfSize2 {
    this._vec[0] *= v._vec[0]
    this._vec[1] *= v._vec[1]
    return this
  }

  /// In-place multiplication by a scalar (operator*= by int). Returns this.
  multiplyScalarEq(s: number): GfSize2 {
    this._vec[0] = this._vec[0] * s
    this._vec[1] = this._vec[1] * s
    return this
  }

  /// In-place division by a scalar (operator/= by int; integer truncation). Returns this.
  divideScalarEq(s: number): GfSize2 {
    this._vec[0] = Math.trunc(this._vec[0] / s)
    this._vec[1] = Math.trunc(this._vec[1] / s)
    return this
  }

  /// Whether `value` equals any component (Python `value in size`).
  contains(value: number): boolean {
    return this._vec[0] === value || this._vec[1] === value
  }

  /// Number of components (Python `len`).
  get length(): number {
    return 2
  }

  /// Conversion to a [number, number] tuple (operator GfVec2i / array access).
  toArray(): [number, number] {
    return [this._vec[0], this._vec[1]]
  }

  /// repr() round-trips through the constructor: "Gf.Size2(v0, v1)".
  repr(): string {
    return `Gf.Size2(${this._vec[0]}, ${this._vec[1]})`
  }

  /// Output operator (operator<<): "( v0 v1 )".
  toString(): string {
    return `( ${this._vec[0]} ${this._vec[1]} )`
  }
}

/// Three-dimensional array of sizes. Mirrors GfSize3.
export class GfSize3 {
  /// Number of components. Mirrors the Python wrapper's `dimension`.
  static readonly dimension = 3
  readonly dimension = 3

  private _vec: [number, number, number]

  /// Default constructor initializes components to zero; from components; or
  /// from a GfVec3i-like [number, number, number] tuple.
  constructor(v0?: number | readonly [number, number, number], v1?: number, v2?: number) {
    if (v0 === undefined) {
      this._vec = [0, 0, 0]
    } else if (typeof v0 === 'number') {
      this._vec = [v0, v1 ?? 0, v2 ?? 0]
    } else {
      this._vec = [v0[0], v0[1], v0[2]]
    }
  }

  /// Set to values passed directly (or an array). Returns this (operator chaining).
  Set(v0: number | readonly [number, number, number], v1?: number, v2?: number): GfSize3 {
    if (typeof v0 === 'number') {
      this._vec[0] = v0
      this._vec[1] = v1 ?? 0
      this._vec[2] = v2 ?? 0
    } else {
      this._vec[0] = v0[0]
      this._vec[1] = v0[1]
      this._vec[2] = v0[2]
    }
    return this
  }

  /// Array operator (const). Supports Python-style negative indexing.
  Get(i: number): number {
    return this._vec[normalizeIndex(i, 3)]!
  }

  /// Array operator (mutating). Supports Python-style negative indexing.
  setIndex(i: number, value: number): void {
    this._vec[normalizeIndex(i, 3)] = value
  }

  /// Component-wise equality (operator==).
  equals(v: GfSize3): boolean {
    return (
      this._vec[0] === v._vec[0] && this._vec[1] === v._vec[1] && this._vec[2] === v._vec[2]
    )
  }

  /// Component-wise addition (operator+).
  add(v: GfSize3): GfSize3 {
    return new GfSize3(
      this._vec[0] + v._vec[0],
      this._vec[1] + v._vec[1],
      this._vec[2] + v._vec[2],
    )
  }

  /// Component-wise subtraction (operator-).
  subtract(v: GfSize3): GfSize3 {
    return new GfSize3(
      this._vec[0] - v._vec[0],
      this._vec[1] - v._vec[1],
      this._vec[2] - v._vec[2],
    )
  }

  /// Component-wise multiplication (operator*).
  multiply(v: GfSize3): GfSize3 {
    return new GfSize3(
      this._vec[0] * v._vec[0],
      this._vec[1] * v._vec[1],
      this._vec[2] * v._vec[2],
    )
  }

  /// Component-wise multiplication by a scalar (operator* by size_t).
  getMultiply(s: number): GfSize3 {
    return new GfSize3(this._vec[0] * s, this._vec[1] * s, this._vec[2] * s)
  }

  /// Component-wise division by a scalar (operator/ by size_t; integer truncation).
  getDivide(s: number): GfSize3 {
    return new GfSize3(
      Math.trunc(this._vec[0] / s),
      Math.trunc(this._vec[1] / s),
      Math.trunc(this._vec[2] / s),
    )
  }

  /// In-place addition (operator+=). Returns this.
  addEq(v: GfSize3): GfSize3 {
    this._vec[0] += v._vec[0]
    this._vec[1] += v._vec[1]
    this._vec[2] += v._vec[2]
    return this
  }

  /// In-place subtraction (operator-=). Returns this.
  subtractEq(v: GfSize3): GfSize3 {
    this._vec[0] -= v._vec[0]
    this._vec[1] -= v._vec[1]
    this._vec[2] -= v._vec[2]
    return this
  }

  /// In-place componentwise multiplication (operator*=). Returns this.
  multiplyEq(v: GfSize3): GfSize3 {
    this._vec[0] *= v._vec[0]
    this._vec[1] *= v._vec[1]
    this._vec[2] *= v._vec[2]
    return this
  }

  /// In-place multiplication by a scalar (operator*= by size_t). Returns this.
  multiplyScalarEq(s: number): GfSize3 {
    this._vec[0] = this._vec[0] * s
    this._vec[1] = this._vec[1] * s
    this._vec[2] = this._vec[2] * s
    return this
  }

  /// In-place division by a scalar (operator/= by size_t; integer truncation). Returns this.
  divideScalarEq(s: number): GfSize3 {
    this._vec[0] = Math.trunc(this._vec[0] / s)
    this._vec[1] = Math.trunc(this._vec[1] / s)
    this._vec[2] = Math.trunc(this._vec[2] / s)
    return this
  }

  /// Whether `value` equals any component (Python `value in size`).
  contains(value: number): boolean {
    return this._vec[0] === value || this._vec[1] === value || this._vec[2] === value
  }

  /// Number of components (Python `len`).
  get length(): number {
    return 3
  }

  /// Conversion to a [number, number, number] tuple (operator GfVec3i / array access).
  toArray(): [number, number, number] {
    return [this._vec[0], this._vec[1], this._vec[2]]
  }

  /// repr() round-trips through the constructor: "Gf.Size3(v0, v1, v2)".
  repr(): string {
    return `Gf.Size3(${this._vec[0]}, ${this._vec[1]}, ${this._vec[2]})`
  }

  /// Output operator (operator<<): "( v0 v1 v2 )".
  toString(): string {
    return `( ${this._vec[0]} ${this._vec[1]} ${this._vec[2]} )`
  }
}
