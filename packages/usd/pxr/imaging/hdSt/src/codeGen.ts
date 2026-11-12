// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/codeGen.cpp,
//  pxr/imaging/hdSt/codeGen.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/codeGen.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences (each also commented at its site):
// - std::stringstream is _Stream: `ss << a << b` is `ss.write(a, b)`, `ss.str()`
//   reads and `ss.str(s)` replaces the contents. Integers stream as decimal;
//   floating-point values are streamed with _StreamFloat, which reproduces
//   std::ostream's default formatting (%g, precision 6).
// - Overloaded static helpers are single functions that dispatch on their
//   arguments as C++ overload resolution does.
// - ID is a bigint (TfHash); the hash is a cache key only.

import {
  Token as TfToken,
  MakeTokens as TfMakeTokens,
  Hash as TfHash,
  HashCombine as TfHashCombine,
  TfEnvSetting,
  TfGetEnvSetting,
} from 'typescript-usd/tf'
import { Vec3i as GfVec3i } from 'typescript-usd/gf'
import {
  ShaderTokens as HdShaderTokens,
  Tokens as HdTokens,
  VtBufferSource as HdVtBufferSource,
  type Format as HdFormat,
} from 'typescript-usd/hd'
import {
  HgiTokens,
  HgiBindingType,
  HgiDeviceCapabilitiesBits,
  HgiInterpolationType,
  HgiPrimitiveType,
  HgiSamplingType,
  HgiStorageType,
  HgiShaderKeywordTokens,
  HgiShaderStageBits,
  HgiShaderTextureType,
  HgiShaderFunctionDesc,
  HgiShaderFunctionParamDesc,
  HgiShaderFunctionParamBlockDesc,
  HgiShaderFunctionParamBlockDescMember,
  HgiShaderFunctionTessellationDescPatchType,
  HgiShaderFunctionTessellationDescSpacing,
  HgiShaderFunctionTessellationDescOrdering,
  HgiShaderFunctionGeometryDescInPrimitiveType,
  HgiShaderFunctionGeometryDescOutPrimitiveType,
  HgiShaderFunctionAddArrayOfTextures,
  HgiShaderFunctionAddTexture,
  HgiShaderFunctionAddBuffer,
  HgiShaderFunctionAddWritableBuffer,
  HgiShaderFunctionAddConstantParam,
  HgiShaderFunctionAddStageInput,
  HgiShaderFunctionAddStageOutput,
  type Hgi,
  type HgiShaderStage,
  type HgiShaderCodeOut,
} from 'typescript-usd/hgi'
import {
  HioGlslfx,
  HioGlslfxResourceLayout,
  HioGlslfxResourceLayoutTokens,
  HioGlslfxResourceLayoutInOut,
  HioGlslfxResourceLayoutMember,
  HioGlslfxResourceLayoutTextureType,
  HioFormat,
  HioType,
  HioGetHioType,
  type HioGlslfxResourceLayoutElement,
  type HioGlslfxResourceLayoutElementVector,
  type HioGlslfxResourceLayoutMemberVector,
  type HioGlslfxResourceLayoutTextureElementVector,
} from 'typescript-usd/hio'
import { HdStBinding, HdStBindingType } from './binding.ts'
import { HdStGLConversions } from './glConversions.ts'
import {
  HdSt_GeometricShader,
  HdSt_GeometricShaderFvarPatchType,
  HdSt_GeometricShaderPrimitiveType,
} from './geometricShader.ts'
import { HdStGLSLProgram } from './glslProgram.ts'
import { HdStHgiConversions } from './hgiConversions.ts'
import { HdStHioConversions } from './hioConversions.ts'
import { HdStPackagePtexTextureShader } from './package.ts'
import {
  HdSt_ResourceBindingSuffixTokens,
  HdSt_ResourceBinderMetaDataBindingDeclaration,
  type HdSt_ResourceBinderMetaData,
  type HdSt_ResourceBinderMetaDataShaderParameterAccessor,
} from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStShaderCode } from './shaderCode.ts'
import { HdStMaterialTagTokens, HdStTokens } from './tokens.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'
import { GLSLPatchShaderSource as OsdGLSLPatchShaderSource } from '@opensubdiv/core/osd'

/** std::stringstream stand-in (see header). */
export class _Stream {
  private _s = ''

  /** operator<< for each argument in order. */
  write(...values: Array<string | number>): this {
    for (const v of values) this._s += typeof v === 'number' ? String(v) : v
    return this
  }

  /** std::stringstream::str() / str(s). */
  str(): string
  str(s: string): void
  str(s?: string): string | void {
    if (s === undefined) return this._s
    this._s = s
  }
}

/** `std::ostream << double` with default flags: %g with precision 6. */
export function _StreamFloat(v: number): string {
  if (Number.isNaN(v)) return 'nan'
  if (!Number.isFinite(v)) return v < 0 ? '-inf' : 'inf'
  if (v === 0) return Object.is(v, -0) ? '-0' : '0'
  const exp = Math.floor(Math.log10(Math.abs(Number(v.toPrecision(6)))))
  if (exp < -4 || exp >= 6) {
    let [m, e] = v.toExponential(5).split('e')
    if (m!.includes('.')) m = m!.replace(/0+$/, '').replace(/\.$/, '')
    const en = Number(e)
    return `${m}e${en < 0 ? '-' : '+'}${String(Math.abs(en)).padStart(2, '0')}`
  }
  let s = v.toFixed(Math.max(0, 5 - exp))
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s
}

// codeGen.cpp:38-74 select OpenSubdiv's MSL and/or GLSL patch shader source
// at build time. Both are compiled in here; _GetOSDCommonShaderSource and
// _GetOSDPatchBasisShaderSource choose by Hgi backend at run time, as a build
// with both HDST_CODEGEN_HAS_MSL and HDST_CODEGEN_HAS_GLSL does.

/** TF_DEFINE_PRIVATE_TOKENS (codeGen.cpp:78-164) */
const _tokens = TfMakeTokens({
  _double: 'double',
  _float: 'float',
  _int: 'int',
  _uint: 'uint',
  _bool: 'bool',
  _atomic_int: 'atomic_int',
  _atomic_uint: 'atomic_uint',
  _default: 'default',
  flat: 'flat',
  noperspective: 'noperspective',
  sample: 'sample',
  centroid: 'centroid',
  patch: 'patch',
  hd_barycentricCoord: 'hd_barycentricCoord',
  hd_patchID: 'hd_patchID',
  hd_tessCoord: 'hd_tessCoord',
  hd_vec3: 'hd_vec3',
  hd_vec3_get: 'hd_vec3_get',
  hd_vec3_set: 'hd_vec3_set',
  hd_ivec3: 'hd_ivec3',
  hd_ivec3_get: 'hd_ivec3_get',
  hd_ivec3_set: 'hd_ivec3_set',
  hd_dvec3: 'hd_dvec3',
  hd_dvec3_get: 'hd_dvec3_get',
  hd_dvec3_set: 'hd_dvec3_set',
  hd_mat3: 'hd_mat3',
  hd_mat3_get: 'hd_mat3_get',
  hd_mat3_set: 'hd_mat3_set',
  hd_dmat3: 'hd_dmat3',
  hd_dmat3_get: 'hd_dmat3_get',
  hd_dmat3_set: 'hd_dmat3_set',
  hd_vec4_2_10_10_10_get: 'hd_vec4_2_10_10_10_get',
  hd_vec4_2_10_10_10_set: 'hd_vec4_2_10_10_10_set',
  hd_half2_get: 'hd_half2_get',
  hd_half2_set: 'hd_half2_set',
  hd_half4_get: 'hd_half4_get',
  hd_half4_set: 'hd_half4_set',
  PrimvarData: 'PrimvarData',
  inPrimvars: 'inPrimvars',
  uvec2: 'uvec2',
  uvec3: 'uvec3',
  uvec4: 'uvec4',
  ivec2: 'ivec2',
  ivec3: 'ivec3',
  ivec4: 'ivec4',
  outPrimvars: 'outPrimvars',
  vec2: 'vec2',
  vec3: 'vec3',
  vec4: 'vec4',
  dvec2: 'dvec2',
  dvec3: 'dvec3',
  dvec4: 'dvec4',
  mat3: 'mat3',
  mat4: 'mat4',
  dmat3: 'dmat3',
  dmat4: 'dmat4',
  packed_2_10_10_10: 'packed_2_10_10_10',
  packed_half2: 'packed_half2',
  packed_half4: 'packed_half4',
  ptexTextureSampler: 'ptexTextureSampler',
  isamplerBuffer: 'isamplerBuffer',
  samplerBuffer: 'samplerBuffer',
  gl_MaxPatchVertices: 'gl_MaxPatchVertices',
  HD_NUM_PATCH_EVAL_VERTS: 'HD_NUM_PATCH_EVAL_VERTS',
  HD_NUM_PRIMITIVE_VERTS: 'HD_NUM_PRIMITIVE_VERTS',
  quads: 'quads',
  isolines: 'isolines',
  equal_spacing: 'equal_spacing',
  fractional_even_spacing: 'fractional_even_spacing',
  fractional_odd_spacing: 'fractional_odd_spacing',
  cw: 'cw',
  ccw: 'ccw',
  points: 'points',
  lines: 'lines',
  lines_adjacency: 'lines_adjacency',
  triangles: 'triangles',
  triangles_adjacency: 'triangles_adjacency',
  line_strip: 'line_strip',
  triangle_strip: 'triangle_strip',
  early_fragment_tests: 'early_fragment_tests',
  OsdPerPatchVertexBezier: 'OsdPerPatchVertexBezier',
  interstageDrawingCoord: 'interstageDrawingCoord',
  withoutScaleAndBias: '_withoutScaleAndBias',
  applyScaleAndBias: '_applyScaleAndBias',
})

/** codeGen.cpp:166-167 */
const HDST_ENABLE_HGI_RESOURCE_GENERATION = new TfEnvSetting<boolean>(
  'HDST_ENABLE_HGI_RESOURCE_GENERATION', false,
  'Enable Hgi resource generation for codeGen')

/** codeGen.cpp:172-176 */
function _IsHgiMetal(hgi: Hgi): boolean {
  return HgiTokens.Metal === hgi.getAPIName()
}

/** codeGen.cpp:179-183 */
function _IsHgiOpenGL(hgi: Hgi): boolean {
  return HgiTokens.OpenGL === hgi.getAPIName()
}

// `static bool const isEnabled` (codeGen.cpp:191-192)
let _isEnabledHgiResourceGeneration: boolean | undefined

/** codeGen.cpp:312-320 */
let _ptexTextureShaderSource: string | undefined
function _GetPtexTextureShaderSource(): string {
  if (_ptexTextureShaderSource === undefined) {
    _ptexTextureShaderSource =
      new HioGlslfx(HdStPackagePtexTextureShader()).getSource(
        _tokens.ptexTextureSampler)
  }
  return _ptexTextureShaderSource
}

// codeGen.cpp:322-364 forward-declare _EmitDeclaration, _EmitStructAccessor,
// _EmitComputeAccessor, _EmitComputeMutator, _EmitAccessor and
// _EmitScalarAccessor; their definitions follow later in this file.

/*
  1. If the member is a scalar consuming N basic machine units,
  the base alignment is N.
  2. If the member is a two- or four-component vector with components
  consuming N basic machine units, the base alignment is 2N or 4N,
  respectively.
  3. If the member is a three-component vector with components
  consuming N basic machine units, the base alignment is 4N.
  4. If the member is an array of scalars or vectors, the base
  alignment and array stride are set to match the base alignment of
  a single array element, according to rules (1), (2), and (3), and
  rounded up to the base alignment of a vec4. The array may have
  padding at the end; the base offset of the member following the
  array is rounded up to the next multiple of the base alignment.

  9. If the member is a structure, the base alignment of the structure
  is <N>, where <N> is the largest base alignment value of any of its
  members, and rounded up to the base alignment of a vec4. The
  individual members of this sub-structure are then assigned offsets
  by applying this set of rules recursively, where the base offset of
  the first member of the sub-structure is equal to the aligned offset
  of the structure. The structure may have padding at the end; the
  base offset of the member following the sub-structure is rounded up
  to the next multiple of the base alignment of the structure.

  When using the std430 storage layout, shader storage blocks will be
  laid out in buffer storage identically to uniform and shader storage
  blocks using the std140 layout, except that the base alignment and
  stride of arrays of scalars and vectors in rule 4 and of structures
  in rule 9 are not rounded up a multiple of the base alignment of a
  vec4.

  i.e. rule 3 is still applied in std430. we use an array of 3-element
  struct instead of vec3/dvec3 to avoid this undesirable padding.

  struct instanceData0 {
    float x, y, z;
  }
  buffer buffer0 {
    instanceData0 data[];
  };
*/

/** codeGen.cpp:409-483 */
function _GetPackedTypeDefinitions(): string {
  return '' +
    '// Alias hgi vec and matrix types to hd.\n' +
    '#define hd_ivec3 hgi_ivec3\n' +
    '#define hd_vec3 hgi_vec3\n' +
    '#define hd_dvec3 hgi_dvec3\n' +
    '#define hd_mat3 hgi_mat3\n' +
    '#define hd_dmat3 hgi_dmat3\n' +
    '\n' +
    'ivec3 hd_ivec3_get(hd_ivec3 v) { return ivec3(v.x, v.y, v.z); }\n' +
    'ivec3 hd_ivec3_get(ivec3 v)    { return v; }\n' +
    'vec3  hd_vec3_get(hd_vec3 v)   { return vec3(v.x, v.y, v.z); }\n' +
    'vec3  hd_vec3_get(vec3 v)      { return v; }\n' +
    'dvec3 hd_dvec3_get(hd_dvec3 v) { return dvec3(v.x, v.y, v.z); }\n' +
    'dvec3 hd_dvec3_get(dvec3 v)    { return v; }\n' +
    'mat3  hd_mat3_get(hd_mat3 v)   { return mat3(v.m00, v.m01, v.m02,\n' +
    '                                             v.m10, v.m11, v.m12,\n' +
    '                                             v.m20, v.m21, v.m22); }\n' +
    'mat3  hd_mat3_get(mat3 v)      { return v; }\n' +
    'dmat3 hd_dmat3_get(hd_dmat3 v) { return dmat3(v.m00, v.m01, v.m02,\n' +
    '                                              v.m10, v.m11, v.m12,\n' +
    '                                              v.m20, v.m21, v.m22); }\n' +
    'dmat3 hd_dmat3_get(dmat3 v)    { return v; }\n' +
    'hd_ivec3 hd_ivec3_set(hd_ivec3 v) { return v; }\n' +
    'hd_ivec3 hd_ivec3_set(ivec3 v)    { return hd_ivec3(v.x, v.y, v.z); }\n' +
    'hd_vec3 hd_vec3_set(hd_vec3 v)    { return v; }\n' +
    'hd_vec3 hd_vec3_set(vec3 v)       { return hd_vec3(v.x, v.y, v.z); }\n' +
    'hd_dvec3 hd_dvec3_set(hd_dvec3 v) { return v; }\n' +
    'hd_dvec3 hd_dvec3_set(dvec3 v)    { return hd_dvec3(v.x, v.y, v.z); }\n' +
    'hd_mat3  hd_mat3_set(hd_mat3 v)   { return v; }\n' +
    'hd_mat3  hd_mat3_set(mat3 v)      { return hd_mat3(v[0][0], v[0][1], v[0][2],\n' +
    '                                                   v[1][0], v[1][1], v[1][2],\n' +
    '                                                   v[2][0], v[2][1], v[2][2]); }\n' +
    'hd_dmat3 hd_dmat3_set(hd_dmat3 v) { return v; }\n' +
    'hd_dmat3 hd_dmat3_set(dmat3 v)    { return hd_dmat3(v[0][0], v[0][1], v[0][2],\n' +
    '                                                    v[1][0], v[1][1], v[1][2],\n' +
    '                                                    v[2][0], v[2][1], v[2][2]); }\n' +
    // helper functions for 410 specification
    // applying a swizzle operator on int and float is not allowed in 410.
    'int hd_int_get(int v)          { return v; }\n' +
    'int hd_int_get(ivec2 v)        { return v.x; }\n' +
    'int hd_int_get(ivec3 v)        { return v.x; }\n' +
    'int hd_int_get(ivec4 v)        { return v.x; }\n' +
    // udim helper function
    'vec3 hd_sample_udim(vec2 v) {\n' +
    'vec2 vf = floor(v);\n' +
    'return vec3(v.x - vf.x, v.y - vf.y, clamp(vf.x, 0.0, 10.0) + 10.0 * vf.y);\n' +
    '}\n' +

    // -------------------------------------------------------------------
    // Packed HdType implementation.

    // XXX: this could be improved!
    'vec4 hd_vec4_2_10_10_10_get(int v) {\n' +
    '    ivec4 unpacked = ivec4((v & 0x3ff) << 22, (v & 0xffc00) << 12,\n' +
    '                           (v & 0x3ff00000) << 2, (v & 0xc0000000));\n' +
    '    return vec4(unpacked) / 2147483647.0; }\n' +
    'int hd_vec4_2_10_10_10_set(vec4 v) {\n' +
    '    return ( (int(v.x * 511.0) & 0x3ff) |\n' +
    '            ((int(v.y * 511.0) & 0x3ff) << 10) |\n' +
    '            ((int(v.z * 511.0) & 0x3ff) << 20) |\n' +
    '            ((int(v.w) & 0x1) << 30)); }\n' +
    // half2 and half4 accessors (note that half and half3 are unsupported)
    'vec2 hd_half2_get(uint v) {\n' +
    '    return unpackHalf2x16(v); }\n' +
    'uint hd_half2_set(vec2 v) {\n' +
    '    return packHalf2x16(v); }\n' +
    'vec4 hd_half4_get(uvec2 v) {\n' +
    '    return vec4(unpackHalf2x16(v.x), unpackHalf2x16(v.y)); }\n' +
    'uvec2 hd_half4_set(vec4 v) {\n' +
    '    return uvec2(packHalf2x16(v.xy), packHalf2x16(v.zw)); }\n'
}

/** codeGen.cpp:485-511 */
function _GetPackedType(token: TfToken, packedAlignment: boolean): TfToken {
  if (packedAlignment) {
    if (token === _tokens.ivec3) {
      return _tokens.hd_ivec3
    } else if (token === _tokens.vec3) {
      return _tokens.hd_vec3
    } else if (token === _tokens.dvec3) {
      return _tokens.hd_dvec3
    } else if (token === _tokens.mat3) {
      return _tokens.hd_mat3
    } else if (token === _tokens.dmat3) {
      return _tokens.hd_dmat3
    }
  }
  if (token === _tokens.packed_2_10_10_10) {
    return _tokens._int
  }
  if (token === _tokens.packed_half2) {
    return _tokens._uint
  }
  if (token === _tokens.packed_half4) {
    return _tokens.uvec2
  }
  return token
}

/** codeGen.cpp:513-526 */
function _GetUnpackedType(token: TfToken, _packedAlignment: boolean): TfToken {
  if (token === _tokens.packed_2_10_10_10) {
    return _tokens.vec4
  }
  if (token === _tokens.packed_half2) {
    return _tokens.vec2
  }
  if (token === _tokens.packed_half4) {
    return _tokens.vec4
  }
  return token
}

/** codeGen.cpp:528-554 */
function _GetPackedTypeAccessor(token: TfToken, packedAlignment: boolean): TfToken {
  if (packedAlignment) {
    if (token === _tokens.ivec3) {
      return _tokens.hd_ivec3_get
    } else if (token === _tokens.vec3) {
      return _tokens.hd_vec3_get
    } else if (token === _tokens.dvec3) {
      return _tokens.hd_dvec3_get
    } else if (token === _tokens.mat3) {
      return _tokens.hd_mat3_get
    } else if (token === _tokens.dmat3) {
      return _tokens.hd_dmat3_get
    }
  }
  if (token === _tokens.packed_2_10_10_10) {
    return _tokens.hd_vec4_2_10_10_10_get
  }
  if (token === _tokens.packed_half2) {
    return _tokens.hd_half2_get
  }
  if (token === _tokens.packed_half4) {
    return _tokens.hd_half4_get
  }
  return token
}

/** codeGen.cpp:556-582 */
function _GetPackedTypeMutator(token: TfToken, packedAlignment: boolean): TfToken {
  if (packedAlignment) {
    if (token === _tokens.ivec3) {
      return _tokens.hd_ivec3_set
    } else if (token === _tokens.vec3) {
      return _tokens.hd_vec3_set
    } else if (token === _tokens.dvec3) {
      return _tokens.hd_dvec3_set
    } else if (token === _tokens.mat3) {
      return _tokens.hd_mat3_set
    } else if (token === _tokens.dmat3) {
      return _tokens.hd_dmat3_set
    }
  }
  if (token === _tokens.packed_2_10_10_10) {
    return _tokens.hd_vec4_2_10_10_10_set
  }
  if (token === _tokens.packed_half2) {
    return _tokens.hd_half2_set
  }
  if (token === _tokens.packed_half4) {
    return _tokens.hd_half4_set
  }
  return token
}

/** codeGen.cpp:584-621 */
function _GetFlatType(token: TfToken): TfToken {
  if (token === _tokens.ivec2) {
    return _tokens._int
  } else if (token === _tokens.ivec3) {
    return _tokens._int
  } else if (token === _tokens.ivec4) {
    return _tokens._int
  } else if (token === _tokens.vec2) {
    return _tokens._float
  } else if (token === _tokens.vec3) {
    return _tokens._float
  } else if (token === _tokens.vec4) {
    return _tokens._float
  } else if (token === _tokens.dvec2) {
    return _tokens._double
  } else if (token === _tokens.dvec3) {
    return _tokens._double
  } else if (token === _tokens.dvec4) {
    return _tokens._double
  } else if (token === _tokens.mat3) {
    return _tokens._float
  } else if (token === _tokens.mat4) {
    return _tokens._float
  } else if (token === _tokens.dmat3) {
    return _tokens._double
  } else if (token === _tokens.dmat4) {
    return _tokens._double
  } else if (token === _tokens.packed_2_10_10_10) {
    return _tokens._float
  } else if (token === _tokens.packed_half2) {
    return _tokens._float
  } else if (token === _tokens.packed_half4) {
    return _tokens._float
  }
  return token
}

/** codeGen.cpp:623-644 */
function _GetFlatTypeSwizzleString(token: TfToken): string {
  if (token === _tokens.ivec2 ||
    token === _tokens.ivec3 ||
    token === _tokens.ivec4 ||
    token === _tokens.uvec2 ||
    token === _tokens.uvec3 ||
    token === _tokens.uvec4 ||
    token === _tokens.vec2 ||
    token === _tokens.vec3 ||
    token === _tokens.vec4 ||
    token === _tokens.dvec2 ||
    token === _tokens.dvec3 ||
    token === _tokens.dvec4 ||
    token === _tokens.packed_2_10_10_10 ||
    token === _tokens.packed_half2 ||
    token === _tokens.packed_half4) {
    return '.x'
  }
  return ''
}

/** codeGen.cpp:646-653 */
function _ConvertBoolType(token: TfToken): TfToken {
  if (token === _tokens._bool) {
    return _tokens._int
  }
  return token
}

// codeGen.cpp:657-659. These aliases are visible to the rest of the file, as
// the anonymous namespace's using-declarations are upstream.
const InOut = HioGlslfxResourceLayout.InOut
const Kind = HioGlslfxResourceLayout.Kind
const TextureType = HioGlslfxResourceLayout.TextureType
type InOut = (typeof InOut)[keyof typeof InOut]
type TextureType = (typeof TextureType)[keyof typeof TextureType]

/** codeGen.cpp:661-811 */
class _ResourceGenerator {
  // std::unordered_map<TfToken, int32_t, TfHash>; only looked up by key.
  private _interstageSlotTable = new Map<TfToken, number>()
  private _nextInterstageSlot = 0
  private _outputSlotTable = new Map<TfToken, number>()
  private _nextOutputSlot = 0
  private _nextOutputLocation = 0

  /** codeGen.cpp:840-1087 */
  _generateHgiResources(
    hgi: Hgi,
    funcDesc: HgiShaderFunctionDesc,
    shaderStage: TfToken,
    elements: readonly HioGlslfxResourceLayoutElement[],
    metaData: HdSt_ResourceBinderMetaData,
  ): void {
    for (const element of elements) {
      if (!(element.stageVisibility &
        HdStHgiConversions.getHgiShaderStage(shaderStage))) {
        continue
      }
      if (element.kind === Kind.VALUE) {
        if (element.inOut === InOut.STAGE_IN) {
          if (_IsVertexAttribInputStage(shaderStage)) {
            const param = new HgiShaderFunctionParamDesc()
            param.nameInShader = element.name
            param.type = element.dataType
            if (shaderStage === HdShaderTokens.postTessControlShader ||
              shaderStage === HdShaderTokens.postTessVertexShader) {
              param.arraySize = 'VERTEX_CONTROL_POINTS_PER_PATCH'
            }
            param.location = this._getLocation(element, metaData)
            if (param.location !== -1) {
              HgiShaderFunctionAddStageInput(funcDesc, param)
            }
          } else {
            const param = new HgiShaderFunctionParamDesc()
            param.nameInShader = element.name
            param.type = element.dataType
            param.interstageSlot = this._getSlot(element.name, /*in*/true,
              _GetLocationCount(hgi, element.dataType))
            param.interpolation = this._getInterpolation(element.qualifiers)
            param.sampling = this._getSamplingQualifier(element.qualifiers)
            param.storage = this._getStorageQualifier(element.qualifiers)
            param.arraySize = element.arraySize
            HgiShaderFunctionAddStageInput(funcDesc, param)
          }
        } else if (element.inOut === InOut.STAGE_OUT) {
          if (shaderStage === HdShaderTokens.fragmentShader) {
            HgiShaderFunctionAddStageOutput(
              funcDesc,
              /*name=*/element.name,
              /*type=*/element.dataType,
              /*role=*/this._getOutputRoleName(element.name))
          } else {
            const param = new HgiShaderFunctionParamDesc()
            param.nameInShader = element.name
            param.type = element.dataType
            param.interstageSlot = this._getSlot(element.name, /*in*/false,
              _GetLocationCount(hgi, element.dataType))
            param.interpolation = this._getInterpolation(element.qualifiers)
            param.sampling = this._getSamplingQualifier(element.qualifiers)
            param.storage = this._getStorageQualifier(element.qualifiers)
            param.arraySize = element.arraySize
            HgiShaderFunctionAddStageOutput(funcDesc, param)
          }
        }
      } else if (element.kind === Kind.BLOCK) {
        const paramBlock = new HgiShaderFunctionParamBlockDesc()
        paramBlock.blockName = element.aggregateName
        paramBlock.instanceName = element.name
        paramBlock.arraySize = element.arraySize

        const firstMemberBlockName =
          this._getFlattenedName(element.aggregateName,
            element.members[0]!.name)

        let locationCount = 0
        for (const member of element.members) {
          locationCount += _GetLocationCount(hgi, member.dataType)
        }
        paramBlock.interstageSlot = this._getSlot(firstMemberBlockName,
          /*in*/element.inOut === InOut.STAGE_IN, locationCount)

        for (const member of element.members) {
          const paramMember = new HgiShaderFunctionParamBlockDescMember()
          paramMember.name = member.name
          paramMember.type = _ConvertBoolType(member.dataType)
          paramMember.interpolation = this._getInterpolation(member.qualifiers)
          paramMember.sampling = this._getSamplingQualifier(member.qualifiers)
          paramBlock.members.push(paramMember)
        }
        if (element.inOut === InOut.STAGE_IN) {
          funcDesc.stageInputBlocks.push(paramBlock)
        } else {
          funcDesc.stageOutputBlocks.push(paramBlock)
        }
      } else if (element.kind === Kind.QUALIFIER) {
        if (shaderStage === HdShaderTokens.tessControlShader) {
          if (element.inOut === InOut.STAGE_OUT) {
            funcDesc.tessellationDescriptor.numVertsPerPatchOut =
              element.qualifiers
          }
        } else if (shaderStage === HdShaderTokens.tessEvalShader ||
          shaderStage === HdShaderTokens.postTessVertexShader) {
          if (element.inOut === InOut.STAGE_IN) {
            if (element.qualifiers === _tokens.triangles) {
              funcDesc.tessellationDescriptor.patchType =
                HgiShaderFunctionTessellationDescPatchType.Triangles
            } else if (element.qualifiers === _tokens.quads) {
              funcDesc.tessellationDescriptor.patchType =
                HgiShaderFunctionTessellationDescPatchType.Quads
            } else if (element.qualifiers === _tokens.isolines) {
              funcDesc.tessellationDescriptor.patchType =
                HgiShaderFunctionTessellationDescPatchType.Isolines
            } else if (element.qualifiers ===
              _tokens.equal_spacing) {
              funcDesc.tessellationDescriptor.spacing =
                HgiShaderFunctionTessellationDescSpacing.Equal
            } else if (element.qualifiers ===
              _tokens.fractional_even_spacing) {
              funcDesc.tessellationDescriptor.spacing =
                HgiShaderFunctionTessellationDescSpacing.FractionalEven
            } else if (element.qualifiers ===
              _tokens.fractional_odd_spacing) {
              funcDesc.tessellationDescriptor.spacing =
                HgiShaderFunctionTessellationDescSpacing.FractionalOdd
            } else if (element.qualifiers === _tokens.cw) {
              funcDesc.tessellationDescriptor.ordering =
                HgiShaderFunctionTessellationDescOrdering.CW
            } else if (element.qualifiers === _tokens.ccw) {
              funcDesc.tessellationDescriptor.ordering =
                HgiShaderFunctionTessellationDescOrdering.CCW
            }
          }
        } else if (shaderStage === HdShaderTokens.geometryShader) {
          if (element.inOut === InOut.STAGE_IN) {
            if (element.qualifiers === _tokens.points) {
              funcDesc.geometryDescriptor.inPrimitiveType =
                HgiShaderFunctionGeometryDescInPrimitiveType.Points
            } else if (element.qualifiers === _tokens.lines) {
              funcDesc.geometryDescriptor.inPrimitiveType =
                HgiShaderFunctionGeometryDescInPrimitiveType.Lines
            } else if (element.qualifiers === _tokens.lines_adjacency) {
              funcDesc.geometryDescriptor.inPrimitiveType =
                HgiShaderFunctionGeometryDescInPrimitiveType.LinesAdjacency
            } else if (element.qualifiers === _tokens.triangles) {
              funcDesc.geometryDescriptor.inPrimitiveType =
                HgiShaderFunctionGeometryDescInPrimitiveType.Triangles
            } else if (element.qualifiers ===
              _tokens.triangles_adjacency) {
              funcDesc.geometryDescriptor.inPrimitiveType =
                HgiShaderFunctionGeometryDescInPrimitiveType.TrianglesAdjacency
            }
          } else if (element.inOut === InOut.STAGE_OUT) {
            if (element.qualifiers === _tokens.points) {
              funcDesc.geometryDescriptor.outPrimitiveType =
                HgiShaderFunctionGeometryDescOutPrimitiveType.Points
            } else if (element.qualifiers === _tokens.line_strip) {
              funcDesc.geometryDescriptor.outPrimitiveType =
                HgiShaderFunctionGeometryDescOutPrimitiveType.LineStrip
            } else if (element.qualifiers === _tokens.triangle_strip) {
              funcDesc.geometryDescriptor.outPrimitiveType =
                HgiShaderFunctionGeometryDescOutPrimitiveType.TriangleStrip
            } else {
              // Assume any other GS stage out qualifier will be the
              // number of max vertices.
              funcDesc.geometryDescriptor.outMaxVertices =
                element.qualifiers
            }
          }
        } else if (element.qualifiers === _tokens.early_fragment_tests) {
          //   GLSL: "layout (early_fragment_tests) in;"
          //   MSL: "[[early_fragment_tests]]"
          funcDesc.fragmentDescriptor.earlyFragmentTests = true
        }
      } else if (element.kind === Kind.UNIFORM_BLOCK) {
        if (TF_VERIFY(element.members.length === 1)) {
          const member = element.members[0]!
          // std::stoi (codeGen.cpp:1028)
          const arraySize =
            (element.arraySize.length === 0 ? 0 :
              Number.parseInt(element.arraySize, 10) >>> 0)

          const loc = this._getLocation(element, metaData)
          if (loc !== -1) {
            if (arraySize > 0) {
              HgiShaderFunctionAddBuffer(
                funcDesc,
                /*name=*/member.name,
                /*type=*/_ConvertBoolType(member.dataType),
                /*bindIndex=*/loc,
                /*binding=*/HgiBindingType.HgiBindingTypeUniformArray,
                /*arraySize=*/arraySize)
            } else {
              HgiShaderFunctionAddBuffer(
                funcDesc,
                /*name=*/member.name,
                /*type=*/_ConvertBoolType(member.dataType),
                /*bindIndex=*/loc,
                /*binding=*/HgiBindingType.HgiBindingTypeUniformValue)
            }
          }
        }
      } else if (element.kind === Kind.UNIFORM_BLOCK_CONSTANT_PARAMS) {
        for (const member of element.members) {
          HgiShaderFunctionAddConstantParam(
            funcDesc,
            /*name=*/member.name,
            /*type=*/_ConvertBoolType(member.dataType))
        }
      } else if (element.kind === Kind.BUFFER_READ_ONLY) {
        if (TF_VERIFY(element.members.length === 1)) {
          const member = element.members[0]!
          const loc = this._getLocation(element, metaData)
          if (loc !== -1) {
            HgiShaderFunctionAddBuffer(
              funcDesc,
              /*name=*/member.name,
              /*type=*/_ConvertBoolType(member.dataType),
              /*bindIndex=*/loc,
              /*binding=*/HgiBindingType.HgiBindingTypePointer)
          }
        }
      } else if (element.kind === Kind.BUFFER_READ_WRITE) {
        if (TF_VERIFY(element.members.length === 1)) {
          const member = element.members[0]!
          const loc = this._getLocation(element, metaData)
          if (loc !== -1) {
            HgiShaderFunctionAddWritableBuffer(
              funcDesc,
              /*name=*/member.name,
              /*type=*/_ConvertBoolType(member.dataType),
              /*bindIndex=*/loc)
          }
        }
      }
    }
  }

  /** codeGen.cpp:1112-1145 */
  _generateHgiTextureResources(
    funcDesc: HgiShaderFunctionDesc,
    _shaderStage: TfToken,
    textureElements: HioGlslfxResourceLayoutTextureElementVector,
    _metaData: HdSt_ResourceBinderMetaData,
  ): void {
    for (const texture of textureElements) {
      const hgiTextureType =
        _GetHgiShaderTextureType(texture.textureType)
      const hdTextureFormat: HdFormat =
        HdStHioConversions.getHdFormat(texture.format)
      if (texture.arraySize > 0) {
        HgiShaderFunctionAddArrayOfTextures(
          funcDesc,
          texture.name,
          texture.arraySize,
          texture.bindingIndex,
          texture.dim,
          HdStHgiConversions.getHgiFormat(hdTextureFormat),
          hgiTextureType)
      } else {
        HgiShaderFunctionAddTexture(
          funcDesc,
          texture.name,
          texture.bindingIndex,
          texture.dim,
          HdStHgiConversions.getHgiFormat(hdTextureFormat),
          hgiTextureType)
      }
    }
  }

