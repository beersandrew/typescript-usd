// HgiWebGPUBuffer's write version and the packed pulled attributes that
// depend on it (PLATFORM-DIVERGENCE(webgpu-storage-buffer-limit),
// pulledAttributePacker.ts): a packed buffer copies a source again only when
// the source's version changed, so every HgiWebGPU path that writes a
// buffer's GPU contents must bump it when its work is submitted. The blit
// test runs every HgiWebGPUBlitCmds method against a fake GPUDevice whose
// encoders report the buffers each command writes (WebGPU's copy
// destinations and clears), and fails if a written buffer keeps its version
// or a method is not covered. Controller (Node) tests; the Safari check is
// the image suites run with HGIWEBGPU_FORCE_PACKED_ATTRIBUTES (see
// packages/usd/docs/performance-viewer.md).
import { describe, expect, it } from 'vitest'
import {
  HgiBufferBindDesc,
  HgiBufferCpuToGpuOp,
  HgiBufferDesc,
  HgiBufferGpuToCpuOp,
  HgiBufferGpuToGpuOp,
  HgiBufferUsageBits,
  HgiComputeCmdsDesc,
  HgiFormat,
  HgiHandle,
  HgiResourceBindingsDesc,
  HgiTextureDesc,
  HgiTextureToBufferOp,
  HgiTextureUsageBits,
  type HgiBufferHandle,
  type HgiComputePipeline,
} from 'typescript-usd/hgi'
import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import { HgiWebGPU, HgiWebGPUBuffer } from '../src/index.ts'
import { HgiWebGPUBlitCmds } from '../src/blitCmds.ts'
import { HgiWebGPUPulledAttributePacker } from '../src/pulledAttributePacker.ts'
import { HgiWebGPUResourceBindings } from '../src/resourceBindings.ts'

interface Copy { src: GPUBuffer, dst: GPUBuffer, dstOffset: number, size: number }

/** A fake device whose command encoders and passes record the GPU buffers
 *  their commands write. */
function fakeDevice() {
  const written = new Set<GPUBuffer>()
  const copies: Copy[] = []
  const pass = new Proxy({}, { get: () => () => undefined })
  const encoder = () => ({
    copyBufferToBuffer(src: GPUBuffer, _so: number, dst: GPUBuffer, dstOffset: number, size: number) {
      written.add(dst)
      copies.push({ src, dst, dstOffset, size })
    },
    copyTextureToBuffer(_src: unknown, dst: GPUTexelCopyBufferInfo) { written.add(dst.buffer) },
    copyBufferToTexture() {},
    clearBuffer(b: GPUBuffer) { written.add(b) },
    beginRenderPass: () => pass,
    beginComputePass: () => pass,
    pushDebugGroup() {}, popDebugGroup() {}, insertDebugMarker() {},
    finish: () => ({}),
  })
  const device = {
    features: new Set<string>(),
    limits: {
      maxUniformBufferBindingSize: 65536, maxStorageBufferBindingSize: 134217728,
      maxBufferSize: 268435456,
      minUniformBufferOffsetAlignment: 256, minStorageBufferOffsetAlignment: 256,
      maxComputeWorkgroupsPerDimension: 65535, maxSamplersPerShaderStage: 16,
    },
    queue: {
      submit() {},
      writeBuffer(b: GPUBuffer) { written.add(b) },
      writeTexture() {},
      onSubmittedWorkDone: () => Promise.resolve(),
    },
    createBuffer: (d: GPUBufferDescriptor) => ({
      label: d.label, size: d.size, usage: d.usage, destroy() {},
      getMappedRange: () => new ArrayBuffer(d.size), unmap() {},
      mapAsync: () => Promise.resolve(),
    }),
    createTexture: (d: GPUTextureDescriptor) => ({
      ...d, width: 4, height: 4, depthOrArrayLayers: 1, mipLevelCount: 1, usage: d.usage,
      createView: () => ({}), destroy() {},
    }),
    createSampler: () => ({}),
    createBindGroupLayout: () => ({}),
    createBindGroup: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: () => ({}),
    createComputePipeline: () => ({}),
    createShaderModule: () => ({}),
    createCommandEncoder: encoder,
    destroy() {},
  }
  return { device: device as unknown as GPUDevice, written, copies }
}

function makeBuffer(hgi: HgiWebGPU, name: string, byteSize = 256): HgiBufferHandle {
  const desc = new HgiBufferDesc()
  desc.debugName = name
  desc.usage = HgiBufferUsageBits.HgiBufferUsageVertex | HgiBufferUsageBits.HgiBufferUsageStorage
  desc.byteSize = byteSize
  desc.vertexStride = 4
  return hgi.createBuffer(desc)
}

