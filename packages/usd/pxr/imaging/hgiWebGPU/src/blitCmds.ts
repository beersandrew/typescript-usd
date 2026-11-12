// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/blitCmds.h,
//  pxr/imaging/hgiMetal/blitCmds.mm, pxr/imaging/hgiVulkan/blitCmds.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUBlitCmds. Modelled on pxr/imaging/hgiMetal/blitCmds.{h,mm}, with
// CopyTextureToBuffer / CopyBufferToTexture following
// hgiVulkan/blitCmds.cpp (hgiMetal leaves both unimplemented,
// blitCmds.mm:421-431).
//
// WebGPU adaptations, each noted at its site: CPU data reaches the GPU
// through staging buffers copied inside this command buffer, so it lands in
// command order as Metal's encoder copies do; GPU-to-CPU copies stage into
// mappable buffers that are read once the work completes (Metal's completion
// handlers, blitCmds.mm:183-188); texture rows in buffers are 256-byte
// aligned in WebGPU and are repacked to Hgi's tightly packed rows.

import {
  HgiCmds,
  HgiBlitCmds,
  HgiFormat,
  HgiGetComponentBaseFormat,
  HgiGetDataSizeOfFormat,
  HgiMemoryBarrierBits,
  HgiSubmitWaitType,
  HgiTextureType,
  type Hgi,
  type HgiBufferCpuToGpuOp,
  type HgiBufferGpuToCpuOp,
  type HgiBufferGpuToGpuOp,
  type HgiBufferHandle,
  type HgiBufferToTextureOp,
  type HgiMemoryBarrier,
  type HgiTextureCpuToGpuOp,
  type HgiTextureDesc,
  type HgiTextureGpuToCpuOp,
  type HgiTextureHandle,
  type HgiTextureToBufferOp,
} from 'typescript-usd/hgi'
import type { Vec4f as GfVec4f } from 'typescript-usd/gf'
import { HgiWebGPUAlign, HgiWebGPUBytes, type HgiWebGPUBuffer } from './buffer.ts'
import { GPUBufferUsageFlags, GPUMapModeFlags } from './conversions.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './diagnostic.ts'
import type { HgiWebGPU } from './hgi.ts'
import type { HgiWebGPUTexture } from './texture.ts'

/** WebGPU's bytesPerRow alignment for buffer <-> texture copies. */
const _rowAlignment = 256

interface Readback {
  staging: GPUBuffer
  /** Copies the mapped staging bytes into the CPU destination. */
  unpack: (mapped: Uint8Array) => void
}

/** The texel block of a texture's format. */
function _Block(desc: HgiTextureDesc) {
  const block = { blockWidth: 1, blockHeight: 1 }
  const bytes = HgiGetDataSizeOfFormat(desc.format, block)
  return { bytes, ...block }
}

/** Mip-level extent (dimensions halved per level, at least 1). */
function _MipExtent(desc: HgiTextureDesc, mipLevel: number): [number, number, number] {
  const [w, h, d] = desc.dimensions.data as [number, number, number]
  const is3D = desc.type === HgiTextureType.HgiTextureType3D
  return [Math.max(w >> mipLevel, 1), Math.max(h >> mipLevel, 1),
    is3D ? Math.max(d >> mipLevel, 1) : 1]
}

export class HgiWebGPUBlitCmds extends HgiBlitCmds {
  private _commandEncoder: GPUCommandEncoder | null
  private readonly _readbacks: Readback[] = []
  private readonly _transient: GPUBuffer[] = []
  /** The buffers this cmds writes, whose write version is bumped when it is
   *  submitted (HgiWebGPUBuffer._noteWrite). */
  private readonly _written = new Set<HgiWebGPUBuffer>()

  /** hgiMetal/blitCmds.mm:23-30 */
  constructor(private readonly _hgi: HgiWebGPU) {
    super()
    this._commandEncoder = _hgi.getPrimaryDevice().createCommandEncoder({ label: 'HgiWebGPUBlitCmds' })
  }

  private get _device(): GPUDevice { return this._hgi.getPrimaryDevice() }

