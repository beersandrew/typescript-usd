// Ported from OpenUSD 26.11.1: pxr/imaging/hio/dictionary.cpp,
//  pxr/imaging/hio/dictionary.h, pxr/base/js/converter.h,
//  pxr/base/js/json.cpp, pxr/base/js/rapidjson/error/en.h
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// RapidJSON: Copyright (C) 2015 THL A29 Limited, a Tencent company, and Milo
//  Yip. MIT License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hio/dictionary.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences:
// - pxr/base/js (JsParseString, JsValue, JsValueTypeConverter) has no port in
//   this repository, and JSON.parse cannot reproduce it: it neither tells an
//   integer from a real (JsValue IntType vs RealType, which the conversion
//   below turns into int vs double VtValues) nor reports rapidjson's error
//   codes and offsets. Hio_JsParseString below is a private reader that
//   follows the recursive-descent path of rapidjson's GenericReader with the
//   flags json.cpp:335-337 passes (kParseFullPrecisionFlag |
//   kParseStopWhenDoneFlag | kParseNanAndInfFlag), and reports
//   GetParseError_En's messages (rapidjson/error/en.h:38-64) at the offsets
//   rapidjson reports them, converted to line/column as json.cpp:339-357
//   does. FAITHFULNESS-DEBT(hio-js-reader): replace with a pxr/base/js port
//   (js/json.cpp JsParseString + js/converter.h JsValueTypeConverter) once one
//   exists.
// - A JSON array converts to std::vector<VtValue> (js/converter.h:107-115).
//   vt has no TfType for that C++ type yet, so it is declared here by name as
//   Hio_VtValueVectorType; any library can obtain the same TfType with
//   TfType.Declare('std::vector<VtValue>').

