// Ported from MaterialX 1.39.5: source/MaterialXCore/Value.h,
//  source/MaterialXCore/Value.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Value.h and Value.cpp
//
// C++ discriminates values by template type; here every value carries its
// MaterialX type string ('integer', 'float', 'color3', ...) explicitly, since
// JavaScript cannot distinguish e.g. integer from float at runtime.

import { Exception, ExceptionTypeError } from './exceptions.ts'
import {
  Color3,
  Color4,
  Matrix33,
  Matrix44,
  MatrixBase,
  VALUE_STRING_FALSE,
  VALUE_STRING_TRUE,
  Vector2,
  Vector3,
  Vector4,
  VectorBase,
} from './types.ts'
import { ARRAY_VALID_SEPARATORS, ARRAY_PREFERRED_SEPARATOR, EMPTY_STRING, splitString, trimSpaces } from './util.ts'

// Any data object that a Value can hold.
export type ValueData = number | boolean | string | VectorBase | MatrixBase | number[] | boolean[] | string[]

// Structural stand-ins for TypeDef (ported with the Definition module), kept
// minimal so this module has no dependency cycle with definitions.
interface TypeDefMemberLike {
  getType(): string
}
export interface TypeDefLike {
  getMembers(): TypeDefMemberLike[]
  getDocument(): { getTypeDef(name: string): TypeDefLike | null }
}

// Float formats to use when converting values to strings.
export enum FloatFormat {
  Default = 0,
  Fixed = 1,
  Scientific = 2,
}

let _floatFormat: FloatFormat = FloatFormat.Default
let _floatPrecision = 6

function padExponent(str: string): string {
  // C++ iostreams always write at least two exponent digits ("1e+06").
  return str.replace(/e([+-])(\d)$/, 'e$10$2')
}

function stripTrailingZeros(str: string): string {
  if (!str.includes('.')) return str
  return str.replace(/0+$/, '').replace(/\.$/, '')
}

// Format a float the way C++ iostreams do for the active format/precision.
function formatFloat(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? 'inf' : v < 0 ? '-inf' : 'nan'
  // MaterialX stores float-family data (float, vector*, color*, matrix*) as
  // 32-bit float and serializes that 32-bit value. JS numbers are 64-bit
  // doubles, so round to float32 first to match upstream's output exactly —
  // otherwise the two disagree at exponent boundaries / low-order bits
  // (e.g. 0.1 at precision 9: float32 "0.100000001" vs double "0.1").
  v = Math.fround(v)
  if (_floatFormat === FloatFormat.Fixed) return v.toFixed(_floatPrecision)
  if (_floatFormat === FloatFormat.Scientific) return padExponent(v.toExponential(_floatPrecision))

  // Default formatting matches printf("%g") with precision significant digits.
  const prec = Math.max(_floatPrecision, 1)
  if (v === 0) return '0'
  const exp = Math.floor(Math.log10(Math.abs(v)))
  if (exp < -4 || exp >= prec) {
    const [mantissa, exponent] = v.toExponential(prec - 1).split('e') as [string, string]
    return stripTrailingZeros(mantissa) + padExponent('e' + exponent)
  }
  return stripTrailingZeros(v.toPrecision(prec))
}

function parseInteger(value: string): number {
  const match = /^\s*[+-]?\d+/.exec(value)
  if (!match) throw new ExceptionTypeError('Type mismatch in generic fromValueString: ' + value)
  return parseInt(match[0], 10)
}

function parseFloatStrict(value: string): number {
  const match = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(value)
  if (!match) throw new ExceptionTypeError('Type mismatch in generic fromValueString: ' + value)
  return parseFloat(match[0])
}

function parseBoolean(value: string): boolean {
  if (value === VALUE_STRING_TRUE) return true
  if (value === VALUE_STRING_FALSE) return false
  throw new ExceptionTypeError('Type mismatch in boolean fromValueString: ' + value)
}

function parseFloatTuple(value: string, count: number): number[] {
  const tokens = splitString(value, ARRAY_VALID_SEPARATORS)
  if (tokens.length !== count) {
    throw new ExceptionTypeError('Type mismatch in vector fromValueString: ' + value)
  }
  return tokens.map(parseFloatStrict)
}

