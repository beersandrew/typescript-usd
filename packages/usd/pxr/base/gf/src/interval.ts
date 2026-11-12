// Ported from OpenUSD 26.11.1: pxr/base/gf/interval.cpp,
//  pxr/base/gf/interval.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GfInterval — a basic mathematical interval with open/closed boundaries.
//
// Mirrors OpenUSD pxr/base/gf/interval.{h,cpp} 1:1 in name and semantics.
// Self-contained (doubles only — no Vec/Matrix dependency).
//
// C++ exposes the math via operators; TS exposes them as methods and each
// documents the C++ operator it maps to:
//   operator&= / operator&  -> intersectWith / GetIntersection
//   operator|= / operator|  -> unionWith     / GetUnion
//   operator+= / operator+  -> addWith        / GetSum
//   operator-= / operator-  -> subtractWith   / GetDifference
//   operator*= / operator*  -> multiplyWith   / GetProduct
//   unary operator-         -> GetNegation
//   operator== / operator<  -> equals / lessThan
//
// No FAITHFULNESS-DEBT: this is a verbatim port of the C++ algorithms,
// including the _Bound open/closed combination rules and the infinity
// normalization (closed bounds on +/-inf are forced open).

/** Helper struct mirroring GfInterval::_Bound (value + closed flag). */
interface Bound {
  value: number
  closed: boolean
}

const INF = Infinity

/** Construct a _Bound, forcing infinite values to be open (mirrors _Bound ctor). */
function makeBound(value: number, isClosed: boolean): Bound {
  let closed = isClosed
  // Closed boundaries on infinite values do not make sense so force open.
  if (value === -INF || value === INF) {
    closed = false
  }
  return { value, closed }
}

function boundEquals(a: Bound, b: Bound): boolean {
  return a.value === b.value && a.closed === b.closed
}

/** _Bound::operator< */
function boundLess(a: Bound, b: Bound): boolean {
  return a.value < b.value || (a.value === b.value && a.closed && !b.closed)
}

/** _Bound::operator* */
function boundMul(a: Bound, b: Bound): Bound {
  return makeBound(a.value * b.value, a.closed && b.closed)
}

/** GfInterval::_Min — lesser minimum bound, handling boundary conditions. */
function minBound(a: Bound, b: Bound): Bound {
  return a.value < b.value || (a.value === b.value && a.closed && !b.closed) ? a : b
}

/** GfInterval::_Max — greater maximum bound, handling boundary conditions. */
function maxBound(a: Bound, b: Bound): Bound {
  return a.value < b.value || (a.value === b.value && !a.closed && b.closed) ? b : a
}

export class GfInterval {
  private _min: Bound
  private _max: Bound

  /**
   * Constructors mirroring the C++ overloads:
   *   GfInterval()                                  -> empty open interval (0,0)
   *   GfInterval(val)                               -> closed point [val,val]
   *   GfInterval(min, max, minClosed?, maxClosed?)  -> [/( min, max )/]
   */
  constructor()
  constructor(val: number)
  constructor(min: number, max: number, minClosed?: boolean, maxClosed?: boolean)
  constructor(min?: number, max?: number, minClosed = true, maxClosed = true) {
    if (min === undefined) {
      // Empty open interval (0,0).
      this._min = makeBound(0.0, false)
      this._max = makeBound(0.0, false)
    } else if (max === undefined) {
      // Closed single point [val,val].
      this._min = makeBound(min, true)
      this._max = makeBound(min, true)
    } else {
      this._min = makeBound(min, minClosed)
      this._max = makeBound(max, maxClosed)
    }
  }

  /** Copy constructor helper (GfInterval(const GfInterval &)). */
  clone(): GfInterval {
    const r = new GfInterval()
    r._min = { value: this._min.value, closed: this._min.closed }
    r._max = { value: this._max.value, closed: this._max.closed }
    return r
  }

  // --- Accessors -----------------------------------------------------------

  getMin(): number {
    return this._min.value
  }

