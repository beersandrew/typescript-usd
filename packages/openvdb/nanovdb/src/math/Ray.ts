// Ported from OpenVDB 13.0.1: nanovdb/nanovdb/math/Ray.h
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of nanovdb/math/Ray.h (the subset HDDA/ZeroCrossing need):
// a double-precision ray with slab-method bbox clipping.

import { fmaf32, type Coord, type CoordBBox, type Vec3 } from './Math.ts'

export class Ray {
  readonly invDir: Vec3
  t0: number
  t1: number

  constructor(
    readonly eye: Vec3,
    readonly dir: Vec3,
    t0 = 0,
    t1 = Number.MAX_VALUE,
  ) {
    this.invDir = [1 / dir[0], 1 / dir[1], 1 / dir[2]]
    this.t0 = t0
    this.t1 = t1
  }

  /**
   * Position along the ray (upstream operator()). NOTE upstream computes
   * this with fmaf — the FLOAT fma — even for double rays, so positions
   * are always float32-precision; mirrored here exactly.
   */
  at(t: number): Vec3 {
    const ft = Math.fround(t)
    return [
      fmaf32(ft, Math.fround(this.dir[0]), Math.fround(this.eye[0])),
      fmaf32(ft, Math.fround(this.dir[1]), Math.fround(this.eye[1])),
      fmaf32(ft, Math.fround(this.dir[2]), Math.fround(this.eye[2])),
    ]
  }

  start(): Vec3 {
    return this.at(this.t0)
  }

  /**
   * Intersection times with a CoordBBox (upstream Ray::intersects(CoordBBox):
   * voxel bounds span [min, max + 1)). Returns null on miss.
   */
  intersects(bbox: CoordBBox): { t0: number; t1: number } | null {
    let t0 = this.t0
    let t1 = this.t1
    for (let i = 0; i < 3; ++i) {
      let a = bbox.min[i]!
      let b = bbox.max[i]! + 1
      if (a >= b) return null // empty bounding box
      a = (a - this.eye[i]!) * this.invDir[i]!
      b = (b - this.eye[i]!) * this.invDir[i]!
      if (a > b) {
        const tmp = a
        a = b
        b = tmp
      }
      if (a > t0) t0 = a
      if (b < t1) t1 = b
      if (t0 > t1) return null
    }
    return { t0, t1 }
  }

  /** Clip this ray to a bbox; returns false (unchanged) on miss (upstream Ray::clip). */
  clip(bbox: CoordBBox): boolean {
    const hit = this.intersects(bbox)
    if (hit) {
      this.t0 = hit.t0
      this.t1 = hit.t1
    }
    return hit !== null
  }
}

/** Component-wise floor to integer coordinates (upstream RoundDown<Coord>). */
export function roundDown(xyz: Vec3): Coord {
  return [Math.floor(xyz[0]), Math.floor(xyz[1]), Math.floor(xyz[2])]
}
