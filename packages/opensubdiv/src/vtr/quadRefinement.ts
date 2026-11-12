// Ported from OpenSubdiv 3.7.0: opensubdiv/vtr/quadRefinement.h,
//  opensubdiv/vtr/quadRefinement.cpp
// Copyright 2014 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/vtr/quadRefinement.{h,cpp} — Vtr::internal::QuadRefinement.
//
// Splits every parent face into quads (Catmark/Bilinear). Provides the
// parent→child index allocation and populates all six child topology relations.
// Uniform path only (no sparse/INDEX_INVALID children), though the validity
// guards are retained to mirror upstream.

import { Refinement } from './refinement.ts'
import type { Level } from './level.ts'
import type { Options } from '../sdc/options.ts'
import { Split } from '../sdc/types.ts'
import { IndexIsValid, type Index } from './types.ts'

export class QuadRefinement extends Refinement {
  constructor(parent: Level, child: Level, options: Options) {
    super(parent, child, options)
    this._splitType = Split.TO_QUADS
    this._regFaceSize = 4
  }

  allocateParentChildIndices(): void {
    const p = this._parent
    this._faceChildFaceIndices = new Int32Array(p._faceVertIndices.length)
    this._faceChildEdgeIndices = new Int32Array(p._faceEdgeIndices.length)
    this._edgeChildEdgeIndices = new Int32Array(p._edgeVertIndices.length)
    this._faceChildVertIndex = new Int32Array(p.getNumFaces())
    this._edgeChildVertIndex = new Int32Array(p.getNumEdges())
    this._vertChildVertIndex = new Int32Array(p.getNumVertices())
  }

  // ---- face-vertex relation ---------------------------------------------

  populateFaceVertexRelation(): void {
    const c = this._child
    if (c._faceVertCountsAndOffsets.length === 0) this.populateFaceVertexCountsAndOffsets()
    c._faceVertIndices = new Int32Array(c.getNumFaces() * 4)
    this.populateFaceVerticesFromParentFaces()
  }

  private populateFaceVertexCountsAndOffsets(): void {
    const c = this._child
    const co = new Int32Array(c.getNumFaces() * 2)
    for (let i = 0; i < c.getNumFaces(); ++i) {
      co[i * 2] = 4
      co[i * 2 + 1] = i << 2
    }
    c._faceVertCountsAndOffsets = co
  }

  private populateFaceVerticesFromParentFaces(): void {
    const p = this._parent
    const c = this._child
    for (let pFace = 0; pFace < p.getNumFaces(); ++pFace) {
      const pFaceVerts = p.getFaceVertices(pFace)
      const pFaceEdges = p.getFaceEdges(pFace)
      const pFaceChildren = this.getFaceChildFaces(pFace)
      const pFaceSize = pFaceVerts.length

      for (let j = 0; j < pFaceSize; ++j) {
        const cFace = pFaceChildren[j]!
        if (!IndexIsValid(cFace)) continue
        const jPrev = j ? j - 1 : pFaceSize - 1

        const cVertOfFace = this._faceChildVertIndex[pFace]!
        const cVertOfEPrev = this._edgeChildVertIndex[pFaceEdges[jPrev]!]!
        const cVertOfVert = this._vertChildVertIndex[pFaceVerts[j]!]!
        const cVertOfENext = this._edgeChildVertIndex[pFaceEdges[j]!]!

        const cFaceVerts = c.getFaceVertices(cFace)
        if (pFaceSize === 4) {
          const jOpp = jPrev ? jPrev - 1 : 3
          const jNext = jOpp ? jOpp - 1 : 3
          cFaceVerts[j] = cVertOfVert
          cFaceVerts[jNext] = cVertOfENext
          cFaceVerts[jOpp] = cVertOfFace
          cFaceVerts[jPrev] = cVertOfEPrev
        } else {
          cFaceVerts[0] = cVertOfVert
          cFaceVerts[1] = cVertOfENext
          cFaceVerts[2] = cVertOfFace
          cFaceVerts[3] = cVertOfEPrev
        }
      }
    }
  }

  // ---- face-edge relation -----------------------------------------------

