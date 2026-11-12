// Ported from OpenUSD 26.11.1: pxr/base/tf/stringUtils.cpp,
//  pxr/base/tf/stringUtils.h, pxr/usd/sdf/fileIO_Common.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/tf — string utilities (base/tf/stringUtils).
//
// Faithful port of the dictionary-ordering predicate from
// pxr/base/tf/stringUtils.{h,cpp}. `TfDictionaryLessThan` is the comparison
// USD uses wherever names are sorted "as a human would" — case-insensitive,
// with embedded numbers compared by magnitude and '_' sorting before letters.
// The USDA text writer sorts a prim's properties with it (fileIO_Common.h
// `_SortByNameThenType`), so a faithful serializer needs a faithful comparator.

// The comparison works on UTF-8 bytes, as upstream's does on std::string.
// An all-ASCII string's code units are its bytes, so it is compared as is;
// any other string is first turned into a string of its UTF-8 bytes (one
// code unit per byte), so the comparison below reads code units throughout.
const enc = new TextEncoder()

function utf8ByteString(str: string): string {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) >= 0x80) {
      const bytes = enc.encode(str)
      let out = ''
      for (let j = 0; j < bytes.length; j += 0x2000) {
        out += String.fromCharCode(...bytes.subarray(j, j + 0x2000))
      }
      return out
    }
  }
  return str
}

// The byte at index, mirroring C++ reads past the end of a null-terminated
// std::string (c_str()[size()] == '\0').
function byteAt(b: string, i: number): number {
  return i < b.length ? b.charCodeAt(i) : 0
}

// '0'..'9'
function isDigit(ch: number): boolean {
  return ch >= 0x30 && ch <= 0x39
}

// ASCII letter, case-insensitive: ((ch & ~0x20) - 'A') < 26
function isAlpha(ch: number): boolean {
  const u = ch & ~0x20
  return u >= 0x41 && u <= 0x5a
}

// TfDictionaryLessThan::operator() (stringUtils.h:531-549): decide on the
// first bytes when they are ASCII letters that differ ignoring case, by far
// the common case; otherwise _LessImpl.
export function dictionaryLessThan(lstr: string, rstr: string): boolean {
  const l = lstr.length === 0 ? 0 : lstr.charCodeAt(0)
  const r = rstr.length === 0 ? 0 : rstr.charCodeAt(0)
  // A first code unit >= 0x80 begins a multi-byte UTF-8 sequence, whose
  // first byte is >= 0x80 as well.
  if (l < 0x80 && r < 0x80 && (l & ~0x20) !== (r & ~0x20) && l >= 0x40 && r >= 0x40) {
    // Adding 5 mod 32 makes '_' sort before all letters.
    return ((l + 5) & 31) < ((r + 5) & 31)
  }
  return lessImpl(utf8ByteString(lstr), utf8ByteString(rstr))
}

