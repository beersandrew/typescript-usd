// Ported from MaterialX 1.39.5: source/MaterialXGenShader/Syntax.h,
//  source/MaterialXGenShader/Syntax.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/Syntax.h and Syntax.cpp

import { AggregateValue, Value, EMPTY_STRING, replaceSubstrings, type StringMap } from '@mtlx/core'
import { ExceptionShaderGenError } from './exceptions.ts'
import { TypeDesc, TypeSystem } from './typeDesc.ts'
import type { ShaderPort } from './shaderNode.ts'

// Punctuation types.
export enum Punctuation {
  PARENTHESES,
  CURLY_BRACKETS,
  SQUARE_BRACKETS,
  DOUBLE_SQUARE_BRACKETS,
}

// Map holding identifier names and a counter for creating unique names.
export type IdentifierMap = Map<string, number>

// Base class for syntax handling of types.
export abstract class TypeSyntax {
  protected _parent: Syntax | null
  protected _name: string
  protected _defaultValue: string
  protected _uniformDefaultValue: string
  protected _typeAlias: string
  protected _typeDefinition: string
  protected _members: string[]

  constructor(
    parent: Syntax | null,
    name: string,
    defaultValue: string,
    uniformDefaultValue: string,
    typeAlias = EMPTY_STRING,
    typeDefinition = EMPTY_STRING,
    members: string[] = [],
  ) {
    this._parent = parent
    this._name = name
    this._defaultValue = defaultValue
    this._uniformDefaultValue = uniformDefaultValue
    this._typeAlias = typeAlias
    this._typeDefinition = typeDefinition
    this._members = members
  }

  getName(): string {
    return this._name
  }

  getTypeAlias(): string {
    return this._typeAlias
  }

  getTypeDefinition(): string {
    return this._typeDefinition
  }

  getDefaultValue(uniform: boolean): string {
    return uniform ? this._uniformDefaultValue : this._defaultValue
  }

  // Returns the syntax for accessing type members if the type can be
  // swizzled.
  getMembers(): string[] {
    return this._members
  }

  // Returns a value formatted according to this type syntax, constructed
  // from the given shader port object.
  getPortValue(port: ShaderPort | null, uniform: boolean): string {
    if (!port || !port.getValue()) {
      return this.getDefaultValue(uniform)
    }
    return this.getValue(port.getValue()!, uniform)
  }

  // Returns a value formatted according to this type syntax.
  abstract getValue(value: Value, uniform: boolean): string
}

// Specialization of TypeSyntax for scalar types.
export class ScalarTypeSyntax extends TypeSyntax {
  constructor(
    parent: Syntax | null,
    name: string,
    defaultValue: string,
    uniformDefaultValue: string,
    typeAlias = EMPTY_STRING,
    typeDefinition = EMPTY_STRING,
  ) {
    super(parent, name, defaultValue, uniformDefaultValue, typeAlias, typeDefinition, [])
  }

  getValue(value: Value, _uniform: boolean): string {
    return value.getValueString()
  }
}

// Specialization of TypeSyntax for string types.
export class StringTypeSyntax extends ScalarTypeSyntax {
  override getValue(value: Value, _uniform: boolean): string {
    return '"' + value.getValueString() + '"'
  }
}

// Specialization of TypeSyntax for aggregate types.
export class AggregateTypeSyntax extends TypeSyntax {
  getValue(value: Value, _uniform: boolean): string {
    const valueString = value.getValueString()
    return valueString === '' ? valueString : this.getName() + '(' + valueString + ')'
  }
}

// Specialization of TypeSyntax for struct types.
export class StructTypeSyntax extends TypeSyntax {
  getValue(value: Value, _uniform: boolean): string {
    const aggValue = value as AggregateValue

    let result = '{'
    let separator = ''
    for (const memberValue of aggValue.getMembers()) {
      result += separator
      separator = ';'

      const memberTypeName = memberValue.getTypeString()
      const memberTypeDesc = this._parent!.getType(memberTypeName)

      // Recursively use the syntax to generate the output, supporting
      // nested structs.
      result += this._parent!.getValueOfType(memberTypeDesc, memberValue, true)
    }
    result += '}'

    return result
  }
}

