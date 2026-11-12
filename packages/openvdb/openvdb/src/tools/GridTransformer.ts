// Ported from OpenVDB 10.1.0: openvdb/openvdb/tools/GridTransformer.h,
//  openvdb/openvdb/tools/ChangeBackground.h, openvdb/openvdb/math/BBox.h
// Copyright Contributors to the OpenVDB Project. Mozilla Public License 2.0.
// This Source Code Form is subject to the terms of the Mozilla Public License,
//  v. 2.0. If a copy of the MPL was not distributed with this file, You can
//  obtain one at https://mozilla.org/MPL/2.0/.
// Translated to TypeScript and modified. See LICENSE-OpenVDB-10.1.0.txt and
//  NOTICE.

// Port of openvdb/tools/GridTransformer.h resampleToMatch<BoxSampler> from
// OpenVDB 10.1.0 (the version OpenUSD 26.11.1's reference build links), with
// tools/ChangeBackground.h changeBackground, for float and Vec3f grids.
//
// Divergences:
// - Level sets: resampleToMatch (GridTransformer.h:484-526) rebuilds a level
//   set input with doLevelSetRebuild (tools/LevelSetRebuild.h), and
//   applyTransform (874-931) clips, prunes and flood-fills level sets. Neither
//   is ported: resampleToMatchBox throws for a level-set input unless the two
//   transforms are equal (the deep-copy case, 491-496, which is ported).
// - Threading: applyTransform runs tbb::parallel_reduce over tiles and
//   leaves, each task writing into its own tree, joined by Tree::merge
//   (RangeProcessor::join, 852-855). This port runs the serial path
//   (mThreaded = false, which upstream also has and which TBB takes when
//   limited to one thread). The two differ only where two input leaves or
//   tiles write the same output voxel: serially the last write is kept,
//   while a join keeps the left task's active value (and its inactive value
//   where both tasks made the leaf). Upstream's threaded result therefore
//   varies from run to run in those voxels; the serial result does not.
// - GridResampler (the non-affine path, 453-460) needs a non-linear map,
//   which this package cannot read (NonlinearFrustumMap): it throws.
// - Interrupters are not ported.

import type { Coord, CoordBBox, Vec3 } from '@vdb/nanovdb'
import { GridClass, VdbGrid } from '../Grid.ts'
import {
  Axis,
  TOLERANCE_FLOAT,
  mat3Det,
  mat3Eq,
  mat3Inverse,
  mat3Mul,
  mat3RotationAxis,
  mat3Scale,
  mat4Eq,
  mat4GetMat3,
  mat4GetTranslation,
  mat4Identity,
  mat4Inverse,
  mat4IsAffine,
  mat4Mul,
  mat4PreRotate,
  mat4PreScale,
  mat4PreTranslate,
  mat4SetTranslation,
  mat4TransformH,
  eulerAnglesXYZ,
  vec3Eq,
  vec3Length,
  vec3MulMat3,
  type Mat4d,
} from '../math/Mat4.ts'
import type { Transform } from '../math/Transform.ts'
import { maskIsOn } from '../io/Compression.ts'
import type { VdbTree, VdbInternalNode } from '../tree/Tree.ts'
import { ValueAccessor } from '../tree/ValueAccessor.ts'
import { BoxSampler, BoxSamplerScratch, boxSample } from './Interpolation.ts'

const f32 = Math.fround

// ---- value comparisons (ValueT = float or Vec3f) ----

/**
 * math::isApproxEqual(a, b) for ValueT: float (math/Math.h:415-419,
 * |a - b| <= 1e-8f in float) or Vec3f (math/Vec3.h:576-579, Vec3::eq with
 * eps 1e-7 relative-or-absolute, float arithmetic).
 */
