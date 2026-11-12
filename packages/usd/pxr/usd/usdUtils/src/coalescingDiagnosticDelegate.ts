// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/coalescingDiagnosticDelegate.cpp,
//  pxr/usd/usdUtils/coalescingDiagnosticDelegate.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/coalescingDiagnosticDelegate.{h,cpp} (OpenUSD 26.11.1).
//
// A delegate that collects warnings and statuses from the Tf diagnostic
// manager and hands them back either as posted or coalesced by their source
// file, function and line (coalescingDiagnosticDelegate.h:59-66).
//
// JavaScript has no destructors: dispose() (also [Symbol.dispose] for
// `using`) is ~UsdUtilsCoalescingDiagnosticDelegate.

import {
  Error as TfError,
  TfDiagnosticMgr,
  TfDiagnosticType,
  type DiagnosticBase as TfDiagnosticBase,
  type StatusObject as TfStatus,
  type Warning as TfWarning,
  type TfCallContext,
  type TfDiagnosticDelegate,
} from 'typescript-usd/tf'

/** The output side of a std::ostream the Dump methods write to. */
export interface UsdUtilsOStream {
  write(text: string): unknown
}

/**
 * The shared component in a coalesced result: the key by which diagnostics
 * coalesce (coalescingDiagnosticDelegate.h:31-35).
 */
export interface UsdUtilsCoalescingDiagnosticDelegateSharedItem {
  sourceLineNumber: number
  sourceFunction: string
  sourceFileName: string
}

/** The unshared component in a coalesced result (coalescingDiagnosticDelegate.h:38-41). */
export interface UsdUtilsCoalescingDiagnosticDelegateUnsharedItem {
  context: TfCallContext
  commentary: string
}

/** A coalesced result (coalescingDiagnosticDelegate.h:46-49). */
export interface UsdUtilsCoalescingDiagnosticDelegateItem {
  sharedItem: UsdUtilsCoalescingDiagnosticDelegateSharedItem
  unsharedItems: UsdUtilsCoalescingDiagnosticDelegateUnsharedItem[]
}

/** coalescingDiagnosticDelegate.h:54-55 */
export type UsdUtilsCoalescingDiagnosticDelegateVector = UsdUtilsCoalescingDiagnosticDelegateItem[]

// PLATFORM-DIVERGENCE(usdutils-abort-throws): JavaScript cannot abort the
// process. Where upstream calls TfLogCrash(reason, message, ...) and then
// ArchAbort(false), the delegate throws a FatalError TfError whose commentary
// is TfLogCrash's "<reason>: <message>" line and whose context is the
// crash's call context, as this port's TF_FATAL_ERROR and TfLogCrash throw.
/** @internal Shared by this library's diagnostic delegates; not in the library entry. */
export function logCrashAndAbort(
  reason: string, message: string, context: TfCallContext,
): never {
  throw new TfError(`${reason}: ${message}`, TfDiagnosticType.FatalError, context)
}

export class UsdUtilsCoalescingDiagnosticDelegate implements TfDiagnosticDelegate {
  // coalescingDiagnosticDelegate.h:114: the pending queue. One JavaScript
  // lane posts, so an array plays tbb::concurrent_queue.
  #diagnostics: TfDiagnosticBase[] = []

  // coalescingDiagnosticDelegate.cpp:46-49
  constructor() {
    TfDiagnosticMgr.GetInstance().addDelegate(this)
  }

  // coalescingDiagnosticDelegate.cpp:51-61: remove, then drop what remains.
  dispose(): void {
    TfDiagnosticMgr.GetInstance().removeDelegate(this)
    this.takeUncoalescedDiagnostics()
  }
  [Symbol.dispose](): void { this.dispose() }

  // coalescingDiagnosticDelegate.cpp:63-68: errors are ignored; use a
  // TfErrorMark for those.
  issueError(_err: TfError): void {}

  // coalescingDiagnosticDelegate.cpp:70-76
  issueFatalError(ctx: TfCallContext, msg: string): void {
    logCrashAndAbort('FATAL ERROR', msg, ctx)
  }

  // coalescingDiagnosticDelegate.cpp:78-82
  issueStatus(status: TfStatus): void {
    this.#diagnostics.push(status)
  }

  // coalescingDiagnosticDelegate.cpp:84-88
  issueWarning(warning: TfWarning): void {
    this.#diagnostics.push(warning)
  }

  // coalescingDiagnosticDelegate.cpp:90-137
  takeCoalescedDiagnostics(): UsdUtilsCoalescingDiagnosticDelegateVector {
    // coalescingDiagnosticDelegate.cpp:23-41: the key is line, function
    // and file name.
    const existence = new Map<string, number>()
    const result: UsdUtilsCoalescingDiagnosticDelegateVector = []
    for (const handle of this.#takeAll()) {
      const sharedItem: UsdUtilsCoalescingDiagnosticDelegateSharedItem = {
        sourceLineNumber: handle.getSourceLineNumber(),
        sourceFunction: handle.getSourceFunction(),
        sourceFileName: handle.getSourceFileName(),
      }
      const unsharedItem: UsdUtilsCoalescingDiagnosticDelegateUnsharedItem = {
        context: handle.getContext(),
        commentary: handle.getCommentary(),
      }
      const key = JSON.stringify([
        sharedItem.sourceLineNumber, sharedItem.sourceFunction, sharedItem.sourceFileName])
      const lookup = existence.get(key)
      if (lookup === undefined) {
        existence.set(key, result.length)
        result.push({ sharedItem, unsharedItems: [unsharedItem] })
      } else {
        result[lookup]!.unsharedItems.push(unsharedItem)
      }
    }
    return result
  }

  // coalescingDiagnosticDelegate.cpp:139-152
  takeUncoalescedDiagnostics(): TfDiagnosticBase[] {
    return this.#takeAll()
  }

  // coalescingDiagnosticDelegate.cpp:154-165
  dumpCoalescedDiagnostics(ostr: UsdUtilsOStream): void {
    for (const item of this.takeCoalescedDiagnostics()) {
      ostr.write(`${item.unsharedItems.length} Diagnostic Notification(s) in ` +
        `${item.sharedItem.sourceFunction} at line ${item.sharedItem.sourceLineNumber} ` +
        `of ${item.sharedItem.sourceFileName}\n`)
    }
  }

  // coalescingDiagnosticDelegate.cpp:167-178
  dumpUncoalescedDiagnostics(ostr: UsdUtilsOStream): void {
    for (const item of this.takeUncoalescedDiagnostics()) {
      ostr.write(`Diagnostic Notification in ${item.getSourceFunction()} at line ` +
        `${item.getSourceLineNumber()} of ${item.getSourceFileName()}:\n   ` +
        `${item.getCommentary()}\n`)
    }
  }

  #takeAll(): TfDiagnosticBase[] {
    const items = this.#diagnostics
    this.#diagnostics = []
    return items
  }
}
