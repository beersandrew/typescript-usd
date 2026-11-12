// Ported from OpenSubdiv 3.6.1: opensubdiv/far/primvarRefiner.h
// Copyright 2015 DreamWorks Animation LLC. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Port of OpenSubdiv 3.6.1 opensubdiv/far/primvarRefiner.h:56-1269 --
// Far::PrimvarRefinerReal<REAL>, the templated primvar refiner. Local source
// addition (see PROVENANCE.md).
//
// The PrimvarRefiner of primvarRefiner.ts is this port's flat-array
// variant and stays as it is. This file is the template form that
// StencilTableFactory needs (stencilTableFactory.cpp:95-134 instantiates it
// with StencilBuilder<REAL>::Index as both source and destination).
//
// DIVERGENCE: the C++ template parameters T and U are any types supporting
// src[i] and dst[i].Clear() / dst[i].AddWithWeight(value, weight). Here they
// are PrimvarBuffer objects whose get(i) returns such a value; FlatPrimvarBuffer
// adapts a flat numeric array.
//
// DIVERGENCE: the Limit() overload with tangents (primvarRefiner.h:341-364)
// is not ported -- this port's Sdc Scheme has no tangent limit masks.

import { Rule } from '../sdc/crease.ts'
import { type IMask, type Scheme } from '../sdc/scheme.ts'
import { CatmarkScheme } from '../sdc/catmarkScheme.ts'
import { LoopScheme } from '../sdc/loopScheme.ts'
import { BilinearScheme } from '../sdc/bilinearScheme.ts'
import { SchemeType } from '../sdc/types.ts'
import { FaceInterface, EdgeInterface, VertexInterface } from '../vtr/componentInterfaces.ts'
import { IndexIsValid } from '../vtr/types.ts'
import type { TopologyRefiner } from './topologyRefiner.ts'
import { type Real, realRound } from './types.ts'

/** A primvar value: the C++ "T"/"U" element interface (Clear, AddWithWeight). */
export interface Primvar<V> {
  clear(): void
  addWithWeight(src: V, weight: number): void
}

/** An indexable buffer of primvar values: the C++ src[i] / dst[i]. */
export interface PrimvarBuffer<V> {
  get(index: number): V
}

/**
 * A primvar value stored at `offset` in a flat numeric array of
 * `elementSize` components. Writing into a Float32Array rounds each
 * accumulated component to float, as a C++ float struct member would.
 */
export class FlatPrimvarElement implements Primvar<FlatPrimvarElement> {
  constructor(
    readonly data: Float32Array | Float64Array | number[],
    readonly offset: number,
    readonly elementSize: number,
  ) {}
  clear(): void {
    for (let k = 0; k < this.elementSize; ++k) this.data[this.offset + k] = 0
  }
  addWithWeight(src: FlatPrimvarElement, weight: number): void {
    const d = this.data
    const s = src.data
    for (let k = 0; k < this.elementSize; ++k) {
      d[this.offset + k] = d[this.offset + k]! + weight * s[src.offset + k]!
    }
  }
}

/** A flat numeric array viewed as a primvar buffer starting at element `base`. */
export class FlatPrimvarBuffer implements PrimvarBuffer<FlatPrimvarElement> {
  constructor(
    readonly data: Float32Array | Float64Array | number[],
    readonly elementSize: number,
    readonly base = 0,
  ) {}
  get(index: number): FlatPrimvarElement {
    return new FlatPrimvarElement(this.data, (this.base + index) * this.elementSize, this.elementSize)
  }
  /** The buffer advanced by `count` elements (pointer arithmetic in the C++). */
  offsetBy(count: number): FlatPrimvarBuffer {
    return new FlatPrimvarBuffer(this.data, this.elementSize, this.base + count)
  }
}

// primvarRefiner.h:212-255 -- the local Mask class fulfilling the MASK
// interface of the Sdc mask queries. Its weights are REAL: a float refiner
// stores float weights, so each assignment is rounded.
class RealMask implements IMask {
  private _vertWeights: number[] = []
  private _edgeWeights: number[] = []
  private _faceWeights: number[] = []
  private _vertCount = 0
  private _edgeCount = 0
  private _faceCount = 0
  private _faceWeightsForFaceCenters = false

