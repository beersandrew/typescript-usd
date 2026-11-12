// Ported from MaterialX 1.39.5: source/MaterialXGenGlsl/GlslSyntax.h,
//  source/MaterialXGenGlsl/GlslSyntax.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenGlsl/GlslSyntax.h and .cpp

import { EMPTY_STRING, Value, splitString, trimSpaces, type AggregateValue, type StringMap } from '@mtlx/core'
import {
  AggregateTypeSyntax,
  ExceptionShaderGenError,
  ScalarTypeSyntax,
  StringTypeSyntax,
  StructTypeSyntax,
  Syntax,
  Type,
  TypeDesc,
  TypeSystem,
} from '@mtlx/genshader'

// Since GLSL doesn't support strings we use integers instead.
// TODO: Support options strings by converting to a corresponding enum integer
class GlslStringTypeSyntax extends StringTypeSyntax {
  constructor(parent: Syntax) {
    super(parent, 'int', '0', '0')
  }

  override getValue(_value: Value, _uniform: boolean): string {
    return '0'
  }
}

abstract class GlslArrayTypeSyntax extends ScalarTypeSyntax {
  constructor(parent: Syntax, name: string) {
    super(parent, name, EMPTY_STRING, EMPTY_STRING, EMPTY_STRING)
  }

  override getValue(value: Value, _uniform: boolean): string {
    const arraySize = this.getSize(value)
    if (arraySize > 0) {
      return this._name + '[' + String(arraySize) + '](' + value.getValueString() + ')'
    }
    return EMPTY_STRING
  }

  protected abstract getSize(value: Value): number
}

class GlslFloatArrayTypeSyntax extends GlslArrayTypeSyntax {
  protected getSize(value: Value): number {
    const valueArray = (value as unknown as { getData(): unknown }).getData() as number[]
    return valueArray.length
  }
}

class GlslIntegerArrayTypeSyntax extends GlslArrayTypeSyntax {
  protected getSize(value: Value): number {
    const valueArray = (value as unknown as { getData(): unknown }).getData() as number[]
    return valueArray.length
  }
}

// Syntax class for GLSL (OpenGL Shading Language)
export class GlslSyntax extends Syntax {
  static readonly INPUT_QUALIFIER = 'in'
  static readonly OUTPUT_QUALIFIER = 'out'
  static readonly UNIFORM_QUALIFIER = 'uniform'
  static readonly CONSTANT_QUALIFIER = 'const'
  static readonly FLAT_QUALIFIER = 'flat'
  static readonly SOURCE_FILE_EXTENSION = '.glsl'

  static readonly VEC2_MEMBERS = ['.x', '.y']
  static readonly VEC3_MEMBERS = ['.x', '.y', '.z']
  static readonly VEC4_MEMBERS = ['.x', '.y', '.z', '.w']

