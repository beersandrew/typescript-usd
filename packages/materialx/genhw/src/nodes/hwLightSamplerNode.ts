// Ported from MaterialX 1.39.5:
//  source/MaterialXGenHw/Nodes/HwLightSamplerNode.h,
//  source/MaterialXGenHw/Nodes/HwLightSamplerNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwLightSamplerNode.h and .cpp

import {
  Stage,
  Type,
  stringHash,
  type GenContext,
  type ShaderNode,
  type ShaderNodeImpl,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW, VEC3_ZERO } from '../hwConstants.ts'
import { HwImplementation } from '../hwImplementation.ts'
import { HwLightShaders } from '../hwLightShaders.ts'

const SAMPLE_LIGHTS_FUNC_SIGNATURE = 'void sampleLightSource(LightData light, vec3 position, out lightshader result)'

// Utility node for sampling lights for hardware languages.
export class HwLightSamplerNode extends HwImplementation {
  constructor() {
    super()
    this._hash = stringHash(SAMPLE_LIGHTS_FUNC_SIGNATURE)
  }

  static create(): ShaderNodeImpl {
    return new HwLightSamplerNode()
  }

  override emitFunctionDefinition(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.PIXEL) {
      const shadergen = context.getShaderGenerator()
      const syntax = shadergen.getSyntax()

      const vec3 = syntax.getTypeName(Type.VECTOR3)
      const outLightshader = syntax.getOutputTypeName(Type.LIGHTSHADER)
      const vec3Zero = syntax.getValueOfType(Type.VECTOR3, VEC3_ZERO)

      // Emit light sampler function with all bound light types
      shadergen.emitLine(
        'void sampleLightSource(LightData light, ' + vec3 + ' position, ' + outLightshader + ' result)',
        stage,
        false,
      )
      shadergen.emitFunctionBodyBegin(node, context, stage)
      shadergen.emitLine('result.intensity = ' + vec3Zero, stage)
      shadergen.emitLine('result.direction = ' + vec3Zero, stage)

      const lightShaders = context.getUserData<HwLightShaders>(HW.USER_DATA_LIGHT_SHADERS)
      if (lightShaders) {
        let ifstatement = 'if '
        for (const [lightType, lightShader] of lightShaders.getAll()) {
          shadergen.emitLine(
            ifstatement + '(light.' + shadergen.getLightDataTypevarString() + ' == ' + String(lightType) + ')',
            stage,
            false,
          )
          shadergen.emitScopeBegin(stage)
          shadergen.emitFunctionCall(lightShader, context, stage)
          shadergen.emitScopeEnd(stage)
          ifstatement = 'else if '
        }
      }

      shadergen.emitFunctionBodyEnd(node, context, stage)
    }
  }
}
