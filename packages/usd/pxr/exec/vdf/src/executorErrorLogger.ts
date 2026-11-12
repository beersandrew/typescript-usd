// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorErrorLogger.cpp,
//  pxr/exec/vdf/executorErrorLogger.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorErrorLogger.h and
// pxr/exec/vdf/executorErrorLogger.cpp.
//
// The tbb::concurrent_unordered_map behind an atomic pointer becomes a Map
// created on first use (single-threaded, doc section 5).

import { TF_WARN } from 'typescript-usd/tf'

import type { VdfNode } from './node.ts'

/** VdfExecutorErrorLogger::NodeToStringMap (executorErrorLogger.h:49-50). */
export type VdfExecutorErrorLogger_NodeToStringMap = Map<VdfNode, string>

// executorErrorLogger.cpp:34: the static empty map returned when no warnings
// have been logged.
const _emptyWarnings: ReadonlyMap<VdfNode, string> = new Map()

/**
 * VdfExecutorErrorLogger (executorErrorLogger.h:33-98): collects warnings
 * reported by nodes during a call to Run() on an executor.
 */
export class VdfExecutorErrorLogger {
  // executorErrorLogger.h:97: holds warnings emitted by nodes during execution.
  private _warnings: VdfExecutorErrorLogger_NodeToStringMap | null = null

  /** GetWarnings (executorErrorLogger.cpp:26-36). */
  getWarnings(): ReadonlyMap<VdfNode, string> {
    if (this._warnings) {
      return this._warnings
    }
    return _emptyWarnings
  }

  /** ReportWarnings (executorErrorLogger.cpp:38-43). */
  reportWarnings(): void {
    for (const [node, warning] of this.getWarnings()) {
      VdfExecutorErrorLogger.issueDefaultWarning(node, warning)
    }
  }

  /** IssueDefaultWarning (executorErrorLogger.cpp:45-52). */
  static issueDefaultWarning(node: VdfNode, warning: string): void {
    TF_WARN(`Node: '${node.getDebugName()}' Exec Warning: ${warning}\n`)
  }

  /** LogWarning (executorErrorLogger.cpp:54-82). */
  LogWarning(node: VdfNode, warning: string): void {
    let warnings = this._warnings
    if (!warnings) {
      warnings = new Map()
      this._warnings = warnings
    }

    const existing = warnings.get(node)
    if (existing === undefined) {
      warnings.set(node, warning)
    } else if (existing !== warning) {
      // Don't concatenate if the warning text is the repeated.
      warnings.set(node, existing + ' ' + warning)
    }
  }
}
