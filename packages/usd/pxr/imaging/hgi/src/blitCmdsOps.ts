// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/blitCmdsOps.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/blitCmdsOps.h (OpenUSD 26.11.1).
//
// `void*` / `void const*` CPU pointers are typed arrays or ArrayBuffers
// (HgiCpuData); byte offsets into them are kept as separate fields as
// upstream does.

import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import type { HgiBufferHandle, HgiCpuData } from './buffer.ts'
import { HgiHandle } from './handle.ts'
import type { HgiTextureHandle } from './texture.ts'

/** blitCmdsOps.h:50-67 */
export class HgiTextureGpuToCpuOp {
  gpuSourceTexture: HgiTextureHandle = new HgiHandle()
  sourceTexelOffset: GfVec3i = new GfVec3i(0, 0, 0)
  mipLevel = 0
  cpuDestinationBuffer: HgiCpuData | null = null
  destinationByteOffset = 0
  destinationBufferByteSize = 0
}

/** blitCmdsOps.h:93-108 */
export class HgiTextureCpuToGpuOp {
  cpuSourceBuffer: HgiCpuData | null = null
  bufferByteSize = 0
  destinationTexelOffset: GfVec3i = new GfVec3i(0, 0, 0)
  mipLevel = 0
  gpuDestinationTexture: HgiTextureHandle = new HgiHandle()
}

/** blitCmdsOps.h:133-148 */
export class HgiBufferGpuToGpuOp {
  gpuSourceBuffer: HgiBufferHandle = new HgiHandle()
  sourceByteOffset = 0
  byteSize = 0
  gpuDestinationBuffer: HgiBufferHandle = new HgiHandle()
  destinationByteOffset = 0
}

/** blitCmdsOps.h:173-188 */
export class HgiBufferCpuToGpuOp {
  cpuSourceBuffer: HgiCpuData | null = null
  sourceByteOffset = 0
  gpuDestinationBuffer: HgiBufferHandle = new HgiHandle()
  destinationByteOffset = 0
  byteSize = 0
}

/** blitCmdsOps.h:213-228 */
export class HgiBufferGpuToCpuOp {
  gpuSourceBuffer: HgiBufferHandle = new HgiHandle()
  sourceByteOffset = 0
  byteSize = 0
  cpuDestinationBuffer: HgiCpuData | null = null
  destinationByteOffset = 0
}

/** blitCmdsOps.h:253-270 */
export class HgiTextureToBufferOp {
  gpuSourceTexture: HgiTextureHandle = new HgiHandle()
  sourceTexelOffset: GfVec3i = new GfVec3i(0, 0, 0)
  mipLevel = 0
  gpuDestinationBuffer: HgiBufferHandle = new HgiHandle()
  destinationByteOffset = 0
  byteSize = 0
}

/** blitCmdsOps.h:297-315 */
export class HgiBufferToTextureOp {
  gpuSourceBuffer: HgiBufferHandle = new HgiHandle()
  sourceByteOffset = 0
  gpuDestinationTexture: HgiTextureHandle = new HgiHandle()
  destinationTexelOffset: GfVec3i = new GfVec3i(0, 0, 0)
  mipLevel = 0
  byteSize = 0
}
