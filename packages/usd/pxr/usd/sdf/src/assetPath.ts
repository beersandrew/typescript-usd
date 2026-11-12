// Ported from OpenUSD 26.11.1: pxr/usd/sdf/assetPath.cpp,
//  pxr/usd/sdf/assetPath.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfAssetPath counterpart from pxr/usd/sdf/assetPath.h.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'

// _ValidateAssetPathString (assetPath.cpp:82-118): the path must be valid
// Unicode (UTF-8 upstream) without C0 or C1 control characters; issues a
// coding error otherwise. Like upstream's C string scan, validation stops at
// the first NUL.
function validateAssetPathString(path: string): void {
  // Return true if 'code' is a C0 or C1 control code, false otherwise.
  const isControlCode = (code: number): boolean =>
    (code >= 0x0 && code <= 0x1f) || code === 0x7f || (code >= 0x80 && code <= 0x9f)
  let charNum = 1
  for (let i = 0; i < path.length; ++charNum) {
    const code = path.codePointAt(i)!
    if (code === 0) return
    if (code >= 0xd800 && code <= 0xdfff) {
      throw new TfError(`Invalid asset path string -- character ${charNum}: unpaired surrogate 0x${
        code.toString(16)}`, TfDiagnosticType.CodingError)
    }
    if (isControlCode(code)) {
      throw new TfError(`Invalid asset path string -- character ${charNum} is control character 0x${
        code.toString(16)}`, TfDiagnosticType.CodingError)
    }
    i += code > 0xffff ? 2 : 1
  }
}

function compareCodePoints(a: string, b: string): number {
  const ai = a[Symbol.iterator](), bi = b[Symbol.iterator]()
  for (;;) {
    const x = ai.next(), y = bi.next()
    if (x.done || y.done) return x.done ? (y.done ? 0 : -1) : 1
    const dx = x.value.codePointAt(0)!, dy = y.value.codePointAt(0)!
    if (dx !== dy) return dx - dy
  }
}

export interface SdfAssetPathParams {
  authoredPath?: string
  evaluatedPath?: string
  resolvedPath?: string
}

export class SdfAssetPath {
  readonly #authoredPath: string
  readonly #evaluatedPath: string
  readonly #resolvedPath: string

  constructor(pathOrParams: string | SdfAssetPathParams | SdfAssetPath = '', resolvedPath = '') {
    if (pathOrParams instanceof SdfAssetPath) {
      // Copy construction.
      this.#authoredPath = pathOrParams.#authoredPath
      this.#evaluatedPath = pathOrParams.#evaluatedPath
      this.#resolvedPath = pathOrParams.#resolvedPath
      return
    }
    // assetPath.cpp:131-158.
    if (typeof pathOrParams === 'string') {
      validateAssetPathString(pathOrParams)
      validateAssetPathString(resolvedPath)
    } else {
      validateAssetPathString(pathOrParams.authoredPath ?? '')
      validateAssetPathString(pathOrParams.evaluatedPath ?? '')
      validateAssetPathString(pathOrParams.resolvedPath ?? '')
    }
    if (typeof pathOrParams === 'string') {
      this.#authoredPath = pathOrParams
      this.#evaluatedPath = ''
      this.#resolvedPath = resolvedPath
    } else {
      this.#authoredPath = pathOrParams.authoredPath ?? ''
      this.#evaluatedPath = pathOrParams.evaluatedPath ?? ''
      this.#resolvedPath = pathOrParams.resolvedPath ?? ''
    }
  }

  getAuthoredPath(): string { return this.#authoredPath }
  getEvaluatedPath(): string { return this.#evaluatedPath }
  getAssetPath(): string { return this.#evaluatedPath || this.#authoredPath }
  getResolvedPath(): string { return this.#resolvedPath }

  // SdfAssetPath::operator< (assetPath.cpp:161-166): ordered by authored,
  // then resolved, then evaluated path. std::string compares UTF-8 bytes,
  // which order as code points.
  lessThan(rhs: SdfAssetPath): boolean {
    const pairs: [string, string][] = [
      [this.#authoredPath, rhs.#authoredPath],
      [this.#resolvedPath, rhs.#resolvedPath],
      [this.#evaluatedPath, rhs.#evaluatedPath],
    ]
    for (const [a, b] of pairs) {
      const order = compareCodePoints(a, b)
      if (order !== 0) return order < 0
    }
    return false
  }

  equals(other: unknown): boolean {
    return other instanceof SdfAssetPath &&
      other.#authoredPath === this.#authoredPath &&
      other.#evaluatedPath === this.#evaluatedPath &&
      other.#resolvedPath === this.#resolvedPath
  }
}
