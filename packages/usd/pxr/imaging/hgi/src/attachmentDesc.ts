// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/attachmentDesc.cpp,
//  pxr/imaging/hgi/attachmentDesc.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/attachmentDesc.{h,cpp} (OpenUSD 26.11.1).

import { Vec4f as GfVec4f } from 'typescript-usd/gf'
import {
  HgiAttachmentLoadOp,
  HgiAttachmentStoreOp,
  HgiBlendFactor,
  HgiBlendOp,
  HgiColorMaskBits,
  type HgiColorMask,
  type HgiTextureUsage,
} from './enums.ts'
import { HgiFormat } from './types.ts'

/** attachmentDesc.h:48-82 */
export class HgiAttachmentDesc {
  format: HgiFormat = HgiFormat.HgiFormatInvalid
  usage: HgiTextureUsage = 0
  loadOp: HgiAttachmentLoadOp = HgiAttachmentLoadOp.HgiAttachmentLoadOpLoad
  storeOp: HgiAttachmentStoreOp = HgiAttachmentStoreOp.HgiAttachmentStoreOpStore
  clearValue: GfVec4f = new GfVec4f(0, 0, 0, 0)
  colorMask: HgiColorMask = HgiColorMaskBits.HgiColorMaskRed |
    HgiColorMaskBits.HgiColorMaskGreen |
    HgiColorMaskBits.HgiColorMaskBlue |
    HgiColorMaskBits.HgiColorMaskAlpha
  blendEnabled = false
  srcColorBlendFactor: HgiBlendFactor = HgiBlendFactor.HgiBlendFactorZero
  dstColorBlendFactor: HgiBlendFactor = HgiBlendFactor.HgiBlendFactorZero
  colorBlendOp: HgiBlendOp = HgiBlendOp.HgiBlendOpAdd
  srcAlphaBlendFactor: HgiBlendFactor = HgiBlendFactor.HgiBlendFactorZero
  dstAlphaBlendFactor: HgiBlendFactor = HgiBlendFactor.HgiBlendFactorZero
  alphaBlendOp: HgiBlendOp = HgiBlendOp.HgiBlendOpAdd
  blendConstantColor: GfVec4f = new GfVec4f(0, 0, 0, 0)

  /** Copy (C++ copy construction / assignment). */
  clone(): HgiAttachmentDesc {
    const c = Object.assign(new HgiAttachmentDesc(), this)
    c.clearValue = new GfVec4f(this.clearValue)
    c.blendConstantColor = new GfVec4f(this.blendConstantColor)
    return c
  }

  /** operator== (attachmentDesc.cpp:13-31) */
  equals(rhs: HgiAttachmentDesc): boolean {
    const lhs = this
    return lhs.format === rhs.format &&
      lhs.usage === rhs.usage &&
      lhs.clearValue.equals(rhs.clearValue) &&
      lhs.colorMask === rhs.colorMask &&
      lhs.loadOp === rhs.loadOp &&
      lhs.storeOp === rhs.storeOp &&
      lhs.blendEnabled === rhs.blendEnabled &&
      lhs.srcColorBlendFactor === rhs.srcColorBlendFactor &&
      lhs.dstColorBlendFactor === rhs.dstColorBlendFactor &&
      lhs.colorBlendOp === rhs.colorBlendOp &&
      lhs.srcAlphaBlendFactor === rhs.srcAlphaBlendFactor &&
      lhs.dstAlphaBlendFactor === rhs.dstAlphaBlendFactor &&
      lhs.alphaBlendOp === rhs.alphaBlendOp &&
      lhs.blendConstantColor.equals(rhs.blendConstantColor)
  }

  /** operator<< (attachmentDesc.cpp:40-61). Enums stream as their integer
   *  values and bool as 0/1, as std::ostream does. */
  toString(): string {
    const b = (v: boolean) => (v ? 1 : 0)
    return 'HgiAttachmentDesc: {' +
      'format: ' + this.format + ', ' +
      'usage: ' + this.usage + ', ' +
      'clearValue: ' + this.clearValue.toString() + ', ' +
      'colorMask: ' + this.colorMask + ', ' +
      'loadOp: ' + this.loadOp + ', ' +
      'storeOp: ' + this.storeOp + ', ' +
      'blendEnabled: ' + b(this.blendEnabled) + ', ' +
      'srcColorBlendFactor: ' + this.srcColorBlendFactor + ', ' +
      'dstColorBlendFactor: ' + this.dstColorBlendFactor + ', ' +
      'colorBlendOp: ' + this.colorBlendOp + ', ' +
      'srcAlphaBlendFactor: ' + this.srcAlphaBlendFactor + ', ' +
      'dstAlphaBlendFactor: ' + this.dstAlphaBlendFactor + ', ' +
      'alphaBlendOp: ' + this.alphaBlendOp + ', ' +
      'blendConstantColor: ' + this.blendConstantColor.toString() +
      '}'
  }
}

/** attachmentDesc.h:84 */
export type HgiAttachmentDescVector = HgiAttachmentDesc[]

/** operator== of two HgiAttachmentDescVectors. */
export function HgiAttachmentDescVectorEquals(
  lhs: readonly HgiAttachmentDesc[],
  rhs: readonly HgiAttachmentDesc[],
): boolean {
  return lhs.length === rhs.length && lhs.every((a, i) => a.equals(rhs[i]!))
}