// Faithful port of TfDictionaryLessThan::_LessImpl (stringUtils.cpp), over
// strings of UTF-8 bytes (see utf8ByteString), so non-ASCII code points order
// by their byte sequence, as upstream does. The std::mismatch calls are the
// inline loops that advance both cursors while the bytes match.
function lessImpl(L: string, R: string): boolean {
  const lsize = L.length
  const rsize = R.length
  const lend = lsize
  const rend = rsize

  let lcur = 0
  let rcur = 0
  let curEnd = Math.min(lsize, rsize)

  // Find the next differing byte.
  while (lcur < curEnd && L.charCodeAt(lcur) === R.charCodeAt(rcur)) { lcur++; rcur++ }
  // Identical strings: not less.
  if (lcur === curEnd && lsize === rsize) return false

  let l: number
  let r: number

  while (true) {
    if (lcur === curEnd) break
    l = byteAt(L, lcur)
    r = byteAt(R, rcur)

    // If they are ASCII letters that differ disregarding case, decide now.
    const bothAscii = l < 0x80 && r < 0x80
    const differsIgnoringCase = (l & ~0x20) !== (r & ~0x20)
    const inLetterZone = l >= 0x40 && r >= 0x40
    if (bothAscii && differsIgnoringCase && inLetterZone) {
      // Adding 5 mod 32 makes '_' sort before all letters.
      return ((l + 5) & 31) < ((r + 5) & 31)
    } else if (isDigit(l) || isDigit(r)) {
      if (isDigit(l) && isDigit(r)) {
        // Both are digits. Backtrack to the start of each digit run, drop
        // leading zeros to align most-significant digits, then compare by
        // length-then-leading-digit.
        let lDigStart = lcur
        let rDigStart = rcur
        let lDigEnd = lcur
        let rDigEnd = rcur

        while (lDigStart !== 0 && isDigit(byteAt(L, lDigStart - 1))) lDigStart--
        while (rDigStart !== 0 && isDigit(byteAt(R, rDigStart - 1))) rDigStart--
        while (lDigEnd !== lend && isDigit(byteAt(L, lDigEnd))) lDigEnd++
        while (rDigEnd !== rend && isDigit(byteAt(R, rDigEnd))) rDigEnd++

        // Skip leading zeros.
        while (lDigStart !== lDigEnd && byteAt(L, lDigStart) === 0x30) lDigStart++
        while (rDigStart !== rDigEnd && byteAt(R, rDigStart) === 0x30) rDigStart++

        // Scan while the significant digits match.
        while (
          lDigStart !== lDigEnd &&
          rDigStart !== rDigEnd &&
          isDigit(byteAt(L, lDigStart)) &&
          byteAt(L, lDigStart) === byteAt(R, rDigStart)
        ) {
          lDigStart++
          rDigStart++
        }

        // If exactly one ran out of significant digits, the shorter value is less.
        if ((lDigStart === lDigEnd) !== (rDigStart === rDigEnd)) {
          return lDigStart === lDigEnd && rDigStart !== rDigEnd
        }
        if (lDigStart !== lDigEnd && rDigStart !== rDigEnd) {
          const lMSD = byteAt(L, lDigStart)
          const rMSD = byteAt(R, rDigStart)
          const digitsL = lDigEnd - lDigStart
          const digitsR = rDigEnd - rDigStart
          // Fewer significant digits wins; on a tie, the smaller leading digit.
          if (digitsL !== digitsR) return digitsL < digitsR
          return lMSD < rMSD
        }
        // Values equal; continue past the digit runs. Reset curEnd to account
        // for leading-zero count differences between the two cursors.
        lcur = lDigEnd
        rcur = rDigEnd
        curEnd = lcur + Math.min(lend - lcur, rend - rcur)
      } else {
        // Exactly one is a digit. If we're at the very start, compare directly;
        // otherwise the preceding char decides which side's digit wins.
        if (lcur === 0) return l < r
        const prevChar = byteAt(L, lcur - 1)
        return isDigit(prevChar) ? isDigit(r) : isDigit(l)
      }
    } else if (!isAlpha(l) || !isAlpha(r)) {
      // At least one isn't a letter — straight byte compare.
      return l < r
    } else {
      // Both letters, differ only by case — keep scanning.
      lcur++
      rcur++
    }
    while (lcur < curEnd && byteAt(L, lcur) === byteAt(R, rcur)) { lcur++; rcur++ }
  }

  // At the end of one or both, with at most case / leading-zero differences.
  // If only one is at its end, the shorter is less.
  if (lcur !== lend || rcur !== rend) {
    return lcur === lend
  }

  // Both at the end — discriminate on the very first mismatch (a case or
  // leading-zero difference). A leading zero sorts after a significant digit.
  lcur = 0
  rcur = 0
  curEnd = Math.min(lsize, rsize)
  while (lcur < curEnd && L.charCodeAt(lcur) === R.charCodeAt(rcur)) { lcur++; rcur++ }
  l = byteAt(L, lcur)
  r = byteAt(R, rcur)
  return r === 0x30 || (l !== 0x30 && l < r)
}

// Faithful port of TfStringSplit (stringUtils.cpp). Splits `src` on every
// (non-overlapping) occurrence of `separator`, keeping empty fields. Two early
// outs mirror upstream exactly: an empty `src` OR an empty `separator` returns
// the empty list (upstream notes Python would raise ValueError on an empty
// separator; the C++ — and therefore we — exit silently with []).
export function stringSplit(src: string, separator: string): string[] {
  const split: string[] = []
  if (src.length === 0) return split
  if (separator.length === 0) return split

  let from = 0
  while (true) {
    const pos = src.indexOf(separator, from)
    if (pos === -1) break
    split.push(src.slice(from, pos))
    from = pos + separator.length
  }
  // Also add the 'last' substring.
  split.push(src.slice(from))
  return split
}

