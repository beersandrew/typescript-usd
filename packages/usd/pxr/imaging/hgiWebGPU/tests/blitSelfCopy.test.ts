// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/copyComputation.cpp,
//  pxr/imaging/hgiMetal/blitCmds.mm
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUBlitCmds::CopyBufferGpuToGpu between two ranges of one buffer.
// Storm records such copies when HdStCopyComputationGPU migrates a range into
// a new range of the same buffer array (hdSt/copyComputation.cpp:31-102;
// upstream testHdStTransition1 does it after animate + repr=hull), and
// hgiMetal records them as one copyFromBuffer:toBuffer: (blitCmds.mm:317-321).
// WebGPU rejects copyBufferToBuffer whose source equals its destination, so
// the copy must not reach the encoder as one. Controller (Node) test with a
// fake GPUDevice that records the encoder's copies; the Safari check is the
// hdst-programs testHdStTransition1 row of the imaging ledger.
import { describe, expect, it } from 'vitest'
import { HgiBufferDesc, HgiBufferGpuToGpuOp, HgiBufferUsageBits } from 'typescript-usd/hgi'
import { HgiWebGPU } from '../src/index.ts'

interface Copy { src: string, srcOffset: number, dst: string, dstOffset: number, size: number }

function fakeDevice() {
  const copies: Copy[] = []
  const device = {
    features: new Set<string>(),
    limits: {
      maxUniformBufferBindingSize: 65536, maxStorageBufferBindingSize: 134217728,
      minUniformBufferOffsetAlignment: 256, minStorageBufferOffsetAlignment: 256,
      maxComputeWorkgroupsPerDimension: 65535, maxSamplersPerShaderStage: 16,
    },
    queue: { submit() {}, writeBuffer() {}, onSubmittedWorkDone: () => Promise.resolve() },
    createBuffer: (d: GPUBufferDescriptor) => ({
      label: d.label, size: d.size, destroy() {},
      getMappedRange: () => new ArrayBuffer(d.size), unmap() {},
    }),
    createCommandEncoder: () => ({
      copyBufferToBuffer(src: GPUBuffer, srcOffset: number, dst: GPUBuffer, dstOffset: number, size: number) {
        copies.push({ src: src.label, srcOffset, dst: dst.label, dstOffset, size })
      },
      finish: () => ({}),
    }),
    destroy() {},
  }
  return { device: device as unknown as GPUDevice, copies }
}

describe('HgiWebGPUBlitCmds CopyBufferGpuToGpu within one buffer', () => {
  it('moves the bytes through another buffer, never copying a buffer onto itself', () => {
    const { device, copies } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const desc = new HgiBufferDesc()
    desc.debugName = 'points'
    desc.usage = HgiBufferUsageBits.HgiBufferUsageVertex
    desc.byteSize = 4096
    const buffer = hgi.createBuffer(desc)
    const blit = hgi.createBlitCmds()
    // The migration testHdStTransition1 records (504 -> 2556, 1452 bytes).
    const op = new HgiBufferGpuToGpuOp()
    op.gpuSourceBuffer = buffer
    op.gpuDestinationBuffer = buffer
    op.sourceByteOffset = 504
    op.destinationByteOffset = 2556
    op.byteSize = 1452
    blit.copyBufferGpuToGpu(op)

    expect(copies.every(c => c.src !== c.dst)).toBe(true)
    expect(copies).toHaveLength(2)
    const [out, back] = copies as [Copy, Copy]
    expect(out).toMatchObject({ src: 'points', srcOffset: 504, size: 1452 })
    expect(back).toMatchObject({ src: out.dst, srcOffset: out.dstOffset, dst: 'points', dstOffset: 2556, size: 1452 })
  })
})
