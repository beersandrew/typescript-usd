// Ported from OpenUSD 26.11.1: pxr/usd/sdf/textFileFormatParser.cpp,
//  pxr/usd/sdf/textFileFormatParser.h, pxr/usd/sdf/usdaFileFormat.cpp
// Copyright 2016, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// USDA text format parser — spec ch. 16.2. Mirrors the upstream text-parser
// family (pxr/usd/sdf/textFileFormatParser.cpp + textParserContext/
// textParserHelpers/textParserUtils + the read side of usdaFileFormat.cpp)
// as a hand-crafted recursive descent parser.

import {decodeUsdQuotedString} from './quotedString.ts'
import { coerceValueToType, RawInt, unwrapRawInt, sdfCanonicalTextTypeName } from './parserHelpers.ts'
import {
  SdfSchema,
  _sdfRegisterPluginFields,
  _sdfGetDictionaryValueTypes,
  _sdfGetMetadataFieldType,
  _sdfRecordDictionaryValueTypes,
  _sdfRecordSplineKnotCustomDataValueTypes,
  _sdfRecordTextSplineState,
  type SdfTextSplineKnotState,
  _sdfIsDictionary,
} from './schema.ts'
import {
  CurveType as TsCurveType, ExtrapMode as TsExtrapMode, Extrapolation as TsExtrapolation, InterpMode as TsInterpMode, Knot as TsKnot, LoopParams as TsLoopParams, Spline as TsSpline,
  TangentAlgorithm as TsTangentAlgorithm,
} from 'typescript-usd/ts'
import { Type as TfType, TfStreamDouble } from 'typescript-usd/tf'
import { quoteString } from './usdaFileFormat.ts'
import { Array as VtArray, ArrayEdit as VtArrayEdit, type ArrayEditOp } from 'typescript-usd/vt'
import { SdfPathExpression } from './pathExpression.ts'
import { findValueTypeName, type SdfValueTypeName } from './valueTypeName.ts'
import { SdfPath } from './path.ts'
import { SdfAnimationBlock, SdfUnregisteredValue, SdfValueBlock } from './types.ts'

export interface ValueRep {
  typeId: number
  isArray: boolean
  isInlined: boolean
  isCompressed: boolean
  payload: number
  value: unknown
  valueTypeName?: string
}

export interface SpecData {
  form: number
  fields: Record<string, ValueRep>
  [key: string]: unknown
}

export type Scene = Record<string, SpecData>

// --- Helpers ---

function vr(value: unknown): ValueRep {
  const unregistered = value instanceof SdfUnregisteredValue ? value : undefined
  const stored = unregistered ? unregistered.value : value
  return {
    typeId: 0, isArray: Array.isArray(stored), isInlined: false,
    isCompressed: false, payload: 0, value: stored,
    ...(unregistered ? { valueTypeName: unregistered.typeName } : {}),
  }
}

function addSpec(
  scene: Scene, path: string, fields: Record<string, unknown>,
  specType?: 'relationship' | 'relationshipTarget' | 'connection',
): void {
  const vrFields: Record<string, ValueRep> = {}
  const spec: Record<string, unknown> = { form: 0, fields: vrFields }
  for (const k in fields) {
    if (!Object.prototype.hasOwnProperty.call(fields, k)) continue
    spec[k] = vrFields[k] = vr(fields[k])
  }
  if (specType) spec.specType = specType
  scene[path] = spec as Scene[string]
}

// The text value factory rejects invalid operand types/counts before coercion
// (OpenUSD 26.11.1 parserHelpers.cpp:53-113,142-172). Keep this validation
// local to text reads; authoring and crate decoding share the coercion helper.
// Tuple literals `( ... )`, which parseValue returns as arrays like list
// literals `[ ... ]`; the value context tells them apart.
const tupleValues = new WeakSet<unknown[]>()

// The tuple nesting depth of a value (0 for a non-tuple).
function tupleDepth(value: unknown): number {
  if (!Array.isArray(value) || !tupleValues.has(value)) return 0
  let depth = 0
  for (const item of value) depth = Math.max(depth, tupleDepth(item))
  return depth + 1
}

// The value context's shape checks (OpenUSD 26.11.1): a list needs an array
// type and a top-level tuple a non-array type (textParserHelpers.cpp:36-86),
// and tuples nest no deeper than the type's tuple dimensions
// (parserValueContext.cpp:245-256). An array type's elements are values of
// its scalar type.
function validateTextShape(value: unknown, typeName: string, isArray: boolean, dimensions: readonly number[]): void {
  if (!Array.isArray(value)) return
  if (tupleValues.has(value)) {
    if (isArray) throw new Error('Type name has [] for non-shaped value.')
  } else {
    if (!isArray) throw new Error('Type name missing [] for shaped value.')
    for (const element of value) {
      if (Array.isArray(element) && !tupleValues.has(element)) continue
      if (tupleDepth(element) > dimensions.length) {
        throw new Error(`Tuple nesting too deep! Should not be deeper than ${dimensions.length} for attribute of type ${typeName}.`)
      }
    }
    return
  }
  if (tupleDepth(value) > dimensions.length) {
    throw new Error(`Tuple nesting too deep! Should not be deeper than ${dimensions.length} for attribute of type ${typeName}.`)
  }
}

function skipsTextValidation(value: unknown): boolean {
  return value === null || value === undefined || value === 'AnimationBlock' || value instanceof VtArrayEdit
}

function validateTextValue(value: unknown, typeName: string): void {
  if (skipsTextValidation(value)) return
  const type = findValueTypeName(sdfCanonicalTextTypeName(typeName))
  if (!type) return
  validateTypedTextValue(value, typeName, type)
}

// validateTextValue with the value type already looked up. An array's
// elements share their scalar type, so it is looked up once per array.
function validateTypedTextValue(value: unknown, typeName: string, type: SdfValueTypeName): void {
  if(type.type==='opaque')throw new Error('Found authored opinion for opaque attribute')
  validateTextShape(value, typeName, type.isArray, (type.isArray ? type.scalarType! : type).dimensions)
  if (type.isArray) {
    if (!Array.isArray(value)) throw new Error(`Expected array value for '${typeName}'`)
    const scalarName = type.scalarType!.name
    const scalar = findValueTypeName(sdfCanonicalTextTypeName(scalarName))
    if (!scalar) return
    for (const element of value) if (!skipsTextValidation(element)) validateTypedTextValue(element, scalarName, scalar)
    return
  }
  const numeric = (item: unknown): boolean => item instanceof RawInt || typeof item === 'number'
  if (type.dimensions.length) {
    const count = type.dimensions.reduce((a, b) => a * b, 1)
    if (numericComponentCount(value) !== count) {
      throw new Error(`Expected ${count} numeric components for '${typeName}'`)
    }
  } else if(['string','token','pathExpression'].includes(type.type)){
    // String, token and path-expression values need a string literal (a
    // number fails to parse, parserHelpers.cpp MakeScalarValueImpl).
    if(typeof value!=='string')throw new Error(`Expected string value for '${typeName}'`)
  } else if(type.type==='bool'){
    // Sdf_BoolFromString spellings (parserHelpers.cpp:651-677).
    if(!(typeof value==='boolean'||numeric(value)||typeof value==='string'&&/^(yes|no|true|false|0|1)$/i.test(value)))throw new Error(`Invalid bool value '${String(value)}'`)
  } else if (['uchar', 'int', 'uint', 'int64', 'uint64', 'half', 'float', 'double', 'timecode', 'GfDuration'].includes(type.type)) {
    if (!numeric(value)) throw new Error(`Expected numeric value for '${typeName}'`)
  }
}

// The number of leaf components of a (possibly nested) tuple value, or -1 if
// any leaf is not numeric.
function numericComponentCount(value: unknown): number {
  if (!Array.isArray(value)) return value instanceof RawInt || typeof value === 'number' ? 1 : -1
  let count = 0
  for (const item of value) {
    const n = numericComponentCount(item)
    if (n < 0) return -1
    count += n
  }
  return count
}

function coerceTextValue(value: unknown, typeName: string): unknown {
  validateTextValue(value, typeName)
  if(sdfCanonicalTextTypeName(typeName)==='bool'&&typeof value==='string')value=/^(yes|true|on|1)$/i.test(value)
  return coerceValueToType(value, typeName)
}

