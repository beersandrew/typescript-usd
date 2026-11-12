// Ported from OpenSubdiv 3.7.0: opensubdiv/vtr/fvarLevel.h,
//  opensubdiv/vtr/fvarLevel.cpp
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/vtr/fvarLevel.{h,cpp} — Vtr::internal::FVarLevel.
//
// A face-varying "channel": the topology for a set of fvar data (e.g. UVs)
// relative to a Level's vertex topology. Where the fvar values are continuous
// across an edge the channel matches the vertex topology; where they differ (a
// UV seam) a vertex has multiple "sibling" values and the seam edges/values are
// tagged so refinement and interpolation treat the seam as a boundary/crease.
//
// This file ports the base-level analysis (completeTopologyFromFaceValues +
// gatherValueSpans). FVarRefinement (child value generation) is a companion.
//
// DIVERGENCE from upstream: tags are classes with named fields (not packed
// bits); storage uses Int32Array. Non-manifold fvar handling is ported but is
// out of M1's tested scope.

import { Options, VtxBoundaryInterpolation, FVarLinearInterpolation } from '../sdc/options.ts'
import { Rule } from '../sdc/crease.ts'
import type { Level, VTag } from './level.ts'
import type { Index } from './types.ts'

// DIVERGENCE from upstream: like the Level VTag/ETag/FTag tags (see level.ts),
// the fvar tags are packed into integer typed arrays rather than stored as arrays
// of heap objects, and accessed through thin flyweights that write straight back
// into the shared store. This keeps the `tag._field` idiom while dropping the
// per-value/per-edge footprint to a single byte — significant for scenes with
// many fvar channels (UVs) refined across levels. Stored values are unchanged.

// FVarETag bit layout (4 bits — fits Uint8).
const FE_MISMATCH = 1 << 0 // local fvar topology does not match vertex topology
const FE_DISCTSV0 = 1 << 1 // discontinuous at edge vertex 0
const FE_DISCTSV1 = 1 << 2 // discontinuous at edge vertex 1
const FE_LINEAR = 1 << 3 // linear boundary constraints

/** Per-edge fvar tag. */
export class FVarETag {
  readonly _store: Uint8Array
  readonly _i: number
  constructor(store?: Uint8Array, i = 0) {
    this._store = store ?? new Uint8Array(1)
    this._i = i
  }
  private get(bit: number): boolean {
    return (this._store[this._i]! & bit) !== 0
  }
  private set(bit: number, b: boolean): void {
    const w = this._store[this._i]!
    this._store[this._i] = b ? w | bit : w & ~bit
  }
  get _mismatch(): boolean {
    return this.get(FE_MISMATCH)
  }
  set _mismatch(b: boolean) {
    this.set(FE_MISMATCH, b)
  }
  get _disctsV0(): boolean {
    return this.get(FE_DISCTSV0)
  }
  set _disctsV0(b: boolean) {
    this.set(FE_DISCTSV0, b)
  }
  get _disctsV1(): boolean {
    return this.get(FE_DISCTSV1)
  }
  set _disctsV1(b: boolean) {
    this.set(FE_DISCTSV1, b)
  }
  get _linear(): boolean {
    return this.get(FE_LINEAR)
  }
  set _linear(b: boolean) {
    this.set(FE_LINEAR, b)
  }
  clear(): void {
    this._store[this._i] = 0
  }
}

// FVarValueTag bit layout (8 bits — fits Uint8).
const FV_MISMATCH = 1 << 0
const FV_XORDINARY = 1 << 1
const FV_NONMANIFOLD = 1 << 2
const FV_CREASE = 1 << 3 // value is a crease (smooth boundary), else a corner
const FV_SEMISHARP = 1 << 4
const FV_DEPSHARP = 1 << 5 // sharp by dependency on another value
const FV_INFSHARPEDGES = 1 << 6
const FV_INFIRREGULAR = 1 << 7

