// Ported from MaterialX 1.39.5:
//  source/MaterialXGenShader/Nodes/MaterialNode.h,
//  source/MaterialXGenShader/Nodes/MaterialNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/Nodes/MaterialNode.h and .cpp

import { ShaderNodeImpl } from '../shaderNodeImpl.ts'
import { ShaderNode } from '../shaderNode.ts'
import { Stage, ShaderStage } from '../shaderStage.ts'
import type { GenContext } from '../genContext.ts'

// Material node implementation.
export class MaterialNode extends ShaderNodeImpl {
  static create(): ShaderNodeImpl {
    return new MaterialNode()
  }

  override addClassification(node: ShaderNode): void {
    const surfaceshaderInput = node.getInput(ShaderNode.SURFACESHADER)
    if (surfaceshaderInput && surfaceshaderInput.getConnection()) {
      // This is a material node with a surfaceshader connected; add the
      // classification from this shader.
      const surfaceshaderNode = surfaceshaderInput.getConnection()!.getNode()!
      if (!surfaceshaderNode.isAGraph()) {
        node.addClassification(surfaceshaderNode.getClassification())
      }
    }
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() !== Stage.PIXEL) {
      return
    }
    const surfaceshaderInput = node.getInput(ShaderNode.SURFACESHADER)!

    if (!surfaceshaderInput.getConnection()) {
      // Just declare the output variable with its default value.
      this.emitOutputVariables(node, context, stage)
      return
    }

    const shadergen = context.getShaderGenerator()
    const syntax = shadergen.getSyntax()

    // Emit the function call for the upstream surface shader.
    const surfaceshaderNode = surfaceshaderInput.getConnection()!.getNode()!
    if (surfaceshaderNode.isAGraph()) {
      this.emitOutputVariables(node, context, stage)
      return
    }
    shadergen.emitFunctionCall(surfaceshaderNode, context, stage)

    // Assign this result to the material output variable.
    const output = node.getOutput()!
    shadergen.emitLine(
      syntax.getTypeName(output.getType()) + ' ' + output.getVariable() + ' = ' + surfaceshaderInput.getConnection()!.getVariable(),
      stage,
    )
  }
}
