// Ported from OpenSubdiv 3.7.0: opensubdiv/vtr/level.h,
//  opensubdiv/vtr/level.cpp
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/vtr/level.{h,cpp} — Vtr::internal::Level.
//
// A refinement level: a vectorized (SOA) representation of the topology for one
// subdivision level. Topology is "complete" — any level can serve as the base
// of another hierarchy. Six topological relations are stored, each in its own
// flat table with a parallel count/offset table for the variable-sized ones:
//
//   face-verts, face-edges, edge-verts, edge-faces, vert-faces, vert-edges
//
// DIVERGENCE from upstream: the VTag/ETag/FTag bitfield structs are modeled as
// classes with named fields; `BitwiseOr` composites them field-wise (same
// semantics as OR-ing the packed bits). Relation tables are Int32Array; views
// are `.subarray()` slices that share the buffer (writable, like Vtr::Array).
//
// This file currently provides the data container, sizing, and accessors. The
// topology-construction logic (completeTopologyFromFaceVertices and helpers)
// and face-varying channels are ported in companion steps.

import { Rule } from '../sdc/crease.ts'
import type { Options } from '../sdc/options.ts'
import { FVarLevel } from './fvarLevel.ts'
import { INDEX_INVALID, IndexIsValid, VALENCE_LIMIT } from './types.ts'
import type { Index, LocalIndex, ConstIndexArray, IndexArray, ConstLocalIndexArray, LocalIndexArray } from './types.ts'

// std::find offset, or array length when not found (matches C++ semantics).
function findInArray(arr: ArrayLike<number>, value: number): number {
  for (let i = 0; i < arr.length; ++i) if (arr[i] === value) return i
  return arr.length
}

// Build-time edge lookup over the growing edge-vertex pair list.
function findEdgeInBuilder(v0: number, v1: number, v0Edges: number[], edgeVerts: number[]): number {
  if (v0 !== v1) {
    for (const e of v0Edges) {
      if (edgeVerts[2 * e] === v1 || edgeVerts[2 * e + 1] === v1) return e
    }
  } else {
    for (const e of v0Edges) {
      if (edgeVerts[2 * e] === edgeVerts[2 * e + 1]) return e
    }
  }
  return INDEX_INVALID
}

// A growable incidence-relation builder. Upstream's Vtr::DynamicRelation packs a
// regular block plus an irregular overflow map for memory efficiency; an
// array-of-arrays is behavior-identical and far simpler.
// DIVERGENCE from upstream: simplified storage, finalized into typed arrays.
class DynRelation {
  members: number[][]
  constructor(compCount: number) {
    this.members = new Array(compCount)
    for (let i = 0; i < compCount; ++i) this.members[i] = []
  }
  get(i: number): number[] {
    return this.members[i]!
  }
  append(i: number, v: number): void {
    this.members[i]!.push(v)
  }
  appendComponent(): void {
    this.members.push([])
  }
  finalize(): { co: Int32Array; idx: Int32Array; max: number } {
    const n = this.members.length
    const co = new Int32Array(2 * n)
    let total = 0
    let max = 0
    for (let i = 0; i < n; ++i) {
      const c = this.members[i]!.length
      co[2 * i] = c
      co[2 * i + 1] = total
      total += c
      if (c > max) max = c
    }
    const idx = new Int32Array(total)
    let p = 0
    for (let i = 0; i < n; ++i) {
      const m = this.members[i]!
      for (let k = 0; k < m.length; ++k) idx[p++] = m[k]!
    }
    return { co, idx, max }
  }
}

// ---------------------------------------------------------------------------
//  Component tags
// ---------------------------------------------------------------------------
//
// DIVERGENCE from upstream: upstream packs each of VTag/ETag/FTag into a single
// integer bitfield stored contiguously in a std::vector. We do the same — the
// per-component tag arrays on Level are packed integer typed arrays — but expose
// the bits through a thin flyweight with the same named fields upstream uses, so
// call sites keep the `tag._field` idiom (read AND write). A flyweight returned
// by Level.getVertexTag/getEdgeTag/getFaceTag is bound to (store, index) in the
// shared packed array, so mutation-through-getter persists exactly as it did
// when tags were heap objects. A default-constructed tag owns a private
// 1-element store (detached) — used for transient composites like BitwiseOr.
//
// Storing the tags as typed arrays instead of arrays of heap objects drops the
// per-component footprint from ~80-100 bytes (a JS object) to 1-2 bytes, which
// matters for large scenes (many refiners × dense per-level tag vectors). The
// stored values are unchanged, so refined topology/positions are bit-identical.