  getMax(): number {
    return this._max.value
  }

  /** SetMin(v) keeps the existing min boundary condition. */
  setMin(v: number): void
  /** SetMin(v, minClosed) sets value and boundary condition. */
  setMin(v: number, minClosed: boolean): void
  setMin(v: number, minClosed?: boolean): void {
    this._min = makeBound(v, minClosed === undefined ? this._min.closed : minClosed)
  }

  setMax(v: number): void
  setMax(v: number, maxClosed: boolean): void
  setMax(v: number, maxClosed?: boolean): void {
    this._max = makeBound(v, maxClosed === undefined ? this._max.closed : maxClosed)
  }

  isMinClosed(): boolean {
    return this._min.closed
  }

  isMaxClosed(): boolean {
    return this._max.closed
  }

  isMinOpen(): boolean {
    return !this._min.closed
  }

  isMaxOpen(): boolean {
    return !this._max.closed
  }

  isMaxFinite(): boolean {
    return this._max.value !== -INF && this._max.value !== INF
  }

  isMinFinite(): boolean {
    return this._min.value !== -INF && this._min.value !== INF
  }

  isFinite(): boolean {
    return this.isMaxFinite() && this.isMinFinite()
  }

  /** Return true iff the interval is empty. */
  IsEmpty(): boolean {
    return (
      this._min.value > this._max.value ||
      (this._min.value === this._max.value && (!this._min.closed || !this._max.closed))
    )
  }

  /** Width of the interval. An empty interval has size 0. */
  getSize(): number {
    return Math.max(0.0, this._max.value - this._min.value)
  }

  /** 2x-compatibility alias for GetSize. */
  size(): number {
    return this.getSize()
  }

  /** Midpoint of the interval. */
  getMidpoint(): number {
    return this.IsEmpty() ? 0.0 : 0.5 * (this._min.value + this._max.value)
  }

  // --- Containment / intersection ------------------------------------------

  /** Contains(double) — true iff d is contained in the interval. */
  containsValue(d: number): boolean {
    return (
      (d > this._min.value || (d === this._min.value && this._min.closed)) &&
      (d < this._max.value || (d === this._max.value && this._max.closed))
    )
  }

  /** Contains(const GfInterval&) — true iff i is entirely contained. */
  containsInterval(i: GfInterval): boolean {
    return this.getIntersection(i).equals(i)
  }

  /**
   * Overloaded Contains mirroring the two C++ overloads:
   *   Contains(double) and Contains(const GfInterval&).
   */
  contains(d: number): boolean
  contains(i: GfInterval): boolean
  contains(arg: number | GfInterval): boolean {
    return typeof arg === 'number' ? this.containsValue(arg) : this.containsInterval(arg)
  }

  /** 2x-compatibility alias In(double) == Contains(double). */
  in(d: number): boolean {
    return this.containsValue(d)
  }

  /** True iff the given interval i intersects this interval. */
  intersects(i: GfInterval): boolean {
    return !this.getIntersection(i).IsEmpty()
  }

  // --- Math operations -----------------------------------------------------

  /** operator&= : boolean intersection (mutates this, returns this). */
  intersectWith(rhs: GfInterval): this {
    if (this.IsEmpty()) {
      // No change.
    } else if (rhs.IsEmpty()) {
      // Intersection is empty.
      this._min = makeBound(0.0, false)
      this._max = makeBound(0.0, false)
    } else {
      // Intersect min edge.
      if (this._min.value < rhs._min.value) {
        this._min = { value: rhs._min.value, closed: rhs._min.closed }
      } else if (this._min.value === rhs._min.value) {
        this._min.closed = this._min.closed && rhs._min.closed
      }
      // Intersect max edge.
      if (this._max.value > rhs._max.value) {
        this._max = { value: rhs._max.value, closed: rhs._max.closed }
      } else if (this._max.value === rhs._max.value) {
        this._max.closed = this._max.closed && rhs._max.closed
      }
    }
    return this
  }

