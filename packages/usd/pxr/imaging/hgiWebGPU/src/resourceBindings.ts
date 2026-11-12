// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/resourceBindings.h,
//  pxr/imaging/hgiMetal/resourceBindings.mm,
//  pxr/imaging/hgiVulkan/descriptorSetLayouts.cpp
// Copyright 2020, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUResourceBindings. Modelled on
// pxr/imaging/hgiMetal/resourceBindings.{h,mm}: like Metal, which encodes the
// buffers, textures and samplers into an argument buffer when they are bound
// to an encoder (resourceBindings.mm:26-296), the WebGPU bind groups are made
// at bind time, against the layouts of the pipeline bound then, and cached
// per layout. (A WebGPU bind group must match its pipeline's layout; the
// layout comes from the shader program, hgiVulkan/descriptorSetLayouts.cpp.)

import {
  HgiResourceBindings,
  type HgiCpuData,
  type HgiResourceBindingsDesc,
} from 'typescript-usd/hgi'
import {
  HgiWebGPUBufferBindGroup,
  HgiWebGPUConstantsBindGroup,
  HgiWebGPUSamplerBindGroup,
  HgiWebGPUTextureBindGroup,
  type HgiWebGPUBindGroupLayouts,
} from './bindGroupLayouts.ts'
import { HgiWebGPUAlign, HgiWebGPUBytes, type HgiWebGPUBuffer } from './buffer.ts'
import { TF_CODING_ERROR } from './diagnostic.ts'
import type { HgiWebGPUSampler } from './sampler.ts'
import {
  HgiWebGPUBorderFootprintBinding,
  HgiWebGPUAcquireBorderFootprint,
  HgiWebGPUSamplerStateBinding,
  HgiWebGPUSamplerStateData,
  HgiWebGPUSamplerStateFloats,
  HgiWebGPUSamplerUsesBorder,
} from './samplerState.ts'
import type { HgiWebGPUTexture } from './texture.ts'

type PassEncoder = GPURenderPassEncoder | GPUComputePassEncoder

export class HgiWebGPUResourceBindings extends HgiResourceBindings {
  private readonly _bindGroups = new WeakMap<GPUBindGroupLayout, GPUBindGroup | null>()
  /** The depth textures each bind group samples through their float copy
   *  (depthSampling.ts). */
  private readonly _depthReads = new WeakMap<GPUBindGroup, HgiWebGPUTexture[]>()
  /** The buffers each bind group binds as writable storage. */
  private readonly _writes = new WeakMap<GPUBindGroup, HgiWebGPUBuffer[]>()
  private _samplerState: GPUBuffer | null = null

  /** hgiMetal/resourceBindings.mm:17-21 */
  constructor(desc: HgiResourceBindingsDesc) {
    super(desc)
  }

  /** hgiMetal/resourceBindings.mm:23-24 (the destructor): frees the
   *  sampler state buffer (HgiWebGPUGarbageCollector destroys it once no
   *  recorded work uses it). */
  _destroy(): void {
    this._samplerState?.destroy()
    this._samplerState = null
  }

  /** hgiMetal/resourceBindings.mm:26-193 (render) and :195-296 (compute):
   *  set the buffer, texture and sampler bind groups of the bound pipeline.
   *  `depthRead` is called with each depth texture the bound groups sample
   *  through its float copy (depthSampling.ts), which the cmds fill before
   *  their pass, and `write` with each buffer they bind as writable
   *  storage, whose write version the cmds bump when they are submitted
   *  (HgiWebGPUBuffer._noteWrite). */
  bindResources(device: GPUDevice, encoder: PassEncoder, layouts: HgiWebGPUBindGroupLayouts,
    depthRead: (texture: HgiWebGPUTexture) => void, write: (buffer: HgiWebGPUBuffer) => void): void {
    for (const group of [HgiWebGPUBufferBindGroup, HgiWebGPUTextureBindGroup, HgiWebGPUSamplerBindGroup]) {
      const layout = layouts.layouts[group]
      const entries = layouts.entries[group]
      if (!layout || !entries || entries.length === 0) continue
      let bindGroup = this._bindGroups.get(layout)
      if (bindGroup === undefined) {
        bindGroup = this._createBindGroup(device, group, layout, entries)
        this._bindGroups.set(layout, bindGroup)
      }
      if (bindGroup) {
        for (const texture of this._depthReads.get(bindGroup) ?? []) depthRead(texture)
        for (const buffer of this._writes.get(bindGroup) ?? []) write(buffer)
        encoder.setBindGroup(group, bindGroup)
      }
    }
  }