/** Per-value fvar tag. */
export class FVarValueTag {
  readonly _store: Uint8Array
  readonly _i: number
  constructor(store?: Uint8Array, i = 0) {
    this._store = store ?? new Uint8Array(1)
    this._i = i
  }
  private get(bit: number): boolean {
    return (this._store[this._i]! & bit) !== 0
  }
  private set(bit: number, b: boolean): void {
    const w = this._store[this._i]!
    this._store[this._i] = b ? w | bit : w & ~bit
  }
  get _mismatch(): boolean {
    return this.get(FV_MISMATCH)
  }
  set _mismatch(b: boolean) {
    this.set(FV_MISMATCH, b)
  }
  get _xordinary(): boolean {
    return this.get(FV_XORDINARY)
  }
  set _xordinary(b: boolean) {
    this.set(FV_XORDINARY, b)
  }
  get _nonManifold(): boolean {
    return this.get(FV_NONMANIFOLD)
  }
  set _nonManifold(b: boolean) {
    this.set(FV_NONMANIFOLD, b)
  }
  get _crease(): boolean {
    return this.get(FV_CREASE)
  }
  set _crease(b: boolean) {
    this.set(FV_CREASE, b)
  }
  get _semiSharp(): boolean {
    return this.get(FV_SEMISHARP)
  }
  set _semiSharp(b: boolean) {
    this.set(FV_SEMISHARP, b)
  }
  get _depSharp(): boolean {
    return this.get(FV_DEPSHARP)
  }
  set _depSharp(b: boolean) {
    this.set(FV_DEPSHARP, b)
  }
  get _infSharpEdges(): boolean {
    return this.get(FV_INFSHARPEDGES)
  }
  set _infSharpEdges(b: boolean) {
    this.set(FV_INFSHARPEDGES, b)
  }
  get _infIrregular(): boolean {
    return this.get(FV_INFIRREGULAR)
  }
  set _infIrregular(b: boolean) {
    this.set(FV_INFIRREGULAR, b)
  }

  clear(): void {
    this._store[this._i] = 0
  }

  clone(): FVarValueTag {
    const t = new FVarValueTag()
    t._store[0] = this._store[this._i]!
    return t
  }

  isMismatch(): boolean {
    return this._mismatch
  }
  isDepSharp(): boolean {
    return this._depSharp
  }
  isCrease(): boolean {
    return this._crease
  }
  isCorner(): boolean {
    return !this._crease
  }
  isSemiSharp(): boolean {
    return this._semiSharp
  }
  isInfSharp(): boolean {
    return !this._semiSharp && !this._crease
  }
  hasCreaseEnds(): boolean {
    return this._crease || this._semiSharp
  }

  /** Combine this value tag into a Level VTag (mirrors combineWithLevelVTag). */
  combineWithLevelVTag(levelTag: VTag): VTag {
    if (!this._mismatch) return levelTag
    if (this.isCorner()) {
      levelTag._rule = Rule.CORNER
    } else {
      levelTag._rule = Rule.CREASE
    }
    if (this.isCrease() || this.isSemiSharp()) {
      levelTag._infSharp = false
      levelTag._infSharpCrease = true
      levelTag._corner = false
    } else {
      levelTag._infSharp = true
      levelTag._infSharpCrease = false
      levelTag._corner = !this._infIrregular && !this._infSharpEdges
    }
    levelTag._infSharpEdges = true
    levelTag._infIrregular = this._infIrregular
    levelTag._boundary = true
    levelTag._xordinary = this._xordinary
    levelTag._nonManifold = levelTag._nonManifold || this._nonManifold
    return levelTag
  }
}

/** The two "end faces" of a crease value, for interpolation. */
export class CreaseEndPair {
  _startFace = 0
  _endFace = 0
}

class ValueSpan {
  _size = 0
  _start = 0
  _disctsEdgeCount = 0
  _semiSharpEdgeCount = 0
  _infSharpEdgeCount = 0
}

export class FVarLevel {
  _level: Level
  _options: Options = new Options()

  _isLinear = false
  _hasLinearBoundaries = false
  _hasDependentSharpness = false
  _valueCount = 0

