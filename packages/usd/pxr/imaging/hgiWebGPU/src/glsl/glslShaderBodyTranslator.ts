// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hgiVulkan/shaderSection.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUGlslShaderBodyTranslator: the GLSL-to-WGSL translator behind
// HgiWebGPUShaderGenerator's body-translator seam (../shaderBodyTranslator.ts).
// No upstream counterpart (see translator.ts); install it with
// `hgi.SetShaderBodyTranslator(HgiWebGPUGlslShaderBodyTranslator)`.
//
// The generator declares every module-scope name the body uses (stage I/O,
// constant parameters, global members and interstage blocks as var<private>,
// buffers as bindings, textures through the accessors HgiGet_<name>,
// HgiGetSize_<name>, HgiTextureLod_<name>, HgiTexelFetch_<name>,
// HgiSet_<name>) plus the packed types hgi_ivec3/hgi_vec3/hgi_mat3. This
// adapter turns that list into typed host symbols for the translator, which
// type-checks against them but does not declare them, and returns WGSL that
// defines `fn main()`.

import {
  HgiFormat,
  HgiGetComponentBaseFormat,
  type HgiShaderFunctionDesc,
  type HgiShaderFunctionTextureDesc,
  HgiShaderStageBits,
  HgiShaderTextureType,
} from 'typescript-usd/hgi'
import type {
  HgiWebGPUShaderBodyTranslation,
  HgiWebGPUShaderBodyTranslator,
  HgiWebGPUShaderBodyTranslatorInput,
  HgiWebGPUShaderGlobal,
} from '../shaderBodyTranslator.ts'
import {
  type ExternalFunction, type ExternalGlobal, type ExternalStruct, formatDiagnostic, type GlslStage,
  translateGlslToWgsl,
} from './translator.ts'

/** Packed types HgiWebGPUShaderGenerator declares in its header. */
const GENERATOR_PACKED_TYPES = ['hgi_ivec3', 'hgi_vec3', 'hgi_mat3']

export function glslStageFromHgi(stage: number): GlslStage {
  switch (stage) {
    case HgiShaderStageBits.HgiShaderStageVertex: return 'vertex'
    case HgiShaderStageBits.HgiShaderStageFragment: return 'fragment'
    case HgiShaderStageBits.HgiShaderStageCompute: return 'compute'
    case HgiShaderStageBits.HgiShaderStagePostTessellationVertex: return 'postTessVertex'
    case HgiShaderStageBits.HgiShaderStagePostTessellationControl: return 'postTessControl'
    case HgiShaderStageBits.HgiShaderStageTessellationControl: return 'tessControl'
    case HgiShaderStageBits.HgiShaderStageTessellationEval: return 'tessEval'
    case HgiShaderStageBits.HgiShaderStageGeometry: return 'geometry'
  }
  return 'library'
}

const WGSL_SCALARS: Record<string, string> = { f32: 'float', i32: 'int', u32: 'uint', bool: 'bool', f16: 'float' }
const VEC_PREFIX: Record<string, string> = { f32: 'vec', i32: 'ivec', u32: 'uvec', bool: 'bvec' }

/**
 * The GLSL type of a WGSL type as HgiWebGPUShaderGenerator::GetWGSLType
 * writes them: scalars, vectors, matrices, struct names, `atomic<T>` and
 * one level of `array<T[, N]>`.
 */
export function glslTypeFromWgsl(wgsl: string): { type: string; arraySize?: number | string; atomic?: boolean } {
  const t = wgsl.replace(/\s+/g, '')
  let m = /^array<(.+?)(?:,(\w+))?>$/.exec(t)
  if (m) {
    const inner = glslTypeFromWgsl(m[1] as string)
    if (inner.arraySize !== undefined) throw new Error(`nested arrays are not supported: ${wgsl}`)
    const size = m[2]
    return { ...inner, arraySize: size === undefined ? 'runtime' : /^\d+$/.test(size) ? Number(size) : size }
  }
  m = /^atomic<(i32|u32)>$/.exec(t)
  if (m) return { type: WGSL_SCALARS[m[1] as string] as string, atomic: true }
  if (WGSL_SCALARS[t]) return { type: WGSL_SCALARS[t] as string }
  m = /^vec([234])<(f32|i32|u32|bool|f16)>$/.exec(t) ?? /^vec([234])([fiuh])$/.exec(t)
  if (m) {
    const s = { f: 'f32', i: 'i32', u: 'u32', h: 'f16' }[m[2] as string] ?? (m[2] as string)
    return { type: `${VEC_PREFIX[s] ?? 'vec'}${m[1]}` }
  }
  m = /^mat([234])x([234])(?:<f(?:32|16)>|f|h)$/.exec(t)
  if (m) return { type: m[1] === m[2] ? `mat${m[1]}` : `mat${m[1]}x${m[2]}` }
  return { type: t }
}