  private _createBindGroup(
    device: GPUDevice,
    group: number,
    layout: GPUBindGroupLayout,
    layoutEntries: readonly GPUBindGroupLayoutEntry[],
  ): GPUBindGroup | null {
    const desc = this._descriptor
    const entries: GPUBindGroupEntry[] = []
    const depthReads: HgiWebGPUTexture[] = []
    const writes: HgiWebGPUBuffer[] = []
    for (const e of layoutEntries) {
      if (group === HgiWebGPUSamplerBindGroup && e.binding === HgiWebGPUSamplerStateBinding) {
        entries.push({ binding: e.binding, resource: { buffer: this._getSamplerStateBuffer(device) } })
        continue
      }
      // The footprint texture and sampler of a border-emulated texture
      // (samplerState.ts).
      if (group !== HgiWebGPUBufferBindGroup && e.binding >= HgiWebGPUBorderFootprintBinding) {
        const index = e.binding - HgiWebGPUBorderFootprintBinding
        const texDesc = desc.textures.find(t => t.bindingIndex <= index && index < t.bindingIndex + Math.max(1, t.textures.length))
        const element = texDesc ? index - texDesc.bindingIndex : 0
        const hgiTexture = texDesc?.textures[element]?.Get() as HgiWebGPUTexture | undefined
        const extent = hgiTexture?.getSampledViewExtent()
        const hgiSampler = texDesc?.samplers[element]?.Get() as HgiWebGPUSampler | undefined
        // A sampler without border addressing reads no footprint: it binds
        // itself and a one-texel footprint (the weight is masked to 0).
        const border = !!hgiSampler && HgiWebGPUSamplerUsesBorder(hgiSampler.getDescriptor())
        const sampler = border ? hgiSampler.getBorderFootprintSamplerId() : hgiSampler?.getSamplerId()
        if (!extent || !sampler) {
          TF_CODING_ERROR(`HgiWebGPU: '${desc.debugName}' border footprint ${index} is invalid`)
          return null
        }
        entries.push({ binding: e.binding, resource: group === HgiWebGPUTextureBindGroup
          ? (border ? hgiTexture!.getBorderFootprintView(device)!
            : HgiWebGPUAcquireBorderFootprint(device, 1, 1, 1, true).view)
          : sampler })
        continue
      }
      if (group === HgiWebGPUBufferBindGroup) {
        const bufDesc = desc.buffers.find(b => b.bindingIndex === e.binding)
        const buf = bufDesc?.buffers[0]?.Get() as HgiWebGPUBuffer | undefined
        const gpuBuffer = buf?.getBufferId()
        if (!bufDesc || !gpuBuffer) {
          TF_CODING_ERROR(`HgiWebGPU: '${desc.debugName}' binds no buffer at index ${e.binding}`)
          return null
        }
        if (e.buffer?.type === 'storage') writes.push(buf!)
        // Each buffer can be an array of buffers (usually one); WebGPU binds
        // one buffer per binding (hgiVulkan/resourceBindings.cpp:253-264).
        // As hgiVulkan (range = VK_WHOLE_SIZE, :262) and hgiMetal (offset
        // only, resourceBindings.mm:134) do, the buffer is bound from its
        // offset to its end and bufDesc.sizes is not used: Storm binds an
        // interleaved uniform array (a lighting shader's lightSource[N]) with
        // the size of one element (hdSt/resourceBinder.cpp:1155-1163).
        entries.push({
          binding: e.binding,
          resource: {
            buffer: gpuBuffer,
            offset: bufDesc.offsets[0] ?? 0,
          },
        })
      } else {
        // An array of textures binds its element i at bindingIndex + i
        // (HgiWebGPUShaderGenerator._WriteArrayOfTextures), as hgiGL binds
        // consecutive units (hgiGL/resourceBindings.cpp:38-80).
        const texDesc = desc.textures.find(t => t.bindingIndex === e.binding) ??
          desc.textures.find(t => t.textures.length > 1 &&
            e.binding > t.bindingIndex && e.binding < t.bindingIndex + t.textures.length)
        const element = texDesc ? e.binding - texDesc.bindingIndex : 0
        if (!texDesc) {
          TF_CODING_ERROR(`HgiWebGPU: '${desc.debugName}' binds no texture at index ${e.binding}`)
          return null
        }
        if (group === HgiWebGPUTextureBindGroup) {
          const tex = texDesc.textures[element]?.Get() as HgiWebGPUTexture | undefined
          // A depth texture under a binding that does not declare one is
          // sampled through its float copy (depthSampling.ts).
          const depthCopy = !e.storageTexture && e.texture?.sampleType !== 'depth' &&
            !!tex?.isSampledThroughDepthCopy()
          if (depthCopy) depthReads.push(tex!)
          const view = e.storageTexture ? tex?.getStorageTextureView()
            : depthCopy ? tex!.getShaderReadView(device) : tex?.getTextureView()
          if (!view) {
            TF_CODING_ERROR(`HgiWebGPU: '${desc.debugName}' texture ${e.binding} is invalid`)
            return null
          }
          entries.push({ binding: e.binding, resource: view })
        } else {
          // One sampler per element (hgiVulkan/resourceBindings.cpp:304-311).
          const sampler = (texDesc.samplers[element]?.Get() as HgiWebGPUSampler | undefined)?.getSamplerId()
          if (!sampler) {
            TF_CODING_ERROR(`HgiWebGPU: '${desc.debugName}' sampler ${e.binding} is invalid`)
            return null
          }
          entries.push({ binding: e.binding, resource: sampler })
        }
      }
    }
    const bindGroup = device.createBindGroup({ label: `${desc.debugName} ${group}`, layout, entries })
    if (depthReads.length) this._depthReads.set(bindGroup, depthReads)
    if (writes.length) this._writes.set(bindGroup, writes)
    return bindGroup
  }