  /** A buffer created mapped with `bytes` that is copied from inside this
   *  command buffer and released after submission. */
  private _stagingUpload(bytes: Uint8Array): GPUBuffer {
    const staging = this._device.createBuffer({
      label: 'HgiWebGPUBlitCmds upload',
      size: HgiWebGPUAlign(Math.max(bytes.byteLength, 4)),
      usage: GPUBufferUsageFlags.COPY_SRC,
      mappedAtCreation: true,
    })
    new Uint8Array(staging.getMappedRange()).set(bytes)
    staging.unmap()
    this._transient.push(staging)
    return staging
  }

  /** hgiMetal/blitCmds.mm:65-80 */
  pushDebugGroup(label: string, _color: GfVec4f = HgiCmds.s_blitDebugColor): void {
    this._commandEncoder?.pushDebugGroup(label)
  }

  /** hgiMetal/blitCmds.mm:82-88 */
  popDebugGroup(): void {
    this._commandEncoder?.popDebugGroup()
  }

  /** hgiMetal/blitCmds.mm:90-102 */
  insertDebugMarker(label: string, _color: GfVec4f = HgiCmds.s_markerDebugColor): void {
    this._commandEncoder?.insertDebugMarker(label)
  }

  /** hgiMetal/blitCmds.mm:104-189 */
  copyTextureGpuToCpu(copyOp: HgiTextureGpuToCpuOp): void {
    const srcTexture = copyOp.gpuSourceTexture.Get() as HgiWebGPUTexture | null
    if (!TF_VERIFY(srcTexture && srcTexture.getTextureId(), 'Invalid texture handle')) {
      return
    }

    if (copyOp.destinationBufferByteSize === 0) {
      TF_WARN('The size of the data to copy was zero (aborted)')
      return
    }

    const texDesc = srcTexture!.getDescriptor()
    if (srcTexture!.getGpuFormat() === 'depth32float-stencil8') {
      TF_WARN('Cannot read back depth stencil on WebGPU.')
      return
    }

    const block = _Block(texDesc)
    const isTexArray = texDesc.layerCount > 1
    const [ox, oy, oz] = copyOp.sourceTexelOffset.data as [number, number, number]
    const depthOffset = isTexArray ? 0 : oz
    const [mw, mh, md] = _MipExtent(texDesc, copyOp.mipLevel)
    // hgiMetal/blitCmds.mm:144-151: from the offset to the end of the level.
    const width = mw - ox
    const height = mh - oy
    const depth = Math.max(md - depthOffset, 1)
    const rows = Math.ceil(height / block.blockHeight)
    // Metal writes rows of bytesPerPixel * width (blitCmds.mm:164-166);
    // WebGPU stages rows aligned to 256 bytes and they are repacked.
    const packedBytesPerRow = Math.ceil(width / block.blockWidth) * block.bytes
    const bytesPerRow = HgiWebGPUAlign(packedBytesPerRow, _rowAlignment)
    const staging = this._device.createBuffer({
      label: 'HgiWebGPUBlitCmds readback',
      size: bytesPerRow * rows * depth,
      usage: GPUBufferUsageFlags.MAP_READ | GPUBufferUsageFlags.COPY_DST,
    })
    this._commandEncoder!.copyTextureToBuffer(
      {
        texture: srcTexture!.getTextureId()!,
        mipLevel: copyOp.mipLevel,
        origin: { x: ox, y: oy, z: isTexArray ? oz : depthOffset },
      },
      { buffer: staging, bytesPerRow, rowsPerImage: rows },
      { width, height, depthOrArrayLayers: depth })

    // Offset into the dst buffer, bytes to copy (blitCmds.mm:176-181)
    const dst = HgiWebGPUBytes(copyOp.cpuDestinationBuffer!, copyOp.destinationByteOffset)
    const byteSize = Math.min(copyOp.destinationBufferByteSize, dst.byteLength)
    this._readbacks.push({
      staging,
      unpack: mapped => {
        let written = 0
        for (let row = 0; row < rows * depth && written < byteSize; row++) {
          const n = Math.min(packedBytesPerRow, byteSize - written)
          dst.set(mapped.subarray(row * bytesPerRow, row * bytesPerRow + n), written)
          written += n
        }
      },
    })
  }

