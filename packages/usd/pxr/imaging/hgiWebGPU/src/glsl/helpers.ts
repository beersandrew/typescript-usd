// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderGenerator.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// WGSL helper functions for GLSL built-ins and constructors WGSL lacks
// (GLSL-to-WGSL translator, no upstream counterpart; see lexer.ts).
//
// hgiMetal supplies the same functions to the GLSL bodies as MSL templates and
// functions in its prelude (`mod`, `inverse`, `atan(y, x)`; pxr/imaging/
// hgiMetal/shaderGenerator.mm:416-633). Here they are WGSL functions, emitted
// only when used, one per concrete type. Semantics follow GLSL 4.50 chapter 8:
// `mod` is floored (x - y * floor(x / y)), `inverse` is the adjugate over the
// determinant, `isnan`/`isinf` test the IEEE bit pattern (WGSL has no
// built-ins for them).

import { type GType, glslName, wgslName } from './types.ts'

const MAT_N: Record<string, number> = { mat2: 2, mat3: 3, mat4: 4 }

function vecOrScalar(t: string): { w: string; n: number } {
  if (t === 'float') return { w: 'f32', n: 1 }
  const m = /^vec(\d)$/.exec(t)
  if (m) return { w: `vec${m[1]}<f32>`, n: Number(m[1]) }
  throw new Error(`helper type ${t}`)
}

export function helperName(kind: string, glslType: string): string {
  return `glsl_${kind}_${glslType}`
}

/** WGSL source for one helper, keyed `kind:glslType` as the checker records it. */
export function helperSource(key: string): string {
  const [kind, t] = key.split(':') as [string, string]
  const name = helperName(kind, t)
  switch (kind) {
    case 'mod': {
      const { w } = vecOrScalar(t)
      return `fn ${name}(x: ${w}, y: ${w}) -> ${w} { return x - y * floor(x / y); }`
    }
    case 'isnan':
    case 'isinf': {
      const { w, n } = vecOrScalar(t)
      const u = n === 1 ? 'u32' : `vec${n}<u32>`
      const b = n === 1 ? 'bool' : `vec${n}<bool>`
      const inf = n === 1 ? '0x7f800000u' : `${u}(0x7f800000u)`
      const test = kind === 'isnan' ? `> ${inf}` : `== ${inf}`
      return `fn ${name}(x: ${w}) -> ${b} { return (bitcast<${u}>(x) & ${n === 1 ? '0x7fffffffu' : `${u}(0x7fffffffu)`}) ${test}; }`
    }
    case 'inverse':
      return inverseSource(name, MAT_N[t] as number)
    case 'matrixCompMult':
    case 'matrixCompDiv': {
      const { c, r } = matDims(t)
      const w = `mat${c}x${r}<f32>`
      const op = kind === 'matrixCompMult' ? '*' : '/'
      const cols = Array.from({ length: c }, (_, k) => `a[${k}] ${op} b[${k}]`).join(', ')
      return `fn ${name}(a: ${w}, b: ${w}) -> ${w} { return ${w}(${cols}); }`
    }
    case 'matDiag': {
      const { c, r } = matDims(t)
      const w = `mat${c}x${r}<f32>`
      const vals: string[] = []
      for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) vals.push(i === j ? 's' : '0.0f')
      return `fn ${name}(s: f32) -> ${w} { return ${w}(${vals.join(', ')}); }`
    }
    case 'outerProduct': {
      const [cn, rn] = t.split('x').map(Number) as [number, number]
      const w = `mat${rn}x${cn}<f32>`
      const cols = Array.from({ length: rn }, (_, k) => `c * r[${k}]`).join(', ')
      return `fn ${name}(c: vec${cn}<f32>, r: vec${rn}<f32>) -> ${w} { return ${w}(${cols}); }`
    }
  }
  throw new Error(`unknown helper ${key}`)
}

