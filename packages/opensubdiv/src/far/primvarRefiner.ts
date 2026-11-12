// Ported from OpenSubdiv 3.7.0: opensubdiv/far/primvarRefiner.h
// Copyright 2015 DreamWorks Animation LLC. Tomorrow Open Source Technology
//  License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors opensubdiv/far/primvarRefiner.h — Far::PrimvarRefiner (Interpolate).
//
// Applies the Sdc scheme masks to move per-vertex primvar data (positions,
// colors, normals-as-data) from one refinement level to the next. This is what
// actually computes the subdivided point positions, driving the vtr topology
// produced by QuadRefinement with the CatmarkScheme masks from sdc.
//
// The C++ API templates the buffer types with Clear()/AddWithWeight(); the
// typescript-usd consumer contract instead passes flat numeric arrays plus an
// elementSize, which is what we implement.

import { Mask, type Scheme } from '../sdc/scheme.ts'
import { LoopScheme } from '../sdc/loopScheme.ts'
import { CatmarkScheme } from '../sdc/catmarkScheme.ts'
import { Rule } from '../sdc/crease.ts'
import { SchemeType } from '../sdc/types.ts'
import { IndexIsValid } from '../vtr/types.ts'
import { FaceInterface, EdgeInterface, VertexInterface } from '../vtr/componentInterfaces.ts'
import type { Level } from '../vtr/level.ts'
import type { Refinement } from '../vtr/refinement.ts'
import type { TopologyRefiner } from './topologyRefiner.ts'

export class PrimvarRefiner {
  private _refiner: TopologyRefiner

  constructor(refiner: TopologyRefiner) {
    this._refiner = refiner
  }

  // OpenSubdiv v3.7.0 far/primvarRefiner.h:377-389 copies each parent
  // face's value to its children without averaging across face boundaries.
  // DIVERGENCE from upstream: flat numeric buffers and elementSize follow
  // this port's existing Interpolate interface instead of templated values.
  interpolateFaceUniform(level: number, elementSize: number, src: ArrayLike<number>, dst: Float32Array): void {
    const refinement = this._refiner.getRefinement(level - 1)
    for (let face = 0; face < refinement.child().getNumFaces(); face++) {
      const parent = refinement.getChildFaceParentFace(face)
      for (let component = 0; component < elementSize; component++) {
        dst[face * elementSize + component] = src[parent * elementSize + component]!
      }
    }
  }

  private makeScheme(): Scheme {
    switch (this._refiner.getSchemeType()) {
      case SchemeType.LOOP:
        return new LoopScheme(this._refiner.getSchemeOptions())
      case SchemeType.CATMARK:
        return new CatmarkScheme(this._refiner.getSchemeOptions())
      default:
        throw new Error('PrimvarRefiner: only Catmull-Clark and Loop interpolation are implemented.')
    }
  }

  /**
   * Interpolate vertex-interpolation data from level-1 to level.
   * `src` holds GetLevel(level-1).GetNumVertices() * elementSize values;
   * `dst` must hold GetLevel(level).GetNumVertices() * elementSize values.
   */
  interpolate(level: number, elementSize: number, src: ArrayLike<number>, dst: Float32Array): void {
    const refinement = this._refiner.getRefinement(level - 1)
    const scheme = this.makeScheme()
    // Order matters: face points first (edges/verts reference them via dst).
    this.interpFromFaces(refinement, scheme, elementSize, src, dst)
    this.interpFromEdges(refinement, scheme, elementSize, src, dst)
    this.interpFromVerts(refinement, scheme, elementSize, src, dst)
  }

  private interpFromFaces(
    refinement: Refinement,
    scheme: Scheme,
    es: number,
    src: ArrayLike<number>,
    dst: Float32Array,
  ): void {
    const parent: Level = refinement.parent()
    for (let face = 0; face < parent.getNumFaces(); ++face) {
      const cVert = refinement.getFaceChildVertex(face)
      if (!IndexIsValid(cVert)) continue

      const fVerts = parent.getFaceVertices(face)
      const mask = new Mask()
      scheme.computeFaceVertexMask(new FaceInterface(fVerts.length), mask)

      const o = cVert * es
      for (let k = 0; k < es; ++k) dst[o + k] = 0
      for (let i = 0; i < fVerts.length; ++i) {
        addSrc(dst, o, src, fVerts[i]! * es, mask.vertexWeight(i), es)
      }
    }
  }