  constructor(private readonly _round: (x: number) => number) {}

  getNumVertexWeights(): number {
    return this._vertCount
  }
  getNumEdgeWeights(): number {
    return this._edgeCount
  }
  getNumFaceWeights(): number {
    return this._faceCount
  }
  setNumVertexWeights(count: number): void {
    this._vertCount = count
  }
  setNumEdgeWeights(count: number): void {
    this._edgeCount = count
  }
  setNumFaceWeights(count: number): void {
    this._faceCount = count
  }
  vertexWeight(index: number): number {
    return this._vertWeights[index] ?? 0
  }
  edgeWeight(index: number): number {
    return this._edgeWeights[index] ?? 0
  }
  faceWeight(index: number): number {
    return this._faceWeights[index] ?? 0
  }
  setVertexWeight(index: number, w: number): void {
    this._vertWeights[index] = this._round(w)
  }
  setEdgeWeight(index: number, w: number): void {
    this._edgeWeights[index] = this._round(w)
  }
  setFaceWeight(index: number, w: number): void {
    this._faceWeights[index] = this._round(w)
  }
  areFaceWeightsForFaceCenters(): boolean {
    return this._faceWeightsForFaceCenters
  }
  setFaceWeightsForFaceCenters(on: boolean): void {
    this._faceWeightsForFaceCenters = on
  }
}

export class PrimvarRefinerReal {
  private readonly _refiner: TopologyRefiner
  private readonly _real: Real
  private readonly _round: (x: number) => number

  // primvarRefiner.h:59
  constructor(refiner: TopologyRefiner, real: Real = 'float') {
    this._refiner = refiner
    this._real = real
    this._round = realRound(real)
  }

  getTopologyRefiner(): TopologyRefiner {
    return this._refiner
  }

  // Sdc::Scheme<SCHEME> scheme(_refiner._subdivOptions) at each call site.
  private makeScheme(): Scheme {
    const options = this._refiner.getSchemeOptions()
    switch (this._refiner.getSchemeType()) {
      case SchemeType.CATMARK:
        return new CatmarkScheme(options)
      case SchemeType.LOOP:
        return new LoopScheme(options)
      case SchemeType.BILINEAR:
        return new BilinearScheme(options)
    }
  }

  private makeMask(): RealMask {
    return new RealMask(this._round)
  }

  // primvarRefiner.h:264-288
  interpolate<V extends Primvar<V>>(level: number, src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>): void {
    if (!(level > 0 && level <= this._refiner._refinements.length)) {
      throw new Error(`PrimvarRefinerReal.Interpolate(): invalid level ${level}`)
    }
    const scheme = this.makeScheme()
    this.interpFromFaces(scheme, level, src, dst)
    this.interpFromEdges(scheme, level, src, dst)
    this.interpFromVerts(scheme, level, src, dst)
  }

  // primvarRefiner.h:290-314
  interpolateFaceVarying<V extends Primvar<V>>(
    level: number,
    src: PrimvarBuffer<V>,
    dst: PrimvarBuffer<V>,
    channel = 0,
  ): void {
    if (!(level > 0 && level <= this._refiner._refinements.length)) {
      throw new Error(`PrimvarRefinerReal.InterpolateFaceVarying(): invalid level ${level}`)
    }
    const scheme = this.makeScheme()
    this.interpFVarFromFaces(scheme, level, src, dst, channel)
    this.interpFVarFromEdges(scheme, level, src, dst, channel)
    this.interpFVarFromVerts(scheme, level, src, dst, channel)
  }

  // primvarRefiner.h:316-339
  Limit<V extends Primvar<V>>(src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>): void {
    if (this._refiner.getLevel(this._refiner.getMaxLevel()).getNumVertexEdgesTotal() === 0) {
      throw new Error('Failure in PrimvarRefiner::Limit() -- last level of refinement does not include full topology.')
    }
    this.limit(this.makeScheme(), src, dst)
  }