function parseSpline(c: Cursor, typeName: string): TsSpline {
  c.inlineGap();c.need('{')
  // TextParserAction<SplineValues> validates the numeric spline value type
  // (OpenUSD 26.11.1 textFileFormatParser.cpp:2380-2403).
  if (!['double', 'float', 'half', 'timecode','duration'].includes(typeName)) {
    throw new Error(`Unsupported spline value type '${typeName}'`)
  }
  // TsSpline(SdfGetTypeForValueTypeName(valueTypeName))
  // (textFileFormatParser.cpp:2383-2390): half is GfHalf and timecode is
  // GfTimeCode, which is what makes a spline time-valued (spline.cpp:117-121).
  const splineTypeName = typeName === 'duration' ? 'GfDuration' : typeName === 'timecode' ? 'GfTimeCode'
    : typeName === 'half' ? 'GfHalf' : typeName
  if (c.peek() === '}') {
    c.need('}')
    const empty = new TsSpline(TfType.declare(splineTypeName))
    _sdfRecordTextSplineState(empty, {
      preExtrapolationAuthored: false,
      postExtrapolationAuthored: false,
      knots: new Map(),
    })
    return empty
  }
  const firstWord = c.peekWord()
  const curve = firstWord === 'hermite' || firstWord === 'bezier' ? c.word() : 'bezier'
  const curveType = curve === 'hermite' ? TsCurveType.Hermite : TsCurveType.Bezier
  c.eat(',')
  const spline = new TsSpline(TfType.declare(splineTypeName))
  spline.setCurveType(curveType)
  const knots: TsKnot[] = []
  const knotCustomDataValueTypes = new Map<number, ReadonlyMap<string, string>>()
  const knotStates = new Map<number, SdfTextSplineKnotState>()
  let preExtrapolationAuthored = false
  let postExtrapolationAuthored = false
  while (!c.eof() && c.peek() !== '}') {
    const directive = c.peekWord()
    if (directive === 'pre' || directive === 'post') {
      c.word(); c.need(':')
      const modeName = c.word()
      // SplineExtrapolationType (OpenUSD 26.11.1
      // textFileFormatParser.h:811-824) is a closed set of spellings.
      const modes: Record<string, TsExtrapMode> = {
        sloped: TsExtrapMode.Sloped, linear: TsExtrapMode.Linear,
        none: TsExtrapMode.ValueBlock, held: TsExtrapMode.Held,
      }
      let mode = Object.hasOwn(modes, modeName) ? modes[modeName] : undefined
      let slope = 0
      let boundary: number | undefined
      if (modeName === 'loop') {
        // SplineExtrapLoopWith(out)Boundary = loop TokenSeparator ...
        // (textFileFormatParser.h:793-809).
        c.tokenSeparator()
        const loopName = c.word()
        const loops: Record<string, TsExtrapMode> = {
          repeat: TsExtrapMode.LoopRepeat, reset: TsExtrapMode.LoopReset,
          oscillate: TsExtrapMode.LoopOscillate,
        }
        mode = Object.hasOwn(loops, loopName) ? loops[loopName] : undefined
        if (mode === undefined) throw new Error(`Unknown spline loop mode '${loopName}' at ${c.pos}`)
        if (c.eat('(')) { boundary = c.number(); c.need(')') }
      } else if (mode === undefined) {
        throw new Error(`Unknown spline extrapolation '${modeName}' at ${c.pos}`)
      } else if (mode === TsExtrapMode.Sloped) {
        c.need('('); slope = c.number(); c.need(')')
      }
      const extrap = new TsExtrapolation(mode, slope, boundary)
      if (directive === 'pre') {
        preExtrapolationAuthored = true
        spline.setPreExtrapolation(extrap)
      } else {
        postExtrapolationAuthored = true
        spline.setPostExtrapolation(extrap)
      }
      c.eat(',')
      continue
    }
    if (directive === 'loop') {
      c.word(); c.need(':'); c.need('(')
      const values: number[] = []
      for (let i = 0; i < 5; i++) { values.push(c.number()); if (i < 4) c.need(',') }
      c.need(')')
      // textFileFormatParser.cpp:2651-2663.
      if (Math.trunc(values[2]!) !== values[2] || Math.trunc(values[3]!) !== values[3]) {
        throw new Error('SplineLoopItem: Non-integer loop count')
      }
      spline.setInnerLoopParams(new TsLoopParams(...values as [number, number, number, number, number]))
      c.eat(',')
      continue
    }
    const knot = new TsKnot(spline.GetValueType())
    knot.setCurveType(curveType)
    knot.setNextInterpolation(TsInterpMode.Held)
    knot.SetTime(c.number())
    c.need(':')
    let value = c.number()
    if (c.eat('&')) {
      knot.setPreValue(value)
      value = c.number()
    }
    knot.setValue(value)
    let parsedPreTangentSlope = 0
    let parsedPreTangentWidth = 0
    let parsedPostTangentSlope = 0
    let parsedPostTangentWidth = 0
    while (c.eat(';')) {
      if (c.peek() === '{') {
        const customData = parseValue(c)
        if (_sdfIsDictionary(customData)) {
          const valueTypes = _sdfGetDictionaryValueTypes(customData)
          if (valueTypes) knotCustomDataValueTypes.set(knot.getTime(), valueTypes)
          knot.setCustomData(customData as Record<string, unknown>)
        }
        continue
      }
      const side = c.word()
      if (side !== 'pre' && side !== 'post') throw new Error(`Unknown spline knot parameter '${side}' at ${c.pos}`)
      // SplinePreTan = pre TokenSeparator SplineTangent and SplinePostShaping
      // = post TokenSeparator SplineInterpMode (OpenUSD 26.11.1
      // textFileFormatParser.h:925-938). TokenSeparator needs a space or tab,
      // so `pre/*c*/(` is rejected here; AOUSD Core 1.1.0 allows it, an
      // undecided disagreement recorded in docs/core-1.1.md ("Spline `pre`
      // tangent padding").
      c.tokenSeparator()
      let interp = ''
      if (side === 'post') {
        interp = c.word()
        if(c.at()==='(')throw new Error('Spline post shaping requires token separation')
        if (!['none', 'held', 'linear', 'curve'].includes(interp)) throw new Error(`Unknown spline interpolation '${interp}' at ${c.pos}`)
      } else if (c.at() !== '(') {
        throw new Error(`Expected pre tangent at ${c.pos}`)
      }
      let width = 0, slope = 0
      let parsedWidth = 0, parsedSlope = 0
      if (c.eat('(')) {
        const first = c.number()
        let algorithm = TsTangentAlgorithm.None
        if (c.eat(',')) {
          const secondWord = c.peekWord()
          if (secondWord === 'autoEase' || secondWord === 'custom') {
            algorithm = c.word() === 'autoEase'
              ? TsTangentAlgorithm.AutoEase : TsTangentAlgorithm.Custom
            slope = first
            parsedSlope = first
          } else {
            const second = c.number()
            width = first
            slope = second
            parsedSlope = first
            parsedWidth = second
            if (c.eat(',')) {
              const name = c.word()
              if (name !== 'autoEase' && name !== 'custom') throw new Error(`Unknown tangent algorithm '${name}' at ${c.pos}`)
              algorithm = name === 'autoEase' ? TsTangentAlgorithm.AutoEase : TsTangentAlgorithm.Custom
            }
          }
        } else {
          slope = first
          parsedSlope = first
        }
        c.need(')')
        if (side === 'pre') knot.setPreTanAlgorithm(algorithm)
        else knot.setPostTanAlgorithm(algorithm)
      }
      if (side === 'pre') {
        parsedPreTangentWidth = parsedWidth
        parsedPreTangentSlope = parsedSlope
        knot.setPreTanWidth(width)
        knot.setPreTanSlope(slope)
      } else {
        parsedPostTangentWidth = parsedWidth
        parsedPostTangentSlope = parsedSlope
        knot.setPostTanWidth(width)
        knot.setPostTanSlope(slope)
        knot.setNextInterpolation(interp === 'none' ? TsInterpMode.ValueBlock :
          interp === 'held' ? TsInterpMode.Held :
          interp === 'linear' ? TsInterpMode.Linear : TsInterpMode.Curve)
      }
    }
    // Keep the parsed tangent operands separately: TsKnot authoring validation
    // may reject an operand, while Sdf's text layer still has to preserve the
    // authored document observation (OpenUSD v26.08 parser actions:2960-3003).
    knotStates.set(knot.getTime(), {
      dualValued: knot.isDualValued(),
      preTangentSlope: parsedPreTangentSlope, preTangentWidth: parsedPreTangentWidth,
      postTangentSlope: parsedPostTangentSlope, postTangentWidth: parsedPostTangentWidth,
    })
    knots.push(knot)
    c.eat(',')
  }
  c.need('}')
  spline.setKnots(knots)
  if (knotCustomDataValueTypes.size) {
    _sdfRecordSplineKnotCustomDataValueTypes(spline, knotCustomDataValueTypes)
  }
  // TsSpline::SetInnerLoopParams (spline.cpp:217-244) rejects this combination.
  if(!spline.getInnerLoopParams().equals(new TsLoopParams())&&[spline.getPreExtrapolation(),spline.getPostExtrapolation()].some(extrap=>extrap.loopBoundaryTime!==undefined))throw new Error('Cannot combine inner loops with extrapolation loopBoundaryTime')
  _sdfRecordTextSplineState(spline, {
    preExtrapolationAuthored, postExtrapolationAuthored, knots: knotStates,
  })
  return spline
}

// --- Cursor: lexer + parser state ---

function isDigitCode(c: number): boolean { return c >= 0x30 && c <= 0x39 }

// ASCII letter, digit or '_' (the class [a-zA-Z0-9_]).
function isAsciiWordCode(c: number): boolean {
  return c >= 0x61 && c <= 0x7a || c >= 0x41 && c <= 0x5a || c >= 0x30 && c <= 0x39 || c === 0x5f
}

/** @internal A numeric literal lexed at `start` (textFileFormat.ll NUMBER):
 * `[+-]?(inf|nan)` (any case) not followed by [a-zA-Z0-9_], or
 * `[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?`. `end` is where the
 * scan stopped; `raw` is undefined when the text there is not a number. The
 * literal's text is retained (see Cursor.rawNumber). */
export function _sdfScanTextNumber(src: string, start: number):
  { raw: string | undefined; value: number; isInt: boolean; end: number } {
  let i = start
  let c = src.charCodeAt(i)
  if (c === 0x2d || c === 0x2b) c = src.charCodeAt(++i)
  // [+-]?(inf|nan), case-insensitive, then no word character.
  const lower = c | 0x20
  if (lower === 0x69 || lower === 0x6e) {
    const special = lower === 0x69 ? 'inf' : 'nan'
    if ((src.charCodeAt(i + 1) | 0x20) === special.charCodeAt(1) &&
        (src.charCodeAt(i + 2) | 0x20) === special.charCodeAt(2) &&
        !isAsciiWordCode(src.charCodeAt(i + 3))) {
      const end = i + 3
      const value = lower === 0x6e ? NaN : src.charCodeAt(start) === 0x2d ? -Infinity : Infinity
      return { raw: src.slice(start, end), value, isInt: false, end }
    }
  }
  // The literal's digits as an integer while it stays exact (at most 15
  // digits; 10^15 < 2^53), for the conversion below.
  let isInt = true
  let mantissa = 0
  let fracDigits = 0
  const intStart = i
  for (c = src.charCodeAt(i); isDigitCode(c); c = src.charCodeAt(++i)) mantissa = mantissa * 10 + (c - 0x30)
  let digits = i - intStart
  if (c === 0x2e) {
    isInt = false
    const fracStart = ++i
    for (c = src.charCodeAt(i); isDigitCode(c); c = src.charCodeAt(++i)) mantissa = mantissa * 10 + (c - 0x30)
    fracDigits = i - fracStart
    digits += fracDigits
  }
  let valid = digits > 0
  let exponent = 0
  if (c === 0x65 || c === 0x45) {
    isInt = false
    i++
    c = src.charCodeAt(i)
    let expSign = 1
    if (c === 0x2b || c === 0x2d) { if (c === 0x2d) expSign = -1; i++ }
    const expStart = i
    for (c = src.charCodeAt(i); isDigitCode(c); c = src.charCodeAt(++i)) exponent = exponent * 10 + (c - 0x30)
    if (i === expStart) valid = false
    exponent *= expSign
  }
  if (!valid) return { raw: undefined, value: NaN, isInt, end: i }
  const raw = src.slice(start, i)
  // parseFloat's result, computed directly when that is exact: an integer
  // mantissa below 2^53 scaled by a power of ten that is itself exact
  // (10^22 is the largest) takes one correctly rounded multiplication or
  // division, which is the correctly rounded value of the decimal literal
  // (Clinger's fast path). Anything else goes through parseFloat.
  const scale = exponent - fracDigits
  let value: number
  if (digits <= 15 && scale >= -22 && scale <= 22) {
    value = scale < 0 ? mantissa / POWERS_OF_TEN[-scale]! : mantissa * POWERS_OF_TEN[scale]!
    if (src.charCodeAt(start) === 0x2d) value = -value
  } else {
    value = parseFloat(raw)
  }
  return { raw, value, isInt, end: i }
}

const POWERS_OF_TEN = Array.from({ length: 23 }, (_, k) => Number(`1e${k}`))

// The end of the run of [a-zA-Z0-9_] (with `colons`, [a-zA-Z0-9_:]) at `i`.
function scanWord(src: string, i: number, colons: boolean): number {
  for (;; i++) {
    const c = src.charCodeAt(i)
    if(c>127){const point=String.fromCodePoint(src.codePointAt(i)!);if(/[\p{ID_Continue}]/u.test(point)){i+=point.length-1;continue}return i}
    if (!(c >= 0x61 && c <= 0x7a || c >= 0x41 && c <= 0x5a || c >= 0x30 && c <= 0x39 ||
          c === 0x5f || colons && c === 0x3a)) return i
  }
}

class Cursor {
  src: string
  pos = 0
  private triviaStart=0
  private triviaEnd=0

  constructor(src: string, readonly sourceName = '') { this.src = src }

  eof(): boolean { return this.pos >= this.src.length }
  at(offset = 0): string { return this.src[this.pos + offset] ?? '' }

  ws(): void {
    const start=this.pos,src=this.src,length=src.length
    let pos=start
    while (pos < length) {
      const ch = src.charCodeAt(pos)
      if (ch === 0x20 || ch === 0x09 || ch === 0x0d || ch === 0x0a) {
        pos++
      } else if (ch === 0x23 || (ch === 0x2f && src.charCodeAt(pos + 1) === 0x2f)) {
        // PythonStyleComment and CppStyleSingleLineComment
        // (textFileFormatParser.h:210-228).
        while (pos < length && src.charCodeAt(pos) !== 0x0a) pos++
      } else if (ch === 0x2f && src.charCodeAt(pos + 1) === 0x2a) {
        pos += 2
        while (pos < length) {
          if (src.charCodeAt(pos) === 0x2a && src.charCodeAt(pos + 1) === 0x2f) { pos += 2; break }
          pos++
        }
      } else {
        break
      }
    }
    this.pos=pos
    if(pos!==start||pos!==this.triviaEnd){this.triviaStart=start;this.triviaEnd=pos}
  }