// '0'..'9' / ASCII letter helpers for the identifier predicates.
function isAsciiLetter(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)
}
function isAsciiDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39
}

// Faithful port of TfIsValidIdentifier (stringUtils.h): non-empty, first char a
// letter or '_' (not a digit), remaining chars letters/digits/'_'.
export function isValidIdentifier(identifier: string): boolean {
  if (identifier.length === 0) return false
  if (isAsciiDigit(identifier.charCodeAt(0))) return false
  for (let i = 0; i < identifier.length; i++) {
    const c = identifier.charCodeAt(i)
    if (!(isAsciiLetter(c) || isAsciiDigit(c) || c === 0x5f /* _ */)) return false
  }
  return true
}

// Faithful port of TfMakeValidIdentifier (stringUtils.cpp): empty -> "_";
// otherwise the first char becomes '_' unless it is a letter or '_', and every
// subsequent non [A-Za-z0-9_] char becomes '_'.
export function makeValidIdentifier(input: string): string {
  if (input.length === 0) return '_'
  const first = input.charCodeAt(0)
  let result = isAsciiLetter(first) || first === 0x5f ? input[0]! : '_'
  for (let i = 1; i < input.length; i++) {
    const c = input.charCodeAt(i)
    result += isAsciiLetter(c) || isAsciiDigit(c) || c === 0x5f ? input[i]! : '_'
  }
  return result
}

// 64-bit signed/unsigned bounds, mirroring the `long`/`unsigned long` the C++
// TfStringToLong/TfStringToULong return on a 64-bit platform.
const LONG_MIN = -(2n ** 63n) // -9223372036854775808
const LONG_MAX = 2n ** 63n - 1n // 9223372036854775807
const ULONG_MAX = 2n ** 64n - 1n // 18446744073709551615

// Faithful port of TfStringToLong: parse a base-10 signed integer, throwing
// (the C++ sets an `outOverflow` flag the Python wrapper turns into ValueError)
// when the value falls outside [LONG_MIN, LONG_MAX]. Returns a bigint so the
// full 64-bit range is exact.
export function stringToLong(s: string): bigint {
  const v = BigInt(s.trim())
  if (v < LONG_MIN || v > LONG_MAX) throw new RangeError(`out of long range: ${s}`)
  return v
}

// Faithful port of TfStringToULong: as above, over [0, ULONG_MAX].
export function stringToULong(s: string): bigint {
  const v = BigInt(s.trim())
  if (v < 0n || v > ULONG_MAX) throw new RangeError(`out of unsigned long range: ${s}`)
  return v
}

// The 64-bit extrema, matching Tf._GetLongMax/_GetLongMin/_GetULongMax.
export const TF_LONG_MAX = LONG_MAX
export const TF_LONG_MIN = LONG_MIN
export const TF_ULONG_MAX = ULONG_MAX

// 3-way dictionary comparison, mirroring Tf.DictionaryStrcmp: -1 / 0 / 1.
// This is the form the USDA writer's property sort consumes.
export function dictionaryStrcmp(a: string, b: string): number {
  if (dictionaryLessThan(a, b)) return -1
  if (dictionaryLessThan(b, a)) return 1
  return 0
}

// The remaining public stringUtils surface follows OpenUSD v26.08
// pxr/base/tf/stringUtils.{h,cpp}. These deliberately use ASCII case folding
// where upstream does; locale-sensitive JavaScript casing is not substituted.
export const stringToLower = (value: string): string =>
  value.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32))
export const stringToUpper = (value: string): string =>
  value.replace(/[a-z]/g, c => String.fromCharCode(c.charCodeAt(0) - 32))
export const stringToLowerAscii = (value: string): string =>
  value.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32))
export const stringCapitalize = (value: string): string =>
  value ? stringToUpper(value[0]!) + value.slice(1) : ''
export const stringContains = (value: string, query: string): boolean =>
  value.includes(query)