// Base class for syntax objects used by shader generators to emit code with
// correct syntax for each language.
export abstract class Syntax {
  static readonly NEWLINE = '\n'
  static readonly SEMICOLON = ';'
  static readonly COMMA = ','
  static readonly INDENTATION = '    '
  static readonly STRING_QUOTE = '"'
  static readonly INCLUDE_STATEMENT = '#include'
  static readonly SINGLE_LINE_COMMENT = '// '
  static readonly BEGIN_MULTI_LINE_COMMENT = '/* '
  static readonly END_MULTI_LINE_COMMENT = ' */'

  static readonly CHANNELS_MAPPING = new Map<string, number>([
    ['r', 0], ['x', 0],
    ['g', 1], ['y', 1],
    ['b', 2], ['z', 2],
    ['a', 3], ['w', 3],
  ])

  protected _typeSystem: TypeSystem
  protected _typeSyntaxes: TypeSyntax[] = []
  protected _typeSyntaxIndexByType = new Map<number, number>()
  protected _reservedWords = new Set<string>()
  protected _invalidTokens: StringMap = new Map()

  constructor(typeSystem: TypeSystem) {
    this._typeSystem = typeSystem
  }

  // Register syntax handling for a data type. Required for all supported
  // data types.
  registerTypeSyntax(type: TypeDesc, syntax: TypeSyntax): void {
    const it = this._typeSyntaxIndexByType.get(type.typeId())
    if (it !== undefined) {
      this._typeSyntaxes[it] = syntax
    } else {
      this._typeSyntaxes.push(syntax)
      this._typeSyntaxIndexByType.set(type.typeId(), this._typeSyntaxes.length - 1)
    }

    // Make this type a restricted name.
    this.registerReservedWords(new Set([syntax.getName()]))
  }

  // Register names that are reserved words not to be used by a code
  // generator when naming variables and functions.
  registerReservedWords(names: Set<string> | string[]): void {
    for (const name of names) {
      this._reservedWords.add(name)
    }
  }

  // Register string replacements for disallowed tokens.
  registerInvalidTokens(tokens: StringMap): void {
    for (const [k, v] of tokens) {
      this._invalidTokens.set(k, v)
    }
  }

  getReservedWords(): Set<string> {
    return this._reservedWords
  }

  getInvalidTokens(): StringMap {
    return this._invalidTokens
  }

  // Returns the type syntax object for a type; throws if not defined.
  getTypeSyntax(type: TypeDesc): TypeSyntax {
    const it = this._typeSyntaxIndexByType.get(type.typeId())
    if (it === undefined) {
      throw new ExceptionShaderGenError(`No syntax is defined for the given type '${type.getName()}'.`)
    }
    return this._typeSyntaxes[it]!
  }

  // Returns all registered type syntax objects.
  getTypeSyntaxes(): TypeSyntax[] {
    return this._typeSyntaxes
  }

  // Return a type description for the given type name.
  getType(name: string): TypeDesc {
    return this._typeSystem.getType(name)
  }

  // Returns the name syntax of the given type.
  getTypeName(type: TypeDesc): string {
    return this.getTypeSyntax(type).getName()
  }

  // Returns the type name in an output context.
  getOutputTypeName(type: TypeDesc): string {
    const name = this.getTypeSyntax(type).getName()
    const outputModifier = this.getOutputQualifier()
    return outputModifier.length > 0 ? outputModifier + ' ' + name : name
  }

  // Returns a type alias for the given data type, or the empty string.
  getTypeAlias(type: TypeDesc): string {
    return this.getTypeSyntax(type).getTypeAlias()
  }

  // Returns a custom type definition if needed for the given data type.
  getTypeDefinition(type: TypeDesc): string {
    return this.getTypeSyntax(type).getTypeDefinition()
  }

  // Returns the default value string for the given type.
  getDefaultValue(type: TypeDesc, uniform = false): string {
    return this.getTypeSyntax(type).getDefaultValue(uniform)
  }

