// Ported from OpenVDB 13.0.1: openvdb/openvdb/math/Maps.h,
//  openvdb/openvdb/math/Maps.cc
// Copyright Contributors to the OpenVDB Project. Apache License 2.0.
// With additions ported from OpenVDB 10.1.0: openvdb/openvdb/math/Maps.h,
//  openvdb/openvdb/math/Maps.cc
// Copyright Contributors to the OpenVDB Project. Mozilla Public License 2.0.
// This file contains code ported from OpenVDB 10.1.0 and is licensed under the
//  Mozilla Public License 2.0 as a whole. This Source Code Form is subject to
//  the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was
//  not distributed with this file, You can obtain one at
//  https://mozilla.org/MPL/2.0/.
// Translated to TypeScript and modified. See LICENSE-OpenVDB-10.1.0.txt and
//  NOTICE.

// Port of openvdb/math/Maps.h (read + apply): the map registry subset the
// read scope needs. Every map exposes applyMap/applyInverseMap (index <->
// world) and its serialized layout matches upstream's read() exactly.
//
// NonlinearFrustumMap is not implemented (no consumer; read throws with a
// clear message rather than misparsing — extend when a real file needs it).
//
// isLinear, getAffineMap, isEqual, the value constructors (create/fromMat4)
// and simplify are ported from OpenVDB 10.1.0, the version OpenUSD 26.11.1's
// reference build links (math/Maps.h, math/Maps.cc); they use the
// upstream-order arithmetic of math/Mat4.ts.

import { fma, type Vec3 } from '@vdb/nanovdb'
import type { Stream } from '../io/Stream.ts'
import {
  TOLERANCE_DOUBLE,
  isApproxEqual,
  isDiagonal,
  mat3Det,
  mat4Eq,
  mat4GetMat3,
  mat4Identity,
  mat4Inverse,
  mat4IsAffine,
  mat4Mul,
  mat4Scale,
  mat4SetTranslation,
  mat4Translation,
  vec3Eq,
  vec3MulMat4,
} from './Mat4.ts'

export interface MapBase {
  readonly type: string
  applyMap(xyz: Vec3): Vec3
  applyInverseMap(xyz: Vec3): Vec3
  voxelSize(): Vec3
  /** row-major 4x4 affine matrix (upstream AffineMap::getMat4) */
  getAffineMat4(): number[]
  /** math/Maps.h MapBase::isLinear (true for every map ported here) */
  isLinear(): boolean
  /** math/Maps.h MapBase::getAffineMap: an equivalent AffineMap */
  getAffineMap(): AffineMap
  /** math/Maps.h MapBase::isEqual: same map type and operator== */
  isEqual(other: MapBase): boolean
}

/**
 * math/Maps.h:665-677 ScaleMap(const Vec3d&) derived values: voxel size
 * |scale|, 1/scale, (1/scale)^2, (1/scale)/2; throws for a near-zero
 * determinant as upstream.
 */
function scaleDerived(scale: Vec3): [Vec3, Vec3, Vec3, Vec3] {
  const determinant = scale[0] * scale[1] * scale[2]
  if (Math.abs(determinant) < 3.0 * TOLERANCE_DOUBLE) throw new Error('Non-zero scale values required')
  const inv: Vec3 = [1.0 / scale[0], 1.0 / scale[1], 1.0 / scale[2]]
  return [
    [Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2])],
    inv,
    [inv[0] * inv[0], inv[1] * inv[1], inv[2] * inv[2]],
    [inv[0] / 2, inv[1] / 2, inv[2] / 2],
  ]
}

/** ScaleMap / UniformScaleMap: 5 Vec3d — scale, voxelSize, 1/scale, 1/scale^2, 1/(2*scale) */
export class ScaleMap implements MapBase {
  constructor(
    readonly type: string,
    readonly scaleValues: Vec3,
    readonly voxelSizeValues: Vec3,
    readonly scaleValuesInverse: Vec3,
    readonly invScaleSqr: Vec3,
    readonly invTwiceScale: Vec3,
  ) {}

  static read(s: Stream, type: string): ScaleMap {
    return new ScaleMap(type, s.vec3d(), s.vec3d(), s.vec3d(), s.vec3d(), s.vec3d())
  }

