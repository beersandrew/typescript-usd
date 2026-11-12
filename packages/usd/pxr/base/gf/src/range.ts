// typescript-usd/gf — GfRange{1,2,3}{d,f} value types.
//
// Mirrors OpenUSD pxr/base/gf/range{1,2,3}{d,f}.{h,cpp} (all generated from
// range.template.h / range.template.cpp). A GfRange is an axis-aligned
// interval/box defined by a min and max point; all operations are
// component-wise and conform to interval mathematics. An empty range is one
// where max < min; the default-empty value is [FLT_MAX, -FLT_MAX] (note:
// upstream uses FLT_MAX even for the double-precision ranges — mirrored here).
//
// Range1{d,f} store scalar doubles/floats for min/max; Range2/3 store the
// matching GfVec (from ./vec.ts) for min/max. The 'f' variants round every
// stored component through float32 semantics (GfVec*f does this for the vec
// ranges; the scalar Range1f rounds via Math.fround) so values match the
// Pixar oracle.
//
// C++ operator -> TS method mapping (documented on each method):
//   operator==              -> .equals(other)
//   operator!=              -> !.equals(other)
//   operator+  (binary)     -> .GetSum(b)            / .AddInPlace(b)    (+=)
//   operator-  (binary)     -> .GetDifference(b)     / .SubtractInPlace(b) (-=)
//   operator*  (scalar)     -> .GetMultiplied(m)     / .MultiplyInPlace(m) (*=)
//   operator/  (scalar)     -> .GetDivided(m)        / .DivideInPlace(m)   (/=)
//   static UnitSquare/UnitCube -> static get unitSquare / unitCube
//
// This file is a faithful, verbatim-algorithm port (same operation order as
// upstream so float rounding matches the oracle). No FAITHFULNESS-DEBT.

import { GfVec2d, GfVec2f, GfVec3d, GfVec3f } from './vec.ts'
import type { GfVec, VecLike } from './vec.ts'

// Upstream's empty-range sentinel is FLT_MAX, even for the double ranges
// (range.template.h SetEmpty()).
const FLT_MAX = 3.4028234663852886e38

function GfSqr(x: number): number {
  return x * x
}

// ============================ scalar (dim 1) ============================

/** Shared surface for the 1-dimensional (scalar) ranges. */
abstract class GfRange1Base {
  static readonly dimension = 1
  readonly dimension = 1

  protected _min = 0
  protected _max = 0

  /** Round a scalar to this range's precision (fround for 'f'). */
  protected abstract _round(x: number): number

  /** Construct a new range of this same concrete type. */
  protected _make(min: number, max: number): this {
    return new (this.constructor as new (a: number, b: number) => this)(min, max)
  }

  protected _initFromArgs(args: ReadonlyArray<number | GfRange1Base>): void {
    if (args.length === 0) {
      this.setEmpty()
      return
    }
    if (args.length === 1) {
      const a = args[0]!
      if (a instanceof GfRange1Base) {
        // Convert from a (possibly different-precision) 1-d range.
        this._min = this._round(a.getMin())
        this._max = this._round(a.getMax())
        return
      }
      throw new TypeError('GfRange1: single-argument ctor expects another range')
    }
    this._min = this._round(args[0] as number)
    this._max = this._round(args[1] as number)
  }

  /** Sets the range to an empty interval. */
  setEmpty(): void {
    this._min = FLT_MAX
    this._max = -FLT_MAX
  }

  getMin(): number {
    return this._min
  }
  getMax(): number {
    return this._max
  }
  setMin(min: number): void {
    this._min = this._round(min)
  }
  setMax(max: number): void {
    this._max = this._round(max)
  }

  /** Size of the range (max - min). */
  getSize(): number {
    return this._max - this._min
  }

  /** Midpoint 0.5*min + 0.5*max (zero for empty/default ranges). */
  getMidpoint(): number {
    return 0.5 * this._min + 0.5 * this._max
  }

  /** Whether the range is empty (min > max). */
  IsEmpty(): boolean {
    return this._min > this._max
  }

  /** \deprecated alias of UnionWith. */
  extendBy(arg: number | this): this {
    return this.unionWith(arg)
  }

