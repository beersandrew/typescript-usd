// Ported from MaterialX 1.39.5:
//  source/MaterialXGenShader/Nodes/CompoundNode.h,
//  source/MaterialXGenShader/Nodes/CompoundNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/Nodes/CompoundNode.h and .cpp

import { InterfaceElement, NodeGraph } from '@mtlx/core'
import { ExceptionShaderGenError } from '../exceptions.ts'
import { ShaderInterfaceType } from '../genOptions.ts'
import { ShaderNodeImpl, stringHash } from '../shaderNodeImpl.ts'
import { ShaderNode, ShaderNodeClassification } from '../shaderNode.ts'
import { ShaderGraph } from '../shaderGraph.ts'
import { Stage, ShaderStage } from '../shaderStage.ts'
import type { GenContext } from '../genContext.ts'
import type { Shader } from '../shader.ts'

// Compound (functional nodegraph) node implementation.
export class CompoundNode extends ShaderNodeImpl {
  protected _rootGraph: ShaderGraph | null = null
  protected _functionName = ''

  static create(): ShaderNodeImpl {
    return new CompoundNode()
  }

  override addClassification(node: ShaderNode): void {
    // Add classification from the graph implementation.
    node.addClassification(this._rootGraph!.getClassification())
  }

  override initialize(element: InterfaceElement, context: GenContext): void {
    super.initialize(element, context)

    if (!(element instanceof NodeGraph)) {
      throw new ExceptionShaderGenError(`Element '${element.getName()}' is not a node graph implementation`)
    }

    this._functionName = context.getShaderGenerator().getSyntax().makeValidName(element.getName())

    // For compounds we do not want to publish all internal inputs, so the
    // reduced interface is always used for this graph.
    const oldShaderInterfaceType = context.getOptions().shaderInterfaceType
    context.getOptions().shaderInterfaceType = ShaderInterfaceType.SHADER_INTERFACE_REDUCED
    this._rootGraph = ShaderGraph.createFromNodeGraph(null, element, context)
    context.getOptions().shaderInterfaceType = oldShaderInterfaceType

    // Set the hash using the function name.
    this._hash = stringHash(this._functionName)
  }

  override getGraph(): ShaderGraph | null {
    return this._rootGraph
  }

  override createVariables(_node: ShaderNode, context: GenContext, shader: Shader): void {
    // Gather shader inputs from all child nodes.
    for (const childNode of this._rootGraph!.getNodes()) {
      childNode.getImplementation().createVariables(childNode, context, shader)
    }
  }

  override emitFunctionDefinition(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() !== Stage.PIXEL) {
      return
    }
    const shadergen = context.getShaderGenerator()
    const rootGraph = this._rootGraph!

    // Emit functions for all child nodes.
    shadergen.emitFunctionDefinitions(rootGraph, context, stage)

    // Begin the function signature.
    shadergen.emitLineBegin(stage)
    shadergen.emitString('void ' + this._functionName + '(', stage)

    shadergen.emitClosureDataParameter(node, context, stage)

    let delim = ''

    // Add all inputs.
    for (const inputSocket of rootGraph.getInputSockets()) {
      shadergen.emitString(delim, stage)
      shadergen.emitFunctionDefinitionParameter(inputSocket, false, context, stage)
      delim = ', '
    }

    // Add all outputs.
    for (const outputSocket of rootGraph.getOutputSockets()) {
      shadergen.emitString(delim, stage)
      shadergen.emitFunctionDefinitionParameter(outputSocket, true, context, stage)
      delim = ', '
    }

    // End the function signature.
    shadergen.emitString(')', stage)
    shadergen.emitLineEnd(stage, false)

    // Begin the function body.
    shadergen.emitFunctionBodyBegin(rootGraph, context, stage)

    if (this.nodeOutputIsClosure(node)) {
      // Emit all texturing nodes; these are inputs to the closure nodes and
      // need to be emitted first.
      shadergen.emitFunctionCalls(rootGraph, context, stage, ShaderNodeClassification.TEXTURE)

      // Emit function calls for internal closure nodes connected to the
      // graph sockets; these in turn emit calls for dependent closures
      // upstream. The classification check matches nodeOutputIsClosure().
      for (const outputSocket of rootGraph.getOutputSockets()) {
        if (outputSocket.getConnection()) {
          const upstream = outputSocket.getConnection()!.getNode()!
          if (
            upstream.getParent() === rootGraph &&
            (upstream.hasClassification(ShaderNodeClassification.CLOSURE) ||
              upstream.hasClassification(ShaderNodeClassification.SHADER) ||
              upstream.hasClassification(ShaderNodeClassification.MATERIAL))
          ) {
            shadergen.emitFunctionCall(upstream, context, stage)
          }
        }
      }
    } else {
      shadergen.emitFunctionCalls(rootGraph, context, stage)
    }

    // Emit the final results.
    for (const outputSocket of rootGraph.getOutputSockets()) {
      const result = shadergen.getUpstreamResult(outputSocket, context)
      shadergen.emitLine(outputSocket.getVariable() + ' = ' + result, stage)
    }

    // End the function body.
    shadergen.emitFunctionBodyEnd(rootGraph, context, stage)
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    const shadergen = context.getShaderGenerator()
    const rootGraph = this._rootGraph!

    if (stage.getName() === Stage.VERTEX) {
      // Emit function calls for all child nodes to the vertex shader stage.
      shadergen.emitFunctionCalls(rootGraph, context, stage)
      return
    }

    if (stage.getName() !== Stage.PIXEL) {
      return
    }

    if (this.nodeOutputIsClosure(node)) {
      // Emit calls for any closure dependencies upstream from this nodedef.
      shadergen.emitDependentFunctionCalls(node, context, stage, ShaderNodeClassification.CLOSURE)
    }

    // Declare the output variables.
    this.emitOutputVariables(node, context, stage)

    // Begin the function call.
    shadergen.emitLineBegin(stage)
    shadergen.emitString(this._functionName + '(', stage)

    // Add an argument for closure data if needed.
    shadergen.emitClosureDataArg(node, context, stage)

    let delim = ''

    // Emit inputs.
    for (const input of node.getInputs()) {
      shadergen.emitString(delim, stage)
      shadergen.emitInput(input, context, stage)
      delim = ', '
    }

    // Emit outputs.
    for (let i = 0; i < node.numOutputs(); ++i) {
      shadergen.emitString(delim, stage)
      shadergen.emitOutput(node.getOutput(i)!, false, false, context, stage)
      delim = ', '
    }

    // End the function call.
    shadergen.emitString(')', stage)
    shadergen.emitLineEnd(stage)
  }
}