  private interpFromEdges(
    refinement: Refinement,
    scheme: Scheme,
    es: number,
    src: ArrayLike<number>,
    dst: Float32Array,
  ): void {
    const parent = refinement.parent()
    const child = refinement.child()
    const eHood = new EdgeInterface(parent)

    for (let edge = 0; edge < parent.getNumEdges(); ++edge) {
      const cVert = refinement.getEdgeChildVertex(edge)
      if (!IndexIsValid(cVert)) continue

      const eVerts = parent.getEdgeVertices(edge)
      const eFaces = parent.getEdgeFaces(edge)
      const mask = new Mask()
      eHood.setIndex(edge)

      const pRule = parent.getEdgeSharpness(edge) > 0.0 ? Rule.CREASE : Rule.SMOOTH
      const cRule = child.getVertexRule(cVert)
      scheme.computeEdgeVertexMask(eHood, mask, pRule, cRule)

      const o = cVert * es
      for (let k = 0; k < es; ++k) dst[o + k] = 0
      addSrc(dst, o, src, eVerts[0]! * es, mask.vertexWeight(0), es)
      addSrc(dst, o, src, eVerts[1]! * es, mask.vertexWeight(1), es)

      if (mask.getNumFaceWeights() > 0) {
        for (let i = 0; i < eFaces.length; ++i) {
          if (mask.areFaceWeightsForFaceCenters()) {
            const cVertOfFace = refinement.getFaceChildVertex(eFaces[i]!)
            addDst(dst, o, cVertOfFace * es, mask.faceWeight(i), es)
          } else {
            // "smooth triangle" option: weight the opposite vertex of the face.
            const pFace = eFaces[i]!
            const pFaceEdges = parent.getFaceEdges(pFace)
            const pFaceVerts = parent.getFaceVertices(pFace)
            let eInFace = 0
            while (pFaceEdges[eInFace] !== edge) ++eInFace
            let vInFace = eInFace + 2
            if (vInFace >= pFaceVerts.length) vInFace -= pFaceVerts.length
            addSrc(dst, o, src, pFaceVerts[vInFace]! * es, mask.faceWeight(i), es)
          }
        }
      }
    }
  }

  private interpFromVerts(
    refinement: Refinement,
    scheme: Scheme,
    es: number,
    src: ArrayLike<number>,
    dst: Float32Array,
  ): void {
    const parent = refinement.parent()
    const child = refinement.child()
    const vHood = new VertexInterface(parent, child)

    for (let vert = 0; vert < parent.getNumVertices(); ++vert) {
      const cVert = refinement.getVertexChildVertex(vert)
      if (!IndexIsValid(cVert)) continue

      const vEdges = parent.getVertexEdges(vert)
      const vFaces = parent.getVertexFaces(vert)
      const mask = new Mask()
      vHood.setIndex(vert, cVert)

      const pRule = parent.getVertexRule(vert)
      const cRule = child.getVertexRule(cVert)
      scheme.computeVertexVertexMask(vHood, mask, pRule, cRule)

      const o = cVert * es
      for (let k = 0; k < es; ++k) dst[o + k] = 0

      // Smaller weights first (faces, then edges, then the vertex) for precision.
      if (mask.getNumFaceWeights() > 0) {
        for (let i = 0; i < vFaces.length; ++i) {
          const cVertOfFace = refinement.getFaceChildVertex(vFaces[i]!)
          addDst(dst, o, cVertOfFace * es, mask.faceWeight(i), es)
        }
      }
      if (mask.getNumEdgeWeights() > 0) {
        for (let i = 0; i < vEdges.length; ++i) {
          const eVerts = parent.getEdgeVertices(vEdges[i]!)
          const e0 = eVerts[0]!
          const e1 = eVerts[1]!
          const opp = e0 === vert ? e1 : e0
          addSrc(dst, o, src, opp * es, mask.edgeWeight(i), es)
        }
      }
      addSrc(dst, o, src, vert * es, mask.vertexWeight(0), es)
    }
  }

  // ---- face-varying interpolation (UVs) ---------------------------------

  /**
   * Interpolate face-varying data (e.g. UVs) for `channel` from level-1 to
   * level. `src`/`dst` are indexed by fvar value (not vertex); `dst` must hold
   * GetLevel(level).GetNumFVarValues(channel) * elementSize values.
   */
  interpolateFaceVarying(level: number, channel: number, elementSize: number, src: ArrayLike<number>, dst: Float32Array): void {
    const refinement = this._refiner.getRefinement(level - 1)
    const scheme = this.makeScheme()
    this.interpFVarFromFaces(refinement, scheme, channel, elementSize, src, dst)
    this.interpFVarFromEdges(refinement, scheme, channel, elementSize, src, dst)
    this.interpFVarFromVerts(refinement, scheme, channel, elementSize, src, dst)
  }

