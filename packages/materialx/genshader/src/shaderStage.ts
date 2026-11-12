// Ported from MaterialX 1.39.5: source/MaterialXGenShader/ShaderStage.h,
//  source/MaterialXGenShader/ShaderStage.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/ShaderStage.h and ShaderStage.cpp

import { Value, EMPTY_STRING } from '@mtlx/core'
import { FilePath, readFile } from '@mtlx/format'
import { ExceptionShaderGenError } from './exceptions.ts'
import { Punctuation, Syntax } from './syntax.ts'
import { TypeDesc } from './typeDesc.ts'
import { ShaderPort, type ShaderNode } from './shaderNode.ts'
import { tokenSubstitution } from './util.ts'
import type { GenContext } from './genContext.ts'

// Stage identifiers. PIXEL is the main stage used by all shader targets;
// multi-stage targets add additional identifiers.
export const Stage = {
  PIXEL: 'pixel',
  VERTEX: 'vertex',
} as const

// A standard function predicate taking a ShaderPort and returning a boolean.
export type ShaderPortPredicate = (port: ShaderPort) => boolean

// A block of variables in a shader stage.
export class VariableBlock {
  private _name: string
  private _instance: string
  private _variableMap = new Map<string, ShaderPort>()
  private _variableOrder: ShaderPort[] = []

  constructor(name: string, instance: string) {
    this._name = name
    this._instance = instance
  }

  getName(): string {
    return this._name
  }

  setName(name: string): void {
    this._name = name
  }

  getInstance(): string {
    return this._instance
  }

  setInstance(instance: string): void {
    this._instance = instance
  }

  empty(): boolean {
    return this._variableOrder.length === 0
  }

  size(): number {
    return this._variableOrder.length
  }

  // Return a variable by index, or by name (throwing if missing, like the
  // C++ operator[]).
  getItem(key: number | string): ShaderPort {
    if (typeof key === 'number') {
      const v = this._variableOrder[key]
      if (!v) {
        throw new ExceptionShaderGenError(`No variable at index ${key} for block '${this.getName()}'`)
      }
      return v
    }
    const v = this.find(key)
    if (!v) {
      throw new ExceptionShaderGenError(`No variable named '${key}' exists for block '${this.getName()}'`)
    }
    return v
  }

  // Return our variable order vector.
  getVariableOrder(): ShaderPort[] {
    return this._variableOrder
  }

  // Return a variable by name or predicate, or null.
  find(key: string | ShaderPortPredicate): ShaderPort | null {
    if (typeof key === 'string') {
      return this._variableMap.get(key) ?? null
    }
    for (const port of this._variableOrder) {
      if (key(port)) {
        return port
      }
    }
    return null
  }

  // Add a new shader port to this block. When shouldWiden is false an
  // exception is thrown if an existing same-named port has a different
  // type; when true the existing port's type is widened as needed.
  add(type: TypeDesc, name: string, value: Value | null = null, shouldWiden = false): ShaderPort {
    const existing = this._variableMap.get(name)
    if (existing) {
      if (shouldWiden) {
        if (existing.getType().getSize() < type.getSize()) {
          existing.setType(type)
        }
      } else if (type.notEquals(existing.getType())) {
        throw new ExceptionShaderGenError(
          `Trying to add shader port '${name}' with type '${type.getName()}', ` +
            `but existing shader port with type '${existing.getType().getName()}' was found`,
        )
      }
      return existing
    }

    const port = new ShaderPort(null, type, name, value)
    this._variableMap.set(name, port)
    this._variableOrder.push(port)
    return port
  }

  // Add an existing shader port to this block.
  addPort(port: ShaderPort): void {
    if (!this._variableMap.has(port.getName())) {
      this._variableMap.set(port.getName(), port)
      this._variableOrder.push(port)
    }
  }
}

interface Scope {
  punctuation: Punctuation
  functions: Set<ShaderNode>
}

// A shader stage, containing the state and resulting source code for the
// stage.
export class ShaderStage {
  private readonly _name: string
  private _functionName = ''
  private _syntax: Syntax
  private _indentations = 0
  private _scopes: Scope[] = []
  private _includes = new Set<string>()
  private _sourceDependencies = new Set<string>()
  private _definedFunctions = new Set<number>()
  private _constants = new VariableBlock('Constants', 'cn')
  private _uniforms = new Map<string, VariableBlock>()
  private _inputs = new Map<string, VariableBlock>()
  private _outputs = new Map<string, VariableBlock>()
  private _code = ''

  constructor(name: string, syntax: Syntax) {
    this._name = name
    this._syntax = syntax
  }

  getName(): string {
    return this._name
  }

  getFunctionName(): string {
    return this._functionName
  }

  setFunctionName(functionName: string): void {
    this._functionName = functionName
  }

  setSourceCode(code: string): void {
    this._code = code
  }