export function valuesApproxEqual(a: ArrayLike<number>, b: ArrayLike<number>, comps: number): boolean {
  if (comps === 1) return !(Math.abs(f32(a[0]! - b[0]!)) > TOLERANCE_FLOAT)
  const eps = f32(1.0e-7)
  for (let c = 0; c < comps; ++c) {
    const x = a[c]!, y = b[c]!
    if (!(Math.abs(f32(x - y)) > eps)) continue
    const rel = Math.abs(y) > Math.abs(x) ? Math.abs(f32(f32(x - y) / y)) : Math.abs(f32(f32(x - y) / x))
    if (!(rel <= eps)) return false
  }
  return true
}

// ---- tools/ChangeBackground.h ----

/**
 * tools/ChangeBackground.h:103-147 ChangeBackgroundOp / changeBackground:
 * inactive values (root tiles, internal-node tiles, leaf voxels) equal to
 * the old background become the new one, those equal to its negative its
 * negative; then the root's background is set.
 */
export function changeBackground(tree: VdbTree, background: ArrayLike<number>): void {
  const comps = tree.comps
  const oldValue = Float32Array.from(tree.background)
  const newValue = Float32Array.from(background)
  const oldNeg = oldValue.map((v) => -v)
  const newNeg = newValue.map((v) => -v)
  const set = (values: Float32Array, at: number): void => {
    const v = values.subarray(at * comps, (at + 1) * comps)
    if (valuesApproxEqual(v, oldValue, comps)) v.set(newValue)
    else if (valuesApproxEqual(v, oldNeg, comps)) v.set(newNeg)
  }
  for (const { tile } of tree.tiles.values()) if (!tile.active) set(tile.value, 0)
  const visit = (node: VdbInternalNode): void => {
    const numValues = node.values.length / comps
    for (let n = 0; n < numValues; ++n) {
      if (maskIsOn(node.childMask, n)) {
        const child = node.children[n]!
        if ('log2dim' in child) {
          visit(child)
        } else {
          for (let m = 0; m < 512; ++m) if (!maskIsOn(child.valueMask, m)) set(child.buffer, m)
        }
      } else if (!maskIsOn(node.valueMask, n)) {
        set(node.values, n)
      }
    }
  }
  for (const { child } of tree.children.values()) visit(child)
  tree.setBackground(newValue)
}

// ---- local_util::decompose (GridTransformer.h:272-358) ----

const DECOMP_INVALID = 0
const DECOMP_VALID = 1
const DECOMP_UNIQUE = 2

interface Decomposition {
  result: number
  scale: Vec3
  rotate: Vec3
  translate: Vec3
}

/**
 * GridTransformer.h:281-356 decompose: an affine matrix into scale,
 * rotation (XYZ order) and translation, preferring the smallest rotation.
 */
export function decompose(m: Mat4d): Decomposition {
  const out: Decomposition = { result: DECOMP_INVALID, scale: [0, 0, 0], rotate: [0, 0, 0], translate: [0, 0, 0] }
  if (!mat4IsAffine(m)) return out

  // This is the translation in world space
  out.translate = mat4GetTranslation(m)
  const xform = mat4GetMat3(m)

  const unsignedScale: Vec3 = [
    vec3Length(vec3MulMat3([1, 0, 0], xform)),
    vec3Length(vec3MulMat3([0, 1, 0], xform)),
    vec3Length(vec3MulMat3([0, 0, 1], xform)),
  ]
  const hasUniformScale = vec3Eq(unsignedScale, [unsignedScale[0], unsignedScale[0], unsignedScale[0]])

  let hasRotation = false
  let validDecomposition = false
  let minAngle = Number.MAX_VALUE

  // If the transformation matrix contains a reflection, test different
  // negative scales to find a decomposition that favors the optimal
  // resampling algorithm.
  for (let n = 0; n < 8; ++n) {
    const signedScale: Vec3 = [
      n & 0x1 ? -unsignedScale[0] : unsignedScale[0],
      n & 0x2 ? -unsignedScale[1] : unsignedScale[1],
      n & 0x4 ? -unsignedScale[2] : unsignedScale[2],
    ]
    // Extract scale and potentially reflection.
    const mat = mat3Mul(xform, mat3Inverse(mat3Scale(signedScale)))
    if (mat3Det(mat) < 0.0) continue // Skip if mat contains a reflection.

    const tmpAngle = eulerAnglesXYZ(mat)
    const rebuild = mat3Mul(
      mat3Mul(
        mat3Mul(mat3RotationAxis([0, 0, 1], tmpAngle[2]), mat3RotationAxis([0, 1, 0], tmpAngle[1])),
        mat3RotationAxis([1, 0, 0], tmpAngle[0]),
      ),
      mat3Scale(signedScale),
    )
    if (mat3Eq(xform, rebuild)) {
      const maxAngle = Math.max(Math.abs(tmpAngle[0]), Math.max(Math.abs(tmpAngle[1]), Math.abs(tmpAngle[2])))
      if (!(minAngle < maxAngle)) {
        // Update if less or equal.
        minAngle = maxAngle
        out.rotate = tmpAngle
        out.scale = signedScale
        hasRotation = !vec3Eq(out.rotate, [0, 0, 0])
        validDecomposition = true
        if (hasUniformScale || !hasRotation) break // Current decomposition is optimal.
      }
    }
  }
  if (!validDecomposition) return out // shear
  out.result = hasRotation && !hasUniformScale ? DECOMP_VALID : DECOMP_UNIQUE
  return out
}

