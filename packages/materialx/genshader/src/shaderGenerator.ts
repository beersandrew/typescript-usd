// Ported from MaterialX 1.39.5: source/MaterialXGenShader/ShaderGenerator.h,
//  source/MaterialXGenShader/ShaderGenerator.cpp,
//  source/MaterialXGenShader/Factory.h
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/ShaderGenerator.h and .cpp
// (including the Factory<ShaderNodeImpl> from Factory.h)

import {
  AttributeDef,
  Document,
  Element,
  Implementation,
  NodeDef,
  NodeGraph,
  ValueElement,
  EMPTY_STRING,
  type StringMap,
} from '@mtlx/core'
import { FilePath } from '@mtlx/format'
import { GenOptions } from './genOptions.ts'
import { BaseType, Semantic, StructMemberDesc, TypeSystem } from './typeDesc.ts'
import { Type } from './typeDesc.ts'
import { Punctuation, Syntax } from './syntax.ts'
import { Shader } from './shader.ts'
import { ShaderStage, VariableBlock } from './shaderStage.ts'
import { ShaderNodeImpl } from './shaderNodeImpl.ts'
import {
  ShaderInput,
  ShaderMetadata,
  ShaderMetadataRegistry,
  ShaderNode,
  ShaderOutput,
  ShaderPort,
} from './shaderNode.ts'
import { ShaderGraph, type ShaderGraphRefactor } from './shaderGraph.ts'
import {
  DistributeLayerOverMixRefactor,
  NodeElisionRefactor,
  PremultipliedBsdfAddRefactor,
} from './shaderGraphRefactor.ts'
import { CompoundNode } from './nodes/compoundNode.ts'
import { SourceCodeNode } from './nodes/sourceCodeNode.ts'
import { tokenSubstitution } from './util.ts'
import type { ColorManagementSystem } from './colorManagement.ts'
import type { UnitSystem } from './unitSystem.ts'
import type { GenContext } from './genContext.ts'

// A creator function for shader node implementations (Factory.h).
export type CreatorFunction<T> = () => T

// Base class for shader generators. All target-specific generators derive
// from this class.
export class ShaderGenerator {
  static readonly T_FILE_TRANSFORM_UV = '$fileTransformUv'
  protected static readonly LIGHTDATA_TYPEVAR_STRING = 'type'

  protected _typeSystem: TypeSystem
  protected _syntax: Syntax
  protected _implFactory = new Map<string, CreatorFunction<ShaderNodeImpl>>()
  protected _colorManagementSystem: ColorManagementSystem | null = null
  protected _unitSystem: UnitSystem | null = null
  protected _tokenSubstitutions: StringMap = new Map()
  protected _refactors: ShaderGraphRefactor[] = []

  protected constructor(typeSystem: TypeSystem, syntax: Syntax) {
    this._typeSystem = typeSystem
    this._syntax = syntax

    // Register all graph refactoring passes.
    this.registerRefactor(new NodeElisionRefactor())
    this.registerRefactor(new PremultipliedBsdfAddRefactor())
    this.registerRefactor(new DistributeLayerOverMixRefactor())
  }

  // Return the name of the target this generator is for.
  getTarget(): string {
    return EMPTY_STRING
  }

  // Generate a shader starting from the given element, translating the
  // element and all dependencies upstream into shader code.
  generate(_name: string, _element: Element, _context: GenContext): Shader | null {
    return null
  }

  // Apply the default GenOptions for this generator's target.
  applyDefaultOptions(_options: GenOptions): void {}

  // --- Code emission ---

  emitScopeBegin(stage: ShaderStage, punc: Punctuation = Punctuation.CURLY_BRACKETS): void {
    stage.beginScope(punc)
  }

  emitScopeEnd(stage: ShaderStage, semicolon = false, newline = true): void {
    stage.endScope(semicolon, newline)
  }

  emitLineBegin(stage: ShaderStage): void {
    stage.beginLine()
  }

  emitLineEnd(stage: ShaderStage, semicolon = true): void {
    stage.endLine(semicolon)
  }

  emitLineBreak(stage: ShaderStage): void {
    stage.newLine()
  }

  emitString(str: string, stage: ShaderStage): void {
    stage.addString(str)
  }

