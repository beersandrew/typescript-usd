// Ported from OpenUSD 26.11.1: pxr/base/tf/stringUtils.cpp,
//  pxr/usd/sdf/parserHelpers.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Sdf_EvalQuotedString (OpenUSD 26.11.1 sdf/parserHelpers.cpp:680-732)
// delegates escape decoding to tf/stringUtils.cpp:1073-1110. Native strings
// hold bytes; retain invalid UTF-8 bytes as low surrogateescape code units so
// USDA output can distinguish an escaped byte from an authored Unicode char.
export function decodeUsdQuotedString(rawContent: string): string {
  if (!rawContent.includes('\\')) return rawContent
  const bytes: number[] = []
  const encoder = new TextEncoder()
  const controls: Record<string, number> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11 }
  for (let i = 0; i < rawContent.length;) {
    let ch = String.fromCodePoint(rawContent.codePointAt(i)!)
    i += ch.length
    if (ch === '\\') {
      if (i === rawContent.length) throw new Error('Unterminated quoted-string escape')
      ch = String.fromCodePoint(rawContent.codePointAt(i)!)
      i += ch.length
      if (ch in controls) { bytes.push(controls[ch]!); continue }
      if (ch === 'x') {
        const digits = /^[0-9a-fA-F]{0,2}/.exec(rawContent.slice(i))![0]
        bytes.push(digits ? parseInt(digits, 16) : 0)
        i += digits.length
        continue
      }
      if (/^[0-7]$/.test(ch)) {
        const digits = ch + /^[0-7]{0,2}/.exec(rawContent.slice(i))![0]
        bytes.push(parseInt(digits, 8) & 255)
        i += digits.length - 1
        continue
      }
      // Unknown escapes, quote escapes and backslash-newline retain the
      // escaped character, dropping only the backslash (native default case).
    }
    bytes.push(...encoder.encode(ch))
  }
  return decodeUtf8Bytes(bytes)
}

// Decodes a native std::string's bytes: valid UTF-8 as text, every other
// byte as a low surrogateescape code unit (U+DC80-U+DCFF).
export function decodeUtf8Bytes(bytes: ArrayLike<number>): string {
  let text = ''
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i]!
    if (first < 128) { text += String.fromCharCode(first); ++i; continue }
    const width = first >= 0xc2 && first <= 0xdf ? 2
      : first >= 0xe0 && first <= 0xef ? 3
      : first >= 0xf0 && first <= 0xf4 ? 4 : 0
    let cp = first & (width === 2 ? 31 : width === 3 ? 15 : 7)
    let valid = width > 0 && i + width <= bytes.length
    for (let j = 1; valid && j < width; ++j) {
      const next = bytes[i + j]!
      valid = (next & 0xc0) === 0x80
      cp = (cp << 6) | (next & 63)
    }
    valid &&= cp >= (width === 2 ? 0x80 : width === 3 ? 0x800 : 0x10000) &&
      cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)
    if (valid) { text += String.fromCodePoint(cp); i += width }
    else { text += String.fromCharCode(0xdc00 + first); ++i }
  }
  return text
}

// The inverse of decodeUtf8Bytes: a string's bytes, with each low
// surrogateescape code unit (U+DC80-U+DCFF) written back as the byte it
// holds.
export function encodeUtf8Bytes(text: string): Uint8Array {
  const encoder = new TextEncoder()
  if (!/[\udc80-\udcff]/.test(text)) return encoder.encode(text)
  const bytes: number[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (cp >= 0xdc80 && cp <= 0xdcff) bytes.push(cp - 0xdc00)
    else bytes.push(...encoder.encode(ch))
  }
  return Uint8Array.from(bytes)
}