  /** codeGen.cpp:1147-1392 */
  _generateGLSLResources(
    funcDesc: HgiShaderFunctionDesc,
    str: _Stream,
    shaderStage: TfToken,
    elements: readonly HioGlslfxResourceLayoutElement[],
    metaData: HdSt_ResourceBinderMetaData,
  ): void {
    for (const element of elements) {
      switch (element.kind) {
        case Kind.VALUE: {
          if (element.inOut === InOut.STAGE_IN) {
            if (shaderStage === HdShaderTokens.vertexShader) {
              const location = this._getLocation(element, metaData)
              if (location === -1) {
                break
              }
              str.write('layout (location = ', location, ') ')
            }
            str.write('in ')
          } else if (
            element.inOut === InOut.STAGE_OUT) {
            if (shaderStage === HdShaderTokens.fragmentShader) {
              let location = this._getLocation(element, metaData)
              if (location === -1) {
                location = this._getNextOutputLocation()
              }
              str.write('layout (location = ', location, ') ')
            }
            str.write('out ')
          }
          if (element.qualifiers === _tokens.flat) {
            str.write('flat ')
          } else if (element.qualifiers === _tokens.noperspective) {
            str.write('noperspective ')
          } else if (element.qualifiers === _tokens.centroid) {
            str.write('centroid ')
          } else if (element.qualifiers === _tokens.sample) {
            str.write('sample ')
          } else if (element.qualifiers === _tokens.patch) {
            str.write('patch ')
          }
          str.write(element.dataType, ' ',
            element.name)
          if (element.arraySize.length === 0) {
            str.write(';\n')
          } else {
            str.write('[', element.arraySize, '];\n')
          }
          break
        }
        case Kind.BLOCK:
          if (element.inOut === InOut.STAGE_IN) {
            str.write('in ')
          } else {
            str.write('out ')
          }
          str.write(element.aggregateName, ' {\n')
          for (const member of element.members) {
            str.write('    ')
            if (member.qualifiers === _tokens.flat) {
              str.write('flat ')
            } else if (member.qualifiers === _tokens.noperspective) {
              str.write('noperspective ')
            } else if (member.qualifiers === _tokens.centroid) {
              str.write('centroid ')
            } else if (member.qualifiers === _tokens.sample) {
              str.write('sample ')
            }
            str.write(member.dataType, ' ', member.name)
            if (member.arraySize.length === 0) {
              str.write(';\n')
            } else {
              str.write('[', member.arraySize, '];\n')
            }
          }
          str.write('} ', element.name)
          if (element.arraySize.length === 0) {
            str.write(';\n')
          } else {
            str.write('[', element.arraySize, '];\n')
          }
          break
        case Kind.QUALIFIER:
          if (shaderStage === HdShaderTokens.tessControlShader) {
            if (element.inOut === InOut.STAGE_OUT) {
              funcDesc.tessellationDescriptor.numVertsPerPatchOut =
                element.qualifiers
            }
          } else if (shaderStage === HdShaderTokens.tessEvalShader) {
            if (element.inOut === InOut.STAGE_IN) {
              if (element.qualifiers === _tokens.triangles) {
                funcDesc.tessellationDescriptor.patchType =
                  HgiShaderFunctionTessellationDescPatchType.Triangles
              } else if (element.qualifiers === _tokens.quads) {
                funcDesc.tessellationDescriptor.patchType =
                  HgiShaderFunctionTessellationDescPatchType.Quads
              } else if (element.qualifiers === _tokens.isolines) {
                funcDesc.tessellationDescriptor.patchType =
                  HgiShaderFunctionTessellationDescPatchType.Isolines
              } else if (element.qualifiers ===
                _tokens.equal_spacing) {
                funcDesc.tessellationDescriptor.spacing =
                  HgiShaderFunctionTessellationDescSpacing.Equal
              } else if (element.qualifiers ===
                _tokens.fractional_even_spacing) {
                funcDesc.tessellationDescriptor.spacing =
                  HgiShaderFunctionTessellationDescSpacing.FractionalEven
              } else if (element.qualifiers ===
                _tokens.fractional_odd_spacing) {
                funcDesc.tessellationDescriptor.spacing =
                  HgiShaderFunctionTessellationDescSpacing.FractionalOdd
              } else if (element.qualifiers === _tokens.cw) {
                funcDesc.tessellationDescriptor.ordering =
                  HgiShaderFunctionTessellationDescOrdering.CW
              } else if (element.qualifiers === _tokens.ccw) {
                funcDesc.tessellationDescriptor.ordering =
                  HgiShaderFunctionTessellationDescOrdering.CCW
              }
            }
          } else if (shaderStage === HdShaderTokens.geometryShader) {
            if (element.inOut === InOut.STAGE_IN) {
              if (element.qualifiers === _tokens.points) {
                funcDesc.geometryDescriptor.inPrimitiveType =
                  HgiShaderFunctionGeometryDescInPrimitiveType.Points
              } else if (element.qualifiers === _tokens.lines) {
                funcDesc.geometryDescriptor.inPrimitiveType =
                  HgiShaderFunctionGeometryDescInPrimitiveType.Lines
              } else if (element.qualifiers ===
                _tokens.lines_adjacency) {
                funcDesc.geometryDescriptor.inPrimitiveType =
                  HgiShaderFunctionGeometryDescInPrimitiveType.LinesAdjacency
              } else if (element.qualifiers === _tokens.triangles) {
                funcDesc.geometryDescriptor.inPrimitiveType =
                  HgiShaderFunctionGeometryDescInPrimitiveType.Triangles
              } else if (element.qualifiers ===
                _tokens.triangles_adjacency) {
                funcDesc.geometryDescriptor.inPrimitiveType =
                  HgiShaderFunctionGeometryDescInPrimitiveType.TrianglesAdjacency
              }
            } else if (element.inOut === InOut.STAGE_OUT) {
              if (element.qualifiers === _tokens.points) {
                funcDesc.geometryDescriptor.outPrimitiveType =
                  HgiShaderFunctionGeometryDescOutPrimitiveType.Points
              } else if (element.qualifiers === _tokens.line_strip) {
                funcDesc.geometryDescriptor.outPrimitiveType =
                  HgiShaderFunctionGeometryDescOutPrimitiveType.LineStrip
              } else if (element.qualifiers ===
                _tokens.triangle_strip) {
                funcDesc.geometryDescriptor.outPrimitiveType =
                  HgiShaderFunctionGeometryDescOutPrimitiveType.TriangleStrip
              } else {
                // Assume any other GS stage out qualifier will be
                // the number of max vertices.
                funcDesc.geometryDescriptor.outMaxVertices =
                  element.qualifiers
              }
            }
          } else if (element.qualifiers === _tokens.early_fragment_tests) {
            //   GLSL: "layout (early_fragment_tests) in;"
            //   MSL: "[[early_fragment_tests]]"
            funcDesc.fragmentDescriptor.earlyFragmentTests = true
          }
          break
        case Kind.UNIFORM_VALUE: {
          const location = this._getLocation(element, metaData)
          if (location !== -1) {
            str.write('layout(location = ', location,
              ') uniform ',
              element.dataType, ' *', element.name)
            if (element.arraySize.length !== 0) {
              str.write('[', element.arraySize, ']')
            }
            str.write(';\n')
          }
          break
        }
        case Kind.UNIFORM_BLOCK: {
          const location = this._getLocation(element, metaData)
          if (location !== -1) {
            str.write('layout(std140, binding = ', location,
              ') uniform ubo_', element.name,
              ' {\n',
              '    ', element.dataType, ' ',
              element.name)
            if (element.arraySize.length !== 0) {
              str.write('[', element.arraySize, ']')
            }
            str.write(';\n};\n')
          }
          break
        }
        case Kind.UNIFORM_BLOCK_CONSTANT_PARAMS: {
          const location = this._getLocation(element, metaData)
          if (location !== -1) {
            str.write('layout(std140, binding = ', location,
              ') uniform ubo_', element.name,
              ' {\n')
            for (const member of element.members) {
              str.write(member.dataType, ' ', member.name, ';\n')
            }
            str.write('};\n')
          }
          break
        }
        case Kind.BUFFER_READ_ONLY:
        case Kind.BUFFER_READ_WRITE: {
          const member = element.members[0]!
          const location = this._getLocation(element, metaData)
          if (location !== -1) {
            str.write('layout(std430, binding = ', location,
              ') buffer ssbo_', location,
              ' {\n',
              '    ', member.dataType, ' ',
              member.name, '[];\n',
              '};\n')
          }
          break
        }
        default:
          break
      }
    }
  }

  /** codeGen.cpp:1460-1576 */
  _generateGLSLTextureResources(
    str: _Stream,
    _shaderStage: TfToken,
    textureElements: HioGlslfxResourceLayoutTextureElementVector,
    _metaData: HdSt_ResourceBinderMetaData,
  ): void {
    for (const texture of textureElements) {
      const isArrayTexture =
        (texture.textureType === TextureType.ARRAY_TEXTURE)

      const isShadowTexture =
        (texture.textureType === TextureType.SHADOW_TEXTURE)

      const isCubemapTexture =
        (texture.textureType === TextureType.CUBEMAP_TEXTURE)

      const isArrayOfTexture = (texture.arraySize > 0)

      const typePrefix =
        _GetGLSLSamplerTypePrefix(texture.format)

      const samplerType =
        typePrefix +
        _GetGLSLSamplerType(
          isCubemapTexture,
          texture.dim,
          isArrayTexture,
          isShadowTexture)

      const resultType =
        typePrefix +
        (isShadowTexture ? 'float' : 'vec4')

      const resourceName =
        'sampler' + _GetSamplerSuffix(isCubemapTexture, texture.dim) + '_' +
        texture.name

      const coordDim =
        (isArrayTexture || isShadowTexture || isCubemapTexture)
          ? (texture.dim + 1) : texture.dim

      const intCoordType = coordDim === 1 ?
        'int' :
        'ivec' + String(coordDim)
      const floatCoordType = coordDim === 1 ?
        'float' :
        'vec' + String(coordDim)

      // Resource Declaration
      str.write('layout (binding = ',
        String(texture.bindingIndex), ') uniform ',
        samplerType, ' ', resourceName)
      if (isArrayOfTexture) {
        str.write('[', String(texture.arraySize), '];\n')
      } else {
        str.write(';\n')
      }

      // Accessors
      if (isArrayOfTexture) {
        str.write('#define HgiGetSampler_', texture.name, '(index) ',
          resourceName, '[index]\n')

        str.write(resultType,
          ' HgiGet_', texture.name,
          '(int index, ', floatCoordType, ' coord) {\n',
          '  return texture(', resourceName, '[index], coord)',
          ';\n',
          '}\n')

        str.write(resultType,
          ' HgiTextureLod_', texture.name,
          '(int index, ', floatCoordType, ' coord, float lod) {\n',
          '  return textureLod(', resourceName,
          '[index], coord, lod)',
          ';\n',
          '}\n')

        if (!isShadowTexture && !isCubemapTexture) {
          str.write(resultType,
            ' HgiTexelFetch_', texture.name,
            '(int index, ', intCoordType, ' coord) {\n',
            '  return texelFetch(', resourceName,
            '[index], coord, 0)',
            ';\n',
            '}\n')
        }
      } else {
        str.write('#define HgiGetSampler_', texture.name, '() ',
          resourceName, '\n')

        str.write(resultType,
          ' HgiGet_', texture.name,
          '(', floatCoordType, ' coord) {\n',
          '  return texture(', resourceName, ', coord)',
          ';\n',
          '}\n')

        str.write(resultType,
          ' HgiTextureLod_', texture.name,
          '(', floatCoordType, ' coord, float lod) {\n',
          '  return textureLod(', resourceName, ', coord, lod)',
          ';\n',
          '}\n')

        if (!isShadowTexture && !isCubemapTexture) {
          str.write(resultType,
            ' HgiTexelFetch_', texture.name,
            '(', intCoordType, ' coord) {\n',
            '  return texelFetch(', resourceName, ', coord, 0)',
            ';\n',
            '}\n')
        }
      }
    }
  }

  /** codeGen.cpp:690-694 */
  _advanceShaderStage(): void {
    // Reset interstage slot counter when moving to next stage.
    this._nextInterstageSlot = 0
  }

  // Note: if the resource doesn't exist in resource binder, this will
  // return -1, in which case calling code shouldn't bind the resource.
  /** codeGen.cpp:701-716 */
  private _getLocation(
    element: HioGlslfxResourceLayoutElement,
    metaData: HdSt_ResourceBinderMetaData,
  ): number {
    if (element.location >= 0) {
      return element.location
    }
    for (const custom of metaData.customBindings) {
      if (custom.name === element.name) {
        return custom.binding.getLocation()
      }
    }

    return -1
  }

  // Returns a monotonically increasing counter for output location slots.
  /** codeGen.cpp:719-722 */
  private _getNextOutputLocation(): number {
    return this._nextOutputLocation++
  }

  /** codeGen.cpp:724-738 */
  private _getSlot(name: TfToken, in_: boolean, count = 1): number {
    const entry = this._interstageSlotTable.get(name)

    // For input interstage slots, check slot table.
    if (in_ && entry !== undefined) {
      return entry
    }

    const currentSlot = this._nextInterstageSlot
    this._interstageSlotTable.set(name, currentSlot)
    this._nextInterstageSlot += count

    return currentSlot
  }

  /** codeGen.cpp:740-753 */
  private _getOutputSlot(name: TfToken, count = 1): number {
    const entry = this._outputSlotTable.get(name)

    if (entry !== undefined) {
      return entry
    }

    const currentSlot = this._nextOutputSlot
    this._outputSlotTable.set(name, currentSlot)
    this._nextOutputSlot += count

    return currentSlot
  }

  /** codeGen.cpp:755-760 */
  private _getFlattenedName(aggregateName: TfToken,
    memberName: TfToken): TfToken {
    return TfToken(
      aggregateName + '_' + memberName)
  }

  /** codeGen.cpp:762-771 */
  private _getInterpolation(qualifiers: TfToken): HgiInterpolationType {
    if (qualifiers === _tokens.flat) {
      return HgiInterpolationType.HgiInterpolationFlat
    } else if (qualifiers === _tokens.noperspective) {
      return HgiInterpolationType.HgiInterpolationNoPerspective
    } else {
      return HgiInterpolationType.HgiInterpolationDefault
    }
  }

  /** codeGen.cpp:773-782 */
  private _getSamplingQualifier(qualifiers: TfToken): HgiSamplingType {
    if (qualifiers === _tokens.centroid) {
      return HgiSamplingType.HgiSamplingCentroid
    } else if (qualifiers === _tokens.sample) {
      return HgiSamplingType.HgiSamplingSample
    } else {
      return HgiSamplingType.HgiSamplingDefault
    }
  }

  /** codeGen.cpp:784-791 */
  private _getStorageQualifier(qualifiers: TfToken): HgiStorageType {
    if (qualifiers === _tokens.patch) {
      return HgiStorageType.HgiStoragePatch
    } else {
      return HgiStorageType.HgiStorageDefault
    }
  }

  /** codeGen.cpp:793-796 */
  private _getOutputRoleName(outputName: TfToken): string {
    return 'color(' + String(this._getOutputSlot(outputName)) + ')'
  }
}

/** codeGen.cpp:813-819 */
function _IsVertexAttribInputStage(shaderStage: TfToken): boolean {
  return (shaderStage === HdShaderTokens.vertexShader) ||
    (shaderStage === HdShaderTokens.postTessControlShader) ||
    (shaderStage === HdShaderTokens.postTessVertexShader)
}

// Most data types we use in Storm take up one location slot. There are some
// exceptions, which we can add here as we find them.
/** codeGen.cpp:823-837 */
function _GetLocationCount(hgi: Hgi, dataType: TfToken): number {
  if (dataType === _tokens.OsdPerPatchVertexBezier) {
    return 2
  }

  // In Vulkan, 64-bit three or four component vectors take up two slots.
  if ((dataType === _tokens.dvec3 || dataType === _tokens.dvec4) &&
    hgi.getAPIName() === HgiTokens.Vulkan) {
    return 2
  }

  return 1
}

/** codeGen.cpp:1089-1110 */
function _GetHgiShaderTextureType(
  hioTextureType: TextureType,
): HgiShaderTextureType {
  switch (hioTextureType) {
    case TextureType.TEXTURE:
      return HgiShaderTextureType.HgiShaderTextureTypeTexture
    case TextureType.SHADOW_TEXTURE:
      return HgiShaderTextureType.HgiShaderTextureTypeShadowTexture
    case TextureType.ARRAY_TEXTURE:
      return HgiShaderTextureType.HgiShaderTextureTypeArrayTexture
    case TextureType.CUBEMAP_TEXTURE:
      return HgiShaderTextureType.HgiShaderTextureTypeCubemapTexture
  }

  TF_CODING_ERROR(`Unhandled HioGlslfxResourceLayout::TextureType value ${
    Number(hioTextureType)}`)
  return HgiShaderTextureType.HgiShaderTextureTypeTexture
}

/** codeGen.cpp:1394-1412 */
function _GetGLSLSamplerTypePrefix(hioFormat: HioFormat): string {
  const hioType = HioGetHioType(hioFormat)
  switch (hioType) {
    case HioType.HioTypeUnsignedByte:
    case HioType.HioTypeUnsignedByteSRGB:
    case HioType.HioTypeUnsignedShort:
    case HioType.HioTypeUnsignedInt:
      return 'u'
    case HioType.HioTypeSignedByte:
    case HioType.HioTypeSignedShort:
    case HioType.HioTypeInt:
      return 'i'
    default:
      return ''
  }
}

/** Both _GetGLSLSamplerType overloads: (isCubemapTexture, dim) at
 *  codeGen.cpp:1414-1431 and (isCubemapTexture, dim, isArrayTexture,
 *  isShadowTexture) at codeGen.cpp:1433-1445. */
function _GetGLSLSamplerType(
  isCubemapTexture: boolean,
  dim: number,
  isArrayTexture?: boolean,
  isShadowTexture?: boolean,
): string {
  if (isArrayTexture !== undefined || isShadowTexture !== undefined) {
    return _GetGLSLSamplerType(isCubemapTexture, dim) +
      (isArrayTexture ? 'Array' : '') +
      (isShadowTexture ? 'Shadow' : '')
  }

  if (isCubemapTexture) {
    return 'samplerCube'
  }

  if (dim === 1) {
    return 'sampler1D'
  }
  if (dim === 2) {
    return 'sampler2D'
  }
  return 'sampler3D'
}

/** codeGen.cpp:1447-1458 */
function _GetSamplerSuffix(isCubemapTexture: boolean, dim: number): string {
  if (isCubemapTexture) {
    return 'Cube'
  }

  return String(dim) + 'd'
}

/** codeGen.cpp:1578-1593 */
function _AddVertexAttribElement(
  elements: HioGlslfxResourceLayoutElementVector,
  name: TfToken,
  dataType: TfToken,
  location: number,
  _arraySize = 0,
): void {
  elements.push(new HioGlslfxResourceLayout.Element(
    InOut.STAGE_IN,
    Kind.VALUE,
    dataType, name))
  if (location >= 0) {
    elements[elements.length - 1]!.location = location >>> 0
  }
}

/** codeGen.cpp:1595-1608 */
function _AddInterstageElement(
  elements: HioGlslfxResourceLayoutElementVector,
  inOut: InOut,
  name: TfToken,
  dataType: TfToken,
  arraySize: TfToken = TfToken(),
  qualifier: TfToken = TfToken(),
): void {
  elements.push(new HioGlslfxResourceLayout.Element(
    inOut,
    Kind.VALUE,
    dataType, name, arraySize, qualifier))
}

/** codeGen.cpp:1610-1627 */
function _AddInterstageBlockElement(
  elements: HioGlslfxResourceLayoutElementVector,
  inOut: InOut,
  blockName: TfToken,
  instanceName: TfToken,
  members: HioGlslfxResourceLayoutMemberVector,
  arraySize: TfToken = TfToken(),
): void {
  elements.push(new HioGlslfxResourceLayout.Element(
    inOut,
    Kind.BLOCK,
    HioGlslfxResourceLayoutTokens.block,
    instanceName,
    arraySize))
  elements[elements.length - 1]!.aggregateName = blockName
  // MemberVector copy assignment.
  elements[elements.length - 1]!.members = [...members]
}

/** codeGen.cpp:1629-1648 */
function _AddUniformValueElement(
  elements: HioGlslfxResourceLayoutElementVector,
  name: TfToken,
  dataType: TfToken,
  location: number,
  arraySize = 0,
): void {
  const arraySizeArg =
    ((arraySize > 0) ? TfToken(String(arraySize)) : TfToken())

  elements.push(new HioGlslfxResourceLayout.Element(
    InOut.NONE,
    Kind.UNIFORM_VALUE,
    dataType, name, arraySizeArg))
  elements[elements.length - 1]!.members.push(
    new HioGlslfxResourceLayout.Member(dataType, name))
  if (location >= 0) {
    elements[elements.length - 1]!.location = location >>> 0
  }
}

/** codeGen.cpp:1650-1669 */
function _AddUniformBufferElement(
  elements: HioGlslfxResourceLayoutElementVector,
  name: TfToken,
  dataType: TfToken,
  location: number,
  arraySize = 0,
): void {
  const arraySizeArg =
    ((arraySize > 0) ? TfToken(String(arraySize)) : TfToken())

  elements.push(new HioGlslfxResourceLayout.Element(
    InOut.NONE,
    Kind.UNIFORM_BLOCK,
    dataType, name, arraySizeArg))
  elements[elements.length - 1]!.members.push(
    new HioGlslfxResourceLayout.Member(dataType, name))
  if (location >= 0) {
    elements[elements.length - 1]!.location = location >>> 0
  }
}

/** codeGen.cpp:1671-1689 */
function _AddBufferElement(
  elements: HioGlslfxResourceLayoutElementVector,
  name: TfToken,
  dataType: TfToken,
  location: number,
  _arraySize = 0,
  stageVisibility: HgiShaderStage = HgiShaderStageBits.HgiShaderStageAll as number,
): void {
  elements.push(new HioGlslfxResourceLayout.Element(
    InOut.NONE,
    Kind.BUFFER_READ_ONLY,
    dataType, name))
  elements[elements.length - 1]!.members.push(
    new HioGlslfxResourceLayout.Member(dataType, name))
  elements[elements.length - 1]!.stageVisibility = stageVisibility
  if (location >= 0) {
    elements[elements.length - 1]!.location = location >>> 0
  }
}

/** codeGen.cpp:1691-1708 */
function _AddWritableBufferElement(
  elements: HioGlslfxResourceLayoutElementVector,
  name: TfToken,
  dataType: TfToken,
  location: number,
  stageVisibility: HgiShaderStage = HgiShaderStageBits.HgiShaderStageAll as number,
): void {
  elements.push(new HioGlslfxResourceLayout.Element(
    InOut.NONE,
    Kind.BUFFER_READ_WRITE,
    dataType, name))
  elements[elements.length - 1]!.members.push(
    new HioGlslfxResourceLayout.Member(dataType, name))
  elements[elements.length - 1]!.stageVisibility = stageVisibility
  if (location >= 0) {
    elements[elements.length - 1]!.location = location >>> 0
  }
}

/** codeGen.cpp:1710-1721 */
function _AddTextureElement(
  textureElements: HioGlslfxResourceLayoutTextureElementVector,
  name: TfToken,
  dim: number,
  bindingIndex: number,
  format: HioFormat = HioFormat.HioFormatFloat32Vec4,
  textureType: TextureType = TextureType.TEXTURE,
): void {
  textureElements.push(new HioGlslfxResourceLayout.TextureElement(
    name, dim, bindingIndex, format, textureType))
}

/** codeGen.cpp:1723-1735 */
function _AddArrayOfTextureElement(
  textureElements: HioGlslfxResourceLayoutTextureElementVector,
  name: TfToken,
  dim: number,
  bindingIndex: number,
  format: HioFormat = HioFormat.HioFormatFloat32Vec4,
  textureType: TextureType = TextureType.TEXTURE,
  arraySize = 0,
): void {
  textureElements.push(new HioGlslfxResourceLayout.TextureElement(
    name, dim, bindingIndex, format, textureType, arraySize))
}

/** codeGen.cpp:1737-1755 */
function _IsAtomicBufferShaderResource(
  elements: HioGlslfxResourceLayoutElementVector,
  name: TfToken,
): boolean {
  for (const element of elements) {
    if (element.name === name &&
      element.kind === Kind.BUFFER_READ_WRITE) {
      if (TF_VERIFY(element.members.length === 1)) {
        const dataType = element.members[0]!.dataType
        if (dataType === _tokens._atomic_int ||
          dataType === _tokens._atomic_uint) {
          return true
        }
      }
    }
  }
  return false
}

// Osd::GLSLPatchShaderSource (opensubdiv/osd/glslPatchShaderSource.h) is the
// OpenSubdiv 3.6.1 port in @opensubdiv/core/osd.
// PLATFORM-DIVERGENCE(hdst-osd-patch-source-msl): Osd::MTLPatchShaderSource
// (opensubdiv/osd/mtlPatchShaderSource.h) is not ported; it is reachable
// only for an Hgi whose API name is Metal, which in this port are the
// codegen test doubles. It returns no source.
const _OsdMTLPatchShaderSource = {
  getPatchDrawingShaderSource(): string { return '' },
  getPatchBasisShaderSource(): string { return '' },
}
const _OsdGLSLPatchShaderSource = OsdGLSLPatchShaderSource

/** codeGen.cpp:1959-1991. OpenSubdiv >= 3.6 branch
 *  (OPENSUBDIV_VERSION_NUMBER >= 30600). */
function _GetOSDCommonShaderSourceMSL(): string {
  const ss = new _Stream()

  ss.write(_OsdMTLPatchShaderSource.getPatchDrawingShaderSource())
  return ss.str()
}

/** codeGen.cpp:1993-2021. OpenSubdiv >= 3.6 branch
 *  (OPENSUBDIV_VERSION_NUMBER >= 30600). */
function _GetOSDCommonShaderSourceGLSL(): string {
  const ss = new _Stream()

  ss.write('FORWARD_DECL(MAT4 GetProjectionMatrix());\n' +
    'FORWARD_DECL(float GetTessLevel());\n' +
    'mat4 OsdModelViewMatrix() { return mat4(1); }\n' +
    'mat4 OsdProjectionMatrix() { return mat4(GetProjectionMatrix()); }\n' +
    'float OsdTessLevel() { return GetTessLevel(); }\n' +
    '\n')

  ss.write(_OsdGLSLPatchShaderSource.getPatchDrawingShaderSource())
  return ss.str()
}

/** codeGen.cpp:2023-2039 */
function _GetOSDCommonShaderSource(hgi: Hgi): string {
  // Prepare OpenSubdiv common shader source for use in the shader
  // code declarations section and define some accessor methods and
  // forward declarations needed by the OpenSubdiv shaders.

  if (_IsHgiMetal(hgi)) {
    return _GetOSDCommonShaderSourceMSL()
  }
  return _GetOSDCommonShaderSourceGLSL()
}

/** codeGen.cpp:2041-2060 */
function _GetOSDPatchBasisShaderSource(hgi: Hgi): string {
  const ss = new _Stream()

  if (_IsHgiMetal(hgi)) {
    ss.write('#define OSD_PATCH_BASIS_METAL\n')
    ss.write(_OsdMTLPatchShaderSource.getPatchBasisShaderSource())
    return ss.str()
  }
  ss.write('#define OSD_PATCH_BASIS_GLSL\n')
  ss.write(_OsdGLSLPatchShaderSource.getPatchBasisShaderSource())
  return ss.str()
}

/** HD_SHADER_API (pxr/imaging/hd/version.h:178) */
const HD_SHADER_API = 3

/** `desc.generatedShaderCodeOut = &_xxSource` (codeGen.cpp:3127 etc.): a
 *  box whose value reads and writes the code generator's diagnostic source
 *  member, as the C++ pointer does. */
function _SourceOut(get: () => string, set: (v: string) => void): HgiShaderCodeOut {
  return {
    get value(): string { return get() },
    set value(v: string) { set(v) },
  }
}

/** codeGen.cpp:3563-3680 (with the defaults of the forward declaration at
 *  codeGen.cpp:323-329), and the BindingDeclaration overload at
 *  codeGen.cpp:3682-3694 (defaults at codeGen.cpp:331-335): one function
 *  dispatching on its second argument. */
function _EmitDeclaration(
  elements: HioGlslfxResourceLayoutElementVector,
  nameOrBindingDeclaration: TfToken | HdSt_ResourceBinderMetaDataBindingDeclaration,
  typeOrArraySize?: TfToken | number,
  binding?: HdStBinding,
  isWritable = false,
  arraySize = 0,
  stageVisibility: HgiShaderStage = HgiShaderStageBits.HgiShaderStageAll as number,
): void {
  if (nameOrBindingDeclaration instanceof HdSt_ResourceBinderMetaDataBindingDeclaration) {
    // codeGen.cpp:3682-3694
    const bindingDeclaration = nameOrBindingDeclaration
    _EmitDeclaration(elements,
      bindingDeclaration.name,
      bindingDeclaration.dataType,
      bindingDeclaration.binding,
      bindingDeclaration.isWritable,
      (typeOrArraySize as number | undefined) ?? 0,
      bindingDeclaration.stageVisibility)
    return
  }
  const name = nameOrBindingDeclaration
  const type = typeOrArraySize as TfToken
  const b = binding!
  /*
    [vertex attribute]
       layout (location = <location>) in <type> <name>;
    [uniform]
       layout (location = <location>) uniform <type> <name>;
    [SSBO]
       layout (std430, binding = <location>) buffer buffer_<location> {
          <type> <name>[];
       };
    [Bindless Uniform]
       layout (location = <location>) uniform <type> *<name>;

   */
  const bindingType = b.getType()

  if (!TF_VERIFY(name.length !== 0)) return
  if (!TF_VERIFY(type.length !== 0,
    `Unknown dataType for ${name}`)) return

  if (arraySize > 0) {
    if (!TF_VERIFY(bindingType === HdStBinding.UNIFORM_ARRAY ||
                   bindingType === HdStBinding.DRAW_INDEX_INSTANCE_ARRAY ||
                   bindingType === HdStBinding.UBO ||
                   bindingType === HdStBinding.SSBO ||
                   bindingType === HdStBinding.BINDLESS_SSBO_RANGE ||
                   bindingType === HdStBinding.BINDLESS_UNIFORM)) {
      // XXX: SSBO and BINDLESS_UNIFORM don't need arraySize, but for the
      // workaround of UBO allocation we're passing arraySize = 2
      // for all bindingType.
      return
    }
  }

  // layout qualifier (if exists)
  const location = b.getLocation()
  switch (bindingType) {
    case HdStBindingType.VERTEX_ATTR:
    case HdStBindingType.DRAW_INDEX:
    case HdStBindingType.DRAW_INDEX_INSTANCE:
      _AddVertexAttribElement(elements,
        /*name=*/name,
        /*dataType=*/_GetPackedType(type, false),
        location)
      break
    case HdStBindingType.DRAW_INDEX_INSTANCE_ARRAY:
    {
      for (let i = 0; i < arraySize; i++) {
        _AddVertexAttribElement(elements,
          /*name=*/TfToken(name + String(i)),
          /*dataType=*/_GetPackedType(type, false),
          location + i)
      }
      break
    }
    case HdStBindingType.UNIFORM:
      _AddUniformValueElement(elements,
        /*name=*/name,
        /*dataType=*/_GetPackedType(type, true),
        location)
      break
    case HdStBindingType.UNIFORM_ARRAY:
      _AddUniformValueElement(elements,
        /*name=*/name,
        /*dataType=*/_GetPackedType(type, true),
        location,
        arraySize)
      break
    case HdStBindingType.UBO:
      _AddUniformBufferElement(elements,
        /*name=*/name,
        /*dataType=*/_GetPackedType(type, true),
        location,
        arraySize)
      break
    case HdStBindingType.SSBO:
      if (isWritable) {
        _AddWritableBufferElement(elements,
          /*name=*/name,
          /*type=*/_GetPackedType(type, true),
          location,
          stageVisibility)
      } else {
        _AddBufferElement(elements,
          /*name=*/name,
          /*dataType=*/_GetPackedType(type, true),
          location,
          stageVisibility)
      }
      break
    case HdStBindingType.BINDLESS_SSBO_RANGE:
      _AddUniformValueElement(elements,
        /*name=*/name,
        /*dataType=*/_GetPackedType(type, true),
        location)
      break
    case HdStBindingType.BINDLESS_UNIFORM:
      _AddUniformValueElement(elements,
        /*name=*/name,
        /*dataType=*/_GetPackedType(type, true),
        location)
      break
    default:
      TF_CODING_ERROR(`Unknown binding type ${b.getType()}, for ${name}\n`)
      break
  }
}

/** codeGen.cpp:3696-3711 */
function _EmitStageAccessor(str: _Stream,
  name: TfToken,
  stageName: string,
  type: TfToken): void {
  str.write(_GetUnpackedType(type, false),
    ' HdGet_', name, '(int localIndex) { return ')
  str.write(_GetPackedTypeAccessor(type, true), '(', stageName, ');}\n')

  // GLSL spec doesn't allow default parameter. use function overload instead.
  // default to localIndex=0
  str.write(_GetUnpackedType(type, false), ' HdGet_', name, '()',
    ' { return HdGet_', name, '(0); }\n')

  _EmitScalarAccessor(str, name, type)
}

/** codeGen.cpp:3713-3767 (defaults: forward declaration at
 *  codeGen.cpp:337-343) */
