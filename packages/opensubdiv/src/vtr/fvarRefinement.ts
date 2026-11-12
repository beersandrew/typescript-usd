// Ported from OpenSubdiv 3.7.0: opensubdiv/vtr/fvarRefinement.h,
//  opensubdiv/vtr/fvarRefinement.cpp
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/vtr/fvarRefinement.{h,cpp} — Vtr::internal::FVarRefinement.
//
// Maps the face-varying values of a parent FVarLevel to its child: estimates
// and allocates child values, populates them (one per parent value, plus extra
// values where a seam edge splits), and propagates the edge/value tags and
// crease-ends through the refinement. Uniform-only (no sparse mapping).

import { FVarLevel, CreaseEndPair } from './fvarLevel.ts'
import { Crease } from '../sdc/crease.ts'
import type { Level } from './level.ts'
import type { Refinement } from './refinement.ts'
import type { Index } from './types.ts'

export class FVarRefinement {
  _refinement: Refinement
  _parentLevel: Level
  _parentFVar: FVarLevel
  _childLevel: Level
  _childFVar: FVarLevel
  _childValueParentSource: Int32Array = new Int32Array(0)

  constructor(refinement: Refinement, parentFVar: FVarLevel, childFVar: FVarLevel) {
    this._refinement = refinement
    this._parentLevel = refinement.parent()
    this._parentFVar = parentFVar
    this._childLevel = refinement.child()
    this._childFVar = childFVar
  }

  getChildValueParentSource(vIndex: Index, sibling: number): number {
    return this._childValueParentSource[this._childFVar.getVertexValueOffset(vIndex, sibling)]!
  }

  applyRefinement(): void {
    const c = this._childFVar
    const p = this._parentFVar
    c._options = p._options
    c._isLinear = p._isLinear
    c._hasLinearBoundaries = p._hasLinearBoundaries
    c._hasDependentSharpness = p._hasDependentSharpness

    this.estimateAndAllocateChildValues()
    this.populateChildValues()
    this.trimAndFinalizeChildValues()

    this.propagateEdgeTags()
    this.propagateValueTags()
    if (c.hasSmoothBoundaries()) {
      this.propagateValueCreases()
      this.reclassifySemisharpValues()
    }

    if (c.getNumValues() > this._childLevel.getNumVertices()) {
      c.initializeFaceValuesFromVertexFaceSiblings()
    } else {
      c.initializeFaceValuesFromFaceVertices()
    }
  }

  private estimateAndAllocateChildValues(): void {
    const ref = this._refinement
    let maxVertexValueCount = ref.getNumChildVerticesFromFaces()

    {
      let cVert = ref.getFirstChildVertexFromEdges()
      const end = cVert + ref.getNumChildVerticesFromEdges()
      for (; cVert < end; ++cVert) {
        const pEdge = ref.getChildVertexParentIndex(cVert)
        maxVertexValueCount += this._parentFVar.edgeTopologyMatches(pEdge)
          ? 1
          : this._parentLevel.getEdgeFaces(pEdge).length
      }
    }
    {
      let cVert = ref.getFirstChildVertexFromVertices()
      const end = cVert + ref.getNumChildVerticesFromVertices()
      for (; cVert < end; ++cVert) {
        maxVertexValueCount += this._parentFVar.getNumVertexValues(ref.getChildVertexParentIndex(cVert))
      }
    }

    this._childFVar.resizeComponents()
    this._childFVar._vertValueTags = new Uint8Array(maxVertexValueCount) // zero-filled == cleared
    this._childValueParentSource = new Int32Array(maxVertexValueCount)
  }

  private trimAndFinalizeChildValues(): void {
    const c = this._childFVar
    c._vertValueTags = c._vertValueTags.slice(0, c._valueCount)
    if (c.hasSmoothBoundaries()) {
      c._vertValueCreaseEnds = Array.from({ length: c._valueCount }, () => new CreaseEndPair())
    }
    this._childValueParentSource = this._childValueParentSource.slice(0, c._valueCount)
    c._vertValueIndices = new Int32Array(c._valueCount)
    for (let i = 0; i < c._valueCount; ++i) c._vertValueIndices[i] = i
  }

  // ---- child value population -------------------------------------------

  private populateChildValues(): void {
    const ref = this._refinement
    this._childFVar._valueCount = 0
    if (ref.hasFaceVerticesFirst()) {
      this.populateChildValuesFromFaceVertices()
      this.populateChildValuesFromEdgeVertices()
      this.populateChildValuesFromVertexVertices()
    } else {
      this.populateChildValuesFromVertexVertices()
      this.populateChildValuesFromFaceVertices()
      this.populateChildValuesFromEdgeVertices()
    }
  }

