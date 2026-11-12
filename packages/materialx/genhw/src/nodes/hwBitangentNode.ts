// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwBitangentNode.h,
//  source/MaterialXGenHw/Nodes/HwBitangentNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwBitangentNode.h and .cpp

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

// Bitangent node implementation for hardware languages
export class HwBitangentNode extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwBitangentNode()
  }

  override createVariables(node: ShaderNode, context: GenContext, shader: Shader): void {
    const options = context.getOptions()

    const vs = shader.getStage(Stage.VERTEX)
    const ps = shader.getStage(Stage.PIXEL)

    if (options.hwImplicitBitangents) {
      addStageInput(HW.VERTEX_INPUTS, Type.VECTOR3, HW.T_IN_NORMAL, vs)
      addStageInput(HW.VERTEX_INPUTS, Type.VECTOR3, HW.T_IN_TANGENT, vs)
    } else {
      addStageInput(HW.VERTEX_INPUTS, Type.VECTOR3, HW.T_IN_BITANGENT, vs)
    }

    const spaceInput = node.getInput(HwImplementation.SPACE)
    const space = spaceInput
      ? ((spaceInput.getValue() as TypedValue).getData() as number)
      : HwImplementation.OBJECT_SPACE
    if (space === HwImplementation.WORLD_SPACE) {
      addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_BITANGENT_WORLD, vs, ps)
      addStageUniform(HW.PRIVATE_UNIFORMS, Type.MATRIX44, HW.T_WORLD_MATRIX, vs)

      if (options.hwImplicitBitangents) {
        addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_NORMAL_WORLD, vs, ps)
        addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_TANGENT_WORLD, vs, ps)
        addStageUniform(HW.PRIVATE_UNIFORMS, Type.MATRIX44, HW.T_WORLD_INVERSE_TRANSPOSE_MATRIX, vs)
      }
    } else {
      addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_BITANGENT_OBJECT, vs, ps)
    }
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    const shadergen = context.getShaderGenerator() as HwShaderGenerator
    const options = context.getOptions()
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
        const bitangent = vertexData.getItem(HW.T_BITANGENT_WORLD)

        if (!bitangent.isEmitted()) {
          bitangent.setEmitted()

          if (options.hwImplicitBitangents) {
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
            shadergen.emitLine(
              prefix +
                bitangent.getVariable() +
                ' = cross(' +
                prefix +
                normal.getVariable() +
                ', ' +
                prefix +
                tangent.getVariable() +
                ')',
              stage,
            )
          } else {
            shadergen.emitLine(
              prefix +
                bitangent.getVariable() +
                ' = normalize(mx_matrix_mul(' +
                HW.T_WORLD_MATRIX +
                ', ' +
                vec4 +
                '(' +
                HW.T_IN_BITANGENT +
                ', 0.0)).xyz)',
              stage,
            )
          }
        }
      } else {
        const bitangent = vertexData.getItem(HW.T_BITANGENT_OBJECT)
        if (!bitangent.isEmitted()) {
          bitangent.setEmitted()

          if (options.hwImplicitBitangents) {
            shadergen.emitLine(
              prefix + bitangent.getVariable() + ' = cross(' + HW.T_IN_NORMAL + ', ' + HW.T_IN_TANGENT + ')',
              stage,
            )
          } else {
            shadergen.emitLine(prefix + bitangent.getVariable() + ' = ' + HW.T_IN_BITANGENT, stage)
          }
        }
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
      if (space === HwImplementation.WORLD_SPACE) {
        const bitangent = vertexData.getItem(HW.T_BITANGENT_WORLD)
        shadergen.emitString(' = normalize(' + prefix + bitangent.getVariable() + ')', stage)
      } else {
        const bitangent = vertexData.getItem(HW.T_BITANGENT_OBJECT)
        shadergen.emitString(' = normalize(' + prefix + bitangent.getVariable() + ')', stage)
      }
      shadergen.emitLineEnd(stage)
    }
  }
}