// VTag bit layout (16 bits — fits Uint16). Booleans occupy bits 0-11; the 4-bit
// Rule enum (values 0,1,2,4,8) occupies bits 12-15.
const V_NONMANIFOLD = 1 << 0
const V_XORDINARY = 1 << 1
const V_BOUNDARY = 1 << 2
const V_CORNER = 1 << 3
const V_INFSHARP = 1 << 4
const V_SEMISHARP = 1 << 5
const V_SEMISHARPEDGES = 1 << 6
const V_INCOMPLETE = 1 << 7
const V_INCIDIRREGFACE = 1 << 8
const V_INFSHARPEDGES = 1 << 9
const V_INFSHARPCREASE = 1 << 10
const V_INFIRREGULAR = 1 << 11
const V_RULE_SHIFT = 12
const V_RULE_MASK = 0xf << V_RULE_SHIFT

/** Per-vertex tag: topological nature + creasing influence. */
export class VTag {
  readonly _store: Uint16Array
  readonly _i: number
  constructor(store?: Uint16Array, i = 0) {
    this._store = store ?? new Uint16Array(1)
    this._i = i
  }
  private get(bit: number): boolean {
    return (this._store[this._i]! & bit) !== 0
  }
  private set(bit: number, b: boolean): void {
    const w = this._store[this._i]!
    this._store[this._i] = b ? w | bit : w & ~bit
  }

  get _nonManifold(): boolean {
    return this.get(V_NONMANIFOLD)
  }
  set _nonManifold(b: boolean) {
    this.set(V_NONMANIFOLD, b)
  }
  get _xordinary(): boolean {
    return this.get(V_XORDINARY)
  }
  set _xordinary(b: boolean) {
    this.set(V_XORDINARY, b)
  }
  get _boundary(): boolean {
    return this.get(V_BOUNDARY)
  }
  set _boundary(b: boolean) {
    this.set(V_BOUNDARY, b)
  }
  get _corner(): boolean {
    return this.get(V_CORNER)
  }
  set _corner(b: boolean) {
    this.set(V_CORNER, b)
  }
  get _infSharp(): boolean {
    return this.get(V_INFSHARP)
  }
  set _infSharp(b: boolean) {
    this.set(V_INFSHARP, b)
  }
  get _semiSharp(): boolean {
    return this.get(V_SEMISHARP)
  }
  set _semiSharp(b: boolean) {
    this.set(V_SEMISHARP, b)
  }
  get _semiSharpEdges(): boolean {
    return this.get(V_SEMISHARPEDGES)
  }
  set _semiSharpEdges(b: boolean) {
    this.set(V_SEMISHARPEDGES, b)
  }
  get _incomplete(): boolean {
    return this.get(V_INCOMPLETE)
  }
  set _incomplete(b: boolean) {
    this.set(V_INCOMPLETE, b)
  }
  get _incidIrregFace(): boolean {
    return this.get(V_INCIDIRREGFACE)
  }
  set _incidIrregFace(b: boolean) {
    this.set(V_INCIDIRREGFACE, b)
  }
  get _infSharpEdges(): boolean {
    return this.get(V_INFSHARPEDGES)
  }
  set _infSharpEdges(b: boolean) {
    this.set(V_INFSHARPEDGES, b)
  }
  get _infSharpCrease(): boolean {
    return this.get(V_INFSHARPCREASE)
  }
  set _infSharpCrease(b: boolean) {
    this.set(V_INFSHARPCREASE, b)
  }
  get _infIrregular(): boolean {
    return this.get(V_INFIRREGULAR)
  }
  set _infIrregular(b: boolean) {
    this.set(V_INFIRREGULAR, b)
  }
  get _rule(): number {
    return (this._store[this._i]! & V_RULE_MASK) >> V_RULE_SHIFT
  }
  set _rule(r: number) {
    this._store[this._i] = (this._store[this._i]! & ~V_RULE_MASK) | ((r << V_RULE_SHIFT) & V_RULE_MASK)
  }

  clear(): void {
    this._store[this._i] = 0
  }

  /** Composite (field-wise OR) of several VTags. Mirrors VTag::BitwiseOr. */
  static bitwiseOr(vTags: ArrayLike<VTag>, size = 4): VTag {
    const r = new VTag()
    r._rule = 0
    for (let i = 0; i < size; ++i) {
      const t = vTags[i]!
      r._nonManifold ||= t._nonManifold
      r._xordinary ||= t._xordinary
      r._boundary ||= t._boundary
      r._corner ||= t._corner
      r._infSharp ||= t._infSharp
      r._semiSharp ||= t._semiSharp
      r._semiSharpEdges ||= t._semiSharpEdges
      r._rule |= t._rule
      r._incomplete ||= t._incomplete
      r._incidIrregFace ||= t._incidIrregFace
      r._infSharpEdges ||= t._infSharpEdges
      r._infSharpCrease ||= t._infSharpCrease
      r._infIrregular ||= t._infIrregular
    }
    return r
  }
}

