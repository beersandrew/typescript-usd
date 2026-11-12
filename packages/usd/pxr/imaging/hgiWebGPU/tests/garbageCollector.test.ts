// Ported from OpenUSD 26.11.1: pxr/imaging/hgiVulkan/garbageCollector.cpp,
//  pxr/imaging/hgiVulkan/hgi.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPU's deferred destruction (garbageCollector.ts, modelled on
// hgiVulkan/garbageCollector.cpp and hgiVulkan/hgi.h:149-162 TrashObject):
// a destroyed Hgi object releases its GPU object only once the cmds that
// were recording when it was destroyed are submitted and the queue's
// submitted work has completed. Controller (Node) test with a fake
// GPUDevice that records destroy() calls and lets the test complete the
// queue's work.
import { describe, expect, it } from 'vitest'
import { HgiBufferDesc, HgiBufferUsageBits } from 'typescript-usd/hgi'
import { HgiWebGPU } from '../src/index.ts'

function fakeDevice() {
  const destroyed: string[] = []
  let completions: Array<() => void> = []
  const queue = {
    submit() {},
    writeBuffer() {},
    onSubmittedWorkDone: () => new Promise<void>((resolve) => { completions.push(resolve) }),
  }
  const device = {
    features: new Set<string>(),
    limits: {
      maxUniformBufferBindingSize: 65536, maxStorageBufferBindingSize: 134217728,
      minUniformBufferOffsetAlignment: 256, minStorageBufferOffsetAlignment: 256,
      maxComputeWorkgroupsPerDimension: 65535, maxSamplersPerShaderStage: 16,
    },
    queue,
    createBuffer: (d: GPUBufferDescriptor) => ({
      label: d.label, destroy: () => destroyed.push(d.label ?? ''),
      getMappedRange: () => new ArrayBuffer(d.size), unmap() {},
    }),
    createCommandEncoder: () => ({ finish: () => ({}) }),
    destroy() {},
  }
  /** Complete every submission so far. */
  const completeWork = async () => {
    const pending = completions
    completions = []
    for (const resolve of pending) resolve()
    await new Promise((r) => setTimeout(r, 0))
  }
  return { device: device as unknown as GPUDevice, destroyed, completeWork }
}

function makeBuffer(hgi: HgiWebGPU, name: string) {
  const desc = new HgiBufferDesc()
  desc.debugName = name
  desc.usage = HgiBufferUsageBits.HgiBufferUsageStorage
  desc.byteSize = 16
  return hgi.createBuffer(desc)
}

describe('HgiWebGPU deferred destruction', () => {
  it('keeps a buffer a recording cmds object may use until it is submitted and completed', async () => {
    const { device, destroyed, completeWork } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const blit = hgi.createBlitCmds()
    const old = makeBuffer(hgi, 'old')
    // Storm's reallocation: record a copy out of the old buffer, destroy
    // it, then submit (hdSt/vboMemoryManager.cpp Reallocate).
    hgi.destroyBuffer(old)
    expect(old.Get()).toBeNull() // the handle is reset at once (hgiVulkan/hgi.h:161)
    await completeWork()
    expect(destroyed).toEqual([])
    expect(hgi.getGarbageCollector().getPendingCount()).toBe(1)

    await hgi.submitCmds(blit)
    expect(destroyed).toEqual([])
    await completeWork()
    expect(destroyed).toEqual(['old'])
    expect(hgi.getGarbageCollector().getPendingCount()).toBe(0)
  })

  it('waits for every cmds object that was recording', async () => {
    const { device, destroyed, completeWork } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const a = hgi.createBlitCmds()
    const b = hgi.createBlitCmds()
    const buf = makeBuffer(hgi, 'shared')
    hgi.destroyBuffer(buf)
    await hgi.submitCmds(a)
    await completeWork()
    expect(destroyed).toEqual([])
    // A cmds object created after the destroy does not hold it back.
    hgi.createBlitCmds()
    await hgi.submitCmds(b)
    await completeWork()
    expect(destroyed).toEqual(['shared'])
  })

  it('with nothing recording, destroys after the work already submitted completes', async () => {
    const { device, destroyed, completeWork } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    hgi.destroyBuffer(makeBuffer(hgi, 'idle'))
    expect(destroyed).toEqual([])
    await completeWork()
    expect(destroyed).toEqual(['idle'])
  })
})
