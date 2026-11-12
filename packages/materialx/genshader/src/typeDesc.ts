// Ported from MaterialX 1.39.5: source/MaterialXGenShader/TypeDesc.h,
//  source/MaterialXGenShader/TypeDesc.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/TypeDesc.h and TypeDesc.cpp

import { AggregateValue, Value, parseStructValueString } from '@mtlx/core'
import { ExceptionShaderGenError } from './exceptions.ts'

// Basetype constants (TypeDesc::BaseType).
export enum BaseType {
  NONE = 0,
  BOOLEAN,
  INTEGER,
  FLOAT,
  STRING,
  STRUCT,
}

// Semantic constants (TypeDesc::Semantic).
export enum Semantic {
  NONE = 0,
  COLOR,
  VECTOR,
  MATRIX,
  FILENAME,
  CLOSURE,
  SHADER,
  MATERIAL,
  ENUM,
}

// The FNV-1a hash upstream uses for type ids, in 32-bit arithmetic.
function hashName(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h, 16777619) ^ name.charCodeAt(i)
    h = h >>> 0
  }
  return h
}

// Type descriptor for a member of a struct type.
export class StructMemberDesc {
  constructor(
    private readonly _type: TypeDesc,
    private readonly _name: string,
    private readonly _defaultValueStr: string,
  ) {}

  getType(): TypeDesc {
    return this._type
  }

  getName(): string {
    return this._name
  }

  getDefaultValueStr(): string {
    return this._defaultValueStr
  }
}

// A type descriptor for MaterialX data types.
//
// All types need a registered type descriptor for shader generators to know
// about them. Descriptors for the standard library data types are defined
// in the Type namespace below; custom struct types from typedef elements
// are registered through ShaderGenerator.registerTypeDefs.
export class TypeDesc {
  static readonly NONE_TYPE_NAME = 'none'

  private readonly _id: number
  private readonly _name: string
  private readonly _basetype: BaseType
  private readonly _semantic: Semantic
  private readonly _size: number
  private readonly _members: StructMemberDesc[] | null

  constructor(
    name: string = TypeDesc.NONE_TYPE_NAME,
    basetype: BaseType = BaseType.NONE,
    semantic: Semantic = Semantic.NONE,
    size = 0,
    members: StructMemberDesc[] | null = null,
  ) {
    this._id = hashName(name)
    this._name = name
    this._basetype = basetype
    this._semantic = semantic
    this._size = size
    this._members = members
  }

  // Return the unique id assigned to this type (a hash of the type name).
  typeId(): number {
    return this._id
  }

  // Return the name of the type.
  getName(): string {
    return this._name
  }

  // Return the basetype for the type.
  getBaseType(): BaseType {
    return this._basetype
  }

  // Return the semantic for the type.
  getSemantic(): Semantic {
    return this._semantic
  }

  // Return the number of elements the type is composed of: 1 for scalar
  // types, greater for aggregates, and 0 for array types.
  getSize(): number {
    return this._size
  }

  isScalar(): boolean {
    return this._size === 1
  }

  isAggregate(): boolean {
    return this._size > 1
  }

  isArray(): boolean {
    return this._size === 0
  }

  isFloat2(): boolean {
    return this._size === 2 && (this._semantic === Semantic.COLOR || this._semantic === Semantic.VECTOR)
  }

  isFloat3(): boolean {
    return this._size === 3 && (this._semantic === Semantic.COLOR || this._semantic === Semantic.VECTOR)
  }

  isFloat4(): boolean {
    return this._size === 4 && (this._semantic === Semantic.COLOR || this._semantic === Semantic.VECTOR)
  }

  // Return true if the type represents a closure.
  isClosure(): boolean {
    return (
      this._semantic === Semantic.CLOSURE || this._semantic === Semantic.SHADER || this._semantic === Semantic.MATERIAL
    )
  }

  // Return true if the type represents a struct.
  isStruct(): boolean {
    return this._basetype === BaseType.STRUCT
  }

  // Return the struct member descriptions, or null for non-struct types.
  getStructMembers(): StructMemberDesc[] | null {
    return this._members
  }

  // Equality is by type id, mirroring the C++ operator==.
  equals(rhs: TypeDesc): boolean {
    return this._id === rhs._id
  }

  notEquals(rhs: TypeDesc): boolean {
    return this._id !== rhs._id
  }

