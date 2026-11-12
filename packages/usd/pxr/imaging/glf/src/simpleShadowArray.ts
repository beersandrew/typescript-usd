// Ported from OpenUSD 26.11.1: pxr/imaging/glf/simpleShadowArray.cpp,
//  pxr/imaging/glf/simpleShadowArray.h,
//  pxr/imaging/hdSt/simpleLightingShader.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/glf/simpleShadowArray.{h,cpp} (OpenUSD 26.11.1):
// the shadow map resolutions and matrices.
//
// PLATFORM-DIVERGENCE(glf-shadow-gl): the OpenGL texture, sampler and
// framebuffer management (GetShadowMapTexture, GetShadowMapDepthSampler,
// GetShadowMapCompareSampler, BeginCapture, EndCapture, SetTextures,
// AllocSamplers, simpleShadowArray.cpp:46-62,163-445) is not ported: there
// is no OpenGL here. Storm allocates its shadow maps as render buffers
// (hdSt/simpleLightingShader.cpp:500-585) and does not use them.

import {
  Matrix4d as GfMatrix4d,
  Vec2i as GfVec2i,
  Vec3d as GfVec3d,
} from 'typescript-usd/gf'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** simpleShadowArray.h:23-131 */
export class GlfSimpleShadowArray {
  private _resolutions: GfVec2i[] = []
  private _viewMatrix: GfMatrix4d[] = []
  private _projectionMatrix: GfMatrix4d[] = []

  /** Set the resolutions of all the shadow maps necessary. The number of
   *  resolutions corresponds to the number of shadow map textures necessary,
   *  which is currently one per shadow casting light.
   *  simpleShadowArray.cpp:69-89 */
  setShadowMapResolutions(resolutions: readonly GfVec2i[]): void {
    if (this._resolutions.length === resolutions.length &&
      this._resolutions.every((r, i) => r.equals(resolutions[i]!))) {
      return
    }

    this._resolutions = [...resolutions]

    // _FreeTextures(): see PLATFORM-DIVERGENCE(glf-shadow-gl).

    const numShadowMaps = this._resolutions.length
    if (this._viewMatrix.length !== numShadowMaps ||
      this._projectionMatrix.length !== numShadowMaps) {
      // std::vector::resize keeps the existing entries.
      while (this._viewMatrix.length < numShadowMaps) this._viewMatrix.push(new GfMatrix4d().setIdentity())
      this._viewMatrix.length = numShadowMaps
      while (this._projectionMatrix.length < numShadowMaps) this._projectionMatrix.push(new GfMatrix4d().setIdentity())
      this._projectionMatrix.length = numShadowMaps
    }
  }

  /** Returns the number of shadow map generation passes required, which is
   *  currently one per shadow map (corresponding to a shadow casting light).
   *  simpleShadowArray.cpp:91-96 */
  getNumShadowMapPasses(): number {
    // we require one pass per shadow map.
    return this._resolutions.length
  }

  /** simpleShadowArray.cpp:98-107 */
  getShadowMapSize(index: number): GfVec2i {
    let shadowMapSize = new GfVec2i(0, 0)
    if (TF_VERIFY(index < this._resolutions.length)) {
      shadowMapSize = this._resolutions[index]!
    }

    return shadowMapSize
  }

  /** simpleShadowArray.cpp:109-117 */
  getViewMatrix(index: number): GfMatrix4d {
    if (!TF_VERIFY(index < this._viewMatrix.length)) {
      return new GfMatrix4d(1.0)
    }

    return this._viewMatrix[index]!
  }

  /** simpleShadowArray.cpp:119-127 */
  setViewMatrix(index: number, matrix: GfMatrix4d): void {
    if (!TF_VERIFY(index < this._viewMatrix.length)) {
      return
    }

    this._viewMatrix[index] = matrix
  }

  /** simpleShadowArray.cpp:129-137 */
  getProjectionMatrix(index: number): GfMatrix4d {
    if (!TF_VERIFY(index < this._projectionMatrix.length)) {
      return new GfMatrix4d(1.0)
    }

    return this._projectionMatrix[index]!
  }

  /** simpleShadowArray.cpp:139-147 */
  setProjectionMatrix(index: number, matrix: GfMatrix4d): void {
    if (!TF_VERIFY(index < this._projectionMatrix.length)) {
      return
    }

    this._projectionMatrix[index] = matrix
  }

  /** simpleShadowArray.cpp:149-161 */
  getWorldToShadowMatrix(index: number): GfMatrix4d {
    // Transform shadow space clip coordinates such that after the homegenous
    // divide, the resulting XYZ coordinates are in the range [0,1] and not
    // the NDC [-1,1].
    // This is used during shadow map sampling. (X,Y) serves as the texture
    // coordinate and Z is the compare value.
    //
    const size = new GfMatrix4d().setScale(new GfVec3d(0.5, 0.5, 0.5))
    const center = new GfMatrix4d().setTranslate(new GfVec3d(0.5, 0.5, 0.5))
    return this.getViewMatrix(index).getMultiply(this.getProjectionMatrix(index))
      .getMultiply(size).getMultiply(center)
  }
}
