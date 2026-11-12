// Ported from OpenUSD 26.11.1: pxr/imaging/glf/simpleLightingContext.cpp,
//  pxr/imaging/glf/simpleLightingContext.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/glf/simpleLightingContext.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - TfRefPtr/TfWeakPtr are plain references; New() is kept.
// - SetStateFromOpenGL (simpleLightingContext.cpp:208-293) is not ported:
//   it reads the fixed-function OpenGL state and there is no OpenGL here.
// - The uniform-block validity flags (_lightingUniformBlockValid, ...) are
//   kept, as upstream still tracks them, though nothing reads them.
// - The post-surface hash is ArchHash64 as a bigint.
// - TF_DEBUG(GLF_DEBUG_POST_SURFACE_LIGHTING) and TRACE_FUNCTION are not
//   ported.

import { Hash64 as ArchHash64 } from 'typescript-usd/arch'
import { Matrix4d as GfMatrix4d, Vec4f as GfVec4f } from 'typescript-usd/gf'
import { GlslfxTokens as HioGlslfxTokens } from 'typescript-usd/hio'
import type { GlfSimpleLight, GlfSimpleLightVector } from './simpleLight.ts'
import { GlfSimpleMaterial } from './simpleMaterial.ts'
import { GlfSimpleShadowArray } from './simpleShadowArray.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

const _utf8 = new TextEncoder()

/** simpleLightingContext.h:125-151 */
class _PostSurfaceShaderState {
  private _shaderSource = ''
  private _uniformData = new Uint8Array(0)
  private readonly _hash: bigint

  constructor(hash: bigint, lights: readonly GlfSimpleLight[]) {
    this._hash = hash
    this._init(lights)
  }

  getShaderSource(): string { return this._shaderSource }
  getUniformData(): Uint8Array { return this._uniformData }
  getHash(): bigint { return this._hash }

  /** simpleLightingContext.cpp:295-394 */
  private _init(lights: readonly GlfSimpleLight[]): void {
    // Generate shader code and aggregate uniform block data
    //
    // layout(std140) uniform PostSurfaceShaderParams {
    //     MurkPostParams light1;
    //     CausticsParams light2;
    //     ...
    // } postSurface;
    //
    // MAT4 GetWorldToViewInverseMatrix();
    // vec4 postSurfaceShader(vec4 Peye, vec3 Neye, vec4 color)
    // {
    //   vec4 Pworld = vec4(GetWorldToViewInverseMatrix() * Peye);
    //   color = ApplyMurkPostWorldSpace(postSurface.light1,color,Pworld.xyz);
    //   color = ApplyCausticsWorldSpace(postSurface.light2,color,Pworld.xyz);
    //   ...
    //   return color
    // }
    //
    let lightsSourceStr = ''
    let paramsSourceStr = ''
    let applySourceStr = ''

    const uniformData: number[] = []

    const activeShaderIdentifiers = new Set<string>()
    let activeShaders = 0
    for (const light of lights) {
      const shaderIdentifier = light.getPostSurfaceIdentifier()
      const shaderSource = light.getPostSurfaceShaderSource()
      const shaderParams = light.getPostSurfaceShaderParams()

      if (shaderIdentifier === '' ||
        shaderSource === '' ||
        shaderParams.length === 0) {
        continue
      }

      // omit lights with misaligned parameter data
      // GLSL std140 packing has a base alignment of "vec4"
      const std140Alignment = 4 * 4
      if ((shaderParams.length % std140Alignment) !== 0) {
        TF_CODING_ERROR(`Invalid shader params size (${shaderParams.length} bytes) ` +
          `for ${light.getID()} (must be a multiple of ${std140Alignment})\n`)
        continue
      }

      ++activeShaders

      // emit per-light type shader source only one time
      if (!activeShaderIdentifiers.has(shaderIdentifier)) {
        activeShaderIdentifiers.add(shaderIdentifier)
        lightsSourceStr += shaderSource
      }

      // add a per-light parameter declaration to the uniform block
      paramsSourceStr += '    ' +
        shaderIdentifier + 'Params ' +
        'light' + activeShaders + ';\n'

      // append a call to apply the shader with per-light parameters
      applySourceStr += '    ' +
        'color = Apply' + shaderIdentifier + 'WorldSpace(' +
        'postSurface.light' + activeShaders + ', color, Pworld.xyz' +
        ');\n'

      for (const b of shaderParams) uniformData.push(b)
    }

    if (activeShaders < 1) {
      return
    }

    this._shaderSource = lightsSourceStr

    this._shaderSource +=
      'layout(std140) uniform PostSurfaceShaderParams {\n'
    this._shaderSource += paramsSourceStr
    this._shaderSource +=
      '} postSurface;\n\n'

    this._shaderSource +=
      'MAT4 GetWorldToViewInverseMatrix();\n' +
      'vec4 postSurfaceShader(vec4 Peye, vec3 Neye, vec4 color)\n' +
      '{\n' +
      '    vec4 Pworld = vec4(GetWorldToViewInverseMatrix() * Peye);\n' +
      '    color.rgb /= color.a;\n'
    this._shaderSource += applySourceStr
    this._shaderSource +=
      '    color.rgb *= color.a;\n' +
      '    return color;\n' +
      '}\n\n'

    this._uniformData = Uint8Array.from(uniformData)
  }
}

