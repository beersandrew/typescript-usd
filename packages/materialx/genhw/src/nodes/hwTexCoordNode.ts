// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwTexCoordNode.h,
//  source/MaterialXGenHw/Nodes/HwTexCoordNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwTexCoordNode.h and .cpp

import { EMPTY_STRING } from '@mtlx/core'
import {
  ShaderNodeImpl,
  Stage,
  Type,
  addStageConnector,
  addStageInput,
  type GenContext,
  type Shader,
  type ShaderNode,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW } from '../hwConstants.ts'
import type { HwShaderGenerator } from '../hwShaderGenerator.ts'

// Generic texture coordinate node for hardware languages
export class HwTexCoordNode extends ShaderNodeImpl {
  protected static INDEX = 'index'

  static create(): ShaderNodeImpl {
    return new HwTexCoordNode()
  }

  override createVariables(node: ShaderNode, _context: GenContext, shader: Shader): void {
    const output = node.getOutput()!
    const index = this.getIndex(node)

    const vs = shader.getStage(Stage.VERTEX)
    const ps = shader.getStage(Stage.PIXEL)

    addStageInput(HW.VERTEX_INPUTS, output.getType(), HW.T_IN_TEXCOORD + '_' + index, vs, true)
    addStageConnector(HW.VERTEX_DATA, output.getType(), HW.T_TEXCOORD + '_' + index, vs, ps, true)
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    const shadergen = context.getShaderGenerator() as HwShaderGenerator

    const index = this.getIndex(node)
    const variable = HW.T_TEXCOORD + '_' + index
    const output = node.getOutput()!

    if (stage.getName() === Stage.VERTEX) {
      const vertexData = stage.getOutputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      const texcoord = vertexData.getItem(variable)
      if (!texcoord.isEmitted()) {
        shadergen.emitLine(prefix + texcoord.getVariable() + ' = ' + HW.T_IN_TEXCOORD + '_' + index, stage)
        texcoord.setEmitted()
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      const texcoord = vertexData.getItem(variable)
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(output, true, false, context, stage)

      // Extract the requested number of components from the texture coordinates (which may be a
      // larger datatype than the requested number of texture coordinates, if several texture
      // coordinate nodes with different width coexist).
      let suffix = EMPTY_STRING
      if (output.getType().equals(Type.VECTOR2)) {
        suffix = '.xy'
      } else if (output.getType().equals(Type.VECTOR3)) {
        suffix = '.xyz'
      }

      shadergen.emitString(' = ' + prefix + texcoord.getVariable() + suffix, stage)
      shadergen.emitLineEnd(stage)
    }
  }

  protected getIndex(node: ShaderNode): string {
    const input = node.getInput(HwTexCoordNode.INDEX)
    return input ? input.getValue()!.getValueString() : '0'
  }
}