  /** operator& : returns the intersection without mutating this. */
  getIntersection(rhs: GfInterval): GfInterval {
    return this.clone().intersectWith(rhs)
  }

  /** operator|= : union bounds (mutates this, returns this). */
  unionWith(rhs: GfInterval): this {
    if (this.IsEmpty()) {
      this._min = { value: rhs._min.value, closed: rhs._min.closed }
      this._max = { value: rhs._max.value, closed: rhs._max.closed }
    } else if (rhs.IsEmpty()) {
      // No change.
    } else {
      // Expand min edge.
      if (this._min.value > rhs._min.value) {
        this._min = { value: rhs._min.value, closed: rhs._min.closed }
      } else if (this._min.value === rhs._min.value) {
        this._min.closed = this._min.closed || rhs._min.closed
      }
      // Expand max edge.
      if (this._max.value < rhs._max.value) {
        this._max = { value: rhs._max.value, closed: rhs._max.closed }
      } else if (this._max.value === rhs._max.value) {
        this._max.closed = this._max.closed || rhs._max.closed
      }
    }
    return this
  }

  /** operator| : returns the union without mutating this. */
  getUnion(rhs: GfInterval): GfInterval {
    return this.clone().unionWith(rhs)
  }

  /** operator+= : interval addition (mutates this, returns this). */
  addWith(rhs: GfInterval): this {
    if (!rhs.IsEmpty()) {
      this._min.value += rhs._min.value
      this._max.value += rhs._max.value
      this._min.closed = this._min.closed && rhs._min.closed
      this._max.closed = this._max.closed && rhs._max.closed
    }
    return this
  }

  /** operator+ : returns the sum without mutating this. */
  getSum(rhs: GfInterval): GfInterval {
    return this.clone().addWith(rhs)
  }

  /** operator-= : interval subtraction, *this += -rhs (mutates this). */
  subtractWith(rhs: GfInterval): this {
    return this.addWith(rhs.getNegation())
  }

  /** operator- (binary) : returns the difference without mutating this. */
  getDifference(rhs: GfInterval): GfInterval {
    return this.clone().subtractWith(rhs)
  }

  /** operator- (unary) : interval negation. */
  getNegation(): GfInterval {
    return new GfInterval(-this._max.value, -this._min.value, this._max.closed, this._min.closed)
  }

  /** operator*= : interval multiplication (mutates this, returns this). */
  multiplyWith(rhs: GfInterval): this {
    const a = boundMul(this._min, rhs._min)
    const b = boundMul(this._min, rhs._max)
    const c = boundMul(this._max, rhs._min)
    const d = boundMul(this._max, rhs._max)
    this._max = maxBound(maxBound(a, b), maxBound(c, d))
    this._min = minBound(minBound(a, b), minBound(c, d))
    return this
  }

  /** operator* : returns the product without mutating this. */
  getProduct(rhs: GfInterval): GfInterval {
    return this.clone().multiplyWith(rhs)
  }

  // --- Comparison ----------------------------------------------------------

  /** operator== */
  equals(rhs: GfInterval): boolean {
    return boundEquals(this._min, rhs._min) && boundEquals(this._max, rhs._max)
  }

  /** operator< — total order used for sorting. */
  lessThan(rhs: GfInterval): boolean {
    if (!boundEquals(this._min, rhs._min)) {
      return boundLess(this._min, rhs._min)
    }
    if (!boundEquals(this._max, rhs._max)) {
      return boundLess(this._max, rhs._max)
    }
    return false
  }

  // --- Static --------------------------------------------------------------

  /** Returns the full interval (-inf, inf). */
  static getFullInterval(): GfInterval {
    return new GfInterval(-INF, INF, false, false)
  }

  /** String form matching the C++ operator<< : (x, y) with []/() brackets. */
  toString(): string {
    const lo = this._min.closed ? '[' : '('
    const hi = this._max.closed ? ']' : ')'
    return `${lo}${this._min.value}, ${this._max.value}${hi}`
  }
}