  private interpFVarFromFaces(refinement: Refinement, scheme: Scheme, channel: number, es: number, src: ArrayLike<number>, dst: Float32Array): void {
    const parent = refinement.parent()
    if (refinement.getNumChildVerticesFromFaces() === 0) return
    const parentFVar = parent.getFVarLevel(channel)
    const childFVar = refinement.child().getFVarLevel(channel)

    for (let face = 0; face < parent.getNumFaces(); ++face) {
      const cVert = refinement.getFaceChildVertex(face)
      if (!IndexIsValid(cVert)) continue
      const cVertValue = childFVar.getVertexValueOffset(cVert)
      const fValues = parentFVar.getFaceValues(face)
      const mask = new Mask()
      scheme.computeFaceVertexMask(new FaceInterface(fValues.length), mask)

      const o = cVertValue * es
      for (let k = 0; k < es; ++k) dst[o + k] = 0
      for (let i = 0; i < fValues.length; ++i) addSrc(dst, o, src, fValues[i]! * es, mask.vertexWeight(i), es)
    }
  }

  private interpFVarFromEdges(refinement: Refinement, scheme: Scheme, channel: number, es: number, src: ArrayLike<number>, dst: Float32Array): void {
    const parent = refinement.parent()
    const child = refinement.child()
    const parentFVar = parent.getFVarLevel(channel)
    const childFVar = child.getFVarLevel(channel)
    const refineFVar = refinement.getFVarRefinement(channel)
    const isLinearFVar = parentFVar.isLinear() // (bilinear scheme also linear; only Catmark here)
    const eHood = new EdgeInterface(parent)

    for (let edge = 0; edge < parent.getNumEdges(); ++edge) {
      const cVert = refinement.getEdgeChildVertex(edge)
      if (!IndexIsValid(cVert)) continue
      const cVertValues = childFVar.getVertexValues(cVert)
      const matches = childFVar.valueTopologyMatches(cVertValues[0]!)

      if (matches) {
        const mask = new Mask()
        if (isLinearFVar) {
          mask.setNumVertexWeights(2)
          mask.setNumEdgeWeights(0)
          mask.setNumFaceWeights(0)
          mask.setVertexWeight(0, 0.5)
          mask.setVertexWeight(1, 0.5)
        } else {
          eHood.setIndex(edge)
          const pRule = parent.getEdgeSharpness(edge) > 0.0 ? Rule.CREASE : Rule.SMOOTH
          const cRule = child.getVertexRule(cVert)
          scheme.computeEdgeVertexMask(eHood, mask, pRule, cRule)
        }

        const eVertValues = parentFVar.getEdgeFaceValues(edge, 0)
        const cVertValue = cVertValues[0]!
        const o = cVertValue * es
        for (let k = 0; k < es; ++k) dst[o + k] = 0
        addSrc(dst, o, src, eVertValues[0] * es, mask.vertexWeight(0), es)
        addSrc(dst, o, src, eVertValues[1] * es, mask.vertexWeight(1), es)

        if (mask.getNumFaceWeights() > 0) {
          const eFaces = parent.getEdgeFaces(edge)
          for (let i = 0; i < eFaces.length; ++i) {
            if (mask.areFaceWeightsForFaceCenters()) {
              const cVertOfFace = refinement.getFaceChildVertex(eFaces[i]!)
              const cValueOfFace = childFVar.getVertexValueOffset(cVertOfFace)
              addDst(dst, o, cValueOfFace * es, mask.faceWeight(i), es)
            } else {
              const pFace = eFaces[i]!
              const pFaceEdges = parent.getFaceEdges(pFace)
              const pFaceVerts = parent.getFaceVertices(pFace)
              let eInFace = 0
              while (pFaceEdges[eInFace] !== edge) ++eInFace
              let vInFace = eInFace + 2
              if (vInFace >= pFaceVerts.length) vInFace -= pFaceVerts.length
              addSrc(dst, o, src, parentFVar.getFaceValues(pFace)[vInFace]! * es, mask.faceWeight(i), es)
            }
          }
        }
      } else {
        // Seam edge-vertex: linearly interpolate each sibling between its source-face value pair.
        for (let i = 0; i < cVertValues.length; ++i) {
          const eFaceIndex = refineFVar.getChildValueParentSource(cVert, i)
          const eVertValues = parentFVar.getEdgeFaceValues(edge, eFaceIndex)
          const o = cVertValues[i]! * es
          for (let k = 0; k < es; ++k) dst[o + k] = 0
          addSrc(dst, o, src, eVertValues[0] * es, 0.5, es)
          addSrc(dst, o, src, eVertValues[1] * es, 0.5, es)
        }
      }
    }
  }