  /** The sampler state of the bound samplers, indexed by bind index, for
   *  the clamp-to-border emulation (samplerState.ts). Samplers and their
   *  descriptors are immutable, so it is written once. */
  private _getSamplerStateBuffer(device: GPUDevice): GPUBuffer {
    if (this._samplerState) return this._samplerState
    const textures = this._descriptor.textures
    const count = Math.max(1, ...textures.map(t => t.bindingIndex + Math.max(1, t.textures.length)))
    const buffer = device.createBuffer({
      label: `${this._descriptor.debugName} sampler state`,
      size: count * HgiWebGPUSamplerStateFloats * 4,
      usage: 0x0040, // UNIFORM
      mappedAtCreation: true,
    })
    const data = new Float32Array(buffer.getMappedRange())
    for (const t of textures) {
      // An array of textures: element i at bindingIndex + i.
      t.samplers.forEach((handle, i) => {
        const sampler = handle?.Get() as HgiWebGPUSampler | undefined
        const texture = t.textures[i]?.Get() as HgiWebGPUTexture | undefined
        if (sampler) {
          data.set(HgiWebGPUSamplerStateData(sampler.getDescriptor(), texture?.getDescriptor().componentMapping),
            (t.bindingIndex + i) * HgiWebGPUSamplerStateFloats)
        }
      })
    }
    buffer.unmap()
    this._samplerState = buffer
    return buffer
  }

  /** HgiMetalResourceBindings::SetConstantValues
   *  (hgiMetal/resourceBindings.mm:298-311). Metal copies the constants into
   *  a reserved range of the argument buffer; WebGPU has no push constants,
   *  so they go to a slice of a uniform buffer bound with a dynamic offset at
   *  @group(3) @binding(0) (see HgiWebGPUBlockShaderSection). `bindIndex` and
   *  `stages` are not needed: every function of a program reads the same
   *  constants block. */
  static setConstantValues(
    allocator: HgiWebGPUConstantsAllocator,
    encoder: PassEncoder,
    layouts: HgiWebGPUBindGroupLayouts,
    byteSize: number,
    data: HgiCpuData,
  ): void {
    const layout = layouts.layouts[HgiWebGPUConstantsBindGroup]
    if (!layout || (layouts.entries[HgiWebGPUConstantsBindGroup]?.length ?? 0) === 0) {
      TF_CODING_ERROR('HgiWebGPU: the bound pipeline declares no constant parameters')
      return
    }
    const slot = allocator.allocate(layout, byteSize, HgiWebGPUBytes(data, 0, byteSize))
    encoder.setBindGroup(HgiWebGPUConstantsBindGroup, slot.bindGroup, [slot.offset])
  }
}

/** A slice of one of HgiWebGPUConstantsAllocator's uniform buffers. */
export interface HgiWebGPUUniformSlot {
  buffer: GPUBuffer
  chunkIndex: number
  /** The dynamic offset. */
  offset: number
  /** The binding size. */
  size: number
}

