// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwGeomColorNode.h,
//  source/MaterialXGenHw/Nodes/HwGeomColorNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwGeomColorNode.h and .cpp

import {
  Stage,
  Type,
  addStageConnector,
  addStageInput,
  type GenContext,
  type Shader,
  type ShaderNode,
  type ShaderNodeImpl,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW } from '../hwConstants.ts'
import { HwImplementation } from '../hwImplementation.ts'
import type { HwShaderGenerator } from '../hwShaderGenerator.ts'

// GeomColor node implementation for Hw shader languages
export class HwGeomColorNode extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwGeomColorNode()
  }

  override createVariables(node: ShaderNode, _context: GenContext, shader: Shader): void {
    const indexInput = node.getInput(HwImplementation.INDEX)
    const index = indexInput ? indexInput.getValue()!.getValueString() : '0'

    const vs = shader.getStage(Stage.VERTEX)
    const ps = shader.getStage(Stage.PIXEL)
    addStageInput(HW.VERTEX_INPUTS, Type.COLOR4, HW.T_IN_COLOR + '_' + index, vs)
    addStageConnector(HW.VERTEX_DATA, Type.COLOR4, HW.T_COLOR + '_' + index, vs, ps)
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    const shadergen = context.getShaderGenerator() as HwShaderGenerator

    const output = node.getOutput()!
    const indexInput = node.getInput(HwImplementation.INDEX)
    const index = indexInput ? indexInput.getValue()!.getValueString() : '0'
    const variable = HW.T_COLOR + '_' + index

    if (stage.getName() === Stage.VERTEX) {
      const vertexData = stage.getOutputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      const color = vertexData.getItem(variable)
      if (!color.isEmitted()) {
        color.setEmitted()
        shadergen.emitLine(prefix + color.getVariable() + ' = ' + HW.T_IN_COLOR + '_' + index, stage)
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      let suffix = ''
      if (output.getType().equals(Type.FLOAT)) {
        suffix = '.r'
      } else if (output.getType().equals(Type.COLOR3)) {
        suffix = '.rgb'
      }
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      const color = vertexData.getItem(variable)
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
      shadergen.emitString(' = ' + prefix + color.getVariable() + suffix, stage)
      shadergen.emitLineEnd(stage)
    }
  }
}