/** simpleLightingContext.cpp:396-415 */
function _ComputeHash(lights: readonly GlfSimpleLight[]): bigint {
  // hash includes light type and shader source but not parameter values
  let hash = 0n
  for (const light of lights) {
    const identifier = light.getPostSurfaceIdentifier()
    const shaderSource = light.getPostSurfaceShaderSource()
    // hash skips lights that won't generate shader code so light count
    // change doesn't trigger shader recompile
    if (identifier !== '' || shaderSource !== '') {
      const id = _utf8.encode(identifier)
      hash = ArchHash64(id, id.length, hash)
      const src = _utf8.encode(shaderSource)
      hash = ArchHash64(src, src.length, hash)
    }
  }

  return hash
}

/** simpleLightingContext.h:31-163 */
export class GlfSimpleLightingContext {
  private _lights: GlfSimpleLightVector = []
  private _shadows: GlfSimpleShadowArray
  private _worldToViewMatrix: GfMatrix4d
  private _projectionMatrix: GfMatrix4d
  private _material = new GlfSimpleMaterial()
  private _sceneAmbient: GfVec4f
  private _useLighting: boolean
  private _useShadows: boolean
  private _useColorMaterialDiffuse: boolean
  private _postSurfaceShaderState: _PostSurfaceShaderState | null = null
  private _lightingUniformBlockValid: boolean
  private _shadowUniformBlockValid: boolean
  private _materialUniformBlockValid: boolean
  private _postSurfaceShaderStateValid: boolean

  /** simpleLightingContext.cpp:31-35 */
  static new(): GlfSimpleLightingContext {
    return new GlfSimpleLightingContext()
  }

  /** simpleLightingContext.cpp:37-51 */
  protected constructor() {
    this._shadows = new GlfSimpleShadowArray()
    this._worldToViewMatrix = new GfMatrix4d(1.0)
    this._projectionMatrix = new GfMatrix4d(1.0)
    this._sceneAmbient = new GfVec4f(0.01, 0.01, 0.01, 1.0)
    this._useLighting = false
    this._useShadows = false
    this._useColorMaterialDiffuse = false
    this._lightingUniformBlockValid = false
    this._shadowUniformBlockValid = false
    this._materialUniformBlockValid = false
    this._postSurfaceShaderStateValid = false
  }

  /** simpleLightingContext.cpp:57-74 */
  setLights(lights: readonly GlfSimpleLight[]): void {
    this._lights = [...lights]
    this._lightingUniformBlockValid = false
    this._shadowUniformBlockValid = false
    this._postSurfaceShaderStateValid = false

    const numLights = this.getNumLightsUsed()

    this._useShadows = false
    for (let i = 0; i < numLights; ++i) {
      if (this._lights[i]!.hasShadow()) {
        this._useShadows = true
        break
      }
    }
  }

  /** simpleLightingContext.cpp:76-80 */
  getLights(): readonly GlfSimpleLight[] {
    return this._lights
  }

  /** returns the effective number of lights taken into account in
   *  composable/compatible shader constraints (simpleLightingContext.cpp:82-86) */
  getNumLightsUsed(): number {
    return this._lights.length
  }

