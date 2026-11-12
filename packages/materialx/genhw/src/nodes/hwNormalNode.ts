// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwNormalNode.h,
//  source/MaterialXGenHw/Nodes/HwNormalNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwNormalNode.h and .cpp

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

// Normal node implementation for hardware languages
export class HwNormalNode extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwNormalNode()
  }

  override createVariables(node: ShaderNode, _context: GenContext, shader: Shader): void {
    const vs = shader.getStage(Stage.VERTEX)
    const ps = shader.getStage(Stage.PIXEL)

    addStageInput(HW.VERTEX_INPUTS, Type.VECTOR3, HW.T_IN_NORMAL, vs)

    const spaceInput = node.getInput(HwImplementation.SPACE)
    const space = spaceInput
      ? ((spaceInput.getValue() as TypedValue).getData() as number)
      : HwImplementation.OBJECT_SPACE
    if (space === HwImplementation.WORLD_SPACE) {
      addStageUniform(HW.PRIVATE_UNIFORMS, Type.MATRIX44, HW.T_WORLD_INVERSE_TRANSPOSE_MATRIX, vs)
      addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_NORMAL_WORLD, vs, ps)
    } else {
      addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_NORMAL_OBJECT, vs, ps)
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
        const normal = vertexData.getItem(HW.T_NORMAL_WORLD)
        if (!normal.isEmitted()) {
          normal.setEmitted()
          shadergen.emitLine(
            prefix +
              normal.getVariable() +
              ' = normalize(mx_matrix_mul(' +
              HW.T_WORLD_INVERSE_TRANSPOSE_MATRIX +
              ', ' +
              vec4 +
              '(' +
              HW.T_IN_NORMAL +
              ', 0.0)).xyz)',
            stage,
          )
        }
      } else {
        const normal = vertexData.getItem(HW.T_NORMAL_OBJECT)
        if (!normal.isEmitted()) {
          normal.setEmitted()
          shadergen.emitLine(prefix + normal.getVariable() + ' = ' + HW.T_IN_NORMAL, stage)
        }
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
      if (space === HwImplementation.WORLD_SPACE) {
        const normal = vertexData.getItem(HW.T_NORMAL_WORLD)
        shadergen.emitString(' = normalize(' + prefix + normal.getVariable() + ')', stage)
      } else {
        const normal = vertexData.getItem(HW.T_NORMAL_OBJECT)
        shadergen.emitString(' = normalize(' + prefix + normal.getVariable() + ')', stage)
      }
      shadergen.emitLineEnd(stage)
    }
  }
}
