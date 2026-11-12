// Ported from MaterialX 1.39.5: source/MaterialXGenShader/Shader.h,
//  source/MaterialXGenShader/Shader.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/Shader.h and Shader.cpp

import { Value } from '@mtlx/core'
import { ExceptionShaderGenError } from './exceptions.ts'
import { Stage, ShaderStage } from './shaderStage.ts'
import { Syntax } from './syntax.ts'
import type { ShaderGraph } from './shaderGraph.ts'

// Class containing all data needed during shader generation. After
// generation it contains the resulting source code emitted by generators.
export class Shader {
  protected _name: string
  protected _graph: ShaderGraph
  protected _stagesMap = new Map<string, ShaderStage>()
  protected _stages: ShaderStage[] = []
  protected _attributeMap = new Map<string, Value>()

  constructor(name: string, graph: ShaderGraph) {
    this._name = name
    this._graph = graph
  }

  // Return the shader name.
  getName(): string {
    return this._name
  }

  // Return the number of shader stages for this shader.
  numStages(): number {
    return this._stages.length
  }

  // Return a stage by index or name; throws for an unknown name.
  getStage(key: number | string): ShaderStage {
    if (typeof key === 'number') {
      const stage = this._stages[key]
      if (!stage) {
        throw new ExceptionShaderGenError(`Stage index ${key} doesn't exist in shader '${this.getName()}'`)
      }
      return stage
    }
    const stage = this._stagesMap.get(key)
    if (!stage) {
      throw new ExceptionShaderGenError(`Stage '${key}' doesn't exist in shader '${this.getName()}'`)
    }
    return stage
  }

  // Return whether the named stage exists.
  hasStage(name: string): boolean {
    return this._stagesMap.has(name)
  }

  // Return true if the shader has a given named attribute.
  hasAttribute(attrib: string): boolean {
    return this._attributeMap.has(attrib)
  }

  // Return the value for a named attribute, or null.
  getAttribute(attrib: string): Value | null {
    return this._attributeMap.get(attrib) ?? null
  }

  // Set a value attribute (or a boolean flag when no value given).
  setAttribute(attrib: string, value?: Value): void {
    this._attributeMap.set(attrib, value ?? Value.createValue(true))
  }

  // Return the shader graph.
  getGraph(): ShaderGraph {
    return this._graph
  }

  // Return true if this shader matches the given classification.
  hasClassification(c: number): boolean {
    return this._graph.hasClassification(c)
  }

  // Set the shader source code for a given shader stage.
  setSourceCode(code: string, stage: string = Stage.PIXEL): void {
    this.getStage(stage).setSourceCode(code)
  }

  // Return the shader source code for a given shader stage.
  getSourceCode(stage: string = Stage.PIXEL): string {
    return this.getStage(stage).getSourceCode()
  }

  // Create a new stage in the shader. (Protected upstream; exposed for the
  // generator, which is a friend class in C++.)
  createStage(name: string, syntax: Syntax): ShaderStage {
    if (this._stagesMap.has(name)) {
      throw new ExceptionShaderGenError(`Stage '${name}' already exist in shader '${this.getName()}'`)
    }
    const s = new ShaderStage(name, syntax)
    this._stagesMap.set(name, s)
    this._stages.push(s)
    return s
  }
}
