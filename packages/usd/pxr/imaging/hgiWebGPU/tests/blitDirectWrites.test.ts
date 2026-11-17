// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/blitCmds.mm,
//  pxr/imaging/hgiVulkan/blitCmds.cpp
// Copyright 2020, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUBlitCmds::CopyBufferCpuToGpu writes the bytes into the buffer at
// once, as hgiMetal (memcpy into the buffer's contents, blitCmds.mm:350-370)
// and hgiVulkan under UMA (blitCmds.cpp:442-466) do: GPUQueue.writeBuffer,
// which runs before every command buffer not yet submitted. So it may be used
// only when no such work (this cmds' commands, blits held by
// hgiwebgpu-coalesced-submits, blits being recorded) uses the buffer;
// otherwise the bytes are staged and copied in command order. Controller
// (Node) test with a fake GPUDevice that keeps every buffer's bytes and runs
// writeBuffer and submitted command buffers in queue order, checking the
// contents against command order.
import { describe, expect, it } from 'vitest'
import {
  HgiBufferCpuToGpuOp,
  HgiBufferDesc,
  HgiBufferGpuToCpuOp,
  HgiBufferGpuToGpuOp,
  HgiBufferUsageBits,
  HgiSubmitWaitType,
  type HgiBufferHandle,
} from 'typescript-usd/hgi'
import { HgiWebGPU, HgiWebGPUBuffer } from '../src/index.ts'

type Op = () => void
interface FakeBuffer { label: string, size: number, usage: number, mem: Uint8Array }

/** A fake device that holds every buffer's bytes: writeBuffer writes at
 *  once, and command buffers run their copies when submitted. */
function fakeDevice() {
  const log = { writeBuffer: [] as string[], uploads: 0, encoders: 0 }
  const device = {
    features: new Set<string>(),
    limits: {
      maxUniformBufferBindingSize: 65536, maxStorageBufferBindingSize: 134217728,
      maxBufferSize: 268435456,
      minUniformBufferOffsetAlignment: 256, minStorageBufferOffsetAlignment: 256,
      maxComputeWorkgroupsPerDimension: 65535, maxSamplersPerShaderStage: 16,
    },
    queue: {
      submit(buffers: { ops: Op[] }[]) { for (const b of buffers) for (const op of b.ops) op() },
      writeBuffer(b: FakeBuffer, offset: number, data: ArrayBuffer, dataOffset: number, size: number) {
        log.writeBuffer.push(b.label)
        b.mem.set(new Uint8Array(data, dataOffset, size), offset)
      },
      writeTexture() {},
      onSubmittedWorkDone: () => Promise.resolve(),
    },
    createBuffer: (d: GPUBufferDescriptor) => {
      if (d.label === 'HgiWebGPUBlitCmds upload') log.uploads++
      const mem = new Uint8Array(d.size)
      return {
        label: d.label, size: d.size, usage: d.usage, mem, destroy() {},
        getMappedRange: () => mem.buffer, unmap() {}, mapAsync: () => Promise.resolve(),
      }
    },
    createCommandEncoder: () => {
      log.encoders++
      const ops: Op[] = []
      return {
        copyBufferToBuffer(src: FakeBuffer, srcOffset: number, dst: FakeBuffer, dstOffset: number, size: number) {
          ops.push(() => dst.mem.set(src.mem.slice(srcOffset, srcOffset + size), dstOffset))
        },
        clearBuffer(b: FakeBuffer, offset = 0, size = b.size) { ops.push(() => b.mem.fill(0, offset, offset + size)) },
        pushDebugGroup() {}, popDebugGroup() {}, insertDebugMarker() {},
        finish: () => ({ ops }),
      }
    },
    destroy() {},
  }
  return { device: device as unknown as GPUDevice, log }
}

function makeBuffer(hgi: HgiWebGPU, name: string): HgiBufferHandle {
  const desc = new HgiBufferDesc()
  desc.debugName = name
  desc.usage = HgiBufferUsageBits.HgiBufferUsageVertex
  desc.byteSize = 16
  return hgi.createBuffer(desc)
}

const mem = (h: HgiBufferHandle) =>
  [...((h.Get() as HgiWebGPUBuffer).getBufferId() as unknown as FakeBuffer).mem]

function cpuWrite(hgi: HgiWebGPU, blit: ReturnType<HgiWebGPU['createBlitCmds']>, dst: HgiBufferHandle, value: number) {
  const op = new HgiBufferCpuToGpuOp()
  op.cpuSourceBuffer = new Uint8Array(16).fill(value)
  op.gpuDestinationBuffer = dst
  op.byteSize = 16
  blit.copyBufferCpuToGpu(op)
}

