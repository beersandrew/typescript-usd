// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/dynamicUvTextureObject.cpp,
//  pxr/imaging/hdSt/dynamicUvTextureObject.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/dynamicUvTextureObject.{h,cpp}
// (OpenUSD 26.11.1).

import type { Wrap as HdWrap } from 'typescript-usd/hd'
import type { HgiTextureDesc } from 'typescript-usd/hgi'
import type { HdStDynamicUvTextureImplementation } from './dynamicUvTextureImplementation.ts'
import { HdStTextureType } from './enums.ts'
import {
  HdStDynamicCubemapSubtextureIdentifier,
  HdStDynamicUvSubtextureIdentifier,
  type HdStSubtextureIdentifier,
} from './subtextureIdentifier.ts'
import type { HdStTextureCpuData } from './textureCpuData.ts'
import type { HdStTextureIdentifier } from './textureIdentifier.ts'
import { HdStUvTextureObject } from './textureObject.ts'
import type { HdSt_TextureObjectRegistry } from './textureObjectRegistry.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'

/** dynamicUvTextureObject.cpp:28-41 _GetImplFromSubId<SubIdType> */
function _GetImplFromSubId(
  baseSubId: HdStSubtextureIdentifier | null,
  type: typeof HdStDynamicUvSubtextureIdentifier | typeof HdStDynamicCubemapSubtextureIdentifier,
): HdStDynamicUvTextureImplementation | null {
  const subId = baseSubId instanceof type ? baseSubId : null
  if (!TF_VERIFY(subId)) {
    return null
  }
  return subId!.getTextureImplementation()
}

/** dynamicUvTextureObject.h:22-109. A uv texture that is managed but not
 *  populated by the Storm texture system.
 *
 *  Clients can allocate an instance of this class through
 *  HdStResourceRegistry::AllocateTextureHandle or AllocateTextureObject by
 *  passing an HdStTextureIdentifier with a HdStDynamicUvSubtextureIdentifier.
 *
 *  The client can allocate the GPU resource with CreateTexture and populate
 *  it by either giving data in the HgiTextureDesc or binding the texture as
 *  target for a computation or render. */
export class HdStDynamicUvTextureObject extends HdStUvTextureObject {
  /** dynamicUvTextureObject.cpp:16-21 */
  constructor(
    textureId: HdStTextureIdentifier,
    textureObjectRegistry: HdSt_TextureObjectRegistry,
  ) {
    super(textureId, textureObjectRegistry)
  }

  /** dynamicUvTextureObject.h:47-52. Allocate GPU resource using the
   *  texture descriptor. Populate if data are given in the descriptor. */
  createTexture(desc: HgiTextureDesc): void {
    this._CreateTexture(desc)
  }

  /** dynamicUvTextureObject.h:54-60. Make GPU generate mipmaps. */
  generateMipmaps(): void {
    this._GenerateMipmaps()
  }

  /** dynamicUvTextureObject.h:62-65. Release GPU resource. */
  destroyTexture(): void {
    this._destroyTexture()
  }

  /** dynamicUvTextureObject.h:67-75. Set wrap mode hints used when a
   *  texture node's wrap mode is use metadata. */
  setWrapParameters(wrapParameters: readonly [HdWrap, HdWrap]): void {
    this._setWrapParameters(wrapParameters)
  }

  /** dynamicUvTextureObject.h:77-86. Save CPU data for this texture. To
   *  free the CPU data, call with null. */
  setCpuData(cpuData: HdStTextureCpuData | null): void {
    this._setCpuData(cpuData)
  }

  /** dynamicUvTextureObject.h:88-94. Get the CPU data stored for this
   *  texture. */
  getCpuData(): HdStTextureCpuData | null {
    return this._getCpuData()
  }

  /** dynamicUvTextureObject.cpp:43-53 */
  private _getImpl(): HdStDynamicUvTextureImplementation | null {
    const subId = this.GetTextureIdentifier().getSubtextureIdentifier()
    if (this.getTextureType() === HdStTextureType.Uv) {
      return _GetImplFromSubId(subId, HdStDynamicUvSubtextureIdentifier)
    } else {
      return _GetImplFromSubId(subId, HdStDynamicCubemapSubtextureIdentifier)
    }
  }

  /** dynamicUvTextureObject.cpp:55-62. Always returns true - so that
   *  samplers for this texture are created - unless the implementation
   *  says otherwise. */
  isValid(): boolean {
    const impl = this._getImpl()
    if (impl) {
      return impl.isValid(this)
    }
    return true
  }

  /** dynamicUvTextureObject.cpp:64-70 */
  _load(): void | Promise<void> {
    const impl = this._getImpl()
    if (impl) {
      return impl.Load(this)
    }
  }

  /** dynamicUvTextureObject.cpp:72-78 */
  _commit(): void {
    const impl = this._getImpl()
    if (impl) {
      impl.commit(this)
    }
  }
}