  // primvarRefiner.h:366-389
  limitFaceVarying<V extends Primvar<V>>(src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>, channel = 0): void {
    if (this._refiner.getLevel(this._refiner.getMaxLevel()).getNumVertexEdgesTotal() === 0) {
      throw new Error(
        'Failure in PrimvarRefiner::LimitFaceVarying() -- last level of refinement does not include full topology.',
      )
    }
    this.limitFVar(this.makeScheme(), src, dst, channel)
  }

  // primvarRefiner.h:391-407
  interpolateFaceUniform<V>(level: number, src: PrimvarBuffer<V>, dst: { set(index: number, value: V): void }): void {
    if (!(level > 0 && level <= this._refiner._refinements.length)) {
      throw new Error(`PrimvarRefinerReal.InterpolateFaceUniform(): invalid level ${level}`)
    }
    const refinement = this._refiner.getRefinement(level - 1)
    const child = refinement.child()
    for (let cFace = 0; cFace < child.getNumFaces(); ++cFace) {
      const pFace = refinement.getChildFaceParentFace(cFace)
      dst.set(cFace, src.get(pFace))
    }
  }

  // primvarRefiner.h:409-465
  interpolateVarying<V extends Primvar<V>>(level: number, src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>): void {
    if (!(level > 0 && level <= this._refiner._refinements.length)) {
      throw new Error(`PrimvarRefinerReal.InterpolateVarying(): invalid level ${level}`)
    }
    const refinement = this._refiner.getRefinement(level - 1)
    const parent = refinement.parent()

    if (refinement.getNumChildVerticesFromFaces() > 0) {
      for (let face = 0; face < parent.getNumFaces(); ++face) {
        const cVert = refinement.getFaceChildVertex(face)
        if (IndexIsValid(cVert)) {
          const fVerts = parent.getFaceVertices(face)
          const fVaryingWeight = this._round(1.0 / fVerts.length)
          const d = dst.get(cVert)
          d.clear()
          for (let i = 0; i < fVerts.length; ++i) {
            d.addWithWeight(src.get(fVerts[i]!), fVaryingWeight)
          }
        }
      }
    }
    for (let edge = 0; edge < parent.getNumEdges(); ++edge) {
      const cVert = refinement.getEdgeChildVertex(edge)
      if (IndexIsValid(cVert)) {
        const eVerts = parent.getEdgeVertices(edge)
        const d = dst.get(cVert)
        d.clear()
        d.addWithWeight(src.get(eVerts[0]!), 0.5)
        d.addWithWeight(src.get(eVerts[1]!), 0.5)
      }
    }
    for (let vert = 0; vert < parent.getNumVertices(); ++vert) {
      const cVert = refinement.getVertexChildVertex(vert)
      if (IndexIsValid(cVert)) {
        const d = dst.get(cVert)
        d.clear()
        d.addWithWeight(src.get(vert), 1.0)
      }
    }
  }

  // primvarRefiner.h:472-508
  private interpFromFaces<V extends Primvar<V>>(scheme: Scheme, level: number, src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>): void {
    const refinement = this._refiner.getRefinement(level - 1)
    const parent = refinement.parent()

    if (refinement.getNumChildVerticesFromFaces() === 0) return

    for (let face = 0; face < parent.getNumFaces(); ++face) {
      const cVert = refinement.getFaceChildVertex(face)
      if (!IndexIsValid(cVert)) continue

      const fVerts = parent.getFaceVertices(face)
      const fMask = this.makeMask()
      scheme.computeFaceVertexMask(new FaceInterface(fVerts.length), fMask)

      const d = dst.get(cVert)
      d.clear()
      for (let i = 0; i < fVerts.length; ++i) {
        d.addWithWeight(src.get(fVerts[i]!), fMask.vertexWeight(i))
      }
    }
  }