function gpuCopy(blit: ReturnType<HgiWebGPU['createBlitCmds']>, src: HgiBufferHandle, dst: HgiBufferHandle) {
  const op = new HgiBufferGpuToGpuOp()
  op.gpuSourceBuffer = src
  op.gpuDestinationBuffer = dst
  op.byteSize = 16
  blit.copyBufferGpuToGpu(op)
}

const NO_WAIT = HgiSubmitWaitType.HgiSubmitWaitTypeNoWait

describe('HgiWebGPUBlitCmds CopyBufferCpuToGpu', () => {
  it('writes the buffer at once when no pending work uses it, recording nothing', () => {
    const { device, log } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const x = makeBuffer(hgi, 'x')
    const encoders = log.encoders
    const blit = hgi.createBlitCmds()
    cpuWrite(hgi, blit, x, 5)
    expect(mem(x)).toEqual(new Array(16).fill(5))
    hgi.submitCmds(blit, NO_WAIT)
    expect(log.writeBuffer).toEqual(['x'])
    expect(log.uploads).toBe(0)
    expect(log.encoders).toBe(encoders)
    // The write version is bumped on submit, as for a staged copy.
    expect((x.Get() as HgiWebGPUBuffer)._getWriteVersion()).toBe(1)
  })

  it('stages after a held blit that writes the buffer, so the CPU bytes land last', () => {
    const { device, log } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const x = makeBuffer(hgi, 'x'), y = makeBuffer(hgi, 'y')
    const b0 = hgi.createBlitCmds()
    cpuWrite(hgi, b0, y, 7)
    hgi.submitCmds(b0, NO_WAIT)
    const b1 = hgi.createBlitCmds()
    gpuCopy(b1, y, x)
    hgi.submitCmds(b1, NO_WAIT) // held, not yet submitted
    const b2 = hgi.createBlitCmds()
    cpuWrite(hgi, b2, x, 9)
    hgi.submitCmds(b2, NO_WAIT)
    hgi.endFrame()
    expect(log.writeBuffer).toEqual(['y'])
    expect(log.uploads).toBe(1)
    expect(mem(x)).toEqual(new Array(16).fill(9))
  })

  it('stages after a command of the same cmds that uses the buffer', () => {
    const { device } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const x = makeBuffer(hgi, 'x'), y = makeBuffer(hgi, 'y')
    const b0 = hgi.createBlitCmds()
    cpuWrite(hgi, b0, y, 7)
    hgi.submitCmds(b0, NO_WAIT)
    const b1 = hgi.createBlitCmds()
    gpuCopy(b1, y, x)
    cpuWrite(hgi, b1, x, 9)
    hgi.submitCmds(b1, NO_WAIT)
    hgi.endFrame()
    expect(mem(x)).toEqual(new Array(16).fill(9))
  })

  it('stages while another blit being recorded reads the buffer', () => {
    const { device, log } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const x = makeBuffer(hgi, 'x'), y = makeBuffer(hgi, 'y')
    const b0 = hgi.createBlitCmds()
    cpuWrite(hgi, b0, x, 3)
    hgi.submitCmds(b0, NO_WAIT)
    const reader = hgi.createBlitCmds()
    gpuCopy(reader, x, y) // records a read of x, submitted first
    const writer = hgi.createBlitCmds()
    cpuWrite(hgi, writer, x, 9)
    hgi.submitCmds(reader, NO_WAIT)
    hgi.submitCmds(writer, NO_WAIT)
    hgi.endFrame()
    expect(log.writeBuffer).toEqual(['x'])
    expect(mem(y)).toEqual(new Array(16).fill(3))
    expect(mem(x)).toEqual(new Array(16).fill(9))
  })

  it('writes at once again once the held work is submitted', () => {
    const { device, log } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const x = makeBuffer(hgi, 'x'), y = makeBuffer(hgi, 'y')
    const b1 = hgi.createBlitCmds()
    gpuCopy(b1, y, x)
    hgi.submitCmds(b1, NO_WAIT)
    hgi.endFrame()
    const b2 = hgi.createBlitCmds()
    cpuWrite(hgi, b2, x, 4)
    hgi.submitCmds(b2, NO_WAIT)
    expect(log.writeBuffer).toEqual(['x'])
    expect(log.uploads).toBe(0)
    expect(mem(x)).toEqual(new Array(16).fill(4))
  })

  it('reads back what it wrote in the same cmds', async () => {
    const { device } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const x = makeBuffer(hgi, 'x')
    const blit = hgi.createBlitCmds()
    cpuWrite(hgi, blit, x, 6)
    const out = new Uint8Array(16)
    const op = new HgiBufferGpuToCpuOp()
    op.gpuSourceBuffer = x
    op.cpuDestinationBuffer = out
    op.byteSize = 16
    blit.copyBufferGpuToCpu(op)
    await hgi.submitCmds(blit, HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted)
    expect([...out]).toEqual(new Array(16).fill(6))
  })
})