  // Native InlinePadding and PrimItem separators, textFileFormatParser.h:239-282,1558-1572.
  inlineGap():void{this.ws();if(this.gapHasNewline())throw new Error(`Unexpected newline at ${this.pos}`)}
  // Whether the last trivia has a newline outside its /* */ comments. A gap
  // without "/*" (nearly all of them) is scanned in place; one with comments
  // takes the comment-stripping form.
  private gapHasNewline():boolean{
    const src=this.src,start=this.triviaStart,end=this.triviaEnd
    let newline=false
    for(let i=start;i<end;i++){
      const c=src.charCodeAt(i)
      if(c===0x2f&&i+1<end&&src.charCodeAt(i+1)===0x2a)return /[\r\n]/.test(src.slice(start,end).replace(/\/\*[\s\S]*?\*\//g,''))
      if(c===0x0a||c===0x0d)newline=true
    }
    return newline
  }
  statementEnd(prim=false,close=''):void{
    this.ws();const gap=this.src.slice(this.triviaStart,this.triviaEnd).replace(/\/\*[\s\S]*?\*\//g,'')
    if(close&&this.at()===close)return
    if(/[\r\n]/.test(gap)||this.eof())return
    if(!prim&&(this.at()===';'||this.src[this.triviaStart-1]===';')){if(this.at()===';')this.pos++;return}
    throw new Error(`Expected ${prim?'newline':'statement separator'} at ${this.pos}`)
  }

  // TokenSeparator = pad<Space, CppStyleMultiLineComment, InlinePadding>:
  // multiline comments, then one space or tab, then any InlinePadding
  // (OpenUSD 26.11.1 textFileFormatParser.h:69,239-246).
  tokenSeparator(): void {
    let i = this.pos
    const skipComment = () => {
      const end = this.src.indexOf('*/', i + 2)
      if (end < 0) throw new Error(`Unterminated comment at ${i}`)
      i = end + 2
    }
    while (this.src.startsWith('/*', i)) skipComment()
    if (this.src[i] !== ' ' && this.src[i] !== '\t') throw new Error(`Expected token separator at ${i}`)
    for (;;) {
      if (this.src[i] === ' ' || this.src[i] === '\t') i++
      else if (this.src.startsWith('/*', i)) skipComment()
      else break
    }
    this.pos = i
  }

  peek(): string { this.ws(); return this.at() }

  // The next character on the current line: property metadata follows its
  // property inline (AttributeSpec / RelationshipSpec pad with
  // TokenSeparator, textFileFormatParser.h:1019-1023,1119-1124), so a gap
  // containing a newline leaves the cursor where it was.
  peekSameLine(): string {
    const saved = this.pos
    this.ws()
    const gap = this.src.slice(saved, this.pos).replace(/\/\*[\s\S]*?\*\//g, '')
    if (/[\r\n]/.test(gap)) { this.pos = saved; return '' }
    return this.at()
  }

  // Read word [a-zA-Z0-9_] — no colons, no dots
  word(): string {
    this.ws()
    const start = this.pos
    this.pos = scanWord(this.src, start, false)
    return this.src.slice(start, this.pos)
  }

  // Peek word without advancing past whitespace
  peekWord(): string {
    const saved = this.pos
    this.ws()
    const start = this.pos
    this.pos = saved
    return this.src.slice(start, scanWord(this.src, start, false))
  }

  secondWord():string{const saved=this.pos;this.word();const word=this.peekWord();this.pos=saved;return word}

  // Read identifier allowing colon namespacing [a-zA-Z0-9_:], strip trailing colons
  ident(): string {
    this.ws()
    const start = this.pos
    this.pos = scanWord(this.src, start, true)
    let end = this.pos
    while (end > start && this.src.charCodeAt(end - 1) === 0x3a) end--
    return this.src.slice(start, end)
  }

  eat(s: string): boolean {
    this.ws()
    if (this.src.startsWith(s, this.pos)) { if(s==='=')this.inlineGap();this.pos += s.length; return true }
    return false
  }

  need(s: string): void {
    if (!this.eat(s)) throw new Error(`Expected '${s}' at ${this.pos}, got: '${this.src.slice(this.pos, this.pos + 30)}'`)
  }

  // The PEGTL must<> failure the native parser reports for an unexpected
  // token at `pos`: `<file>:<line>:<column>: Expected <what> at '<rest of
  // the line>' in <<path>>`.
  expectedAt(what: string, pos: number, path: string): never {
    const before = this.src.slice(0, pos).split(/\r?\n/)
    const rest = this.src.slice(pos).match(/^[^\r\n]*/)![0]
    const location = this.sourceName ? `${this.sourceName}:` : ''
    throw new Error(`${location}${before.length}:${(before.at(-1)?.length ?? 0) + 1}: Expected ${what} at '${rest}' in <${path}>`)
  }

  expectedListOperand(path: string): never {
    this.ws()
    const before = this.src.slice(0, this.pos).split(/\r?\n/)
    const line = before.length
    const column = (before.at(-1)?.length ?? 0) + 1
    let token = this.at()
    if (token === '@') {
      const end = this.src.indexOf('@', this.pos + 1)
      token = end < 0 ? this.src.slice(this.pos) : this.src.slice(this.pos, end + 1)
    } else {
      token = this.src.slice(this.pos).match(/^[^\s,;)]+/)?.[0] ?? token
    }
    const location = this.sourceName ? `${this.sourceName}:` : ''
    throw new Error(`${location}${line}:${column}: Expected None or [ at '${token}' in <${path}>`)
  }

  string(): string {
    this.ws();const quote=this.at()
    if(quote!=='"'&&quote!=="'")throw new Error(`Expected string at ${this.pos}`)
    const delimiter=this.src.startsWith(quote.repeat(3),this.pos)?quote.repeat(3):quote
    this.pos+=delimiter.length;const start=this.pos
    while(!this.eof()){
      if(this.at()==='\\'){this.pos+=2;continue}
      if(this.src.startsWith(delimiter,this.pos)){
        const value=decodeUsdQuotedString(this.src.slice(start,this.pos));this.pos+=delimiter.length;return value
      }
      if(delimiter.length===1&&/[\r\n]/.test(this.at()))throw new Error('Unterminated single-line string')
      this.pos++
    }
    throw new Error('Unterminated quoted string')
  }

  // Lex a numeric literal, retaining the raw digit string and whether it is an
  // integer (no '.', no exponent). Upstream's lexer keeps the literal text and
  // only converts at coercion time against the declared type, so a big int64
  // never round-trips through a lossy double — we mirror that by carrying the
  // raw string for integer literals.
  rawNumber(): { raw: string; value: number; isInt: boolean } {
    this.ws()
    const { raw, value, isInt, end } = _sdfScanTextNumber(this.src, this.pos)
    this.pos = end
    if (raw === undefined) throw new Error(`Expected number at ${this.pos}, got '${this.at()}'`)
    return { raw, value, isInt }
  }

  number(): number {
    return this.rawNumber().value
  }

  asset(): string {
    // OpenUSD 26.11.1 textParserUtils.cpp:Sdf_EvalAssetPath and
    // textFileFormatParser.h:AssetRef: only escaped triple delimiters unescape.
    this.need('@');let value=''
    if(this.at()==='@'&&this.at(1)==='@'){
      this.pos+=2;let closed=false
      while(!this.eof()){
        if(this.at()==='\\'&&this.src.startsWith('@@@',this.pos+1)){value+='@@@';this.pos+=4;continue}
        if(this.src.startsWith('@@@',this.pos)){
          let end=this.pos;while(this.src[end]==='@')end++
          value+='@'.repeat(end-this.pos-3);this.pos=end;closed=true;break
        }
        value+=this.src[this.pos++]
      }
      if(!closed)throw new Error('Unterminated triple asset path')
    }else{
      while(!this.eof()&&this.at()!=='@')value+=this.src[this.pos++]
      if(this.eof())throw new Error('Unterminated asset path')
      this.pos++
    }
    if(/[\x00-\x1f\x7f]/.test(value))throw new Error('Asset path contains control characters')
    return value
  }

  path(): string {
    this.need('<')
    let s = ''
    while (!this.eof() && this.at() !== '>') s += this.src[this.pos++]
    this.pos++
    return s
  }

  // Skip balanced {...} block handling strings, comments, and asset paths
  skipBlock(): void {
    this.need('{')
    let depth = 1
    while (!this.eof() && depth > 0) {
      const ch = this.src[this.pos]
      if (ch === '{') { depth++; this.pos++ }
      else if (ch === '}') { depth--; this.pos++ }
      else if (ch === '"' || ch === "'") {
        const q = ch; const triple = q + q + q
        if (this.src.startsWith(triple, this.pos)) {
          this.pos += 3
          const end = this.src.indexOf(triple, this.pos)
          this.pos = end < 0 ? this.src.length : end + 3
        } else {
          this.pos++
          while (!this.eof() && this.src[this.pos] !== q) {
            if (this.src[this.pos] === '\\') this.pos++
            this.pos++
          }
          this.pos++
        }
      } else if (ch === '#') {
        while (!this.eof() && this.src[this.pos] !== '\n') this.pos++
      } else if (ch === '/' && this.src[this.pos + 1] === '*') {
        this.pos += 2
        const end = this.src.indexOf('*/', this.pos)
        this.pos = end < 0 ? this.src.length : end + 2
      } else if (ch === '@') {
        this.pos++
        if (this.src[this.pos] === '@' && this.src[this.pos + 1] === '@') {
          this.pos += 2
          const end = this.src.indexOf('@@@', this.pos)
          this.pos = end < 0 ? this.src.length : end + 3
        } else {
          while (!this.eof() && this.src[this.pos] !== '@') this.pos++
          if (!this.eof()) this.pos++
        }
      } else {
        this.pos++
      }
    }
  }

  // Skip balanced (...) block
  skipParen(): void {
    this.need('(')
    let depth = 1
    while (!this.eof() && depth > 0) {
      const ch = this.src[this.pos]
      if (ch === '(') { depth++; this.pos++ }
      else if (ch === ')') { depth--; this.pos++ }
      else if (ch === '"' || ch === "'") {
        const q = ch; const triple = q + q + q
        if (this.src.startsWith(triple, this.pos)) {
          this.pos += 3
          const end = this.src.indexOf(triple, this.pos)
          this.pos = end < 0 ? this.src.length : end + 3
        } else {
          this.pos++
          while (!this.eof() && this.src[this.pos] !== q) {
            if (this.src[this.pos] === '\\') this.pos++
            this.pos++
          }
          this.pos++
        }
      } else if (ch === '#') {
        while (!this.eof() && this.src[this.pos] !== '\n') this.pos++
      } else if (ch === '/' && this.src[this.pos + 1] === '*') {
        this.pos += 2
        const end = this.src.indexOf('*/', this.pos)
        this.pos = end < 0 ? this.src.length : end + 2
      } else {
        this.pos++
      }
    }
  }

  // Skip balanced [...] block
  skipBracket(): void {
    this.need('[')
    let depth = 1
    while (!this.eof() && depth > 0) {
      const ch = this.src[this.pos]
      if (ch === '[') { depth++; this.pos++ }
      else if (ch === ']') { depth--; this.pos++ }
      else if (ch === '"' || ch === "'") {
        const q = ch; const triple = q + q + q
        if (this.src.startsWith(triple, this.pos)) {
          this.pos += 3
          const end = this.src.indexOf(triple, this.pos)
          this.pos = end < 0 ? this.src.length : end + 3
        } else {
          this.pos++
          while (!this.eof() && this.src[this.pos] !== q) {
            if (this.src[this.pos] === '\\') this.pos++
            this.pos++
          }
          this.pos++
        }
      } else if (ch === '#') {
        while (!this.eof() && this.src[this.pos] !== '\n') this.pos++
      } else {
        this.pos++
      }
    }
  }
}

// --- Value parsing ---

function parseValue(c: Cursor): unknown {
  c.ws()
  const ch = c.peek()

  if (!ch) return null

  // None / null
  if (c.src.startsWith('None', c.pos) && !/[a-zA-Z0-9_]/.test(c.src[c.pos + 4] ?? '')) {
    c.pos += 4; return null
  }

  // String literals
  if (ch === '"' || ch === "'") return c.string()

  // Tuple: (n, n, ...)
  if (ch === '(') {
    c.need('(')
    const items: unknown[] = []
    while (c.peek() !== ')' && !c.eof()) {
      if (items.length > 0) {c.inlineGap();c.need(',')}
      c.ws()
      if (c.peek() === ')') break
      items.push(parseValue(c))
    }
    c.need(')')
    tupleValues.add(items)
    return items
  }

  // Array: [v, v, ...]
  if (ch === '[') {
    c.need('[')
    const items: unknown[] = []
    while (c.peek() !== ']' && !c.eof()) {
      if (items.length > 0) {c.inlineGap();c.need(',')}
      c.ws()
      if (c.peek() === ']') break
      items.push(parseValue(c))
    }
    c.need(']')
    return items
  }

  // Asset path @...@
  if (ch === '@') return c.asset()

  // Prim path <...>
  if (ch === '<') return c.path()

  // Dictionary {...} (for metadata values)
  if (ch === '{') return parseDict(c)

  // Signed non-finite floating literals. The sign belongs to the `inf`/`nan`
  // token; do not let rawNumber consume it alone and leave `inf` to be parsed
  // as the next declaration (textFileFormat.ll accepts these as NUMBER).
  if ((ch === '-' || ch === '+') && /[a-zA-Z_]/.test(c.at(1))) {
    const sign = ch === '-' ? -1 : 1
    c.pos++
    const word = c.word()
    if (word === 'inf' || word === 'Inf' || word === 'INF') return sign * Infinity
    if (word === 'nan' || word === 'NaN') return sign * NaN
    return `${ch}${word}`
  }

  // Number (including -.43 style). Integer literals are returned as a RawInt
  // carrier so coercion to int64/uint64 can BigInt the exact decimal text;
  // float/double literals become plain JS numbers (already shortest-round-trip).
  if (ch === '-' || ch === '+' || isDigitCode(ch.charCodeAt(0)) || (ch === '.' && isDigitCode(c.src.charCodeAt(c.pos + 1)))) {
    const n = c.rawNumber()
    return n.isInt ? new RawInt(n.raw, n.value) : n.value
  }

  // Word: true, false, None, token
  if (/[a-zA-Z_]/.test(ch)) {
    const w = c.word()
    // USD's text parser accepts both lowercase and capitalized bool literals
    // (`True`/`False`, the form Pcp's testenv museum uses); both round-trip to
    // lowercase on export.
    if (w === 'true' || w === 'True') return true
    if (w === 'false' || w === 'False') return false
    if (w === 'None') return null
    // ArrayEditValue (textFileFormatParser.h:618-622).
    if (w === 'edit' && c.peek() === '[') return parseArrayEdit(c)
    // Check if it's a number-like word (inf, nan)
    if (w === 'inf' || w === 'Inf' || w === 'INF') return Infinity
    if (w === 'nan' || w === 'NaN') return NaN
    // Identifier = list<KeywordlessIdentifier, '::'>: a CXX-namespaced
    // identifier value such as foo::bar (textFileFormatParser.h:409-413).
    let identifier = w
    while (c.src.startsWith('::', c.pos) && scanWord(c.src, c.pos + 2, false) > c.pos + 2) {
      const start = c.pos + 2
      c.pos = scanWord(c.src, start, false)
      identifier += '::' + c.src.slice(start, c.pos)
    }
    // Return as token string
    return identifier
  }

  // Value grammar has no recovery production (OpenUSD 26.11.1
  // textFileFormatParser.h: AtomicValue / TypedValue).
  throw new Error(`Expected value at ${c.pos}, got '${c.peek()}'`)
}

// ArrayEditValue = edit [ ArrayEditInstruction (; ArrayEditInstruction)* ]
// (textFileFormatParser.h:549-622). Literals are returned as parsed; the
// attribute's declared type coerces them (parserHelpers.ts coerceArray).
function parseArrayEdit(c: Cursor): VtArrayEdit<unknown> {
  type Op = ArrayEditOp<unknown>
  const ops: Op[] = []
  // ArrayEditReference = [ Integer ]
  const reference = (): number => {
    c.need('[')
    const index = c.rawNumber()
    if (!index.isInt) throw new Error(`Expected an integer array edit index at ${c.pos}`)
    c.need(']')
    return index.value
  }
  const sizeArg = (): number => {
    const size = c.rawNumber()
    if (!size.isInt) throw new Error(`Expected an integer array edit size at ${c.pos}`)
    return size.value
  }
  const literal = (): unknown => parseValue(c)
  // ArrayEditReference<0> / ArrayEditLiteral.
  const referenceOrLiteral = (): { ref: number } | { value: unknown } => {
    c.ws()
    return c.peek() === '[' ? { ref: reference() } : { value: literal() }
  }
  const optionalFill = (): unknown => {
    if (c.peekWord() !== 'fill') return undefined
    c.word()
    return literal()
  }
  const need = (keyword: string): void => {
    if (c.word() !== keyword) throw new Error(`Expected '${keyword}' at ${c.pos}`)
  }
  c.need('[')
  for (;;) {
    c.ws()
    if (c.peek() === ']') break
    if (c.peek() === ';') { c.pos++; continue }
    const keyword = c.word()
    switch (keyword) {
      case 'prepend':
      case 'append': {
        const index = keyword === 'prepend' ? 0 : 'end'
        const arg = referenceOrLiteral()
        ops.push('ref' in arg
          ? { kind: 'insertRef', source: arg.ref, destination: index }
          : { kind: 'insert', value: arg.value, index })
        break
      }
      case 'write': {
        const arg = referenceOrLiteral()
        need('to')
        const index = reference()
        ops.push('ref' in arg
          ? { kind: 'writeRef', source: arg.ref, destination: index }
          : { kind: 'write', value: arg.value, index })
        break
      }
      case 'insert': {
        const arg = referenceOrLiteral()
        need('at')
        const index = reference()
        ops.push('ref' in arg
          ? { kind: 'insertRef', source: arg.ref, destination: index }
          : { kind: 'insert', value: arg.value, index })
        break
      }
      case 'erase':
        ops.push({ kind: 'erase', index: reference() })
        break
      case 'minsize':
      case 'resize': {
        const size = sizeArg()
        ops.push({ kind: keyword === 'minsize' ? 'minSize' : 'setSize', size, fill: optionalFill() })
        break
      }
      case 'maxsize':
        ops.push({ kind: 'maxSize', size: sizeArg() })
        break
      default:
        throw new Error(`Unexpected array edit instruction '${keyword}' at ${c.pos}`)
    }
  }
  c.need(']')
  return new VtArrayEdit(ops)
}

// The upstream parser records unknown fields as text and stores an
// SdfUnregisteredValue (OpenUSD v26.08 pxr/usd/sdf/textParserHelpers.cpp:
// 164-168,209-258). This parser also retains the literal token category.
// Preserve that parser fact here instead of reconstructing a type later from
// a JavaScript value whose representation may be ambiguous.
// ListValueItem and TupleValueItem have no PathRef alternative
// (textFileFormatParser.h:452-486): a path is a metadata value only on its
// own (TypedValue's PathRefValue), never inside a list or tuple. Returns the
// offset of the first nested path in a metadata value's source text.
function nestedPathOffset(text: string): number {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"' || ch === "'") {
      const triple = text.startsWith(ch.repeat(3), i)
      const close = triple ? ch.repeat(3) : ch
      for (i += close.length; i < text.length && !text.startsWith(close, i); i++) {
        if (text[i] === '\\') i++
      }
      i += close.length - 1
    } else if (ch === '@') {
      const close = text.startsWith('@@@', i) ? '@@@' : '@'
      const end = text.indexOf(close, i + close.length)
      i = end < 0 ? text.length : end + close.length - 1
    } else if (ch === '[' || ch === '(') depth++
    else if (ch === ']' || ch === ')') depth--
    else if (ch === '<' && depth > 0) return i
  }
  return -1
}

// Sdf_ParserValueContext's recorded string (parserValueContext.cpp:16-28,
// 129-140,167-192,237-265): each atom is re-stringified as it is parsed
// (TfStringify, so `10.0` records `10` and `1.5e300` records `1.5e300`;
// strings are re-quoted), with `, ` between items and no inner padding.
// Integer literals beyond int64/uint64 are parsed as doubles
// (textFileFormatParser.cpp:820-850).
function recordedValueText(c: Cursor): string {
  c.ws()
  const ch = c.peek()
  if (ch === '"' || ch === "'") return quoteString(c.string())
  if (ch === '(' || ch === '[') {
    const close = ch === '(' ? ')' : ']'
    c.need(ch)
    const items: string[] = []
    while (c.peek() !== close && !c.eof()) {
      if (items.length > 0) { c.inlineGap(); c.need(',') }
      c.ws()
      if (c.peek() === close) break
      items.push(recordedValueText(c))
    }
    c.need(close)
    return `${ch}${items.join(', ')}${close}`
  }
  if (ch === '@') return `@${c.asset()}@`
  if ((ch === '-' || ch === '+') && /[a-zA-Z_]/.test(c.at(1))) {
    c.pos++
    const word = c.word()
    return /^(?:inf|Inf|INF)$/.test(word) ? (ch === '-' ? '-inf' : 'inf') : `${ch}${word}`
  }
  if (ch === '-' || ch === '+' || /[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(c.at(1)))) {
    const n = c.rawNumber()
    if (n.isInt) {
      const value = BigInt(n.raw)
      if (value >= -(2n ** 63n) && value < 2n ** 64n) return value.toString()
    }
    return TfStreamDouble(n.value)
  }
  let word = c.word()
  if (/^(?:inf|Inf|INF)$/.test(word)) return 'inf'
  if (/^(?:nan|NaN)$/.test(word)) return 'nan'
  while (c.src.startsWith('::', c.pos) && scanWord(c.src, c.pos + 2, false) > c.pos + 2) {
    const start = c.pos + 2
    c.pos = scanWord(c.src, start, false)
    word += '::' + c.src.slice(start, c.pos)
  }
  return word
}

// _SetDefault (textParserHelpers.cpp:110-130): a pathExpression default, or
// each element of a pathExpression[] default, is made absolute against the
// owning prim's path. Parsing also normalizes the text (`" /B"` is `/B`).
function anchorPathExpressionDefault(value: unknown, primPath: string, typeName: string): unknown {
  const base = typeName.replace(/\[\]$/, '')
  if (base !== 'pathExpression') return value
  const anchor = SdfPath.fromString(primPath).getPrimPath()
  const absolute = (text: string) => new SdfPathExpression(text).makeAbsolute(anchor).getText()
  if (typeof value === 'string') return absolute(value)
  if (value instanceof VtArray) {
    const out = (value as VtArray<string>).Clone()
    for (let i = 0; i < out.size; i++) out.set(i, absolute(String(out.get(i))))
    return out
  }
  return value
}

function parseMetadataValue(
  c: Cursor, key: string, specType: 'layer' | 'prim' | 'attribute' | 'relationship',
): unknown {
  // SymmetryFunctionMetadata = symmetryFunction Assignment (Identifier)?
  // (textFileFormatParser.h:731-735): the identifier is optional, so the
  // value may be empty before the statement's end on the same line.
  const emptySymmetry = key === 'symmetryFunction' && (() => {
    let i = c.pos
    for (;;) {
      if (c.src[i] === ' ' || c.src[i] === '\t') i++
      else if (c.src.startsWith('/*', i) && c.src.indexOf('*/', i + 2) >= 0) i = c.src.indexOf('*/', i + 2) + 2
      else break
    }
    const next = c.src[i] ?? ''
    return next === '' || next === '\n' || next === '\r' || next === '#' ||
      c.src.startsWith('//', i) || [')', ';', '}'].includes(next)
  })()
  const ch = c.peek()
  if(!emptySymmetry)c.inlineGap()
  const word = c.peekWord()
  const lexicalType = ch === '"' || ch === "'" ? 'string'
    : ch === '@' ? 'asset'
      : ch === '<' ? 'path'
        : ch === '{' ? 'dictionary'
          : word === 'true' || word === 'True' || word === 'false' || word === 'False'
            ? 'bool'
            : word === 'inf' || word === 'Inf' || word === 'INF' || word === 'nan' || word === 'NaN'
              ? 'double'
              : /[-+0-9.]/.test(ch) ? (/[.eE]/.test(c.src.slice(c.pos).match(/^[^\s,;)\]}]+/)?.[0] ?? '') ? 'double' : 'int')
                : word ? 'token' : undefined
  const valueStart = c.pos
  const raw = emptySymmetry?'':parseValue(c)
  const valueEnd = c.pos
  if (lexicalType !== 'dictionary') {
    const nested = nestedPathOffset(c.src.slice(valueStart, valueEnd))
    if (nested >= 0) throw new Error(`Expected list or tuple value item at ${valueStart + nested}`)
  }
  const registeredType = _sdfGetMetadataFieldType(key, specType)
  const schema = SdfSchema.getInstance()
  // The native metadata factory uses the registered fallback's type
  // (textParserHelpers.cpp:143-162). Standard fields have no plugin type name.
  const fallback = schema.isValidFieldForSpec(key, specType) ? schema.getFallback(key) : undefined
  const validationType = registeredType ?? (typeof fallback==='number'?'double':typeof fallback==='boolean'?'bool':typeof fallback==='string'?'string':undefined)
  // Dedicated PermissionMetadata/DisplayUnitMetadata/SymmetryFunctionMetadata
  // use identifiers; generic string/token metadata require quoted literals.
  if(typeof fallback==='string'&&!['permission','displayUnit','symmetryFunction'].includes(key)&&lexicalType!=='string')throw new Error(`Expected quoted value for metadata '${key}'`)
  if(key==='permission'&&!['public','private'].includes(String(raw)))throw new Error(`Invalid permission '${String(raw)}'`)
  if(key==='displayUnit'){
    // Native unit spellings: sdf/types.h:203-220.
    const units=['mm','cm','dm','m','km','in','ft','yd','mi','deg','rad','%','default']
    if(!units.includes(String(raw)))throw new Error(`Unknown display unit '${String(raw)}'`)
  }
  if(fallback&&typeof fallback==='object'&&!Array.isArray(fallback)){
    if('getAssetPath'in fallback){if(lexicalType!=='asset'&&lexicalType!=='string')throw new Error(`Expected asset for metadata '${key}'`)}
    else if(_sdfIsDictionary(fallback)&&!_sdfIsDictionary(raw))throw new Error(`Expected dictionary for metadata '${key}'`)
  }
  if (validationType) {
    try { validateTextValue(raw, validationType) }
    catch (error) { throw new Error(`Invalid value for metadata '${key}': ${String(error)}`) }
  }
  const value = registeredType?coerceTextValue(raw,registeredType):unwrapRawInt(raw)
  // Unknown root values preserve their source spelling, including shaped lists
  // of assets/paths. Native records these strings, while typed dictionaries
  // remain structured (OpenUSD 26.11.1 textParserHelpers.cpp:209-258).
  if (registeredType === undefined &&
      !schema.isValidFieldForSpec(key, specType) && lexicalType !== 'dictionary') {
    // A path value records no text (PathRef has no recording action), so the
    // field holds an empty SdfUnregisteredValue string and writes back as
    // `key = ` (textParserHelpers.cpp:249-255, prim and layer alike).
    const text = lexicalType === 'path' ? '' : (() => {
      const recorder = new Cursor(c.src.slice(0, valueEnd), c.sourceName)
      recorder.pos = valueStart
      return recordedValueText(recorder)
    })()
    return new SdfUnregisteredValue(text, 'unregistered')
  }
  return registeredType === undefined && lexicalType
    ? new SdfUnregisteredValue(value, lexicalType)
    : value
}

