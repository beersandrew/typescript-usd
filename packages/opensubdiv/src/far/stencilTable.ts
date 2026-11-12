// Ported from OpenSubdiv 3.6.1: opensubdiv/far/stencilTable.h,
//  opensubdiv/far/stencilTable.cpp
// Copyright 2013, 2015 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/stencilTable.h:52-782 and
// stencilTable.cpp:34-228 -- Far::StencilReal, StencilTableReal,
// LimitStencilReal and LimitStencilTableReal. Local source addition (see
// PROVENANCE.md).
//
// The C++ float/double template instantiations (and the Stencil,
// StencilTable, LimitStencil and LimitStencilTable float wrappers) are one
// class each here, tagged with their Real precision (far/types.ts). Weights
// of a float table are stored rounded to float.
//
// DIVERGENCE: StencilReal holds the table's arrays and an offset where the
// C++ holds raw pointers into them.

import type { Index } from './types.ts'
import { type Real } from './types.ts'
import type { Primvar, PrimvarBuffer } from './primvarRefinerReal.ts'

// stencilTable.h:52-114 -- a view of one stencil within a table.
export class StencilReal {
  constructor(
    public _sizes: number[],
    public _sizeIndex: number,
    public _indices: number[],
    public _weights: number[],
    public _offset: number,
  ) {}

  // stencilTable.h:75-77
  getSize(): number {
    return this._sizes[this._sizeIndex]!
  }
  // stencilTable.h:85-87 (a copy of the stencil's indices)
  getVertexIndices(): number[] {
    return this._indices.slice(this._offset, this._offset + this.getSize())
  }
  // stencilTable.h:90-92 (a copy of the stencil's weights)
  getWeights(): number[] {
    return this._weights.slice(this._offset, this._offset + this.getSize())
  }
  /** The j-th vertex index of the stencil (pointer indexing in the C++). */
  getVertexIndex(j: number): number {
    return this._indices[this._offset + j]!
  }
  /** The j-th weight of the stencil (pointer indexing in the C++). */
  getWeight(j: number): number {
    return this._weights[this._offset + j]!
  }
  // stencilTable.h:95-101
  Next(): void {
    const stride = this.getSize()
    ++this._sizeIndex
    this._offset += stride
  }
}

// stencilTable.cpp:34-140 -- copies the stencils, in order, out of a
// StencilBuilder's possibly unordered arrays.
function copyStencilData(
  numControlVerts: number,
  includeCoarseVerts: boolean,
  firstOffset: number,
  offsets: readonly number[],
  sizes: readonly number[],
  sources: readonly number[],
  weightArrays: readonly (readonly number[])[],
): { offsets: number[]; sizes: number[]; sources: number[]; weights: number[][] } {
  const start = includeCoarseVerts ? 0 : firstOffset

  const outOffsets = new Array<number>(offsets.length)
  const outSizes = new Array<number>(sizes.length)
  const outSources = new Array<number>(sources.length)
  const outWeights = weightArrays.map((w) => new Array<number>(w.length).fill(0))

  //  Note here that loop index 'i' represents stencil_i for vertex_i.
  let curOffset = 0
  let stencilCount = 0
  let weightCount = 0
  for (let i = start; i < offsets.length; i++) {
    //  Once all the control verts are copied out, jump to the offset where
    //  the actual stencils begin.
    if (includeCoarseVerts && i === numControlVerts) i = firstOffset
    if (i >= offsets.length) break

    const sz = sizes[i]!
    const off = offsets[i]!

    outOffsets[stencilCount] = curOffset
    outSizes[stencilCount] = sz
    for (let k = 0; k < sz; ++k) outSources[curOffset + k] = sources[off + k]!
    for (let w = 0; w < weightArrays.length; ++w) {
      // Derivative arrays are copied only when non-empty
      // (stencilTable.cpp:96-115).
      if (weightArrays[w]!.length === 0) continue
      for (let k = 0; k < sz; ++k) outWeights[w]![curOffset + k] = weightArrays[w]![off + k]!
    }

    curOffset += sz
    stencilCount++
    weightCount += sz
  }

  outOffsets.length = stencilCount
  outSizes.length = stencilCount
  outSources.length = weightCount
  // stencilTable.cpp:121-138 resizes the derivative arrays only; the point
  // weights keep their builder size (zero past the copied stencils), as
  // upstream -- consumers size weights by GetControlIndices().
  for (let w = 1; w < weightArrays.length; ++w) {
    if (weightArrays[w]!.length !== 0) outWeights[w]!.length = weightCount
  }
  return { offsets: outOffsets, sizes: outSizes, sources: outSources, weights: outWeights }
}