import {
  Debug as TfDebug,
  TfDiagnosticMgr,
  TfDiagnosticType,
  Error as TfError,
  Type as TfType,
} from 'typescript-usd/tf'
import {
  Dictionary as VtDictionary,
  Value as VtValue,
  ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'

/** The TfType of a VtValue holding std::vector<VtValue> (a JSON array). */
export const Hio_VtValueVectorType: TfType = TfType.declare('std::vector<VtValue>')

// dictionary.cpp:20-31
const HIO_DEBUG_DICTIONARY = 'HIO_DEBUG_DICTIONARY'
TfDebug.registerDebugSymbol(HIO_DEBUG_DICTIONARY, 'glslfx dictionary parsing')

// ---------------------------------------------------------------------------
// JsValue / JsParseString stand-in (see the header).
// ---------------------------------------------------------------------------

/** A parsed JSON value: the JsValue kinds converter.h:75-94 switches on. */
type Hio_JsValue =
  | { kind: 'object'; value: Map<string, Hio_JsValue> }
  | { kind: 'array'; value: Hio_JsValue[] }
  | { kind: 'bool'; value: boolean }
  | { kind: 'string'; value: string }
  | { kind: 'real'; value: number }
  // IntType: int64_t or uint64_t (json.cpp:58-75).
  | { kind: 'int'; value: bigint }
  | { kind: 'null' }

/** JsParseError (js/json.h:24-32): line and column default to 0. */
interface Hio_JsParseError {
  line: number
  column: number
  reason: string
}

// rapidjson/error/en.h:38-64
const kParseErrorDocumentEmpty = 'The document is empty.'
const kParseErrorValueInvalid = 'Invalid value.'
const kParseErrorObjectMissName = 'Missing a name for object member.'
const kParseErrorObjectMissColon = 'Missing a colon after a name of object member.'
const kParseErrorObjectMissCommaOrCurlyBracket = "Missing a comma or '}' after an object member."
const kParseErrorArrayMissCommaOrSquareBracket = "Missing a comma or ']' after an array element."
const kParseErrorStringUnicodeEscapeInvalidHex = 'Incorrect hex digit after \\u escape in string.'
const kParseErrorStringUnicodeSurrogateInvalid = 'The surrogate pair in string is invalid.'
const kParseErrorStringEscapeInvalid = 'Invalid escape character in string.'
const kParseErrorStringMissQuotationMark = 'Missing a closing quotation mark in string.'
const kParseErrorStringInvalidEncoding = 'Invalid encoding in string.'
const kParseErrorNumberTooBig = 'Number too big to be stored in double.'
const kParseErrorNumberMissFraction = 'Miss fraction part in number.'
const kParseErrorNumberMissExponent = 'Miss exponent in number.'

class Hio_JsParseFailure {
  constructor(readonly reason: string, readonly offset: number) {}
}

const CH = (c: string): number => c.charCodeAt(0)

/**
 * rapidjson GenericReader over a UTF-8 byte stream (reader.h). The input is
 * a std::string read through rj::StringStream on c_str(), so a NUL byte ends
 * the stream (Peek() returns '\0' there).
 */
class Hio_JsReader {
  readonly #bytes: Uint8Array
  #pos = 0

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes
    const nul = bytes.indexOf(0)
    if (nul >= 0) this.#bytes = bytes.subarray(0, nul)
  }

  tell(): number { return this.#pos }
  #peek(): number { return this.#pos < this.#bytes.length ? this.#bytes[this.#pos]! : 0 }
  #take(): number { const c = this.#peek(); if (this.#pos < this.#bytes.length) this.#pos++; return c }
  #consume(c: string): boolean {
    if (this.#peek() === CH(c)) { this.#pos++; return true }
    return false
  }
  #error(reason: string, offset: number): never {
    throw new Hio_JsParseFailure(reason, offset)
  }

  // reader.h:700-735 SkipWhitespace (comments are not enabled).
  #skipWhitespace(): void {
    for (;;) {
      const c = this.#peek()
      if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) this.#pos++
      else return
    }
  }

  // reader.h:559-590 Parse (kParseStopWhenDoneFlag: nothing is checked after
  // the root value).
  parse(): Hio_JsValue {
    this.#skipWhitespace()
    if (this.#peek() === 0) this.#error(kParseErrorDocumentEmpty, this.tell())
    return this.#parseValue()
  }

  // reader.h ParseValue
  #parseValue(): Hio_JsValue {
    switch (this.#peek()) {
      case CH('n'): return this.#parseLiteral('ull', { kind: 'null' })
      case CH('t'): return this.#parseLiteral('rue', { kind: 'bool', value: true })
      case CH('f'): return this.#parseLiteral('alse', { kind: 'bool', value: false })
      case CH('"'): return { kind: 'string', value: this.#parseString() }
      case CH('{'): return this.#parseObject()
      case CH('['): return this.#parseArray()
      default: return this.#parseNumber()
    }
  }

  // reader.h:856-893 ParseNull / ParseTrue / ParseFalse
  #parseLiteral(rest: string, value: Hio_JsValue): Hio_JsValue {
    this.#take()
    for (const c of rest) {
      if (!this.#consume(c)) this.#error(kParseErrorValueInvalid, this.tell())
    }
    return value
  }

  // reader.h:740-810 ParseObject. JsObject is a std::map that keeps the first
  // of duplicate keys (json.cpp EndObject inserts in order).
  #parseObject(): Hio_JsValue {
    this.#take()
    this.#skipWhitespace()
    const members: Array<[string, Hio_JsValue]> = []
    const object = (): Hio_JsValue => {
      const map = new Map<string, Hio_JsValue>()
      for (const [key, value] of members) if (!map.has(key)) map.set(key, value)
      return { kind: 'object', value: map }
    }
    if (this.#consume('}')) return object()
    for (;;) {
      if (this.#peek() !== CH('"')) this.#error(kParseErrorObjectMissName, this.tell())
      const key = this.#parseString()
      this.#skipWhitespace()
      if (!this.#consume(':')) this.#error(kParseErrorObjectMissColon, this.tell())
      this.#skipWhitespace()
      const value = this.#parseValue()
      this.#skipWhitespace()
      members.push([key, value])
      switch (this.#peek()) {
        case CH(','):
          this.#take()
          this.#skipWhitespace()
          break
        case CH('}'):
          this.#take()
          return object()
        default:
          this.#error(kParseErrorObjectMissCommaOrCurlyBracket, this.tell())
      }
    }
  }

  // reader.h:813-850 ParseArray
  #parseArray(): Hio_JsValue {
    this.#take()
    this.#skipWhitespace()
    const elements: Hio_JsValue[] = []
    if (this.#consume(']')) return { kind: 'array', value: elements }
    for (;;) {
      elements.push(this.#parseValue())
      this.#skipWhitespace()
      if (this.#consume(',')) this.#skipWhitespace()
      else if (this.#consume(']')) return { kind: 'array', value: elements }
      else this.#error(kParseErrorArrayMissCommaOrSquareBracket, this.tell())
    }
  }

  // reader.h:906-924 ParseHex4
  #parseHex4(escapeOffset: number): number {
    let codepoint = 0
    for (let i = 0; i < 4; i++) {
      const c = this.#peek()
      let digit: number
      if (c >= CH('0') && c <= CH('9')) digit = c - CH('0')
      else if (c >= CH('A') && c <= CH('F')) digit = c - CH('A') + 10
      else if (c >= CH('a') && c <= CH('f')) digit = c - CH('a') + 10
      else this.#error(kParseErrorStringUnicodeEscapeInvalidHex, escapeOffset)
      codepoint = (codepoint << 4) + digit
      this.#take()
    }
    return codepoint
  }

  // reader.h:991-1068 ParseStringToStream (UTF-8 to UTF-8, no validation:
  // bytes >= 0x20 are copied as they are).
  #parseString(): string {
    this.#take()
    const out: number[] = []
    const escape: Record<number, number> = {
      [CH('"')]: 0x22, [CH('\\')]: 0x5c, [CH('/')]: 0x2f, [CH('b')]: 0x08,
      [CH('f')]: 0x0c, [CH('n')]: 0x0a, [CH('r')]: 0x0d, [CH('t')]: 0x09,
    }
    for (;;) {
      const c = this.#peek()
      if (c === CH('\\')) {
        const escapeOffset = this.tell()
        this.#take()
        const e = this.#peek()
        if (escape[e] !== undefined) {
          this.#take()
          out.push(escape[e]!)
        } else if (e === CH('u')) {
          this.#take()
          let codepoint = this.#parseHex4(escapeOffset)
          if (codepoint >= 0xd800 && codepoint <= 0xdfff) {
            if (codepoint <= 0xdbff) {
              if (!this.#consume('\\') || !this.#consume('u')) {
                this.#error(kParseErrorStringUnicodeSurrogateInvalid, escapeOffset)
              }
              const codepoint2 = this.#parseHex4(escapeOffset)
              if (codepoint2 < 0xdc00 || codepoint2 > 0xdfff) {
                this.#error(kParseErrorStringUnicodeSurrogateInvalid, escapeOffset)
              }
              codepoint = (((codepoint - 0xd800) << 10) | (codepoint2 - 0xdc00)) + 0x10000
            } else {
              this.#error(kParseErrorStringUnicodeSurrogateInvalid, escapeOffset)
            }
          }
          out.push(...new TextEncoder().encode(String.fromCodePoint(codepoint)))
        } else {
          this.#error(kParseErrorStringEscapeInvalid, escapeOffset)
        }
      } else if (c === CH('"')) {
        this.#take()
        return new TextDecoder().decode(new Uint8Array(out))
      } else if (c < 0x20) {
        if (c === 0) this.#error(kParseErrorStringMissQuotationMark, this.tell())
        this.#error(kParseErrorStringInvalidEncoding, this.tell())
      } else {
        out.push(this.#take())
      }
    }
  }

  // reader.h:1468-1740 ParseNumber. With kParseFullPrecisionFlag the double
  // is the correctly rounded value of the decimal text, which Number()
  // computes for the same text.
  #parseNumber(): Hio_JsValue {
    const startOffset = this.tell()
    const isDigit = (c: number) => c >= CH('0') && c <= CH('9')
    const minus = this.#consume('-')
    let useNanOrInf = false
    let nanOrInf = 0
    const intStart = this.tell()
    if (this.#peek() === CH('0')) {
      this.#take()
    } else if (this.#peek() >= CH('1') && this.#peek() <= CH('9')) {
      while (isDigit(this.#peek())) this.#take()
    } else if (this.#peek() === CH('I') || this.#peek() === CH('N')) {
      if (this.#consume('N')) {
        if (this.#consume('a') && this.#consume('N')) {
          nanOrInf = Number.NaN
          useNanOrInf = true
        }
      } else if (this.#consume('I')) {
        if (this.#consume('n') && this.#consume('f')) {
          nanOrInf = minus ? -Infinity : Infinity
          useNanOrInf = true
          if (this.#peek() === CH('i') && !(this.#consume('i') && this.#consume('n') &&
              this.#consume('i') && this.#consume('t') && this.#consume('y'))) {
            this.#error(kParseErrorValueInvalid, this.tell())
          }
        }
      }
      if (!useNanOrInf) this.#error(kParseErrorValueInvalid, this.tell())
    } else {
      this.#error(kParseErrorValueInvalid, this.tell())
    }
    const intEnd = this.tell()

    let useDouble = false
    if (this.#consume('.')) {
      if (!isDigit(this.#peek())) this.#error(kParseErrorNumberMissFraction, this.tell())
      useDouble = true
      while (isDigit(this.#peek())) this.#take()
    }
    if (this.#consume('e') || this.#consume('E')) {
      useDouble = true
      if (!this.#consume('+')) this.#consume('-')
      if (!isDigit(this.#peek())) this.#error(kParseErrorNumberMissExponent, this.tell())
      while (isDigit(this.#peek())) this.#take()
    }

    const text = new TextDecoder().decode(this.#bytes.subarray(startOffset, this.tell()))
    if (useNanOrInf && !useDouble) return { kind: 'real', value: nanOrInf }
    if (!useDouble) {
      const digits = new TextDecoder().decode(this.#bytes.subarray(intStart, intEnd))
      const magnitude = BigInt(digits)
      // Integers beyond int64 (negative) / uint64 (positive) become doubles
      // (reader.h:1550-1580).
      const limit = minus ? 2n ** 63n : 2n ** 64n - 1n
      if (magnitude <= limit) return { kind: 'int', value: minus ? -magnitude : magnitude }
    }
    const d = Number(text)
    if (!Number.isFinite(d) && !useNanOrInf) this.#error(kParseErrorNumberTooBig, startOffset)
    return { kind: 'real', value: d }
  }
}

/** JsParseString (js/json.cpp:322-363). */
function Hio_JsParseString(data: string, error: Hio_JsParseError): Hio_JsValue | null {
  if (data.length === 0) {
    TfDiagnosticMgr.GetInstance().postError(
      new TfError('JSON string is empty', TfDiagnosticType.CodingError))
    return null
  }
  const bytes = new TextEncoder().encode(data)
  try {
    return new Hio_JsReader(bytes).parse()
  } catch (failure) {
    if (!(failure instanceof Hio_JsParseFailure)) throw failure
    // json.cpp:341-356
    error.line = 1
    const eoff = failure.offset
    let nlpos = 0
    for (let i = 0; i < eoff; ++i) {
      if (bytes[i] === 0x0a) {
        error.line++
        nlpos = i
      }
    }
    error.column = eoff - nlpos
    error.reason = failure.reason
    return null
  }
}

/**
 * JsValueTypeConverter<VtValue, VtDictionary, UseInt64=false>::Convert
 * (js/converter.h:61-116): objects to VtDictionary, arrays to
 * std::vector<VtValue>, integers to int (Js_ValueToInt, converter.h:28-36,
 * static_cast<int> of the int64), null to an empty VtValue.
 */
function Hio_JsToVtValue(value: Hio_JsValue): VtValue {
  switch (value.kind) {
    case 'object': {
      const dict = new VtDictionary()
      for (const [key, element] of value.value) dict.set(key, Hio_JsToVtValue(element))
      return VtValue.createDictionary(dict)
    }
    case 'array':
      return VtValue.create(value.value.map(Hio_JsToVtValue), Hio_VtValueVectorType)
    case 'bool':
      return VtValue.create(value.value, VtValueTypes.bool)
    case 'string':
      return VtValue.create(value.value, VtValueTypes.string)
    case 'real':
      return VtValue.create(value.value, VtValueTypes.double)
    case 'int':
      return VtValue.create(Number(BigInt.asIntN(32, value.value)), VtValueTypes.int)
    case 'null':
      return VtValue.getEmpty()
  }
}

/** _Hio_GetDictionaryFromJSON (dictionary.cpp:33-94). */
function _Hio_GetDictionaryFromJSON(input: string, errorStr: { value: string } | null): VtDictionary {
  if (input.length === 0) {
    const errorMsg = 'Cannot create VtDictionary from empty string'
    TfDebug.msg(HIO_DEBUG_DICTIONARY, errorMsg)
    if (errorStr) errorStr.value = errorMsg
    return new VtDictionary()
  }

  // Note Js library doesn't allow comments.  Strip comments as we do
  // for plugInfo files.
  // dictionary.cpp:54-59: a line whose first non-blank character is '#' is
  // cleared (line.find('#') < line.find_first_not_of(" \t#")).
  const filtered = input.split('\n').map(line => {
    const hash = line.indexOf('#')
    if (hash < 0) return line
    const firstNot = line.search(/[^ \t#]/)
    // std::string::npos compares greater than any index.
    return firstNot < 0 || hash < firstNot ? '' : line
  })

  const error: Hio_JsParseError = { line: 0, column: 0, reason: '' }
  const jsdict = Hio_JsParseString(filtered.join('\n'), error)

  if (jsdict === null || jsdict.kind === 'null') {
    if (errorStr || TfDebug.isEnabled(HIO_DEBUG_DICTIONARY)) {
      const errorMessageStr =
        `Failed to extract dictionary from input (line ${error.line}, col ${error.column}): ${error.reason}`
      if (errorStr) errorStr.value = errorMessageStr
      TfDebug.msg(HIO_DEBUG_DICTIONARY, errorMessageStr)
    }
    return new VtDictionary()
  }

  if (jsdict.kind !== 'object') {
    if (errorStr || TfDebug.isEnabled(HIO_DEBUG_DICTIONARY)) {
      const errorMessageStr = `Input string did not evaluate to a JSON dictionary:\n${input}\n`
      if (errorStr) errorStr.value = errorMessageStr
      TfDebug.msg(HIO_DEBUG_DICTIONARY, errorMessageStr)
    }
    return new VtDictionary()
  }

  const vtdict = Hio_JsToVtValue(jsdict)
  return vtdict.IsHolding(VtValueTypes.dictionary)
    ? vtdict.UncheckedGet<VtDictionary>() : new VtDictionary()
}

/**
 * Hio_GetDictionaryFromInput (dictionary.h:19-23, dictionary.cpp:97-117).
 * `filename` is unused upstream as well. `errorStr` is an out-param box.
 */
export function Hio_GetDictionaryFromInput(
  input: string,
  _filename: string,
  errorStr: { value: string } | null,
): VtDictionary {
  const jsError = { value: '' }
  const ret = _Hio_GetDictionaryFromJSON(input, jsError)

  if (jsError.value.length === 0) {
    // JSON succeeded, great, we're done.
    return ret
  }

  // If the file has errors, report the errors from JSON as that is the new
  // format that we're expected to conform to.
  if (errorStr) errorStr.value = jsError.value
  return new VtDictionary()
}