  // primvarRefiner.h:510-578
  private interpFromEdges<V extends Primvar<V>>(scheme: Scheme, level: number, src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>): void {
    const refinement = this._refiner.getRefinement(level - 1)
    const parent = refinement.parent()
    const child = refinement.child()

    const eHood = new EdgeInterface(parent)

    for (let edge = 0; edge < parent.getNumEdges(); ++edge) {
      const cVert = refinement.getEdgeChildVertex(edge)
      if (!IndexIsValid(cVert)) continue

      const eVerts = parent.getEdgeVertices(edge)
      const eFaces = parent.getEdgeFaces(edge)

      const eMask = this.makeMask()
      eHood.setIndex(edge)

      const pRule = parent.getEdgeSharpness(edge) > 0.0 ? Rule.CREASE : Rule.SMOOTH
      const cRule = child.getVertexRule(cVert)

      scheme.computeEdgeVertexMask(eHood, eMask, pRule, cRule)

      const d = dst.get(cVert)
      d.clear()
      d.addWithWeight(src.get(eVerts[0]!), eMask.vertexWeight(0))
      d.addWithWeight(src.get(eVerts[1]!), eMask.vertexWeight(1))

      if (eMask.getNumFaceWeights() > 0) {
        for (let i = 0; i < eFaces.length; ++i) {
          if (eMask.areFaceWeightsForFaceCenters()) {
            const cVertOfFace = refinement.getFaceChildVertex(eFaces[i]!)
            d.addWithWeight(dst.get(cVertOfFace), eMask.faceWeight(i))
          } else {
            const pFace = eFaces[i]!
            const pFaceEdges = parent.getFaceEdges(pFace)
            const pFaceVerts = parent.getFaceVertices(pFace)

            let eInFace = 0
            for (; pFaceEdges[eInFace] !== edge; ++eInFace);

            let vInFace = eInFace + 2
            if (vInFace >= pFaceVerts.length) vInFace -= pFaceVerts.length

            const pVertNext = pFaceVerts[vInFace]!
            d.addWithWeight(src.get(pVertNext), eMask.faceWeight(i))
          }
        }
      }
    }
  }

  // primvarRefiner.h:580-648
  private interpFromVerts<V extends Primvar<V>>(scheme: Scheme, level: number, src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>): void {
    const refinement = this._refiner.getRefinement(level - 1)
    const parent = refinement.parent()
    const child = refinement.child()

    const vHood = new VertexInterface(parent, child)

    for (let vert = 0; vert < parent.getNumVertices(); ++vert) {
      const cVert = refinement.getVertexChildVertex(vert)
      if (!IndexIsValid(cVert)) continue

      const vEdges = parent.getVertexEdges(vert)
      const vFaces = parent.getVertexFaces(vert)

      const vMask = this.makeMask()
      vHood.setIndex(vert, cVert)

      const pRule = parent.getVertexRule(vert)
      const cRule = child.getVertexRule(cVert)

      scheme.computeVertexVertexMask(vHood, vMask, pRule, cRule)

      //  Smaller weights first (faces, then edges, then the vertex) for
      //  precision (primvarRefiner.h:618-623).
      const d = dst.get(cVert)
      d.clear()

      if (vMask.getNumFaceWeights() > 0) {
        for (let i = 0; i < vFaces.length; ++i) {
          const cVertOfFace = refinement.getFaceChildVertex(vFaces[i]!)
          d.addWithWeight(dst.get(cVertOfFace), vMask.faceWeight(i))
        }
      }
      if (vMask.getNumEdgeWeights() > 0) {
        for (let i = 0; i < vEdges.length; ++i) {
          const eVerts = parent.getEdgeVertices(vEdges[i]!)
          const pVertOppositeEdge = eVerts[0] === vert ? eVerts[1]! : eVerts[0]!
          d.addWithWeight(src.get(pVertOppositeEdge), vMask.edgeWeight(i))
        }
      }
      d.addWithWeight(src.get(vert), vMask.vertexWeight(0))
    }
  }