// ETag bit layout (4 bits — fits Uint8).
const E_NONMANIFOLD = 1 << 0
const E_BOUNDARY = 1 << 1
const E_INFSHARP = 1 << 2
const E_SEMISHARP = 1 << 3

/** Per-edge tag. */
export class ETag {
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

  get _nonManifold(): boolean {
    return this.get(E_NONMANIFOLD)
  }
  set _nonManifold(b: boolean) {
    this.set(E_NONMANIFOLD, b)
  }
  get _boundary(): boolean {
    return this.get(E_BOUNDARY)
  }
  set _boundary(b: boolean) {
    this.set(E_BOUNDARY, b)
  }
  get _infSharp(): boolean {
    return this.get(E_INFSHARP)
  }
  set _infSharp(b: boolean) {
    this.set(E_INFSHARP, b)
  }
  get _semiSharp(): boolean {
    return this.get(E_SEMISHARP)
  }
  set _semiSharp(b: boolean) {
    this.set(E_SEMISHARP, b)
  }

  clear(): void {
    this._store[this._i] = 0
  }

  static bitwiseOr(eTags: ArrayLike<ETag>, size = 4): ETag {
    const r = new ETag()
    for (let i = 0; i < size; ++i) {
      const t = eTags[i]!
      r._nonManifold ||= t._nonManifold
      r._boundary ||= t._boundary
      r._infSharp ||= t._infSharp
      r._semiSharp ||= t._semiSharp
    }
    return r
  }
}

// FTag bit layout (1 bit).
const F_HOLE = 1 << 0

/** Per-face tag: currently just the hole flag. */
export class FTag {
  readonly _store: Uint8Array
  readonly _i: number
  constructor(store?: Uint8Array, i = 0) {
    this._store = store ?? new Uint8Array(1)
    this._i = i
  }
  get _hole(): boolean {
    return (this._store[this._i]! & F_HOLE) !== 0
  }
  set _hole(b: boolean) {
    const w = this._store[this._i]!
    this._store[this._i] = b ? w | F_HOLE : w & ~F_HOLE
  }
  clear(): void {
    this._store[this._i] = 0
  }
}

/** A subset of the faces around a vertex, delimited by some discontinuity. */
export class VSpan {
  _numFaces: LocalIndex = 0
  _startFace: LocalIndex = 0
  _cornerInSpan: LocalIndex = 0
  _periodic = false
  _sharp = false

  clear(): void {
    this._numFaces = 0
    this._startFace = 0
    this._cornerInSpan = 0
    this._periodic = false
    this._sharp = false
  }
  isAssigned(): boolean {
    return this._numFaces > 0
  }
}

// ---------------------------------------------------------------------------
//  Level
// ---------------------------------------------------------------------------

const EMPTY_I32 = new Int32Array(0)

export class Level {
  // Inventory
  _faceCount = 0
  _edgeCount = 0
  _vertCount = 0
  _depth = 0
  _maxEdgeFaces = 0
  _maxValence = 0

  // Per-face
  _faceVertCountsAndOffsets: Int32Array = EMPTY_I32 // 2 per face
  _faceVertIndices: Int32Array = EMPTY_I32 // 3 or 4 per face (variable at level 0)
  _faceEdgeIndices: Int32Array = EMPTY_I32 // matches face-vert indices
  _faceTags: Uint8Array = new Uint8Array(0) // packed FTag bits, 1 per face

  // Per-edge
  _edgeVertIndices: Int32Array = EMPTY_I32 // 2 per edge
  _edgeFaceCountsAndOffsets: Int32Array = EMPTY_I32 // 2 per edge
  _edgeFaceIndices: Int32Array = EMPTY_I32 // varies with faces per edge
  _edgeFaceLocalIndices: Int32Array = EMPTY_I32 // varies with faces per edge
  _edgeSharpness: Float32Array = new Float32Array(0) // 1 per edge
  _edgeTags: Uint8Array = new Uint8Array(0) // packed ETag bits, 1 per edge

  // Per-vertex
  _vertFaceCountsAndOffsets: Int32Array = EMPTY_I32 // 2 per vertex
  _vertFaceIndices: Int32Array = EMPTY_I32 // varies with valence
  _vertFaceLocalIndices: Int32Array = EMPTY_I32 // varies with valence
  _vertEdgeCountsAndOffsets: Int32Array = EMPTY_I32 // 2 per vertex
  _vertEdgeIndices: Int32Array = EMPTY_I32 // varies with valence
  _vertEdgeLocalIndices: Int32Array = EMPTY_I32 // varies with valence
  _vertSharpness: Float32Array = new Float32Array(0) // 1 per vertex
  _vertTags: Uint16Array = new Uint16Array(0) // packed VTag bits, 1 per vertex

  // Face-varying channels.
  _fvarChannels: FVarLevel[] = []

  // ---- Simple accessors -------------------------------------------------