  /** hgiMetal/blitCmds.mm:192-288. Metal fills a temporary texture and blits
   *  it; the WebGPU counterpart stages the rows in a buffer and copies it to
   *  the texture inside this command buffer. */
  copyTextureCpuToGpu(copyOp: HgiTextureCpuToGpuOp): void {
    const dstTexture = copyOp.gpuDestinationTexture.Get() as HgiWebGPUTexture | null
    if (!dstTexture?.getTextureId() || !copyOp.cpuSourceBuffer || copyOp.bufferByteSize === 0) {
      return
    }
    const dstTexDesc = dstTexture.getDescriptor()
    const block = _Block(dstTexDesc)
    const isTexArray = dstTexDesc.layerCount > 1
    const [ox, oy, oz] = copyOp.destinationTexelOffset.data as [number, number, number]
    const [width, height, mipDepth] = _MipExtent(dstTexDesc, copyOp.mipLevel)
    const layers = dstTexDesc.type === HgiTextureType.HgiTextureType2DArray ||
      dstTexDesc.type === HgiTextureType.HgiTextureType1DArray ? dstTexDesc.layerCount : 1
    const depth = dstTexDesc.type === HgiTextureType.HgiTextureType3D ? mipDepth : layers
    const rows = Math.ceil(height / block.blockHeight)
    // hgiMetal/blitCmds.mm:256: bytesPerRow = bufferByteSize / height.
    const packedBytesPerRow = Math.floor(copyOp.bufferByteSize / (rows * depth))
    const bytesPerRow = HgiWebGPUAlign(packedBytesPerRow, _rowAlignment)
    const src = HgiWebGPUBytes(copyOp.cpuSourceBuffer, 0, copyOp.bufferByteSize)
    const staged = new Uint8Array(bytesPerRow * rows * depth)
    for (let row = 0; row < rows * depth; row++) {
      staged.set(src.subarray(row * packedBytesPerRow, (row + 1) * packedBytesPerRow), row * bytesPerRow)
    }
    this._commandEncoder!.copyBufferToTexture(
      { buffer: this._stagingUpload(staged), bytesPerRow, rowsPerImage: rows },
      { texture: dstTexture.getTextureId()!, mipLevel: copyOp.mipLevel,
        origin: { x: ox, y: oy, z: isTexArray ? 0 : oz } },
      {
        width: Math.ceil(width / block.blockWidth) * block.blockWidth,
        height: rows * block.blockHeight,
        depthOrArrayLayers: depth,
      })
  }

  /** hgiMetal/blitCmds.mm:290-338 */
  copyBufferGpuToGpu(copyOp: HgiBufferGpuToGpuOp): void {
    const srcBuffer = copyOp.gpuSourceBuffer.Get() as HgiWebGPUBuffer | null
    if (!TF_VERIFY(srcBuffer && srcBuffer.getBufferId(), 'Invalid source buffer handle')) {
      return
    }
    const dstBuffer = copyOp.gpuDestinationBuffer.Get() as HgiWebGPUBuffer | null
    if (!TF_VERIFY(dstBuffer && dstBuffer.getBufferId(), 'Invalid destination buffer handle')) {
      return
    }
    if (copyOp.byteSize === 0) {
      TF_WARN('The size of the data to copy was zero (aborted)')
      return
    }
    if ((copyOp.sourceByteOffset | copyOp.destinationByteOffset | copyOp.byteSize) % 4 !== 0) {
      // WebGPU copies whole 4-byte words.
      TF_CODING_ERROR('HgiWebGPU: buffer copies must be 4-byte aligned')
      return
    }
    this._written.add(dstBuffer!)
    if (srcBuffer === dstBuffer) {
      // Storm copies between two ranges of one buffer (HdStCopyComputationGPU
      // migrating a range into a new range of the same buffer array,
      // hdSt/copyComputation.cpp:31-102), which Metal's
      // copyFromBuffer:toBuffer: (blitCmds.mm:317-321) records as is;
      // WebGPU rejects copyBufferToBuffer with source equal to destination,
      // so the bytes go through a transient buffer in command order.
      const temp = this._device.createBuffer({
        label: 'HgiWebGPUBlitCmds self copy', size: copyOp.byteSize,
        usage: GPUBufferUsageFlags.COPY_SRC | GPUBufferUsageFlags.COPY_DST,
      })
      this._transient.push(temp)
      const buffer = srcBuffer!.getBufferId()!
      this._commandEncoder!.copyBufferToBuffer(buffer, copyOp.sourceByteOffset, temp, 0, copyOp.byteSize)
      this._commandEncoder!.copyBufferToBuffer(temp, 0, buffer, copyOp.destinationByteOffset, copyOp.byteSize)
      return
    }
    this._commandEncoder!.copyBufferToBuffer(
      srcBuffer!.getBufferId()!, copyOp.sourceByteOffset,
      dstBuffer!.getBufferId()!, copyOp.destinationByteOffset,
      copyOp.byteSize)
  }

