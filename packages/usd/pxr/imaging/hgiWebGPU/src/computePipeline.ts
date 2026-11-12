// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/computePipeline.h,
//  pxr/imaging/hgiMetal/computePipeline.mm,
//  pxr/imaging/hgiVulkan/computePipeline.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUComputePipeline. Modelled on
// pxr/imaging/hgiMetal/computePipeline.{h,mm} and the pipeline layout of
// hgiVulkan/computePipeline.cpp.

import {
  HgiComputePipeline,
  type HgiComputePipelineDesc,
} from 'typescript-usd/hgi'
import {
  HgiWebGPUMakeBindGroupLayouts,
  type HgiWebGPUBindGroupLayouts,
} from './bindGroupLayouts.ts'
import { TF_CODING_ERROR, TF_WARN } from './diagnostic.ts'
import type { HgiWebGPUShaderFunction } from './shaderFunction.ts'
import type { HgiWebGPUShaderProgram } from './shaderProgram.ts'

export class HgiWebGPUComputePipeline extends HgiComputePipeline {
  private _computePipelineState: GPUComputePipeline | null = null
  private _bindGroupLayouts: HgiWebGPUBindGroupLayouts = { layouts: [], entries: [] }
  private _exceedsDeviceLimits = false
  private readonly _localWorkGroupSize: [number, number, number] = [1, 1, 1]

  /** hgiMetal/computePipeline.mm:20-49 */
  constructor(device: GPUDevice, desc: HgiComputePipelineDesc) {
    super(desc)

    const program = desc.shaderProgram.Get() as HgiWebGPUShaderProgram | null
    const computeFunction = program?.getComputeFunction() ?? null
    if (!computeFunction?.getShaderId()) {
      TF_CODING_ERROR(`HgiWebGPU: compute pipeline '${desc.debugName}' has no valid compute function`)
      return
    }

    // hgiVulkan/computePipeline.cpp: the local size the dispatch divides by.
    const [x, y, z] = computeFunction.getDescriptor().computeDescriptor.localSize.data
    if (x && y && z) this._localWorkGroupSize.splice(0, 3, x, y, z)

    const infos = program!.getShaderFunctions()
      .map(fn => (fn.Get() as HgiWebGPUShaderFunction | null)?.getBindGroupLayoutInfo() ?? [])
    this._bindGroupLayouts = HgiWebGPUMakeBindGroupLayouts(device, infos, desc.debugName)
    const exceeded = this._bindGroupLayouts.exceeded
    if (exceeded) {
      // PLATFORM-DIVERGENCE(webgpu-binding-limits): not created, and its
      // dispatches are skipped (HgiWebGPUComputeCmds).
      TF_CODING_ERROR(`HgiWebGPU: compute pipeline '${desc.debugName}' exceeds the device's binding limits: ` +
        `${exceeded.join(', ')}; its dispatches are skipped`)
      this._exceedsDeviceLimits = true
      return
    }
    try {
      this._computePipelineState = device.createComputePipeline({
        label: desc.debugName,
        layout: device.createPipelineLayout({
          label: desc.debugName,
          bindGroupLayouts: this._bindGroupLayouts.layouts,
        }),
        compute: {
          module: computeFunction.getShaderId()!,
          entryPoint: computeFunction.getEntryPoint(),
        },
      })
    } catch (error) {
      TF_WARN(`Failed to create compute pipeline state, error: ${String(error)}`)
    }
  }

  /** hgiMetal/computePipeline.mm:51-54 */
  _destroy(): void {
    this._computePipelineState = null
    this._bindGroupLayouts = { layouts: [], entries: [] }
  }

  /** hgiMetal/computePipeline.mm:62-65 */
  getComputePipelineState(): GPUComputePipeline | null {
    return this._computePipelineState
  }

  /** See HgiWebGPUGraphicsPipeline.exceedsDeviceLimits. */
  exceedsDeviceLimits(): boolean {
    return this._exceedsDeviceLimits
  }

  getBindGroupLayouts(): HgiWebGPUBindGroupLayouts {
    return this._bindGroupLayouts
  }

  /** hgiVulkan/computePipeline.h GetLocalWorkGroupSize */
  getLocalWorkGroupSize(): readonly [number, number, number] {
    return this._localWorkGroupSize
  }
}
