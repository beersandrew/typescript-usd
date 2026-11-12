// Ported from OpenSubdiv 3.6.1: opensubdiv/far/stencilBuilder.h,
//  opensubdiv/far/stencilBuilder.cpp
// Copyright 2015 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/stencilBuilder.h:38-110 and
// stencilBuilder.cpp:34-598 -- Far::internal::StencilBuilder<REAL> and its
// WeightTable. Local source addition (see PROVENANCE.md).
//
// Weights are REAL: a float builder rounds every stored product and sum
// (each C++ statement that writes a REAL) to float.

import type { StencilReal } from './stencilTable.ts'
import { type Real, realRound } from './types.ts'

// stencilBuilder.cpp:40-41
function isWeightZero(w: number): boolean {
  return w === 0.0
}

// The accumulators of stencilBuilder.cpp:200-276: scalar weights, weights
// with first derivatives and weights with second derivatives. A weight is
// passed as a tuple of 1, 3 or 6 components (p, du, dv, duu, duv, dvv).
type WeightTuple = readonly number[]

// stencilBuilder.cpp:122-410 -- the stencil table constructor set.
class WeightTable {
  _dests: number[] = []
  _sources: number[] = []
  _weights: number[] = []
  _duWeights: number[] = []
  _dvWeights: number[] = []
  _duuWeights: number[] = []
  _duvWeights: number[] = []
  _dvvWeights: number[] = []
  _indices: number[] = []
  _sizes: number[] = []
  _size: number
  _lastOffset: number
  _coarseVertCount: number
  _compactWeights: boolean
  readonly _round: (x: number) => number

  // stencilBuilder.cpp:125-162
  constructor(coarseVerts: number, genCtrlVertStencils: boolean, compactWeights: boolean, round: (x: number) => number) {
    this._size = 0
    this._lastOffset = 0
    this._coarseVertCount = coarseVerts
    this._compactWeights = compactWeights
    this._round = round

    if (!genCtrlVertStencils) return

    //  Generate trivial control vert stencils
    for (let i = 0; i < coarseVerts; i++) {
      this._indices[i] = i
      this._sizes[i] = 1
      this._dests[i] = i
      this._sources[i] = i
      this._weights[i] = 1.0
    }

    this._size = this._sources.length
    this._lastOffset = this._size - 1
  }

  // The number of components a weight tuple of this arity reads/writes.
  private get(i: number, arity: number): number[] {
    if (arity === 1) return [this._weights[i]!]
    if (arity === 3) return [this._weights[i]!, this._duWeights[i]!, this._dvWeights[i]!]
    return [
      this._weights[i]!,
      this._duWeights[i]!,
      this._dvWeights[i]!,
      this._duuWeights[i]!,
      this._duvWeights[i]!,
      this._dvvWeights[i]!,
    ]
  }

  // Accumulator::PushBack (stencilBuilder.cpp:205-209, 230-237, 264-266)
  private pushBack(w: WeightTuple): void {
    this._weights.push(w[0]!)
    if (w.length >= 3) {
      this._duWeights.push(w[1]!)
      this._dvWeights.push(w[2]!)
    }
    if (w.length === 6) {
      this._duuWeights.push(w[3]!)
      this._duvWeights.push(w[4]!)
      this._dvvWeights.push(w[5]!)
    }
  }

  // Accumulator::Add (stencilBuilder.cpp:210-214, 238-245, 267-269)
  private add_(i: number, w: WeightTuple): void {
    const R = this._round
    this._weights[i] = R(this._weights[i]! + w[0]!)
    if (w.length >= 3) {
      this._duWeights[i] = R(this._duWeights[i]! + w[1]!)
      this._dvWeights[i] = R(this._dvWeights[i]! + w[2]!)
    }
    if (w.length === 6) {
      this._duuWeights[i] = R(this._duuWeights[i]! + w[3]!)
      this._duvWeights[i] = R(this._duvWeights[i]! + w[4]!)
      this._dvvWeights[i] = R(this._dvvWeights[i]! + w[5]!)
    }
  }

  // Point1stDerivWeight/Point2ndDerivWeight operator* (stencilBuilder.cpp:64-70,
  // 99-108): component-wise products, each stored as REAL.
  private mul(a: WeightTuple, b: WeightTuple): number[] {
    const R = this._round
    return a.map((x, k) => R(x * b[k]!))
  }