  /** hgiMetal/blitCmds.mm:340-381. Metal writes shared memory directly; the
   *  bytes are staged and copied inside this command buffer here so they
   *  land in command order. The staging address of HgiWebGPUBuffer
   *  (GetCPUStagingAddress) is an ordinary source. */
  copyBufferCpuToGpu(copyOp: HgiBufferCpuToGpuOp): void {
    if (copyOp.byteSize === 0 ||
        !copyOp.cpuSourceBuffer ||
        !copyOp.gpuDestinationBuffer.isSet()) {
      return
    }
    const hgiBuffer = copyOp.gpuDestinationBuffer.Get() as HgiWebGPUBuffer
    const dstBuffer = hgiBuffer.getBufferId()
    if (!dstBuffer) return
    this._written.add(hgiBuffer)
    const src0 = HgiWebGPUBytes(copyOp.cpuSourceBuffer, copyOp.sourceByteOffset, copyOp.byteSize)
    // Mirror the bytes into the buffer's CPU staging copy (unless they are
    // already there, hgiMetal/blitCmds.mm:358-370).
    const shadow = hgiBuffer.getCPUStagingAddress()
    if (shadow && !(src0.buffer === shadow.buffer && copyOp.sourceByteOffset === copyOp.destinationByteOffset)) {
      shadow.set(src0.subarray(0, Math.max(0, shadow.byteLength - copyOp.destinationByteOffset)),
        copyOp.destinationByteOffset)
    }

    // WebGPU copies whole 4-byte words: widen an unaligned range to the
    // enclosing words, keeping the destination's other bytes from the
    // buffer's CPU staging copy when it has one.
    const start = copyOp.destinationByteOffset & ~3
    const end = HgiWebGPUAlign(copyOp.destinationByteOffset + copyOp.byteSize)
    const src = HgiWebGPUBytes(copyOp.cpuSourceBuffer, copyOp.sourceByteOffset, copyOp.byteSize)
    let bytes = src
    if (start !== copyOp.destinationByteOffset || end !== copyOp.destinationByteOffset + copyOp.byteSize) {
      bytes = new Uint8Array(end - start)
      if (shadow) bytes.set(shadow.subarray(start, Math.min(end, shadow.byteLength)))
      bytes.set(src, copyOp.destinationByteOffset - start)
      if (start + bytes.byteLength > dstBuffer.size) {
        TF_CODING_ERROR('HgiWebGPU: unaligned buffer copy runs past the buffer')
        return
      }
    }
    this._commandEncoder!.copyBufferToBuffer(this._stagingUpload(bytes), 0, dstBuffer, start, bytes.byteLength)
  }