// ---- GridTransformer::MatrixTransform (GridTransformer.h:367-379) ----

interface Transformer {
  isAffine(): boolean
  transform(pos: Vec3): Vec3
  invTransform(pos: Vec3): Vec3
}

class MatrixTransform implements Transformer {
  mat: Mat4d
  invMat: Mat4d
  constructor(xform?: Mat4d) {
    this.mat = xform ? [...xform] : mat4Identity()
    this.invMat = xform ? mat4Inverse(xform) : mat4Identity()
  }
  isAffine(): boolean {
    return mat4IsAffine(this.mat)
  }
  transform(pos: Vec3): Vec3 {
    return mat4TransformH(this.mat, pos)
  }
  invTransform(pos: Vec3): Vec3 {
    return mat4TransformH(this.invMat, pos)
  }
}

// ---- TileSampler<BoxSampler> (GridTransformer.h:92-120) ----

class TileSampler {
  private readonly min: Vec3
  private readonly max: Vec3
  private readonly empty: boolean

  /** b: the tile's index-space bbox; tileVal, on: its value and state */
  constructor(
    b: CoordBBox,
    private readonly tileVal: Float32Array,
    private readonly active: boolean,
  ) {
    // mBBox.expand(-radius()): math/BBox.h:320-328 BBox::expand(dx) takes
    // |dx|, so the box grows by the radius on each side.
    const r = Math.abs(-BoxSampler.radius)
    this.min = [b.min[0] - r, b.min[1] - r, b.min[2] - r]
    this.max = [b.max[0] + r, b.max[1] + r, b.max[2] + r]
    // BBox<Vec3d>::empty (math/BBox.h:196-203)
    this.empty = this.min[0] >= this.max[0] || this.min[1] >= this.max[1] || this.min[2] >= this.max[2]
  }

  sample(acc: ValueAccessor, inCoord: Vec3, result: Float32Array, scratch: BoxSamplerScratch): boolean {
    // BBox<Vec3d>::isInside (math/BBox.h:266-280), tolerance 1e-15
    const t = 1e-15
    if (
      !this.empty &&
      inCoord[0] > this.min[0] - t && inCoord[0] < this.max[0] + t &&
      inCoord[1] > this.min[1] - t && inCoord[1] < this.max[1] + t &&
      inCoord[2] > this.min[2] - t && inCoord[2] < this.max[2] + t
    ) {
      result.set(this.tileVal)
      return this.active
    }
    return boxSample(acc, inCoord, result, scratch)
  }
}

// ---- GridResampler::transformBBox (GridTransformer.h:938-1037) ----

