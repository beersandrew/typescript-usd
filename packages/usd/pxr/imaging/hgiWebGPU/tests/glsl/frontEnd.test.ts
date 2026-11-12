// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hdSt/codeGen.cpp, pxr/imaging/hdSt/shaders/instancing.glslfx,
//  pxr/imaging/hio/glslfx.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Node tests of the GLSL front end used by HgiWebGPU's translator: the
// preprocessor (defines, conditionals, function-like macros as the backend
// preludes use them), the parser (the GLSL subset of Storm's glslfx and code
// generator, including its C++ template and default-argument forms) and the
// type checker (overloads, implicit conversions, swizzles, references).
import { describe, expect, it } from 'vitest'
import type { CallExpr, ExprStmt, FunctionDecl, ReturnStmt } from '../../src/glsl/ast.ts'
import { check } from '../../src/glsl/checker.ts'
import { tokenize } from '../../src/glsl/lexer.ts'
import { parse } from '../../src/glsl/parser.ts'
import { preprocess } from '../../src/glsl/preprocessor.ts'
import { translateGlslToWgsl } from '../../src/glsl/translator.ts'
import { GLSL_PRELUDE } from '../../src/glsl/prelude.ts'

const pp = (src: string, defines: Record<string, string> = {}): string => {
  const r = preprocess(src, { defines })
  expect(r.diagnostics).toEqual([])
  return r.tokens.filter(t => t.kind !== 'eof').map(t => t.text).join(' ')
}

describe('preprocessor', () => {
  it('expands object-like macros and resolves #if/#elif/#else with defined()', () => {
    const src = '#define A 2\n#if defined(A) && A > 1\nx\n#elif B\ny\n#else\nz\n#endif\n#ifdef B\nb\n#endif\n#ifndef B\nnb\n#endif'
    expect(pp(src)).toBe('x nb')
    expect(pp('#if B\ny\n#elif A == 3\nw\n#endif', { A: '3' })).toBe('w')
  })

  it('expands the backend prelude macros REF, FORWARD_DECL and ATOMIC_*', () => {
    const src = `${GLSL_PRELUDE}\nFORWARD_DECL(void f(float u, REF(thread, vec4) p));\nATOMIC_STORE(a[i], ATOMIC_LOAD(b) + 1);`
    const out = pp(src)
    expect(out.slice(out.indexOf('void f'))).toBe('void f ( float u , inout vec4 p ) ; ( a [ i ] ) = ( ( b ) + 1 ) ;')
  })

  it('does not re-expand a macro inside its own expansion, and pastes with ##', () => {
    expect(pp('#define f(x) f(x + 1)\n#define CAT(a, b) a ## b\nf(2) CAT(Hd, Get)')).toBe('f ( 2 + 1 ) HdGet')
  })

  it('handles #undef, nested conditionals and redefinition inside a branch (mesh.glslfx:1443-1450)', () => {
    const src = '#ifndef HD_HAS_ptexFaceOffset\n#define HD_HAS_ptexFaceOffset\nint a;\n#endif\n#ifdef HD_HAS_ptexFaceOffset\nint b;\n#endif\n#undef HD_HAS_ptexFaceOffset\n#ifdef HD_HAS_ptexFaceOffset\nint c;\n#endif'
    expect(pp(src)).toBe('int a ; int b ;')
  })

  it('reports #error and unterminated #if', () => {
    expect(preprocess('#error no\n').diagnostics[0]?.message).toBe('#error no')
    expect(preprocess('#if 1\nx\n').diagnostics[0]?.message).toBe('unterminated #if')
  })

  it('maps lines through HioGlslfx "// line N" markers (hio/glslfx.cpp:466-475)', () => {
    const toks = tokenize('a\n// line 14 "instancing.glslfx"\nb\nc')
    expect(toks.slice(0, 3).map(t => `${t.text}@${t.loc.file}:${t.loc.line}`)).toEqual(['a@<input>:1', 'b@instancing.glslfx:15', 'c@instancing.glslfx:16'])
  })
})

