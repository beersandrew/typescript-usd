// Ported from MaterialX 1.39.5:
//  source/MaterialXGenHw/Nodes/HwGeomPropValueNode.h,
//  source/MaterialXGenHw/Nodes/HwGeomPropValueNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenHw/Nodes/HwGeomPropValueNode.h and .cpp

import {
  ExceptionShaderGenError,
  Stage,
  addStageConnector,
  addStageInput,
  addStageUniform,
  type GenContext,
  type Shader,
  type ShaderInput,
  type ShaderNode,
  type ShaderNodeImpl,
  type ShaderOutput,
  type ShaderStage,
} from '@mtlx/genshader'
import { HW } from '../hwConstants.ts'
import { HwImplementation } from '../hwImplementation.ts'
import type { HwShaderGenerator } from '../hwShaderGenerator.ts'

// The vertex-data connector is named with T_IN_GEOMPROP like the vertex
// input, as upstream (HwGeomPropValueNode.cpp:34-35). (An earlier version of this port named it geomprop_<name> for its ESSL
// generator; restored to upstream here, see PROVENANCE.md.)

// GeomPropValue node implementation for Hw shader languages
export class HwGeomPropValueNode extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwGeomPropValueNode()
  }

  override createVariables(node: ShaderNode, _context: GenContext, shader: Shader): void {
    const geomPropInput = node.getInput(HwImplementation.GEOMPROP)
    if (!geomPropInput || !geomPropInput.getValue()) {
      throw new ExceptionShaderGenError(
        "No 'geomprop' parameter found on geompropvalue node '" + node.getName() + "'. Don't know what property to bind",
      )
    }
    const geomProp = geomPropInput.getValue()!.getValueString()
    const output = node.getOutput()!

    const vs = shader.getStage(Stage.VERTEX)
    const ps = shader.getStage(Stage.PIXEL)

    addStageInput(HW.VERTEX_INPUTS, output.getType(), HW.T_IN_GEOMPROP + '_' + geomProp, vs)
    addStageConnector(HW.VERTEX_DATA, output.getType(), HW.T_IN_GEOMPROP + '_' + geomProp, vs, ps)
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    const shadergen = context.getShaderGenerator() as HwShaderGenerator

    const geomPropInput = node.getInput(HwImplementation.GEOMPROP)
    if (!geomPropInput) {
      throw new ExceptionShaderGenError(
        "No 'geomprop' parameter found on geompropvalue node '" + node.getName() + "'. Don't know what property to bind",
      )
    }
    const geomname = geomPropInput.getValue()!.getValueString()
    const variable = HW.T_IN_GEOMPROP + '_' + geomname

    if (stage.getName() === Stage.VERTEX) {
      const vertexData = stage.getOutputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      const geomprop = vertexData.getItem(variable)
      if (!geomprop.isEmitted()) {
        shadergen.emitLine(prefix + geomprop.getVariable() + ' = ' + HW.T_IN_GEOMPROP + '_' + geomname, stage)
        geomprop.setEmitted()
      }
    }

    if (stage.getName() === Stage.PIXEL) {
      const vertexData = stage.getInputBlock(HW.VERTEX_DATA)
      const prefix = shadergen.getVertexDataPrefix(vertexData)
      const geomprop = vertexData.getItem(variable)
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
      shadergen.emitString(' = ' + prefix + geomprop.getVariable(), stage)
      shadergen.emitLineEnd(stage)
    }
  }

  override isEditable(_input: ShaderInput | ShaderOutput): boolean {
    return false
  }
}

// GeomPropValue node non-implementation for Hw shader languages
export class HwGeomPropValueNodeAsUniform extends HwImplementation {
  static create(): ShaderNodeImpl {
    return new HwGeomPropValueNodeAsUniform()
  }

  override createVariables(node: ShaderNode, _context: GenContext, shader: Shader): void {
    const geomPropInput = node.getInput(HwImplementation.GEOMPROP)
    if (!geomPropInput || !geomPropInput.getValue()) {
      throw new ExceptionShaderGenError(
        "No 'geomprop' parameter found on geompropvalue node '" + node.getName() + "'. Don't know what property to bind",
      )
    }
    const geomProp = geomPropInput.getValue()!.getValueString()
    const ps = shader.getStage(Stage.PIXEL)
    const uniform = addStageUniform(HW.PRIVATE_UNIFORMS, node.getOutput()!.getType(), HW.T_GEOMPROP + '_' + geomProp, ps)
    uniform.setPath(geomPropInput.getPath())
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() === Stage.PIXEL) {
      const shadergen = context.getShaderGenerator()
      const geomPropInput = node.getInput(HwImplementation.GEOMPROP)
      if (!geomPropInput) {
        throw new ExceptionShaderGenError(
          "No 'geomprop' parameter found on geompropvalue node '" + node.getName() + "'. Don't know what property to bind",
        )
      }
      const attrName = geomPropInput.getValue()!.getValueString()
      shadergen.emitLineBegin(stage)
      shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
      shadergen.emitString(' = ' + HW.T_GEOMPROP + '_' + attrName, stage)
      shadergen.emitLineEnd(stage)
    }
  }
}
