// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hdx/shaders/renderPass.glslfx
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Node tests of the GLSL-to-WGSL emitter: translator output for small
// focused inputs compared with reviewed expected WGSL (packages/usd/docs/
// imaging-i1.md, "Decisions": no WGSL parser; Safari compiles the same kinds
// of output in packages/usd/tests/browser/wgsl-check).
import { describe, expect, it } from 'vitest'
import { translateGlslToWgsl } from '../../src/glsl/translator.ts'

function body(code: string): string {
  const r = translateGlslToWgsl({ stage: 'fragment', code, prelude: false })
  expect(r.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  return r.body
}

describe('GLSL to WGSL lowering', () => {
  it("mangles overloads by parameter type; the parameterless one keeps its name", () => {
    expect(body("int f(int a) { return a; } float f(float a) { return a; } int f() { return f(1); } float g() { return f(2.0) + f(3); }")).toBe(`fn f_i32(a: i32) -> i32 {
  return a;
}

fn f_f32(a: f32) -> f32 {
  return a;
}

fn f() -> i32 {
  return f_i32(1i);
}

fn g() -> f32 {
  return (f_f32(2.0f) + f32(f_i32(3i)));
}
`)
  })

  it("makes implicit int and uint to float conversions explicit", () => {
    expect(body("vec3 h(int k, vec3 v, uint u) { float x = k; return k * v + u; }")).toBe(`fn h(k: i32, v: vec3<f32>, u: u32) -> vec3<f32> {
  var x: f32 = f32(k);
  return ((f32(k) * v) + f32(u));
}
`)
  })

  it("uses select for pure arms and if/else when an arm has side effects or calls", () => {
    expect(body("float a(bool c, float x) { return c ? x : 1.0; } int b(bool c, int i) { return c ? i++ : 0; } float n(); float d(bool c) { return c ? n() : 0.0; } float n() { return 1.0; }")).toBe(`fn a(c: bool, x: f32) -> f32 {
  return select(1.0f, x, c);
}

fn b(c: bool, i_in: i32) -> i32 {
  var i = i_in;
  var _hgi_t0: i32;
  if (c) {
    let _hgi_t1 = i;
    i++;
    _hgi_t0 = _hgi_t1;
  } else {
    _hgi_t0 = 0i;
  }
  return _hgi_t0;
}

fn d(c: bool) -> f32 {
  var _hgi_t0: f32;
  if (c) {
    _hgi_t0 = n();
  } else {
    _hgi_t0 = 0.0f;
  }
  return _hgi_t0;
}

fn n() -> f32 {
  return 1.0f;
}
`)
  })

  it("lowers comma updates, do-while and loop conditions with side effects to loop/continuing", () => {
    expect(body("int L(int n) { int s = 0; for (int i = 0, j = n; i < j; ++i, --j) { s += i; } do { s--; } while (s > 10); while (s++ < 3) {} return s; }")).toBe(`fn L(n: i32) -> i32 {
  var s: i32 = 0i;
  {
    var i: i32 = 0i;
    var j: i32 = n;
    loop {
      if (!((i < j))) { break; }
      s += i;
      continuing {
        i++;
        j--;
      }
    }
  }
  loop {
    s--;
    continuing {
      break if !((s > 10i));
    }
  }
  loop {
    let _hgi_t0 = s;
    s++;
    if (!((_hgi_t0 < 3i))) { break; }
  }
  return s;
}
`)
  })

  it("duplicates fallthrough bodies, groups labels and adds a default", () => {
    expect(body("int S(int k) { int r = 0; switch (k) { case 0: r = 1; case 1: r += 2; break; case 2: case 3: return 7; } return r; }")).toBe(`fn S(k: i32) -> i32 {
  var r: i32 = 0i;
  switch (k) {
    case 0i: {
      r = 1i;
      r += 2i;
    }
    case 1i: {
      r += 2i;
    }
    case 2i, 3i: {
      return 7i;
    }
    default: {}
  }
  return r;
}
`)
  })

  it("writes matrix resize and mixed constructors and mat / scalar explicitly", () => {
    expect(body("mat4 M(mat4 m, float s) { mat3 a = mat3(m); mat4 b = mat4(a); mat2 c = mat2(vec2(1), 2, 3); return b / s; }")).toBe(`fn M(m: mat4x4<f32>, s: f32) -> mat4x4<f32> {
  var a: mat3x3<f32> = mat3x3<f32>(vec3<f32>(m[0][0], m[0][1], m[0][2]), vec3<f32>(m[1][0], m[1][1], m[1][2]), vec3<f32>(m[2][0], m[2][1], m[2][2]));
  var b: mat4x4<f32> = mat4x4<f32>(vec4<f32>(a[0][0], a[0][1], a[0][2], 0.0f), vec4<f32>(a[1][0], a[1][1], a[1][2], 0.0f), vec4<f32>(a[2][0], a[2][1], a[2][2], 0.0f), vec4<f32>(0.0f, 0.0f, 0.0f, 1.0f));
  let _hgi_t0: vec2<f32> = vec2<f32>(1.0f);
  var c: mat2x2<f32> = mat2x2<f32>(_hgi_t0.x, _hgi_t0.y, 2.0f, 3.0f);
  return (b * (1.0f / s));
}
`)
  })

  it("writes typed literals, sign-bit hex ints and u32 shift amounts", () => {
    expect(body("int K(int v) { return (v & 0xc0000000) | (v << 2) | (5u > 3u ? 1 : 0); } uint U() { return 0xffffffffu >> 4; }")).toBe(`fn K(v: i32) -> i32 {
  return (((v & bitcast<i32>(3221225472u)) | (v << 2u)) | select(0i, 1i, (5u > 3u)));
}

fn U() -> u32 {
  return (4294967295u >> 4u);
}
`)
  })

  it("adds a zero return where GLSL lets control reach the end", () => {
    expect(body("int R(int v) { if (v > 0) return 1; }")).toBe(`fn R(v: i32) -> i32 {
  if ((v > 0i)) {
    return 1i;
  }
  return i32();
}
`)
  })

  it("folds constant array sizes and keeps const locals as let", () => {
    expect(body("float C(float x) { const float k = x * 2.0; const int N = 3; float a[N]; a[0] = k; return a[0]; }")).toBe(`fn C(x: f32) -> f32 {
  let k: f32 = (x * 2.0f);
  let N: i32 = 3i;
  var a: array<f32, 3>;
  a[0i] = k;
  return a[0i];
}
`)
  })

  it("hoists ++ out of expressions in evaluation order", () => {
    expect(body("int P(int i) { int a[4]; a[i++] = 1; int b = ++i; return a[i] + b; }")).toBe(`fn P(i_in: i32) -> i32 {
  var i = i_in;
  var a: array<i32, 4>;
  let _hgi_t0 = i;
  i++;
  a[_hgi_t0] = 1i;
  i++;
  var b: i32 = i;
  return (a[i] + b);
}
`)
  })

  it("keeps short-circuit evaluation when the right operand needs statements", () => {
    expect(body("bool f2(); bool L2(bool a) { bool b = a && f2(); int i = 0; bool c = a || (i++ > 0); return b && c; } bool f2() { return true; }")).toBe(`fn L2(a: bool) -> bool {
  var b: bool = (a && f2());
  var i: i32 = 0i;
  var _hgi_t1 = a;
  if (!_hgi_t1) {
    let _hgi_t0 = i;
    i++;
    _hgi_t1 = (_hgi_t0 > 0i);
  }
  var c: bool = _hgi_t1;
  return (b && c);
}

fn f2() -> bool {
  return true;
}
`)
  })

  it("lowers vector ==, bitwise with scalars, shifts and lessThan", () => {
    expect(body("bvec3 V(vec3 a, vec3 b) { bool e = a == b; ivec3 i = ivec3(1) & 3; ivec3 j = i << 1; return lessThan(a, b); }")).toBe(`fn V(a: vec3<f32>, b: vec3<f32>) -> vec3<bool> {
  var e: bool = all(a == b);
  var i: vec3<i32> = (vec3<i32>(1i) & vec3<i32>(3i));
  var j: vec3<i32> = (i << vec3<u32>(1u));
  return (a < b);
}
`)
  })

  it("splats scalar arguments and uses helpers for mod and isnan", () => {
    expect(body("vec3 B(vec3 a, float t) { return mix(a, vec3(1), t) + clamp(a, 0.0, 1.0) + max(a, 0.5) + vec3(atan(a.y, a.x)) + step(0.5, a) + mod(a, 2.0) + vec3(isnan(t) ? 1 : 0); }")).toBe(`fn glsl_isnan_float(x: f32) -> bool { return (bitcast<u32>(x) & 0x7fffffffu) > 0x7f800000u; }

fn glsl_mod_vec3(x: vec3<f32>, y: vec3<f32>) -> vec3<f32> { return x - y * floor(x / y); }

fn B(a: vec3<f32>, t: f32) -> vec3<f32> {
  return ((((((mix(a, vec3<f32>(1.0f), t) + clamp(a, vec3<f32>(0.0f), vec3<f32>(1.0f))) + max(a, vec3<f32>(0.5f))) + vec3<f32>(atan2(a.y, a.x))) + step(vec3<f32>(0.5f), a)) + glsl_mod_vec3(a, vec3<f32>(2.0f))) + vec3<f32>(f32(select(0i, 1i, glsl_isnan_float(t)))));
}
`)
  })

  it("writes structs, array constructors and swizzle stores through a temporary", () => {
    expect(body("struct S { int x, y; vec2 v[2]; }; S mk() { S s = S(1, 2, vec2[2](vec2(0), vec2(1))); s.v[1].yx = vec2(3); return s; }")).toBe(`struct S {
  x: i32,
  y: i32,
  v: array<vec2<f32>, 2>,
}

fn mk() -> S {
  var s: S = S(1i, 2i, array<vec2<f32>, 2>(vec2<f32>(0.0f), vec2<f32>(1.0f)));
  let _hgi_t0 = vec2<f32>(3.0f);
  s.v[1i].y = _hgi_t0.x;
  s.v[1i].x = _hgi_t0.y;
  return s;
}
`)
  })

})

describe('GLSL to WGSL lowering: frexp', () => {
  // hdx/shaders/renderPass.glslfx ToRGBE (HdxRenderPass.WriteOitLayersToBufferCommon)
  it('assigns the exponent of frexp to its out argument', () => {
    expect(body('float f(float x) { int e; float m = frexp(x, e); return m + float(e); }')).toBe(`fn f(x: f32) -> f32 {
  var e: i32;
  let _hgi_t0 = frexp(x);
  e = _hgi_t0.exp;
  var m: f32 = _hgi_t0.fract;
  return (m + f32(e));
}
`)
  })
})