function _EmitStructAccessor(str: _Stream,
  structName: TfToken,
  name: TfToken,
  type: TfToken,
  arraySize: number,
  index: string | null = null,
  concatenateNames = false): void {
  // index != NULL  if the struct is an array
  // arraySize > 1  if the struct entry is an array.
  const accessorName = concatenateNames
    ? TfToken(structName + '_' + name) : name
  if (index) {
    if (arraySize > 1) {
      str.write(_GetUnpackedType(type, false), ' HdGet_', accessorName,
        '(int arrayIndex, int localIndex) {\n',
        // storing to a local variable to avoid the nvidia-driver
        // bug #1561110 (fixed in 346.59)
        '  int index = ', index, ';\n',
        '  return ',
        _GetPackedTypeAccessor(type, false), '(',
        structName, '[index].', name, '[arrayIndex]);\n}\n')
    } else {
      str.write(_GetUnpackedType(type, false), ' HdGet_', accessorName,
        '(int localIndex) {\n',
        '  int index = ', index, ';\n',
        '  return ',
        _GetPackedTypeAccessor(type, false), '(',
        structName, '[index].', name, ');\n}\n')
    }
  } else {
    if (arraySize > 1) {
      str.write(_GetUnpackedType(type, false), ' HdGet_', accessorName,
        '(int arrayIndex, int localIndex) { return ',
        _GetPackedTypeAccessor(type, false), '(',
        structName, '.', name, '[arrayIndex]);}\n')
    } else {
      str.write(_GetUnpackedType(type, false), ' HdGet_', accessorName,
        '(int localIndex) { return ',
        _GetPackedTypeAccessor(type, false), '(',
        structName, '.', name, ');}\n')
    }
  }
  // GLSL spec doesn't allow default parameter. use function overload instead.
  // default to localIndex=0
  if (arraySize > 1) {
    str.write(_GetUnpackedType(type, false), ' HdGet_', accessorName,
      '(int arrayIndex)',
      ' { return HdGet_', accessorName, '(arrayIndex, 0); }\n')
  } else {
    str.write(_GetUnpackedType(type, false), ' HdGet_', accessorName, '()',
      ' { return HdGet_', accessorName, '(0); }\n')
  }
  _EmitScalarAccessor(str, accessorName, type)
}

/** codeGen.cpp:3769-3784 */
function _EmitBufferAccessor(str: _Stream,
  name: TfToken,
  type: TfToken,
  index: string | null): void {
  if (index) {
    str.write(_GetUnpackedType(type, false), ' HdGet_', name,
      '(int localIndex) {\n',
      '  int index = ', index, ';\n',
      '  return ',
      _GetPackedTypeAccessor(type, true), '(',
      name, '[index]);\n}\n')
  }
  str.write(_GetUnpackedType(type, false), ' HdGet_', name, '()',
    ' { return HdGet_', name, '(0); }\n')
}

/** codeGen.cpp:3786-3790 */
function _IsScalarType(type: TfToken): boolean {
  return (type === _tokens._float ||
          type === _tokens._int ||
          type === _tokens._uint)
}

/** codeGen.cpp:3792-3815 */
function _GetSwizzleString(type: TfToken, swizzle = ''): string {
  if (swizzle.length !== 0) {
    return '.' + swizzle
  }
  if (type === _tokens.vec4 || type === _tokens.ivec4) {
    return ''
  }
  if (type === _tokens.vec3 || type === _tokens.ivec3) {
    return '.xyz'
  }
  if (type === _tokens.vec2 || type === _tokens.ivec2) {
    return '.xy'
  }
  if (_IsScalarType(type)) {
    return '.x'
  }
  if (type === _tokens.packed_2_10_10_10) {
    return '.x'
  }

  return ''
}

/** codeGen.cpp:3817-3833 */
function _GetNumComponents(type: TfToken): number {
  let numComponents = 1
  if (type === _tokens.vec2 || type === _tokens.ivec2) {
    numComponents = 2
  } else if (type === _tokens.vec3 || type === _tokens.ivec3) {
    numComponents = 3
  } else if (type === _tokens.vec4 || type === _tokens.ivec4) {
    numComponents = 4
  } else if (type === _tokens.mat3 || type === _tokens.dmat3) {
    numComponents = 9
  } else if (type === _tokens.mat4 || type === _tokens.dmat4) {
    numComponents = 16
  }

  return numComponents
}

/** codeGen.cpp:3835-3878 */
function _EmitComputeAccessor(
  str: _Stream,
  name: TfToken,
  type: TfToken,
  binding: HdStBinding,
  index: string | null): void {
  if (index) {
    str.write(_GetUnpackedType(type, false),
      ' HdGet_', name, '(int localIndex) {\n')
    if (binding.getType() === HdStBinding.SSBO) {
      str.write('  int index = ', index, ';\n')
      str.write('  return ', _GetPackedTypeAccessor(type, false), '(',
        _GetPackedType(type, false), '(')
      const numComponents = _GetNumComponents(type)
      for (let c = 0; c < numComponents; ++c) {
        if (c > 0) {
          str.write(',\n              ')
        }
        str.write(name, '[index + ', c, ']')
      }
      str.write('));\n}\n')
    } else if (binding.getType() === HdStBinding.BINDLESS_SSBO_RANGE) {
      str.write('  return ', _GetPackedTypeAccessor(type, true), '(',
        name, '[localIndex]);\n}\n')
    } else {
      str.write('  return ', _GetPackedTypeAccessor(type, true), '(',
        name, '[localIndex]);\n}\n')
    }
  } else {
    // non-indexed, only makes sense for uniform or vertex.
    if (binding.getType() === HdStBinding.UNIFORM ||
        binding.getType() === HdStBinding.VERTEX_ATTR) {
      str.write(_GetUnpackedType(type, false),
        ' HdGet_', name, '(int localIndex) { return ')
      str.write(_GetPackedTypeAccessor(type, true), '(', name, ');}\n')
    }
  }
  // GLSL spec doesn't allow default parameter. use function overload instead.
  // default to localIndex=0
  str.write(_GetUnpackedType(type, false), ' HdGet_', name, '()',
    ' { return HdGet_', name, '(0); }\n')
}

/** codeGen.cpp:3880-3923 */
function _EmitComputeMutator(
  str: _Stream,
  name: TfToken,
  type: TfToken,
  binding: HdStBinding,
  index: string | null): void {
  if (index) {
    str.write('void',
      ' HdSet_', name, '(int localIndex, ',
      _GetUnpackedType(type, false), ' value) {\n')
    if (binding.getType() === HdStBinding.SSBO) {
      str.write('  int index = ', index, ';\n')
      str.write('  ', _GetPackedType(_ConvertBoolType(type), false), ' packedValue = ',
        _GetPackedTypeMutator(_ConvertBoolType(type), false), '(value);\n')
      const numComponents = _GetNumComponents(_GetPackedType(_ConvertBoolType(type), false))
      if (numComponents === 1) {
        str.write('  ',
          name, '[index] = packedValue;\n')
      } else {
        for (let c = 0; c < numComponents; ++c) {
          str.write('  ',
            name, '[index + ', c, '] = ',
            'packedValue[', c, '];\n')
        }
      }
    } else if (binding.getType() === HdStBinding.BINDLESS_SSBO_RANGE) {
      str.write(name, '[localIndex] = ',
        _GetPackedTypeMutator(_ConvertBoolType(type), true), '(value);\n')
    } else {
      TF_WARN('mutating non-SSBO not supported')
    }
    str.write('}\n')
  } else {
    TF_WARN('mutating non-indexed data not supported')
  }
  // XXX Don't output a default mutator as we don't want accidental overwrites
  // of compute read-write data.
  // GLSL spec doesn't allow default parameter. use function overload instead.
  // default to localIndex=0
  //str << "void HdSet_" << name << "(" << type << " value)"
  //    << " { HdSet_" << name << "(0, value); }\n";
}

/** codeGen.cpp:3925-3940 */
function _EmitScalarAccessor(str: _Stream,
  name: TfToken,
  type: TfToken): void {
  // Emit scalar accessors to support shading languages like MSL which
  // do not support swizzle operators on scalar values.
  if (_GetNumComponents(type) <= 4) {
    str.write(_GetFlatType(type), ' HdGetScalar_',
      name, '(int localIndex)',
      ' { return HdGet_', name, '(localIndex)',
      _GetFlatTypeSwizzleString(type), '; }\n')
    str.write(_GetFlatType(type), ' HdGetScalar_', name, '()',
      ' { return HdGet_', name, '(0)',
      _GetFlatTypeSwizzleString(type), '; }\n')
  }
}

/** codeGen.cpp:3942-3969 (default index = NULL: forward declaration at
 *  codeGen.cpp:357-361) */
function _EmitAccessor(str: _Stream,
  name: TfToken,
  type: TfToken,
  binding: HdStBinding,
  index: string | null = null): void {
  if (index) {
    str.write(_GetUnpackedType(type, false),
      ' HdGet_', name, '(int localIndex) {\n',
      '  int index = ', index, ';\n',
      '  return ', _GetPackedTypeAccessor(type, true), '(',
      name, '[index]);\n}\n')
  } else {
    // non-indexed, only makes sense for uniform or vertex.
    if (binding.getType() === HdStBinding.UNIFORM ||
        binding.getType() === HdStBinding.VERTEX_ATTR) {
      str.write(_GetUnpackedType(type, false),
        ' HdGet_', name, '(int localIndex) { return ')
      str.write(_GetPackedTypeAccessor(type, true), '(', name, ');}\n')
    }
  }
  // GLSL spec doesn't allow default parameter. use function overload instead.
  // default to localIndex=0
  str.write(_GetUnpackedType(type, false), ' HdGet_', name, '()',
    ' { return HdGet_', name, '(0); }\n')

  _EmitScalarAccessor(str, name, type)
}

/** codeGen.cpp:3971-3990 */
function _EmitTextureScaleAndBiasDeclarations(
  accessors: _Stream,
  acc: HdSt_ResourceBinderMetaDataShaderParameterAccessor): void {
  const name = acc.name

  accessors.write(
    '#ifdef HD_HAS_', name, '_',
    HdStTokens.storm, '_', HdStTokens.scale, '\n',
    'FORWARD_DECL(vec4 HdGet_', name, '_',
    HdStTokens.storm, '_', HdStTokens.scale,
    '());\n',
    '#endif\n',
    '#ifdef HD_HAS_', name, '_', HdStTokens.storm,
    '_', HdStTokens.bias, '\n',
    'FORWARD_DECL(vec4 HdGet_', name, '_', HdStTokens.storm,
    '_', HdStTokens.bias,
    '());\n',
    '#endif\n')
}

/** codeGen.cpp:3992-4016 */
function _EmitTextureApplyScaleAndBias(
  accessors: _Stream,
  acc: HdSt_ResourceBinderMetaDataShaderParameterAccessor,
  swizzle: string): void {
  const name = acc.name
  const dataType = acc.dataType

  accessors.write(
    _GetUnpackedType(dataType, false),
    ' HdGet_', name, _tokens.applyScaleAndBias, '(',
    _GetUnpackedType(dataType, false), ' value) {\n',
    '#ifdef HD_HAS_', name, '_', HdStTokens.storm, '_',
    HdStTokens.scale, '\n',
    '  value *= HdGet_', name, '_', HdStTokens.storm,
    '_', HdStTokens.scale, '()', swizzle, ';\n',
    '#endif\n',
    '#ifdef HD_HAS_', name, '_', HdStTokens.storm, '_',
    HdStTokens.bias, '\n',
    '  value += HdGet_', name, '_', HdStTokens.storm,
    '_', HdStTokens.bias, '()', swizzle, ';\n',
    '#endif\n',
    '  return value;\n',
    '}\n')
}

/** codeGen.cpp:4018-4341 */
function _EmitTextureAccessors(
  accessors: _Stream,
  acc: HdSt_ResourceBinderMetaDataShaderParameterAccessor,
  swizzle: string,
  fallbackSwizzle: string,
  dim: number,
  hasTextureTransform: boolean,
  hasTextureScaleAndBias: boolean,
  isBindless: boolean,
  bindlessTextureEnabled: boolean,
  isArray = false,
  isShadowSampler = false,
  isCubemapSampler = false): void {
  const name = acc.name

  const coordDim = (isShadowSampler || isCubemapSampler) ? dim + 1 : dim
  const samplerType =
    _GetGLSLSamplerType(
      isCubemapSampler,
      dim,
      /*isArrayTexture =*/false,
      isShadowSampler)

  // Forward declare texture scale and bias
  if (hasTextureScaleAndBias) {
    _EmitTextureScaleAndBiasDeclarations(accessors, acc)
  }

  if (!isBindless) {
    // a function returning sampler requires bindless_texture
    if (bindlessTextureEnabled) {
      if (isArray) {
        accessors.write(
          samplerType, ' ',
          'HdGetSampler_', name, '(int index) {\n',
          '  return sampler',
          _GetSamplerSuffix(isCubemapSampler, dim), '_', name,
          '[index];\n',
          '}\n')
      } else {
        accessors.write(
          samplerType, ' ',
          'HdGetSampler_', name, '() {\n',
          '  return sampler',
          _GetSamplerSuffix(isCubemapSampler, dim), '_', name,
          ';\n',
          '}\n')
      }
    } else {
      if (isArray) {
        accessors.write(
          '#define HdGetSampler_', name, '(index) ',
          '  HgiGetSampler_', name, '(index)\n',
          '#define HdGetSize_', name, '(index) ',
          '  HgiGetSize_', name, '(index)\n')
      } else {
        accessors.write(
          '#define HdGetSampler_', name, '() ',
          '  HgiGetSampler_', name, '()\n',
          '#define HdGetSize_', name, '() ',
          '  HgiGetSize_', name, '()\n')
      }
    }
  } else {
    if (bindlessTextureEnabled) {
      if (isArray) {
        accessors.write(
          samplerType, ' ',
          'HdGetSampler_', name, '(int index) {\n',
          '  int shaderCoord = GetDrawingCoord().shaderCoord; \n',
          '  return ', samplerType, '(',
          '    shaderData[shaderCoord].', name, ');\n',
          '}\n')
      } else {
        accessors.write(
          samplerType, ' ',
          'HdGetSampler_', name, '() {\n',
          '  int shaderCoord = GetDrawingCoord().shaderCoord; \n',
          '  return ', samplerType, '(',
          '    shaderData[shaderCoord].', name, ');\n',
          '}\n')
      }
    }
  }

  const dataType = acc.dataType

  if (hasTextureTransform) {
    // Declare an eye to sampling transform and define function
    // to initialize it.
    const eyeToSamplingTransform =
      'eyeTo' + name + 'SamplingTransform'

    // Computations in eye space are done with float precision, so the
    // eye to sampling transform is mat4.
    // Note that the multiplication that yiels this sampling transform
    // might be done using higher precision.
    accessors.write(
      'mat4 ', eyeToSamplingTransform, ';\n',
      '\n',
      'void Process_', eyeToSamplingTransform,
      '(MAT4 instanceModelViewInverse) { \n',
      '    int shaderCoord = GetDrawingCoord().shaderCoord; \n',
      '    ', eyeToSamplingTransform, ' = mat4(\n',
      '        MAT4(shaderData[shaderCoord].',
      name, HdSt_ResourceBindingSuffixTokens.samplingTransform,
      ') * instanceModelViewInverse);\n',
      '}\n')
  }

  if (!isBindless) {
    if (isArray) {
      accessors.write(
        _GetUnpackedType(dataType, false),
        ' HdTextureLod_', name,
        '(int index, vec', coordDim, ' coord, float lod) {\n',
        '  return ', _GetPackedTypeAccessor(dataType, false),
        '(HgiTextureLod_', name, '(index, coord, lod)',
        swizzle, ');\n',
        '}\n')
    } else {
      accessors.write(
        _GetUnpackedType(dataType, false),
        ' HdTextureLod_', name,
        '(vec', coordDim, ' coord, float lod) {\n',
        '  return ', _GetPackedTypeAccessor(dataType, false),
        '(HgiTextureLod_', name, '(coord, lod)',
        swizzle, ');\n',
        '}\n')
    }
  } else {
    // bindless
  }

  // If we have texture scale and bias, we want to define an accessor that
  // does not include scale and bias.  We will define additional functions
  // below to return the value with the scale and bias applied.
  const accessorSuffix: string =
    hasTextureScaleAndBias ? _tokens.withoutScaleAndBias : ''

  if (isArray) {
    accessors.write(
      _GetUnpackedType(dataType, false),
      ' HdGet_', name, accessorSuffix, '(int index, vec', coordDim,
      ' coord) {\n',
      '  int shaderCoord = GetDrawingCoord().shaderCoord; \n')
  } else {
    accessors.write(
      _GetUnpackedType(dataType, false),
      ' HdGet_', name, accessorSuffix, '(vec', coordDim,
      ' coord) {\n',
      '  int shaderCoord = GetDrawingCoord().shaderCoord; \n')
  }

  if (hasTextureTransform) {
    const eyeToSamplingTransform =
      'eyeTo' + name + 'SamplingTransform'

    accessors.write(
      '   vec4 c = ', eyeToSamplingTransform,
      ' * vec4(coord, 1);\n',
      '   vec3 sampleCoord = c.xyz / c.w;\n')
  } else {
    accessors.write(
      '  vec', coordDim, ' sampleCoord = coord;\n')
  }

  if (!isBindless) {
    accessors.write(
      '  ', _GetUnpackedType(dataType, false),
      ' result = ',
      _GetPackedTypeAccessor(dataType, false),
      '(HgiGet_', name)
    if (isArray) {
      accessors.write('(index, sampleCoord)')
    } else {
      accessors.write('(sampleCoord)')
    }
    accessors.write(swizzle, ');\n')
  } else {
    accessors.write(
      '  ', _GetUnpackedType(dataType, false),
      ' result = ',
      _GetPackedTypeAccessor(dataType, false),
      '(texture(HdGetSampler_', name)
    if (isArray) {
      accessors.write('(index), sampleCoord)')
    } else {
      accessors.write('(), sampleCoord)')
    }
    accessors.write(swizzle, ');\n')
  }

  if (acc.processTextureFallbackValue) {
    // Check whether texture is valid (using NAME_valid)
    //
    // Note that the OpenGL standard says that the
    // implicit derivatives (for accessing the right
    // mip-level) are undefined if the texture look-up
    // happens in a non-uniform control block, thus the
    // texture lookup is unconditionally assigned to
    // result outside of the if-block.
    //
    accessors.write(
      '  if (bool(shaderData[shaderCoord].', name,
      HdSt_ResourceBindingSuffixTokens.valid, ')) {\n',
      '    return result;\n',
      '  } else {\n',
      '    return ',
      _GetPackedTypeAccessor(dataType, false),
      '(shaderData[shaderCoord].',
      name, HdSt_ResourceBindingSuffixTokens.fallback,
      fallbackSwizzle, ');\n',
      '  }\n')
  } else {
    accessors.write(
      '  return result;\n')
  }

  accessors.write(
    '}\n')

  if (hasTextureScaleAndBias) {
    // HdGet_name_applyScaleAndBias
    _EmitTextureApplyScaleAndBias(accessors, acc, swizzle)

    // HdGet_name implemented using HdGet_name_withoutScaleAndBias and
    // HdGet_name_applyScaleAndBias
    if (isArray) {
      accessors.write(
        _GetUnpackedType(dataType, false),
        ' HdGet_', name, '(int index, vec', coordDim,
        ' coord) {\n',
        '  ', _GetUnpackedType(dataType, false), ' value',
        ' = HdGet_', name, accessorSuffix, '(index, coord);\n')
    } else {
      accessors.write(
        _GetUnpackedType(dataType, false),
        ' HdGet_', name, '(vec', coordDim, ' coord) {\n',
        '  ', _GetUnpackedType(dataType, false), ' value',
        ' = HdGet_', name, accessorSuffix, '(coord);\n')
    }

    accessors.write(
      '  value = HdGet_', name, _tokens.applyScaleAndBias,
      '(value);\n',
      '  return value;\n',
      '}\n')
  }

  const inPrimvars = acc.inPrimvars

  // Forward declare getter for inPrimvars in case it's a transform2d
  if (inPrimvars.length !== 0) {
    accessors.write(
      '#if defined(HD_HAS_', inPrimvars[0]!, ')\n',
      'FORWARD_DECL(vec', dim, ' HdGet_', inPrimvars[0]!,
      '(int localIndex));\n',
      '#endif\n')
  }

  // Create accessor for texture coordinates based on texture param name
  // vec2 HdGetCoord_name(int localIndex)
  accessors.write(
    'vec', coordDim, ' HdGetCoord_', name, '(int localIndex) {\n',
    '  return \n')
  if (inPrimvars.length !== 0) {
    accessors.write(
      '#if defined(HD_HAS_', inPrimvars[0]!, ')\n',
      '  HdGet_', inPrimvars[0]!, '(localIndex).xy\n',
      '#else\n',
      '  vec', coordDim, '(0.0)\n',
      '#endif\n')
  } else {
    accessors.write(
      '  vec', coordDim, '(0.0)')
  }
  accessors.write(';\n}\n')

  // vec2 HdGetCoord_name()
  accessors.write(
    'vec', coordDim, ' HdGetCoord_', name, '() {',
    '  return HdGetCoord_', name, '(0);\n }\n')

  // If accessorSuffix is not empty (i.e., hasTextureScaleAndBias is true),
  // we need to ouput accessors with and without the accessorSuffix.
  const accessorSuffixes: string[] = [accessorSuffix]
  if (accessorSuffix.length !== 0) {
    accessorSuffixes.push('')
  }
  for (const suffix of accessorSuffixes) {
    // vec4 HdGet_name[_suffix](int localIndex)
    if (isArray) {
      accessors.write(
        _GetUnpackedType(dataType, false),
        ' HdGet_', name, suffix,
        '(int localIndex) { return HdGet_', name, suffix,
        '(localIndex, ', 'HdGetCoord_', name,
        '(localIndex));\n}\n')
    } else {
      accessors.write(
        _GetUnpackedType(dataType, false),
        ' HdGet_', name, suffix,
        '(int localIndex) { return HdGet_', name, suffix, '(',
        'HdGetCoord_', name, '(localIndex));\n}\n')
    }

    // vec4 HdGet_name[_suffix]()
    accessors.write(
      _GetUnpackedType(dataType, false),
      ' HdGet_', name, suffix,
      '() {\n  return HdGet_', name, suffix, '(0);\n}\n')
  }

  // float HdGetScalar_name()
  _EmitScalarAccessor(accessors, name, dataType)

  // Emit pre-multiplication by alpha indicator
  if (acc.isPremultiplied) {
    accessors.write('#define ', name, '_IS_PREMULTIPLIED 1\n')
  }
}

/** codeGen.cpp:4343-4480 */
function _EmitTextureUdimArrayAccessors(
  accessors: _Stream,
  acc: HdSt_ResourceBinderMetaDataShaderParameterAccessor,
  swizzle: string,
  fallbackSwizzle: string,
  isBindless: boolean,
  bindlessTextureEnabled: boolean): void {
  // Always possible to have texture scale and bias.
  _EmitTextureScaleAndBiasDeclarations(accessors, acc)

  const name = acc.name

  // a function returning sampler requires bindless_texture
  if (isBindless && bindlessTextureEnabled) {
    accessors.write(
      'sampler2DArray\n',
      'HdGetSampler_', name, '() {\n',
      '  int shaderCoord = GetDrawingCoord().shaderCoord; \n',
      '  return sampler2DArray(shaderData[shaderCoord].',
      name, ');\n',
      '}\n')
  }

  const dataType = acc.dataType

  // HdGet_name_withoutScaleAndBias
  accessors.write(
    dataType,
    ' HdGet_', name, _tokens.withoutScaleAndBias, '(vec2 coord)',
    ' {\n',
    '  int shaderCoord = GetDrawingCoord().shaderCoord;\n',
    '  vec3 c = hd_sample_udim(coord);\n')

  if (isBindless) {
    accessors.write(
      '  uvec2 handle = shaderData[shaderCoord].',
      name, HdSt_ResourceBindingSuffixTokens.layout, ';\n',
      '  c.z = ',
      'texelFetch(sampler1D(handle), int(c.z), 0).x - 1;\n',
      '  vec4 ret = vec4(0, 0, 0, 0);\n',
      '  if (c.z >= -0.5) {\n',
      '    uvec2 handleTexels = shaderData[shaderCoord].',
      name, ';\n',
      '    ret = texture(sampler2DArray(handleTexels), c);\n',
      '  }\n')
  } else {
    accessors.write(
      '  c.z = HgiTexelFetch_',
      name, HdSt_ResourceBindingSuffixTokens.layout,
      '(int(c.z)).x - 1;\n',
      '  vec4 ret = vec4(0, 0, 0, 0);\n',
      '  if (c.z >= -0.5) { ret = HgiGet_',
      name, '(c); }\n')
  }

  if (acc.processTextureFallbackValue) {
    accessors.write(
      '  if (!bool(shaderData[shaderCoord].', name,
      HdSt_ResourceBindingSuffixTokens.valid, ')) {\n',
      '    return ',
      _GetPackedTypeAccessor(dataType, false),
      '(shaderData[shaderCoord].', name,
      HdSt_ResourceBindingSuffixTokens.fallback,
      fallbackSwizzle, ');\n',
      '  }\n')
  }

  accessors.write(
    '  return ret', swizzle, ';\n}\n')

  // HdGet_name_applyScaleAndBias
  _EmitTextureApplyScaleAndBias(accessors, acc, swizzle)

  // HdGet_name implemented using HdGet_name_withoutScaleAndBias and
  // HdGet_name_applyScaleAndBias
  accessors.write(
    dataType,
    ' HdGet_', name, '(vec2 coord) {\n',
    '  ', dataType, ' value = HdGet_', name,
    _tokens.withoutScaleAndBias, '(coord);\n',
    '  value = HdGet_', name, _tokens.applyScaleAndBias,
    '(value);\n',
    '  return value;\n',
    '}\n')

  const inPrimvars = acc.inPrimvars

  // Create accessor for texture coordinates based on param name
  // vec2 HdGetCoord_name()
  accessors.write(
    'vec2 HdGetCoord_', name, '() {\n',
    '  return \n')
  if (inPrimvars.length !== 0) {
    accessors.write(
      '#if defined(HD_HAS_', inPrimvars[0]!, ')\n',
      '  HdGet_', inPrimvars[0]!, '().xy;\n',
      '#else\n',
      '  vec2(0.0, 0.0)\n',
      '#endif\n')
  } else {
    accessors.write(
      '  vec2(0.0, 0.0)\n')
  }
  accessors.write('; }\n')

  const accessorSuffixes: string[] = [
    _tokens.withoutScaleAndBias,
    '',
  ]
  for (const suffix of accessorSuffixes) {
    // vec4 HdGet_name[_suffix]() {
    //   return HdGet_name[_suffix](HdGetCoord_name());
    // }
    accessors.write(
      dataType,
      ' HdGet_', name, suffix, '() { return HdGet_',
      name, suffix, '(', 'HdGetCoord_', name, '()); }\n')

    // vec4 HdGet_name[_suffix](int localIndex) {
    //   return HdGet_name[_suffix](HdGetCoord_name());
    // }
    accessors.write(
      dataType,
      ' HdGet_', name, suffix, '(int localIndex) { return HdGet_',
      name, suffix, '(', 'HdGetCoord_', name, '());\n}\n')
  }

  // float HdGetScalar_name()
  _EmitScalarAccessor(
    accessors, name, dataType)

  // Emit pre-multiplication by alpha indicator
  if (acc.isPremultiplied) {
    accessors.write(
      '#define ', name, '_IS_PREMULTIPLIED 1\n')
  }
}

// Accessing face varying primvar data from the GS or FS requires special
// case handling for refinement while providing a branchless solution.
// When dealing with vertices on a refined face when the face-varying data has
// not been refined, we use the patch coord to get its parametrization on the
// sanitized (coarse) "ptex" face, and interpolate based on the face primitive
// type (bilinear for quad faces, barycentric for tri faces).
// When face varying data has been refined and the fvar patch type is quad or
// tri, we still use bilinear or barycentric interpolation, respectively, but
// we do it over the refined face and use refined face-varying values, accessed
// using the refined face-varying indices.
// When the fvar patch type is b-spline or box-spline, we solve over 16 or 12
// refined values, respectively, also accessed via the refined indices, getting
// the weights from OsdEvaluatePatchBasisNormalized().
/** codeGen.cpp:4495-4701 */
function _EmitFVarAccessor(
  hasGS: boolean,
  str: _Stream,
  name: TfToken,
  type: TfToken,
  _binding: HdStBinding,
  primType: HdSt_GeometricShaderPrimitiveType,
  fvarPatchType: HdSt_GeometricShaderFvarPatchType,
  fvarChannel: number): void {
  // emit an internal getter for accessing the coarse fvar data (corresponding
  // to the refined face, in the case of refinement)
  str.write(_GetUnpackedType(type, false),
    ' HdGet_', name, '_Coarse(int localIndex) {\n')
  if ((fvarPatchType ===
        HdSt_GeometricShaderFvarPatchType.PATCH_COARSE_QUADS) ||
      (fvarPatchType ===
        HdSt_GeometricShaderFvarPatchType.PATCH_COARSE_TRIANGLES)) {
    str.write('  int fvarIndex = GetFVarIndex(localIndex);\n')
  } else {
    str.write('  int fvarIndex = GetDrawingCoord().fvarCoord + localIndex;\n')
  }
  str.write('  return ', _GetPackedTypeAccessor(type, true), '(',
    name, '[fvarIndex]);\n}\n')

  // emit the (public) accessor for the fvar data, accounting for refinement
  // interpolation
  str.write(_GetUnpackedType(type, false),
    ' HdGet_', name, '(int localIndex, vec2 st) {\n')

  if (fvarPatchType ===
      HdSt_GeometricShaderFvarPatchType.PATCH_BSPLINE) {
    str.write('  int patchType = OSD_PATCH_DESCRIPTOR_REGULAR;\n')
  } else if (fvarPatchType ===
      HdSt_GeometricShaderFvarPatchType.PATCH_BOXSPLINETRIANGLE) {
    str.write('  int patchType = OSD_PATCH_DESCRIPTOR_LOOP;\n')
  }

  switch (fvarPatchType) {
    case HdSt_GeometricShaderFvarPatchType.PATCH_COARSE_QUADS:
    {
      // linear interpolation within a quad.
      str.write('  return mix(',
        'mix(', 'HdGet_', name, '_Coarse(0),',
        'HdGet_', name, '_Coarse(1), st.x),',
        'mix(', 'HdGet_', name, '_Coarse(3),',
        'HdGet_', name, '_Coarse(2), st.x), ',
        'st.y);\n}\n')
      break
    }
    case HdSt_GeometricShaderFvarPatchType.PATCH_COARSE_TRIANGLES:
    {
      // barycentric interpolation within a triangle.
      str.write('  return (',
        'HdGet_', name, '_Coarse(0) * (1-st.x-st.y)',
        ' + HdGet_', name, '_Coarse(1) * st.x',
        ' + HdGet_', name, '_Coarse(2) * st.y);\n}\n')
      break
    }
    case HdSt_GeometricShaderFvarPatchType.PATCH_REFINED_QUADS:
    {
      // linear interpolation between 4 refined primvars
      str.write('  ivec4 indices = HdGet_fvarIndices', fvarChannel,
        '();\n',
        '  return mix(',
        'mix(', 'HdGet_', name, '_Coarse(indices[0]),',
        'HdGet_', name, '_Coarse(indices[1]), st.x),',
        'mix(', 'HdGet_', name, '_Coarse(indices[3]),',
        'HdGet_', name, '_Coarse(indices[2]), st.x), ',
        'st.y);\n}\n')
      break
    }
    case HdSt_GeometricShaderFvarPatchType.PATCH_REFINED_TRIANGLES:
    {
      // barycentric interpolation between 3 refined primvars
      str.write('  ivec3 indices = HdGet_fvarIndices', fvarChannel,
        '();\n',
        '  return (',
        'HdGet_', name, '_Coarse(indices[0]) * (1-st.x-st.y)',
        ' + HdGet_', name, '_Coarse(indices[1]) * st.x',
        ' + HdGet_', name, '_Coarse(indices[2]) * st.y);\n}\n')
      break
    }
    case HdSt_GeometricShaderFvarPatchType.PATCH_BSPLINE:
    case HdSt_GeometricShaderFvarPatchType.PATCH_BOXSPLINETRIANGLE:
    {
      // evaluation of a bspline/box spline patch
      str.write('  ivec2 fvarPatchParam = HdGet_fvarPatchParam',
        fvarChannel, '();\n',
        '  OsdPatchParam param = OsdPatchParamInit(fvarPatchParam.x,',
        ' fvarPatchParam.y, 0.0f);\n',
        '  float wP[20], wDu[20], wDv[20], wDuu[20], wDuv[20], ',
        'wDvv[20];\n',
        '  OsdEvaluatePatchBasisNormalized(patchType, param,',
        ' st.x, st.y, wP, wDu, wDv, wDuu, wDuv, wDvv);\n',
        '  ', _GetUnpackedType(type, false), ' result = ',
        _GetUnpackedType(type, false), '(0);\n',
        '  for (int i = 0; i < HD_NUM_PATCH_VERTS; ++i) {\n',
        '    int fvarIndex = HdGet_fvarIndices', fvarChannel,
        '(i);\n',
        '    ', _GetUnpackedType(type, false), ' cv = ',
        _GetUnpackedType(type, false), '(HdGet_', name,
        '_Coarse(fvarIndex));\n',
        '    result += wP[i] * cv;\n',
        '  }\n',
        ' return result;\n}\n')
      break
    }
    case HdSt_GeometricShaderFvarPatchType.PATCH_NONE:
    {
      str.write('  return HdGet_', name, '_Coarse(localIndex);\n}\n')
      break
    }
    default:
    {
      // emit a default version for compilation sake
      str.write('  return HdGet_', name, '_Coarse(localIndex);\n}\n')

      TF_CODING_ERROR('Face varing bindings for unexpected for' +
        ` HdSt_GeometricShader::PrimitiveType ${primType as number}`)
    }
  }

  str.write('FORWARD_DECL(vec4 GetPatchCoord(int index));\n',
    'FORWARD_DECL(vec2 GetPatchCoordLocalST());\n',
    _GetUnpackedType(type, false),
    ' HdGet_', name, '(int localIndex) {\n')

  switch (fvarPatchType) {
    case HdSt_GeometricShaderFvarPatchType.PATCH_COARSE_QUADS:
    case HdSt_GeometricShaderFvarPatchType.PATCH_COARSE_TRIANGLES:
    {
      str.write('  vec2 localST = GetPatchCoord(localIndex).xy;\n')
      break
    }
    case HdSt_GeometricShaderFvarPatchType.PATCH_BSPLINE:
    {
      // Compute localST in normalized patch param space
      str.write('  ivec2 fvarPatchParam = HdGet_fvarPatchParam',
        fvarChannel, '();\n',
        '  OsdPatchParam param = OsdPatchParamInit(fvarPatchParam.x,',
        ' fvarPatchParam.y, 0.0f);\n',
        '  vec2 unnormalized = GetPatchCoord(localIndex).xy;\n',
        '  float uv[2] = { unnormalized.x, unnormalized.y };\n',
        '  OsdPatchParamNormalize(param, uv);\n',
        '  vec2 localST = vec2(uv[0], uv[1]);\n')
      break
    }
    case HdSt_GeometricShaderFvarPatchType.PATCH_BOXSPLINETRIANGLE:
    {
      // Compute localST in normalized patch param space
      str.write('  ivec2 fvarPatchParam = HdGet_fvarPatchParam',
        fvarChannel, '();\n',
        '  OsdPatchParam param = OsdPatchParamInit(fvarPatchParam.x,',
        ' fvarPatchParam.y, 0.0f);\n',
        '  vec2 unnormalized = GetPatchCoord(localIndex).xy;\n',
        '  float uv[2] = { unnormalized.x, unnormalized.y };\n',
        '  OsdPatchParamNormalizeTriangle(param, uv);\n',
        '  vec2 localST = vec2(uv[0], uv[1]);\n')
      break
    }
    case HdSt_GeometricShaderFvarPatchType.PATCH_REFINED_QUADS:
    {
      if (hasGS) {
        if (HdSt_GeometricShader.isPrimTypeTriQuads(primType)) {
          str.write('  const vec2 lut[2][3] = {\n' +
                    '    { vec2(0,0), vec2(1,0), vec2(1,1) },\n' +
                    '    { vec2(1,1), vec2(0,1), vec2(0,0) },\n' +
                    '  };\n' +
                    '  const vec2 localST = ' +
                    'lut[GetTriQuadID()][localIndex];\n')
        } else {
          str.write('  const vec2 lut[4] = {\n' +
                    '    vec2(0,0), vec2(1,0), vec2(1,1), vec2(0,1)\n' +
                    '  };\n',
                    '  const vec2 localST = lut[localIndex];\n')
        }
      } else {
        str.write('  vec2 localST = GetPatchCoordLocalST();\n')
      }
      break
    }
    case HdSt_GeometricShaderFvarPatchType.PATCH_REFINED_TRIANGLES:
    {
      if (hasGS) {
        str.write('  vec2 lut[3] = vec2[3](vec2(0,0), vec2(1,0), ',
          'vec2(0,1));\n',
          '  vec2 localST = lut[localIndex];\n')
      } else {
        str.write('  vec2 localST = GetPatchCoordLocalST();\n')
      }
      break
    }
    default:
    {
      str.write('  vec2 localST = vec2(0);\n')
    }
  }
  str.write('  return HdGet_', name, '(localIndex, localST);\n}\n')

  // XXX: We shouldn't emit the default (argument free) accessor version,
  // since that doesn't make sense within a GS. Once we fix the XXX in
  // _GenerateShaderParameters, we should remove this.
  str.write(_GetUnpackedType(type, false), ' HdGet_', name, '()',
    ' { return HdGet_', name, '(0); }\n')
}