function parseDict(c: Cursor): Record<string, unknown> {
  c.need('{')
  const dict: Record<string, unknown> = {}
  const valueTypes = new Map<string, string>()
  while (!c.eof() && c.peek() !== '}') {
    c.ws()
    if (c.peek() === '}') break
    const typeName = c.peek()==='"'||c.peek()==="'"?c.string():c.word()
    if (!typeName) throw new Error(`Expected dictionary type at ${c.pos}`)
    c.ws()
    // check for [] array suffix
    const isArrayType = c.eat('[]')
    // DictionaryKey = String / BaseIdentifier (textFileFormatParser.h:524-526).
    c.ws()
    const isQuotedKey = c.peek() === '"' || c.peek() === "'"
    const key = isQuotedKey ? c.string() : c.ident()
    if (!key && !isQuotedKey) throw new Error(`Expected dictionary key at ${c.pos}`)
    c.need('=')
    {
      const raw = parseValue(c)
      const declaredType = isArrayType ? `${typeName}[]` : typeName
      // Nested dictionaries (no declared scalar/vec/matrix type) pass through;
      // typed entries get coerced to the declared Sdf type, like attributes.
      dict[key] = typeName === 'dictionary'
        ? raw
        : coerceTextValue(raw, declaredType)
      valueTypes.set(key, declaredType)
    }
    c.eat(';')
  }
  c.need('}')
  _sdfRecordDictionaryValueTypes(dict, valueTypes)
  return dict
}

