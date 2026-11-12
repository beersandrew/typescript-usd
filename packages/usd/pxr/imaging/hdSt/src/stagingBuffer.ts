// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/stagingBuffer.cpp,
//  pxr/imaging/hdSt/stagingBuffer.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/stagingBuffer.{h,cpp} (OpenUSD 26.11.1).
//
// Collects CPU-to-GPU copies into one upload buffer and turns them into
// GPU-to-GPU copies on Flush.
//
// Divergences:
// - Recorded copy ops hold copies of the buffer handles (see bufferUtils.ts).
// - __ARCH_PRETTY_FUNCTION__ debug group labels are the upstream method name.

import {
  HgiBufferCpuToGpuOp,
  HgiBufferDesc,
  HgiBufferGpuToGpuOp,
  HgiBufferUsageBits,
  HgiDeviceCapabilitiesBits,
  HgiHandle,
  HgiMemoryBarrierBits,
  type HgiBufferHandle,
} from 'typescript-usd/hgi'
import { HdSt_CopyHandle, HdSt_CpuBytes } from './bufferUtils.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** stagingBuffer.h:64 */
const MULTIBUFFERING = 3

/** stagingBuffer.h:32-73 */
export class HdStStagingBuffer {
  private readonly _resourceRegistry: HdStResourceRegistry
  private readonly _handles: HgiBufferHandle[] = []
  private _gpuCopyOps: HgiBufferGpuToGpuOp[] = []
  private _head = 0
  private _capacity = 0
  private _activeSlot = 0
  private readonly _isUma: boolean