export const stringStartsWith = (value: string, prefix: string): boolean =>
  value.startsWith(prefix)
export const stringEndsWith = (value: string, suffix: string): boolean =>
  value.endsWith(suffix)
export const stringGetSuffix = (value: string, separator = '.'): string => {
  const index = value.lastIndexOf(separator)
  return index < 0 ? '' : value.slice(index + separator.length)
}
export const stringGetBeforeSuffix = (value: string, separator = '.'): string => {
  const index = value.lastIndexOf(separator)
  return index < 0 ? value : value.slice(0, index)
}
export const stringGetCommonPrefix = (a: string, b: string): string => {
  let index = 0
  while (index < a.length && index < b.length && a[index] === b[index]) index++
  return a.slice(0, index)
}
export const stringJoin = (
  values: readonly string[] | ReadonlySet<string>,
  separator = ' ',
): string => (Array.isArray(values) ? values : [...values].sort()).join(separator)
export const stringReplace = (
  value: string,
  from: string,
  to: string,
): string => from ? value.split(from).join(to) : value

function trimClass(characters: string): RegExp {
  return new RegExp(`[${characters.replace(/[\\\]^$.*+?()[{|-]/g, '\\$&')}]+`)
}
export const stringTrimLeft = (value: string, characters = ' \t\r\n'): string =>
  value.replace(new RegExp(`^${trimClass(characters).source}`), '')
export const stringTrimRight = (value: string, characters = ' \t\r\n'): string =>
  value.replace(new RegExp(`${trimClass(characters).source}$`), '')
export const stringTrim = (value: string, characters = ' \t\r\n'): string =>
  stringTrimRight(stringTrimLeft(value, characters), characters)
export const stringTokenize = (value: string, delimiters = ' \t\n'): string[] => {
  if (!delimiters) return [value]
  const delimiter = new RegExp(
    `[${delimiters.replace(/[\\\]^$.*+?()[{|-]/g, '\\$&')}]+`,
  )
  return value.split(delimiter).filter(Boolean)
}
export const stringTokenizeToSet = (
  value: string,
  delimiters = ' \t\n',
): Set<string> => new Set(stringTokenize(value, delimiters).sort())

export function quotedStringTokenize(
  value: string,
  delimiters = ' \t\n',
): string[] {
  const quotes = '"\'`'
  if ([...quotes].some(quote => delimiters.includes(quote))) return []

  const result: string[] = []
  let index = 0
  while (index < value.length) {
    while (index < value.length && delimiters.includes(value[index]!)) index++
    if (index === value.length) break

    let token = ''
    while (index < value.length && !delimiters.includes(value[index]!)) {
      const char = value[index]!
      const escaped = index > 0 && value[index - 1] === '\\'
      if (quotes.includes(char) && !escaped) {
        const quote = char
        const close = findUnescaped(value, quote, index + 1)
        if (close < 0) return []
        token += value.slice(index + 1, close)
        index = close + 1
      } else {
        token += char
        index++
      }
    }
    for (const quote of quotes) token = token.split(`\\${quote}`).join(quote)
    result.push(token)
  }
  return result
}

function findUnescaped(value: string, target: string, from: number): number {
  let index = value.indexOf(target, from)
  while (index > 0 && value[index - 1] === '\\') {
    index = value.indexOf(target, index + 1)
  }
  return index
}

export function matchedStringTokenize(
  value: string,
  open: string,
  close: string,
  escape = '',
): string[] {
  if (escape === open || escape === close) return []
  const result: string[] = []
  let depth = 0
  let token = ''
  for (let i = 0; i < value.length; i++) {
    if (escape && value[i] === escape && i + 1 < value.length) {
      if (depth > 0) token += value[++i]
      else i++
      continue
    }
    const char = value[i]!
    if (open === close && char === open) {
      if (depth === 0) {
        depth = 1
        token = ''
      } else {
        depth = 0
        result.push(token)
      }
    } else if (char === open) {
      if (depth === 0) token = ''
      if (depth > 0) token += char
      depth++
    } else if (char === close) {
      if (depth === 0) return []
      depth--
      if (depth === 0) result.push(token)
      else token += char
    } else if (depth > 0) {
      token += char
    }
  }
  return depth === 0 ? result : []
}