/** GLSL signatures of the generator's texture accessors (hgiVulkan/shaderSection.cpp:319-435). */
export function textureAccessorFunctions(desc: HgiShaderFunctionTextureDesc): ExternalFunction[] {
  const name = desc.nameInShader
  const shadow = desc.textureType === HgiShaderTextureType.HgiShaderTextureTypeShadowTexture
  const array = desc.textureType === HgiShaderTextureType.HgiShaderTextureTypeArrayTexture
  const cube = desc.textureType === HgiShaderTextureType.HgiShaderTextureTypeCubemapTexture
  const dims = Math.min(Math.max(desc.dimensions, 1), 3)
  const base = desc.format === HgiFormat.HgiFormatInvalid ? HgiFormat.HgiFormatFloat32 : HgiGetComponentBaseFormat(desc.format)
  const prefix = base === HgiFormat.HgiFormatUInt16 ? 'u' : base === HgiFormat.HgiFormatInt16 || base === HgiFormat.HgiFormatInt32 ? 'i' : ''
  const sizeDim = array ? dims + 1 : dims
  const coordDim = shadow || array || cube ? dims + 1 : dims
  const vecOf = (n: number, p: string): string => (n === 1 ? (p === 'i' ? 'int' : 'float') : `${p}vec${n}`)
  const sizeType = vecOf(sizeDim, 'i')
  const intCoord = vecOf(coordDim, 'i')
  const floatCoord = vecOf(coordDim, '')
  const sampled = `${prefix}vec4`
  if (desc.writable) {
    return [
      { name: `HgiSet_${name}`, params: [intCoord, 'vec4'], returnType: 'void' },
      { name: `HgiGetSize_${name}`, params: [], returnType: sizeType },
    ]
  }
  const result = shadow ? 'float' : sampled
  // An array of textures takes the element index first (`uint index`,
  // hgiVulkan/shaderSection.cpp:379-433).
  const index = desc.arraySize > 0 ? ['uint'] : []
  const fns: ExternalFunction[] = [
    { name: `HgiGet_${name}`, params: [...index, floatCoord], returnType: result },
    { name: `HgiGetSize_${name}`, params: [...index], returnType: sizeType },
    { name: `HgiTextureLod_${name}`, params: [...index, floatCoord, 'float'], returnType: result },
  ]
  if (!shadow && !cube) fns.push({ name: `HgiTexelFetch_${name}`, params: [...index, intCoord], returnType: sampled })
  return fns
}

/** The combined sampler hgiVulkan declares for a texture and the
 *  HgiGetSampler_ macro naming it (shaderSection.cpp:254-301 WriteType,
 *  :343-355): GLSL that passes the sampler on (MaterialX's generated
 *  functions take sampler2D / samplerCube parameters) sees a sampler-typed
 *  global named like the texture, which reads the generator's
 *  textureBind_<name> / samplerBind_<name> pair. Null for writable textures
 *  and arrays (no sampler, or no WebGPU binding arrays). */
export function textureCombinedSampler(desc: HgiShaderFunctionTextureDesc): { global: ExternalGlobal; define: string } | null {
  if (desc.writable || desc.arraySize > 0) return null
  const name = desc.nameInShader
  const shadow = desc.textureType === HgiShaderTextureType.HgiShaderTextureTypeShadowTexture
  const array = desc.textureType === HgiShaderTextureType.HgiShaderTextureTypeArrayTexture
  const cube = desc.textureType === HgiShaderTextureType.HgiShaderTextureTypeCubemapTexture
  const base = desc.format === HgiFormat.HgiFormatInvalid ? HgiFormat.HgiFormatFloat32 : HgiGetComponentBaseFormat(desc.format)
  const prefix = base === HgiFormat.HgiFormatUInt16 ? 'u' : base === HgiFormat.HgiFormatInt16 || base === HgiFormat.HgiFormatInt32 ? 'i' : ''
  const dims = Math.min(Math.max(desc.dimensions, 1), 3)
  const type = `${prefix}sampler${cube ? 'Cube' : `${dims}D`}${array ? 'Array' : ''}${shadow ? 'Shadow' : ''}`
  return {
    global: { name, type, space: 'handle', declare: false, accessExpr: `textureBind_${name}`, samplerAccessExpr: `samplerBind_${name}` },
    define: `#define HgiGetSampler_${name}() ${name}\n`,
  }
}