describe('parser', () => {
  it('parses structs with multi-declarator fields and an instance (hgiVulkan packed types, codegen hd_DrawIndex)', () => {
    const u = parse(tokenize('struct hgi_ivec3 { int x, y, z; };\nstruct hd_DrawIndex { int drawId; int instanceId; } hd_drawIndex;'))
    expect(u.decls.map(d => d.kind)).toEqual(['struct', 'struct', 'global'])
    expect((u.decls[0] as { fields: { name: string }[] }).fields.map(f => f.name)).toEqual(['x', 'y', 'z'])
  })

  it('parses the code generator\'s function template with a default argument (codeGen.cpp:2528-2531)', () => {
    const u = parse(tokenize('template <typename T>\nT InterpolatePrimvar(T inPv0, T inPv1, vec4 basis, vec2 uv = vec2()) { return inPv0 * basis[0] + inPv1 * basis[1]; }'))
    const f = u.decls[0] as FunctionDecl
    expect(f.templateParams).toEqual(['T'])
    expect(f.params[3]?.defaultValue?.kind).toBe('call')
  })

  it('tells declarations from constructor expressions', () => {
    const u = parse(tokenize('void f() { vec4 p[8]; float[2] q; vec3(1); float[2](1.0, 2.0); }'))
    const body = (u.decls[0] as FunctionDecl).body?.stmts.map(s => s.kind)
    expect(body).toEqual(['decl', 'decl', 'expr', 'expr'])
  })

  it('reports the location of a syntax error', () => {
    expect(() => parse(tokenize('void f() { return 1 }', 'x.glslfx'))).toThrow('x.glslfx:1:21: expected \';\', found \'}\'')
  })
})

describe('checker', () => {
  const checked = (code: string) => check(parse(tokenize(code)), { stage: 'fragment' })

  it('prefers the exact overload, then the one needing implicit conversions (GLSL 4.50 6.1)', () => {
    const c = checked('float f(float x) { return x; } int f(int x) { return x; } uint f(uint x) { return x; } float g() { return f(1) + f(1u) + f(1.0); }')
    const g = c.functions.find(f => f.sym.name === 'g') as { decl: FunctionDecl }
    const ret = g.decl.body?.stmts[0] as ReturnStmt
    const calls: string[] = []
    const walk = (e: unknown): void => {
      if (!e || typeof e !== 'object') return
      const x = e as CallExpr
      if (x.kind === 'call' && x.fn) calls.push(x.fn.wgsl)
      for (const v of Object.values(e)) if (typeof v === 'object') walk(v)
    }
    walk(ret.value)
    expect(calls.sort()).toEqual(['f_f32', 'f_i32', 'f_u32'])
  })

  it('rejects ambiguous calls and wrong out-argument types', () => {
    expect(() => checked('void f(float a, int b) {} void f(int a, float b) {} void g() { f(1, 1); }')).toThrow(/ambiguous call to 'f\(int, int\)'/)
    expect(() => checked('void f(out float a) { a = 1.0; } void g() { int i; f(i); }')).toThrow(/no matching overload for 'f\(int\)'/)
  })

  it('types swizzles and rejects repeated components as lvalues', () => {
    const c = checked('vec2 f(vec4 v) { return v.zx; }')
    const ret = c.functions[0]?.decl.body?.stmts[0] as ReturnStmt
    expect(ret.value?.ty).toEqual({ k: 'vector', s: 'float', n: 2 })
    expect(() => checked('void f() { vec4 v; v.xx = vec2(1); }')).toThrow(/repeated components/)
  })

  it('makes implicit conversions explicit (int * vec3, volume.glslfx:223)', () => {
    const c = checked('vec3 f(int n, vec3 v) { return n * v; }')
    const ret = c.functions[0]?.decl.body?.stmts[0] as ReturnStmt
    expect(ret.value?.kind === 'binary' && ret.value.left.kind).toBe('convert')
  })

  it('instantiates templates per argument type', () => {
    const r = translateGlslToWgsl({ stage: 'vertex', prelude: false, code: 'template <typename T>\nT twice(T a, vec2 uv = vec2()) { return a + a; }\nvec3 g() { return twice(vec3(1)) + vec3(twice(1.0)); }' })
    expect(r.ok).toBe(true)
    expect(r.body).toContain('fn twice_v3f(a: vec3<f32>, uv: vec2<f32>) -> vec3<f32>')
    expect(r.body).toContain('fn twice_f32(a: f32, uv: vec2<f32>) -> f32')
    expect(r.body).toContain('twice_v3f(vec3<f32>(1.0f), vec2<f32>())')
  })

  it('resolves interface symbol types named by object-like macros (hdSt/codeGen.cpp:415 hd_vec3)', () => {
    const r = translateGlslToWgsl({ stage: 'vertex', code: '#define hd_vec3 hgi_vec3\nvec3 f() { return vec3(n.x, n.y, n.z); }',
      globals: [{ name: 'n', type: 'hd_vec3', space: 'private' }] })
    expect(r.ok).toBe(true)
    expect(r.body).toContain('alias hd_vec3 = hgi_vec3;')
  })

  it('rejects writes to read-only interface buffers and calls to undefined functions', () => {
    const r = translateGlslToWgsl({ stage: 'compute', prelude: false, code: 'void main() { b[0] = 1u; }', globals: [{ name: 'b', type: 'uint', arraySize: 'runtime', space: 'storage', binding: { group: 0, binding: 0 } }] })
    expect(r.diagnostics[0]?.message).toMatch(/read-only 'b'/)
    const r2 = translateGlslToWgsl({ stage: 'compute', prelude: false, code: 'int f(); void main() { f(); }' })
    expect(r2.diagnostics[0]?.message).toMatch(/declared but never defined/)
  })
})

