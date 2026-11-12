// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/blitCmds.cpp,
//  pxr/imaging/hgi/blitCmds.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/blitCmds.{h,cpp} (OpenUSD 26.11.1).

import type { Vec4f as GfVec4f } from 'typescript-usd/gf'
import { HgiCmds } from './cmds.ts'
import type { HgiMemoryBarrier } from './enums.ts'
import type { HgiBufferHandle } from './buffer.ts'
import type { HgiTextureHandle } from './texture.ts'
import type {
  HgiBufferCpuToGpuOp,
  HgiBufferGpuToCpuOp,
  HgiBufferGpuToGpuOp,
  HgiBufferToTextureOp,
  HgiTextureCpuToGpuOp,
  HgiTextureGpuToCpuOp,
  HgiTextureToBufferOp,
} from './blitCmdsOps.ts'

/** blitCmds.h:37-111. A graphics API independent abstraction of resource
 *  copy commands. */
export abstract class HgiBlitCmds extends HgiCmds {
  /** blitCmds.cpp:12 */
  protected constructor() {
    super()
  }

  /** blitCmds.h:45-46 */
  abstract pushDebugGroup(label: string, color?: GfVec4f): void
  /** blitCmds.h:50 */
  abstract popDebugGroup(): void
  /** blitCmds.h:54-56 */
  abstract insertDebugMarker(label: string, color?: GfVec4f): void
  /** blitCmds.h:62 */
  abstract copyTextureGpuToCpu(copyOp: HgiTextureGpuToCpuOp): void
  /** blitCmds.h:66 */
  abstract copyTextureCpuToGpu(copyOp: HgiTextureCpuToGpuOp): void
  /** blitCmds.h:70 */
  abstract copyBufferGpuToGpu(copyOp: HgiBufferGpuToGpuOp): void
  /** blitCmds.h:75 */
  abstract copyBufferCpuToGpu(copyOp: HgiBufferCpuToGpuOp): void
  /** blitCmds.h:81 */
  abstract copyBufferGpuToCpu(copyOp: HgiBufferGpuToCpuOp): void
  /** blitCmds.h:85 */
  abstract copyTextureToBuffer(copyOp: HgiTextureToBufferOp): void
  /** blitCmds.h:89 */
  abstract copyBufferToTexture(copyOp: HgiBufferToTextureOp): void
  /** blitCmds.h:93 */
  abstract generateMipMaps(texture: HgiTextureHandle): void
  /** blitCmds.h:97 */
  abstract fillBuffer(buffer: HgiBufferHandle, value: number): void
  /** blitCmds.h:102 */
  abstract insertMemoryBarrier(barrier: HgiMemoryBarrier): void
}

/** blitCmds.h:28 */
export type HgiBlitCmdsUniquePtr = HgiBlitCmds