// Parse a relocates map `{ <src>: <tgt>, ... }`. Realizes the dedicated
// relocates grammar in OpenUSD's text parser (textFileFormatParser.cpp:1238 —
// the RelocatesMetadata context: each entry is `<sourcePath>: <targetPath>`,
// NOT the typed `<type> <key> = <value>` of an ordinary dictionary). A `<>`
// (empty path) target is a relocate-to-none / delete, stored as the empty
// string so the layer-stack relocates machinery (Pcp_ComputeRelocations,
// _FilterRelocationsForPath) sees the source as a prohibited child with no
// target. Stored under the `layerRelocates` field, in authored order
// (SdfRelocates), the shape PcpLayerStack reads.
function parseRelocatesList(c: Cursor): [string, string][] {
  return parseRelocatesEntries(c).map(([src,tgt])=>[SdfPath.fromString(src).makeAbsolutePath(SdfPath.absoluteRootPath).pathString,tgt?SdfPath.fromString(tgt).makeAbsolutePath(SdfPath.absoluteRootPath).pathString:tgt])
}

function parseRelocatesEntries(c: Cursor): [string, string][] {
  const entries: [string, string][] = []
  c.need('{')
  while (!c.eof() && c.peek() !== '}') {
    c.ws()
    if (c.peek() === '}') break
    // RelocatesEntry requires both PathRef operands; only an explicitly
    // authored <> denotes deletion (textFileFormatParser.h:1348-1366).
    if (c.peek() !== '<') throw new Error(`Expected relocation source path at ${c.pos}`)
    const src = c.path()
    c.need(':')
    if (c.peek() !== '<') throw new Error(`Expected relocation target path at ${c.pos}`)
    const tgt = c.path()
    if(!SdfPath.isValidPathString(src)||tgt&&!SdfPath.isValidPathString(tgt))throw new Error('Invalid relocation path')
    const source=SdfPath.fromString(src),target=SdfPath.fromString(tgt)
    const allowed=SdfSchema.isValidRelocate([source,target]);if(!allowed.isAllowed())throw new Error(allowed.getWhyNot())
    entries.push([src,tgt])
    if(c.peek()!=='}')c.need(',')
  }
  c.need('}')
  return entries
}

function parseTimeSamples(c: Cursor): Record<string, unknown> {
  c.inlineGap();c.need('{')
  const samples: Record<string, unknown> = {}
  while (!c.eof() && c.peek() !== '}') {
    c.ws()
    if (c.peek() === '}') break
    // Read time value
    const time = c.number()
    c.need(':')
    const value = parseValue(c)
    samples[String(time)] = value
    c.eat(',')
  }
  c.need('}')
  return samples
}

// --- Prim parsing ---

// --- Prim metadata ( ... ) ---

// Mirrors SdfListOp's edit buckets, including deprecated added/ordered items.
interface TextListOp<T> {
  isExplicit: boolean
  explicitItems: T[]
  addedItems?: T[]
  prependedItems: T[]
  appendedItems: T[]
  deletedItems: T[]
  orderedItems: T[]
}

function emptyListOp<T>(): TextListOp<T> {
  return { isExplicit: false, explicitItems: [], prependedItems: [], appendedItems: [], deletedItems: [], orderedItems: [] }
}

function applyListOpQualifier<T>(lop: TextListOp<T>, qualifier: string, items: T[]): void {
  const clear = (): void => {
    lop.isExplicit = false
    lop.explicitItems.length = 0
    delete lop.addedItems
    lop.prependedItems.length = 0
    lop.appendedItems.length = 0
    lop.deletedItems.length = 0
    lop.orderedItems.length = 0
    delete (lop as TextListOp<T> & { _sdfExplicitEmpty?: boolean })._sdfExplicitEmpty
  }
  if (!qualifier) {
    clear()
    if (items.length > 0) { lop.isExplicit = true; lop.explicitItems.push(...items) }
    else Object.defineProperty(lop, '_sdfExplicitEmpty', {
      value: true, configurable: true, enumerable: false,
    })
    return
  }
  if (lop.isExplicit) clear()
  delete (lop as TextListOp<T> & { _sdfExplicitEmpty?: boolean })._sdfExplicitEmpty
  // SdfListOp::SetItems (listOp.cpp:354-374) replaces the qualifier's list,
  // so a later statement with the same qualifier wins.
  const replace = (list: T[]): void => { list.length = 0; list.push(...items) }
  if (qualifier === 'prepend') replace(lop.prependedItems)
  else if (qualifier === 'add') lop.addedItems = [...items]
  else if (qualifier === 'append') replace(lop.appendedItems)
  else if (qualifier === 'delete') replace(lop.deletedItems)
  else if (qualifier === 'reorder') replace(lop.orderedItems)
}

// _SetListOpItemsWithError (textParserHelpers.h:158-181): duplicate items
// in one list-op statement are a parse error.
function setListOpItemsWithError<T>(
  key: string, path: string, lop: TextListOp<T>, qualifier: string, items: T[],
): void {
  const seen = new Set<string>()
  for (const item of items) {
    const id = typeof item === 'string' ? item : JSON.stringify(item)
    if (seen.has(id)) throw new Error(`Duplicate items exist for field '${key}' at '${path}'`)
    seen.add(id)
  }
  applyListOpQualifier(lop, qualifier, items)
}

interface RefItem { assetPath:string;primPath:string;layerOffset:{offset:number;scale:number};customData?:Record<string,unknown> }

// @asset@</primPath> (offset = N; scale = M)  — every part optional except
// at least one of asset/primPath (bare </path> = internal reference).
function parseReferenceItem(c: Cursor): RefItem | null {
  c.ws()
  let assetPath = ''
  let primPath = ''
  // `<>` (an explicit but EMPTY prim path) is a distinct authored form from
  // omitting the `<...>` token entirely — it means "reference/payload this
  // layer stack's defaultPrim" (BasicPayload/BasicReference
  // PrimWith{Default,Internal}{Reference,Payload}Target2), NOT "no prim
  // path was authored at all". Both produce primPath === '', so track
  // whether the `<` branch fired at all to tell them apart.
  let hasPathToken = false
  if (c.peek() === '@') assetPath = c.asset()
  if (c.peek() === '<') {
    primPath = c.path()
    hasPathToken = true
  }
  const layerOffset = { offset: 0, scale: 1 }
  let customData:Record<string,unknown>|undefined
  if (c.peek() === '(') {
    c.need('(')
    while (!c.eof() && c.peek() !== ')') {
      const w = c.word()
      if (c.eat('=')) {
        if (w === 'offset' || w === 'scale') {
          const v = c.number()
          if (w === 'offset') layerOffset.offset = v
          else layerOffset.scale = v
        } else if(w==='customData'){const value=parseValue(c);if(!_sdfIsDictionary(value))throw new Error('Reference customData must be a dictionary');customData=value}
        else parseValue(c)
      }
      c.eat(';')
      c.eat(',')
    }
    c.need(')')
  }
  if(!assetPath&&!primPath&&!hasPathToken)throw new Error('Reference must provide an asset or prim path')
  const allowed=SdfSchema.isValidReference({primPath});if(!allowed.isAllowed())throw new Error(allowed.getWhyNot())
  return { assetPath, primPath, layerOffset,...(customData?{customData}:{}) }
}

// A list-op operand: None, a single item, or [item, item, ...]
function parseListOpItems<T>(c: Cursor, parseItem: (c: Cursor) => T | null): T[] {
  c.inlineGap()
  if (c.src.startsWith('None', c.pos) && !/[a-zA-Z0-9_]/.test(c.src[c.pos + 4] ?? '')) {
    c.pos += 4
    return []
  }
  if (c.peek() === '[') {
    c.need('[')
    const out: T[] = []
    while (!c.eof() && c.peek() !== ']') {
      const item = parseItem(c)
      if (item !== null) out.push(item)
      if (!c.eat(',')) break
    }
    c.need(']')
    return out
  }
  const item = parseItem(c)
  return item === null ? [] : [item]
}

// textFileFormatParser.yy's generic metadata list-edit production accepts
// only None or an array. Typed composition arcs have their own productions
// above and may accept a single reference/payload item.
function parseGenericListOpItems(c: Cursor, path: string): unknown[] {
  c.ws()
  if (c.src.startsWith('None', c.pos) && !/[a-zA-Z0-9_]/.test(c.src[c.pos + 4] ?? '')) {
    c.pos += 4
    return []
  }
  if (c.peek() !== '[') c.expectedListOperand(path)
  const value = unwrapRawInt(parseValue(c))
  return Array.isArray(value) ? value : []
}

const LIST_EDIT_QUALIFIERS = new Set(['prepend', 'append', 'add', 'delete', 'reorder'])

// NameList = String / '[' ListOf<String> ']' (textFileFormatParser.h:736-746):
// at least one string; a trailing separator is allowed (ListOf, :270-274).
function parseNameList(c: Cursor): string[] {
  const next = c.peek()
  if (next === '"' || next === "'") return [c.string()]
  const fail = (): never => {
    throw new Error(`Expected string or list of strings enclosed in [] separated by , at ${c.pos}`)
  }
  if (!c.eat('[')) fail()
  const names: string[] = []
  do {
    if (names.length > 0 && c.peek() === ']') break
    const quote = c.peek()
    if (quote !== '"' && quote !== "'") fail()
    names.push(c.string())
  } while (c.eat(','))
  c.need(']')
  return names
}