  getDepth(): number {
    return this._depth
  }
  getNumVertices(): number {
    return this._vertCount
  }
  getNumFaces(): number {
    return this._faceCount
  }
  getNumEdges(): number {
    return this._edgeCount
  }

  getNumFaceVerticesTotal(): number {
    return this._faceVertIndices.length
  }
  getNumFaceEdgesTotal(): number {
    return this._faceEdgeIndices.length
  }
  getNumEdgeVerticesTotal(): number {
    return this._edgeVertIndices.length
  }
  getNumEdgeFacesTotal(): number {
    return this._edgeFaceIndices.length
  }
  getNumVertexFacesTotal(): number {
    return this._vertFaceIndices.length
  }
  getNumVertexEdgesTotal(): number {
    return this._vertEdgeIndices.length
  }

  getMaxValence(): number {
    return this._maxValence
  }
  getMaxEdgeFaces(): number {
    return this._maxEdgeFaces
  }

  // ---- Counts and offsets for the relation tables -----------------------

  getNumFaceVertices(faceIndex: Index): number {
    return this._faceVertCountsAndOffsets[2 * faceIndex]!
  }
  getOffsetOfFaceVertices(faceIndex: Index): number {
    return this._faceVertCountsAndOffsets[2 * faceIndex + 1]!
  }
  getNumFaceEdges(faceIndex: Index): number {
    return this.getNumFaceVertices(faceIndex)
  }
  getOffsetOfFaceEdges(faceIndex: Index): number {
    return this.getOffsetOfFaceVertices(faceIndex)
  }
  getNumEdgeVertices(_edgeIndex: Index): number {
    return 2
  }
  getOffsetOfEdgeVertices(edgeIndex: Index): number {
    return 2 * edgeIndex
  }
  getNumEdgeFaces(edgeIndex: Index): number {
    return this._edgeFaceCountsAndOffsets[2 * edgeIndex]!
  }
  getOffsetOfEdgeFaces(edgeIndex: Index): number {
    return this._edgeFaceCountsAndOffsets[2 * edgeIndex + 1]!
  }
  getNumVertexFaces(vertIndex: Index): number {
    return this._vertFaceCountsAndOffsets[2 * vertIndex]!
  }
  getOffsetOfVertexFaces(vertIndex: Index): number {
    return this._vertFaceCountsAndOffsets[2 * vertIndex + 1]!
  }
  getNumVertexEdges(vertIndex: Index): number {
    return this._vertEdgeCountsAndOffsets[2 * vertIndex]!
  }
  getOffsetOfVertexEdges(vertIndex: Index): number {
    return this._vertEdgeCountsAndOffsets[2 * vertIndex + 1]!
  }

  // ---- Relation accessors (return writable subarray views) --------------
  //
  //  Upstream has separate const/non-const overloads; a JS subarray view is
  //  always mutable, so each relation has a single accessor here.

  getFaceVertices(faceIndex: Index): IndexArray {
    const off = this._faceVertCountsAndOffsets[2 * faceIndex + 1]!
    const cnt = this._faceVertCountsAndOffsets[2 * faceIndex]!
    return this._faceVertIndices.subarray(off, off + cnt)
  }
  getAllFaceVertices(): ConstIndexArray {
    return this._faceVertIndices
  }
  getFaceEdges(faceIndex: Index): IndexArray {
    const off = this._faceVertCountsAndOffsets[2 * faceIndex + 1]!
    const cnt = this._faceVertCountsAndOffsets[2 * faceIndex]!
    return this._faceEdgeIndices.subarray(off, off + cnt)
  }
  getEdgeVertices(edgeIndex: Index): IndexArray {
    return this._edgeVertIndices.subarray(2 * edgeIndex, 2 * edgeIndex + 2)
  }
  getEdgeFaces(edgeIndex: Index): IndexArray {
    const off = this._edgeFaceCountsAndOffsets[2 * edgeIndex + 1]!
    const cnt = this._edgeFaceCountsAndOffsets[2 * edgeIndex]!
    return this._edgeFaceIndices.subarray(off, off + cnt)
  }
  getEdgeFaceLocalIndices(edgeIndex: Index): LocalIndexArray {
    const off = this._edgeFaceCountsAndOffsets[2 * edgeIndex + 1]!
    const cnt = this._edgeFaceCountsAndOffsets[2 * edgeIndex]!
    return this._edgeFaceLocalIndices.subarray(off, off + cnt)
  }
  getVertexFaces(vertIndex: Index): IndexArray {
    const off = this._vertFaceCountsAndOffsets[2 * vertIndex + 1]!
    const cnt = this._vertFaceCountsAndOffsets[2 * vertIndex]!
    return this._vertFaceIndices.subarray(off, off + cnt)
  }
  getVertexFaceLocalIndices(vertIndex: Index): ConstLocalIndexArray {
    const off = this._vertFaceCountsAndOffsets[2 * vertIndex + 1]!
    const cnt = this._vertFaceCountsAndOffsets[2 * vertIndex]!
    return this._vertFaceLocalIndices.subarray(off, off + cnt)
  }
  getVertexEdges(vertIndex: Index): IndexArray {
    const off = this._vertEdgeCountsAndOffsets[2 * vertIndex + 1]!
    const cnt = this._vertEdgeCountsAndOffsets[2 * vertIndex]!
    return this._vertEdgeIndices.subarray(off, off + cnt)
  }
  getVertexEdgeLocalIndices(vertIndex: Index): ConstLocalIndexArray {
    const off = this._vertEdgeCountsAndOffsets[2 * vertIndex + 1]!
    const cnt = this._vertEdgeCountsAndOffsets[2 * vertIndex]!
    return this._vertEdgeLocalIndices.subarray(off, off + cnt)
  }