  getSourceCode(): string {
    return this._code
  }

  // Create a new uniform variable block.
  createUniformBlock(name: string, instance = EMPTY_STRING): VariableBlock {
    let block = this._uniforms.get(name)
    if (!block) {
      block = new VariableBlock(name, instance)
      this._uniforms.set(name, block)
    }
    return block
  }

  // Create a new input variable block.
  createInputBlock(name: string, instance = EMPTY_STRING): VariableBlock {
    let block = this._inputs.get(name)
    if (!block) {
      block = new VariableBlock(name, instance)
      this._inputs.set(name, block)
    }
    return block
  }

  // Create a new output variable block.
  createOutputBlock(name: string, instance = EMPTY_STRING): VariableBlock {
    let block = this._outputs.get(name)
    if (!block) {
      block = new VariableBlock(name, instance)
      this._outputs.set(name, block)
    }
    return block
  }

  // Return the uniform variable block with the given name.
  getUniformBlock(name: string): VariableBlock {
    const block = this._uniforms.get(name)
    if (!block) {
      throw new ExceptionShaderGenError(`No uniform block named '${name}' exists for shader stage '${this.getName()}'`)
    }
    return block
  }

  // Return the input variable block with the given name.
  getInputBlock(name: string): VariableBlock {
    const block = this._inputs.get(name)
    if (!block) {
      throw new ExceptionShaderGenError(`No input block named '${name}' exists for shader stage '${this.getName()}'`)
    }
    return block
  }

  // Return the output variable block with the given name.
  getOutputBlock(name: string): VariableBlock {
    const block = this._outputs.get(name)
    if (!block) {
      throw new ExceptionShaderGenError(`No output block named '${name}' exists for shader stage '${this.getName()}'`)
    }
    return block
  }

  // Return the constant variable block.
  getConstantBlock(): VariableBlock {
    return this._constants
  }

  // Return the uniform/input/output block maps. The C++ uses ordered maps,
  // so iteration is in sorted key order.
  getUniformBlocks(): Map<string, VariableBlock> {
    return this.sortedBlocks(this._uniforms)
  }

  getInputBlocks(): Map<string, VariableBlock> {
    return this.sortedBlocks(this._inputs)
  }

  getOutputBlocks(): Map<string, VariableBlock> {
    return this.sortedBlocks(this._outputs)
  }

