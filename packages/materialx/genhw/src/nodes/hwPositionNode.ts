// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwPositionNode.h,
//  source/MaterialXGenHw/Nodes/HwPositionNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwPositionNode.h and .cpp

import { type TypedValue } from '@mtlx/core'
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

// Position node implementation for hardware languages
export class HwPositionNode extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwPositionNode()
  }

  override createVariables(node: ShaderNode, _context: GenContext, shader: Shader): void {
    const vs = shader.getStage(Stage.VERTEX)
    const ps = shader.getStage(Stage.PIXEL)

    addStageInput(HW.VERTEX_INPUTS, Type.VECTOR3, HW.T_IN_POSITION, vs)

    const spaceInput = node.getInput(HwImplementation.SPACE)
    const space = spaceInput
      ? ((spaceInput.getValue() as TypedValue).getData() as number)
      : HwImplementation.OBJECT_SPACE
    if (space === HwImplementation.WORLD_SPACE) {
      addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_POSITION_WORLD, vs, ps)
    } else {
      addStageConnector(HW.VERTEX_DATA, Type.VECTOR3, HW.T_POSITION_OBJECT, vs, ps)
    }
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    const shadergen = context.getShaderGenerator() as HwShaderGenerator

    const spaceInput = node.getInput(HwImplementation.SPACE)
    const space = spaceInput
      ? ((spaceInput.getValue() as TypedValue).getData() as number)
      : HwImplementation.OBJECT_SPACE

    if (stage.getName() === Stage.VERTEX) {
      const vertexData = stage.getOutputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      if (space === HwImplementation.WORLD_SPACE) {
        const position = vertexData.getItem(HW.T_POSITION_WORLD)
        if (!position.isEmitted()) {
          position.setEmitted()
          shadergen.emitLine(prefix + position.getVariable() + ' = hPositionWorld.xyz', stage)
        }
      } else {
        const position = vertexData.getItem(HW.T_POSITION_OBJECT)
        if (!position.isEmitted()) {
          position.setEmitted()
          shadergen.emitLine(prefix + position.getVariable() + ' = ' + HW.T_IN_POSITION, stage)
        }
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
      if (space === HwImplementation.WORLD_SPACE) {
        const position = vertexData.getItem(HW.T_POSITION_WORLD)
        shadergen.emitString(' = ' + prefix + position.getVariable(), stage)
      } else {
        const position = vertexData.getItem(HW.T_POSITION_OBJECT)
        shadergen.emitString(' = ' + prefix + position.getVariable(), stage)
      }
      shadergen.emitLineEnd(stage)
    }
  }
}
