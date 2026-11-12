// The USDA number scanner (_sdfScanTextNumber, used by the text parser's
// Cursor.rawNumber) lexes without a regular expression per number. It must
// accept, reject and convert every input exactly as the previous scanner,
// which matched [+-]inf/nan with a sticky regular expression and validated
// each scanned literal with a second one. That scanner is kept below as the
// reference; the parser's own upstream parsing tests pin the grammar.
import { describe, expect, it } from 'vitest'
import { _sdfScanTextNumber } from '../src/textFileFormatParser.ts'

// ---- previous scanner (Cursor.rawNumber before the change, without ws()) ----
const SPECIAL_NUMBER = /[+-]?(?:inf|nan)(?![a-zA-Z0-9_])/iy
function isDigitCode(c: number): boolean { return c >= 0x30 && c <= 0x39 }
function previousScan(src: string, pos: number):
  { raw: string; value: number; isInt: boolean; end: number } | { error: true; end: number } {
  SPECIAL_NUMBER.lastIndex = pos
  const special = SPECIAL_NUMBER.exec(src)
  if (special) {
    return { raw: special[0], value: /nan/i.test(special[0]) ? NaN : special[0].startsWith('-') ? -Infinity : Infinity, isInt: false, end: pos + special[0].length }
  }
  const start = pos
  let i = start
  let isInt = true
  let c = src.charCodeAt(i)
  if (c === 0x2d || c === 0x2b) i++
  while (isDigitCode(src.charCodeAt(i))) i++
  if (src.charCodeAt(i) === 0x2e) {
    isInt = false
    i++
    while (isDigitCode(src.charCodeAt(i))) i++
  }
  c = src.charCodeAt(i)
  if (c === 0x65 || c === 0x45) {
    isInt = false
    i++
    c = src.charCodeAt(i)
    if (c === 0x2b || c === 0x2d) i++
    while (isDigitCode(src.charCodeAt(i))) i++
  }
  const s = src.slice(start, i)
  if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(s)) return { error: true, end: i }
  return { raw: s, value: parseFloat(s), isInt, end: i }
}

function scan(src: string, pos: number): ReturnType<typeof previousScan> {
  const { raw, value, isInt, end } = _sdfScanTextNumber(src, pos)
  return raw === undefined ? { error: true, end } : { raw, value, isInt, end }
}

// Deterministic generator (mulberry32).
function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

const pieces = [
  '0', '1', '7', '9', '00', '123', '.', '..', 'e', 'E', '+', '-', 'inf', 'Inf', 'INF', 'nan', 'NaN', 'NAN', 'iNf', 'nAn',
  'in', 'na', 'i', 'n', 'f', 'x', '_', 'a', 'Z', ',', ' ', ')', ']', '\n', 'ı', 'İ', 'é', '1e308', '1e309', '4.9e-324',
  '9007199254740993', '18446744073709551615',
]

describe('USDA number scanner', () => {
  it('lexes random text exactly as the previous scanner', () => {
    const next = rng(20261104)
    let mismatches = 0
    const firstMismatches: string[] = []
    for (let n = 0; n < 300000; n++) {
      let src = ''
      const count = 1 + Math.floor(next() * 6)
      for (let i = 0; i < count; i++) src += pieces[Math.floor(next() * pieces.length)]
      const pos = Math.floor(next() * Math.min(3, src.length))
      const expected = previousScan(src, pos)
      const actual = scan(src, pos)
      const same = expected.end === actual.end && ('error' in expected
        ? 'error' in actual
        : !('error' in actual) && actual.raw === expected.raw && actual.isInt === expected.isInt &&
          Object.is(actual.value, expected.value))
      if (!same) {
        mismatches++
        if (firstMismatches.length < 5) firstMismatches.push(JSON.stringify({ src, pos }))
      }
    }
    expect(firstMismatches).toEqual([])
    expect(mismatches).toBe(0)
  })

  it('converts random numeric literals to the value parseFloat gives', () => {
    // The scanner converts literals of up to 15 digits with a power-of-ten
    // scale within 10^22 directly; these straddle both limits.
    const next = rng(42)
    const digits = (n: number) => Array.from({ length: n }, () => Math.floor(next() * 10)).join('')
    const firstMismatches: string[] = []
    for (let n = 0; n < 300000; n++) {
      const sign = ['', '-', '+'][Math.floor(next() * 3)]!
      const intPart = digits(Math.floor(next() * 12))
      const frac = next() < 0.7 ? '.' + digits(Math.floor(next() * 12)) : ''
      const exp = next() < 0.4 ? ['e', 'E'][Math.floor(next() * 2)]! + ['', '-', '+'][Math.floor(next() * 3)]! +
        String(Math.floor(next() * 40)) : ''
      const src = `${sign}${intPart}${frac}${exp}`
      const expected = previousScan(src, 0)
      const actual = scan(src, 0)
      const same = expected.end === actual.end && ('error' in expected
        ? 'error' in actual
        : !('error' in actual) && actual.raw === expected.raw && actual.isInt === expected.isInt &&
          Object.is(actual.value, expected.value))
      if (!same && firstMismatches.length < 5) firstMismatches.push(src)
    }
    expect(firstMismatches).toEqual([])
  })

  it('lexes the literal forms the grammar names', () => {
    for (const src of ['0', '-0', '+1', '1.', '.5', '-.43', '1e5', '1E-5', '2.5e+3', 'inf', '-inf', '+nan', 'NaN',
      '-infinity', 'nanx', '1e', '.e1', '.', '-', '+e', 'e5', '', '1..2', '0x10',
      '-0.0', '0e5', '123456789012345', '1234567890123456', '0.1', '1e22', '1e23', '1e-22', '1e-23', '9007199254740993',
      '4.9e-324', '1.7976931348623157e308', '00000000000000000001.5']) {
      expect(scan(src, 0)).toEqual(previousScan(src, 0))
    }
  })
})