  // stencilBuilder.cpp:164-198
  addWithWeight(src: number, dest: number, weight: WeightTuple): void {
    //  Factorized stencils are expressed purely in terms of the control
    //  mesh verts -- a source in the control mesh merges directly:
    if (src < this._coarseVertCount) {
      this.merge(src, dest, weight, weight.map(() => 1.0), this._lastOffset, this._size)
      return
    }

    //  Otherwise resolve all coarse verts contributing to src:
    const len = this._sizes[src]!
    const start = this._indices[src]!

    for (let i = start; i < start + len; i++) {
      if (!(this._sources[i]! < this._coarseVertCount)) {
        throw new Error('StencilBuilder: source stencil is not expressed in control vertices')
      }
      this.merge(this._sources[i]!, dest, this.get(i, weight.length), weight, this._lastOffset, this._size)
    }
  }

  // AddWithWeight/merge/add specialized for the ScalarAccumulator
  // (stencilBuilder.cpp:164-198, 259-276, 314-384) without tuple allocation;
  // the arithmetic is the same as the tuple path with arity 1.
  addWithWeightScalar(src: number, dest: number, weight: number): void {
    if (src < this._coarseVertCount) {
      this.mergeScalar(src, dest, weight, 1.0, this._lastOffset, this._size)
      return
    }
    const len = this._sizes[src]!
    const start = this._indices[src]!
    for (let i = start; i < start + len; i++) {
      if (!(this._sources[i]! < this._coarseVertCount)) {
        throw new Error('StencilBuilder: source stencil is not expressed in control vertices')
      }
      this.mergeScalar(this._sources[i]!, dest, this._weights[i]!, weight, this._lastOffset, this._size)
    }
  }

  private mergeScalar(src: number, dst: number, weight: number, weightFactor: number, lastOffset: number, tableSize: number): void {
    const R = this._round
    if (this._compactWeights && this._dests.length > 0 && this._dests[lastOffset] === dst) {
      const sources = this._sources
      for (let i = lastOffset; i < tableSize; i++) {
        if (sources[i] === src) {
          this._weights[i] = R(this._weights[i]! + R(weight * weightFactor))
          return
        }
      }
    }
    this.startStencilIfNeeded(dst)
    this._size++
    this._sizes[dst]!++
    this._dests.push(dst)
    this._sources.push(src)
    this._weights.push(R(weight * weightFactor))
  }

  private startStencilIfNeeded(dst: number): void {
    if (this._dests.length === 0 || dst !== this._dests[this._dests.length - 1]) {
      if (dst + 1 > this._indices.length) {
        const old = this._indices.length
        this._indices.length = dst + 1
        this._sizes.length = dst + 1
        for (let k = old; k <= dst; ++k) {
          this._indices[k] = 0
          this._sizes[k] = 0
        }
      }
      this._indices[dst] = this._sources.length
      this._sizes[dst] = 0
      this._lastOffset = this._sources.length
    }
  }

  // stencilBuilder.cpp:314-345
  private merge(src: number, dst: number, weight: WeightTuple, weightFactor: WeightTuple, lastOffset: number, tableSize: number): void {
    //  The lastOffset is the vertex currently being processed; if weights
    //  are compacted, combine with an existing entry for src:
    if (this._compactWeights && this._dests.length > 0 && this._dests[lastOffset] === dst) {
      for (let i = lastOffset; i < tableSize; i++) {
        if (this._sources[i] === src) {
          this.add_(i, this.mul(weight, weightFactor))
          return
        }
      }
    }
    //  src not seen yet -- insert it as a new vertex weight.
    this.add(src, dst, this.mul(weight, weightFactor))
  }

  // stencilBuilder.cpp:348-384
  private add(src: number, dst: number, weight: WeightTuple): void {
    //  The current stencil is always at the end of _dests, so a mismatch
    //  means a new stencil has just started:
    this.startStencilIfNeeded(dst)
    this._size++

    this._sizes[dst]!++
    this._dests.push(dst)

    this._sources.push(src)
    this.pushBack(weight)
  }

  setCoarseVertCount(numVerts: number): void {
    this._coarseVertCount = numVerts
  }
}

// stencilBuilder.h:38-108 -- Far::internal::StencilBuilder<REAL>.
export class StencilBuilder {
  readonly _real: Real
  readonly _round: (x: number) => number
  _weightTable: WeightTable

  // stencilBuilder.cpp:412-420
  constructor(real: Real, coarseVertCount: number, genCtrlVertStencils = true, compactWeights = true) {
    this._real = real
    this._round = realRound(real)
    this._weightTable = new WeightTable(coarseVertCount, genCtrlVertStencils, compactWeights, this._round)
  }

  // stencilBuilder.cpp:428-433
  getNumVerticesTotal(): number {
    return this._weightTable._weights.length
  }

