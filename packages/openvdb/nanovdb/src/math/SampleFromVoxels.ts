// Ported from OpenVDB 13.0.1: nanovdb/nanovdb/math/SampleFromVoxels.h
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of nanovdb/math/SampleFromVoxels.h (orders 0 and 1): nearest-
// neighbor and trilinear interpolation over a ReadAccessor. Inputs are
// float32 index-space coordinates and every arithmetic step mirrors the
// upstream float path via Math.fround, so results are bit-exact against
// the C++ sampler (verified by the trilinear oracle fixtures).

import type { ReadAccessor } from '../NanoVDB.ts'
import { fmaf32, type Coord, type Vec3 } from './Math.ts'

/** upstream Floor for Vec3<float>: integer part + float fractional remainder */
function floorFrac(xyz: Vec3): { ijk: Coord; uvw: Vec3 } {
  const fx = Math.floor(xyz[0])
  const fy = Math.floor(xyz[1])
  const fz = Math.floor(xyz[2])
  return {
    ijk: [fx | 0, fy | 0, fz | 0],
    uvw: [Math.fround(xyz[0] - fx), Math.fround(xyz[1] - fy), Math.fround(xyz[2] - fz)],
  }
}

/**
 * float lerp: a + w*(b-a). The C++ build contracts this expression into a
 * float fma (clang -ffp-contract=on at -O3), so the sum and product round
 * ONCE to float32 — reproduced here with an exact-arithmetic float fma.
 */
function lerp(a: number, b: number, w: number): number {
  return fmaf32(w, Math.fround(b - a), a)
}

/** rintf: round half to even (JS Math.round rounds half up) */
function rint(x: number): number {
  const f = Math.floor(x)
  const d = x - f
  if (d > 0.5) return f + 1
  if (d < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}

/** Nearest-neighbor (order 0) sampler (upstream SampleFromVoxels<T, 0>). */
export class NearestNeighborSampler<V> {
  constructor(readonly acc: ReadAccessor<V>) {}

  sample(xyz: Vec3): V {
    // upstream Round<CoordT> for floats is rintf: round half to even
    return this.acc.getValue([rint(xyz[0]) | 0, rint(xyz[1]) | 0, rint(xyz[2]) | 0])
  }
}

/** Trilinear (order 1) sampler for float grids (upstream TrilinearSampler). */
export class TrilinearSampler {
  constructor(readonly acc: ReadAccessor<number>) {}

  /** the 2x2x2 stencil around ijk, in upstream's read order */
  stencil(ijk: Coord): Float32Array {
    const acc = this.acc
    const v = new Float32Array(8) // [i][j][k] flattened as i*4 + j*2 + k
    v[0] = acc.getValue(ijk) // i, j, k
    ijk[2] += 1
    v[1] = acc.getValue(ijk) // i, j, k+1
    ijk[1] += 1
    v[3] = acc.getValue(ijk) // i, j+1, k+1
    ijk[2] -= 1
    v[2] = acc.getValue(ijk) // i, j+1, k
    ijk[0] += 1
    ijk[1] -= 1
    v[4] = acc.getValue(ijk) // i+1, j, k
    ijk[2] += 1
    v[5] = acc.getValue(ijk) // i+1, j, k+1
    ijk[1] += 1
    v[7] = acc.getValue(ijk) // i+1, j+1, k+1
    ijk[2] -= 1
    v[6] = acc.getValue(ijk) // i+1, j+1, k
    return v
  }

  static interpolate(uvw: Vec3, v: Float32Array): number {
    return lerp(
      lerp(lerp(v[0]!, v[1]!, uvw[2]), lerp(v[2]!, v[3]!, uvw[2]), uvw[1]),
      lerp(lerp(v[4]!, v[5]!, uvw[2]), lerp(v[6]!, v[7]!, uvw[2]), uvw[1]),
      uvw[0],
    )
  }

  sample(xyz: Vec3): number {
    const { ijk, uvw } = floorFrac(xyz)
    return TrilinearSampler.interpolate(uvw, this.stencil(ijk))
  }
}

/** Trilinear (order 1) sampler for Vec3f grids (upstream's vector ValueT path). */
export class TrilinearVec3Sampler {
  constructor(readonly acc: ReadAccessor<Vec3>) {}

  sample(xyz: Vec3): Vec3 {
    const { ijk, uvw } = floorFrac(xyz)
    const acc = this.acc
    const v: Vec3[] = new Array<Vec3>(8)
    v[0] = acc.getValue(ijk)
    ijk[2] += 1
    v[1] = acc.getValue(ijk)
    ijk[1] += 1
    v[3] = acc.getValue(ijk)
    ijk[2] -= 1
    v[2] = acc.getValue(ijk)
    ijk[0] += 1
    ijk[1] -= 1
    v[4] = acc.getValue(ijk)
    ijk[2] += 1
    v[5] = acc.getValue(ijk)
    ijk[1] += 1
    v[7] = acc.getValue(ijk)
    ijk[2] -= 1
    v[6] = acc.getValue(ijk)
    // Vec3f lerp goes through Vec3 operator overloads upstream — separate
    // mul and add expressions, so NO fma contraction (unlike the scalar
    // path): each float op rounds individually.
    const vlerp = (a: number, b: number, w: number): number =>
      Math.fround(a + Math.fround(w * Math.fround(b - a)))
    const out: Vec3 = [0, 0, 0]
    for (let c = 0; c < 3; ++c) {
      out[c] = vlerp(
        vlerp(vlerp(v[0]![c]!, v[1]![c]!, uvw[2]), vlerp(v[2]![c]!, v[3]![c]!, uvw[2]), uvw[1]),
        vlerp(vlerp(v[4]![c]!, v[5]![c]!, uvw[2]), vlerp(v[6]![c]!, v[7]![c]!, uvw[2]), uvw[1]),
        uvw[0],
      )
    }
    return out
  }
}

/** upstream createSampler<Order>(acc) for the orders the read scope ships */
export function createSampler(acc: ReadAccessor<number>, order: 0): NearestNeighborSampler<number>
export function createSampler(acc: ReadAccessor<number>, order: 1): TrilinearSampler
export function createSampler(
  acc: ReadAccessor<number>,
  order: 0 | 1,
): NearestNeighborSampler<number> | TrilinearSampler {
  return order === 0 ? new NearestNeighborSampler(acc) : new TrilinearSampler(acc)
}