  emitLine(str: string, stage: ShaderStage, semicolon = true): void {
    stage.addLine(str, semicolon)
  }

  emitComment(str: string, stage: ShaderStage): void {
    stage.addComment(str)
  }

  emitBlock(str: string, sourceFilename: FilePath, context: GenContext, stage: ShaderStage): void {
    stage.addBlock(str, sourceFilename, context)
  }

  // Add the contents of a standard library include file if not already
  // present, prepending the context's library prefix.
  emitLibraryInclude(filename: FilePath | string, context: GenContext, stage: ShaderStage): void {
    const file = typeof filename === 'string' ? new FilePath(filename) : filename
    const libraryPrefix = context.getOptions().libraryPrefix
    const fullFilename = libraryPrefix.isEmpty() ? file : libraryPrefix.join(file)
    const resolvedFilename = context.resolveSourceFile(fullFilename, new FilePath())
    stage.addInclude(fullFilename, resolvedFilename, context)
  }

  emitValue(value: unknown, stage: ShaderStage): void {
    stage.addValue(value)
  }

  emitFunctionDefinition(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    stage.addFunctionDefinition(node, context)
  }

  // Emit the connected variable name for a port in a function definition
  // (used by CompoundNode).
  emitFunctionDefinitionParameter(shaderPort: ShaderPort, isOutput: boolean, _context: GenContext, stage: ShaderStage): void {
    if (isOutput) {
      this.emitString(this._syntax.getOutputTypeName(shaderPort.getType()) + ' ' + shaderPort.getVariable(), stage)
    } else {
      this.emitString(this._syntax.getTypeName(shaderPort.getType()) + ' ' + shaderPort.getVariable(), stage)
    }
  }

  // Add all function definitions for a graph.
  emitFunctionDefinitions(graph: ShaderGraph, context: GenContext, stage: ShaderStage): void {
    for (const node of graph.getNodes()) {
      this.emitFunctionDefinition(node, context, stage)
    }
  }

  // Add the function call for a single node.
  emitFunctionCall(node: ShaderNode, context: GenContext, stage: ShaderStage): void {
    // Check if it's emitted already.
    if (!stage.isEmitted(node, context)) {
      stage.addFunctionCall(node, context)
    }
  }

  // Add all function calls for a graph. With a classification mask, only
  // matching nodes are emitted.
  emitFunctionCalls(graph: ShaderGraph, context: GenContext, stage: ShaderStage, classification = 0): void {
    for (const node of graph.getNodes()) {
      if (!classification || node.hasClassification(classification)) {
        this.emitFunctionCall(node, context, stage)
      }
    }
  }

  // Add function calls for nodes connected directly upstream of the node.
  emitDependentFunctionCalls(node: ShaderNode, context: GenContext, stage: ShaderStage, classification = 0): void {
    for (const input of node.getInputs()) {
      const upstream = input.getConnectedSibling()
      if (upstream && (!classification || upstream.hasClassification(classification))) {
        this.emitFunctionCall(upstream, context, stage)
      }
    }
  }

  emitFunctionBodyBegin(_node: ShaderNode, _context: GenContext, stage: ShaderStage, punc: Punctuation = Punctuation.CURLY_BRACKETS): void {
    this.emitScopeBegin(stage, punc)
  }

  emitFunctionBodyEnd(_node: ShaderNode, _context: GenContext, stage: ShaderStage): void {
    this.emitScopeEnd(stage)
    this.emitLineBreak(stage)
  }

  // Emit type definitions for all data types that need them.
  emitTypeDefinitions(_context: GenContext, stage: ShaderStage): void {
    for (const syntax of this._syntax.getTypeSyntaxes()) {
      if (syntax.getTypeDefinition() !== '') {
        stage.addLine(syntax.getTypeDefinition(), false)
      }
    }
    stage.newLine()
  }

  // Emit the connected variable name for an input, or a constant value when
  // the port is not connected.
  emitInput(input: ShaderInput, context: GenContext, stage: ShaderStage): void {
    stage.addString(this.getUpstreamResult(input, context))
  }