function parseArray<T>(value: string, parseItem: (token: string) => T): T[] {
  // Arrays may contain substrings with internal spaces, so split on commas only.
  return splitString(value, ',').map((token) => parseItem(trimSpaces(token)))
}

function scalarToString(v: number | boolean | string, isFloat: boolean): string {
  if (typeof v === 'string') return v
  if (typeof v === 'boolean') return v ? VALUE_STRING_TRUE : VALUE_STRING_FALSE
  return isFloat ? formatFloat(v) : String(v)
}

function tupleToString(data: number[]): string {
  return data.map(formatFloat).join(ARRAY_PREFERRED_SEPARATOR)
}

interface TypeSpec {
  toString(data: ValueData): string
  fromString(value: string): ValueData
  equals(a: ValueData, b: ValueData): boolean
}

function scalarEquals(a: ValueData, b: ValueData): boolean {
  return a === b
}

function arrayEquals(a: ValueData, b: ValueData): boolean {
  const av = a as (number | boolean | string)[]
  const bv = b as (number | boolean | string)[]
  return av.length === bv.length && av.every((v, i) => v === bv[i])
}

function vectorSpec(ctor: new (...values: number[]) => VectorBase, size: number): TypeSpec {
  return {
    toString: (data) => tupleToString((data as VectorBase).data()),
    fromString: (value) => new ctor(...parseFloatTuple(value, size)),
    equals: (a, b) => (a as VectorBase).equals(b as VectorBase),
  }
}

function matrixSpec(ctor: new (...values: number[]) => MatrixBase, size: number): TypeSpec {
  return {
    toString: (data) => tupleToString((data as MatrixBase).data()),
    fromString: (value) => new ctor(...parseFloatTuple(value, size)),
    equals: (a, b) => (a as MatrixBase).equals(b as MatrixBase),
  }
}

const TYPE_SPECS = new Map<string, TypeSpec>([
  ['integer', { toString: (d) => String(d), fromString: parseInteger, equals: scalarEquals }],
  ['boolean', { toString: (d) => scalarToString(d as boolean, false), fromString: parseBoolean, equals: scalarEquals }],
  ['float', { toString: (d) => formatFloat(d as number), fromString: parseFloatStrict, equals: scalarEquals }],
  ['color3', vectorSpec(Color3, 3)],
  ['color4', vectorSpec(Color4, 4)],
  ['vector2', vectorSpec(Vector2, 2)],
  ['vector3', vectorSpec(Vector3, 3)],
  ['vector4', vectorSpec(Vector4, 4)],
  ['matrix33', matrixSpec(Matrix33, 9)],
  ['matrix44', matrixSpec(Matrix44, 16)],
  ['string', { toString: (d) => d as string, fromString: (v) => v, equals: scalarEquals }],
  [
    'integerarray',
    {
      toString: (d) => (d as number[]).map(String).join(ARRAY_PREFERRED_SEPARATOR),
      fromString: (v) => parseArray(v, parseInteger),
      equals: arrayEquals,
    },
  ],
  [
    'booleanarray',
    {
      toString: (d) => (d as boolean[]).map((b) => scalarToString(b, false)).join(ARRAY_PREFERRED_SEPARATOR),
      fromString: (v) => parseArray(v, parseBoolean),
      equals: arrayEquals,
    },
  ],
  [
    'floatarray',
    {
      toString: (d) => (d as number[]).map(formatFloat).join(ARRAY_PREFERRED_SEPARATOR),
      fromString: (v) => parseArray(v, parseFloatStrict),
      equals: arrayEquals,
    },
  ],
  [
    'stringarray',
    {
      toString: (d) => (d as string[]).join(ARRAY_PREFERRED_SEPARATOR),
      fromString: (v) => parseArray(v, (s) => s),
      equals: arrayEquals,
    },
  ],
])

// Infer the MaterialX type string for a data object where unambiguous.
function inferTypeString(data: ValueData): string {
  if (typeof data === 'boolean') return 'boolean'
  if (typeof data === 'number') return 'float'
  if (typeof data === 'string') return 'string'
  if (data instanceof Color3) return 'color3'
  if (data instanceof Color4) return 'color4'
  if (data instanceof Vector2) return 'vector2'
  if (data instanceof Vector3) return 'vector3'
  if (data instanceof Vector4) return 'vector4'
  if (data instanceof Matrix33) return 'matrix33'
  if (data instanceof Matrix44) return 'matrix44'
  if (Array.isArray(data)) {
    const first = data[0]
    if (first === undefined) throw new Exception('Cannot infer the type of an empty array; pass an explicit type')
    if (typeof first === 'boolean') return 'booleanarray'
    if (typeof first === 'number') return 'floatarray'
    return 'stringarray'
  }
  throw new Exception('Cannot infer a MaterialX type for the given data')
}