  // Per-face (matches face-vertices of the level).
  _faceVertValues: Int32Array = new Int32Array(0)
  // Per-edge.
  _edgeTags: Uint8Array = new Uint8Array(0) // packed FVarETag bits, 1 per edge
  // Per-vertex.
  _vertSiblingCounts: Int32Array = new Int32Array(0)
  _vertSiblingOffsets: Int32Array = new Int32Array(0)
  _vertFaceSiblings: Int32Array = new Int32Array(0)
  // Per-value.
  _vertValueIndices: Int32Array = new Int32Array(0)
  _vertValueTags: Uint8Array = new Uint8Array(0) // packed FVarValueTag bits, 1 per value
  _vertValueCreaseEnds: CreaseEndPair[] = []

  constructor(level: Level) {
    this._level = level
  }

  // ---- queries -----------------------------------------------------------
  getNumValues(): number {
    return this._valueCount
  }
  isLinear(): boolean {
    return this._isLinear
  }
  hasLinearBoundaries(): boolean {
    return this._hasLinearBoundaries
  }
  hasSmoothBoundaries(): boolean {
    return !this._hasLinearBoundaries
  }
  hasCreaseEnds(): boolean {
    return this.hasSmoothBoundaries()
  }
  getOptions(): Options {
    return this._options
  }

  getFaceValues(fIndex: Index): Int32Array {
    const off = this._level.getOffsetOfFaceVertices(fIndex)
    const cnt = this._level.getNumFaceVertices(fIndex)
    return this._faceVertValues.subarray(off, off + cnt)
  }
  /** Flat per-face-corner value indices (parallels Level face-vertex indices). */
  getAllFaceValues(): Int32Array {
    return this._faceVertValues
  }
  getNumFaceValuesTotal(): number {
    return this._faceVertValues.length
  }

  getVertexFaceSiblings(vIndex: Index): Int32Array {
    const off = this._level.getOffsetOfVertexFaces(vIndex)
    const cnt = this._level.getNumVertexFaces(vIndex)
    return this._vertFaceSiblings.subarray(off, off + cnt)
  }

  getNumVertexValues(v: Index): number {
    return this._vertSiblingCounts[v]!
  }
  getVertexValueOffset(v: Index, sibling = 0): number {
    return this._vertSiblingOffsets[v]! + sibling
  }
  getVertexValue(v: Index, sibling = 0): Index {
    return this._vertValueIndices[this.getVertexValueOffset(v, sibling)]!
  }
  getVertexValues(vIndex: Index): Int32Array {
    const off = this.getVertexValueOffset(vIndex)
    const cnt = this.getNumVertexValues(vIndex)
    return this._vertValueIndices.subarray(off, off + cnt)
  }
  getVertexValueTags(vIndex: Index): FVarValueTag[] {
    const off = this.getVertexValueOffset(vIndex)
    const cnt = this.getNumVertexValues(vIndex)
    // Flyweights bound to the packed store; writes on them persist.
    const out: FVarValueTag[] = new Array(cnt)
    for (let i = 0; i < cnt; ++i) out[i] = new FVarValueTag(this._vertValueTags, off + i)
    return out
  }
  getVertexValueCreaseEnds(vIndex: Index): CreaseEndPair[] {
    const off = this.getVertexValueOffset(vIndex)
    const cnt = this.getNumVertexValues(vIndex)
    return this._vertValueCreaseEnds.slice(off, off + cnt)
  }
  getValueTag(valueIndex: Index): FVarValueTag {
    return new FVarValueTag(this._vertValueTags, valueIndex)
  }
  valueTopologyMatches(valueIndex: Index): boolean {
    return !this.getValueTag(valueIndex)._mismatch
  }
  getEdgeTag(eIndex: Index): FVarETag {
    return new FVarETag(this._edgeTags, eIndex)
  }
  edgeTopologyMatches(eIndex: Index): boolean {
    return !this.getEdgeTag(eIndex)._mismatch
  }

  // ---- neighborhood value queries (used by PrimvarRefiner) --------------

