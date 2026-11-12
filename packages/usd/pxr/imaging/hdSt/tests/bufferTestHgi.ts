// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStMeshTopology.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// A recording Hgi for Node tests of hdSt buffer management (no GPU). Buffers
// keep their bytes on the CPU; blit commands record their ops and run them in
// order when submitted, so the contents a GPU would hold after a submit can
// be checked. Modelled on hgi/tests/hgi.test.ts's RecordingHgi.
//
// Capabilities default to an OpenGL-like device (no unified memory, no C++
// shader padding); a test may set them.
//
// PLATFORM-DIVERGENCE(hdst-node-no-gpu-compute): Node has no WebGPU device,
// so this Hgi creates no shader functions or compute pipelines, and Storm's
// GPU computations (smooth and flat normals, quadrangulation, OpenSubdiv
// refinement through evalStencils) cannot run under vitest. Upstream runs
// them over the platform Hgi (e.g. testHdStMeshTopology.cpp:1000-1032). The
// ported tests skip those cases in Node (GpuComputeUnavailable in
// upstream/meshTopologyTestUtils.ts) and run them in Safari over HgiWebGPU:
// tests/browser/storm-image/hdst-gpu/run.mjs.

import {
  Hgi,
  HgiBlitCmds,
  HgiBuffer,
  HgiBufferDesc,
  HgiCapabilities,
  HgiComputeCmds,
  HgiComputeDispatch,
  HgiHandle,
  HgiTokens,
  type HgiBufferCpuToGpuOp,
  type HgiBufferGpuToCpuOp,
  type HgiBufferGpuToGpuOp,
  type HgiBufferHandle,
  type HgiComputeCmdsDesc,
  type HgiCpuData,
} from 'typescript-usd/hgi'

export class BufferTestCapabilities extends HgiCapabilities {
  constructor() {
    super()
    this._maxUniformBlockSize = 64 * 1024
    this._maxShaderStorageBlockSize = 1 * 1024 * 1024 * 1024
    this._uniformBufferOffsetAlignment = 256
  }
  getAPIVersion(): number { return 0 }
  getShaderVersion(): number { return 0 }
  setFlag(mask: number, value: boolean): void { this._setFlag(mask, value) }
  setMaxUniformBlockSize(n: number): void { this._maxUniformBlockSize = n }
  setMaxShaderStorageBlockSize(n: number): void { this._maxShaderStorageBlockSize = n }
  setUniformBufferOffsetAlignment(n: number): void { this._uniformBufferOffsetAlignment = n }
}

export class BufferTestBuffer extends HgiBuffer {
  bytes: Uint8Array
  destroyed = false
  constructor(desc: HgiBufferDesc) {
    super(desc)
    this.bytes = new Uint8Array(desc.byteSize)
    const init = desc.initialData
    if (init) {
      const src = init instanceof ArrayBuffer ? new Uint8Array(init)
        : new Uint8Array(init.buffer, init.byteOffset, init.byteLength)
      this.bytes.set(src.subarray(0, desc.byteSize))
    }
    this._descriptor.initialData = null
  }
  getByteSizeOfResource(): number { return this._descriptor.byteSize }
  getRawResource(): unknown { return this }
  getCPUStagingAddress(): Uint8Array | null { return this.bytes }
}

function bytesOf(data: HgiCpuData, offset: number, size: number): Uint8Array {
  return data instanceof ArrayBuffer ? new Uint8Array(data, offset, size)
    : new Uint8Array(data.buffer, data.byteOffset + offset, size)
}

function bufferOf(handle: HgiBufferHandle): BufferTestBuffer {
  const b = handle.Get() as BufferTestBuffer | null
  if (!b) throw new Error('blit op on an empty buffer handle')
  if (b.destroyed) throw new Error(`blit op on destroyed buffer ${b.getDescriptor().debugName}`)
  return b
}

