// Ported from OpenUSD 26.11.1: pxr/imaging/hgiVulkan/descriptorSetLayouts.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// PLATFORM-DIVERGENCE(webgpu-binding-visibility): a bind group layout entry
// is visible only to the stages whose entry point statically uses the
// binding (WGSL "Resource Interface of a Shader"), so the per-stage binding
// limits count what each stage reads (Chrome on macOS: 10 storage buffers
// per stage). hgiVulkan's merge (descriptorSetLayouts.cpp:100-118) makes
// buffers visible to every graphics stage instead.
import { describe, expect, it } from 'vitest'
import {
  HgiBindingType,
  HgiFormat,
  HgiShaderFunctionAddBuffer,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionDesc,
  HgiShaderStageBits,
} from 'typescript-usd/hgi'
import {
  HgiWebGPUBindingLimitsExceeded,
  HgiWebGPUMergeBindGroupLayoutInfos,
  HgiWebGPUShaderGenerator,
  HgiWebGPUWgslPassThroughTranslator,
} from '../src/index.ts'
import { HgiWebGPUResourceVariables, HgiWebGPUStaticallyUsedNames } from '../src/staticUse.ts'

const passThrough = { getShaderBodyTranslator: () => HgiWebGPUWgslPassThroughTranslator, isFloat32Filterable: () => true }

describe('HgiWebGPU static use of bindings', () => {
  it('follows the calls of the entry point, not uncalled functions or comments', () => {
    const code = `
@group(0) @binding(0) var<storage, read> a: array<f32>;
@binding(1) @group(0) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read> c: array<f32>;
@group(1) @binding(0) var t: texture_2d<f32>;
fn useA() -> f32 { return a[0]; }
fn unused() -> f32 { return c[0]; /* b[0] */ }
fn helper(x: f32) -> f32 { // c[1]
  return x + useA() + textureLoad(t, vec2<i32>(0), 0).x;
}
@vertex
fn entry() -> @builtin(position) vec4<f32> {
  let s = helper(1.0);
  return vec4<f32>(s);
}`
    expect([...HgiWebGPUResourceVariables(code)]).toEqual([['0:0', 'a'], ['0:1', 'b'], ['0:2', 'c'], ['1:0', 't']])
    const used = HgiWebGPUStaticallyUsedNames(code, 'entry')!
    expect(['a', 'b', 'c', 't'].filter(n => used.has(n))).toEqual(['a', 't'])
    expect(HgiWebGPUStaticallyUsedNames(code, 'missing')).toBeNull()
  })

  it('a member access does not count as a use of a module-scope name', () => {
    const code = `
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<uniform> s: S;
struct S { a: f32 }
fn main() -> f32 { return s.a; }`
    const used = HgiWebGPUStaticallyUsedNames(code, 'main')!
    expect(used.has('s')).toBe(true)
    expect(used.has('a')).toBe(false)
  })

  it('declared but unread bindings keep their entry with no visibility for the stage', () => {
    const desc = new HgiShaderFunctionDesc()
    desc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
    HgiShaderFunctionAddBuffer(desc, 'readBuf', 'float', 0, HgiBindingType.HgiBindingTypePointer)
    HgiShaderFunctionAddBuffer(desc, 'idleBuf', 'float', 1, HgiBindingType.HgiBindingTypePointer)
    HgiShaderFunctionAddTexture(desc, 'idleTex', 2, 2, HgiFormat.HgiFormatUNorm8Vec4)
    desc.shaderCode = 'fn main() { let x = readBuf[0]; }\n'
    const gen = new HgiWebGPUShaderGenerator(passThrough, desc)
    gen.Execute()
    expect(gen.getGeneratorErrors()).toBe('')
    const vis = Object.fromEntries(gen.getBindGroupLayoutInfo().map(i => [i.group,
      i.entries.map(e => [e.binding, e.visibility])]))
    expect(vis[0]).toEqual([[0, 1], [1, 0]])
    // The texture, its sampler, and the clamp-to-border emulation's
    // footprint and sampler-state bindings (samplerState.ts).
    expect(vis[1]!.length).toBeGreaterThan(0)
    expect(vis[2]!.length).toBeGreaterThan(0)
    expect([...vis[1]!, ...vis[2]!].every(([, v]) => v === 0)).toBe(true)
  })

  it('the merge takes the binding type of the stage that uses the binding', () => {
    const merged = HgiWebGPUMergeBindGroupLayoutInfos([
      [{ group: 0, entries: [{ binding: 3, visibility: 0, buffer: { type: 'read-only-storage' } }] }],
      [{ group: 0, entries: [{ binding: 3, visibility: 2, buffer: { type: 'storage' } }] }],
      [{ group: 0, entries: [{ binding: 3, visibility: 0, buffer: { type: 'read-only-storage' } }] }],
    ])
    expect(merged[0]).toEqual([{ binding: 3, visibility: 2, buffer: { type: 'storage' } }])
  })
})

describe('HgiWebGPUBindingLimitsExceeded (PLATFORM-DIVERGENCE(webgpu-binding-limits))', () => {
  const storage = (binding: number, visibility: number): GPUBindGroupLayoutEntry =>
    ({ binding, visibility, buffer: { type: 'read-only-storage' } })
  const limits = { maxStorageBuffersPerShaderStage: 10, maxStorageBuffersInVertexStage: 10 } as unknown as GPUSupportedLimits
  it('counts the entries visible to each stage, not the ones without visibility', () => {
    const vertex11 = Array.from({ length: 11 }, (_, i) => storage(i, 1))
    expect(HgiWebGPUBindingLimitsExceeded([vertex11], limits)).toEqual([
      '11 vertex storage buffers (maxStorageBuffersPerShaderStage 10)',
      '11 vertex storage buffers (maxStorageBuffersInVertexStage 10)',
    ])
    const split = [...Array.from({ length: 10 }, (_, i) => storage(i, 1)), storage(10, 2), storage(11, 0)]
    expect(HgiWebGPUBindingLimitsExceeded([split], limits)).toEqual([])
    expect(HgiWebGPUBindingLimitsExceeded([vertex11], undefined)).toEqual([])
  })
})