  /** math/Maps.h:665-677 ScaleMap(scale); UniformScaleMap(s) (912) passes (s, s, s) */
  static create(scale: Vec3, type: 'ScaleMap' | 'UniformScaleMap' = 'ScaleMap'): ScaleMap {
    return new ScaleMap(type, [...scale], ...scaleDerived(scale))
  }

  isLinear(): boolean {
    return true
  }

  /** math/Maps.h:851-854 getAffineMap: AffineMap(scale<Mat4d>(mScaleValues)) */
  getAffineMap(): AffineMap {
    return AffineMap.fromMat4(mat4Scale(this.scaleValues))
  }

  /** math/Maps.h:839-847 isEqual: same type, mScaleValues.eq */
  isEqual(other: MapBase): boolean {
    return other.type === this.type && other instanceof ScaleMap && vec3Eq(this.scaleValues, other.scaleValues)
  }

  applyMap(xyz: Vec3): Vec3 {
    return [xyz[0] * this.scaleValues[0], xyz[1] * this.scaleValues[1], xyz[2] * this.scaleValues[2]]
  }

  applyInverseMap(xyz: Vec3): Vec3 {
    return [
      xyz[0] * this.scaleValuesInverse[0],
      xyz[1] * this.scaleValuesInverse[1],
      xyz[2] * this.scaleValuesInverse[2],
    ]
  }

  voxelSize(): Vec3 {
    return [...this.voxelSizeValues]
  }

  getAffineMat4(): number[] {
    const [sx, sy, sz] = this.scaleValues
    return [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]
  }
}

/** ScaleTranslateMap / UniformScaleTranslateMap: translation + the 5 scale Vec3ds */
export class ScaleTranslateMap implements MapBase {
  constructor(
    readonly type: string,
    readonly translation: Vec3,
    readonly scale: ScaleMap,
  ) {}

  static read(s: Stream, type: string): ScaleTranslateMap {
    const translation = s.vec3d()
    return new ScaleTranslateMap(type, translation, ScaleMap.read(s, type))
  }

  /**
   * math/Maps.h:1179-1192 ScaleTranslateMap(scale, translate);
   * UniformScaleTranslateMap(s, t) (1485-1486) passes (s, s, s).
   */
  static create(
    scale: Vec3,
    translate: Vec3,
    type: 'ScaleTranslateMap' | 'UniformScaleTranslateMap' = 'ScaleTranslateMap',
  ): ScaleTranslateMap {
    return new ScaleTranslateMap(type, [...translate], new ScaleMap(type, [...scale], ...scaleDerived(scale)))
  }

  isLinear(): boolean {
    return true
  }

  /**
   * math/Maps.h:1392-1397 getAffineMap: AffineMap(scale<Mat4d>(scale)) then
   * accumPostTranslation (Mat4::postTranslate, i.e. M * Translation(t)).
   */
  getAffineMap(): AffineMap {
    return AffineMap.fromMat4(mat4Mul(mat4Scale(this.scale.scaleValues), mat4Translation(this.translation)))
  }

  /** math/Maps.h:1379-1388 isEqual: same type, scale and translation .eq */
  isEqual(other: MapBase): boolean {
    return (
      other.type === this.type &&
      other instanceof ScaleTranslateMap &&
      vec3Eq(this.scale.scaleValues, other.scale.scaleValues) &&
      vec3Eq(this.translation, other.translation)
    )
  }

  applyMap(xyz: Vec3): Vec3 {
    const v = this.scale.applyMap(xyz)
    return [v[0] + this.translation[0], v[1] + this.translation[1], v[2] + this.translation[2]]
  }

  applyInverseMap(xyz: Vec3): Vec3 {
    return this.scale.applyInverseMap([
      xyz[0] - this.translation[0],
      xyz[1] - this.translation[1],
      xyz[2] - this.translation[2],
    ])
  }

  voxelSize(): Vec3 {
    return this.scale.voxelSize()
  }

  getAffineMat4(): number[] {
    const m = this.scale.getAffineMat4()
    m[12] = this.translation[0]
    m[13] = this.translation[1]
    m[14] = this.translation[2]
    return m
  }
}

/** TranslationMap: one Vec3d */
export class TranslationMap implements MapBase {
  readonly type = 'TranslationMap'

  constructor(readonly translation: Vec3) {}

  static read(s: Stream): TranslationMap {
    return new TranslationMap(s.vec3d())
  }

  isLinear(): boolean {
    return true
  }