  /** hgiMetal/blitCmds.mm:383-419 */
  copyBufferGpuToCpu(copyOp: HgiBufferGpuToCpuOp): void {
    if (copyOp.byteSize === 0 ||
        !copyOp.cpuDestinationBuffer ||
        !copyOp.gpuSourceBuffer.isSet()) {
      return
    }
    const srcBuffer = (copyOp.gpuSourceBuffer.Get() as HgiWebGPUBuffer).getBufferId()
    if (!srcBuffer) return
    const start = copyOp.sourceByteOffset & ~3
    const end = HgiWebGPUAlign(copyOp.sourceByteOffset + copyOp.byteSize)
    const staging = this._device.createBuffer({
      label: 'HgiWebGPUBlitCmds readback',
      size: end - start,
      usage: GPUBufferUsageFlags.MAP_READ | GPUBufferUsageFlags.COPY_DST,
    })
    this._commandEncoder!.copyBufferToBuffer(srcBuffer, start, staging, 0, end - start)
    const dst = HgiWebGPUBytes(copyOp.cpuDestinationBuffer, copyOp.destinationByteOffset, copyOp.byteSize)
    const skip = copyOp.sourceByteOffset - start
    this._readbacks.push({
      staging,
      unpack: mapped => dst.set(mapped.subarray(skip, skip + copyOp.byteSize)),
    })
  }

  /** hgiVulkan/blitCmds.cpp CopyTextureToBuffer (hgiMetal leaves it
   *  unimplemented, blitCmds.mm:421-425). The destination rows are tightly
   *  packed; WebGPU copies 256-byte aligned rows, so unaligned rows go
   *  through an aligned buffer and are copied row by row. */
  copyTextureToBuffer(copyOp: HgiTextureToBufferOp): void {
    const srcTexture = copyOp.gpuSourceTexture.Get() as HgiWebGPUTexture | null
    const hgiBuffer = copyOp.gpuDestinationBuffer.Get() as HgiWebGPUBuffer | null
    const dstBuffer = hgiBuffer?.getBufferId()
    if (!srcTexture?.getTextureId() || !dstBuffer) {
      TF_CODING_ERROR('HgiWebGPU: CopyTextureToBuffer with an invalid texture or buffer')
      return
    }
    this._written.add(hgiBuffer!)
    const desc = srcTexture.getDescriptor()
    const block = _Block(desc)
    const [ox, oy, oz] = copyOp.sourceTexelOffset.data as [number, number, number]
    const [mw, mh, md] = _MipExtent(desc, copyOp.mipLevel)
    const width = mw - ox
    const height = mh - oy
    const depth = Math.max(md - oz, 1)
    const rows = Math.ceil(height / block.blockHeight) * depth
    const packed = Math.ceil(width / block.blockWidth) * block.bytes
    const copySize = { width, height, depthOrArrayLayers: depth }
    const source = { texture: srcTexture.getTextureId()!, mipLevel: copyOp.mipLevel, origin: { x: ox, y: oy, z: oz } }
    if (packed % _rowAlignment === 0 && copyOp.destinationByteOffset % 4 === 0) {
      this._commandEncoder!.copyTextureToBuffer(source,
        { buffer: dstBuffer, offset: copyOp.destinationByteOffset, bytesPerRow: packed,
          rowsPerImage: Math.ceil(height / block.blockHeight) }, copySize)
      return
    }
    if (packed % 4 !== 0 || copyOp.destinationByteOffset % 4 !== 0) {
      TF_CODING_ERROR('HgiWebGPU: CopyTextureToBuffer rows must be 4-byte aligned')
      return
    }
    const aligned = HgiWebGPUAlign(packed, _rowAlignment)
    const temp = this._device.createBuffer({
      label: 'HgiWebGPUBlitCmds repack', size: aligned * rows,
      usage: GPUBufferUsageFlags.COPY_SRC | GPUBufferUsageFlags.COPY_DST,
    })
    this._transient.push(temp)
    this._commandEncoder!.copyTextureToBuffer(source,
      { buffer: temp, bytesPerRow: aligned, rowsPerImage: Math.ceil(height / block.blockHeight) }, copySize)
    for (let row = 0; row < rows; row++) {
      this._commandEncoder!.copyBufferToBuffer(temp, row * aligned, dstBuffer,
        copyOp.destinationByteOffset + row * packed, packed)
    }
  }

