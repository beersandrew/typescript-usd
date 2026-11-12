// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderGenerator.mm,
//  pxr/imaging/hgiVulkan/shaderGenerator.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GLSL prelude for HgiWebGPU (no upstream counterpart for the translator; the
// prelude itself mirrors the backends' preludes).
//
// Storm's code generator and glslfx sections rely on macros and packed types
// that each Hgi backend's shader generator defines in front of the code:
// - REF, FORWARD_DECL, ATOMIC_*, atomic_int/atomic_uint as hgiVulkan writes
//   them (pxr/imaging/hgiVulkan/shaderGenerator.cpp:238-250); REF becomes an
//   `inout` parameter, which the translator lowers to a pointer;
// - the HGI_COMPILER_ATTR_* loop attributes, empty as on hgiVulkan without
//   GL_EXT_control_flow_attributes (shaderGenerator.cpp:200-205);
// - the hgi_ivec3/hgi_vec3/hgi_dvec3/hgi_mat3/hgi_dmat3 packed structs
//   (hgiVulkan/shaderGenerator.cpp:19-31); `double` is float on WebGPU, as on
//   Metal (hgiMetal/shaderGenerator.mm:416-470), because WGSL has no f64.
// - gl_MaxTessGenLevel, the GLSL built-in constant (GLSL 4.60 section 7.3,
//   minimum 64; glslang's default resource limits, which hgiVulkan's shaderc
//   compile uses, give 64). OpenSubdiv's patch drawing source
//   (opensubdiv/osd/glslPatchCommonTess.glsl, OsdComputeTessLevel) reads it in
//   every stage Storm includes it in.
// hgiVulkan's `#define hd_SampleMask gl_SampleMask[0]` is not copied: WGSL's
// sample_mask is a scalar, so the shader generator binds hd_SampleMask
// directly.

export const GLSL_PRELUDE = `// HgiWebGPU GLSL prelude (pxr/imaging/hgiVulkan/shaderGenerator.cpp:19-31, 200-205, 238-250)
#define REF(space,type) inout type
#define FORWARD_DECL(func_decl) func_decl
#define ATOMIC_LOAD(a) (a)
#define ATOMIC_STORE(a, v) (a) = (v)
#define ATOMIC_ADD(a, v) atomicAdd(a, v)
#define ATOMIC_EXCHANGE(a, v) atomicExchange(a, v)
#define ATOMIC_COMP_SWAP(a, expected, desired) atomicCompSwap(a, expected, desired)
#define atomic_int int
#define atomic_uint uint
#define HGI_COMPILER_ATTR_UNROLL
#define HGI_COMPILER_ATTR_DONT_UNROLL
#define HGI_COMPILER_ATTR_FLATTEN
#define HGI_COMPILER_ATTR_DONT_FLATTEN
const int gl_MaxTessGenLevel = 64;
struct hgi_ivec3 { int    x, y, z; };
struct hgi_vec3  { float  x, y, z; };
struct hgi_dvec3 { double x, y, z; };
struct hgi_mat3  { float  m00, m01, m02,
                          m10, m11, m12,
                          m20, m21, m22; };
struct hgi_dmat3 { double m00, m01, m02,
                          m10, m11, m12,
                          m20, m21, m22; };
`
