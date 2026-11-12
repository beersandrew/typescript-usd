// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/glslfxShader.cpp,
//  pxr/imaging/hdSt/glslfxShader.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/glslfxShader.{h,cpp} (OpenUSD 26.11.1).

import { ShaderTokens as HdShaderTokens } from 'typescript-usd/hd'
import { HioGlslfx } from 'typescript-usd/hio'
import { HdSt_MaterialNetworkShader } from './materialNetworkShader.ts'

/** glslfxShader.h:22-41. A simple specialization of HdSt_MaterialNetworkShader
 *  used to load the built-in fallback material network. */
export class HdStGLSLFXShader extends HdSt_MaterialNetworkShader {
  private _glslfx: HioGlslfx

  /** glslfxShader.cpp:15-22 */
  constructor(glslfx: HioGlslfx) {
    super()
    this._glslfx = glslfx
    this._setSource(HdShaderTokens.fragmentShader, this._glslfx.getSurfaceSource())
    this._setSource(HdShaderTokens.displacementShader,
      this._glslfx.getDisplacementSource())
  }

  /** glslfxShader.cpp:28-40. If the prim is based on asset, reload that
   *  asset. */
  override reload(): void {
    const newGlslFx = new HioGlslfx(this._glslfx.getFilePath())
    if (newGlslFx.isValid()) {
      this._glslfx = newGlslFx
      this._setSource(HdShaderTokens.fragmentShader, this._glslfx.getSurfaceSource())
      this._setSource(HdShaderTokens.displacementShader,
        this._glslfx.getDisplacementSource())
    }
  }
}
