// Ported from OpenUSD 26.11.1: pxr/base/tf/patternMatcher.cpp,
//  pxr/base/tf/patternMatcher.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/base/tf/patternMatcher.{h,cpp}. The pattern is
// compiled by ArchRegex (POSIX extended syntax), as upstream does in
// TfPatternMatcher::_Compile (patternMatcher.cpp:104-117).

import { ArchRegex } from 'typescript-usd/arch'

export class TfPatternMatcher {
  #pattern: string
  #caseSensitive: boolean
  #isGlob: boolean
  #recompile = true
  #regex = new ArchRegex()

  constructor(pattern = '', caseSensitive = false, isGlob = false) {
    this.#pattern = pattern
    this.#caseSensitive = caseSensitive
    this.#isGlob = isGlob
  }

  getPattern(): string { return this.#pattern }
  isCaseSensitive(): boolean { return this.#caseSensitive }
  isGlobPattern(): boolean { return this.#isGlob }
  // patternMatcher.cpp:41-46
  getInvalidReason(): string { this.#compile(); return this.#regex.getError() }
  // patternMatcher.cpp:48-52
  isValid(): boolean { this.#compile(); return this.#regex.isValid() }

  // patternMatcher.cpp:54-68
  match(query: string): boolean {
    return this.isValid() ? this.#regex.match(query) : false
  }

  // patternMatcher.cpp:71-95
  setPattern(pattern: string): void {
    if (pattern !== this.#pattern) { this.#recompile = true; this.#pattern = pattern }
  }
  setIsCaseSensitive(value: boolean): void {
    if (value !== this.#caseSensitive) { this.#recompile = true; this.#caseSensitive = value }
  }
  setIsGlobPattern(value: boolean): void {
    if (value !== this.#isGlob) { this.#recompile = true; this.#isGlob = value }
  }

  // patternMatcher.cpp:104-117
  #compile(): void {
    if (!this.#recompile) return
    this.#recompile = false
    this.#regex = new ArchRegex(this.#pattern,
      (this.#caseSensitive ? 0 : ArchRegex.CASE_INSENSITIVE) |
      (this.#isGlob ? ArchRegex.GLOB : 0))
  }
}
