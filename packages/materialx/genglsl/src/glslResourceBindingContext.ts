// Ported from MaterialX 1.39.5:
//  source/MaterialXGenGlsl/GlslResourceBindingContext.h,
//  source/MaterialXGenGlsl/GlslResourceBindingContext.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenGlsl/GlslResourceBindingContext.h and .cpp

import { EMPTY_STRING } from '@mtlx/core'
import { GenContext, ShaderStage, Stage, Syntax, Type, TypeDesc, VariableBlock } from '@mtlx/genshader'
import { HwResourceBindingContext } from '@mtlx/genhw'

// Class representing a resource binding for Glsl shader resources.
export class GlslResourceBindingContext extends HwResourceBindingContext {
  // List of required extensions
  protected _requiredExtensions = new Set<string>()

  // Binding location for uniform blocks
  protected _hwUniformBindLocation = 0

  // Initial value of uniform binding location
  protected _hwInitUniformBindLocation = 0

  // Binding location for sampler blocks
  protected _hwSamplerBindLocation = 0

  // Initial value of sampler binding location
  protected _hwInitSamplerBindLocation = 0

  // Separate binding locations flag
  // Indicates whether to use a shared binding counter for samplers and uniforms or separate ones.
  // By default a shared counter is used.
  protected _separateBindingLocation = false

  constructor(uniformBindingLocation: number, samplerBindingLocation: number) {
    super()
    this._hwInitUniformBindLocation = uniformBindingLocation
    this._hwInitSamplerBindLocation = samplerBindingLocation
    this._requiredExtensions.add('GL_ARB_shading_language_420pack')
  }

  static create(uniformBindingLocation = 0, samplerBindingLocation = 0): GlslResourceBindingContext {
    return new GlslResourceBindingContext(uniformBindingLocation, samplerBindingLocation)
  }

  // Emit separate binding locations for sampler and uniform table
  enableSeparateBindingLocations(separateBindingLocation: boolean): void {
    this._separateBindingLocation = separateBindingLocation
  }

  // Initialize the context before generation starts.
  initialize(): void {
    // Reset bind location counter.
    this._hwUniformBindLocation = this._hwInitUniformBindLocation

    // Reset sampler bind location counter.
    this._hwSamplerBindLocation = this._hwInitSamplerBindLocation
  }

  // Emit directives for stage
  emitDirectives(context: GenContext, stage: ShaderStage): void {
    const generator = context.getShaderGenerator()

    // Write shader stage directives for Vulkan compliance if required
    if (this._separateBindingLocation) {
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

    for (const extension of this._requiredExtensions) {
      generator.emitLine('#extension ' + extension + ' : enable', stage, false)
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
        'layout (std140, binding=' +
          String(this._hwUniformBindLocation++) +
          ') ' +
          syntax.getUniformQualifier() +
          ' ' +
          uniforms.getName() +
          '_' +
          stage.getName(),
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
          'layout (binding=' +
            String(this._separateBindingLocation ? this._hwUniformBindLocation++ : this._hwSamplerBindLocation++) +
            ') ' +
            syntax.getUniformQualifier() +
            ' ',
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

    // Sort order from largest to smallest. JS sort is stable, so members
    // with equal alignment keep their declaration order.
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
      'layout (std140, binding=' +
        String(this._hwUniformBindLocation++) +
        ') ' +
        syntax.getUniformQualifier() +
        ' ' +
        uniforms.getName() +
        '_' +
        stage.getName(),
      stage,
      false,
    )
    generator.emitScopeBegin(stage)
    generator.emitLine(uniforms.getName() + ' ' + structInstanceName + arraySuffix, stage)
    generator.emitScopeEnd(stage, true)
  }
}