function makeTexture(hgi: HgiWebGPU) {
  const desc = new HgiTextureDesc()
  desc.debugName = 'texture'
  desc.format = HgiFormat.HgiFormatUNorm8Vec4
  desc.usage = HgiTextureUsageBits.HgiTextureUsageBitsShaderRead
  desc.dimensions = new GfVec3i(4, 4, 1)
  return hgi.createTexture(desc)
}

const _version = (h: HgiBufferHandle) => (h.Get() as HgiWebGPUBuffer)._getWriteVersion()

describe('HgiWebGPUBuffer write version', () => {
  // Each HgiBlitCmds method with the commands it records (null: it takes no
  // buffer to write). A method missing here fails the coverage check.
  type Op = (blit: HgiWebGPUBlitCmds, hgi: HgiWebGPU, a: HgiBufferHandle, b: HgiBufferHandle) => void
  const ops: Record<string, Op | null> = {
    pushDebugGroup: null,
    popDebugGroup: null,
    insertDebugMarker: null,
    insertMemoryBarrier: null,
    generateMipMaps: null,
    copyTextureCpuToGpu: null,
    copyBufferToTexture: null,
    copyTextureGpuToCpu: null,
    copyBufferGpuToCpu: (blit, _hgi, a) => {
      const op = new HgiBufferGpuToCpuOp()
      op.gpuSourceBuffer = a
      op.cpuDestinationBuffer = new Uint8Array(64)
      op.byteSize = 64
      blit.copyBufferGpuToCpu(op)
    },
    copyBufferGpuToGpu: (blit, _hgi, a, b) => {
      const op = new HgiBufferGpuToGpuOp()
      op.gpuSourceBuffer = a
      op.gpuDestinationBuffer = b
      op.byteSize = 64
      blit.copyBufferGpuToGpu(op)
    },
    copyBufferGpuToGpuSelf: (blit, _hgi, a) => {
      const op = new HgiBufferGpuToGpuOp()
      op.gpuSourceBuffer = a
      op.gpuDestinationBuffer = a
      op.destinationByteOffset = 128
      op.byteSize = 64
      blit.copyBufferGpuToGpu(op)
    },
    copyBufferCpuToGpu: (blit, _hgi, a) => {
      const op = new HgiBufferCpuToGpuOp()
      op.cpuSourceBuffer = new Uint8Array(64)
      op.gpuDestinationBuffer = a
      op.destinationByteOffset = 6
      op.byteSize = 10
      blit.copyBufferCpuToGpu(op)
    },
    copyTextureToBuffer: (blit, hgi, a) => {
      const op = new HgiTextureToBufferOp()
      op.gpuSourceTexture = makeTexture(hgi)
      op.gpuDestinationBuffer = a
      blit.copyTextureToBuffer(op)
    },
    fillBuffer: (blit, _hgi, a) => blit.fillBuffer(a, 0),
    fillBufferValue: (blit, _hgi, a) => blit.fillBuffer(a, 7),
    _submit: null,
  }

  it('covers every HgiWebGPUBlitCmds method', () => {
    const methods = Object.getOwnPropertyNames(HgiWebGPUBlitCmds.prototype)
      .filter(m => m !== 'constructor' && !m.startsWith('_') || m === '_submit')
      .filter(m => typeof (HgiWebGPUBlitCmds.prototype as unknown as Record<string, unknown>)[m] === 'function')
    expect(methods.filter(m => !(m in ops))).toEqual([])
  })

  for (const [name, op] of Object.entries(ops)) {
    if (!op) continue
    it(`is bumped when ${name} writes a buffer, at submission`, async () => {
      const { device, written } = fakeDevice()
      const hgi = new HgiWebGPU(device)
      const a = makeBuffer(hgi, 'a')
      const b = makeBuffer(hgi, 'b')
      const blit = hgi.createBlitCmds()
      const before = [_version(a), _version(b)]
      op(blit, hgi, a, b)
      // Not before the work is submitted.
      expect([_version(a), _version(b)]).toEqual(before)
      await hgi.submitCmds(blit)
      for (const [h, v] of [[a, before[0]!], [b, before[1]!]] as const) {
        const buffer = h.Get() as HgiWebGPUBuffer
        if (written.has(buffer.getBufferId()!)) expect(buffer._getWriteVersion()).toBeGreaterThan(v)
        else expect(buffer._getWriteVersion()).toBe(v)
      }
    })
  }

  it('is bumped for buffers a compute cmds binds as writable storage, not read-only ones', async () => {
    const { device } = fakeDevice()
    const hgi = new HgiWebGPU(device)
    const out = makeBuffer(hgi, 'out')
    const input = makeBuffer(hgi, 'in')
    const layouts = {
      layouts: [{}],
      entries: [[
        { binding: 0, visibility: 4, buffer: { type: 'storage' } },
        { binding: 1, visibility: 4, buffer: { type: 'read-only-storage' } },
      ]],
    }
    const pipeline = {
      getComputePipelineState: () => ({}),
      exceedsDeviceLimits: () => false,
      getBindGroupLayouts: () => layouts,
      getLocalWorkGroupSize: () => [64, 1],
    }
    const desc = new HgiResourceBindingsDesc()
    desc.debugName = 'compute'
    for (const [i, h] of [out, input].entries()) {
      const bind = new HgiBufferBindDesc()
      bind.buffers = [h]
      bind.offsets = [0]
      bind.bindingIndex = i
      bind.writable = i === 0
      desc.buffers.push(bind)
    }
    const bindings = new HgiHandle(new HgiWebGPUResourceBindings(desc), 2)
    const cmds = hgi.createComputeCmds(new HgiComputeCmdsDesc())
    cmds.bindPipeline(new HgiHandle(pipeline as unknown as HgiComputePipeline, 3))
    cmds.bindResources(bindings)
    cmds.Dispatch(64, 1)
    expect([_version(out), _version(input)]).toEqual([0, 0])
    await hgi.submitCmds(cmds)
    expect([_version(out), _version(input)]).toEqual([1, 0])
  })
})

