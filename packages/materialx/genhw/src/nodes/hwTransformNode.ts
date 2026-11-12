// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwTransformNode.h,
//  source/MaterialXGenHw/Nodes/HwTransformNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwTransformNode.h and .cpp

import { EMPTY_STRING } from '@mtlx/core'
import {
  ExceptionShaderGenError,
  ShaderNodeImpl,
  Stage,
  Type,
  addStageUniform,
  type GenContext,
  type Shader,
  type ShaderNode,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW } from '../hwConstants.ts'

// Generic transformation node for hardware languages
export abstract class HwTransformNode extends ShaderNodeImpl {
  protected static readonly FROM_SPACE = 'fromspace'
  protected static readonly TO_SPACE = 'tospace'
  protected static readonly MODEL = 'model'
  protected static readonly OBJECT = 'object'
  protected static readonly WORLD = 'world'

  override createVariables(node: ShaderNode, _context: GenContext, shader: Shader): void {
    const toSpace = this.getToSpace(node)
    const fromSpace = this.getFromSpace(node)
    const matrix = this.getMatrix(fromSpace, toSpace)
    if (matrix !== '') {
      const ps = shader.getStage(Stage.PIXEL)
      addStageUniform(HW.PRIVATE_UNIFORMS, Type.MATRIX44, matrix, ps)
    }
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.PIXEL) {
      const shadergen = context.getShaderGenerator()

      const output = node.getOutput()!
      const inInput = node.getInput('in')!
      if (inInput.getType().notEquals(Type.VECTOR3) && inInput.getType().notEquals(Type.VECTOR4)) {
        throw new ExceptionShaderGenError("Transform node must have 'in' type of vector3 or vector4.")
      }

      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(output, true, false, context, stage)

      const toSpace = this.getToSpace(node)
      const fromSpace = this.getFromSpace(node)
      const matrix = this.getMatrix(fromSpace, toSpace)
      if (matrix === '') {
        shadergen.emitString(' = (', stage)
      } else {
        shadergen.emitString(' = mx_matrix_mul(' + matrix + ', ', stage)
      }

      const type = shadergen.getSyntax().getTypeName(Type.VECTOR4)
      const input = shadergen.getUpstreamResult(inInput, context)
      shadergen.emitString(type + '(' + input + ', ' + this.getHomogeneousCoordinate() + ')).xyz', stage)
      shadergen.emitLineEnd(stage)

      if (this.shouldNormalize()) {
        shadergen.emitLineBegin(stage)
        shadergen.emitOutput(output, false, false, context, stage)
        shadergen.emitString(' = normalize(' + output.getVariable() + ')', stage)
        shadergen.emitLineEnd(stage)
      }
    }
  }

  protected getMatrix(fromSpace: string, toSpace: string): string {
    if (
      (fromSpace === HwTransformNode.MODEL || fromSpace === HwTransformNode.OBJECT) &&
      toSpace === HwTransformNode.WORLD
    ) {
      return this.getModelToWorldMatrix()
    } else if (
      fromSpace === HwTransformNode.WORLD &&
      (toSpace === HwTransformNode.MODEL || toSpace === HwTransformNode.OBJECT)
    ) {
      return this.getWorldToModelMatrix()
    }
    return EMPTY_STRING
  }

  protected abstract getModelToWorldMatrix(): string
  protected abstract getWorldToModelMatrix(): string
  protected abstract getHomogeneousCoordinate(): string
  protected shouldNormalize(): boolean {
    return false
  }

  protected getFromSpace(node: ShaderNode): string {
    const input = node.getInput(HwTransformNode.FROM_SPACE)
    return input ? input.getValueString() : EMPTY_STRING
  }

  protected getToSpace(node: ShaderNode): string {
    const input = node.getInput(HwTransformNode.TO_SPACE)
    return input ? input.getValueString() : EMPTY_STRING
  }
}

// Vector transform implementation for hardware languages
export class HwTransformVectorNode extends HwTransformNode {
  static create(): ShaderNodeImpl {
    return new HwTransformVectorNode()
  }

  protected override getModelToWorldMatrix(): string {
    return HW.T_WORLD_MATRIX
  }

  protected override getWorldToModelMatrix(): string {
    return HW.T_WORLD_INVERSE_MATRIX
  }

  protected override getHomogeneousCoordinate(): string {
    return '0.0'
  }
}

// Point transform implementation for hardware languages
export class HwTransformPointNode extends HwTransformVectorNode {
  static override create(): ShaderNodeImpl {
    return new HwTransformPointNode()
  }

  protected override getHomogeneousCoordinate(): string {
    return '1.0'
  }
}

// Normal transform implementation for hardware languages
export class HwTransformNormalNode extends HwTransformNode {
  static create(): ShaderNodeImpl {
    return new HwTransformNormalNode()
  }

  protected override getModelToWorldMatrix(): string {
    return HW.T_WORLD_INVERSE_TRANSPOSE_MATRIX
  }

  protected override getWorldToModelMatrix(): string {
    return HW.T_WORLD_TRANSPOSE_MATRIX
  }

  protected override getHomogeneousCoordinate(): string {
    return '0.0'
  }

  protected override shouldNormalize(): boolean {
    return true
  }
}
