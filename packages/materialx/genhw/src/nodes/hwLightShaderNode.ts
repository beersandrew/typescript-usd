// Ported from MaterialX 1.39.5:
//  source/MaterialXGenHw/Nodes/HwLightShaderNode.h,
//  source/MaterialXGenHw/Nodes/HwLightShaderNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwLightShaderNode.h and .cpp

import { EMPTY_STRING, Implementation, type InterfaceElement } from '@mtlx/core'
import {
  ExceptionShaderGenError,
  SourceCodeNode,
  Stage,
  VariableBlock,
  type GenContext,
  type Shader,
  type ShaderNode,
  type ShaderNodeImpl,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW } from '../hwConstants.ts'
import type { HwShaderGenerator } from '../hwShaderGenerator.ts'

// LightShader node implementation for hardware languages.
// Used for all light shaders implemented in source code.
export class HwLightShaderNode extends SourceCodeNode {
  protected _lightUniforms = new VariableBlock(HW.LIGHT_DATA, EMPTY_STRING)

  static override create(): ShaderNodeImpl {
    return new HwLightShaderNode()
  }

  override initialize(element: InterfaceElement, context: GenContext): void {
    super.initialize(element, context)

    if (this._inlined) {
      throw new ExceptionShaderGenError("Light shaders doesn't support inlined implementations'")
    }

    if (!(element instanceof Implementation)) {
      throw new ExceptionShaderGenError("Element '" + element.getName() + "' is not an Implementation element")
    }

    const impl = element

    // Store light uniforms for all inputs on the interface
    const nodeDef = impl.getNodeDef()!
    for (const input of nodeDef.getActiveInputs()) {
      const type = context.getTypeDesc(input.getType())
      this._lightUniforms.add(type, input.getName(), input.getValue())
    }
  }

  override createVariables(_node: ShaderNode, context: GenContext, shader: Shader): void {
    const ps = shader.getStage(Stage.PIXEL)

    // Create all light uniforms
    const lightData = ps.getUniformBlock(HW.LIGHT_DATA)
    for (let i = 0; i < this._lightUniforms.size(); ++i) {
      const u = this._lightUniforms.getItem(i)
      lightData.add(u.getType(), u.getName())
    }

    const shadergen = context.getShaderGenerator() as HwShaderGenerator
    shadergen.addStageLightingUniforms(context, ps)
  }

  override emitFunctionCall(_node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.PIXEL) {
      const shadergen = context.getShaderGenerator()
      shadergen.emitLine(this._functionName + '(light, position, result)', stage)
    }
  }
}