function transformBBox(
  xform: Transformer,
  bbox: CoordBBox,
  inAcc: ValueAccessor,
  outAcc: ValueAccessor,
  tileSampler: TileSampler | null,
): void {
  const comps = inAcc.tree.comps
  const scratch = new BoxSamplerScratch(comps)
  const result = new Float32Array(comps)
  const sample = (inXYZ: Vec3): boolean =>
    tileSampler ? tileSampler.sample(inAcc, inXYZ, result, scratch) : boxSample(inAcc, inXYZ, result, scratch)

  // Transform the corners of the input tree's bounding box and compute the
  // enclosing bounding box in the output tree.
  const inRMin: Vec3 = [bbox.min[0], bbox.min[1], bbox.min[2]]
  const inRMax: Vec3 = [bbox.max[0] + 1, bbox.max[1] + 1, bbox.max[2] + 1]
  const a = xform.transform(inRMin)
  const b = xform.transform(inRMax)
  const outRMin: Vec3 = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])]
  const outRMax: Vec3 = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]
  for (let i = 0; i < 8; ++i) {
    const corner: Vec3 = [i & 1 ? inRMax[0] : inRMin[0], i & 2 ? inRMax[1] : inRMin[1], i & 4 ? inRMax[2] : inRMin[2]]
    const c = xform.transform(corner)
    // math::minComponent / maxComponent: std::min / std::max per component
    for (let k = 0; k < 3; ++k) {
      if (c[k]! < outRMin[k]!) outRMin[k] = c[k]!
      if (outRMax[k]! < c[k]!) outRMax[k] = c[k]!
    }
  }
  const radius = BoxSampler.radius
  const outMin: Coord = [
    Math.floor(outRMin[0]) - radius,
    Math.floor(outRMin[1]) - radius,
    Math.floor(outRMin[2]) - radius,
  ]
  const outMax: Coord = [
    Math.ceil(outRMax[0]) + radius,
    Math.ceil(outRMax[1]) + radius,
    Math.ceil(outRMax[2]) + radius,
  ]

  const write = (outXYZ: Coord, on: boolean): void => {
    if (on) {
      outAcc.setValueOn(outXYZ, result)
    } else if (!outAcc.isValueOn(outXYZ)) {
      // Note: Don't overwrite existing active values with inactive values.
      outAcc.setValueOff(outXYZ, result)
    }
  }

  const outXYZ: Coord = [0, 0, 0]
  if (!xform.isAffine()) {
    // If the transform is not affine, back-project each output voxel into
    // the input tree.
    for (let x = outMin[0]; x <= outMax[0]; ++x) {
      for (let y = outMin[1]; y <= outMax[1]; ++y) {
        for (let z = outMin[2]; z <= outMax[2]; ++z) {
          outXYZ[0] = x; outXYZ[1] = y; outXYZ[2] = z
          write(outXYZ, sample(xform.invTransform([x, y, z])))
        }
      }
    }
    return
  }

  // Compute step sizes in the input tree that correspond to unit steps in
  // x, y and z in the output tree.
  const translation = xform.invTransform([0, 0, 0])
  const dx = xform.invTransform([1, 0, 0])
  const dy = xform.invTransform([0, 1, 0])
  const dz = xform.invTransform([0, 0, 1])
  const deltaX: Vec3 = [dx[0] - translation[0], dx[1] - translation[1], dx[2] - translation[2]]
  const deltaY: Vec3 = [dy[0] - translation[0], dy[1] - translation[1], dy[2] - translation[2]]
  const deltaZ: Vec3 = [dz[0] - translation[0], dz[1] - translation[1], dz[2] - translation[2]]

  // Step by whole voxels through the output tree, sampling the
  // corresponding fractional voxels of the input tree.
  const inStartX = xform.invTransform([outMin[0], outMin[1], outMin[2]])
  for (let x = outMin[0]; x <= outMax[0]; ++x) {
    const inStartY: Vec3 = [inStartX[0], inStartX[1], inStartX[2]]
    for (let y = outMin[1]; y <= outMax[1]; ++y) {
      const inXYZ: Vec3 = [inStartY[0], inStartY[1], inStartY[2]]
      for (let z = outMin[2]; z <= outMax[2]; ++z) {
        outXYZ[0] = x; outXYZ[1] = y; outXYZ[2] = z
        write(outXYZ, sample(inXYZ))
        inXYZ[0] += deltaZ[0]
        inXYZ[1] += deltaZ[1]
        inXYZ[2] += deltaZ[2]
      }
      inStartY[0] += deltaY[0]
      inStartY[1] += deltaY[1]
      inStartY[2] += deltaY[2]
    }
    inStartX[0] += deltaX[0]
    inStartX[1] += deltaX[1]
    inStartX[2] += deltaX[2]
  }
}