  private interpFVarFromVerts(refinement: Refinement, scheme: Scheme, channel: number, es: number, src: ArrayLike<number>, dst: Float32Array): void {
    const parent = refinement.parent()
    const child = refinement.child()
    const parentFVar = parent.getFVarLevel(channel)
    const childFVar = child.getFVarLevel(channel)
    const refineFVar = refinement.getFVarRefinement(channel)
    const isLinearFVar = parentFVar.isLinear()
    const vHood = new VertexInterface(parent, child)

    for (let vert = 0; vert < parent.getNumVertices(); ++vert) {
      const cVert = refinement.getVertexChildVertex(vert)
      if (!IndexIsValid(cVert)) continue
      const pVertValues = parentFVar.getVertexValues(vert)
      const cVertValues = childFVar.getVertexValues(cVert)
      const matches = childFVar.valueTopologyMatches(cVertValues[0]!)

      if (isLinearFVar && matches) {
        const o = cVertValues[0]! * es
        for (let k = 0; k < es; ++k) dst[o + k] = 0
        addSrc(dst, o, src, pVertValues[0]! * es, 1.0, es)
        continue
      }

      if (matches) {
        const mask = new Mask()
        vHood.setIndex(vert, cVert)
        const pRule = parent.getVertexRule(vert)
        const cRule = child.getVertexRule(cVert)
        scheme.computeVertexVertexMask(vHood, mask, pRule, cRule)

        const cVertValue = cVertValues[0]!
        const o = cVertValue * es
        for (let k = 0; k < es; ++k) dst[o + k] = 0

        if (mask.getNumFaceWeights() > 0) {
          const vFaces = parent.getVertexFaces(vert)
          for (let i = 0; i < vFaces.length; ++i) {
            const cVertOfFace = refinement.getFaceChildVertex(vFaces[i]!)
            const cValueOfFace = childFVar.getVertexValueOffset(cVertOfFace)
            addDst(dst, o, cValueOfFace * es, mask.faceWeight(i), es)
          }
        }
        if (mask.getNumEdgeWeights() > 0) {
          const vEdgeValues = parentFVar.getVertexEdgeValues(vert)
          for (let i = 0; i < vEdgeValues.length; ++i) addSrc(dst, o, src, vEdgeValues[i]! * es, mask.edgeWeight(i), es)
        }
        addSrc(dst, o, src, pVertValues[0]! * es, mask.vertexWeight(0), es)
      } else {
        const pValueTags = parentFVar.getVertexValueTags(vert)
        const cValueTags = childFVar.getVertexValueTags(cVert)
        for (let cSibling = 0; cSibling < cVertValues.length; ++cSibling) {
          const pSibling = refineFVar.getChildValueParentSource(cVert, cSibling)
          const pVertValue = pVertValues[pSibling]!
          const o = cVertValues[cSibling]! * es
          for (let k = 0; k < es; ++k) dst[o + k] = 0

          if (isLinearFVar || cValueTags[cSibling]!.isCorner()) {
            addSrc(dst, o, src, pVertValue * es, 1.0, es)
          } else {
            const pEndValues = parentFVar.getVertexCreaseEndValues(vert, pSibling)
            let vWeight = 0.75
            let eWeight = 0.125
            if (pValueTags[pSibling]!.isSemiSharp()) {
              const wCorner = pValueTags[pSibling]!.isDepSharp()
                ? refineFVar.getFractionalWeight(vert, pSibling ? 0 : 1, cVert, cSibling ? 0 : 1)
                : refineFVar.getFractionalWeight(vert, pSibling, cVert, cSibling)
              const wCrease = 1.0 - wCorner
              vWeight = wCrease * 0.75 + wCorner
              eWeight = wCrease * 0.125
            }
            addSrc(dst, o, src, pEndValues[0] * es, eWeight, es)
            addSrc(dst, o, src, pEndValues[1] * es, eWeight, es)
            addSrc(dst, o, src, pVertValue * es, vWeight, es)
          }
        }
      }
    }
  }
}

function addSrc(dst: Float32Array, o: number, src: ArrayLike<number>, s: number, w: number, es: number): void {
  for (let k = 0; k < es; ++k) dst[o + k] = dst[o + k]! + w * src[s + k]!
}
function addDst(dst: Float32Array, o: number, d: number, w: number, es: number): void {
  for (let k = 0; k < es; ++k) dst[o + k] = dst[o + k]! + w * dst[d + k]!
}
