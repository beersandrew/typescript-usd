// Ported from OpenUSD 26.11.1: pxr/base/ts/segment.cpp, pxr/base/ts/segment.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { TsCurveType, TsInterpMode } from './types.ts'

// Ported from OpenUSD v26.08 pxr/base/ts/segment.h and segment.cpp.

/** GfVec2d stand-in: [time, value]. */
export type Ts_Vec2 = [number, number]

// segment.h:22-33.
export enum Ts_SegmentInterp {
  ValueBlock,
  Held,
  Linear,
  Bezier,
  Hermite,
  PreExtrap,
  PostExtrap,
}

const vadd = (a: Ts_Vec2, b: Ts_Vec2): Ts_Vec2 => [a[0] + b[0], a[1] + b[1]]
const vsub = (a: Ts_Vec2, b: Ts_Vec2): Ts_Vec2 => [a[0] - b[0], a[1] - b[1]]

// segment.h:40-170.
export class Ts_Segment {
  p0: Ts_Vec2
  t0: Ts_Vec2
  t1: Ts_Vec2
  p1: Ts_Vec2
  interp: Ts_SegmentInterp

  constructor(
    p0: Ts_Vec2 = [0, 0],
    t0: Ts_Vec2 = [0, 0],
    t1: Ts_Vec2 = [0, 0],
    p1: Ts_Vec2 = [0, 0],
    interp: Ts_SegmentInterp = Ts_SegmentInterp.ValueBlock,
  ) {
    this.p0 = [p0[0], p0[1]]
    this.t0 = [t0[0], t0[1]]
    this.t1 = [t1[0], t1[1]]
    this.p1 = [p1[0], p1[1]]
    this.interp = interp
  }

  clone(): Ts_Segment {
    return new Ts_Segment(this.p0, this.t0, this.t1, this.p1, this.interp)
  }

  // segment.cpp:31-57.
  setInterp(interpMode: TsInterpMode, curveType: TsCurveType): void {
    switch (interpMode) {
      case TsInterpMode.ValueBlock: this.interp = Ts_SegmentInterp.ValueBlock; break
      case TsInterpMode.Held: this.interp = Ts_SegmentInterp.Held; break
      case TsInterpMode.Linear: this.interp = Ts_SegmentInterp.Linear; break
      case TsInterpMode.Curve:
        this.interp = curveType === TsCurveType.Hermite
          ? Ts_SegmentInterp.Hermite
          : Ts_SegmentInterp.Bezier
        break
    }
  }

  // segment.cpp:59-83.
  getInterpMode(): TsInterpMode {
    switch (this.interp) {
      case Ts_SegmentInterp.ValueBlock: return TsInterpMode.ValueBlock
      case Ts_SegmentInterp.Held: return TsInterpMode.Held
      case Ts_SegmentInterp.Linear: return TsInterpMode.Linear
      case Ts_SegmentInterp.Hermite:
      case Ts_SegmentInterp.Bezier: return TsInterpMode.Curve
      default: return TsInterpMode.Held
    }
  }

  /** operator+=(GfVec2d) or operator+=(double timeDelta) (segment.h:50-70). */
  addInPlace(delta: Ts_Vec2 | number): this {
    const d: Ts_Vec2 = typeof delta === 'number' ? [delta, 0] : delta
    if (typeof delta === 'number') {
      this.p0[0] += d[0]; this.t0[0] += d[0]; this.t1[0] += d[0]; this.p1[0] += d[0]
    } else {
      this.p0 = vadd(this.p0, d); this.t0 = vadd(this.t0, d)
      this.t1 = vadd(this.t1, d); this.p1 = vadd(this.p1, d)
    }
    return this
  }

  /** operator-=(GfVec2d) or operator-=(double timeDelta) (segment.h:72-92). */
  subInPlace(delta: Ts_Vec2 | number): this {
    if (typeof delta === 'number') {
      this.p0[0] -= delta; this.t0[0] -= delta; this.t1[0] -= delta; this.p1[0] -= delta
    } else {
      this.p0 = vsub(this.p0, delta); this.t0 = vsub(this.t0, delta)
      this.t1 = vsub(this.t1, delta); this.p1 = vsub(this.p1, delta)
    }
    return this
  }

  add(delta: Ts_Vec2 | number): Ts_Segment { return this.clone().addInPlace(delta) }
  Sub(delta: Ts_Vec2 | number): Ts_Segment { return this.clone().subInPlace(delta) }

  /** Unary negation: negates times, keeping p0 earliest (segment.h:110-126). */
  negate(): Ts_Segment {
    const r = this.clone()
    r.p0[0] = -r.p0[0]
    r.t0[0] = -r.t0[0]
    r.t1[0] = -r.t1[0]
    r.p1[0] = -r.p1[0]
    ;[r.p0, r.p1] = [r.p1, r.p0]
    ;[r.t0, r.t1] = [r.t1, r.t0]
    return r
  }

  equals(rhs: Ts_Segment): boolean {
    const eq = (a: Ts_Vec2, b: Ts_Vec2): boolean => a[0] === b[0] && a[1] === b[1]
    return eq(this.p0, rhs.p0) && eq(this.t0, rhs.t0) && eq(this.t1, rhs.t1) &&
      eq(this.p1, rhs.p1) && this.interp === rhs.interp
  }

  // segment.h:142-149 (GfIsClose on vectors compares Euclidean distance).
  IsClose(other: Ts_Segment, tolerance: number): boolean {
    const close = (a: Ts_Vec2, b: Ts_Vec2): boolean =>
      Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance
    return this.interp === other.interp &&
      close(this.p0, other.p0) && close(this.t0, other.t0) &&
      close(this.t1, other.t1) && close(this.p1, other.p1)
  }

  // segment.cpp:85-131.
  _computeDerivative(uIn: number): number {
    const u = Math.min(Math.max(uIn, 0.0), 1.0)
    switch (this.interp) {
      case Ts_SegmentInterp.ValueBlock:
      case Ts_SegmentInterp.Held:
        return 0.0
      case Ts_SegmentInterp.Linear:
        return (this.p1[1] - this.p0[1]) / (this.p1[0] - this.p0[0])
      case Ts_SegmentInterp.PreExtrap:
        return this.p0[1]
      case Ts_SegmentInterp.PostExtrap:
        return this.p1[1]
      case Ts_SegmentInterp.Bezier:
      case Ts_SegmentInterp.Hermite:
        if (u <= 0.5) {
          const tangent = vsub(this.t0, this.p0)
          return tangent[1] / tangent[0]
        } else {
          const tangent = vsub(this.p1, this.t1)
          return tangent[1] / tangent[0]
        }
    }
    return 0.0
  }

  // segment.cpp:139-147.
  toString(): string {
    const names = ['Value Block', 'Held', 'Linear', 'Bezier', 'Hermite', 'PreExtrap', 'PostExtrap']
    return `Ts_Segment{{${this.p0[0]}, ${this.p0[1]}}, {${this.t0[0]}, ${this.t0[1]}}, ` +
      `{${this.t1[0]}, ${this.t1[1]}}, {${this.p1[0]}, ${this.p1[1]}}, ` +
      `Ts_SegmentInterp::${names[this.interp] ?? ''}}`
  }
}