  /** The two crease end values for a given vertex value sibling. */
  getVertexCreaseEndValues(vIndex: Index, vSibling: number): [number, number] {
    const vValueCreaseEnds = this.getVertexValueCreaseEnds(vIndex)
    const vFaces = this._level.getVertexFaces(vIndex)
    const vInFace = this._level.getVertexFaceLocalIndices(vIndex)

    const vertFace0 = vValueCreaseEnds[vSibling]!._startFace
    const vertFace1 = vValueCreaseEnds[vSibling]!._endFace
    const face0Values = this.getFaceValues(vFaces[vertFace0]!)
    const face1Values = this.getFaceValues(vFaces[vertFace1]!)

    let endInFace0 = vInFace[vertFace0]!
    let endInFace1 = vInFace[vertFace1]!
    endInFace0 = endInFace0 === face0Values.length - 1 ? 0 : endInFace0 + 1
    endInFace1 = (endInFace1 ? endInFace1 : face1Values.length) - 1

    return [face0Values[endInFace0]!, face1Values[endInFace1]!]
  }

  /** The pair of values at an edge's two vertices, within incident face fIncToEdge. */
  getEdgeFaceValues(eIndex: Index, fIncToEdge: number): [number, number] {
    const level = this._level
    const eVerts = level.getEdgeVertices(eIndex)
    if (this.getNumVertexValues(eVerts[0]!) + this.getNumVertexValues(eVerts[1]!) > 2) {
      const eFace = level.getEdgeFaces(eIndex)[fIncToEdge]!
      const eInFace = level.getEdgeFaceLocalIndices(eIndex)[fIncToEdge]!
      const fValues = this.getFaceValues(eFace)
      const out: [number, number] = [fValues[eInFace]!, fValues[eInFace + 1 < fValues.length ? eInFace + 1 : 0]!]
      if (eVerts[0] !== level.getFaceVertices(eFace)[eInFace]) {
        const t = out[0]
        out[0] = out[1]
        out[1] = t
      }
      return out
    }
    if (level.getDepth() > 0) {
      return [this.getVertexValueOffset(eVerts[0]!), this.getVertexValueOffset(eVerts[1]!)]
    }
    return [this.getVertexValue(eVerts[0]!), this.getVertexValue(eVerts[1]!)]
  }

  /** The value at the far end of each incident edge of a vertex (continuous edges). */
  getVertexEdgeValues(vIndex: Index): number[] {
    const level = this._level
    const vEdges = level.getVertexEdges(vIndex)
    const vInEdge = level.getVertexEdgeLocalIndices(vIndex)
    const vFaces = level.getVertexFaces(vIndex)
    const vInFace = level.getVertexFaceLocalIndices(vIndex)
    const vIsBoundary = level.getVertexTag(vIndex)._boundary
    const vIsManifold = !level.getVertexTag(vIndex)._nonManifold
    const isBaseLevel = level.getDepth() === 0
    const out: number[] = new Array(vEdges.length)

    for (let i = 0; i < vEdges.length; ++i) {
      const eIndex = vEdges[i]!
      const eVerts = level.getEdgeVertices(eIndex)
      const vOther = eVerts[vInEdge[i] ? 0 : 1]!
      if (this.getNumVertexValues(vOther) === 1) {
        out[i] = isBaseLevel ? this.getVertexValue(vOther) : this.getVertexValueOffset(vOther)
      } else if (vIsManifold) {
        if (vIsBoundary && i === vEdges.length - 1) {
          const fValues = this.getFaceValues(vFaces[i - 1]!)
          const prevInFace = vInFace[i - 1]! ? vInFace[i - 1]! - 1 : fValues.length - 1
          out[i] = fValues[prevInFace]!
        } else {
          const fValues = this.getFaceValues(vFaces[i]!)
          const nextInFace = vInFace[i]! === fValues.length - 1 ? 0 : vInFace[i]! + 1
          out[i] = fValues[nextInFace]!
        }
      } else {
        const eFace0 = level.getEdgeFaces(eIndex)[0]!
        const eInFace0 = level.getEdgeFaceLocalIndices(eIndex)[0]!
        const fVerts = level.getFaceVertices(eFace0)
        const fValues = this.getFaceValues(eFace0)
        out[i] = vOther === fVerts[eInFace0] ? fValues[eInFace0]! : fValues[eInFace0 === fValues.length - 1 ? 0 : eInFace0 + 1]!
      }
    }
    return out
  }

  // ---- face-value (re)construction --------------------------------------