function matDims(t: string): { c: number; r: number } {
  const m = /^mat(\d)(?:x(\d))?$/.exec(t)
  if (!m) throw new Error(`not a matrix type: ${t}`)
  return { c: Number(m[1]), r: Number(m[2] ?? m[1]) }
}

function inverseSource(name: string, n: number): string {
  if (n === 2) {
    return `fn ${name}(m: mat2x2<f32>) -> mat2x2<f32> {
  let d = 1.0f / determinant(m);
  return mat2x2<f32>(m[1][1] * d, -m[0][1] * d, -m[1][0] * d, m[0][0] * d);
}`
  }
  if (n === 3) {
    return `fn ${name}(m: mat3x3<f32>) -> mat3x3<f32> {
  let c0 = cross(m[1], m[2]);
  let c1 = cross(m[2], m[0]);
  let c2 = cross(m[0], m[1]);
  let d = 1.0f / dot(m[0], c0);
  return transpose(mat3x3<f32>(c0 * d, c1 * d, c2 * d));
}`
  }
  // 4x4: cofactor expansion (the same expansion hgiMetal's prelude uses,
  // pxr/imaging/hgiMetal/shaderGenerator.mm _ComputeHeader).
  return `fn ${name}(a: mat4x4<f32>) -> mat4x4<f32> {
  let b00 = a[0][0] * a[1][1] - a[0][1] * a[1][0];
  let b01 = a[0][0] * a[1][2] - a[0][2] * a[1][0];
  let b02 = a[0][0] * a[1][3] - a[0][3] * a[1][0];
  let b03 = a[0][1] * a[1][2] - a[0][2] * a[1][1];
  let b04 = a[0][1] * a[1][3] - a[0][3] * a[1][1];
  let b05 = a[0][2] * a[1][3] - a[0][3] * a[1][2];
  let b06 = a[2][0] * a[3][1] - a[2][1] * a[3][0];
  let b07 = a[2][0] * a[3][2] - a[2][2] * a[3][0];
  let b08 = a[2][0] * a[3][3] - a[2][3] * a[3][0];
  let b09 = a[2][1] * a[3][2] - a[2][2] * a[3][1];
  let b10 = a[2][1] * a[3][3] - a[2][3] * a[3][1];
  let b11 = a[2][2] * a[3][3] - a[2][3] * a[3][2];
  let invdet = 1.0f / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return mat4x4<f32>(
    a[1][1] * b11 - a[1][2] * b10 + a[1][3] * b09,
    a[0][2] * b10 - a[0][1] * b11 - a[0][3] * b09,
    a[3][1] * b05 - a[3][2] * b04 + a[3][3] * b03,
    a[2][2] * b04 - a[2][1] * b05 - a[2][3] * b03,
    a[1][2] * b08 - a[1][0] * b11 - a[1][3] * b07,
    a[0][0] * b11 - a[0][2] * b08 + a[0][3] * b07,
    a[3][2] * b02 - a[3][0] * b05 - a[3][3] * b01,
    a[2][0] * b05 - a[2][2] * b02 + a[2][3] * b01,
    a[1][0] * b10 - a[1][1] * b08 + a[1][3] * b06,
    a[0][1] * b08 - a[0][0] * b10 - a[0][3] * b06,
    a[3][0] * b04 - a[3][1] * b02 + a[3][3] * b00,
    a[2][1] * b02 - a[2][0] * b04 - a[2][3] * b00,
    a[1][1] * b07 - a[1][0] * b09 - a[1][2] * b06,
    a[0][0] * b09 - a[0][1] * b07 + a[0][2] * b06,
    a[3][1] * b01 - a[3][0] * b03 - a[3][2] * b00,
    a[2][0] * b03 - a[2][1] * b01 + a[2][2] * b00) * invdet;
}`
}

/** Key for a matrix-typed helper. */
export function matKey(kind: string, t: GType): string {
  return `${kind}:${glslName(t)}`
}

export { wgslName }