  /** True if the point / range lies (inclusively) inside this range. */
  contains(arg: number | GfRange1Base): boolean {
    if (arg instanceof GfRange1Base) {
      return this.contains(arg._min) && this.contains(arg._max)
    }
    return arg >= this._min && arg <= this._max
  }

  /** True if `range` is entirely outside this range. */
  isOutside(range: this): boolean {
    return range._max < this._min || range._min > this._max
  }

  /** Smallest range containing both a and b. */
  static getUnion<T extends GfRange1Base>(a: T, b: T): T {
    return a._make(Math.min(a._min, b._min), Math.max(a._max, b._max)) as T
  }

  /** Extend this to include b (a range) or a point; mutates and returns this. */
  unionWith(b: number | this): this {
    if (b instanceof GfRange1Base) {
      if (b._min < this._min) this._min = b._min
      if (b._max > this._max) this._max = b._max
    } else {
      const p = this._round(b)
      if (p < this._min) this._min = p
      if (p > this._max) this._max = p
    }
    return this
  }

  /** Intersection of a and b. */
  static getIntersection<T extends GfRange1Base>(a: T, b: T): T {
    return a._make(Math.max(a._min, b._min), Math.min(a._max, b._max)) as T
  }

  /** Modify this to its intersection with b; mutates and returns this. */
  intersectWith(b: this): this {
    if (b._min > this._min) this._min = b._min
    if (b._max < this._max) this._max = b._max
    return this
  }

  /** Squared distance from a point to the range. */
  getDistanceSquared(p: number): number {
    let dist = 0.0
    if (p < this._min) {
      dist += GfSqr(this._min - p)
    } else if (p > this._max) {
      dist += GfSqr(p - this._max)
    }
    return dist
  }

  // ---- arithmetic ----

  /** operator+ (binary): [min+b.min, max+b.max]. */
  getSum(b: this): this {
    return this._make(this._min + b._min, this._max + b._max)
  }

  /** operator- (binary): [min-b.max, max-b.min]. */
  getDifference(b: this): this {
    return this._make(this._min - b._max, this._max - b._min)
  }

  /** operator* (scalar): scale, swapping min/max for negative m. */
  getMultiplied(m: number): this {
    return m > 0
      ? this._make(this._min * m, this._max * m)
      : this._make(this._max * m, this._min * m)
  }

  /** operator/ (scalar): r * (1/m). */
  getDivided(m: number): this {
    return this.getMultiplied(1.0 / m)
  }

  /** operator+= */
  addInPlace(b: this): this {
    this._min = this._round(this._min + b._min)
    this._max = this._round(this._max + b._max)
    return this
  }

  /** operator-= */
  subtractInPlace(b: this): this {
    this._min = this._round(this._min - b._max)
    this._max = this._round(this._max - b._min)
    return this
  }

  /** operator*= */
  multiplyInPlace(m: number): this {
    if (m > 0) {
      this._min = this._round(this._min * m)
      this._max = this._round(this._max * m)
    } else {
      const tmp = this._min
      this._min = this._round(this._max * m)
      this._max = this._round(tmp * m)
    }
    return this
  }

  /** operator/= */
  divideInPlace(m: number): this {
    return this.multiplyInPlace(1.0 / m)
  }

  /** operator== with another (possibly different-precision) 1-d range. */
  equals(b: GfRange1Base): boolean {
    return this._min === this._round(b.getMin()) && this._max === this._round(b.getMax())
  }

  hash(): string {
    return `${this._min};${this._max}`
  }

  toString(): string {
    return `[${this._min}...${this._max}]`
  }

  repr(): string {
    return `Gf.${this.constructor.name}(${this._min}, ${this._max})`
  }
}

export class GfRange1d extends GfRange1Base {
  constructor(...args: Array<number | GfRange1Base>) {
    super()
    this._initFromArgs(args)
  }
  protected _round(x: number): number {
    return x
  }
}

export class GfRange1f extends GfRange1Base {
  constructor(...args: Array<number | GfRange1Base>) {
    super()
    this._initFromArgs(args)
  }
  protected _round(x: number): number {
    return Math.fround(x)
  }
}

// ============================ vector (dim 2/3) ============================

