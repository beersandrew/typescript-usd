// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/fallbackLightingShader.cpp,
//  pxr/imaging/hdSt/fallbackLightingShader.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/fallbackLightingShader.{h,cpp} (OpenUSD 26.11.1).
//
// Divergence: ID is a bigint (TfHash of the glslfx file token); a cache key
// only.

import { Token as TfToken, Hash as TfHash } from 'typescript-usd/tf'
import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { HioGlslfx } from 'typescript-usd/hio'
import type { HdStBindingRequest } from './binding.ts'
import { HdStLightingShader } from './lightingShader.ts'
import { HdStPackageFallbackLightingShader } from './package.ts'
import type { HdSt_ResourceBinder } from './resourceBinder.ts'
import type { HdStShaderCodeID } from './shaderCode.ts'

/** fallbackLightingShader.h:22-56. A shader that provides fallback
 *  lighting behavior. */
export class HdSt_FallbackLightingShader extends HdStLightingShader {
  private _glslfx: HioGlslfx

  /** fallbackLightingShader.cpp:20-23 */
  constructor() {
    super()
    this._glslfx = new HioGlslfx(HdStPackageFallbackLightingShader())
  }

  /** fallbackLightingShader.cpp:30-38 */
  override computeHash(): HdStShaderCodeID {
    const glslfxFile = HdStPackageFallbackLightingShader()

    const hash = TfHash(glslfxFile)

    return hash
  }

  /** fallbackLightingShader.cpp:40-48 */
  override getSource(shaderStageKey: TfToken): string {
    return this._glslfx.getSource(shaderStageKey)
  }

  /** fallbackLightingShader.cpp:50-56 */
  override setCamera(_worldToViewMatrix: GfMatrix4d,
    _projectionMatrix: GfMatrix4d): void {
    // nothing
  }

  /** fallbackLightingShader.cpp:58-63 */
  override bindResources(_program: number, _binder: HdSt_ResourceBinder): void {
    // nothing
  }

  /** fallbackLightingShader.cpp:65-70 */
  override unbindResources(_program: number, _binder: HdSt_ResourceBinder): void {
    // nothing
  }

  /** fallbackLightingShader.cpp:72-78 */
  override addBindings(_customBindings: HdStBindingRequest[]): void {
    // no-op
  }
}
