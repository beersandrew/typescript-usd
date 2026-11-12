// Ported from OpenSubdiv 3.7.0: opensubdiv/vtr/refinement.h,
//  opensubdiv/vtr/refinement.cpp
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/vtr/refinement.{h,cpp} — Vtr::internal::Refinement (base).
//
// A Refinement maps a parent Level to a refined child Level. Upstream supports
// both uniform and sparse (adaptive) refinement; this port implements the
// UNIFORM path only (M1) — the sparse/selection machinery is omitted.
// DIVERGENCE from upstream: uniform-only; sparse tags/selection not ported.
//
// The driver builds the parent→child index mapping, sizes the child, then
// subdivides the topology via the scheme-specific subclass (QuadRefinement).
// Sharpness subdivision and component-tag propagation are ported separately.

import { Level } from './level.ts'
import { FVarLevel } from './fvarLevel.ts'
import { FVarRefinement } from './fvarRefinement.ts'
import type { Options } from '../sdc/options.ts'
import { Split } from '../sdc/types.ts'
import { Crease, Rule, SHARPNESS_SMOOTH, SHARPNESS_INFINITE, IsSharp } from '../sdc/crease.ts'
import { IndexIsValid } from './types.ts'
import type { Index, IndexArray, ConstIndexArray } from './types.ts'

const EMPTY_I32 = new Int32Array(0)

// Assign sequential values base..base+n-1 into `vec`; returns the count.
function sequenceFullIndexVector(vec: Int32Array, base: number): number {
  for (let i = 0; i < vec.length; ++i) vec[i] = base + i
  return vec.length
}

/** Child-to-parent mapping tag for a refined component. */
export class ChildTag {
  _incomplete = false // incomplete neighborhood (sparse only; always false here)
  _parentType = 0 // type of parent component
  _indexInParent = 0 // index of child within its parent (0-3)
}

export abstract class Refinement {
  _parent: Level
  _child: Level
  _options: Options

  _splitType: Split = Split.TO_QUADS
  _regFaceSize = 4

  _uniform = true
  _faceVertsFirst = false

  //  Inventory and ordering of child components
  _childFaceFromFaceCount = 0
  _childEdgeFromFaceCount = 0
  _childEdgeFromEdgeCount = 0
  _childVertFromFaceCount = 0
  _childVertFromEdgeCount = 0
  _childVertFromVertCount = 0

  _firstChildFaceFromFace = 0
  _firstChildEdgeFromFace = 0
  _firstChildEdgeFromEdge = 0
  _firstChildVertFromFace = 0
  _firstChildVertFromEdge = 0
  _firstChildVertFromVert = 0

  //  Parent-to-child mapping
  _faceChildFaceIndices: Int32Array = EMPTY_I32
  _faceChildEdgeIndices: Int32Array = EMPTY_I32
  _edgeChildEdgeIndices: Int32Array = EMPTY_I32
  _faceChildVertIndex: Int32Array = EMPTY_I32
  _edgeChildVertIndex: Int32Array = EMPTY_I32
  _vertChildVertIndex: Int32Array = EMPTY_I32

  //  Child-to-parent mapping
  _childFaceParentIndex: Int32Array = EMPTY_I32
  _childEdgeParentIndex: Int32Array = EMPTY_I32
  _childVertexParentIndex: Int32Array = EMPTY_I32
  _childEdgeTag: ChildTag[] = []
  _childVertexTag: ChildTag[] = []

  constructor(parent: Level, child: Level, options: Options) {
    this._parent = parent
    this._child = child
    this._options = options
  }

  parent(): Level {
    return this._parent
  }
  child(): Level {
    return this._child
  }
  getSplitType(): Split {
    return this._splitType
  }
  getRegularFaceSize(): number {
    return this._regFaceSize
  }

  //  Parent-to-child mapping accessors -------------------------------------

