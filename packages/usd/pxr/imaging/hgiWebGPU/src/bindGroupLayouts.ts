// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderGenerator.mm,
//  pxr/imaging/hgiVulkan/descriptorSetLayouts.cpp,
//  pxr/imaging/hgiVulkan/descriptorSetLayouts.h,
//  pxr/imaging/hgiVulkan/resourceBindings.cpp,
//  pxr/imaging/hgiVulkan/shaderGenerator.cpp
// Copyright 2020, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Bind group layouts of a shader program. Modelled on
// pxr/imaging/hgiVulkan/descriptorSetLayouts.{h,cpp}: each shader function's
// generator records the bindings it declares
// (hgiVulkan/shaderGenerator.cpp:649-674), and the pipeline merges the
// records of all its functions into layouts (descriptorSetLayouts.cpp:59-145).
//
// WebGPU adaptation of the binding model: hgiVulkan puts every resource in
// one descriptor set and shifts texture indices past the buffers
// (hgiVulkan/resourceBindings.cpp:80-97). Here, as in hgiMetal's separate
// buffer, texture and sampler argument tables
// (hgiMetal/shaderGenerator.mm:851-947), buffers, textures and samplers each
// get their own bind group and keep the Hgi bind indices; a fourth group
// holds the constant parameters, which WebGPU has no push constants for.

import { GPUShaderStageFlags } from './conversions.ts'
import { TF_CODING_ERROR } from './diagnostic.ts'

/** Bind group of buffers (binding = HgiBufferBindDesc::bindingIndex). */
export const HgiWebGPUBufferBindGroup = 0
/** Bind group of textures (binding = HgiTextureBindDesc::bindingIndex). */
export const HgiWebGPUTextureBindGroup = 1
/** Bind group of samplers (binding = HgiTextureBindDesc::bindingIndex). */
export const HgiWebGPUSamplerBindGroup = 2
/** Bind group of the constant parameter uniform buffer (binding 0, dynamic
 *  offset). */
export const HgiWebGPUConstantsBindGroup = 3
/** Bindings of the constants bind group that the emulated post-tessellation
 *  vertex stage adds (HgiWebGPUPostTessVertexShaderSection): the per-draw
 *  patch parameters (uniform, dynamic offset), the control-point index
 *  buffer, and one storage binding per vertex attribute location it pulls
 *  (HgiWebGPUPulledAttributeBindingBase + shaderBindLocation). WebGPU's
 *  default maxBindGroups is 4, so they share the group of the constants. */
export const HgiWebGPUPatchDrawBinding = 1
export const HgiWebGPUControlPointIndexBinding = 2
export const HgiWebGPUPulledAttributeBindingBase = 3
/** The tessellated points (patch, u, v) a post-tessellation vertex stage
 *  reads for draws with per-patch factors (HgiWebGPUTessellation), past
 *  the attribute bindings (vertex attribute locations stay below 32). */
export const HgiWebGPUTessPointsBinding = 64
/** Number of bind groups every HgiWebGPU pipeline layout has. */
export const HgiWebGPUBindGroupCount = 4

/** The counterpart of HgiVulkanDescriptorSetInfo
 *  (hgiVulkan/descriptorSetLayouts.h:23-28): the bindings one shader function
 *  declares in one bind group. */
export interface HgiWebGPUBindGroupLayoutInfo {
  group: number
  entries: GPUBindGroupLayoutEntry[]
}
export type HgiWebGPUBindGroupLayoutInfoVector = HgiWebGPUBindGroupLayoutInfo[]

/** Merge the layout infos of a program's functions into one entry list per
 *  bind group (hgiVulkan/descriptorSetLayouts.cpp:65-123). A binding several
 *  functions declare is kept once, visible to every stage that statically uses it
 *  (PLATFORM-DIVERGENCE(webgpu-binding-visibility)). */
export function HgiWebGPUMergeBindGroupLayoutInfos(
  infos: readonly HgiWebGPUBindGroupLayoutInfoVector[],
  debugName = '',
): GPUBindGroupLayoutEntry[][] {
  const merged: GPUBindGroupLayoutEntry[][] =
    Array.from({ length: HgiWebGPUBindGroupCount }, () => [])

  for (const infoVec of infos) {
    for (const info of infoVec) {
      const trg = merged[info.group]!
      for (const bi of info.entries) {
        // If two shader modules have the same binding information for
        // a specific resource, we only want to insert it once.
        const dst = trg.find(b => b.binding === bi.binding)
        if (!dst) {
          trg.push({ ...bi })
        } else if (bi.visibility === 0) {
          // Declared, but statically unused by that function
          // (HgiWebGPUShaderGenerator _restrictVisibilityToStaticUse): its
          // declaration is not validated against the layout.
        } else if (dst.visibility === 0) {
          Object.assign(dst, bi)
        } else {
          dst.visibility |= bi.visibility
          // WebGPU adaptation: a layout entry has one buffer binding type
          // for every stage, and a stage whose declaration does not match
          // it makes the pipeline invalid (HgiWebGPUShaderGenerator
          // _declareUnwrittenBuffersReadOnly).
          if (dst.buffer?.type !== bi.buffer?.type) {
            TF_CODING_ERROR(`HgiWebGPU: ${debugName}: binding ${bi.binding} of bind group ${info.group} is ` +
              `'${dst.buffer?.type}' in one shader function and '${bi.buffer?.type}' in another`)
          }
        }
      }
    }
  }

  for (const entries of merged) entries.sort((a, b) => a.binding - b.binding)
  return merged
}

