// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/blendShapeQuery.cpp,
//  pxr/usd/usdSkel/blendShapeQuery.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdSkel/blendShapeQuery.{h,cpp} — UsdSkelBlendShapeQuery.
//
// Resolves blend shape weights (including inbetween shapes) for a skinned prim
// and applies the resulting sub-shape offsets to deform points. The math and
// naming follow upstream exactly:
//
//   - Each BlendShape contributes a set of *sub-shapes*: the primary shape
//     (weight 1.0), an implicit null shape (weight 0.0), and any authored
//     inbetween shapes (weight strictly between 0 and 1). Sub-shapes of one
//     blend shape are sorted by weight.
//   - ComputeSubShapeWeights resolves a per-blend-shape weight to a sparse set
//     of (subShapeWeight, blendShapeIndex, subShapeIndex) triples by piecewise-
//     linear interpolation between the two nearest bounding sub-shapes.
//   - ComputeDeformedPoints applies the sub-shape point offsets (indexed by
//     each blend shape's pointIndices) to the points, weighted accordingly.

import type { Prim, Stage } from 'typescript-usd/usd'
import { applyBlendShape } from './utils.ts'
import { _sdfPlainValue } from 'typescript-usd/sdf/_internal'
import { BlendShape } from './blendShape.ts'
import { BindingAPI as SkelBindingAPI } from './bindingAPI.ts'

const EPS = 1e-6

function isClose(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps
}

// A single resolvable sub-shape of a blend shape: the primary shape, the
// implicit null shape, or an inbetween. Mirrors the private _SubShape struct.
interface SubShape {
  blendShapeIndex: number
  // Index into the `inbetweens` list, or -1 for the primary/null shape.
  inbetweenIndex: number
  weight: number
}

function isInbetween(s: SubShape): boolean { return s.inbetweenIndex >= 0 }
function isNullShape(s: SubShape): boolean { return s.weight === 0 }

// Per-blend-shape record: the source BlendShape plus the contiguous span of
// its sub-shapes within the flat `subShapes` array. Mirrors _BlendShape.
interface BlendShapeRecord {
  // The BlendShape prim, or undefined for an inactive/missing target that is
  // kept only to preserve blendShapeTargets ordering.
  prim: Prim | undefined
  firstSubShape: number
  numSubShapes: number
}

// Resolved description of one blend shape target, as fed to the query. This is
// the data upstream reads off the stage in the binding constructor; exposing it
// lets the query be constructed either from a stage binding or directly from
// resolved shape data (the inbetween 'weight' metadatum is not yet surfaced by
// stage composition — see blendShapeQuery.test.ts).
export interface ResolvedBlendShape {
  // Point offsets of the primary shape (one Vec3 per affected point).
  offsets: number[][]
  // Optional point indices the offsets map to (empty = non-indexed/dense).
  pointIndices?: number[]
  // Optional primary-shape normal offsets.
  normalOffsets?: number[][]
  // Authored inbetweens (weight strictly in (0,1)); order is irrelevant.
  inbetweens?: ResolvedInbetween[]
  // True when the target prim is inactive (kept for ordering, no sub-shapes).
  inactive?: boolean
}

export interface ResolvedInbetween {
  weight: number
  offsets: number[][]
  normalOffsets?: number[][]
}

export class UsdSkelBlendShapeQuery {
  private readonly _prim: Prim | undefined
  private readonly _subShapes: SubShape[] = []
  private readonly _blendShapes: BlendShapeRecord[] = []
  // Per-inbetween resolved data, indexed by SubShape.inbetweenIndex.
  private readonly _inbetweens: ResolvedInbetween[] = []
  // Per-blend-shape primary offsets / indices, kept for the compute methods.
  private readonly _primaryOffsets: number[][][] = []
  private readonly _primaryNormalOffsets: number[][][] = []
  private readonly _pointIndices: number[][] = []