  // primvarRefiner.h:654-701
  private interpFVarFromFaces<V extends Primvar<V>>(
    scheme: Scheme,
    level: number,
    src: PrimvarBuffer<V>,
    dst: PrimvarBuffer<V>,
    channel: number,
  ): void {
    const refinement = this._refiner.getRefinement(level - 1)

    if (refinement.getNumChildVerticesFromFaces() === 0) return

    const parentLevel = refinement.parent()
    const childLevel = refinement.child()

    const parentFVar = parentLevel.getFVarLevel(channel)
    const childFVar = childLevel.getFVarLevel(channel)

    for (let face = 0; face < parentLevel.getNumFaces(); ++face) {
      const cVert = refinement.getFaceChildVertex(face)
      if (!IndexIsValid(cVert)) continue

      const cVertValue = childFVar.getVertexValueOffset(cVert)

      const fValues = parentFVar.getFaceValues(face)

      const fMask = this.makeMask()
      scheme.computeFaceVertexMask(new FaceInterface(fValues.length), fMask)

      const d = dst.get(cVertValue)
      d.clear()
      for (let i = 0; i < fValues.length; ++i) {
        d.addWithWeight(src.get(fValues[i]!), fMask.vertexWeight(i))
      }
    }
  }

  // primvarRefiner.h:703-846
  private interpFVarFromEdges<V extends Primvar<V>>(
    scheme: Scheme,
    level: number,
    src: PrimvarBuffer<V>,
    dst: PrimvarBuffer<V>,
    channel: number,
  ): void {
    const refinement = this._refiner.getRefinement(level - 1)

    const parentLevel = refinement.parent()
    const childLevel = refinement.child()

    const refineFVar = refinement.getFVarRefinement(channel)
    const parentFVar = parentLevel.getFVarLevel(channel)
    const childFVar = childLevel.getFVarLevel(channel)

    //  Allocate and initialize (if linearly interpolated) interpolation
    //  weights for the edge mask:
    const eMask = this.makeMask()

    const isLinearFVar = parentFVar.isLinear() || this._refiner._subdivType === SchemeType.BILINEAR
    if (isLinearFVar) {
      eMask.setNumVertexWeights(2)
      eMask.setNumEdgeWeights(0)
      eMask.setNumFaceWeights(0)

      eMask.setVertexWeight(0, 0.5)
      eMask.setVertexWeight(1, 0.5)
    }

    const eHood = new EdgeInterface(parentLevel)

    for (let edge = 0; edge < parentLevel.getNumEdges(); ++edge) {
      const cVert = refinement.getEdgeChildVertex(edge)
      if (!IndexIsValid(cVert)) continue

      const cVertValues = childFVar.getVertexValues(cVert)

      const fvarEdgeVertMatchesVertex = childFVar.valueTopologyMatches(cVertValues[0]!)
      if (fvarEdgeVertMatchesVertex) {
        //  If smoothly interpolated, compute new weights for the edge mask:
        if (!isLinearFVar) {
          eHood.setIndex(edge)

          const pRule = parentLevel.getEdgeSharpness(edge) > 0.0 ? Rule.CREASE : Rule.SMOOTH
          const cRule = childLevel.getVertexRule(cVert)

          scheme.computeEdgeVertexMask(eHood, eMask, pRule, cRule)
        }

        const eVertValues = parentFVar.getEdgeFaceValues(edge, 0)

        const cVertValue = cVertValues[0]!

        const d = dst.get(cVertValue)
        d.clear()
        d.addWithWeight(src.get(eVertValues[0]), eMask.vertexWeight(0))
        d.addWithWeight(src.get(eVertValues[1]), eMask.vertexWeight(1))

        if (eMask.getNumFaceWeights() > 0) {
          const eFaces = parentLevel.getEdgeFaces(edge)

          for (let i = 0; i < eFaces.length; ++i) {
            if (eMask.areFaceWeightsForFaceCenters()) {
              const cVertOfFace = refinement.getFaceChildVertex(eFaces[i]!)
              const cValueOfFace = childFVar.getVertexValueOffset(cVertOfFace)
              d.addWithWeight(dst.get(cValueOfFace), eMask.faceWeight(i))
            } else {
              const pFace = eFaces[i]!
              const pFaceEdges = parentLevel.getFaceEdges(pFace)
              const pFaceVerts = parentLevel.getFaceVertices(pFace)

              let eInFace = 0
              for (; pFaceEdges[eInFace] !== edge; ++eInFace);

              //  Edge "i" spans vertices [i,i+1] so we want i+2...
              let vInFace = eInFace + 2
              if (vInFace >= pFaceVerts.length) vInFace -= pFaceVerts.length

              const pValueNext = parentFVar.getFaceValues(pFace)[vInFace]!
              d.addWithWeight(src.get(pValueNext), eMask.faceWeight(i))
            }
          }
        }
      } else {
        //  Mismatched edge-verts are linearly interpolated between the pairs
        //  of values for each sibling of the child edge-vertex:
        for (let i = 0; i < cVertValues.length; ++i) {
          const eFaceIndex = refineFVar.getChildValueParentSource(cVert, i)

          const eVertValues = parentFVar.getEdgeFaceValues(edge, eFaceIndex)

          const cVertValue = cVertValues[i]!

          const d = dst.get(cVertValue)
          d.clear()
          d.addWithWeight(src.get(eVertValues[0]), 0.5)
          d.addWithWeight(src.get(eVertValues[1]), 0.5)
        }
      }
    }
  }