  private populateChildValuesFromFaceVertices(): void {
    const ref = this._refinement
    const c = this._childFVar
    let cVert = ref.getFirstChildVertexFromFaces()
    const end = cVert + ref.getNumChildVerticesFromFaces()
    for (; cVert < end; ++cVert) {
      c._vertSiblingOffsets[cVert] = c._valueCount
      c._vertSiblingCounts[cVert] = 1
      c._valueCount++
    }
  }

  private populateChildValuesFromEdgeVertices(): void {
    const ref = this._refinement
    const c = this._childFVar
    let cVert = ref.getFirstChildVertexFromEdges()
    const end = cVert + ref.getNumChildVerticesFromEdges()
    for (; cVert < end; ++cVert) {
      const pEdge = ref.getChildVertexParentIndex(cVert)
      c._vertSiblingOffsets[cVert] = c._valueCount
      if (this._parentFVar.edgeTopologyMatches(pEdge)) {
        c._vertSiblingCounts[cVert] = 1
        c._valueCount++
      } else {
        const cValueCount = this.populateChildValuesForEdgeVertex(cVert, pEdge)
        c._vertSiblingCounts[cVert] = cValueCount
        c._valueCount += cValueCount
      }
    }
  }

  private populateChildValuesFromVertexVertices(): void {
    const ref = this._refinement
    const c = this._childFVar
    let cVert = ref.getFirstChildVertexFromVertices()
    const end = cVert + ref.getNumChildVerticesFromVertices()
    for (; cVert < end; ++cVert) {
      const pVert = ref.getChildVertexParentIndex(cVert)
      c._vertSiblingOffsets[cVert] = c._valueCount
      if (this._parentFVar.valueTopologyMatches(this._parentFVar.getVertexValueOffset(pVert))) {
        c._vertSiblingCounts[cVert] = 1
        c._valueCount++
      } else {
        const cValueCount = this.populateChildValuesForVertexVertex(cVert, pVert)
        c._vertSiblingCounts[cVert] = cValueCount
        c._valueCount += cValueCount
      }
    }
  }

  private populateChildValuesForEdgeVertex(cVert: Index, pEdge: Index): number {
    const pEdgeFaces = this._parentLevel.getEdgeFaces(pEdge)
    if (pEdgeFaces.length === 1) return 1

    const cValueCount = pEdgeFaces.length
    const cValueOffset = this._childFVar.getVertexValueOffset(cVert)
    for (let i = 0; i < cValueCount; ++i) this._childValueParentSource[cValueOffset + i] = i

    const cVertFaces = this._childLevel.getVertexFaces(cVert)
    const cVertFaceSiblings = this._childFVar.getVertexFaceSiblings(cVert)
    for (let i = 0; i < cVertFaceSiblings.length; ++i) {
      const pFaceI = this._refinement.getChildFaceParentFace(cVertFaces[i]!)
      if (pEdgeFaces.length === 2) {
        if (pFaceI === pEdgeFaces[1]) cVertFaceSiblings[i] = 1
      } else {
        for (let j = 0; j < pEdgeFaces.length; ++j) if (pFaceI === pEdgeFaces[j]) cVertFaceSiblings[i] = j
      }
    }
    return cValueCount
  }

  private populateChildValuesForVertexVertex(cVert: Index, pVert: Index): number {
    const cValueCount = this._parentFVar.getNumVertexValues(pVert)
    if (cValueCount > 1) {
      const cValueIndex = this._childFVar.getVertexValueOffset(cVert)
      for (let j = 1; j < cValueCount; ++j) this._childValueParentSource[cValueIndex + j] = j
      const pVertFaceSiblings = this._parentFVar.getVertexFaceSiblings(pVert)
      const cVertFaceSiblings = this._childFVar.getVertexFaceSiblings(cVert)
      for (let j = 0; j < cVertFaceSiblings.length; ++j) cVertFaceSiblings[j] = pVertFaceSiblings[j]!
    }
    return cValueCount
  }

  // ---- tag / crease propagation -----------------------------------------

  private propagateEdgeTags(): void {
    const ref = this._refinement
    const c = this._childFVar
    const numFromFaces = ref.getNumChildEdgesFromFaces()
    // Edges from faces are cleared -- the freshly-zeroed store already holds that.
    for (let e = numFromFaces; e < this._childLevel.getNumEdges(); ++e) {
      const pEdge = ref.getChildEdgeParentIndex(e)
      // FVarETag packs into a single byte, so a byte copy inherits the parent tag.
      c._edgeTags[e] = this._parentFVar._edgeTags[pEdge]!
    }
  }

