// Ported from MaterialX 1.39.5: source/MaterialXGenShader/GenContext.h,
//  source/MaterialXGenShader/GenContext.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/GenContext.h and GenContext.cpp

import { Node } from '@mtlx/core'
import { FilePath, FileSearchPath } from '@mtlx/format'
import { GenOptions } from './genOptions.ts'
import { GenUserData } from './genUserData.ts'
import { TypeDesc } from './typeDesc.ts'
import type { ShaderGenerator } from './shaderGenerator.ts'
import type { ShaderNodeImpl } from './shaderNodeImpl.ts'
import type { ShaderInput, ShaderNode, ShaderOutput, ShaderPort } from './shaderNode.ts'

// A standard function to allow for handling of application variables for a
// given node.
export type ApplicationVariableHandler = ((node: ShaderNode, context: GenContext) => void) | null

// A context class for shader generation, holding data needed during
// generation.
export class GenContext {
  protected _sg: ShaderGenerator
  protected _options = new GenOptions()
  protected _sourceCodeSearchPath = new FileSearchPath()
  protected _reservedWords = new Set<string>()
  protected _nodeImpls = new Map<string, ShaderNodeImpl>()
  protected _userData = new Map<string, GenUserData[]>()
  protected _inputSuffix = new Map<ShaderInput, string>()
  protected _outputSuffix = new Map<ShaderOutput, string>()
  protected _parentNodes: Node[] = []
  protected _applicationVariableHandler: ApplicationVariableHandler = null

  constructor(sg: ShaderGenerator) {
    this._sg = sg

    // Apply the generator's default options for its target (e.g. HW targets
    // default premultipliedBsdfAdd to true). Without this, HW codegen ran with
    // GenOptions defaults and diverged from upstream on BSDF-add layering.
    this._sg.applyDefaultOptions(this._options)

    // Collect and cache reserved words from the shader generator: the syntax's
    // reserved words plus any non-empty token-substitution identifiers.
    const reservedWords = new Set<string>(this._sg.getSyntax().getReservedWords())
    for (const value of this._sg.getTokenSubstitutions().values()) {
      if (value) {
        reservedWords.add(value)
      }
    }
    this.addReservedWords(reservedWords)
  }

  // The C++ class is copied by value (implicit copy constructor): the copy
  // shares the generator, node implementations and user data, and has its
  // own options, search path, reserved words and suffix maps.
  // (Local addition for C++ `GenContext copy = context;`; see PROVENANCE.md.)
  copy(): GenContext {
    const result = Object.create(GenContext.prototype) as GenContext
    result._sg = this._sg
    result._options = Object.assign(new GenOptions(), this._options)
    result._sourceCodeSearchPath = this._sourceCodeSearchPath.copy()
    result._reservedWords = new Set(this._reservedWords)
    result._nodeImpls = new Map(this._nodeImpls)
    result._userData = new Map([...this._userData].map(([k, v]) => [k, [...v]]))
    result._inputSuffix = new Map(this._inputSuffix)
    result._outputSuffix = new Map(this._outputSuffix)
    result._parentNodes = [...this._parentNodes]
    result._applicationVariableHandler = this._applicationVariableHandler
    return result
  }

  // Return the shader generator.
  getShaderGenerator(): ShaderGenerator {
    return this._sg
  }

  // Return the shader generation options.
  getOptions(): GenOptions {
    return this._options
  }

  // Return a TypeDesc for the given type name.
  getTypeDesc(name: string): TypeDesc {
    return this._sg.getTypeSystem().getType(name)
  }

  // Register a user search path for finding source code during generation.
  registerSourceCodeSearchPath(path: FilePath | FileSearchPath): void {
    if (path instanceof FileSearchPath) {
      this._sourceCodeSearchPath.append(path)
    } else {
      this._sourceCodeSearchPath.append(path)
    }
  }