  initializeFaceValuesFromFaceVertices(): void {
    this._faceVertValues.set(this._level.getAllFaceVertices())
  }

  initializeFaceValuesFromVertexFaceSiblings(): void {
    const level = this._level
    const fvIndices = level.getAllFaceVertices()
    for (let i = 0; i < fvIndices.length; ++i) {
      this._faceVertValues[i] = this.getVertexValueOffset(fvIndices[i]!)
    }
    for (let vIndex = 0; vIndex < level.getNumVertices(); ++vIndex) {
      if (this.getNumVertexValues(vIndex) > 1) {
        const vFaces = level.getVertexFaces(vIndex)
        const vInFace = level.getVertexFaceLocalIndices(vIndex)
        const vSiblings = this.getVertexFaceSiblings(vIndex)
        for (let j = 0; j < vFaces.length; ++j) {
          if (vSiblings[j]) {
            const fvOffset = level.getOffsetOfFaceVertices(vFaces[j]!)
            const at = fvOffset + vInFace[j]!
            this._faceVertValues[at] = this._faceVertValues[at]! + vSiblings[j]!
          }
        }
      }
    }
  }

  // ---- sizing / init -----------------------------------------------------
  setOptions(options: Options): void {
    this._options = options
  }
  resizeValues(valueCount: number): void {
    this._valueCount = valueCount
  }
  resizeComponents(): void {
    this._faceVertValues = new Int32Array(this._level.getNumFaceVerticesTotal())
    this._edgeTags = new Uint8Array(this._level.getNumEdges()) // zero-filled == cleared
    this._vertSiblingCounts = new Int32Array(this._level.getNumVertices())
    this._vertSiblingOffsets = new Int32Array(this._level.getNumVertices())
    this._vertFaceSiblings = new Int32Array(this._level.getNumVertexFacesTotal())
  }
  private resizeVertexValues(vertexValueCount: number): void {
    this._vertValueIndices = new Int32Array(vertexValueCount)
    this._vertValueTags = new Uint8Array(vertexValueCount) // zero-filled == cleared
    if (this.hasCreaseEnds()) {
      this._vertValueCreaseEnds = Array.from({ length: vertexValueCount }, () => new CreaseEndPair())
    }
  }

