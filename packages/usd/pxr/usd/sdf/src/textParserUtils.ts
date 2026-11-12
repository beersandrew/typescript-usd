// Ported from OpenUSD 26.11.1: pxr/usd/sdf/textParserUtils.cpp,
//  pxr/usd/sdf/textParserUtils.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// pxr/usd/sdf/textParserUtils.{h,cpp} (OpenUSD 26.11.1): value parsing and
// quoting helpers for text-format strings.
import { sdfParseValueFromString as parseValueFromString } from './textFileFormatParser.ts'
import { assetPathText, quoteString } from './usdaFileFormat.ts'

/** Sdf_ParseValueFromString (textParserUtils.cpp:16-27): `input` parsed as a
 * value of the value type `typeName`, or undefined (an empty VtValue) on
 * failure. */
export function sdfParseValueFromString(input: string, typeName: string): unknown {
  return parseValueFromString(input, typeName)
}

/** Sdf_QuoteString (textParserUtils.cpp:29-33): Sdf_FileIOUtility::Quote. */
export function sdfQuoteString(input: string): string {
  return quoteString(input)
}

/** Sdf_QuoteAssetPath (textParserUtils.cpp:35-39):
 * Sdf_FileIOUtility::QuoteAssetPath. */
export function sdfQuoteAssetPath(path: string): string {
  return assetPathText(path)
}