describe('reference parameters, atomics and textures', () => {
  const body = (code: string, globals: Parameters<typeof translateGlslToWgsl>[0]['globals'] = []): string => {
    const r = translateGlslToWgsl({ stage: 'fragment', code, prelude: false, globals })
    expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    return r.body
  }

  it('passes &v for whole locals and copies in/out for components and globals (Safari rejects &v.x)', () => {
    const out = body('vec4 g;\nvoid f(inout float x, out vec2 y) { x += 1.0; y = vec2(x); }\nvoid h() { float a = 0.0; vec4 v; f(a, v.zw); f(v.x, v.xy); f(g.w, v.xy); }')
    expect(out).toContain(`fn f(x: ptr<function, f32>, y: ptr<function, vec2<f32>>) {
  (*x) += 1.0f;
  (*y) = vec2<f32>((*x));
}`)
    expect(out).toContain(`  var a: f32 = 0.0f;
  var v: vec4<f32>;
  var _hgi_t0: vec2<f32>;
  f(&a, &_hgi_t0);
  let _hgi_t1 = _hgi_t0;
  v.z = _hgi_t1.x;
  v.w = _hgi_t1.y;`)
    expect(out).toContain(`  var _hgi_t5: f32 = g.w;
  var _hgi_t6: vec2<f32>;
  f(&_hgi_t5, &_hgi_t6);
  g.w = _hgi_t5;`)
  })

  it('reads and writes atomic buffer elements with atomicLoad/atomicStore (ATOMIC_* as hgiVulkan defines them)', () => {
    const out = body(`${GLSL_PRELUDE.split('\n').filter(l => l.startsWith('#define ATOMIC')).join('\n')}\nvoid f(int i) { uint v = ATOMIC_LOAD(c[i]); ATOMIC_STORE(c[i], v + 1u); ATOMIC_ADD(c[0], 2u); }`, [
      { name: 'c', type: 'uint', atomic: true, arraySize: 'runtime', space: 'storage', access: 'read_write', binding: { group: 0, binding: 3 } },
    ])
    expect(out).toContain('@group(0) @binding(3) var<storage, read_write> c: array<atomic<u32>>;')
    expect(out).toContain(`  var v: u32 = atomicLoad(&c[i]);
  atomicStore(&c[i], (v + 1u));
  _ = atomicAdd(&c[0i], 2u);`)
  })

  it('splits combined samplers into a texture and a sampler', () => {
    const out = body('vec4 f(sampler2DArray s, vec3 uv) { return texture(s, uv) + texelFetch(s, ivec3(uv), 0); }\nvec4 g(vec2 uv) { return f(tex, vec3(uv, 1)) + textureLod(tex2, uv, 0.0); }', [
      { name: 'tex', type: 'sampler2DArray', space: 'handle', binding: { group: 1, binding: 0, samplerBinding: 0 } },
      { name: 'tex2', type: 'sampler2D', space: 'handle', binding: { group: 1, binding: 2 } },
    ])
    expect(out).toContain('@group(1) @binding(0) var tex: texture_2d_array<f32>;\n@group(1) @binding(0) var tex_sampler: sampler;')
    expect(out).toContain('fn f(s: texture_2d_array<f32>, s_sampler: sampler, uv: vec3<f32>) -> vec4<f32> {')
    expect(out).toContain('textureSample(s, s_sampler, uv.xy, i32(floor(uv.z + 0.5f)))')
    expect(out).toContain('textureLoad(s, _hgi_t0.xy, _hgi_t0.z, 0i)')
    expect(out).toContain('f(tex, tex_sampler, vec3<f32>(uv, 1.0f))')
    expect(out).toContain('textureSampleLevel(tex2, tex2_sampler, uv, 0.0f)')
  })
})