  /** returns the number of shadow maps needed, by summing shadow maps
   *  allocated to each light (simpleLightingContext.cpp:88-98). */
  computeNumShadowsUsed(): number {
    let numShadows = 0
    for (const light of this._lights) {
      if (light.hasShadow() && numShadows <= light.getShadowIndexEnd()) {
        numShadows = light.getShadowIndexEnd() + 1
      }
    }
    return numShadows
  }

  /** simpleLightingContext.cpp:100-105 */
  setShadows(shadows: GlfSimpleShadowArray): void {
    this._shadows = shadows
    this._shadowUniformBlockValid = false
  }

  /** simpleLightingContext.cpp:107-111 */
  getShadows(): GlfSimpleShadowArray {
    return this._shadows
  }

  /** simpleLightingContext.cpp:113-120 */
  setMaterial(material: GlfSimpleMaterial): void {
    if (!this._material.Equals(material)) {
      this._material = material
      this._materialUniformBlockValid = false
    }
  }

  /** simpleLightingContext.cpp:122-126 */
  getMaterial(): GlfSimpleMaterial {
    return this._material
  }

  /** simpleLightingContext.cpp:128-135 */
  setSceneAmbient(sceneAmbient: GfVec4f): void {
    if (!this._sceneAmbient.equals(sceneAmbient)) {
      this._sceneAmbient = sceneAmbient
      this._materialUniformBlockValid = false
    }
  }

  /** simpleLightingContext.cpp:137-141 */
  getSceneAmbient(): GfVec4f {
    return this._sceneAmbient
  }

  /** simpleLightingContext.cpp:143-153 */
  setCamera(worldToViewMatrix: GfMatrix4d, projectionMatrix: GfMatrix4d): void {
    if (!this._worldToViewMatrix.equals(worldToViewMatrix)) {
      this._worldToViewMatrix = worldToViewMatrix
      this._lightingUniformBlockValid = false
      this._shadowUniformBlockValid = false
    }
    this._projectionMatrix = projectionMatrix
  }

  /** simpleLightingContext.cpp:155-162 */
  setUseLighting(val: boolean): void {
    if (this._useLighting !== val) {
      this._useLighting = val
      this._lightingUniformBlockValid = false
    }
  }

  /** simpleLightingContext.cpp:164-168 */
  getUseLighting(): boolean {
    return this._useLighting
  }

  /** returns true if any light has shadow enabled
   *  (simpleLightingContext.cpp:170-174). */
  getUseShadows(): boolean {
    return this._useShadows
  }

  /** simpleLightingContext.cpp:176-183 */
  setUseColorMaterialDiffuse(val: boolean): void {
    if (this._useColorMaterialDiffuse !== val) {
      this._lightingUniformBlockValid = false
      this._useColorMaterialDiffuse = val
    }
  }

  /** simpleLightingContext.cpp:185-189 */
  getUseColorMaterialDiffuse(): boolean {
    return this._useColorMaterialDiffuse
  }

  /** simpleLightingContext.cpp:417-427 */
  private _computePostSurfaceShaderState(): void {
    const hash = _ComputeHash(this.getLights())
    if (!this._postSurfaceShaderState ||
      (this._postSurfaceShaderState.getHash() !== hash)) {
      this._postSurfaceShaderState =
        new _PostSurfaceShaderState(hash, this.getLights())
    }
    this._postSurfaceShaderStateValid = true
  }

  /** simpleLightingContext.cpp:429-441 */
  computeShaderSourceHash(): bigint {
    if (!this._postSurfaceShaderStateValid) {
      this._computePostSurfaceShaderState()
    }

    if (this._postSurfaceShaderState) {
      return this._postSurfaceShaderState.getHash()
    }

    return 0n
  }

  /** simpleLightingContext.cpp:443-456 */
  computeShaderSource(shaderStageKey: string): string {
    if (!this._postSurfaceShaderStateValid) {
      this._computePostSurfaceShaderState()
    }

    if (this._postSurfaceShaderState &&
      shaderStageKey === HioGlslfxTokens.fragmentShader) {
      return this._postSurfaceShaderState.getShaderSource()
    }

    return ''
  }

  /** The world-to-view and projection matrices last set (the protected
   *  members, simpleLightingContext.h:110-111). */
  protected _getWorldToViewMatrix(): GfMatrix4d { return this._worldToViewMatrix }
  protected _getProjectionMatrix(): GfMatrix4d { return this._projectionMatrix }
}
