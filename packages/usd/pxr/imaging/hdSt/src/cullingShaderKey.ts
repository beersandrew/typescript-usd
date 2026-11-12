// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/cullingShaderKey.cpp,
//  pxr/imaging/hdSt/cullingShaderKey.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/cullingShaderKey.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: the fixed-size mixin arrays are arrays of the same length
// filled with empty tokens, as C++ default-constructs them.

import { Token as TfToken, MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { HdSt_GeometricShaderPrimitiveType } from './geometricShader.ts'
import { HdSt_ShaderKey } from './shaderKey.ts'

/** cullingShaderKey.cpp:12-25 */
const _tokens = TfMakeTokens({
  baseGLSLFX: 'frustumCull.glslfx',
  instancing: 'Instancing.Transform',
  counting: 'ViewFrustumCull.Counting',
  noCounting: 'ViewFrustumCull.NoCounting',
  tinyCull: 'ViewFrustumCull.TinyCull',
  noTinyCull: 'ViewFrustumCull.NoTinyCull',
  isVisible: 'ViewFrustumCull.IsVisible',
  mainInstancingVS: 'ViewFrustumCull.VertexInstancing',
  mainVS: 'ViewFrustumCull.Vertex',
  mainInstancingCS: 'ViewFrustumCull.ComputeInstancing',
  mainCS: 'ViewFrustumCull.Compute',
})

function _Tokens(n: number): TfToken[] {
  return Array.from({ length: n }, () => TfToken())
}

/** cullingShaderKey.h:18-33 */
export class HdSt_CullingShaderKey extends HdSt_ShaderKey {
  glslfx: TfToken
  VS: TfToken[] = _Tokens(6)

  /** cullingShaderKey.cpp:27-37 */
  constructor(instancing: boolean, tinyCull: boolean, counting: boolean) {
    super()
    this.glslfx = _tokens.baseGLSLFX
    const VS = this.VS
    VS[0] = _tokens.instancing
    VS[1] = counting ? _tokens.counting : _tokens.noCounting
    VS[2] = tinyCull ? _tokens.tinyCull : _tokens.noTinyCull
    VS[3] = _tokens.isVisible
    VS[4] = instancing ? _tokens.mainInstancingVS : _tokens.mainVS
    VS[5] = TfToken()
  }

  /** cullingShaderKey.h:23 */
  override getGlslfxFilename(): TfToken { return this.glslfx }
  /** cullingShaderKey.h:24 */
  override getVS(): readonly TfToken[] { return this.VS }
  /** cullingShaderKey.h:26 */
  override isFrustumCullingPass(): boolean { return true }
  /** cullingShaderKey.h:27-29 */
  override getPrimitiveType(): HdSt_GeometricShaderPrimitiveType {
    return HdSt_GeometricShaderPrimitiveType.PRIM_POINTS
  }
}

/** cullingShaderKey.h:35-50 */
export class HdSt_CullingComputeShaderKey extends HdSt_ShaderKey {
  glslfx: TfToken
  CS: TfToken[] = _Tokens(6)

  /** cullingShaderKey.cpp:43-53 */
  constructor(instancing: boolean, tinyCull: boolean, counting: boolean) {
    super()
    this.glslfx = _tokens.baseGLSLFX
    const CS = this.CS
    CS[0] = _tokens.instancing
    CS[1] = counting ? _tokens.counting : _tokens.noCounting
    CS[2] = tinyCull ? _tokens.tinyCull : _tokens.noTinyCull
    CS[3] = _tokens.isVisible
    CS[4] = instancing ? _tokens.mainInstancingCS : _tokens.mainCS
    CS[5] = TfToken()
  }

  /** cullingShaderKey.h:40 */
  override getGlslfxFilename(): TfToken { return this.glslfx }
  /** cullingShaderKey.h:41 */
  override getCS(): readonly TfToken[] { return this.CS }
  /** cullingShaderKey.h:43 */
  override isFrustumCullingPass(): boolean { return true }
  /** cullingShaderKey.h:44-46 */
  override getPrimitiveType(): HdSt_GeometricShaderPrimitiveType {
    return HdSt_GeometricShaderPrimitiveType.PRIM_COMPUTE
  }
}