  constructor(typeSystem: TypeSystem) {
    super(typeSystem)

    // Add in all reserved words and keywords in GLSL
    this.registerReservedWords([
      'centroid', 'flat', 'smooth', 'noperspective', 'patch', 'sample',
      'break', 'continue', 'do', 'for', 'while', 'switch', 'case', 'default',
      'if', 'else,', 'subroutine', 'in', 'out', 'inout',
      'float', 'double', 'int', 'void', 'bool', 'true', 'false',
      'invariant', 'discard', 'return',
      'mat2', 'mat3', 'mat4', 'dmat2', 'dmat3', 'dmat4',
      'mat2x2', 'mat2x3', 'mat2x4', 'dmat2x2', 'dmat2x3', 'dmat2x4',
      'mat3x2', 'mat3x3', 'mat3x4', 'dmat3x2', 'dmat3x3', 'dmat3x4',
      'mat4x2', 'mat4x3', 'mat4x4', 'dmat4x2', 'dmat4x3', 'dmat4x4',
      'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'bvec2', 'bvec3', 'bvec4', 'dvec2', 'dvec3', 'dvec4',
      'uint', 'uvec2', 'uvec3', 'uvec4',
      'lowp', 'mediump', 'highp', 'precision',
      'sampler1D', 'sampler2D', 'sampler3D', 'samplerCube',
      'sampler1DShadow', 'sampler2DShadow', 'samplerCubeShadow',
      'sampler1DArray', 'sampler2DArray',
      'sampler1DArrayShadow', 'sampler2DArrayShadow',
      'isampler1D', 'isampler2D', 'isampler3D', 'isamplerCube',
      'isampler1DArray', 'isampler2DArray',
      'usampler1D', 'usampler2D', 'usampler3D', 'usamplerCube',
      'usampler1DArray', 'usampler2DArray',
      'sampler2DRect', 'sampler2DRectShadow', 'isampler2DRect', 'usampler2DRect',
      'samplerBuffer', 'isamplerBuffer', 'usamplerBuffer',
      'sampler2DMS', 'isampler2DMS', 'usampler2DMS',
      'sampler2DMSArray', 'isampler2DMSArray', 'usampler2DMSArray',
      'samplerCubeArray', 'samplerCubeArrayShadow', 'isamplerCubeArray', 'usamplerCubeArray',
      'common', 'partition', 'active', 'asm',
      'struct', 'class', 'union', 'enum', 'typedef', 'template', 'this', 'packed', 'goto',
      'inline', 'noinline', 'volatile', 'public', 'static', 'extern', 'external', 'interface',
      'long', 'short', 'half', 'fixed', 'unsigned', 'superp', 'input', 'output',
      'hvec2', 'hvec3', 'hvec4', 'fvec2', 'fvec3', 'fvec4',
      'sampler3DRect', 'filter',
      'image1D', 'image2D', 'image3D', 'imageCube',
      'iimage1D', 'iimage2D', 'iimage3D', 'iimageCube',
      'uimage1D', 'uimage2D', 'uimage3D', 'uimageCube',
      'image1DArray', 'image2DArray',
      'iimage1DArray', 'iimage2DArray', 'uimage1DArray', 'uimage2DArray',
      'image1DShadow', 'image2DShadow',
      'image1DArrayShadow', 'image2DArrayShadow',
      'imageBuffer', 'iimageBuffer', 'uimageBuffer',
      'sizeof', 'cast', 'namespace', 'using', 'row_major',
      'mix', 'sampler',
    ])

    // Register restricted tokens in GLSL
    const tokens: StringMap = new Map([
      ['__', '_'],
      ['gl_', 'gll'],
      ['webgl_', 'webgll'],
      ['_webgl', 'wwebgl'],
    ])
    this.registerInvalidTokens(tokens)

    //
    // Register syntax handlers for each data type.
    //

    this.registerTypeSyntax(Type.FLOAT, new ScalarTypeSyntax(this, 'float', '0.0', '0.0'))

    this.registerTypeSyntax(Type.FLOATARRAY, new GlslFloatArrayTypeSyntax(this, 'float'))

    this.registerTypeSyntax(Type.INTEGER, new ScalarTypeSyntax(this, 'int', '0', '0'))

    this.registerTypeSyntax(Type.INTEGERARRAY, new GlslIntegerArrayTypeSyntax(this, 'int'))

    this.registerTypeSyntax(Type.BOOLEAN, new ScalarTypeSyntax(this, 'bool', 'false', 'false'))

    this.registerTypeSyntax(
      Type.COLOR3,
      new AggregateTypeSyntax(this, 'vec3', 'vec3(0.0)', 'vec3(0.0)', EMPTY_STRING, EMPTY_STRING, GlslSyntax.VEC3_MEMBERS),
    )

    this.registerTypeSyntax(
      Type.COLOR4,
      new AggregateTypeSyntax(this, 'vec4', 'vec4(0.0)', 'vec4(0.0)', EMPTY_STRING, EMPTY_STRING, GlslSyntax.VEC4_MEMBERS),
    )

    this.registerTypeSyntax(
      Type.VECTOR2,
      new AggregateTypeSyntax(this, 'vec2', 'vec2(0.0)', 'vec2(0.0)', EMPTY_STRING, EMPTY_STRING, GlslSyntax.VEC2_MEMBERS),
    )

    this.registerTypeSyntax(
      Type.VECTOR3,
      new AggregateTypeSyntax(this, 'vec3', 'vec3(0.0)', 'vec3(0.0)', EMPTY_STRING, EMPTY_STRING, GlslSyntax.VEC3_MEMBERS),
    )

    this.registerTypeSyntax(
      Type.VECTOR4,
      new AggregateTypeSyntax(this, 'vec4', 'vec4(0.0)', 'vec4(0.0)', EMPTY_STRING, EMPTY_STRING, GlslSyntax.VEC4_MEMBERS),
    )

    this.registerTypeSyntax(Type.MATRIX33, new AggregateTypeSyntax(this, 'mat3', 'mat3(1.0)', 'mat3(1.0)'))

    this.registerTypeSyntax(Type.MATRIX44, new AggregateTypeSyntax(this, 'mat4', 'mat4(1.0)', 'mat4(1.0)'))

    this.registerTypeSyntax(Type.STRING, new GlslStringTypeSyntax(this))

    this.registerTypeSyntax(Type.FILENAME, new ScalarTypeSyntax(this, 'sampler2D', EMPTY_STRING, EMPTY_STRING))

    this.registerTypeSyntax(
      Type.BSDF,
      new AggregateTypeSyntax(
        this,
        'BSDF',
        'BSDF(vec3(0.0),vec3(1.0))',
        EMPTY_STRING,
        EMPTY_STRING,
        'struct BSDF { vec3 response; vec3 throughput; };',
      ),
    )

    this.registerTypeSyntax(
      Type.EDF,
      new AggregateTypeSyntax(this, 'EDF', 'EDF(0.0)', 'EDF(0.0)', 'vec3', '#define EDF vec3'),
    )

    this.registerTypeSyntax(
      Type.VDF,
      new AggregateTypeSyntax(
        this,
        'VDF',
        'VDF(vec3(0.0),vec3(1.0))',
        EMPTY_STRING,
        EMPTY_STRING,
        'struct VDF { vec3 response; vec3 throughput; };',
      ),
    )

    this.registerTypeSyntax(
      Type.SURFACESHADER,
      new AggregateTypeSyntax(
        this,
        'surfaceshader',
        'surfaceshader(vec3(0.0),vec3(0.0))',
        EMPTY_STRING,
        EMPTY_STRING,
        'struct surfaceshader { vec3 color; vec3 transparency; };',
      ),
    )

    this.registerTypeSyntax(
      Type.VOLUMESHADER,
      new AggregateTypeSyntax(
        this,
        'volumeshader',
        'volumeshader(vec3(0.0),vec3(0.0))',
        EMPTY_STRING,
        EMPTY_STRING,
        'struct volumeshader { vec3 color; vec3 transparency; };',
      ),
    )

    this.registerTypeSyntax(
      Type.DISPLACEMENTSHADER,
      new AggregateTypeSyntax(
        this,
        'displacementshader',
        'displacementshader(vec3(0.0),1.0)',
        EMPTY_STRING,
        EMPTY_STRING,
        'struct displacementshader { vec3 offset; float scale; };',
      ),
    )

    this.registerTypeSyntax(
      Type.LIGHTSHADER,
      new AggregateTypeSyntax(
        this,
        'lightshader',
        'lightshader(vec3(0.0),vec3(0.0))',
        EMPTY_STRING,
        EMPTY_STRING,
        'struct lightshader { vec3 intensity; vec3 direction; };',
      ),
    )

    this.registerTypeSyntax(
      Type.MATERIAL,
      new AggregateTypeSyntax(
        this,
        'material',
        'material(vec3(0.0),vec3(0.0))',
        EMPTY_STRING,
        'surfaceshader',
        '#define material surfaceshader',
      ),
    )
  }