/** Sub-allocates constant parameter blocks from uniform buffers for one
 *  HgiCmds object. Each block is copied to its own offset of a CPU staging
 *  copy of its uniform buffer; Flush() writes each used buffer with one
 *  GPUQueue.writeBuffer before the command buffer is submitted, so every
 *  draw reads the values set before it (the counterpart of Metal's
 *  setVertexBytes, hgiMetal/stepFunctions.mm:76-104, without a queue write
 *  per draw). */
export class HgiWebGPUConstantsAllocator {
  private static readonly _chunkSize = 64 * 1024
  private readonly _chunks: GPUBuffer[] = []
  /** The CPU copy of each chunk and the bytes of it written so far. */
  private readonly _staging: Uint8Array<ArrayBuffer>[] = []
  private readonly _used: number[] = []
  private _offset = HgiWebGPUConstantsAllocator._chunkSize
  private _bindGroups = new WeakMap<GPUBindGroupLayout, Map<number, GPUBindGroup>>()

  constructor(private readonly _device: GPUDevice, private readonly _alignment: number) {}

  /** Copies `bytes` to a fresh slice of a uniform buffer and returns the
   *  slice, for a binding with a dynamic offset. The slice's bytes past
   *  `bytes` are zero. The GPU buffer is written by Flush(). */
  allocateSlot(byteSize: number, bytes: Uint8Array): HgiWebGPUUniformSlot {
    // WGSL rounds a uniform struct up to 16 bytes.
    const bindingSize = HgiWebGPUAlign(Math.max(byteSize, 16), 16)
    if (this._offset + bindingSize > HgiWebGPUConstantsAllocator._chunkSize) {
      this._chunks.push(this._device.createBuffer({
        label: 'HgiWebGPU constants',
        size: HgiWebGPUConstantsAllocator._chunkSize,
        usage: 0x0040 | 0x0008, // UNIFORM | COPY_DST
      }))
      this._staging.push(new Uint8Array(HgiWebGPUConstantsAllocator._chunkSize))
      this._used.push(0)
      this._offset = 0
    }
    const chunkIndex = this._chunks.length - 1
    const chunk = this._chunks[chunkIndex]!
    const offset = this._offset
    this._offset = HgiWebGPUAlign(offset + bindingSize, this._alignment)

    // Slices never overlap and the staging copy starts zeroed, so the
    // padding up to bindingSize stays zero.
    const n = Math.min(bytes.byteLength, bindingSize)
    this._staging[chunkIndex]!.set(n === bytes.byteLength ? bytes : bytes.subarray(0, n), offset)
    this._used[chunkIndex] = offset + bindingSize
    return { buffer: chunk, chunkIndex, offset, size: bindingSize }
  }

  /** Writes the slices allocated since the last Flush() to their uniform
   *  buffers: one GPUQueue.writeBuffer per buffer. Called before the
   *  command buffer that reads them is submitted. */
  flush(): void {
    for (let i = 0; i < this._chunks.length; i++) {
      const used = this._used[i]!
      if (used === 0) continue
      this._device.queue.writeBuffer(this._chunks[i]!, 0, this._staging[i]!, 0, used)
      this._used[i] = 0
    }
  }

  allocate(layout: GPUBindGroupLayout, byteSize: number, bytes: Uint8Array):
    { bindGroup: GPUBindGroup, offset: number } {
    const slot = this.allocateSlot(byteSize, bytes)
    // One bind group per (chunk, binding size): chunks hold at most 64 KiB.
    const key = slot.chunkIndex * 0x20000 + slot.size
    let byLayout = this._bindGroups.get(layout)
    if (!byLayout) {
      byLayout = new Map()
      this._bindGroups.set(layout, byLayout)
    }
    let bindGroup = byLayout.get(key)
    if (!bindGroup) {
      bindGroup = this._device.createBindGroup({
        label: 'HgiWebGPU constants',
        layout,
        entries: [{ binding: 0, resource: { buffer: slot.buffer, offset: 0, size: slot.size } }],
      })
      byLayout.set(key, bindGroup)
    }
    return { bindGroup, offset: slot.offset }
  }

  /** Release the uniform buffers once the commands have completed. */
  destroy(): void {
    for (const chunk of this._chunks) chunk.destroy()
    this._chunks.length = 0
    this._staging.length = 0
    this._used.length = 0
    this._bindGroups = new WeakMap()
  }
}