  populateFaceEdgeRelation(): void {
    const c = this._child
    if (c._faceVertCountsAndOffsets.length === 0) this.populateFaceVertexCountsAndOffsets()
    c._faceEdgeIndices = new Int32Array(c.getNumFaces() * 4)
    this.populateFaceEdgesFromParentFaces()
  }

  private populateFaceEdgesFromParentFaces(): void {
    const p = this._parent
    const c = this._child
    for (let pFace = 0; pFace < p.getNumFaces(); ++pFace) {
      const pFaceVerts = p.getFaceVertices(pFace)
      const pFaceEdges = p.getFaceEdges(pFace)
      const pFaceChildFaces = this.getFaceChildFaces(pFace)
      const pFaceChildEdges = this.getFaceChildEdges(pFace)
      const pFaceSize = pFaceVerts.length

      for (let j = 0; j < pFaceSize; ++j) {
        const cFace = pFaceChildFaces[j]!
        if (!IndexIsValid(cFace)) continue

        const jPrev = j ? j - 1 : pFaceSize - 1

        const pPrevEdge = pFaceEdges[jPrev]!
        const pPrevEdgeVerts = p.getEdgeVertices(pPrevEdge)
        const pNextEdge = pFaceEdges[j]!
        const pNextEdgeVerts = p.getEdgeVertices(pNextEdge)

        const pCornerVert = pFaceVerts[j]!

        const cornerInPrevEdge = pPrevEdgeVerts[0] !== pPrevEdgeVerts[1] ? (pPrevEdgeVerts[0] !== pCornerVert ? 1 : 0) : 1
        const cornerInNextEdge = pNextEdgeVerts[0] !== pNextEdgeVerts[1] ? (pNextEdgeVerts[0] !== pCornerVert ? 1 : 0) : 0

        const cEdgeOfEdgePrev = this.getEdgeChildEdges(pPrevEdge)[cornerInPrevEdge]!
        const cEdgeOfEdgeNext = this.getEdgeChildEdges(pNextEdge)[cornerInNextEdge]!

        const cEdgePerpEdgePrev = pFaceChildEdges[jPrev]!
        const cEdgePerpEdgeNext = pFaceChildEdges[j]!

        const cFaceEdges = c.getFaceEdges(cFace)
        if (pFaceSize === 4) {
          const jOpp = jPrev ? jPrev - 1 : 3
          const jNext = jOpp ? jOpp - 1 : 3
          cFaceEdges[j] = cEdgeOfEdgeNext
          cFaceEdges[jNext] = cEdgePerpEdgeNext
          cFaceEdges[jOpp] = cEdgePerpEdgePrev
          cFaceEdges[jPrev] = cEdgeOfEdgePrev
        } else {
          cFaceEdges[0] = cEdgeOfEdgeNext
          cFaceEdges[1] = cEdgePerpEdgeNext
          cFaceEdges[2] = cEdgePerpEdgePrev
          cFaceEdges[3] = cEdgeOfEdgePrev
        }
      }
    }
  }

  // ---- edge-vertex relation ---------------------------------------------

  populateEdgeVertexRelation(): void {
    const c = this._child
    c._edgeVertIndices = new Int32Array(c.getNumEdges() * 2)
    this.populateEdgeVerticesFromParentFaces()
    this.populateEdgeVerticesFromParentEdges()
  }

  private populateEdgeVerticesFromParentFaces(): void {
    const p = this._parent
    const c = this._child
    for (let pFace = 0; pFace < p.getNumFaces(); ++pFace) {
      const pFaceEdges = p.getFaceEdges(pFace)
      const pFaceChildEdges = this.getFaceChildEdges(pFace)
      for (let j = 0; j < pFaceEdges.length; ++j) {
        const cEdge = pFaceChildEdges[j]!
        if (!IndexIsValid(cEdge)) continue
        const cEdgeVerts = c.getEdgeVertices(cEdge)
        cEdgeVerts[0] = this._faceChildVertIndex[pFace]!
        cEdgeVerts[1] = this._edgeChildVertIndex[pFaceEdges[j]!]!
      }
    }
  }