  /** hgiVulkan/blitCmds.cpp CopyBufferToTexture (hgiMetal leaves it
   *  unimplemented, blitCmds.mm:427-431). */
  copyBufferToTexture(copyOp: HgiBufferToTextureOp): void {
    const dstTexture = copyOp.gpuDestinationTexture.Get() as HgiWebGPUTexture | null
    const srcBuffer = (copyOp.gpuSourceBuffer.Get() as HgiWebGPUBuffer | null)?.getBufferId()
    if (!dstTexture?.getTextureId() || !srcBuffer) {
      TF_CODING_ERROR('HgiWebGPU: CopyBufferToTexture with an invalid texture or buffer')
      return
    }
    const desc = dstTexture.getDescriptor()
    const block = _Block(desc)
    const [ox, oy, oz] = copyOp.destinationTexelOffset.data as [number, number, number]
    const [mw, mh, md] = _MipExtent(desc, copyOp.mipLevel)
    const width = mw - ox
    const height = mh - oy
    const depth = Math.max(md - oz, 1)
    const rows = Math.ceil(height / block.blockHeight) * depth
    const packed = Math.ceil(width / block.blockWidth) * block.bytes
    const copySize = { width, height, depthOrArrayLayers: depth }
    const destination = { texture: dstTexture.getTextureId()!, mipLevel: copyOp.mipLevel, origin: { x: ox, y: oy, z: oz } }
    if (packed % _rowAlignment === 0 && copyOp.sourceByteOffset % 4 === 0) {
      this._commandEncoder!.copyBufferToTexture(
        { buffer: srcBuffer, offset: copyOp.sourceByteOffset, bytesPerRow: packed,
          rowsPerImage: Math.ceil(height / block.blockHeight) }, destination, copySize)
      return
    }
    if (packed % 4 !== 0 || copyOp.sourceByteOffset % 4 !== 0) {
      TF_CODING_ERROR('HgiWebGPU: CopyBufferToTexture rows must be 4-byte aligned')
      return
    }
    const aligned = HgiWebGPUAlign(packed, _rowAlignment)
    const temp = this._device.createBuffer({
      label: 'HgiWebGPUBlitCmds repack', size: aligned * rows,
      usage: GPUBufferUsageFlags.COPY_SRC | GPUBufferUsageFlags.COPY_DST,
    })
    this._transient.push(temp)
    for (let row = 0; row < rows; row++) {
      this._commandEncoder!.copyBufferToBuffer(srcBuffer, copyOp.sourceByteOffset + row * packed,
        temp, row * aligned, packed)
    }
    this._commandEncoder!.copyBufferToTexture(
      { buffer: temp, bytesPerRow: aligned, rowsPerImage: Math.ceil(height / block.blockHeight) },
      destination, copySize)
  }

  /** hgiMetal/blitCmds.mm:433-445. WebGPU clears buffers to zero only; other
   *  values are staged. */
  fillBuffer(buffer: HgiBufferHandle, value: number): void {
    const buf = buffer.Get() as HgiWebGPUBuffer | null
    const gpuBuffer = buf?.getBufferId()
    if (!buf || !gpuBuffer) return
    this._written.add(buf)
    const length = HgiWebGPUAlign(buf.getDescriptor().byteSize)
    if ((value & 0xff) === 0) {
      this._commandEncoder!.clearBuffer(gpuBuffer, 0, length)
    } else {
      this._commandEncoder!.copyBufferToBuffer(
        this._stagingUpload(new Uint8Array(length).fill(value & 0xff)), 0, gpuBuffer, 0, length)
    }
  }

