// Ported from MaterialX 1.39.5: source/MaterialXGenShader/UnitSystem.h,
//  source/MaterialXGenShader/UnitSystem.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/UnitSystem.h and UnitSystem.cpp

import {
  Document,
  ExceptionTypeError,
  InterfaceElement,
  LinearUnitConverter,
  NodeDef,
  UnitConverterRegistry,
  Value,
  FloatFormat,
  ScopedFloatFormatting,
  createValidName,
} from '@mtlx/core'
import { ExceptionShaderGenError } from './exceptions.ts'
import { Type, TypeDesc } from './typeDesc.ts'
import { ShaderNode } from './shaderNode.ts'
import { ShaderNodeImpl, stringHash } from './shaderNodeImpl.ts'
import { Stage, ShaderStage, VariableBlock } from './shaderStage.ts'
import type { GenContext } from './genContext.ts'
import type { ShaderGraph } from './shaderGraph.ts'

// Structure that represents unit transform information.
export interface UnitTransform {
  sourceUnit: string
  targetUnit: string
  type: TypeDesc
  unitType: string
}

// Create a validated UnitTransform (mirrors the C++ constructor).
export function makeUnitTransform(sourceUnit: string, targetUnit: string, type: TypeDesc, unitType: string): UnitTransform {
  if (
    type.notEquals(Type.FLOAT) &&
    type.notEquals(Type.VECTOR2) &&
    type.notEquals(Type.VECTOR3) &&
    type.notEquals(Type.VECTOR4)
  ) {
    throw new ExceptionShaderGenError('Unit space transform can only be a float or vectors')
  }
  return { sourceUnit, targetUnit, type, unitType }
}

// Shader node implementation for scalar unit conversion, emitting a helper
// function with a look-up table of unit scales.
export class ScalarUnitNode extends ShaderNodeImpl {
  protected _scalarUnitConverter: LinearUnitConverter
  protected readonly _unitRatioFunctionName: string

  constructor(scalarUnitConverter: LinearUnitConverter) {
    super()
    this._scalarUnitConverter = scalarUnitConverter
    this._unitRatioFunctionName = 'mx_' + scalarUnitConverter.getUnitType() + '_unit_ratio'
  }

  static createWithConverter(scalarUnitConverter: LinearUnitConverter): ShaderNodeImpl {
    return new ScalarUnitNode(scalarUnitConverter)
  }

  override initialize(element: InterfaceElement, _context: GenContext): void {
    this._name = element.getName()

    // Use the unit ratio function name as hash so this function is shared,
    // and only emitted once, for all units of the same unit type.
    this._hash = stringHash(this._unitRatioFunctionName)
  }

  override emitFunctionDefinition(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() !== Stage.PIXEL) {
      return
    }
    // Emit the helper function mx_<unittype>_unit_ratio that embeds a
    // look-up table for unit scales.
    const unitScaleMap = this._scalarUnitConverter.getUnitScale()
    const unitScales: number[] = new Array<number>(unitScaleMap.size).fill(0)
    for (const [unitName, scale] of unitScaleMap) {
      const location = this._scalarUnitConverter.getUnitAsInteger(unitName)
      unitScales[location] = scale
    }
    // See stdlib/gen*/mx_<unittype>_unit; this helper is called by those
    // shaders.
    const VAR_UNIT_SCALE = 'u_' + this._scalarUnitConverter.getUnitType() + '_unit_scales'
    const unitLUT = new VariableBlock('unitLUT', '')
    const fmt = new ScopedFloatFormatting(FloatFormat.Fixed, 15)
    try {
      unitLUT.add(Type.FLOATARRAY, VAR_UNIT_SCALE, Value.createValue(unitScales, 'floatarray'))

      const shadergen = context.getShaderGenerator()
      shadergen.emitLine('float ' + this._unitRatioFunctionName + '(int unit_from, int unit_to)', stage, false)
      shadergen.emitFunctionBodyBegin(node, context, stage)
      shadergen.emitVariableDeclarations(unitLUT, shadergen.getSyntax().getConstantQualifier(), ';', context, stage, true)
      shadergen.emitLine('return (' + VAR_UNIT_SCALE + '[unit_from] / ' + VAR_UNIT_SCALE + '[unit_to])', stage)
      shadergen.emitFunctionBodyEnd(node, context, stage)
    } finally {
      fmt.restore()
    }
  }

  override emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    if (stage.getName() !== Stage.PIXEL) {
      return
    }
    const shadergen = context.getShaderGenerator()

    const inPort = node.getInput(0)!
    const from = node.getInput(1)!
    const to = node.getInput(2)!

    shadergen.emitLineBegin(stage)
    shadergen.emitOutput(node.getOutput()!, true, false, context, stage)
    shadergen.emitString(' = ', stage)
    shadergen.emitInput(inPort, context, stage)
    shadergen.emitString(' * ', stage)
    shadergen.emitString(this._unitRatioFunctionName + '(', stage)
    shadergen.emitInput(from, context, stage)
    shadergen.emitString(', ', stage)
    shadergen.emitInput(to, context, stage)
    shadergen.emitString(')', stage)
    shadergen.emitLineEnd(stage)
  }
}