  // Returns the value string for a given type and value object.
  getValueOfType(type: TypeDesc, value: Value, uniform = false): string {
    return this.getTypeSyntax(type).getValue(value, uniform)
  }

  // Returns the value string for a given shader port object.
  getValue(port: ShaderPort, uniform = false): string {
    return this.getTypeSyntax(port.getType()).getPortValue(port, uniform)
  }

  // Type qualifier used when declaring input variables.
  getInputQualifier(): string {
    return EMPTY_STRING
  }

  // Type qualifier used when declaring output variables.
  getOutputQualifier(): string {
    return EMPTY_STRING
  }

  // Qualifier used when declaring constant variables.
  abstract getConstantQualifier(): string

  // Qualifier used when declaring uniform variables.
  getUniformQualifier(): string {
    return EMPTY_STRING
  }

  getNewline(): string {
    return Syntax.NEWLINE
  }

  getIndentation(): string {
    return Syntax.INDENTATION
  }

  getStringQuote(): string {
    return Syntax.STRING_QUOTE
  }

  getIncludeStatement(): string {
    return Syntax.INCLUDE_STATEMENT
  }

  getSingleLineComment(): string {
    return Syntax.SINGLE_LINE_COMMENT
  }

  getBeginMultiLineComment(): string {
    return Syntax.BEGIN_MULTI_LINE_COMMENT
  }

  getEndMultiLineComment(): string {
    return Syntax.END_MULTI_LINE_COMMENT
  }

  // The file extension used for source code files in this language.
  abstract getSourceFileExtension(): string

  // The array suffix to use for declaring an array type.
  getArrayTypeSuffix(_type: TypeDesc, _value: Value): string {
    return EMPTY_STRING
  }

  // The array suffix to use for declaring an array variable.
  getArrayVariableSuffix(type: TypeDesc, value: Value): string {
    if (type.isArray()) {
      if (value.isA('floatarray') || value.isA('integerarray')) {
        const data = (value as { getData?: () => unknown }).getData?.()
        if (Array.isArray(data)) {
          return '[' + String(data.length) + ']'
        }
      }
    }
    return ''
  }

  // Modify the given name string to remove any invalid characters or
  // tokens, returning the result.
  makeValidName(name: string): string {
    let res = name.replace(/[^A-Za-z0-9_]/g, '_')
    res = replaceSubstrings(res, this._invalidTokens)
    if (this._reservedWords.has(res)) {
      res = res + '1'
    }
    return res
  }

  // Make sure the given name is a unique identifier, updating it if needed,
  // and returning the result.
  makeIdentifier(name: string, identifiers: IdentifierMap): string {
    name = this.makeValidName(name)

    const counter = identifiers.get(name)
    if (counter !== undefined) {
      // The name is not unique, so append the counter and keep incrementing
      // until a unique name is found.
      let count = counter
      let name2: string
      do {
        name2 = name + String(count++)
      } while (identifiers.has(name2))
      identifiers.set(name, count)

      name = name2
    }

    // Save it among the known identifiers.
    identifiers.set(name, 1)
    return name
  }

  // Create a unique identifier for the given variable name and type, used
  // for naming variables in generated code.
  getVariableName(name: string, _type: TypeDesc, identifiers: IdentifierMap): string {
    return this.makeIdentifier(name, identifiers)
  }

  // Given an input specification, attempt to remap it to an enumeration
  // accepted by the shader generator. Returns the [type, value] pair on
  // success, or null when no remapping applies.
  remapEnumeration(_value: string, _type: TypeDesc, _enumNames: string): [TypeDesc, Value | null] | null {
    return null
  }

  // Create and return a type syntax for a struct type.
  createStructSyntax(
    structTypeName: string,
    defaultValue: string,
    uniformDefaultValue: string,
    typeAlias: string,
    typeDefinition: string,
  ): StructTypeSyntax {
    return new StructTypeSyntax(this, structTypeName, defaultValue, uniformDefaultValue, typeAlias, typeDefinition)
  }
}