  private populateEdgeVerticesFromParentEdges(): void {
    const p = this._parent
    const c = this._child
    for (let pEdge = 0; pEdge < p.getNumEdges(); ++pEdge) {
      const pEdgeVerts = p.getEdgeVertices(pEdge)
      const pEdgeChildren = this.getEdgeChildEdges(pEdge)
      for (let j = 0; j < 2; ++j) {
        const cEdge = pEdgeChildren[j]!
        if (!IndexIsValid(cEdge)) continue
        const cEdgeVerts = c.getEdgeVertices(cEdge)
        cEdgeVerts[0] = this._edgeChildVertIndex[pEdge]!
        cEdgeVerts[1] = this._vertChildVertIndex[pEdgeVerts[j]!]!
      }
    }
  }

  // ---- edge-face relation -----------------------------------------------

  populateEdgeFaceRelation(): void {
    const p = this._parent
    const c = this._child
    const estimate = p._faceVertIndices.length * 2 + p._edgeFaceIndices.length * 2

    c._edgeFaceCountsAndOffsets = new Int32Array(c.getNumEdges() * 2)
    c._edgeFaceIndices = new Int32Array(estimate)
    c._edgeFaceLocalIndices = new Int32Array(estimate)
    c._maxEdgeFaces = p._maxEdgeFaces

    this.populateEdgeFacesFromParentFaces()
    this.populateEdgeFacesFromParentEdges()
  }

  private populateEdgeFacesFromParentFaces(): void {
    const p = this._parent
    const c = this._child
    for (let pFace = 0; pFace < p.getNumFaces(); ++pFace) {
      const pFaceChildFaces = this.getFaceChildFaces(pFace)
      const pFaceChildEdges = this.getFaceChildEdges(pFace)
      const pFaceSize = pFaceChildFaces.length

      for (let j = 0; j < pFaceSize; ++j) {
        const cEdge = pFaceChildEdges[j]!
        if (!IndexIsValid(cEdge)) continue

        c.resizeEdgeFacesAt(cEdge, 2)
        const cEdgeFaces = c.getEdgeFaces(cEdge)
        const cEdgeInFace = c.getEdgeFaceLocalIndices(cEdge)

        const jNext = j + 1 < pFaceSize ? j + 1 : 0
        let cEdgeFaceCount = 0
        if (IndexIsValid(pFaceChildFaces[j]!)) {
          cEdgeFaces[cEdgeFaceCount] = pFaceChildFaces[j]!
          cEdgeInFace[cEdgeFaceCount] = pFaceSize === 4 ? jNext : 1
          cEdgeFaceCount++
        }
        if (IndexIsValid(pFaceChildFaces[jNext]!)) {
          cEdgeFaces[cEdgeFaceCount] = pFaceChildFaces[jNext]!
          cEdgeInFace[cEdgeFaceCount] = pFaceSize === 4 ? (jNext + 2) & 3 : 2
          cEdgeFaceCount++
        }
        c.trimEdgeFaces(cEdge, cEdgeFaceCount)
      }
    }
  }

  private populateEdgeFacesFromParentEdges(): void {
    const p = this._parent
    const c = this._child
    for (let pEdge = 0; pEdge < p.getNumEdges(); ++pEdge) {
      const pEdgeChildEdges = this.getEdgeChildEdges(pEdge)
      if (!IndexIsValid(pEdgeChildEdges[0]!) && !IndexIsValid(pEdgeChildEdges[1]!)) continue

      const pEdgeFaces = p.getEdgeFaces(pEdge)
      const pEdgeInFace = p.getEdgeFaceLocalIndices(pEdge)
      const pEdgeVerts = p.getEdgeVertices(pEdge)

      for (let j = 0; j < 2; ++j) {
        const cEdge = pEdgeChildEdges[j]!
        if (!IndexIsValid(cEdge)) continue

        c.resizeEdgeFacesAt(cEdge, pEdgeFaces.length)
        const cEdgeFaces = c.getEdgeFaces(cEdge)
        const cEdgeInFace = c.getEdgeFaceLocalIndices(cEdge)

        let cEdgeFaceCount = 0
        for (let i = 0; i < pEdgeFaces.length; ++i) {
          const pFace = pEdgeFaces[i]!
          const edgeInFace = pEdgeInFace[i]!
          const pFaceVerts = p.getFaceVertices(pFace)
          const pFaceChildren = this.getFaceChildFaces(pFace)

          const childOfEdge = pEdgeVerts[0] === pEdgeVerts[1] ? j : pFaceVerts[edgeInFace]! !== pEdgeVerts[j]! ? 1 : 0
          let childInFace = edgeInFace + childOfEdge
          if (childInFace === pFaceChildren.length) childInFace = 0

          if (IndexIsValid(pFaceChildren[childInFace]!)) {
            cEdgeFaces[cEdgeFaceCount] = pFaceChildren[childInFace]!
            cEdgeInFace[cEdgeFaceCount] = pFaceVerts.length === 4 ? edgeInFace : childOfEdge ? 3 : 0
            cEdgeFaceCount++
          }
        }
        c.trimEdgeFaces(cEdge, cEdgeFaceCount)
      }
    }
  }