  /** math/Maps.h:1090-1097 getAffineMap: identity with the translation set */
  getAffineMap(): AffineMap {
    const m = mat4Identity()
    mat4SetTranslation(m, this.translation)
    return AffineMap.fromMat4(m)
  }

  /** math/Maps.h:1079-1085 isEqual: same type, mTranslation.eq */
  isEqual(other: MapBase): boolean {
    return other instanceof TranslationMap && vec3Eq(this.translation, other.translation)
  }

  applyMap(xyz: Vec3): Vec3 {
    return [xyz[0] + this.translation[0], xyz[1] + this.translation[1], xyz[2] + this.translation[2]]
  }

  applyInverseMap(xyz: Vec3): Vec3 {
    return [xyz[0] - this.translation[0], xyz[1] - this.translation[1], xyz[2] - this.translation[2]]
  }

  voxelSize(): Vec3 {
    return [1, 1, 1]
  }

  getAffineMat4(): number[] {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...this.translation, 1]
  }
}

/**
 * AffineMap / UnitaryMap: a 4x4 double matrix (row-major, row-vector
 * convention: world = index * mat). UnitaryMap serializes via its affine.
 */
export class AffineMap implements MapBase {
  private readonly inv: number[]
  private upstreamInv: number[] | null = null

  constructor(
    readonly type: string,
    readonly mat4: number[],
  ) {
    this.inv = invert4x4Affine(mat4)
  }

  static read(s: Stream, type: string): AffineMap {
    const m: number[] = []
    for (let i = 0; i < 16; ++i) m.push(s.float64())
    return new AffineMap(type, m)
  }

  /**
   * math/Maps.h:321-328 AffineMap(const Mat4d&) with updateAcceleration's
   * checks (618-624): throws for a non-affine or nearly singular matrix.
   */
  static fromMat4(m: number[]): AffineMap {
    if (!mat4IsAffine(m)) {
      throw new Error('Tried to initialize an affine transform from a non-affine 4x4 matrix')
    }
    if (Math.abs(mat3Det(mat4GetMat3(m))) < 3.0 * TOLERANCE_DOUBLE) {
      throw new Error('Tried to initialize an affine transform from a nearly singular matrix')
    }
    return new AffineMap('AffineMap', [...m])
  }

  isLinear(): boolean {
    return true
  }

  /** math/Maps.h:547 getAffineMap (UnitaryMap 1807-1809: its AffineMap) */
  getAffineMap(): AffineMap {
    return AffineMap.fromMat4(this.mat4)
  }

  /** math/Maps.h mMatrixInv = mMatrix.inverse() (updateAcceleration, 626) */
  matrixInverse(): number[] {
    return (this.upstreamInv ??= mat4Inverse(this.mat4))
  }

  /** math/Maps.h:470 isScale: the whole 4x4 matrix is diagonal */
  isScale(): boolean {
    return isDiagonal(this.mat4)
  }

  /** math/Maps.h:472 isScaleTranslate: the 3x3 part is diagonal */
  isScaleTranslate(): boolean {
    return isDiagonal(mat4GetMat3(this.mat4))
  }

  /** math/Maps.h:386-396 isEqual: same type, mMatrix.eq and mMatrixInv.eq */
  isEqual(other: MapBase): boolean {
    return (
      other instanceof AffineMap &&
      other.type === this.type &&
      mat4Eq(this.mat4, other.mat4) &&
      mat4Eq(this.matrixInverse(), other.matrixInverse())
    )
  }

  applyMap(xyz: Vec3): Vec3 {
    const m = this.mat4
    // row-vector convention (upstream Mat4::transform): out = xyz * mat
    return [
      fma(xyz[0], m[0]!, fma(xyz[1], m[4]!, fma(xyz[2], m[8]!, m[12]!))),
      fma(xyz[0], m[1]!, fma(xyz[1], m[5]!, fma(xyz[2], m[9]!, m[13]!))),
      fma(xyz[0], m[2]!, fma(xyz[1], m[6]!, fma(xyz[2], m[10]!, m[14]!))),
    ]
  }

  applyInverseMap(xyz: Vec3): Vec3 {
    const m = this.inv
    return [
      fma(xyz[0], m[0]!, fma(xyz[1], m[4]!, fma(xyz[2], m[8]!, m[12]!))),
      fma(xyz[0], m[1]!, fma(xyz[1], m[5]!, fma(xyz[2], m[9]!, m[13]!))),
      fma(xyz[0], m[2]!, fma(xyz[1], m[6]!, fma(xyz[2], m[10]!, m[14]!))),
    ]
  }

