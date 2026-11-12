// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/volumeShaderKey.cpp,
//  pxr/imaging/hdSt/volumeShaderKey.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/volumeShaderKey.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: the fixed-size mixin arrays (VS[3], FS[7]) are arrays of the
// same length filled with empty tokens, as C++ default-constructs them.

import { Token as TfToken, MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { HdSt_GeometricShaderPrimitiveType } from './geometricShader.ts'
import { HdSt_ShaderKey } from './shaderKey.ts'

/** volumeShaderKey.cpp:14-33 */
const _tokens = TfMakeTokens({
  baseGLSLFX: 'volume.glslfx',

  // point id mixins (provide functions for picking system)
  pointIdFS: 'PointId.Fragment.Fallback',

  // main for all the shader stages
  mainVS: 'Volume.Vertex',
  mainFS: 'Volume.Fragment',

  // instancing
  instancing: 'Instancing.Transform',

  // utils
  transformUtils: 'CoordUtils.Transform',
  projectionUtils: 'CoordUtils.Projection',
  depthUtils: 'CoordUtils.Depth',
})

/** volumeShaderKey.h:19-35. The shader key for a volume: the triangles of
 *  its bounding box, raymarched in the fragment shader. */
export class HdSt_VolumeShaderKey extends HdSt_ShaderKey {
  glslfx: TfToken
  VS: TfToken[]
  FS: TfToken[]

  /** volumeShaderKey.cpp:34-44 */
  constructor() {
    super()
    this.glslfx = _tokens.baseGLSLFX
    this.VS = [_tokens.instancing, _tokens.mainVS, TfToken()]
    this.FS = [_tokens.pointIdFS,
      _tokens.transformUtils,
      _tokens.projectionUtils,
      _tokens.depthUtils,
      _tokens.instancing,
      _tokens.mainFS, TfToken()]
  }

  /** volumeShaderKey.h:24-30 */
  override getGlslfxFilename(): TfToken { return this.glslfx }
  override getVS(): readonly TfToken[] { return this.VS }
  override getFS(): readonly TfToken[] { return this.FS }

  override getPrimitiveType(): HdSt_GeometricShaderPrimitiveType {
    return HdSt_GeometricShaderPrimitiveType.PRIM_VOLUME
  }
}