/** The layouts of a pipeline and the entries they were made from (WebGPU
 *  does not expose a layout's entries). */
export interface HgiWebGPUBindGroupLayouts {
  layouts: GPUBindGroupLayout[]
  entries: GPUBindGroupLayoutEntry[][]
  /** The device binding limits the entries exceed
   *  (HgiWebGPUBindingLimitsExceeded); no layout is created then. */
  exceeded?: string[]
}

/** HgiVulkanMakeDescriptorSetLayouts (descriptorSetLayouts.cpp:59-145):
 *  create the GPUBindGroupLayouts of a program. Every group exists (empty when
 *  unused) so the bind group indices stay fixed. */
export function HgiWebGPUMakeBindGroupLayouts(
  device: GPUDevice,
  infos: readonly HgiWebGPUBindGroupLayoutInfoVector[],
  debugName: string,
): HgiWebGPUBindGroupLayouts {
  const entries = HgiWebGPUMergeBindGroupLayoutInfos(infos, debugName)
  const exceeded = HgiWebGPUBindingLimitsExceeded(entries, device.limits)
  if (exceeded.length) return { layouts: [], entries, exceeded }
  const layouts = entries.map((groupEntries, group) =>
    device.createBindGroupLayout({
      label: `BindGroupLayout ${debugName} ${group}`,
      entries: groupEntries,
    }))
  return { layouts, entries }
}

/** The per-stage and per-layout binding limits of the WebGPU spec
 *  ("Exceeds the Binding Slot Limits", GPUPipelineLayout creation) that
 *  `entries` (the merged layouts of one pipeline) exceed on a device with
 *  `limits`, one line per limit, or none. hgiVulkan verifies the per-stage
 *  descriptor limits of the device when it binds resources
 *  (resourceBindings.cpp:220-245); a WebGPU pipeline layout over a limit is
 *  invalid, and so is every command buffer that uses its pipeline. */
export function HgiWebGPUBindingLimitsExceeded(
  entries: readonly (readonly GPUBindGroupLayoutEntry[])[],
  limits: GPUSupportedLimits | undefined,
): string[] {
  if (!limits) return []
  const l = limits as unknown as Record<string, number | undefined>
  const stages = [
    [GPUShaderStageFlags.VERTEX, 'vertex', 'Vertex'],
    [GPUShaderStageFlags.FRAGMENT, 'fragment', 'Fragment'],
    [GPUShaderStageFlags.COMPUTE, 'compute', ''],
  ] as const
  const out: string[] = []
  const check = (what: string, count: number, limit: number | undefined, limitName: string) => {
    if (limit !== undefined && count > limit) out.push(`${count} ${what} (${limitName} ${limit})`)
  }
  for (const [bit, stage, vf] of stages) {
    let storage = 0, uniform = 0, sampled = 0, samplers = 0, storageTextures = 0
    for (const group of entries) {
      for (const e of group) {
        if (!(e.visibility & bit)) continue
        if (e.buffer) {
          if (e.buffer.type === 'uniform' || e.buffer.type === undefined) uniform++
          else storage++
        } else if (e.texture || e.externalTexture) sampled++
        else if (e.sampler) samplers++
        else if (e.storageTexture) storageTextures++
      }
    }
    check(`${stage} storage buffers`, storage, l.maxStorageBuffersPerShaderStage, 'maxStorageBuffersPerShaderStage')
    if (vf) check(`${stage} storage buffers`, storage, l[`maxStorageBuffersIn${vf}Stage`], `maxStorageBuffersIn${vf}Stage`)
    check(`${stage} uniform buffers`, uniform, l.maxUniformBuffersPerShaderStage, 'maxUniformBuffersPerShaderStage')
    check(`${stage} sampled textures`, sampled, l.maxSampledTexturesPerShaderStage, 'maxSampledTexturesPerShaderStage')
    check(`${stage} samplers`, samplers, l.maxSamplersPerShaderStage, 'maxSamplersPerShaderStage')
    check(`${stage} storage textures`, storageTextures, l.maxStorageTexturesPerShaderStage, 'maxStorageTexturesPerShaderStage')
    if (vf) check(`${stage} storage textures`, storageTextures, l[`maxStorageTexturesIn${vf}Stage`], `maxStorageTexturesIn${vf}Stage`)
  }
  return [...new Set(out)]
}