// stencilTable.h:140-271 -- Far::StencilTableReal<REAL>.
export class StencilTableReal {
  readonly _real: Real
  _numControlVertices: number
  _sizes: number[] = []
  _offsets: number[] = []
  _indices: number[] = []
  _weights: number[] = []

  // stencilTable.h:258-263 (default and numControlVerts constructors)
  constructor(real: Real = 'float', numControlVerts = 0) {
    this._real = real
    this._numControlVertices = numControlVerts
  }

  // stencilTable.cpp:145-161 (the protected constructor from builder data)
  static fromStencilData(
    real: Real,
    numControlVerts: number,
    offsets: readonly number[],
    sizes: readonly number[],
    sources: readonly number[],
    weights: readonly number[],
    includeCoarseVerts: boolean,
    firstOffset: number,
  ): StencilTableReal {
    const table = new StencilTableReal(real, numControlVerts)
    const data = copyStencilData(numControlVerts, includeCoarseVerts, firstOffset, offsets, sizes, sources, [weights])
    table._offsets = data.offsets
    table._sizes = data.sizes
    table._indices = data.sources
    table._weights = data.weights[0]!
    return table
  }

  /** A copy of this table (the implicit C++ copy constructor). */
  clone(): StencilTableReal {
    const table = new StencilTableReal(this._real, this._numControlVertices)
    table._sizes = this._sizes.slice()
    table._offsets = this._offsets.slice()
    table._indices = this._indices.slice()
    table._weights = this._weights.slice()
    return table
  }

  getPrecision(): Real {
    return this._real
  }

  // stencilTable.h:156-163
  getNumStencils(): number {
    return this._sizes.length
  }
  getNumControlVertices(): number {
    return this._numControlVertices
  }

  // stencilTable.cpp:720-730
  getStencil(i: Index): StencilReal {
    if (!(this._offsets.length > 0 && i < this._offsets.length)) {
      throw new Error(`StencilTable.GetStencil(): no stencil ${i}`)
    }
    const ofs = this._offsets[i]!
    return new StencilReal(this._sizes, i, this._indices, this._weights, ofs)
  }

  // stencilTable.h:169-187
  getSizes(): number[] {
    return this._sizes
  }
  getOffsets(): number[] {
    return this._offsets
  }
  getControlIndices(): number[] {
    return this._indices
  }
  getWeights(): number[] {
    return this._weights
  }

  // stencilTable.h:190-224 -- UpdateValues(src, dst[, start, end]) and
  // UpdateValues(srcBase, numBase, srcRef, dst[, start, end]).
  updateValues<V extends Primvar<V>>(src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>, start?: Index, end?: Index): void
  updateValues<V extends Primvar<V>>(
    srcBase: PrimvarBuffer<V>,
    numBase: number,
    srcRef: PrimvarBuffer<V>,
    dst: PrimvarBuffer<V>,
    start?: Index,
    end?: Index,
  ): void
  updateValues<V extends Primvar<V>>(...args: unknown[]): void {
    if (typeof args[1] === 'number') {
      const [srcBase, numBase, srcRef, dst, start, end] = args as [
        PrimvarBuffer<V>,
        number,
        PrimvarBuffer<V>,
        PrimvarBuffer<V>,
        Index | undefined,
        Index | undefined,
      ]
      this.updateBaseRef(srcBase, numBase, srcRef, dst, this._weights, start ?? -1, end ?? -1)
    } else {
      const [src, dst, start, end] = args as [PrimvarBuffer<V>, PrimvarBuffer<V>, Index | undefined, Index | undefined]
      this.update(src, dst, this._weights, start ?? -1, end ?? -1)
    }
  }

  // stencilTable.cpp:163-171
  clear(): void {
    this._numControlVertices = 0
    this._sizes = []
    this._offsets = []
    this._indices = []
    this._weights = []
  }

