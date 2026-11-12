// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// testHdStDepthBias's programs as HgiShaderFunctionDescs: the code generator's
// GLSL captured from the OpenUSD 26.11.1 reference build and the stage
// resources read from the same run (fixtures/depthBias/descriptors.json,
// which records provenance and adaptations). Used by the Node tests and by
// the Safari harness (packages/usd/tests/browser/wgsl-check).
import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import {
  HgiBindingType,
  HgiInterpolationType,
  HgiShaderFunctionAddBuffer,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddGlobalVariable,
  HgiShaderFunctionDesc,
  HgiShaderFunctionParamBlockDesc,
  HgiShaderFunctionParamBlockDescMember,
  HgiShaderFunctionParamDesc,
  HgiShaderStageBits,
} from 'typescript-usd/hgi'

export interface StageJson {
  stage: 'compute' | 'vertex' | 'fragment'
  localSize?: [number, number, number]
  constantParams?: { name: string; type: string }[]
  globals?: { name: string; type: string; arraySize?: string }[]
  buffers?: { name: string; type: string; bindIndex: number; binding: 'array' | 'value' | 'uniformValue'; writable?: boolean }[]
  stageInputs?: ParamJson[]
  stageOutputs?: ParamJson[]
  stageInputBlocks?: BlockJson[]
  stageOutputBlocks?: BlockJson[]
}
interface ParamJson { name: string; type: string; role?: string; location?: number; interstageSlot?: number; interpolation?: 'flat'; arraySize?: string }
interface BlockJson { blockName: string; instanceName: string; interstageSlot?: number; members: { name: string; type: string }[] }

export const DEPTH_BIAS_STAGES = ['COMPUTE', 'VERTEX', 'POST_TESS_VERTEX', 'FRAGMENT'] as const

const STAGE_BITS = {
  compute: HgiShaderStageBits.HgiShaderStageCompute,
  vertex: HgiShaderStageBits.HgiShaderStageVertex,
  fragment: HgiShaderStageBits.HgiShaderStageFragment,
}

function param(p: ParamJson): HgiShaderFunctionParamDesc {
  const d = new HgiShaderFunctionParamDesc()
  d.nameInShader = p.name
  d.type = p.type
  if (p.role) d.role = p.role
  if (p.location !== undefined) d.location = p.location
  if (p.interstageSlot !== undefined) d.interstageSlot = p.interstageSlot
  if (p.interpolation === 'flat') d.interpolation = HgiInterpolationType.HgiInterpolationFlat
  if (p.arraySize) d.arraySize = p.arraySize
  return d
}

function block(b: BlockJson): HgiShaderFunctionParamBlockDesc {
  const d = new HgiShaderFunctionParamBlockDesc()
  d.blockName = b.blockName
  d.instanceName = b.instanceName
  if (b.interstageSlot !== undefined) d.interstageSlot = b.interstageSlot
  for (const m of b.members) {
    const md = new HgiShaderFunctionParamBlockDescMember()
    md.name = m.name
    md.type = m.type
    d.members.push(md)
  }
  return d
}

/** One stage's descriptor with the captured GLSL as its code. */
export function depthBiasDescriptor(s: StageJson, glsl: string): HgiShaderFunctionDesc {
  const desc = new HgiShaderFunctionDesc()
  desc.shaderStage = STAGE_BITS[s.stage]
  desc.shaderCode = glsl
  if (s.localSize) desc.computeDescriptor.localSize = new GfVec3i(...s.localSize)
  for (const c of s.constantParams ?? []) HgiShaderFunctionAddConstantParam(desc, c.name, c.type)
  for (const g of s.globals ?? []) HgiShaderFunctionAddGlobalVariable(desc, g.name, g.type, g.arraySize ?? '')
  for (const b of s.buffers ?? []) {
    const binding = b.binding === 'uniformValue' ? HgiBindingType.HgiBindingTypeUniformValue
      : b.binding === 'value' ? HgiBindingType.HgiBindingTypeValue : HgiBindingType.HgiBindingTypeArray
    HgiShaderFunctionAddBuffer(desc, b.name, b.type, b.bindIndex, binding)
    if (b.writable) (desc.buffers[desc.buffers.length - 1] as { writable: boolean }).writable = true
  }
  for (const p of s.stageInputs ?? []) desc.stageInputs.push(param(p))
  for (const p of s.stageOutputs ?? []) desc.stageOutputs.push(param(p))
  for (const b of s.stageInputBlocks ?? []) desc.stageInputBlocks.push(block(b))
  for (const b of s.stageOutputBlocks ?? []) desc.stageOutputBlocks.push(block(b))
  return desc
}