  // Resolve a source code filename, first checking the given local path,
  // then any file paths registered by the user.
  resolveSourceFile(filename: FilePath, localPath: FilePath): FilePath {
    const searchPath = this._sourceCodeSearchPath.copy()
    if (!localPath.isEmpty()) {
      searchPath.prepend(localPath)
    }
    return searchPath.find(filename).getNormalized()
  }

  // Add reserved words that should not be used as identifiers during code
  // generation.
  addReservedWords(names: Set<string> | string[]): void {
    for (const name of names) {
      this._reservedWords.add(name)
    }
  }

  // Return the set of reserved words.
  getReservedWords(): Set<string> {
    return this._reservedWords
  }

  // Cache a shader node implementation.
  addNodeImplementation(name: string, impl: ShaderNodeImpl): void {
    this._nodeImpls.set(name, impl)
  }

  // Find and return a cached shader node implementation, or null.
  findNodeImplementation(name: string): ShaderNodeImpl | null {
    return this._nodeImpls.get(name) ?? null
  }

  // Get the names of all cached node implementations.
  getNodeImplementationNames(names: Set<string>): void {
    for (const name of this._nodeImpls.keys()) {
      names.add(name)
    }
  }

  // Clear all cached shader node implementations.
  clearNodeImplementations(): void {
    this._nodeImpls.clear()
  }

  // Push a parent node onto the stack.
  pushParentNode(node: Node): void {
    this._parentNodes.push(node)
  }

  // Pop the current parent node from the stack.
  popParentNode(): void {
    this._parentNodes.pop()
  }

  // Return the current stack of parent nodes.
  getParentNodes(): Node[] {
    return this._parentNodes
  }

  // Add user data to the context, available during generation.
  pushUserData(name: string, data: GenUserData): void {
    const stack = this._userData.get(name)
    if (stack) {
      stack.push(data)
    } else {
      this._userData.set(name, [data])
    }
  }

  // Remove user data from the context.
  popUserData(name: string): void {
    this._userData.get(name)?.pop()
  }

  // Clear all user data from the context.
  clearUserData(): void {
    this._userData.clear()
  }

  // Return user data with the given name, or null. (The C++ template cast
  // is expressed by callers via instanceof or as-casts.)
  getUserData<T extends GenUserData = GenUserData>(name: string): T | null {
    const stack = this._userData.get(name)
    return stack && stack.length > 0 ? (stack[stack.length - 1] as T) : null
  }

  // Add an input suffix to be used for the input in this context.
  addInputSuffix(input: ShaderInput, suffix: string): void {
    this._inputSuffix.set(input, suffix)
  }

  // Remove the input suffix for the given input.
  removeInputSuffix(input: ShaderInput): void {
    this._inputSuffix.delete(input)
  }

  // Get the input suffix for the given input, or the empty string.
  getInputSuffix(input: ShaderInput): string {
    return this._inputSuffix.get(input) ?? ''
  }

  // Add an output suffix to be used for the output in this context.
  addOutputSuffix(output: ShaderOutput, suffix: string): void {
    this._outputSuffix.set(output, suffix)
  }

  // Remove the output suffix for the given output.
  removeOutputSuffix(output: ShaderOutput): void {
    this._outputSuffix.delete(output)
  }

  // Get the output suffix for the given output, or the empty string.
  getOutputSuffix(output: ShaderOutput): string {
    return this._outputSuffix.get(output) ?? ''
  }

  // Set the handler for application variables.
  setApplicationVariableHandler(handler: ApplicationVariableHandler): void {
    this._applicationVariableHandler = handler
  }

  // Get the handler for application variables.
  getApplicationVariableHandler(): ApplicationVariableHandler {
    return this._applicationVariableHandler
  }
}

// A scope class for overriding port variable names; call restore() at the
// end of the scope (C++ uses RAII).
export class ScopedSetVariableName {
  private _port: ShaderPort
  private _oldName: string

  constructor(name: string, port: ShaderPort) {
    this._port = port
    this._oldName = port.getVariable()
    port.setVariable(name)
  }

  restore(): void {
    this._port.setVariable(this._oldName)
  }
}