// ---- GridResampler::applyTransform (GridTransformer.h:874-931), serial ----

function applyTransform(xform: Transformer, inGrid: VdbGrid, outGrid: VdbGrid): void {
  const inTree = inGrid.tree
  const outTree = outGrid.tree
  const comps = inTree.comps
  const gridClass = inGrid.getGridClass()
  if (gridClass === GridClass.LevelSet) {
    throw new Error('resampleToMatch: level-set grids (clip, pruneLevelSet, signedFloodFill) are not ported')
  }

  // Independently transform the tiles of the input grid
  // (RangeProcessor::operator()(TileRange), 821-849).
  {
    const inAcc = new ValueAccessor(inTree)
    const outAcc = new ValueAccessor(outTree)
    inTree.forEachTile((origin, dim, value, active) => {
      // Skip background tiles.
      if (!active && valuesApproxEqual(value, outTree.background, comps)) return
      const bbox: CoordBBox = {
        min: [origin[0], origin[1], origin[2]],
        max: [origin[0] + dim - 1, origin[1] + dim - 1, origin[2] + dim - 1],
      }
      const sampler = new TileSampler(bbox, Float32Array.from(value), active)
      transformBBox(xform, bbox, inAcc, outAcc, sampler)
    })
  }

  // Independently transform the leaf nodes of the input grid
  // (RangeProcessor::operator()(LeafRange), 802-818).
  {
    const inAcc = new ValueAccessor(inTree)
    const outAcc = new ValueAccessor(outTree)
    for (const leaf of inTree.leafNodesInOrder()) {
      // CoordBBox(i->origin(), i->origin() + Coord(i->dim())): dim() is 8
      // and CoordBBox is inclusive, so the box is 9 voxels wide.
      const o = leaf.origin
      const bbox: CoordBBox = { min: [o[0], o[1], o[2]], max: [o[0] + 8, o[1] + 8, o[2] + 8] }
      transformBBox(xform, bbox, inAcc, outAcc, null)
    }
  }
}

/** GridT::create(background): an empty grid of inGrid's type */
function createGrid(like: VdbGrid, background: ArrayLike<number>): VdbGrid {
  return VdbGrid.create(like.type, like.tree.comps, background)
}

// ---- GridTransformer (GridTransformer.h:233-266, 541-757) ----

export class GridTransformer {
  private pivot: Vec3 = [0, 0, 0]
  private mipLevels: [number, number, number] = [0, 0, 0]
  private transformMat: Mat4d
  private preScaleTransform: Mat4d = mat4Identity()
  private postScaleTransform: Mat4d = mat4Identity()

  /** GridTransformer.h:542-555 GridTransformer(const Mat4R&) */
  constructor(xform: Mat4d) {
    this.transformMat = [...xform]
    const d = decompose(this.transformMat)
    if (d.result !== DECOMP_INVALID) {
      // If the transform can be decomposed into affine components, use them
      // to set up a mipmapping-like scheme for downsampling.
      this.init(this.pivot, d.scale, d.rotate, d.translate, 'rst', 'zyx')
    }
  }

  getTransform(): Mat4d {
    return [...this.transformMat]
  }