  // ---- the base-level topology analysis ----------------------------------
  completeTopologyFromFaceValues(regularBoundaryValence: number): void {
    const level = this._level
    const geomOptions = this._options.getVtxBoundaryInterpolation()
    const fvarOptions = this._options.getFVarLinearInterpolation()

    this._isLinear = fvarOptions === FVarLinearInterpolation.ALL
    this._hasLinearBoundaries =
      fvarOptions === FVarLinearInterpolation.ALL || fvarOptions === FVarLinearInterpolation.BOUNDARIES
    this._hasDependentSharpness =
      fvarOptions === FVarLinearInterpolation.CORNERS_PLUS1 || fvarOptions === FVarLinearInterpolation.CORNERS_PLUS2

    const geomCornersAreSmooth = geomOptions !== VtxBoundaryInterpolation.EDGE_AND_CORNER
    const fvarCornersAreSharp = fvarOptions !== FVarLinearInterpolation.NONE
    const makeSmoothCornersSharp = geomCornersAreSmooth && fvarCornersAreSharp
    const sharpenBothIfOneCorner = fvarOptions === FVarLinearInterpolation.CORNERS_PLUS2
    const sharpenDarts = sharpenBothIfOneCorner || this._hasLinearBoundaries

    const numVerts = level.getNumVertices()
    const vertexMismatch = new Uint8Array(numVerts)
    this._vertFaceSiblings = new Int32Array(level.getNumVertexFacesTotal())

    let totalValueCount = 0
    for (let vIndex = 0; vIndex < numVerts; ++vIndex) {
      const vFaces = level.getVertexFaces(vIndex)
      const vInFace = level.getVertexFaceLocalIndices(vIndex)
      const vValues: number[] = new Array(vFaces.length)
      for (let i = 0; i < vFaces.length; ++i) {
        vValues[i] = this._faceVertValues[level.getOffsetOfFaceVertices(vFaces[i]!) + vInFace[i]!]!
      }

      const vEdges = level.getVertexEdges(vIndex)
      const vInEdge = level.getVertexEdgeLocalIndices(vIndex)
      const vIsManifold = !level.getVertexTag(vIndex)._nonManifold
      const vIsBoundary = level.getVertexTag(vIndex)._boundary

      if (vIsManifold) {
        for (let i = vIsBoundary ? 1 : 0; i < vFaces.length; ++i) {
          const vFaceNext = i
          const vFacePrev = i ? i - 1 : vFaces.length - 1
          if (vValues[vFaceNext] !== vValues[vFacePrev]) {
            const eIndex = vEdges[i]!
            const eVerts = level.getEdgeVertices(eIndex)
            vertexMismatch[eVerts[0]!] = 1
            vertexMismatch[eVerts[1]!] = 1
            const eTag = this.getEdgeTag(eIndex)
            eTag._disctsV0 = eVerts[0] === vIndex
            eTag._disctsV1 = eVerts[1] === vIndex
            eTag._mismatch = true
            eTag._linear = this._hasLinearBoundaries
          }
        }
      } else if (vFaces.length > 0) {
        for (let i = 0; i < vEdges.length; ++i) {
          const eIndex = vEdges[i]!
          const eFaces = level.getEdgeFaces(eIndex)
          if (eFaces.length < 2) continue
          const eInFace = level.getEdgeFaceLocalIndices(eIndex)
          const eVerts = level.getEdgeVertices(eIndex)
          const vertInEdge = vInEdge[i]!
          let markEdgeDiscts = false
          let valueIndexInFace0 = 0
          for (let j = 0; !markEdgeDiscts && j < eFaces.length; ++j) {
            const fIndex = eFaces[j]!
            const fVerts = level.getFaceVertices(fIndex)
            const fValues = this.getFaceValues(fIndex)
            const edgeInFace = eInFace[j]!
            const edgeReversed = eVerts[0] !== fVerts[edgeInFace] ? 1 : 0
            let vertInFace = edgeInFace + (vertInEdge !== edgeReversed ? 1 : 0)
            if (vertInFace === fVerts.length) vertInFace = 0
            if (j === 0) valueIndexInFace0 = fValues[vertInFace]!
            else markEdgeDiscts = fValues[vertInFace] !== valueIndexInFace0
          }
          if (markEdgeDiscts) {
            vertexMismatch[eVerts[0]!] = 1
            vertexMismatch[eVerts[1]!] = 1
            const eTag = this.getEdgeTag(eIndex)
            eTag._disctsV0 = eVerts[0] === vIndex
            eTag._disctsV1 = eVerts[1] === vIndex
            eTag._mismatch = true
            eTag._linear = this._hasLinearBoundaries
          }
        }
      }

      if (vIsBoundary && !vertexMismatch[vIndex]) {
        if (this._hasLinearBoundaries && vFaces.length > 0) {
          vertexMismatch[vIndex] = 1
          if (vIsManifold) {
            this.getEdgeTag(vEdges[0]!)._linear = true
            this.getEdgeTag(vEdges[vEdges.length - 1]!)._linear = true
          } else {
            for (let i = 0; i < vEdges.length; ++i) {
              if (level.getEdgeTag(vEdges[i]!)._boundary) this.getEdgeTag(vEdges[i]!)._linear = true
            }
          }
        } else if (vFaces.length === 1) {
          if (makeSmoothCornersSharp) vertexMismatch[vIndex] = 1
        }
      }

      // Identify unique sibling values around the vertex.
      let uniqueValueCount = 1
      const uniqueValues: number[] = [vValues[0]!]
      const vValueSiblings: number[] = new Array(vFaces.length)
      vValueSiblings[0] = 0
      for (let i = 1; i < vFaces.length; ++i) {
        if (vValues[i] === vValues[i - 1]) {
          vValueSiblings[i] = vValueSiblings[i - 1]!
        } else {
          vValueSiblings[i] = uniqueValueCount
          const found = uniqueValues.indexOf(vValues[i]!)
          if (found === -1) {
            uniqueValues.push(vValues[i]!)
            uniqueValueCount++
          } else {
            vValueSiblings[i] = found
          }
        }
      }

      if (!vIsManifold && !vertexMismatch[vIndex]) {
        vertexMismatch[vIndex] = uniqueValueCount > 1 ? 1 : 0
      }

      this._vertSiblingCounts[vIndex] = uniqueValueCount
      this._vertSiblingOffsets[vIndex] = totalValueCount
      totalValueCount += uniqueValueCount

      if (uniqueValueCount > 1) {
        const vFaceSiblings = this.getVertexFaceSiblings(vIndex)
        for (let i = 0; i < vFaces.length; ++i) vFaceSiblings[i] = vValueSiblings[i]!
      }
    }

    // Second pass: assign values and tag topology for mismatched vertices.
    this.resizeVertexValues(totalValueCount)

    for (let vIndex = 0; vIndex < numVerts; ++vIndex) {
      const vFaces = level.getVertexFaces(vIndex)
      const vInFace = level.getVertexFaceLocalIndices(vIndex)
      const vValues = this.getVertexValues(vIndex)

      if (vFaces.length > 0) {
        vValues[0] = this._faceVertValues[level.getOffsetOfFaceVertices(vFaces[0]!) + vInFace[0]!]!
      } else {
        vValues[0] = 0
      }
      if (!vertexMismatch[vIndex]) continue

      if (vValues.length > 1) {
        const vFaceSiblings = this.getVertexFaceSiblings(vIndex)
        let nextSibling = 1
        for (let i = 1; i < vFaces.length; ++i) {
          if (vFaceSiblings[i] === nextSibling) {
            vValues[nextSibling++] = this._faceVertValues[level.getOffsetOfFaceVertices(vFaces[i]!) + vInFace[i]!]!
          }
        }
      }

      const vValueTags = this.getVertexValueTags(vIndex)
      const vTag = level.getVertexTag(vIndex)

      let allCornersAreSharp =
        this._hasLinearBoundaries ||
        vTag._infSharp ||
        vTag._nonManifold ||
        (this._hasDependentSharpness && vValues.length > 2) ||
        (sharpenDarts && vValues.length === 1 && !vTag._boundary)

      const vValueSpans = Array.from({ length: vValues.length }, () => new ValueSpan())
      this.gatherValueSpans(vIndex, vValueSpans)

      let hasDependentValuesToSharpen = false
      if (!allCornersAreSharp) {
        if (this._hasDependentSharpness && vValues.length === 2) {
          allCornersAreSharp =
            vValueSpans[0]!._infSharpEdgeCount > 0 ||
            vValueSpans[1]!._infSharpEdgeCount > 0 ||
            vValueSpans[0]!._disctsEdgeCount > 0 ||
            vValueSpans[1]!._disctsEdgeCount > 0
          if (sharpenBothIfOneCorner) {
            allCornersAreSharp = allCornersAreSharp || vValueSpans[0]!._size === 1 || vValueSpans[1]!._size === 1
          }
          hasDependentValuesToSharpen =
            vValueSpans[0]!._semiSharpEdgeCount > 0 !== vValueSpans[1]!._semiSharpEdgeCount > 0
        }
      }

      const creaseEnds = this.hasCreaseEnds() ? this.getVertexValueCreaseEnds(vIndex) : null
      for (let i = 0; i < vValues.length; ++i) {
        const valueTag = vValueTags[i]!
        valueTag.clear()
        valueTag._mismatch = true

        const vSpan = vValueSpans[i]!
        if (vSpan._disctsEdgeCount > 0) {
          valueTag._nonManifold = true
          continue
        }

        const isInfSharp =
          allCornersAreSharp || vSpan._infSharpEdgeCount > 0 || (vSpan._size === 1 && fvarCornersAreSharp)

        if (vSpan._size === 1) valueTag._xordinary = !isInfSharp
        else valueTag._xordinary = vSpan._size !== regularBoundaryValence

        valueTag._infSharpEdges = vSpan._infSharpEdgeCount > 0
        valueTag._infIrregular =
          vSpan._infSharpEdgeCount > 0
            ? vSpan._size - vSpan._infSharpEdgeCount > 1
            : isInfSharp
              ? vSpan._size > 1
              : valueTag._xordinary

        if (!isInfSharp) {
          if (vSpan._semiSharpEdgeCount > 0 || vTag._semiSharp) {
            valueTag._semiSharp = true
          } else if (hasDependentValuesToSharpen) {
            valueTag._semiSharp = true
            valueTag._depSharp = true
          } else {
            valueTag._crease = true
          }
          if (creaseEnds) {
            const valueCrease = creaseEnds[i]!
            valueCrease._startFace = vSpan._start
            if (i === 0 && vSpan._start !== 0) {
              valueCrease._endFace = vSpan._start + vSpan._size - 1 - vFaces.length
            } else {
              valueCrease._endFace = vSpan._start + vSpan._size - 1
            }
          }
        }
      }
      // getVertexValueTags returns flyweights bound to the packed value store and
      // getVertexValueCreaseEnds returns the same CreaseEndPair objects stored in
      // the backing array, so the mutations above are already persisted.
    }
  }

