// Ported from MaterialX 1.39.5: source/MaterialXGenGlsl/VkShaderGenerator.h,
//  source/MaterialXGenGlsl/VkShaderGenerator.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenGlsl/VkShaderGenerator.h and .cpp
// (MaterialX v1.39.5).

import { EMPTY_STRING } from '@mtlx/core'
import {
  GenContext,
  ShaderGenerator,
  ShaderStage,
  Stage,
  Syntax,
  TypeSystem,
  VariableBlock,
} from '@mtlx/genshader'
import { HW, type HwResourceBindingContext } from '@mtlx/genhw'
import { GlslShaderGenerator } from './glslShaderGenerator.ts'
import { VkResourceBindingContext } from './vkResourceBindingContext.ts'
import { VkSyntax } from './vkSyntax.ts'

// A Vulkan GLSL shader generator
export class VkShaderGenerator extends GlslShaderGenerator {
  // Unique identifier for this generator target
  static override readonly TARGET: string = 'genglsl'
  static override readonly VERSION: string = '450'

  protected _resourceBindingCtx: HwResourceBindingContext

  // Vertex data interface location to bind between stages
  protected vertexDataLocation = 0

  constructor(typeSystem: TypeSystem) {
    super(typeSystem, VkSyntax.create(typeSystem))
    // Add in Vulkan specific keywords
    this._syntax.registerReservedWords(['texture2D', 'sampler'])

    // Set binding context to handle resource binding layouts
    this._resourceBindingCtx = new VkResourceBindingContext(0)
  }

  // Creator function. If a TypeSystem is not provided it will be created
  // internally.
  static override create(typeSystem?: TypeSystem): ShaderGenerator {
    return new VkShaderGenerator(typeSystem ?? TypeSystem.create())
  }

  // Return a unique identifier for the target this generator is for
  override getTarget(): string {
    return VkShaderGenerator.TARGET
  }

  // Return the version string for the GLSL version this generator is for
  override getVersion(): string {
    return VkShaderGenerator.VERSION
  }

  override getVertexDataPrefix(vertexData: VariableBlock): string {
    return vertexData.getInstance() + '.'
  }

  // Emit directives for stage
  protected override emitDirectives(_context: GenContext, stage: ShaderStage): void {
    this.emitLine('#version ' + this.getVersion(), stage, false)
    this.emitLineBreak(stage)
  }

  protected override emitInputs(context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.VERTEX) {
      const vertexInputs = stage.getInputBlock(HW.VERTEX_INPUTS)
      if (!vertexInputs.empty()) {
        this.emitComment('Inputs block: ' + vertexInputs.getName(), stage)
        for (let i = 0; i < vertexInputs.size(); ++i) {
          this.emitLineBegin(stage)
          this.emitString('layout (location = ' + String(i) + ') ', stage)
          this.emitVariableDeclaration(vertexInputs.getItem(i), this._syntax.getInputQualifier(), context, stage, false)
          this.emitString(Syntax.SEMICOLON, stage)
          this.emitLineEnd(stage, false)
        }
        this.emitLineBreak(stage)
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      if (!vertexData.empty()) {
        this.emitString(
          'layout (location = ' + String(this.vertexDataLocation) + ') ' +
            this._syntax.getInputQualifier() + ' ' + vertexData.getName(),
          stage,
        )
        this.emitLineBreak(stage)
        this.emitScopeBegin(stage)
        this.emitVariableDeclarations(vertexData, EMPTY_STRING, Syntax.SEMICOLON, context, stage, false)
        this.emitScopeEnd(stage, false, false)
        this.emitString(' ' + vertexData.getInstance() + Syntax.SEMICOLON, stage)
        this.emitLineBreak(stage)
        this.emitLineBreak(stage)
      }
    }
  }

  protected override emitOutputs(context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.VERTEX) {
      const vertexData = stage.getOutputBlock(HW.VERTEX_DATA)
      if (!vertexData.empty()) {
        this.emitString(
          'layout (location = ' + String(this.vertexDataLocation) + ') ' +
            this._syntax.getOutputQualifier() + ' ' + vertexData.getName(),
          stage,
        )
        this.emitLineBreak(stage)
        this.emitScopeBegin(stage)
        this.emitVariableDeclarations(vertexData, EMPTY_STRING, Syntax.SEMICOLON, context, stage, false)
        this.emitScopeEnd(stage, false, false)
        this.emitString(' ' + vertexData.getInstance() + Syntax.SEMICOLON, stage)
        this.emitLineBreak(stage)
        this.emitLineBreak(stage)
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const outputs = stage.getOutputBlock(HW.PIXEL_OUTPUTS)

      this.emitComment('Pixel shader outputs', stage)
      for (let i = 0; i < outputs.size(); ++i) {
        this.emitLineBegin(stage)
        this.emitString('layout (location = ' + String(i) + ') ', stage)
        this.emitVariableDeclaration(outputs.getItem(i), this._syntax.getOutputQualifier(), context, stage, false)
        this.emitString(Syntax.SEMICOLON, stage)
        this.emitLineEnd(stage, false)
      }
      this.emitLineBreak(stage)
    }
  }

  protected override getResourceBindingContext(_context: GenContext): HwResourceBindingContext | null {
    return this._resourceBindingCtx
  }
}
