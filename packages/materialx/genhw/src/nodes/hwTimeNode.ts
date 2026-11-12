// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwTimeNode.h,
//  source/MaterialXGenHw/Nodes/HwTimeNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwTimeNode.h and .cpp

import {
  Stage,
  Type,
  addStageUniform,
  type GenContext,
  type Shader,
  type ShaderNode,
  type ShaderNodeImpl,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW } from '../hwConstants.ts'
import { HwImplementation } from '../hwImplementation.ts'

// Time node implementation for hardware languages
export class HwTimeNode extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwTimeNode()
  }

  override createVariables(_node: ShaderNode, _context: GenContext, shader: Shader): void {
    const ps = shader.getStage(Stage.PIXEL)
    addStageUniform(HW.PRIVATE_UNIFORMS, Type.FLOAT, HW.T_TIME, ps)
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.PIXEL) {
      const shadergen = context.getShaderGenerator()
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
      shadergen.emitString(' = ' + HW.T_TIME, stage)
      shadergen.emitLineEnd(stage)
    }
  }
}