export class BufferTestBlitCmds extends HgiBlitCmds {
  readonly ops: (() => void)[] = []
  readonly log: string[] = []
  constructor() { super() }
  pushDebugGroup(label: string): void { this.log.push(`push ${label}`) }
  popDebugGroup(): void { this.log.push('pop') }
  insertDebugMarker(): void {}
  copyTextureGpuToCpu(): void { throw new Error('unused') }
  copyTextureCpuToGpu(): void { throw new Error('unused') }
  copyBufferGpuToGpu(op: HgiBufferGpuToGpuOp): void {
    const src = op.gpuSourceBuffer, dst = op.gpuDestinationBuffer
    const { sourceByteOffset, destinationByteOffset, byteSize } = op
    this.log.push(`gpu->gpu ${byteSize}`)
    this.ops.push(() => {
      const s = bufferOf(src), d = bufferOf(dst)
      d.bytes.set(s.bytes.slice(sourceByteOffset, sourceByteOffset + byteSize), destinationByteOffset)
    })
  }
  copyBufferCpuToGpu(op: HgiBufferCpuToGpuOp): void {
    const dst = op.gpuDestinationBuffer
    // The CPU source is read now (the caller may reuse its memory).
    const data = bytesOf(op.cpuSourceBuffer!, op.sourceByteOffset, op.byteSize).slice()
    const destinationByteOffset = op.destinationByteOffset
    this.log.push(`cpu->gpu ${op.byteSize}`)
    this.ops.push(() => {
      const d = bufferOf(dst)
      if (d.bytes !== null && data.byteLength > 0) d.bytes.set(data, destinationByteOffset)
    })
  }
  copyBufferGpuToCpu(op: HgiBufferGpuToCpuOp): void {
    const src = op.gpuSourceBuffer
    const { sourceByteOffset, byteSize, destinationByteOffset } = op
    const dst = op.cpuDestinationBuffer!
    this.log.push(`gpu->cpu ${byteSize}`)
    this.ops.push(() => {
      const s = bufferOf(src)
      bytesOf(dst, destinationByteOffset, byteSize).set(
        s.bytes.subarray(sourceByteOffset, sourceByteOffset + byteSize))
    })
  }
  copyTextureToBuffer(): void { throw new Error('unused') }
  copyBufferToTexture(): void { throw new Error('unused') }
  generateMipMaps(): void { throw new Error('unused') }
  fillBuffer(buffer: HgiBufferHandle, value: number): void {
    this.ops.push(() => { bufferOf(buffer).bytes.fill(value) })
  }
  insertMemoryBarrier(): void { this.log.push('barrier') }
  override _submit(): boolean {
    for (const op of this.ops) op()
    return true
  }
}

export class BufferTestComputeCmds extends HgiComputeCmds {
  constructor(private readonly _dispatch: HgiComputeDispatch) { super() }
  pushDebugGroup(): void {}
  popDebugGroup(): void {}
  insertDebugMarker(): void {}
  bindPipeline(): void {}
  bindResources(): void {}
  setConstantValues(): void {}
  Dispatch(): void {}
  insertMemoryBarrier(): void {}
  getDispatchMethod(): HgiComputeDispatch { return this._dispatch }
  override _submit(): boolean { return true }
}

export class BufferTestHgi extends Hgi {
  readonly capabilities = new BufferTestCapabilities()
  readonly buffers: BufferTestBuffer[] = []
  readonly blitCmds: BufferTestBlitCmds[] = []
  constructor() { super() }
  /** Buffers created and not destroyed. */
  liveBuffers(): BufferTestBuffer[] { return this.buffers.filter(b => !b.destroyed) }
  IsBackendSupported() { return true }
  createGraphicsCmds(): never { throw new Error('unused') }
  createBlitCmds(): HgiBlitCmds {
    const cmds = new BufferTestBlitCmds()
    this.blitCmds.push(cmds)
    return cmds
  }
  createComputeCmds(desc: HgiComputeCmdsDesc): HgiComputeCmds {
    return new BufferTestComputeCmds(desc.dispatchMethod)
  }
  destroyTexture() {}
  destroyTextureView() {}
  createSampler(): never { throw new Error('unused') }
  destroySampler() {}
  destroyBuffer(bufHandle: HgiBufferHandle) {
    const b = bufHandle.Get() as BufferTestBuffer | null
    // Destruction is deferred to GarbageCollect, as Hgi backends do (blit
    // ops recorded before the destroy still read the buffer).
    if (b) this._trash.push(b)
    bufHandle._reset()
  }
  private _trash: BufferTestBuffer[] = []
  CreateShaderFunction(): never { throw new Error('unused') }
  destroyShaderFunction() {}
  createShaderProgram(): never { throw new Error('unused') }
  destroyShaderProgram() {}
  destroyResourceBindings() {}
  CreateGraphicsPipeline(): never { throw new Error('unused') }
  destroyGraphicsPipeline() {}
  CreateComputePipeline(): never { throw new Error('unused') }
  destroyComputePipeline() {}
  getAPIName() { return HgiTokens.OpenGL }
  getCapabilities() { return this.capabilities }
  getIndirectCommandEncoder() { return null }
  startFrame() {}
  endFrame() {}
  garbageCollect() {
    for (const b of this._trash) b.destroyed = true
    this._trash = []
  }
  _destroy() {}
  protected _CreateTexture(): never { throw new Error('unused') }
  protected _createTextureView(): never { throw new Error('unused') }
  protected _createBuffer(desc: HgiBufferDesc): HgiBufferHandle {
    const b = new BufferTestBuffer(desc)
    this.buffers.push(b)
    return new HgiHandle(b, this.getUniqueId()) as HgiBufferHandle
  }
  protected _createResourceBindings(): never { throw new Error('unused') }
}
