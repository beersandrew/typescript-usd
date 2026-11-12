// Ported from OpenUSD 26.11.1: pxr/base/gf/rect2i.cpp, pxr/base/gf/rect2i.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors OpenUSD pxr/base/gf/rect2i.{h,cpp}.
//
// GfRect2i: a 2D rectangle with integer coordinates, stored as min/max corners
// where min's x/y are assumed <= max's. The max corner is INCLUSIVE when
// computing size, so width = maxX - minX + 1 and height = maxY - minY + 1
// (a single-point rect has width == height == 1).
//
// Faithful 1:1 port of the C++ class onto a TS class. Operators are exposed as
// methods (C++ operator each is noted): operator== -> equals, operator!= via
// !equals, operator+= -> UnionWith (mutating GetUnion), operator+ -> Add.
// No FAITHFULNESS-DEBT: every method ports the upstream algorithm verbatim.

import { GfVec2i } from './vec.ts'

export class GfRect2i {
  private _min: GfVec2i
  private _max: GfVec2i

  /**
   * Constructs an empty rectangle (default), a rectangle from min/max corners,
   * or a rectangle from a min corner and a width/height. Mirrors the three
   * GfRect2i constructors.
   */
  constructor()
  constructor(min: GfVec2i, max: GfVec2i)
  constructor(min: GfVec2i, width: number, height: number)
  constructor(min?: GfVec2i, arg2?: GfVec2i | number, height?: number) {
    if (min === undefined) {
      // Empty rectangle: _min(0,0), _max(-1,-1).
      this._min = new GfVec2i(0, 0)
      this._max = new GfVec2i(-1, -1)
    } else if (arg2 instanceof GfVec2i) {
      this._min = new GfVec2i(min)
      this._max = new GfVec2i(arg2)
    } else {
      const width = arg2 as number
      const h = height as number
      this._min = new GfVec2i(min)
      // _max = min + GfVec2i(width-1, height-1)
      this._max = new GfVec2i(min.get(0) + (width - 1), min.get(1) + (h - 1))
    }
  }

  /** Copy this rectangle (mirrors C++ copy-construction). */
  Clone(): GfRect2i {
    return new GfRect2i(this._min, this._max)
  }

  /**
   * Returns true if the rectangle is a null rectangle (width == 0 && height
   * == 0, i.e. maxX == minX-1 and maxY == minY-1). A null rect is both empty
   * and not valid.
   */
  isNull(): boolean {
    return this.getWidth() === 0 && this.getHeight() === 0
  }

  /**
   * Returns true if the rectangle is empty (one or both min coords strictly
   * greater than the corresponding max coord). An empty rect is not valid.
   */
  IsEmpty(): boolean {
    return this.getWidth() <= 0 || this.getHeight() <= 0
  }

  /** Returns true if the rectangle is valid (equivalently, not empty). */
  isValid(): boolean {
    return !this.IsEmpty()
  }

  /**
   * Returns a normalized rectangle, i.e. one with non-negative width and
   * height. Swaps min/max x-coords to ensure non-negative width, similarly y.
   */
  GetNormalized(): GfRect2i {
    const min = new GfVec2i(0, 0)
    const max = new GfVec2i(0, 0)

    if (this._max.get(0) < this._min.get(0)) {
      min.setComponent(0, this._max.get(0))
      max.setComponent(0, this._min.get(0))
    } else {
      min.setComponent(0, this._min.get(0))
      max.setComponent(0, this._max.get(0))
    }

    if (this._max.get(1) < this._min.get(1)) {
      min.setComponent(1, this._max.get(1))
      max.setComponent(1, this._min.get(1))
    } else {
      min.setComponent(1, this._min.get(1))
      max.setComponent(1, this._max.get(1))
    }

    return new GfRect2i(min, max)
  }

  /** Returns the min corner of the rectangle. */
  getMin(): GfVec2i {
    return this._min
  }

  /** Returns the max corner of the rectangle. */
  getMax(): GfVec2i {
    return this._max
  }

  /** Sets the min corner of the rectangle. */
  setMin(min: GfVec2i): void {
    this._min = new GfVec2i(min)
  }

  /** Sets the max corner of the rectangle. */
  setMax(max: GfVec2i): void {
    this._max = new GfVec2i(max)
  }

  /** Return the X value of the min corner. */
  getMinX(): number {
    return this._min.get(0)
  }

  /** Set the X value of the min corner. */
  setMinX(x: number): void {
    this._min.setComponent(0, x)
  }

  /** Return the X value of the max corner. */
  getMaxX(): number {
    return this._max.get(0)
  }

