// Ported from OpenVDB 10.1.0: openvdb/openvdb/tools/Interpolation.h
// Copyright Contributors to the OpenVDB Project. Mozilla Public License 2.0.
// This Source Code Form is subject to the terms of the Mozilla Public License,
//  v. 2.0. If a copy of the MPL was not distributed with this file, You can
//  obtain one at https://mozilla.org/MPL/2.0/.
// Translated to TypeScript and modified. See LICENSE-OpenVDB-10.1.0.txt and
//  NOTICE.

// Port of openvdb/tools/Interpolation.h BoxSampler (trilinear) from OpenVDB
// 10.1.0, the version OpenUSD 26.11.1's reference build links.
//
// Values are float (comps = 1) or Vec3f (comps = 3); each component is
// interpolated as upstream's ValueT arithmetic does: (b - a) in float, times
// the double weight in double, converted to float, added to a in float.

import type { Coord, Vec3 } from '@vdb/nanovdb'
import type { ValueAccessor } from '../tree/ValueAccessor.ts'

const f32 = Math.fround

export const BoxSampler = {
  // tools/Interpolation.h:119-125
  name: 'box',
  radius: 1,
  mipmap: true,
  consistent: true,
  staggered: false,
  order: 1,
} as const

/** Scratch storage for one sample: the 8 cell values (data[2][2][2]). */
export class BoxSamplerScratch {
  readonly data: Float32Array
  readonly ijk: Coord = [0, 0, 0]
  constructor(readonly comps: number) {
    this.data = new Float32Array(8 * comps)
  }
}

/**
 * tools/Interpolation.h:743-760 BoxSampler::sample(inTree, inCoord, result):
 * trilinear reconstruction at the index-space point `inCoord`, written to
 * result[0 .. comps); returns true if any of the 8 neighbours is active
 * (probeValues, 656-686).
 */
export function boxSample(
  acc: ValueAccessor,
  inCoord: Vec3,
  result: Float32Array,
  scratch: BoxSamplerScratch,
): boolean {
  // local_util::floorVec3 (Interpolation.h:583-587)
  const i = Math.floor(inCoord[0])
  const j = Math.floor(inCoord[1])
  const k = Math.floor(inCoord[2])
  const u = inCoord[0] - i
  const v = inCoord[1] - j
  const w = inCoord[2] - k
  const comps = scratch.comps
  const d = scratch.data
  // probeValues: data[ii][jj][kk] stored at ((ii*2 + jj)*2 + kk) * comps
  const c = scratch.ijk
  let active = false
  c[0] = i; c[1] = j; c[2] = k
  active = acc.probeValue(c, d, 0) || active // data[0][0][0]
  c[2] += 1
  active = acc.probeValue(c, d, 1 * comps) || active // data[0][0][1]
  c[1] += 1
  active = acc.probeValue(c, d, 3 * comps) || active // data[0][1][1]
  c[2] -= 1
  active = acc.probeValue(c, d, 2 * comps) || active // data[0][1][0]
  c[0] += 1
  c[1] -= 1
  active = acc.probeValue(c, d, 4 * comps) || active // data[1][0][0]
  c[2] += 1
  active = acc.probeValue(c, d, 5 * comps) || active // data[1][0][1]
  c[1] += 1
  active = acc.probeValue(c, d, 7 * comps) || active // data[1][1][1]
  c[2] -= 1
  active = acc.probeValue(c, d, 6 * comps) || active // data[1][1][0]
  // trilinearInterpolation (Interpolation.h:710-738)
  for (let n = 0; n < comps; ++n) {
    result[n] = interpolate(
      interpolate(
        interpolate(d[n]!, d[1 * comps + n]!, w),
        interpolate(d[2 * comps + n]!, d[3 * comps + n]!, w),
        v,
      ),
      interpolate(
        interpolate(d[4 * comps + n]!, d[5 * comps + n]!, w),
        interpolate(d[6 * comps + n]!, d[7 * comps + n]!, w),
        v,
      ),
      u,
    )
  }
  return active
}

/** Interpolation.h:714-720 _interpolate(a, b, weight) = a + ValueT((b - a) * weight) */
function interpolate(a: number, b: number, weight: number): number {
  return f32(a + f32(f32(b - a) * weight))
}