  // primvarRefiner.h:848-1019
  private interpFVarFromVerts<V extends Primvar<V>>(
    scheme: Scheme,
    level: number,
    src: PrimvarBuffer<V>,
    dst: PrimvarBuffer<V>,
    channel: number,
  ): void {
    const R = this._round
    const refinement = this._refiner.getRefinement(level - 1)

    const parentLevel = refinement.parent()
    const childLevel = refinement.child()

    const refineFVar = refinement.getFVarRefinement(channel)
    const parentFVar = parentLevel.getFVarLevel(channel)
    const childFVar = childLevel.getFVarLevel(channel)

    const isLinearFVar = parentFVar.isLinear() || this._refiner._subdivType === SchemeType.BILINEAR

    const vHood = new VertexInterface(parentLevel, childLevel)

    for (let vert = 0; vert < parentLevel.getNumVertices(); ++vert) {
      const cVert = refinement.getVertexChildVertex(vert)
      if (!IndexIsValid(cVert)) continue

      const pVertValues = parentFVar.getVertexValues(vert)
      const cVertValues = childFVar.getVertexValues(cVert)

      const fvarVertVertMatchesVertex = childFVar.valueTopologyMatches(cVertValues[0]!)
      if (isLinearFVar && fvarVertVertMatchesVertex) {
        const d = dst.get(cVertValues[0]!)
        d.clear()
        d.addWithWeight(src.get(pVertValues[0]!), 1.0)
        continue
      }

      if (fvarVertVertMatchesVertex) {
        const vEdges = parentLevel.getVertexEdges(vert)

        const vMask = this.makeMask()
        vHood.setIndex(vert, cVert)

        const pRule = parentLevel.getVertexRule(vert)
        const cRule = childLevel.getVertexRule(cVert)

        scheme.computeVertexVertexMask(vHood, vMask, pRule, cRule)

        const pVertValue = pVertValues[0]!
        const cVertValue = cVertValues[0]!

        const d = dst.get(cVertValue)
        d.clear()
        if (vMask.getNumFaceWeights() > 0) {
          const vFaces = parentLevel.getVertexFaces(vert)

          for (let i = 0; i < vFaces.length; ++i) {
            const cVertOfFace = refinement.getFaceChildVertex(vFaces[i]!)
            const cValueOfFace = childFVar.getVertexValueOffset(cVertOfFace)
            d.addWithWeight(dst.get(cValueOfFace), vMask.faceWeight(i))
          }
        }
        if (vMask.getNumEdgeWeights() > 0) {
          const vEdgeValues = parentFVar.getVertexEdgeValues(vert)

          for (let i = 0; i < vEdges.length; ++i) {
            d.addWithWeight(src.get(vEdgeValues[i]!), vMask.edgeWeight(i))
          }
        }
        d.addWithWeight(src.get(pVertValue), vMask.vertexWeight(0))
      } else {
        //  Each FVar value associated with a vertex will be either a corner
        //  or a crease, or potentially in transition from corner to crease:
        const pValueTags = parentFVar.getVertexValueTags(vert)
        const cValueTags = childFVar.getVertexValueTags(cVert)

        for (let cSiblingIndex = 0; cSiblingIndex < cVertValues.length; ++cSiblingIndex) {
          const pSiblingIndex = refineFVar.getChildValueParentSource(cVert, cSiblingIndex)

          const cSibling = cSiblingIndex
          const pSibling = pSiblingIndex

          const pVertValue = pVertValues[pSibling]!
          const cVertValue = cVertValues[cSibling]!

          const d = dst.get(cVertValue)
          d.clear()
          if (isLinearFVar || cValueTags[cSibling]!.isCorner()) {
            d.addWithWeight(src.get(pVertValue), 1.0)
          } else {
            //  Crease or a transition from corner to crease -- need the end
            //  values for the full/fractional crease:
            const pEndValues = parentFVar.getVertexCreaseEndValues(vert, pSibling)

            let vWeight = 0.75
            let eWeight = 0.125

            //  If semi-sharp apply fractional weighting -- if made sharp
            //  because of the other sibling (dependent-sharp) use the
            //  fractional weight from that other sibling:
            if (pValueTags[pSibling]!.isSemiSharp()) {
              const wCorner = R(
                pValueTags[pSibling]!.isDepSharp()
                  ? refineFVar.getFractionalWeight(vert, pSibling ? 0 : 1, cVert, cSibling ? 0 : 1)
                  : refineFVar.getFractionalWeight(vert, pSibling, cVert, cSibling),
              )
              const wCrease = R(1.0 - wCorner)

              vWeight = R(R(wCrease * 0.75) + wCorner)
              eWeight = R(wCrease * 0.125)
            }
            d.addWithWeight(src.get(pEndValues[0]), eWeight)
            d.addWithWeight(src.get(pEndValues[1]), eWeight)
            d.addWithWeight(src.get(pVertValue), vWeight)
          }
        }
      }
    }
  }