// Base unit system support.
export class UnitSystem {
  static readonly UNITSYSTEM_NAME = 'default_unit_system'

  protected _unitRegistry: UnitConverterRegistry | null = null
  protected _document: Document | null = null
  protected _target: string

  protected constructor(target: string) {
    this._target = createValidName(target)
  }

  // Create a new UnitSystem.
  static create(target: string): UnitSystem {
    return new UnitSystem(target)
  }

  // Return the UnitSystem name.
  getName(): string {
    return UnitSystem.UNITSYSTEM_NAME
  }

  // Assign a unit converter registry, replacing any previous assignment.
  setUnitConverterRegistry(registry: UnitConverterRegistry): void {
    this._unitRegistry = registry
  }

  // Return the currently assigned unit converter registry.
  getUnitConverterRegistry(): UnitConverterRegistry | null {
    return this._unitRegistry
  }

  // Assign a document with unit implementations, replacing any previously
  // loaded content.
  loadLibrary(document: Document): void {
    this._document = document
  }

  // Returns a nodedef for a given transform.
  getNodeDef(transform: UnitTransform): NodeDef | null {
    if (!this._document) {
      throw new ExceptionShaderGenError('No library loaded for unit system')
    }

    const MULTIPLY_NODE_NAME = 'multiply'
    for (const nodeDef of this._document.getMatchingNodeDefs(MULTIPLY_NODE_NAME)) {
      const nodeInputs = nodeDef.getInputs()
      if (
        nodeInputs.length === 2 &&
        nodeInputs[0]!.getType() === transform.type.getName() &&
        nodeInputs[1]!.getType() === 'float'
      ) {
        return nodeDef
      }
    }
    return null
  }

  // Returns whether this unit system supports a provided transform.
  supportsTransform(transform: UnitTransform): boolean {
    return this.getNodeDef(transform) !== null
  }

  // Create a node to perform the given unit space transformation.
  createNode(parent: ShaderGraph | null, transform: UnitTransform, name: string, context: GenContext): ShaderNode | null {
    const nodeDef = this.getNodeDef(transform)
    if (!nodeDef) {
      throw new ExceptionShaderGenError(
        `No nodedef found for transform: ('${transform.sourceUnit}', '${transform.targetUnit}').`,
      )
    }

    // Scalar unit conversion.
    const scalarTypeDef = this._document!.getUnitTypeDef(transform.unitType)
    const converter = this._unitRegistry?.getUnitConverter(scalarTypeDef)
    if (!converter || !(converter instanceof LinearUnitConverter)) {
      throw new ExceptionTypeError('Unit registry unavailable or undefined unit converter for: ' + transform.unitType)
    }

    // Create the node.
    const shaderNode = ShaderNode.create(parent, name, nodeDef, context)

    // Set ports on the node.
    const in2 = shaderNode.getInput('in2')
    if (!in2) {
      throw new ExceptionShaderGenError(
        `Invalid node signature for unit transform: ('${transform.sourceUnit}', '${transform.targetUnit}').`,
      )
    }
    const conversionRatio = converter.conversionRatio(transform.sourceUnit, transform.targetUnit)
    in2.setValue(Value.createValue(conversionRatio))

    return shaderNode
  }
}