  private propagateValueTags(): void {
    const ref = this._refinement
    const c = this._childFVar

    // Values from face-vertices all match (cleared) -- the freshly-zeroed store
    // already holds that, so no explicit write is needed.

    // Values from edge-vertices: split edges become crease/corner.
    {
      let cVert = ref.getFirstChildVertexFromEdges()
      const end = cVert + ref.getNumChildVerticesFromEdges()
      const smoothBoundaries = this._parentFVar.hasSmoothBoundaries()
      for (; cVert < end; ++cVert) {
        const pEdge = ref.getChildVertexParentIndex(cVert)
        const pEdgeTag = this._parentFVar.getEdgeTag(pEdge)
        if (!(pEdgeTag._mismatch || pEdgeTag._linear)) continue // non-split stays cleared
        const off = c.getVertexValueOffset(cVert)
        const cnt = c.getNumVertexValues(cVert)
        for (let i = 0; i < cnt; ++i) {
          const t = c.getValueTag(off + i)
          t._mismatch = true
          if (smoothBoundaries) t._crease = true
        }
      }
    }

    // Values from vertex-vertices: inherit parent value tags (byte copy == clone).
    {
      let cVert = ref.getFirstChildVertexFromVertices()
      const end = cVert + ref.getNumChildVerticesFromVertices()
      for (; cVert < end; ++cVert) {
        const pVert = ref.getChildVertexParentIndex(cVert)
        const pOff = this._parentFVar.getVertexValueOffset(pVert)
        const cOff = c.getVertexValueOffset(cVert)
        const cnt = c.getNumVertexValues(cVert)
        for (let i = 0; i < cnt; ++i) c._vertValueTags[cOff + i] = this._parentFVar._vertValueTags[pOff + i]!
      }
    }
  }

  private propagateValueCreases(): void {
    const ref = this._refinement
    const c = this._childFVar
    const incChildFacesPerEdge = ref.getRegularFaceSize() === 4 ? 2 : 3

    {
      let cVert = ref.getFirstChildVertexFromEdges()
      const end = cVert + ref.getNumChildVerticesFromEdges()
      for (; cVert < end; ++cVert) {
        const cValueTags = c.getVertexValueTags(cVert)
        if (!cValueTags[0]!.isMismatch()) continue
        if (!ref.isChildVertexComplete(cVert)) continue
        const cCreaseEnds = c.getVertexValueCreaseEnds(cVert)
        let startFace = 0
        let endFace = startFace + incChildFacesPerEdge - 1
        for (let i = 0; i < cValueTags.length; ++i) {
          if (!cValueTags[i]!.isInfSharp()) {
            cCreaseEnds[i]!._startFace = startFace
            cCreaseEnds[i]!._endFace = endFace
          }
          startFace += incChildFacesPerEdge
          endFace += incChildFacesPerEdge
        }
      }
    }
    {
      let cVert = ref.getFirstChildVertexFromVertices()
      const end = cVert + ref.getNumChildVerticesFromVertices()
      for (; cVert < end; ++cVert) {
        const cValueTags = c.getVertexValueTags(cVert)
        if (!cValueTags[0]!.isMismatch()) continue
        if (!ref.isChildVertexComplete(cVert)) continue
        const pVert = ref.getChildVertexParentIndex(cVert)
        const pCreaseEnds = this._parentFVar.getVertexValueCreaseEnds(pVert)
        const cCreaseEnds = c.getVertexValueCreaseEnds(cVert)
        for (let j = 0; j < cValueTags.length; ++j) {
          if (!cValueTags[j]!.isInfSharp()) {
            cCreaseEnds[j]!._startFace = pCreaseEnds[j]!._startFace
            cCreaseEnds[j]!._endFace = pCreaseEnds[j]!._endFace
          }
        }
      }
    }
  }