  getFaceChildFaces(parentFace: Index): IndexArray {
    const off = this._parent.getOffsetOfFaceVertices(parentFace)
    const cnt = this._parent.getNumFaceVertices(parentFace)
    return this._faceChildFaceIndices.subarray(off, off + cnt)
  }
  getFaceChildEdges(parentFace: Index): IndexArray {
    const off = this._parent.getOffsetOfFaceVertices(parentFace)
    const cnt = this._parent.getNumFaceVertices(parentFace)
    return this._faceChildEdgeIndices.subarray(off, off + cnt)
  }
  getEdgeChildEdges(parentEdge: Index): IndexArray {
    return this._edgeChildEdgeIndices.subarray(parentEdge * 2, parentEdge * 2 + 2)
  }

  getFaceChildVertex(f: Index): Index {
    return this._faceChildVertIndex[f]!
  }
  getEdgeChildVertex(e: Index): Index {
    return this._edgeChildVertIndex[e]!
  }
  getVertexChildVertex(v: Index): Index {
    return this._vertChildVertIndex[v]!
  }

  getFirstChildVertexFromFaces(): Index {
    return this._firstChildVertFromFace
  }
  getFirstChildVertexFromEdges(): Index {
    return this._firstChildVertFromEdge
  }
  getFirstChildVertexFromVertices(): Index {
    return this._firstChildVertFromVert
  }

  getNumChildFacesFromFaces(): number {
    return this._childFaceFromFaceCount
  }
  getNumChildVerticesFromFaces(): number {
    return this._childVertFromFaceCount
  }
  getNumChildVerticesFromEdges(): number {
    return this._childVertFromEdgeCount
  }
  getNumChildVerticesFromVertices(): number {
    return this._childVertFromVertCount
  }
  getNumChildEdgesFromFaces(): number {
    return this._childEdgeFromFaceCount
  }
  getChildVertexParentIndex(v: Index): Index {
    return this._childVertexParentIndex[v]!
  }
  getChildFaceParentFace(f: Index): Index {
    return this._childFaceParentIndex[f]!
  }
  getChildEdgeParentIndex(e: Index): Index {
    return this._childEdgeParentIndex[e]!
  }
  isChildVertexComplete(v: Index): boolean {
    return !this._childVertexTag[v]!._incomplete
  }
  hasFaceVerticesFirst(): boolean {
    return this._faceVertsFirst
  }
  getOptions(): Options {
    return this._options
  }

  //  Face-varying refinements (one per channel).
  _fvarChannels: FVarRefinement[] = []
  getNumFVarChannels(): number {
    return this._fvarChannels.length
  }
  getFVarRefinement(c: number): FVarRefinement {
    return this._fvarChannels[c]!
  }

  //  Scheme-specific (subclass) --------------------------------------------

  abstract allocateParentChildIndices(): void
  abstract populateFaceVertexRelation(): void
  abstract populateFaceEdgeRelation(): void
  abstract populateEdgeVertexRelation(): void
  abstract populateEdgeFaceRelation(): void
  abstract populateVertexFaceRelation(): void
  abstract populateVertexEdgeRelation(): void

  //  Driver -----------------------------------------------------------------

  /**
   * Uniform refinement: build the parent→child mapping, size the child, and
   * subdivide the topology. (Sharpness subdivision and tag propagation are
   * applied by the far factory / a follow-on step.)
   */
  refine(): void {
    this.populateParentToChildMapping()
    this.initializeChildComponentCounts()
    this.populateChildToParentMapping()
    this.propagateComponentTags()
    this.subdivideTopology()
    this.subdivideSharpnessValues()
    if (this._parent.getNumFVarChannels() > 0) this.subdivideFVarChannels()
  }

  subdivideFVarChannels(): void {
    const channelCount = this._parent.getNumFVarChannels()
    for (let channel = 0; channel < channelCount; ++channel) {
      const parentFVar = this._parent.getFVarLevel(channel)
      const childFVar = new FVarLevel(this._child)
      const refineFVar = new FVarRefinement(this, parentFVar, childFVar)
      refineFVar.applyRefinement()
      this._child._fvarChannels.push(childFVar)
      this._fvarChannels.push(refineFVar)
    }
  }