type VecCtor<V extends GfVec> = new (...args: Array<number | VecLike>) => V

/** Shared surface for the multi-dimensional (GfVec-backed) ranges. */
abstract class GfRangeVecBase<V extends GfVec> {
  protected _min!: V
  protected _max!: V

  /** Constructor for this range's GfVec type (used to build/convert vectors). */
  protected abstract get _vecCtor(): VecCtor<V>

  get dimension(): number {
    return this._min.dimension
  }

  /** Build this range's vec type from any vec-like source (copy + convert). */
  protected _vec(src: VecLike): V {
    return new this._vecCtor(src)
  }

  /** Construct a new range of this same concrete type. */
  protected _make(min: V, max: V): this {
    return new (this.constructor as new (a: V, b: V) => this)(min, max)
  }

  protected _initFromArgs(args: ReadonlyArray<GfVec | GfRangeVecBase<GfVec>>): void {
    if (args.length === 0) {
      this.setEmpty()
      return
    }
    if (args.length === 1) {
      const a = args[0]!
      if (a instanceof GfRangeVecBase) {
        // Convert from a (possibly different-precision) range of equal dim.
        this._min = this._vec(a.getMin())
        this._max = this._vec(a.getMax())
        return
      }
      throw new TypeError('GfRange: single-argument ctor expects another range')
    }
    this._min = this._vec(args[0] as GfVec)
    this._max = this._vec(args[1] as GfVec)
  }

  /** Component-wise binary helper producing a new vec of this type. */
  protected _componentwise(a: V, b: V, fn: (x: number, y: number) => number): V {
    const ad = a.data
    const bd = b.data
    return this._vec(ad.map((x, i) => fn(x, bd[i]!)))
  }

  setEmpty(): void {
    this._min = new this._vecCtor(FLT_MAX)
    this._max = new this._vecCtor(-FLT_MAX)
  }

  getMin(): V {
    return this._min
  }
  getMax(): V {
    return this._max
  }
  setMin(min: V): void {
    this._min = this._vec(min)
  }
  setMax(max: V): void {
    this._max = this._vec(max)
  }

  /** Size of the range (max - min). */
  getSize(): V {
    return this._max.subtract(this._min) as V
  }

  /** Midpoint 0.5*min + 0.5*max (zero for empty/default ranges). */
  getMidpoint(): V {
    return this._min.getScaled(0.5).add(this._max.getScaled(0.5)) as V
  }

  /** Whether the range is empty (any component has min > max). */
  IsEmpty(): boolean {
    const mn = this._min.data
    const mx = this._max.data
    for (let i = 0; i < mn.length; i++) {
      if (mn[i]! > mx[i]!) return true
    }
    return false
  }

  /** \deprecated alias of UnionWith. */
  extendBy(arg: V | this): this {
    return this.unionWith(arg)
  }

  /** True if the point / range lies (inclusively) inside this range. */
  contains(arg: V | GfRangeVecBase<V>): boolean {
    if (arg instanceof GfRangeVecBase) {
      return this.contains(arg._min) && this.contains(arg._max)
    }
    const p = arg.data
    const mn = this._min.data
    const mx = this._max.data
    for (let i = 0; i < p.length; i++) {
      if (!(p[i]! >= mn[i]! && p[i]! <= mx[i]!)) return false
    }
    return true
  }

  /** True if `range` is entirely outside this range. */
  isOutside(range: this): boolean {
    const rmn = range._min.data
    const rmx = range._max.data
    const mn = this._min.data
    const mx = this._max.data
    for (let i = 0; i < mn.length; i++) {
      if (rmx[i]! < mn[i]! || rmn[i]! > mx[i]!) return true
    }
    return false
  }

  /** Smallest range containing both a and b. */
  static getUnion<W extends GfVec, T extends GfRangeVecBase<W>>(a: T, b: T): T {
    const min = a._componentwise(a._min, b._min, Math.min)
    const max = a._componentwise(a._max, b._max, Math.max)
    return a._make(min, max) as T
  }

