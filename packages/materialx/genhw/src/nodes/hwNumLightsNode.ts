// Ported from MaterialX 1.39.5: source/MaterialXGenHw/Nodes/HwNumLightsNode.h,
//  source/MaterialXGenHw/Nodes/HwNumLightsNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwNumLightsNode.h and .cpp

import { Value } from '@mtlx/core'
import {
  Stage,
  Type,
  addStageUniform,
  stringHash,
  type GenContext,
  type Shader,
  type ShaderNode,
  type ShaderNodeImpl,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW } from '../hwConstants.ts'
import { HwImplementation } from '../hwImplementation.ts'

const NUM_LIGHTS_FUNC_SIGNATURE = 'int numActiveLightSources()'

// Utility node for getting number of active lights for hardware languages.
export class HwNumLightsNode extends HwImplementation {
  constructor() {
    super()
    this._hash = stringHash(NUM_LIGHTS_FUNC_SIGNATURE)
  }

  static create(): ShaderNodeImpl {
    return new HwNumLightsNode()
  }

  override createVariables(_node: ShaderNode, _context: GenContext, shader: Shader): void {
    // Create uniform for number of active light sources
    const ps = shader.getStage(Stage.PIXEL)
    const numActiveLights = addStageUniform(HW.PRIVATE_UNIFORMS, Type.INTEGER, HW.T_NUM_ACTIVE_LIGHT_SOURCES, ps)
    numActiveLights.setValue(Value.createValue(0, 'integer'))
  }

  override emitFunctionDefinition(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.PIXEL) {
      const shadergen = context.getShaderGenerator()
      shadergen.emitLine(NUM_LIGHTS_FUNC_SIGNATURE, stage, false)
      shadergen.emitFunctionBodyBegin(node, context, stage)
      shadergen.emitLine('return min(' + HW.T_NUM_ACTIVE_LIGHT_SOURCES + ', ' + HW.LIGHT_DATA_MAX_LIGHT_SOURCES + ') ', stage)
      shadergen.emitFunctionBodyEnd(node, context, stage)
    }
  }
}
