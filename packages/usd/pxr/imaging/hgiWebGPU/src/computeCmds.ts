// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/computeCmds.h,
//  pxr/imaging/hgiMetal/computeCmds.mm, pxr/imaging/hgiVulkan/computeCmds.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUComputeCmds. Modelled on pxr/imaging/hgiMetal/computeCmds.{h,mm}
// for the encoder and binding, and hgiVulkan/computeCmds.cpp for Dispatch:
// WebGPU, like Vulkan, dispatches whole workgroups of the shader's local
// size (hgiVulkan/computeCmds.cpp:121-155), where Metal dispatches threads.

import {
  HgiCmds,
  HgiComputeCmds,
  HgiMemoryBarrierBits,
  HgiSubmitWaitType,
  type Hgi,
  type HgiComputeCmdsDesc,
  type HgiComputeDispatch,
  type HgiComputePipelineHandle,
  type HgiCpuData,
  type HgiMemoryBarrier,
  type HgiResourceBindingsHandle,
} from 'typescript-usd/hgi'
import type { Vec4f as GfVec4f } from 'typescript-usd/gf'
import type { HgiWebGPUBuffer } from './buffer.ts'
import type { HgiWebGPUComputePipeline } from './computePipeline.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './diagnostic.ts'
import type { HgiWebGPU } from './hgi.ts'
import type { HgiWebGPUTexture } from './texture.ts'
import {
  HgiWebGPUConstantsAllocator,
  HgiWebGPUResourceBindings,
} from './resourceBindings.ts'

export class HgiWebGPUComputeCmds extends HgiComputeCmds {
  private _commandEncoder: GPUCommandEncoder | null
  private _encoder: GPUComputePassEncoder | null = null
  private _pipelineState: HgiWebGPUComputePipeline | null = null
  private _skipDispatches = false
  private _resourceBindings: HgiWebGPUResourceBindings | null = null
  private _resourcesDirty = false
  private readonly _constants: HgiWebGPUConstantsAllocator
  private readonly _dispatchMethod: HgiComputeDispatch
  /** The depth copies of the depth textures the dispatches sample as float
   *  textures (depthSampling.ts), submitted before them. */
  private _depthReadEncoder: GPUCommandEncoder | null = null
  private readonly _depthReads = new Set<HgiWebGPUTexture>()
  private readonly _depthRead = (texture: HgiWebGPUTexture): void => {
    if (this._depthReads.has(texture)) return
    this._depthReads.add(texture)
    const device = this._hgi.getPrimaryDevice()
    this._depthReadEncoder ??= device.createCommandEncoder({ label: 'HgiWebGPUComputeCmds depth sampling' })
    texture.encodeShaderRead(device, this._depthReadEncoder)
  }
  /** The buffers the dispatches bind as writable storage, whose write
   *  version is bumped when this cmds is submitted
   *  (HgiWebGPUBuffer._noteWrite). */
  private readonly _written = new Set<HgiWebGPUBuffer>()
  private readonly _write = (buffer: HgiWebGPUBuffer): void => { this._written.add(buffer) }

  /** hgiMetal/computeCmds.mm:20-33 */
  constructor(private readonly _hgi: HgiWebGPU, desc: HgiComputeCmdsDesc) {
    super()
    const device = _hgi.getPrimaryDevice()
    this._commandEncoder = device.createCommandEncoder({ label: 'HgiWebGPUComputeCmds' })
    this._constants = new HgiWebGPUConstantsAllocator(device,
      _hgi.getCapabilities().minUniformBufferOffsetAlignment)
    this._dispatchMethod = desc.dispatchMethod
  }

  /** hgiMetal/computeCmds.mm:41-57 */
  private _createEncoder(): GPUComputePassEncoder | null {
    if (!this._encoder && this._commandEncoder) {
      this._encoder = this._commandEncoder.beginComputePass({ label: 'HgiWebGPUComputeCmds' })
    }
    return this._encoder
  }

  /** hgiMetal/computeCmds.mm:67-73 */
  bindPipeline(pipeline: HgiComputePipelineHandle): void {
    const encoder = this._createEncoder()
    const p = pipeline.Get() as HgiWebGPUComputePipeline | null
    const state = p?.getComputePipelineState()
    if (p?.exceedsDeviceLimits()) {
      // Reported when it was created (HgiWebGPUComputePipeline); its
      // dispatches are skipped.
      this._pipelineState = null
      this._skipDispatches = true
      return
    }
    this._skipDispatches = false
    if (!encoder || !p || !state) {
      TF_CODING_ERROR('HgiWebGPU: BindPipeline with an invalid compute pipeline')
      return
    }
    this._pipelineState = p
    encoder.setPipeline(state)
    const layouts = p.getBindGroupLayouts()
    layouts.layouts.forEach((layout, group) => {
      if (layouts.entries[group]!.length === 0) {
        encoder.setBindGroup(group, this._hgi._getEmptyBindGroup(layout))
      }
    })
    this._resourcesDirty = true
  }

