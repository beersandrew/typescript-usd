// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/shaderKey.cpp,
//  pxr/imaging/hdSt/shaderKey.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/shaderKey.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - The mixin getters (GetVS() ...) return the key's token array (terminated
//   by an empty token, as upstream's fixed arrays are) or null where upstream
//   returns nullptr.
// - ID is a bigint (TfHash). The hash is a cache key only (deduplication in
//   the resource registry).

import { Token as TfToken, HashCombine as TfHashCombine, Hash as TfHash } from 'typescript-usd/tf'
import { CullStyle as HdCullStyle, PolygonMode as HdPolygonMode } from 'typescript-usd/hd'
import {
  HdSt_GeometricShaderFvarPatchType,
  type HdSt_GeometricShaderPrimitiveType,
} from './geometricShader.ts'

/** shaderKey.h:21-117 */
export abstract class HdSt_ShaderKey {
  /** shaderKey.cpp:22-99. The hash computed identifies each geometric shader
   *  instance, and is used for deduplication in the resource registry. */
  computeHash(): bigint {
    let hash = TfHash(this.getGlslfxFilename())

    const stages = [
      this.getVS(), this.getTCS(), this.getTES(), this.getPTCS(),
      this.getPTVS(), this.getGS(), this.getFS(), this.getCS(),
    ]
    for (const tokens of stages) {
      let i = 0
      while (tokens && i < tokens.length && !(tokens[i]!.length === 0)) {
        hash = TfHashCombine(hash, TfHash(tokens[i]))
        ++i
      }
    }

    // During batching, we rely on geometric shader equality, and thus the
    // shaderKey hash factors the following state opinions besides the mixins
    // themselves.
    // Note that the GLSL programs still can be shared across GeometricShader
    // instances, when they are identical except the GL states, as long as
    // Hd_GeometricShader::ComputeHash() provides consistent hash values.
    hash = TfHashCombine(
      hash,
      this.getPrimitiveType(),
      this.getCullStyle(),
      this.UseHardwareFaceCulling(),
    )
    if (this.UseHardwareFaceCulling()) {
      hash = TfHashCombine(
        hash,
        this.HasMirroredTransform(),
        this.isDoubleSided(),
      )
    }
    hash = TfHashCombine(
      hash,
      this.getPolygonMode(),
      this.isFrustumCullingPass(),
      this.getLineWidth(),
      this.getFvarPatchType(),
    )

    return hash
  }

  // -------------------------------------------------------------------------
  // Virtual interface
  // -------------------------------------------------------------------------

  /** shaderKey.h:37. Return the name of the glslfx file that houses the entry
   *  point mixins that define the main() function for the relevant shader
   *  stages. */
  abstract getGlslfxFilename(): TfToken

  /** shaderKey.cpp:126-152. Stitches the glslfx filename and the shader stage
   *  mixin names into a string for consumption by HioGlslfx. */
  getGlslfxString(): string {
    let ss = ''

    ss += '-- glslfx version 0.1\n'

    if (this.getGlslfxFilename().length !== 0) {
      ss += '#import $TOOLS/hdSt/shaders/' +
        this.getGlslfxFilename() + '\n'
    }

    ss += '-- configuration\n' +
      '{"techniques": {"default": {\n'

    const firstStage = { value: true }
    ss += HdSt_ShaderKey._joinTokens('computeShader', this.getCS(), firstStage)
    ss += HdSt_ShaderKey._joinTokens('vertexShader', this.getVS(), firstStage)
    ss += HdSt_ShaderKey._joinTokens('tessControlShader', this.getTCS(), firstStage)
    ss += HdSt_ShaderKey._joinTokens('tessEvalShader', this.getTES(), firstStage)
    ss += HdSt_ShaderKey._joinTokens('postTessControlShader', this.getPTCS(), firstStage)
    ss += HdSt_ShaderKey._joinTokens('postTessVertexShader', this.getPTVS(), firstStage)
    ss += HdSt_ShaderKey._joinTokens('geometryShader', this.getGS(), firstStage)
    ss += HdSt_ShaderKey._joinTokens('fragmentShader', this.getFS(), firstStage)
    ss += '}}}\n'

    return ss
  }