/** The translator's host symbols for one stage, from the generator's globals and the descriptor. */
export function hostSymbols(globals: readonly HgiWebGPUShaderGlobal[], descriptor: HgiShaderFunctionDesc): {
  globals: ExternalGlobal[]
  structs: ExternalStruct[]
  functions: ExternalFunction[]
  defines: string
} {
  let defines = ''
  const out: ExternalGlobal[] = []
  const structs: ExternalStruct[] = []
  const functions: ExternalFunction[] = []
  for (const g of globals) {
    switch (g.kind) {
      case 'texture': {
        const desc = descriptor.textures.find(t => t.nameInShader === g.name)
        if (desc) {
          functions.push(...textureAccessorFunctions(desc))
          const combined = textureCombinedSampler(desc)
          if (combined) {
            out.push(combined.global)
            defines += combined.define
          }
        }
        continue
      }
      case 'interstageBlock': {
        const block = [...descriptor.stageInputBlocks, ...descriptor.stageOutputBlocks].find(b => b.instanceName === g.name)
        if (block && !structs.some(s => s.name === block.blockName)) {
          structs.push({
            name: block.blockName,
            declare: false,
            fields: block.members.map(m => ({ name: m.name, type: glslTypeFromWgsl(m.type).type })),
          })
        }
        out.push({ name: g.name, type: g.wgslType, space: 'private', declare: false })
        continue
      }
      case 'buffer': {
        const t = glslTypeFromWgsl(g.wgslType)
        const desc = descriptor.buffers.find(b => b.nameInShader === g.name)
        const ext: ExternalGlobal = { name: g.name, type: t.type, space: 'storage', access: desc?.writable && !g.readOnly ? 'read_write' : 'read', declare: false }
        if (t.arraySize !== undefined) ext.arraySize = t.arraySize
        if (t.atomic) ext.atomic = true
        out.push(ext)
        continue
      }
      default: {
        const t = glslTypeFromWgsl(g.wgslType)
        const ext: ExternalGlobal = { name: g.name, type: t.type, space: 'private', declare: false }
        if (t.arraySize !== undefined) ext.arraySize = t.arraySize
        // HgiWebGPUShaderGenerator lists global members with their element
        // type; the descriptor carries the array size.
        const member = g.kind === 'globalMember' ? descriptor.stageGlobalMembers.find(m => m.nameInShader === g.name) : undefined
        if (member?.arraySize && t.arraySize === undefined) ext.arraySize = /^\d+$/.test(member.arraySize) ? Number(member.arraySize) : member.arraySize
        out.push(ext)
      }
    }
  }
  return { globals: out, structs, functions, defines }
}

/** Translations made this session, by their complete translator input
 *  (stage, declarations, code and host symbols). The translation is a pure
 *  function of that input, so programs that share a stage body translate
 *  it once. */
const _translations = new Map<string, HgiWebGPUShaderBodyTranslation>()

export const HgiWebGPUGlslShaderBodyTranslator: HgiWebGPUShaderBodyTranslator = {
  Translate(input: HgiWebGPUShaderBodyTranslatorInput): HgiWebGPUShaderBodyTranslation {
    let host
    try {
      host = hostSymbols(input.globals, input.descriptor)
    } catch (e) {
      return { declarations: '', code: '', errors: `HgiWebGPU GLSL translation: ${(e as Error).message}` }
    }
    const stage = glslStageFromHgi(input.stage)
    const declarations = host.defines + input.declarations
    const key = JSON.stringify([stage, declarations, input.code, host.globals, host.structs, host.functions])
    const cached = _translations.get(key)
    if (cached) return { ...cached }
    const r = translateGlslToWgsl({
      stage,
      declarations,
      code: input.code,
      globals: host.globals,
      structs: host.structs,
      functions: host.functions,
      providedStructs: GENERATOR_PACKED_TYPES,
    })
    const errors = r.diagnostics.filter(d => d.severity === 'error').map(formatDiagnostic).join('\n')
    // The generator writes the module's directives (derivative_uniformity
    // off for fragment shaders); the body is order-independent WGSL.
    const translation = { declarations: '', code: r.ok ? r.body : '', errors: r.ok ? errors : errors || 'HgiWebGPU GLSL translation failed', writtenGlobals: r.writtenGlobals }
    _translations.set(key, translation)
    return { ...translation }
  },
}
