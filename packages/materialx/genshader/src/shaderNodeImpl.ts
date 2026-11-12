// Ported from MaterialX 1.39.5: source/MaterialXGenShader/ShaderNodeImpl.h,
//  source/MaterialXGenShader/ShaderNodeImpl.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/ShaderNodeImpl.h and ShaderNodeImpl.cpp

import { InterfaceElement, Node } from '@mtlx/core'
import { ExceptionShaderGenError } from './exceptions.ts'
import type { GenContext } from './genContext.ts'
import type { Shader } from './shader.ts'
import type { ShaderStage } from './shaderStage.ts'
import type { ShaderGraph } from './shaderGraph.ts'
import type { ShaderInput, ShaderNode, ShaderOutput } from './shaderNode.ts'

// The same string hash used elsewhere in the port (FNV-1a, 32-bit), used
// for implementation hashes that detect already-emitted functions.
export function stringHash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h, 16777619) ^ str.charCodeAt(i)
    h = h >>> 0
  }
  return h
}

// Class handling the shader generation implementation for a node,
// responsible for emitting the function definition and function call.
export class ShaderNodeImpl {
  protected _name = ''
  protected _hash = 0

  // Initialize with the given implementation element. Sets the name and
  // hash for the implementation.
  initialize(element: InterfaceElement, _context: GenContext): void {
    this._name = element.getName()
    // By default use the implementation name as hash to make it unique.
    this._hash = stringHash(this._name)
  }

  // Return the name of this implementation.
  getName(): string {
    return this._name
  }

  // Return a hash for this implementation, corresponding to the function
  // signature generated for the node.
  getHash(): number {
    return this._hash
  }

  // Add additional inputs on a node.
  addInputs(_node: ShaderNode, _context: GenContext): void {}

  // Set values for additional inputs on a node.
  setValues(_node: Node, _shaderNode: ShaderNode, _context: GenContext): void {}

  // Add additional classifications on a node.
  addClassification(_node: ShaderNode): void {}

  // Create shader variables needed for the implementation of this node
  // (e.g. uniforms, inputs and outputs).
  createVariables(_node: ShaderNode, _context: GenContext, _shader: Shader): void {}

  // Emit the function definition for the given node instance.
  emitFunctionDefinition(_node: ShaderNode, _context: GenContext, _stage: ShaderStage): void {}

  // Emit the function call or inline source code for the given node
  // instance in the given context.
  emitFunctionCall(_node: ShaderNode, _context: GenContext, _stage: ShaderStage): void {}

  // Emit declaration and initialization of output variables to use in a
  // function call.
  emitOutputVariables(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    const shadergen = context.getShaderGenerator()
    for (let i = 0; i < node.numOutputs(); ++i) {
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput(i)!, true, true, context, stage)
      shadergen.emitLineEnd(stage)
    }
  }

  // Return the graph if this implementation is using a graph, or null.
  getGraph(): ShaderGraph | null {
    return null
  }

  // Returns true if an input is editable by users. Editable inputs are
  // allowed to be published as shader uniforms.
  isEditable(_input: ShaderInput | ShaderOutput): boolean {
    return true
  }

  // Returns true if the first output of the node is a closure.
  protected nodeOutputIsClosure(node: ShaderNode): boolean {
    const outputs = node.getOutputs()
    if (outputs.length === 0) {
      throw new ExceptionShaderGenError('Node has no outputs defined')
    }
    return outputs[0]!.getType().isClosure()
  }
}

// A no-operation node, used for organizational nodes with no code.
export class NopNode extends ShaderNodeImpl {
  static create(): ShaderNodeImpl {
    return new NopNode()
  }
}