export function escapeString(value: string): string {
  return value.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|.)/g, (_match, code: string) => {
    const named: Record<string, string> = {
      a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v',
      '\\': '\\', '"': '"', "'": "'",
    }
    if (code in named) return named[code]!
    if (code[0] === 'x') return String.fromCharCode(parseInt(code.slice(1), 16))
    if (/^[0-7]/.test(code)) return String.fromCharCode(parseInt(code, 8))
    return code
  })
}

export const getXmlEscapedString = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

// String conversion surface from OpenUSD v26.08
// pxr/base/tf/stringUtils.h:253-394,623-705.
export function stringToDouble(value: string): number {
  const result = Number(value)
  if (Number.isNaN(result)) throw new TypeError(`Invalid double: ${value}`)
  return result
}

export function stringToInt64(value: string): bigint { return BigInt(value) }
export function stringToUInt64(value: string): bigint {
  const result = BigInt(value)
  if (result < 0n) throw new RangeError('unsigned integer cannot be negative')
  return result
}

export function TfStringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value === null) return 'null'
  if (value === undefined) return ''
  if (Array.isArray(value)) return `[${value.map(TfStringify).join(', ')}]`
  if (value instanceof Set) return `[${[...value].map(TfStringify).join(', ')}]`
  if (value instanceof Map) {
    return `{${[...value].map(([key, item]) =>
      `${TfStringify(key)}: ${TfStringify(item)}`).join(', ')}}`
  }
  return String(value)
}

export function TfUnstringify(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^[+-]?\d+$/.test(trimmed)) {
    const number = Number(trimmed)
    return Number.isSafeInteger(number) ? number : BigInt(trimmed)
  }
  if (/^[+-]?(?:\d+\.\d*|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) {
    return Number(trimmed)
  }
  return value
}

// ---- Shortest round-trip number text (tf/stringUtils.cpp:917-1015) ----
//
// TfStringify(double), TfStreamDouble, TfStringify(float) and TfStreamFloat
// all go through one pxr_double_conversion::DoubleToStringConverter
// (stringUtils.cpp:917-931): NO_FLAGS, "inf", "nan", exponent character 'e',
// decimal_in_shortest_low -6, decimal_in_shortest_high 15. Doubles use
// ToShortest, floats ToShortestSingle (stringUtils.cpp:933-951).

const _singleView = new Float32Array(1)
const _singleBits = new Uint32Array(_singleView.buffer)

function _singleFromBits(bits: number): number {
  _singleBits[0] = bits
  return _singleView[0]!
}

// Exact sign of (decimal text - x) for a finite double x: the text is
// `[digits][.digits][e[-]exp]` with no sign, x > 0.
function _compareDecimalToDouble(text: string, x: number): number {
  const [mantissa, exp = '0'] = text.split('e') as [string, string?]
  const point = mantissa.indexOf('.')
  const digits = point < 0 ? mantissa : mantissa.slice(0, point) + mantissa.slice(point + 1)
  const decimalExp = Number(exp) - (point < 0 ? 0 : mantissa.length - point - 1)
  // x = significand * 2^binaryExp exactly.
  let binaryExp = 0
  let significand = x
  while (!Number.isInteger(significand)) { significand *= 2; binaryExp-- }
  while (significand > Number.MAX_SAFE_INTEGER) { significand /= 2; binaryExp++ }
  let left = BigInt(digits)
  let right = BigInt(significand)
  if (decimalExp >= 0) left *= 10n ** BigInt(decimalExp)
  else right *= 10n ** BigInt(-decimalExp)
  if (binaryExp >= 0) right <<= BigInt(binaryExp)
  else left <<= BigInt(-binaryExp)
  return left < right ? -1 : left > right ? 1 : 0
}

// [digits, exponent] of a `d.ddde[+-]x` string.
function _exponentialParts(text: string): [string, number] {
  const [mantissa, exp] = text.split('e') as [string, string]
  return [mantissa.replace('.', ''), Number(exp)]
}

