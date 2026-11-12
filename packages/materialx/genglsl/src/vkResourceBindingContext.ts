// Ported from MaterialX 1.39.5:
//  source/MaterialXGenGlsl/VkResourceBindingContext.h,
//  source/MaterialXGenGlsl/VkResourceBindingContext.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenGlsl/VkResourceBindingContext.h and .cpp
// (MaterialX v1.39.5).

import { EMPTY_STRING } from '@mtlx/core'
import { GenContext, ShaderStage, Stage, Syntax, Type, VariableBlock } from '@mtlx/genshader'
import { HwResourceBindingContext } from '@mtlx/genhw'

export class VkResourceBindingContext extends HwResourceBindingContext {
  // Binding location for uniform blocks
  protected _hwUniformBindLocation = 0

  // Initial value of uniform binding location
  protected _hwInitUniformBindLocation = 0

  constructor(uniformBindingLocation: number) {
    super()
    this._hwInitUniformBindLocation = uniformBindingLocation
  }

  static create(uniformBindingLocation = 0): VkResourceBindingContext {
    return new VkResourceBindingContext(uniformBindingLocation)
  }

  // Initialize the context before generation starts.
  initialize(): void {
    // Reset bind location counter.
    this._hwUniformBindLocation = this._hwInitUniformBindLocation
  }

  // Emit directives for stage
  emitDirectives(context: GenContext, stage: ShaderStage): void {
    const generator = context.getShaderGenerator()

    // Write shader stage directives for Vulkan compliance
    let shaderStage = ''
    if (stage.getName() === Stage.VERTEX) {
      shaderStage = 'vertex'
    } else if (stage.getName() === Stage.PIXEL) {
      shaderStage = 'fragment'
    }

    if (shaderStage !== '') {
      generator.emitLine('#pragma shader_stage(' + shaderStage + ')', stage, false)
    }
  }

  // Emit uniforms with binding information
  emitResourceBindings(context: GenContext, uniforms: VariableBlock, stage: ShaderStage): void {
    const generator = context.getShaderGenerator()
    const syntax = generator.getSyntax()

    // First, emit all value uniforms in a block with single layout binding
    let hasValueUniforms = false
    for (const uniform of uniforms.getVariableOrder()) {
      if (uniform.getType().notEquals(Type.FILENAME)) {
        hasValueUniforms = true
        break
      }
    }
    if (hasValueUniforms) {
      generator.emitLine(
        'layout (std140, binding=' + String(this._hwUniformBindLocation++) + ') ' +
          syntax.getUniformQualifier() + ' ' + uniforms.getName() + '_' + stage.getName(),
        stage,
        false,
      )
      generator.emitScopeBegin(stage)
      for (const uniform of uniforms.getVariableOrder()) {
        if (uniform.getType().notEquals(Type.FILENAME)) {
          generator.emitLineBegin(stage)
          generator.emitVariableDeclaration(uniform, EMPTY_STRING, context, stage, false)
          generator.emitString(Syntax.SEMICOLON, stage)
          generator.emitLineEnd(stage, false)
        }
      }
      generator.emitScopeEnd(stage, true)
    }

    // Second, emit all sampler uniforms as separate uniforms with separate layout bindings
    for (const uniform of uniforms.getVariableOrder()) {
      if (uniform.getType().equals(Type.FILENAME)) {
        generator.emitString(
          'layout (binding=' + String(this._hwUniformBindLocation++) + ') ' + syntax.getUniformQualifier() + ' ',
          stage,
        )
        generator.emitVariableDeclaration(uniform, EMPTY_STRING, context, stage, false)
        generator.emitLineEnd(stage, true)
      }
    }

    generator.emitLineBreak(stage)
  }

  // Emit structured uniforms with binding information and align members where possible
  emitStructuredResourceBindings(
    context: GenContext,
    uniforms: VariableBlock,
    stage: ShaderStage,
    structInstanceName: string,
    arraySuffix = EMPTY_STRING,
  ): void {
    const generator = context.getShaderGenerator()
    const syntax = generator.getSyntax()

    // Glsl structures need to be aligned. We make a best effort to base align struct members and add
    // padding if required.
    // https://www.khronos.org/registry/OpenGL/extensions/ARB/ARB_uniform_buffer_object.txt

    const baseAlignment = 16
    const alignmentMap = new Map<number, number>([
      [Type.FLOAT.typeId(), baseAlignment / 4],
      [Type.INTEGER.typeId(), baseAlignment / 4],
      [Type.BOOLEAN.typeId(), baseAlignment / 4],
      [Type.COLOR3.typeId(), baseAlignment],
      [Type.COLOR4.typeId(), baseAlignment],
      [Type.VECTOR2.typeId(), baseAlignment],
      [Type.VECTOR3.typeId(), baseAlignment],
      [Type.VECTOR4.typeId(), baseAlignment],
      [Type.MATRIX33.typeId(), baseAlignment * 4],
      [Type.MATRIX44.typeId(), baseAlignment * 4],
    ])

    // Get struct alignment and size
    // [alignment, uniform member index]
    const memberOrder: Array<[number, number]> = []
    let structSize = 0
    for (let i = 0; i < uniforms.size(); ++i) {
      const alignment = alignmentMap.get(uniforms.getItem(i).getType().typeId()) ?? baseAlignment
      structSize += alignment
      memberOrder.push([alignment, i])
    }

    // Align up and determine number of padding floats to add
    const numPaddingfloats = (((structSize + (baseAlignment - 1)) & ~(baseAlignment - 1)) - structSize) / 4

    // Sort order from largest to smallest. std::sort is not stable; JS sort
    // is, so members with equal alignment keep their declaration order here.
    memberOrder.sort((a, b) => b[0] - a[0])

    // Emit the struct
    generator.emitLine('struct ' + uniforms.getName(), stage, false)
    generator.emitScopeBegin(stage)

    for (let i = 0; i < uniforms.size(); ++i) {
      const variableIndex = memberOrder[i]![1]
      generator.emitLineBegin(stage)
      generator.emitVariableDeclaration(uniforms.getItem(variableIndex), EMPTY_STRING, context, stage, false)
      generator.emitString(Syntax.SEMICOLON, stage)
      generator.emitLineEnd(stage, false)
    }

    // Emit padding
    for (let i = 0; i < numPaddingfloats; ++i) {
      generator.emitLine('float pad' + String(i), stage, true)
    }
    generator.emitScopeEnd(stage, true)

    // Emit binding information
    generator.emitLineBreak(stage)
    generator.emitLine(
      'layout (std140, binding=' + String(this._hwUniformBindLocation++) + ') ' +
        syntax.getUniformQualifier() + ' ' + uniforms.getName() + '_' + stage.getName(),
      stage,
      false,
    )
    generator.emitScopeBegin(stage)
    generator.emitLine(uniforms.getName() + ' ' + structInstanceName + arraySuffix, stage)
    generator.emitScopeEnd(stage, true)
  }
}