  // Emit the output variable name for an output, optionally including its
  // type and default value assignment.
  emitOutput(output: ShaderOutput, includeType: boolean, assignValue: boolean, context: GenContext, stage: ShaderStage): void {
    stage.addString(includeType ? this._syntax.getTypeName(output.getType()) + ' ' + output.getVariable() : output.getVariable())

    // Look for any additional suffix to append.
    const suffix = context.getOutputSuffix(output)
    if (suffix !== '') {
      stage.addString(suffix)
    }

    if (assignValue) {
      const value = this._syntax.getDefaultValue(output.getType())
      if (value !== '') {
        stage.addString(' = ' + value)
      }
    }
  }

  // Emit the definition of a single shader variable.
  emitVariableDeclaration(variable: ShaderPort, qualifier: string, _context: GenContext, stage: ShaderStage, assignValue = true): void {
    let str = qualifier === '' ? EMPTY_STRING : qualifier + ' '
    str += this._syntax.getTypeName(variable.getType())

    const haveArray = variable.getType().isArray() && variable.getValue()
    if (haveArray) {
      str += this._syntax.getArrayTypeSuffix(variable.getType(), variable.getValue()!)
    }

    str += ' ' + variable.getVariable()

    // Arrays need an array qualifier (suffix) for the variable name.
    if (haveArray) {
      str += this._syntax.getArrayVariableSuffix(variable.getType(), variable.getValue()!)
    }

    if (assignValue) {
      const valueStr = variable.getValue()
        ? this._syntax.getValueOfType(variable.getType(), variable.getValue()!, true)
        : this._syntax.getDefaultValue(variable.getType(), true)
      str += valueStr === '' ? EMPTY_STRING : ' = ' + valueStr
    }

    stage.addString(str)
  }

  // Emit definitions for all shader variables in a block.
  emitVariableDeclarations(block: VariableBlock, qualifier: string, separator: string, context: GenContext, stage: ShaderStage, assignValue = true): void {
    for (let i = 0; i < block.size(); ++i) {
      this.emitLineBegin(stage)
      this.emitVariableDeclaration(block.getItem(i), qualifier, context, stage, assignValue)
      this.emitString(separator, stage)
      this.emitLineEnd(stage, false)
    }
  }

  // Return true if the node needs the additional ClosureData added.
  nodeNeedsClosureData(_node: ShaderNode): boolean {
    return false
  }

  // Emit the closure data argument if required (HwShaderGenerator hook).
  emitClosureDataArg(_node: ShaderNode, _context: GenContext, _stage: ShaderStage): void {}

  // Emit the closure data parameter if required (HwShaderGenerator hook).
  emitClosureDataParameter(_node: ShaderNode, _context: GenContext, _stage: ShaderStage): void {}

  // Return the result of an upstream connection or value for an input.
  getUpstreamResult(input: ShaderInput, context: GenContext): string {
    if (!input.getConnection()) {
      return input.getValue()
        ? this._syntax.getValueOfType(input.getType(), input.getValue()!)
        : this._syntax.getDefaultValue(input.getType())
    }

    let variable = input.getConnection()!.getVariable()

    // Look for any additional suffix to append.
    const suffix = context.getInputSuffix(input)
    if (suffix !== '') {
      variable += suffix
    }

    return variable
  }

  // Return the syntax object for the language used by the generator.
  getSyntax(): Syntax {
    return this._syntax
  }

  // Register a shader node implementation for one or more implementation
  // element names.
  registerImplementation(name: string | string[], creator: CreatorFunction<ShaderNodeImpl>): void {
    const names = typeof name === 'string' ? [name] : name
    for (const n of names) {
      this._implFactory.set(n, creator)
    }
  }

  // Determine if an implementation has been registered for a given name.
  implementationRegistered(name: string): boolean {
    return this._implFactory.has(name)
  }

  // Create the shader node implementation for a NodeGraph implementation.
  createShaderNodeImplForNodeGraph(_nodegraph: NodeGraph): ShaderNodeImpl {
    return CompoundNode.create()
  }

  // Create the shader node implementation for an Implementation element.
  createShaderNodeImplForImplementation(_implementation: Implementation): ShaderNodeImpl {
    return SourceCodeNode.create()
  }