// textParserHelpers.cpp:209-292 retains an unknown non-explicit list as
// one raw interior string per bucket. An explicit value wins over later edits.
function unregisteredListOp(c:Cursor,key:string,specType:'layer'|'prim'|'attribute'|'relationship',qualifier:string,fields:Record<string,unknown>,path:string):boolean {
 if(specType==='prim'&&['variantSets','inherits','specializes','variants','apiSchemas','clipSets'].includes(key))return false
 if(!qualifier||_sdfGetMetadataFieldType(key,specType)!==undefined||SdfSchema.getInstance().isValidFieldForSpec(key,specType))return false
 c.need('=');c.inlineGap();const start=c.pos
 if(c.peek()!=='['&&!c.src.startsWith('None',c.pos))c.expectedListOperand(path)
 const value=parseValue(c),text=c.src.slice(start,c.pos).trim(),previous=fields[key]
 const nested=nestedPathOffset(text);if(nested>=0)throw new Error(`Expected list value item at ${start+nested}`)
 if(previous!==undefined&&!(previous instanceof SdfUnregisteredValue&&previous.typeName==='unregisteredListOp'))return true
 const op=(previous instanceof SdfUnregisteredValue?previous.value:emptyListOp<string>()) as TextListOp<string>
 applyListOpQualifier(op,qualifier,value===null?[]:[text.startsWith('[')?text.slice(1,-1):text])
 fields[key]=new SdfUnregisteredValue(op,'unregisteredListOp');return true
}

// Native textParserHelpers.cpp:164-292 applies each registered list-op
// operand using its element factory, including lossless int64/uint64 values.
function registeredListOp(c:Cursor,key:string,specType:'layer'|'prim'|'attribute'|'relationship',qualifier:string,fields:Record<string,unknown>):boolean {
 const type=_sdfGetMetadataFieldType(key,specType),match=type?.match(/^(int64|uint64|int|uint|string|token)listop$/)
 if(!match)return false
 c.need('=');c.inlineGap();const raw=parseValue(c)
 if(raw!==null&&!Array.isArray(raw))throw new Error('List-op metadata requires None or an array')
 const items=(raw??[] as unknown[]) as unknown[]
 const values=items.map(value=>coerceTextValue(value,match[1]!))
 const op=(fields[key]??=emptyListOp<unknown>()) as TextListOp<unknown>
 applyListOpQualifier(op,qualifier,values)
 return true
}

// Parses the ( ... ) prim metadata block into composition fields shaped
// exactly like the USDC parser's output (the composition engine consumes
// one shape): references/payload as Reference ListOps, inherits/specializes
// as path ListOps, variantSets -> variantSetChildren + variantSetNames,
// variants -> variantSelection {name: value}, plus scalar metadata.
function parsePrimMetadata(c: Cursor, primPath: string, scene: Scene): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  c.need('(')
  while (!c.eof() && c.peek() !== ')') {
    // A bare string in prim metadata authors SdfFieldKeys->Comment.
    if (c.peek() === '"' || c.peek() === "'") {
      fields.comment = c.string(); c.eat(';'); continue
    }

    let qualifier = ''
    c.ws()
    const keyPos = c.pos
    let key = c.ident()
    if (LIST_EDIT_QUALIFIERS.has(key)) {
      qualifier = key
      key = c.ident()
    }
    if (!key) throw new Error(`Expected metadata key at ${c.pos}`)
    // `relocates` is a keyword of the layer metadata grammar only
    // (LayerMetadataItem, textFileFormatParser.h:1631-1634); prim metadata
    // has no relocates item, so the native parser fails at the keyword.
    if (key === 'relocates') c.expectedAt(')', keyPos, primPath)

    if(unregisteredListOp(c,key,'prim',qualifier,fields,primPath)||registeredListOp(c,key,'prim',qualifier,fields)){}
    else if (key === 'references' || key === 'payload') {
      c.need('=')
      const items = parseListOpItems(c, parseReferenceItem)
      if(qualifier&&items.length===0)throw new Error('Empty reference or payload list edit is invalid')
      const lop = (fields[key] ??= emptyListOp<RefItem>()) as TextListOp<RefItem>
      setListOpItemsWithError(key, primPath, lop, qualifier, items)
    } else if (key === 'inherits' || key === 'specializes') {
      c.need('=')
      const items = parseListOpItems(c, cc => {
        if (cc.peek() !== '<') return null
        const target=resolveRelationshipTarget(primPath,cc.path()),allowed=key==='inherits'?SdfSchema.isValidInheritPath(SdfPath.fromString(target)):SdfSchema.isValidSpecializesPath(SdfPath.fromString(target));if(!allowed.isAllowed())throw new Error(allowed.getWhyNot());return target
      })
      const fieldName = key === 'inherits' ? 'inheritPaths' : 'specializes'
      if(qualifier&&items.length===0)throw new Error('Empty path list edit is invalid')
      const lop = (fields[fieldName] ??= emptyListOp<string>()) as TextListOp<string>
      setListOpItemsWithError(fieldName, primPath, lop, qualifier, items)
    } else if (key === 'variantSets') {
      // VariantSetsMetadata (textFileFormatParser.h:1374-1385).
      c.need('=')
      const names = parseNameList(c)
      const lop = (fields['variantSetNames'] ??= emptyListOp<string>()) as TextListOp<string>
      setListOpItemsWithError('variantSetNames', primPath, lop, qualifier, names)
      // Explicit and added variant sets create the variant set specs
      // (textFileFormatParser.cpp:1594-1608).
      if (qualifier === '' || qualifier === 'add') {
        for (const name of names) {
          const variantSetPath = `${primPath}{${name}=}`
          if (!scene[variantSetPath]) addSpec(scene, variantSetPath, {})
        }
        fields['variantSetChildren'] = [...names]
      }
    } else if (key === 'variants') {
      // VariantsMetadata = variants Assignment DictionaryValue
      // (textFileFormatParser.h:1368-1372): a typed dictionary whose values
      // must all be strings that are valid variant selections, merged into
      // any earlier selections (textFileFormatParser.cpp:4178-4232).
      c.need('=')
      const sel = (fields['variantSelection'] as Record<string, string> | undefined) ?? {}
      const dict = parseDict(c)
      const valueTypes = _sdfGetDictionaryValueTypes(dict)
      for (const [vsName, selected] of Object.entries(dict)) {
        if (typeof selected !== 'string' || valueTypes?.get(vsName) !== 'string') {
          throw new Error('variant name must be a string')
        }
        const allowed = SdfSchema.isValidVariantSelection(selected)
        if (!allowed.isAllowed()) throw new Error(allowed.getWhyNot())
        sel[vsName] = selected
      }
      fields['variantSelection'] = sel
    } else if (key === 'apiSchemas' || key === 'clipSets') {
      // Both are SdfStringListOp metadata (clipSets:
      // pxr/usd/usd/clipsAPI.h) — a qualifier-only edit such as
      // `delete clipSets = [...]` must survive as a list operation.
      c.need('=')
      const v = parseValue(c)
      const items = typeof v === 'string' ? [v]
        : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string')
        : []
      const lop = (fields[key] ??= emptyListOp<string>()) as TextListOp<string>
      applyListOpQualifier(lop, qualifier, items)
    } else if(key==='prefixSubstitutions'||key==='suffixSubstitutions'){c.need('=');fields[key]=parseStringMap(c)}
    else {
      // Scalar/dict metadata: active, kind, instanceable, customData,
      // assetInfo, doc, hidden, ... — store under the key as-is (untyped, so
      // collapse any RawInt carrier to a plain number). The `doc` keyword
      // authors SdfFieldKeys->Documentation.
      if (key === 'doc') key = 'documentation'
      if (c.eat('=')) {
        const value = qualifier
          ? parseGenericListOpItems(c, primPath)
          : parseMetadataValue(c, key, 'prim')
        if (qualifier) {
          const lop = (fields[key] ??= emptyListOp<unknown>()) as TextListOp<unknown>
          applyListOpQualifier(lop, qualifier, value as unknown[])
        } else {
          fields[key] = value
        }
      }
    }
    c.statementEnd(false,')')
  }
  c.need(')')
  return fields
}

// OpenUSD 26.11.1 textFileFormatParser.h:StringDictionaryItem and
// schema.cpp prefix/suffix validators: both operands are quoted strings.
function parseStringMap(c:Cursor):Record<string,string>{
 const result:Record<string,string>={};c.need('{')
 while(c.peek()!=='}'){
  const key=c.string();if(!key)throw new Error('Substitution key must not be empty')
  c.need(':');result[key]=c.string();if(c.peek()!=='}')c.need(',')
 }
 c.need('}');return result
}

// The variant set names the metadata created specs for, removed from the
// metadata fields so the variant set statements can add to them.
function takeVariantSetChildren(metaFields: Record<string, unknown>): string[] {
  const names = (metaFields['variantSetChildren'] as string[] | undefined) ?? []
  delete metaFields['variantSetChildren']
  return names
}

function parsePrimSpec(c: Cursor, scene: Scene, parentPath: string, parentPrimChildren: string[]): void {
  const specifier = c.word() // def, over, class
  c.inlineGap()

  // Optional typeName (present if next non-WS char is not a quote)
  c.ws()
  let typeName = ''
  if (c.peek() !== '"' && c.peek() !== "'") {
    typeName = c.word()
    c.ws()
  }

  c.inlineGap()
  const name = c.string()
  if(!SdfSchema.isValidIdentifier(name).isAllowed())throw new Error(`Invalid prim name '${name}'`)
  if(parentPrimChildren.includes(name))throw new Error(`Duplicate prim '${name}'`)
  const path = parentPath === '/' ? `/${name}`
    : `${parentPath}${parentPath.endsWith('}') ? '' : '/'}${name}`

  // Optional prim metadata (...) — composition arcs and scalar metadata
  let metaFields: Record<string, unknown> = {}
  if (c.peek() === '(') metaFields = parsePrimMetadata(c, path, scene)

  const primChildren: string[] = []
  const propChildren: string[] = []
  const declaredProperties = new Set<string>()
  const variantSetChildren = takeVariantSetChildren(metaFields)
  const order: OrderFields = {}

  c.need('{')

  while (!c.eof() && c.peek() !== '}') {
    const block=['def','over','class','variantSet'].includes(c.peekWord())
    parsePrimBodyItem(
      c, scene, path, primChildren, propChildren, order, variantSetChildren,
      declaredProperties)
    c.statementEnd(block)
  }
  c.need('}')

    // Build prim spec
  const fields: Record<string, unknown> = { specifier, ...metaFields }
  if (typeName) fields.typeName = typeName
  if (primChildren.length > 0) fields.primChildren = primChildren
  if (propChildren.length > 0) fields.properties = propChildren
  if (variantSetChildren.length > 0) fields.variantSetChildren = variantSetChildren
  // reorder nameChildren / reorder properties — the deprecated PrimOrder /
  // PropertyOrder fields (schema.cpp: SdfFieldKeys->PrimOrder/PropertyOrder),
  // emitted by Sdf_WritePrimNamespaceReorders.
  if (order.primOrder) fields.primOrder = order.primOrder
  if (order.propertyOrder) fields.propertyOrder = order.propertyOrder

  addSpec(scene, path, fields)
  parentPrimChildren.push(name)
}

interface OrderFields {
  primOrder?: string[]
  propertyOrder?: string[]
}

