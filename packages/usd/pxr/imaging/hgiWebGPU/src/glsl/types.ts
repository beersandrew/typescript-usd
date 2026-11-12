// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderGenerator.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GLSL types for the GLSL-to-WGSL translator (no upstream counterpart; see
// lexer.ts).
//
// Double precision: HgiWebGPU reports no ShaderDoublePrecision (WGSL has no
// f64), as hgiMetal does; hgiMetal's prelude maps `double`/`dvec*`/`dmat*` to
// float types (pxr/imaging/hgiMetal/shaderGenerator.mm:416-470). The
// translator does the same when it names a type.

export type ScalarKind = 'bool' | 'int' | 'uint' | 'float'

export type GType =
  | { k: 'void' }
  | { k: 'scalar'; s: ScalarKind }
  | { k: 'vector'; s: ScalarKind; n: number }
  | { k: 'matrix'; c: number; r: number }
  | { k: 'array'; elem: GType; size: number | null }
  | { k: 'struct'; name: string; fields: StructField[] }
  | { k: 'sampler'; name: string }
  | { k: 'atomic'; s: 'int' | 'uint' }
  | { k: 'typeparam'; name: string }

export interface StructField {
  name: string
  type: GType
}

export const VOID: GType = { k: 'void' }
export const BOOL: GType = { k: 'scalar', s: 'bool' }
export const INT: GType = { k: 'scalar', s: 'int' }
export const UINT: GType = { k: 'scalar', s: 'uint' }
export const FLOAT: GType = { k: 'scalar', s: 'float' }

export function scalar(s: ScalarKind): GType {
  return { k: 'scalar', s }
}
export function vec(s: ScalarKind, n: number): GType {
  return n === 1 ? { k: 'scalar', s } : { k: 'vector', s, n }
}
export function mat(c: number, r: number): GType {
  return { k: 'matrix', c, r }
}

/** GLSL sampler/image type names and their WGSL handling. */
export const SAMPLER_TYPES: Record<string, { dim: '1d' | '2d' | '3d' | 'cube' | '2d_array' | '1d_array' | 'cube_array' | 'buffer'; sampled: ScalarKind; shadow?: boolean; image?: boolean }> = {
  sampler1D: { dim: '1d', sampled: 'float' },
  sampler2D: { dim: '2d', sampled: 'float' },
  sampler3D: { dim: '3d', sampled: 'float' },
  samplerCube: { dim: 'cube', sampled: 'float' },
  sampler1DArray: { dim: '1d_array', sampled: 'float' },
  sampler2DArray: { dim: '2d_array', sampled: 'float' },
  samplerCubeArray: { dim: 'cube_array', sampled: 'float' },
  sampler2DShadow: { dim: '2d', sampled: 'float', shadow: true },
  sampler2DArrayShadow: { dim: '2d_array', sampled: 'float', shadow: true },
  samplerBuffer: { dim: 'buffer', sampled: 'float' },
  isampler1D: { dim: '1d', sampled: 'int' },
  isampler2D: { dim: '2d', sampled: 'int' },
  isampler3D: { dim: '3d', sampled: 'int' },
  isamplerBuffer: { dim: 'buffer', sampled: 'int' },
  usampler1D: { dim: '1d', sampled: 'uint' },
  usampler2D: { dim: '2d', sampled: 'uint' },
  usampler3D: { dim: '3d', sampled: 'uint' },
  usampler1DArray: { dim: '1d_array', sampled: 'uint' },
  usampler2DArray: { dim: '2d_array', sampled: 'uint' },
  usamplerBuffer: { dim: 'buffer', sampled: 'uint' },
  image1D: { dim: '1d', sampled: 'float', image: true },
  image2D: { dim: '2d', sampled: 'float', image: true },
  image3D: { dim: '3d', sampled: 'float', image: true },
  image2DArray: { dim: '2d_array', sampled: 'float', image: true },
  iimage2D: { dim: '2d', sampled: 'int', image: true },
  uimage2D: { dim: '2d', sampled: 'uint', image: true },
}

const BASIC: Record<string, GType> = (() => {
  const t: Record<string, GType> = {
    void: VOID,
    bool: BOOL,
    int: INT,
    uint: UINT,
    float: FLOAT,
    double: FLOAT,
    half: FLOAT,
    atomic_int: { k: 'atomic', s: 'int' },
    atomic_uint: { k: 'atomic', s: 'uint' },
  }
  for (const n of [2, 3, 4]) {
    t[`vec${n}`] = vec('float', n)
    t[`dvec${n}`] = vec('float', n)
    t[`ivec${n}`] = vec('int', n)
    t[`uvec${n}`] = vec('uint', n)
    t[`bvec${n}`] = vec('bool', n)
    t[`mat${n}`] = mat(n, n)
    t[`dmat${n}`] = mat(n, n)
    for (const r of [2, 3, 4]) {
      t[`mat${n}x${r}`] = mat(n, r)
      t[`dmat${n}x${r}`] = mat(n, r)
    }
  }
  for (const name of Object.keys(SAMPLER_TYPES)) t[name] = { k: 'sampler', name }
  return t
})()

export function basicType(name: string): GType | undefined {
  return BASIC[name]
}
export function isBasicTypeName(name: string): boolean {
  return name in BASIC
}

