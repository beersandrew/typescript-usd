// Ported from MaterialX 1.39.5:
//  source/MaterialXGenHw/Nodes/HwLightCompoundNode.h,
//  source/MaterialXGenHw/Nodes/HwLightCompoundNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwLightCompoundNode.h and .cpp

import { EMPTY_STRING, NodeGraph, type InterfaceElement } from '@mtlx/core'
import {
  CompoundNode,
  ShaderNodeClassification,
  Stage,
  Type,
  VariableBlock,
  type GenContext,
  type Shader,
  type ShaderNode,
  type ShaderNodeImpl,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW, VEC3_ZERO } from '../hwConstants.ts'
import type { HwShaderGenerator } from '../hwShaderGenerator.ts'

// LightCompound node implementation for hardware languages.
export class HwLightCompoundNode extends CompoundNode {
  protected _lightUniforms = new VariableBlock(HW.LIGHT_DATA, EMPTY_STRING)

  static create(): ShaderNodeImpl {
    return new HwLightCompoundNode()
  }

  override initialize(element: InterfaceElement, context: GenContext): void {
    super.initialize(element, context)

    // Store light uniforms for all inputs on the interface
    const graph = element as NodeGraph
    const nodeDef = graph.getNodeDef()!
    for (const input of nodeDef.getActiveInputs()) {
      const type = context.getTypeDesc(input.getType())
      this._lightUniforms.add(type, input.getName())
    }
  }

  override createVariables(_node: ShaderNode, context: GenContext, shader: Shader): void {
    // Create variables for all child nodes
    for (const childNode of this._rootGraph!.getNodes()) {
      childNode.getImplementation().createVariables(childNode, context, shader)
    }

    const ps = shader.getStage(Stage.PIXEL)
    const lightData = ps.getUniformBlock(HW.LIGHT_DATA)

    // Create all light uniforms
    for (let i = 0; i < this._lightUniforms.size(); ++i) {
      lightData.addPort(this._lightUniforms.getItem(i))
    }

    const shadergen = context.getShaderGenerator() as HwShaderGenerator
    shadergen.addStageLightingUniforms(context, ps)
  }

  override emitFunctionDefinition(_node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.PIXEL) {
      const shadergen = context.getShaderGenerator() as HwShaderGenerator
      const syntax = shadergen.getSyntax()

      const vec3 = syntax.getTypeName(Type.VECTOR3)
      const outLightshader = syntax.getOutputTypeName(Type.LIGHTSHADER)
      const vec3Zero = syntax.getValueOfType(Type.VECTOR3, VEC3_ZERO)

      const rootGraph = this._rootGraph!

      // Emit functions for all child nodes
      shadergen.emitFunctionDefinitions(rootGraph, context, stage)

      shadergen.emitLine(
        'void ' + this._functionName + '(LightData light, ' + vec3 + ' position, ' + outLightshader + ' result)',
        stage,
        false,
      )

      shadergen.emitFunctionBodyBegin(rootGraph, context, stage)

      // Emit all texturing nodes. These are inputs to any
      // closure/shader nodes and need to be emitted first.
      shadergen.emitFunctionCalls(rootGraph, context, stage, ShaderNodeClassification.TEXTURE)

      // DIVERGENCE from upstream: upstream emits `-L` for the view vector
      // here, but no `L` is declared at this point in the function, and an
      // integer `0` for the float occlusion parameter, which ESSL rejects
      // (no implicit int->float conversion) — so the emitted code never
      // compiles (upstream's render tests do not exercise compound lights).
      // The line is effectively dead in realizable graphs (closures consumed
      // by the light node get their own ClosureData from HwLightNode), so a
      // zero vector and a float literal are emitted to keep the function
      // valid GLSL.
      shadergen.emitLine(
        'ClosureData closureData = makeClosureData(CLOSURE_TYPE_EMISSION, ' +
          vec3Zero +
          ', ' +
          vec3Zero +
          ', light.direction, ' +
          vec3Zero +
          ', 0.0)',
        stage,
      )
      shadergen.emitFunctionCalls(
        rootGraph,
        context,
        stage,
        ShaderNodeClassification.SHADER | ShaderNodeClassification.LIGHT,
      )

      shadergen.emitFunctionBodyEnd(rootGraph, context, stage)
    }
  }

  override emitFunctionCall(_node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.PIXEL) {
      const shadergen = context.getShaderGenerator()
      shadergen.emitLine(this._functionName + '(light, position, result)', stage)
    }
  }
}