function parsePrimBodyItem(
  c: Cursor, scene: Scene, primPath: string,
  primChildren: string[], propChildren: string[],
  order: OrderFields = {}, variantSetChildren: string[] = [],
  declaredProperties: Set<string> = new Set(),
): void {
  c.ws()
  const ch = c.peek()
  if (!ch || ch === '}') return

  // String comments inside prim body
  if (ch === '"' || ch === "'") { c.string(); return }

  // Semicolons
  if (ch === ';') { c.pos++; return }

  // --- Collect qualifiers ---
  let isCustom = false
  let variability = ''

  let w = c.peekWord()

  // reorder nameChildren = [...]  /  reorder properties = [...]
  // (ChildOrPropertyOrderStatement). Captured into PrimOrder / PropertyOrder.
  if (w === 'reorder'&&['nameChildren','properties'].includes(c.secondWord())) {
    c.word()                              // consume 'reorder'
    const what = c.word()                 // 'nameChildren' or 'properties'
    if (what !== 'nameChildren' && what !== 'properties') {
      throw new Error(`reorder must target nameChildren or properties at ${c.pos}, got '${what}'`)
    }
    // ChildOrPropertyOrderStatement (textFileFormatParser.h:1509-1521).
    c.need('=')
    const names = parseNameList(c)
    if (what === 'nameChildren') order.primOrder = names
    else order.propertyOrder = names
    return
  }

  let listQualifier = ''
  if (LIST_EDIT_QUALIFIERS.has(w)) {
    listQualifier = c.word()
    w = c.peekWord()
  }

  if (w === 'custom') { c.word(); isCustom = true; w = c.peekWord() }
  // AttributeVariability = config / uniform; legacy 'config' reads as
  // uniform (textFileFormatParser.h:1025-1028, .cpp:2272-2282).
  if (w === 'uniform' || w === 'config') { c.word(); variability = 'uniform'; w = c.peekWord() }
  else if (w === 'varying') { c.word(); variability = 'varying'; w = c.peekWord() }

  // Sub-prim
  if (w === 'def' || w === 'over' || w === 'class') {
    parsePrimSpec(c, scene, primPath, primChildren)
    return
  }

  // variantSet definition: the variants' bodies parse at canonical SdfPath
  // variant-spec keys. OpenUSD v26.08 SdfPath::AppendVariantSelection
  // (pxr/usd/sdf/path.cpp:986-1003) adds no child delimiter around the
  // variant-selection element.
  if (w === 'variantSet') {
    c.word()          // consume 'variantSet'
    const vsName = c.string()
    c.eat('=')
    parseVariantSetBlock(c, scene, primPath, vsName)
    if (!variantSetChildren.includes(vsName)) variantSetChildren.push(vsName)
    return
  }

  // Relation
  if (w === 'rel') {
    c.word()
    const propName = c.ident()
    if (!propName) return
    // Optional .kind
    let relKind=''
    if(c.peekSameLine()==='.'){c.pos++;relKind=c.word();if(relKind!=='default')throw new Error(`Unknown relationship suffix '${relKind}'`)}
    // Optional = value: a single <path> or [<path>, ...]
    let targets: string[] | undefined
    let hasTargetEdit = listQualifier !== ''
    if (c.peekSameLine() === '=') {
      c.pos++
      hasTargetEdit = true
      const value = parseValue(c)
      if (typeof value === 'string') targets = [value]
      else if (Array.isArray(value)) targets = value.filter((v): v is string => typeof v === 'string')
      else targets = []
    }
    // Optional metadata — relationships carry the same scalar/dict metadata
    // subset attributes do (displayGroup, customData, arbitrary registered
    // fields, …); stored as plain fields, structural fields winning on
    // collision (matches the attribute path below).
    const relPath = `${primPath}.${propName}`
    let relMeta: Record<string, unknown> = {}
    if (c.peekSameLine() === '(') relMeta = parseAttrMetadata(c, 'relationship', relPath)
    const fields: Record<string, unknown> = {}
    const existing = scene[relPath]
    if (existing) {
      for (const [key, field] of Object.entries(existing.fields)) fields[key] = field.valueTypeName?new SdfUnregisteredValue(field.value,field.valueTypeName):field.value
    }
    // _CreateRelationshipSpec (textParserHelpers.cpp:332-372): relationships
    // are uniform unless declared varying; custom is authored only when true.
    Object.assign(fields, {
      ...relMeta,
      variability: variability || 'uniform',
      ...(isCustom ? { custom: true } : {}),
    })
    if(relKind==='default'&&targets?.length){fields.default=SdfPath.fromString(targets[0]!)}
    else if (hasTargetEdit && targets !== undefined) {
      // RelationshipAssignmentOptional (textFileFormatParser.cpp:3336-3470).
      const resolved = targets.filter(Boolean).map(target => resolveRelationshipTarget(primPath, target))
      for(const target of resolved){const allowed=SdfSchema.isValidRelationshipTargetPath(SdfPath.fromString(target));if(!allowed.isAllowed())throw new Error(allowed.getWhyNot())}
      if(new Set(resolved).size!==resolved.length)throw new Error('Duplicate relationship targets')
      if (resolved.length === 0 && listQualifier !== '') {
        throw new Error('Setting relationship targets to None (or empty list) is only allowed ' +
          'when setting explicit targets, not for list editing')
      }
      // Explicit and added targets initialize relationship target specs.
      if (listQualifier === '' || listQualifier === 'add') {
        const children = [...((fields.targetChildren as string[] | undefined) ?? [])]
        for (const target of resolved) {
          const targetPath = `${relPath}[${target}]`
          if (scene[targetPath]) continue
          addSpec(scene, targetPath, {}, 'relationshipTarget')
          children.push(target)
        }
        if (children.length > 0) fields.targetChildren = children
      }
      const op = (fields.targetPaths && typeof fields.targetPaths === 'object'
        ? fields.targetPaths : emptyListOp<string>()) as TextListOp<string>
      applyListOpQualifier(op, listQualifier, resolved)
      fields.targetPaths = op
    }
    addSpec(scene, relPath, fields, 'relationship')
    declaredProperties.add(propName)
    if (!propChildren.includes(propName)) propChildren.push(propName)
    return
  }

  // Attribute: [typeName] propName [.kind] [= value] [(meta)]
  // A prim body item must be a prim, relation, variantSet, reorder, comment,
  // or an attribute declaration — anything else is malformed.
  if (!w) {
    throw new Error(`Expected prim or property declaration at ${c.pos}, got: '${c.src.slice(c.pos, c.pos + 30)}'`)
  }

  // First word is the type name
  const typeName = c.ident()
  if (!typeName) {
    throw new Error(`Expected type name at ${c.pos}, got: '${c.src.slice(c.pos, c.pos + 30)}'`)
  }

  // Optional [] array suffix on type
  c.ws()
  let isArrayType = false
  if (c.peek() === '[' && c.at(1) === ']') { c.pos += 2; isArrayType = true }

  // Property name (allows colon namespacing, stops at . and [)
  c.ws()
  c.inlineGap()
  const propName = c.ident()
  if (!propName) {
    if(listQualifier==='reorder')throw new Error(`reorder must target nameChildren or properties, or a typed property at ${c.pos}`)
    throw new Error(`Expected property name after type '${typeName}' at ${c.pos}`)
  }

  // Optional .kind (timeSamples, connect, spline)
  c.ws()
  let kind = ''
  if (c.peek() === '.') {
    c.pos++
    kind = c.word()
    if (!['timeSamples', 'connect', 'spline'].includes(kind)) {
      throw new Error(`Unknown attribute suffix '${kind}' at ${c.pos}`)
    }
  }
  // After a list-op keyword, an attribute must be a connection list op:
  // AttributeDeclaration '.' connect Assignment ConnectValue
  // (textFileFormatParser.h:1492-1521).
  if (listQualifier && (kind !== 'connect' || c.peek() !== '=')) {
    throw new Error(`'${listQualifier}' must be followed by a relationship or an attribute connection at ${c.pos}`)
  }

  // Optional = value
  let value: unknown = undefined,valueStart=-1,valueEnd=-1
  if (c.peek() === '=') {
    c.inlineGap();c.pos++
    c.inlineGap();valueStart=c.pos
    if (kind === 'spline') {
      // SplineValue is a committed grammar production: malformed input must
      // fail the layer read, never disappear from the authored attribute.
      // OpenUSD 26.11.1 textFileFormatParser.h:996-1000.
      value = parseSpline(c, isArrayType ? `${typeName}[]` : typeName)
    } else if (kind === 'timeSamples') {
      value = parseTimeSamples(c)
      // An attribute of unrecognized type only records the string of the
      // first value it produces: _CreateAttributeSpec starts recording
      // (textFileFormatParser.cpp:1052-1054) and Sdf_ParserValueContext::
      // ProduceValue clears it (parserValueContext.cpp:71-95, 101-129), so
      // a later non-None sample has no value factory and fails
      // ("Unrecognized type name", or tuple/list shape errors). None
      // samples produce no value (textFileFormatParser.cpp:140-175).
      const declared = isArrayType ? `${typeName}[]` : typeName
      if (!findValueTypeName(sdfCanonicalTextTypeName(declared)) &&
          Object.values(value as Record<string, unknown>).filter(sample => sample !== null).length > 1) {
        throw new Error(`Unrecognized type name '${declared}'`)
      }
    } else {
      value = parseValue(c)
    }
    valueEnd=c.pos
  }

  // Optional attribute metadata — e.g. (interpolation = "vertex", elementSize = 2,
  // customData = {...}). Attributes carry no composition arcs, so this is the
  // scalar/dict subset of prim metadata.
  const attrPath = `${primPath}.${propName}`
  let attrMeta: Record<string, unknown> = {}
  if (c.peekSameLine() === '(') attrMeta = parseAttrMetadata(c, 'attribute', attrPath)

  // Build attribute spec — metadata first so structural fields win on collision.
  // _CreateAttributeSpec (textParserHelpers.cpp:374-480) authors custom (false
  // for a new spec), the type name and the variability (varying by default).
  const fullTypeName = isArrayType ? `${typeName}[]` : typeName
  const previous=scene[attrPath]?.fields
  if(previous?.typeName&&previous.typeName.value!==fullTypeName)throw new Error(`Attribute '${attrPath}' cannot change type`)
  if(previous?.variability&&previous.variability.value!==(variability||'varying'))throw new Error(`Attribute '${attrPath}' cannot change variability`)
  const attrFields: Record<string, unknown> = {
    ...(scene[attrPath] ? {} : { custom: false }),
    ...attrMeta,
    typeName: fullTypeName,
    variability: variability || 'varying',
  }
  if (isCustom) attrFields.custom = true

  if (kind === 'timeSamples' && value !== undefined) {
    // Coerce each time-sample value against the declared type (the parse/flatten
    // boundary normalization — same shape the crate reader emits).
    if (value && typeof value === 'object') {
      const coerced: Record<string, unknown> = {}
      for (const [t, sv] of Object.entries(value as Record<string, unknown>)) {
        coerced[t] = sv === null ? new SdfValueBlock() : coerceTextValue(sv, fullTypeName)
      }
      attrFields.timeSamples = coerced
    } else {
      attrFields.timeSamples = value
    }
  } else if (kind === 'spline') {
    if (value instanceof TsSpline) attrFields.spline = value
  } else if (kind === 'connect') {
    // ConnectValue (textFileFormatParser.cpp:3170-3245).
    const connectionPaths = (Array.isArray(value) ? value : [value])
      .filter((path): path is string => typeof path === 'string')
      .map(path => resolveConnectionPath(primPath, path))
    if (connectionPaths.length === 0 && listQualifier !== '') {
      throw new Error('Setting connection paths to None (or an empty list) is only allowed ' +
        'when setting explicit connection paths, not for list editing')
    }
    // Explicit and added connections initialize connection specs.
    if (listQualifier === '' || listQualifier === 'add') {
      for (const path of connectionPaths) {
        const connectionPath = `${attrPath}[${path}]`
        if (!scene[connectionPath]) addSpec(scene, connectionPath, {}, 'connection')
      }
      attrFields.connectionChildren = connectionPaths
    }
    const prior = scene[attrPath]?.fields['connectionPaths']?.value
    const op = (prior && typeof prior === 'object' ? prior : emptyListOp<string>()) as TextListOp<string>
    setListOpItemsWithError('connectionPaths', attrPath, op, listQualifier, connectionPaths)
    attrFields.connectionPaths = op
  } else if (kind === '' && value !== undefined) {
    // Coerce the default value to its declared Sdf type at the flatten boundary.
    attrFields.default = value === null ? new SdfValueBlock()
      : value === 'AnimationBlock' ? new SdfAnimationBlock()
      : !findValueTypeName(sdfCanonicalTextTypeName(fullTypeName))?new SdfUnregisteredValue(c.src.slice(valueStart,valueEnd),'unregistered'):anchorPathExpressionDefault(coerceTextValue(value, fullTypeName), primPath, fullTypeName)
  }

  // Merge into existing spec if already present (from a prior .timeSamples or .connect line)
  if (scene[attrPath]) {
    const existing = scene[attrPath]
    const merged: Record<string, unknown> = {}
    for (const [key,field] of Object.entries(existing.fields))merged[key]=field.valueTypeName?new SdfUnregisteredValue(field.value,field.valueTypeName):field.value
    Object.assign(merged, attrFields)
    addSpec(scene, attrPath, merged)
  } else {
    addSpec(scene, attrPath, attrFields)
  }

  if (!propChildren.includes(propName)) propChildren.push(propName)
  if (kind === '') declaredProperties.add(propName)
}