  private reclassifySemisharpValues(): void {
    const ref = this._refinement
    const c = this._childFVar
    const hasDependentSharpness = this._parentFVar._hasDependentSharpness

    let cVert = ref.getFirstChildVertexFromVertices()
    const end = cVert + ref.getNumChildVerticesFromVertices()
    for (; cVert < end; ++cVert) {
      const cValueTags = c.getVertexValueTags(cVert)
      if (!cValueTags[0]!.isMismatch()) continue
      if (!ref.isChildVertexComplete(cVert)) continue

      const pVert = ref.getChildVertexParentIndex(cVert)
      const pVertTags = this._parentLevel.getVertexTag(pVert)
      if (!pVertTags._semiSharp && !pVertTags._semiSharpEdges) continue

      const cVertTags = this._childLevel.getVertexTag(cVert)
      if (cVertTags._semiSharp || cVertTags._infSharp) continue

      if (!cVertTags._semiSharp && !cVertTags._semiSharpEdges) {
        for (let j = 0; j < cValueTags.length; ++j) {
          if (cValueTags[j]!._semiSharp) {
            cValueTags[j]!._semiSharp = false
            cValueTags[j]!._depSharp = false
            cValueTags[j]!._crease = true
          }
        }
        continue
      }

      const cValueCreaseEnds = c.getVertexValueCreaseEnds(cVert)
      const cVertEdges = this._childLevel.getVertexEdges(cVert)

      for (let j = 0; j < cValueTags.length; ++j) {
        if (cValueTags[j]!._semiSharp && !cValueTags[j]!._depSharp) {
          const vStartFace = cValueCreaseEnds[j]!._startFace
          const vEndFace = cValueCreaseEnds[j]!._endFace
          let isStillSemiSharp = false
          if (vEndFace > vStartFace) {
            for (let k = vStartFace + 1; !isStillSemiSharp && k <= vEndFace; ++k) {
              isStillSemiSharp = this._childLevel.getEdgeTag(cVertEdges[k]!)._semiSharp
            }
          } else if (vStartFace > vEndFace) {
            for (let k = vStartFace + 1; !isStillSemiSharp && k < cVertEdges.length; ++k) {
              isStillSemiSharp = this._childLevel.getEdgeTag(cVertEdges[k]!)._semiSharp
            }
            for (let k = 0; !isStillSemiSharp && k <= vEndFace; ++k) {
              isStillSemiSharp = this._childLevel.getEdgeTag(cVertEdges[k]!)._semiSharp
            }
          }
          if (!isStillSemiSharp) {
            cValueTags[j]!._semiSharp = false
            cValueTags[j]!._depSharp = false
            cValueTags[j]!._crease = true
          }
        }
      }

      if (cValueTags.length === 2 && hasDependentSharpness) {
        if (cValueTags[0]!._depSharp && !cValueTags[1]!._semiSharp) {
          cValueTags[0]!._depSharp = false
        } else if (cValueTags[1]!._depSharp && !cValueTags[0]!._semiSharp) {
          cValueTags[1]!._depSharp = false
        }
      }
    }
  }

  getFractionalWeight(pVert: Index, pSibling: number, cVert: Index, _cSibling: number): number {
    const pVertEdges = this._parentLevel.getVertexEdges(pVert)
    const cVertEdges = this._childLevel.getVertexEdges(cVert)

    const pEdgeSharpness: number[] = []
    const cEdgeSharpness: number[] = []
    const pCreaseEnds = this._parentFVar.getVertexValueCreaseEnds(pVert)[pSibling]!
    const pStartFace = pCreaseEnds._startFace
    const pEndFace = pCreaseEnds._endFace

    let interiorEdgeCount = 0
    if (pEndFace > pStartFace) {
      for (let i = pStartFace + 1; i <= pEndFace; ++i, ++interiorEdgeCount) {
        pEdgeSharpness[interiorEdgeCount] = this._parentLevel.getEdgeSharpness(pVertEdges[i]!)
        cEdgeSharpness[interiorEdgeCount] = this._childLevel.getEdgeSharpness(cVertEdges[i]!)
      }
    } else if (pStartFace > pEndFace) {
      for (let i = pStartFace + 1; i < pVertEdges.length; ++i, ++interiorEdgeCount) {
        pEdgeSharpness[interiorEdgeCount] = this._parentLevel.getEdgeSharpness(pVertEdges[i]!)
        cEdgeSharpness[interiorEdgeCount] = this._childLevel.getEdgeSharpness(cVertEdges[i]!)
      }
      for (let i = 0; i <= pEndFace; ++i, ++interiorEdgeCount) {
        pEdgeSharpness[interiorEdgeCount] = this._parentLevel.getEdgeSharpness(pVertEdges[i]!)
        cEdgeSharpness[interiorEdgeCount] = this._childLevel.getEdgeSharpness(cVertEdges[i]!)
      }
    }
    return new Crease(this._refinement.getOptions()).computeFractionalWeightAtVertex(
      this._parentLevel.getVertexSharpness(pVert),
      this._childLevel.getVertexSharpness(cVert),
      interiorEdgeCount,
      pEdgeSharpness,
      cEdgeSharpness,
    )
  }
}