  // primvarRefiner.h:1021-1154 (position only; see the header DIVERGENCE)
  private limit<V extends Primvar<V>>(scheme: Scheme, src: PrimvarBuffer<V>, dstPos: PrimvarBuffer<V>): void {
    const level = this._refiner.getLevel(this._refiner.getMaxLevel())

    //  Both parent and child are the last level (primvarRefiner.h:1051-1053):
    const vHood = new VertexInterface(level, level)

    for (let vert = 0; vert < level.getNumVertices(); ++vert) {
      const vEdges = level.getVertexEdges(vert)

      //  Incomplete vertices (present in sparse refinement) do not have
      //  their full topological neighborhood -- leave them at the refined
      //  location:
      if (level.getVertexTag(vert)._incomplete || vEdges.length === 0) {
        const d = dstPos.get(vert)
        d.clear()
        d.addWithWeight(src.get(vert), 1.0)
        continue
      }

      const vRule = level.getVertexRule(vert)

      vHood.setIndex(vert, vert)

      const posMask = this.makeMask()
      scheme.computeVertexLimitMask(vHood, posMask, vRule)

      //  Gather the vertices opposite incident edges and the opposite
      //  vertices of incident faces:
      const eIndices: number[] = []
      const fIndices: number[] = []

      for (let i = 0; i < vEdges.length; ++i) {
        const eVerts = level.getEdgeVertices(vEdges[i]!)
        eIndices[i] = eVerts[0] === vert ? eVerts[1]! : eVerts[0]!
      }
      if (posMask.getNumFaceWeights()) {
        const vFaces = level.getVertexFaces(vert)
        const vInFace = level.getVertexFaceLocalIndices(vert)

        for (let i = 0; i < vFaces.length; ++i) {
          const fVerts = level.getFaceVertices(vFaces[i]!)

          let vOppInFace = vInFace[i]! + 2
          if (vOppInFace >= fVerts.length) vOppInFace -= fVerts.length

          fIndices[i] = level.getFaceVertices(vFaces[i]!)[vOppInFace]!
        }
      }

      //  Smaller weights first: faces, edges, then the vertex.
      const d = dstPos.get(vert)
      d.clear()
      for (let i = 0; i < posMask.getNumFaceWeights(); ++i) {
        d.addWithWeight(src.get(fIndices[i]!), posMask.faceWeight(i))
      }
      for (let i = 0; i < posMask.getNumEdgeWeights(); ++i) {
        d.addWithWeight(src.get(eIndices[i]!), posMask.edgeWeight(i))
      }
      d.addWithWeight(src.get(vert), posMask.vertexWeight(0))
    }
  }