  // Construct from a SkelBindingAPI-bound prim (mirrors the upstream
  // constructor): reads the skel:blendShapeTargets relationship, resolves each
  // BlendShape, and gathers its primary/null/inbetween sub-shapes.
  constructor(binding: { prim: Prim; stage: Stage })
  // Construct directly from resolved shape data (used where the stage cannot
  // yet surface inbetween weights, and for testing the resolution math).
  constructor(shapes: ResolvedBlendShape[])
  constructor(arg: { prim: Prim; stage: Stage } | ResolvedBlendShape[]) {
    if (Array.isArray(arg)) {
      this._prim = undefined
      this._initFromResolved(arg)
      return
    }

    const { prim, stage } = arg
    const targets = prim.getAttr('skel:blendShapeTargets')?.getTargets() ?? []
    const resolved: ResolvedBlendShape[] = targets.map(target => {
      const shapePrim = stage.getPrim(target)
      if (!shapePrim || !BlendShape.is(shapePrim)) {
        return { offsets: [], inactive: true }
      }
      if (!shapePrim.isActive) {
        return { offsets: [], inactive: true }
      }
      const inbetweens: ResolvedInbetween[] = []
      for (const ib of new BlendShape(shapePrim).getInbetweens()) {
        const w = ib.getWeight()
        if (w === undefined) continue // skip inactive inbetweens (no weight)
        inbetweens.push({
          weight: w,
          offsets: plainVecArray(ib.getOffsets()),
          normalOffsets: plainVecArray(ib.getNormalOffsets()),
        })
      }
      return {
        offsets: BlendShape.getOffsets(shapePrim),
        pointIndices: BlendShape.getPointIndices(shapePrim),
        normalOffsets: BlendShape.getNormalOffsets(shapePrim),
        inbetweens,
      }
    })
    this._prim = prim
    this._initFromResolved(resolved)
  }

  private _initFromResolved(shapes: ResolvedBlendShape[]): void {
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i]!
      const record: BlendShapeRecord = {
        prim: undefined,
        firstSubShape: this._subShapes.length,
        numSubShapes: 0,
      }
      this._primaryOffsets[i] = shape.offsets ?? []
      this._primaryNormalOffsets[i] = shape.normalOffsets ?? []
      this._pointIndices[i] = shape.pointIndices ?? []

      if (shape.inactive) {
        // Inactive target: keep an entry to preserve ordering, no sub-shapes.
        this._blendShapes[i] = record
        continue
      }

      // Add the primary (weight 1.0) and null (weight 0.0) sub-shapes.
      // The sort below relies on a consistent ordering across blend shapes.
      this._subShapes.push({ blendShapeIndex: i, inbetweenIndex: -1, weight: 1.0 })
      this._subShapes.push({ blendShapeIndex: i, inbetweenIndex: -1, weight: 0.0 })

      for (const inbetween of shape.inbetweens ?? []) {
        const weight = inbetween.weight
        if (isClose(weight, 0.0) || isClose(weight, 1.0)) {
          // Skip inbetweens whose weight collides with the null/primary shape.
          continue
        }
        const inbetweenIndex = this._inbetweens.length
        this._subShapes.push({ blendShapeIndex: i, inbetweenIndex, weight })
        this._inbetweens.push(inbetween)
      }

      record.numSubShapes = this._subShapes.length - record.firstSubShape

      // Sort this blend shape's sub-shapes by ascending weight.
      const start = record.firstSubShape
      const end = start + record.numSubShapes
      const slice = this._subShapes.slice(start, end).sort((a, b) => a.weight - b.weight)
      for (let k = 0; k < slice.length; k++) this._subShapes[start + k] = slice[k]!

