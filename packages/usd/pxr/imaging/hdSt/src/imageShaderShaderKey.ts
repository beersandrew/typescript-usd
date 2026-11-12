// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/imageShaderShaderKey.cpp,
//  pxr/imaging/hdSt/imageShaderShaderKey.h
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/imageShaderShaderKey.{h,cpp} (OpenUSD 26.11.1).

import { Token as TfToken, MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { HdSt_GeometricShaderPrimitiveType } from './geometricShader.ts'
import { HdSt_ShaderKey } from './shaderKey.ts'

/** imageShaderShaderKey.cpp:14-20 */
const _tokens = TfMakeTokens({
  baseGLSLFX: 'imageShader.glslfx',
  mainVS: 'ImageShader.Vertex',
  mainFS: 'ImageShader.Fragment',
})

/** imageShaderShaderKey.h:19-36 */
export class HdSt_ImageShaderShaderKey extends HdSt_ShaderKey {
  glslfx: TfToken
  VS: TfToken[] = [TfToken(), TfToken()]
  FS: TfToken[] = [TfToken(), TfToken()]

  /** imageShaderShaderKey.cpp:22-30 */
  constructor() {
    super()
    this.glslfx = _tokens.baseGLSLFX
    this.VS[0] = _tokens.mainVS
    this.VS[1] = TfToken()

    this.FS[0] = _tokens.mainFS
    this.FS[1] = TfToken()
  }

  /** imageShaderShaderKey.h:24-30 */
  override getGlslfxFilename(): TfToken { return this.glslfx }
  override getVS(): readonly TfToken[] { return this.VS }
  override getFS(): readonly TfToken[] { return this.FS }

  override getPrimitiveType(): HdSt_GeometricShaderPrimitiveType {
    return HdSt_GeometricShaderPrimitiveType.PRIM_MESH_COARSE_TRIANGLES
  }
}
