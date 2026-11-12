// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/ptexTextureObject.cpp,
//  pxr/imaging/hdSt/ptexTextureObject.h,
//  pxr/imaging/hdSt/ptexMipmapTextureLoader.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/ptexTextureObject.{h,cpp} (OpenUSD 26.11.1)
// as built without PXR_PTEX_SUPPORT_ENABLED: HdStIsSupportedPtexTexture is
// false and the object commits the 1x1 fallback textures.
//
// FAITHFULNESS-DEBT(hdst-ptex): the Ptex reading path
// (ptexTextureObject.cpp:91-223, ptexMipmapTextureLoader.cpp) needs the Ptex
// library, which has no port here.

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import {
  HgiFormat,
  HgiTextureDesc,
  HgiTextureType,
  HgiTextureUsageBits,
  type HgiTextureHandle,
} from 'typescript-usd/hgi'
import { HdStTextureType } from './enums.ts'
import type { HdStTextureIdentifier } from './textureIdentifier.ts'
import { HdStTextureObject } from './textureObject.ts'
import type { HdSt_TextureObjectRegistry } from './textureObjectRegistry.ts'
import { HdStTextureUtils } from './textureUtils.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** ptexTextureObject.cpp:44-52. Returns true if the file given by
 *  `imageFilePath` represents a ptex file; always false without Ptex
 *  support. */
export function HdStIsSupportedPtexTexture(_imageFilePath: string): boolean {
  return false
}

/** ptexTextureObject.h:39-93. A Ptex texture. */
export class HdStPtexTextureObject extends HdStTextureObject {
  private _format: HgiFormat = HgiFormat.HgiFormatInvalid
  private _texelTexture: HgiTextureHandle = HdStTextureUtils._emptyTextureHandle()
  private _layoutTexture: HgiTextureHandle = HdStTextureUtils._emptyTextureHandle()

  /** ptexTextureObject.cpp:58-69 */
  constructor(
    textureId: HdStTextureIdentifier,
    textureObjectRegistry: HdSt_TextureObjectRegistry,
  ) {
    super(textureId, textureObjectRegistry)
  }

  /** ptexTextureObject.cpp:71-74 (destructor). */
  override _destroy(): void {
    this._destroyTextures()
  }

  /** ptexTextureObject.cpp:76-87 */
  private _destroyTextures(): void {
    const hgi = this._getHgi()
    if (hgi) {
      if (this._texelTexture.isSet()) {
        hgi.destroyTexture(this._texelTexture)
      }
      if (this._layoutTexture.isSet()) {
        hgi.destroyTexture(this._layoutTexture)
      }
    }
  }

  /** ptexTextureObject.h:50-55. Get the GPU texture handle for the texels.
   *  Only valid after commit phase. */
  getTexelTexture(): HgiTextureHandle { return this._texelTexture }

  /** ptexTextureObject.h:57-62. Get the GPU texture handle for the layout.
   *  Only valid after commit phase. */
  getLayoutTexture(): HgiTextureHandle { return this._layoutTexture }

  /** ptexTextureObject.cpp:105-111 (the build without Ptex support). */
  _load(): void {
    this._destroyTextures()
    this._format = HgiFormat.HgiFormatInvalid
  }

  /** ptexTextureObject.cpp:227-318 */
  _commit(): void {
    const hgi = this._getHgi()
    if (!TF_VERIFY(hgi)) {
      return
    }

    this._destroyTextures()

    if (this._format === HgiFormat.HgiFormatInvalid) {
      // Create 1x1x1 black fallback texture.
      const texDesc = new HgiTextureDesc()
      texDesc.debugName = 'PtexTextureFallback'
      texDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
      texDesc.format = HgiFormat.HgiFormatUNorm8Vec4
      texDesc.type = HgiTextureType.HgiTextureType2DArray
      texDesc.dimensions = new GfVec3i(1, 1, 1)
      texDesc.layerCount = 1
      texDesc.mipLevels = 1
      texDesc.pixelsByteSize = 4
      texDesc.initialData = new Uint8Array([0, 0, 0, 255])
      this._texelTexture = hgi!.createTexture(texDesc)

      const layoutTexDesc = new HgiTextureDesc()
      layoutTexDesc.debugName = 'PtexLayoutTextureFallback'
      layoutTexDesc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
      layoutTexDesc.type = HgiTextureType.HgiTextureType1DArray
      layoutTexDesc.dimensions = new GfVec3i(1, 1, 1)
      layoutTexDesc.format = HgiFormat.HgiFormatUInt16Vec2
      layoutTexDesc.layerCount = 1
      layoutTexDesc.mipLevels = 1
      layoutTexDesc.pixelsByteSize = 4
      layoutTexDesc.initialData = new Uint16Array([0, 0])
      this._layoutTexture = hgi!.createTexture(layoutTexDesc)
    }
  }

  /** ptexTextureObject.cpp:320-324 */
  isValid(): boolean {
    return this._format !== HgiFormat.HgiFormatInvalid
  }

  /** ptexTextureObject.cpp:326-330 */
  getTextureType(): HdStTextureType {
    return HdStTextureType.Ptex
  }

  /** ptexTextureObject.cpp:332-339 */
  getCommittedSize(): number {
    return 4 + 2 * 2
  }
}