      this._blendShapes[i] = record
    }
  }

  isValid(): boolean { return this._prim !== undefined }
  getPrim(): Prim | undefined { return this._prim }

  getNumBlendShapes(): number { return this._blendShapes.length }
  getNumSubShapes(): number { return this._subShapes.length }

  // GetBlendShapeIndex: the blend shape a sub-shape belongs to.
  getBlendShapeIndex(subShapeIndex: number): number {
    return subShapeIndex < this._subShapes.length
      ? this._subShapes[subShapeIndex]!.blendShapeIndex
      : 0
  }

  // GetInbetween: the inbetween backing a sub-shape, or undefined.
  getInbetween(subShapeIndex: number): ResolvedInbetween | undefined {
    const s = this._subShapes[subShapeIndex]
    if (s && isInbetween(s)) return this._inbetweens[s.inbetweenIndex]
    return undefined
  }

  // ComputeBlendShapePointIndices: the point indices of every blend shape,
  // indexed by blend shape index. Empty arrays mark non-indexed (dense) shapes.
  computeBlendShapePointIndices(): number[][] {
    return this._blendShapes.map((_, i) => this._pointIndices[i] ?? [])
  }

  // ComputeSubShapePointOffsets: the point offsets of every sub-shape, indexed
  // by sub-shape index. Includes both primary and inbetween offsets; the null
  // shape (and inactive entries) yield an empty array.
  computeSubShapePointOffsets(): number[][][] {
    return this._subShapes.map(s => {
      if (isInbetween(s)) return this._inbetweens[s.inbetweenIndex]!.offsets
      if (isNullShape(s)) return []
      return this._primaryOffsets[s.blendShapeIndex] ?? []
    })
  }

  // ComputeSubShapeNormalOffsets: normal offsets of every sub-shape (optional;
  // empty where unauthored).
  computeSubShapeNormalOffsets(): number[][][] {
    return this._subShapes.map(s => {
      if (isInbetween(s)) return this._inbetweens[s.inbetweenIndex]!.normalOffsets ?? []
      if (isNullShape(s)) return []
      return this._primaryNormalOffsets[s.blendShapeIndex] ?? []
    })
  }

  // ComputeSubShapeWeights: resolve per-blend-shape weights to a sparse set of
  // sub-shape contributions. `weights` is ordered by blendShapeTargets; the
  // returned arrays share one length, each element identifying a sub-shape's
  // resolved weight and which (blendShape, subShape) it maps to.
  computeSubShapeWeights(weights: ArrayLike<number>): {
    subShapeWeights: number[]
    blendShapeIndices: number[]
    subShapeIndices: number[]
  } | null {
    if (weights.length !== this._blendShapes.length) {
      // Size of weights != number of blend shapes.
      return null
    }

    const subShapeWeights: number[] = []
    const blendShapeIndices: number[] = []
    const subShapeIndices: number[] = []

    for (let i = 0; i < weights.length; i++) {
      const blendShape = this._blendShapes[i]!

      // Fast route when there are no inbetweens (just primary + null).
      if (blendShape.numSubShapes < 3) {
        if (blendShape.numSubShapes !== 2) continue // inactive: no sub-shapes
        // The second sub-shape (after the weight sort) is the primary shape.
        subShapeWeights.push(weights[i]!)
        blendShapeIndices.push(i)
        subShapeIndices.push(blendShape.firstSubShape + 1)
        continue
      }

      const w = weights[i]!
      const start = blendShape.firstSubShape
      const end = start + blendShape.numSubShapes

      // upper_bound: first sub-shape whose weight is strictly greater than w.
      let it = end
      for (let k = start; k < end; k++) {
        if (w < this._subShapes[k]!.weight) { it = k; break }
      }

      let lowerIdx: number
      let upperIdx: number
      if (it !== end) {
        if (it > start) { lowerIdx = it - 1; upperIdx = it }
        else { lowerIdx = start; upperIdx = start + 1 }
      } else {
        lowerIdx = end - 2; upperIdx = end - 1
      }

      const lower = this._subShapes[lowerIdx]!
      const upper = this._subShapes[upperIdx]!
      const weightDelta = upper.weight - lower.weight

      if (weightDelta > EPS) {
        const alpha = (w - lower.weight) / weightDelta

        if (!isNullShape(lower) && !isClose(alpha, 1.0)) {
          subShapeWeights.push(1.0 - alpha)
          blendShapeIndices.push(i)
          subShapeIndices.push(lowerIdx)
        }
        if (!isNullShape(upper) && !isClose(alpha, 0.0)) {
          subShapeWeights.push(alpha)
          blendShapeIndices.push(i)
          subShapeIndices.push(upperIdx)
        }
      }
    }

    return { subShapeWeights, blendShapeIndices, subShapeIndices }
  }

  // ComputeFlattenedSubShapeWeights: dense weight array, one entry per
  // sub-shape, with the sparse resolved weights scattered into place.
  computeFlattenedSubShapeWeights(weights: ArrayLike<number>): number[] | null {
    const sparse = this.computeSubShapeWeights(weights)
    if (!sparse) return null
    const out = new Array<number>(this._subShapes.length).fill(0)
    for (let i = 0; i < sparse.subShapeWeights.length; i++) {
      const idx = sparse.subShapeIndices[i]!
      if (idx < out.length) out[idx] = sparse.subShapeWeights[i]!
    }
    return out
  }

  // ComputeDeformedPoints: apply the resolved sub-shapes to `points` (flat xyz,
  // mutated in place). `blendShapePointIndices` / `subShapePointOffsets` come
  // from computeBlendShapePointIndices() / computeSubShapePointOffsets().
  computeDeformedPoints(
    subShapeWeights: ArrayLike<number>,
    blendShapeIndices: ArrayLike<number>,
    subShapeIndices: ArrayLike<number>,
    blendShapePointIndices: readonly number[][],
    subShapePointOffsets: readonly number[][][],
    points: Float32Array | number[],
  ): boolean {
    if (blendShapeIndices.length !== subShapeWeights.length) return false
    if (subShapeIndices.length !== subShapeWeights.length) return false

    for (let i = 0; i < subShapeWeights.length; i++) {
      const blendShapeIndex = blendShapeIndices[i]!
      if (blendShapeIndex >= blendShapePointIndices.length) return false
      const subShapeIndex = subShapeIndices[i]!
      if (subShapeIndex >= subShapePointOffsets.length) return false

      const offsets = subShapePointOffsets[subShapeIndex]!
      if (offsets.length === 0) continue
      if (!applyBlendShape(
        subShapeWeights[i]!,
        offsets,
        blendShapePointIndices[blendShapeIndex]!,
        points,
      )) {
        return false
      }
    }
    return true
  }

  // ComputeDeformedNormals: like computeDeformedPoints but the result is
  // re-normalized per normal afterwards.
  computeDeformedNormals(
    subShapeWeights: ArrayLike<number>,
    blendShapeIndices: ArrayLike<number>,
    subShapeIndices: ArrayLike<number>,
    blendShapePointIndices: readonly number[][],
    subShapeNormalOffsets: readonly number[][][],
    normals: Float32Array | number[],
  ): boolean {
    if (!this.computeDeformedPoints(
      subShapeWeights, blendShapeIndices, subShapeIndices,
      blendShapePointIndices, subShapeNormalOffsets, normals)) {
      return false
    }
    for (let i = 0; i + 2 < normals.length; i += 3) {
      const x = normals[i]!, y = normals[i + 1]!, z = normals[i + 2]!
      const len = Math.hypot(x, y, z)
      if (len > 0) { normals[i] = x / len; normals[i + 1] = y / len; normals[i + 2] = z / len }
    }
    return true
  }
}

// Convenience: build a query from a stage prim carrying SkelBindingAPI.
export function makeBlendShapeQuery(prim: Prim, stage: Stage): UsdSkelBlendShapeQuery {
  // Reference SkelBindingAPI so the dependency reads as intentional even though
  // the relationship is read directly off the prim (mirroring upstream's
  // GetBlendShapeTargetsRel()).
  void SkelBindingAPI
  return new UsdSkelBlendShapeQuery({ prim, stage })
}

// An inbetween's offsets value as plain [x, y, z] rows; [] without a value.
function plainVecArray(value: unknown): number[][] {
  const plain = _sdfPlainValue(value)
  return Array.isArray(plain) ? (plain as number[][]) : []
}