  // stencilBuilder.cpp:436-444
  getNumVertsInStencil(stencilIndex: number): number {
    if (stencilIndex > this._weightTable._sizes.length - 1) return 0
    return this._weightTable._sizes[stencilIndex]!
  }

  // stencilBuilder.cpp:446-451
  setCoarseVertCount(numVerts: number): void {
    this._weightTable.setCoarseVertCount(numVerts)
  }

  // stencilBuilder.cpp:453-505
  getStencilOffsets(): number[] {
    return this._weightTable._indices
  }
  getStencilSizes(): number[] {
    return this._weightTable._sizes
  }
  getStencilSources(): number[] {
    return this._weightTable._sources
  }
  getStencilWeights(): number[] {
    return this._weightTable._weights
  }
  getStencilDuWeights(): number[] {
    return this._weightTable._duWeights
  }
  getStencilDvWeights(): number[] {
    return this._weightTable._dvWeights
  }
  getStencilDuuWeights(): number[] {
    return this._weightTable._duuWeights
  }
  getStencilDuvWeights(): number[] {
    return this._weightTable._duvWeights
  }
  getStencilDvvWeights(): number[] {
    return this._weightTable._dvvWeights
  }

  /** stencilBuilder.h:76-100 -- the vertex facade StencilBuilder<REAL>::Index. */
  index(i: number): StencilBuilderIndex {
    return new StencilBuilderIndex(this, i)
  }
}

// stencilBuilder.h:76-100 -- Far::internal::StencilBuilder<REAL>::Index.
// It satisfies the Primvar interface of primvarRefinerReal.ts, so a
// PrimvarRefinerReal interpolating Index values builds stencils.
export class StencilBuilderIndex {
  constructor(
    readonly _owner: StencilBuilder,
    readonly _index: number,
  ) {}

  // stencilBuilder.cpp:507-517
  addWithWeight(src: StencilBuilderIndex, weight: number): void {
    if (isWeightZero(weight)) return
    this._owner._weightTable.addWithWeightScalar(src._index, this._index, weight)
  }

  // stencilBuilder.cpp:519-543
  addWithWeightStencil(src: StencilReal, weight: number): void {
    if (isWeightZero(weight)) return
    const R = this._owner._round
    const srcSize = src.getSize()
    for (let i = 0; i < srcSize; ++i) {
      const w = src.getWeight(i)
      if (isWeightZero(w)) continue
      const srcIndex = src.getVertexIndex(i)
      const wgt = R(weight * w)
      this._owner._weightTable.addWithWeightScalar(srcIndex, this._index, wgt)
    }
  }

  // stencilBuilder.cpp:545-570
  addWithWeightStencil1st(src: StencilReal, weight: number, du: number, dv: number): void {
    if (isWeightZero(weight) && isWeightZero(du) && isWeightZero(dv)) return
    const R = this._owner._round
    const srcSize = src.getSize()
    for (let i = 0; i < srcSize; ++i) {
      const w = src.getWeight(i)
      if (isWeightZero(w)) continue
      const srcIndex = src.getVertexIndex(i)
      const wgt = [R(weight * w), R(du * w), R(dv * w)]
      this._owner._weightTable.addWithWeight(srcIndex, this._index, wgt)
    }
  }

  // stencilBuilder.cpp:572-598
  addWithWeightStencil2nd(
    src: StencilReal,
    weight: number,
    du: number,
    dv: number,
    duu: number,
    duv: number,
    dvv: number,
  ): void {
    if (
      isWeightZero(weight) &&
      isWeightZero(du) &&
      isWeightZero(dv) &&
      isWeightZero(duu) &&
      isWeightZero(duv) &&
      isWeightZero(dvv)
    ) {
      return
    }
    const R = this._owner._round
    const srcSize = src.getSize()
    for (let i = 0; i < srcSize; ++i) {
      const w = src.getWeight(i)
      if (isWeightZero(w)) continue
      const srcIndex = src.getVertexIndex(i)
      const wgt = [R(weight * w), R(du * w), R(dv * w), R(duu * w), R(duv * w), R(dvv * w)]
      this._owner._weightTable.addWithWeight(srcIndex, this._index, wgt)
    }
  }

  // stencilBuilder.h:94-96 (operator[])
  at(index: number): StencilBuilderIndex {
    return new StencilBuilderIndex(this._owner, index + this._index)
  }
  get(index: number): StencilBuilderIndex {
    return this.at(index)
  }

  getOffset(): number {
    return this._index
  }

  // stencilBuilder.h:100 -- nothing to do.
  clear(): void {}
}