  // stencilTable.h:616-646
  protected updateBaseRef<V extends Primvar<V>>(
    srcBase: PrimvarBuffer<V>,
    numBase: number,
    srcRef: PrimvarBuffer<V>,
    dstValues: PrimvarBuffer<V>,
    valueWeights: readonly number[],
    start: Index,
    end: Index,
  ): void {
    let sizeIdx = 0
    let elem = 0
    if (start > 0) {
      if (!(start < this._offsets.length)) throw new Error('StencilTable.UpdateValues(): start out of range')
      sizeIdx = start
      elem = this._offsets[start]!
    } else {
      start = 0
    }
    const nstencils = (end < start ? this.getNumStencils() : end) - start
    for (let i = 0; i < nstencils; ++i, ++sizeIdx) {
      const d = dstValues.get(start + i)
      d.clear()
      const size = this._sizes[sizeIdx]!
      for (let j = 0; j < size; ++j, ++elem) {
        const index = this._indices[elem]!
        if (index < numBase) {
          d.addWithWeight(srcBase.get(index), valueWeights[elem]!)
        } else {
          d.addWithWeight(srcRef.get(index - numBase), valueWeights[elem]!)
        }
      }
    }
  }

  // stencilTable.h:648-674
  protected update<V extends Primvar<V>>(
    srcValues: PrimvarBuffer<V>,
    dstValues: PrimvarBuffer<V>,
    valueWeights: readonly number[],
    start: Index,
    end: Index,
  ): void {
    let sizeIdx = 0
    let elem = 0
    if (start > 0) {
      if (!(start < this._offsets.length)) throw new Error('StencilTable.UpdateValues(): start out of range')
      sizeIdx = start
      elem = this._offsets[start]!
    } else {
      start = 0
    }
    const nstencils = (end < start ? this.getNumStencils() : end) - start
    for (let i = 0; i < nstencils; ++i, ++sizeIdx) {
      const d = dstValues.get(start + i)
      d.clear()
      const size = this._sizes[sizeIdx]!
      for (let j = 0; j < size; ++j, ++elem) {
        d.addWithWeight(srcValues.get(this._indices[elem]!), valueWeights[elem]!)
      }
    }
  }

  // stencilTable.h:676-686
  generateOffsets(): void {
    let offset = 0
    const noffsets = this._sizes.length
    this._offsets = new Array<number>(noffsets)
    for (let i = 0; i < this._sizes.length; ++i) {
      this._offsets[i] = offset
      offset += this._sizes[i]!
    }
  }

  // stencilTable.h:688-694
  resize(nstencils: number, nelems: number): void {
    resizeArray(this._sizes, nstencils)
    resizeArray(this._indices, nelems)
    resizeArray(this._weights, nelems)
  }

  // stencilTable.h:696-718 (reserve and shrinkToFit are no-ops for JS arrays)
  reserve(_nstencils: number, _nelems: number): void {}
  shrinkToFit(): void {}
  finalize(): void {
    this.shrinkToFit()
    this.generateOffsets()
  }
}

/** std::vector<T>::resize for a JS array: new elements are zero. */
export function resizeArray(array: number[], size: number): void {
  const old = array.length
  array.length = size
  for (let i = old; i < size; ++i) array[i] = 0
}

// stencilTable.h:302-390 -- Far::LimitStencilReal<REAL>.
export class LimitStencilReal extends StencilReal {
  constructor(
    sizes: number[],
    sizeIndex: number,
    indices: number[],
    weights: number[],
    offset: number,
    public _duWeights: number[] | null = null,
    public _dvWeights: number[] | null = null,
    public _duuWeights: number[] | null = null,
    public _duvWeights: number[] | null = null,
    public _dvvWeights: number[] | null = null,
  ) {
    super(sizes, sizeIndex, indices, weights, offset)
  }

  private slice(w: number[] | null): number[] | null {
    return w ? w.slice(this._offset, this._offset + this.getSize()) : null
  }
  // stencilTable.h:333-356 (copies of the stencil's derivative weights)
  getDuWeights(): number[] | null {
    return this.slice(this._duWeights)
  }
  getDvWeights(): number[] | null {
    return this.slice(this._dvWeights)
  }
  getDuuWeights(): number[] | null {
    return this.slice(this._duuWeights)
  }
  getDuvWeights(): number[] | null {
    return this.slice(this._duvWeights)
  }
  getDvvWeights(): number[] | null {
    return this.slice(this._dvvWeights)
  }
  // stencilTable.h:359-370 -- the derivative arrays share the offset.
  override Next(): void {
    super.Next()
  }
}

