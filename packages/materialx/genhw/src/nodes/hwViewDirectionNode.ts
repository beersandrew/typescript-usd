// Ported from MaterialX 1.39.5:
//  source/MaterialXGenHw/Nodes/HwViewDirectionNode.h,
//  source/MaterialXGenHw/Nodes/HwViewDirectionNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwViewDirectionNode.h and .cpp

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

// ViewDirection node implementation for hardware languages
export class HwViewDirectionNode extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwViewDirectionNode()
  }

  override createVariables(node: ShaderNode, _context: GenContext, shader: Shader): void {
    const vs = shader.getStage(Stage.VERTEX)
    const ps = shader.getStage(Stage.PIXEL)

    addStageInput(HW.VERTEX_INPUTS, Type.VECTOR3, HW.T_IN_POSITION, vs)

    const spaceInput = node.getInput(HwImplementation.SPACE)
    const space = spaceInput
      ? ((spaceInput.getValue() as TypedValue).getData() as number)
      : HwImplementation.OBJECT_SPACE

    addStageUniform(HW.PRIVATE_UNIFORMS, Type.VECTOR3, HW.T_VIEW_POSITION, ps)
    addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_POSITION_WORLD, vs, ps)
    if (space === HwImplementation.OBJECT_SPACE || space === HwImplementation.MODEL_SPACE) {
      addStageUniform(HW.PRIVATE_UNIFORMS, Type.MATRIX44, HW.T_WORLD_INVERSE_TRANSPOSE_MATRIX, ps)
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
      const position = vertexData.getItem(HW.T_POSITION_WORLD)
      if (!position.isEmitted()) {
        position.setEmitted()
        shadergen.emitLine(prefix + position.getVariable() + ' = hPositionWorld.xyz', stage)
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
      const position = vertexData.getItem(HW.T_POSITION_WORLD)
      if (space === HwImplementation.WORLD_SPACE) {
        shadergen.emitString(
          ' = normalize(' + prefix + position.getVariable() + ' - ' + HW.T_VIEW_POSITION + ')',
          stage,
        )
      } else {
        shadergen.emitString(
          ' = normalize(mx_matrix_mul(' +
            HW.T_WORLD_INVERSE_TRANSPOSE_MATRIX +
            ', ' +
            vec4 +
            '(' +
            prefix +
            position.getVariable() +
            ' - ' +
            HW.T_VIEW_POSITION +
            ', 0.0)).xyz)',
          stage,
        )
      }
      shadergen.emitLineEnd(stage)
    }
  }
}