  /** stagingBuffer.cpp:16-24 */
  constructor(resourceRegistry: HdStResourceRegistry) {
    this._resourceRegistry = resourceRegistry
    for (let i = 0; i < MULTIBUFFERING; ++i) this._handles.push(new HgiHandle())
    this._isUma = resourceRegistry.getHgi().getCapabilities()?.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsUnifiedMemory) ?? false
  }

  /** stagingBuffer.cpp:26-29 (the destructor) */
  destroy(): void {
    this.deallocate()
  }

  /** stagingBuffer.cpp:31-44. Release the staging buffer. */
  deallocate(): void {
    const hgi = this._resourceRegistry.getHgi()
    for (let i = 0; i < MULTIBUFFERING; ++i) {
      if (this._handles[i]!.isSet()) {
        hgi.destroyBuffer(this._handles[i]!)
      }
    }
    this._capacity = 0
    this._activeSlot = 0
  }

  /** stagingBuffer.cpp:46-56. Set the size of the staging buffer. */
  resize(totalSize: number): void {
    if (this._head !== 0) {
      TF_CODING_ERROR('Cannot change size of staging buffer during Commit')
      return
    }
    this._capacity = totalSize
  }

  /** stagingBuffer.cpp:58-144. Perform a copy from CPU data into GPU
   *  memory. */
  stageCopy(copyOp: HgiBufferCpuToGpuOp): void {
    if (copyOp.byteSize === 0 ||
        !copyOp.cpuSourceBuffer ||
        !copyOp.gpuDestinationBuffer.isSet()) {
      return
    }

    // When the to-be-copied data is 'large' doing the extra memcpy into the
    // staging buffer to avoid many small GPU buffer upload can be more
    // expensive than just submitting the CPU to GPU copy operation directly.
    // The value of 'queueThreshold' is estimated (when is the extra memcpy
    // into the staging buffer slower than immediately issuing a gpu upload)
    // (stagingBuffer.cpp:67-78)
    const queueThreshold = 512 * 1024
    if (!this._isUma && copyOp.byteSize > queueThreshold) {
      const blitCmds = this._resourceRegistry.getGlobalBlitCmds()
      blitCmds.copyBufferCpuToGpu(copyOp)
      return
    }

    let buffer = this._handles[this._activeSlot]!
    const recoveryRatio = 4

    // If there is no buffer in the active slot or it is either too small or
    // substantially larger than the required size, recreate it.
    if (!buffer.isSet() ||
        buffer.Get()!.getDescriptor().byteSize < this._capacity ||
        buffer.Get()!.getDescriptor().byteSize > this._capacity * recoveryRatio) {
      const bufferDesc = new HgiBufferDesc()
      bufferDesc.debugName = 'HdStStagingBuffer'
      bufferDesc.byteSize = this._capacity
      bufferDesc.usage = HgiBufferUsageBits.HgiBufferUsageUpload

      const hgi = this._resourceRegistry.getHgi()

      if (buffer.isSet()) {
        hgi.destroyBuffer(buffer)
      }

      this._handles[this._activeSlot] = hgi.createBuffer(bufferDesc)
      buffer = this._handles[this._activeSlot]!
    }

    const capacity = buffer.Get()!.getDescriptor().byteSize
    const cpuStaging = buffer.Get()!.getCPUStagingAddress()

    if (TF_VERIFY(this._head + copyOp.byteSize <= capacity) && cpuStaging) {
      // Copy source into the staging buffer.
      cpuStaging.set(HdSt_CpuBytes(copyOp.cpuSourceBuffer, copyOp.sourceByteOffset,
        copyOp.byteSize), this._head)

      let aggregated = false

      // Attempt to aggregate this copy with the last one.
      if (this._gpuCopyOps.length > 0) {
        const lastCopy = this._gpuCopyOps[this._gpuCopyOps.length - 1]!
        const lastCopyEnd = lastCopy.destinationByteOffset + lastCopy.byteSize

        if (lastCopy.gpuDestinationBuffer.equals(copyOp.gpuDestinationBuffer) &&
            lastCopyEnd === copyOp.destinationByteOffset) {
          lastCopy.byteSize += copyOp.byteSize
          aggregated = true
        }
      }

      if (!aggregated) {
        // Create a GPU to GPU blit from staging buffer to destination.
        const gpuCopy = new HgiBufferGpuToGpuOp()
        gpuCopy.gpuSourceBuffer = HdSt_CopyHandle(buffer)
        gpuCopy.sourceByteOffset = this._head
        gpuCopy.byteSize = copyOp.byteSize
        gpuCopy.gpuDestinationBuffer = HdSt_CopyHandle(copyOp.gpuDestinationBuffer)
        gpuCopy.destinationByteOffset = copyOp.destinationByteOffset

        this._gpuCopyOps.push(gpuCopy)
      }

      this._head += copyOp.byteSize
    }
  }

  /** stagingBuffer.cpp:146-187. Flush the queued GPU to GPU blits from the
   *  calls to StageCopy. */
  flush(): void {
    if (this._head === 0) {
      this._gpuCopyOps = []
      return
    }

    const blitCmds = this._resourceRegistry.getGlobalBlitCmds()

    blitCmds.pushDebugGroup('HdStStagingBuffer::Flush')

    if (!this._isUma) {
      // If not UMA, then we need to copy the contents of the staging buffer
      // to the GPU.
      const op = new HgiBufferCpuToGpuOp()
      const buffer = this._handles[this._activeSlot]!
      const cpuStaging = buffer.Get()!.getCPUStagingAddress()

      op.cpuSourceBuffer = cpuStaging
      op.sourceByteOffset = 0
      op.gpuDestinationBuffer = HdSt_CopyHandle(buffer)
      op.destinationByteOffset = 0
      op.byteSize = this._head
      blitCmds.copyBufferCpuToGpu(op)
    }

    blitCmds.insertMemoryBarrier(HgiMemoryBarrierBits.HgiMemoryBarrierAll)
    for (const copyOp of this._gpuCopyOps) {
      blitCmds.copyBufferGpuToGpu(copyOp)
    }

    blitCmds.popDebugGroup()

    this._gpuCopyOps = []
    this._head = 0

    if (this._isUma) {
      this._activeSlot++
      this._activeSlot = (this._activeSlot < MULTIBUFFERING) ? this._activeSlot : 0
    }
  }
}