  // ---- Sharpness and rules ----------------------------------------------

  getEdgeSharpness(edgeIndex: Index): number {
    return this._edgeSharpness[edgeIndex]!
  }
  setEdgeSharpness(edgeIndex: Index, value: number): void {
    this._edgeSharpness[edgeIndex] = value
  }
  getVertexSharpness(vertIndex: Index): number {
    return this._vertSharpness[vertIndex]!
  }
  setVertexSharpness(vertIndex: Index, value: number): void {
    this._vertSharpness[vertIndex] = value
  }
  getVertexRule(vertIndex: Index): Rule {
    return ((this._vertTags[vertIndex]! & V_RULE_MASK) >> V_RULE_SHIFT) as Rule
  }

  // ---- Tags --------------------------------------------------------------
  //
  //  Each accessor returns a flyweight bound to the packed store at the given
  //  index; field writes on it persist straight back into the array.

  getVertexTag(vertIndex: Index): VTag {
    return new VTag(this._vertTags, vertIndex)
  }
  getEdgeTag(edgeIndex: Index): ETag {
    return new ETag(this._edgeTags, edgeIndex)
  }
  getFaceTag(faceIndex: Index): FTag {
    return new FTag(this._faceTags, faceIndex)
  }

  setFaceHole(faceIndex: Index, b: boolean): void {
    const w = this._faceTags[faceIndex]!
    this._faceTags[faceIndex] = b ? w | F_HOLE : w & ~F_HOLE
  }
  isFaceHole(faceIndex: Index): boolean {
    return (this._faceTags[faceIndex]! & F_HOLE) !== 0
  }

  setEdgeNonManifold(edgeIndex: Index, b: boolean): void {
    const w = this._edgeTags[edgeIndex]!
    this._edgeTags[edgeIndex] = b ? w | E_NONMANIFOLD : w & ~E_NONMANIFOLD
  }
  isEdgeNonManifold(edgeIndex: Index): boolean {
    return (this._edgeTags[edgeIndex]! & E_NONMANIFOLD) !== 0
  }
  setVertexNonManifold(vertIndex: Index, b: boolean): void {
    const w = this._vertTags[vertIndex]!
    this._vertTags[vertIndex] = b ? w | V_NONMANIFOLD : w & ~V_NONMANIFOLD
  }
  isVertexNonManifold(vertIndex: Index): boolean {
    return (this._vertTags[vertIndex]! & V_NONMANIFOLD) !== 0
  }

  // ---- Face-varying channels --------------------------------------------

  getNumFVarChannels(): number {
    return this._fvarChannels.length
  }
  getFVarLevel(channel: number): FVarLevel {
    return this._fvarChannels[channel]!
  }
  getNumFVarValues(channel: number): number {
    return this._fvarChannels[channel]!.getNumValues()
  }
  getFaceFVarValues(faceIndex: Index, channel: number): Int32Array {
    return this._fvarChannels[channel]!.getFaceValues(faceIndex)
  }
  /** Create an fvar channel (call after the base topology is complete). */
  createFVarChannel(numValues: number, options: Options): number {
    const fvar = new FVarLevel(this)
    fvar.setOptions(options)
    fvar.resizeValues(numValues)
    fvar.resizeComponents()
    this._fvarChannels.push(fvar)
    return this._fvarChannels.length - 1
  }
  completeFVarChannelTopology(channel: number, regBoundaryValence: number): void {
    this._fvarChannels[channel]!.completeTopologyFromFaceValues(regBoundaryValence)
  }

  // ---- Sizing (allocate storage, then populate) -------------------------

  resizeFaces(faceCount: number): void {
    this._faceCount = faceCount
    this._faceVertCountsAndOffsets = new Int32Array(2 * faceCount)
    this._faceTags = new Uint8Array(faceCount) // zero-filled == cleared FTags
  }
  resizeFaceVertices(totalFaceVertCount: number): void {
    this._faceVertIndices = new Int32Array(totalFaceVertCount)
  }
  resizeFaceEdges(totalFaceEdgeCount: number): void {
    this._faceEdgeIndices = new Int32Array(totalFaceEdgeCount)
  }