  populateParentToChildMapping(): void {
    this.allocateParentChildIndices()
    this.populateParentChildIndices()
  }

  populateParentChildIndices(): void {
    // Uniform: every parent component spawns its full set of children.
    this._firstChildFaceFromFace = 0
    this._childFaceFromFaceCount = sequenceFullIndexVector(this._faceChildFaceIndices, 0)

    this._firstChildEdgeFromFace = 0
    this._childEdgeFromFaceCount = sequenceFullIndexVector(this._faceChildEdgeIndices, 0)

    this._firstChildEdgeFromEdge = this._childEdgeFromFaceCount
    this._childEdgeFromEdgeCount = sequenceFullIndexVector(this._edgeChildEdgeIndices, this._firstChildEdgeFromEdge)

    if (this._faceVertsFirst) {
      this._firstChildVertFromFace = 0
      this._childVertFromFaceCount = sequenceFullIndexVector(this._faceChildVertIndex, this._firstChildVertFromFace)
      this._firstChildVertFromEdge = this._firstChildVertFromFace + this._childVertFromFaceCount
      this._childVertFromEdgeCount = sequenceFullIndexVector(this._edgeChildVertIndex, this._firstChildVertFromEdge)
      this._firstChildVertFromVert = this._firstChildVertFromEdge + this._childVertFromEdgeCount
      this._childVertFromVertCount = sequenceFullIndexVector(this._vertChildVertIndex, this._firstChildVertFromVert)
    } else {
      this._firstChildVertFromVert = 0
      this._childVertFromVertCount = sequenceFullIndexVector(this._vertChildVertIndex, this._firstChildVertFromVert)
      this._firstChildVertFromFace = this._firstChildVertFromVert + this._childVertFromVertCount
      this._childVertFromFaceCount = sequenceFullIndexVector(this._faceChildVertIndex, this._firstChildVertFromFace)
      this._firstChildVertFromEdge = this._firstChildVertFromFace + this._childVertFromFaceCount
      this._childVertFromEdgeCount = sequenceFullIndexVector(this._edgeChildVertIndex, this._firstChildVertFromEdge)
    }
  }

  initializeChildComponentCounts(): void {
    this._child._faceCount = this._childFaceFromFaceCount
    this._child._edgeCount = this._childEdgeFromFaceCount + this._childEdgeFromEdgeCount
    this._child._vertCount = this._childVertFromFaceCount + this._childVertFromEdgeCount + this._childVertFromVertCount
  }

  subdivideTopology(): void {
    this.populateFaceVertexRelation()
    this.populateFaceEdgeRelation()
    this.populateEdgeVertexRelation()
    this.populateEdgeFaceRelation()
    this.populateVertexFaceRelation()
    this.populateVertexEdgeRelation()

    // Bound on child max-valence (quad split).
    this._child._maxValence = Math.max(this._parent._maxValence, 4)
    this._child._maxValence = Math.max(this._child._maxValence, 2 + this._parent._maxEdgeFaces)
  }

  // ---- Child-to-parent mapping (uniform) --------------------------------

