// Ported from MaterialX 1.39.5: source/MaterialXGenGlsl/EsslShaderGenerator.h,
//  source/MaterialXGenGlsl/EsslShaderGenerator.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenGlsl/EsslShaderGenerator.h and .cpp

import { EMPTY_STRING } from '@mtlx/core'
import {
  ExceptionShaderGenError,
  GenContext,
  ShaderGenerator,
  ShaderStage,
  Stage,
  Syntax,
  Type,
  TypeSystem,
  VariableBlock,
} from '@mtlx/genshader'
import { HW, type HwResourceBindingContext } from '@mtlx/genhw'
import { EsslSyntax } from './esslSyntax.ts'
import { GlslShaderGenerator } from './glslShaderGenerator.ts'
import { GlslSyntax } from './glslSyntax.ts'

// An ESSL (OpenGL ES Shading Language) shader generator
export class EsslShaderGenerator extends GlslShaderGenerator {
  // Unique identifier for this generator target
  static override readonly TARGET: string = 'essl'

  // Current target is WebGL 2.0
  static override readonly VERSION: string = '300 es'

  constructor(typeSystem: TypeSystem) {
    super(typeSystem, EsslSyntax.create(typeSystem))

    // Add in ESSL specific keywords
    this._syntax.registerReservedWords(['precision', 'highp', 'mediump', 'lowp'])
  }

  // Creator function. If a TypeSystem is not provided it will be created
  // internally. Optionally pass in an externally created TypeSystem here,
  // if you want to keep type descriptions alive after the lifetime of the
  // shader generator.
  static override create(typeSystem?: TypeSystem): ShaderGenerator {
    return new EsslShaderGenerator(typeSystem ?? TypeSystem.create())
  }

  // Return a unique identifier for the target this generator is for
  override getTarget(): string {
    return EsslShaderGenerator.TARGET
  }

  // Return the version string for the ESSL version this generator is for
  override getVersion(): string {
    return EsslShaderGenerator.VERSION
  }

  protected override emitDirectives(_context: GenContext, stage: ShaderStage): void {
    this.emitLine('#version ' + this.getVersion(), stage, false)
    this.emitLineBreak(stage)
    // ESSL 3.0+ is used where highp float is considered mandatory.
    // (See https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf)
    this.emitLine('precision highp float', stage)
    this.emitLineBreak(stage)
  }

  protected override emitUniforms(context: GenContext, stage: ShaderStage): void {
    for (const uniforms of stage.getUniformBlocks().values()) {
      // Skip light uniforms as they are handled separately
      if (!uniforms.empty() && uniforms.getName() !== HW.LIGHT_DATA) {
        this.emitComment('Uniform block: ' + uniforms.getName(), stage)
        this.emitVariableDeclarations(uniforms, this._syntax.getUniformQualifier(), Syntax.SEMICOLON, context, stage, false)
        this.emitLineBreak(stage)
      }
    }
  }

  protected override emitInputs(context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.VERTEX) {
      const vertexInputs = stage.getInputBlock(HW.VERTEX_INPUTS)
      if (!vertexInputs.empty()) {
        this.emitComment('Inputs block: ' + vertexInputs.getName(), stage)
        this.emitVariableDeclarations(vertexInputs, this._syntax.getInputQualifier(), Syntax.SEMICOLON, context, stage, false)
        this.emitLineBreak(stage)
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      if (!vertexData.empty()) {
        this.emitVertexDataDeclarations(vertexData, this._syntax.getInputQualifier(), context, stage)
        this.emitLineBreak(stage)
      }
    }
  }

  // DIVERGENCE from upstream: ESSL emits vertex-data varyings unwrapped, so
  // integer varyings must carry the flat interpolation qualifier directly on
  // the in/out declaration. Upstream's flat handling only applies to the
  // desktop interface-block members (empty qualifier) and produces invalid
  // ESSL for geompropvalue_integer (untested upstream).
  protected emitVertexDataDeclarations(
    vertexData: VariableBlock,
    qualifier: string,
    context: GenContext,
    stage: ShaderStage,
  ): void {
    for (const variable of vertexData.getVariableOrder()) {
      const variableQualifier = variable.getType().equals(Type.INTEGER)
        ? GlslSyntax.FLAT_QUALIFIER + ' ' + qualifier
        : qualifier
      this.emitLineBegin(stage)
      this.emitVariableDeclaration(variable, variableQualifier, context, stage, false)
      this.emitString(Syntax.SEMICOLON, stage)
      this.emitLineEnd(stage, false)
    }
  }

  protected override emitOutputs(context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.VERTEX) {
      const vertexData = stage.getOutputBlock(HW.VERTEX_DATA)
      if (!vertexData.empty()) {
        this.emitVertexDataDeclarations(vertexData, this._syntax.getOutputQualifier(), context, stage)
        this.emitLineBreak(stage)
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      this.emitComment('Pixel shader outputs', stage)
      const outputs = stage.getOutputBlock(HW.PIXEL_OUTPUTS)
      this.emitVariableDeclarations(outputs, this._syntax.getOutputQualifier(), Syntax.SEMICOLON, context, stage, false)
      this.emitLineBreak(stage)
    }
  }

  override getVertexDataPrefix(_vertexData: VariableBlock): string {
    return EMPTY_STRING
  }

  protected override getResourceBindingContext(context: GenContext): HwResourceBindingContext | null {
    const resourceBindingCtx = super.getResourceBindingContext(context)
    if (resourceBindingCtx) {
      throw new ExceptionShaderGenError('The EsslShaderGenerator does not support resource binding.')
    }
    return null
  }
}