  // primvarRefiner.h:1156-1263
  private limitFVar<V extends Primvar<V>>(scheme: Scheme, src: PrimvarBuffer<V>, dst: PrimvarBuffer<V>, channel: number): void {
    const level = this._refiner.getLevel(this._refiner.getMaxLevel())
    const fvarChannel = level.getFVarLevel(channel)

    const vHood = new VertexInterface(level, level)

    for (let vert = 0; vert < level.getNumVertices(); ++vert) {
      const vEdges = level.getVertexEdges(vert)
      const vValues = fvarChannel.getVertexValues(vert)

      //  Incomplete vertices, or a purely linear channel, keep the values
      //  at the refined location:
      const isIncomplete = level.getVertexTag(vert)._incomplete || vEdges.length === 0
      if (isIncomplete || fvarChannel.isLinear()) {
        for (let i = 0; i < vValues.length; ++i) {
          const vValue = vValues[i]!
          const d = dst.get(vValue)
          d.clear()
          d.addWithWeight(src.get(vValue), 1.0)
        }
        continue
      }

      const fvarVertMatchesVertex = fvarChannel.valueTopologyMatches(vValues[0]!)
      if (fvarVertMatchesVertex) {
        const vMask = this.makeMask()

        vHood.setIndex(vert, vert)

        scheme.computeVertexLimitMask(vHood, vMask, level.getVertexRule(vert))

        const vValue = vValues[0]!

        const d = dst.get(vValue)
        d.clear()
        if (vMask.getNumFaceWeights() > 0) {
          const vFaces = level.getVertexFaces(vert)
          const vInFace = level.getVertexFaceLocalIndices(vert)

          for (let i = 0; i < vFaces.length; ++i) {
            const faceValues = fvarChannel.getFaceValues(vFaces[i]!)
            let vOppInFace = vInFace[i]! + 2
            if (vOppInFace >= faceValues.length) vOppInFace -= faceValues.length

            const vValueOppositeFace = faceValues[vOppInFace]!

            d.addWithWeight(src.get(vValueOppositeFace), vMask.faceWeight(i))
          }
        }
        if (vMask.getNumEdgeWeights() > 0) {
          const vEdgeValues = fvarChannel.getVertexEdgeValues(vert)

          for (let i = 0; i < vEdges.length; ++i) {
            d.addWithWeight(src.get(vEdgeValues[i]!), vMask.edgeWeight(i))
          }
        }
        d.addWithWeight(src.get(vValue), vMask.vertexWeight(0))
      } else {
        //  Sibling FVar values associated with a vertex will be either a
        //  corner or a crease:
        for (let i = 0; i < vValues.length; ++i) {
          const vValue = vValues[i]!

          const d = dst.get(vValue)
          d.clear()
          if (fvarChannel.getValueTag(vValue).isCorner()) {
            d.addWithWeight(src.get(vValue), 1.0)
          } else {
            const vEndValues = fvarChannel.getVertexCreaseEndValues(vert, i)

            d.addWithWeight(src.get(vEndValues[0]), this._round(1.0 / 6.0))
            d.addWithWeight(src.get(vEndValues[1]), this._round(1.0 / 6.0))
            d.addWithWeight(src.get(vValue), this._round(2.0 / 3.0))
          }
        }
      }
    }
  }

  /** The REAL precision this refiner was instantiated with. */
  getPrecision(): Real {
    return this._real
  }
}