  populateChildToParentMapping(): void {
    const c = this._child

    // Faces: each child face inherits its parent face index.
    this._childFaceParentIndex = new Int32Array(c.getNumFaces())
    {
      let cFace = 0
      for (let pFace = 0; pFace < this._parent.getNumFaces(); ++pFace) {
        const n = this.getFaceChildFaces(pFace).length
        for (let i = 0; i < n; ++i) this._childFaceParentIndex[cFace++] = pFace
      }
    }

    // Edges: from-faces block then from-edges block.
    this._childEdgeParentIndex = new Int32Array(c.getNumEdges())
    this._childEdgeTag = Array.from({ length: c.getNumEdges() }, () => new ChildTag())
    {
      let cEdge = this._firstChildEdgeFromFace
      for (let pFace = 0; pFace < this._parent.getNumFaces(); ++pFace) {
        const cEdges = this.getFaceChildEdges(pFace)
        for (let i = 0; i < cEdges.length; ++i, ++cEdge) {
          this._childEdgeParentIndex[cEdge] = pFace
          this._childEdgeTag[cEdge]!._indexInParent = i
        }
      }
      cEdge = this._firstChildEdgeFromEdge
      for (let pEdge = 0; pEdge < this._parent.getNumEdges(); ++pEdge, cEdge += 2) {
        this._childEdgeParentIndex[cEdge] = pEdge
        this._childEdgeParentIndex[cEdge + 1] = pEdge
        this._childEdgeTag[cEdge]!._indexInParent = 0
        this._childEdgeTag[cEdge + 1]!._indexInParent = 1
      }
    }

    // Vertices: from-faces, from-edges, from-vertices.
    this._childVertexParentIndex = new Int32Array(c.getNumVertices())
    this._childVertexTag = Array.from({ length: c.getNumVertices() }, () => new ChildTag())
    {
      let cVert = this._firstChildVertFromFace
      for (let pFace = 0; pFace < this._childVertFromFaceCount; ++pFace, ++cVert) {
        this._childVertexParentIndex[cVert] = pFace
      }
      cVert = this._firstChildVertFromEdge
      for (let pEdge = 0; pEdge < this._parent.getNumEdges(); ++pEdge, ++cVert) {
        this._childVertexParentIndex[cVert] = pEdge
      }
      cVert = this._firstChildVertFromVert
      for (let pVert = 0; pVert < this._parent.getNumVertices(); ++pVert, ++cVert) {
        this._childVertexParentIndex[cVert] = pVert
      }
    }
  }

  // ---- Component-tag propagation ----------------------------------------

  propagateComponentTags(): void {
    this.populateFaceTagVectors()
    this.populateEdgeTagVectors()
    this.populateVertexTagVectors()
  }

  private populateFaceTagVectors(): void {
    const c = this._child
    // Faces from faces inherit the parent face tag (only the hole flag today).
    // The freshly-zeroed store already represents cleared tags.
    c._faceTags = new Uint8Array(c.getNumFaces())
    for (let cFace = 0; cFace < c.getNumFaces(); ++cFace) {
      const p = this._parent.getFaceTag(this._childFaceParentIndex[cFace]!)
      c.getFaceTag(cFace)._hole = p._hole
    }
  }

  private populateEdgeTagVectors(): void {
    const c = this._child
    // The freshly-zeroed store already represents cleared tags, so edges from
    // faces (interior, smooth/manifold) need no explicit write.
    c._edgeTags = new Uint8Array(c.getNumEdges())
    // Edges from edges inherit the parent edge tag.
    const fromEdgeBegin = this._firstChildEdgeFromEdge
    const fromEdgeEnd = fromEdgeBegin + this._childEdgeFromEdgeCount
    for (let cEdge = fromEdgeBegin; cEdge < fromEdgeEnd; ++cEdge) {
      const p = this._parent.getEdgeTag(this._childEdgeParentIndex[cEdge]!)
      const t = c.getEdgeTag(cEdge)
      t._nonManifold = p._nonManifold
      t._boundary = p._boundary
      t._infSharp = p._infSharp
      t._semiSharp = p._semiSharp
    }
  }

  private populateVertexTagVectors(): void {
    const c = this._child
    // Freshly-zeroed store; the three passes below fill disjoint vertex ranges,
    // each starting from cleared bits (== a default-constructed VTag).
    c._vertTags = new Uint16Array(c.getNumVertices())
    this.populateVertexTagsFromParentFaces()
    this.populateVertexTagsFromParentEdges()
    this.populateVertexTagsFromParentVertices()
  }