  // ---- vertex-face relation ---------------------------------------------

  populateVertexFaceRelation(): void {
    const p = this._parent
    const c = this._child
    const estimate = p._faceVertIndices.length + p._edgeFaceIndices.length * 2 + p._vertFaceIndices.length

    c._vertFaceCountsAndOffsets = new Int32Array(c.getNumVertices() * 2)
    c._vertFaceIndices = new Int32Array(estimate)
    c._vertFaceLocalIndices = new Int32Array(estimate)

    if (this.getFirstChildVertexFromVertices() === 0) {
      this.populateVertexFacesFromParentVertices()
      this.populateVertexFacesFromParentFaces()
      this.populateVertexFacesFromParentEdges()
    } else {
      this.populateVertexFacesFromParentFaces()
      this.populateVertexFacesFromParentEdges()
      this.populateVertexFacesFromParentVertices()
    }
  }

  private populateVertexFacesFromParentFaces(): void {
    const p = this._parent
    const c = this._child
    for (let pFace = 0; pFace < p.getNumFaces(); ++pFace) {
      const cVert = this._faceChildVertIndex[pFace]!
      if (!IndexIsValid(cVert)) continue

      const pFaceChildren = this.getFaceChildFaces(pFace)
      const pFaceSize = pFaceChildren.length

      c.resizeVertexFacesAt(cVert, pFaceSize)
      const cVertFaces = c.getVertexFaces(cVert)
      const cVertInFace = c.getVertexFaceLocalIndices(cVert)

      let cVertFaceCount = 0
      for (let j = 0; j < pFaceSize; ++j) {
        if (IndexIsValid(pFaceChildren[j]!)) {
          cVertFaces[cVertFaceCount] = pFaceChildren[j]!
          cVertInFace[cVertFaceCount] = pFaceSize === 4 ? (j + 2) & 3 : 2
          cVertFaceCount++
        }
      }
      c.trimVertexFaces(cVert, cVertFaceCount)
    }
  }

  private populateVertexFacesFromParentEdges(): void {
    const p = this._parent
    const c = this._child
    for (let pEdge = 0; pEdge < p.getNumEdges(); ++pEdge) {
      const cVert = this._edgeChildVertIndex[pEdge]!
      if (!IndexIsValid(cVert)) continue

      const pEdgeFaces = p.getEdgeFaces(pEdge)
      const pEdgeInFace = p.getEdgeFaceLocalIndices(pEdge)

      c.resizeVertexFacesAt(cVert, 2 * pEdgeFaces.length)
      const cVertFaces = c.getVertexFaces(cVert)
      const cVertInFace = c.getVertexFaceLocalIndices(cVert)

      let cVertFaceCount = 0
      for (let i = 0; i < pEdgeFaces.length; ++i) {
        const pFace = pEdgeFaces[i]!
        const edgeInFace = pEdgeInFace[i]!
        const pFaceChildren = this.getFaceChildFaces(pFace)
        const pFaceSize = pFaceChildren.length

        const faceChild0 = edgeInFace
        let faceChild1 = edgeInFace + 1
        if (faceChild1 === pFaceChildren.length) faceChild1 = 0

        if (IndexIsValid(pFaceChildren[faceChild1]!)) {
          cVertFaces[cVertFaceCount] = pFaceChildren[faceChild1]!
          cVertInFace[cVertFaceCount] = pFaceSize === 4 ? faceChild0 : 3
          cVertFaceCount++
        }
        if (IndexIsValid(pFaceChildren[faceChild0]!)) {
          cVertFaces[cVertFaceCount] = pFaceChildren[faceChild0]!
          cVertInFace[cVertFaceCount] = pFaceSize === 4 ? faceChild1 : 1
          cVertFaceCount++
        }
      }
      c.trimVertexFaces(cVert, cVertFaceCount)
    }
  }