  resizeEdges(edgeCount: number): void {
    this._edgeCount = edgeCount
    this._edgeFaceCountsAndOffsets = new Int32Array(2 * edgeCount)
    this._edgeSharpness = new Float32Array(edgeCount)
    this._edgeTags = new Uint8Array(edgeCount) // zero-filled == cleared ETags
  }
  resizeEdgeVertices(): void {
    this._edgeVertIndices = new Int32Array(2 * this._edgeCount)
  }
  resizeEdgeFaces(totalEdgeFaceCount: number): void {
    this._edgeFaceIndices = new Int32Array(totalEdgeFaceCount)
    this._edgeFaceLocalIndices = new Int32Array(totalEdgeFaceCount)
  }

  resizeVertices(vertCount: number): void {
    this._vertCount = vertCount
    this._vertFaceCountsAndOffsets = new Int32Array(2 * vertCount)
    this._vertEdgeCountsAndOffsets = new Int32Array(2 * vertCount)
    this._vertSharpness = new Float32Array(vertCount)
    this._vertTags = new Uint16Array(vertCount) // zero-filled == cleared VTags
  }
  resizeVertexFaces(totalVertFaceCount: number): void {
    this._vertFaceIndices = new Int32Array(totalVertFaceCount)
    this._vertFaceLocalIndices = new Int32Array(totalVertFaceCount)
  }
  resizeVertexEdges(totalVertEdgeCount: number): void {
    this._vertEdgeIndices = new Int32Array(totalVertEdgeCount)
    this._vertEdgeLocalIndices = new Int32Array(totalVertEdgeCount)
  }

  setMaxValence(valence: number): void {
    this._maxValence = valence
  }

  // ---- Per-component sizing of variable relations (count + offset) ------

  resizeFaceVerticesAt(faceIndex: Index, count: number): void {
    const co = this._faceVertCountsAndOffsets
    co[2 * faceIndex] = count
    co[2 * faceIndex + 1] = faceIndex === 0 ? 0 : co[2 * faceIndex - 2]! + co[2 * faceIndex - 1]!
    this._maxValence = Math.max(this._maxValence, count)
  }
  resizeEdgeFacesAt(edgeIndex: Index, count: number): void {
    const co = this._edgeFaceCountsAndOffsets
    co[2 * edgeIndex] = count
    co[2 * edgeIndex + 1] = edgeIndex === 0 ? 0 : co[2 * edgeIndex - 2]! + co[2 * edgeIndex - 1]!
    this._maxEdgeFaces = Math.max(this._maxEdgeFaces, count)
  }
  trimEdgeFaces(edgeIndex: Index, count: number): void {
    this._edgeFaceCountsAndOffsets[2 * edgeIndex] = count
  }
  resizeVertexFacesAt(vertIndex: Index, count: number): void {
    const co = this._vertFaceCountsAndOffsets
    co[2 * vertIndex] = count
    co[2 * vertIndex + 1] = vertIndex === 0 ? 0 : co[2 * vertIndex - 2]! + co[2 * vertIndex - 1]!
  }
  trimVertexFaces(vertIndex: Index, count: number): void {
    this._vertFaceCountsAndOffsets[2 * vertIndex] = count
  }
  resizeVertexEdgesAt(vertIndex: Index, count: number): void {
    const co = this._vertEdgeCountsAndOffsets
    co[2 * vertIndex] = count
    co[2 * vertIndex + 1] = vertIndex === 0 ? 0 : co[2 * vertIndex - 2]! + co[2 * vertIndex - 1]!
    this._maxValence = Math.max(this._maxValence, count)
  }
  trimVertexEdges(vertIndex: Index, count: number): void {
    this._vertEdgeCountsAndOffsets[2 * vertIndex] = count
  }

  // ---- Topology construction --------------------------------------------

  findEdge(v0Index: Index, v1Index: Index, v0Edges?: ConstIndexArray): Index {
    const edges = v0Edges ?? this.getVertexEdges(v0Index)
    if (v0Index !== v1Index) {
      for (let j = 0; j < edges.length; ++j) {
        const eVerts = this.getEdgeVertices(edges[j]!)
        if (eVerts[0] === v1Index || eVerts[1] === v1Index) return edges[j]!
      }
    } else {
      for (let j = 0; j < edges.length; ++j) {
        const eVerts = this.getEdgeVertices(edges[j]!)
        if (eVerts[0] === eVerts[1]) return edges[j]!
      }
    }
    return INDEX_INVALID
  }