  /** hgiMetal/blitCmds.mm:487-498. WebGPU has no mipmap generation command;
   *  each level is rendered from the previous one with a linear sampler
   *  (HgiWebGPU::_GetMipmapPipeline), for the textures Metal filters
   *  (_HgiTextureCanBeFiltered, blitCmds.mm:447-485) and that WebGPU can
   *  render to. */
  generateMipMaps(texture: HgiTextureHandle): void {
    const tex = texture.Get() as HgiWebGPUTexture | null
    if (!tex) return
    const desc = tex.getDescriptor()
    if (!_HgiTextureCanBeFiltered(desc) || desc.mipLevels <= 1) return
    const gpuTexture = tex.getTextureId()
    const format = tex.getGpuFormat()
    if (!gpuTexture || !format) return
    // Each layer (a cubemap's faces included) is rendered level by level
    // through 2D views.
    if (desc.type !== HgiTextureType.HgiTextureType2D &&
        desc.type !== HgiTextureType.HgiTextureType2DArray &&
        desc.type !== HgiTextureType.HgiTextureTypeCubemap) {
      TF_CODING_ERROR(`HgiWebGPU: GenerateMipMaps supports 2D textures only ('${desc.debugName}')`)
      return
    }
    const pipeline = this._hgi._getMipmapPipeline(format)
    if (!pipeline || !(gpuTexture.usage & 0x10)) {
      TF_CODING_ERROR(`HgiWebGPU: cannot render mipmaps of ${format} ('${desc.debugName}')`)
      return
    }
    const sampler = this._hgi._getMipmapSampler()
    for (let layer = 0; layer < gpuTexture.depthOrArrayLayers; layer++) {
      for (let level = 1; level < gpuTexture.mipLevelCount; level++) {
        const view = (mip: number) => gpuTexture.createView({
          dimension: '2d', baseMipLevel: mip, mipLevelCount: 1, baseArrayLayer: layer, arrayLayerCount: 1,
        })
        const bindGroup = this._device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: sampler }, { binding: 1, resource: view(level - 1) }],
        })
        const pass = this._commandEncoder!.beginRenderPass({
          colorAttachments: [{ view: view(level), loadOp: 'clear', storeOp: 'store' }],
        })
        pass.setPipeline(pipeline)
        pass.setBindGroup(0, bindGroup)
        pass.draw(3)
        pass.end()
      }
    }
  }

  /** hgiMetal/blitCmds.mm:500-505 */
  insertMemoryBarrier(barrier: HgiMemoryBarrier): void {
    TF_VERIFY(barrier === HgiMemoryBarrierBits.HgiMemoryBarrierAll, 'Unknown barrier')
    // Do nothing. All blit work will be visible to next encoder.
  }

  /** hgiMetal/blitCmds.mm:507-547. The returned promise settles after the
   *  GPU-to-CPU copies have been written to their destinations, so callers
   *  that waited until completed see the data, as upstream. */
  override _submit(_hgi: Hgi, wait: HgiSubmitWaitType): boolean | Promise<boolean> {
    if (!this._commandEncoder) return false
    const queue = this._device.queue
    queue.submit([this._commandEncoder.finish()])
    this._commandEncoder = null
    for (const b of this._written) b._noteWrite()
    this._written.clear()

    const transient = this._transient.splice(0)
    const readbacks = this._readbacks.splice(0)
    const done = Promise.all(readbacks.map(async r => {
      await r.staging.mapAsync(GPUMapModeFlags.READ)
      r.unpack(new Uint8Array(r.staging.getMappedRange()))
      r.staging.unmap()
      r.staging.destroy()
    })).then(async () => {
      await queue.onSubmittedWorkDone()
      for (const b of transient) b.destroy()
      return true
    })
    if (wait === HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted || readbacks.length > 0) {
      return done
    }
    return true
  }
}

/** _HgiTextureCanBeFiltered (hgiMetal/blitCmds.mm:447-485) */
function _HgiTextureCanBeFiltered(descriptor: HgiTextureDesc): boolean {
  const componentFormat = HgiGetComponentBaseFormat(descriptor.format)

  if (componentFormat === HgiFormat.HgiFormatInt16 ||
      componentFormat === HgiFormat.HgiFormatUInt16 ||
      componentFormat === HgiFormat.HgiFormatInt32) {
    return false
  }

  const [x, y, z] = descriptor.dimensions.data as [number, number, number]
  switch (descriptor.type) {
    case HgiTextureType.HgiTextureType1D:
    case HgiTextureType.HgiTextureType1DArray:
      return x > 1
    case HgiTextureType.HgiTextureType2D:
    case HgiTextureType.HgiTextureType2DArray:
    case HgiTextureType.HgiTextureTypeCubemap:
      return x > 1 || y > 1
    case HgiTextureType.HgiTextureType3D:
      return x > 1 || y > 1 || z > 1
    default:
      TF_CODING_ERROR('Unsupported HgiTextureType enum value')
      return false
  }
}