  private populateVertexFacesFromParentVertices(): void {
    const p = this._parent
    const c = this._child
    for (let pVert = 0; pVert < p.getNumVertices(); ++pVert) {
      const cVert = this._vertChildVertIndex[pVert]!
      if (!IndexIsValid(cVert)) continue

      const pVertFaces = p.getVertexFaces(pVert)
      const pVertInFace = p.getVertexFaceLocalIndices(pVert)

      c.resizeVertexFacesAt(cVert, pVertFaces.length)
      const cVertFaces = c.getVertexFaces(cVert)
      const cVertInFace = c.getVertexFaceLocalIndices(cVert)

      let cVertFaceCount = 0
      for (let i = 0; i < pVertFaces.length; ++i) {
        const pFace = pVertFaces[i]!
        const vertInFace = pVertInFace[i]!
        const pFaceChildren = this.getFaceChildFaces(pFace)
        if (IndexIsValid(pFaceChildren[vertInFace]!)) {
          const pFaceSize = pFaceChildren.length
          cVertFaces[cVertFaceCount] = pFaceChildren[vertInFace]!
          cVertInFace[cVertFaceCount] = pFaceSize === 4 ? vertInFace : 0
          cVertFaceCount++
        }
      }
      c.trimVertexFaces(cVert, cVertFaceCount)
    }
  }

  // ---- vertex-edge relation ---------------------------------------------

  populateVertexEdgeRelation(): void {
    const p = this._parent
    const c = this._child
    const estimate =
      p._faceVertIndices.length + p._edgeFaceIndices.length + p.getNumEdges() * 2 + p._vertEdgeIndices.length

    c._vertEdgeCountsAndOffsets = new Int32Array(c.getNumVertices() * 2)
    c._vertEdgeIndices = new Int32Array(estimate)
    c._vertEdgeLocalIndices = new Int32Array(estimate)

    if (this.getFirstChildVertexFromVertices() === 0) {
      this.populateVertexEdgesFromParentVertices()
      this.populateVertexEdgesFromParentFaces()
      this.populateVertexEdgesFromParentEdges()
    } else {
      this.populateVertexEdgesFromParentFaces()
      this.populateVertexEdgesFromParentEdges()
      this.populateVertexEdgesFromParentVertices()
    }
  }

  private populateVertexEdgesFromParentFaces(): void {
    const p = this._parent
    const c = this._child
    for (let pFace = 0; pFace < p.getNumFaces(); ++pFace) {
      const cVert = this._faceChildVertIndex[pFace]!
      if (!IndexIsValid(cVert)) continue

      const pFaceVerts = p.getFaceVertices(pFace)
      const pFaceChildEdges = this.getFaceChildEdges(pFace)

      c.resizeVertexEdgesAt(cVert, pFaceVerts.length)
      const cVertEdges = c.getVertexEdges(cVert)
      const cVertInEdge = c.getVertexEdgeLocalIndices(cVert)

      let cVertEdgeCount = 0
      for (let j = 0; j < pFaceVerts.length; ++j) {
        const jLeadingEdge = j ? j - 1 : pFaceVerts.length - 1
        if (IndexIsValid(pFaceChildEdges[jLeadingEdge]!)) {
          cVertEdges[cVertEdgeCount] = pFaceChildEdges[jLeadingEdge]!
          cVertInEdge[cVertEdgeCount] = 0
          cVertEdgeCount++
        }
      }
      c.trimVertexEdges(cVert, cVertEdgeCount)
    }
  }