// Parses an attribute's ( ... ) metadata block into scalar/dict fields
// (interpolation, elementSize, customData, doc, hidden, …). Attributes have no
// composition arcs (references/variants/etc.), so this is the scalar subset of
// parsePrimMetadata — stored as plain fields, matching the USDC parser's output
// so composition + getField() consume one shape.
function parseAttrMetadata(
  c: Cursor, specType: 'attribute' | 'relationship', specPath: string,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  c.need('(')
  while (!c.eof() && c.peek() !== ')') {
    // Documentation string (bare "...") — skip.
    if (c.peek() === '"' || c.peek() === "'") {
      fields.comment = c.string(); c.eat(';'); continue
    }
    let qualifier = ''
    let key = c.ident()
    if (LIST_EDIT_QUALIFIERS.has(key)) {
      qualifier = key
      key = c.ident()
    }
    if (!key) throw new Error(`Expected metadata key at ${c.pos}`)
    // The `doc` keyword authors SdfFieldKeys->Documentation.
    if (key === 'doc') key = 'documentation'
    if(unregisteredListOp(c,key,specType,qualifier,fields,specPath)||registeredListOp(c,key,specType,qualifier,fields)){}
    else if (c.eat('=')) {
      const value = qualifier
        ? parseGenericListOpItems(c, specPath)
        : parseMetadataValue(c, key, specType)
      if (qualifier) {
        const op = (fields[key]??emptyListOp<unknown>()) as TextListOp<unknown>
        applyListOpQualifier(op, qualifier, value as unknown[])
        fields[key] = op
      } else fields[key] = value
    }
    c.statementEnd(false,')')
  }
  c.need(')')
  return fields
}

// TextParserAction<PathRef> (textFileFormatParser.cpp:1075-1210): target,
// inherit and specializes paths expand relative to the containing prim path;
// connection paths also strip variant selections.
function resolveRelationshipTarget(primPath: string, target: string): string {
  const path = SdfPath.fromString(target)
  if (path.isEmpty() || path.isAbsolutePath()) return target
  return path.makeAbsolutePath(SdfPath.fromString(primPath).getPrimPath()).pathString
}

function resolveConnectionPath(primPath: string, target: string): string {
  const path = SdfPath.fromString(target)
  const allowed=SdfSchema.isValidAttributeConnectionPath(path.isAbsolutePath()?path:path.makeAbsolutePath(SdfPath.fromString(primPath).getPrimPath()));if(!allowed.isAllowed())throw new Error(allowed.getWhyNot())
  if (path.isEmpty()) return target
  return path.makeAbsolutePath(SdfPath.fromString(primPath).getPrimPath())
    .stripAllVariantSelections().pathString
}

// --- Layer parsing ---

// variantSet "name" = { "variantA" (meta?) { ...prim body... } "variantB" { ... } }
function parseVariantSetBlock(c: Cursor, scene: Scene, primPath: string, vsName: string): void {
  c.need('{')
  const variantNames: string[] = []
  while (!c.eof() && c.peek() !== '}') {
    if (c.peek() !== '"' && c.peek() !== "'") throw new Error(`Expected variant name at ${c.pos}`)
    const variantName = c.string()
    const allowed=SdfSchema.isValidVariantIdentifier(variantName);if(!allowed.isAllowed())throw new Error(allowed.getWhyNot())
    variantNames.push(variantName)

    const variantPath = `${primPath}{${vsName}=${variantName}}`
    let metaFields: Record<string, unknown> = {}
    if (c.peek() === '(') metaFields = parsePrimMetadata(c, variantPath, scene)
    const primChildren: string[] = []
    const propChildren: string[] = []
    const declaredProperties = new Set<string>()
    const nestedVariantSetChildren = takeVariantSetChildren(metaFields)
    const order: OrderFields = {}
    c.need('{')
    while (!c.eof() && c.peek() !== '}') {
      const block=['def','over','class','variantSet'].includes(c.peekWord())
      parsePrimBodyItem(
        c, scene, variantPath, primChildren, propChildren, order,
        nestedVariantSetChildren, declaredProperties)
      c.statementEnd(block)
    }
    c.need('}')

    const fields: Record<string, unknown> = { ...metaFields }
    if (primChildren.length > 0) fields['primChildren'] = primChildren
    if (propChildren.length > 0) fields['properties'] = propChildren
    if (nestedVariantSetChildren.length > 0) fields['variantSetChildren'] = nestedVariantSetChildren
    if (order.primOrder) fields['primOrder'] = order.primOrder
    if (order.propertyOrder) fields['propertyOrder'] = order.propertyOrder
    addSpec(scene, variantPath, fields)
  }
  c.need('}')

  // The {vsName=} spec lists the available variants
  addSpec(scene, `${primPath}{${vsName}=}`, { variantChildren: variantNames })
}

function parseLayerMeta(c: Cursor): Record<string, unknown> {
  c.need('(')
  const meta: Record<string, unknown> = {}
  while (!c.eof() && c.peek() !== ')') {
    c.ws()
    if (c.peek() === ')') break

    // A bare string in layer metadata authors SdfFieldKeys->Comment.
    if (c.peek() === '"' || c.peek() === "'") {
      meta.comment = c.string()
      c.eat(';')
      continue
    }

    // Keep the qualifier until the field's registration is known. Unknown
    // list edits must not turn into explicit assignments on export.
    const w = c.peekWord()
    const listQualifier = LIST_EDIT_QUALIFIERS.has(w) ? c.word() : ''

    const key = c.ident()
    if (!key) throw new Error(`Expected layer metadata key at ${c.pos}`)

    if(unregisteredListOp(c,key,'layer',listQualifier,meta,'/')||registeredListOp(c,key,'layer',listQualifier,meta)){}
    else if (listQualifier) {
      // Only GeneralListOpMetadata takes a list-op keyword in layer metadata
      // (textFileFormatParser.h:698-705); keyword fields (subLayers,
      // relocates) and registered non-list-op fields fail the read.
      throw new Error(`'${listQualifier}' is not valid for layer metadata '${key}' at ${c.pos}`)
    }
    else if (key === 'subLayers' && c.eat('=')) {
      // subLayers = [@a.usda@ (offset = 10; scale = 2), @b.usda@]
      // — per-entry layer-offset clauses land in subLayerOffsets.
      const paths: string[] = []
      const offsets: { offset: number; scale: number }[] = []
      c.need('[')
      while (!c.eof() && c.peek() !== ']') {
        if (c.peek() !== '@') throw new Error(`Expected sublayer asset path at ${c.pos}`)
        paths.push(c.asset())
        const off = { offset: 0, scale: 1 }
        if (c.peek() === '(') {
          c.need('(')
          while (!c.eof() && c.peek() !== ')') {
            const ow = c.word()
            if (c.eat('=')) {
              const v = c.number()
              if (ow === 'offset') off.offset = v
              else if (ow === 'scale') off.scale = v
            }
            c.eat(';')
            c.eat(',')
          }
          c.need(')')
        }
        offsets.push(off)
        c.eat(',')
      }
      c.need(']')
      // Both fields are set for a non-empty sublayer list
      // (TextParserAction<SublayerListClose>, textFileFormatParser.cpp:4625-4645).
      if (paths.length > 0) {
        meta['subLayers'] = paths
        meta['subLayerOffsets'] = offsets
      }
    } else if (key === 'relocates' && c.eat('=')) {
      // Layer-level relocates use the dedicated `{ <src>: <tgt> }` grammar, not
      // the typed dictionary form parseValue expects, stored under the
      // `layerRelocates` field (TextParserAction<RelocatesMapClose>,
      // textFileFormatParser.cpp:3728-3758); PcpLayerStack reads it.
      meta['layerRelocates'] = parseRelocatesList(c)
    } else if (c.eat('=')) {
      const field = key === 'doc' ? 'documentation' : key
      // Metadata parse failures abort the read (OpenUSD 26.11.1
      // textFileFormatParser.h MetadataBlock / LayerMetadata).
      meta[field] = parseMetadataValue(c, field, 'layer')
      // OpenUSD 26.11.1 textParserHelpers.cpp:175-202 generic metadata validation
      // calls the registered schema value validator before authoring the field.
      // Invalid registered values fail the read.
      const parsed = meta[field]
      const value = parsed instanceof SdfUnregisteredValue ? parsed.value : parsed
      const schema = SdfSchema.getInstance()
      const definition = schema.getSpecDefinition('pseudoRoot')?.isMetadataField(field)
        ? schema.getFieldDefinition(field) : undefined
      const allowed = definition?.isValidValue(value)
      if (allowed && !allowed.isAllowed()) {
        throw new Error(`invalid value for field "${field}": ${allowed.getWhyNot()}`)
      }
    }
    c.statementEnd(false,')')
  }
  c.need(')')
  return meta
}

// --- Main entry point ---

/** @internal Sdf_ParseValueFromString (textParserUtils.cpp:16-27,
 * textFileFormatParser.cpp:4643-4713): `input` parsed as one TypedValue of
 * the value type `typeName` filling the whole input, or undefined (an empty
 * VtValue) when it does not parse or the value does not fit the type. */
export function sdfParseValueFromString(input: string, typeName: string): unknown {
  if (!findValueTypeName(sdfCanonicalTextTypeName(typeName))) return undefined
  const c = new Cursor(input)
  // must<TypedValue, eof>: nothing before or after the value.
  if (c.eof() || /\s/.test(c.at())) return undefined
  try {
    const raw = parseValue(c)
    if (!c.eof() || raw === null || raw === undefined) return undefined
    return coerceTextValue(raw, typeName)
  } catch {
    return undefined
  }
}

export function parseUsda(src: string, sourceName = '', metadataOnly = false): Scene {
  if(src.charCodeAt(0)===0xfeff)throw new Error('Asset starts with UTF-8 BOM which is not supported, please convert the file to UTF-8 without the BOM')
  // Sdf registers metadata from discovered plugins before constructing text
  // value factories (OpenUSD 26.11.1 schema.cpp:1699-1852).
  _sdfRegisterPluginFields()
  const c = new Cursor(src, sourceName)
  const scene: Scene = {}

  // Parse header: #usda 1.0[...]
  // Skip only blank lines/spaces — NOT # comments, since the header IS a # line
  while (!c.eof() && (c.at() === ' ' || c.at() === '\t' || c.at() === '\r' || c.at() === '\n')) c.pos++
  // The legacy `#sdf 1.4.32` cookie is rewritten only for string imports,
  // before parsing (SdfUsdaFileFormat::ReadFromString, usdaFileFormat.cpp:
  // 565-600; fileFormat.ts sdfUsdaReadFromStringText); a file read requires
  // the format's own cookie.
  if (!c.src.startsWith('#usda', c.pos))
    throw new Error('Not a USDA file: missing #usda header')
  // Skip rest of header line (version number)
  while (!c.eof() && c.at() !== '\n' && c.at() !== '\r') c.pos++

  // Optional layer metadata — malformed metadata is a parse error (no longer
  // silently ignored).
  const layerMeta: Record<string, unknown> = {}
  if (c.peek() === '(') {
    Object.assign(layerMeta, parseLayerMeta(c))
  }

  // OpenUSD 26.11.1 textFileFormatParser.h:LayerSpec/LayerMetadataOnly
  // stops after layer metadata; invalid body syntax is deliberately unread.
  if(metadataOnly){addSpec(scene,'/',layerMeta);return scene}

  const rootPrimChildren: string[] = []
  let rootPrimOrder: string[] | undefined

  // Top-level prim specs
  while (!c.eof()) {
    c.ws()
    if (c.eof()) break
    const ch = c.peek()

    // String comment at top level
    if (ch === '"' || ch === "'") { c.string(); c.eat(';'); continue }
    if (ch === ';') { c.pos++; continue }

    const w = c.peekWord()
    if (w === 'def' || w === 'over' || w === 'class') {
      parsePrimSpec(c, scene, '/', rootPrimChildren)
      c.statementEnd(true)
    } else if (w === 'reorder') {
      // reorder rootPrims = [...] — the layer's PrimOrder field
      // (usdaFileFormat.cpp: "reorder rootPrims = ").
      c.word()                            // consume 'reorder'
      const what = c.word()
      if (what !== 'rootPrims') {
        throw new Error(`top-level reorder must target rootPrims at ${c.pos}, got '${what}'`)
      }
      c.need('=')
      rootPrimOrder = parseNameList(c)
    } else if (w) {
      // Unknown top-level keyword where a prim/reorder was expected — reject
      // with a positioned error rather than silently skipping the statement.
      throw new Error(`Unexpected top-level statement '${w}' at ${c.pos}`)
    } else {
      throw new Error(`Unexpected top-level token '${ch}' at ${c.pos}`)
    }
    c.eat(';')
  }

  // Root spec (/)
  // TextParserAction<LayerSpec> (textFileFormatParser.cpp:4545-4558) always
  // stores the root prim names.
  const rootFields: Record<string, unknown> = { ...layerMeta }
  rootFields.primChildren = rootPrimChildren
  if (rootPrimOrder) rootFields.primOrder = rootPrimOrder
  addSpec(scene, '/', rootFields)

  return scene
}