// Storm's constant primvar block keeps a bool primvar as a bool member
// (hdSt/codeGen.cpp:5449-5450, _GetPackedType without _ConvertBoolType),
// which GLSL holds in a buffer as 32 bits and WGSL does not allow in a
// buffer at all ("not host-shareable"): the invalid module made the frustum
// culling pipeline, and with it the opaque pass, invalid (belt tour unit 74,
// a `bool primvars:v` mesh).
describe('bool members of buffer structs', () => {
  const code = `struct ConstantData7 { vec4 color; bool v; bvec2 w; };
bool f(int i) { return constantData7[i].v && constantData7[i].w.y; }
ConstantData7 g() { return constantData7[0]; }`
  const globals: Parameters<typeof translateGlslToWgsl>[0]['globals'] = [
    { name: 'constantData7', type: 'ConstantData7', arraySize: 'runtime', space: 'storage', binding: { group: 0, binding: 7 } },
  ]
  it('are u32 members read as != 0u', () => {
    const r = translateGlslToWgsl({ stage: 'compute', prelude: false, code, globals })
    expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    expect(r.body).toContain('struct ConstantData7 {\n  color: vec4<f32>,\n  v: u32,\n  w: vec2<u32>,\n}')
    expect(r.body).toContain('(constantData7[i].v != 0u)')
    expect(r.body).toContain('(constantData7[i].w != vec2<u32>(0u)).y')
  })
  it('stay bool in structs no buffer holds', () => {
    const r = translateGlslToWgsl({ stage: 'compute', prelude: false, code: 'struct S { bool v; };\nbool f(S s) { return s.v; }' })
    expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    expect(r.body).toContain('struct S {\n  v: bool,\n}')
  })
  it('are reported when written', () => {
    const r = translateGlslToWgsl({ stage: 'compute', prelude: false, code: code + '\nvoid h() { constantData7[0].v = true; }',
      globals: [{ ...globals[0]!, access: 'read_write' }] })
    expect(r.diagnostics.map(d => d.message)).toContain("writing bool member 'v' of a struct in a buffer is not supported")
  })
})

