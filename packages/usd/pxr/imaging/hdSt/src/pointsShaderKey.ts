// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/pointsShaderKey.cpp,
//  pxr/imaging/hdSt/pointsShaderKey.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/pointsShaderKey.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: the fixed-size mixin arrays (VS[7], FS[7]) are arrays of the
// same length filled with empty tokens, as C++ default-constructs them.

import { Token as TfToken, MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { HdSt_GeometricShaderPrimitiveType } from './geometricShader.ts'
import { HdSt_ShaderKey } from './shaderKey.ts'

/** pointsShaderKey.cpp:14-39 */
const _tokens = TfMakeTokens({
  baseGLSLFX: 'points.glslfx',

  // point id mixins (for point picking & selection)
  pointIdVS: 'PointId.Vertex.PointParam',
  pointIdSelDecodeUtilsVS: 'Selection.DecodeUtils',
  pointIdSelPointSelVS: 'Selection.Vertex.PointSel',
  pointIdFS: 'PointId.Fragment.PointParam',

  // main for all the shader stages
  mainVS: 'Point.Vertex',
  mainFS: 'Point.Fragment',

  // terminals
  commonFS: 'Fragment.CommonTerminals',
  surfaceFS: 'Fragment.Surface',
  noScalarOverrideFS: 'Fragment.NoScalarOverride',

  // instancing
  instancing: 'Instancing.Transform',

  // rounded points
  pointSizeBiasVS: 'PointDisk.Vertex.PointSizeBias',
  noPointSizeBiasVS: 'PointDisk.Vertex.None',
  diskSampleMaskFS: 'PointDisk.Fragment.SampleMask',
  noDiskSampleMaskFS: 'PointDisk.Fragment.None',
})

function _Tokens(n: number): TfToken[] {
  return Array.from({ length: n }, () => TfToken())
}

/** pointsShaderKey.h:20-40 */
export class HdSt_PointsShaderKey extends HdSt_ShaderKey {
  glslfx: TfToken
  VS: TfToken[] = _Tokens(7)
  FS: TfToken[] = _Tokens(7)

  /** pointsShaderKey.cpp:41-63 */
  constructor(nativeRoundPoints: boolean) {
    super()
    this.glslfx = _tokens.baseGLSLFX
    const VS = this.VS, FS = this.FS
    VS[0] = _tokens.instancing
    VS[1] = nativeRoundPoints ? _tokens.noPointSizeBiasVS :
      _tokens.pointSizeBiasVS
    VS[2] = _tokens.mainVS
    VS[3] = _tokens.pointIdVS
    VS[4] = _tokens.pointIdSelDecodeUtilsVS
    VS[5] = _tokens.pointIdSelPointSelVS
    VS[6] = TfToken()

    // Common must be first as it defines terminal interfaces
    FS[0] = _tokens.commonFS
    FS[1] = _tokens.surfaceFS
    FS[2] = _tokens.noScalarOverrideFS
    FS[3] = nativeRoundPoints ? _tokens.noDiskSampleMaskFS :
      _tokens.diskSampleMaskFS
    FS[4] = _tokens.mainFS
    FS[5] = _tokens.pointIdFS
    FS[6] = TfToken()
  }

  /** pointsShaderKey.h:27-29 */
  override getGlslfxFilename(): TfToken { return this.glslfx }
  override getVS(): readonly TfToken[] { return this.VS }
  // Skip TCS, TES and GS stages
  override getFS(): readonly TfToken[] { return this.FS }

  /** pointsShaderKey.h:32-34 */
  override getPrimitiveType(): HdSt_GeometricShaderPrimitiveType {
    return HdSt_GeometricShaderPrimitiveType.PRIM_POINTS
  }
}