  private populateVertexTagsFromParentFaces(): void {
    if (this._childVertFromFaceCount === 0) return
    const c = this._child
    const begin = this._firstChildVertFromFace
    const end = begin + this._childVertFromFaceCount
    const atBase = this._parent.getDepth() === 0
    for (let cVert = begin; cVert < end; ++cVert) {
      const t = c.getVertexTag(cVert)
      t._rule = Rule.SMOOTH
      if (atBase && this._parent.getNumFaceVertices(this._childVertexParentIndex[cVert]!) !== this._regFaceSize) {
        t._xordinary = true
      }
    }
  }

  private populateVertexTagsFromParentEdges(): void {
    const c = this._child
    for (let pEdge = 0; pEdge < this._parent.getNumEdges(); ++pEdge) {
      const cVert = this._edgeChildVertIndex[pEdge]!
      if (!IndexIsValid(cVert)) continue
      const pEdgeTag = this._parent.getEdgeTag(pEdge)
      const t = c.getVertexTag(cVert)
      t._nonManifold = pEdgeTag._nonManifold
      t._boundary = pEdgeTag._boundary
      t._semiSharpEdges = pEdgeTag._semiSharp
      t._infSharpEdges = pEdgeTag._infSharp
      t._infSharpCrease = pEdgeTag._infSharp
      t._infIrregular = pEdgeTag._infSharp && pEdgeTag._nonManifold
      t._rule = pEdgeTag._semiSharp || pEdgeTag._infSharp ? Rule.CREASE : Rule.SMOOTH
    }
  }

  private populateVertexTagsFromParentVertices(): void {
    const c = this._child
    const begin = this._firstChildVertFromVert
    const end = begin + this._childVertFromVertCount
    for (let cVert = begin; cVert < end; ++cVert) {
      const p = this._parent.getVertexTag(this._childVertexParentIndex[cVert]!)
      const t = c.getVertexTag(cVert)
      t._nonManifold = p._nonManifold
      t._xordinary = p._xordinary
      t._boundary = p._boundary
      t._corner = p._corner
      t._infSharp = p._infSharp
      t._semiSharp = p._semiSharp
      t._semiSharpEdges = p._semiSharpEdges
      t._rule = p._rule
      t._infSharpEdges = p._infSharpEdges
      t._infSharpCrease = p._infSharpCrease
      t._infIrregular = p._infIrregular
      t._incidIrregFace = false
    }
  }

  // ---- Sharpness subdivision --------------------------------------------

  subdivideSharpnessValues(): void {
    this.subdivideEdgeSharpness()
    this.subdivideVertexSharpness()
    this.reclassifySemisharpVertices()
  }

  private subdivideEdgeSharpness(): void {
    const creasing = new Crease(this._options)
    const c = this._child
    c._edgeSharpness = new Float32Array(c.getNumEdges()) // SHARPNESS_SMOOTH = 0

    const begin = this._firstChildEdgeFromEdge
    const end = begin + this._childEdgeFromEdgeCount
    for (let cEdge = begin; cEdge < end; ++cEdge) {
      const cEdgeTag = c.getEdgeTag(cEdge)
      if (cEdgeTag._infSharp) {
        c._edgeSharpness[cEdge] = SHARPNESS_INFINITE
      } else if (cEdgeTag._semiSharp) {
        const pEdge = this._childEdgeParentIndex[cEdge]!
        const pSharpness = this._parent.getEdgeSharpness(pEdge)
        let cSharpness: number
        if (creasing.isUniform()) {
          cSharpness = creasing.subdivideUniformSharpness(pSharpness)
        } else {
          const pEdgeVerts = this._parent.getEdgeVertices(pEdge)
          const pVert = pEdgeVerts[this._childEdgeTag[cEdge]!._indexInParent]!
          const pVertEdges = this._parent.getVertexEdges(pVert)
          const buf: number[] = []
          for (let i = 0; i < pVertEdges.length; ++i) buf[i] = this._parent.getEdgeSharpness(pVertEdges[i]!)
          cSharpness = creasing.subdivideEdgeSharpnessAtVertex(pSharpness, pVertEdges.length, buf)
        }
        c._edgeSharpness[cEdge] = cSharpness
        if (!IsSharp(cSharpness)) cEdgeTag._semiSharp = false
      }
    }
  }