  /** hgiMetal/computeCmds.mm:75-86 */
  bindResources(r: HgiResourceBindingsHandle): void {
    this._resourceBindings = r.Get() as HgiWebGPUResourceBindings | null
    this._resourcesDirty = true
  }

  /** hgiMetal/computeCmds.mm:88-100 */
  setConstantValues(
    pipeline: HgiComputePipelineHandle,
    _bindIndex: number,
    byteSize: number,
    data: HgiCpuData,
  ): void {
    const encoder = this._createEncoder()
    const p = pipeline.Get() as HgiWebGPUComputePipeline | null
    if (!encoder || !p || p.exceedsDeviceLimits()) return
    HgiWebGPUResourceBindings.setConstantValues(
      this._constants, encoder, p.getBindGroupLayouts(), byteSize, data)
  }

  /** hgiVulkan/computeCmds.cpp:121-155 */
  Dispatch(dimX: number, dimY: number): void {
    if (dimX === 0 || dimY === 0) {
      return
    }
    if (this._skipDispatches) return
    const encoder = this._createEncoder()
    if (!encoder || !this._pipelineState) {
      TF_CODING_ERROR('HgiWebGPU: dispatch without a bound pipeline')
      return
    }
    if (this._resourcesDirty && this._resourceBindings) {
      this._resourceBindings.bindResources(this._hgi.getPrimaryDevice(), encoder,
        this._pipelineState.getBindGroupLayouts(), this._depthRead, this._write)
    }
    this._resourcesDirty = false

    const [threadsPerGroupX, threadsPerGroupY] = this._pipelineState.getLocalWorkGroupSize()
    let numWorkGroupsX = Math.floor((dimX + (threadsPerGroupX - 1)) / threadsPerGroupX)
    let numWorkGroupsY = Math.floor((dimY + (threadsPerGroupY - 1)) / threadsPerGroupY)

    // Determine device's num compute work group limits
    const maxNumWorkGroups = this._hgi.getCapabilities().maxComputeWorkgroupsPerDimension
    if (numWorkGroupsX > maxNumWorkGroups) {
      TF_WARN(`Max number of work group available from device is ${maxNumWorkGroups}, ` +
        `larger than ${numWorkGroupsX}`)
      numWorkGroupsX = maxNumWorkGroups
    }
    if (numWorkGroupsY > maxNumWorkGroups) {
      TF_WARN(`Max number of work group available from device is ${maxNumWorkGroups}, ` +
        `larger than ${numWorkGroupsY}`)
      numWorkGroupsY = maxNumWorkGroups
    }

    encoder.dispatchWorkgroups(numWorkGroupsX, numWorkGroupsY, 1)
  }

  /** hgiMetal/computeCmds.mm:147-154 */
  pushDebugGroup(label: string, _color: GfVec4f = HgiCmds.s_computeDebugColor): void {
    this._createEncoder()?.pushDebugGroup(label)
  }

  /** hgiMetal/computeCmds.mm:156-162 */
  popDebugGroup(): void {
    this._encoder?.popDebugGroup()
  }

  /** hgiMetal/computeCmds.mm:164-176 */
  insertDebugMarker(label: string, _color: GfVec4f = HgiCmds.s_markerDebugColor): void {
    this._createEncoder()?.insertDebugMarker(label)
  }

  /** hgiMetal/computeCmds.mm:178-187. Dispatches in one WebGPU compute pass
   *  see each other's writes; nothing to record. */
  insertMemoryBarrier(barrier: HgiMemoryBarrier): void {
    TF_VERIFY(barrier === HgiMemoryBarrierBits.HgiMemoryBarrierAll, 'Unknown barrier')
  }

  /** hgiMetal/computeCmds.mm:189-193 */
  getDispatchMethod(): HgiComputeDispatch {
    return this._dispatchMethod
  }

  /** hgiMetal/computeCmds.mm:195-227 */
  override _submit(_hgi: Hgi, wait: HgiSubmitWaitType): boolean | Promise<boolean> {
    if (!this._commandEncoder) return false
    this._encoder?.end()
    this._encoder = null
    const queue = this._hgi.getPrimaryDevice().queue
    if (this._depthReadEncoder) {
      this._hgi._submitNow([this._depthReadEncoder.finish()])
      this._depthReadEncoder = null
      this._depthReads.clear()
    }
    this._constants.flush()
    this._hgi._submitNow([this._commandEncoder.finish()])
    this._commandEncoder = null
    for (const b of this._written) b._noteWrite()
    this._written.clear()
    const done = queue.onSubmittedWorkDone().then(() => {
      this._constants.destroy()
      return true
    })
    return wait === HgiSubmitWaitType.HgiSubmitWaitTypeWaitUntilCompleted ? done : true
  }
}