  gatherValueSpans(vIndex: Index, vValueSpans: ValueSpan[]): void {
    const level = this._level
    const vEdges = level.getVertexEdges(vIndex)
    const vFaces = level.getVertexFaces(vIndex)
    const vFaceSiblings = this.getVertexFaceSiblings(vIndex)

    const vHasSingleValue = this.getNumVertexValues(vIndex) === 1
    const vIsBoundary = vEdges.length > vFaces.length
    const vIsNonManifold = level.getVertexTag(vIndex)._nonManifold

    if (vIsNonManifold) {
      const vValues = this.getVertexValues(vIndex)
      for (let i = 0; i < vValues.length; ++i) {
        vValueSpans[i]!._size = 0
        vValueSpans[i]!._disctsEdgeCount = 1
      }
    } else if (vHasSingleValue && !vIsBoundary) {
      vValueSpans[0]!._size = 0
      vValueSpans[0]!._start = 0
      for (let i = 0; i < vEdges.length; ++i) {
        if (this.getEdgeTag(vEdges[i]!)._mismatch) {
          if (vValueSpans[0]!._size > 0) {
            vValueSpans[0]!._disctsEdgeCount = 1
            break
          } else {
            vValueSpans[0]!._size = vFaces.length
            vValueSpans[0]!._start = i
          }
        } else if (level.getEdgeTag(vEdges[i]!)._infSharp) {
          ++vValueSpans[0]!._infSharpEdgeCount
        } else if (level.getEdgeTag(vEdges[i]!)._semiSharp) {
          ++vValueSpans[0]!._semiSharpEdgeCount
        }
      }
      vValueSpans[0]!._size = vFaces.length
    } else {
      vValueSpans[0]!._size = 1
      vValueSpans[0]!._start = 0
      if (!vIsBoundary && vFaceSiblings[vFaces.length - 1] === 0) {
        if (this.getEdgeTag(vEdges[0]!)._mismatch) ++vValueSpans[0]!._disctsEdgeCount
        else if (level.getEdgeTag(vEdges[0]!)._infSharp) ++vValueSpans[0]!._infSharpEdgeCount
        else if (level.getEdgeTag(vEdges[0]!)._semiSharp) ++vValueSpans[0]!._semiSharpEdgeCount
      }
      for (let i = 1; i < vFaces.length; ++i) {
        const sib = vFaceSiblings[i]!
        if (sib === vFaceSiblings[i - 1]) {
          if (this.getEdgeTag(vEdges[i]!)._mismatch) ++vValueSpans[sib]!._disctsEdgeCount
          else if (level.getEdgeTag(vEdges[i]!)._infSharp) ++vValueSpans[sib]!._infSharpEdgeCount
          else if (level.getEdgeTag(vEdges[i]!)._semiSharp) ++vValueSpans[sib]!._semiSharpEdgeCount
        } else {
          if (vValueSpans[sib]!._size > 0) ++vValueSpans[sib]!._disctsEdgeCount
          vValueSpans[sib]!._start = i
        }
        ++vValueSpans[sib]!._size
      }
      if (vFaceSiblings[vFaces.length - 1] === 0 && !vIsBoundary) {
        --vValueSpans[0]!._disctsEdgeCount
      }
    }
  }
}