  /**
   * Given fully-specified face-vertices (a pre-condition), construct the
   * remaining five relations plus the edge list, orient manifold components
   * counter-clockwise, and assign local indices. Mirrors
   * Level::completeTopologyFromFaceVertices. Returns false on valence overflow.
   *
   * Does NOT compute boundary/xordinary/rule tags — those are assigned by the
   * far factory's prepareComponentTagsAndSharpness once sharpness is known.
   */
  completeTopologyFromFaceVertices(): boolean {
    const vCount = this.getNumVertices()
    const fCount = this.getNumFaces()

    // Face-edge indices share the face-vertex counts/offsets layout.
    this._faceEdgeIndices = new Int32Array(this.getNumFaceVerticesTotal())

    const edgeVerts: number[] = []
    const dynEdgeFaces = new DynRelation(0)
    const dynVertFaces = new DynRelation(vCount)
    const dynVertEdges = new DynRelation(vCount)
    const nonManifoldEdges: number[] = []
    let edgeCount = 0

    for (let fIndex = 0; fIndex < fCount; ++fIndex) {
      const fVerts = this.getFaceVertices(fIndex)
      const fEdges = this.getFaceEdges(fIndex)
      const fSize = fVerts.length

      for (let i = 0; i < fSize; ++i) {
        const v0 = fVerts[i]!
        const v1 = fVerts[(i + 1) % fSize]!

        let eIndex: Index
        if (v0 !== v1) {
          eIndex = findEdgeInBuilder(v0, v1, dynVertEdges.get(v0), edgeVerts)
        } else {
          eIndex = INDEX_INVALID
          nonManifoldEdges.push(edgeCount)
        }

        if (IndexIsValid(eIndex)) {
          const eFaces = dynEdgeFaces.get(eIndex)
          if (eFaces[eFaces.length - 1] === fIndex) {
            // Edge already occurs in this face -- create a new instance.
            nonManifoldEdges.push(eIndex)
            nonManifoldEdges.push(edgeCount)
            eIndex = INDEX_INVALID
          } else if (eFaces.length > 1) {
            nonManifoldEdges.push(eIndex)
          } else if (v0 === edgeVerts[2 * eIndex]) {
            // Same orientation in two faces -> opposite winding.
            nonManifoldEdges.push(eIndex)
          }
        }
        if (!IndexIsValid(eIndex)) {
          eIndex = edgeCount
          edgeCount++
          edgeVerts.push(v0, v1)
          dynEdgeFaces.appendComponent()
          dynVertEdges.append(v0, eIndex)
          dynVertEdges.append(v1, eIndex)
        }

        dynEdgeFaces.append(eIndex, fIndex)
        dynVertFaces.append(v0, fIndex)
        fEdges[i] = eIndex
      }
    }

    const ef = dynEdgeFaces.finalize()
    const vf = dynVertFaces.finalize()
    const ve = dynVertEdges.finalize()

    this._maxEdgeFaces = ef.max
    this._maxValence = Math.max(this._maxValence, vf.max, ve.max)
    if (this._maxValence > VALENCE_LIMIT) return false

    // Allocate per-edge storage, then install the finalized relations.
    this.resizeEdges(edgeCount)
    this._edgeVertIndices = Int32Array.from(edgeVerts)
    this._edgeFaceCountsAndOffsets = ef.co
    this._edgeFaceIndices = ef.idx
    this._vertFaceCountsAndOffsets = vf.co
    this._vertFaceIndices = vf.idx
    this._vertEdgeCountsAndOffsets = ve.co
    this._vertEdgeIndices = ve.idx

    for (const eIndex of nonManifoldEdges) {
      this.setEdgeNonManifold(eIndex, true)
      const eVerts = this.getEdgeVertices(eIndex)
      this.setVertexNonManifold(eVerts[0]!, true)
      this.setVertexNonManifold(eVerts[1]!, true)
    }

    this.orientIncidentComponents()
    this.populateLocalIndices()
    return true
  }