function copyData(data: ValueData): ValueData {
  if (data instanceof VectorBase || data instanceof MatrixBase) return data.copy()
  if (Array.isArray(data)) return [...data] as ValueData
  return data
}

// A generic, discriminated value, whose type may be queried dynamically.
export class Value {
  // Set float formatting for converting values to strings.
  static setFloatFormat(format: FloatFormat): void {
    _floatFormat = format
  }

  // Set float precision for converting values to strings.
  static setFloatPrecision(precision: number): void {
    _floatPrecision = precision
  }

  // Return the current float format.
  static getFloatFormat(): FloatFormat {
    return _floatFormat
  }

  // Return the current float precision.
  static getFloatPrecision(): number {
    return _floatPrecision
  }

  // Create a new value from a data object. The MaterialX type is inferred
  // from the object where unambiguous; pass an explicit type string for
  // integer values and empty arrays.
  static createValue(data: ValueData, type?: string): TypedValue {
    return new TypedValue(type ?? inferTypeString(data), copyData(data))
  }

  // Create a new value instance from value and type strings, returning null
  // if the conversion to the given data type cannot be performed.
  static createValueFromStrings(value: string, type: string, typeDef?: TypeDefLike | null): Value | null {
    const spec = TYPE_SPECS.get(type)
    if (spec) {
      try {
        return new TypedValue(type, spec.fromString(value))
      } catch (err) {
        if (err instanceof ExceptionTypeError) return null
        throw err
      }
    }

    if (typeDef && typeDef.getMembers().length > 0) {
      // A TypeDef with child members describes an aggregate (struct) value.
      return AggregateValue.createAggregateValueFromString(value, type, typeDef)
    }

    return new TypedValue('string', value)
  }

  // Create a deep copy of the value.
  copy(): Value {
    throw new Exception('Value.copy() called on abstract base')
  }

  // Return the type string for this value.
  getTypeString(): string {
    throw new Exception('Value.getTypeString() called on abstract base')
  }

  // Return the value string for this value.
  getValueString(): string {
    throw new Exception('Value.getValueString() called on abstract base')
  }

  // Return true if this value is of the given MaterialX type.
  isA(type: string): boolean {
    return this.getTypeString() === type
  }

  // Return true if the value data matches.
  isEqual(_other: Value | null): boolean {
    return false
  }
}

// A value holding a single typed data object.
export class TypedValue extends Value {
  private _type: string
  private _data: ValueData

  constructor(type: string, data: ValueData) {
    super()
    this._type = type
    this._data = data
  }

  override copy(): Value {
    return new TypedValue(this._type, copyData(this._data))
  }

  // Set the stored data object.
  setData(data: ValueData): void {
    this._data = data
  }

  // Return the stored data object.
  getData(): ValueData {
    return this._data
  }

  override getTypeString(): string {
    return this._type
  }

  override getValueString(): string {
    const spec = TYPE_SPECS.get(this._type)
    return spec ? spec.toString(this._data) : String(this._data)
  }

  override isEqual(other: Value | null): boolean {
    if (!other || !(other instanceof TypedValue) || other._type !== this._type) return false
    const spec = TYPE_SPECS.get(this._type)
    return spec ? spec.equals(this._data, other._data) : this._data === other._data
  }

  // Create a new value of the given type from a value string, returning null
  // if the conversion cannot be performed.
  static createFromString(value: string, type: string): Value | null {
    const spec = TYPE_SPECS.get(type)
    if (!spec) return null
    try {
      return new TypedValue(type, spec.fromString(value))
    } catch (err) {
      if (err instanceof ExceptionTypeError) return null
      throw err
    }
  }
}

// A subclass for aggregate values with multiple members.
export class AggregateValue extends Value {
  private _typeName: string
  private _data: Value[] = []