// stencilTable.h:408-581 and stencilTable.cpp:173-211 --
// Far::LimitStencilTableReal<REAL>.
export class LimitStencilTableReal extends StencilTableReal {
  _duWeights: number[] = []
  _dvWeights: number[] = []
  _duuWeights: number[] = []
  _duvWeights: number[] = []
  _dvvWeights: number[] = []

  // stencilTable.cpp:173-201
  static fromLimitStencilData(
    real: Real,
    numControlVerts: number,
    offsets: readonly number[],
    sizes: readonly number[],
    sources: readonly number[],
    weights: readonly number[],
    duWeights: readonly number[],
    dvWeights: readonly number[],
    duuWeights: readonly number[],
    duvWeights: readonly number[],
    dvvWeights: readonly number[],
    includeCoarseVerts: boolean,
    firstOffset: number,
  ): LimitStencilTableReal {
    const table = new LimitStencilTableReal(real, numControlVerts)
    const data = copyStencilData(numControlVerts, includeCoarseVerts, firstOffset, offsets, sizes, sources, [
      weights,
      duWeights,
      dvWeights,
      duuWeights,
      duvWeights,
      dvvWeights,
    ])
    table._offsets = data.offsets
    table._sizes = data.sizes
    table._indices = data.sources
    table._weights = data.weights[0]!
    table._duWeights = data.weights[1]!
    table._dvWeights = data.weights[2]!
    table._duuWeights = data.weights[3]!
    table._duvWeights = data.weights[4]!
    table._dvvWeights = data.weights[5]!
    return table
  }

  // stencilTable.h:744-776
  getLimitStencil(i: Index): LimitStencilReal {
    const offsets = this.getOffsets()
    if (!(offsets.length > 0 && i < offsets.length)) {
      throw new Error(`LimitStencilTable.GetLimitStencil(): no stencil ${i}`)
    }
    const ofs = offsets[i]!
    const has1st = this._duWeights.length > 0 && this._dvWeights.length > 0
    const has2nd = has1st && this._duuWeights.length > 0 && this._duvWeights.length > 0 && this._dvvWeights.length > 0
    if (has2nd) {
      return new LimitStencilReal(
        this._sizes,
        i,
        this._indices,
        this._weights,
        ofs,
        this._duWeights,
        this._dvWeights,
        this._duuWeights,
        this._duvWeights,
        this._dvvWeights,
      )
    } else if (has1st) {
      return new LimitStencilReal(this._sizes, i, this._indices, this._weights, ofs, this._duWeights, this._dvWeights)
    }
    return new LimitStencilReal(this._sizes, i, this._indices, this._weights, ofs)
  }

  // stencilTable.h:436-454
  getDuWeights(): number[] {
    return this._duWeights
  }
  getDvWeights(): number[] {
    return this._dvWeights
  }
  getDuuWeights(): number[] {
    return this._duuWeights
  }
  getDuvWeights(): number[] {
    return this._duvWeights
  }
  getDvvWeights(): number[] {
    return this._dvvWeights
  }

  // stencilTable.h:467-473
  updateDerivs<V extends Primvar<V>>(
    srcValues: PrimvarBuffer<V>,
    uderivs: PrimvarBuffer<V>,
    vderivs: PrimvarBuffer<V>,
    start = -1,
    end = -1,
  ): void {
    this.update(srcValues, uderivs, this._duWeights, start, end)
    this.update(srcValues, vderivs, this._dvWeights, start, end)
  }

  // stencilTable.h:512-519
  update2ndDerivs<V extends Primvar<V>>(
    srcValues: PrimvarBuffer<V>,
    uuderivs: PrimvarBuffer<V>,
    uvderivs: PrimvarBuffer<V>,
    vvderivs: PrimvarBuffer<V>,
    start = -1,
    end = -1,
  ): void {
    this.update(srcValues, uuderivs, this._duuWeights, start, end)
    this.update(srcValues, uvderivs, this._duvWeights, start, end)
    this.update(srcValues, vvderivs, this._dvvWeights, start, end)
  }

  // stencilTable.cpp:203-211
  override clear(): void {
    super.clear()
    this._duWeights = []
    this._dvWeights = []
    this._duuWeights = []
    this._duvWeights = []
    this._dvvWeights = []
  }

  // stencilTable.h:738-743
  override resize(nstencils: number, nelems: number): void {
    super.resize(nstencils, nelems)
    resizeArray(this._duWeights, nelems)
    resizeArray(this._dvWeights, nelems)
  }
}