// ToShortestSingle's digits for a positive finite float: the fewest digits
// that read back as the float, the closest of those, and on an exact tie
// the even one (bignum-dtoa.cc GenerateShortestDigits; Grisu's fast path
// gives the same digits or defers to it). The rounding interval runs halfway
// to the neighbouring floats, closer below at a power of two
// (ieee.h:211-222 LowerBoundaryIsCloser), and includes its ends when the
// significand is even (bignum-dtoa.cc:114,212-223).
function _shortestSingleDigits(value: number): [string, number] {
  _singleView[0] = value
  const bits = _singleBits[0]!
  const even = (bits & 1) === 0
  const pred = _singleFromBits(bits - 1)
  const succ = _singleFromBits(bits + 1)
  // The interval ends are exact doubles (26-bit significands).
  const low = (value + pred) / 2
  const high = Number.isFinite(succ) ? (value + succ) / 2 : value + (value - pred) / 2
  const inside = (text: string): boolean => {
    const d = Number(text)
    if (d > low && d < high) return true
    if (d < low || d > high) return false
    const order = _compareDecimalToDouble(text, d === low ? low : high)
    return d === low ? order > 0 || (order === 0 && even) : order < 0 || (order === 0 && even)
  }
  // Below a power of two the interval is narrower than above it, so the
  // decimal on the far side of the value can be inside when the closest one
  // is not.
  const asymmetric = (bits & 0x7fffff) === 0
  const text = (digits: string, exp: number) => `${digits[0]}.${digits.slice(1)}e${exp}`
  for (let count = 1; count <= 9; count++) {
    // The closest `count`-digit decimal (ties away from zero).
    const closest = value.toExponential(count - 1)
    const d = Number(closest)
    const clearlyInside = d > low && d < high
    if (!clearlyInside && (d < low || d > high) && !asymmetric) continue
    // The `count`-digit decimal on the other side of the value.
    const [digits, exp] = _exponentialParts(closest)
    const side = d < value ? 1 : d > value ? -1 : 0
    const other = side === 0 ? '' : String(Number(digits) + side)
    const otherText = other.length === digits.length ? text(other, exp) : ''
    if (clearlyInside || inside(closest)) {
      // An exact tie between the two takes the even last digit.
      if (otherText && Number(digits.at(-1)) % 2 === 1) {
        const midText = text(String(Math.min(Number(digits), Number(other)) * 10 + 5), exp)
        if (Number(midText) === value && _compareDecimalToDouble(midText, value) === 0 && inside(otherText)) {
          return [other.replace(/0+$/, ''), exp]
        }
      }
      return [digits.replace(/0+$/, ''), exp]
    }
    if (otherText && inside(otherText)) return [other.replace(/0+$/, ''), exp]
  }
  const [digits, exp] = _exponentialParts(value.toExponential(8))
  return [digits.replace(/0+$/, ''), exp]
}

// DoubleToStringConverter::ToShortestIeeeNumber (double-to-string.cc:
// 178-212) with the Tf converter's settings: decimal notation for exponents
// in [-6, 15), otherwise `d.ddde[-]x` with no '+' and no exponent padding
// (CreateExponentialRepresentation, double-to-string.cc:79-127).
function _shortestText(value: number, single: boolean, emitTrailingZero = false,
  infinitySymbol = 'inf', nanSymbol = 'nan'): string {
  if (Number.isNaN(value)) return nanSymbol
  if (!Number.isFinite(value)) return value < 0 ? `-${infinitySymbol}` : infinitySymbol
  const sign = value < 0 || Object.is(value, -0) ? '-' : ''
  const magnitude = Math.abs(value)
  let digits: string
  let exponent: number
  if (magnitude === 0) { digits = '0'; exponent = 0 }
  // JavaScript's shortest double digits are double-conversion's ToShortest
  // digits (ECMA-262 Number::toString; V8 and JavaScriptCore both use it).
  else if (single) [digits, exponent] = _shortestSingleDigits(magnitude)
  else [digits, exponent] = _exponentialParts(magnitude.toExponential())
  const decimalPoint = exponent + 1
  if (exponent < -6 || exponent >= 15) {
    return `${sign}${digits[0]}${digits.length > 1 ? `.${digits.slice(1)}` : ''}e${exponent}`
  }
  // CreateDecimalRepresentation (double-to-string.cc:130-175).
  let text: string
  if (decimalPoint <= 0) text = `0.${'0'.repeat(-decimalPoint)}${digits}`
  else if (decimalPoint >= digits.length) {
    text = digits + '0'.repeat(decimalPoint - digits.length) + (emitTrailingZero ? '.0' : '')
  } else text = `${digits.slice(0, decimalPoint)}.${digits.slice(decimalPoint)}`
  return sign + text
}