  private subdivideVertexSharpness(): void {
    const creasing = new Crease(this._options)
    const c = this._child
    c._vertSharpness = new Float32Array(c.getNumVertices()) // SHARPNESS_SMOOTH = 0

    const begin = this._firstChildVertFromVert
    const end = begin + this._childVertFromVertCount
    for (let cVert = begin; cVert < end; ++cVert) {
      const cVertTag = c.getVertexTag(cVert)
      if (cVertTag._infSharp) {
        c._vertSharpness[cVert] = SHARPNESS_INFINITE
      } else if (cVertTag._semiSharp) {
        const pVert = this._childVertexParentIndex[cVert]!
        const cSharpness = creasing.subdivideVertexSharpness(this._parent.getVertexSharpness(pVert))
        c._vertSharpness[cVert] = cSharpness
        if (!IsSharp(cSharpness)) cVertTag._semiSharp = false
      }
    }
  }

  private reclassifySemisharpVertices(): void {
    const creasing = new Crease(this._options)
    const c = this._child

    // Vertices derived from semi-sharp parent edges:
    const fromEdgeBegin = this._firstChildVertFromEdge
    const fromEdgeEnd = fromEdgeBegin + this._childVertFromEdgeCount
    for (let cVert = fromEdgeBegin; cVert < fromEdgeEnd; ++cVert) {
      const cVertTag = c.getVertexTag(cVert)
      if (!cVertTag._semiSharpEdges) continue
      const pEdge = this._childVertexParentIndex[cVert]!
      const cEdges = this.getEdgeChildEdges(pEdge)
      const sharpEdgeCount =
        (c.getEdgeTag(cEdges[0]!)._semiSharp ? 1 : 0) + (c.getEdgeTag(cEdges[1]!)._semiSharp ? 1 : 0)
      cVertTag._semiSharpEdges = sharpEdgeCount > 0
      cVertTag._rule = creasing.determineVertexVertexRule(0.0, sharpEdgeCount)
    }

    // Vertices derived from semi-sharp parent vertices:
    const fromVertBegin = this._firstChildVertFromVert
    const fromVertEnd = fromVertBegin + this._childVertFromVertCount
    for (let cVert = fromVertBegin; cVert < fromVertEnd; ++cVert) {
      const pVert = this._childVertexParentIndex[cVert]!
      const pVertTag = this._parent.getVertexTag(pVert)
      if (!pVertTag._semiSharp && !pVertTag._semiSharpEdges) continue

      const cVertTag = c.getVertexTag(cVert)
      const sharpVertexDecayed = pVertTag._semiSharp && !cVertTag._semiSharp
      if (pVertTag._semiSharpEdges || sharpVertexDecayed) {
        let infSharpEdgeCount = 0
        let semiSharpEdgeCount = 0
        const cEdges = c.getVertexEdges(cVert)
        for (let i = 0; i < cEdges.length; ++i) {
          const cEdgeTag = c.getEdgeTag(cEdges[i]!)
          if (cEdgeTag._infSharp) infSharpEdgeCount++
          if (cEdgeTag._semiSharp) semiSharpEdgeCount++
        }
        cVertTag._semiSharpEdges = semiSharpEdgeCount > 0
        if (!cVertTag._semiSharp && !cVertTag._infSharp) {
          cVertTag._rule = creasing.determineVertexVertexRule(0.0, infSharpEdgeCount + semiSharpEdgeCount)
        }
      }
    }
  }
}

export type { ConstIndexArray }
