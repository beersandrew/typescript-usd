// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/glConversions.cpp,
//  pxr/imaging/hdSt/glConversions.h, pxr/imaging/garch/glApi.h
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/glConversions.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - GLenum values come from garch/glApi.h upstream; the ones used here are
//   defined locally with their OpenGL values.
// - GetGLAttribType's `return -1` as GLenum is 0xFFFFFFFF.

import { Token as TfToken, MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import {
  Type as HdType,
  type CompareFunction as HdCompareFunction,
  type StencilOp as HdStencilOp,
  type BlendOp as HdBlendOp,
  type BlendFactor as HdBlendFactor,
} from 'typescript-usd/hd'
import {
  HdSt_GeometricShaderPrimitiveType,
  type HdSt_GeometricShader,
} from './geometricShader.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

export type GLenum = number

// OpenGL enum values (garch/glApi.h; Khronos gl.h).
const GL_NONE = 0
const GL_ZERO = 0
const GL_ONE = 1
const GL_POINTS = 0x0000
const GL_LINES = 0x0001
const GL_TRIANGLES = 0x0004
const GL_LINES_ADJACENCY = 0x000A
const GL_PATCHES = 0x000E
const GL_NEVER = 0x0200
const GL_LESS = 0x0201
const GL_EQUAL = 0x0202
const GL_LEQUAL = 0x0203
const GL_GREATER = 0x0204
const GL_NOTEQUAL = 0x0205
const GL_GEQUAL = 0x0206
const GL_ALWAYS = 0x0207
const GL_SRC_COLOR = 0x0300
const GL_ONE_MINUS_SRC_COLOR = 0x0301
const GL_SRC_ALPHA = 0x0302
const GL_ONE_MINUS_SRC_ALPHA = 0x0303
const GL_DST_ALPHA = 0x0304
const GL_ONE_MINUS_DST_ALPHA = 0x0305
const GL_DST_COLOR = 0x0306
const GL_ONE_MINUS_DST_COLOR = 0x0307
const GL_SRC_ALPHA_SATURATE = 0x0308
const GL_INVERT = 0x150A
const GL_KEEP = 0x1E00
const GL_REPLACE = 0x1E01
const GL_INCR = 0x1E02
const GL_DECR = 0x1E03
const GL_INT = 0x1404
const GL_UNSIGNED_INT = 0x1405
const GL_FLOAT = 0x1406
const GL_DOUBLE = 0x140A
const GL_HALF_FLOAT = 0x140B
const GL_CONSTANT_COLOR = 0x8001
const GL_ONE_MINUS_CONSTANT_COLOR = 0x8002
const GL_CONSTANT_ALPHA = 0x8003
const GL_ONE_MINUS_CONSTANT_ALPHA = 0x8004
const GL_FUNC_ADD = 0x8006
const GL_MIN = 0x8007
const GL_MAX = 0x8008
const GL_FUNC_SUBTRACT = 0x800A
const GL_FUNC_REVERSE_SUBTRACT = 0x800B
const GL_INCR_WRAP = 0x8507
const GL_DECR_WRAP = 0x8508
const GL_SRC1_ALPHA = 0x8589
const GL_SRC1_COLOR = 0x88F9
const GL_ONE_MINUS_SRC1_COLOR = 0x88FA
const GL_INT_2_10_10_10_REV = 0x8D9F

/** glConversions.cpp:22-32 */
const HD_2_GL_DEPTH_FUNC: GLenum[] = [
  GL_NEVER,    // HdCmpFuncNever
  GL_LESS,     // HdCmpFuncLess
  GL_EQUAL,    // HdCmpFuncEqual
  GL_LEQUAL,   // HdCmpFuncLEqual
  GL_GREATER,  // HdCmpFuncGreater
  GL_NOTEQUAL, // HdCmpFuncNotEqual
  GL_GEQUAL,   // HdCmpFuncGEqual
  GL_ALWAYS,   // HdCmpFuncAlways
]

/** glConversions.cpp:43-53 */
const HD_2_GL_STENCIL_FUNC: GLenum[] = [
  GL_NEVER,    // HdCmpFuncNever
  GL_LESS,     // HdCmpFuncLess
  GL_EQUAL,    // HdCmpFuncEqual
  GL_LEQUAL,   // HdCmpFuncLEqual
  GL_GREATER,  // HdCmpFuncGreater
  GL_NOTEQUAL, // HdCmpFuncNotEqual
  GL_GEQUAL,   // HdCmpFuncGEqual
  GL_ALWAYS,   // HdCmpFuncAlways
]

/** glConversions.cpp:64-74 */
const HD_2_GL_STENCIL_OP: GLenum[] = [
  GL_KEEP,      // HdStencilOpKeep
  GL_ZERO,      // HdStencilOpZero
  GL_REPLACE,   // HdStencilOpReplace
  GL_INCR,      // HdStencilOpIncrement
  GL_INCR_WRAP, // HdStencilOpIncrementWrap
  GL_DECR,      // HdStencilOpDecrement
  GL_DECR_WRAP, // HdStencilOpDecrementWrap
  GL_INVERT,    // HdStencilOpInvert
]

/** glConversions.cpp:85-92 */
const HD_2_GL_BLEND_OP: GLenum[] = [
  GL_FUNC_ADD,              // HdBlendOpAdd
  GL_FUNC_SUBTRACT,         // HdBlendOpSubtract
  GL_FUNC_REVERSE_SUBTRACT, // HdBlendOpReverseSubtract
  GL_MIN,                   // HdBlendOpMin
  GL_MAX,                   // HdBlendOpMax
]

/** glConversions.cpp:103-124 */
const HD_2_GL_BLEND_FACTOR: GLenum[] = [
  GL_ZERO,                        // HdBlendFactorZero,
  GL_ONE,                         // HdBlendFactorOne,
  GL_SRC_COLOR,                   // HdBlendFactorSrcColor,
  GL_ONE_MINUS_SRC_COLOR,         // HdBlendFactorOneMinusSrcColor,
  GL_DST_COLOR,                   // HdBlendFactorDstColor,
  GL_ONE_MINUS_DST_COLOR,         // HdBlendFactorOneMinusDstColor,
  GL_SRC_ALPHA,                   // HdBlendFactorSrcAlpha,
  GL_ONE_MINUS_SRC_ALPHA,         // HdBlendFactorOneMinusSrcAlpha,
  GL_DST_ALPHA,                   // HdBlendFactorDstAlpha,
  GL_ONE_MINUS_DST_ALPHA,         // HdBlendFactorOneMinusDstAlpha,
  GL_CONSTANT_COLOR,              // HdBlendFactorConstantColor,
  GL_ONE_MINUS_CONSTANT_COLOR,    // HdBlendFactorOneMinusConstantColor,
  GL_CONSTANT_ALPHA,              // HdBlendFactorConstantAlpha,
  GL_ONE_MINUS_CONSTANT_ALPHA,    // HdBlendFactorOneMinusConstantAlpha,
  GL_SRC_ALPHA_SATURATE,          // HdBlendFactorSrcAlphaSaturate,
  GL_SRC1_COLOR,                  // HdBlendFactorSrc1Color,
  GL_ONE_MINUS_SRC1_COLOR,        // HdBlendFactorOneMinusSrc1Color,
  GL_SRC1_ALPHA,                  // HdBlendFactorSrc1Alpha,
  GL_ONE_MINUS_SRC1_COLOR,        // HdBlendFactorOneMinusSrc1Alpha,
]

/** TF_DEFINE_PRIVATE_TOKENS (glConversions.cpp:211-242) */
const _glTypeNames = TfMakeTokens({
  _bool: 'bool',

  _float: 'float',
  vec2: 'vec2',
  vec3: 'vec3',
  vec4: 'vec4',
  mat3: 'mat3',
  mat4: 'mat4',

  _double: 'double',
  dvec2: 'dvec2',
  dvec3: 'dvec3',
  dvec4: 'dvec4',
  dmat3: 'dmat3',
  dmat4: 'dmat4',

  _int: 'int',
  ivec2: 'ivec2',
  ivec3: 'ivec3',
  ivec4: 'ivec4',

  _uint: 'uint',
  uvec2: 'uvec2',
  uvec3: 'uvec3',
  uvec4: 'uvec4',

  packed_2_10_10_10: 'packed_2_10_10_10',
  packed_half2: 'packed_half2',
  packed_half4: 'packed_half4',
})

/** C isalpha in the "C" locale. */
function _isalpha(c: string): boolean {
  return /^[A-Za-z]$/.test(c)
}

/** C isalnum in the "C" locale. */
function _isalnum(c: string): boolean {
  return /^[A-Za-z0-9]$/.test(c)
}

/** glConversions.cpp:314-342. This isn't an exhaustive checker. It doesn't
 *  check for built-in/internal variable names in GLSL, reserved keywords and
 *  such. */
function _IsIdentiferGLSLCompatible(inStr: string): boolean {
  let p = 0

  // Leading non-alpha characters are not allowed.
  if (p < inStr.length && !_isalpha(inStr[p]!)) {
    return false
  }
  // Characters must be in [_a-zA-Z0-9]
  while (p < inStr.length) {
    if (_isalnum(inStr[p]!)) {
      p++
    } else {
      // _ is allowed, but __ isn't
      if (inStr[p] === '_' && inStr[p - 1] !== '_') {
        // checking the last character is safe here, because of the
        // earlier check for leading non-alpha characters.
        p++
      } else {
        return false
      }
    }
  }

  return true
}

/** glConversions.h:22-55 */
export class HdStGLConversions {
  /** glConversions.cpp:19-38 */
  static getGlDepthFunc(func: HdCompareFunction): GLenum {
    return HD_2_GL_DEPTH_FUNC[func]!
  }

  /** glConversions.cpp:40-59 */
  static getGlStencilFunc(func: HdCompareFunction): GLenum {
    return HD_2_GL_STENCIL_FUNC[func]!
  }

  /** glConversions.cpp:61-80 */
  static getGlStencilOp(op: HdStencilOp): GLenum {
    return HD_2_GL_STENCIL_OP[op]!
  }

  /** glConversions.cpp:82-98 */
  static getGlBlendOp(op: HdBlendOp): GLenum {
    return HD_2_GL_BLEND_OP[op]!
  }

  /** glConversions.cpp:100-130 */
  static getGlBlendFactor(factor: HdBlendFactor): GLenum {
    return HD_2_GL_BLEND_FACTOR[factor]!
  }

  /** glConversions.cpp:132-169 */
  static getGLAttribType(type: HdType): GLenum {
    switch (type) {
      case HdType.HdTypeHalfFloatVec2:
      case HdType.HdTypeHalfFloatVec4:
        return GL_HALF_FLOAT
      case HdType.HdTypeInt32:
      case HdType.HdTypeInt32Vec2:
      case HdType.HdTypeInt32Vec3:
      case HdType.HdTypeInt32Vec4:
        return GL_INT
      case HdType.HdTypeUInt32:
      case HdType.HdTypeUInt32Vec2:
      case HdType.HdTypeUInt32Vec3:
      case HdType.HdTypeUInt32Vec4:
        return GL_UNSIGNED_INT
      case HdType.HdTypeFloat:
      case HdType.HdTypeFloatVec2:
      case HdType.HdTypeFloatVec3:
      case HdType.HdTypeFloatVec4:
      case HdType.HdTypeFloatMat3:
      case HdType.HdTypeFloatMat4:
        return GL_FLOAT
      case HdType.HdTypeDouble:
      case HdType.HdTypeDoubleVec2:
      case HdType.HdTypeDoubleVec3:
      case HdType.HdTypeDoubleVec4:
      case HdType.HdTypeDoubleMat3:
      case HdType.HdTypeDoubleMat4:
        return GL_DOUBLE
      case HdType.HdTypeInt32_2_10_10_10_REV:
        return GL_INT_2_10_10_10_REV
      default:
        break
    }
    // `return -1` converted to the unsigned GLenum.
    return 0xFFFFFFFF
  }

  /** glConversions.cpp:171-209 */
  static getPrimitiveMode(geometricShader: HdSt_GeometricShader): GLenum {
    let primMode: GLenum = GL_POINTS

    const PrimitiveType = HdSt_GeometricShaderPrimitiveType
    switch (geometricShader.getPrimitiveType()) {
      case PrimitiveType.PRIM_POINTS:
        primMode = GL_POINTS
        break
      case PrimitiveType.PRIM_BASIS_CURVES_LINES:
        primMode = GL_LINES
        break
      case PrimitiveType.PRIM_MESH_COARSE_TRIANGLES:
      case PrimitiveType.PRIM_MESH_REFINED_TRIANGLES:
      case PrimitiveType.PRIM_MESH_COARSE_TRIQUADS:
      case PrimitiveType.PRIM_MESH_REFINED_TRIQUADS:
      case PrimitiveType.PRIM_VOLUME:
        primMode = GL_TRIANGLES
        break
      case PrimitiveType.PRIM_MESH_COARSE_QUADS:
      case PrimitiveType.PRIM_MESH_REFINED_QUADS:
        primMode = GL_LINES_ADJACENCY
        break
      case PrimitiveType.PRIM_BASIS_CURVES_CUBIC_PATCHES:
      case PrimitiveType.PRIM_BASIS_CURVES_LINEAR_PATCHES:
      case PrimitiveType.PRIM_MESH_BSPLINE:
      case PrimitiveType.PRIM_MESH_BOXSPLINETRIANGLE:
        primMode = GL_PATCHES
        break
      case PrimitiveType.PRIM_COMPUTE:
        primMode = GL_NONE
        break
    }

    return primMode
  }

  /** glConversions.cpp:244-312. Return the name of the given type as
   *  represented in GLSL. */
  static getGLSLTypename(type: HdType): TfToken {
    switch (type) {
      case HdType.HdTypeInvalid:
      default:
        return TfToken()

      // Packed types (require special handling in codegen)...
      case HdType.HdTypeInt32_2_10_10_10_REV:
        return _glTypeNames.packed_2_10_10_10
      // XXX: Note that we don't support half or half3, since we can't
      // index-address them...
      case HdType.HdTypeHalfFloatVec2:
        return _glTypeNames.packed_half2
      case HdType.HdTypeHalfFloatVec4:
        return _glTypeNames.packed_half4

      case HdType.HdTypeBool:
        return _glTypeNames._bool

      case HdType.HdTypeInt16:
      case HdType.HdTypeInt32:
        return _glTypeNames._int
      case HdType.HdTypeInt32Vec2:
        return _glTypeNames.ivec2
      case HdType.HdTypeInt32Vec3:
        return _glTypeNames.ivec3
      case HdType.HdTypeInt32Vec4:
        return _glTypeNames.ivec4

      case HdType.HdTypeUInt8:
      case HdType.HdTypeUInt16:
      case HdType.HdTypeUInt32:
        return _glTypeNames._uint
      case HdType.HdTypeUInt32Vec2:
        return _glTypeNames.uvec2
      case HdType.HdTypeUInt32Vec3:
        return _glTypeNames.uvec3
      case HdType.HdTypeUInt32Vec4:
        return _glTypeNames.uvec4

      case HdType.HdTypeFloat:
        return _glTypeNames._float
      case HdType.HdTypeFloatVec2:
        return _glTypeNames.vec2
      case HdType.HdTypeFloatVec3:
        return _glTypeNames.vec3
      case HdType.HdTypeFloatVec4:
        return _glTypeNames.vec4
      case HdType.HdTypeFloatMat3:
        return _glTypeNames.mat3
      case HdType.HdTypeFloatMat4:
        return _glTypeNames.mat4

      case HdType.HdTypeDouble:
        return _glTypeNames._double
      case HdType.HdTypeDoubleVec2:
        return _glTypeNames.dvec2
      case HdType.HdTypeDoubleVec3:
        return _glTypeNames.dvec3
      case HdType.HdTypeDoubleVec4:
        return _glTypeNames.dvec4
      case HdType.HdTypeDoubleMat3:
        return _glTypeNames.dmat3
      case HdType.HdTypeDoubleMat4:
        return _glTypeNames.dmat4
    }
  }

  /** glConversions.cpp:344-392. Return a GLSL-safe, mangled name
   *  identifier. */
  static getGLSLIdentifier(identifier: TfToken): TfToken {
    const inStr: string = identifier
    // Avoid allocating a string and constructing a token for the general case,
    // wherein identifiers conform to the naming rules.
    if (_IsIdentiferGLSLCompatible(inStr)) {
      return identifier
    }

    // Name-mangling rules:
    // https://www.khronos.org/registry/OpenGL/specs/gl/GLSLangSpec.4.60.pdf
    // We choose to specifically disallow:
    // 1) Leading non-alpha characters: GLSL allows leading underscores, but we
    //    choose to reserve them for internal use.
    // 2) Consecutive underscores: To avoid unintended GLSL behaviors.
    //
    // Upstream walks UTF-8 bytes; every non-ASCII byte maps to '_' and runs
    // of '_' collapse, so walking UTF-16 code units gives the same result.
    let result = ''
    let p = 0

    // Skip leading non-alpha characters.
    while (p < inStr.length && !_isalpha(inStr[p]!)) {
      ++p
    }
    for (; p < inStr.length; ++p) {
      const c = inStr[p]!
      const isValidChar = _isalnum(c) || (c === '_')
      if (!isValidChar) {
        // Replace characters not in [_a-zA-Z0-9] with _, unless the last
        // character  added was also _.
        // Calling back() is safe here because the first character is either
        // alpha-numeric or null, as guaranteed by the while loop above.
        if (result[result.length - 1] !== '_') {
          result += '_'
        }
      } else if (c === '_' && result[result.length - 1] === '_') {
        // no-op to skip consecutive _
      } else {
        result += c
      }
    }

    if (result.length === 0) {
      TF_CODING_ERROR(`Invalid identifier '${identifier}' could not be name-mangled`)
      return identifier
    }

    return TfToken(result)
  }
}
