// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwTangentNode.h,
//  source/MaterialXGenHw/Nodes/HwTangentNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwTangentNode.h and .cpp

import { type TypedValue } from '@mtlx/core'
import {
  Stage,
  Type,
  addStageConnector,
  addStageInput,
  addStageUniform,
  type GenContext,
  type Shader,
  type ShaderNode,
  type ShaderNodeImpl,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW } from '../hwConstants.ts'
import { HwImplementation } from '../hwImplementation.ts'
import type { HwShaderGenerator } from '../hwShaderGenerator.ts'

// Tangent node implementation for hardware languages
export class HwTangentNode extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwTangentNode()
  }

  override createVariables(node: ShaderNode, _context: GenContext, shader: Shader): void {
    const vs = shader.getStage(Stage.VERTEX)
    const ps = shader.getStage(Stage.PIXEL)

    addStageInput(HW.VERTEX_INPUTS, Type.VECTOR3, HW.T_IN_TANGENT, vs)

    const spaceInput = node.getInput(HwImplementation.SPACE)
    const space = spaceInput
      ? ((spaceInput.getValue() as TypedValue).getData() as number)
      : HwImplementation.OBJECT_SPACE
    if (space === HwImplementation.WORLD_SPACE) {
      addStageUniform(HW.PRIVATE_UNIFORMS, Type.MATRIX44, HW.T_WORLD_MATRIX, vs)
      addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_TANGENT_WORLD, vs, ps)
    } else {
      addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_TANGENT_OBJECT, vs, ps)
    }
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    const shadergen = context.getShaderGenerator() as HwShaderGenerator
    const syntax = shadergen.getSyntax()

    const vec4 = syntax.getTypeName(Type.VECTOR4)

    const spaceInput = node.getInput(HwImplementation.SPACE)
    const space = spaceInput
      ? ((spaceInput.getValue() as TypedValue).getData() as number)
      : HwImplementation.OBJECT_SPACE

    if (stage.getName() === Stage.VERTEX) {
      const vertexData = stage.getOutputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      if (space === HwImplementation.WORLD_SPACE) {
        const tangent = vertexData.getItem(HW.T_TANGENT_WORLD)
        if (!tangent.isEmitted()) {
          tangent.setEmitted()
          shadergen.emitLine(
            prefix +
              tangent.getVariable() +
              ' = normalize(mx_matrix_mul(' +
              HW.T_WORLD_MATRIX +
              ', ' +
              vec4 +
              '(' +
              HW.T_IN_TANGENT +
              ', 0.0)).xyz)',
            stage,
          )
        }
      } else {
        const tangent = vertexData.getItem(HW.T_TANGENT_OBJECT)
        if (!tangent.isEmitted()) {
          tangent.setEmitted()
          shadergen.emitLine(prefix + tangent.getVariable() + ' = ' + HW.T_IN_TANGENT, stage)
        }
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
      if (space === HwImplementation.WORLD_SPACE) {
        const tangent = vertexData.getItem(HW.T_TANGENT_WORLD)
        shadergen.emitString(' = normalize(' + prefix + tangent.getVariable() + ')', stage)
      } else {
        const tangent = vertexData.getItem(HW.T_TANGENT_OBJECT)
        shadergen.emitString(' = normalize(' + prefix + tangent.getVariable() + ')', stage)
      }
      shadergen.emitLineEnd(stage)
    }
  }
}
