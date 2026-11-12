// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderPassShaderKey.cpp,
//  pxr/imaging/hdSt/renderPassShaderKey.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/renderPassShaderKey.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: the fixed-size mixin arrays are arrays of the same length
// filled with empty tokens, as C++ default-constructs them.

import { Token as TfToken, MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import { AovTokens as HdAovTokens, type RenderPassAovBinding as HdRenderPassAovBinding } from 'typescript-usd/hd'
import { HdSt_GeometricShaderPrimitiveType } from './geometricShader.ts'
import { HdSt_ShaderKey } from './shaderKey.ts'

/** renderPassShaderKey.cpp:14-41 */
const _tokens = TfMakeTokens({
  // Glslfx files to include
  renderPassGlslfx: 'renderPass.glslfx',
  selectionGlslfx: 'selection.glslfx',

  // render pass mixins
  renderPassCamera: 'RenderPass.Camera',
  renderPassCameraFS: 'RenderPass.CameraFS',
  renderPassApplyClipPlanes: 'RenderPass.ApplyClipPlanes',
  renderPassApplyColorOverrides: 'RenderPass.ApplyColorOverrides',
  renderPassRenderOutput: 'RenderPass.RenderOutput',
  renderPassNoSelection: 'RenderPass.NoSelection',
  renderPassNoColorOverrides: 'RenderPass.NoColorOverrides',

  // selection mixins
  selectionDecodeUtils: 'Selection.DecodeUtils',
  selectionComputeColor: 'Selection.ComputeColor',

  // Render AOV outputs mixins
  renderPassRenderColor: 'RenderPass.RenderColor',
  renderPassRenderColorNoOp: 'RenderPass.RenderColorNoOp',

  renderPassRenderId: 'RenderPass.RenderId',
  renderPassRenderIdNoOp: 'RenderPass.RenderIdNoOp',

  renderPassRenderNeye: 'RenderPass.RenderNeye',
  renderPassRenderNeyeNoOp: 'RenderPass.RenderNeyeNoOp',
})

/** renderPassShaderKey.cpp:43-49 */
function _AovHasIdSemantic(name: TfToken): boolean {
  // For now id render only means primId or instanceId.
  return name === HdAovTokens.primId ||
    name === HdAovTokens.instanceId
}

function _Tokens(n: number): TfToken[] {
  return Array.from({ length: n }, () => TfToken())
}

/** renderPassShaderKey.h:18-50 */
export class HdSt_RenderPassShaderKey extends HdSt_ShaderKey {
  glslfx: TfToken
  VS: TfToken[] = _Tokens(3)
  PTCS: TfToken[] = _Tokens(2)
  PTVS: TfToken[] = _Tokens(3)
  TCS: TfToken[] = _Tokens(2)
  TES: TfToken[] = _Tokens(3)
  GS: TfToken[] = _Tokens(3)
  FS: TfToken[] = _Tokens(10)

  /** renderPassShaderKey.cpp:51-126 */
  constructor(aovBindings: readonly HdRenderPassAovBinding[]) {
    super()
    this.glslfx = _tokens.renderPassGlslfx
    const { VS, PTCS, PTVS, TCS, TES, GS, FS } = this

    let renderColor = false
    let renderId = false
    let renderNeye = false

    for (let i = 0; i < aovBindings.length; ++i) {
      if (!renderColor && aovBindings[i]!.aovName === HdAovTokens.color) {
        renderColor = true
      }
      if (!renderId && _AovHasIdSemantic(aovBindings[i]!.aovName as TfToken)) {
        renderId = true
      }
      if (!renderNeye && aovBindings[i]!.aovName === HdAovTokens.Neye) {
        renderNeye = true
      }
    }

    VS[0] = _tokens.renderPassCamera
    VS[1] = _tokens.renderPassApplyClipPlanes
    VS[2] = TfToken()

    PTCS[0] = _tokens.renderPassCamera
    PTCS[1] = TfToken()

    PTVS[0] = _tokens.renderPassCamera
    PTVS[1] = _tokens.renderPassApplyClipPlanes
    PTVS[2] = TfToken()

    TCS[0] = _tokens.renderPassCamera
    TCS[1] = TfToken()

    TES[0] = _tokens.renderPassCamera
    TES[1] = _tokens.renderPassApplyClipPlanes
    TES[2] = TfToken()

    GS[0] = _tokens.renderPassCamera
    GS[1] = _tokens.renderPassApplyClipPlanes
    GS[2] = TfToken()

    let fsIndex = 0
    FS[fsIndex++] = _tokens.renderPassCamera
    FS[fsIndex++] = _tokens.renderPassCameraFS

    if (renderColor) {
      FS[fsIndex++] = _tokens.selectionDecodeUtils
      FS[fsIndex++] = _tokens.selectionComputeColor
      FS[fsIndex++] = _tokens.renderPassApplyColorOverrides
      FS[fsIndex++] = _tokens.renderPassRenderColor
    } else {
      FS[fsIndex++] = _tokens.renderPassNoSelection
      FS[fsIndex++] = _tokens.renderPassNoColorOverrides
      FS[fsIndex++] = _tokens.renderPassRenderColorNoOp
    }

    if (renderId) {
      FS[fsIndex++] = _tokens.renderPassRenderId
    } else {
      FS[fsIndex++] = _tokens.renderPassRenderIdNoOp
    }

    if (renderNeye) {
      FS[fsIndex++] = _tokens.renderPassRenderNeye
    } else {
      FS[fsIndex++] = _tokens.renderPassRenderNeyeNoOp
    }

    FS[fsIndex++] = _tokens.renderPassRenderOutput
    FS[fsIndex++] = TfToken()
  }

  /** renderPassShaderKey.h:25-31 */
  override getGlslfxFilename(): TfToken { return this.glslfx }
  override getVS(): readonly TfToken[] { return this.VS }
  override getPTCS(): readonly TfToken[] { return this.PTCS }
  override getPTVS(): readonly TfToken[] { return this.PTVS }
  override getTCS(): readonly TfToken[] { return this.TCS }
  override getTES(): readonly TfToken[] { return this.TES }
  override getGS(): readonly TfToken[] { return this.GS }
  override getFS(): readonly TfToken[] { return this.FS }

  /** renderPassShaderKey.cpp:130-158 */
  override getGlslfxString(): string {
    let ss = ''

    ss += '-- glslfx version 0.1\n'

    if (this.getGlslfxFilename().length !== 0) {
      ss += '#import $TOOLS/hdSt/shaders/' +
        this.getGlslfxFilename() + '\n'
    }
    // Additionally need one more import.
    ss += '#import $TOOLS/hdx/shaders/' + _tokens.selectionGlslfx + '\n'

    ss += '-- configuration\n' +
      '{"techniques": {"default": {\n'

    const firstStage = { value: true }
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

  /** renderPassShaderKey.h:35-38. Unused for HdSt_RenderPassShaderKey. */
  override getPrimitiveType(): HdSt_GeometricShaderPrimitiveType {
    return HdSt_GeometricShaderPrimitiveType.PRIM_POINTS
  }
}