  /** GridTransformer.h:575-674 init */
  private init(pivot: Vec3, scale: Vec3, rotate: Vec3, translate: Vec3, xformOrder: string, rotOrder: string): void {
    if (xformOrder.length !== 3) throw new Error(`invalid transform order (${xformOrder})`)
    if (rotOrder.length !== 3) throw new Error(`invalid rotation order (${rotOrder})`)
    this.pivot = [...pivot]

    // Scaling is handled via a mipmapping-like scheme of successive halvings
    // of the tree resolution, until the remaining scale factor is greater
    // than or equal to 1/2.
    const scaleRemainder: Vec3 = [...scale]
    for (let i = 0; i < 3; ++i) {
      const s = Math.abs(scale[i]!)
      if (s < 0.5) {
        this.mipLevels[i] = Math.trunc(Math.floor(-Math.log(s) / Math.log(2.0)))
        scaleRemainder[i] = scale[i]! * (1 << this.mipLevels[i]!)
      }
    }

    // Build pre-scale and post-scale transform matrices based on the
    // user-specified order of operations, iterating the order string in
    // reverse (math::Mat matrices postmultiply row vectors).
    let mTransform = mat4Identity()
    const mats = { pre: mat4Identity(), post: mat4Identity() }
    let remainder: 'pre' | 'post' = 'post'
    const negPivot: Vec3 = [-pivot[0], -pivot[1], -pivot[2]]
    let rpos = 3, spos = 3, tpos = 3
    for (let ix = 2; ix >= 0; --ix) {
      switch (xformOrder[ix]) {
        case 'r': {
          rpos = ix
          mTransform = mat4PreTranslate(mTransform, pivot)
          mats[remainder] = mat4PreTranslate(mats[remainder], pivot)
          let xpos = 3, ypos = 3, zpos = 3
          for (let ir = 2; ir >= 0; --ir) {
            switch (rotOrder[ir]) {
              case 'x':
                xpos = ir
                mat4PreRotate(mTransform, Axis.X, rotate[0])
                mat4PreRotate(mats[remainder], Axis.X, rotate[0])
                break
              case 'y':
                ypos = ir
                mat4PreRotate(mTransform, Axis.Y, rotate[1])
                mat4PreRotate(mats[remainder], Axis.Y, rotate[1])
                break
              case 'z':
                zpos = ir
                mat4PreRotate(mTransform, Axis.Z, rotate[2])
                mat4PreRotate(mats[remainder], Axis.Z, rotate[2])
                break
            }
          }
          if (xpos > 2 || ypos > 2 || zpos > 2) throw new Error(`invalid rotation order (${rotOrder})`)
          mTransform = mat4PreTranslate(mTransform, negPivot)
          mats[remainder] = mat4PreTranslate(mats[remainder], negPivot)
          break
        }
        case 's':
          spos = ix
          mTransform = mat4PreTranslate(mTransform, pivot)
          mat4PreScale(mTransform, scale)
          mTransform = mat4PreTranslate(mTransform, negPivot)

          mats[remainder] = mat4PreTranslate(mats[remainder], pivot)
          mat4PreScale(mats[remainder], scaleRemainder)
          mats[remainder] = mat4PreTranslate(mats[remainder], negPivot)
          remainder = 'pre'
          break
        case 't':
          tpos = ix
          mTransform = mat4PreTranslate(mTransform, translate)
          mats[remainder] = mat4PreTranslate(mats[remainder], translate)
          break
      }
    }
    if (tpos > 2 || rpos > 2 || spos > 2) throw new Error(`invalid transform order (${xformOrder})`)
    this.transformMat = mTransform
    this.preScaleTransform = mats.pre
    this.postScaleTransform = mats.post
  }