/** TfDoubleToString (stringUtils.cpp:962-988): the shortest round-trip text
 * of a double; with emitTrailingZero an integral value keeps `.0`. */
export const TfDoubleToString = (value: number, emitTrailingZero = false,
  infinitySymbol = 'inf', nanSymbol = 'nan'): string =>
  _shortestText(value, false, emitTrailingZero, infinitySymbol, nanSymbol)
export const TfIntToString = (value: number | bigint): string => String(value)
export const TfStringToDouble = stringToDouble
export const TfStringToInt64 = stringToInt64
export const TfStringToUInt64 = stringToUInt64
export const TfSafeString = (value: string | null | undefined): string => value ?? ''
/** TfStringify(double) / TfStreamDouble (stringUtils.cpp:943-951,990-997,1008-1015). */
export const TfStreamDouble = (value: number): string => _shortestText(value, false)
/** TfStringify(float) / TfStreamFloat (stringUtils.cpp:933-941,953-960,999-1006):
 * the value is narrowed to single precision first. */
export const TfStreamFloat = (value: number): string => _shortestText(Math.fround(value), true)

/** TfGetBaseName (stringUtils.h:255-270; stringUtils.cpp:296-332): the
 *  component after the last '/', ignoring a trailing '/' (POSIX build). */
export function TfGetBaseName(fileName: string): string {
  if (fileName === '') return fileName
  const i = fileName.lastIndexOf('/')
  if (i === fileName.length - 1) return TfGetBaseName(fileName.slice(0, i)) // ends in directory delimiter
  return i < 0 ? fileName : fileName.slice(i + 1)
}

/** TfGetPathName (stringUtils.h:272-282; stringUtils.cpp:334-346): the
 *  directory part including its trailing '/', or empty when there is no '/'
 *  (POSIX build). */
export function TfGetPathName(fileName: string): string {
  const i = fileName.lastIndexOf('/')
  return i < 0 ? '' : fileName.slice(0, i + 1)
}

export function stringCatPaths(left: string, right: string): string {
  const combined = `${left}/${right}`
  const absolute = combined.startsWith('/')
  const parts = combined.split('/')
  const result: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..') result.pop()
      else if (!absolute) result.push(part)
    } else result.push(part)
  }
  return `${absolute ? '/' : ''}${result.join('/')}`
}

// Public C++ spellings. Keeping these aliases at the implementation origin
// lets the package expose the exact OpenUSD v26.08 declarations while the
// lower-camel helpers above remain convenient internally.
export const TfDictionaryLessThan = dictionaryLessThan
export const TfStringCapitalize = stringCapitalize
export const TfStringCatPaths = stringCatPaths
export const TfStringContains = stringContains
export const TfStringEndsWith = stringEndsWith
export const TfStringGetBeforeSuffix = stringGetBeforeSuffix
export const TfStringGetCommonPrefix = stringGetCommonPrefix
export const TfStringGetSuffix = stringGetSuffix
export const TfStringJoin = stringJoin
export const TfStringReplace = stringReplace
export const TfStringStartsWith = stringStartsWith
export const TfStringToLong = stringToLong
export const TfStringToLower = stringToLower
export const TfStringToLowerAscii = stringToLowerAscii
export const TfStringToULong = stringToULong
export const TfStringToUpper = stringToUpper
export const TfStringTokenize = stringTokenize
export const TfStringTokenizeToSet = stringTokenizeToSet
export const TfStringTrim = stringTrim
export const TfStringTrimLeft = stringTrimLeft
export const TfStringTrimRight = stringTrimRight
export const TfQuotedStringTokenize = quotedStringTokenize
export const TfMatchedStringTokenize = matchedStringTokenize
export const TfEscapeString = escapeString
export const TfGetXmlEscapedString = getXmlEscapedString