export function typeEq(a: GType, b: GType): boolean {
  if (a.k !== b.k) return false
  switch (a.k) {
    case 'void': return true
    case 'scalar': return a.s === (b as typeof a).s
    case 'vector': return a.s === (b as typeof a).s && a.n === (b as typeof a).n
    case 'matrix': return a.c === (b as typeof a).c && a.r === (b as typeof a).r
    case 'array': return a.size === (b as typeof a).size && typeEq(a.elem, (b as typeof a).elem)
    case 'struct': return a.name === (b as typeof a).name
    case 'sampler': return a.name === (b as typeof a).name
    case 'atomic': return a.s === (b as typeof a).s
    case 'typeparam': return a.name === (b as typeof a).name
  }
}

export function scalarOf(t: GType): ScalarKind | undefined {
  if (t.k === 'scalar' || t.k === 'vector') return t.s
  if (t.k === 'matrix') return 'float'
  if (t.k === 'atomic') return t.s
  return undefined
}

export function componentCount(t: GType): number {
  if (t.k === 'scalar') return 1
  if (t.k === 'vector') return t.n
  if (t.k === 'matrix') return t.c * t.r
  return 0
}

export function withScalar(t: GType, s: ScalarKind): GType {
  if (t.k === 'scalar') return scalar(s)
  if (t.k === 'vector') return vec(s, t.n)
  return t
}

export function isNumericOrBool(t: GType): boolean {
  return t.k === 'scalar' || t.k === 'vector' || t.k === 'matrix'
}

/** GLSL spelling (diagnostics, mangling). */
export function glslName(t: GType): string {
  switch (t.k) {
    case 'void': return 'void'
    case 'scalar': return t.s
    case 'vector': return `${t.s === 'float' ? '' : t.s[0]}vec${t.n}`
    case 'matrix': return t.c === t.r ? `mat${t.c}` : `mat${t.c}x${t.r}`
    case 'array': return `${glslName(t.elem)}[${t.size ?? ''}]`
    case 'struct': return t.name
    case 'sampler': return t.name
    case 'atomic': return `atomic_${t.s}`
    case 'typeparam': return t.name
  }
}

const WGSL_SCALAR: Record<ScalarKind, string> = { bool: 'bool', int: 'i32', uint: 'u32', float: 'f32' }

export function wgslScalar(s: ScalarKind): string {
  return WGSL_SCALAR[s]
}

/** WGSL spelling. Struct names are passed through `structName`. */
export function wgslName(t: GType, structName: (n: string) => string = n => n): string {
  switch (t.k) {
    case 'void': return ''
    case 'scalar': return WGSL_SCALAR[t.s]
    case 'vector': return `vec${t.n}<${WGSL_SCALAR[t.s]}>`
    case 'matrix': return `mat${t.c}x${t.r}<f32>`
    case 'array': return t.size === null ? `array<${wgslName(t.elem, structName)}>` : `array<${wgslName(t.elem, structName)}, ${t.size}>`
    case 'struct': return structName(t.name)
    case 'atomic': return `atomic<${WGSL_SCALAR[t.s]}>`
    case 'sampler': {
      const info = SAMPLER_TYPES[t.name]
      return info ? wgslTextureType(t.name) : t.name
    }
    case 'typeparam': return t.name
  }
}

export function wgslTextureType(samplerName: string): string {
  const info = SAMPLER_TYPES[samplerName]
  if (!info) return samplerName
  const st = WGSL_SCALAR[info.sampled]
  if (info.shadow) return info.dim === '2d_array' ? 'texture_depth_2d_array' : 'texture_depth_2d'
  if (info.image) return `texture_storage_${info.dim}<rgba32float, read_write>`
  if (info.dim === 'buffer') return `texture_1d<${st}>`
  // WGSL has no 1D array textures: a 2D array texture of height 1
  if (info.dim === '1d_array') return `texture_2d_array<${st}>`
  return `texture_${info.dim}<${st}>`
}

/** Short, identifier-safe type tag for name mangling (`HdGet_points_i32`). */
export function mangleTag(t: GType): string {
  switch (t.k) {
    case 'void': return 'v'
    case 'scalar': return WGSL_SCALAR[t.s]
    case 'vector': return `v${t.n}${WGSL_SCALAR[t.s][0]}`
    case 'matrix': return `m${t.c}x${t.r}`
    case 'array': return `a${t.size ?? 'r'}_${mangleTag(t.elem)}`
    case 'struct': return t.name
    case 'sampler': return t.name
    case 'atomic': return `at${WGSL_SCALAR[t.s]}`
    case 'typeparam': return t.name
  }
}

/** Implicit conversion allowed by GLSL 4.50 section 4.1.10 (doubles folded into float). */
export function canImplicitlyConvert(from: GType, to: GType): boolean {
  if (typeEq(from, to)) return true
  const fs = from.k === 'scalar' || from.k === 'vector' ? from.s : undefined
  const ts = to.k === 'scalar' || to.k === 'vector' ? to.s : undefined
  if (fs === undefined || ts === undefined) return false
  if (from.k !== to.k) return false
  if (from.k === 'vector' && from.n !== (to as { n: number }).n) return false
  if (fs === 'int') return ts === 'uint' || ts === 'float'
  if (fs === 'uint') return ts === 'float'
  return false
}

export function isScalarOrVector(t: GType): t is { k: 'scalar'; s: ScalarKind } | { k: 'vector'; s: ScalarKind; n: number } {
  return t.k === 'scalar' || t.k === 'vector'
}
