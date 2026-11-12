// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/buffer.h,
//  pxr/imaging/hgiMetal/buffer.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUBuffer. Modelled on pxr/imaging/hgiMetal/buffer.{h,mm}.

import { HgiBuffer, type HgiBufferDesc, type HgiCpuData } from 'typescript-usd/hgi'
import { HgiWebGPUConversions } from './conversions.ts'

/** A byte view of HgiCpuData (`void const*` upstream). */
export function HgiWebGPUBytes(data: HgiCpuData, byteOffset = 0, byteSize?: number): Uint8Array {
  const view = ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data)
  return view.subarray(byteOffset, byteSize === undefined ? undefined : byteOffset + byteSize)
}

/** WebGPU buffer sizes and copy sizes are multiples of 4 bytes. */
export function HgiWebGPUAlign(size: number, alignment = 4): number {
  return Math.ceil(size / alignment) * alignment
}

export class HgiWebGPUBuffer extends HgiBuffer {
  private _bufferId: GPUBuffer | null
  private _staging: Uint8Array | null = null
  /** Counts the submitted work that can have written the buffer's contents
   *  (_noteWrite). */
  private _writeVersion = 0

  /** hgiMetal/buffer.mm:19-39 */
  constructor(device: GPUDevice, desc: HgiBufferDesc) {
    super(desc)

    const size = HgiWebGPUAlign(Math.max(desc.byteSize, 4))
    const initialData = desc.initialData
    this._bufferId = device.createBuffer({
      label: desc.debugName,
      size,
      usage: HgiWebGPUConversions.getBufferUsage(desc.usage),
      mappedAtCreation: Boolean(initialData),
    })
    if (initialData) {
      const bytes = HgiWebGPUBytes(initialData, 0, Math.min(desc.byteSize,
        ArrayBuffer.isView(initialData) ? initialData.byteLength : initialData.byteLength))
      new Uint8Array(this._bufferId.getMappedRange()).set(bytes)
      this._bufferId.unmap()
      // Keep a CPU copy of the contents for GetCPUStagingAddress, as Metal's
      // shared buffer contents hold the initial data.
      this._staging = new Uint8Array(desc.byteSize)
      this._staging.set(bytes.subarray(0, desc.byteSize))
    }

    this._descriptor.initialData = null
  }

  /** hgiMetal/buffer.mm:41-48 */
  _destroy(): void {
    this._bufferId?.destroy()
    this._bufferId = null
  }

  /** hgiMetal/buffer.mm:50-54 */
  getByteSizeOfResource(): number {
    return this._descriptor.byteSize
  }

  /** hgiMetal/buffer.mm:56-60 */
  getRawResource(): GPUBuffer | null {
    return this._bufferId
  }

  getBufferId(): GPUBuffer | null {
    return this._bufferId
  }

  /** The write version (_noteWrite): equal versions of one buffer mean no
   *  GPU work written to it was submitted in between. */
  _getWriteVersion(): number {
    return this._writeVersion
  }

  /** Called by each path that writes the buffer's GPU contents when that
   *  work is submitted: HgiWebGPUBlitCmds (CPU and GPU copies into it,
   *  texture-to-buffer copies, fills) and the compute and graphics cmds
   *  that bind it as writable storage. The initial data is version 0.
   *  PLATFORM-DIVERGENCE(webgpu-storage-buffer-limit): the packed pulled
   *  attributes (HgiWebGPUPulledAttributePacker) copy again only the
   *  buffers whose version changed. */
  _noteWrite(): void {
    this._writeVersion++
  }

  /** hgiMetal/buffer.mm:62-68. WebGPU buffers are not mapped while the GPU
   *  may use them, so the staging memory is CPU-side; clients pass it to
   *  HgiBlitCmds::CopyBufferCpuToGpu as hgiVulkan's staging buffer is
   *  (hgiVulkan/buffer.cpp GetCPUStagingAddress). It mirrors the initial
   *  data and every CopyBufferCpuToGpu into the buffer; writes made by the
   *  GPU are not reflected, as with a managed Metal buffer. */
  getCPUStagingAddress(): Uint8Array | null {
    if (!this._bufferId) return null
    this._staging ??= new Uint8Array(this._descriptor.byteSize)
    return this._staging
  }
}