/** codeGen.cpp:4703-4726 */
function _GetDrawingCoordElem(ss: _Stream,
  inputPrefix: string,
  inArraySize = ''): void {
  ss.write('  dc.modelCoord              = ', inputPrefix,
    'drawingCoord0', inArraySize, '.x;\n',
    '  dc.constantCoord           = ', inputPrefix,
    'drawingCoord0', inArraySize, '.y;\n',
    '  dc.elementCoord            = ', inputPrefix,
    'drawingCoord0', inArraySize, '.z;\n',
    '  dc.primitiveCoord          = ', inputPrefix,
    'drawingCoord0', inArraySize, '.w;\n',
    '  dc.fvarCoord               = ', inputPrefix,
    'drawingCoord1', inArraySize, '.x;\n',
    '  dc.shaderCoord             = ', inputPrefix,
    'drawingCoord1', inArraySize, '.z;\n',
    '  dc.vertexCoord             = ', inputPrefix,
    'drawingCoord1', inArraySize, '.w;\n',
    '  dc.topologyVisibilityCoord = ', inputPrefix,
    'drawingCoord2', inArraySize, '.x;\n',
    '  dc.varyingCoord            = ', inputPrefix,
    'drawingCoord2', inArraySize, '.y;\n')
}

/** codeGen.cpp:4912-4922 (static local of _GenerateDrawingCoord) */
const _drawingCoordParams: readonly string[] = [
  'modelCoord',
  'constantCoord',
  'elementCoord',
  'primitiveCoord',
  'fvarCoord',
  'shaderCoord',
  'vertexCoord',
  'topologyVisibilityCoord',
  'varyingCoord',
]

// (No free functions in codeGen.cpp:5403-7235.)


type _ElementVector = HioGlslfxResourceLayoutElementVector
type _TextureElementVector = HioGlslfxResourceLayoutTextureElementVector

/** HdSt_CodeGen::_PackedResourceMapping (codeGen.h:131-134). The packed
 *  field name (grouping vector) and name of its component that holds the
 *  resource. */
interface _PackedResourceMapping {
  groupName: TfToken
  component: string
}

/** HdSt_CodeGen::_Resource (codeGen.h:189-195) */
interface _Resource {
  res: _ElementVector
  gen: _Stream
  hdShaderStage: TfToken
  hgiShaderStage: HgiShaderStage
}

/** codeGen.h:38-243. A utility class to compose glsl shader sources and
 *  compile them upon request of HdShaderSpec. */
export class HdSt_CodeGen {
  private _metaData: HdSt_ResourceBinderMetaData
  private _geometricShader: HdSt_GeometricShader | null
  private _shaders: HdStShaderCode[]
  private _materialTag: TfToken = TfToken()

  // source buckets
  private _genDefines = new _Stream()
  private _genDecl = new _Stream()
  private _genAccessors = new _Stream()
  private _genVS = new _Stream()
  private _genTCS = new _Stream()
  private _genTES = new _Stream()
  private _genPTCS = new _Stream()
  private _genPTVS = new _Stream()
  private _genGS = new _Stream()
  private _genFS = new _Stream()
  private _genCS = new _Stream()
  private _procVS = new _Stream()
  private _procTCS = new _Stream()
  private _procTES = new _Stream()
  private _procGS = new _Stream()
  private _procPTVSOut = new _Stream()
  private _osd = new _Stream()

  // resource buckets
  private _resVS: _ElementVector = []
  private _resTCS: _ElementVector = []
  private _resTES: _ElementVector = []
  private _resGS: _ElementVector = []
  private _resFS: _ElementVector = []
  private _resPTCS: _ElementVector = []
  private _resPTVS: _ElementVector = []
  private _resCS: _ElementVector = []

  private _resources: _Resource[]

  private _resInterstage: _ElementVector = []
  private _resInterstagePackedMappings = new Map<string, _PackedResourceMapping>()

  private _resCommon: _ElementVector = []
  private _resAttrib: _ElementVector = []
  private _resMaterial: _ElementVector = []

  private _resTextures: _TextureElementVector = []

  // generated sources (for diagnostics)
  private _vsSource = ''
  private _tcsSource = ''
  private _tesSource = ''
  private _gsSource = ''
  private _fsSource = ''
  private _csSource = ''
  private _ptcsSource = ''
  private _ptvsSource = ''

  private _hasVS = false
  private _hasTCS = false
  private _hasTES = false
  private _hasGS = false
  private _hasFS = false
  private _hasCS = false
  private _hasPTCS = false
  private _hasPTVS = false

  private _generateClipDistances = false

  /** Both constructors: (geometricShader, shaders, materialTag, metaData) at
   *  codeGen.cpp:199-246 and, for non-geometric use cases (call
   *  CompileComputeProgram, not Compile), (shaders, metaData) at
   *  codeGen.cpp:248-291. */
  constructor(
    geometricShader: HdSt_GeometricShader,
    shaders: HdStShaderCode[],
    materialTag: TfToken,
    metaData: HdSt_ResourceBinderMetaData)
  constructor(
    shaders: HdStShaderCode[],
    metaData: HdSt_ResourceBinderMetaData)
  constructor(
    a: HdSt_GeometricShader | HdStShaderCode[],
    b: HdStShaderCode[] | HdSt_ResourceBinderMetaData,
    c?: TfToken,
    d?: HdSt_ResourceBinderMetaData,
  ) {
    if (Array.isArray(a)) {
      this._metaData = b as HdSt_ResourceBinderMetaData
      this._geometricShader = null
      this._shaders = a
    } else {
      this._metaData = d!
      this._geometricShader = a
      this._shaders = b as HdStShaderCode[]
      this._materialTag = c!
      TF_VERIFY(a)
    }
    TF_VERIFY(this._metaData,
      'Invalid MetaData ptr passed in as constructor arg.')
    this._resources = [
      { res: this._resVS, gen: this._genVS,
        hdShaderStage: HdShaderTokens.vertexShader,
        hgiShaderStage: HgiShaderStageBits.HgiShaderStageVertex },
      { res: this._resFS, gen: this._genFS,
        hdShaderStage: HdShaderTokens.fragmentShader,
        hgiShaderStage: HgiShaderStageBits.HgiShaderStageFragment },
      { res: this._resTCS, gen: this._genTCS,
        hdShaderStage: HdShaderTokens.tessControlShader,
        hgiShaderStage: HgiShaderStageBits.HgiShaderStageTessellationControl },
      { res: this._resTES, gen: this._genTES,
        hdShaderStage: HdShaderTokens.tessEvalShader,
        hgiShaderStage: HgiShaderStageBits.HgiShaderStageTessellationEval },
      { res: this._resGS, gen: this._genGS,
        hdShaderStage: HdShaderTokens.geometryShader,
        hgiShaderStage: HgiShaderStageBits.HgiShaderStageGeometry },
      { res: this._resCS, gen: this._genCS,
        hdShaderStage: HdShaderTokens.computeShader,
        hgiShaderStage: HgiShaderStageBits.HgiShaderStageCompute },
      { res: this._resPTCS, gen: this._genPTCS,
        hdShaderStage: HdShaderTokens.postTessControlShader,
        hgiShaderStage: HgiShaderStageBits.HgiShaderStagePostTessellationControl },
      { res: this._resPTVS, gen: this._genPTVS,
        hdShaderStage: HdShaderTokens.postTessVertexShader,
        hgiShaderStage: HgiShaderStageBits.HgiShaderStagePostTessellationVertex },
    ]
  }

  /** codeGen.cpp:187-197. Returns true if shader resource definitions are
   *  being generated by Hgi or false if shader resource definitions are
   *  generated as native GLSL. */
  static isEnabledHgiResourceGeneration(hgi: Hgi): boolean {
    if (_isEnabledHgiResourceGeneration === undefined) {
      _isEnabledHgiResourceGeneration =
        TfGetEnvSetting(HDST_ENABLE_HGI_RESOURCE_GENERATION)
    }
    const isEnabled = _isEnabledHgiResourceGeneration

    // Check if is env var is true, otherwise return true if NOT using HgiGL,
    // as Hgi resource generation is required for Metal and Vulkan.
    return isEnabled || !_IsHgiOpenGL(hgi)
  }

  /** codeGen.cpp:293-310. Return the hash value of glsl shader to be
   *  generated. */
  computeHash(): bigint {
    if (!TF_VERIFY(this._metaData,
      'Metadata not properly initialized by resource binder.')) {
      return 0n
    }

    return TfHashCombine(
      this._geometricShader ? this._geometricShader.computeHash() : 0n,
      this._metaData.computeHash(),
      HdStShaderCode.computeHashOfShaders(this._shaders),
      TfHash(this._materialTag),
    )
  }

  /** codeGen.cpp:1759-1784 */
  private _getShaderResourceLayouts(
    shaders: readonly HdStShaderCode[],
  ): void {
    const shaderStages: TfToken[] = [
      HdShaderTokens.vertexShader,
      HdShaderTokens.tessControlShader,
      HdShaderTokens.tessEvalShader,
      HdShaderTokens.geometryShader,
      HdShaderTokens.fragmentShader,
      HdShaderTokens.postTessControlShader,
      HdShaderTokens.postTessVertexShader,
      HdShaderTokens.computeShader,
    ]

    for (const shader of shaders) {
      const layoutDict = shader.getLayout(shaderStages)
      for (const resource of this._resources) {
        HioGlslfxResourceLayout.parseLayout(
          resource.res, resource.hdShaderStage, layoutDict)
      }
    }
  }