  // Each shader stage specifies the various mixins to stitch together
  // via their token names. The Get* flavor of methods return the first
  // token in the array.

  /** shaderKey.cpp:154-159 */
  getVS(): readonly TfToken[] | null { return null }
  /** shaderKey.cpp:161-166 */
  getTCS(): readonly TfToken[] | null { return null }
  /** shaderKey.cpp:168-173 */
  getTES(): readonly TfToken[] | null { return null }
  /** shaderKey.cpp:175-180 */
  getPTCS(): readonly TfToken[] | null { return null }
  /** shaderKey.cpp:182-187 */
  getPTVS(): readonly TfToken[] | null { return null }
  /** shaderKey.cpp:189-194 */
  getGS(): readonly TfToken[] | null { return null }
  /** shaderKey.cpp:196-201 */
  getFS(): readonly TfToken[] | null { return null }
  /** shaderKey.cpp:203-208 */
  getCS(): readonly TfToken[] | null { return null }

  /** shaderKey.cpp:210-215. An implementation detail of code gen, which
   *  generates slightly different code for the VS stage for the frustum
   *  culling pass. */
  isFrustumCullingPass(): boolean {
    return false
  }

  /** shaderKey.h:68. Returns the geometric shader primitive type that is
   *  used in code gen and to figure out the primitive mode during draw
   *  submission. */
  abstract getPrimitiveType(): HdSt_GeometricShaderPrimitiveType

  // Implementation details of the geometric shader that sets hardware
  // pipeline state (cull face, polygon mode, line width) or queues upload of
  // data (cullstyle) to the GPU.

  /** shaderKey.cpp:217-222 */
  getCullStyle(): HdCullStyle {
    return HdCullStyle.HdCullStyleDontCare
  }

  /** shaderKey.cpp:224-229 */
  UseHardwareFaceCulling(): boolean {
    return false
  }

  /** shaderKey.cpp:231-236 */
  HasMirroredTransform(): boolean {
    return false
  }

  /** shaderKey.cpp:238-243 */
  isDoubleSided(): boolean {
    return false
  }

  /** shaderKey.cpp:245-250 */
  UseMetalTessellation(): boolean {
    return false
  }

  /** shaderKey.cpp:252-257 */
  getPolygonMode(): HdPolygonMode {
    return HdPolygonMode.HdPolygonModeFill
  }

  /** shaderKey.cpp:259-264 */
  getLineWidth(): number {
    return 0.0
  }

  /** shaderKey.cpp:266-271 */
  getVertexCountFallback(): number {
    return 0
  }

  /** shaderKey.cpp:273-278 */
  getDepthQualifier(): TfToken {
    return TfToken()
  }

  /** shaderKey.cpp:280-285. Returns whether hardware user-defined clip
   *  planes (gl_ClipDistance) handling should be enabled. */
  useHardwareClipPlanes(): boolean {
    return true
  }

  /** shaderKey.cpp:288-292. Returns the face-varying patch type used in code
   *  gen during creation of the face-varying primvar accessors. */
  getFvarPatchType(): HdSt_GeometricShaderFvarPatchType {
    return HdSt_GeometricShaderFvarPatchType.PATCH_NONE
  }

  /** shaderKey.cpp:101-124 */
  protected static _joinTokens(
    stage: string, tokens: readonly TfToken[] | null,
    firstStage: { value: boolean }): string {
    if ((!tokens) || tokens.length === 0 || tokens[0]!.length === 0) return ''

    let ss = ''

    if (firstStage.value === false) ss += ', '
    firstStage.value = false

    ss += '"' + stage + '" : { ' +
      '"source" : ['

    let first = true
    let i = 0
    while (i < tokens.length && tokens[i]!.length !== 0) {
      if (first === false) ss += ', '
      ss += '"' + tokens[i] + '"'
      ++i
      first = false
    }

    ss += '] }\n'
    return ss
  }
}