  constructor(typeName: string) {
    super()
    this._typeName = typeName
  }

  override copy(): Value {
    const result = AggregateValue.createAggregateValue(this._typeName)
    for (const val of this._data) result.appendValue(val.copy())
    return result
  }

  // Append a member value to the aggregate.
  appendValue(value: Value): void {
    this._data.push(value)
  }

  getMembers(): Value[] {
    return this._data
  }

  // Query an indexed member value from the aggregate.
  getMemberValue(index: number): Value {
    const v = this._data[index]
    if (!v) throw new Exception(`Aggregate member index ${index} out of range`)
    return v
  }

  override getTypeString(): string {
    return this._typeName
  }

  override getValueString(): string {
    if (this._data.length === 0) return EMPTY_STRING
    return '{' + this._data.map((v) => v.getValueString()).join(';') + '}'
  }

  override isEqual(other: Value | null): boolean {
    if (!other || !(other instanceof AggregateValue)) return false
    if (this._data.length !== other._data.length) return false
    return this._data.every((v, i) => v.isEqual(other._data[i] ?? null))
  }

  static createAggregateValue(typeName: string): AggregateValue {
    return new AggregateValue(typeName)
  }

  static createAggregateValueFromString(value: string, type: string, typeDef: TypeDefLike): AggregateValue {
    const subValues = parseStructValueString(value)
    const result = AggregateValue.createAggregateValue(type)
    const members = typeDef.getMembers()
    if (subValues.length !== members.length) {
      throw new Exception(`Wrong number of initializers - expect ${members.length}`)
    }
    const doc = typeDef.getDocument()
    for (let i = 0; i < members.length; i++) {
      const memberType = members[i]!.getType()
      const subTypeDef = doc.getTypeDef(memberType)
      const member = Value.createValueFromStrings(subValues[i]!, memberType, subTypeDef)
      if (member) result.appendValue(member)
    }
    return result
  }
}

// A scope class for controlling the float formatting of values; call
// restore() at the end of the scope (C++ uses RAII).
export class ScopedFloatFormatting {
  private _format: FloatFormat
  private _precision: number

  constructor(format: FloatFormat, precision = -1) {
    this._format = Value.getFloatFormat()
    this._precision = Value.getFloatPrecision()
    Value.setFloatFormat(format)
    if (precision >= 0) Value.setFloatPrecision(precision)
  }

  restore(): void {
    Value.setFloatFormat(this._format)
    Value.setFloatPrecision(this._precision)
  }
}

// Convert the given data value to a value string.
export function toValueString(data: ValueData, type?: string): string {
  const spec = TYPE_SPECS.get(type ?? inferTypeString(data))
  if (!spec) throw new Exception(`Unknown MaterialX type: ${type}`)
  return spec.toString(data)
}

// Convert the given value string to a data value of the given type.
// Throws ExceptionTypeError if the conversion cannot be performed.
export function fromValueString(value: string, type: string): ValueData {
  const spec = TYPE_SPECS.get(type)
  if (!spec) throw new Exception(`Unknown MaterialX type: ${type}`)
  return spec.fromString(value)
}

// Return true if the given string names a registered MaterialX value type.
export function isRegisteredTypeString(type: string): boolean {
  return TYPE_SPECS.has(type)
}

// Tokenize the string representation of a struct value, i.e. "{1;2;3}" into a
// vector of substrings. "{1;2;{3;4;5}}" splits into ["1", "2", "{3;4;5}"].
export function parseStructValueString(value: string): string[] {
  const SEPARATOR = ';'
  const OPEN_BRACE = '{'
  const CLOSE_BRACE = '}'

  if (value.length === 0) return []
  if (value.length < 2 || value[0] !== OPEN_BRACE || value[value.length - 1] !== CLOSE_BRACE) {
    return []
  }

  const split: string[] = []
  const substring = value.slice(1, -1)

  let part = ''
  let braceDepth = 0
  for (const c of substring) {
    if (c === OPEN_BRACE) braceDepth += 1
    if (braceDepth > 0 && c === CLOSE_BRACE) braceDepth -= 1

    if (braceDepth === 0 && c === SEPARATOR) {
      split.push(part)
      part = ''
    } else {
      part += c
    }
  }
  if (part.length > 0) split.push(part)

  return split
}