  /** Extend this to include b (a range) or a point; mutates and returns this. */
  unionWith(b: V | this): this {
    if (b instanceof GfRangeVecBase) {
      this._min = this._componentwise(this._min, b._min, Math.min)
      this._max = this._componentwise(this._max, b._max, Math.max)
    } else {
      this._min = this._componentwise(this._min, b, Math.min)
      this._max = this._componentwise(this._max, b, Math.max)
    }
    return this
  }

  /** Intersection of a and b. */
  static getIntersection<W extends GfVec, T extends GfRangeVecBase<W>>(a: T, b: T): T {
    const min = a._componentwise(a._min, b._min, Math.max)
    const max = a._componentwise(a._max, b._max, Math.min)
    return a._make(min, max) as T
  }

  /** Modify this to its intersection with b; mutates and returns this. */
  intersectWith(b: this): this {
    this._min = this._componentwise(this._min, b._min, Math.max)
    this._max = this._componentwise(this._max, b._max, Math.min)
    return this
  }

  /** Squared distance from a point to the range. */
  getDistanceSquared(p: V): number {
    let dist = 0.0
    const pv = p.data
    const mn = this._min.data
    const mx = this._max.data
    for (let i = 0; i < pv.length; i++) {
      if (pv[i]! < mn[i]!) {
        dist += GfSqr(mn[i]! - pv[i]!)
      } else if (pv[i]! > mx[i]!) {
        dist += GfSqr(pv[i]! - mx[i]!)
      }
    }
    return dist
  }

  // ---- arithmetic ----

  /** operator+ (binary): [min+b.min, max+b.max]. */
  getSum(b: this): this {
    return this._make(this._min.add(b._min) as V, this._max.add(b._max) as V)
  }

  /** operator- (binary): [min-b.max, max-b.min]. */
  getDifference(b: this): this {
    return this._make(this._min.subtract(b._max) as V, this._max.subtract(b._min) as V)
  }

  /** operator* (scalar): scale, swapping min/max for negative m. */
  getMultiplied(m: number): this {
    return m > 0
      ? this._make(this._min.getScaled(m) as V, this._max.getScaled(m) as V)
      : this._make(this._max.getScaled(m) as V, this._min.getScaled(m) as V)
  }

  /** operator/ (scalar): r * (1/m). */
  getDivided(m: number): this {
    return this.getMultiplied(1.0 / m)
  }

  /** operator+= */
  addInPlace(b: this): this {
    this._min = this._min.add(b._min) as V
    this._max = this._max.add(b._max) as V
    return this
  }

  /** operator-= */
  subtractInPlace(b: this): this {
    this._min = this._min.subtract(b._max) as V
    this._max = this._max.subtract(b._min) as V
    return this
  }

  /** operator*= */
  multiplyInPlace(m: number): this {
    if (m > 0) {
      this._min = this._min.getScaled(m) as V
      this._max = this._max.getScaled(m) as V
    } else {
      const tmp = this._min
      this._min = this._max.getScaled(m) as V
      this._max = tmp.getScaled(m) as V
    }
    return this
  }

  /** operator/= */
  divideInPlace(m: number): this {
    return this.multiplyInPlace(1.0 / m)
  }

  /** operator== with another (possibly different-precision) equal-dim range. */
  equals(b: GfRangeVecBase<GfVec>): boolean {
    return this._min.equals(this._vec(b.getMin())) && this._max.equals(this._vec(b.getMax()))
  }

  hash(): string {
    return `${this._min.data.join(',')};${this._max.data.join(',')}`
  }

  toString(): string {
    return `[${this._min.toString()}...${this._max.toString()}]`
  }

  repr(): string {
    return `Gf.${this.constructor.name}(${this._min.repr()}, ${this._max.repr()})`
  }
}

// ---- dimension 2: corners (SW,SE,NW,NE) + quadrants + unit square ----

abstract class GfRange2Base<V extends GfVec> extends GfRangeVecBase<V> {
  /**
   * The ith corner, in order SW, SE, NW, NE.
   * GfVec((i&1 ? max : min)[0], (i&2 ? max : min)[1]).
   */
  getCorner(i: number): V {
    if (i < 0 || i > 3) {
      throw new Error(`Invalid corner ${i} > 3.`)
    }
    const mn = this._min.data
    const mx = this._max.data
    return this._vec([(i & 1 ? mx : mn)[0]!, (i & 2 ? mx : mn)[1]!])
  }