  // Create a Value from a string for this type.
  createValueFromStrings(value: string): Value | null {
    if (!this.isStruct()) {
      return Value.createValueFromStrings(value, this.getName())
    }

    // For struct types an AggregateValue is created from the member types.
    const subValues = parseStructValueString(value)
    const structMembers = this.getStructMembers()
    if (!structMembers || subValues.length !== structMembers.length) {
      throw new ExceptionShaderGenError(`Wrong number of initializers for struct type ${this.getName()}`)
    }

    const result = AggregateValue.createAggregateValue(this.getName())
    for (let i = 0; i < structMembers.length; i++) {
      const member = structMembers[i]!.getType().createValueFromStrings(subValues[i]!)
      if (member) result.appendValue(member)
    }

    return result
  }
}

// Type descriptors for the standard types (the upstream Type namespace).
export const Type = {
  NONE: new TypeDesc(),
  BOOLEAN: new TypeDesc('boolean', BaseType.BOOLEAN, Semantic.NONE, 1),
  INTEGER: new TypeDesc('integer', BaseType.INTEGER, Semantic.NONE, 1),
  FLOAT: new TypeDesc('float', BaseType.FLOAT, Semantic.NONE, 1),
  INTEGERARRAY: new TypeDesc('integerarray', BaseType.INTEGER, Semantic.NONE, 0),
  FLOATARRAY: new TypeDesc('floatarray', BaseType.FLOAT, Semantic.NONE, 0),
  VECTOR2: new TypeDesc('vector2', BaseType.FLOAT, Semantic.VECTOR, 2),
  VECTOR3: new TypeDesc('vector3', BaseType.FLOAT, Semantic.VECTOR, 3),
  VECTOR4: new TypeDesc('vector4', BaseType.FLOAT, Semantic.VECTOR, 4),
  COLOR3: new TypeDesc('color3', BaseType.FLOAT, Semantic.COLOR, 3),
  COLOR4: new TypeDesc('color4', BaseType.FLOAT, Semantic.COLOR, 4),
  MATRIX33: new TypeDesc('matrix33', BaseType.FLOAT, Semantic.MATRIX, 9),
  MATRIX44: new TypeDesc('matrix44', BaseType.FLOAT, Semantic.MATRIX, 16),
  STRING: new TypeDesc('string', BaseType.STRING, Semantic.NONE, 1),
  FILENAME: new TypeDesc('filename', BaseType.STRING, Semantic.FILENAME, 1),
  BSDF: new TypeDesc('BSDF', BaseType.NONE, Semantic.CLOSURE, 1),
  EDF: new TypeDesc('EDF', BaseType.NONE, Semantic.CLOSURE, 1),
  VDF: new TypeDesc('VDF', BaseType.NONE, Semantic.CLOSURE, 1),
  SURFACESHADER: new TypeDesc('surfaceshader', BaseType.NONE, Semantic.SHADER, 1),
  VOLUMESHADER: new TypeDesc('volumeshader', BaseType.NONE, Semantic.SHADER, 1),
  DISPLACEMENTSHADER: new TypeDesc('displacementshader', BaseType.NONE, Semantic.SHADER, 1),
  LIGHTSHADER: new TypeDesc('lightshader', BaseType.NONE, Semantic.SHADER, 1),
  MATERIAL: new TypeDesc('material', BaseType.NONE, Semantic.MATERIAL, 1),
} as const

// Class handling registration, storage and query of type descriptions.
export class TypeSystem {
  private _types: TypeDesc[] = []
  private _typesByName = new Map<string, TypeDesc>()

  protected constructor() {
    // Register all the standard types.
    for (const type of Object.values(Type)) {
      if (type !== Type.NONE) {
        this.registerType(type)
      }
    }
  }

  // Create a new type system.
  static create(): TypeSystem {
    return new TypeSystem()
  }

  // Register a type description; a same-named registration replaces the
  // existing one.
  registerType(type: TypeDesc): void {
    if (this._typesByName.has(type.getName())) {
      const i = this._types.findIndex((t) => t.equals(type))
      if (i !== -1) {
        this._types[i] = type
        this._typesByName.set(type.getName(), type)
      }
    } else {
      this._types.push(type)
      this._typesByName.set(type.getName(), type)
    }
  }

  // Create and register a new type description.
  registerTypeDef(
    name: string,
    basetype: BaseType,
    semantic: Semantic,
    size: number,
    members: StructMemberDesc[] | null = null,
  ): void {
    this.registerType(new TypeDesc(name, basetype, semantic, size, members))
  }

  // Return a type description by name, or Type.NONE if not found.
  getType(name: string): TypeDesc {
    return this._typesByName.get(name) ?? Type.NONE
  }

  // Return all registered type descriptions.
  getTypes(): TypeDesc[] {
    return this._types
  }
}
