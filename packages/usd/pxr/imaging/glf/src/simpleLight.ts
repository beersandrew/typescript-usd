// Ported from OpenUSD 26.11.1: pxr/imaging/glf/simpleLight.cpp,
//  pxr/imaging/glf/simpleLight.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/glf/simpleLight.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - SdfPath ids are strings, as in this repository's hd.
// - VtUCharArray post-surface shader params are a Uint8Array.
// - operator== is Equals; operator<< is not ported (debug output only).
// - Getters return the stored Gf values; callers must not mutate them (the
//   C++ getters return const references).

import {
  Matrix4d as GfMatrix4d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'

function _bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** simpleLight.h:26-206 */
export class GlfSimpleLight {
  private _ambient: GfVec4f
  private _diffuse: GfVec4f
  private _specular: GfVec4f
  private _position: GfVec4f
  private _spotDirection: GfVec3f
  private _spotCutoff: number
  private _spotFalloff: number
  private _attenuation: GfVec3f
  private _isCameraSpaceLight: boolean
  private _hasIntensity: boolean

  private _hasShadow: boolean
  private _shadowResolution: number
  private _shadowBias: number
  private _shadowBlur: number
  private _shadowIndexStart: number
  private _shadowIndexEnd: number

  private _transform: GfMatrix4d
  private _shadowMatrices: GfMatrix4d[]

  // domeLight specific parameters
  private _isDomeLight: boolean
  // path to texture for dome light.
  private _domeLightTextureFile: SdfAssetPath

  private _postSurfaceIdentifier: TfToken
  private _postSurfaceShaderSource: string
  private _postSurfaceShaderParams: Uint8Array

  private _id: string

  /** simpleLight.cpp:14-38 */
  constructor(position: GfVec4f = new GfVec4f(0.0, 0.0, 0.0, 1.0)) {
    this._ambient = new GfVec4f(0.2, 0.2, 0.2, 1.0)
    this._diffuse = new GfVec4f(1.0, 1.0, 1.0, 1.0)
    this._specular = new GfVec4f(1.0, 1.0, 1.0, 1.0)
    this._position = new GfVec4f(position.get(0), position.get(1), position.get(2), 1.0)
    this._spotDirection = new GfVec3f(0.0, 0.0, -1.0)
    this._spotCutoff = 180.0
    this._spotFalloff = 0.0
    this._attenuation = new GfVec3f(1.0, 0.0, 0.0)
    this._isCameraSpaceLight = false
    this._hasIntensity = true
    this._hasShadow = false
    this._shadowResolution = 512
    this._shadowBias = 0.0
    this._shadowBlur = 0.0
    this._shadowIndexStart = 0
    this._shadowIndexEnd = 0
    this._transform = new GfMatrix4d().setIdentity()
    this._shadowMatrices = [new GfMatrix4d().setIdentity()]
    this._isDomeLight = false
    this._domeLightTextureFile = new SdfAssetPath()
    this._postSurfaceIdentifier = TfToken()
    this._postSurfaceShaderSource = ''
    this._postSurfaceShaderParams = new Uint8Array(0)
    this._id = ''
  }

  getTransform(): GfMatrix4d { return this._transform }
  setTransform(mat: GfMatrix4d): void { this._transform = mat }

  /** The ambient light value is in the renderer's working color space */
  getAmbient(): GfVec4f { return this._ambient }
  setAmbient(ambient: GfVec4f): void { this._ambient = ambient }

  /** The diffuse light value is in the renderer's working color space */
  getDiffuse(): GfVec4f { return this._diffuse }
  setDiffuse(diffuse: GfVec4f): void { this._diffuse = diffuse }

  /** The specular light value is in the renderer's working color space */
  getSpecular(): GfVec4f { return this._specular }
  setSpecular(specular: GfVec4f): void { this._specular = specular }

  getPosition(): GfVec4f { return this._position }
  setPosition(position: GfVec4f): void { this._position = position }

  getSpotDirection(): GfVec3f { return this._spotDirection }
  setSpotDirection(spotDirection: GfVec3f): void { this._spotDirection = spotDirection }

  getSpotCutoff(): number { return this._spotCutoff }
  setSpotCutoff(spotCutoff: number): void { this._spotCutoff = Math.fround(spotCutoff) }

  getSpotFalloff(): number { return this._spotFalloff }
  setSpotFalloff(spotFalloff: number): void { this._spotFalloff = Math.fround(spotFalloff) }

  getAttenuation(): GfVec3f { return this._attenuation }
  setAttenuation(attenuation: GfVec3f): void { this._attenuation = attenuation }

  getShadowMatrices(): readonly GfMatrix4d[] { return this._shadowMatrices }
  setShadowMatrices(matrices: readonly GfMatrix4d[]): void { this._shadowMatrices = [...matrices] }

  getShadowResolution(): number { return this._shadowResolution }
  setShadowResolution(resolution: number): void { this._shadowResolution = resolution | 0 }

  getShadowBias(): number { return this._shadowBias }
  setShadowBias(bias: number): void { this._shadowBias = Math.fround(bias) }

  getShadowBlur(): number { return this._shadowBlur }
  setShadowBlur(blur: number): void { this._shadowBlur = Math.fround(blur) }

  getShadowIndexStart(): number { return this._shadowIndexStart }
  setShadowIndexStart(shadowStart: number): void { this._shadowIndexStart = shadowStart | 0 }

  getShadowIndexEnd(): number { return this._shadowIndexEnd }
  setShadowIndexEnd(shadowEnd: number): void { this._shadowIndexEnd = shadowEnd | 0 }

  hasShadow(): boolean { return this._hasShadow }
  setHasShadow(hasShadow: boolean): void { this._hasShadow = hasShadow }

  hasIntensity(): boolean { return this._hasIntensity }
  setHasIntensity(hasIntensity: boolean): void { this._hasIntensity = hasIntensity }

  isCameraSpaceLight(): boolean { return this._isCameraSpaceLight }
  setIsCameraSpaceLight(isCameraSpaceLight: boolean): void { this._isCameraSpaceLight = isCameraSpaceLight }

  getID(): string { return this._id }
  setID(id: string): void { this._id = id }

  isDomeLight(): boolean { return this._isDomeLight }
  setIsDomeLight(isDomeLight: boolean): void { this._isDomeLight = isDomeLight }

  /** The path to the (unprocessed) environment map texture.
   *
   *  All textures actually used by the dome light (irradiance, prefilter,
   *  brdf) are derived from this texture in a pre-calculation step. */
  getDomeLightTextureFile(): SdfAssetPath { return this._domeLightTextureFile }
  setDomeLightTextureFile(path: SdfAssetPath): void { this._domeLightTextureFile = path }

  // Post Surface Lighting (simpleLight.h:150-170)
  getPostSurfaceIdentifier(): TfToken { return this._postSurfaceIdentifier }
  getPostSurfaceShaderSource(): string { return this._postSurfaceShaderSource }
  getPostSurfaceShaderParams(): Uint8Array { return this._postSurfaceShaderParams }

  /** simpleLight.cpp:313-321 */
  setPostSurfaceParams(identifier: TfToken, shaderSource: string,
    shaderParams: Uint8Array): void {
    this._postSurfaceIdentifier = identifier
    this._postSurfaceShaderSource = shaderSource
    this._postSurfaceShaderParams = shaderParams
  }

  /** A copy (the C++ class is a value type; the Gf members are replaced,
   *  never mutated, so they are shared). */
  Clone(): GlfSimpleLight {
    const l = Object.create(GlfSimpleLight.prototype) as GlfSimpleLight
    Object.assign(l, this)
    l._shadowMatrices = [...this._shadowMatrices]
    return l
  }

  /** simpleLight.cpp:327-353 (operator==) */
  Equals(other: GlfSimpleLight): boolean {
    return this._ambient.equals(other._ambient)
      && this._diffuse.equals(other._diffuse)
      && this._specular.equals(other._specular)
      && this._position.equals(other._position)
      && this._spotDirection.equals(other._spotDirection)
      && this._spotCutoff === other._spotCutoff
      && this._spotFalloff === other._spotFalloff
      && this._attenuation.equals(other._attenuation)
      && this._hasIntensity === other._hasIntensity
      && this._hasShadow === other._hasShadow
      && this._shadowResolution === other._shadowResolution
      && this._shadowBias === other._shadowBias
      && this._shadowBlur === other._shadowBlur
      && this._shadowIndexStart === other._shadowIndexStart
      && this._shadowIndexEnd === other._shadowIndexEnd
      && this._transform.equals(other._transform)
      && this._shadowMatrices.length === other._shadowMatrices.length
      && this._shadowMatrices.every((m, i) => m.equals(other._shadowMatrices[i]!))
      && this._isCameraSpaceLight === other._isCameraSpaceLight
      && this._isDomeLight === other._isDomeLight
      && this._domeLightTextureFile.equals(other._domeLightTextureFile)
      && this._postSurfaceIdentifier === other._postSurfaceIdentifier
      && this._postSurfaceShaderSource === other._postSurfaceShaderSource
      && _bytesEqual(this._postSurfaceShaderParams, other._postSurfaceShaderParams)
      && this._id === other._id
  }
}

/** The TfType a VtValue holding a GlfSimpleLight carries. */
export const GlfSimpleLightType = TfType.declare('GlfSimpleLight')

/** simpleLight.h:214 */
export type GlfSimpleLightVector = GlfSimpleLight[]