  voxelSize(): Vec3 {
    const o = this.applyMap([0, 0, 0])
    const x = this.applyMap([1, 0, 0])
    const y = this.applyMap([0, 1, 0])
    const z = this.applyMap([0, 0, 1])
    const len = (a: Vec3) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])
    return [
      len([x[0] - o[0], x[1] - o[1], x[2] - o[2]]),
      len([y[0] - o[0], y[1] - o[1], y[2] - o[2]]),
      len([z[0] - o[0], z[1] - o[1], z[2] - o[2]]),
    ]
  }

  getAffineMat4(): number[] {
    return [...this.mat4]
  }
}

function invert4x4Affine(m: number[]): number[] {
  // invert the upper-left 3x3, then the translation row (row-vector layout)
  const a = m[0]!,
    b = m[1]!,
    c = m[2]!,
    d = m[4]!,
    e = m[5]!,
    f = m[6]!,
    g = m[8]!,
    h = m[9]!,
    i = m[10]!
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (det === 0) throw new Error('AffineMap is singular')
  const r = 1 / det
  const inv3 = [
    (e * i - f * h) * r,
    (c * h - b * i) * r,
    (b * f - c * e) * r,
    (f * g - d * i) * r,
    (a * i - c * g) * r,
    (c * d - a * f) * r,
    (d * h - e * g) * r,
    (b * g - a * h) * r,
    (a * e - b * d) * r,
  ]
  const tx = m[12]!,
    ty = m[13]!,
    tz = m[14]!
  return [
    inv3[0]!,
    inv3[1]!,
    inv3[2]!,
    0,
    inv3[3]!,
    inv3[4]!,
    inv3[5]!,
    0,
    inv3[6]!,
    inv3[7]!,
    inv3[8]!,
    0,
    -(tx * inv3[0]! + ty * inv3[3]! + tz * inv3[6]!),
    -(tx * inv3[1]! + ty * inv3[4]! + tz * inv3[7]!),
    -(tx * inv3[2]! + ty * inv3[5]! + tz * inv3[8]!),
    1,
  ]
}

/**
 * math/Maps.cc:154-180 simplify(AffineMap): a diagonal matrix becomes a
 * (Uniform)ScaleMap, a diagonal 3x3 part with a translation a
 * (Uniform)ScaleTranslateMap, anything else stays an AffineMap. The scale
 * and translation are read back through AffineMap::applyMap (v * M).
 */
export function simplify(affine: AffineMap): MapBase {
  const m = affine.mat4
  if (affine.isScale()) {
    const scale = vec3MulMat4([1, 1, 1], m)
    if (isApproxEqual(scale[0], scale[1], TOLERANCE_DOUBLE) && isApproxEqual(scale[0], scale[2], TOLERANCE_DOUBLE)) {
      return ScaleMap.create([scale[0], scale[0], scale[0]], 'UniformScaleMap')
    }
    return ScaleMap.create(scale, 'ScaleMap')
  } else if (affine.isScaleTranslate()) {
    const translate = vec3MulMat4([0, 0, 0], m)
    const one = vec3MulMat4([1, 1, 1], m)
    const scale: Vec3 = [one[0] - translate[0], one[1] - translate[1], one[2] - translate[2]]
    if (isApproxEqual(scale[0], scale[1], TOLERANCE_DOUBLE) && isApproxEqual(scale[0], scale[2], TOLERANCE_DOUBLE)) {
      return ScaleTranslateMap.create([scale[0], scale[0], scale[0]], translate, 'UniformScaleTranslateMap')
    }
    return ScaleTranslateMap.create(scale, translate, 'ScaleTranslateMap')
  }
  // could not simplify the general Affine map.
  return affine
}

export function readMap(s: Stream): MapBase {
  const type = s.string()
  switch (type) {
    case 'UniformScaleMap':
    case 'ScaleMap':
      return ScaleMap.read(s, type)
    case 'UniformScaleTranslateMap':
    case 'ScaleTranslateMap':
      return ScaleTranslateMap.read(s, type)
    case 'TranslationMap':
      return TranslationMap.read(s)
    case 'AffineMap':
    case 'UnitaryMap':
      return AffineMap.read(s, type)
    default:
      throw new Error(`Map type ${type} is not implemented (NonlinearFrustumMap is a documented gap)`)
  }
}