  // Return a registered shader node implementation for the given nodedef.
  getImplementation(nodedef: NodeDef, context: GenContext): ShaderNodeImpl | null {
    const implElement = nodedef.getImplementation(this.getTarget())
    if (!implElement) {
      return null
    }

    const name = implElement.getName()

    // Check if it's created and cached already.
    let impl = context.findNodeImplementation(name)
    if (impl) {
      return impl
    }

    if (implElement instanceof NodeGraph) {
      impl = this.createShaderNodeImplForNodeGraph(implElement)
    } else if (implElement instanceof Implementation) {
      if (this.getColorManagementSystem() && this.getColorManagementSystem()!.hasImplementation(name)) {
        impl = this.getColorManagementSystem()!.createImplementation(name)
      } else {
        // Try creating a new one in the factory.
        const creator = this._implFactory.get(name)
        impl = creator ? creator() : null
      }
      if (!impl) {
        impl = this.createShaderNodeImplForImplementation(implElement)
      }
    }
    if (!impl) {
      return null
    }

    impl.initialize(implElement, context)

    // Cache it.
    context.addNodeImplementation(name, impl)

    return impl
  }

  // Sets the color management system.
  setColorManagementSystem(colorManagementSystem: ColorManagementSystem | null): void {
    this._colorManagementSystem = colorManagementSystem
  }

  getColorManagementSystem(): ColorManagementSystem | null {
    return this._colorManagementSystem
  }

  // Sets the unit system.
  setUnitSystem(unitSystem: UnitSystem | null): void {
    this._unitSystem = unitSystem
  }

  getUnitSystem(): UnitSystem | null {
    return this._unitSystem
  }

  // Returns the type system.
  getTypeSystem(): TypeSystem {
    return this._typeSystem
  }

  // Return the map of token substitutions used by the generator.
  getTokenSubstitutions(): StringMap {
    return this._tokenSubstitutions
  }

  // Register a shader graph refactoring pass.
  registerRefactor(refactor: ShaderGraphRefactor): void {
    this._refactors.push(refactor)
  }

  // Return the registered graph refactoring passes.
  getRefactors(): ShaderGraphRefactor[] {
    return this._refactors
  }

  // Register struct type definitions from the document.
  registerTypeDefs(doc: Document): void {
    // Load any struct type definitions from the document.
    for (const mxTypeDef of doc.getTypeDefs()) {
      const typeName = mxTypeDef.getName()
      const members = mxTypeDef.getMembers()

      // Without member children this is not considered a struct.
      if (members.length === 0) {
        continue
      }

      const structMembers: StructMemberDesc[] = []
      for (const member of members) {
        const memberType = this._typeSystem.getType(member.getType())
        structMembers.push(new StructMemberDesc(memberType, member.getName(), member.getValueString()))
      }

      this._typeSystem.registerTypeDef(typeName, BaseType.STRUCT, Semantic.NONE, 1, structMembers)
    }

    // Create a type syntax for all struct types loaded above.
    for (const typeDesc of this._typeSystem.getTypes()) {
      if (!typeDesc.isStruct()) {
        continue
      }

      const structTypeName = typeDesc.getName()
      let defaultValue = structTypeName + '( '
      const uniformDefaultValue = EMPTY_STRING
      const typeAlias = EMPTY_STRING
      let typeDefinition = 'struct ' + structTypeName + ' { '

      const structMembers = typeDesc.getStructMembers()
      if (structMembers) {
        for (const structMember of structMembers) {
          defaultValue += structMember.getDefaultValueStr() + ', '
          typeDefinition += structMember.getType().getName() + ' ' + structMember.getName() + '; '
        }
      }

      typeDefinition += ' };'
      defaultValue += ' )'

      const structTypeSyntax = this._syntax.createStructSyntax(
        structTypeName,
        defaultValue,
        uniformDefaultValue,
        typeAlias,
        typeDefinition,
      )

      this._syntax.registerTypeSyntax(typeDesc, structTypeSyntax)
    }
  }

