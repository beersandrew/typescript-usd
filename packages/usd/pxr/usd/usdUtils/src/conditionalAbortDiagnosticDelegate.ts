// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/conditionalAbortDiagnosticDelegate.cpp,
//  pxr/usd/usdUtils/conditionalAbortDiagnosticDelegate.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/conditionalAbortDiagnosticDelegate.{h,cpp} (OpenUSD 26.11.1).
//
// A delegate that aborts on a non-fatal error or warning matched by its
// include filters and not by its exclude filters
// (conditionalAbortDiagnosticDelegate.h:52-80). The abort is a thrown
// FatalError TfError: see PLATFORM-DIVERGENCE(usdutils-abort-throws) in
// coalescingDiagnosticDelegate.ts.
//
// JavaScript has no destructors: dispose() (also [Symbol.dispose] for
// `using`) is ~UsdUtilsConditionalAbortDiagnosticDelegate.

import {
  PatternMatcher as TfPatternMatcher,
  TF_WARN,
  TfDiagnosticMgr,
  type DiagnosticBase as TfDiagnosticBase,
  type Error as TfError,
  type StatusObject as TfStatus,
  type Warning as TfWarning,
  type TfCallContext,
  type TfDiagnosticDelegate,
} from 'typescript-usd/tf'
import { logCrashAndAbort } from './coalescingDiagnosticDelegate.ts'

// conditionalAbortDiagnosticDelegate.cpp:13-31: glob, case-sensitive
// matchers; an invalid pattern warns.
function constructPatternFilters(filters: readonly string[]): TfPatternMatcher[] {
  const patternMatchers: TfPatternMatcher[] = []
  for (const filter of filters) {
    const matcher = new TfPatternMatcher(filter, true, true)
    patternMatchers.push(matcher)
    if (!matcher.isValid()) TF_WARN(`Invalid pattern string: ${filter}`)
  }
  return patternMatchers
}

// conditionalAbortDiagnosticDelegate.cpp:160-164: print as TfDiagnosticMgr
// does, to stderr.
function _PrintDiagnostic(code: unknown, ctx: TfCallContext, msg: string): void {
  globalThis.console.error(TfDiagnosticMgr.formatDiagnostic(code, ctx, msg))
}

/**
 * The string and code-path filters errors are matched on
 * (conditionalAbortDiagnosticDelegate.h:20-50).
 */
export class UsdUtilsConditionalAbortDiagnosticDelegateErrorFilters {
  #stringFilters: string[]
  #codePathFilters: string[]

  // conditionalAbortDiagnosticDelegate.h:29 and .cpp:33-37
  constructor(stringFilters: readonly string[] = [], codePathFilters: readonly string[] = []) {
    this.#stringFilters = [...stringFilters]
    this.#codePathFilters = [...codePathFilters]
  }

  getStringFilters(): readonly string[] { return this.#stringFilters }
  getCodePathFilters(): readonly string[] { return this.#codePathFilters }

  // conditionalAbortDiagnosticDelegate.cpp:39-44
  setStringFilters(stringFilters: readonly string[]): void {
    this.#stringFilters = [...stringFilters]
  }

  // conditionalAbortDiagnosticDelegate.cpp:46-51
  setCodePathFilters(codePathFilters: readonly string[]): void {
    this.#codePathFilters = [...codePathFilters]
  }
}

export class UsdUtilsConditionalAbortDiagnosticDelegate implements TfDiagnosticDelegate {
  readonly #includePatternStringFilters: readonly TfPatternMatcher[]
  readonly #includePatternCodePathFilters: readonly TfPatternMatcher[]
  readonly #excludePatternStringFilters: readonly TfPatternMatcher[]
  readonly #excludePatternCodePathFilters: readonly TfPatternMatcher[]

  // conditionalAbortDiagnosticDelegate.cpp:53-68
  constructor(
    includeFilters: UsdUtilsConditionalAbortDiagnosticDelegateErrorFilters,
    excludeFilters: UsdUtilsConditionalAbortDiagnosticDelegateErrorFilters,
  ) {
    this.#includePatternStringFilters = constructPatternFilters(includeFilters.getStringFilters())
    this.#includePatternCodePathFilters = constructPatternFilters(includeFilters.getCodePathFilters())
    this.#excludePatternStringFilters = constructPatternFilters(excludeFilters.getStringFilters())
    this.#excludePatternCodePathFilters = constructPatternFilters(excludeFilters.getCodePathFilters())
    TfDiagnosticMgr.GetInstance().addDelegate(this)
  }

  // conditionalAbortDiagnosticDelegate.cpp:70-74
  dispose(): void {
    TfDiagnosticMgr.GetInstance().removeDelegate(this)
  }
  [Symbol.dispose](): void { this.dispose() }

  /**
   * Matches `err` against the given filters; a subclass can override it
   * (conditionalAbortDiagnosticDelegate.cpp:76-98).
   */
  protected _ruleMatcher(
    err: TfDiagnosticBase,
    stringPatternFilters: readonly TfPatternMatcher[],
    codePathPatternFilters: readonly TfPatternMatcher[],
  ): boolean {
    const sourceFileName = err.getSourceFileName()
    if (sourceFileName !== '') {
      for (const codePathPattern of codePathPatternFilters) {
        if (codePathPattern.match(sourceFileName)) return true
      }
    }
    const errorString = err.getCommentary()
    if (errorString !== '') {
      for (const stringPattern of stringPatternFilters) {
        if (stringPattern.match(errorString)) return true
      }
    }
    return false
  }

  // conditionalAbortDiagnosticDelegate.cpp:100-116
  issueError(err: TfError): void {
    // if matching in include rules and NOT in exclude rules then abort
    if (this._ruleMatcher(err, this.#includePatternStringFilters,
      this.#includePatternCodePathFilters) &&
      !this._ruleMatcher(err, this.#excludePatternStringFilters,
        this.#excludePatternCodePathFilters)) {
      logCrashAndAbort('Aborted by UsdUtilsConditionalAbortDiagnosticDelegate On Error',
        err.getCommentary(), err.getContext())
    } else if (!err.getQuiet()) {
      _PrintDiagnostic(err.getDiagnosticCode(), err.getContext(), err.getCommentary())
    }
  }

  // conditionalAbortDiagnosticDelegate.cpp:118-125
  issueFatalError(ctx: TfCallContext, msg: string): void {
    logCrashAndAbort('FATAL ERROR', msg, ctx)
  }

  // conditionalAbortDiagnosticDelegate.cpp:127-132
  issueStatus(status: TfStatus): void {
    _PrintDiagnostic(status.getDiagnosticCode(), status.getContext(), status.getCommentary())
  }

  // conditionalAbortDiagnosticDelegate.cpp:134-151
  issueWarning(warning: TfWarning): void {
    // if matching in include rules and NOT in exclude rules then abort
    if (this._ruleMatcher(warning, this.#includePatternStringFilters,
      this.#includePatternCodePathFilters) &&
      !this._ruleMatcher(warning, this.#excludePatternStringFilters,
        this.#excludePatternCodePathFilters)) {
      logCrashAndAbort('Aborted by UsdUtilsConditionalAbortDiagnosticDelegate On Warning',
        warning.getCommentary(), warning.getContext())
    } else if (!warning.getQuiet()) {
      _PrintDiagnostic(warning.getDiagnosticCode(), warning.getContext(), warning.getCommentary())
    }
  }
}