  /** The ith quadrant, in order SW, SE, NW, NE. */
  getQuadrant(i: number): this {
    if (i < 0 || i > 3) {
      throw new Error(`Invalid quadrant ${i} > 3.`)
    }
    const a = this.getCorner(i).data
    const b = this._min.add(this._max).getScaled(0.5).data
    return this._make(
      this._vec([Math.min(a[0]!, b[0]!), Math.min(a[1]!, b[1]!)]),
      this._vec([Math.max(a[0]!, b[0]!), Math.max(a[1]!, b[1]!)]),
    )
  }
}

export class GfRange2d extends GfRange2Base<GfVec2d> {
  constructor(...args: Array<GfVec2d | GfRangeVecBase<GfVec2d>>) {
    super()
    this._initFromArgs(args)
  }
  protected get _vecCtor(): VecCtor<GfVec2d> {
    return GfVec2d
  }
  /** The unit square [(0,0), (1,1)]. */
  static get unitSquare(): GfRange2d {
    return new GfRange2d(new GfVec2d(0, 0), new GfVec2d(1, 1))
  }
}

export class GfRange2f extends GfRange2Base<GfVec2f> {
  constructor(...args: Array<GfVec2f | GfRangeVecBase<GfVec2f>>) {
    super()
    this._initFromArgs(args)
  }
  protected get _vecCtor(): VecCtor<GfVec2f> {
    return GfVec2f
  }
  /** The unit square [(0,0), (1,1)]. */
  static get unitSquare(): GfRange2f {
    return new GfRange2f(new GfVec2f(0, 0), new GfVec2f(1, 1))
  }
}

// ---- dimension 3: corners (LDB..RUF) + octants + unit cube ----

abstract class GfRange3Base<V extends GfVec> extends GfRangeVecBase<V> {
  /**
   * The ith corner, in order LDB, RDB, LUB, RUB, LDF, RDF, LUF, RUF.
   * GfVec((i&1?max:min)[0], (i&2?max:min)[1], (i&4?max:min)[2]).
   */
  getCorner(i: number): V {
    if (i < 0 || i > 7) {
      throw new Error(`Invalid corner ${i} > 7.`)
    }
    const mn = this._min.data
    const mx = this._max.data
    return this._vec([(i & 1 ? mx : mn)[0]!, (i & 2 ? mx : mn)[1]!, (i & 4 ? mx : mn)[2]!])
  }

  /** The ith octant, in the same order as GetCorner. */
  getOctant(i: number): this {
    if (i < 0 || i > 7) {
      throw new Error(`Invalid octant ${i} > 7.`)
    }
    const a = this.getCorner(i).data
    const b = this._min.add(this._max).getScaled(0.5).data
    return this._make(
      this._vec([Math.min(a[0]!, b[0]!), Math.min(a[1]!, b[1]!), Math.min(a[2]!, b[2]!)]),
      this._vec([Math.max(a[0]!, b[0]!), Math.max(a[1]!, b[1]!), Math.max(a[2]!, b[2]!)]),
    )
  }
}

export class GfRange3d extends GfRange3Base<GfVec3d> {
  constructor(...args: Array<GfVec3d | GfRangeVecBase<GfVec3d>>) {
    super()
    this._initFromArgs(args)
  }
  protected get _vecCtor(): VecCtor<GfVec3d> {
    return GfVec3d
  }
  /** The unit cube [(0,0,0), (1,1,1)]. */
  static get unitCube(): GfRange3d {
    return new GfRange3d(new GfVec3d(0, 0, 0), new GfVec3d(1, 1, 1))
  }
}

export class GfRange3f extends GfRange3Base<GfVec3f> {
  constructor(...args: Array<GfVec3f | GfRangeVecBase<GfVec3f>>) {
    super()
    this._initFromArgs(args)
  }
  protected get _vecCtor(): VecCtor<GfVec3f> {
    return GfVec3f
  }
  /** The unit cube [(0,0,0), (1,1,1)]. */
  static get unitCube(): GfRange3f {
    return new GfRange3f(new GfVec3f(0, 0, 0), new GfVec3f(1, 1, 1))
  }
}