  static create(typeSystem: TypeSystem): GlslSyntax {
    return new GlslSyntax(typeSystem)
  }

  override getInputQualifier(): string {
    return GlslSyntax.INPUT_QUALIFIER
  }

  override getOutputQualifier(): string {
    return GlslSyntax.OUTPUT_QUALIFIER
  }

  getConstantQualifier(): string {
    return GlslSyntax.CONSTANT_QUALIFIER
  }

  override getUniformQualifier(): string {
    return GlslSyntax.UNIFORM_QUALIFIER
  }

  getSourceFileExtension(): string {
    return GlslSyntax.SOURCE_FILE_EXTENSION
  }

  typeSupported(type: TypeDesc): boolean {
    return type.notEquals(Type.STRING)
  }

  // Given an input specification attempt to remap this to an enumeration which is accepted by
  // the shader generator. The enumeration may be converted to a different type than the input.
  override remapEnumeration(value: string, type: TypeDesc, enumNames: string): [TypeDesc, Value | null] | null {
    // Early out if not an enum input.
    if (enumNames === '') {
      return null
    }

    // Don't convert already supported types
    if (type.notEquals(Type.STRING)) {
      return null
    }

    // Early out if no valid value provided
    if (value === '') {
      return null
    }

    // For GLSL we always convert to integer,
    // with the integer value being an index into the enumeration.
    const valueElemEnumsVec = splitString(enumNames, ',').map((s) => trimSpaces(s))
    const index = valueElemEnumsVec.indexOf(value)
    if (index === -1) {
      throw new ExceptionShaderGenError(`Given value '${value}' is not a valid enum value for input.`)
    }

    return [Type.INTEGER, Value.createValue(index, 'integer')]
  }

  override createStructSyntax(
    structTypeName: string,
    defaultValue: string,
    uniformDefaultValue: string,
    typeAlias: string,
    typeDefinition: string,
  ): StructTypeSyntax {
    return new GlslStructTypeSyntax(this, structTypeName, defaultValue, uniformDefaultValue, typeAlias, typeDefinition)
  }
}

// Specialization of StructTypeSyntax for GLSL: structs are constructed with
// constructor-call syntax rather than brace initializers.
export class GlslStructTypeSyntax extends StructTypeSyntax {
  override getValue(value: Value, _uniform: boolean): string {
    const aggValue = value as AggregateValue

    let result = aggValue.getTypeString() + '('

    let separator = ''
    for (const memberValue of aggValue.getMembers()) {
      result += separator
      separator = ','

      const memberTypeName = memberValue.getTypeString()
      const memberTypeDesc = this._parent!.getType(memberTypeName)

      // Recursively use the syntax to generate the output, so we can supported nested structs.
      result += this._parent!.getValueOfType(memberTypeDesc, memberValue, true)
    }

    result += ')'

    return result
  }
}