  /** Set the X value of the max corner. */
  setMaxX(x: number): void {
    this._max.setComponent(0, x)
  }

  /** Return the Y value of the min corner. */
  getMinY(): number {
    return this._min.get(1)
  }

  /** Set the Y value of the min corner. */
  setMinY(y: number): void {
    this._min.setComponent(1, y)
  }

  /** Return the Y value of the max corner. */
  getMaxY(): number {
    return this._max.get(1)
  }

  /** Set the Y value of the max corner. */
  setMaxY(y: number): void {
    this._max.setComponent(1, y)
  }

  /** Returns the center point of the rectangle: (_min + _max) / 2. */
  getCenter(): GfVec2i {
    // Integer division truncating toward zero, matching GfVec2i operator/(int).
    return new GfVec2i(
      Math.trunc((this._min.get(0) + this._max.get(0)) / 2),
      Math.trunc((this._min.get(1) + this._max.get(1)) / 2),
    )
  }

  /** Move the rectangle by `displacement`. */
  Translate(displacement: GfVec2i): void {
    this._min = this._min.add(displacement)
    this._max = this._max.add(displacement)
  }

  /** Return the area of the rectangle (width * height). */
  getArea(): number {
    return this.getWidth() * this.getHeight()
  }

  /** Returns the size of the rectangle as a vector (width, height). */
  getSize(): GfVec2i {
    return new GfVec2i(this.getWidth(), this.getHeight())
  }

  /**
   * Returns the width of the rectangle. If min and max x-coords are
   * coincident, the width is one.
   */
  getWidth(): number {
    return this._max.get(0) - this._min.get(0) + 1
  }

  /**
   * Returns the height of the rectangle. If min and max y-coords are
   * coincident, the height is one.
   */
  getHeight(): number {
    return this._max.get(1) - this._min.get(1) + 1
  }

  /** Computes the intersection of two rectangles. */
  getIntersection(that: GfRect2i): GfRect2i {
    if (this.IsEmpty()) {
      return this.Clone()
    } else if (that.IsEmpty()) {
      return that.Clone()
    } else {
      return new GfRect2i(
        new GfVec2i(
          Math.max(this._min.get(0), that._min.get(0)),
          Math.max(this._min.get(1), that._min.get(1)),
        ),
        new GfVec2i(
          Math.min(this._max.get(0), that._max.get(0)),
          Math.min(this._max.get(1), that._max.get(1)),
        ),
      )
    }
  }

  /** Computes the intersection of two rectangles. @deprecated Use GetIntersection(). */
  intersect(that: GfRect2i): GfRect2i {
    return this.getIntersection(that)
  }

  /** Computes the union of two rectangles. */
  getUnion(that: GfRect2i): GfRect2i {
    if (this.IsEmpty()) {
      return that.Clone()
    } else if (that.IsEmpty()) {
      return this.Clone()
    } else {
      return new GfRect2i(
        new GfVec2i(
          Math.min(this._min.get(0), that._min.get(0)),
          Math.min(this._min.get(1), that._min.get(1)),
        ),
        new GfVec2i(
          Math.max(this._max.get(0), that._max.get(0)),
          Math.max(this._max.get(1), that._max.get(1)),
        ),
      )
    }
  }

  /** Computes the union of two rectangles. @deprecated Use GetUnion(). */
  union(that: GfRect2i): GfRect2i {
    return this.getUnion(that)
  }

  /**
   * operator+= : sets this rectangle to the union with `that` and returns
   * this. Mirrors GfRect2i::operator+=.
   */
  unionWith(that: GfRect2i): GfRect2i {
    const u = this.getUnion(that)
    this._min = u._min
    this._max = u._max
    return this
  }

  /** operator+ : returns the union of two rectangles. */
  add(that: GfRect2i): GfRect2i {
    return this.Clone().unionWith(that)
  }

  /** Returns true if the specified point is in the rectangle. */
  contains(p: GfVec2i): boolean {
    return (
      p.get(0) >= this._min.get(0) &&
      p.get(0) <= this._max.get(0) &&
      p.get(1) >= this._min.get(1) &&
      p.get(1) <= this._max.get(1)
    )
  }

  /** operator== : true if min and max corners are equal. */
  equals(that: GfRect2i): boolean {
    return this._min.equals(that._min) && this._max.equals(that._max)
  }

  /** Output format [(x, y):(x, y)], mirroring operator<<. */
  toString(): string {
    return `[(${this._min.get(0)}, ${this._min.get(1)}):(${this._max.get(0)}, ${this._max.get(1)})]`
  }
}