  /** codeGen.cpp:1786-1957 */
  private _plumbInterstageElements(): void {
    // Graphics devices impose limits on the number of input/output locations
    // available. We can quickly exceeed such limits on low spec devices if we
    // naively use one location per drawing coord. This is because arrays take
    // one location per item, regardless of the item size. This means that:
    //   layout(location = 0) in int someCoord[gl_MaxPatchVertices]
    // consumes as many locations (gl_MaxPatchVertices) as:
    //   layout(location = 0) in ivec4 someCoord[gl_MaxPatchVertices]
    // while holding 4x fewer values. Instead if we do:
    //   layout(location = 0) in ivec4 someCoord[
    //       divRoundUp(gl_MaxPatchVertices, 4)]
    // and pack the coord values into the vector elements, we can use 4x fewer
    // locations. In practice, since we have many coord in/out fields, it's
    // simpler to pack across fields instead of within a field, but the idea is
    // the same. This means that:
    //   flat layout(location = 0) in int someCoord1[gl_MaxPatchVertices];
    //   flat layout(location = 1) in int someCoord2[gl_MaxPatchVertices];
    //     < 7 more fields omitted >
    //   flat layout(location = 9) in int someCoord10[gl_MaxPatchVertices];
    // becomes:
    //   flat layout(location = 0) in ivec4 someCoord1To4[gl_MaxPatchVertices];
    //   flat layout(location = 1) in ivec4 someCoord5to8[gl_MaxPatchVertices];
    //   flat layout(location = 2) in ivec4 someCoord8to10[gl_MaxPatchVertices];
    // where someCoord1To4[i].x is someCoord1[i], someCoord1To4[i].y is
    // someCoord2[i], someCoord1To4[i].z is someCoord3[i], someCoord1To4[i].w
    // is someCoord4[i].
    //
    // Ref: https://docs.vulkan.org/spec/latest/chapters/interfaces.html#interfaces-iointerfaces-locations

    // This code automates such packing. It identifies fields with the same
    // scalar type, and groups them into 4 element vectors. It also generates
    // mapping data, so the original field can be mapped to its vector
    // component.

    interface _ProcessedElement {
      name: TfToken
      dataType: TfToken
    }

    interface _ElementGroup {
      commonDataType: TfToken
      elements: HioGlslfxResourceLayoutElement[]
    }

    const processedElements: _ProcessedElement[] = []
    const packedElementGroups: _ElementGroup[] = []
    // std::map<TfToken, _ElementGroup>: iterated below in key order.
    const elementGroupsToFill = new Map<TfToken, _ElementGroup>()
    for (const element of this._resInterstage) {
      const dataType = element.dataType
      if (dataType !== _tokens._int && dataType !== _tokens._float) {
        processedElements.push({ name: element.name, dataType })
        continue
      }

      // Add to an existing group, or create a new one.
      let group = elementGroupsToFill.get(dataType)
      if (group === undefined) {
        group = { commonDataType: dataType, elements: [] }
        elementGroupsToFill.set(dataType, group)
      }

      // When a group is full, move it to the fully packed groups list.
      TF_VERIFY(group.elements.length < 4)
      group.elements.push(element)
      if (group.elements.length === 4) {
        packedElementGroups.push(group)
        elementGroupsToFill.delete(dataType)
      }
    }

    // Some groups won't be full if the number of elements is not cleanly
    // divisible by 4.
    for (const key of [...elementGroupsToFill.keys()].sort()) {
      packedElementGroups.push(elementGroupsToFill.get(key)!)
    }

    // Generate the mapping data.
    this._resInterstagePackedMappings.clear()
    let packedElementGroup = 0
    for (const { commonDataType, elements } of packedElementGroups) {
      const groupName = TfToken(
        _tokens.interstageDrawingCoord +
        String(packedElementGroup++))

      for (let i = 0; i < elements.length; i++) {
        const mapping: _PackedResourceMapping = {
          groupName,
          component: '[' + String(i) + ']',
        }
        // try_emplace: keep an existing mapping.
        if (!this._resInterstagePackedMappings.has(elements[i]!.name)) {
          this._resInterstagePackedMappings.set(elements[i]!.name, mapping)
        }
      }

      if (commonDataType === _tokens._int) {
        processedElements.push({ name: groupName, dataType: _tokens.ivec4 })
      } else if (commonDataType === _tokens._float) {
        processedElements.push({ name: groupName, dataType: _tokens.vec4 })
      } else {
        TF_CODING_ERROR('Invalid element group data type')
      }
    }

    for (const { name, dataType } of processedElements) {
      const isInteger = (dataType === _tokens.ivec4)

      // Add resource elements to plumb interstage elements, e.g.
      // drawingCoord and interpolated primvar through active stages.

      const baseName: string = name
      const vs_outName = TfToken('vs_' + baseName)
      const tcs_outName = TfToken('tcs_' + baseName)
      const tes_outName = TfToken('tes_' + baseName)
      const gs_outName = TfToken('gs_' + baseName)

      // Empty token for variables with no array size
      const noArraySize = TfToken()

      // Interstage variables of base type "int" require "flat" interpolation
      const qualifier = isInteger ?
        _tokens.flat : _tokens._default

      // Vertex attrib input for VS, PTCS, PTVS
      this._resAttrib.push(new HioGlslfxResourceLayout.Element(
        InOut.STAGE_OUT, Kind.VALUE, dataType,
        vs_outName, noArraySize, qualifier))

      if (this._hasTCS) {
        this._resTCS.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_IN, Kind.VALUE, dataType,
          vs_outName, _tokens.gl_MaxPatchVertices, qualifier))
        this._resTCS.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_OUT, Kind.VALUE, dataType,
          tcs_outName, _tokens.HD_NUM_PATCH_EVAL_VERTS, qualifier))
      }

      if (this._hasTES) {
        this._resTES.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_IN, Kind.VALUE, dataType,
          tcs_outName, _tokens.gl_MaxPatchVertices, qualifier))
        this._resTES.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_OUT, Kind.VALUE, dataType,
          tes_outName, noArraySize, qualifier))
      }

      // Geometry shader inputs come from previous active stage
      if (this._hasGS && this._hasTES) {
        this._resGS.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_IN, Kind.VALUE, dataType,
          tes_outName, _tokens.HD_NUM_PRIMITIVE_VERTS, qualifier))
        this._resGS.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_OUT, Kind.VALUE, dataType,
          gs_outName, noArraySize, qualifier))
      } else if (this._hasGS) {
        this._resGS.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_IN, Kind.VALUE, dataType,
          vs_outName, _tokens.HD_NUM_PRIMITIVE_VERTS, qualifier))
        this._resGS.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_OUT, Kind.VALUE, dataType,
          gs_outName, noArraySize, qualifier))
      }

      // Fragment shader inputs come from previous active stage
      if (this._hasGS) {
        this._resFS.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_IN, Kind.VALUE, dataType,
          gs_outName, noArraySize, qualifier))
      } else if (this._hasTES) {
        this._resFS.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_IN, Kind.VALUE, dataType,
          tes_outName, noArraySize, qualifier))
      } else {
        this._resFS.push(new HioGlslfxResourceLayout.Element(
          InOut.STAGE_IN, Kind.VALUE, dataType,
          vs_outName, noArraySize, qualifier))
      }
    }
  }

  /** codeGen.cpp:2061-2725 */
  Compile(registry: HdStResourceRegistry): HdStGLSLProgram | null {
    if (!TF_VERIFY(this._metaData,
      'Metadata not properly initialized by resource binder.')) {
      return null
    }

    const geometricShader = this._geometricShader!

    this._getShaderResourceLayouts([geometricShader])
    this._getShaderResourceLayouts(this._shaders)

    // Capabilities.
    const capabilities = registry.getHgi().getCapabilities()!
    const bindlessTextureEnabled =
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBindlessTextures)
    const bindlessBuffersEnabled =
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBindlessBuffers)
    const shaderDrawParametersEnabled =
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDrawParameters)
    const builtinBarycentricsEnabled =
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBuiltinBarycentrics)
    const metalTessellationEnabled =
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsMetalTessellation)
    const requiresBasePrimitiveOffset =
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBasePrimitiveOffset)
    const requiresPrimitiveIdEmulation =
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsPrimitiveIdEmulation)
    const doublePrecisionEnabled =
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)
    const minusOneToOneDepth =
      capabilities.isSet(HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsDepthRangeMinusOnetoOne)

    const useHgiResourceGeneration =
      HdSt_CodeGen.isEnabledHgiResourceGeneration(registry.getHgi())

    const useHardwareClipping = geometricShader.getUseHardwareClipPlanes()

    // shader sources
    // geometric shader owns main()
    const vertexShader =
      geometricShader.getSource(HdShaderTokens.vertexShader)
    const tessControlShader =
      geometricShader.getSource(HdShaderTokens.tessControlShader)
    const tessEvalShader =
      geometricShader.getSource(HdShaderTokens.tessEvalShader)
    const postTessControlShader =
      geometricShader.getSource(HdShaderTokens.postTessControlShader)
    const postTessVertexShader =
      geometricShader.getSource(HdShaderTokens.postTessVertexShader)
    const geometryShader =
      geometricShader.getSource(HdShaderTokens.geometryShader)
    const fragmentShader =
      geometricShader.getSource(HdShaderTokens.fragmentShader)
    const computeShader =
      geometricShader.getSource(HdShaderTokens.computeShader)

    this._hasVS = (vertexShader.length !== 0)
    this._hasTCS = (tessControlShader.length !== 0)
    this._hasTES = (tessEvalShader.length !== 0)
    this._hasPTCS = (postTessControlShader.length !== 0) && metalTessellationEnabled
    this._hasPTVS = (postTessVertexShader.length !== 0) && metalTessellationEnabled
    this._hasGS = (geometryShader.length !== 0) && !metalTessellationEnabled
    this._hasFS = (fragmentShader.length !== 0)
    this._hasCS = (computeShader.length !== 0)

    // Initialize source buckets
    this._genDefines.str(''); this._genDecl.str(''); this._genAccessors.str('')
    this._genVS.str(''); this._genTCS.str(''); this._genTES.str('')
    this._genPTCS.str(''); this._genPTVS.str('')
    this._genGS.str(''); this._genFS.str(''); this._genCS.str('')
    this._procVS.str(''); this._procTCS.str(''); this._procTES.str(''); this._procGS.str('')
    this._procPTVSOut.str('')

    this._genDefines.write('\n// //////// Codegen Defines //////// \n')
    this._genDecl.write('\n// //////// Codegen Decl //////// \n')
    this._genAccessors.write('\n// //////// Codegen Accessors //////// \n')
    this._genVS.write('\n// //////// Codegen VS Source //////// \n')
    this._genTCS.write('\n// //////// Codegen TCS Source //////// \n')
    this._genTES.write('\n// //////// Codegen TES Source //////// \n')
    this._genPTCS.write('\n// //////// Codegen PTCS Source //////// \n')
    this._genPTVS.write('\n// //////// Codegen PTVS Source //////// \n')
    this._genGS.write('\n// //////// Codegen GS Source //////// \n')
    this._genFS.write('\n// //////// Codegen FS Source //////// \n')
    this._genCS.write('\n// //////// Codegen CS Source //////// \n')
    this._procVS.write('\n// //////// Codegen Proc VS //////// \n')
    this._procTCS.write('\n// //////// Codegen Proc TCS //////// \n')
    this._procTES.write('\n// //////// Codegen Proc TES //////// \n')
    this._procGS.write('\n// //////// Codegen Proc GS //////// \n')

    // Used in glslfx files to determine if it is using new/old
    // imaging system. It can also be used as API guards when
    // we need new versions of Storm shading.
    this._genDefines.write('#define HD_SHADER_API ', HD_SHADER_API, '\n')

    // XXX: this macro is still used in GlobalUniform.
    this._genDefines.write('#define MAT4 ',
      HdStGLConversions.getGLSLTypename(
        HdVtBufferSource.getDefaultMatrixType()), '\n')

    if (minusOneToOneDepth) {
      this._genDefines.write('#define HD_MINUS_ONE_TO_ONE_DEPTH_RANGE\n')
    }

    if (useHardwareClipping) {
      this._genDefines.write('#define HD_USE_HARDWARE_CLIPPING\n')
    }

    // a trick to tightly pack unaligned data (vec3, etc) into SSBO/UBO.
    this._genDefines.write(_GetPackedTypeDefinitions())

    if (this._materialTag === HdStMaterialTagTokens.masked) {
      this._genFS.write('#define HD_MATERIAL_TAG_MASKED 1\n')
    }
    if (this._materialTag === HdStMaterialTagTokens.translucent) {
      this._genFS.write('#define HD_MATERIAL_TAG_TRANSLUCENT 1\n')
    }
    if (doublePrecisionEnabled) {
      this._genFS.write('#define HD_SHADER_SUPPORTS_DOUBLE_PRECISION\n')
    }
    if (bindlessBuffersEnabled) {
      this._genVS.write('#define HD_BINDLESS_BUFFERS_ENABLED\n')
    }

    // ------------------
    // Custom Buffer Bindings
    // ----------------------
    // For custom buffer bindings, more code can be generated; a full spec is
    // emitted based on the binding declaration.
    for (const binDecl of this._metaData.customBindings) {
      this._genDefines.write('#define ',
        binDecl.name, '_Binding ',
        binDecl.binding.getLocation(), '\n')
      this._genDefines.write('#define HD_HAS_', binDecl.name, ' 1\n')

      // typeless binding doesn't need declaration nor accessor.
      if (binDecl.dataType.length === 0) continue

      // atomics can't be trivially passed by value, and Storm does not
      // access them via HdGet_ accessors. Skip generation.
      if (_IsAtomicBufferShaderResource(this._resFS, binDecl.name)) {
        continue
      }

      if (binDecl.stageVisibility === HgiShaderStageBits.HgiShaderStageAll) {
        _EmitDeclaration(this._resCommon, binDecl)
        _EmitAccessor(this._genAccessors,
          binDecl.name,
          binDecl.dataType,
          binDecl.binding,
          (binDecl.binding.getType() === HdStBinding.UNIFORM)
            ? null : 'localIndex')
      } else {
        for (const resource of this._resources) {
          if (resource.res && resource.gen &&
              (binDecl.stageVisibility & resource.hgiShaderStage)) {
            _EmitDeclaration(resource.res, binDecl)
            _EmitAccessor(
              resource.gen,
              binDecl.name,
              binDecl.dataType,
              binDecl.binding,
              (binDecl.binding.getType() === HdStBinding.UNIFORM)
                ? null
                : 'localIndex')
          }
        }
      }
    }

    for (const [binding, block] of this._metaData.customInterleavedBindings) {
      // note: _constantData has been sorted by offset in HdSt_ResourceBinder.
      // XXX: not robust enough, should consider padding and layouting rules
      // to match with the logic in HdInterleavedMemoryManager if we
      // want to use a layouting policy other than default padding.

      const typeName = TfToken(`CustomBlockData${binding.GetValue()}`)
      const varName = block.blockName
      const isIndexed = (
        block.arraySize > 0 || (
          binding.getType() !== HdStBinding.UNIFORM &&
          binding.getType() !== HdStBinding.UBO))

      this._genDecl.write('struct ', typeName, ' {\n')
      // dbIt is StructEntry { name, dataType, offset, numElements }
      for (const dbIt of block.entries) {
        this._genDefines.write('#define HD_HAS_', dbIt.name, ' 1\n')
        this._genDecl.write('  ', _GetPackedType(_ConvertBoolType(dbIt.dataType), false),
          ' ', dbIt.name)

        if (dbIt.arraySize > 1) {
          this._genDefines.write('#define HD_NUM_', dbIt.name,
            ' ', dbIt.arraySize, '\n')
          this._genDecl.write('[', dbIt.arraySize, ']')
        }
        this._genDecl.write(';\n')

        if (block.stageVisibility === HgiShaderStageBits.HgiShaderStageAll) {
          _EmitStructAccessor(this._genAccessors, varName,
            dbIt.name, dbIt.dataType, dbIt.arraySize,
            isIndexed ? 'localIndex' : null,
            dbIt.concatenateNames)
        } else {
          for (const resource of this._resources) {
            if (resource.res && resource.gen &&
                (block.stageVisibility & resource.hgiShaderStage)) {
              _EmitStructAccessor(
                resource.gen,
                varName,
                dbIt.name,
                dbIt.dataType,
                dbIt.arraySize,
                isIndexed
                  ? 'localIndex'
                  : null,
                dbIt.concatenateNames)
            }
          }
        }

        if (dbIt.name === HdShaderTokens.clipPlanes) {
          this._generateClipDistances = useHardwareClipping
        }
      }

      this._genDecl.write('};\n')
      if (block.stageVisibility === HgiShaderStageBits.HgiShaderStageAll) {
        _EmitDeclaration(this._resCommon, varName, typeName, binding,
          block.isWritable, block.arraySize)
      } else {
        for (const resource of this._resources) {
          if (resource.res && resource.gen &&
              (block.stageVisibility & resource.hgiShaderStage)) {
            _EmitDeclaration(
              resource.res,
              varName,
              typeName,
              binding,
              block.isWritable,
              block.arraySize)
          }
        }
      }
    }

    // HD_NUM_PATCH_VERTS, HD_NUM_PRIMTIIVE_VERTS
    if (geometricShader.isPrimTypePatches()) {
      this._genDefines.write('#define HD_NUM_PATCH_VERTS ',
        geometricShader.getPrimitiveIndexSize(), '\n')
      this._genDefines.write('#define HD_NUM_PATCH_EVAL_VERTS ',
        geometricShader.getNumPatchEvalVerts(), '\n')
    }
    this._genDefines.write('#define HD_NUM_PRIMITIVE_VERTS ',
      geometricShader.getNumPrimitiveVertsForGeometryShader(),
      '\n')

    // include ptex utility (if needed)
    for (const [binding] of this._metaData.shaderParameterBinding) {
      const bindingType = binding.getType()
      if (bindingType === HdStBinding.TEXTURE_PTEX_TEXEL ||
          bindingType === HdStBinding.BINDLESS_TEXTURE_PTEX_TEXEL) {
        this._genDecl.write(_GetPtexTextureShaderSource())
        break
      }
    }

    for (const [, block] of this._metaData.topologyVisibilityData) {
      for (const pIt of block.entries) {
        this._genDefines.write('#define HD_HAS_', pIt.name, ' 1\n')
      }
    }

    // primvar existence macros

    // XXX: this is temporary, until we implement the fallback value definition
    // for any primvars used in glslfx.
    // Note that this #define has to be considered in the hash computation
    // since it changes the source code. However we have already combined the
    // entries of instanceData into the hash value, so it's not needed to be
    // added separately, at least in current usage.
    for (const [, block] of this._metaData.constantData) {
      for (const pIt of block.entries) {
        this._genDefines.write('#define HD_HAS_', pIt.name, ' 1\n')
      }
    }
    for (const [, primvar] of this._metaData.instanceData) {
      this._genDefines.write('#define HD_HAS_INSTANCE_', primvar.name, ' 1\n')
      this._genDefines.write('#define HD_HAS_',
        primvar.name, '_', primvar.level, ' 1\n')
    }
    this._genDefines.write('#define HD_INSTANCER_NUM_LEVELS ',
      this._metaData.instancerNumLevels, '\n',
      '#define HD_INSTANCE_INDEX_WIDTH ',
      (this._metaData.instancerNumLevels + 1), '\n')
    if (!geometricShader.isPrimTypePoints()) {
      for (const [, primvar] of this._metaData.elementData) {
        this._genDefines.write('#define HD_HAS_', primvar.name, ' 1\n')
      }
      for (const [, primvar] of this._metaData.fvarData) {
        this._genDefines.write('#define HD_HAS_', primvar.name, ' 1\n')
      }
    }
    for (const [, primvar] of this._metaData.vertexData) {
      this._genDefines.write('#define HD_HAS_', primvar.name, ' 1\n')
    }
    for (const [, primvar] of this._metaData.varyingData) {
      this._genDefines.write('#define HD_HAS_', primvar.name, ' 1\n')
    }
    for (const [binding, accessor] of this._metaData.shaderParameterBinding) {
      // XXX: HdStBinding::PRIMVAR_REDIRECT won't define an accessor if it's
      // an alias of like-to-like, so we want to suppress the HD_HAS_* flag
      // as well.

      // For PRIMVAR_REDIRECT, the HD_HAS_* flag will be defined after
      // the corresponding HdGet_* function.

      // XXX: (HYD-1882) The #define HD_HAS_... for a primvar
      // redirect will be defined immediately after the primvar
      // redirect HdGet_... in the loop over
      // _metaData->shaderParameterBinding below.  Given that this
      // loop is not running in a canonical order (e.g., textures
      // first, then primvar redirects, ...) and that the texture is
      // picking up the HD_HAS_... flag, the answer to the following
      // question is random:
      //
      // If there is a texture trying to use a primvar called NAME
      // for coordinates and there is a primvar redirect called NAME,
      // will the texture use it or not?
      //
      const bindingType = binding.getType()
      if (bindingType !== HdStBinding.PRIMVAR_REDIRECT) {
        this._genDefines.write('#define HD_HAS_', accessor.name, ' 1\n')
      }

      // For any texture shader parameter we also emit the texture
      // coordinates associated with it
      if (bindingType === HdStBinding.TEXTURE_2D ||
          bindingType === HdStBinding.BINDLESS_TEXTURE_2D ||
          bindingType === HdStBinding.ARRAY_OF_TEXTURE_2D ||
          bindingType === HdStBinding.BINDLESS_ARRAY_OF_TEXTURE_2D ||
          bindingType === HdStBinding.TEXTURE_UDIM_ARRAY ||
          bindingType === HdStBinding.BINDLESS_TEXTURE_UDIM_ARRAY ||
          bindingType === HdStBinding.TEXTURE_CUBEMAP ||
          bindingType === HdStBinding.BINDLESS_TEXTURE_CUBEMAP) {
        this._genDefines.write(
          '#define HD_HAS_COORD_', accessor.name, ' 1\n')
      }
    }

    // Needed for patch-based position and primvar refinement
    if (geometricShader.isPrimTypeMesh() &&
        geometricShader.isPrimTypePatches()) {
      if (this._hasPTCS) {
        this._genPTCS.write(_GetOSDPatchBasisShaderSource(registry.getHgi()))
      }
      if (this._hasPTVS) {
        this._genPTVS.write(_GetOSDPatchBasisShaderSource(registry.getHgi()))
      }
    }

    // Needed for patch-based face-varying primvar refinement
    if (geometricShader.getFvarPatchType() ===
        HdSt_GeometricShaderFvarPatchType.PATCH_BSPLINE ||
        geometricShader.getFvarPatchType() ===
        HdSt_GeometricShaderFvarPatchType.PATCH_BOXSPLINETRIANGLE) {
      if (this._hasGS) {
        this._genGS.write(_GetOSDPatchBasisShaderSource(registry.getHgi()))
      } else {
        this._genFS.write(_GetOSDPatchBasisShaderSource(registry.getHgi()))
      }
    }

    // Barycentric coordinates
    if (builtinBarycentricsEnabled) {
      this._genFS.write('vec3 GetBarycentricCoord() {\n' +
        '  return hd_BaryCoordNoPersp;\n' +
        '}\n')
    } else {
      if (this._hasGS) {
        _AddInterstageElement(this._resGS,
          HioGlslfxResourceLayoutInOut.STAGE_OUT,
          /*name=*/_tokens.hd_barycentricCoord,
          /*dataType=*/_tokens.vec3,
          TfToken(),
          TfToken('noperspective'))
        _AddInterstageElement(this._resFS,
          HioGlslfxResourceLayoutInOut.STAGE_IN,
          /*name=*/_tokens.hd_barycentricCoord,
          /*dataType=*/_tokens.vec3,
          TfToken(),
          TfToken('noperspective'))

        this._genFS.write('vec3 GetBarycentricCoord() {\n' +
          '  return hd_barycentricCoord;\n' +
          '}\n')
      } else {
        this._genFS.write('vec3 GetBarycentricCoord() {\n' +
          '  return vec3(0);\n' +
          '}\n')
      }
    }

    // We plumb the evaluated position in patch from PTVS to FS since this
    // is more consistent than using built-in barycentric coords and can be
    // used even when builtin barycentric coords are not available. We pass
    // only the first two components between stages and provide an accessor
    // which can reconstruct the full three component barycentric form.
    if (this._hasPTVS) {
      _AddInterstageElement(this._resPTVS,
        HioGlslfxResourceLayoutInOut.STAGE_OUT,
        /*name=*/_tokens.hd_tessCoord,
        /*dataType=*/_tokens.vec2)
      _AddInterstageElement(this._resFS,
        HioGlslfxResourceLayoutInOut.STAGE_IN,
        /*name=*/_tokens.hd_tessCoord,
        /*dataType=*/_tokens.vec2)

      this._genFS.write('vec2 GetTessCoord() {\n' +
        '  return hd_tessCoord;\n' +
        '}\n' +
        'vec3 GetTessCoordTriangle() {\n' +
        '  return vec3(' +
        'hd_tessCoord.x, hd_tessCoord.y, ' +
        '1 - hd_tessCoord.x - hd_tessCoord.y);\n' +
        '}\n')
    }

    // PrimitiveID emulation
    if (requiresPrimitiveIdEmulation) {
      if (this._hasPTVS) {
        _AddInterstageElement(this._resPTVS,
          HioGlslfxResourceLayoutInOut.STAGE_OUT,
          /*name=*/_tokens.hd_patchID,
          /*dataType=*/_tokens._uint)
        _AddInterstageElement(this._resFS,
          HioGlslfxResourceLayoutInOut.STAGE_IN,
          /*name=*/_tokens.hd_patchID,
          /*dataType=*/_tokens._uint)
      }
    }

    // prep interstage plumbing function
    this._procVS.write('void ProcessPrimvarsIn() {\n')

    this._procTCS.write('void ProcessPrimvarsOut() {\n')
    this._procTES.write('float InterpolatePrimvar(' +
      'float inPv0, float inPv1, float inPv2, float inPv3, ' +
      'vec4 basis, vec2 uv);\n' +

      'vec2 InterpolatePrimvar(' +
      'vec2 inPv0, vec2 inPv1, vec2 inPv2, vec2 inPv3, ' +
      'vec4 basis, vec2 uv);\n' +

      'vec3 InterpolatePrimvar(' +
      'vec3 inPv0, vec3 inPv1, vec3 inPv2, vec3 inPv3, ' +
      'vec4 basis, vec2 uv);\n' +

      'vec4 InterpolatePrimvar(' +
      'vec4 inPv0, vec4 inPv1, vec4 inPv3, vec4 inPv3, ' +
      'vec4 basis, vec2 uv);\n' +

      'void ProcessPrimvarsOut(' +
      'vec4 basis, int i0, int i1, int i2, int i3, vec2 uv) {\n')

    this._procPTVSOut.write('template <typename T>\n' +
      'T InterpolatePrimvar(' +
      'T inPv0, T inPv1, T inPv2, T inPv3, vec4 basis, ' +
      'vec2 uv = vec2()) {\n' +
      '  return' +
      ' inPv0 * basis[0] +' +
      ' inPv1 * basis[1] +' +
      ' inPv2 * basis[2] +' +
      ' inPv3 * basis[3];\n' +
      '}\n' +
      'void ProcessPrimvarsOut(' +
      'vec4 basis, int i0, int i1, int i2, int i3, ' +
      'vec2 uv = vec2()) {\n')

    // geometry shader plumbing
    switch (geometricShader.getPrimitiveType()) {
      case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_COARSE_QUADS:
      case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_COARSE_TRIANGLES:
      case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_COARSE_TRIQUADS:
      case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_REFINED_QUADS:
      case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_REFINED_TRIANGLES:
      case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_REFINED_TRIQUADS:
      {
        this._procGS.write('FORWARD_DECL(vec4 GetPatchCoord(int index));\n',
          'void ProcessPrimvarsOut(int index) {\n',
          '  vec2 localST = GetPatchCoord(index).xy;\n')
        break
      }
      case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_BSPLINE:
      case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE:
      {
        this._procGS.write('void ProcessPrimvarsOut(int index, vec2 tessST) {\n',
          '  vec2 localST = tessST;\n')
        break
      }
      default: // points, basis curves
        // do nothing. no additional code needs to be generated.
        break
    }
    if (!builtinBarycentricsEnabled) {
      switch (geometricShader.getPrimitiveType()) {
        case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_COARSE_QUADS:
        case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_REFINED_QUADS:
        case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_BSPLINE:
        {
          // These correspond to built-in fragment shader barycentric
          // coords except reversed for the second triangle in the quad.
          // Each quad is split into two triangles with indices (0,1,2)
          // and (2,3,0).
          this._procGS.write('  const vec3 coords[4] = vec3[](\n',
            '   vec3(1,0,0), vec3(0,1,0), ',
            'vec3(0,0,1), vec3(0,1,0)\n',
            '  );\n',
            '  hd_barycentricCoord = coords[index];\n')
          break
        }
        case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_COARSE_TRIANGLES:
        case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_REFINED_TRIANGLES:
        case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_COARSE_TRIQUADS:
        case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_REFINED_TRIQUADS:
        case HdSt_GeometricShaderPrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE:
        {
          // These correspond to built-in fragment shader barycentric
          // coords.
          this._procGS.write('  const vec3 coords[3] = vec3[](\n',
            '   vec3(1,0,0), vec3(0,1,0), vec3(0,0,1)\n',
            '  );\n',
            '  hd_barycentricCoord = coords[index];\n')
          break
        }
        default: // points, basis curves
          // do nothing. no additional code needs to be generated.
          break
      }
    }

    if (this._hasPTVS) {
      this._procPTVSOut.write('  hd_tessCoord = gl_TessCoord.xy;\n')
    }

    if (requiresPrimitiveIdEmulation) {
      this._procPTVSOut.write('  hd_patchID = patch_id;\n')
    }

    // generate drawing coord and accessors
    this._generateDrawingCoord(shaderDrawParametersEnabled,
      requiresBasePrimitiveOffset,
      requiresPrimitiveIdEmulation)

    // generate primvars
    this._generateConstantPrimvar()
    this._generateInstancePrimvar()
    this._generateElementPrimvar()
    this._generateVertexAndFaceVaryingPrimvar()

    this._generateTopologyVisibilityParameters()

    //generate shader parameters (is going last since it has primvar redirects)
    this._generateShaderParameters(bindlessTextureEnabled)

    // finalize buckets
    this._procVS.write('}\n')
    this._procGS.write('}\n')
    this._procTCS.write('}\n')
    this._procTES.write('}\n')
    this._procPTVSOut.write('}\n')

    // insert interstage primvar plumbing procs into genVS/TCS/TES/GS
    this._genVS.write(this._procVS.str())
    this._genTCS.write(this._procTCS.str())
    this._genTES.write(this._procTES.str())
    this._genPTVS.write(this._procPTVSOut.str())
    this._genGS.write(this._procGS.str())

    // other shaders (renderPass, lighting, surface) first
    for (const shader of this._shaders) {
      if (this._hasVS) {
        this._genVS.write(shader.getSource(HdShaderTokens.vertexShader))
      }
      if (this._hasTCS) {
        this._genTCS.write(shader.getSource(HdShaderTokens.tessControlShader))
      }
      if (this._hasTES) {
        this._genTES.write(shader.getSource(HdShaderTokens.tessEvalShader))
      }
      if (this._hasPTCS) {
        this._genPTCS.write(shader.getSource(
          HdShaderTokens.postTessControlShader))
      }
      if (this._hasPTVS) {
        this._genPTVS.write(shader.getSource(HdShaderTokens.postTessVertexShader))
        this._genPTVS.write(shader.getSource(HdShaderTokens.displacementShader))
      }
      if (this._hasGS) {
        this._genGS.write(shader.getSource(HdShaderTokens.geometryShader))
        this._genGS.write(shader.getSource(HdShaderTokens.displacementShader))
      }
      if (this._hasFS) {
        this._genFS.write(shader.getSource(HdShaderTokens.fragmentShader))
      }
    }

    // We need to include OpenSubdiv shader source only when processing
    // refined meshes. For all other meshes we need only a simplified
    // method of patch coord interpolation.
    if (geometricShader.isPrimTypeRefinedMesh()) {
      // Include OpenSubdiv shader source and use full patch interpolation.
      this._osd.write(_GetOSDCommonShaderSource(registry.getHgi()))
      this._osd.write(
        'vec4 InterpolatePatchCoord(vec2 uv, ivec3 patchParam)\n' +
        '{\n' +
        '    return OsdInterpolatePatchCoord(uv, patchParam);\n' +
        '}\n' +
        'vec4 InterpolatePatchCoordTriangle(vec2 uv, ivec3 patchParam)\n' +
        '{\n' +
        '    return OsdInterpolatePatchCoordTriangle(uv, patchParam);\n' +
        '}\n')
    } else if (geometricShader.isPrimTypeMesh()) {
      // Use simplified patch interpolation since all mesh faces are level 0.
      this._osd.write(
        'vec4 InterpolatePatchCoord(vec2 uv, ivec3 patchParam)\n' +
        '{\n' +
        '    // add 0.5 to integer values for more robust interpolation\n' +
        '    return vec4(uv.x, uv.y, 0, patchParam.x+0.5f);\n' +
        '}\n' +
        'vec4 InterpolatePatchCoordTriangle(vec2 uv, ivec3 patchParam)\n' +
        '{\n' +
        '    return InterpolatePatchCoord(uv, patchParam);\n' +
        '}\n')
    }

    // geometric shader
    this._genVS.write(vertexShader)
    this._genTCS.write(tessControlShader)
    this._genTES.write(tessEvalShader)
    this._genPTCS.write(postTessControlShader)
    this._genPTVS.write(postTessVertexShader)
    this._genGS.write(geometryShader)
    this._genFS.write(fragmentShader)
    this._genCS.write(computeShader)

    // Sanity check that if you provide a control shader, you have also provided
    // an evaluation shader (and vice versa)
    if (this._hasTCS !== this._hasTES) {
      TF_CODING_ERROR(
        'tessControlShader and tessEvalShader must be provided together.')
      this._hasTCS = this._hasTES = false
    }

    if (useHgiResourceGeneration) {
      return this._compileWithGeneratedHgiResources(registry)
    } else {
      return this._compileWithGeneratedGLSLResources(registry)
    }
  }

  /** codeGen.cpp:2727-2773 */
  CompileComputeProgram(registry: HdStResourceRegistry): HdStGLSLProgram | null {
    if (!TF_VERIFY(this._metaData,
      'Metadata not properly initialized by resource binder.')) {
      return null
    }

    this._getShaderResourceLayouts(this._shaders)

    // Initialize source buckets
    this._genDefines.str(''); this._genDecl.str(''); this._genAccessors.str('')
    this._genVS.str(''); this._genTCS.str(''); this._genTES.str('')
    this._genGS.str(''); this._genFS.str(''); this._genCS.str('')
    this._genPTCS.str(''); this._genPTVS.str('')
    this._procVS.str(''); this._procTCS.str(''); this._procTES.str(''); this._procGS.str('')

    this._genDefines.write('\n// //////// Codegen Defines //////// \n')
    this._genDecl.write('\n// //////// Codegen Decl //////// \n')
    this._genAccessors.write('\n// //////// Codegen Accessors //////// \n')
    this._genVS.write('\n// //////// Codegen VS Source //////// \n')
    this._genTCS.write('\n// //////// Codegen TCS Source //////// \n')
    this._genTES.write('\n// //////// Codegen TES Source //////// \n')
    this._genGS.write('\n// //////// Codegen GS Source //////// \n')
    this._genFS.write('\n// //////// Codegen FS Source //////// \n')
    this._genCS.write('\n// //////// Codegen CS Source //////// \n')
    this._procVS.write('\n// //////// Codegen Proc VS //////// \n')
    this._procTCS.write('\n// //////// Codegen Proc TCS //////// \n')
    this._procTES.write('\n// //////// Codegen Proc TES //////// \n')
    this._procGS.write('\n// //////// Codegen Proc GS //////// \n')

    // Used in glslfx files to determine if it is using new/old
    // imaging system. It can also be used as API guards when
    // we need new versions of Storm shading.
    this._genDefines.write('#define HD_SHADER_API ', HD_SHADER_API, '\n')

    // a trick to tightly pack unaligned data (vec3, etc) into SSBO/UBO.
    this._genDefines.write(_GetPackedTypeDefinitions())

    this._hasCS = true

    return this._compileWithGeneratedHgiResources(registry)
  }

  /** codeGen.cpp:2775-2879 */
  private _generateComputeParameters(csDesc: HgiShaderFunctionDesc): void {
    const accessors = new _Stream()

    const hasComputeData =
      this._metaData.computeReadWriteData.size !== 0 ||
      this._metaData.computeReadOnlyData.size !== 0
    if (hasComputeData) {
      HgiShaderFunctionAddConstantParam(
        csDesc, 'vertexOffset', _tokens._int)
    }

    accessors.write('// Read-Write Accessors & Mutators\n')
    for (const [binding, primvar] of this._metaData.computeReadWriteData) {
      const name = primvar.name
      const dataType = primvar.dataType

      // For now, SSBO bindings use a flat type encoding.
      const declDataType =
        (binding.getType() === HdStBinding.SSBO
          ? _GetFlatType(dataType) : dataType)

      HgiShaderFunctionAddConstantParam(
        csDesc, name + 'Offset', _tokens._int)
      HgiShaderFunctionAddConstantParam(
        csDesc, name + 'Stride', _tokens._int)

      this._genDefines.write('#define HD_HAS_', name, ' 1\n')

      _EmitDeclaration(this._resCommon,
        name,
        declDataType,
        binding,
        /*isWritable=*/true)

      // getter & setter
      {
        const indexing = new _Stream()
        indexing.write('(localIndex + vertexOffset)',
          ' * ', name, 'Stride',
          ' + ', name, 'Offset')
        _EmitComputeAccessor(accessors, name, dataType, binding,
          indexing.str())
        _EmitComputeMutator(accessors, name, dataType, binding,
          indexing.str())
      }
    }
    accessors.write('// Read-Only Accessors\n')
    // no vertex offset for constant data
    for (const [binding, primvar] of this._metaData.computeReadOnlyData) {
      const name = primvar.name
      const dataType = primvar.dataType

      // For now, SSBO bindings use a flat type encoding.
      const declDataType =
        (binding.getType() === HdStBinding.SSBO
          ? _GetFlatType(dataType) : dataType)

      HgiShaderFunctionAddConstantParam(
        csDesc, name + 'Offset', _tokens._int)
      HgiShaderFunctionAddConstantParam(
        csDesc, name + 'Stride', _tokens._int)

      this._genDefines.write('#define HD_HAS_', name, ' 1\n')

      _EmitDeclaration(this._resCommon,
        name,
        declDataType,
        binding)
      // getter
      {
        const indexing = new _Stream()
        // no vertex offset for constant data
        indexing.write('(localIndex)',
          ' * ', name, 'Stride',
          ' + ', name, 'Offset')
        _EmitComputeAccessor(accessors, name, dataType, binding,
          indexing.str())
      }
    }

    this._genAccessors.write(accessors.str())

    // other shaders (renderpass, lighting, surface) first
    for (const shader of this._shaders) {
      this._genCS.write(shader.getSource(HdShaderTokens.computeShader))
    }

    // thread indexing id
    HgiShaderFunctionAddStageInput(
      csDesc, 'hd_GlobalInvocationID', 'uvec3',
      HgiShaderKeywordTokens.hdGlobalInvocationID)

    // main
    this._genCS.write('void main() {\n')
    this._genCS.write('  int computeCoordinate = int(hd_GlobalInvocationID.x);\n')
    this._genCS.write('  if (computeCoordinate >= indexEnd) {\n    return;\n  };\n')
    this._genCS.write('  compute(computeCoordinate);\n')
    this._genCS.write('}\n')
  }

  /** codeGen.cpp:2881-3094 */
  private _compileWithGeneratedGLSLResources(
    registry: HdStResourceRegistry): HdStGLSLProgram | null {
    // Generator assigns attribute and binding locations
    const resourceGen = new _ResourceGenerator()

    // create GLSL program.
    const glslProgram =
      new HdStGLSLProgram(HdTokens.drawingShader, registry)

    let shaderCompiled = false

    // compile shaders
    // note: _vsSource, _fsSource etc are used for diagnostics (see header)
    if (this._hasVS) {
      const desc = new HgiShaderFunctionDesc()
      const resDecl = new _Stream()
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.vertexShader, this._resAttrib, this._getMetaData())
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.vertexShader, this._resCommon, this._getMetaData())
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.vertexShader, this._resVS, this._getMetaData())

      const declarations =
        this._genDefines.str()
      const source =
        this._genDecl.str() + resDecl.str() +
        this._genAccessors.str() + this._genVS.str()

      desc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex
      desc.shaderCodeDeclarations = declarations
      desc.shaderCode = source
      desc.generatedShaderCodeOut = _SourceOut(
        () => this._vsSource, (v) => { this._vsSource = v })

      HgiShaderFunctionAddStageInput(
        desc, 'hd_VertexID', 'uint',
        HgiShaderKeywordTokens.hdVertexID)
      HgiShaderFunctionAddStageInput(
        desc, 'hd_InstanceID', 'uint',
        HgiShaderKeywordTokens.hdInstanceID)
      HgiShaderFunctionAddStageInput(
        desc, 'hd_BaseInstance', 'uint',
        HgiShaderKeywordTokens.hdBaseInstance)

      if (this._generateClipDistances) {
        HgiShaderFunctionAddStageOutput(
          desc, 'gl_ClipDistance', 'float',
          'clip_distance', /*arraySize*/'HD_NUM_clipPlanes')
      }

      if (!glslProgram.compileShader(desc)) {
        return null
      }
      shaderCompiled = true
    }
    if (this._hasTCS) {
      const desc = new HgiShaderFunctionDesc()
      const resDecl = new _Stream()
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.tessControlShader, this._resCommon, this._getMetaData())
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.tessControlShader, this._resTCS, this._getMetaData())

      const declarations =
        this._genDefines.str() + this._osd.str()
      const source =
        this._genDecl.str() + resDecl.str() +
        this._genAccessors.str() + this._genTCS.str()

      desc.shaderStage = HgiShaderStageBits.HgiShaderStageTessellationControl
      desc.shaderCodeDeclarations = declarations
      desc.shaderCode = source
      desc.generatedShaderCodeOut = _SourceOut(
        () => this._tcsSource, (v) => { this._tcsSource = v })

      if (!glslProgram.compileShader(desc)) {
        return null
      }
      shaderCompiled = true
    }
    if (this._hasTES) {
      const desc = new HgiShaderFunctionDesc()
      const resDecl = new _Stream()
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.tessEvalShader, this._resCommon, this._getMetaData())
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.tessEvalShader, this._resTES, this._getMetaData())

      const declarations =
        this._genDefines.str() + this._osd.str()
      const source =
        this._genDecl.str() + resDecl.str() +
        this._genAccessors.str() + this._genTES.str()

      desc.shaderStage = HgiShaderStageBits.HgiShaderStageTessellationEval
      desc.shaderCodeDeclarations = declarations
      desc.shaderCode = source
      desc.generatedShaderCodeOut = _SourceOut(
        () => this._tesSource, (v) => { this._tesSource = v })

      if (this._generateClipDistances) {
        HgiShaderFunctionAddStageOutput(
          desc, 'gl_ClipDistance', 'float',
          'clip_distance', /*arraySize*/'HD_NUM_clipPlanes')
      }

      if (!glslProgram.compileShader(desc)) {
        return null
      }
      shaderCompiled = true
    }
    if (this._hasGS) {
      const desc = new HgiShaderFunctionDesc()
      const resDecl = new _Stream()
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.geometryShader, this._resCommon, this._getMetaData())
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.geometryShader, this._resGS, this._getMetaData())

      // material in GS
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.geometryShader, this._resMaterial, this._getMetaData())
      resourceGen._generateGLSLTextureResources(resDecl,
        HdShaderTokens.geometryShader, this._resTextures, this._getMetaData())

      const declarations =
        this._genDefines.str() + this._osd.str()
      const source =
        this._genDecl.str() + resDecl.str() +
        this._genAccessors.str() + this._genGS.str()

      desc.shaderStage = HgiShaderStageBits.HgiShaderStageGeometry
      desc.shaderCodeDeclarations = declarations
      desc.shaderCode = source
      desc.generatedShaderCodeOut = _SourceOut(
        () => this._gsSource, (v) => { this._gsSource = v })

      if (this._generateClipDistances) {
        HgiShaderFunctionAddStageOutput(
          desc, 'gl_ClipDistance', 'float',
          'clip_distance', /*arraySize*/'HD_NUM_clipPlanes')
      }

      if (!glslProgram.compileShader(desc)) {
        return null
      }
      shaderCompiled = true
    }
    if (this._hasFS) {
      const desc = new HgiShaderFunctionDesc()
      const resDecl = new _Stream()
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.fragmentShader, this._resCommon, this._getMetaData())
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.fragmentShader, this._resFS, this._getMetaData())

      // material in FS
      resourceGen._generateGLSLResources(desc, resDecl,
        HdShaderTokens.fragmentShader, this._resMaterial, this._getMetaData())
      resourceGen._generateGLSLTextureResources(resDecl,
        HdShaderTokens.fragmentShader, this._resTextures, this._getMetaData())

      if (desc.fragmentDescriptor.earlyFragmentTests) {
        this._genDefines.write('#define HD_EARLY_FRAGMENT_TESTS 1\n')
      }

      const source =
        this._genDefines.str() + this._genDecl.str() + resDecl.str() + this._osd.str() +
        this._genAccessors.str() + this._genFS.str()

      desc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment
      desc.shaderCode = source
      desc.generatedShaderCodeOut = _SourceOut(
        () => this._fsSource, (v) => { this._fsSource = v })

      const builtinBarycentricsEnabled =
        registry.getHgi().getCapabilities()!.isSet(
          HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBuiltinBarycentrics)
      if (builtinBarycentricsEnabled) {
        HgiShaderFunctionAddStageInput(
          desc, 'hd_BaryCoordNoPersp', 'vec3',
          HgiShaderKeywordTokens.hdBaryCoordNoPersp)
      }

      if (this._geometricShader!.getPrimitiveType() ===
          HdSt_GeometricShaderPrimitiveType.PRIM_POINTS) {
        HgiShaderFunctionAddStageInput(desc, 'hd_SampleMaskIn', 'uint',
          HgiShaderKeywordTokens.hdSampleMaskIn)
        if (!registry.getHgi().getCapabilities()!.isSet(
          HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsRoundPoints)) {
          HgiShaderFunctionAddStageInput(desc, 'gl_PointCoord', 'vec2',
            HgiShaderKeywordTokens.hdPointCoord)
          HgiShaderFunctionAddStageOutput(desc, 'hd_SampleMask',
            'uint', HgiShaderKeywordTokens.hdSampleMask)
        }
      }

      const depthQualifier = this._geometricShader!.getDepthQualifier()
      if (depthQualifier.length !== 0) {
        HgiShaderFunctionAddStageOutput(desc,
          'gl_FragDepth',
          'float', depthQualifier)
      }

      if (!glslProgram.compileShader(desc)) {
        return null
      }
      shaderCompiled = true
    }

    if (!shaderCompiled) {
      return null
    }

    return glslProgram
  }

  /** codeGen.cpp:3096-3560 */
  private _compileWithGeneratedHgiResources(
    registry: HdStResourceRegistry): HdStGLSLProgram | null {
    // Generator assigns attribute and binding locations
    const resourceGen = new _ResourceGenerator()

    // create GLSL program.
    const glslProgram =
      new HdStGLSLProgram(HdTokens.drawingShader, registry)

    let shaderCompiled = false

    if (this._hasVS) {
      const vsDesc = new HgiShaderFunctionDesc()
      vsDesc.shaderStage = HgiShaderStageBits.HgiShaderStageVertex

      resourceGen._advanceShaderStage()
      resourceGen._generateHgiResources(registry.getHgi(), vsDesc,
        HdShaderTokens.vertexShader, this._resAttrib, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), vsDesc,
        HdShaderTokens.vertexShader, this._resCommon, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), vsDesc,
        HdShaderTokens.vertexShader, this._resVS, this._getMetaData())

      const declarations = this._genDefines.str() + this._genDecl.str()
      const source = this._genAccessors.str() + this._genVS.str()

      vsDesc.shaderCodeDeclarations = declarations
      vsDesc.shaderCode = source
      vsDesc.generatedShaderCodeOut = _SourceOut(
        () => this._vsSource, (v) => { this._vsSource = v })

      // builtins

      HgiShaderFunctionAddStageInput(
        vsDesc, 'hd_VertexID', 'uint',
        HgiShaderKeywordTokens.hdVertexID)
      HgiShaderFunctionAddStageInput(
        vsDesc, 'hd_InstanceID', 'uint',
        HgiShaderKeywordTokens.hdInstanceID)
      HgiShaderFunctionAddStageInput(
        vsDesc, 'hd_BaseInstance', 'uint',
        HgiShaderKeywordTokens.hdBaseInstance)
      HgiShaderFunctionAddStageInput(
        vsDesc, 'gl_BaseVertex', 'uint',
        HgiShaderKeywordTokens.hdBaseVertex)

      if (!this._geometricShader!.isFrustumCullingPass()) {
        HgiShaderFunctionAddStageOutput(
          vsDesc, 'gl_Position', 'vec4', 'position')

        // For Metal, only set the role for the point size
        // if the primitive is a point list.
        const pointRole =
          (this._geometricShader!.getPrimitiveType() ===
            HdSt_GeometricShaderPrimitiveType.PRIM_POINTS)
            ? 'point_size' : ''
        HgiShaderFunctionAddStageOutput(
          vsDesc, 'gl_PointSize', 'float', pointRole)
      }

      if (this._generateClipDistances) {
        HgiShaderFunctionAddStageOutput(
          vsDesc, 'gl_ClipDistance', 'float',
          'clip_distance', /*arraySize*/'HD_NUM_clipPlanes')
      }

      if (!glslProgram.compileShader(vsDesc)) {
        return null
      }

      shaderCompiled = true
    }

    if (this._hasTCS) {
      const tcsDesc = new HgiShaderFunctionDesc()
      tcsDesc.shaderStage = HgiShaderStageBits.HgiShaderStageTessellationControl

      resourceGen._advanceShaderStage()
      resourceGen._generateHgiResources(registry.getHgi(), tcsDesc,
        HdShaderTokens.tessControlShader, this._resCommon, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), tcsDesc,
        HdShaderTokens.tessControlShader, this._resTCS, this._getMetaData())

      const declarations =
        this._genDefines.str() + this._genDecl.str() + this._osd.str()
      const source = this._genAccessors.str() + this._genTCS.str()

      tcsDesc.shaderCodeDeclarations = declarations
      tcsDesc.shaderCode = source
      tcsDesc.generatedShaderCodeOut = _SourceOut(
        () => this._tcsSource, (v) => { this._tcsSource = v })

      if (!glslProgram.compileShader(tcsDesc)) {
        return null
      }

      shaderCompiled = true
    }

    if (this._hasTES) {
      const tesDesc = new HgiShaderFunctionDesc()
      tesDesc.shaderStage = HgiShaderStageBits.HgiShaderStageTessellationEval

      resourceGen._advanceShaderStage()
      resourceGen._generateHgiResources(registry.getHgi(), tesDesc,
        HdShaderTokens.tessEvalShader, this._resCommon, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), tesDesc,
        HdShaderTokens.tessEvalShader, this._resTES, this._getMetaData())

      const declarations =
        this._genDefines.str() + this._genDecl.str() + this._osd.str()
      const source = this._genAccessors.str() + this._genTES.str()

      tesDesc.shaderCodeDeclarations = declarations
      tesDesc.shaderCode = source
      tesDesc.generatedShaderCodeOut = _SourceOut(
        () => this._tesSource, (v) => { this._tesSource = v })

      if (this._generateClipDistances) {
        HgiShaderFunctionAddStageOutput(
          tesDesc, 'gl_ClipDistance', 'float',
          'clip_distance', /*arraySize*/'HD_NUM_clipPlanes')
      }

      if (!glslProgram.compileShader(tesDesc)) {
        return null
      }

      shaderCompiled = true
    }

    if (this._hasPTCS) {
      const geometricShader = this._geometricShader!
      const ptcsDesc = new HgiShaderFunctionDesc()
      ptcsDesc.shaderStage = HgiShaderStageBits.HgiShaderStagePostTessellationControl

      if (this._metaData.tessFactorsBinding.binding.isValid()) {
        const binding = this._metaData.tessFactorsBinding.binding
        _EmitDeclaration(this._resPTCS,
          this._metaData.tessFactorsBinding.name,
          this._metaData.tessFactorsBinding.dataType,
          binding,
          true)
      }

      ptcsDesc.tessellationDescriptor.numVertsPerPatchIn =
        String(geometricShader.getPrimitiveIndexSize())
      ptcsDesc.tessellationDescriptor.numVertsPerPatchOut =
        String(geometricShader.getNumPatchEvalVerts())

      ptcsDesc.tessellationDescriptor.patchType =
        (geometricShader.isPrimTypeTriangles() ||
          geometricShader.getPrimitiveType() ===
            HdSt_GeometricShaderPrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE)
          ? HgiShaderFunctionTessellationDescPatchType.Triangles
          : HgiShaderFunctionTessellationDescPatchType.Quads
      if (geometricShader.getHgiPrimitiveType() ===
          HgiPrimitiveType.HgiPrimitiveTypePointList) {
        ptcsDesc.tessellationDescriptor.patchType =
          HgiShaderFunctionTessellationDescPatchType.Isolines
      }

      resourceGen._advanceShaderStage()
      resourceGen._generateHgiResources(registry.getHgi(), ptcsDesc,
        HdShaderTokens.postTessControlShader, this._resAttrib, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), ptcsDesc,
        HdShaderTokens.postTessControlShader, this._resCommon, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), ptcsDesc,
        HdShaderTokens.postTessControlShader, this._resPTCS, this._getMetaData())

      // material in PTCS
      resourceGen._generateHgiResources(registry.getHgi(), ptcsDesc,
        HdShaderTokens.postTessControlShader, this._resMaterial, this._getMetaData())
      resourceGen._generateHgiTextureResources(ptcsDesc,
        HdShaderTokens.postTessControlShader, this._resTextures, this._getMetaData())

      const declarations =
        this._genDefines.str() + this._genDecl.str() + this._osd.str()
      const source = this._genAccessors.str() + this._genPTCS.str()

      ptcsDesc.shaderCodeDeclarations = declarations
      ptcsDesc.shaderCode = source
      ptcsDesc.generatedShaderCodeOut = _SourceOut(
        () => this._ptcsSource, (v) => { this._ptcsSource = v })

      // builtins

      HgiShaderFunctionAddStageInput(
        ptcsDesc, 'hd_BaseInstance', 'uint',
        HgiShaderKeywordTokens.hdBaseInstance)
      HgiShaderFunctionAddStageInput(
        ptcsDesc, 'patch_id', 'uint',
        HgiShaderKeywordTokens.hdPatchID)

      const tessCoordType =
        (geometricShader.isPrimTypeTriangles() ||
          geometricShader.getPrimitiveType() ===
            HdSt_GeometricShaderPrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE)
          ? 'vec3' : 'vec2'

      HgiShaderFunctionAddStageInput(
        ptcsDesc, 'gl_TessCoord', tessCoordType,
        HgiShaderKeywordTokens.hdPositionInPatch)

      HgiShaderFunctionAddStageInput(
        ptcsDesc, 'hd_InstanceID', 'uint',
        HgiShaderKeywordTokens.hdInstanceID)

      HgiShaderFunctionAddStageOutput(
        ptcsDesc, 'gl_Position', 'vec4',
        'position')

      const pointRole =
        (geometricShader.getPrimitiveType() ===
          HdSt_GeometricShaderPrimitiveType.PRIM_POINTS)
          ? 'point_size' : ''

      HgiShaderFunctionAddStageOutput(
        ptcsDesc, 'gl_PointSize', 'float',
        pointRole)

      if (!glslProgram.compileShader(ptcsDesc)) {
        return null
      }

      shaderCompiled = true
    }

    if (this._hasPTVS) {
      const geometricShader = this._geometricShader!
      const ptvsDesc = new HgiShaderFunctionDesc()
      ptvsDesc.shaderStage = HgiShaderStageBits.HgiShaderStagePostTessellationVertex

      ptvsDesc.tessellationDescriptor.numVertsPerPatchIn =
        String(geometricShader.getPrimitiveIndexSize())
      ptvsDesc.tessellationDescriptor.numVertsPerPatchOut =
        String(geometricShader.getNumPatchEvalVerts())

      //Set the patchtype to later decide tessfactor types
      ptvsDesc.tessellationDescriptor.patchType =
        (geometricShader.isPrimTypeTriangles() ||
          geometricShader.getPrimitiveType() ===
            HdSt_GeometricShaderPrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE)
          ? HgiShaderFunctionTessellationDescPatchType.Triangles
          : HgiShaderFunctionTessellationDescPatchType.Quads
      if (geometricShader.getHgiPrimitiveType() ===
          HgiPrimitiveType.HgiPrimitiveTypePointList) {
        ptvsDesc.tessellationDescriptor.patchType =
          HgiShaderFunctionTessellationDescPatchType.Isolines
      }

      resourceGen._advanceShaderStage()
      resourceGen._generateHgiResources(registry.getHgi(), ptvsDesc,
        HdShaderTokens.postTessVertexShader, this._resAttrib, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), ptvsDesc,
        HdShaderTokens.postTessVertexShader, this._resCommon, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), ptvsDesc,
        HdShaderTokens.postTessVertexShader, this._resPTVS, this._getMetaData())

      // material in PTVS
      resourceGen._generateHgiResources(registry.getHgi(), ptvsDesc,
        HdShaderTokens.postTessVertexShader, this._resMaterial, this._getMetaData())
      resourceGen._generateHgiTextureResources(ptvsDesc,
        HdShaderTokens.postTessVertexShader, this._resTextures, this._getMetaData())

      const declarations =
        this._genDefines.str() + this._genDecl.str() + this._osd.str()
      const source = this._genAccessors.str() + this._genPTVS.str()

      ptvsDesc.shaderCodeDeclarations = declarations
      ptvsDesc.shaderCode = source
      ptvsDesc.generatedShaderCodeOut = _SourceOut(
        () => this._ptvsSource, (v) => { this._ptvsSource = v })

      // builtins

      HgiShaderFunctionAddStageInput(
        ptvsDesc, 'hd_BaseInstance', 'uint',
        HgiShaderKeywordTokens.hdBaseInstance)
      HgiShaderFunctionAddStageInput(
        ptvsDesc, 'patch_id', 'uint',
        HgiShaderKeywordTokens.hdPatchID)

      const tessCoordType =
        (geometricShader.isPrimTypeTriangles() ||
          geometricShader.getPrimitiveType() ===
            HdSt_GeometricShaderPrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE)
          ? 'vec3' : 'vec2'

      HgiShaderFunctionAddStageInput(
        ptvsDesc, 'gl_TessCoord', tessCoordType,
        HgiShaderKeywordTokens.hdPositionInPatch)

      HgiShaderFunctionAddStageInput(
        ptvsDesc, 'hd_InstanceID', 'uint',
        HgiShaderKeywordTokens.hdInstanceID)

      HgiShaderFunctionAddStageOutput(
        ptvsDesc, 'gl_Position', 'vec4',
        'position')

      const pointRole =
        (geometricShader.getPrimitiveType() ===
          HdSt_GeometricShaderPrimitiveType.PRIM_POINTS)
          ? 'point_size' : ''

      HgiShaderFunctionAddStageOutput(
        ptvsDesc, 'gl_PointSize', 'float',
        pointRole)

      if (this._generateClipDistances) {
        HgiShaderFunctionAddStageOutput(
          ptvsDesc, 'gl_ClipDistance', 'float',
          'clip_distance', /*arraySize*/'HD_NUM_clipPlanes')
      }

      if (!glslProgram.compileShader(ptvsDesc)) {
        return null
      }

      shaderCompiled = true
    }

    if (this._hasGS) {
      const gsDesc = new HgiShaderFunctionDesc()
      gsDesc.shaderStage = HgiShaderStageBits.HgiShaderStageGeometry

      resourceGen._advanceShaderStage()
      resourceGen._generateHgiResources(registry.getHgi(), gsDesc,
        HdShaderTokens.geometryShader, this._resCommon, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), gsDesc,
        HdShaderTokens.geometryShader, this._resGS, this._getMetaData())

      // material in GS
      resourceGen._generateHgiResources(registry.getHgi(), gsDesc,
        HdShaderTokens.geometryShader, this._resMaterial, this._getMetaData())
      resourceGen._generateHgiTextureResources(gsDesc,
        HdShaderTokens.geometryShader, this._resTextures, this._getMetaData())

      const declarations = this._genDefines.str() + this._genDecl.str() +
        this._osd.str()
      const source = this._genAccessors.str() + this._genGS.str()

      gsDesc.shaderCodeDeclarations = declarations
      gsDesc.shaderCode = source
      gsDesc.generatedShaderCodeOut = _SourceOut(
        () => this._gsSource, (v) => { this._gsSource = v })

      if (this._generateClipDistances) {
        HgiShaderFunctionAddStageOutput(
          gsDesc, 'gl_ClipDistance', 'float',
          'clip_distance', /*arraySize*/'HD_NUM_clipPlanes')
      }

      if (!glslProgram.compileShader(gsDesc)) {
        return null
      }

      shaderCompiled = true
    }

    if (this._hasFS) {
      const fsDesc = new HgiShaderFunctionDesc()
      fsDesc.shaderStage = HgiShaderStageBits.HgiShaderStageFragment

      resourceGen._advanceShaderStage()
      resourceGen._generateHgiResources(registry.getHgi(), fsDesc,
        HdShaderTokens.fragmentShader, this._resCommon, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), fsDesc,
        HdShaderTokens.fragmentShader, this._resFS, this._getMetaData())

      // material in FS
      resourceGen._generateHgiResources(registry.getHgi(), fsDesc,
        HdShaderTokens.fragmentShader, this._resMaterial, this._getMetaData())
      resourceGen._generateHgiTextureResources(fsDesc,
        HdShaderTokens.fragmentShader, this._resTextures, this._getMetaData())

      if (fsDesc.fragmentDescriptor.earlyFragmentTests) {
        this._genDefines.write('#define HD_EARLY_FRAGMENT_TESTS 1\n')
      }

      const declarations =
        this._genDefines.str() + this._genDecl.str() + this._osd.str()
      const source = this._genAccessors.str() + this._genFS.str()

      fsDesc.shaderCodeDeclarations = declarations
      fsDesc.shaderCode = source
      fsDesc.generatedShaderCodeOut = _SourceOut(
        () => this._fsSource, (v) => { this._fsSource = v })

      // builtins
      HgiShaderFunctionAddStageInput(
        fsDesc, 'gl_PrimitiveID', 'uint',
        HgiShaderKeywordTokens.hdPrimitiveID)
      HgiShaderFunctionAddStageInput(
        fsDesc, 'gl_FrontFacing', 'bool',
        HgiShaderKeywordTokens.hdFrontFacing)
      HgiShaderFunctionAddStageInput(
        fsDesc, 'gl_FragCoord', 'vec4',
        HgiShaderKeywordTokens.hdFragCoord)
      const builtinBarycentricsEnabled =
        registry.getHgi().getCapabilities()!.isSet(
          HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBuiltinBarycentrics)
      if (builtinBarycentricsEnabled) {
        HgiShaderFunctionAddStageInput(
          fsDesc, 'hd_BaryCoordNoPersp', 'vec3',
          HgiShaderKeywordTokens.hdBaryCoordNoPersp)
      }

      if (this._geometricShader!.getPrimitiveType() ===
          HdSt_GeometricShaderPrimitiveType.PRIM_POINTS) {
        HgiShaderFunctionAddStageInput(fsDesc, 'hd_SampleMaskIn', 'uint',
          HgiShaderKeywordTokens.hdSampleMaskIn)
        if (!registry.getHgi().getCapabilities()!.isSet(
          HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsRoundPoints)) {
          HgiShaderFunctionAddStageInput(fsDesc, 'gl_PointCoord', 'vec2',
            HgiShaderKeywordTokens.hdPointCoord)
          HgiShaderFunctionAddStageOutput(fsDesc, 'hd_SampleMask',
            'uint', HgiShaderKeywordTokens.hdSampleMask)
        }
      }

      const depthQualifier = this._geometricShader!.getDepthQualifier()
      if (depthQualifier.length !== 0) {
        HgiShaderFunctionAddStageOutput(fsDesc,
          'gl_FragDepth',
          'float', depthQualifier)
      }

      if (!glslProgram.compileShader(fsDesc)) {
        return null
      }

      shaderCompiled = true
    }

    if (this._hasCS) {
      const csDesc = new HgiShaderFunctionDesc()
      csDesc.shaderStage = HgiShaderStageBits.HgiShaderStageCompute
      csDesc.computeDescriptor.localSize = new GfVec3i(64, 1, 1)

      this._generateComputeParameters(csDesc)

      resourceGen._advanceShaderStage()
      resourceGen._generateHgiResources(registry.getHgi(), csDesc,
        HdShaderTokens.computeShader, this._resAttrib, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), csDesc,
        HdShaderTokens.computeShader, this._resCommon, this._getMetaData())
      resourceGen._generateHgiResources(registry.getHgi(), csDesc,
        HdShaderTokens.computeShader, this._resCS, this._getMetaData())

      HgiShaderFunctionAddConstantParam(csDesc, 'indexEnd', _tokens._uint)

      const declarations = this._genDefines.str() + this._genDecl.str()
      const source = this._genAccessors.str() + this._genCS.str()

      csDesc.shaderCodeDeclarations = declarations
      csDesc.shaderCode = source
      csDesc.generatedShaderCodeOut = _SourceOut(
        () => this._csSource, (v) => { this._csSource = v })

      if (!glslProgram.compileShader(csDesc)) {
        return null
      }

      shaderCompiled = true
    }

    if (!shaderCompiled) {
      return null
    }

    return glslProgram
  }

  /** codeGen.cpp:4728-4741 */
  private _getDrawingCoordMapping(name: string): _PackedResourceMapping {
    // Given a drawing coord un-prefixed name, return a mapping to
    // a component in a vector of packed interstage drawing coords.
    const iter = this._resInterstagePackedMappings.get('dc_' + name)
    if (iter !== undefined) {
      return iter
    }

    return { groupName: TfToken(name), component: TfToken() }
  }

  /** codeGen.cpp:4743-4778 */
  private _getDrawingCoord(
    ss: _Stream,
    drawingCoordParams: readonly string[],
    instanceIndexWidth: number,
    inputPrefix: string,
    inArraySize: string): void {
    ss.write('hd_drawingCoord GetDrawingCoord() { \n',
      '  hd_drawingCoord dc; \n')

    for (const param of drawingCoordParams) {
      const { groupName, component } = this._getDrawingCoordMapping(param)

      ss.write('  dc.', param,
        ' = ', inputPrefix, groupName, inArraySize, component,
        ';\n')
    }
    for (let i = 0; i < instanceIndexWidth; ++i) {
      const { groupName, component } = this._getDrawingCoordMapping(
        'instanceIndexI' + String(i))
      ss.write('  dc.instanceIndex[', i, ']',
        ' = ', inputPrefix, groupName, inArraySize, component,
        ';\n')
    }
    for (let i = 0; i < instanceIndexWidth - 1; ++i) {
      const { groupName, component } = this._getDrawingCoordMapping(
        'instanceCoordsI' + String(i))
      ss.write('  dc.instanceCoords[', i, ']',
        ' = ', inputPrefix, groupName, inArraySize, component,
        ';\n')
    }

    ss.write('  return dc; \n',
      '}\n')
  }

  /** codeGen.cpp:4780-4806 */
  private _processDrawingCoord(
    ss: _Stream,
    drawingCoordParams: readonly string[],
    instanceIndexWidth: number,
    outputPrefix: string,
    outArraySize: string): void {
    ss.write('  hd_drawingCoord dc = GetDrawingCoord();\n')
    for (const param of drawingCoordParams) {
      const { groupName, component } = this._getDrawingCoordMapping(param)
      ss.write('  ', outputPrefix, groupName, outArraySize, component,
        ' = ', 'dc.', param, ';\n')
    }
    for (let i = 0; i < instanceIndexWidth; ++i) {
      const { groupName, component } = this._getDrawingCoordMapping(
        'instanceIndexI' + String(i))
      ss.write('  ', outputPrefix, groupName, outArraySize, component,
        ' = ', 'dc.instanceIndex[', i, ']', ';\n')
    }
    for (let i = 0; i < instanceIndexWidth - 1; ++i) {
      const { groupName, component } = this._getDrawingCoordMapping(
        'instanceCoordsI' + String(i))
      ss.write('  ', outputPrefix, groupName, outArraySize, component,
        ' = ', 'dc.instanceCoords[', i, ']', ';\n')
    }
  }

  /** codeGen.cpp:4808-5400 */
  private _generateDrawingCoord(
    shaderDrawParametersEnabled: boolean,
    requiresBasePrimitiveOffset: boolean,
    requiresPrimitiveIdEmulation: boolean): void {
    TF_VERIFY(this._metaData.drawingCoord0Binding.binding.isValid())
    TF_VERIFY(this._metaData.drawingCoord1Binding.binding.isValid())
    TF_VERIFY(this._metaData.drawingCoord2Binding.binding.isValid())

    /*
       hd_drawingCoord is a struct of integer offsets to locate the primvars
       in buffer arrays at the current rendering location.

       struct hd_drawingCoord {
           int modelCoord;             // (reserved) model parameters
           int constantCoord;          // constant primvars (per object)
           int vertexCoord;            // vertex primvars   (per vertex)
           int elementCoord;           // element primvars  (per face/curve)
           int primitiveCoord;         // primitive ids     (per tri/quad/line)
           int fvarCoord;              // fvar primvars     (per face-vertex)
           int shaderCoord;            // shader parameters (per shader/object)
           int topologyVisibilityCoord // topological visibility data (per face/point)
           int varyingCoord;           // varying primvars  (per vertex)
           int instanceIndex[];        // (see below)
           int instanceCoords[];       // (see below)
       };

          instanceIndex[0]  : global instance ID (used for ID rendering)
                       [1]  : instance index for level = 0
                       [2]  : instance index for level = 1
                       ...
          instanceCoords[0] : instanceDC for level = 0
          instanceCoords[1] : instanceDC for level = 1
                       ...

       We also have a drawingcoord for vertex primvars. Currently it's not
       being passed into shader since the vertex shader takes pre-offsetted
       vertex arrays and no needs to apply offset in shader (except gregory
       patch drawing etc. In that case gl_BaseVertexARB can be used under
       GL_ARB_shader_draw_parameters extention)

       gl_InstanceID is available only in vertex shader, so codegen
       takes care of applying an offset for each instance for the later
       stage. On the other hand, gl_PrimitiveID is available in all stages
       except vertex shader, and since tess/geometry shaders may or may not
       exist, we don't apply an offset of primitiveID during interstage
       plumbing to avoid overlap. Instead, GetDrawingCoord() applies
       primitiveID if necessary.

       XXX:
       Ideally we should use an interface block like:

         in DrawingCoord {
             flat hd_drawingCoord drawingCoord;
         } inDrawingCoord;
         out DrawingCoord {
             flat hd_drawingCoord drawingCoord;
         } outDrawingCoord;

      then the fragment shader can take the same input regardless the
      existence of tess/geometry shaders. However it seems the current
      driver (331.79) doesn't handle multiple interface blocks
      appropriately, it fails matching and ends up undefined results at
      consuming shader.

      > OpenGL 4.4 Core profile
      > 7.4.1 Shader Interface Matching
      >
      > When multiple shader stages are active, the outputs of one stage form
      > an interface with the inputs of the next stage. At each such
      > interface, shader inputs are matched up against outputs from the
      > previous stage:
      >
      > An output block is considered to match an input block in the
      > subsequent shader if the two blocks have the same block name, and
      > the members of the block match exactly in name, type, qualification,
      > and declaration order.
      >
      > An output variable is considered to match an input variable in the
      > subsequent shader if:
      >  - the two variables match in name, type, and qualification; or
      >  - the two variables are declared with the same location and
      >     component layout qualifiers and match in type and qualification.

      We use non-block variable for drawingCoord as a workaround of this
      problem for now. There is a caveat we can't use the same name for input
      and output, the subsequent shader has to be aware which stage writes
      the drawingCoord.

      for example:
        drawingCoord--(VS)--vsDrawingCoord--(GS)--gsDrawingCoord--(FS)
        drawingCoord--(VS)------------------------vsDrawingCoord--(FS)

      Fortunately the compiler is smart enough to optimize out unused
      attributes. If the VS writes the same value into two attributes:

        drawingCoord--(VS)--vsDrawingCoord--(GS)--gsDrawingCoord--(FS)
                      (VS)--gsDrawingCoord--------gsDrawingCoord--(FS)

      The fragment shader can always take gsDrawingCoord. The following code
      does such a plumbing work.

     */

    const drawingCoordParams = _drawingCoordParams

    const instanceIndexWidth = this._metaData.instancerNumLevels + 1

    if (!this._hasCS) {
      for (const param of drawingCoordParams) {
        const drawingCoordParamName = TfToken('dc_' + param)
        _AddInterstageElement(this._resInterstage,
          HioGlslfxResourceLayoutInOut.NONE,
          /*name=*/drawingCoordParamName,
          /*dataType=*/_tokens._int)
      }
      for (let i = 0; i < instanceIndexWidth; ++i) {
        const name = TfToken(`dc_instanceIndexI${i}`)
        _AddInterstageElement(this._resInterstage,
          HioGlslfxResourceLayoutInOut.NONE,
          /*name=*/name,
          /*dataType=*/_tokens._int)
      }
      for (let i = 0; i < instanceIndexWidth; ++i) {
        const name = TfToken(`dc_instanceCoordsI${i}`)
        _AddInterstageElement(this._resInterstage,
          HioGlslfxResourceLayoutInOut.NONE,
          /*name=*/name,
          /*dataType=*/_tokens._int)
      }

      this._plumbInterstageElements()
    }

    // common
    //
    // note: instanceCoords should be [HD_INSTANCER_NUM_LEVELS], but since
    //       GLSL doesn't allow [0] declaration, we use +1 value (WIDTH)
    //       for the sake of simplicity.
    this._genDecl.write('struct hd_drawingCoord {                       \n')
    for (const param of drawingCoordParams) {
      this._genDecl.write('  int ', param, ';\n')
    }
    this._genDecl.write('  int instanceIndex[HD_INSTANCE_INDEX_WIDTH];\n')
    this._genDecl.write('  int instanceCoords[HD_INSTANCE_INDEX_WIDTH];\n')
    this._genDecl.write('};\n')

    // forward declaration
    this._genDecl.write('FORWARD_DECL(hd_drawingCoord GetDrawingCoord());\n' +
                        'FORWARD_DECL(int HgiGetBaseVertex());\n')

    // vertex shader

    // [immediate]
    //   layout (location=x) uniform ivec4 drawingCoord0;
    //   layout (location=y) uniform ivec4 drawingCoord1;
    //   layout (location=z) uniform int   drawingCoordI[N];
    // [indirect]
    //   layout (location=x) in ivec4 drawingCoord0
    //   layout (location=y) in ivec4 drawingCoord1
    //   layout (location=z) in ivec2 drawingCoord2
    //   layout (location=w) in int   drawingCoordI[N]
    if (!this._hasCS) {
      _EmitDeclaration(this._resAttrib, this._metaData.drawingCoord0Binding)
      _EmitDeclaration(this._resAttrib, this._metaData.drawingCoord1Binding)
      _EmitDeclaration(this._resAttrib, this._metaData.drawingCoord2Binding)

      if (this._metaData.drawingCoordIBinding.binding.isValid()) {
        _EmitDeclaration(this._resAttrib, this._metaData.drawingCoordIBinding,
          /*arraySize=*/Math.max(1, this._metaData.instancerNumLevels))
      }
    }

    const primitiveID = new _Stream()

    if (this._hasPTVS) {
      // A driver bug that emits the wrong primitive ID based on the first
      // patch instance offset exists on Apple Silicon. Use primitiveCoord
      // subtracted from the primitive ID for those cases
      if (requiresBasePrimitiveOffset) {
        const { groupName, component } =
          this._getDrawingCoordMapping('primitiveCoord')
        primitiveID.write('int GetBasePrimitiveOffset() { return vs_',
          groupName, component, '; }\n')
        this._genPTCS.write('int GetBasePrimitiveOffset() { return drawingCoord0[0].w; }\n')
        this._genPTVS.write('int GetBasePrimitiveOffset() { return drawingCoord0[0].w; }\n')
      } else {
        primitiveID.write('int GetBasePrimitiveOffset() { return 0; }\n')
        this._genPTCS.write('int GetBasePrimitiveOffset() { return 0; }\n')
        this._genPTVS.write('int GetBasePrimitiveOffset() { return 0; }\n')
      }
      // A driver bug causes primitive_id in FS to be incorrect when PTVS
      // is active. As a workaround we plumb patch_id from PTVS to FS.
      if (requiresPrimitiveIdEmulation) {
        primitiveID.write('int GetBasePrimitiveId() { return hd_patchID; }\n')
      } else {
        primitiveID.write('int GetBasePrimitiveId() { return gl_PrimitiveID; }\n')
      }
      if (HdSt_GeometricShader.isPrimTypeTriQuads(this._geometricShader!.getPrimitiveType())) {
        primitiveID.write('int GetPrimitiveID() {\n',
          '  return (GetBasePrimitiveId() - GetBasePrimitiveOffset());\n',
          '}\n',
          'int GetTriQuadID() {\n',
          '  return (GetBasePrimitiveId() - GetBasePrimitiveOffset()) & 1;\n',
          '}\n')
        this._genPTCS.write('int GetPrimitiveID() {\n',
          '  return (patch_id - GetBasePrimitiveOffset()) / 2;\n',
          '}\n',
          'int GetTriQuadID() {\n',
          '  return (patch_id - GetBasePrimitiveOffset()) & 1;\n',
          '}\n')
        this._genPTVS.write('int GetPrimitiveID() {\n',
          '  return (patch_id - GetBasePrimitiveOffset()) / 2;\n',
          '}\n',
          'int GetTriQuadID() {\n',
          '  return (patch_id - GetBasePrimitiveOffset()) & 1;\n',
          '}\n')
      } else {
        primitiveID.write('int GetPrimitiveID() {\n',
          '  return (GetBasePrimitiveId() - GetBasePrimitiveOffset());\n',
          '}\n')
        this._genPTCS.write('int GetPrimitiveID() {\n',
          '  return (patch_id - GetBasePrimitiveOffset());\n',
          '}\n')
        this._genPTVS.write('int GetPrimitiveID() {\n',
          '  return (patch_id - GetBasePrimitiveOffset());\n',
          '}\n')
      }
    } else {
      if (HdSt_GeometricShader.isPrimTypeTriQuads(
        this._geometricShader!.getPrimitiveType())) {
        primitiveID.write('int GetPrimitiveID() {\n',
          '  return gl_PrimitiveID / 2;\n',
          '}\n',
          'int GetTriQuadID() {\n',
          '  return gl_PrimitiveID & 1;\n',
          '}\n')
      } else {
        primitiveID.write('int GetPrimitiveID() {\n',
          '  return gl_PrimitiveID;\n',
          '}\n')
      }
    }

    this._genTCS.write(primitiveID.str())
    this._genTES.write(primitiveID.str())
    this._genGS.write(primitiveID.str())
    this._genFS.write(primitiveID.str())

    // To access per-primitive data we need the primitiveCoord offset
    // to the start of primitive data for the current draw added to
    // the PrimitiveID offset to current primitive within the draw.
    // We don't generate this accessor for VS since VS does not
    // support PrimitiveID.
    const primitiveIndex =
      'int GetPrimitiveIndex() {\n' +
      '  return GetDrawingCoord().primitiveCoord + GetPrimitiveID();\n' +
      '}\n'

    // For PTCS/PTVS we index by patch_id when using GS emulation.
    const primitiveIndexFromPatchID =
      'int GetPrimitiveIndex() {\n' +
      '  return GetDrawingCoord().primitiveCoord + patch_id;\n' +
      '}\n'

    if (!this._geometricShader!.isPrimTypePatches()) {
      this._genPTCS.write(primitiveIndexFromPatchID)
      this._genPTVS.write(primitiveIndexFromPatchID)
    } else {
      this._genPTCS.write(primitiveIndex)
      this._genPTVS.write(primitiveIndex)
    }

    this._genTCS.write(primitiveIndex)
    this._genTES.write(primitiveIndex)
    this._genGS.write(primitiveIndex)
    this._genFS.write(primitiveIndex)

    const genAttr = new _Stream()

    // VS/PTVS specific accessor for the "vertex drawing coordinate"
    // Even though we currently always plumb vertexCoord as part of the drawing
    // coordinate, we expect clients to use this accessor when querying the base
    // vertex offset for a draw call.
    genAttr.write('int GetBaseVertexOffset() {\n')
    if (shaderDrawParametersEnabled) {
      genAttr.write('  return HgiGetBaseVertex();\n')
    } else {
      genAttr.write('  return GetDrawingCoord().vertexCoord;\n')
    }
    genAttr.write('}\n')

    // instance index indirection
    this._genDecl.write('struct hd_instanceIndex { int indices[HD_INSTANCE_INDEX_WIDTH]; };\n')

    if (this._hasCS) {
      // In order to access the drawing coordinate from CS the compute
      // shader needs to specify the current draw and current instance.
      this._genCS.write('struct hd_DrawIndex {\n',
        '  int drawId;\n',
        '  int instanceId;\n',
        '} hd_drawIndex;\n\n',

        'void SetDrawIndex(int drawId, int instanceId) {\n',
        '  hd_drawIndex.drawId = drawId;\n',
        '  hd_drawIndex.instanceId = instanceId;\n',
        '}\n\n',

        'int GetDrawingCoordField(int offset) {\n',
        '  const int drawIndexOffset = ',
        this._metaData.drawingCoordBufferBinding.offset,
        ';\n',

        '  const int drawIndexStride = ',
        this._metaData.drawingCoordBufferBinding.stride,
        ';\n',

        '  const int base = ',
        'hd_drawIndex.drawId * drawIndexStride + drawIndexOffset;\n',
        '  return int(',
        this._metaData.drawingCoordBufferBinding.bufferName,
        '[base + offset]);\n',
        '}\n')
    }

    if (this._metaData.instanceIndexArrayBinding.binding.isValid()) {
      // << layout (location=x) uniform (int|ivec[234]) *instanceIndices;
      _EmitDeclaration(this._resVS, this._metaData.instanceIndexArrayBinding)
      _EmitDeclaration(this._resPTCS, this._metaData.instanceIndexArrayBinding)
      _EmitDeclaration(this._resPTVS, this._metaData.instanceIndexArrayBinding)
      _EmitDeclaration(this._resCS, this._metaData.instanceIndexArrayBinding)

      // << layout (location=x) uniform (int|ivec[234]) *culledInstanceIndices;
      const bindingDecl = this._metaData.culledInstanceIndexArrayBinding
      _EmitDeclaration(this._resVS, bindingDecl)
      _EmitDeclaration(this._resPTCS, bindingDecl)
      _EmitDeclaration(this._resPTVS, bindingDecl)
      _EmitDeclaration(this._resCS, bindingDecl)

      /// if \p cullingPass is true, CodeGen generates GetInstanceIndex()
      /// such that it refers instanceIndices buffer (before culling).
      /// Otherwise, GetInstanceIndex() looks up culledInstanceIndices.

      this._genVS.write('int GetBaseInstanceIndexCoord() {\n',
        '  return drawingCoord1.y;\n',
        '}\n',

        'int GetCurrentInstance() {\n',
        '  return int(hd_InstanceID - hd_BaseInstance);\n',
        '}\n',

        'int GetInstanceIndexCoord() {\n',
        '  return GetBaseInstanceIndexCoord() +',
        ' GetCurrentInstance() * HD_INSTANCE_INDEX_WIDTH;\n',
        '}\n')

      this._genPTCS.write('int GetBaseInstanceIndexCoord() {\n',
        '  return drawingCoord1[0].y;\n',
        '}\n',

        'int GetCurrentInstance() {\n',
        '  return int(hd_InstanceID - hd_BaseInstance);\n',
        '}\n',

        'int GetInstanceIndexCoord() {\n',
        '  return GetBaseInstanceIndexCoord() +',
        ' GetCurrentInstance() * HD_INSTANCE_INDEX_WIDTH;\n',
        '}\n')

      this._genPTVS.write('int GetBaseInstanceIndexCoord() {\n',
        '  return drawingCoord1[0].y;\n',
        '}\n',

        'int GetCurrentInstance() {\n',
        '  return int(hd_InstanceID - hd_BaseInstance);\n',
        '}\n',

        'int GetInstanceIndexCoord() {\n',
        '  return GetBaseInstanceIndexCoord() +',
        ' GetCurrentInstance() * HD_INSTANCE_INDEX_WIDTH;\n',
        '}\n')

      this._genCS.write('int GetBaseInstanceIndexCoord() {\n',
        '  return GetDrawingCoordField(5);\n',
        '}\n',

        'int GetCurrentInstance() {\n',
        '  return hd_drawIndex.instanceId;\n',
        '}\n',

        'int GetInstanceIndexCoord() {\n',
        '  return GetBaseInstanceIndexCoord() + ',
        ' GetCurrentInstance() * HD_INSTANCE_INDEX_WIDTH;\n',
        '}\n')

      if (this._geometricShader!.isFrustumCullingPass()) {
        // for frustum culling:  use instanceIndices.
        const instanceIndexAccessors =
          'hd_instanceIndex GetInstanceIndex() {\n' +
          '  int offset = GetInstanceIndexCoord();\n' +
          '  hd_instanceIndex r;\n' +
          '  for (int i = 0; i < HD_INSTANCE_INDEX_WIDTH; ++i)\n' +
          '    r.indices[i] = instanceIndices[offset+i + 1];\n' +
          '  return r;\n' +
          '}\n' +

          'void SetCulledInstanceIndex(uint instanceID) {\n' +
          '  for (int i = 0; i < HD_INSTANCE_INDEX_WIDTH; ++i)\n' +
          '    culledInstanceIndices[GetBaseInstanceIndexCoord()' +
          ' + instanceID*HD_INSTANCE_INDEX_WIDTH + i + 1]' +
          '        = instanceIndices[GetBaseInstanceIndexCoord()' +
          ' + GetCurrentInstance()*HD_INSTANCE_INDEX_WIDTH + i + 1];\n' +
          '}\n'

        genAttr.write(instanceIndexAccessors)

        this._genCS.write(instanceIndexAccessors)
      } else {
        // for drawing:  use culledInstanceIndices.
        _EmitAccessor(this._genVS, this._metaData.culledInstanceIndexArrayBinding.name,
          this._metaData.culledInstanceIndexArrayBinding.dataType,
          this._metaData.culledInstanceIndexArrayBinding.binding,
          'GetInstanceIndexCoord()+localIndex + 1')
        _EmitAccessor(this._genPTCS, this._metaData.culledInstanceIndexArrayBinding.name,
          this._metaData.culledInstanceIndexArrayBinding.dataType,
          this._metaData.culledInstanceIndexArrayBinding.binding,
          'GetInstanceIndexCoord()+localIndex + 1')
        _EmitAccessor(this._genPTVS, this._metaData.culledInstanceIndexArrayBinding.name,
          this._metaData.culledInstanceIndexArrayBinding.dataType,
          this._metaData.culledInstanceIndexArrayBinding.binding,
          'GetInstanceIndexCoord()+localIndex + 1')

        genAttr.write('hd_instanceIndex GetInstanceIndex() {\n',
          '  hd_instanceIndex r;\n',
          '  for (int i = 0; i < HD_INSTANCE_INDEX_WIDTH; ++i)\n',
          '    r.indices[i] = HdGet_culledInstanceIndices(/*localIndex=*/i);\n',
          '  return r;\n',
          '}\n')
      }
    } else {
      genAttr.write('hd_instanceIndex GetInstanceIndex() {',
        '  hd_instanceIndex r; r.indices[0] = 0; return r; }\n')
      if (this._geometricShader!.isFrustumCullingPass()) {
        genAttr.write('void SetCulledInstanceIndex(uint instance) ' +
          '{ /*no-op*/ }\n')
      }

      this._genCS.write('hd_instanceIndex GetInstanceIndex() {',
        '  hd_instanceIndex r; r.indices[0] = 0; return r; }\n')
    }

    this._genVS.write(genAttr.str())
    this._genPTCS.write(genAttr.str())
    this._genPTVS.write(genAttr.str())

    this._genVS.write('hd_drawingCoord GetDrawingCoord() { hd_drawingCoord dc;\n')
    _GetDrawingCoordElem(this._genVS, '')
    this._genVS.write('  hd_instanceIndex r = GetInstanceIndex();\n')

    this._genPTCS.write('hd_drawingCoord GetDrawingCoord() { hd_drawingCoord dc;\n')
    _GetDrawingCoordElem(this._genPTCS, '', '[0]')
    this._genPTCS.write('  hd_instanceIndex r = GetInstanceIndex();\n')

    this._genPTVS.write('hd_drawingCoord GetDrawingCoord() { hd_drawingCoord dc;\n')
    _GetDrawingCoordElem(this._genPTVS, '', '[0]')
    this._genPTVS.write('  hd_instanceIndex r = GetInstanceIndex();\n')

    this._genCS.write('// Compute shaders read the drawCommands buffer directly.\n',
      'hd_drawingCoord GetDrawingCoord() {\n',
      '  hd_drawingCoord dc;\n',
      '  dc.modelCoord              = GetDrawingCoordField(0);\n',
      '  dc.constantCoord           = GetDrawingCoordField(1);\n',
      '  dc.elementCoord            = GetDrawingCoordField(2);\n',
      '  dc.primitiveCoord          = GetDrawingCoordField(3);\n',
      '  dc.fvarCoord               = GetDrawingCoordField(4);\n',
      '  dc.shaderCoord             = GetDrawingCoordField(6);\n',
      '  dc.vertexCoord             = GetDrawingCoordField(7);\n',
      '  dc.topologyVisibilityCoord = GetDrawingCoordField(8);\n',
      '  dc.varyingCoord            = GetDrawingCoordField(9);\n',
      '  hd_instanceIndex r = GetInstanceIndex();\n')

    const writeIndex = (ss: _Stream, index: string): void => {
      ss.write('  dc.instanceIndex[', index, ']',
        ' = r.indices[', index, '];\n')
    }
    for (let i = 0; i < instanceIndexWidth; ++i) {
      const index = String(i)
      writeIndex(this._genVS, index)
      writeIndex(this._genPTCS, index)
      writeIndex(this._genPTVS, index)
      writeIndex(this._genCS, index)
    }

    const writeInstanceIndex = (ss: _Stream, i: number,
      arrayAccessor: string): void => {
      const index = String(i)
      ss.write('  dc.instanceCoords[', index, ']',
        ' = drawingCoordI', index, arrayAccessor,
        ' + dc.instanceIndex[', String(i + 1), '];\n')
    }

    for (let i = 0; i < instanceIndexWidth - 1; ++i) {
      const index = String(i)
      writeInstanceIndex(this._genVS, i, '')
      writeInstanceIndex(this._genPTCS, i, '[0]')
      writeInstanceIndex(this._genPTVS, i, '[0]')
      this._genCS.write('  dc.instanceCoords[', index, ']',
        ' = GetDrawingCoordField(10 + ', index, ')',
        ' + dc.instanceIndex[', String(i + 1), '];\n')
    }

    this._genVS.write('  return dc;\n',
      '}\n')
    this._genPTCS.write('  return dc;\n',
      '}\n')
    this._genPTVS.write('  return dc;\n',
      '}\n')
    this._genCS.write('  return dc;\n',
      '}\n')

    // note: GL spec says tessellation input array size must be equal to
    //       gl_MaxPatchVertices, which is used for intrinsic declaration
    //       of built-in variables:
    //       in gl_PerVertex {} gl_in[gl_MaxPatchVertices];

    // drawing coord plumbing.
    // Note that copying from [0] for multiple input source since the
    // drawingCoord is flat (no interpolation required).

    // VS/PTVS from attributes
    this._processDrawingCoord(this._procVS, drawingCoordParams, instanceIndexWidth,
      'vs_', '')
    this._processDrawingCoord(this._procPTVSOut, drawingCoordParams, instanceIndexWidth,
      'vs_', '')

    // TCS from VS
    if (this._hasTCS) {
      this._getDrawingCoord(this._genTCS, drawingCoordParams, instanceIndexWidth,
        'vs_', '[0]')
      this._processDrawingCoord(this._procTCS, drawingCoordParams, instanceIndexWidth,
        'tcs_', '[gl_InvocationID]')
    }

    // TES from TCS
    if (this._hasTES) {
      this._getDrawingCoord(this._genTES, drawingCoordParams, instanceIndexWidth,
        'tcs_', '[0]')
      this._processDrawingCoord(this._procTES, drawingCoordParams, instanceIndexWidth,
        'tes_', '')
    }

    // GS
    if (this._hasGS && this._hasTES) {
      // from TES
      this._getDrawingCoord(this._genGS, drawingCoordParams, instanceIndexWidth,
        'tes_', '[0]')
    } else if (this._hasGS) {
      // from VS
      this._getDrawingCoord(this._genGS, drawingCoordParams, instanceIndexWidth,
        'vs_', '[0]')
    }
    this._processDrawingCoord(this._procGS, drawingCoordParams, instanceIndexWidth,
      'gs_', '')

    // FS
    if (this._hasGS) {
      // from GS
      this._getDrawingCoord(this._genFS, drawingCoordParams, instanceIndexWidth,
        'gs_', '')
    } else if (this._hasTES) {
      // from TES
      this._getDrawingCoord(this._genFS, drawingCoordParams, instanceIndexWidth,
        'tes_', '')
    } else {
      // from VS/PTVS
      this._getDrawingCoord(this._genFS, drawingCoordParams, instanceIndexWidth,
        'vs_', '')
    }
  }

  /** codeGen.cpp:5402-5465 */
  private _generateConstantPrimvar(): void {
    /*
      // --------- constant data declaration ----------
      struct ConstantData0 {
          mat4 transform;
          mat4 transformInverse;
          mat4 instancerTransform[2];
          vec3 displayColor;
          vec4 primID;
      };
      // bindless
      layout (location=0) uniform ConstantData0 *constantData0;
      // not bindless
      layout (std430, binding=0) buffer {
          constantData0 constantData0[];
      };

      // --------- constant data accessors ----------
      mat4 HdGet_transform(int localIndex) {
          return constantData0[GetConstantCoord()].transform;
      }
      vec3 HdGet_displayColor(int localIndex) {
          return constantData0[GetConstantCoord()].displayColor;
      }

    */

    for (const [binding, block] of this._metaData.constantData) {
      // note: _constantData has been sorted by offset in HdSt_ResourceBinder.
      // XXX: not robust enough, should consider padding and layouting rules
      // to match with the logic in HdInterleavedMemoryManager if we
      // want to use a layouting policy other than default padding.

      const typeName = TfToken(`ConstantData${binding.GetValue()}`)
      const varName = block.blockName

      this._genDecl.write('struct ', typeName, ' {\n')

      for (const dbIt of block.entries) {
        if (!TF_VERIFY(dbIt.dataType.length !== 0,
          `Unknown dataType for ${dbIt.name}`)) {
          continue
        }

        this._genDecl.write('  ', _GetPackedType(dbIt.dataType, false),
          ' ', dbIt.name)
        if (dbIt.arraySize > 1) {
          this._genDecl.write('[', dbIt.arraySize, ']')
        }

        this._genDecl.write(';\n')

        _EmitStructAccessor(this._genAccessors, varName, dbIt.name, dbIt.dataType,
          dbIt.arraySize,
          'GetDrawingCoord().constantCoord')
      }
      this._genDecl.write('};\n')

      _EmitDeclaration(this._resCommon, varName, typeName, binding,
        /*writable=*/false, /*arraySize=*/1)
    }
  }

  /** codeGen.cpp:5467-5570 */
  private _generateInstancePrimvar(): void {
    /*
      // --------- instance data declaration ----------
      // bindless
      layout (location=X) uniform vec4 *data;
      // not bindless
      layout (std430, binding=X) buffer buffer_X {
          vec4 data[];
      };

      // --------- instance data accessors ----------
      vec3 HdGet_hydra_instanceTranslations(int localIndex=0) {
          return instanceData0[GetInstanceCoord()].translate;
      }
    */

    const accessors = new _Stream()

    interface LevelEntries {
      dataType: TfToken
      levels: number[]
    }
    // std::map<TfToken, LevelEntries>: iterated in token order below.
    const nameAndLevels = new Map<TfToken, LevelEntries>()

    for (const [binding, it] of this._metaData.instanceData) {
      const dataType = it.dataType
      const level = it.level

      let entry = nameAndLevels.get(it.name)
      if (!entry) {
        entry = { dataType: TfToken(), levels: [] }
        nameAndLevels.set(it.name, entry)
      }
      entry.dataType = dataType
      entry.levels.push(level)

      const n = new _Stream()
      n.write(it.name, '_', level)
      const name = TfToken(n.str())
      n.str('')
      n.write('GetDrawingCoord().instanceCoords[', level, ']')

      // << layout (location=x) uniform float *translate_0;
      _EmitDeclaration(this._resCommon, name, dataType, binding)
      _EmitAccessor(accessors, name, dataType, binding, n.str())
    }

    const sortedNameAndLevels = [...nameAndLevels.entries()].sort(
      (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

    /*
      accessor taking level as a parameter.
      note that instance primvar may or may not be defined for each level.
      we expect level is an unrollable constant to optimize out branching.

      vec3 HdGetInstance_hydra_instanceTranslations(int level, vec3 defaultValue) {
          if (level == 0) return HdGet_hydra_instanceTranslations_0();
          // level==1 is not defined. use default
          if (level == 2) return HdGet_hydra_instanceTranslations_2();
          if (level == 3) return HdGet_hydra_instanceTranslations_3();
          return defaultValue;
      }
    */
    for (const [first, second] of sortedNameAndLevels) {
      accessors.write(_GetUnpackedType(second.dataType, false),
        ' HdGetInstance_', first, '(int level, ',
        _GetUnpackedType(second.dataType, false),
        ' defaultValue) {\n')
      for (const levelIt of second.levels) {
        accessors.write('  if (level == ', levelIt, ') ',
          'return HdGet_', first, '_', levelIt, '();\n')
      }

      accessors.write('  return defaultValue;\n',
        '}\n')
    }
    /*
      common accessor, if the primvar is defined on the instancer but not
      the rprim.

      #if !defined(HD_HAS_hydra_instanceTranslations)
      #define HD_HAS_hydra_instanceTranslations 1
      vec3 HdGet_hydra_instanceTranslations(int localIndex) {
          // 0 is the lowest level for which this is defined
          return HdGet_hydra_instanceTranslations_0();
      }
      vec3 HdGet_hydra_instanceTranslations() {
          return HdGet_hydra_instanceTranslations(0);
      }
      #endif
    */
    for (const [first, second] of sortedNameAndLevels) {
      accessors.write('#if !defined(HD_HAS_', first, ')\n',
        '#define HD_HAS_', first, ' 1\n',
        _GetUnpackedType(second.dataType, false),
        ' HdGet_', first, '(int localIndex) {\n',
        '  return HdGet_', first, '_',
        second.levels[0]!, '();\n',
        '}\n',
        _GetUnpackedType(second.dataType, false),
        ' HdGet_', first, '() { return HdGet_',
        first, '(0); }\n',
        '#endif\n')
    }

    this._genAccessors.write(accessors.str())
  }

  /** codeGen.cpp:5572-6033 */
  private _generateElementPrimvar(): void {
    const geometricShader = this._geometricShader!
    // Don't need to codegen element primvars for frustum culling as they're
    // unneeded. Including them can cause errors in Hgi backends like Vulkan,
    // which needs the resource layout made in HgiVulkanResourceBindings to
    // match the one generated by SPIRV-Reflect in HgiVulkanGraphicsPipeline
    // when creating the VkPipelineLayout.
    if (geometricShader.isFrustumCullingPass()) {
      return
    }
    /*
    Accessing uniform primvar data:
    ===============================
    Uniform primvar data is authored at the subprimitive (also called element or
    face below) granularity.
    To access uniform primvar data (say color), there are two indirections in
    the lookup because of aggregation in the buffer layout.
          ----------------------------------------------------
    color | prim0 colors | prim1 colors | .... | primN colors|
          ----------------------------------------------------
    For each prim, GetDrawingCoord().elementCoord holds the start index into
    this buffer.

    For an unrefined prim, the subprimitive ID is simply the gl_PrimitiveID.
    For a refined prim, gl_PrimitiveID corresponds to the refined element ID.

    To map a refined face to its coarse face, Storm builds a "primitive param"
    buffer (more details in the section below). This buffer is also aggregated,
    and for each subprimitive, GetDrawingCoord().primitiveCoord gives us the
    index into this buffer (meaning it has already added the gl_PrimitiveID)

    To have a single codepath for both cases, we build the primitive param
    buffer for unrefined prims as well, and effectively index the uniform
    primvar using:
    drawCoord.elementCoord + primitiveParam[ drawCoord.primitiveCoord ]

    The code generated looks something like:

      // --------- primitive param declaration ----------
      struct PrimitiveData { int elementID; }
      layout (std430, binding=?) buffer PrimitiveBuffer {
          PrimitiveData primitiveData[];
      };

      // --------- indirection accessors ---------
      // Gives us the "coarse" element ID
      int GetElementID() {
          return primitiveData[GetPrimitiveIndex()].elementID;
      }

      // Adds the offset to the start of the uniform primvar data for the prim
      int GetAggregatedElementID() {
          return GetElementID() + GetDrawingCoord().elementCoord;\n"
      }

      // --------- uniform primvar declaration ---------
      struct ElementData0 {
          vec3 displayColor;
      };
      layout (std430, binding=?) buffer buffer0 {
          ElementData0 elementData0[];
      };

      // ---------uniform primvar data accessor ---------
      vec3 HdGet_displayColor(int localIndex) {
          return elementData0[GetAggregatedElementID()].displayColor;
      }

    */

    // Primitive Param buffer layout:
    // ==============================
    // Depending on the prim, one of following is used:
    //
    // 1. basis curves
    //     1 int  : curve index
    //
    //     This lets us translate a basis curve segment to its curve id.
    //     A basis curve is made up for 'n' curves, each of which have a varying
    //     number of segments.
    //     (see hdSt/basisCurvesComputations.cpp)
    //
    // 2. mesh specific
    // a. tris
    //     1 int  : coarse face index + edge flag
    //     (see hd/meshUtil.h,cpp)
    //
    // b. quads coarse
    //     2 ints : coarse face index + edge flag
    //              ptex index
    //     (see hd/meshUtil.h,cpp)
    //
    // c. tris & quads uniformly refined
    //     3 ints : coarse face index + edge flag
    //              Far::PatchParam::field0 (includes ptex index)
    //              Far::PatchParam::field1
    //     (see hdSt/subdivision.cpp)
    //
    // d. patch adaptively refined
    //     4 ints : coarse face index + edge flag
    //              Far::PatchParam::field0 (includes ptex index)
    //              Far::PatchParam::field1
    //              sharpness (float)
    //     (see hdSt/subdivision.cpp)
    // -----------------------------------------------------------------------
    // note: decoding logic of primitiveParam has to match with
    // HdMeshTopology::DecodeFaceIndexFromPrimitiveParam()
    //
    // PatchParam is defined as ivec3 (see opensubdiv/far/patchParam.h)
    //  Field0     | Bits | Content
    //  -----------|:----:|---------------------------------------------------
    //  faceId     | 28   | the faceId of the patch (Storm uses ptexIndex)
    //  transition | 4    | transition edge mask encoding
    //
    //  Field1     | Bits | Content
    //  -----------|:----:|---------------------------------------------------
    //  level      | 4    | the subdivision level of the patch
    //  nonquad    | 1    | whether patch is refined from a non-quad face
    //  regular    | 1    | whether patch is regular
    //  unused     | 1    | unused
    //  boundary   | 5    | boundary mask encoding
    //  v          | 10   | log2 value of u parameter at first patch corner
    //  u          | 10   | log2 value of v parameter at first patch corner
    //
    //  Field2     (float)  sharpness
    //
    // whereas adaptive patches have PatchParams computed by OpenSubdiv,
    // we need to construct PatchParams for coarse tris and quads.
    // Currently it's enough to fill just faceId for coarse quads for
    // ptex shading.

    const accessors = new _Stream()
    const PrimitiveType = HdSt_GeometricShader.PrimitiveType
    const FvarPatchType = HdSt_GeometricShader.FvarPatchType

    if (this._metaData.primitiveParamBinding.binding.isValid()) {

      const binding = this._metaData.primitiveParamBinding.binding
      _EmitDeclaration(this._resCommon, this._metaData.primitiveParamBinding)
      _EmitAccessor(accessors, this._metaData.primitiveParamBinding.name,
        this._metaData.primitiveParamBinding.dataType, binding,
        'GetPrimitiveIndex()')

      if (geometricShader.isPrimTypeCompute()) {
        // do nothing.
      } else if (geometricShader.isPrimTypePoints()) {
        // do nothing.
        // e.g. if a prim's geomstyle is points and it has a valid
        // primitiveParamBinding, we don't generate any of the
        // accessor methods.
      } else if (geometricShader.isPrimTypeBasisCurves()) {
        // straight-forward indexing to get the segment's curve id
        accessors.write(
          'int GetElementID() {\n',
          '  return (hd_int_get(HdGet_primitiveParam()));\n',
          '}\n')
        accessors.write(
          'int GetAggregatedElementID() {\n',
          '  return GetElementID()\n',
          '  + GetDrawingCoord().elementCoord;\n',
          '}\n')
      } else if (geometricShader.isPrimTypeMesh()) {
        // GetPatchParam, GetEdgeFlag
        switch (geometricShader.getPrimitiveType()) {
          case PrimitiveType.PRIM_MESH_REFINED_QUADS:
          case PrimitiveType.PRIM_MESH_REFINED_TRIANGLES:
          case PrimitiveType.PRIM_MESH_REFINED_TRIQUADS:
          {
            // refined quads (catmulClark uniform subdiv) or
            // refined tris (loop uniform subdiv)
            accessors.write(
              'ivec3 GetPatchParam() {\n',
              '  return ivec3(HdGet_primitiveParam().y, \n',
              '               HdGet_primitiveParam().z, 0);\n',
              '}\n')
            accessors.write(
              'int GetEdgeFlag() {\n',
              '  return (HdGet_primitiveParam().x & 3);\n',
              '}\n')
            break
          }

          case PrimitiveType.PRIM_MESH_BSPLINE:
          case PrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE:
          {
            // "adaptive" subdivision generates refined patches
            // (tessellated triangles)
            accessors.write(
              'ivec3 GetPatchParam() {\n',
              '  return ivec3(HdGet_primitiveParam().y, \n',
              '               HdGet_primitiveParam().z, \n',
              '               HdGet_primitiveParam().w);\n',
              '}\n')
            accessors.write(
              'int GetEdgeFlag() {\n',
              '  return (HdGet_primitiveParam().x & 3);\n',
              '}\n')
            break
          }

          case PrimitiveType.PRIM_MESH_COARSE_QUADS:
          case PrimitiveType.PRIM_MESH_COARSE_TRIANGLES:
          case PrimitiveType.PRIM_MESH_COARSE_TRIQUADS:
          {
            // coarse quads or coarse triangles
            // ptexId matches the primitiveID for quadrangulated or
            // triangulated meshes, the other fields can be left as 0.
            // When there are geom subsets, we can no longer use the
            // primitiveId and instead use a buffer source generated
            // per subset draw item containing the coarse face indices.
            accessors.write(
              '#if defined(HD_HAS_coarseFaceIndex)\n',
              'FORWARD_DECL(int HdGetScalar_coarseFaceIndex());\n',
              '#endif\n',
              'ivec3 GetPatchParam() {\n',
              '#if defined(HD_HAS_coarseFaceIndex)\n ',
              '  return ivec3(HdGetScalar_coarseFaceIndex(), 0, 0);\n',
              '#else\n ',
              '  return ivec3(GetPrimitiveID(), 0, 0);\n',
              '#endif\n',
              '}\n')
            // edge flag encodes edges which have been
            // introduced by quadrangulation or triangulation
            accessors.write(
              'int GetEdgeFlag() {\n',
              '  return (HdGet_primitiveParam() & 3);\n',
              '}\n')
            break
          }

          default:
          {
            TF_CODING_ERROR(`HdSt_GeometricShader::PrimitiveType ${
              geometricShader.getPrimitiveType() as number} is ` +
              'unexpected in _GenerateElementPrimvar().')
          }
        }

        // GetFVarIndex
        if (geometricShader.getFvarPatchType() ===
            FvarPatchType.PATCH_COARSE_TRIANGLES) {
          // note that triangulated meshes don't have ptexIndex.
          // Here we're passing primitiveID as ptexIndex PatchParam
          // since Hd_TriangulateFaceVaryingComputation unrolls facevaring
          // primvars for each triangles.
          accessors.write(
            'int GetFVarIndex(int localIndex) {\n',
            '  int fvarCoord = GetDrawingCoord().fvarCoord;\n',
            '  int ptexIndex = GetPatchParam().x & 0xfffffff;\n',
            '  return fvarCoord + ptexIndex * 3 + localIndex;\n',
            '}\n')
        } else if (geometricShader.getFvarPatchType() ===
            FvarPatchType.PATCH_COARSE_QUADS) {
          accessors.write(
            'int GetFVarIndex(int localIndex) {\n',
            '  int fvarCoord = GetDrawingCoord().fvarCoord;\n',
            '  int ptexIndex = GetPatchParam().x & 0xfffffff;\n',
            '  return fvarCoord + ptexIndex * 4 + localIndex;\n',
            '}\n')
        }

        // ElementID getters
        accessors.write(
          'int GetElementID() {\n',
          '  return (hd_int_get(HdGet_primitiveParam()) >> 2);\n',
          '}\n')

        accessors.write(
          'int GetAggregatedElementID() {\n',
          '  return GetElementID()\n',
          '  + GetDrawingCoord().elementCoord;\n',
          '}\n')
      } else {
        TF_CODING_ERROR(`HdSt_GeometricShader::PrimitiveType ${
          geometricShader.getPrimitiveType() as number} is ` +
          'unexpected in _GenerateElementPrimvar().')
      }
    } else {
      // no primitiveParamBinding

      // XXX: this is here only to keep the compiler happy, we don't expect
      // users to call them -- we really should restructure whatever is
      // necessary to avoid having to do this and thus guarantee that users
      // can never call bogus versions of these functions.

      // Use a fallback of -1, so that points aren't selection highlighted
      // when face 0 is selected. This would be the case if we returned 0,
      // since the selection highlighting code is repr-agnostic.
      // It is safe to do this for points, since  we don't generate accessors
      // for element primvars, and thus don't use it as an index into
      // elementCoord.
      if (geometricShader.isPrimTypePoints()) {
        accessors.write(
          'int GetElementID() {\n',
          '  return -1;\n',
          '}\n')
      } else {
        accessors.write(
          'int GetElementID() {\n',
          '  return 0;\n',
          '}\n')
      }
      accessors.write(
        'int GetAggregatedElementID() {\n',
        '  return GetElementID();\n',
        '}\n')
      accessors.write(
        'int GetEdgeFlag() {\n',
        '  return 0;\n',
        '}\n')
      accessors.write(
        'ivec3 GetPatchParam() {\n',
        '  return ivec3(0, 0, 0);\n',
        '}\n')
      accessors.write(
        'int GetFVarIndex(int localIndex) {\n',
        '  return 0;\n',
        '}\n')
    }
    this._genDecl.write(
      'FORWARD_DECL(int GetElementID());\n',
      'FORWARD_DECL(int GetAggregatedElementID());\n')


    if (this._metaData.edgeIndexBinding.binding.isValid()) {

      const binding = this._metaData.edgeIndexBinding.binding

      _EmitDeclaration(this._resCommon, this._metaData.edgeIndexBinding)
      _EmitAccessor(accessors, this._metaData.edgeIndexBinding.name,
        this._metaData.edgeIndexBinding.dataType, binding,
        'GetPrimitiveIndex()')
    }

    if (this._metaData.coarseFaceIndexBinding.binding.isValid()) {
      this._genDefines.write('#define HD_HAS_',
        this._metaData.coarseFaceIndexBinding.name, ' 1\n')

      const binding = this._metaData.coarseFaceIndexBinding.binding

      _EmitDeclaration(this._resCommon, this._metaData.coarseFaceIndexBinding)
      _EmitAccessor(accessors, this._metaData.coarseFaceIndexBinding.name,
        this._metaData.coarseFaceIndexBinding.dataType, binding,
        'GetPrimitiveIndex() + localIndex')
    }

    switch (geometricShader.getPrimitiveType()) {
      case PrimitiveType.PRIM_MESH_REFINED_QUADS:
      case PrimitiveType.PRIM_MESH_REFINED_TRIANGLES:
      case PrimitiveType.PRIM_MESH_REFINED_TRIQUADS:
      case PrimitiveType.PRIM_MESH_BSPLINE:
      case PrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE:
      case PrimitiveType.PRIM_MESH_COARSE_QUADS:
      case PrimitiveType.PRIM_MESH_COARSE_TRIANGLES:
      case PrimitiveType.PRIM_MESH_COARSE_TRIQUADS:
        // This is no longer used by Storm but is generated for backward
        // compatibility with production shaders.
        accessors.write(
          'int GetAuthoredEdgeId(int primitiveEdgeId) {\n',
          '  return primitiveEdgeId;\n',
          '}\n')
        break
      default:
        // The functions below are used in picking (id render) and/or
        // selection highlighting, and are expected to be defined.
        // Generate fallback versions when we aren't rendering meshes.
        accessors.write(
          'int GetAuthoredEdgeId(int primitiveEdgeId) {\n',
          '  return -1;\n',
          '}\n')
        accessors.write(
          'int GetPrimitiveEdgeId() {\n',
          '  return -1;\n',
          '}\n')
        accessors.write(
          'float GetSelectedEdgeOpacity() {\n',
          '  return 0.0;\n',
          '}\n')
        accessors.write(
          'bool SelectWireframeFaceEdges() {\n',
          '  return false;\n',
          '}\n')
        break
    }

    this._genDecl.write(
      'FORWARD_DECL(int GetPrimitiveEdgeId());\n',
      'FORWARD_DECL(float GetSelectedEdgeOpacity());\n')

    // Uniform primvar data declarations & accessors
    if (!geometricShader.isPrimTypePoints()) {
      for (const [binding, it] of this._metaData.elementData) {
        const name = it.name
        const dataType = it.dataType

        _EmitDeclaration(this._resCommon, name, dataType, binding)
        // AggregatedElementID gives us the buffer index post batching, which
        // is what we need for accessing element (uniform) primvar data.
        _EmitAccessor(accessors, name, dataType, binding, 'GetAggregatedElementID()')
      }
    }

    for (let i = 0; i < this._metaData.fvarIndicesBindings.length; ++i) {
      const decl = this._metaData.fvarIndicesBindings[i]!
      if (!decl.binding.isValid()) {
        continue
      }

      const binding = decl.binding
      const name = decl.name
      // codeGen.cpp:5991-5993 passes 0 in the isWritable position.
      _EmitDeclaration(this._resCommon, name,
        decl.dataType,
        decl.binding, false)

      if (geometricShader.getFvarPatchType() ===
          FvarPatchType.PATCH_BSPLINE ||
          geometricShader.getFvarPatchType() ===
          FvarPatchType.PATCH_BOXSPLINETRIANGLE) {
        _EmitAccessor(accessors, name,
          decl.dataType, binding,
          'GetPrimitiveIndex() * HD_NUM_PATCH_VERTS + localIndex')
      } else {
        _EmitAccessor(accessors, name,
          decl.dataType, binding,
          'GetPrimitiveIndex() + localIndex')
      }
    }

    for (let i = 0; i < this._metaData.fvarPatchParamBindings.length; ++i) {
      const decl = this._metaData.fvarPatchParamBindings[i]!
      if (!decl.binding.isValid()) {
        continue
      }

      const binding = decl.binding
      const name = decl.name
      // codeGen.cpp:6014-6016 passes 0 in the isWritable position.
      _EmitDeclaration(this._resCommon, name,
        decl.dataType,
        decl.binding, false)

      // Only need fvar patch param for bspline or box spline patches
      if (geometricShader.getFvarPatchType() ===
          FvarPatchType.PATCH_BSPLINE ||
          geometricShader.getFvarPatchType() ===
          FvarPatchType.PATCH_BOXSPLINETRIANGLE) {
        _EmitAccessor(accessors, name,
          decl.dataType, binding,
          'GetPrimitiveIndex() + localIndex')
      }
    }

    this._genTCS.write(accessors.str())
    this._genTES.write(accessors.str())
    this._genGS.write(accessors.str())
    this._genPTCS.write(accessors.str())
    this._genPTVS.write(accessors.str())
    this._genFS.write(accessors.str())
  }

  /** codeGen.cpp:6035-6468 */
  private _generateVertexAndFaceVaryingPrimvar(): void {
    const geometricShader = this._geometricShader!
    if (geometricShader.isFrustumCullingPass()) {
      return
    }

    // Vertex, Varying, and FVar primvar flow into the fragment shader as
    // per-fragment attribute data that has been interpolated by the rasterizer,
    // and hence have similarities for code gen.
    // While vertex primvar are authored per vertex and require plumbing
    // through all shader stages, fVar is emitted only in the GS stage.
    // Varying primvar are bound in the VS via buffer array but are processed as
    // vertex data for the rest of the stages.
    /*
      // --------- vertex data declaration (VS) ----------
      layout (location = 0) in vec3 normals;
      layout (location = 1) in vec3 points;

      out Primvars {
          vec3 normals;
          vec3 points;
      } outPrimvars;

      void ProcessPrimvarsIn() {
          outPrimvars.normals = normals;
          outPrimvars.points = points;
      }

      // --------- geometry stage plumbing -------
      in Primvars {
          vec3 normals;
          vec3 points;
      } inPrimvars[];
      out Primvars {
          vec3 normals;
          vec3 points;
      } outPrimvars;

      void ProcessPrimvarsOut(int index) {
          outPrimvars = inPrimvars[index];
      }

      // --------- vertex/varying data accessors (used in GS/FS) ---
      in Primvars {
          vec3 normals;
          vec3 points;
      } inPrimvars;
      vec3 HdGet_normals(int localIndex=0) {
          return inPrimvars.normals;
      }
    */

    const accessorsVS = new _Stream()
    const accessorsTCS = new _Stream()
    const accessorsTES = new _Stream()
    const accessorsPTCS = new _Stream()
    const accessorsPTVS = new _Stream()
    const accessorsGS = new _Stream()
    const accessorsFS = new _Stream()

    // Divergence: the vector is replaced rather than extended in place when
    // the fvar members are appended below, so block elements already added
    // with it keep their own member list (the C++ elements copy the vector).
    let interstagePrimvar: HioGlslfxResourceLayoutMemberVector = []

    // vertex
    for (const [binding, it] of this._metaData.vertexData) {
      const name = it.name
      const dataType = it.dataType

      // future work:
      // with ARB_enhanced_layouts extention, it's possible
      // to use "component" qualifier to declare offsetted primvars
      // in interleaved buffer.
      _EmitDeclaration(this._resAttrib, name, dataType, binding)

      interstagePrimvar.push(new HioGlslfxResourceLayoutMember(
        _GetPackedType(dataType, false), name))

      // primvar accessors
      _EmitAccessor(accessorsVS, name, dataType, binding)

      _EmitStructAccessor(accessorsTCS, _tokens.inPrimvars,
        name, dataType, /*arraySize=*/1, 'gl_InvocationID + localIndex')
      _EmitStructAccessor(accessorsTES, _tokens.inPrimvars,
        name, dataType, /*arraySize=*/1, 'localIndex')
      _EmitStructAccessor(accessorsGS, _tokens.inPrimvars,
        name, dataType, /*arraySize=*/1, 'localIndex')
      _EmitStructAccessor(accessorsFS, _tokens.inPrimvars,
        name, dataType, /*arraySize=*/1)

      // Access PTCS vertex primvar from input attributes.
      _EmitStageAccessor(accessorsPTCS, name,
        name + '[localIndex]', dataType)

      // Access PTVS vertex primvar from input attributes.
      _EmitStageAccessor(accessorsPTVS, name,
        name + '[localIndex]', dataType)

      // interstage plumbing
      this._procVS.write('  outPrimvars.', name,
        ' = ', name, ';\n')
      this._procTCS.write('  outPrimvars[gl_InvocationID].', name,
        ' = inPrimvars[gl_InvocationID].', name, ';\n')
      this._procTES.write('  outPrimvars.', name,
        ' = basis[0] * inPrimvars[i0].', name,
        ' + basis[1] * inPrimvars[i1].', name,
        ' + basis[2] * inPrimvars[i2].', name,
        ' + basis[3] * inPrimvars[i3].', name, ';\n')
      this._procGS.write('  outPrimvars.', name,
        ' = inPrimvars[index].', name, ';\n')

      this._procPTVSOut.write('  outPrimvars.', name,
        ' = InterpolatePrimvar(',
        'HdGet_', name, '(i0), ',
        'HdGet_', name, '(i1), ',
        'HdGet_', name, '(i2), ',
        'HdGet_', name, '(i3), basis, uv);\n')
    }

    /*
      // --------- varying data declaration (VS) ----------------
      layout (std430, binding=?) buffer buffer0 {
          vec3 displayColor[];
      };

      vec3 HdGet_displayColor(int localIndex) {
        int index =  GetDrawingCoord().varyingCoord + int(hd_VertexID) -
            GetBaseVertexOffset();
        return vec3(displayColor[index]);
      }
      vec3 HdGet_displayColor() { return HdGet_displayColor(0); }

      out Primvars {
          vec3 displayColor;
      } outPrimvars;

      void ProcessPrimvarsIn() {
          outPrimvars.displayColor = HdGet_displayColor();
      }

      // --------- fragment stage plumbing -------
      in Primvars {
          vec3 displayColor;
      } inPrimvars;
    */

    const indexBufferBinding = this._metaData.indexBufferBinding
    if (indexBufferBinding.name.length !== 0) {
      _EmitDeclaration(this._resPTCS,
        indexBufferBinding.name,
        indexBufferBinding.dataType,
        indexBufferBinding.binding)
      _EmitDeclaration(this._resPTVS,
        indexBufferBinding.name,
        indexBufferBinding.dataType,
        indexBufferBinding.binding)

      _EmitBufferAccessor(accessorsPTCS,
        indexBufferBinding.name,
        indexBufferBinding.dataType,
        'patch_id * VERTEX_CONTROL_POINTS_PER_PATCH + localIndex')
      _EmitBufferAccessor(accessorsPTVS,
        indexBufferBinding.name,
        indexBufferBinding.dataType,
        'patch_id * VERTEX_CONTROL_POINTS_PER_PATCH + localIndex')
    }

    for (const [binding, it] of this._metaData.varyingData) {
      const name = it.name
      const dataType = it.dataType

      _EmitDeclaration(this._resAttrib, name, dataType, binding)

      interstagePrimvar.push(new HioGlslfxResourceLayoutMember(
        _GetPackedType(dataType, false), name))

      // primvar accessors
      _EmitBufferAccessor(accessorsVS, name, dataType,
        'GetDrawingCoord().varyingCoord + int(hd_VertexID) - GetBaseVertexOffset()')

      _EmitStructAccessor(accessorsTCS, _tokens.inPrimvars,
        name, dataType, /*arraySize=*/1, 'gl_InvocationID + localIndex')
      _EmitStructAccessor(accessorsTES, _tokens.inPrimvars,
        name, dataType, /*arraySize=*/1, 'localIndex')
      _EmitStructAccessor(accessorsGS, _tokens.inPrimvars,
        name, dataType, /*arraySize=*/1, 'localIndex')
      _EmitStructAccessor(accessorsFS, _tokens.inPrimvars,
        name, dataType, /*arraySize=*/1)

      // Access PTCS varying primvar from varying data buffer.
      _EmitBufferAccessor(accessorsPTCS, name, dataType,
        'GetDrawingCoord().varyingCoord + HdGet_indices(localIndex)')

      // Access PTVS varying primvar from varying data buffer.
      _EmitBufferAccessor(accessorsPTVS, name, dataType,
        'GetDrawingCoord().varyingCoord + HdGet_indices(localIndex)')

      // interstage plumbing
      this._procVS.write('  outPrimvars.', name,
        ' = ', 'HdGet_', name, '();\n')
      this._procTCS.write('  outPrimvars[gl_InvocationID].', name,
        ' = inPrimvars[gl_InvocationID].', name, ';\n')
      this._procTES.write('  outPrimvars.', name,
        ' = InterpolatePrimvar(',
        'inPrimvars[i0].', name,
        ', inPrimvars[i1].', name,
        ', inPrimvars[i2].', name,
        ', inPrimvars[i3].', name,
        ', basis, uv);\n')
      this._procGS.write('  outPrimvars.', name,
        ' = inPrimvars[index].', name, ';\n')

      this._procPTVSOut.write('  outPrimvars.', name,
        ' = InterpolatePrimvar(',
        'HdGet_', name, '(i0), ',
        'HdGet_', name, '(i1), ',
        'HdGet_', name, '(i2), ',
        'HdGet_', name, '(i3), basis, uv);\n')
    }

    /*
      // --------- facevarying data declaration ----------------
      layout (std430, binding=?) buffer buffer0 {
          vec2 map1[];
      };
      layout (std430, binding=?) buffer buffer1 {
          float map2_u[];
      };

      // --------- geometry stage plumbing -------
      out Primvars {
          ...
          vec2 map1;
          float map2_u;
      } outPrimvars;

      void ProcessPrimvarsOut(int index) {
          outPrimvars.map1 = HdGet_map1(index, localST);
          outPrimvars.map2_u = HdGet_map2_u(index, localST);
      }

      // --------- fragment stage plumbing -------
      in Primvars {
          ...
          vec2 map1;
          float map2_u;
      } inPrimvars;

      // --------- facevarying data accessors ----------
      // in geometry shader
      // unrefined internal accessor
      vec2 HdGet_map1_Coarse(int localIndex) {
          int fvarIndex = GetFVarIndex(localIndex);
          return vec2(map1[fvarIndex]);
      }
      // unrefined public accessors
      vec2 HdGet_map1(int localIndex, vec2 st) {
          int fvarIndex = GetFVarIndex(localIndex);
          return (HdGet_map1_Coarse(0) * ...);
      }
      vec2 HdGet_map1(int localIndex) {
          vec2 localST = GetPatchCoord(localIndex).xy;
          return HdGet_map1(localIndex, localST);
      }

      // refined internal accessor
      vec2 HdGet_map1_Coarse(int localIndex) {
          int fvarIndex = GetDrawingCoord().fvarCoord + localIndex;
          return vec2(map1[fvarIndex]);
      }
      // refined public accessors
      vec2 HdGet_map1(int localIndex, vec2 st) {
          ivec4 indices = HdGet_fvarIndices0();
          return mix(mix(HdGet_map1_Coarse(indices[0])...);
      }
      // refined quads:
      vec2 HdGet_map1(int localIndex) {
          vec2 lut[4] = vec2[4](vec2(0,0), vec2(1,0), vec2(1,1), vec2(0,1));
          vec2 localST = lut[localIndex];\n";
          return HdGet_map1(localIndex, localST);
      }
      // refined triangles:
      vec2 HdGet_map1(int localIndex) {
          vec2 lut[3] = vec2[3](vec2(0,0), vec2(1,0), vec2(0,1));
          vec2 localST = lut[localIndex];\n";
          return HdGet_map1(localIndex, localST);
      }

      // refined public accessor for b-spline/box-spline patches
      vec2 HdGet_map1(int localIndex, vec2 st) {
          int patchType = OSD_PATCH_DESCRIPTOR_REGULAR; // b-spline patches
          // OR int patchType = OSD_PATCH_DESCRIPTOR_LOOP; for box-spline
          ivec2 fvarPatchParam = HdGet_fvarPatchParam0();
          OsdPatchParam param = OsdPatchParamInit(fvarPatchParam.x,
                                                  fvarPatchParam.y, 0);
          float wP[20], wDu[20], wDv[20], wDuu[20], wDuv[20], wDvv[20];
          OsdEvaluatePatchBasisNormalized(patchType, param, st.s,
            st.t, wP, wDu, wDv, wDuu, wDuv, wDvv);
          vec2 result = vec2(0);
          for (int i = 0; i < HD_NUM_PATCH_VERTS; ++i) {
              int fvarIndex = HdGet_fvarIndices0(i);
               vec2 cv = vec2(HdGet_map1_Coarse(fvarIndex));
               result += wP[i] * cv;
          }
          return result;
      }

      // in fragment shader
      vec2 HdGet_map1() {
          return inPrimvars.map1;
      }
    */

    // face varying
    const interstagePrimvarFVar: HioGlslfxResourceLayoutMemberVector = []

    const FvarPatchType = HdSt_GeometricShader.FvarPatchType

    // FVar primvars are emitted by GS or FS
    for (const [binding, it] of this._metaData.fvarData) {
      const name = it.name
      const dataType = it.dataType
      const channel = it.channel

      if (this._hasGS) {
        _EmitDeclaration(this._resMaterial, name, dataType, binding)

        interstagePrimvarFVar.push(new HioGlslfxResourceLayoutMember(
          _GetPackedType(dataType, false), name))

        // primvar accessors (only in GS and FS)
        _EmitFVarAccessor(this._hasGS, accessorsGS, name, dataType, binding,
          geometricShader.getPrimitiveType(),
          geometricShader.getFvarPatchType(),
          channel)

        _EmitStructAccessor(accessorsFS, _tokens.inPrimvars,
          name, dataType,
          /*arraySize=*/1, null)

        if (geometricShader.getFvarPatchType() ===
            FvarPatchType.PATCH_BSPLINE ||
            geometricShader.getFvarPatchType() ===
            FvarPatchType.PATCH_BOXSPLINETRIANGLE) {
          this._procGS.write('  outPrimvars.', name,
            ' = HdGet_', name, '(index, localST);\n')
        } else {
          this._procGS.write('  outPrimvars.', name,
            ' = HdGet_', name, '(index);\n')
        }
      } else if (!geometricShader.isPrimTypePoints()) {
        _EmitDeclaration(this._resMaterial, name, dataType, binding)

        _EmitFVarAccessor(this._hasGS,
          accessorsFS, name, dataType, binding,
          geometricShader.getPrimitiveType(),
          geometricShader.getFvarPatchType(),
          channel)

        _EmitFVarAccessor(false,
          accessorsPTCS, name, dataType, binding,
          geometricShader.getPrimitiveType(),
          geometricShader.getFvarPatchType(),
          channel)

        _EmitFVarAccessor(false,
          accessorsPTVS, name, dataType, binding,
          geometricShader.getPrimitiveType(),
          geometricShader.getFvarPatchType(),
          channel)
      }
    }

    if (interstagePrimvar.length !== 0) {
      // VS out
      _AddInterstageBlockElement(
        this._resVS, HioGlslfxResourceLayoutInOut.STAGE_OUT,
        _tokens.PrimvarData, _tokens.outPrimvars, interstagePrimvar)

      // TCS in/out
      _AddInterstageBlockElement(
        this._resTCS, HioGlslfxResourceLayoutInOut.STAGE_IN,
        _tokens.PrimvarData, _tokens.inPrimvars, interstagePrimvar,
        _tokens.gl_MaxPatchVertices)
      _AddInterstageBlockElement(
        this._resTCS, HioGlslfxResourceLayoutInOut.STAGE_OUT,
        _tokens.PrimvarData, _tokens.outPrimvars, interstagePrimvar,
        _tokens.HD_NUM_PATCH_EVAL_VERTS)

      // TES in/out
      _AddInterstageBlockElement(
        this._resTES, HioGlslfxResourceLayoutInOut.STAGE_IN,
        _tokens.PrimvarData, _tokens.inPrimvars, interstagePrimvar,
        _tokens.gl_MaxPatchVertices)
      _AddInterstageBlockElement(
        this._resTES, HioGlslfxResourceLayoutInOut.STAGE_OUT,
        _tokens.PrimvarData, _tokens.outPrimvars, interstagePrimvar)

      // GS in
      _AddInterstageBlockElement(
        this._resGS, HioGlslfxResourceLayoutInOut.STAGE_IN,
        _tokens.PrimvarData, _tokens.inPrimvars, interstagePrimvar,
        _tokens.HD_NUM_PRIMITIVE_VERTS)
    }

    if (interstagePrimvar.length !== 0 || interstagePrimvarFVar.length !== 0) {

      // Include FVar primvar for these shader stages.
      interstagePrimvar = [...interstagePrimvar, ...interstagePrimvarFVar]

      // PTVS out
      _AddInterstageBlockElement(
        this._resPTVS, HioGlslfxResourceLayoutInOut.STAGE_OUT,
        _tokens.PrimvarData, _tokens.outPrimvars, interstagePrimvar)

      // GS out
      _AddInterstageBlockElement(
        this._resGS, HioGlslfxResourceLayoutInOut.STAGE_OUT,
        _tokens.PrimvarData, _tokens.outPrimvars, interstagePrimvar)

      // FS in
      _AddInterstageBlockElement(
        this._resFS, HioGlslfxResourceLayoutInOut.STAGE_IN,
        _tokens.PrimvarData, _tokens.inPrimvars, interstagePrimvar)
    }

    this._genVS.write(accessorsVS.str())
    this._genGS.write(accessorsGS.str())
    this._genFS.write(accessorsFS.str())
    this._genTCS.write(accessorsTCS.str())
    this._genTES.write(accessorsTES.str())
    this._genPTCS.write(accessorsPTCS.str())
    this._genPTVS.write(accessorsPTVS.str())

    // ---------
    this._genFS.write('FORWARD_DECL(vec4 GetPatchCoord(int index));\n')
    this._genGS.write('FORWARD_DECL(vec4 GetPatchCoord(int localIndex));\n')
  }

  /** codeGen.cpp:6470-7163 */
  private _generateShaderParameters(bindlessTextureEnabled: boolean): void {
    /*
      ------------- Declarations -------------

      // shader parameter buffer
      struct ShaderData {
          <type>          <name>;
          vec4            diffuseColor;     // fallback uniform
          sampler2D       kdTexture;        // uv texture    (bindless texture)
          sampler2DArray  ptexTexels;       // ptex texels   (bindless texture)
          usamplerBuffer  ptexLayouts;      // ptex layouts  (bindless texture)
      };

      // bindless buffer
      layout (location=0) uniform ShaderData *shaderData;
      // not bindless buffer
      layout (std430, binding=0) buffer {
          ShaderData shaderData[];
      };

      // non bindless textures
      uniform sampler2D      samplers_2d[N];
      uniform sampler2DArray samplers_2darray[N];
      uniform isamplerBuffer isamplerBuffers[N];

      ------------- Accessors -------------

      * fallback value
      <type> HdGet_<name>(int localIndex=0) {
          return shaderData[GetDrawingCoord().shaderCoord].<name>
      }

      * primvar redirect
      <type> HdGet_<name>(int localIndex=0) {
          return HdGet_<inPrimvars>().xxx;
      }

      * bindless 2D texture
      <type> HdGet_<name>(int localIndex=0) {
          return texture(sampler2D(shaderData[GetDrawingCoord().shaderCoord].<name>), <inPrimvars>).xxx;
      }

      * non-bindless 2D texture
      <type> HdGet_<name>(int localIndex=0) {
          return texture(samplers_2d[<offset> + drawIndex * <stride>], <inPrimvars>).xxx;
      }

      * bindless Ptex texture
      <type> HdGet_<name>(int localIndex=0) {
          return GlopPtexTextureLookup(<name>_Data, <name>_Packing, GetPatchCoord()).xxx;
      }

      * non-bindless Ptex texture
      <type> HdGet_<name>(int localIndex=0) {
          return GlopPtexTextureLookup(
              samplers_2darray[<offset_ptex_texels> + drawIndex * <stride>],
              usamplerBuffers[<offset_ptex_layouts> + drawIndex * <stride>],
              GetPatchCoord()).xxx;
      }

      * bindless Ptex texture with patchcoord
      <type> HdGet_<name>(vec4 patchCoord) {
          return GlopPtexTextureLookup(<name>_Data, <name>_Packing, patchCoord).xxx;
      }

      * non-bindless Ptex texture
      <type> HdGet_<name>(vec4 patchCoord) {
          return GlopPtexTextureLookup(
              samplers_2darray[<offset_ptex_texels> + drawIndex * <stride>],
              usamplerBuffers[<offset_ptex_layouts> + drawIndex * <stride>],
              patchCoord).xxx;
      }

      * transform2d
      vec2 HdGet_<name>(int localIndex=0) {
          float angleRad = HdGet_<name>_rotation() * 3.1415926f / 180.f;
          mat2 rotMat = mat2(cos(angleRad), sin(angleRad),
                             -sin(angleRad), cos(angleRad));
      #if defined(HD_HAS_<primvarName>)
          return vec2(HdGet_<name>_translation() + rotMat *
            (HdGet_<name>_scale() * HdGet_<primvarName>(localIndex)));
      #else
          int shaderCoord = GetDrawingCoord().shaderCoord;
          return vec2(HdGet_<name>_translation() + rotMat *
           (HdGet_<name>_scale() * shaderData[shaderCoord].<name>_fallback.xy));
      #endif
      }

    */

    const accessors = new _Stream()

    const typeName = TfToken('ShaderData')
    const varName = TfToken('shaderData')

    // for shader parameters, we create declarations and accessors separetely.
    for (const [binding, block] of this._metaData.shaderData) {

      this._genDecl.write('struct ', typeName, ' {\n')

      for (const dbIt of block.entries) {
        this._genDecl.write('  ', _GetPackedType(_ConvertBoolType(dbIt.dataType), false),
          ' ', dbIt.name,
          ';\n')
      }

      this._genDecl.write('};\n')

      // for array delaration, SSBO and bindless uniform can use [].
      // UBO requires the size [N].
      // XXX: [1] is a hack to cheat driver not telling the actual size.
      //      may not work some GPUs.
      // XXX: we only have 1 shaderData entry (interleaved).
      const arraySize = (binding.getType() === HdStBinding.UBO) ? 1 : 0
      // codeGen.cpp:6593 passes arraySize in the isWritable position.
      _EmitDeclaration(this._resCommon, varName, typeName, binding, arraySize !== 0)

      break
    }

    const TextureType = HioGlslfxResourceLayoutTextureType
    const ShaderDataSuffix = HdSt_ResourceBindingSuffixTokens

    // Non-field redirect accessors.
    for (const [binding, second] of this._metaData.shaderParameterBinding) {

      // adjust datatype
      const swizzle = _GetSwizzleString(second.dataType,
        second.swizzle)
      const fallbackSwizzle =
        this._getFallbackScalarSwizzleString(second.dataType,
          second.name)

      const bindingType: HdStBindingType = binding.getType()

      if (bindingType === HdStBinding.FALLBACK) {

        // vec4 HdGet_name(int localIndex)
        accessors.write(
          _GetUnpackedType(second.dataType, false),
          ' HdGet_', second.name, '(int localIndex) {\n',
          '  int shaderCoord = GetDrawingCoord().shaderCoord; \n',
          '  return ',
          _GetPackedTypeAccessor(second.dataType, false),
          '(shaderData[shaderCoord].',
          second.name, ShaderDataSuffix.fallback,
          fallbackSwizzle,
          ');\n',
          '}\n')

        // vec4 HdGet_name()
        accessors.write(
          _GetUnpackedType(second.dataType, false),
          ' HdGet_', second.name,
          '() { return HdGet_', second.name, '(0); }\n')

        // float HdGetScalar_name()
        _EmitScalarAccessor(
          accessors, second.name, second.dataType)

      } else if (bindingType === HdStBinding.BINDLESS_TEXTURE_2D) {

        _EmitTextureAccessors(
          accessors, second, swizzle, fallbackSwizzle,
          /* dim = */ 2,
          /* hasTextureTransform = */ false,
          /* hasTextureScaleAndBias = */ true,
          /* isBindless = */ true,
          bindlessTextureEnabled)

      } else if (bindingType === HdStBinding.BINDLESS_ARRAY_OF_TEXTURE_2D) {

        // Handle special case for shadow textures.
        const isShadowTexture =
          (second.name === HdStTokens.shadowCompareTextures)

        _EmitTextureAccessors(
          accessors, second, swizzle, fallbackSwizzle,
          /* dim = */ 2,
          /* hasTextureTransform = */ false,
          /* hasTextureScaleAndBias = */ !isShadowTexture,
          /* isBindless = */ true,
          bindlessTextureEnabled,
          /* isArray = */ true,
          /* isShadowSampler = */ isShadowTexture)

      } else if (bindingType === HdStBinding.TEXTURE_2D) {

        _AddTextureElement(this._resTextures,
          second.name, 2,
          binding.getTextureUnit())

        _EmitTextureAccessors(
          accessors, second, swizzle, fallbackSwizzle,
          /* dim = */ 2,
          /* hasTextureTransform = */ false,
          /* hasTextureScaleAndBias = */ true,
          /* isBindless = */ false,
          bindlessTextureEnabled)

      } else if (bindingType === HdStBinding.ARRAY_OF_TEXTURE_2D) {

        // Handle special case for shadow textures.
        const isShadowTexture =
          (second.name === HdStTokens.shadowCompareTextures)

        _AddArrayOfTextureElement(this._resTextures,
          second.name, 2,
          binding.getTextureUnit(),
          HioFormat.HioFormatFloat32Vec4,
          isShadowTexture
            ? TextureType.SHADOW_TEXTURE
            : TextureType.TEXTURE,
          second.arrayOfTexturesSize)

        _EmitTextureAccessors(
          accessors, second, swizzle, fallbackSwizzle,
          /* dim = */ 2,
          /* hasTextureTransform = */ false,
          /* hasTextureScaleAndBias = */ !isShadowTexture,
          /* isBindless = */ false,
          bindlessTextureEnabled,
          /* isArray = */ true,
          /* isShadowSampler = */ isShadowTexture)

      } else if (bindingType === HdStBinding.BINDLESS_TEXTURE_FIELD) {

        _EmitTextureAccessors(
          accessors, second, swizzle, fallbackSwizzle,
          /* dim = */ 3,
          /* hasTextureTransform = */ true,
          /* hasTextureScaleAndBias = */ false,
          /* isBindless = */ true,
          bindlessTextureEnabled)

      } else if (bindingType === HdStBinding.TEXTURE_FIELD) {

        _AddTextureElement(this._resTextures,
          second.name, 3,
          binding.getTextureUnit())

        _EmitTextureAccessors(
          accessors, second, swizzle, fallbackSwizzle,
          /* dim = */ 3,
          /* hasTextureTransform = */ true,
          /* hasTextureScaleAndBias = */ false,
          /* isBindless = */ false,
          bindlessTextureEnabled)

      } else if (bindingType === HdStBinding.BINDLESS_TEXTURE_CUBEMAP) {

        _EmitTextureAccessors(
          accessors, second, swizzle, fallbackSwizzle,
          /* dim = */ 2,
          /* hasTextureTransform = */ false,
          /* hasTextureScaleAndBias = */ false,
          /* isBindless = */ true,
          bindlessTextureEnabled,
          /* isArray = */ false,
          /* isShadowSampler = */ false,
          /* isCubemapSampler = */ true)

      } else if (bindingType === HdStBinding.TEXTURE_CUBEMAP) {

        _AddTextureElement(this._resTextures,
          second.name, 2,
          binding.getTextureUnit(),
          HioFormat.HioFormatFloat32Vec4,
          TextureType.CUBEMAP_TEXTURE)

        _EmitTextureAccessors(
          accessors, second, swizzle, fallbackSwizzle,
          /* dim = */ 2,
          /* hasTextureTransform = */ false,
          /* hasTextureScaleAndBias = */ false,
          /* isBindless = */ false,
          bindlessTextureEnabled,
          /* isArray = */ false,
          /* isShadowSampler = */ false,
          /* isCubemapSampler = */ true)

      } else if (bindingType === HdStBinding.BINDLESS_TEXTURE_UDIM_ARRAY) {

        _EmitTextureUdimArrayAccessors(
          accessors, second, swizzle, fallbackSwizzle,
          /* isBindless = */ true,
          bindlessTextureEnabled)

      } else if (bindingType === HdStBinding.TEXTURE_UDIM_ARRAY) {

        _AddTextureElement(this._resTextures,
          second.name, 2,
          binding.getTextureUnit(),
          HioFormat.HioFormatFloat32Vec4,
          TextureType.ARRAY_TEXTURE)

        _EmitTextureUdimArrayAccessors(
          accessors, second, swizzle, fallbackSwizzle,
          /* isBindless = */ false,
          bindlessTextureEnabled)

      } else if (bindingType === HdStBinding.TEXTURE_UDIM_LAYOUT) {

        _AddTextureElement(this._resTextures,
          second.name, 1,
          binding.getTextureUnit())

      } else if (bindingType === HdStBinding.BINDLESS_TEXTURE_PTEX_TEXEL) {

        if (second.processTextureFallbackValue) {
          accessors.write(
            _GetUnpackedType(second.dataType, false),
            ' HdGet_', second.name, '(int localIndex) {\n',
            '  int shaderCoord = GetDrawingCoord().shaderCoord; \n',
            '  if (bool(shaderData[shaderCoord].', second.name,
            ShaderDataSuffix.valid,
            ')) {\n',
            '    return ',
            _GetPackedTypeAccessor(second.dataType, false),
            '(PtexTextureLookup(',
            'sampler2DArray(shaderData[shaderCoord].',
            second.name, '),',
            'usampler1DArray(shaderData[shaderCoord].',
            second.name,
            ShaderDataSuffix.layout,
            '), ',
            'GetPatchCoord(localIndex))', swizzle, ');\n',
            '  } else {\n',
            '    return (',
            _GetPackedTypeAccessor(second.dataType, false),
            '(shaderData[shaderCoord].',
            second.name,
            ShaderDataSuffix.fallback,
            fallbackSwizzle, '))', swizzle, ';\n', '  }\n}\n',

            _GetUnpackedType(second.dataType, false),
            ' HdGet_', second.name, '(vec4 patchCoord) {\n',
            '  int shaderCoord = GetDrawingCoord().shaderCoord; \n',
            '  if (bool(shaderData[shaderCoord].', second.name,
            ShaderDataSuffix.valid,
            ')) {\n',
            '    return ',
            _GetPackedTypeAccessor(second.dataType, false),
            '(PtexTextureLookup(',
            'sampler2DArray(shaderData[shaderCoord].',
            second.name, '),',
            'usampler1DArray(shaderData[shaderCoord].',
            second.name,
            ShaderDataSuffix.layout,
            '), ',
            'patchCoord)', swizzle, ');\n',
            '  } else {\n',
            '    return (',
            _GetPackedTypeAccessor(second.dataType, false),
            '(shaderData[shaderCoord].',
            second.name,
            ShaderDataSuffix.fallback,
            fallbackSwizzle, '))', swizzle, ';\n',
            '  }\n}\n')
        } else {
          accessors.write(
            _GetUnpackedType(second.dataType, false),
            ' HdGet_', second.name, '(int localIndex) {\n',
            '  int shaderCoord = GetDrawingCoord().shaderCoord; \n',
            '  return ',
            _GetPackedTypeAccessor(second.dataType, false),
            '(PtexTextureLookup(',
            'sampler2DArray(shaderData[shaderCoord].',
            second.name, '),',
            'usampler1DArray(shaderData[shaderCoord].',
            second.name,
            ShaderDataSuffix.layout,
            '), ',
            'GetPatchCoord(localIndex))', swizzle, ');\n',
            '}\n',

            _GetUnpackedType(second.dataType, false),
            ' HdGet_', second.name, '(vec4 patchCoord) {\n',
            '  int shaderCoord = GetDrawingCoord().shaderCoord; \n',
            '  return ',
            _GetPackedTypeAccessor(second.dataType, false),
            '(PtexTextureLookup(',
            'sampler2DArray(shaderData[shaderCoord].',
            second.name, '),',
            'usampler1DArray(shaderData[shaderCoord].',
            second.name,
            ShaderDataSuffix.layout,
            '), ',
            'patchCoord)', swizzle, ');\n',
            '}\n')
        }

        accessors.write(
          _GetUnpackedType(second.dataType, false),
          ' HdGet_', second.name, '()',
          '{ return HdGet_', second.name, '(0); }\n')

        // float HdGetScalar_name()
        _EmitScalarAccessor(
          accessors, second.name, second.dataType)

        // Emit pre-multiplication by alpha indicator
        if (second.isPremultiplied) {
          accessors.write(
            '#define ', second.name, '_IS_PREMULTIPLIED 1\n')
        }

      } else if (bindingType === HdStBinding.TEXTURE_PTEX_TEXEL) {

        _AddTextureElement(this._resTextures,
          second.name, 2,
          binding.getTextureUnit(),
          HioFormat.HioFormatFloat32Vec4,
          TextureType.ARRAY_TEXTURE)
        if (second.processTextureFallbackValue) {
          accessors.write(
            _GetUnpackedType(second.dataType, false),
            ' HdGet_', second.name, '(int localIndex) {\n',
            '  int shaderCoord = GetDrawingCoord().shaderCoord; \n',
            '  if (bool(shaderData[shaderCoord].', second.name,
            ShaderDataSuffix.valid,
            ')) {\n',
            '    return ',
            _GetPackedTypeAccessor(second.dataType, false),
            '(PtexTextureLookup(',
            'HgiGetSampler_', second.name, '(), ',
            'HgiGetSampler_',
            second.name,
            ShaderDataSuffix.layout,
            '(), ',
            'GetPatchCoord(localIndex))', swizzle, ');\n',
            '  } else {\n',
            '    return (',
            _GetPackedTypeAccessor(second.dataType, false),
            '(shaderData[shaderCoord].',
            second.name,
            ShaderDataSuffix.fallback,
            fallbackSwizzle, '))', swizzle, ';\n', '  }\n}\n',

            _GetUnpackedType(second.dataType, false),
            ' HdGet_', second.name, '(vec4 patchCoord) {\n',
            '  int shaderCoord = GetDrawingCoord().shaderCoord; \n',
            '  if (bool(shaderData[shaderCoord].', second.name,
            ShaderDataSuffix.valid,
            ')) {\n',
            '    return ',
            _GetPackedTypeAccessor(second.dataType, false),
            '(PtexTextureLookup(',
            'HgiGetSampler_', second.name, '(), ',
            'HgiGetSampler_',
            second.name,
            ShaderDataSuffix.layout,
            '(), ',
            'patchCoord)', swizzle, ');\n',
            '  } else {\n',
            '    return (',
            _GetPackedTypeAccessor(second.dataType, false),
            '(shaderData[shaderCoord].',
            second.name,
            ShaderDataSuffix.fallback,
            fallbackSwizzle, '))', swizzle, ';\n',
            '  }\n}\n')
        } else {
          accessors.write(
            _GetUnpackedType(second.dataType, false),
            ' HdGet_', second.name, '(int localIndex) {\n',
            '  return ',
            _GetPackedTypeAccessor(second.dataType, false),
            '(PtexTextureLookup(',
            'HgiGetSampler_', second.name, '(), ',
            'HgiGetSampler_',
            second.name,
            ShaderDataSuffix.layout,
            '(), ',
            'GetPatchCoord(localIndex))', swizzle, ');\n',
            '}\n',

            _GetUnpackedType(second.dataType, false),
            ' HdGet_', second.name, '(vec4 patchCoord) {\n',
            '  return ',
            _GetPackedTypeAccessor(second.dataType, false),
            '(PtexTextureLookup(',
            'HgiGetSampler_', second.name, '(), ',
            'HgiGetSampler_',
            second.name,
            ShaderDataSuffix.layout,
            '(), ',
            'patchCoord)', swizzle, ');\n',
            '}\n')
        }

        accessors.write(
          _GetUnpackedType(second.dataType, false),
          ' HdGet_', second.name, '()',
          '{ return HdGet_', second.name, '(0); }\n')

        // float HdGetScalar_name()
        _EmitScalarAccessor(
          accessors, second.name, second.dataType)

        // Emit pre-multiplication by alpha indicator
        if (second.isPremultiplied) {
          accessors.write(
            '#define ', second.name, '_IS_PREMULTIPLIED 1\n')
        }

      } else if (bindingType === HdStBinding.BINDLESS_TEXTURE_PTEX_LAYOUT) {

        //_genAccessors << _GetUnpackedType(it->second.dataType) << "(0)";

      } else if (bindingType === HdStBinding.TEXTURE_PTEX_LAYOUT) {

        _AddTextureElement(this._resTextures,
          second.name, 1,
          binding.getTextureUnit(),
          HioFormat.HioFormatUInt16,
          TextureType.ARRAY_TEXTURE)

      } else if (bindingType === HdStBinding.PRIMVAR_REDIRECT) {

        // Create an HdGet_INPUTNAME for the shader to access a primvar
        // for which a HdGet_PRIMVARNAME was already generated earlier.

        // XXX: shader and primvar name collisions are a problem!
        // (see, e.g., HYD-1800).
        if (second.name === second.inPrimvars[0]) {
          // Avoid the following:
          // If INPUTNAME and PRIMVARNAME are the same and the
          // primvar exists, we would generate two functions
          // both called HdGet_PRIMVAR, one to read the primvar
          // (based on _metaData->constantData) and one for the
          // primvar redirect here.
          accessors.write(
            '#if !defined(HD_HAS_', second.name, ')\n')
        }

        accessors.write(
          _GetUnpackedType(second.dataType, false),
          ' HdGet_', second.name, '() {\n',
          // If primvar exists, use it
          '#if defined(HD_HAS_', second.inPrimvars[0]!, ')\n',
          '  return HdGet_', second.inPrimvars[0]!, '();\n',
          '#else\n',
          // Otherwise use default value.
          '  int shaderCoord = GetDrawingCoord().shaderCoord;\n',
          '  return ',
          _GetPackedTypeAccessor(second.dataType, false),
          '(shaderData[shaderCoord].',
          second.name, ShaderDataSuffix.fallback,
          fallbackSwizzle, ');\n',
          '#endif\n',
          '\n}\n',
          '#define HD_HAS_', second.name, ' 1\n')

        // Emit scalar accessors to support shading languages like MSL which
        // do not support swizzle operators on scalar values.
        if (_GetNumComponents(second.dataType) <= 4) {
          accessors.write(
            _GetFlatType(second.dataType), ' HdGetScalar_',
            second.name, '()',
            ' { return HdGet_', second.name, '()',
            _GetFlatTypeSwizzleString(second.dataType),
            '; }\n')
        }

        if (second.name === second.inPrimvars[0]) {
          accessors.write(
            '#endif\n')
        }

      } else if (bindingType === HdStBinding.TRANSFORM_2D) {

        // Forward declare rotation, scale, and translation
        accessors.write(
          'FORWARD_DECL(float HdGet_', second.name, '_',
          HdStTokens.rotation, '());\n',
          'FORWARD_DECL(vec2 HdGet_', second.name, '_',
          HdStTokens.scale, '());\n',
          'FORWARD_DECL(vec2 HdGet_', second.name, '_',
          HdStTokens.translation, '());\n')

        // vec2 HdGet_name(int localIndex)
        accessors.write(
          _GetUnpackedType(second.dataType, false),
          ' HdGet_', second.name, '(int localIndex) {\n',
          '  float angleRad = HdGet_', second.name, '_',
          HdStTokens.rotation, '()',
          ' * 3.1415926f / 180.f;\n',
          '  mat2 rotMat = mat2(cos(angleRad), sin(angleRad), ',
          '-sin(angleRad), cos(angleRad)); \n')
        // If primvar exists, use it
        if (second.inPrimvars.length !== 0) {
          accessors.write(
            '#if defined(HD_HAS_', second.inPrimvars[0]!, ')\n',
            '  return vec2(HdGet_', second.name, '_',
            HdStTokens.translation, '() + rotMat * (HdGet_',
            second.name, '_', HdStTokens.scale, '() * ',
            'HdGet_', second.inPrimvars[0]!, '(localIndex)));\n',
            '#else\n')
        }
        // Otherwise use default value.
        accessors.write(
          '  int shaderCoord = GetDrawingCoord().shaderCoord;\n',
          '  return vec2(HdGet_', second.name, '_',
          HdStTokens.translation, '() + rotMat * (HdGet_',
          second.name, '_', HdStTokens.scale, '() * ',
          'shaderData[shaderCoord].', second.name,
          ShaderDataSuffix.fallback, fallbackSwizzle,
          '));\n')
        if (second.inPrimvars.length !== 0) {
          accessors.write('#endif\n')
        }
        accessors.write('}\n')

        // vec2 HdGet_name()
        accessors.write(
          _GetUnpackedType(second.dataType, false),
          ' HdGet_', second.name, '() {\n',
          '  return HdGet_', second.name, '(0);\n',
          '}\n')
      }
    }


    accessors.write(
      'void ProcessSamplingTransforms(',
      'MAT4 instanceModelViewInverse) {\n')

    for (const [first, second] of this._metaData.shaderParameterBinding) {
      const bindingType = first.getType()

      if (bindingType === HdStBinding.TEXTURE_FIELD ||
          bindingType === HdStBinding.BINDLESS_TEXTURE_FIELD) {

        const eyeToSamplingTransform =
          'eyeTo' + second.name + 'SamplingTransform'

        accessors.write(
          '    Process_', eyeToSamplingTransform,
          '(instanceModelViewInverse);\n')
      }
    }

    accessors.write(
      '}\n')

    // Field redirect accessors, need to access above field textures.
    for (const [first, second] of this._metaData.shaderParameterBinding) {
      const bindingType = first.getType()

      if (bindingType === HdStBinding.FIELD_REDIRECT) {

        // adjust datatype
        const swizzle = _GetSwizzleString(second.dataType)
        const fallbackSwizzle =
          this._getFallbackScalarSwizzleString(second.dataType,
            second.name)

        const fieldName =
          second.inPrimvars.length === 0
            ? TfToken('FIELDNAME_WAS_NOT_SPECIFIED')
            : second.inPrimvars[0]!

        // Create an HdGet_INPUTNAME(vec3) for the shader to access a
        // field texture HdGet_FIELDNAMETexture(vec3).
        accessors.write(
          _GetUnpackedType(second.dataType, false),
          ' HdGet_', second.name, '(vec3 coord) {\n',
          // If field exists, use it
          '#if defined(HD_HAS_',
          fieldName, ShaderDataSuffix.texture,
          ')\n',
          '  return HdGet_',
          fieldName, ShaderDataSuffix.texture,
          '(coord)',
          swizzle, ';\n',
          '#else\n',
          // Otherwise use default value.
          '  int shaderCoord = GetDrawingCoord().shaderCoord;\n',
          '  return ',
          _GetPackedTypeAccessor(second.dataType, false),
          '(shaderData[shaderCoord].',
          second.name, ShaderDataSuffix.fallback,
          fallbackSwizzle, ');\n',
          '#endif\n',
          '\n}\n')
      }
    }

    this._genGS.write(accessors.str())
    this._genFS.write(accessors.str())
    this._genPTCS.write(accessors.str())
    this._genPTVS.write(accessors.str())
  }

  /** codeGen.cpp:7165-7206 */
  private _generateTopologyVisibilityParameters(): void {
    const declarations = new _Stream()
    const accessors = new _Stream()
    for (const [binding, block] of this._metaData.topologyVisibilityData) {
      // See note in _GenerateConstantPrimvar re: padding.
      const typeName = TfToken(`TopologyVisibilityData${binding.GetValue()}`)
      const varName = block.blockName

      declarations.write('struct ', typeName, ' {\n')

      for (const dbIt of block.entries) {
        if (!TF_VERIFY(dbIt.dataType.length !== 0,
          `Unknown dataType for ${dbIt.name}`)) {
          continue
        }

        declarations.write('  ', _GetPackedType(dbIt.dataType, false),
          ' ', dbIt.name)
        if (dbIt.arraySize > 1) {
          declarations.write('[', dbIt.arraySize, ']')
        }

        declarations.write(';\n')

        _EmitStructAccessor(accessors, varName, dbIt.name, dbIt.dataType,
          dbIt.arraySize,
          'GetDrawingCoord().topologyVisibilityCoord')
      }
      declarations.write('};\n')

      // codeGen.cpp:7199-7200 passes 1 (/*arraySize=*/) in the isWritable
      // position.
      _EmitDeclaration(this._resCommon, varName, typeName, binding,
        /*arraySize=*/true)
    }

    this._genDecl.write(declarations.str())
    this._genAccessors.write(accessors.str())
  }

  /** codeGen.cpp:7208-7233 */
  private _getFallbackScalarSwizzleString(returnType: TfToken,
    paramName: TfToken): string {
    if (!_IsScalarType(returnType)) {
      return ''
    }

    // TODO: More efficient way of either specifying this at a higher level
    // or calculating it in codeGen
    const fallbackParamName = TfToken(paramName +
      HdSt_ResourceBindingSuffixTokens.fallback)
    for (const [, block] of this._metaData.shaderData) {
      for (const dbIt of block.entries) {
        if (dbIt.name === fallbackParamName) {
          if (!_IsScalarType(dbIt.dataType)) {
            return '.x'
          }
          return ''
        }
      }
    }

    return ''
  }


  /** codeGen.h:95-120 */
  getVertexShaderSource(): string { return this._vsSource }
  getTessControlShaderSource(): string { return this._tcsSource }
  getTessEvalShaderSource(): string { return this._tesSource }
  getGeometryShaderSource(): string { return this._gsSource }
  getFragmentShaderSource(): string { return this._fsSource }
  getComputeShaderSource(): string { return this._csSource }
  getPostTessControlShaderSource(): string { return this._ptcsSource }
  getPostTessVertexShaderSource(): string { return this._ptvsSource }

  /** codeGen.h:176-178 */
  private _getMetaData(): HdSt_ResourceBinderMetaData {
    return this._metaData
  }
}
