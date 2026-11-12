// Ported from OpenVDB 13.0.1: nanovdb/nanovdb/math/HDDA.h
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of nanovdb/math/HDDA.h: the hierarchical DDA that marches a ray
// through the VDB tree at varying node resolutions, and the ZeroCrossing
// level-set intersector built on it. Double-precision times (matching the
// oracle's Ray<double> instantiation); the reported crossing time and the
// sign test mirror upstream's float casts exactly.

import type { ReadAccessor } from '../NanoVDB.ts'
import { fma, type Coord, type Vec3 } from './Math.ts'
import { Ray, roundDown } from './Ray.ts'

// The oracle binary contracts `t0 + x * inv` expressions into double fmas
// (clang -ffp-contract=on); the software fma reproduces that rounding.

// float constants of the ENFORCE_FORWARD_STEPPING adjustment (0.999999f, 1e-6f)
const FWD_C1 = Math.fround(0.999999)
const FWD_C2 = Math.fround(1.0e-6)

export class HDDA {
  private mDim = 0
  private mT0 = 0
  private mT1 = 0
  private readonly mVoxel: Coord = [0, 0, 0]
  private readonly mStep: Coord = [0, 0, 0]
  private readonly mDelta: Vec3 = [0, 0, 0]
  private readonly mNext: Vec3 = [0, 0, 0]

  constructor(ray: Ray, dim: number) {
    this.init(ray, ray.t0, ray.t1, dim)
  }

  init(ray: Ray, startTime: number, maxTime: number, dim: number): void {
    this.mDim = dim
    this.mT0 = startTime
    this.mT1 = maxTime
    const pos = ray.at(this.mT0)
    const dir = ray.dir
    const inv = ray.invDir
    const voxel = roundDown(pos)
    for (let axis = 0; axis < 3; ++axis) {
      this.mVoxel[axis] = voxel[axis]! & ~(dim - 1)
      if (dir[axis] === 0) {
        this.mNext[axis] = Number.MAX_VALUE // i.e. disabled!
        this.mStep[axis] = 0
      } else if (inv[axis]! > 0) {
        this.mStep[axis] = 1
        this.mNext[axis] = fma(this.mVoxel[axis]! + dim - pos[axis]!, inv[axis]!, this.mT0)
        this.mDelta[axis] = inv[axis]!
      } else {
        this.mStep[axis] = -1
        this.mNext[axis] = fma(this.mVoxel[axis]! - pos[axis]!, inv[axis]!, this.mT0)
        this.mDelta[axis] = -inv[axis]!
      }
    }
  }

  /** Re-target the DDA to march at a new node dimension (upstream HDDA::update). */
  update(ray: Ray, dim: number): boolean {
    if (this.mDim === dim) return false

    // compute valid voxel range from the previous dim
    const voxelMax: Coord = [0, 0, 0]
    const voxelMin: Coord = [0, 0, 0]
    for (let i = 0; i < 3; ++i) {
      voxelMax[i] = (this.mVoxel[i]! + this.mDim - 1) & ~(dim - 1)
      voxelMin[i] = this.mVoxel[i]! & ~(dim - 1)
    }

    this.mDim = dim
    const pos = ray.at(this.mT0)
    const inv = ray.invDir
    const voxel = roundDown(pos)
    for (let i = 0; i < 3; ++i) {
      let v = voxel[i]! & ~(dim - 1)
      if (v > voxelMax[i]!) v = voxelMax[i]!
      if (v < voxelMin[i]!) v = voxelMin[i]!
      this.mVoxel[i] = v
    }

    for (let axis = 0; axis < 3; ++axis) {
      if (this.mStep[axis] === 0) continue
      this.mNext[axis] = fma(this.mVoxel[axis]! - pos[axis]!, inv[axis]!, this.mT0)
      if (this.mStep[axis]! > 0) this.mNext[axis] = fma(dim, inv[axis]!, this.mNext[axis]!)
    }
    return true
  }

  dim(): number {
    return this.mDim
  }

  /** Step to the next intersected voxel/node; false once past maxTime. */
  step(): boolean {
    const axis = minIndex(this.mNext)
    // ENFORCE_FORWARD_STEPPING (unconditionally defined in HDDA.h):
    // nudge a stalled axis strictly forward before committing the step
    if (this.mNext[axis]! <= this.mT0) {
      this.mNext[axis] =
        this.mNext[axis]! + (fma(-FWD_C1, this.mNext[axis]!, this.mT0) + FWD_C2)
    }
    this.mT0 = this.mNext[axis]!
    this.mNext[axis] = fma(this.mDim, this.mDelta[axis]!, this.mNext[axis]!)
    this.mVoxel[axis] = this.mVoxel[axis]! + this.mDim * this.mStep[axis]!
    return this.mT0 <= this.mT1
  }

  voxel(): Coord {
    return [this.mVoxel[0], this.mVoxel[1], this.mVoxel[2]]
  }

  time(): number {
    return this.mT0
  }

  maxTime(): number {
    return this.mT1
  }

  next(): number {
    return Math.min(this.mT1, Math.min(this.mNext[0], Math.min(this.mNext[1], this.mNext[2])))
  }
}

function minIndex(v: Vec3): number {
  // upstream math::MinIndex: strict comparisons — ties resolve to the LATER axis
  if (v[0] < v[1] && v[0] < v[2]) return 0
  return v[1] < v[2] ? 1 : 2
}

export interface ZeroCrossingHit {
  hit: boolean
  ijk: Coord
  /** grid value at ijk (float) */
  v: number
  /** ray time of the crossing, rounded to float like upstream's float& t */
  t: number
}

/**
 * Port of math::ZeroCrossing: marches the ray through empty space with the
 * HDDA at tree-node resolutions and scans active voxels for a sign change.
 */
export function zeroCrossing(ray: Ray, acc: ReadAccessor<number>): ZeroCrossingHit {
  const miss: ZeroCrossingHit = { hit: false, ijk: [0, 0, 0], v: 0, t: 0 }
  if (!ray.clip(acc.rootNode.bbox()) || ray.t1 > 1e20) return miss
  const delta = Math.fround(1.0001)
  let ijk = roundDown(ray.start())
  const hdda = new HDDA(ray, acc.getDim(ijk))
  const v0 = acc.getValue(ijk)
  while (hdda.step()) {
    ijk = roundDown(ray.at(hdda.time() + delta))
    hdda.update(ray, acc.getDim(ijk))
    if (hdda.dim() > 1 || !acc.isActive(ijk)) continue // tile value or inactive voxel
    while (hdda.step() && acc.isActive(hdda.voxel())) {
      // in the narrow band
      const v = acc.getValue(hdda.voxel())
      if (Math.fround(v * v0) < 0) {
        // zero crossing (float product, matching upstream's float math)
        return { hit: true, ijk: hdda.voxel(), v, t: Math.fround(hdda.time()) }
      }
    }
  }
  return miss
}