  populateLocalIndices(): void {
    const eCount = this.getNumEdges()
    const vCount = this.getNumVertices()

    this._vertFaceLocalIndices = new Int32Array(this._vertFaceIndices.length)
    this._vertEdgeLocalIndices = new Int32Array(this._vertEdgeIndices.length)
    this._edgeFaceLocalIndices = new Int32Array(this._edgeFaceIndices.length)

    for (let vIndex = 0; vIndex < vCount; ++vIndex) {
      const vFaces = this.getVertexFaces(vIndex)
      const vInFaces = this.getVertexFaceLocalIndices(vIndex)
      let vFaceLast = INDEX_INVALID
      for (let i = 0; i < vFaces.length; ++i) {
        const fVerts = this.getFaceVertices(vFaces[i]!)
        const vStart = vFaces[i] === vFaceLast ? vInFaces[i - 1]! + 1 : 0
        let idx = fVerts.length
        for (let k = vStart; k < fVerts.length; ++k) {
          if (fVerts[k] === vIndex) {
            idx = k
            break
          }
        }
        vInFaces[i] = idx
        vFaceLast = vFaces[i]!
      }
    }

    for (let vIndex = 0; vIndex < vCount; ++vIndex) {
      const vEdges = this.getVertexEdges(vIndex)
      const vInEdges = this.getVertexEdgeLocalIndices(vIndex)
      for (let i = 0; i < vEdges.length; ++i) {
        const eVerts = this.getEdgeVertices(vEdges[i]!)
        if (eVerts[0] !== eVerts[1]) {
          vInEdges[i] = vIndex === eVerts[1] ? 1 : 0
        } else {
          vInEdges[i] = i > 0 && vEdges[i] === vEdges[i - 1] ? 1 : 0
        }
      }
      this._maxValence = Math.max(this._maxValence, vEdges.length)
    }

    for (let eIndex = 0; eIndex < eCount; ++eIndex) {
      const eFaces = this.getEdgeFaces(eIndex)
      const eInFaces = this.getEdgeFaceLocalIndices(eIndex)
      let eFaceLast = INDEX_INVALID
      for (let i = 0; i < eFaces.length; ++i) {
        const fEdges = this.getFaceEdges(eFaces[i]!)
        const eStart = eFaces[i] === eFaceLast ? eInFaces[i - 1]! + 1 : 0
        let idx = fEdges.length
        for (let k = eStart; k < fEdges.length; ++k) {
          if (fEdges[k] === eIndex) {
            idx = k
            break
          }
        }
        eInFaces[i] = idx
        eFaceLast = eFaces[i]!
      }
    }
  }

  orientIncidentComponents(): void {
    const vCount = this.getNumVertices()
    for (let vIndex = 0; vIndex < vCount; ++vIndex) {
      const vTag = this.getVertexTag(vIndex)
      if (!vTag._nonManifold) {
        if (!this.orderVertexFacesAndEdges(vIndex)) vTag._nonManifold = true
      }
    }
  }

  orderVertexFacesAndEdges(vIndex: Index): boolean {
    const ordered = this.computeOrderedVertexFacesAndEdges(vIndex)
    if (ordered === null) return false
    this.getVertexFaces(vIndex).set(ordered.vFaces)
    this.getVertexEdges(vIndex).set(ordered.vEdges)
    return true
  }

  // Walk the manifold neighborhood counter-clockwise from a starting face/edge.
  // Returns ordered face/edge arrays, or null if the vertex is non-manifold.
  private computeOrderedVertexFacesAndEdges(vIndex: Index): { vFaces: Int32Array; vEdges: Int32Array } | null {
    const vEdges = this.getVertexEdges(vIndex)
    const vFaces = this.getVertexFaces(vIndex)
    const fCount = vFaces.length
    const eCount = vEdges.length

    if (fCount === 0 || eCount < 2 || eCount - fCount > 1) return null

    let fStart = INDEX_INVALID
    let eStart = INDEX_INVALID
    let fvStart = 0

    if (eCount === fCount) {
      // Interior case -- start with the first face.
      fStart = vFaces[0]!
      fvStart = findInArray(this.getFaceVertices(fStart), vIndex)
      eStart = this.getFaceEdges(fStart)[fvStart]!
    } else {
      // Boundary case -- start with the leading of two boundary edges.
      for (let i = 0; i < eCount; ++i) {
        const eFaces = this.getEdgeFaces(vEdges[i]!)
        if (eFaces.length === 1) {
          eStart = vEdges[i]!
          fStart = eFaces[0]!
          fvStart = findInArray(this.getFaceVertices(fStart), vIndex)
          if (eStart === this.getFaceEdges(fStart)[fvStart]) break
        }
      }
    }

    const vFacesOrdered = new Int32Array(fCount)
    const vEdgesOrdered = new Int32Array(eCount)
    let eCountOrdered = 1
    let fCountOrdered = 1

    vFacesOrdered[0] = fStart
    vEdgesOrdered[0] = eStart
    const eFirst = eStart

    while (eCountOrdered < eCount) {
      const fVerts = this.getFaceVertices(fStart)
      const fEdges = this.getFaceEdges(fStart)

      const feStart = fvStart
      const feNext = feStart ? feStart - 1 : fVerts.length - 1
      const eNext = fEdges[feNext]!

      if (eNext === eStart || eNext === eFirst) return null

      vEdgesOrdered[eCountOrdered++] = eNext

      if (fCountOrdered < fCount) {
        const eFaces = this.getEdgeFaces(eNext)
        if (eFaces.length === 0) return null
        if (eFaces.length === 1 && eFaces[0] === fStart) return null

        fStart = eFaces[eFaces[0] === fStart ? 1 : 0]!
        fvStart = findInArray(this.getFaceEdges(fStart), eNext)
        vFacesOrdered[fCountOrdered++] = fStart
      }
      eStart = eNext
    }
    return { vFaces: vFacesOrdered, vEdges: vEdgesOrdered }
  }
}