describe('HgiWebGPUPulledAttributePacker', () => {
  function setup() {
    const fake = fakeDevice()
    const hgi = new HgiWebGPU(fake.device)
    const a = makeBuffer(hgi, 'a', 64).Get() as HgiWebGPUBuffer
    const b = makeBuffer(hgi, 'b', 128).Get() as HgiWebGPUBuffer
    const packer = new HgiWebGPUPulledAttributePacker(fake.device)
    const encoder = fake.device.createCommandEncoder()
    const never = () => false
    return { ...fake, a, b, packer, encoder: () => encoder, never }
  }
  const sizes = (copies: Copy[]) => copies.map(c => c.size)

  it('copies every source the first time, then only the sources written since', () => {
    const { a, b, packer, encoder, never, copies } = setup()
    const p = packer.pack(packer.beginCmds(), [a, b], never, encoder)!
    expect(sizes(copies)).toEqual([64, 128])
    expect([p.bases.get(a.getBufferId()!), p.bases.get(b.getBufferId()!)]).toEqual([0, 64])
    copies.length = 0
    // A second pass, nothing written: no copies, the same buffer.
    expect(packer.pack(packer.beginCmds(), [a, b], never, encoder)!.buffer).toBe(p.buffer)
    expect(copies).toEqual([])
    // A deforming source: only its range.
    b._noteWrite()
    packer.pack(packer.beginCmds(), [a, b], never, encoder)
    expect(copies).toEqual([{ src: b.getBufferId(), dst: p.buffer, dstOffset: 64, size: 128 }])
    expect(packer.getCopiedBytes()).toBe(64 + 128 + 128)
  })

  it('copies once per cmds the sources the cmds wrote before the draw', () => {
    const { a, b, packer, encoder, copies } = setup()
    const serial = packer.beginCmds()
    packer.pack(serial, [a, b], () => false, encoder)
    copies.length = 0
    const next = packer.beginCmds()
    packer.pack(next, [a, b], s => s === a, encoder)
    packer.pack(next, [a, b], s => s === a, encoder)
    expect(sizes(copies)).toEqual([64])
  })

  it('refreshes at submission the ranges written by work submitted after the copy', () => {
    const { a, b, packer, encoder, never, copies } = setup()
    const p = packer.pack(packer.beginCmds(), [a, b], never, encoder)!
    copies.length = 0
    packer.refresh([p], encoder)
    expect(copies).toEqual([])
    a._noteWrite()
    packer.refresh([p], encoder)
    expect(sizes(copies)).toEqual([64])
    copies.length = 0
    packer.pack(packer.beginCmds(), [a, b], never, encoder)
    expect(copies).toEqual([])
  })

  it('makes a new packed buffer when the sources change', () => {
    const { device, a, b, packer, encoder, never, copies } = setup()
    const p = packer.pack(packer.beginCmds(), [a, b], never, encoder)!
    const c = new HgiWebGPUBuffer(device, Object.assign(new HgiBufferDesc(), { byteSize: 32 }))
    copies.length = 0
    const q = packer.pack(packer.beginCmds(), [a, c], never, encoder)!
    expect(q.buffer).not.toBe(p.buffer)
    expect(sizes(copies)).toEqual([64, 32])
  })
})