  private populateVertexEdgesFromParentEdges(): void {
    const p = this._parent
    const c = this._child
    for (let pEdge = 0; pEdge < p.getNumEdges(); ++pEdge) {
      const cVert = this._edgeChildVertIndex[pEdge]!
      if (!IndexIsValid(cVert)) continue

      const pEdgeFaces = p.getEdgeFaces(pEdge)
      const pEdgeInFace = p.getEdgeFaceLocalIndices(pEdge)
      const pEdgeVerts = p.getEdgeVertices(pEdge)
      const pEdgeChildEdges = this.getEdgeChildEdges(pEdge)

      c.resizeVertexEdgesAt(cVert, pEdgeFaces.length + 2)
      const cVertEdges = c.getVertexEdges(cVert)
      const cVertInEdge = c.getVertexEdgeLocalIndices(cVert)

      let cVertEdgeCount = 0
      if (IndexIsValid(pEdgeChildEdges[0]!)) {
        cVertEdges[cVertEdgeCount] = pEdgeChildEdges[0]!
        cVertInEdge[cVertEdgeCount] = 0
        cVertEdgeCount++
      }
      if (IndexIsValid(pEdgeChildEdges[1]!)) {
        cVertEdges[cVertEdgeCount] = pEdgeChildEdges[1]!
        cVertInEdge[cVertEdgeCount] = 0
        cVertEdgeCount++
      }

      for (let i = 0; i < pEdgeFaces.length; ++i) {
        const pFace = pEdgeFaces[i]!
        const edgeInFace = pEdgeInFace[i]!
        const cEdgeOfFace = this.getFaceChildEdges(pFace)[edgeInFace]!
        if (IndexIsValid(cEdgeOfFace)) {
          cVertEdges[cVertEdgeCount] = cEdgeOfFace
          cVertInEdge[cVertEdgeCount] = 1
          cVertEdgeCount++

          if (i === 0 && cVertEdgeCount === 3) {
            if (pEdgeVerts[0] !== pEdgeVerts[1] && p.getFaceVertices(pFace)[edgeInFace]! === pEdgeVerts[0]!) {
              swap(cVertEdges, 0, 1)
              swap(cVertInEdge, 0, 1)
            }
            swap(cVertEdges, 1, 2)
            swap(cVertInEdge, 1, 2)
          }
        }
      }
      c.trimVertexEdges(cVert, cVertEdgeCount)
    }
  }

  private populateVertexEdgesFromParentVertices(): void {
    const p = this._parent
    const c = this._child
    for (let pVert = 0; pVert < p.getNumVertices(); ++pVert) {
      const cVert = this._vertChildVertIndex[pVert]!
      if (!IndexIsValid(cVert)) continue

      const pVertEdges = p.getVertexEdges(pVert)
      const pVertInEdge = p.getVertexEdgeLocalIndices(pVert)

      c.resizeVertexEdgesAt(cVert, pVertEdges.length)
      const cVertEdges = c.getVertexEdges(cVert)
      const cVertInEdge = c.getVertexEdgeLocalIndices(cVert)

      let cVertEdgeCount = 0
      for (let i = 0; i < pVertEdges.length; ++i) {
        const pEdgeIndex = pVertEdges[i]!
        const pEdgeVert = pVertInEdge[i]!
        const pEdgeChildIndex = this.getEdgeChildEdges(pEdgeIndex)[pEdgeVert]!
        if (IndexIsValid(pEdgeChildIndex)) {
          cVertEdges[cVertEdgeCount] = pEdgeChildIndex
          cVertInEdge[cVertEdgeCount] = 1
          cVertEdgeCount++
        }
      }
      c.trimVertexEdges(cVert, cVertEdgeCount)
    }
  }

  // Sparse selection is not supported in this uniform-only port.
  markSparseFaceChildren(): void {
    throw new Error('QuadRefinement: sparse refinement not supported (uniform-only)')
  }
}

export type { Index }

function swap(arr: Int32Array, a: number, b: number): void {
  const t = arr[a]!
  arr[a] = arr[b]!
  arr[b] = t
}