  private sortedBlocks(blocks: Map<string, VariableBlock>): Map<string, VariableBlock> {
    return new Map([...blocks.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  }

  // Return the set of all included files.
  getIncludes(): Set<string> {
    return this._includes
  }

  // Return the set of all source dependencies.
  getSourceDependencies(): Set<string> {
    return this._sourceDependencies
  }

  // Start a new scope using the given bracket type.
  beginScope(punc: Punctuation = Punctuation.CURLY_BRACKETS): void {
    switch (punc) {
      case Punctuation.CURLY_BRACKETS:
        this.beginLine()
        this._code += '{' + this._syntax.getNewline()
        break
      case Punctuation.PARENTHESES:
        this.beginLine()
        this._code += '(' + this._syntax.getNewline()
        break
      case Punctuation.SQUARE_BRACKETS:
        this.beginLine()
        this._code += '[' + this._syntax.getNewline()
        break
      case Punctuation.DOUBLE_SQUARE_BRACKETS:
        this.beginLine()
        this._code += '[[' + this._syntax.getNewline()
        break
    }

    ++this._indentations
    this._scopes.push({ punctuation: punc, functions: new Set() })
  }

  // End the current scope.
  endScope(semicolon = false, newline = true): void {
    if (this._scopes.length === 0) {
      throw new ExceptionShaderGenError('End scope called with no scope active, please check your beginScope/endScope calls')
    }

    const punc = this._scopes.pop()!.punctuation
    --this._indentations

    switch (punc) {
      case Punctuation.CURLY_BRACKETS:
        this.beginLine()
        this._code += '}'
        break
      case Punctuation.PARENTHESES:
        this.beginLine()
        this._code += ')'
        break
      case Punctuation.SQUARE_BRACKETS:
        this.beginLine()
        this._code += ']'
        break
      case Punctuation.DOUBLE_SQUARE_BRACKETS:
        this.beginLine()
        this._code += ']]'
        break
    }
    if (semicolon) this._code += ';'
    if (newline) this._code += this._syntax.getNewline()
  }

  // Start a new line.
  beginLine(): void {
    for (let i = 0; i < this._indentations; ++i) {
      this._code += this._syntax.getIndentation()
    }
  }

  // End the current line.
  endLine(semicolon = true): void {
    if (semicolon) {
      this._code += ';'
    }
    this.newLine()
  }

  // Add a newline character.
  newLine(): void {
    this._code += this._syntax.getNewline()
  }

  // Add a string.
  addString(str: string): void {
    this._code += str
  }

  // Add a single line of code, optionally appending a semicolon.
  addLine(str: string, semicolon = true): void {
    this.beginLine()
    this.addString(str)
    this.endLine(semicolon)
  }

  // Add a single-line code comment.
  addComment(str: string): void {
    this.beginLine()
    this._code += this._syntax.getSingleLineComment() + str
    this.endLine(false)
  }

  // Add a block of code, processing include statements within it.
  addBlock(str: string, sourceFilename: FilePath, context: GenContext): void {
    const INCLUDE = this._syntax.getIncludeStatement()
    const QUOTE = this._syntax.getStringQuote()

    // Add each line in the block separately to get correct indentation.
    // std::getline yields no final empty line after a trailing newline.
    const lines = str.split('\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    for (const line of lines) {
      const pos = line.indexOf(INCLUDE)
      if (pos !== -1) {
        const startQuote = line.indexOf(QUOTE)
        const endQuote = line.lastIndexOf(QUOTE)
        if (startQuote !== -1 && endQuote !== -1 && endQuote > startQuote) {
          const length = endQuote - startQuote - 1
          if (length > 0) {
            const filename = line.slice(startQuote + 1, startQuote + 1 + length)
            this.addInclude(new FilePath(filename), sourceFilename, context)
          }
        }
      } else {
        this.addLine(line, false)
      }
    }
  }

  // Add the contents of an include file if not already present.
  addInclude(includeFilename: FilePath, sourceFilename: FilePath, context: GenContext): void {
    const modifiedFile = tokenSubstitution(
      context.getShaderGenerator().getTokenSubstitutions(),
      includeFilename.asString(),
    )
    const resolvedFile = context.resolveSourceFile(new FilePath(modifiedFile), sourceFilename.getParentPath())

    if (!this._includes.has(resolvedFile.asString())) {
      const content = readFile(resolvedFile)
      if (content === '') {
        throw new ExceptionShaderGenError(`Could not find include file: '${includeFilename.asString()}'`)
      }
      this._includes.add(resolvedFile.asString())
      this.addBlock(content, resolvedFile, context)
    }
  }

  // Return true if this stage depends on the given source file.
  hasSourceDependency(file: FilePath): boolean {
    return this._sourceDependencies.has(file.asString())
  }

  // Mark the given source file as a dependency of this stage.
  addSourceDependency(file: FilePath): void {
    this._sourceDependencies.add(file.asString())
  }

  // Add a value to the stage code.
  addValue(value: unknown): void {
    this._code += String(value)
  }

  // Add the function definition for a node's implementation.
  addFunctionDefinition(node: ShaderNode, context: GenContext): void {
    const impl = node.getImplementation()
    const id = impl.getHash()

    if (!this._definedFunctions.has(id)) {
      this._definedFunctions.add(id)
      impl.emitFunctionDefinition(node, context, this)
    }
  }

  // Add the function call for the given node, registering it as called in
  // the current scope. When emitCode is false the code is omitted.
  addFunctionCall(node: ShaderNode, context: GenContext, emitCode = true): void {
    this._scopes[this._scopes.length - 1]!.functions.add(node)

    if (emitCode) {
      node.getImplementation().emitFunctionCall(node, context, this)
    }
  }

  // Return true if the function for the given node has been emitted in the
  // current scope chain.
  isEmitted(node: ShaderNode, _context: GenContext): boolean {
    for (const s of this._scopes) {
      if (s.functions.has(node)) {
        return true
      }
    }
    return false
  }
}

// Utility for adding a new shader port to a uniform block.
export function addStageUniform(block: string, type: TypeDesc, name: string, stage: ShaderStage): ShaderPort {
  return stage.getUniformBlock(block).add(type, name)
}

// Utility for adding a new shader port to an input block.
export function addStageInput(
  block: string,
  type: TypeDesc,
  name: string,
  stage: ShaderStage,
  shouldWiden = false,
): ShaderPort {
  return stage.getInputBlock(block).add(type, name, null, shouldWiden)
}

// Utility for adding a new shader port to an output block.
export function addStageOutput(
  block: string,
  type: TypeDesc,
  name: string,
  stage: ShaderStage,
  shouldWiden = false,
): ShaderPort {
  return stage.getOutputBlock(block).add(type, name, null, shouldWiden)
}

// Utility for adding a connector block between stages.
export function addStageConnectorBlock(block: string, instance: string, from: ShaderStage, to: ShaderStage): void {
  from.createOutputBlock(block, instance)
  to.createInputBlock(block, instance)
}

// Utility for adding a variable to a stage connector block.
export function addStageConnector(
  block: string,
  type: TypeDesc,
  name: string,
  from: ShaderStage,
  to: ShaderStage,
  shouldWiden = false,
): void {
  addStageOutput(block, type, name, from, shouldWiden)
  addStageInput(block, type, name, to, shouldWiden)
}
