// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/drawItem.cpp,
//  pxr/imaging/hdSt/drawItem.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/drawItem.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences: hashes are TfHashCombine's bigint (upstream size_t).

import { Frustum as GfFrustum, type Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { HashCombine as TfHashCombine } from 'typescript-usd/tf'
import {
  DrawItem as HdDrawItem,
  type BufferArrayRange as HdBufferArrayRange,
  type RprimSharedData as HdRprimSharedData,
} from 'typescript-usd/hd'
import type { HdSt_GeometricShader } from './geometricShader.ts'
import type { HdSt_MaterialNetworkShader } from './materialNetworkShader.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** drawItem.cpp:27-31 */
function _GetVersion(bar: HdBufferArrayRange | null): number {
  return bar ? bar.getVersion() : 0
}

/** drawItem.cpp:33-37 */
function _GetElementOffset(bar: HdBufferArrayRange | null): number {
  return bar ? bar.getElementOffset() : 0
}

/** drawItem.cpp:39-43 */
function _GetShaderBar(shader: HdSt_MaterialNetworkShader | null): HdBufferArrayRange | null {
  return shader ? shader.getShaderData() : null
}

/** drawItem.h:27-160 */
export class HdStDrawItem extends HdDrawItem {
  private _geometricShader: HdSt_GeometricShader | null = null
  private _materialNetworkShader: HdSt_MaterialNetworkShader | null = null
  private _materialIsFinal = false

  /** drawItem.cpp:17-22 */
  constructor(sharedData: HdRprimSharedData) {
    super(sharedData)
  }

  /** drawItem.h:38-41 */
  hasInstancer(): boolean {
    TF_VERIFY(this._getSharedData().instancerLevels !== -1)
    return this._getSharedData().instancerLevels > 0
  }

  /** drawItem.h:43-46 */
  getInstancePrimvarNumLevels(): number {
    TF_VERIFY(this._getSharedData().instancerLevels !== -1)
    return this._getSharedData().instancerLevels
  }

  /** drawItem.h:50-54 */
  getInstancePrimvarRange(level: number): HdBufferArrayRange | null {
    return this._getSharedData().barContainer.Get(
      this._getDrawingCoord().getInstancePrimvarIndex(level))
  }

  /** drawItem.h:57-60 */
  getInstanceIndexRange(): HdBufferArrayRange | null {
    return this._getSharedData().barContainer.Get(
      this._getDrawingCoord().getInstanceIndexIndex())
  }

  /** drawItem.h:63-66 */
  getConstantPrimvarRange(): HdBufferArrayRange | null {
    return this._getSharedData().barContainer.Get(
      this._getDrawingCoord().getConstantPrimvarIndex())
  }

  /** drawItem.h:69-72 */
  getElementPrimvarRange(): HdBufferArrayRange | null {
    return this._getSharedData().barContainer.Get(
      this._getDrawingCoord().getElementPrimvarIndex())
  }

  /** drawItem.h:75-78 */
  getVertexPrimvarRange(): HdBufferArrayRange | null {
    return this._getSharedData().barContainer.Get(
      this._getDrawingCoord().getVertexPrimvarIndex())
  }

  /** drawItem.h:81-84 */
  getVaryingPrimvarRange(): HdBufferArrayRange | null {
    return this._getSharedData().barContainer.Get(
      this._getDrawingCoord().getVaryingPrimvarIndex())
  }

  /** drawItem.h:87-90 */
  getFaceVaryingPrimvarRange(): HdBufferArrayRange | null {
    return this._getSharedData().barContainer.Get(
      this._getDrawingCoord().getFaceVaryingPrimvarIndex())
  }

  /** drawItem.h:93-96 */
  getTopologyRange(): HdBufferArrayRange | null {
    return this._getSharedData().barContainer.Get(
      this._getDrawingCoord().getTopologyIndex())
  }

  /** drawItem.h:98-101 */
  getTopologyVisibilityRange(): HdBufferArrayRange | null {
    return this._getSharedData().barContainer.Get(
      this._getDrawingCoord().getTopologyVisibilityIndex())
  }

  /** drawItem.h:103-105 */
  getFvarTopologyToPrimvarVector(): HdRprimSharedData['fvarTopologyToPrimvarVector'] {
    return this._getSharedData().fvarTopologyToPrimvarVector
  }

  /** drawItem.h:108-110 */
  setGeometricShader(shader: HdSt_GeometricShader | null): void {
    this._geometricShader = shader
  }

  /** drawItem.h:112-114 */
  getGeometricShader(): HdSt_GeometricShader | null {
    return this._geometricShader
  }

  /** drawItem.h:116-119 */
  getMaterialNetworkShader(): HdSt_MaterialNetworkShader | null {
    return this._materialNetworkShader
  }

  /** drawItem.h:121-124 */
  setMaterialNetworkShader(shader: HdSt_MaterialNetworkShader | null): void {
    // The draw item holds the shader (materialNetworkShader.ts, Lifetime).
    if (this._materialNetworkShader === shader) return
    shader?._retain()
    this._materialNetworkShader?.release()
    this._materialNetworkShader = shader
  }

  /** The destructor: drops the material network shader's shared_ptr. */
  override destroy(): void {
    this.setMaterialNetworkShader(null)
  }

  /** drawItem.h:126-128 */
  getMaterialIsFinal(): boolean {
    return this._materialIsFinal
  }

  /** drawItem.h:130-132 */
  setMaterialIsFinal(isFinal: boolean): void {
    this._materialIsFinal = isFinal
  }

  /** drawItem.cpp:94-103 */
  intersectsViewVolume(viewProjMatrix: GfMatrix4d): boolean {
    if (this.getInstanceIndexRange()) {
      // XXX: need to test intersections of the bound of all instances.
      return true
    } else {
      return GfFrustum.intersectsViewVolume(this.getBounds(), viewProjMatrix)
    }
  }

  /** drawItem.cpp:45-67 */
  getBufferArraysHash(): bigint {
    let hash = TfHashCombine(
      _GetVersion(this.getConstantPrimvarRange()),
      _GetVersion(this.getElementPrimvarRange()),
      _GetVersion(this.getVertexPrimvarRange()),
      _GetVersion(this.getVaryingPrimvarRange()),
      _GetVersion(this.getFaceVaryingPrimvarRange()),
      _GetVersion(this.getTopologyRange()),
      _GetVersion(this.getTopologyVisibilityRange()),
      _GetVersion(this.getInstanceIndexRange()),
      _GetVersion(_GetShaderBar(this.getMaterialNetworkShader())))

    const instancerNumLevels = this.getInstancePrimvarNumLevels()
    for (let i = 0; i < instancerNumLevels; ++i) {
      hash = TfHashCombine(hash, _GetVersion(this.getInstancePrimvarRange(i)))
    }
    return hash
  }

  /** drawItem.cpp:69-91 */
  getElementOffsetsHash(): bigint {
    let hash = TfHashCombine(
      _GetElementOffset(this.getConstantPrimvarRange()),
      _GetElementOffset(this.getElementPrimvarRange()),
      _GetElementOffset(this.getVertexPrimvarRange()),
      _GetElementOffset(this.getVaryingPrimvarRange()),
      _GetElementOffset(this.getFaceVaryingPrimvarRange()),
      _GetElementOffset(this.getTopologyRange()),
      _GetElementOffset(this.getTopologyVisibilityRange()),
      _GetElementOffset(this.getInstanceIndexRange()),
      _GetElementOffset(_GetShaderBar(this.getMaterialNetworkShader())))

    const instancerNumLevels = this.getInstancePrimvarNumLevels()
    for (let i = 0; i < instancerNumLevels; ++i) {
      hash = TfHashCombine(hash, _GetElementOffset(this.getInstancePrimvarRange(i)))
    }
    return hash
  }
}
