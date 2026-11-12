// Ported from OpenUSD 26.11.1: pxr/usdValidation/usdValidation/fixer.cpp,
//  pxr/usdValidation/usdValidation/fixer.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdValidation/fixer.{h,cpp}.
import { TimeCode as UsdTimeCode, type EditTarget as UsdEditTarget } from 'typescript-usd/usd'
import type { UsdValidationError } from './error.ts'

/** fixer.h:25-29 (FixerImplFn). */
export type UsdValidationFixerImplFn = (
  error: UsdValidationError, editTarget: UsdEditTarget, timeCode: UsdTimeCode) => boolean

/** fixer.h:31-35 (FixerCanApplyFn). */
export type UsdValidationFixerCanApplyFn = (
  error: UsdValidationError, editTarget: UsdEditTarget, timeCode: UsdTimeCode) => boolean

/**
 * A fix for the errors a validator reports, applied at an edit target
 * (fixer.h:37-183).
 */
export class UsdValidationFixer {
  readonly #name: string
  readonly #description: string
  readonly #fixerImplFn: UsdValidationFixerImplFn
  readonly #canApplyFn: UsdValidationFixerCanApplyFn
  readonly #keywords: readonly string[]
  readonly #errorName: string

  /** fixer.cpp:14-24. Non-callable functions raise TypeError, as the Python
   *  constructor does (wrapFixer.cpp). */
  constructor(name: string, description: string, fixerImplFn: UsdValidationFixerImplFn,
    canApplyFn: UsdValidationFixerCanApplyFn, keywords: readonly string[] = [], errorName = '') {
    if (typeof fixerImplFn !== 'function' || typeof canApplyFn !== 'function') {
      throw new TypeError('fixerImplFn and canApplyFn must be callable')
    }
    this.#name = name
    this.#description = description
    this.#fixerImplFn = fixerImplFn
    this.#canApplyFn = canApplyFn
    this.#keywords = [...keywords]
    this.#errorName = errorName
  }

  getName(): string { return this.#name }
  getDescription(): string { return this.#description }
  getErrorName(): string { return this.#errorName }
  getKeywords(): string[] { return [...this.#keywords] }

  /** fixer.cpp:26-30: a fixer with no error name applies to every error. */
  isAssociatedWithErrorName(errorName: string): boolean {
    return this.#errorName === '' || this.#errorName === errorName
  }

  /** fixer.cpp:32-37. */
  hasKeyword(keyword: string): boolean {
    return this.#keywords.includes(keyword)
  }

  /** fixer.cpp:39-56. */
  canApplyFix(error: UsdValidationError, editTarget: UsdEditTarget,
    timeCode: UsdTimeCode = UsdTimeCode.Default()): boolean {
    if (!this.isAssociatedWithErrorName(error.getName())) return false
    if (!editTarget.isValid()) return false
    return this.#canApplyFn(error, editTarget, timeCode)
  }

  /**
   * fixer.cpp:58-78: applies the fix and, when it applied, saves the edit
   * target's layer.
   *
   * PLATFORM-DIVERGENCE(usdValidation-fixer-async-save): SdfLayer::Save is
   * synchronous file I/O upstream (fixer.cpp:77); SdfLayer.save is
   * asynchronous here (sdf/src/layer.ts), so ApplyFix resolves to the save's
   * result rather than returning it.
   */
  async applyFix(error: UsdValidationError, editTarget: UsdEditTarget,
    timeCode: UsdTimeCode = UsdTimeCode.Default()): Promise<boolean> {
    if (!this.isAssociatedWithErrorName(error.getName())) return false
    if (!editTarget.isValid()) return false
    const fixApplied = this.#fixerImplFn(error, editTarget, timeCode)
    return fixApplied ? editTarget.getLayer()!.save() : false
  }
}
