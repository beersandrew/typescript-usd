// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/graphicsCmdsDesc.cpp,
//  pxr/imaging/hgi/graphicsCmdsDesc.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/graphicsCmdsDesc.{h,cpp} (OpenUSD 26.11.1).

import {
  HgiAttachmentDesc,
  HgiAttachmentDescVectorEquals,
  type HgiAttachmentDescVector,
} from './attachmentDesc.ts'
import { HgiHandle, HgiHandleVectorEquals } from './handle.ts'
import type { HgiTextureHandle, HgiTextureHandleVector } from './texture.ts'

/** graphicsCmdsDesc.h:44-67 */
export class HgiGraphicsCmdsDesc {
  colorAttachmentDescs: HgiAttachmentDescVector = []
  depthAttachmentDesc = new HgiAttachmentDesc()

  colorTextures: HgiTextureHandleVector = []
  colorResolveTextures: HgiTextureHandleVector = []

  depthTexture: HgiTextureHandle = new HgiHandle()
  depthResolveTexture: HgiTextureHandle = new HgiHandle()

  /** graphicsCmdsDesc.h:55-57 */
  hasAttachments(): boolean {
    return this.colorAttachmentDescs.length > 0 || this.depthTexture.isSet()
  }

  /** operator== (graphicsCmdsDesc.cpp:13-23) */
  equals(rhs: HgiGraphicsCmdsDesc): boolean {
    return this.depthAttachmentDesc.equals(rhs.depthAttachmentDesc) &&
      HgiAttachmentDescVectorEquals(this.colorAttachmentDescs, rhs.colorAttachmentDescs) &&
      this.depthTexture.equals(rhs.depthTexture) &&
      this.depthResolveTexture.equals(rhs.depthResolveTexture) &&
      HgiHandleVectorEquals(this.colorTextures, rhs.colorTextures) &&
      HgiHandleVectorEquals(this.colorResolveTextures, rhs.colorResolveTextures)
  }

  /** operator<< (graphicsCmdsDesc.cpp:32-64) */
  toString(): string {
    let out = 'HgiGraphicsCmdsDesc: {'

    for (const a of this.colorAttachmentDescs) {
      out += a.toString()
    }

    for (let i = 0; i < this.colorTextures.length; i++) {
      out += 'colorTexture' + i + ' '
      out += 'dimensions:' +
        this.colorTextures[i]!.Get()!.getDescriptor().dimensions.toString() + ', '
    }

    for (let i = 0; i < this.colorResolveTextures.length; i++) {
      out += 'colorResolveTexture' + i + ', '
    }

    if (this.depthTexture.isSet()) {
      out += this.depthAttachmentDesc.toString()
      out += 'depthTexture '
      out += 'dimensions:' + this.depthTexture.Get()!.getDescriptor().dimensions.toString()
    }

    if (this.depthResolveTexture.isSet()) {
      out += 'depthResolveTexture'
    }

    out += '}'
    return out
  }
}