  /** GridTransformer.h:699-757 transformGrid<BoxSampler>(inGrid, outGrid) */
  transformGrid(inGrid: VdbGrid, outGrid: VdbGrid): void {
    changeBackground(outGrid.tree, inGrid.tree.background)

    const [mx, my, mz] = this.mipLevels
    if (!BoxSampler.mipmap || (mx === 0 && my === 0 && mz === 0)) {
      // Skip the mipmapping step.
      applyTransform(new MatrixTransform(this.transformMat), inGrid, outGrid)
      return
    }
    let firstPass = true
    const background = Float32Array.from(inGrid.tree.background)
    let tempGrid = createGrid(inGrid, background)

    if (!mat4Eq(this.preScaleTransform, mat4Identity())) {
      firstPass = false
      // Apply the pre-scale transform to the input grid and store the result
      // in a temporary grid.
      applyTransform(new MatrixTransform(this.preScaleTransform), inGrid, tempGrid)
    }

    // While the scale factor along one or more axes is less than 1/2, scale
    // the grid by half along those axes.
    const count: [number, number, number] = [mx, my, mz] // # of halvings remaining per axis
    while (count[0] !== 0 || count[1] !== 0 || count[2] !== 0) {
      const xform = new MatrixTransform()
      mat4SetTranslation(xform.mat, this.pivot)
      mat4PreScale(xform.mat, [count[0] ? 0.5 : 1, count[1] ? 0.5 : 1, count[2] ? 0.5 : 1])
      xform.mat = mat4PreTranslate(xform.mat, [-this.pivot[0], -this.pivot[1], -this.pivot[2]])
      xform.invMat = mat4Inverse(xform.mat)

      if (firstPass) {
        firstPass = false
        // Scale the input grid and store the result in a temporary grid.
        applyTransform(xform, inGrid, tempGrid)
      } else {
        // Scale the temporary grid and store the result in a transient grid,
        // then swap the two and discard the transient grid.
        const destGrid = createGrid(inGrid, background)
        applyTransform(xform, tempGrid, destGrid)
        tempGrid = destGrid
      }
      // (3, 2, 1) -> (2, 1, 0) -> (1, 0, 0) -> (0, 0, 0), etc.
      for (let i = 0; i < 3; ++i) count[i] = Math.max(count[i]! - 1, 0)
    }

    // Apply the post-scale transform and store the result in the output grid.
    if (!mat4Eq(this.postScaleTransform, mat4Identity())) {
      applyTransform(new MatrixTransform(this.postScaleTransform), tempGrid, outGrid)
    } else {
      outGrid.tree = tempGrid.tree
    }
  }
}

// ---- ABTransform (GridTransformer.h:389-422), doResampleToMatch (431-461) ----

function transformsEqual(a: Transform, b: Transform): boolean {
  return a.equals(b)
}

function doResampleToMatch(inGrid: VdbGrid, outGrid: VdbGrid): void {
  const a = inGrid.transform
  const b = outGrid.transform
  if (!a || !b) throw new Error('resampleToMatch: both grids need a transform')
  const isAffine = a.isLinear() && b.isLinear()
  const isIdentity = isAffine && transformsEqual(a, b)

  if (BoxSampler.consistent && isIdentity) {
    // If the transforms of the input and output are identical, the output
    // tree is simply a deep copy of the input tree.
    outGrid.tree = inGrid.tree.copy()
  } else if (isAffine) {
    // in:index-to-world * out:world-to-index, for the fast GridTransformer
    const mat = mat4Mul(a.baseMap.getAffineMap().mat4, mat4Inverse(b.baseMap.getAffineMap().mat4))
    new GridTransformer(mat).transformGrid(inGrid, outGrid)
  } else {
    throw new Error('resampleToMatch: non-linear transforms (GridResampler) are not ported')
  }
}

/**
 * tools/GridTransformer.h:484-535 resampleToMatch<BoxSampler>(inGrid,
 * outGrid): resample inGrid into outGrid's index space (outGrid's transform
 * is kept, its tree is replaced or written into), trilinearly, with the
 * mipmapped halvings GridTransformer applies for scales below 1/2.
 */
export function resampleToMatchBox(inGrid: VdbGrid, outGrid: VdbGrid): void {
  if (inGrid.tree.comps !== outGrid.tree.comps) throw new Error('resampleToMatch: grids of different value types')
  if (inGrid.getGridClass() === GridClass.LevelSet) {
    const a = inGrid.transform
    const b = outGrid.transform
    if (a && b && transformsEqual(a, b)) {
      outGrid.tree = inGrid.tree.copy()
      return
    }
    throw new Error('resampleToMatch: level-set resampling (doLevelSetRebuild) is not ported')
  }
  // If the input grid is not a level set, use the generic resampler.
  doResampleToMatch(inGrid, outGrid)
}
