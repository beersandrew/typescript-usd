// Ported from MaterialX 1.39.5:
//  source/MaterialXGenShader/Nodes/SourceCodeNode.h,
//  source/MaterialXGenShader/Nodes/SourceCodeNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/Nodes/SourceCodeNode.h and .cpp

import { Implementation, InterfaceElement, replaceSubstrings } from '@mtlx/core'
import { FilePath, readFile } from '@mtlx/format'
import { ExceptionShaderGenError } from '../exceptions.ts'
import { ShaderNodeImpl, stringHash } from '../shaderNodeImpl.ts'
import { ShaderNode, ShaderNodeClassification, ShaderPort } from '../shaderNode.ts'
import { Stage, ShaderStage } from '../shaderStage.ts'
import type { GenContext } from '../genContext.ts'

const INLINE_VARIABLE_PREFIX = '{{'
const INLINE_VARIABLE_SUFFIX = '}}'

// Implementation for a node using data-driven static source code. This is
// the default implementation used for all nodes that do not have a custom
// ShaderNodeImpl class.
export class SourceCodeNode extends ShaderNodeImpl {
  protected _inlined = false
  protected _functionName = ''
  protected _functionSource = ''
  protected _sourceFilename = new FilePath()

  static create(): ShaderNodeImpl {
    return new SourceCodeNode()
  }

  // Resolve the source file and read the source code during initialization.
  protected resolveSourceCode(element: InterfaceElement, context: GenContext): void {
    const impl = element as Implementation

    const localPath = new FilePath(impl.getActiveSourceUri()).getParentPath()
    this._sourceFilename = context.resolveSourceFile(new FilePath(impl.getAttribute('file')), localPath)
    this._functionSource = readFile(this._sourceFilename)
    if (this._functionSource === '') {
      throw new ExceptionShaderGenError(
        `Failed to get source code from file '${this._sourceFilename.asString()}' used by implementation '${impl.getName()}'`,
      )
    }
  }

  override initialize(element: InterfaceElement, context: GenContext): void {
    super.initialize(element, context)

    if (!(element instanceof Implementation)) {
      throw new ExceptionShaderGenError(`Element '${element.getName()}' is not an Implementation element`)
    }

    // Get source code from either an attribute or a file.
    this._functionSource = element.getAttribute('sourcecode')
    if (this._functionSource === '') {
      this.resolveSourceCode(element, context)
    }

    // Find the function name to use; if no function is given the source
    // will be inlined.
    this._functionName = element.getAttribute('function')

    this._inlined = this._functionName === ''
    if (!this._inlined) {
      // Make sure the function name is valid.
      const validFunctionName = context.getShaderGenerator().getSyntax().makeValidName(this._functionName)
      if (this._functionName !== validFunctionName) {
        throw new ExceptionShaderGenError(
          `Function name '${this._functionName}' used by implementation '${element.getName()}' is not a valid identifier.`,
        )
      }
    } else {
      this._functionSource = replaceSubstrings(this._functionSource, new Map([['\n', '']]))
    }

    // Set the hash using the function name.
    this._hash = stringHash(this._functionName)
  }

  override emitFunctionDefinition(_node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (this._inlined || this._functionSource === '' || this._sourceFilename.isEmpty()) {
      return
    }

    if (stage.getName() === Stage.PIXEL) {
      if (!stage.hasSourceDependency(this._sourceFilename)) {
        const shadergen = context.getShaderGenerator()
        shadergen.emitBlock(this._functionSource, this._sourceFilename, context, stage)
        shadergen.emitLineBreak(stage)
        stage.addSourceDependency(this._sourceFilename)
      }
    }
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() !== Stage.PIXEL) {
      return
    }
    const shadergen = context.getShaderGenerator()

    if (this.nodeOutputIsClosure(node)) {
      // Emit calls for any closure dependencies upstream from this nodedef.
      shadergen.emitDependentFunctionCalls(node, context, stage, ShaderNodeClassification.CLOSURE)
    }

    if (this._inlined) {
      // An inline function call.
      let pos = 0
      let i = this._functionSource.indexOf(INLINE_VARIABLE_PREFIX)
      const variableNames = new Set<string>()
      const code: string[] = []
      while (i !== -1) {
        code.push(this._functionSource.slice(pos, i))
        const j = this._functionSource.indexOf(INLINE_VARIABLE_SUFFIX, i + 2)
        if (j === -1) {
          throw new ExceptionShaderGenError(`Malformed inline expression in implementation for node ${node.getName()}`)
        }

        const variable = this._functionSource.slice(i + 2, j)
        const input = node.getInput(variable)
        if (!input) {
          throw new ExceptionShaderGenError(`Could not find an input named '${variable}' on node '${node.getName()}'`)
        }

        if (input.getConnection()) {
          code.push(shadergen.getUpstreamResult(input, context))
        } else {
          const variableName = node.getName() + '_' + input.getName() + '_tmp'
          if (!variableNames.has(variableName)) {
            const v = new ShaderPort(null, input.getType(), variableName, input.getValue())
            shadergen.emitLineBegin(stage)
            const syntax = shadergen.getSyntax()
            const valueStr = v.getValue()
              ? syntax.getValueOfType(v.getType(), v.getValue()!)
              : syntax.getDefaultValue(v.getType())
            const qualifier = syntax.getConstantQualifier()
            let str = qualifier === '' ? '' : qualifier + ' '
            str += syntax.getTypeName(v.getType()) + ' ' + v.getVariable()
            str += valueStr === '' ? '' : ' = ' + valueStr
            shadergen.emitString(str, stage)
            shadergen.emitLineEnd(stage)
            variableNames.add(variableName)
          }
          code.push(variableName)
        }

        pos = j + 2
        i = this._functionSource.indexOf(INLINE_VARIABLE_PREFIX, pos)
      }
      code.push(this._functionSource.slice(pos))

      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
      shadergen.emitString(' = ', stage)
      for (const c of code) {
        shadergen.emitString(c, stage)
      }
      shadergen.emitLineEnd(stage)
    } else {
      // An ordinary source code function call.

      // Declare the output variables.
      this.emitOutputVariables(node, context, stage)

      shadergen.emitLineBegin(stage)

      // Emit the function name.
      shadergen.emitString(this._functionName + '(', stage)

      shadergen.emitClosureDataArg(node, context, stage)

      let delim = ''

      // Emit all inputs.
      for (const input of node.getInputs()) {
        shadergen.emitString(delim, stage)
        shadergen.emitInput(input, context, stage)
        delim = ', '
      }

      // Emit node outputs.
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
}