  // Register metadata that should be exported to the generated shaders.
  // Applications must call this before generation to enable export.
  registerShaderMetadata(doc: Document, context: GenContext): void {
    let registry = context.getUserData<ShaderMetadataRegistry>(ShaderMetadataRegistry.USER_DATA_NAME)
    if (!registry) {
      registry = new ShaderMetadataRegistry()
      context.pushUserData(ShaderMetadataRegistry.USER_DATA_NAME, registry)
    }

    // Add default entries.
    const DEFAULT_METADATA = [
      new ShaderMetadata(ValueElement.UI_NAME_ATTRIBUTE, Type.STRING),
      new ShaderMetadata(ValueElement.UI_FOLDER_ATTRIBUTE, Type.STRING),
      new ShaderMetadata(ValueElement.UI_MIN_ATTRIBUTE, Type.NONE),
      new ShaderMetadata(ValueElement.UI_MAX_ATTRIBUTE, Type.NONE),
      new ShaderMetadata(ValueElement.UI_SOFT_MIN_ATTRIBUTE, Type.NONE),
      new ShaderMetadata(ValueElement.UI_SOFT_MAX_ATTRIBUTE, Type.NONE),
      new ShaderMetadata(ValueElement.UI_STEP_ATTRIBUTE, Type.NONE),
      new ShaderMetadata(ValueElement.UI_ADVANCED_ATTRIBUTE, Type.BOOLEAN),
      new ShaderMetadata(Element.DOC_ATTRIBUTE, Type.STRING),
      new ShaderMetadata(ValueElement.UNIT_ATTRIBUTE, Type.STRING),
      new ShaderMetadata(Element.COLOR_SPACE_ATTRIBUTE, Type.STRING),
    ]
    for (const data of DEFAULT_METADATA) {
      registry.addMetadata(data.name, data.type)
    }

    // Add entries from AttributeDefs in the document.
    for (const def of doc.getChildrenOfType(AttributeDef)) {
      if (def.getExportable()) {
        const attrName = def.getAttrName()
        const type = this._typeSystem.getType(def.getType())
        if (attrName !== '' && type.notEquals(Type.NONE)) {
          registry.addMetadata(attrName, type, def.getValue())
        }
      }
    }
  }

  // Retrieve the string used for the LightData.type member variable.
  getLightDataTypevarString(): string {
    return ShaderGenerator.LIGHTDATA_TYPEVAR_STRING
  }

  // --- Protected helpers (public in TS where friend access is needed) ---

  // Create a new stage in a shader.
  protected createStage(name: string, shader: Shader): ShaderStage {
    return shader.createStage(name, this._syntax)
  }

  // Set the function name for a stage.
  protected setFunctionName(functionName: string, stage: ShaderStage): void {
    stage.setFunctionName(functionName)
  }

  // Replace tokens with identifiers according to the substitutions map.
  protected replaceTokens(substitutions: StringMap, stage: ShaderStage): void {
    // Replace tokens in the source code.
    stage.setSourceCode(tokenSubstitution(substitutions, stage.getSourceCode()))

    const replace = (port: ShaderPort): void => {
      port.setName(tokenSubstitution(substitutions, port.getName()))
      port.setVariable(tokenSubstitution(substitutions, port.getVariable()))
    }

    // Replace tokens on the shader interface.
    const constants = stage.getConstantBlock()
    for (let i = 0; i < constants.size(); ++i) {
      replace(constants.getItem(i))
    }
    for (const uniforms of stage.getUniformBlocks().values()) {
      for (let i = 0; i < uniforms.size(); ++i) {
        replace(uniforms.getItem(i))
      }
    }
    for (const inputs of stage.getInputBlocks().values()) {
      for (let i = 0; i < inputs.size(); ++i) {
        replace(inputs.getItem(i))
      }
    }
    for (const outputs of stage.getOutputBlocks().values()) {
      for (let i = 0; i < outputs.size(); ++i) {
        replace(outputs.getItem(i))
      }
    }
  }

  // Create shader variables (e.g. uniforms, inputs and outputs) for nodes
  // that require input data from the application.
  protected createVariables(graph: ShaderGraph, context: GenContext, shader: Shader): void {
    const handler = context.getApplicationVariableHandler()
    for (const node of graph.getNodes()) {
      if (handler) {
        handler(node, context)
      }
      node.getImplementation().createVariables(node, context, shader)
    }
  }
}
